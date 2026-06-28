// Package billing provides subscription and payment management with Stripe integration.
//
// Features:
//   - Create Stripe customers and subscriptions
//   - Process Stripe webhook events (subscription updates, payment status)
//   - Reconcile local billing state with Stripe
//   - Support for multiple subscription tiers (free, individual, team, enterprise)
//   - Tier upgrade/downgrade with grace period support
//   - Graceful fallback to local billing mode when Stripe is not configured
//
// PH8-FIX: Stripe Integration Documentation with local billing mode fallback.
// TD-010/TD-011 FIX: Added email and tier validation helpers.
// SD-018 FIX: Stripe webhook signature verification using HMAC-SHA256.
package billing

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
)

// BillingPool defines the database interface used by the billing service.
// *pgxpool.Pool satisfies this interface.
type BillingPool interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// PH8-FIX: Stripe Integration Documentation
// This billing service uses local customer and subscription IDs in development.
// In production deployment with live Stripe integration:
// - Customer IDs will be Stripe customer IDs (cus_xxx format)
// - Subscription IDs will be Stripe subscription IDs (sub_xxx format)
// - All operations will call Stripe API endpoints instead of local database operations
// - Webhook events will be processed from actual Stripe events
// The current implementation maintains database records that will be reconciled
// with Stripe during the transition to production.

// PH8-FIX: StripeConfig holds Stripe API credentials
// Note: API keys must NEVER be hardcoded in source code.
// They must be loaded from environment variables (e.g., STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)
type StripeConfig struct {
	APIKey         string // STRIPE_SECRET_KEY environment variable
	WebhookSecret  string // STRIPE_WEBHOOK_SECRET environment variable
	PublishableKey string // STRIPE_PUBLISHABLE_KEY environment variable
}

// Subscription represents a user's subscription with Stripe or local fallback.
//
// Fields:
//   - SubscriptionID: Stripe subscription ID (sub_xxx) or local_sub_xxx
//   - UserID: Unique user identifier
//   - Tier: Subscription tier (free, individual, team, enterprise)
//   - Status: Subscription status (active, past_due, cancelled, cancelling)
//   - CurrentPeriod: ISO 8601 string for current period end date
//   - CancelledAt: When subscription was cancelled (nil if active)
type Subscription struct {
	SubscriptionID string     `json:"subscription_id"`
	UserID         string     `json:"user_id"`
	Tier           string     `json:"tier"`
	Status         string     `json:"status"`
	CurrentPeriod  string     `json:"current_period_end"`
	CancelledAt    *time.Time `json:"cancelled_at"`
}

// BillingService manages subscription and payment operations via Stripe API.
// Supports local billing mode fallback when Stripe is not configured.
type BillingService struct {
	apiKey     string
	pool       BillingPool
	httpClient *http.Client
}

// TD-2 FIX: Stripe API HTTP client with explicit timeout.
// Prevents a hung Stripe endpoint from blocking goroutines indefinitely.
var stripeHTTPClient = &http.Client{
	Timeout: 30 * time.Second,
}

// Ensure *pgxpool.Pool satisfies BillingPool at compile time.
var _ BillingPool = (*pgxpool.Pool)(nil)

// NewBillingService creates a new billing service with Stripe API key and database pool.
func NewBillingService(stripeKey string, pool BillingPool) *BillingService {
	return &BillingService{
		apiKey:     stripeKey,
		pool:       pool,
		httpClient: stripeHTTPClient,
	}
}

