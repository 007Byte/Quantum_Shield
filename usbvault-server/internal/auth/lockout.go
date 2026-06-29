package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

// LockoutStatus represents the current lockout state of an account
type LockoutStatus struct {
	Locked      bool
	Delay       time.Duration
	Attempts    int
	LockedUntil time.Time
}

// lockoutData is the internal structure stored in Redis
// Note: locked_until and last_attempt are stored as Unix timestamps (seconds since epoch)
type lockoutData struct {
	Attempts    int   `json:"attempts"`
	LockedUntil int64 `json:"locked_until"` // Unix timestamp (seconds)
	LastAttempt int64 `json:"last_attempt"` // Unix timestamp (seconds)
}

// AccountLockoutService provides progressive delay and account lockout functionality
type AccountLockoutService struct {
	redis        *redis.Client
	maxAttempts  int
	lockDuration time.Duration
}

// NewAccountLockoutService creates a new lockout service with default configuration
func NewAccountLockoutService(redisClient *redis.Client) *AccountLockoutService {
	return &AccountLockoutService{
		redis:        redisClient,
		maxAttempts:  10,
		lockDuration: 15 * time.Minute,
	}
}

// CheckLockout checks the current lockout status for an account
// Returns the lockout status and any error
func (s *AccountLockoutService) CheckLockout(ctx context.Context, emailHash, clientIP string) (*LockoutStatus, error) {
	// HIGH-FIX: scope the lockout key to (emailHash + clientIP) so an off-path
	// attacker on a different IP cannot perpetually lock a victim's account by
	// firing failed SRP attempts at their email. Brute force from the victim's
	// OWN IP is still bounded by the per-IP AuthRateLimiter (10/min). Old
	// emailHash-only keys are abandoned and self-clean via their existing 30-min TTL.
	key := fmt.Sprintf("lockout:%s:%s", emailHash, clientIP)

	data, err := s.redis.Get(ctx, key).Result()
	if err == redis.Nil {
		// No lockout data found
		return &LockoutStatus{
			Locked:   false,
			Delay:    0,
			Attempts: 0,
		}, nil
	}
	if err != nil {
		return nil, err
	}

	var ld lockoutData
	if err := json.Unmarshal([]byte(data), &ld); err != nil {
		log.Warn().Err(err).Str("email_hash", emailHash).Msg("failed to unmarshal lockout data")
		return nil, err
	}

	// Check if lock has expired
	lockedUntilTime := time.Unix(ld.LockedUntil, 0)
	if time.Now().After(lockedUntilTime) && ld.LockedUntil > 0 {
		// Lock has expired, but keep the attempt count
		locked := false
		delay := s.GetProgressiveDelay(ld.Attempts)
		return &LockoutStatus{
			Locked:      locked,
			Delay:       delay,
			Attempts:    ld.Attempts,
			LockedUntil: lockedUntilTime,
		}, nil
	}

	// Account is locked if lockout expiry is in the future
	isLocked := ld.LockedUntil > 0 && time.Now().Before(lockedUntilTime)

	delay := s.GetProgressiveDelay(ld.Attempts)

	return &LockoutStatus{
		Locked:      isLocked,
		Delay:       delay,
		Attempts:    ld.Attempts,
		LockedUntil: time.Unix(ld.LockedUntil, 0),
	}, nil
}

// RecordFailedAttempt increments the failed attempt counter and locks the account if needed
// Uses a Lua script for atomic operations
func (s *AccountLockoutService) RecordFailedAttempt(ctx context.Context, emailHash, clientIP string) (*LockoutStatus, error) {
	key := fmt.Sprintf("lockout:%s:%s", emailHash, clientIP)

	// Lua script for atomic increment and lockout check
	script := redis.NewScript(`
local key = KEYS[1]
local max_attempts = tonumber(ARGV[1])
local lock_duration_seconds = tonumber(ARGV[2])
local current_time = tonumber(ARGV[3])

local data = redis.call('GET', key)
local lockout_data

if data == false then
  lockout_data = {attempts = 1, locked_until = 0, last_attempt = current_time}
else
  lockout_data = cjson.decode(data)
  lockout_data.attempts = lockout_data.attempts + 1
  lockout_data.last_attempt = current_time
end

if lockout_data.attempts >= max_attempts then
  lockout_data.locked_until = current_time + lock_duration_seconds
end

local json_data = cjson.encode(lockout_data)
redis.call('SET', key, json_data)
redis.call('EXPIRE', key, lock_duration_seconds * 2)

return json_data
`)

	lockDurationSeconds := int64(s.lockDuration.Seconds())
	currentTime := time.Now().Unix()

	result, err := script.Run(ctx, s.redis, []string{key}, s.maxAttempts, lockDurationSeconds, currentTime).Result()
	if err != nil {
		log.Error().Err(err).Str("email_hash", emailHash).Msg("failed to record failed attempt")
		return nil, err
	}

	var ld lockoutData
	if err := json.Unmarshal([]byte(result.(string)), &ld); err != nil {
		log.Warn().Err(err).Str("email_hash", emailHash).Msg("failed to unmarshal lockout data after increment")
		return nil, err
	}

	// Check if lock has expired: locked_until is a Unix timestamp, compare with current time
	isLocked := ld.LockedUntil > 0 && time.Unix(ld.LockedUntil, 0).After(time.Now())

	delay := s.GetProgressiveDelay(ld.Attempts)

	status := &LockoutStatus{
		Locked:      isLocked,
		Delay:       delay,
		Attempts:    ld.Attempts,
		LockedUntil: time.Unix(ld.LockedUntil, 0),
	}

	// Log lockout events
	if isLocked {
		log.Warn().
			Str("email_hash", emailHash).
			Int("attempts", ld.Attempts).
			Time("locked_until", time.Unix(ld.LockedUntil, 0)).
			Msg("account locked due to failed login attempts")
	} else if ld.Attempts >= s.maxAttempts-1 {
		log.Warn().
			Str("email_hash", emailHash).
			Int("attempts", ld.Attempts).
			Int("max_attempts", s.maxAttempts).
			Msg("failed login attempt, approaching lockout")
	}

	return status, nil
}

// ResetAttempts resets the failed attempt counter for an account (called on successful login)
func (s *AccountLockoutService) ResetAttempts(ctx context.Context, emailHash, clientIP string) error {
	key := fmt.Sprintf("lockout:%s:%s", emailHash, clientIP)

	if err := s.redis.Del(ctx, key).Err(); err != nil {
		log.Error().Err(err).Str("email_hash", emailHash).Msg("failed to reset lockout attempts")
		return err
	}

	log.Debug().Str("email_hash", emailHash).Msg("lockout attempts reset on successful login")
	return nil
}

// GetProgressiveDelay returns the progressive delay for a given number of attempts
// Formula: min(2^(attempts-1), 32) seconds
func (s *AccountLockoutService) GetProgressiveDelay(attempts int) time.Duration {
	if attempts <= 0 {
		return 0
	}

	// Calculate 2^(attempts-1), capped at 32 seconds
	delaySecs := math.Pow(2, float64(attempts-1))
	if delaySecs > 32 {
		delaySecs = 32
	}

	return time.Duration(int(delaySecs)) * time.Second
}
