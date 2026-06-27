// Package middleware provides HTTP middleware for cross-cutting concerns.
//
// Features:
//   - Rate limiting with distributed sliding-window (Redis Lua script)
//   - Per-IP and per-user rate limiting
//   - Stricter limits for authentication endpoints
//   - Graceful fallback to in-memory limiter when Redis unavailable
//   - Fail-closed behavior (denies traffic on Redis failure)
//
// PH1-FIX: Atomic Lua script for distributed rate limiting across instances.
// PH1-FIX: In-memory fallback rate limiter for Redis unavailability (fail-closed).
package middleware

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
)

// PH1-FIX: Atomic Lua script for distributed sliding-window rate limiting.
// Executes ZADD + ZREMRANGEBYSCORE + ZCARD + EXPIRE as a single atomic operation,
// preventing race conditions across multiple API instances.
const rateLimitLuaScript = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local expiry = tonumber(ARGV[5])

-- Add current request
redis.call('ZADD', key, now, member)

-- Remove expired entries
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)

-- Count requests in window
local count = redis.call('ZCARD', key)

-- Set TTL for auto-cleanup
redis.call('EXPIRE', key, expiry)

return count
`

// memoryRateLimiter provides in-memory fallback rate limiting when Redis is unavailable.
// Uses a simple token bucket approach with automatic cleanup of stale entries.
//
// PH1-FIX: In-memory fallback rate limiter with fail-closed behavior.
type memoryRateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
}

// bucket tracks request count and window start time for a single rate limit key.
type bucket struct {
	count       int64
	windowStart time.Time
}

var fallbackLimiter = &memoryRateLimiter{
	buckets: make(map[string]*bucket),
}

// checkMemoryRateLimit provides a fallback when Redis is unavailable.
// PH1-FIX: Fail-closed — denies requests when over limit even without Redis.
func (m *memoryRateLimiter) check(key string, limit int, window time.Duration) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	b, exists := m.buckets[key]
	if !exists || now.Sub(b.windowStart) > window {
		// New window or expired window — reset
		m.buckets[key] = &bucket{count: 1, windowStart: now}
		return true
	}

	b.count++
	return b.count <= int64(limit)
}

// cleanupStale removes expired buckets to prevent memory leaks.
// Called periodically from a background goroutine.
func (m *memoryRateLimiter) cleanupStale(maxAge time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	for key, b := range m.buckets {
		if now.Sub(b.windowStart) > maxAge {
			delete(m.buckets, key)
		}
	}
}

func init() {
	// PH1-FIX: Background cleanup of stale in-memory rate limit entries
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			fallbackLimiter.cleanupStale(10 * time.Minute)
		}
	}()
}

// RateLimitConfig holds configuration for multi-dimensional rate limiting.
//
// Fields:
//   - PerIP: Max requests per IP per window
//   - PerUser: Max requests per authenticated user per window
//   - Window: Sliding window duration (typically 1 minute)
//   - AuthEndpoints: Stricter limit for authentication endpoints
type RateLimitConfig struct {
	PerIP         int           // requests per window
	PerUser       int           // requests per window
	Window        time.Duration // sliding window
	AuthEndpoints int           // stricter limit for auth endpoints
}

// RateLimiter creates middleware for rate limiting with both IP and user-based limits.
// Uses Redis sorted sets for distributed sliding-window rate limiting across instances.
// Falls back to in-memory limiter (fail-closed) if Redis is unavailable.
func RateLimiter(redisClient *redis.Client, requestsPerMinute int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
			defer cancel()

			// Rate limit by IP
			ip := getClientIP(r)
			key := "ratelimit:ip:" + ip
			window := time.Minute

			if !checkRateLimit(ctx, redisClient, key, requestsPerMinute, window) {
				http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
				log.Warn().Str("ip", ip).Msg("rate limit exceeded (IP)")
				return
			}

			// Rate limit by user (if authenticated)
			userID, ok := r.Context().Value(ctxkeys.UserID).(string)
			if ok && userID != "" {
				userKey := "ratelimit:user:" + userID
				userLimit := 1000 // Higher limit for authenticated users

				if !checkRateLimit(ctx, redisClient, userKey, userLimit, window) {
					http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
					log.Warn().Str("user_id", userID).Msg("rate limit exceeded (User)")
					return
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}

// AuthRateLimiter creates a stricter rate limiter for authentication endpoints.
// Limit: 10 requests per minute per IP (prevents brute force attacks).
func AuthRateLimiter(redisClient *redis.Client) func(http.Handler) http.Handler {
	// Per-IP auth attempts allowed per minute. Configurable via
	// AUTH_RATE_LIMIT_PER_MIN (default 10) so test / full-stack-integration
	// environments — which legitimately drive many register/login calls from one
	// host — can raise the ceiling WITHOUT weakening the production default.
	authLimit := 10
	if v := os.Getenv("AUTH_RATE_LIMIT_PER_MIN"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			authLimit = n
		}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
			defer cancel()

			ip := getClientIP(r)
			key := "ratelimit:auth:" + ip
			window := time.Minute

			if !checkRateLimit(ctx, redisClient, key, authLimit, window) {
				w.Header().Set("Retry-After", "60")
				http.Error(w, "too many auth attempts", http.StatusTooManyRequests)
				log.Warn().Str("ip", ip).Msg("auth rate limit exceeded")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// checkRateLimit performs atomic sliding window rate limiting via Redis Lua script.
// PH1-FIX: Uses Lua script for atomic multi-instance enforcement.
// PH1-FIX: Falls back to in-memory limiter on Redis failure (fail-closed, not fail-open).
func checkRateLimit(ctx context.Context, redisClient *redis.Client, key string, limit int, window time.Duration) bool {
	now := time.Now()
	timestamp := float64(now.UnixMilli()) / 1000.0
	member := fmt.Sprintf("%d:%d", now.UnixNano(), now.UnixNano()%1000000)
	expiry := int64(window.Seconds()) * 2

	// PH1-FIX: Execute atomic Lua script for distributed rate limiting
	result, err := redisClient.Eval(ctx, rateLimitLuaScript, []string{key},
		timestamp,
		window.Seconds(),
		limit,
		member,
		expiry,
	).Int64()

	if err != nil {
		// H-6 FIX: Fail-closed behavior for rate limiting on Redis unavailability.
		// Auth-critical paths (login, register, password-reset) should deny all traffic.
		// For other paths, use expectedInstanceCount to divide limit proportionally.
		const expectedInstanceCount = 5

		// Check if this is an auth-critical path from the key name
		isAuthCriticalPath := false
		switch {
		case strings.Contains(key, "auth"):
			// Paths: ratelimit:auth:*, login, register, password-reset
			isAuthCriticalPath = true
		}

		if isAuthCriticalPath {
			// H-6 FIX: Auth endpoints fail-closed — deny all requests when Redis is down.
			log.Error().Err(err).Str("key", key).Msg("H-6 FIX: Redis rate limit failed for auth endpoint, denying request (fail-closed)")
			return false
		}

		log.Error().Err(err).Str("key", key).Msg("H-6 FIX: Redis rate limit failed, using in-memory fallback with proportional division")
		// H-6 FIX: Use expectedInstanceCount to estimate per-instance quota.
		// If limit is 100 req/min global and we expect 5 instances, each instance gets 20.
		// This prevents the "overshoot" problem where 5 instances × (100/2) = 250 req/min.
		fallbackLimit := limit / expectedInstanceCount
		if fallbackLimit < 1 {
			fallbackLimit = 1
		}
		return fallbackLimiter.check(key, fallbackLimit, window)
	}

	within := result <= int64(limit)

	if !within {
		log.Debug().
			Str("key", key).
			Int64("count", result).
			Int("limit", limit).
			Msg("rate limit exceeded")
	}

	return within
}

// NewRateLimiter creates a configurable rate limiter with custom thresholds and window.
// Enforces both IP-based and user-based rate limits.
func NewRateLimiter(redisClient *redis.Client, config RateLimitConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
			defer cancel()

			ip := getClientIP(r)

			// Check IP rate limit
			ipKey := "ratelimit:ip:" + ip
			if !checkRateLimit(ctx, redisClient, ipKey, config.PerIP, config.Window) {
				setRateLimitHeaders(w, config.Window)
				http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
				log.Warn().Str("ip", ip).Msg("IP rate limit exceeded")
				return
			}

			// Check user rate limit if authenticated
			userID, ok := r.Context().Value(ctxkeys.UserID).(string)
			if ok && userID != "" {
				userKey := "ratelimit:user:" + userID
				if !checkRateLimit(ctx, redisClient, userKey, config.PerUser, config.Window) {
					setRateLimitHeaders(w, config.Window)
					http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
					log.Warn().Str("user_id", userID).Msg("user rate limit exceeded")
					return
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}

// setRateLimitHeaders sets standard rate limit response headers
func setRateLimitHeaders(w http.ResponseWriter, window time.Duration) {
	retryAfter := strconv.Itoa(int(window.Seconds()))
	resetTime := time.Now().Add(window).Unix()

	w.Header().Set("X-RateLimit-Limit", "100")
	w.Header().Set("X-RateLimit-Remaining", "0")
	w.Header().Set("X-RateLimit-Reset", strconv.FormatInt(resetTime, 10))
	w.Header().Set("Retry-After", retryAfter)
}