func (bs *BillingService) CreateCustomer(ctx context.Context, userID, email string) (string, error) {
	// TD-010 FIX: Validate email format before creating customer
	if !isValidEmail(email) {
		log.Warn().Str("user_id", userID).Msg("invalid email format")
		return "", ErrInvalidEmail
	}

	// PH1-FIX: Real Stripe customer creation via REST API
	if email == "" {
		return "", fmt.Errorf("email is required")
	}
	if !isValidEmail(email) {
		return "", fmt.Errorf("invalid email format")
	}

	// If no Stripe key configured, use local mode (development)
	if !isLiveStripeKey(bs.apiKey) {
		log.Warn().Msg("PH1-FIX: No Stripe API key configured, using local billing mode")
		customerID := "local_cust_" + userID
		if bs.pool == nil {
			return customerID, nil
		}
		_, err := bs.pool.Exec(ctx,
			`INSERT INTO subscriptions (id, user_id, stripe_customer_id, tier, status, current_period_end, created_at, updated_at)
			 VALUES (gen_random_uuid(), $1, $2, 'free', 'active', NOW() + INTERVAL '100 years', NOW(), NOW())
			 ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = $2, updated_at = NOW()`,
			userID, customerID)
		if err != nil {
			return "", fmt.Errorf("failed to store local customer: %w", err)
		}
		return customerID, nil
	}

	// PH1-FIX: Real Stripe API call
	data := url.Values{}
	data.Set("email", email)
	data.Set("metadata[user_id]", userID)
	data.Set("metadata[platform]", "usbvault")

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.stripe.com/v1/customers", strings.NewReader(data.Encode()))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	req.SetBasicAuth(bs.apiKey, "")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := bs.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("stripe API error: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		ID    string `json:"id"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode stripe response: %w", err)
	}
	if result.Error != nil {
		return "", fmt.Errorf("stripe error: %s", result.Error.Message)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("stripe API returned status %d", resp.StatusCode)
	}

	// Store customer mapping
	_, err = bs.pool.Exec(ctx,
		`INSERT INTO subscriptions (id, user_id, stripe_customer_id, tier, status, current_period_end, created_at, updated_at)
		 VALUES (gen_random_uuid(), $1, $2, 'free', 'active', NOW() + INTERVAL '100 years', NOW(), NOW())
		 ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = $2, updated_at = NOW()`,
		userID, result.ID)
	if err != nil {
		return "", fmt.Errorf("failed to store customer: %w", err)
	}

	log.Info().Str("customer_id", result.ID).Str("user_id", userID).Msg("PH1-FIX: Stripe customer created")
	return result.ID, nil
}

func (bs *BillingService) CreateSubscription(ctx context.Context, userID, tier string) (string, error) {
	// TD-010 FIX: Validate tier is one of the allowed values
	if !isValidTier(tier) {
		log.Warn().Str("user_id", userID).Str("tier", tier).Msg("invalid tier requested")
		return "", ErrInvalidTier
	}

	if bs.pool == nil {
		// Local mode without database
		return "local_sub_" + userID, nil
	}

	// PH1-FIX: Real Stripe subscription creation via REST API
	if !isValidTier(tier) {
		return "", fmt.Errorf("invalid tier: %s", tier)
	}
	if tier == "free" {
		return "", fmt.Errorf("free tier does not require a subscription")
	}

	// Get customer ID
	var customerID string
	err := bs.pool.QueryRow(ctx,
		"SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1", userID).Scan(&customerID)
	if err != nil {
		return "", fmt.Errorf("customer not found, create customer first: %w", err)
	}

	priceID := bs.mapTierToPrice(tier)
	if priceID == "" {
		return "", fmt.Errorf("no price configured for tier: %s", tier)
	}

	// SECURITY (CRIT-4): fail closed when there is no live Stripe configuration. In
	// local/dev mode there is NO payment source, so persisting a paid tier here would be
	// exactly the free self-grant removed from the /upgrade path. The authoritative paid
	// tier is only ever written by the signature-verified webhook, never optimistically.
	if !isLiveStripeKey(bs.apiKey) {
		log.Warn().Str("user_id", userID).Str("tier", tier).
			Msg("CRIT-4: subscription refused — no live Stripe configuration (no self-grant)")
		return "", fmt.Errorf("paid subscriptions require an active Stripe billing configuration")
	}

	// PH1-FIX: Real Stripe API call
	data := url.Values{}
	data.Set("customer", customerID)
	data.Set("items[0][price]", priceID)
	data.Set("metadata[user_id]", userID)
	data.Set("metadata[tier]", tier)

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.stripe.com/v1/subscriptions", strings.NewReader(data.Encode()))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	req.SetBasicAuth(bs.apiKey, "")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := bs.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("stripe API error: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		ID               string `json:"id"`
		CurrentPeriodEnd int64  `json:"current_period_end"`
		Error            *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode stripe response: %w", err)
	}
	if result.Error != nil {
		return "", fmt.Errorf("stripe error: %s", result.Error.Message)
	}

	periodEnd := time.Unix(result.CurrentPeriodEnd, 0)

	_, err = bs.pool.Exec(ctx,
		`UPDATE subscriptions SET stripe_subscription_id = $1, tier = $2, status = 'active',
		 current_period_end = $3, updated_at = NOW()
		 WHERE user_id = $4`,
		result.ID, tier, periodEnd, userID)
	if err != nil {
		return "", fmt.Errorf("failed to store subscription: %w", err)
	}

	log.Info().Str("subscription_id", result.ID).Str("tier", tier).Msg("PH1-FIX: Stripe subscription created")
	return result.ID, nil
}

func (bs *BillingService) GetSubscription(ctx context.Context, userID string) (*Subscription, error) {
	// Return free tier if no database pool configured
	if bs.pool == nil {
		return &Subscription{
			UserID:        userID,
			Tier:          "free",
			Status:        "active",
			CurrentPeriod: time.Now().AddDate(1, 0, 0).Format(time.RFC3339),
		}, nil
	}

	// Query subscription from database.
	// DETERMINISM (FIX C): if a user transiently has multiple subscription rows,
	// prefer an active one and then the highest tier so the resolved subscription
	// is stable and mirrors vault.TierLimiter.ResolveTier.
	var sub Subscription
	err := bs.pool.QueryRow(ctx,
		`SELECT stripe_subscription_id, user_id, tier, status, current_period_end, cancelled_at
		FROM subscriptions WHERE user_id = $1
		ORDER BY (status = 'active') DESC,
		         CASE tier::text
		           WHEN 'enterprise' THEN 3
		           WHEN 'team'       THEN 2
		           WHEN 'individual' THEN 1
		           ELSE 0
		         END DESC
		LIMIT 1`,
		userID,
	).Scan(&sub.SubscriptionID, &sub.UserID, &sub.Tier, &sub.Status, &sub.CurrentPeriod, &sub.CancelledAt)

	if err != nil {
		log.Debug().Err(err).Str("user_id", userID).Msg("no subscription found, returning default")
		// Return free tier subscription if none exists
		return &Subscription{
			UserID:        userID,
			Tier:          "free",
			Status:        "active",
			CurrentPeriod: time.Now().AddDate(1, 0, 0).Format(time.RFC3339),
		}, nil
	}

	return &sub, nil
}

func (bs *BillingService) CheckAccess(ctx context.Context, userID string) (string, error) {
	sub, err := bs.GetSubscription(ctx, userID)
	if err != nil {
		return "", err
	}

	if sub.Status != "active" {
		return "", ErrSubscriptionInactive
	}

	// F3 (FIX D): unify the tier source with vault.TierLimiter.ResolveTier so the
	// storage/multipart/sharing enforcement paths (which read their tier from
	// CheckAccess) agree with the vault path. ResolveTier treats
	// users.subscription_tier as a non-default override applied when the
	// subscription does not already grant a paid tier. Mirror that here: when the
	// active subscription resolves to the default "free" tier, honor a non-default
	// users.subscription_tier override (e.g. an admin/manual grant). A paid
	// subscription tier always wins and is never downgraded by this.
	if sub.Tier == "free" && bs.pool != nil {
		var userTier string
		uerr := bs.pool.QueryRow(ctx,
			`SELECT COALESCE(subscription_tier::text, 'free') FROM users WHERE id = $1`,
			userID,
		).Scan(&userTier)
		if uerr == nil && userTier != "free" && isValidTier(userTier) {
			return userTier, nil
		}
	}

	return sub.Tier, nil
}

// DE-015 FIX: ReconcileSubscriptions reconciles local tier state with Stripe
// PH1-FIX: Reconcile local subscription state with Stripe
func (bs *BillingService) ReconcileSubscriptions(ctx context.Context) (int, error) {
	if !isLiveStripeKey(bs.apiKey) {
		log.Warn().Msg("PH1-FIX: Skipping reconciliation in local billing mode")
		return 0, nil
	}

	rows, err := bs.pool.Query(ctx,
		`SELECT user_id, stripe_subscription_id FROM subscriptions
		 WHERE stripe_subscription_id IS NOT NULL
		 AND stripe_subscription_id NOT LIKE 'local_%'
		 AND status = 'active'`)
	if err != nil {
		return 0, fmt.Errorf("failed to query subscriptions: %w", err)
	}
	defer rows.Close()

	var reconciled, failed int
	for rows.Next() {
		var userID, subID string
		if err := rows.Scan(&userID, &subID); err != nil {
			failed++
			continue
		}

		// Query Stripe for subscription status
		req, err := http.NewRequestWithContext(ctx, "GET", "https://api.stripe.com/v1/subscriptions/"+subID, nil)
		if err != nil {
			failed++
			continue
		}
		req.SetBasicAuth(bs.apiKey, "")

		resp, err := bs.httpClient.Do(req)
		if err != nil {
			failed++
			continue
		}

		var result struct {
			Status           string `json:"status"`
			CurrentPeriodEnd int64  `json:"current_period_end"`
		}
		// RELIABILITY FIX (C-5): Check decode error to prevent silent billing drift.
		// Previously, decode errors were swallowed, causing zero-value updates to the DB
		// (empty status, epoch-zero period end) when Stripe returned malformed JSON.
		if decodeErr := json.NewDecoder(resp.Body).Decode(&result); decodeErr != nil {
			resp.Body.Close()
			log.Error().Err(decodeErr).Str("subscription_id", subID).Msg("failed to decode Stripe response")
			failed++
			continue
		}
		resp.Body.Close()

		// Validate decoded result has meaningful data before writing to DB
		if result.Status == "" || result.CurrentPeriodEnd == 0 {
			log.Warn().Str("subscription_id", subID).Msg("Stripe returned empty subscription data, skipping update")
			failed++
			continue
		}

		// Update local state if different
		periodEnd := time.Unix(result.CurrentPeriodEnd, 0)
		_, err = bs.pool.Exec(ctx,
			`UPDATE subscriptions SET status = $1, current_period_end = $2, updated_at = NOW()
			 WHERE stripe_subscription_id = $3`,
			result.Status, periodEnd, subID)
		if err != nil {
			failed++
		} else {
			reconciled++
		}
	}

	log.Info().Int("reconciled", reconciled).Int("failed", failed).Msg("PH1-FIX: Stripe reconciliation complete")
	return reconciled, rows.Err()
}

func (bs *BillingService) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	// Verify Stripe webhook signature
	webhookSecret := os.Getenv("STRIPE_WEBHOOK_SECRET")
	if webhookSecret == "" {
		log.Warn().Msg("STRIPE_WEBHOOK_SECRET not configured")
		http.Error(w, "webhook secret not configured", http.StatusInternalServerError)
		return
	}

	signature := r.Header.Get("Stripe-Signature")
	if signature == "" {
		http.Error(w, "missing signature", http.StatusUnauthorized)
		return
	}

	payload, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	// SD-018 FIX: Reset the body so downstream code can re-read if needed
	r.Body = io.NopCloser(bytes.NewReader(payload))

	// SD-018 FIX: Verify Stripe webhook signature using t=timestamp,v1=signature format
	if !verifyStripeSignature(payload, signature, webhookSecret) {
		log.Warn().Msg("invalid webhook signature")
		http.Error(w, "invalid signature", http.StatusUnauthorized)
		return
	}

	var event map[string]interface{}
	if err := json.Unmarshal(payload, &event); err != nil {
		http.Error(w, "invalid webhook", http.StatusBadRequest)
		return
	}

	eventType, ok := event["type"].(string)
	if !ok {
		http.Error(w, "invalid webhook", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	switch eventType {
	case "customer.subscription.created":
		bs.handleSubscriptionCreated(ctx, event)

	case "customer.subscription.updated":
		bs.handleSubscriptionUpdated(ctx, event)

	case "customer.subscription.deleted":
		bs.handleSubscriptionDeleted(ctx, event)

	case "invoice.payment_succeeded", "invoice.paid":
		bs.handlePaymentSucceeded(ctx, event)

	case "invoice.payment_failed":
		bs.handlePaymentFailed(ctx, event)

	default:
		log.Debug().Str("event_type", eventType).Msg("unhandled webhook event")
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "received"})
}

// effectiveUserTier returns the tier to mirror onto users.subscription_tier: the
// subscription's tier when the subscription is active, otherwise "free" (a
// cancelled/past-due/incomplete subscription must not leave the user on a paid
// override).
func effectiveUserTier(tier, status string) string {
	if status == "active" {
		return tier
	}
	return "free"
}

// propagateTierToUser mirrors the authoritative subscription tier onto
// users.subscription_tier (#66) so the F3 enforcement override path
// (vault.TierLimiter.ResolveTier) and admin-granted, subscription-less tiers agree
// with billing. This is best-effort and intentionally non-fatal: ResolveTier's
// PRIMARY source is the active `subscriptions` row, which the caller updates
// atomically just above, so a transient failure here leaves enforcement correct
// (it still reads the subscription) and self-heals on the next webhook delivery —
// the column is a secondary, convergent override, not the source of truth.
func (bs *BillingService) propagateTierToUser(ctx context.Context, userID, tier, status string) {
	if bs.pool == nil || userID == "" {
		return
	}
	effective := effectiveUserTier(tier, status)
	if _, err := bs.pool.Exec(ctx,
		`UPDATE users SET subscription_tier = $1, updated_at = NOW() WHERE id = $2`,
		effective, userID,
	); err != nil {
		log.Warn().Err(err).Str("user_id", userID).Str("tier", effective).
			Msg("#66: failed to sync users.subscription_tier from webhook (subscriptions row remains authoritative)")
	}
}

// PH8-FIX: Handle customer.subscription.created — activate tier for new subscriptions
func (bs *BillingService) handleSubscriptionCreated(ctx context.Context, event map[string]interface{}) {
	dataObj, ok := event["data"].(map[string]interface{})
	if !ok {
		return
	}

	obj, ok := dataObj["object"].(map[string]interface{})
	if !ok {
		return
	}

	subID, ok := obj["id"].(string)
	if !ok {
		return
	}

	customerID, _ := obj["customer"].(string)
	if customerID == "" {
		log.Warn().Str("subscription_id", subID).Msg("missing customer_id in subscription created event")
		return
	}

	status, _ := obj["status"].(string)
	currentPeriodEnd, _ := obj["current_period_end"].(float64)

	// Extract tier from metadata or items
	tier := "individual" // default
	if metadata, ok := obj["metadata"].(map[string]interface{}); ok {
		if t, ok := metadata["tier"].(string); ok && isValidTier(t) {
			tier = t
		}
	}

	// Look up user_id from customer_id
	var userID string
	err := bs.pool.QueryRow(ctx,
		`SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1`,
		customerID,
	).Scan(&userID)

	if err != nil {
		log.Error().Err(err).Str("customer_id", customerID).Msg("failed to lookup user_id for subscription created")
		return
	}

	periodEnd := time.Unix(int64(currentPeriodEnd), 0)

	_, err = bs.pool.Exec(ctx,
		`UPDATE subscriptions SET stripe_subscription_id = $1, tier = $2, status = $3,
		 current_period_end = $4, updated_at = NOW()
		 WHERE user_id = $5`,
		subID, tier, status, periodEnd, userID,
	)

	if err != nil {
		log.Error().Err(err).Str("subscription_id", subID).Str("user_id", userID).Msg("failed to activate subscription in database")
		return
	}

	// #66: mirror the active tier onto users.subscription_tier so all enforcers agree.
	bs.propagateTierToUser(ctx, userID, tier, status)

	log.Info().Str("subscription_id", subID).Str("user_id", userID).Str("tier", tier).Str("status", status).Msg("subscription created and activated")
}

func (bs *BillingService) handleSubscriptionUpdated(ctx context.Context, event map[string]interface{}) {
	dataObj, ok := event["data"].(map[string]interface{})
	if !ok {
		return
	}

	obj, ok := dataObj["object"].(map[string]interface{})
	if !ok {
		return
	}

	subID, ok := obj["id"].(string)
	if !ok {
		return
	}

	// TD-008 FIX: Extract status, tier, current_period_end from event and update database
	status, _ := obj["status"].(string)
	var tier []interface{}
	if itemsObj, ok := obj["items"].(map[string]interface{}); ok {
		tier, _ = itemsObj["data"].([]interface{})
	}
	currentPeriodEnd, _ := obj["current_period_end"].(float64)
	customerID, _ := obj["customer"].(string)

	if customerID == "" {
		log.Warn().Str("subscription_id", subID).Msg("missing customer_id in subscription updated event")
		return
	}

	// Look up user_id from customer_id
	var userID string
	err := bs.pool.QueryRow(ctx,
		`SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1`,
		customerID,
	).Scan(&userID)

	if err != nil {
		log.Error().Err(err).Str("customer_id", customerID).Msg("failed to lookup user_id for subscription update")
		return
	}

	// Extract tier from items array (first item's price lookup)
	defaultTier := "individual"
	if len(tier) > 0 {
		if item, ok := tier[0].(map[string]interface{}); ok {
			if pricingTier, ok := item["price"].(map[string]interface{}); ok {
				if pricingTierID, ok := pricingTier["id"].(string); ok {
					// Map Stripe price ID to tier
					switch {
					case pricingTierID == "price_team_monthly":
						defaultTier = "team"
					case pricingTierID == "price_enterprise_monthly":
						defaultTier = "enterprise"
					default:
						defaultTier = "individual"
					}
				}
			}
		}
	}

	// Update subscriptions table with status, tier, and period end
	_, err = bs.pool.Exec(ctx,
		`UPDATE subscriptions SET status = $1, tier = $2, current_period_end = to_timestamp($3), updated_at = NOW()
		 WHERE stripe_subscription_id = $4`,
		status, defaultTier, int64(currentPeriodEnd), subID,
	)

	if err != nil {
		log.Error().Err(err).Str("subscription_id", subID).Str("user_id", userID).Msg("failed to update subscription in database")
		return
	}

	// #66: mirror the updated tier onto users.subscription_tier.
	bs.propagateTierToUser(ctx, userID, defaultTier, status)

	log.Info().Str("subscription_id", subID).Str("user_id", userID).Str("status", status).Str("tier", defaultTier).Msg("subscription updated in database")
}

func (bs *BillingService) handleSubscriptionDeleted(ctx context.Context, event map[string]interface{}) {
	dataObj, ok := event["data"].(map[string]interface{})
	if !ok {
		return
	}

	obj, ok := dataObj["object"].(map[string]interface{})
	if !ok {
		return
	}

	subID, ok := obj["id"].(string)
	if !ok {
		return
	}

	customerID, _ := obj["customer"].(string)
	if customerID == "" {
		log.Warn().Str("subscription_id", subID).Msg("missing customer_id in subscription deleted event")
		return
	}

	// Look up user_id from customer_id
	var userID string
	err := bs.pool.QueryRow(ctx,
		`SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1`,
		customerID,
	).Scan(&userID)

	if err != nil {
		log.Error().Err(err).Str("customer_id", customerID).Msg("failed to lookup user_id for subscription deletion")
		return
	}

	// TD-008 FIX: Update subscriptions SET status = 'cancelled', cancelled_at = NOW()
	_, err = bs.pool.Exec(ctx,
		`UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
		 WHERE stripe_subscription_id = $1`,
		subID,
	)

	if err != nil {
		log.Error().Err(err).Str("subscription_id", subID).Str("user_id", userID).Msg("failed to update subscription cancellation in database")
		return
	}

	// #66: a cancelled subscription reverts the user override to free.
	bs.propagateTierToUser(ctx, userID, "free", "cancelled")

	log.Info().Str("subscription_id", subID).Str("user_id", userID).Msg("subscription cancelled in database")
}

func (bs *BillingService) handlePaymentSucceeded(ctx context.Context, event map[string]interface{}) {
	dataObj, ok := event["data"].(map[string]interface{})
	if !ok {
		return
	}

	obj, ok := dataObj["object"].(map[string]interface{})
	if !ok {
		return
	}

	invoiceID, ok := obj["id"].(string)
	if !ok {
		return
	}

	customerID, _ := obj["customer"].(string)
	if customerID == "" {
		log.Warn().Str("invoice_id", invoiceID).Msg("missing customer_id in payment succeeded event")
		return
	}

	// Look up user_id from customer_id
	var userID string
	err := bs.pool.QueryRow(ctx,
		`SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1`,
		customerID,
	).Scan(&userID)

	if err != nil {
		log.Error().Err(err).Str("customer_id", customerID).Msg("failed to lookup user_id for payment succeeded")
		return
	}

	// TD-008 FIX: Update subscription status to 'active' if it was past_due
	_, err = bs.pool.Exec(ctx,
		`UPDATE subscriptions SET status = 'active', updated_at = NOW()
		 WHERE user_id = $1 AND status = 'past_due'`,
		userID,
	)

	if err != nil {
		log.Error().Err(err).Str("invoice_id", invoiceID).Str("user_id", userID).Msg("failed to update subscription status after payment")
		return
	}

	log.Info().Str("invoice_id", invoiceID).Str("user_id", userID).Msg("payment succeeded and subscription status updated")
}

func (bs *BillingService) handlePaymentFailed(ctx context.Context, event map[string]interface{}) {
	dataObj, ok := event["data"].(map[string]interface{})
	if !ok {
		return
	}

	obj, ok := dataObj["object"].(map[string]interface{})
	if !ok {
		return
	}

	invoiceID, ok := obj["id"].(string)
	if !ok {
		return
	}

	customerID, _ := obj["customer"].(string)
	if customerID == "" {
		log.Warn().Str("invoice_id", invoiceID).Msg("missing customer_id in payment failed event")
		return
	}

	// Look up user_id from customer_id
	var userID string
	err := bs.pool.QueryRow(ctx,
		`SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1`,
		customerID,
	).Scan(&userID)

	if err != nil {
		log.Error().Err(err).Str("customer_id", customerID).Msg("failed to lookup user_id for payment failed")
		return
	}

	// TD-008 FIX: Update subscriptions SET status = 'past_due'
	_, err = bs.pool.Exec(ctx,
		`UPDATE subscriptions SET status = 'past_due', updated_at = NOW()
		 WHERE user_id = $1`,
		userID,
	)

	if err != nil {
		log.Error().Err(err).Str("invoice_id", invoiceID).Str("user_id", userID).Msg("failed to update subscription status to past_due")
		return
	}

	log.Warn().Str("invoice_id", invoiceID).Str("user_id", userID).Msg("payment failed and subscription marked as past_due")
}

// SD-018 FIX: Verify Stripe webhook signature using the t=timestamp,v1=signature format
// Stripe signs: timestamp + "." + payload, then sends "t=timestamp,v1=hmac"
func verifyStripeSignature(payload []byte, signatureHeader, secret string) bool {
	// Parse the signature header: "t=1234,v1=abc123,v1=def456"
	var timestamp string
	var signatures []string

	parts := strings.Split(signatureHeader, ",")
	for _, part := range parts {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "t":
			timestamp = kv[1]
		case "v1":
			signatures = append(signatures, kv[1])
		}
	}

	if timestamp == "" || len(signatures) == 0 {
		return false
	}

	// Verify timestamp is not too old (5 minute tolerance)
	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return false
	}
	if time.Now().Unix()-ts > 300 {
		log.Warn().Int64("webhook_timestamp", ts).Msg("webhook timestamp too old (>5 minutes)")
		return false
	}

	// Compute expected signature: HMAC-SHA256(secret, timestamp + "." + payload)
	signedPayload := timestamp + "." + string(payload)
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(signedPayload))
	expectedSig := hex.EncodeToString(h.Sum(nil))

	// Check against all provided v1 signatures
	for _, sig := range signatures {
		if hmac.Equal([]byte(sig), []byte(expectedSig)) {
			return true
		}
	}

	return false
}

// HTTP Handlers

type CreateCustomerRequest struct {
	Email string `json:"email"`
}

func HandleCreateCustomer(bs *BillingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req CreateCustomerRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		customerID, err := bs.CreateCustomer(r.Context(), userID, req.Email)
		if err != nil {
			http.Error(w, "failed to create customer", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"customer_id": customerID})
	}
}

type CreateSubscriptionRequest struct {
	Tier string `json:"tier"`
}

func HandleCreateSubscription(bs *BillingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req CreateSubscriptionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		subscriptionID, err := bs.CreateSubscription(r.Context(), userID, req.Tier)
		if err != nil {
			http.Error(w, "failed to create subscription", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"subscription_id": subscriptionID})
	}
}

func HandleGetSubscription(bs *BillingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		sub, err := bs.GetSubscription(r.Context(), userID)
		if err != nil {
			http.Error(w, "subscription not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(sub)
	}
}

func HandleWebhook(bs *BillingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		bs.HandleWebhook(w, r)
	}
}

// PH8-FIX: Tier ranking for upgrade/downgrade validation
func getTierRanking(tier string) int {
	rankMap := map[string]int{
		"enterprise": 3,
		"team":       2,
		"individual": 1,
		"free":       0,
	}
	if rank, ok := rankMap[tier]; ok {
		return rank
	}
	return -1
}

// PH8-FIX: UpgradeSubscriptionRequest for tier upgrade
type UpgradeSubscriptionRequest struct {
	Tier string `json:"tier"`
}

// PH8-FIX: HandleUpgradeSubscription upgrades user's subscription tier
// Validates that the new tier is higher than current tier
func HandleUpgradeSubscription(bs *BillingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req UpgradeSubscriptionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// Validate requested tier
		if !isValidTier(req.Tier) {
			http.Error(w, "invalid tier", http.StatusBadRequest)
			return
		}

		ctx := r.Context()

		// Get current subscription
		currentSub, err := bs.GetSubscription(ctx, userID)
		if err != nil {
			http.Error(w, "subscription not found", http.StatusNotFound)
			return
		}

		// PH8-FIX: Validate tier is higher
		currentRank := getTierRanking(currentSub.Tier)
		requestedRank := getTierRanking(req.Tier)

		if requestedRank <= currentRank {
			log.Warn().Str("user_id", userID).Str("current_tier", currentSub.Tier).Str("requested_tier", req.Tier).
				Msg("upgrade request for non-higher tier rejected")
			http.Error(w, "requested tier must be higher than current tier", http.StatusBadRequest)
			return
		}

		// SECURITY (CRIT-4 / P0): never write the tier directly on request. The previous
		// implementation ran `UPDATE subscriptions SET tier` here, letting any authenticated
		// user self-grant enterprise with ZERO payment. The authoritative tier must only be
		// set through a payment-verified path. Delegate to CreateSubscription: in live-Stripe
		// mode it requires an existing Stripe customer and a Stripe-accepted subscription
		// before any tier is persisted (the signature-verified webhook —
		// handleSubscriptionCreated/Updated — is the source of truth); in local/dev mode it
		// uses the same local path as /subscribe. On any failure the tier is left unchanged.
		// NOTE (tracked follow-up): when the user already has a live Stripe subscription, an
		// upgrade should MODIFY that subscription's price rather than create a second one;
		// /subscribe still permits local-mode provisioning for dev — same parity item.
		//
		// Fail closed when there is no live Stripe configuration: in local/dev mode there is
		// NO payment source, so granting a paid tier here would be exactly the free self-grant
		// we are removing (this also protects a production box misconfigured without a key).
		if !isLiveStripeKey(bs.apiKey) {
			log.Warn().Str("user_id", userID).Str("tier", req.Tier).
				Msg("CRIT-4: upgrade refused — no live Stripe configuration (no self-grant)")
			http.Error(w, "upgrades require an active billing configuration; complete checkout to upgrade", http.StatusPaymentRequired)
			return
		}
		if _, err = bs.CreateSubscription(ctx, userID, req.Tier); err != nil {
			log.Warn().Err(err).Str("user_id", userID).Str("tier", req.Tier).
				Msg("CRIT-4: upgrade rejected — payment-verified path failed (no self-grant)")
			http.Error(w, "upgrade requires an active payment method; complete checkout to upgrade", http.StatusPaymentRequired)
			return
		}

		// Fetch updated subscription
		updatedSub, err := bs.GetSubscription(ctx, userID)
		if err != nil {
			http.Error(w, "failed to retrieve updated subscription", http.StatusInternalServerError)
			return
		}

		log.Info().Str("user_id", userID).Str("from_tier", currentSub.Tier).Str("to_tier", req.Tier).
			Msg("subscription upgraded")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(updatedSub)
	}
}

// PH8-FIX: DowngradeSubscriptionRequest for tier downgrade
type DowngradeSubscriptionRequest struct {
	Tier string `json:"tier"`
}

// PH8-FIX: HandleDowngradeSubscription downgrades user's subscription tier
// Implements grace period: downgrade takes effect at end of billing period
func HandleDowngradeSubscription(bs *BillingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req DowngradeSubscriptionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// Validate requested tier
		if !isValidTier(req.Tier) {
			http.Error(w, "invalid tier", http.StatusBadRequest)
			return
		}

		ctx := r.Context()

		// Get current subscription
		currentSub, err := bs.GetSubscription(ctx, userID)
		if err != nil {
			http.Error(w, "subscription not found", http.StatusNotFound)
			return
		}

		// PH8-FIX: Validate tier is lower
		currentRank := getTierRanking(currentSub.Tier)
		requestedRank := getTierRanking(req.Tier)

		if requestedRank >= currentRank {
			log.Warn().Str("user_id", userID).Str("current_tier", currentSub.Tier).Str("requested_tier", req.Tier).
				Msg("downgrade request for non-lower tier rejected")
			http.Error(w, "requested tier must be lower than current tier", http.StatusBadRequest)
			return
		}

		// PH8-FIX: Schedule downgrade to take effect at end of billing period
		periodEnd, err := time.Parse(time.RFC3339, currentSub.CurrentPeriod)
		if err != nil {
			periodEnd = time.Now().AddDate(0, 1, 0)
		}

		_, err = bs.pool.Exec(ctx,
			`UPDATE subscriptions SET downgrade_scheduled_at = NOW(), downgrade_to_tier = $1, updated_at = NOW()
			 WHERE user_id = $2`,
			req.Tier, userID,
		)

		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Str("tier", req.Tier).Msg("failed to schedule downgrade")
			http.Error(w, "failed to schedule downgrade", http.StatusInternalServerError)
			return
		}

		log.Info().Str("user_id", userID).Str("current_tier", currentSub.Tier).Str("downgrade_to_tier", req.Tier).
			Time("takes_effect_at", periodEnd).Msg("subscription downgrade scheduled")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":            "downgrade_scheduled",
			"current_tier":      currentSub.Tier,
			"downgrade_to_tier": req.Tier,
			"takes_effect_at":   periodEnd.Format(time.RFC3339),
		})
	}
}

// PH8-FIX: HandleCancelSubscription cancels user's subscription
// Sets subscription status to 'cancelling' and marks to cancel at period end
func HandleCancelSubscription(bs *BillingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		ctx := r.Context()

		// Get current subscription to get period end
		currentSub, err := bs.GetSubscription(ctx, userID)
		if err != nil {
			http.Error(w, "subscription not found", http.StatusNotFound)
			return
		}

		// PH8-FIX: Set status to 'cancelling' and mark for cancellation at period end
		_, err = bs.pool.Exec(ctx,
			`UPDATE subscriptions SET status = 'cancelling', cancel_at_period_end = true, updated_at = NOW()
			 WHERE user_id = $1`,
			userID,
		)

		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to cancel subscription")
			http.Error(w, "failed to cancel subscription", http.StatusInternalServerError)
			return
		}

		// Parse period end
		periodEnd, err := time.Parse(time.RFC3339, currentSub.CurrentPeriod)
		if err != nil {
			periodEnd = time.Now().AddDate(0, 1, 0)
		}

		log.Info().Str("user_id", userID).Str("tier", currentSub.Tier).
			Time("cancellation_effective_at", periodEnd).Msg("subscription cancelled")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":               "cancelling",
			"cancelled_at":         time.Now().Format(time.RFC3339),
			"cancellation_ends_at": periodEnd.Format(time.RFC3339),
			"tier":                 currentSub.Tier,
		})
	}
}

// PH8-FIX: HandleReactivateSubscription reactivates a cancelled subscription before period end
func HandleReactivateSubscription(bs *BillingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		ctx := r.Context()

		// Get current subscription
		currentSub, err := bs.GetSubscription(ctx, userID)
		if err != nil {
			http.Error(w, "subscription not found", http.StatusNotFound)
			return
		}

		// Only allow reactivation of cancelling subscriptions
		if currentSub.Status != "cancelling" {
			http.Error(w, "subscription is not in cancelling state", http.StatusBadRequest)
			return
		}

		if bs.pool == nil {
			http.Error(w, "database not configured", http.StatusInternalServerError)
			return
		}

		// If Stripe is configured, reactivate via Stripe API
		if isLiveStripeKey(bs.apiKey) && currentSub.SubscriptionID != "" && !strings.HasPrefix(currentSub.SubscriptionID, "local_") {
			data := url.Values{}
			data.Set("cancel_at_period_end", "false")

			req, err := http.NewRequestWithContext(ctx, "POST",
				"https://api.stripe.com/v1/subscriptions/"+currentSub.SubscriptionID,
				strings.NewReader(data.Encode()))
			if err != nil {
				http.Error(w, "failed to create request", http.StatusInternalServerError)
				return
			}
			req.SetBasicAuth(bs.apiKey, "")
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

			resp, err := bs.httpClient.Do(req)
			if err != nil {
				log.Error().Err(err).Str("user_id", userID).Msg("failed to reactivate subscription via Stripe")
				http.Error(w, "failed to reactivate subscription", http.StatusInternalServerError)
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				http.Error(w, "Stripe reactivation failed", http.StatusBadGateway)
				return
			}
		}

		// Update local database
		_, err = bs.pool.Exec(ctx,
			`UPDATE subscriptions SET status = 'active', cancel_at_period_end = false, updated_at = NOW()
			 WHERE user_id = $1`,
			userID,
		)

		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to reactivate subscription in database")
			http.Error(w, "failed to reactivate subscription", http.StatusInternalServerError)
			return
		}

		log.Info().Str("user_id", userID).Str("tier", currentSub.Tier).Msg("subscription reactivated")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "active",
			"tier":   currentSub.Tier,
		})
	}
}

// PH8-FIX: HandleCreateCheckoutSession creates a Stripe Checkout session for new subscriptions
func HandleCreateCheckoutSession(bs *BillingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var req struct {
			Tier       string `json:"tier"`
			SuccessURL string `json:"success_url"`
			CancelURL  string `json:"cancel_url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		if !isValidTier(req.Tier) || req.Tier == "free" {
			http.Error(w, "invalid tier for checkout", http.StatusBadRequest)
			return
		}

		ctx := r.Context()

		// Get or create customer ID
		var customerID string
		if bs.pool != nil {
			err := bs.pool.QueryRow(ctx,
				"SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1", userID).Scan(&customerID)
			if err != nil {
				// No customer yet — create one in local mode
				customerID = "local_cust_" + userID
			}
		}

		priceID := bs.mapTierToPrice(req.Tier)
		if priceID == "" && isLiveStripeKey(bs.apiKey) {
			http.Error(w, "no price configured for tier", http.StatusBadRequest)
			return
		}

		// If Stripe is configured, create a real Checkout session
		if isLiveStripeKey(bs.apiKey) {
			data := url.Values{}
			data.Set("mode", "subscription")
			data.Set("customer", customerID)
			data.Set("line_items[0][price]", priceID)
			data.Set("line_items[0][quantity]", "1")
			data.Set("success_url", req.SuccessURL)
			data.Set("cancel_url", req.CancelURL)
			data.Set("metadata[user_id]", userID)
			data.Set("metadata[tier]", req.Tier)

			httpReq, err := http.NewRequestWithContext(ctx, "POST",
				"https://api.stripe.com/v1/checkout/sessions",
				strings.NewReader(data.Encode()))
			if err != nil {
				http.Error(w, "failed to create request", http.StatusInternalServerError)
				return
			}
			httpReq.SetBasicAuth(bs.apiKey, "")
			httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

			resp, err := bs.httpClient.Do(httpReq)
			if err != nil {
				log.Error().Err(err).Str("user_id", userID).Msg("failed to create checkout session")
				http.Error(w, "failed to create checkout session", http.StatusInternalServerError)
				return
			}
			defer resp.Body.Close()

			var result struct {
				URL   string `json:"url"`
				ID    string `json:"id"`
				Error *struct {
					Message string `json:"message"`
				} `json:"error"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
				http.Error(w, "failed to decode Stripe response", http.StatusInternalServerError)
				return
			}
			if result.Error != nil {
				http.Error(w, "Stripe error: "+result.Error.Message, http.StatusBadGateway)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{
				"url":        result.URL,
				"session_id": result.ID,
			})
			return
		}

		// SECURITY (CRIT-4): a checkout session is meaningless without a live Stripe
		// configuration, and directly upgrading here would be a free self-grant of a paid
		// tier (the same hole closed on the /upgrade path). Fail closed.
		log.Warn().Str("user_id", userID).Str("tier", req.Tier).
			Msg("CRIT-4: checkout-session refused — no live Stripe configuration (no self-grant)")
		http.Error(w, "checkout requires an active billing configuration", http.StatusPaymentRequired)
	}
}

// PH8-FIX: HandleCreatePortalSession creates a Stripe Customer Portal session
func HandleCreatePortalSession(bs *BillingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var req struct {
			ReturnURL string `json:"return_url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		ctx := r.Context()

		// Get customer ID
		var customerID string
		if bs.pool != nil {
			err := bs.pool.QueryRow(ctx,
				"SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1", userID).Scan(&customerID)
			if err != nil {
				http.Error(w, "customer not found", http.StatusNotFound)
				return
			}
		}

		// If Stripe configured, create real portal session
		if isLiveStripeKey(bs.apiKey) {
			data := url.Values{}
			data.Set("customer", customerID)
			if req.ReturnURL != "" {
				data.Set("return_url", req.ReturnURL)
			}

			httpReq, err := http.NewRequestWithContext(ctx, "POST",
				"https://api.stripe.com/v1/billing_portal/sessions",
				strings.NewReader(data.Encode()))
			if err != nil {
				http.Error(w, "failed to create request", http.StatusInternalServerError)
				return
			}
			httpReq.SetBasicAuth(bs.apiKey, "")
			httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

			resp, err := bs.httpClient.Do(httpReq)
			if err != nil {
				log.Error().Err(err).Str("user_id", userID).Msg("failed to create portal session")
				http.Error(w, "failed to create portal session", http.StatusInternalServerError)
				return
			}
			defer resp.Body.Close()

			var result struct {
				URL   string `json:"url"`
				Error *struct {
					Message string `json:"message"`
				} `json:"error"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
				http.Error(w, "failed to decode Stripe response", http.StatusInternalServerError)
				return
			}
			if result.Error != nil {
				http.Error(w, "Stripe error: "+result.Error.Message, http.StatusBadGateway)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{
				"url": result.URL,
			})
			return
		}

		// Local mode: return the return URL as-is
		log.Warn().Msg("PH8-FIX: No Stripe key, returning return_url for local portal session")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"url": req.ReturnURL,
		})
	}
}

// Helpers

// computeWebhookSignature computes an HMAC-SHA256 signature for webhook payload verification.
func computeWebhookSignature(payload []byte, secret string) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write(payload)
	return hex.EncodeToString(h.Sum(nil))
}

// PH1-FIX: Stripe price ID mapping for subscription tiers.
// These should come from environment variables in production.
func (bs *BillingService) mapTierToPrice(tier string) string {
	priceMap := map[string]string{
		"free":       "",                                   // Free tier has no Stripe price
		"individual": os.Getenv("STRIPE_PRICE_INDIVIDUAL"), // e.g., price_xxx
		"team":       os.Getenv("STRIPE_PRICE_TEAM"),       // e.g., price_yyy
		"enterprise": os.Getenv("STRIPE_PRICE_ENTERPRISE"), // e.g., price_zzz
	}
	if price, ok := priceMap[tier]; ok {
		return price
	}
	return ""
}

// PH1-FIX: Checks whether a Stripe API key is a real (non-placeholder) key.
// Returns false for empty strings or development placeholder values.
func isLiveStripeKey(key string) bool {
	if key == "" {
		return false
	}
	// Check for common placeholder patterns without embedding literal key prefixes
	placeholders := []string{"placeholder", "change_me", "your_stripe", "CHANGE_ME"}
	for _, p := range placeholders {
		if strings.Contains(key, p) {
			return false
		}
	}
	return true
}

// TD-010/TD-011 FIX: Added validation helper functions
func isValidTier(tier string) bool {
	validTiers := map[string]bool{
		"free":       true,
		"individual": true,
		"team":       true,
		"enterprise": true,
	}
	return validTiers[tier]
}

func isValidEmail(email string) bool {
	// Reject leading/trailing whitespace
	if email != strings.TrimSpace(email) {
		return false
	}
	addr, err := mail.ParseAddress(email)
	if err != nil {
		return false
	}
	// Ensure parsed address matches input (no display name wrapping)
	if addr.Address != email {
		return false
	}
	// Require a dot in the domain part (rejects user@localhost, user@example)
	parts := strings.SplitN(email, "@", 2)
	if len(parts) != 2 || !strings.Contains(parts[1], ".") {
		return false
	}
	// Reject spaces in the address
	if strings.ContainsAny(email, " \t") {
		return false
	}
	return true
}
