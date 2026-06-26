//go:build integration

package testutil

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// api_client.go wraps the REAL SRP-6a + presigned-S3 API for the full-stack
// integration tests. It replaces the previous plaintext {email,password} POSTs
// (which targeted a nonexistent /auth/login endpoint) with the actual
// zero-knowledge SRP handshake the production clients perform:
//
//	register: POST /api/v1/auth/register   {email, srp_salt, srp_verifier, pubkeys}
//	login:    POST /api/v1/auth/srp/init   {email}            -> {salt, B, session_id}
//	          POST /api/v1/auth/srp/verify {session_id, A, M1} -> {M2, access_token}
//
// No plaintext password is ever sent to the server.

const apiPrefix = "/api/v1"

// TestUser represents an authenticated test account. The password is retained
// ONLY client-side (to re-derive x on login); it is never transmitted.
type TestUser struct {
	Email    string
	Password string
	Token    string
	UserID   string
}

// TestVault represents a created test vault.
type TestVault struct {
	ID   string
	Name string
	URL  string
}

// TestBlob represents an uploaded encrypted blob.
type TestBlob struct {
	ID       string
	VaultID  string
	Size     int64
	Checksum string
}

// APIClient wraps HTTP calls to the test API with SRP auth handling.
type APIClient struct {
	baseURL string
	client  *http.Client
	token   string
}

// NewAPIClient creates a client for the integration test API.
// apiURL should be like http://localhost:8090
func NewAPIClient(apiURL string) *APIClient {
	return &APIClient{
		baseURL: apiURL,
		client:  &http.Client{Timeout: 30 * time.Second},
	}
}

// SetToken sets the bearer token for subsequent requests.
func (c *APIClient) SetToken(token string) { c.token = token }

func (c *APIClient) do(method, path string, body interface{}) (*http.Response, error) {
	url := c.baseURL + path
	var reqBody io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request body: %w", err)
		}
		reqBody = bytes.NewBuffer(data)
	}
	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	return c.client.Do(req)
}

// CreateTestUser registers a new test user via the REAL SRP registration flow:
// it derives an SRP salt + verifier locally (Argon2id(password) -> x, v = g^x)
// and generates X25519/Ed25519 public keys, then POSTs ONLY the salt, verifier
// and public keys — never the password. It then logs in via SRP to obtain a
// token.
func (c *APIClient) CreateTestUser(password string) (*TestUser, error) {
	email := fmt.Sprintf("test-%d@usbvault.local", time.Now().UnixNano())

	// Derive SRP salt + verifier locally (zero-knowledge).
	creds, err := ComputeSRPRegistration(email, password)
	if err != nil {
		return nil, fmt.Errorf("compute SRP registration: %w", err)
	}

	// The server requires 32-byte X25519 and Ed25519 public keys (base64). The
	// SRP handshake does not use them, so deterministic test keys suffice.
	x25519Pub := make([]byte, 32)
	if _, err := rand.Read(x25519Pub); err != nil {
		return nil, fmt.Errorf("generate x25519 test key: %w", err)
	}
	ed25519Pub, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("generate ed25519 test key: %w", err)
	}

	payload := map[string]string{
		"email":             email,
		"srp_salt":          creds.SaltHex,
		"srp_verifier":      creds.VerifierHex,
		"public_key_x25519": base64.StdEncoding.EncodeToString(x25519Pub),
		"public_key_ed25519": base64.StdEncoding.EncodeToString(ed25519Pub),
	}

	resp, err := c.do(http.MethodPost, apiPrefix+"/auth/register", payload)
	if err != nil {
		return nil, fmt.Errorf("register request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("register failed with status %d: %s", resp.StatusCode, respBody)
	}

	var regResult struct {
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&regResult); err != nil {
		return nil, fmt.Errorf("decode register response: %w", err)
	}

	// Complete a real SRP login to obtain an access token.
	user, err := c.LoginTestUser(email, password)
	if err != nil {
		return nil, fmt.Errorf("post-registration SRP login: %w", err)
	}
	if regResult.UserID != "" {
		user.UserID = regResult.UserID
	}
	return user, nil
}

