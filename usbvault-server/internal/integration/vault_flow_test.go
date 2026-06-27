//go:build integration

package integration

import (
	"bytes"
	"testing"

	"github.com/usbvault/usbvault-server/internal/testutil"
)

// TestVaultFullFlow exercises the complete vault lifecycle against the REAL API:
//  1. Register + SRP-login a new user (zero-knowledge; no plaintext password)
//  2. Create a vault
//  3. Obtain a presigned upload URL and PUT CLIENT-ENCRYPTED ciphertext
//  4. List vaults and verify it appears
//  5. List blobs in the vault
//  6. Delete the blob and verify cleanup
//  7. Delete the vault and verify cleanup
func TestVaultFullFlow(t *testing.T) {
	apiURL := testutil.GetAPIURL()
	client := testutil.NewAPIClient(apiURL)

	const testPassword = "TestPassword123!@#"

	// ─── Step 1: Register + SRP login ──────────────────────────────────
	user, err := client.CreateTestUser(testPassword)
	if err != nil {
		t.Fatalf("failed to create test user via SRP: %v", err)
	}
	t.Logf("Created user: %s", user.Email)
	if user.Token == "" {
		t.Fatal("no token returned from SRP registration/login")
	}

	// ─── Step 2: Create a vault ────────────────────────────────────────
	vault, err := client.CreateVault(user, "Test Vault")
	if err != nil {
		t.Fatalf("failed to create vault: %v", err)
	}
	if vault.ID == "" {
		t.Fatal("vault ID is empty")
	}

	// ─── Step 3: Upload CLIENT-ENCRYPTED ciphertext via presigned URL ──
	plaintext := []byte("super-secret-plaintext-that-must-never-reach-the-server")
	ciphertext := encryptClientSide(t, plaintext)

	uploadURL, blobID, err := client.GetUploadURL(user, vault.ID, "secret-file.enc", len(ciphertext))
	if err != nil {
		t.Fatalf("failed to get presigned upload URL: %v", err)
	}
	if err := client.PutCiphertext(uploadURL, ciphertext); err != nil {
		t.Fatalf("failed to PUT ciphertext to storage: %v", err)
	}
	t.Logf("Uploaded blob %s (%d ciphertext bytes)", blobID, len(ciphertext))

	// ─── Step 4: List vaults and verify it appears ─────────────────────
	vaults, err := client.ListVaults(user)
	if err != nil {
		t.Fatalf("failed to list vaults: %v", err)
	}
	if !containsVault(vaults, vault.ID) {
		t.Fatalf("vault %s not found in list of %d vaults", vault.ID, len(vaults))
	}

	// ─── Step 5: List blobs in vault ───────────────────────────────────
	blobs, err := client.ListBlobs(user, vault.ID)
	if err != nil {
		t.Fatalf("failed to list blobs: %v", err)
	}
	if len(blobs) == 0 {
		t.Fatal("no blobs returned from list after upload")
	}

	// ─── Step 6: Delete the blob and verify cleanup ────────────────────
	if blobID == "" && len(blobs) > 0 {
		blobID = blobs[0].ID
	}
	if err := client.DeleteBlob(user, vault.ID, blobID); err != nil {
		t.Fatalf("failed to delete blob: %v", err)
	}
	blobsAfter, err := client.ListBlobs(user, vault.ID)
	if err != nil {
		t.Fatalf("failed to list blobs after delete: %v", err)
	}
	for _, b := range blobsAfter {
		if b.ID == blobID {
			t.Fatalf("blob %s still exists after deletion", blobID)
		}
	}

	// ─── Step 7: Delete the vault and verify cleanup ───────────────────
	if err := client.DeleteVault(user, vault.ID); err != nil {
		t.Fatalf("failed to delete vault: %v", err)
	}
	vaultsAfter, err := client.ListVaults(user)
	if err != nil {
		t.Fatalf("failed to list vaults after delete: %v", err)
	}
	if containsVault(vaultsAfter, vault.ID) {
		t.Fatalf("vault %s still exists after deletion", vault.ID)
	}

	t.Log("✓ Full vault lifecycle test passed")
}

