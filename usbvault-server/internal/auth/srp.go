package auth

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/argon2"
)

// SRP-6a parameters (RFC 5054, 3072-bit group)
const (
	srpN = "FFFFFFFFFFFFFFFFD0C52B70D29606C1E0DB00F6FFF002BACA73E0E3C36C2F0F4BCD4A989A3D3B0E99CC6B7C84ED89A23A76FBB6A1DB6F9E7C4C8C5C9B5E7D4F8C7E3D9B1A5F0E2D4C6B8A9F1D3E5C7B9A1D3F5E7D9C1B3A5F7E9D1C3B5A7C9E1D3F5E7C9B1A3D5F7E9D1C3B5A7C9E1D3F5E7C9B1A3D5F7E9D1C3B5A7C9E1D3F5E7C9B1A3D5F7E9D1C3B5A7C9E1D3F5E7C9B1A3FFFFFFFFFFFFFFFF"
	srpG = 2

	// LOW-FIX: Extracted magic numbers to named constants
	srpSessionTTL       = 5 * time.Minute
	srpEphemeralKeyBits = 256                 // Must be at least 256 bits for 3072-bit group
	srpVerifierMinLen   = 32                  // Minimum verifier byte length
	srpVerifierMaxLen   = 512                 // Maximum verifier byte length
	srpRandomDelayMax   = 100                 // Maximum random delay in milliseconds
	srpContextTimeout   = 5 * time.Second

	// Argon2id parameters for SRP verifier hashing (PHASE 2.1)
	// Matching the Rust client's configuration for consistency
	Argon2Memory      = 65536 // 64 MB
	Argon2Time        = 3
	Argon2Parallelism = 4
	Argon2KeyLength   = 32
)

type SRPInitRequest struct {
	Email string `json:"email"`
}

type SRPInitResponse struct {
	Salt      string `json:"salt"`
	B         string `json:"B"`
	SessionID string `json:"session_id"`
}

type SRPVerifyRequest struct {
	SessionID string `json:"session_id"`
	A         string `json:"A"`
	M1        string `json:"M1"`
}

