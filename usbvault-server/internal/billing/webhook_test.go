package billing

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestValidHMACSignaturePasses(t *testing.T) {
	t.Run("valid HMAC signature passes verification", func(t *testing.T) {
		// Setup
		webhook_secret := "test_secret_key"
		os.Setenv("STRIPE_WEBHOOK_SECRET", webhook_secret)
		defer os.Unsetenv("STRIPE_WEBHOOK_SECRET")

		mockPool := NewMockPool()
		bs := NewBillingService("stripe_key", mockPool)

		// Create test payload
		payload := []byte(`{"type":"customer.subscription.updated","data":{"object":{"id":"sub_123"}}}`)

		// Compute valid signature
		h := hmac.New(sha256.New, []byte(webhook_secret))
		h.Write(payload)
		validSig := hex.EncodeToString(h.Sum(nil))

		// Create request
		req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(payload))
		req.Header.Set("Stripe-Signature", validSig)

		w := httptest.NewRecorder()
		handler := HandleWebhook(bs)
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d", w.Code)
		}
	})
}

func TestInvalidHMACSignatureFails(t *testing.T) {
	t.Run("invalid HMAC signature returns 401", func(t *testing.T) {
		webhook_secret := "test_secret_key"
		os.Setenv("STRIPE_WEBHOOK_SECRET", webhook_secret)
		defer os.Unsetenv("STRIPE_WEBHOOK_SECRET")

		mockPool := NewMockPool()
		bs := NewBillingService("stripe_key", mockPool)

		payload := []byte(`{"type":"customer.subscription.updated"}`)
		invalidSig := "invalid_signature_hash"

		req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(payload))
		req.Header.Set("Stripe-Signature", invalidSig)

		w := httptest.NewRecorder()
		handler := HandleWebhook(bs)
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected status 401, got %d", w.Code)
		}
	})
}

func TestMissingSignatureHeaderFails(t *testing.T) {
	t.Run("missing signature header returns 401", func(t *testing.T) {
		webhook_secret := "test_secret_key"
		os.Setenv("STRIPE_WEBHOOK_SECRET", webhook_secret)
		defer os.Unsetenv("STRIPE_WEBHOOK_SECRET")

		mockPool := NewMockPool()
		bs := NewBillingService("stripe_key", mockPool)

		payload := []byte(`{"type":"customer.subscription.updated"}`)

		req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(payload))
		// No Stripe-Signature header

		w := httptest.NewRecorder()
		handler := HandleWebhook(bs)
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected status 401 for missing signature, got %d", w.Code)
		}
	})
}

func TestEmptyWebhookSecretReturnsError(t *testing.T) {
	t.Run("empty webhook secret returns 500", func(t *testing.T) {
		// Clear webhook secret
		os.Unsetenv("STRIPE_WEBHOOK_SECRET")

		mockPool := NewMockPool()
		bs := NewBillingService("stripe_key", mockPool)

		payload := []byte(`{"type":"customer.subscription.updated"}`)

		req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(payload))
		req.Header.Set("Stripe-Signature", "any_signature")

		w := httptest.NewRecorder()
		handler := HandleWebhook(bs)
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusInternalServerError {
			t.Errorf("expected status 500 for missing secret, got %d", w.Code)
		}
	})
}

func TestWebhookEventTypeRouting(t *testing.T) {
	t.Run("webhook events are routed correctly", func(t *testing.T) {
		webhook_secret := "test_secret_key"
		os.Setenv("STRIPE_WEBHOOK_SECRET", webhook_secret)
		defer os.Unsetenv("STRIPE_WEBHOOK_SECRET")

		testCases := []struct {
			eventType string
			shouldHandle bool
		}{
			{"customer.subscription.updated", true},
			{"customer.subscription.deleted", true},
			{"invoice.payment_succeeded", true},
			{"invoice.payment_failed", true},
			{"charge.refunded", false}, // Unhandled event type
		}

		for _, tc := range testCases {
			t.Run(tc.eventType, func(t *testing.T) {
				mockPool := NewMockPool()
				bs := NewBillingService("stripe_key", mockPool)

				event := map[string]interface{}{
					"type": tc.eventType,
					"data": map[string]interface{}{
						"object": map[string]interface{}{
							"id": "test_id",
						},
					},
				}

				payload, _ := json.Marshal(event)

				h := hmac.New(sha256.New, []byte(webhook_secret))
				h.Write(payload)
				validSig := hex.EncodeToString(h.Sum(nil))

				req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(payload))
				req.Header.Set("Stripe-Signature", validSig)

				w := httptest.NewRecorder()
				handler := HandleWebhook(bs)
				handler.ServeHTTP(w, req)

				// All valid event types and properly formatted requests should return 200
				if w.Code != http.StatusOK {
					t.Errorf("expected status 200, got %d", w.Code)
				}
			})
		}
	})
}

