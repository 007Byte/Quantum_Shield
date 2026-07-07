//go:build integration
// +build integration

package auth

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/usbvault/usbvault-server/internal/testutil"
)

// F4 — proof-of-ownership gate for account re-registration.
//
// These tests exercise HandleRegister directly against the REAL schema (migrations
// applied) so they cover the full DB round-trip, not a mock. They verify:
//   - re-registration with a VALID recovery code succeeds, rotates (consumes) the
//     code, clears the flag, and installs the new verifier;
//   - re-registration with NO proof is rejected and leaves the verifier + flag intact;
//   - re-registration with an INVALID proof is rejected and leaves state intact;
//   - re-registration reusing an ALREADY-USED code is rejected;
//   - first-time registration of a brand-new email still works with no code.

func setupReRegTestDB(t *testing.T) (*pgxpool.Pool, context.Context) {
	t.Helper()
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, testutil.IntegrationDSN())
	require.NoError(t, err, "connect to test database (set TEST_DATABASE_URL / run migrations)")

	// Fail fast (and skip) if the schema this test needs is not present.
	var exists bool
	if err := pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM information_schema.columns
		 WHERE table_name = 'users' AND column_name = 'srp_needs_reregistration')`,
	).Scan(&exists); err != nil || !exists {
		pool.Close()
		t.Skipf("SKIP %s: test DB missing migrated schema (users.srp_needs_reregistration): err=%v", t.Name(), err)
	}
	return pool, ctx
}

// recoveryCodeHash mirrors internal/recovery hashing: sha256 of the normalized code.
func recoveryCodeHash(code string) []byte {
	normalized := strings.ToUpper(strings.ReplaceAll(code, "-", ""))
	sum := sha256.Sum256([]byte(normalized))
	return sum[:]
}

// insertFlaggedUser creates an SRP user flagged for re-registration (#65) with a known
// original verifier and returns the user ID. email must be unique per test.
func insertFlaggedUser(t *testing.T, pool *pgxpool.Pool, ctx context.Context, email string, origVerifier []byte) string {
	t.Helper()
	userID := uuid.New().String()
	salt := bytes.Repeat([]byte{0x11}, 32)
	pub := bytes.Repeat([]byte{0x22}, 32)
	_, err := pool.Exec(ctx,
		`INSERT INTO users (id, email_hash, srp_salt, srp_verifier, public_key_x25519, public_key_ed25519,
		                    role, auth_method, srp_needs_reregistration, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, 'user', 'srp', true, NOW(), NOW())`,
		userID, hashEmail(email), salt, origVerifier, pub, pub,
	)
	require.NoError(t, err, "insert flagged user")
	return userID
}

func insertRecoveryCode(t *testing.T, pool *pgxpool.Pool, ctx context.Context, userID, code string, index int) {
	t.Helper()
	_, err := pool.Exec(ctx,
		`INSERT INTO recovery_codes (user_id, code_hash, code_index, created_at) VALUES ($1, $2, $3, NOW())`,
		userID, recoveryCodeHash(code), index,
	)
	require.NoError(t, err, "insert recovery code")
}

// validReRegBody builds a well-formed registration request with a fresh verifier.
func validReRegBody(t *testing.T, email, verifierHex, recoveryCode string) []byte {
	t.Helper()
	salt := hex.EncodeToString(bytes.Repeat([]byte{0x33}, 32)) // 64 hex chars
	pub := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x44}, 32))
	body, err := json.Marshal(RegisterRequest{
		Email:            email,
		SRPSalt:          salt,
		SRPVerifier:      verifierHex,
		PublicKeyX25519:  pub,
		PublicKeyEd25519: pub,
		RecoveryCode:     recoveryCode,
	})
	require.NoError(t, err)
	return body
}

func callRegister(pool *pgxpool.Pool, body []byte) (*httptest.ResponseRecorder, *mockAuditService) {
	audit := &mockAuditService{}
	handler := HandleRegister(pool, audit)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	return rr, audit
}

func currentVerifier(t *testing.T, pool *pgxpool.Pool, ctx context.Context, userID string) []byte {
	t.Helper()
	var v []byte
	require.NoError(t, pool.QueryRow(ctx, `SELECT srp_verifier FROM users WHERE id = $1`, userID).Scan(&v))
	return v
}

func flagState(t *testing.T, pool *pgxpool.Pool, ctx context.Context, userID string) bool {
	t.Helper()
	var f bool
	require.NoError(t, pool.QueryRow(ctx, `SELECT srp_needs_reregistration FROM users WHERE id = $1`, userID).Scan(&f))
	return f
}

func codeConsumed(t *testing.T, pool *pgxpool.Pool, ctx context.Context, userID, code string) bool {
	t.Helper()
	var used *time.Time
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT used_at FROM recovery_codes WHERE user_id = $1 AND code_hash = $2`,
		userID, recoveryCodeHash(code),
	).Scan(&used))
	return used != nil
}

