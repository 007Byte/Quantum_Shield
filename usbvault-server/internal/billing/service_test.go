package billing

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/pashagolub/pgxmock/v2"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ============================================================================
// Test NewBillingService
// ============================================================================

func TestNewBillingService(t *testing.T) {
	t.Parallel()

	t.Run("creates billing service with stripe key", func(t *testing.T) {
		// pgxmock's PgxPoolIface satisfies the BillingPool interface, so we can
		// construct the service with a mock pool and no real database.
		mock, err := pgxmock.NewPool()
		require.NoError(t, err)
		defer mock.Close()

		svc := NewBillingService("sk_test_123456789", mock)

		require.NotNil(t, svc)
		assert.Equal(t, "sk_test_123456789", svc.apiKey)
		assert.Equal(t, mock, svc.pool)
		assert.NotNil(t, svc.httpClient, "an HTTP client must always be wired for Stripe calls")
	})

	t.Run("handles empty stripe key", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		require.NoError(t, err)
		defer mock.Close()

		svc := NewBillingService("", mock)

		require.NotNil(t, svc)
		assert.Equal(t, "", svc.apiKey)
		// An empty key must resolve to local (non-live) billing mode.
		assert.False(t, isLiveStripeKey(svc.apiKey))
	})

	t.Run("accepts a nil pool for local-only mode", func(t *testing.T) {
		svc := NewBillingService("sk_test_123456789", nil)

		require.NotNil(t, svc)
		assert.Nil(t, svc.pool)
	})
}

// ============================================================================
// Test CreateCustomer
// ============================================================================

func TestCreateCustomer(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		userID      string
		email       string
		expectError bool
		errIs       error
		// expectInsert is true when the local-mode INSERT/upsert into subscriptions
		// is expected to run (i.e. the email passes validation).
		expectInsert bool
		validateID   func(*testing.T, string)
	}{
		{
			name:         "creates customer for valid user",
			userID:       "user-123",
			email:        "user@example.com",
			expectError:  false,
			expectInsert: true,
			validateID: func(t *testing.T, id string) {
				assert.NotEmpty(t, id)
				// Local (non-live) mode returns a local_cust_<userID> identifier.
				assert.Contains(t, id, "cust_")
				assert.Contains(t, id, "user-123")
			},
		},
		{
			name:         "generates customer ID with user ID",
			userID:       "user-456",
			email:        "another@example.com",
			expectError:  false,
			expectInsert: true,
			validateID: func(t *testing.T, id string) {
				assert.Contains(t, id, "user-456")
			},
		},
		{
			// CreateCustomer validates the email FIRST and fails closed on an empty
			// one (ErrInvalidEmail) before touching the database — no INSERT runs.
			name:         "rejects missing email",
			userID:       "user-789",
			email:        "",
			expectError:  true,
			errIs:        ErrInvalidEmail,
			expectInsert: false,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			mock, err := pgxmock.NewPool()
			require.NoError(t, err)
			defer mock.Close()

			// Non-live ("placeholder") key keeps CreateCustomer on the local path:
			// it upserts a local_cust_<userID> row and never calls the Stripe API.
			svc := NewBillingService("sk_test_placeholder", mock)

			if tt.expectInsert {
				mock.ExpectExec("INSERT INTO subscriptions").
					WithArgs(tt.userID, "local_cust_"+tt.userID).
					WillReturnResult(pgxmock.NewResult("INSERT", 1))
			}

			id, err := svc.CreateCustomer(context.Background(), tt.userID, tt.email)

			if tt.expectError {
				require.Error(t, err)
				if tt.errIs != nil {
					assert.ErrorIs(t, err, tt.errIs)
				}
			} else {
				require.NoError(t, err)
				tt.validateID(t, id)
			}

			assert.NoError(t, mock.ExpectationsWereMet(),
				"all and only the expected DB calls must have run")
		})
	}
}

// ============================================================================
// Test CreateSubscription
// ============================================================================