func TestSubscriptionUpdatedEvent(t *testing.T) {
	t.Run("customer.subscription.updated event is handled", func(t *testing.T) {
		webhook_secret := "test_secret_key"
		os.Setenv("STRIPE_WEBHOOK_SECRET", webhook_secret)
		defer os.Unsetenv("STRIPE_WEBHOOK_SECRET")

		mockPool := NewMockPool()
		bs := NewBillingService("stripe_key", mockPool)

		event := map[string]interface{}{
			"type": "customer.subscription.updated",
			"data": map[string]interface{}{
				"object": map[string]interface{}{
					"id":     "sub_123",
					"status": "active",
				},
			},
		}

		payload, _ := json.Marshal(event)

		h := hmac.New(sha256.New, []byte(webhook_secret))
		h.Write(payload)
		validSig := hex.EncodeToString(h.Sum(nil))

		req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(payload))
		req.Header.Set("Stripe-Signature", validSig)

		w := httptest.NewRecorder()
		handler := HandleWebhook(bs)
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d", w.Code)
		}

		var response map[string]string
		json.Unmarshal(w.Body.Bytes(), &response)
		if response["status"] != "received" {
			t.Errorf("expected status 'received', got %s", response["status"])
		}
	})
}

func TestSubscriptionDeletedEvent(t *testing.T) {
	t.Run("customer.subscription.deleted event is handled", func(t *testing.T) {
		webhook_secret := "test_secret_key"
		os.Setenv("STRIPE_WEBHOOK_SECRET", webhook_secret)
		defer os.Unsetenv("STRIPE_WEBHOOK_SECRET")

		mockPool := NewMockPool()
		bs := NewBillingService("stripe_key", mockPool)

		event := map[string]interface{}{
			"type": "customer.subscription.deleted",
			"data": map[string]interface{}{
				"object": map[string]interface{}{
					"id": "sub_456",
				},
			},
		}

		payload, _ := json.Marshal(event)

		h := hmac.New(sha256.New, []byte(webhook_secret))
		h.Write(payload)
		validSig := hex.EncodeToString(h.Sum(nil))

		req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(payload))
		req.Header.Set("Stripe-Signature", validSig)

		w := httptest.NewRecorder()
		handler := HandleWebhook(bs)
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200 for subscription deleted, got %d", w.Code)
		}
	})
}

func TestPaymentSucceededEvent(t *testing.T) {
	t.Run("invoice.payment_succeeded event is handled", func(t *testing.T) {
		webhook_secret := "test_secret_key"
		os.Setenv("STRIPE_WEBHOOK_SECRET", webhook_secret)
		defer os.Unsetenv("STRIPE_WEBHOOK_SECRET")

		mockPool := NewMockPool()
		bs := NewBillingService("stripe_key", mockPool)

		event := map[string]interface{}{
			"type": "invoice.payment_succeeded",
			"data": map[string]interface{}{
				"object": map[string]interface{}{
					"id": "inv_789",
				},
			},
		}

		payload, _ := json.Marshal(event)

		h := hmac.New(sha256.New, []byte(webhook_secret))
		h.Write(payload)
		validSig := hex.EncodeToString(h.Sum(nil))

		req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(payload))
		req.Header.Set("Stripe-Signature", validSig)

		w := httptest.NewRecorder()
		handler := HandleWebhook(bs)
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200 for payment succeeded, got %d", w.Code)
		}
	})
}

func TestPaymentFailedEvent(t *testing.T) {
	t.Run("invoice.payment_failed event is handled", func(t *testing.T) {
		webhook_secret := "test_secret_key"
		os.Setenv("STRIPE_WEBHOOK_SECRET", webhook_secret)
		defer os.Unsetenv("STRIPE_WEBHOOK_SECRET")

		mockPool := NewMockPool()
		bs := NewBillingService("stripe_key", mockPool)

		event := map[string]interface{}{
			"type": "invoice.payment_failed",
			"data": map[string]interface{}{
				"object": map[string]interface{}{
					"id": "inv_999",
				},
			},
		}

		payload, _ := json.Marshal(event)

		h := hmac.New(sha256.New, []byte(webhook_secret))
		h.Write(payload)
		validSig := hex.EncodeToString(h.Sum(nil))

		req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(payload))
		req.Header.Set("Stripe-Signature", validSig)

		w := httptest.NewRecorder()
		handler := HandleWebhook(bs)
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200 for payment failed, got %d", w.Code)
		}
	})
}

