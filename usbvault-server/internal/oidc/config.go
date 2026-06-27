package oidc

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ProviderConfig represents an OIDC Identity Provider configuration.
type ProviderConfig struct {
	ID                    string    `json:"id"`
	Slug                  string    `json:"slug"`
	DisplayName           string    `json:"display_name"`
	IssuerURL             string    `json:"issuer_url"`
	ClientID              string    `json:"client_id"`
	ClientSecretEncrypted []byte    `json:"-"`
	AllowedDomains        []string  `json:"allowed_domains"`
	Scopes                []string  `json:"scopes"`
	Enabled               bool      `json:"enabled"`
	CreatedAt             time.Time `json:"created_at"`

	// AllowedRedirectURIs is the exact-match allowlist of redirect_uri values
	// accepted for this provider. SECURITY: redirect_uri must never be used
	// verbatim from the client; it must match one of these entries exactly to
	// prevent authorization-code interception / open redirect.
	//
	// Populated from the oidc_providers.allowed_redirect_uris column
	// (added in migration 015). When empty, redirectURIAllowed falls back to
	// the global OIDCConfig.CallbackBaseURL.
	AllowedRedirectURIs []string `json:"allowed_redirect_uris"`
}

// OIDCConfig holds the global OIDC configuration.
type OIDCConfig struct {
	Enabled             bool
	SecretEncryptionKey []byte // 32-byte AES-256-GCM key for encrypting client secrets
	KEKEncryptionKey    []byte // 32-byte key for KEK escrow encryption
	CallbackBaseURL     string
	DefaultScopes       []string
}

// LoadConfig reads OIDC configuration from environment variables.
func LoadConfig() (*OIDCConfig, error) {
	enabled := os.Getenv("OIDC_ENABLED") == "true"
	if !enabled {
		return &OIDCConfig{Enabled: false}, nil
	}

	secretKeyB64 := os.Getenv("OIDC_SECRET_ENCRYPTION_KEY")
	if secretKeyB64 == "" {
		return nil, fmt.Errorf("OIDC_SECRET_ENCRYPTION_KEY required when OIDC_ENABLED=true")
	}
	secretKey, err := base64.StdEncoding.DecodeString(secretKeyB64)
	if err != nil || len(secretKey) != 32 {
		return nil, fmt.Errorf("OIDC_SECRET_ENCRYPTION_KEY must be 32 bytes base64-encoded")
	}

	kekKeyB64 := os.Getenv("OIDC_KEK_ENCRYPTION_KEY")
	if kekKeyB64 == "" {
		return nil, fmt.Errorf("OIDC_KEK_ENCRYPTION_KEY required when OIDC_ENABLED=true")
	}
	kekKey, err := base64.StdEncoding.DecodeString(kekKeyB64)
	if err != nil || len(kekKey) != 32 {
		return nil, fmt.Errorf("OIDC_KEK_ENCRYPTION_KEY must be 32 bytes base64-encoded")
	}

	callbackBase := os.Getenv("OIDC_CALLBACK_BASE_URL")
	if callbackBase == "" {
		callbackBase = "https://app.usbvault.com/auth/oidc/callback"
	}

	scopes := []string{"openid", "email", "profile"}
	if envScopes := os.Getenv("OIDC_DEFAULT_SCOPES"); envScopes != "" {
		scopes = strings.Split(envScopes, ",")
	}

	return &OIDCConfig{
		Enabled:             true,
		SecretEncryptionKey: secretKey,
		KEKEncryptionKey:    kekKey,
		CallbackBaseURL:     callbackBase,
		DefaultScopes:       scopes,
	}, nil
}

// EncryptSecret encrypts a client secret using AES-256-GCM.
func EncryptSecret(plaintext string, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return aead.Seal(nonce, nonce, []byte(plaintext), nil), nil
}

// DecryptSecret decrypts a client secret encrypted with AES-256-GCM.
func DecryptSecret(ciphertext []byte, key []byte) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := aead.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}
	nonce, ct := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := aead.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

// LoadProviders loads all enabled OIDC providers from the database.
func LoadProviders(ctx context.Context, pool *pgxpool.Pool) ([]ProviderConfig, error) {
	rows, err := pool.Query(ctx,
		`SELECT id, slug, display_name, issuer_url, client_id, client_secret_encrypted,
		        allowed_domains, scopes, allowed_redirect_uris, enabled, created_at
		 FROM oidc_providers WHERE enabled = true
		 ORDER BY display_name`)
	if err != nil {
		return nil, fmt.Errorf("failed to load OIDC providers: %w", err)
	}
	defer rows.Close()

	var providers []ProviderConfig
	for rows.Next() {
		var p ProviderConfig
		if err := rows.Scan(&p.ID, &p.Slug, &p.DisplayName, &p.IssuerURL,
			&p.ClientID, &p.ClientSecretEncrypted, &p.AllowedDomains,
			&p.Scopes, &p.AllowedRedirectURIs, &p.Enabled, &p.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan provider row: %w", err)
		}
		providers = append(providers, p)
	}
	return providers, rows.Err()
}
