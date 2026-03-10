package billing

import "errors"

var (
	ErrSubscriptionNotFound = errors.New("subscription not found")
	ErrSubscriptionInactive = errors.New("subscription is not active")
	// TD-010 FIX: Added validation error types
	ErrInvalidEmail = errors.New("invalid email format")
	ErrInvalidTier  = errors.New("invalid subscription tier")
)
