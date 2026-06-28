package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	auth "github.com/usbvault/usbvault-server/internal/auth"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
)

// UserIDFromContext extracts the authenticated user ID from request context.
func UserIDFromContext(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(ctxkeys.UserID).(string)
	return id, ok
}

// DeviceIDFromContext extracts the device ID from request context.
func DeviceIDFromContext(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(ctxkeys.DeviceID).(string)
	return id, ok
}

// UserTierFromContext extracts the subscription tier from request context.
func UserTierFromContext(ctx context.Context) (string, bool) {
	tier, ok := ctx.Value(ctxkeys.UserTier).(string)
	return tier, ok
}

// AuthMiddleware validates JWT tokens and checks revocation status
// Injects user info into context if token is valid
func AuthMiddleware(redisClient *redis.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Extract JWT from Authorization header
			authHeader := r.Header.Get("Authorization")
			var tokenString string

			if authHeader != "" {
				parts := strings.SplitN(authHeader, " ", 2)
				if len(parts) == 2 && parts[0] == "Bearer" {
					tokenString = parts[1]
				}
			}

			// Validate token if present
			if tokenString != "" {
				claims, err := auth.ValidateTokenWithRevocation(redisClient, tokenString)
				if err != nil {
					log.Debug().Err(err).Msg("invalid or revoked token")
					// Continue without auth context - let RequireAuth handle it
				} else if claims.Type != "access" {
					// SECURITY: only an ACCESS token may authenticate API requests. A
					// refresh token (30-day TTL) or any other type must NOT grant access
					// to protected endpoints — the WebSocket path enforces this, and the
					// HTTP path must mirror it. We skip injecting identity so RequireAuth
					// returns 401 (token treated as unauthenticated here).
					log.Warn().Str("user_id", claims.UserID).Str("type", claims.Type).Msg("non-access token presented to protected endpoint - denying")
				} else {
					// SECURITY (fail-closed): a device-bound token (claims.DeviceFingerprint
					// set) MUST present a matching X-Device-Fingerprint header. The prior
					// check only enforced when the header was ALSO non-empty, so simply
					// OMITTING the header bypassed the binding entirely — a stolen
					// device-bound token then worked from any device. A missing OR
					// mismatched header is now rejected.
					deviceFingerprint := r.Header.Get("X-Device-Fingerprint")
					if claims.DeviceFingerprint != "" {
						if deviceFingerprint == "" || claims.DeviceFingerprint != deviceFingerprint {
							log.Warn().Str("user_id", claims.UserID).Msg("device fingerprint missing or mismatched - rejecting request")
							http.Error(w, "unauthorized", http.StatusUnauthorized)
							return
						}
					}

					// Inject user info into context using typed keys
					ctx := context.WithValue(r.Context(), ctxkeys.UserID, claims.UserID)
					ctx = context.WithValue(ctx, ctxkeys.DeviceID, claims.DeviceID)
					ctx = context.WithValue(ctx, ctxkeys.TokenType, claims.Type)
					ctx = context.WithValue(ctx, ctxkeys.JTI, claims.JTI)
					r = r.WithContext(ctx)

					log.Debug().Str("user_id", claims.UserID).Str("jti", claims.JTI).Msg("token validated")
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}

func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := UserIDFromContext(r.Context()); !ok {
			log.Debug().Msg("RequireAuth: user_id not found in context or wrong type")
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func RequireRole(role string, pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := UserIDFromContext(r.Context())
			if !ok {
				log.Debug().Msg("RequireRole: user_id not found in context or wrong type")
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			// Query user role from database
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			var userRole string
			err := pool.QueryRow(ctx,
				`SELECT role FROM users WHERE id = $1`,
				userID,
			).Scan(&userRole)

			if err != nil {
				log.Warn().Str("user_id", userID).Err(err).Msg("failed to get user role")
				http.Error(w, "authorization failed", http.StatusForbidden)
				return
			}

			// Check if user has required role
			if !hasRole(userRole, role) {
				log.Warn().Str("user_id", userID).Str("required_role", role).Str("actual_role", userRole).Msg("insufficient permissions")
				http.Error(w, "insufficient permissions", http.StatusForbidden)
				return
			}

			log.Debug().Str("user_id", userID).Str("role", userRole).Msg("role check passed")
			next.ServeHTTP(w, r)
		})
	}
}

// hasRole checks if userRole satisfies requiredRole
// Implements role hierarchy: admin > moderator > user
func hasRole(userRole, requiredRole string) bool {
	if userRole == requiredRole {
		return true
	}

	// Admin can do everything
	if userRole == "admin" {
		return true
	}

	// Moderator can do moderator/user tasks
	if userRole == "moderator" && requiredRole == "user" {
		return true
	}

	return false
}

// PH8-FIX: TierLimits defines resource limits for each subscription tier
type TierLimits struct {
	MaxVaults       int      `json:"max_vaults"`
	MaxStorageMB    int      `json:"max_storage_mb"`
	Algorithms      []string `json:"algorithms"`
	Sharing         bool     `json:"sharing"`
	AuditLogs       bool     `json:"audit_logs"`
	PrioritySupport bool     `json:"priority_support"`
}

// PH8-FIX: TierLimitsMap defines resource limits per tier for server-side enforcement
var TierLimitsMap = map[string]TierLimits{
	"free":       {MaxVaults: 1, MaxStorageMB: 100, Algorithms: []string{"aes-256-gcm"}, Sharing: false, AuditLogs: false, PrioritySupport: false},
	"individual": {MaxVaults: 5, MaxStorageMB: 10240, Algorithms: []string{"aes-256-gcm", "xchacha20", "ml-kem"}, Sharing: false, AuditLogs: false, PrioritySupport: false},
	"team":       {MaxVaults: 50, MaxStorageMB: 102400, Algorithms: []string{"aes-256-gcm", "xchacha20", "ml-kem"}, Sharing: true, AuditLogs: true, PrioritySupport: false},
	"enterprise": {MaxVaults: -1, MaxStorageMB: 1048576, Algorithms: []string{"aes-256-gcm", "xchacha20", "ml-kem"}, Sharing: true, AuditLogs: true, PrioritySupport: true},
}

// PH8-FIX: TierGateError is the JSON error response for tier gate denials
type TierGateError struct {
	Error        string `json:"error"`
	RequiredTier string `json:"required_tier"`
	CurrentTier  string `json:"current_tier"`
	Message      string `json:"message"`
}

// PH8-FIX: CompareTiers returns -1 if a < b, 0 if a == b, 1 if a > b
func CompareTiers(a, b string) int {
	ra := tierRanking[a]
	rb := tierRanking[b]
	if ra < rb {
		return -1
	}
	if ra > rb {
		return 1
	}
	return 0
}

// RequireTier creates middleware that checks subscription tier before allowing access.
// PH8-FIX: Enhanced with X-Required-Tier/X-Current-Tier headers and JSON error response.
func RequireTier(requiredTier string, pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := UserIDFromContext(r.Context())
			if !ok {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			// Query subscription tier from database
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			var tier string
			err := pool.QueryRow(ctx,
				`SELECT COALESCE(tier, 'free') FROM subscriptions WHERE user_id = $1 AND status = 'active'`,
				userID,
			).Scan(&tier)

			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					log.Debug().Str("user_id", userID).Msg("no active subscription — free tier")
				} else {
					// M-4: do not silently mask a real DB error as "free". Log loudly
					// (alerting); still fail-closed to free so a transient blip can never
					// grant a higher tier.
					log.Error().Err(err).Str("user_id", userID).Str("required_tier", requiredTier).
						Msg("M-4: tier lookup failed — denying (fail-closed to free)")
				}
				tier = "free"
			}

			// PH8-FIX: Always set tier headers for observability
			w.Header().Set("X-Required-Tier", requiredTier)
			w.Header().Set("X-Current-Tier", tier)

			requiredRank := tierRanking[requiredTier]
			actualRank := tierRanking[tier]

			if actualRank < requiredRank {
				log.Warn().Str("user_id", userID).Str("required_tier", requiredTier).Str("actual_tier", tier).Msg("insufficient tier")
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(TierGateError{
					Error:        "insufficient_tier",
					RequiredTier: requiredTier,
					CurrentTier:  tier,
					Message:      fmt.Sprintf("This endpoint requires %s tier or higher. Your current tier is %s.", requiredTier, tier),
				})
				return
			}

			// PH8-FIX: Inject tier into context for downstream handlers
			ctx2 := context.WithValue(r.Context(), ctxkeys.UserTier, tier)
			log.Debug().Str("user_id", userID).Str("tier", tier).Str("required_tier", requiredTier).Msg("tier check passed")
			next.ServeHTTP(w, r.WithContext(ctx2))
		})
	}
}