// LoginTestUser performs a full SRP-6a handshake (init + verify) and returns a
// token. It also verifies the server's M2 proof (mutual authentication), so a
// server that cannot prove knowledge of the verifier causes a loud failure.
func (c *APIClient) LoginTestUser(email, password string) (*TestUser, error) {
	// Step 1: /auth/srp/init — server returns salt, its public B, and a session.
	initResp, err := c.do(http.MethodPost, apiPrefix+"/auth/srp/init", map[string]string{"email": email})
	if err != nil {
		return nil, fmt.Errorf("srp init request: %w", err)
	}
	defer initResp.Body.Close()
	if initResp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(initResp.Body)
		return nil, fmt.Errorf("srp init failed with status %d: %s", initResp.StatusCode, respBody)
	}
	var initResult struct {
		Salt      string `json:"salt"`
		B         string `json:"B"`
		SessionID string `json:"session_id"`
	}
	if err := json.NewDecoder(initResp.Body).Decode(&initResult); err != nil {
		return nil, fmt.Errorf("decode srp init response: %w", err)
	}

	// Step 2: derive x from the returned salt, generate client ephemeral (a, A),
	// and compute M1 from the server's challenge B.
	session, aStr, err := StartSRPLogin(initResult.Salt, email, password)
	if err != nil {
		return nil, fmt.Errorf("start srp login: %w", err)
	}
	m1Hex, K, err := session.ProcessChallenge(initResult.B)
	if err != nil {
		return nil, fmt.Errorf("process srp challenge: %w", err)
	}

	// Step 3: /auth/srp/verify — send A and M1; server returns M2 + access token.
	verifyResp, err := c.do(http.MethodPost, apiPrefix+"/auth/srp/verify", map[string]string{
		"session_id": initResult.SessionID,
		"A":          aStr,
		"M1":         m1Hex,
	})
	if err != nil {
		return nil, fmt.Errorf("srp verify request: %w", err)
	}
	defer verifyResp.Body.Close()
	if verifyResp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(verifyResp.Body)
		return nil, fmt.Errorf("srp verify failed with status %d: %s", verifyResp.StatusCode, respBody)
	}
	var verifyResult struct {
		M2          string `json:"M2"`
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(verifyResp.Body).Decode(&verifyResult); err != nil {
		return nil, fmt.Errorf("decode srp verify response: %w", err)
	}

	// Mutual auth: the server MUST prove knowledge of the verifier via M2.
	if !session.VerifyServerM2(m1Hex, verifyResult.M2, K) {
		return nil, fmt.Errorf("server M2 proof verification failed — possible MITM or convention mismatch")
	}
	if verifyResult.AccessToken == "" {
		return nil, fmt.Errorf("no access_token returned from srp verify")
	}

	return &TestUser{
		Email:    email,
		Password: password,
		Token:    verifyResult.AccessToken,
	}, nil
}

// CreateVault creates a new vault for the authenticated user.
func (c *APIClient) CreateVault(user *TestUser, name string) (*TestVault, error) {
	c.SetToken(user.Token)
	resp, err := c.do(http.MethodPost, apiPrefix+"/vaults/", map[string]string{"name": name})
	if err != nil {
		return nil, fmt.Errorf("create vault request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("create vault failed with status %d: %s", resp.StatusCode, respBody)
	}
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode vault response: %w", err)
	}
	id, ok := result["id"].(string)
	if !ok {
		return nil, fmt.Errorf("no id in vault response")
	}
	return &TestVault{ID: id, Name: name}, nil
}

// ListVaults lists all vaults for the authenticated user.
func (c *APIClient) ListVaults(user *TestUser) ([]TestVault, error) {
	c.SetToken(user.Token)
	resp, err := c.do(http.MethodGet, apiPrefix+"/vaults/", nil)
	if err != nil {
		return nil, fmt.Errorf("list vaults request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("list vaults failed with status %d: %s", resp.StatusCode, respBody)
	}
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode vaults response: %w", err)
	}
	vaultsRaw, ok := result["vaults"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("no vaults array in response")
	}
	var vaults []TestVault
	for _, v := range vaultsRaw {
		vaultMap := v.(map[string]interface{})
		vaults = append(vaults, TestVault{
			ID:   vaultMap["id"].(string),
			Name: vaultMap["name"].(string),
		})
	}
	return vaults, nil
}