func TestReRegistration_ValidRecoveryCode_SucceedsAndRotatesCode(t *testing.T) {
	pool, ctx := setupReRegTestDB(t)
	defer pool.Close()

	email := "f4-valid-" + uuid.NewString() + "@example.com"
	origVerifier := bytes.Repeat([]byte{0xAA}, 64)
	userID := insertFlaggedUser(t, pool, ctx, email, origVerifier)
	const goodCode = "AAAA-BBBB-CCCC"
	const otherCode = "DDDD-EEEE-FFFF"
	insertRecoveryCode(t, pool, ctx, userID, goodCode, 0)
	insertRecoveryCode(t, pool, ctx, userID, otherCode, 1)

	newVerifierHex := hex.EncodeToString(bytes.Repeat([]byte{0xBB}, 64))
	rr, audit := callRegister(pool, validReRegBody(t, email, newVerifierHex, goodCode))

	require.Equal(t, http.StatusCreated, rr.Code, "body=%s", rr.Body.String())

	var resp RegisterResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	require.Equal(t, userID, resp.UserID, "must update the SAME row, not insert")

	// Verifier swapped to the new value.
	newVerifier, _ := hex.DecodeString(newVerifierHex)
	require.Equal(t, newVerifier, currentVerifier(t, pool, ctx, userID), "verifier must be updated")
	// Flag cleared.
	require.False(t, flagState(t, pool, ctx, userID), "flag must be cleared after re-registration")
	// The used code is consumed (single-use); the other code is untouched.
	require.True(t, codeConsumed(t, pool, ctx, userID, goodCode), "used recovery code must be rotated/consumed")
	require.False(t, codeConsumed(t, pool, ctx, userID, otherCode), "unused recovery code must remain valid")
	require.Contains(t, audit.actions, "ACCOUNT_REREGISTERED")
}

func TestReRegistration_NoProof_Rejected_VerifierUnchanged(t *testing.T) {
	pool, ctx := setupReRegTestDB(t)
	defer pool.Close()

	email := "f4-noproof-" + uuid.NewString() + "@example.com"
	origVerifier := bytes.Repeat([]byte{0xAA}, 64)
	userID := insertFlaggedUser(t, pool, ctx, email, origVerifier)
	insertRecoveryCode(t, pool, ctx, userID, "AAAA-BBBB-CCCC", 0)

	newVerifierHex := hex.EncodeToString(bytes.Repeat([]byte{0xBB}, 64))
	rr, _ := callRegister(pool, validReRegBody(t, email, newVerifierHex, "")) // no recovery code

	require.Equal(t, http.StatusUnauthorized, rr.Code, "body=%s", rr.Body.String())
	var body map[string]string
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &body))
	require.Equal(t, reRegistrationProofRequiredCode, body["code"])

	require.Equal(t, origVerifier, currentVerifier(t, pool, ctx, userID), "verifier must be UNCHANGED")
	require.True(t, flagState(t, pool, ctx, userID), "flag must remain set")
	require.False(t, codeConsumed(t, pool, ctx, userID, "AAAA-BBBB-CCCC"), "no code should be consumed")
}