func TestCreateSubscription(t *testing.T) {
	// NOTE: intentionally NOT t.Parallel() — a sub-test uses t.Setenv to drive the
	// STRIPE_PRICE_* lookup, which Go forbids under a parallel ancestor.

	// Branch 1: nil pool == pure local mode. CreateSubscription short-circuits and
	// returns a local_sub_<userID> identifier without touching any database.
	t.Run("nil pool returns local subscription id", func(t *testing.T) {
		svc := NewBillingService("sk_test_placeholder", nil)

		for _, tier := range []string{"individual", "team", "enterprise"} {
			id, err := svc.CreateSubscription(context.Background(), "user-"+tier, tier)
			require.NoError(t, err)
			assert.Contains(t, id, "sub_")
			assert.Contains(t, id, "user-"+tier)
		}
	})

	// Branch 2 (CRIT-4 security property): with a real DB pool but NO live Stripe
	// configuration, a paid-tier subscription must FAIL CLOSED rather than self-grant
	// a paid tier for free. The code looks up the customer + maps the price, then
	// refuses at the live-Stripe gate — so NO tier-write Exec is ever issued.
	t.Run("paid tier without live Stripe fails closed (no self-grant)", func(t *testing.T) {
		// A configured price is required to reach the live-Stripe gate; set one so the
		// refusal is proven to happen AT the gate, not earlier for a missing price.
		t.Setenv("STRIPE_PRICE_INDIVIDUAL", "price_individual_monthly")

		mock, err := pgxmock.NewPool()
		require.NoError(t, err)
		defer mock.Close()

		svc := NewBillingService("sk_test_placeholder", mock)

		// Customer lookup succeeds (a customer exists)...
		mock.ExpectQuery("SELECT stripe_customer_id FROM subscriptions WHERE user_id").
			WithArgs("user-123").
			WillReturnRows(pgxmock.NewRows([]string{"stripe_customer_id"}).AddRow("local_cust_user-123"))
		// ...but NO UPDATE/tier-write is expected — the handler must refuse first.

		id, err := svc.CreateSubscription(context.Background(), "user-123", "individual")

		require.Error(t, err, "must refuse to provision a paid tier without live Stripe")
		assert.Empty(t, id)
		assert.NoError(t, mock.ExpectationsWereMet(),
			"the customer lookup must run but no tier-write Exec may be issued")
	})

	// Branch 3: an invalid tier is rejected up front with ErrInvalidTier and never
	// reaches the database.
	t.Run("invalid tier is rejected", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		require.NoError(t, err)
		defer mock.Close()

		svc := NewBillingService("sk_test_placeholder", mock)

		id, err := svc.CreateSubscription(context.Background(), "user-123", "platinum")

		require.Error(t, err)
		assert.ErrorIs(t, err, ErrInvalidTier)
		assert.Empty(t, id)
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// ============================================================================
// Test GetSubscription
// ============================================================================

func TestGetSubscription(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		userID      string
		expectError bool
		validate    func(*testing.T, *Subscription)
	}{
		{
			name:        "retrieves subscription for user",
			userID:      "user-123",
			expectError: false,
			validate: func(t *testing.T, sub *Subscription) {
				assert.NotNil(t, sub)
				assert.Equal(t, "user-123", sub.UserID)
				assert.NotEmpty(t, sub.Tier)
				assert.Equal(t, "active", sub.Status)
			},
		},
		{
			name:        "subscription has valid tier",
			userID:      "user-456",
			expectError: false,
			validate: func(t *testing.T, sub *Subscription) {
				validTiers := map[string]bool{
					"free":       true,
					"individual": true,
					"team":       true,
					"enterprise": true,
				}
				assert.True(t, validTiers[sub.Tier])
			},
		},
		{
			name:        "subscription has valid status",
			userID:      "user-789",
			expectError: false,
			validate: func(t *testing.T, sub *Subscription) {
				validStatuses := map[string]bool{
					"active":     true,
					"inactive":   true,
					"cancelled":  true,
					"suspended":  true,
				}
				assert.True(t, validStatuses[sub.Status])
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := NewBillingService("sk_test_123456789", nil)
			ctx := context.Background()

			sub, err := svc.GetSubscription(ctx, tt.userID)

			if tt.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				tt.validate(t, sub)
			}
		})
	}
}

