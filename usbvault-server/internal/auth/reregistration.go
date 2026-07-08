package auth

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/usbvault/usbvault-server/internal/database"
)

// #65 — forced re-registration after the SRP modulus fix.
//
// PR #64 replaced a fabricated SRP modulus with the real RFC 7919 ffdhe3072 prime.
// Every SRP verifier created against the old modulus is unusable under the new one,
// so migration 019 flags those accounts (srp_needs_reregistration = true) and the
// product decision is to force re-registration before any login succeeds.
//
// CRITICAL: the gate must hold on EVERY token-issuing path, not just SRP login.
// FIDO2/passkey verification resolves a user and mints tokens too, so a flagged
// account holding a passkey could otherwise sign in and silently bypass the policy.
// Both HandleSRPInit and HandleFIDO2Verify call userNeedsReRegistration before
// issuing anything; any future auth method MUST do the same.

const reRegistrationRequiredCode = "SRP_REREGISTRATION_REQUIRED"

// writeReRegistrationRequired emits the canonical 409 telling the client the account
// predates the modulus fix and must register a fresh verifier before it can sign in.
func writeReRegistrationRequired(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusConflict)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"code":    reRegistrationRequiredCode,
		"message": "this account must be re-registered before you can sign in",
	})
}

// userNeedsReRegistration reports whether the user identified by id is flagged for
// forced re-registration (#65). A missing column or row surfaces as an error so the
// caller fails closed rather than silently treating the account as unflagged.
func userNeedsReRegistration(ctx context.Context, q database.QueryExecutor, userID string) (bool, error) {
	var needs bool
	if err := q.QueryRow(ctx,
		`SELECT srp_needs_reregistration FROM users WHERE id = $1 AND deleted_at IS NULL`,
		userID,
	).Scan(&needs); err != nil {
		return false, err
	}
	return needs, nil
}

// F4 — proof-of-ownership gate for re-registration.
//
// #65 forces a flagged account to register a FRESH SRP verifier before it can sign
// in. The original code accepted that fresh verifier with NO proof of the old
// credential, which is a pre-auth account-takeover + owner-lockout primitive: anyone
// who knows a flagged account's email could win the re-registration and both take over
// login and lock out the owner (documented as "acceptable ONLY for 0.1.0 pre-release").
//
// F4 closes this by requiring the caller to prove ownership with a valid, unused
// recovery code (the existing internal/recovery mechanism, migration 007) BEFORE the
// verifier is overwritten. Zero-knowledge is preserved: a recovery code proves account
// ownership but reveals nothing about the vault MEK, which stays wrapped to the
// original password's KEK. Rate limiting is unchanged — /auth/register is already
// behind mw.AuthRateLimiter.

const reRegistrationProofRequiredCode = "REREGISTRATION_PROOF_REQUIRED"

// writeReRegistrationProofRequired emits the canonical 401 telling the client that
// re-registering a flagged/existing account requires proof of ownership (a recovery
// code). The same response is used whether the proof was absent or invalid so the
// endpoint does not become a recovery-code oracle.
func writeReRegistrationProofRequired(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"code":    reRegistrationProofRequiredCode,
		"message": "re-registration requires proof of account ownership: supply a valid recovery code",
	})
}

// verifyAndConsumeRecoveryCode checks a submitted recovery code against the user's
// stored, unused recovery-code hashes (constant-time) and, on a match, marks that
// single code used. It mirrors internal/recovery.HandleVerifyCode's hashing and
// constant-time scan semantics so codes issued there prove ownership here.
//
// The query executor SHOULD be a transaction so consuming the code and swapping the
// SRP verifier in HandleRegister are atomic: a valid code is never burned unless the
// verifier is actually reset, and the verifier is never reset without burning a code.
//
// Returns (true, nil) on a valid, freshly-consumed code; (false, nil) when the code
// matches no unused code (or was consumed concurrently); (false, err) only on a DB error.
func verifyAndConsumeRecoveryCode(ctx context.Context, q database.QueryExecutor, userID, code string) (bool, error) {
	normalized := strings.ToUpper(strings.ReplaceAll(code, "-", ""))
	sum := sha256.Sum256([]byte(normalized))
	inputHash := sum[:]

	rows, err := q.Query(ctx,
		`SELECT id, code_hash FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL`,
		userID,
	)
	if err != nil {
		return false, err
	}

	matchedID := 0
	found := false
	for rows.Next() {
		var id int
		var storedHash []byte
		if scanErr := rows.Scan(&id, &storedHash); scanErr != nil {
			rows.Close()
			return false, scanErr
		}
		if subtle.ConstantTimeCompare(inputHash, storedHash) == 1 {
			matchedID = id
			found = true
			// Don't break — scan every unused code to keep comparison timing constant.
		}
	}
	// Fully drain/close the cursor before issuing another query on the same
	// (transaction) connection; pgx forbids a concurrent query while rows are open.
	rows.Close()
	if err := rows.Err(); err != nil {
		return false, err
	}
	if !found {
		return false, nil
	}

	// Consume exactly the matched code. The `AND used_at IS NULL` guard makes this a
	// no-op if a concurrent request already burned it, in which case we reject.
	tag, err := q.Exec(ctx,
		`UPDATE recovery_codes SET used_at = NOW() WHERE id = $1 AND used_at IS NULL`,
		matchedID,
	)
	if err != nil {
		return false, err
	}
	if tag.RowsAffected() == 0 {
		return false, nil
	}
	return true, nil
}