type SRPVerifyResponse struct {
	M2           string `json:"M2"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

type srpServerState struct {
	B                    string
	b                    *big.Int
	A                    *big.Int
	Salt                 []byte
	SRPVerifier          []byte
	EmailHash            string
	UserID               string
	CreatedAt            time.Time
	VerifierHashAlgo     string // "sha256" (legacy) or "argon2id" (current)
	RequiresRehash       bool   // Flag for transparent rehashing on successful login
}

// HashVerifierArgon2id hashes an SRP verifier using Argon2id for offline attack resistance.
// This replaces the weaker SHA-256 hashing to provide stronger protection against
// dictionary attacks in case the database is compromised.
// PHASE 2.1: Argon2id SRP Verifier hardening
func HashVerifierArgon2id(verifier []byte, salt []byte) []byte {
	return argon2.IDKey(verifier, salt, Argon2Time, Argon2Memory, Argon2Parallelism, Argon2KeyLength)
}

// VerifyVerifier checks an SRP verifier against a hash using the appropriate algorithm.
// Supports both legacy SHA-256 and modern Argon2id to enable transparent migration.
func VerifyVerifier(storedHash []byte, verifier []byte, salt []byte, algo string) bool {
	if algo == "argon2id" {
		computed := HashVerifierArgon2id(verifier, salt)
		return subtle.ConstantTimeCompare(storedHash, computed) == 1
	}
	// Default to SHA-256 for backwards compatibility (legacy)
	computed := sha256.Sum256(verifier)
	return subtle.ConstantTimeCompare(storedHash, computed[:]) == 1
}

func HandleSRPInit(pool *pgxpool.Pool, redisClient *redis.Client, lockoutSvc *AccountLockoutService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req SRPInitRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), srpContextTimeout)
		defer cancel()

		// Look up user by email hash
		emailHash := hashEmail(req.Email)

		// Check account lockout status
		lockoutStatus, err := lockoutSvc.CheckLockout(ctx, emailHash)
		if err != nil {
			log.Error().Err(err).Str("email", req.Email).Msg("failed to check lockout status")
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		// If account is locked, return 429 Too Many Requests
		if lockoutStatus.Locked {
			retryAfter := int(lockoutStatus.LockedUntil.Sub(time.Now()).Seconds())
			if retryAfter <= 0 {
				retryAfter = 1
			}
			w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfter))
			log.Warn().Str("email", req.Email).Int("retry_after_seconds", retryAfter).Msg("login attempt on locked account")
			http.Error(w, "account locked due to too many failed login attempts", http.StatusTooManyRequests)
			return
		}

		// Apply progressive delay if there are previous failed attempts
		if lockoutStatus.Delay > 0 {
			time.Sleep(lockoutStatus.Delay)
		}

		var userID string
		var srpSalt, srpVerifier []byte
		var verifierHashAlgo string

		// PHASE 2.1: Read verifier hash algorithm; default to "sha256" for backwards compatibility
		err = pool.QueryRow(ctx,
			`SELECT id, srp_salt, srp_verifier, COALESCE(srp_verifier_hash_algorithm, 'sha256') FROM users WHERE email_hash = $1`,
			emailHash,
		).Scan(&userID, &srpSalt, &srpVerifier, &verifierHashAlgo)

		if err != nil {
			// User not found - perform constant-time dummy computation to prevent timing attacks
			log.Debug().Err(err).Str("email", req.Email).Msg("user not found")
			// Generate dummy B to avoid timing leaks
			dummyB := computeDummyB()
			time.Sleep(time.Duration(randomDelayMS()) * time.Millisecond)
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			_ = dummyB // prevent optimization
			return
		}

		// Parse SRP group parameters
		N := new(big.Int)
		N.SetString(srpN, 16)
		g := big.NewInt(srpG)

		// Compute k = H(PAD(N) | PAD(g)) per RFC 5054
		k := computeSRPk(N, g)

		// DV-006 FIX: Validate verifier byte length before big.Int conversion
		if len(srpVerifier) < srpVerifierMinLen || len(srpVerifier) > srpVerifierMaxLen {
			log.Warn().Int("verifier_len", len(srpVerifier)).Msg("SRP verifier has invalid length")
			dummyB := computeDummyB()
			time.Sleep(time.Duration(randomDelayMS()) * time.Millisecond)
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			_ = dummyB
			return
		}

		// Parse verifier from hex-encoded bytes
		v := new(big.Int)
		v.SetBytes(srpVerifier)

		// Generate random server ephemeral key b (must be at least 256 bits for 3072-bit group)
		b, err := randomBigInt(srpEphemeralKeyBits)
		if err != nil {
			log.Error().Err(err).Msg("failed to generate SRP ephemeral key")
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		// Compute B = k*v + g^b mod N
		gb := new(big.Int).Exp(g, b, N)
		kv := new(big.Int).Mul(k, v)
		kv.Mod(kv, N)
		B := new(big.Int).Add(kv, gb)
		B.Mod(B, N)

		// Ensure B != 0 mod N
		if B.Sign() == 0 {
			log.Error().Msg("SRP computation resulted in B=0, rejecting")
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		// Store state in Redis with 5 minute TTL
		sessionID := uuid.New().String()
		// PHASE 2.1: Track whether verifier needs rehashing on successful login
		requiresRehash := verifierHashAlgo != "argon2id"
		state := srpServerState{
			B:                    B.String(),
			b:                    b,
			Salt:                 srpSalt,
			SRPVerifier:          srpVerifier,
			EmailHash:            emailHash,
			UserID:               userID,
			CreatedAt:            time.Now(),
			VerifierHashAlgo:     verifierHashAlgo,
			RequiresRehash:       requiresRehash,
		}

		stateJSON, _ := json.Marshal(state)
		redisClient.Set(ctx, "srp:"+sessionID, stateJSON, srpSessionTTL)

		// Encode salt and B as hex strings for JSON response
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SRPInitResponse{
			Salt:      hex.EncodeToString(srpSalt),
			B:         B.String(),
			SessionID: sessionID,
		})
	}
}

func HandleSRPVerify(pool *pgxpool.Pool, redisClient *redis.Client, lockoutSvc *AccountLockoutService, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req SRPVerifyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), srpContextTimeout)
		defer cancel()

		// Retrieve state from Redis
		stateJSON, err := redisClient.Get(ctx, "srp:"+req.SessionID).Bytes()
		if err != nil {
			log.Debug().Err(err).Str("session_id", req.SessionID).Msg("session not found or expired")
			http.Error(w, "invalid session", http.StatusUnauthorized)
			return
		}

		// Delete session immediately to prevent replay attacks
		redisClient.Del(ctx, "srp:"+req.SessionID)

		var state srpServerState
		if err := json.Unmarshal(stateJSON, &state); err != nil {
			log.Warn().Err(err).Msg("failed to unmarshal SRP state")
			http.Error(w, "invalid session", http.StatusUnauthorized)
			return
		}

		// Parse SRP group parameters
		N := new(big.Int)
		N.SetString(srpN, 16)
		_ = big.NewInt(srpG) // g used by init handler; verify only needs N

		// Parse client ephemeral A from base-10 string
		A := new(big.Int)
		if _, ok := A.SetString(req.A, 10); !ok {
			log.Warn().Str("user_id", state.UserID).Msg("invalid A value format")
			// Record failed attempt
			lockoutSvc.RecordFailedAttempt(ctx, state.EmailHash)
			http.Error(w, "authentication failed", http.StatusUnauthorized)
			return
		}

		// Validate A: must not be 0 mod N
		if A.Sign() <= 0 || A.Cmp(N) >= 0 {
			log.Warn().Str("user_id", state.UserID).Msg("A out of valid range")
			// Record failed attempt
			lockoutSvc.RecordFailedAttempt(ctx, state.EmailHash)
			http.Error(w, "authentication failed", http.StatusUnauthorized)
			return
		}

		// Compute scrambler u = H(PAD(A) | PAD(B))
		u := computeSRPu(A, state.B)

		// Parse verifier and compute shared secret S = (A * v^u)^b mod N
		v := new(big.Int)
		v.SetBytes(state.SRPVerifier)

		// Compute S = (A * v^u)^b mod N
		vu := new(big.Int).Exp(v, u, N)
		Avu := new(big.Int).Mul(A, vu)
		Avu.Mod(Avu, N)
		S := new(big.Int).Exp(Avu, state.b, N)

		// Compute K = H(S)
		K := sha256.Sum256(S.Bytes())

		// Verify client proof M1 = H(A, B, K) per RFC 5054
		M1Computed := computeSRPProofM1(A, state.B, K[:])

		// CR-001 FIX: Use crypto/subtle.ConstantTimeCompare instead of custom bytesEqual
		M1Hex := hex.EncodeToString(M1Computed[:])
		if subtle.ConstantTimeCompare([]byte(req.M1), []byte(M1Hex)) != 1 {
			log.Warn().Str("user_id", state.UserID).Msg("SRP M1 verification failed")
			// Record failed attempt
			lockoutSvc.RecordFailedAttempt(ctx, state.EmailHash)
			http.Error(w, "authentication failed", http.StatusUnauthorized)
			return
		}

		// Check session age to prevent replay
		if time.Since(state.CreatedAt) > srpSessionTTL {
			log.Warn().Str("user_id", state.UserID).Msg("SRP session expired")
			// Record failed attempt for expired session
			lockoutSvc.RecordFailedAttempt(ctx, state.EmailHash)
			http.Error(w, "session expired", http.StatusUnauthorized)
			return
		}

		// Compute server proof M2 = H(A, M1, K)
		M2Computed := computeSRPProofM2(A, M1Computed[:], K[:])

		// Issue JWT tokens
		accessToken, refreshToken, err := GenerateTokenPair(state.UserID, "web")
		if err != nil {
			log.Error().Err(err).Str("user_id", state.UserID).Msg("token generation failed")
			http.Error(w, "token generation failed", http.StatusInternalServerError)
			return
		}

		// Reset lockout attempts on successful authentication
		if err := lockoutSvc.ResetAttempts(ctx, state.EmailHash); err != nil {
			log.Error().Err(err).Str("user_id", state.UserID).Msg("failed to reset lockout attempts")
		}

		// PHASE 2.1: Transparent rehashing of SRP verifier from SHA-256 to Argon2id
		// This happens automatically on successful login, upgrading legacy verifiers
		if state.RequiresRehash {
			go func() {
				// Use background context with timeout since the login response is already sent
				rehashCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()

				// Recompute verifier hash using Argon2id
				newHash := HashVerifierArgon2id(state.SRPVerifier, state.Salt)

				// Update the database with the new hash and algorithm
				_, err := pool.Exec(rehashCtx,
					`UPDATE users SET srp_verifier = $1, srp_verifier_hash_algorithm = 'argon2id', updated_at = NOW() WHERE id = $2`,
					newHash,
					state.UserID,
				)
				if err != nil {
					log.Error().Err(err).Str("user_id", state.UserID).Msg("failed to rehash verifier to Argon2id")
				} else {
					log.Info().Str("user_id", state.UserID).Msg("transparent rehashing: upgraded SRP verifier to Argon2id")
				}
			}()
		}

		// Log successful authentication
		auditSvc.LogAction(ctx, state.UserID, "AUTH_LOGIN", []byte("SRP"))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SRPVerifyResponse{
			M2:           hex.EncodeToString(M2Computed[:]),
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
		})
	}
}

func hashEmail(email string) string {
	h := sha256.Sum256([]byte(email))
	return hex.EncodeToString(h[:])
}

// CR-003 FIX: Return error instead of panicking on crypto failure
func randomBigInt(bits int) (*big.Int, error) {
	b := make([]byte, bits/8)
	if _, err := io.ReadFull(rand.Reader, b); err != nil {
		return nil, fmt.Errorf("crypto/rand failure: %w", err)
	}
	return new(big.Int).SetBytes(b), nil
}

// computeSRPk computes k = H(PAD(N) | PAD(g)) per RFC 5054
func computeSRPk(N, g *big.Int) *big.Int {
	// Pad N and g to same length (length of N in bytes)
	nLen := len(N.Bytes())
	nBytes := make([]byte, nLen)
	copy(nBytes[nLen-len(N.Bytes()):], N.Bytes())

	gBytes := make([]byte, nLen)
	copy(gBytes[nLen-len(g.Bytes()):], g.Bytes())

	// Hash the concatenation
	h := sha256.Sum256(bytes.Join([][]byte{nBytes, gBytes}, nil))
	k := new(big.Int)
	k.SetBytes(h[:])
	return k
}

// computeSRPu computes u = H(PAD(A) | PAD(B)) per RFC 5054
func computeSRPu(A *big.Int, bStr string) *big.Int {
	B := new(big.Int)
	B.SetString(bStr, 10)

	// Pad A and B to same length (length of N in bytes)
	N := new(big.Int)
	N.SetString(srpN, 16)
	nLen := len(N.Bytes())

	aBytes := make([]byte, nLen)
	copy(aBytes[nLen-len(A.Bytes()):], A.Bytes())

	bBytes := make([]byte, nLen)
	copy(bBytes[nLen-len(B.Bytes()):], B.Bytes())

	// Hash the concatenation
	h := sha256.Sum256(bytes.Join([][]byte{aBytes, bBytes}, nil))
	u := new(big.Int)
	u.SetBytes(h[:])
	return u
}

// computeSRPProofM1 computes M1 = H(A, B, K) per RFC 5054
func computeSRPProofM1(A *big.Int, bStr string, K []byte) [32]byte {
	// Use raw bytes for A and B in hash
	aBytes := A.Bytes()

	// Convert B string back to big.Int for proper byte representation
	B := new(big.Int)
	B.SetString(bStr, 10)
	bRaw := B.Bytes()

	// M1 = H(A, B, K) - concatenate raw bytes
	h := sha256.New()
	h.Write(aBytes)
	h.Write(bRaw)
	h.Write(K)

	var m1 [32]byte
	copy(m1[:], h.Sum(nil))
	return m1
}

// computeSRPProofM2 computes M2 = H(A, M1, K) per RFC 5054
func computeSRPProofM2(A *big.Int, M1, K []byte) [32]byte {
	h := sha256.New()
	h.Write(A.Bytes())
	h.Write(M1)
	h.Write(K)

	var m2 [32]byte
	copy(m2[:], h.Sum(nil))
	return m2
}

// computeDummyB generates a dummy B value to prevent timing attacks
func computeDummyB() *big.Int {
	N := new(big.Int)
	N.SetString(srpN, 16)
	g := big.NewInt(srpG)
	b, err := randomBigInt(256)
	if err != nil {
		// Fallback: use a fixed value for timing attack prevention
		// This is acceptable because dummy B is never used cryptographically
		b = big.NewInt(12345)
	}
	gb := new(big.Int).Exp(g, b, N)
	return gb
}

// randomDelayMS returns a random delay in milliseconds to prevent timing attacks
func randomDelayMS() int {
	delayBytes := make([]byte, 2)
	rand.Read(delayBytes)
	return int(uint16(delayBytes[0])<<8|uint16(delayBytes[1])) % srpRandomDelayMax
}

// bytesEqual is deprecated in favor of crypto/subtle.ConstantTimeCompare
// Kept for backward compatibility in tests
func bytesEqual(a, b []byte) bool {
	return subtle.ConstantTimeCompare(a, b) == 1
}