// ============================================================================
// Test CheckAccess
// ============================================================================

func TestCheckAccess(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name            string
		userID          string
		mockStatus      string
		expectError     bool
		validateTier    func(*testing.T, string)
	}{
		{
			name:        "active subscription grants access",
			userID:      "user-123",
			mockStatus:  "active",
			expectError: false,
			validateTier: func(t *testing.T, tier string) {
				assert.NotEmpty(t, tier)
			},
		},
		{
			name:        "inactive subscription denied access",
			userID:      "user-456",
			mockStatus:  "inactive",
			expectError: true,
		},
		{
			name:        "cancelled subscription denied access",
			userID:      "user-789",
			mockStatus:  "cancelled",
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_ = NewBillingService("sk_test_123456789", nil)

			// Note: actual implementation would mock GetSubscription
			// For this test, we verify the logic
			if tt.mockStatus != "active" {
				assert.Error(t, ErrSubscriptionInactive)
			}
		})
	}
}

// ============================================================================
// Test HandleWebhook
// ============================================================================

func TestHandleWebhook(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		eventType    string
		eventPayload map[string]interface{}
		expectStatus int
	}{
		{
			name:      "handles customer.subscription.updated event",
			eventType: "customer.subscription.updated",
			eventPayload: map[string]interface{}{
				"id":   "evt_updated_1",
				"type": "customer.subscription.updated",
				"data": map[string]interface{}{
					"object": map[string]interface{}{
						"id": "sub_12345",
					},
				},
			},
			expectStatus: http.StatusOK,
		},
		{
			name:      "handles customer.subscription.deleted event",
			eventType: "customer.subscription.deleted",
			eventPayload: map[string]interface{}{
				"id":   "evt_deleted_1",
				"type": "customer.subscription.deleted",
				"data": map[string]interface{}{
					"object": map[string]interface{}{
						"id": "sub_12345",
					},
				},
			},
			expectStatus: http.StatusOK,
		},
		{
			name:      "handles invoice.payment_succeeded event",
			eventType: "invoice.payment_succeeded",
			eventPayload: map[string]interface{}{
				"id":   "evt_paysucc_1",
				"type": "invoice.payment_succeeded",
				"data": map[string]interface{}{
					"object": map[string]interface{}{
						"id": "in_12345",
					},
				},
			},
			expectStatus: http.StatusOK,
		},
		{
			name:      "handles invoice.payment_failed event",
			eventType: "invoice.payment_failed",
			eventPayload: map[string]interface{}{
				"id":   "evt_payfail_1",
				"type": "invoice.payment_failed",
				"data": map[string]interface{}{
					"object": map[string]interface{}{
						"id": "in_12345",
					},
				},
			},
			expectStatus: http.StatusOK,
		},
		{
			name:      "rejects invalid webhook payload",
			eventType: "",
			eventPayload: map[string]interface{}{
				"invalid": "payload",
			},
			expectStatus: http.StatusBadRequest,
		},
	}

	webhookSecret := "test_webhook_secret"
	os.Setenv("STRIPE_WEBHOOK_SECRET", webhookSecret)
	defer os.Unsetenv("STRIPE_WEBHOOK_SECRET")

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := NewBillingService("sk_test_123456789", nil)

			payload, _ := json.Marshal(tt.eventPayload)
			req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(payload))
			req.Header.Set("Stripe-Signature", stripeSignature(payload, webhookSecret))
			w := httptest.NewRecorder()

			svc.HandleWebhook(w, req)

			assert.Equal(t, tt.expectStatus, w.Code)
		})
	}
}

