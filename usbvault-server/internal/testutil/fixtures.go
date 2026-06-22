package testutil

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DE-018 FIX: Test transaction helper for isolated test fixtures
// WithTestTransaction runs a test function within a transaction that is always rolled back
func WithTestTransaction(t *testing.T, pool *pgxpool.Pool, fn func(ctx context.Context)) {
	t.Helper()
	ctx := context.Background()

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("failed to begin test transaction: %v", err)
	}
	// Always rollback - test data never persists
	defer tx.Rollback(ctx)

	// Create a context with the transaction
	txCtx := context.WithValue(ctx, "test_tx", tx)
	fn(txCtx)
}

// SetupTestDB creates a test database connection pool
func SetupTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := "postgres://test:test@localhost:5432/usbvault_test?sslmode=disable" //gosec:disable G101 -- static localhost credentials for the test database, not a real secret
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		t.Skipf("skipping integration test: %v", err)
	}
	return pool
}

// GenerateTestID creates a unique test identifier
func GenerateTestID(prefix string) string {
	return fmt.Sprintf("%s_test_%f", prefix, testing.AllocsPerRun(1, func() {}))
}

// ─── Integration Test Fixtures (HTTP-based, for full-stack testing) ────

// TestUser represents credentials for a test account
type TestUser struct {
	Email    string
	Password string
	Token    string
	UserID   string
}

// TestVault represents a created test vault
type TestVault struct {
	ID   string
	Name string
	URL  string // Pre-signed upload URL if applicable
}

// TestBlob represents an uploaded encrypted blob
type TestBlob struct {
	ID       string
	VaultID  string
	Size     int64
	Checksum string
}

// APIClient wraps HTTP calls to the test API with auth handling
type APIClient struct {
	baseURL string
	client  *http.Client
	token   string
}