func TestMalformedPayloadReturnsError(t *testing.T) {
	t.Run("malformed webhook payload returns 400", func(t *testing.T) {
		webhook_secret := "test_secret_key"
		os.Setenv("STRIPE_WEBHOOK_SECRET", webhook_secret)
		defer os.Unsetenv("STRIPE_WEBHOOK_SECRET")

		mockPool := NewMockPool()
		bs := NewBillingService("stripe_key", mockPool)

		invalidPayload := []byte(`{invalid json}`)

		h := hmac.New(sha256.New, []byte(webhook_secret))
		h.Write(invalidPayload)
		validSig := hex.EncodeToString(h.Sum(nil))

		req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(invalidPayload))
		req.Header.Set("Stripe-Signature", validSig)

		w := httptest.NewRecorder()
		handler := HandleWebhook(bs)
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected status 400 for malformed payload, got %d", w.Code)
		}
	})
}

func TestWebhookResponseFormat(t *testing.T) {
	t.Run("webhook response is properly formatted JSON", func(t *testing.T) {
		webhook_secret := "test_secret_key"
		os.Setenv("STRIPE_WEBHOOK_SECRET", webhook_secret)
		defer os.Unsetenv("STRIPE_WEBHOOK_SECRET")

		mockPool := NewMockPool()
		bs := NewBillingService("stripe_key", mockPool)

		event := map[string]interface{}{
			"type": "customer.subscription.updated",
			"data": map[string]interface{}{
				"object": map[string]interface{}{
					"id": "sub_123",
				},
			},
		}

		payload, _ := json.Marshal(event)

		h := hmac.New(sha256.New, []byte(webhook_secret))
		h.Write(payload)
		validSig := hex.EncodeToString(h.Sum(nil))

		req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(payload))
		req.Header.Set("Stripe-Signature", validSig)

		w := httptest.NewRecorder()
		handler := HandleWebhook(bs)
		handler.ServeHTTP(w, req)

		if w.Header().Get("Content-Type") != "application/json" {
			t.Error("response should have Content-Type application/json")
		}

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		if err != nil {
			t.Errorf("response should be valid JSON: %v", err)
		}

		if response["status"] != "received" {
			t.Errorf("response should contain status 'received', got %v", response["status"])
		}
	})
}

// Mock database pool for testing
type MockPool struct{}

func NewMockPool() *MockPool {
	return &MockPool{}
}

func (m *MockPool) Exec(ctx context.Context, sql string, args ...interface{}) (interface{}, error) {
	return nil, nil
}

func (m *MockPool) Query(ctx context.Context, sql string, args ...interface{}) (interface{}, error) {
	return nil, nil
}

func (m *MockPool) QueryRow(ctx context.Context, sql string, args ...interface{}) interface{} {
	return nil
}

func (m *MockPool) Begin(ctx context.Context) (interface{}, error) {
	return nil, nil
}

func (m *MockPool) Close() {}

// Helper function for testing HMAC signature computation
func computeTestSignature(payload []byte, secret string) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write(payload)
	return hex.EncodeToString(h.Sum(nil))
}

func TestSignatureComputationConsistency(t *testing.T) {
	t.Run("signature computation is consistent", func(t *testing.T) {
		payload := []byte(`{"test":"data"}`)
		secret := "test_secret"

		sig1 := computeTestSignature(payload, secret)
		sig2 := computeTestSignature(payload, secret)

		if sig1 != sig2 {
			t.Error("same payload and secret should produce same signature")
		}
	})
}

func TestDifferentSecretsProduceDifferentSignatures(t *testing.T) {
	t.Run("different secrets produce different signatures", func(t *testing.T) {
		payload := []byte(`{"test":"data"}`)

		sig1 := computeTestSignature(payload, "secret1")
		sig2 := computeTestSignature(payload, "secret2")

		if sig1 == sig2 {
			t.Error("different secrets should produce different signatures")
		}
	})
}