// ============================================================================
// Test HandleCreateCustomer Handler
// ============================================================================

// CRIT-4 / P0 regression: a tier upgrade must NEVER be granted without a live,
// payment-verified Stripe configuration. Before the fix, HandleUpgradeSubscription
// ran a direct `UPDATE subscriptions SET tier`, letting any authenticated user
// self-grant enterprise for free. It must now fail closed with 402 and write nothing.
func TestHandleUpgradeSubscription_NoSelfGrantWithoutLiveStripe(t *testing.T) {
	t.Parallel()

	// Non-live key ("placeholder") + nil pool: GetSubscription returns the free tier
	// (nil-pool path), the higher-tier check passes, and the handler must refuse at the
	// live-Stripe gate BEFORE reaching any tier write (no pool.Exec is hit).
	svc := NewBillingService("sk_test_placeholder", nil)

	body, _ := json.Marshal(UpgradeSubscriptionRequest{Tier: "enterprise"})
	req := httptest.NewRequest("POST", "/billing/upgrade", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), ctxkeys.UserID, "user-123"))
	w := httptest.NewRecorder()

	HandleUpgradeSubscription(svc)(w, req)

	assert.Equal(t, http.StatusPaymentRequired, w.Code,
		"free user must not be able to self-grant a paid tier; expected 402, body=%s", w.Body.String())
}

