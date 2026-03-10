// Package resilience provides fault tolerance patterns for distributed system interactions.
//
// Features:
//   - Circuit breaker pattern for preventing cascading failures
//   - State transitions: Closed (normal) -> Open (failing) -> HalfOpen (testing recovery) -> Closed
//   - Configurable failure thresholds and recovery timeouts
//   - Thread-safe operations with sync.Mutex
//
// SD-022 FIX: CircuitBreaker implements the circuit breaker pattern for resilience.
package resilience

import (
	"fmt"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// CircuitBreakerState represents the operational state of a circuit breaker.
// States: closed (normal operation), open (rejecting calls), half-open (testing recovery).
type CircuitBreakerState string

const (
	StateClosed   CircuitBreakerState = "closed"   // Normal operation
	StateOpen     CircuitBreakerState = "open"     // Failing, reject calls
	StateHalfOpen CircuitBreakerState = "half_open" // Testing recovery
)

// CircuitBreaker implements the circuit breaker pattern for fault tolerance.
// Prevents cascading failures by rejecting calls to failing services after threshold exceeded.
//
// Thread-safe using sync.Mutex. State transitions:
//   - Closed: Normal operation, calls pass through
//   - Open: Too many failures, calls rejected immediately
//   - HalfOpen: Timeout elapsed, testing if service recovered
//
// SD-022 FIX: Thread-safe circuit breaker implementation.
type CircuitBreaker struct {
	mu                  sync.Mutex
	state               CircuitBreakerState
	failureCount        int
	failureThreshold    int           // Default: 5 consecutive failures
	resetTimeout        time.Duration // Default: 30 seconds
	lastFailureTime     time.Time
	lastStateChangeTime time.Time
	name                string
}

// NewCircuitBreaker creates a new circuit breaker with default settings.
// Default threshold: 5 failures, reset timeout: 30 seconds.
func NewCircuitBreaker(name string) *CircuitBreaker {
	return &CircuitBreaker{
		state:            StateClosed,
		failureThreshold: 5,
		resetTimeout:     30 * time.Second,
		name:             name,
		lastStateChangeTime: time.Now(),
	}
}

// NewCircuitBreakerWithConfig creates a circuit breaker with custom failure threshold and reset timeout.
func NewCircuitBreakerWithConfig(name string, threshold int, resetTimeout time.Duration) *CircuitBreaker {
	return &CircuitBreaker{
		state:            StateClosed,
		failureThreshold: threshold,
		resetTimeout:     resetTimeout,
		name:             name,
		lastStateChangeTime: time.Now(),
	}
}

// Execute wraps an external service call with circuit breaker protection
// SD-022 FIX: Returns error immediately if circuit is Open, prevents cascading failures
func (cb *CircuitBreaker) Execute(fn func() error) error {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	// Check if we should transition to HalfOpen
	if cb.state == StateOpen {
		if time.Since(cb.lastStateChangeTime) > cb.resetTimeout {
			cb.state = StateHalfOpen
			cb.failureCount = 0
			log.Info().
				Str("circuit_breaker", cb.name).
				Str("state", string(StateHalfOpen)).
				Msg("SD-022 FIX: circuit breaker transitioning to half-open state")
		} else {
			// Still in open state, reject call immediately
			return fmt.Errorf("circuit breaker %s is open", cb.name)
		}
	}

	// Execute the function
	err := fn()

	// Handle success
	if err == nil {
		if cb.state == StateHalfOpen {
			// Successful call in half-open state means service recovered
			cb.state = StateClosed
			cb.failureCount = 0
			log.Info().
				Str("circuit_breaker", cb.name).
				Str("state", string(StateClosed)).
				Msg("SD-022 FIX: circuit breaker recovered, transitioning to closed state")
		}
		return nil
	}

	// Handle failure
	cb.failureCount++
	cb.lastFailureTime = time.Now()

	if cb.state == StateHalfOpen {
		// Failure in half-open means service is still down
		cb.state = StateOpen
		cb.lastStateChangeTime = time.Now()
		log.Warn().
			Str("circuit_breaker", cb.name).
			Str("state", string(StateOpen)).
			Msg("SD-022 FIX: circuit breaker transitioning back to open state after failed recovery attempt")
		return fmt.Errorf("circuit breaker %s is open after failed recovery: %w", cb.name, err)
	}

	// In Closed state, check if failure threshold exceeded
	if cb.failureCount >= cb.failureThreshold {
		cb.state = StateOpen
		cb.lastStateChangeTime = time.Now()
		log.Warn().
			Str("circuit_breaker", cb.name).
			Str("state", string(StateOpen)).
			Int("failure_count", cb.failureCount).
			Msg("SD-022 FIX: circuit breaker transitioning to open state after threshold exceeded")
		return fmt.Errorf("circuit breaker %s is open: failure threshold exceeded (%d/%d): %w",
			cb.name, cb.failureCount, cb.failureThreshold, err)
	}

	log.Debug().
		Str("circuit_breaker", cb.name).
		Int("failure_count", cb.failureCount).
		Int("threshold", cb.failureThreshold).
		Msg("SD-022 FIX: circuit breaker failure counted")

	return fmt.Errorf("circuit breaker %s error: %w", cb.name, err)
}

// GetState returns the current state of the circuit breaker (Closed, Open, HalfOpen).
func (cb *CircuitBreaker) GetState() CircuitBreakerState {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	return cb.state
}

// Reset manually resets the circuit breaker to closed state (emergency recovery).
func (cb *CircuitBreaker) Reset() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.state = StateClosed
	cb.failureCount = 0
	cb.lastStateChangeTime = time.Now()
	log.Info().
		Str("circuit_breaker", cb.name).
		Msg("SD-022 FIX: circuit breaker manually reset to closed state")
}

// GetMetrics returns current circuit breaker operational metrics for monitoring and debugging.
func (cb *CircuitBreaker) GetMetrics() map[string]interface{} {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	return map[string]interface{}{
		"state":               string(cb.state),
		"failure_count":       cb.failureCount,
		"failure_threshold":   cb.failureThreshold,
		"last_failure_time":   cb.lastFailureTime,
		"last_state_change":   cb.lastStateChangeTime,
	}
}