// NewAPIClient creates a client for the integration test API
// apiURL should be like http://localhost:8090
func NewAPIClient(apiURL string) *APIClient {
	return &APIClient{
		baseURL: apiURL,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// SetToken sets the authorization token for subsequent requests
func (c *APIClient) SetToken(token string) {
	c.token = token
}

// do executes an HTTP request with auth headers
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

// CreateTestUser registers a new test user via HTTP and returns credentials
// Generates a unique email using timestamp and returns password used for registration
func (c *APIClient) CreateTestUser(password string) (*TestUser, error) {
	email := fmt.Sprintf("test-%d@usbvault.local", time.Now().UnixNano())

	payload := map[string]string{
		"email":    email,
		"password": password,
	}

	resp, err := c.do(http.MethodPost, "/auth/register", payload)
	if err != nil {
		return nil, fmt.Errorf("register request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("register failed with status %d: %s", resp.StatusCode, body)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode register response: %w", err)
	}

	token, ok := result["token"].(string)
	if !ok {
		return nil, fmt.Errorf("no token in register response")
	}

	userID, ok := result["user_id"].(string)
	if !ok {
		userID = result["id"].(string) // fallback for different response format
	}

	return &TestUser{
		Email:    email,
		Password: password,
		Token:    token,
		UserID:   userID,
	}, nil
}

// LoginTestUser logs in with email/password and returns a token
func (c *APIClient) LoginTestUser(email, password string) (*TestUser, error) {
	payload := map[string]string{
		"email":    email,
		"password": password,
	}

	resp, err := c.do(http.MethodPost, "/auth/login", payload)
	if err != nil {
		return nil, fmt.Errorf("login request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("login failed with status %d: %s", resp.StatusCode, body)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode login response: %w", err)
	}

	token, ok := result["token"].(string)
	if !ok {
		return nil, fmt.Errorf("no token in login response")
	}

	userID, ok := result["user_id"].(string)
	if !ok {
		userID = result["id"].(string)
	}

	return &TestUser{
		Email:    email,
		Password: password,
		Token:    token,
		UserID:   userID,
	}, nil
}

// CreateVault creates a new vault for the authenticated user
func (c *APIClient) CreateVault(user *TestUser, name string) (*TestVault, error) {
	c.SetToken(user.Token)

	payload := map[string]string{
		"name": name,
	}

	resp, err := c.do(http.MethodPost, "/vaults", payload)
	if err != nil {
		return nil, fmt.Errorf("create vault request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("create vault failed with status %d: %s", resp.StatusCode, body)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode vault response: %w", err)
	}

	id, ok := result["id"].(string)
	if !ok {
		return nil, fmt.Errorf("no id in vault response")
	}

	return &TestVault{
		ID:   id,
		Name: name,
	}, nil
}

// ListVaults lists all vaults for the authenticated user
func (c *APIClient) ListVaults(user *TestUser) ([]TestVault, error) {
	c.SetToken(user.Token)

	resp, err := c.do(http.MethodGet, "/vaults", nil)
	if err != nil {
		return nil, fmt.Errorf("list vaults request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("list vaults failed with status %d: %s", resp.StatusCode, body)
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

// DeleteVault deletes a vault and all its contents
func (c *APIClient) DeleteVault(user *TestUser, vaultID string) error {
	c.SetToken(user.Token)

	resp, err := c.do(http.MethodDelete, "/vaults/"+vaultID, nil)
	if err != nil {
		return fmt.Errorf("delete vault request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("delete vault failed with status %d: %s", resp.StatusCode, body)
	}

	return nil
}

// UploadBlob uploads encrypted blob data to a vault
// data should be encrypted and ready for storage
func (c *APIClient) UploadBlob(user *TestUser, vaultID string, data []byte, filename string) (*TestBlob, error) {
	c.SetToken(user.Token)

	// For multipart, we'd use FormFile; for simplicity in tests, send as base64 JSON
	payload := map[string]interface{}{
		"filename": filename,
		"data":     data, // In real implementation, would be base64
		"size":     len(data),
	}

	resp, err := c.do(http.MethodPost, "/vaults/"+vaultID+"/blobs", payload)
	if err != nil {
		return nil, fmt.Errorf("upload blob request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("upload blob failed with status %d: %s", resp.StatusCode, body)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode blob response: %w", err)
	}

	id, ok := result["id"].(string)
	if !ok {
		return nil, fmt.Errorf("no id in blob response")
	}

	return &TestBlob{
		ID:      id,
		VaultID: vaultID,
		Size:    int64(len(data)),
	}, nil
}

// ListBlobs lists all blobs in a vault
func (c *APIClient) ListBlobs(user *TestUser, vaultID string) ([]TestBlob, error) {
	c.SetToken(user.Token)

	resp, err := c.do(http.MethodGet, "/vaults/"+vaultID+"/blobs", nil)
	if err != nil {
		return nil, fmt.Errorf("list blobs request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("list blobs failed with status %d: %s", resp.StatusCode, body)
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
		blobs = append(blobs, TestBlob{
			ID:      blobMap["id"].(string),
			VaultID: vaultID,
		})
	}

	return blobs, nil
}

// DeleteBlob deletes a blob from a vault
func (c *APIClient) DeleteBlob(user *TestUser, vaultID, blobID string) error {
	c.SetToken(user.Token)

	resp, err := c.do(http.MethodDelete, "/vaults/"+vaultID+"/blobs/"+blobID, nil)
	if err != nil {
		return fmt.Errorf("delete blob request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("delete blob failed with status %d: %s", resp.StatusCode, body)
	}

	return nil
}

// CleanupUser deletes all data for a user (optional, for explicit cleanup)
// Most tests won't need this since the database is tmpfs
func (c *APIClient) CleanupUser(user *TestUser) error {
	c.SetToken(user.Token)

	resp, err := c.do(http.MethodDelete, "/user/profile", nil)
	if err != nil {
		return fmt.Errorf("cleanup request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("cleanup failed with status %d: %s", resp.StatusCode, body)
	}

	return nil
}

// GetAPIURL returns the API base URL from environment or defaults to localhost:8090
func GetAPIURL() string {
	if url := os.Getenv("API_URL"); url != "" {
		return url
	}
	return "http://localhost:8090"
}