// M-6: forwarding headers (X-Forwarded-For / X-Real-IP) are only trustworthy when
// the request actually arrived from one of our reverse proxies; a direct client can
// otherwise spoof its source IP, which is used for rate-limit / lockout keying and
// audit. The trusted set is configured via TRUSTED_PROXY_CIDRS (comma-separated,
// e.g. "10.0.0.0/8,127.0.0.1/32"). When unset/empty, NO forwarding header is trusted
// and the immediate peer (RemoteAddr) is authoritative.
func parseTrustedProxyCIDRs() []*net.IPNet {
	var cidrs []*net.IPNet
	for _, part := range strings.Split(os.Getenv("TRUSTED_PROXY_CIDRS"), ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if _, ipnet, err := net.ParseCIDR(part); err == nil {
			cidrs = append(cidrs, ipnet)
		}
	}
	return cidrs
}

// remoteIsTrustedProxy reports whether the immediate peer (r.RemoteAddr) is within
// the configured trusted-proxy CIDR set.
func remoteIsTrustedProxy(remoteAddr string) bool {
	cidrs := parseTrustedProxyCIDRs()
	if len(cidrs) == 0 {
		return false
	}
	host := remoteAddr
	if h, _, err := net.SplitHostPort(remoteAddr); err == nil {
		host = h
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	for _, n := range cidrs {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

func getClientIP(r *http.Request) string {
	// Only honor client-supplied forwarding headers when the immediate peer is a
	// configured trusted proxy; otherwise RemoteAddr is authoritative and the headers
	// are ignored to prevent source-IP spoofing (M-6).
	if remoteIsTrustedProxy(r.RemoteAddr) {
		// H-5: use the RIGHTMOST non-empty X-Forwarded-For entry — the one added by
		// the closest (trusted) proxy, not the client's self-claimed leftmost value.
		if xForwardedFor := r.Header.Get("X-Forwarded-For"); xForwardedFor != "" {
			ips := strings.Split(xForwardedFor, ",")
			for i := len(ips) - 1; i >= 0; i-- {
				if trimmed := strings.TrimSpace(ips[i]); trimmed != "" {
					return trimmed
				}
			}
		}
		if xRealIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); xRealIP != "" {
			return xRealIP
		}
	}

	// Fall back to RemoteAddr, stripping port if present.
	addr := r.RemoteAddr
	if host, _, err := net.SplitHostPort(addr); err == nil {
		return host
	}
	return addr
}