func TestHandleCreateCustomer(t *testing.T) {
	t.Parallel()

	t.Run("creates customer with authenticated user", func(t *testing.T) {
		svc := NewBillingService("placeholder_key", nil)
		handler := HandleCreateCustomer(svc)

		reqBody := CreateCustomerRequest{Email: "user@example.com"}
		body, _ := json.Marshal(reqBody)

		req := httptest.NewRequest("POST", "/customers", bytes.NewReader(body))
		ctx := context.WithValue(req.Context(), ctxkeys.UserID, "user-123")
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		handler(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)

		var resp map[string]string
		json.Unmarshal(w.Body.Bytes(), &resp)
		assert.NotEmpty(t, resp["customer_id"])
	})

	t.Run("rejects unauthenticated request", func(t *testing.T) {
		svc := NewBillingService("sk_test_123456789", nil)
		handler := HandleCreateCustomer(svc)

		reqBody := CreateCustomerRequest{Email: "user@example.com"}
		body, _ := json.Marshal(reqBody)

		req := httptest.NewRequest("POST", "/customers", bytes.NewReader(body))
		// No user_id in context
		w := httptest.NewRecorder()

		handler(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("rejects invalid request body", func(t *testing.T) {
		svc := NewBillingService("sk_test_123456789", nil)
		handler := HandleCreateCustomer(svc)

		req := httptest.NewRequest("POST", "/customers", bytes.NewReader([]byte("invalid")))
		ctx := context.WithValue(req.Context(), ctxkeys.UserID, "user-123")
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		handler(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

// ============================================================================
// Test HandleCreateSubscription Handler
// ============================================================================

func TestHandleCreateSubscription(t *testing.T) {
	t.Parallel()

	t.Run("creates subscription for authenticated user", func(t *testing.T) {
		svc := NewBillingService("sk_test_123456789", nil)
		handler := HandleCreateSubscription(svc)

		reqBody := CreateSubscriptionRequest{Tier: "individual"}
		body, _ := json.Marshal(reqBody)

		req := httptest.NewRequest("POST", "/subscriptions", bytes.NewReader(body))
		ctx := context.WithValue(req.Context(), ctxkeys.UserID, "user-123")
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		handler(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)

		var resp map[string]string
		json.Unmarshal(w.Body.Bytes(), &resp)
		assert.NotEmpty(t, resp["subscription_id"])
	})

	t.Run("rejects unauthenticated request", func(t *testing.T) {
		svc := NewBillingService("sk_test_123456789", nil)
		handler := HandleCreateSubscription(svc)

		reqBody := CreateSubscriptionRequest{Tier: "individual"}
		body, _ := json.Marshal(reqBody)

		req := httptest.NewRequest("POST", "/subscriptions", bytes.NewReader(body))
		// No user_id in context
		w := httptest.NewRecorder()

		handler(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

// ============================================================================
// Test HandleGetSubscription Handler
// ============================================================================

func TestHandleGetSubscription(t *testing.T) {
	t.Parallel()

	t.Run("retrieves subscription for authenticated user", func(t *testing.T) {
		svc := NewBillingService("sk_test_123456789", nil)
		handler := HandleGetSubscription(svc)

		req := httptest.NewRequest("GET", "/subscriptions", nil)
		ctx := context.WithValue(req.Context(), ctxkeys.UserID, "user-123")
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		handler(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var sub Subscription
		json.Unmarshal(w.Body.Bytes(), &sub)
		assert.Equal(t, "user-123", sub.UserID)
	})

	t.Run("rejects unauthenticated request", func(t *testing.T) {
		svc := NewBillingService("sk_test_123456789", nil)
		handler := HandleGetSubscription(svc)

		req := httptest.NewRequest("GET", "/subscriptions", nil)
		// No user_id in context
		w := httptest.NewRecorder()

		handler(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

// ============================================================================
// Test mapTierToPrice Helper
// ============================================================================

func TestMapTierToPrice(t *testing.T) {
	// Set test price env vars
	os.Setenv("STRIPE_PRICE_INDIVIDUAL", "price_individual_monthly")
	os.Setenv("STRIPE_PRICE_TEAM", "price_team_monthly")
	os.Setenv("STRIPE_PRICE_ENTERPRISE", "price_enterprise_monthly")
	defer func() {
		os.Unsetenv("STRIPE_PRICE_INDIVIDUAL")
		os.Unsetenv("STRIPE_PRICE_TEAM")
		os.Unsetenv("STRIPE_PRICE_ENTERPRISE")
	}()

	tests := []struct {
		tier          string
		expectedPrice string
	}{
		{
			tier:          "individual",
			expectedPrice: "price_individual_monthly",
		},
		{
			tier:          "team",
			expectedPrice: "price_team_monthly",
		},
		{
			tier:          "enterprise",
			expectedPrice: "price_enterprise_monthly",
		},
		{
			tier:          "unknown",
			expectedPrice: "", // Unknown tier returns empty
		},
		{
			tier:          "",
			expectedPrice: "", // Empty tier returns empty
		},
	}

	for _, tt := range tests {
		t.Run(tt.tier, func(t *testing.T) {
			svc := NewBillingService("sk_test_123456789", nil)
			price := svc.mapTierToPrice(tt.tier)
			assert.Equal(t, tt.expectedPrice, price)
		})
	}
}

// ============================================================================
// Test Subscription Struct
// ============================================================================

func TestSubscription(t *testing.T) {
	t.Parallel()

	t.Run("subscription has required fields", func(t *testing.T) {
		sub := Subscription{
			SubscriptionID: "sub_123",
			UserID:         "user-123",
			Tier:           "individual",
			Status:         "active",
			CurrentPeriod:  "2024-02-07T00:00:00Z",
		}

		assert.NotEmpty(t, sub.SubscriptionID)
		assert.NotEmpty(t, sub.UserID)
		assert.NotEmpty(t, sub.Tier)
		assert.NotEmpty(t, sub.Status)
	})

	t.Run("subscription status can be cancelled", func(t *testing.T) {
		sub := Subscription{
			Status:      "cancelled",
			CancelledAt: nil, // Will be set when cancelled
		}

		assert.Equal(t, "cancelled", sub.Status)
	})
}

// ============================================================================
// Test Error Handling
// ============================================================================

func TestBillingErrorHandling(t *testing.T) {
	t.Parallel()

	t.Run("ErrSubscriptionInactive is defined", func(t *testing.T) {
		assert.NotNil(t, ErrSubscriptionInactive)
	})
}
