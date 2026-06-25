// Package oidc provides OpenID Connect (OIDC) authentication for enterprise SSO.
//
// It supports multiple OIDC providers (e.g., Okta, Azure AD, Google Workspace)
// configured per-tenant via slug-based provider lookup. The flow uses PKCE
// for public client security and stores transient state in Redis.
package oidc

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	gooidc "github.com/coreos/go-oidc/v3/oidc"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"golang.org/x/oauth2"

	"github.com/usbvault/usbvault-server/internal/auth"
)

// Redis key TTL for OIDC state parameters
const (
	stateTTL        = 10 * time.Minute
	stateKeyPrefix  = "oidc:state:"
	redisTimeout    = 5 * time.Second
	pkceVerifierLen = 32 // 32 bytes -> 43 base64url chars
)

// Errors returned by the OIDC service
var (
	ErrProviderNotFound = errors.New("oidc: provider not found")
	ErrProviderDisabled = errors.New("oidc: provider is disabled")
	ErrInvalidState     = errors.New("oidc: invalid or expired state parameter")
	ErrTokenExchange    = errors.New("oidc: token exchange failed")
	ErrIDTokenVerify    = errors.New("oidc: ID token verification failed")
	ErrMissingEmail     = errors.New("oidc: ID token missing email claim")
	ErrEmailNotVerified = errors.New("oidc: ID token email is not verified by the provider")
	ErrUserCreation     = errors.New("oidc: failed to create user")
	ErrRedirectURI      = errors.New("oidc: redirect_uri is not in the provider allowlist")
)

