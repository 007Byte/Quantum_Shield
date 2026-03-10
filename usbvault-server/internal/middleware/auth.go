package middleware

import (
	"context"
	"net"
	"net/http"
	"strings"
	"time"

	auth "github.com/usbvault/usbvault-server/internal/auth"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

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
				} else {
					// Check device fingerprint if present in token
					deviceFingerprint := r.Header.Get("X-Device-Fingerprint")
					if claims.DeviceFingerprint != "" && deviceFingerprint != "" {
						if claims.DeviceFingerprint != deviceFingerprint {
							log.Warn().Str("user_id", claims.UserID).Msg("device fingerprint mismatch - rejecting request")
							// Device fingerprint binding is enforced - reject with 401
							http.Error(w, "unauthorized", http.StatusUnauthorized)
							return
						}
					}

					// Inject user info into context
					ctx := context.WithValue(r.Context(), "user_id", claims.UserID)
					ctx = context.WithValue(ctx, "device_id", claims.DeviceID)
					ctx = context.WithValue(ctx, "token_type", claims.Type)
					ctx = context.WithValue(ctx, "jti", claims.JTI)
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
		_, ok := r.Context().Value("user_id").(string)
		if !ok {
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
			userID, ok := r.Context().Value("user_id").(string)
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

func RequireTier(requiredTier string, pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := r.Context().Value("user_id").(string)
			if !ok {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			// Query subscription tier from database
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			var tier string
			err := pool.QueryRow(ctx,
				`SELECT COALESCE(tier, 'individual') FROM subscriptions WHERE user_id = $1 AND status = 'active'`,
				userID,
			).Scan(&tier)

			if err != nil {
				log.Debug().Str("user_id", userID).Err(err).Msg("no active subscription found, using default tier")
				tier = "free"
			}

			// Tier hierarchy: enterprise > team > individual > free
			tierRanking := map[string]int{
				"enterprise":  3,
				"team":        2,
				"individual":  1,
				"free":        0,
			}

			requiredRanking := tierRanking[requiredTier]
			actualRanking := tierRanking[tier]

			if actualRanking < requiredRanking {
				log.Warn().Str("user_id", userID).Str("required_tier", requiredTier).Str("actual_tier", tier).Msg("insufficient tier")
				http.Error(w, "upgrade required", http.StatusPaymentRequired)
				return
			}

			log.Debug().Str("user_id", userID).Str("tier", tier).Str("required_tier", requiredTier).Msg("tier check passed")
			next.ServeHTTP(w, r)
		})
	}
}

func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header (from reverse proxy)
	if xForwardedFor := r.Header.Get("X-Forwarded-For"); xForwardedFor != "" {
		ips := strings.Split(xForwardedFor, ",")
		if len(ips) > 0 {
			return strings.TrimSpace(ips[0])
		}
	}

	// Check X-Real-IP header
	if xRealIP := r.Header.Get("X-Real-IP"); xRealIP != "" {
		return xRealIP
	}

	// Fall back to RemoteAddr, stripping port if present
	addr := r.RemoteAddr
	if host, _, err := net.SplitHostPort(addr); err == nil {
		return host
	}
	return addr
}
