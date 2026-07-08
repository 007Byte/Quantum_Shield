//go:build integration

package integration

import (
	"context"
	"crypto/sha256"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/usbvault/usbvault-server/internal/testutil"
)

// integrationDBURL returns the Postgres URL the test uses to flag an account for
// #65 forced re-registration. There is intentionally NO HTTP endpoint that sets
// srp_needs_reregistration (the invariant is that ONLY migration 019 does), so the
// test must reach the DB directly to simulate a pre-modulus-fix account.
func integrationDBURL() string {
	if u := os.Getenv("INTEGRATION_DATABASE_URL"); u != "" {
		return u
	}
	if u := os.Getenv("DATABASE_URL"); u != "" {
		return u
	}
	// docker-compose.test.yml publishes postgres:5432 -> host 5433.
	return "postgres://usbvault:test_password_change_me@localhost:5433/usbvault_test?sslmode=disable"
}

// TestSRPReRegistrationFlow exercises the #65 forced-re-registration end to end
// against the REAL API + Postgres (with migration 019 applied):
//
//  1. Register + log in a fresh SRP account (baseline: login works).
//  2. Flag it (srp_needs_reregistration = true) directly in the DB, simulating a
//     pre-ffdhe3072 account that migration 019 would have flagged.
//  3. Assert /auth/srp/init now returns 409 SRP_REREGISTRATION_REQUIRED instead of
//     a confusing "invalid credentials" — and that a full login no longer succeeds.
//  4. F4 ownership gate: re-registration WITHOUT proof is rejected (401) and leaves
//     the account flagged; then, with a valid recovery code as proof of ownership,
//     re-register a fresh verifier (the #65 recovery path) and assert it succeeds
//     (201), updates the SAME row, and consumes the single-use code. The success
//     path is also the regression guard for the missing users.deleted_at column:
//     the register "already exists" lookup filters on deleted_at, which previously
//     threw 42703 and made re-registration impossible (total lockout).
//  5. Assert login now succeeds again (flag cleared, fresh verifier valid).
func TestSRPReRegistrationFlow(t *testing.T) {
	apiURL := testutil.GetAPIURL()
	client := testutil.NewAPIClient(apiURL)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	dbURL := integrationDBURL()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("SKIP %s: cannot create DB pool for %s: %v "+
			"(set INTEGRATION_DATABASE_URL to the host-reachable test Postgres to run this)",
			t.Name(), dbURL, err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Skipf("SKIP %s: test Postgres not reachable at %s: %v "+
			"(set INTEGRATION_DATABASE_URL to the host-reachable test Postgres to run this)",
			t.Name(), dbURL, err)
	}

	const password = "correct horse battery staple #65"

	// 1. Baseline: a fresh account registers and logs in.
	user, err := client.CreateTestUser(password)
	if err != nil {
		t.Fatalf("baseline CreateTestUser failed: %v", err)
	}
	if user.UserID == "" {
		t.Fatalf("baseline registration returned empty user_id; cannot flag the account")
	}

	// 2. Flag the account as predating the modulus fix (what migration 019 does to
	//    a real pre-existing SRP account).
	tag, err := pool.Exec(ctx,
		`UPDATE users SET srp_needs_reregistration = true WHERE id = $1`, user.UserID)
	if err != nil {
		t.Fatalf("failed to flag account for re-registration: %v", err)
	}
	if tag.RowsAffected() != 1 {
		t.Fatalf("flag UPDATE affected %d rows, want 1 (user_id=%s)", tag.RowsAffected(), user.UserID)
	}

	// 3. Login must now be blocked with the explicit 409 signal (not a generic 401,
	//    and not an SRP challenge).
	status, code, err := client.SRPInitStatus(user.Email)
	if err != nil {
		t.Fatalf("srp init (flagged) request failed: %v", err)
	}
	if status != http.StatusConflict {
		t.Fatalf("flagged srp/init status = %d, want %d (409)", status, http.StatusConflict)
	}
	if code != "SRP_REREGISTRATION_REQUIRED" {
		t.Fatalf("flagged srp/init code = %q, want SRP_REREGISTRATION_REQUIRED", code)
	}
	if _, err := client.LoginTestUser(user.Email, password); err == nil {
		t.Fatalf("LoginTestUser unexpectedly succeeded for a flagged account")
	}

	// 4a. F4 gate: re-registration WITHOUT proof of ownership must be rejected
	//     (401) and must NOT overwrite the verifier. This is the account-takeover
	//     guard — anyone who knows a flagged account's email must not be able to
	//     seize it without proving they own it.
	noProofStatus, _, err := client.Register(user.Email, password)
	if err != nil {
		t.Fatalf("re-registration (no proof) request failed: %v", err)
	}
	if noProofStatus != http.StatusUnauthorized {
		t.Fatalf("re-registration without recovery code status = %d, want %d (401)", noProofStatus, http.StatusUnauthorized)
	}
	// The account must still be flagged (verifier untouched) after a rejected attempt.
	var flaggedAfterReject bool
	if err := pool.QueryRow(ctx,
		`SELECT srp_needs_reregistration FROM users WHERE id = $1`, user.UserID,
	).Scan(&flaggedAfterReject); err != nil {
		t.Fatalf("flag read after rejected re-registration failed: %v", err)
	}
	if !flaggedAfterReject {
		t.Fatalf("account no longer flagged after a rejected (no-proof) re-registration — verifier may have been overwritten")
	}

	// 4b. Provision a recovery code as proof of ownership (what a real user would
	//     have generated while still able to authenticate). Insert it directly with
	//     the same hashing the server uses: sha256(uppercase, dashes stripped).
	const recoveryCode = "F4TEST-OWNS-ACCT"
	normalized := strings.ToUpper(strings.ReplaceAll(recoveryCode, "-", ""))
	codeHash := sha256.Sum256([]byte(normalized))
	if _, err := pool.Exec(ctx,
		`INSERT INTO recovery_codes (user_id, code_hash, code_index, created_at)
		 VALUES ($1, $2, 0, NOW())`, user.UserID, codeHash[:]); err != nil {
		t.Fatalf("failed to seed recovery code: %v", err)
	}

	// 4c. Re-register the same email with a fresh verifier AND valid proof — the
	//     #65 recovery path. Expect 201 and the SAME user row (update, not insert).
	regStatus, regUserID, err := client.RegisterWithRecoveryCode(user.Email, password, recoveryCode)
	if err != nil {
		t.Fatalf("re-registration (with proof) request failed: %v", err)
	}
	if regStatus != http.StatusCreated {
		t.Fatalf("re-registration status = %d, want %d (201)", regStatus, http.StatusCreated)
	}
	if regUserID != user.UserID {
		t.Fatalf("re-registration user_id = %q, want same row %q (must UPDATE, not INSERT)", regUserID, user.UserID)
	}

	// 4d. The recovery code is single-use: it must be consumed (used_at set) now.
	var codeUsed bool
	if err := pool.QueryRow(ctx,
		`SELECT used_at IS NOT NULL FROM recovery_codes WHERE user_id = $1 AND code_index = 0`, user.UserID,
	).Scan(&codeUsed); err != nil {
		t.Fatalf("recovery-code used_at read failed: %v", err)
	}
	if !codeUsed {
		t.Fatalf("recovery code was not consumed after successful re-registration")
	}

	// 5. The flag is cleared and the fresh verifier is valid: login works again.
	if _, err := client.LoginTestUser(user.Email, password); err != nil {
		t.Fatalf("login after re-registration failed: %v", err)
	}

	// Sanity: the flag is actually false in the DB now.
	var stillFlagged bool
	if err := pool.QueryRow(ctx,
		`SELECT srp_needs_reregistration FROM users WHERE id = $1`, user.UserID,
	).Scan(&stillFlagged); err != nil {
		t.Fatalf("post-reregistration flag read failed: %v", err)
	}
	if stillFlagged {
		t.Fatalf("srp_needs_reregistration still true after re-registration")
	}
}