// DeleteVault deletes a vault and all its contents.
func (c *APIClient) DeleteVault(user *TestUser, vaultID string) error {
	c.SetToken(user.Token)
	resp, err := c.do(http.MethodDelete, apiPrefix+"/vaults/"+vaultID, nil)
	if err != nil {
		return fmt.Errorf("delete vault request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("delete vault failed with status %d: %s", resp.StatusCode, respBody)
	}
	return nil
}

// GetUploadURL requests a presigned upload URL for an encrypted blob. The
// SERVER never sees the plaintext or the ciphertext bytes here — only a
// presigned URL is issued, and the client PUTs the ciphertext directly to
// object storage. This is the zero-knowledge upload path (replacing the old
// direct blob POST that does not exist on the shipped API).
func (c *APIClient) GetUploadURL(user *TestUser, vaultID, filename string, size int) (uploadURL, blobID string, err error) {
	c.SetToken(user.Token)
	resp, err := c.do(http.MethodPost, apiPrefix+"/vaults/"+vaultID+"/blobs/upload-url", map[string]interface{}{
		"filename": filename,
		"size":     size,
	})
	if err != nil {
		return "", "", fmt.Errorf("upload-url request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return "", "", fmt.Errorf("upload-url failed with status %d: %s", resp.StatusCode, respBody)
	}
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", "", fmt.Errorf("decode upload-url response: %w", err)
	}
	if u, ok := result["url"].(string); ok {
		uploadURL = u
	} else if u, ok := result["upload_url"].(string); ok {
		uploadURL = u
	}
	if id, ok := result["blob_id"].(string); ok {
		blobID = id
	} else if id, ok := result["id"].(string); ok {
		blobID = id
	}
	if uploadURL == "" {
		return "", "", fmt.Errorf("no presigned URL in upload-url response: %v", result)
	}
	return uploadURL, blobID, nil
}

// PutCiphertext PUTs already-encrypted bytes directly to a presigned storage
// URL. The bytes MUST be ciphertext — the server/object-store never sees
// plaintext.
func (c *APIClient) PutCiphertext(presignedURL string, ciphertext []byte) error {
	req, err := http.NewRequest(http.MethodPut, presignedURL, bytes.NewReader(ciphertext))
	if err != nil {
		return fmt.Errorf("create PUT request: %w", err)
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("PUT ciphertext: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("PUT ciphertext failed with status %d: %s", resp.StatusCode, respBody)
	}
	return nil
}

// ListBlobs lists all blobs in a vault.
func (c *APIClient) ListBlobs(user *TestUser, vaultID string) ([]TestBlob, error) {
	c.SetToken(user.Token)
	resp, err := c.do(http.MethodGet, apiPrefix+"/vaults/"+vaultID+"/blobs/", nil)
	if err != nil {
		return nil, fmt.Errorf("list blobs request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("list blobs failed with status %d: %s", resp.StatusCode, respBody)
	}
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode blobs response: %w", err)
	}
	blobsRaw, ok := result["blobs"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("no blobs array in response")
	}
	var blobs []TestBlob
	for _, b := range blobsRaw {
		blobMap := b.(map[string]interface{})
		blob := TestBlob{VaultID: vaultID}
		if id, ok := blobMap["id"].(string); ok {
			blob.ID = id
		} else if id, ok := blobMap["blob_id"].(string); ok {
			blob.ID = id
		}
		blobs = append(blobs, blob)
	}
	return blobs, nil
}

// DeleteBlob deletes a blob from a vault.
func (c *APIClient) DeleteBlob(user *TestUser, vaultID, blobID string) error {
	c.SetToken(user.Token)
	resp, err := c.do(http.MethodDelete, apiPrefix+"/vaults/"+vaultID+"/blobs/"+blobID, nil)
	if err != nil {
		return fmt.Errorf("delete blob request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("delete blob failed with status %d: %s", resp.StatusCode, respBody)
	}
	return nil
}

// GetAPIURL returns the API base URL from environment or defaults to localhost:8090.
func GetAPIURL() string {
	if url := os.Getenv("API_URL"); url != "" {
		return url
	}
	return "http://localhost:8090"
}