// CallbackResult is returned after a successful OIDC callback exchange.
type CallbackResult struct {
	UserID       string `json:"user_id"`
	Email        string `json:"email"`
	IsNewUser    bool   `json:"is_new_user"`
	AuthMethod   string `json:"auth_method"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

// statePayload is stored in Redis during the authorization flow.
type statePayload struct {
	Slug         string `json:"slug"`
	CodeVerifier string `json:"code_verifier"`
	CreatedAt    int64  `json:"created_at"`
}

// Service orchestrates the OIDC login flow.
type Service struct {
	config      *OIDCConfig
	pool        *pgxpool.Pool
	redisClient *redis.Client
	// Cache of initialized OIDC providers keyed by slug
	providers map[string]*resolvedProvider
}

// resolvedProvider holds the runtime state for a configured provider.
type resolvedProvider struct {
	config   ProviderConfig
	provider *gooidc.Provider
	verifier *gooidc.IDTokenVerifier
	oauth2   oauth2.Config
}

// NewService creates a new OIDC service. It loads providers from the database,
// decrypts their client secrets, and eagerly resolves each provider's OIDC
// discovery document so that misconfiguration is caught at startup.
func NewService(config *OIDCConfig, pool *pgxpool.Pool, redisClient *redis.Client) (*Service, error) {
	if !config.Enabled {
		return nil, fmt.Errorf("oidc: service created with OIDC disabled")
	}

	svc := &Service{
		config:      config,
		pool:        pool,
		redisClient: redisClient,
		providers:   make(map[string]*resolvedProvider),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Load providers from database
	providerConfigs, err := LoadProviders(ctx, pool)
	if err != nil {
		return nil, fmt.Errorf("oidc: failed to load providers: %w", err)
	}

	for _, pc := range providerConfigs {
		if !pc.Enabled {
			log.Info().Str("slug", pc.Slug).Msg("OIDC provider disabled, skipping discovery")
			continue
		}

		// Decrypt client secret
		clientSecret, err := DecryptSecret(pc.ClientSecretEncrypted, config.SecretEncryptionKey)
		if err != nil {
			return nil, fmt.Errorf("oidc: failed to decrypt client secret for provider %q: %w", pc.Slug, err)
		}

		provider, err := gooidc.NewProvider(ctx, pc.IssuerURL)
		if err != nil {
			return nil, fmt.Errorf("oidc: discovery failed for provider %q (issuer=%s): %w", pc.Slug, pc.IssuerURL, err)
		}

		scopes := pc.Scopes
		if len(scopes) == 0 {
			scopes = config.DefaultScopes
		}
		if len(scopes) == 0 {
			scopes = []string{gooidc.ScopeOpenID, "profile", "email"}
		}

		verifier := provider.Verifier(&gooidc.Config{ClientID: pc.ClientID})

		svc.providers[pc.Slug] = &resolvedProvider{
			config:   pc,
			provider: provider,
			verifier: verifier,
			oauth2: oauth2.Config{
				ClientID:     pc.ClientID,
				ClientSecret: clientSecret,
				Endpoint:     provider.Endpoint(),
				Scopes:       scopes,
				// RedirectURL is set per-request in GetAuthorizationURL
			},
		}

		log.Info().Str("slug", pc.Slug).Str("issuer", pc.IssuerURL).Msg("OIDC provider initialized")
	}

	return svc, nil
}

// GetAuthorizationURL generates the OIDC authorization URL with PKCE and a random state token.
// The state and PKCE code verifier are persisted in Redis with a 10-minute TTL.
func (s *Service) GetAuthorizationURL(ctx context.Context, slug, redirectURL string) (authURL, state, codeVerifier string, err error) {
	rp, ok := s.providers[slug]
	if !ok {
		return "", "", "", ErrProviderNotFound
	}
	if !rp.config.Enabled {
		return "", "", "", ErrProviderDisabled
	}

	// SECURITY: never use the client-supplied redirect_uri verbatim. It must
	// exactly match an entry in the provider's allowlist (or the configured
	// global callback URL) to prevent authorization-code interception.
	if !s.redirectURIAllowed(rp.config, redirectURL) {
		return "", "", "", ErrRedirectURI
	}

	// Generate cryptographic state token
	stateBytes := make([]byte, 32)
	if _, err := rand.Read(stateBytes); err != nil {
		return "", "", "", fmt.Errorf("oidc: failed to generate state: %w", err)
	}
	state = base64.RawURLEncoding.EncodeToString(stateBytes)

	// Generate PKCE code verifier and challenge
	verifierBytes := make([]byte, pkceVerifierLen)
	if _, err := rand.Read(verifierBytes); err != nil {
		return "", "", "", fmt.Errorf("oidc: failed to generate PKCE verifier: %w", err)
	}
	codeVerifier = base64.RawURLEncoding.EncodeToString(verifierBytes)
	codeChallenge := computeS256Challenge(codeVerifier)

	// Persist state in Redis
	payload := statePayload{
		Slug:         slug,
		CodeVerifier: codeVerifier,
		CreatedAt:    time.Now().Unix(),
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", "", "", fmt.Errorf("oidc: failed to marshal state payload: %w", err)
	}

	redisCtx, cancel := context.WithTimeout(ctx, redisTimeout)
	defer cancel()

	key := stateKeyPrefix + state
	if err := s.redisClient.Set(redisCtx, key, payloadJSON, stateTTL).Err(); err != nil {
		return "", "", "", fmt.Errorf("oidc: failed to store state in Redis: %w", err)
	}

	// Build authorization URL with PKCE
	oauthCfg := rp.oauth2
	oauthCfg.RedirectURL = redirectURL

	authURL = oauthCfg.AuthCodeURL(
		state,
		oauth2.SetAuthURLParam("code_challenge", codeChallenge),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
	)

	return authURL, state, codeVerifier, nil
}

// HandleCallback exchanges the authorization code for tokens, verifies the ID token,
// maps (or creates) the user, and returns JWT tokens.
func (s *Service) HandleCallback(ctx context.Context, slug, code, state string) (*CallbackResult, error) {
	// Retrieve and validate state from Redis (atomic get+delete prevents replay)
	redisCtx, cancel := context.WithTimeout(ctx, redisTimeout)
	defer cancel()

	key := stateKeyPrefix + state
	payloadJSON, err := s.redisClient.GetDel(redisCtx, key).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return nil, ErrInvalidState
		}
		return nil, fmt.Errorf("oidc: failed to retrieve state from Redis: %w", err)
	}

	var payload statePayload
	if err := json.Unmarshal([]byte(payloadJSON), &payload); err != nil {
		return nil, fmt.Errorf("oidc: failed to unmarshal state payload: %w", err)
	}

	// Verify slug matches the one stored at authorize time
	if payload.Slug != slug {
		return nil, ErrInvalidState
	}

	rp, ok := s.providers[slug]
	if !ok {
		return nil, ErrProviderNotFound
	}

	// Exchange authorization code for OAuth2 token using PKCE verifier
	oauthCfg := rp.oauth2
	oauthToken, err := oauthCfg.Exchange(ctx, code,
		oauth2.SetAuthURLParam("code_verifier", payload.CodeVerifier),
	)
	if err != nil {
		log.Error().Err(err).Str("slug", slug).Msg("OIDC token exchange failed")
		return nil, fmt.Errorf("%w: %v", ErrTokenExchange, err)
	}

	// Extract and verify ID token
	rawIDToken, ok := oauthToken.Extra("id_token").(string)
	if !ok {
		return nil, fmt.Errorf("%w: missing id_token in token response", ErrIDTokenVerify)
	}

	idToken, err := rp.verifier.Verify(ctx, rawIDToken)
	if err != nil {
		log.Error().Err(err).Str("slug", slug).Msg("OIDC ID token verification failed")
		return nil, fmt.Errorf("%w: %v", ErrIDTokenVerify, err)
	}

	// Extract claims
	var claims struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return nil, fmt.Errorf("oidc: failed to parse ID token claims: %w", err)
	}

	if claims.Email == "" {
		return nil, ErrMissingEmail
	}

	// SECURITY (account-takeover hardening): the IdP MUST assert that it has
	// verified ownership of this email before we use it for anything. An
	// unverified email lets an attacker register an IdP account claiming a
	// victim's address. Reject unverified-email logins outright.
	if !claims.EmailVerified {
		return nil, ErrEmailNotVerified
	}

	claims.Email = strings.ToLower(strings.TrimSpace(claims.Email))

	// Enforce allowed domains if configured
	if len(rp.config.AllowedDomains) > 0 {
		emailDomain := emailDomain(claims.Email)
		if !domainAllowed(emailDomain, rp.config.AllowedDomains) {
			return nil, fmt.Errorf("oidc: email domain %q not in allowed domains for provider %q", emailDomain, slug)
		}
	}

	// Map user: look up by (provider_id, sub), or create
	result, err := s.mapUser(ctx, rp.config.ID, claims.Sub, claims.Email, claims.Name)
	if err != nil {
		return nil, err
	}

	return result, nil
}

// ListProviders returns all configured (enabled) providers with public metadata only.
func (s *Service) ListProviders(_ context.Context) ([]ProviderConfig, error) {
	var providers []ProviderConfig
	for _, rp := range s.providers {
		if rp.config.Enabled {
			// Return only public metadata — no secrets
			providers = append(providers, ProviderConfig{
				ID:             rp.config.ID,
				Slug:           rp.config.Slug,
				DisplayName:    rp.config.DisplayName,
				IssuerURL:      rp.config.IssuerURL,
				ClientID:       rp.config.ClientID,
				AllowedDomains: rp.config.AllowedDomains,
				Scopes:         rp.config.Scopes,
				Enabled:        true,
			})
		}
	}
	return providers, nil
}

// mapUser finds an existing user by federated OIDC identity, or creates a new
// dedicated user for that identity.
//
// SECURITY (account-takeover hardening): identities are linked ONLY by the
// immutable, provider-asserted pair (provider_id, oidc_subject). We never
// auto-attach an OIDC identity to a pre-existing account by email — doing so
// would let anyone who can get an IdP to assert a victim's email take over the
// victim's (e.g. SRP) account. Email is treated as non-authoritative metadata
// and is persisted only as a salted-free SHA-256 hash (email_hash), consistent
// with the SRP registration path; the plaintext address is never stored.
//
// It generates JWT tokens using the existing auth.GenerateTokenPair function.
func (s *Service) mapUser(ctx context.Context, providerID, sub, email, name string) (*CallbackResult, error) {
	var userID string
	var isNewUser bool

	// Check for an existing federated identity by (provider_id, oidc_subject) ONLY.
	err := s.pool.QueryRow(ctx,
		`SELECT user_id FROM oidc_identities WHERE provider_id = $1 AND oidc_subject = $2`,
		providerID, sub,
	).Scan(&userID)

	if err != nil {
		// No existing identity — create a NEW user dedicated to this identity.
		// We intentionally do NOT look up or merge into any account by email.
		userID = uuid.New().String()
		isNewUser = true

		emailHash := hashEmail(email)

		tx, err := s.pool.Begin(ctx)
		if err != nil {
			return nil, fmt.Errorf("%w: %v", ErrUserCreation, err)
		}
		defer tx.Rollback(ctx)

		// Create a brand-new user row. email_hash is UNIQUE; if a row with this
		// email_hash already exists (e.g. an SRP account), the insert fails and
		// we deliberately refuse rather than silently linking into that account.
		//
		// OIDC-only users have no SRP credentials: migration 014 made
		// srp_verifier/srp_salt NULLABLE and added the auth_method
		// discriminator, so we store NULL SRP fields and auth_method='oidc'
		// rather than empty-byte placeholders.
		_, err = tx.Exec(ctx,
			`INSERT INTO users (id, email_hash, srp_verifier, srp_salt, auth_method, created_at, updated_at)
			 VALUES ($1, $2, NULL, NULL, 'oidc', NOW(), NOW())`,
			userID, emailHash,
		)
		if err != nil {
			return nil, fmt.Errorf("%w: %v", ErrUserCreation, err)
		}

		// Link the federated identity. Store only the plaintext email here if at
		// all; oidc_email is the schema column. We persist the hash on the user
		// row; oidc_email is left NULL to avoid storing plaintext PII.
		_, err = tx.Exec(ctx,
			`INSERT INTO oidc_identities (id, provider_id, oidc_subject, user_id, linked_at, last_login_at)
			 VALUES ($1, $2, $3, $4, NOW(), NOW())
			 ON CONFLICT (provider_id, oidc_subject) DO UPDATE SET last_login_at = NOW()`,
			uuid.New().String(), providerID, sub, userID,
		)
		if err != nil {
			return nil, fmt.Errorf("%w: failed to create OIDC identity: %v", ErrUserCreation, err)
		}

		if err := tx.Commit(ctx); err != nil {
			return nil, fmt.Errorf("%w: commit failed: %v", ErrUserCreation, err)
		}

		log.Info().Str("user_id", userID).Msg("OIDC user created (new federated identity)")
	} else {
		// Existing federated identity — update last login on both rows.
		_, err := s.pool.Exec(ctx,
			`UPDATE users SET updated_at = NOW() WHERE id = $1`, userID,
		)
		if err != nil {
			log.Warn().Err(err).Str("user_id", userID).Msg("failed to update last login for OIDC user")
		}
		_, _ = s.pool.Exec(ctx,
			`UPDATE oidc_identities SET last_login_at = NOW() WHERE provider_id = $1 AND oidc_subject = $2`,
			providerID, sub,
		)

		log.Info().Str("user_id", userID).Msg("OIDC user logged in")
	}

	// Generate JWT tokens using existing auth infrastructure
	accessToken, refreshToken, err := auth.GenerateTokenPair(userID, "oidc")
	if err != nil {
		return nil, fmt.Errorf("oidc: failed to generate token pair: %w", err)
	}

	return &CallbackResult{
		UserID:       userID,
		Email:        email,
		IsNewUser:    isNewUser,
		AuthMethod:   "oidc",
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    900, // 15 minutes in seconds (matches accessTokenTTL)
	}, nil
}

// redirectURIAllowed reports whether the requested redirect_uri exactly matches
// an allowed value for the provider. The per-provider AllowedRedirectURIs list
// takes precedence; if it is empty we fall back to the configured global
// CallbackBaseURL. Matching is exact (no prefix/wildcard) to avoid open-redirect
// and code-interception bypasses.
func (s *Service) redirectURIAllowed(pc ProviderConfig, redirectURL string) bool {
	if redirectURL == "" {
		return false
	}
	allowlist := pc.AllowedRedirectURIs
	if len(allowlist) == 0 && s.config != nil && s.config.CallbackBaseURL != "" {
		allowlist = []string{s.config.CallbackBaseURL}
	}
	for _, allowed := range allowlist {
		if allowed == redirectURL {
			return true
		}
	}
	return false
}

// hashEmail returns the lowercase SHA-256 hex digest of an email address. This
// mirrors the SRP registration path (auth.hashEmail) so OIDC users are stored
// with the same email_hash representation and the plaintext email is never
// persisted. Caller is expected to have already normalized (lowercased/trimmed)
// the address.
func hashEmail(email string) string {
	h := sha256.Sum256([]byte(email))
	return hex.EncodeToString(h[:])
}

// computeS256Challenge computes the S256 PKCE code challenge from a verifier.
func computeS256Challenge(verifier string) string {
	h := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(h[:])
}

// emailDomain extracts the domain part from an email address.
func emailDomain(email string) string {
	parts := strings.SplitN(email, "@", 2)
	if len(parts) != 2 {
		return ""
	}
	return strings.ToLower(parts[1])
}

// domainAllowed checks whether the given domain is in the allowed list.
func domainAllowed(domain string, allowed []string) bool {
	for _, d := range allowed {
		if strings.EqualFold(domain, d) {
			return true
		}
	}
	return false
}