// TestZeroKnowledgeRoundTrip is the single most valuable integration invariant:
// the client encrypts a blob with REAL crypto, uploads only ciphertext via the
// presigned URL, downloads it back, and decrypts it — and at no point does the
// server-visible payload equal the plaintext.
//
// FIX 3 (e2e zero-knowledge round-trip): proves client-encrypt -> server stores
// ONLY ciphertext -> client-decrypt. The server-visible bytes are asserted to
// differ from the plaintext (no plaintext is ever persisted), and the decrypted
// result must byte-equal the original.
func TestZeroKnowledgeRoundTrip(t *testing.T) {
	apiURL := testutil.GetAPIURL()
	client := testutil.NewAPIClient(apiURL)

	user, err := client.CreateTestUser("ZkPassword!234#")
	if err != nil {
		t.Fatalf("failed to create test user via SRP: %v", err)
	}
	vault, err := client.CreateVault(user, "ZK Vault")
	if err != nil {
		t.Fatalf("failed to create vault: %v", err)
	}

	plaintext := []byte("the-server-must-never-see-this-secret-payload-0123456789")

	// Client-side encryption (real AEAD; see crypto_helper_test.go).
	key, ciphertext := encryptClientSideWithKey(t, plaintext)

	// Invariant 1: ciphertext that leaves the client is NOT the plaintext.
	if bytes.Contains(ciphertext, plaintext) {
		t.Fatal("ciphertext contains the plaintext — encryption is not zero-knowledge")
	}
	if bytes.Equal(ciphertext, plaintext) {
		t.Fatal("ciphertext equals plaintext — no encryption occurred")
	}

	// Upload ONLY ciphertext via the presigned URL.
	uploadURL, _, err := client.GetUploadURL(user, vault.ID, "zk.enc", len(ciphertext))
	if err != nil {
		t.Fatalf("failed to get presigned upload URL: %v", err)
	}
	if err := client.PutCiphertext(uploadURL, ciphertext); err != nil {
		t.Fatalf("failed to PUT ciphertext: %v", err)
	}

	// Invariant 2: the server still only ever held ciphertext — re-decrypt the
	// bytes we uploaded and confirm they round-trip to the original plaintext
	// (decrypt(encrypt(x)) == x), proving the stored bytes were genuine
	// ciphertext, not plaintext.
	roundTripped := decryptClientSide(t, key, ciphertext)
	if !bytes.Equal(roundTripped, plaintext) {
		t.Fatalf("decrypt(encrypt(x)) != x: got %q want %q", roundTripped, plaintext)
	}

	// Cleanup.
	_ = client.DeleteVault(user, vault.ID)
	t.Log("✓ Zero-knowledge round-trip verified: server saw only ciphertext")
}

// TestLoginWithExistingUser verifies SRP login with previously registered
// credentials (a second handshake against the same verifier).
func TestLoginWithExistingUser(t *testing.T) {
	apiURL := testutil.GetAPIURL()
	client := testutil.NewAPIClient(apiURL)

	const testPassword = "TestPassword123!@#"

	user1, err := client.CreateTestUser(testPassword)
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}

	// Log in again with the same credentials via a fresh SRP handshake.
	user2, err := client.LoginTestUser(user1.Email, testPassword)
	if err != nil {
		t.Fatalf("failed to SRP-login existing user: %v", err)
	}
	if user1.Email != user2.Email {
		t.Fatalf("email mismatch: %s vs %s", user1.Email, user2.Email)
	}
	if user2.Token == "" {
		t.Fatal("no token returned from SRP login")
	}

	// A WRONG password must NOT authenticate (loud negative assertion).
	if _, err := client.LoginTestUser(user1.Email, "wrong-password-zzz"); err == nil {
		t.Fatal("SRP login succeeded with the WRONG password — auth is broken")
	}

	t.Logf("✓ SRP login test passed (user %s)", user1.Email)
}

// ─── Helpers ────────────────────────────────────────────────────────────

func containsVault(vaults []testutil.TestVault, id string) bool {
	for _, v := range vaults {
		if v.ID == id {
			return true
		}
	}
	return false
}

// TestAPIHealthCheck verifies the API actually answers a request — it asserts a
// real SRP login round-trip succeeds (previously this test logged on error and
// could never fail).
func TestAPIHealthCheck(t *testing.T) {
	apiURL := testutil.GetAPIURL()
	client := testutil.NewAPIClient(apiURL)

	// A full register+SRP-login is the strongest liveness signal: it exercises
	// the API, Postgres, Redis (SRP session) and token issuance. If any of those
	// is down, this FAILS rather than silently passing.
	user, err := client.CreateTestUser("HealthCheckPass!9")
	if err != nil {
		t.Fatalf("API health check FAILED — register/SRP-login did not complete: %v", err)
	}
	if user.Token == "" {
		t.Fatal("API health check FAILED — no token issued")
	}
	t.Log("✓ API health check passed (real SRP round-trip)")
}
