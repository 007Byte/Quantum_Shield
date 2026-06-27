package auth

import (
	"context"
	"encoding/json"
	"net/http"

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