func TestReRegistration_InvalidProof_Rejected_VerifierUnchanged(t *testing.T) {
	pool, ctx := setupReRegTestDB(t)
	defer pool.Close()

	email := "f4-badproof-" + uuid.NewString() + "@example.com"
	origVerifier := bytes.Repeat([]byte{0xAA}, 64)
	userID := insertFlaggedUser(t, pool, ctx, email, origVerifier)
	const goodCode = "AAAA-BBBB-CCCC"
	insertRecoveryCode(t, pool, ctx, userID, goodCode, 0)

	newVerifierHex := hex.EncodeToString(bytes.Repeat([]byte{0xBB}, 64))
	rr, _ := callRegister(pool, validReRegBody(t, email, newVerifierHex, "ZZZZ-ZZZZ-ZZZZ")) // wrong code

	require.Equal(t, http.StatusUnauthorized, rr.Code, "body=%s", rr.Body.String())
	require.Equal(t, origVerifier, currentVerifier(t, pool, ctx, userID), "verifier must be UNCHANGED")
	require.True(t, flagState(t, pool, ctx, userID), "flag must remain set")
	require.False(t, codeConsumed(t, pool, ctx, userID, goodCode), "the real code must NOT be consumed by a wrong guess")
}

func TestReRegistration_ReusedCode_Rejected(t *testing.T) {
	pool, ctx := setupReRegTestDB(t)
	defer pool.Close()

	email := "f4-reuse-" + uuid.NewString() + "@example.com"
	origVerifier := bytes.Repeat([]byte{0xAA}, 64)
	userID := insertFlaggedUser(t, pool, ctx, email, origVerifier)
	const code = "AAAA-BBBB-CCCC"
	insertRecoveryCode(t, pool, ctx, userID, code, 0)

	// First use succeeds.
	v1 := hex.EncodeToString(bytes.Repeat([]byte{0xBB}, 64))
	rr1, _ := callRegister(pool, validReRegBody(t, email, v1, code))
	require.Equal(t, http.StatusCreated, rr1.Code, "first use body=%s", rr1.Body.String())

	// Re-flag the account and try the same (now consumed) code again.
	_, err := pool.Exec(ctx, `UPDATE users SET srp_needs_reregistration = true WHERE id = $1`, userID)
	require.NoError(t, err)

	v2 := hex.EncodeToString(bytes.Repeat([]byte{0xCC}, 64))
	rr2, _ := callRegister(pool, validReRegBody(t, email, v2, code))
	require.Equal(t, http.StatusUnauthorized, rr2.Code, "reused code must be rejected; body=%s", rr2.Body.String())

	// Verifier stays at v1 (the successful one), not v2.
	v1Bytes, _ := hex.DecodeString(v1)
	require.Equal(t, v1Bytes, currentVerifier(t, pool, ctx, userID), "verifier must not change on reused-code attempt")
}

func TestFirstTimeRegistration_NewEmail_Succeeds(t *testing.T) {
	pool, ctx := setupReRegTestDB(t)
	defer pool.Close()

	email := "f4-firsttime-" + uuid.NewString() + "@example.com"
	verifierHex := hex.EncodeToString(bytes.Repeat([]byte{0xEE}, 64))
	rr, audit := callRegister(pool, validReRegBody(t, email, verifierHex, "")) // no code needed

	require.Equal(t, http.StatusCreated, rr.Code, "first-time registration must still work; body=%s", rr.Body.String())
	var resp RegisterResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	require.NotEmpty(t, resp.UserID)

	// Row exists, not flagged, with our verifier.
	require.False(t, flagState(t, pool, ctx, resp.UserID))
	verifier, _ := hex.DecodeString(verifierHex)
	require.Equal(t, verifier, currentVerifier(t, pool, ctx, resp.UserID))
	require.Contains(t, audit.actions, "ACCOUNT_CREATED")
}
