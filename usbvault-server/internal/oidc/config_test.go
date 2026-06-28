package oidc

import (
	"encoding/base64"
	"testing"
)

func validKey() string { return base64.StdEncoding.EncodeToString(make([]byte, 32)) }

// LoadConfig must NOT require OIDC_KEK_ENCRYPTION_KEY: server-side KEK escrow is a
// planned, unimplemented feature and the product decision is to keep zero-knowledge
// (the key is never consumed). Its absence must not block OIDC startup.
func TestLoadConfig_KEKEscrowKeyIsOptional(t *testing.T) {
	t.Setenv("OIDC_ENABLED", "true")
	t.Setenv("OIDC_SECRET_ENCRYPTION_KEY", validKey())

	t.Run("absent KEK key still loads (escrow planned/optional)", func(t *testing.T) {
		t.Setenv("OIDC_KEK_ENCRYPTION_KEY", "")
		cfg, err := LoadConfig()
		if err != nil {
			t.Fatalf("LoadConfig failed without OIDC_KEK_ENCRYPTION_KEY: %v", err)
		}
		if !cfg.Enabled {
			t.Fatal("expected OIDC enabled")
		}
		if cfg.KEKEncryptionKey != nil {
			t.Fatalf("expected nil KEKEncryptionKey when unset, got %d bytes", len(cfg.KEKEncryptionKey))
		}
	})

	t.Run("present valid KEK key is still loaded for a future rollout", func(t *testing.T) {
		t.Setenv("OIDC_KEK_ENCRYPTION_KEY", validKey())
		cfg, err := LoadConfig()
		if err != nil {
			t.Fatalf("LoadConfig failed: %v", err)
		}
		if len(cfg.KEKEncryptionKey) != 32 {
			t.Fatalf("expected 32-byte KEKEncryptionKey, got %d", len(cfg.KEKEncryptionKey))
		}
	})

	t.Run("present but wrong-size KEK key is rejected", func(t *testing.T) {
		t.Setenv("OIDC_KEK_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(make([]byte, 16)))
		if _, err := LoadConfig(); err == nil {
			t.Fatal("expected an error for a 16-byte OIDC_KEK_ENCRYPTION_KEY")
		}
	})

	// Sanity: the genuinely-required SECRET key is still enforced.
	t.Run("missing OIDC_SECRET_ENCRYPTION_KEY still fails", func(t *testing.T) {
		t.Setenv("OIDC_SECRET_ENCRYPTION_KEY", "")
		t.Setenv("OIDC_KEK_ENCRYPTION_KEY", "")
		if _, err := LoadConfig(); err == nil {
			t.Fatal("expected an error when OIDC_SECRET_ENCRYPTION_KEY is missing")
		}
	})
}
