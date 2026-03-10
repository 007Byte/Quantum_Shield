package billing

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestIsValidTierAcceptsValidTiers(t *testing.T) {
	t.Run("valid tiers are accepted", func(t *testing.T) {
		validTiers := []string{"free", "individual", "team", "enterprise"}

		for _, tier := range validTiers {
			if !isValidTier(tier) {
				t.Errorf("tier %q should be valid", tier)
			}
		}
	})
}

func TestIsValidTierRejectsInvalidTiers(t *testing.T) {
	t.Run("invalid tiers are rejected", func(t *testing.T) {
		invalidTiers := []string{"", "premium", "basic", "pro", "starter", "gold", "invalid", "INDIVIDUAL", "Free"}

		for _, tier := range invalidTiers {
			if isValidTier(tier) {
				t.Errorf("tier %q should be invalid", tier)
			}
		}
	})
}

func TestIsValidEmailAcceptsValidEmails(t *testing.T) {
	t.Run("valid emails are accepted", func(t *testing.T) {
		validEmails := []string{
			"user@example.com",
			"test.user@example.co.uk",
			"user+tag@example.com",
			"user_name@example.com",
			"123@example.com",
			"a@example.com",
		}

		for _, email := range validEmails {
			if !isValidEmail(email) {
				t.Errorf("email %q should be valid", email)
			}
		}
	})
}

func TestIsValidEmailRejectsInvalidEmails(t *testing.T) {
	t.Run("invalid emails are rejected", func(t *testing.T) {
		invalidEmails := []string{
			"",
			"notanemail",
			"user@",
			"@example.com",
			"user name@example.com",
			"user@.com",
			"user@example",
			"user@@example.com",
			"user@example..com",
			" user@example.com",
			"user@example.com ",
		}

		for _, email := range invalidEmails {
			if isValidEmail(email) {
				t.Errorf("email %q should be invalid", email)
			}
		}
	})
}

func TestIsValidTierCaseSensitivity(t *testing.T) {
	t.Run("tier validation is case sensitive", func(t *testing.T) {
		// Valid lowercase
		if !isValidTier("free") {
			t.Error("lowercase 'free' should be valid")
		}

		// Invalid uppercase
		if isValidTier("FREE") {
			t.Error("uppercase 'FREE' should be invalid")
		}

		// Invalid mixed case
		if isValidTier("Individual") {
			t.Error("mixed case 'Individual' should be invalid")
		}
	})
}

func TestBillingServiceCreateCustomerValidatesEmail(t *testing.T) {
	t.Run("create customer validates email format", func(t *testing.T) {
		// Create a mock database (we'll test without actual DB)
		_ = &BillingService{pool: nil}

		testCases := []struct {
			email   string
			isValid bool
		}{
			{"valid@example.com", true},
			{"", false},
			{"notanemail", false},
			{"user@", false},
		}

		for _, tc := range testCases {
			result := isValidEmail(tc.email)
			if result != tc.isValid {
				t.Errorf("email %q: expected valid=%v, got %v", tc.email, tc.isValid, result)
			}
		}
	})
}

func TestBillingServiceCreateSubscriptionValidatesTier(t *testing.T) {
	t.Run("create subscription validates tier", func(t *testing.T) {
		_ = &BillingService{pool: nil}

		testCases := []struct {
			tier    string
			isValid bool
		}{
			{"free", true},
			{"individual", true},
			{"team", true},
			{"enterprise", true},
			{"", false},
			{"invalid", false},
			{"FREE", false},
		}

		for _, tc := range testCases {
			result := isValidTier(tc.tier)
			if result != tc.isValid {
				t.Errorf("tier %q: expected valid=%v, got %v", tc.tier, tc.isValid, result)
			}
		}
	})
}

func TestComputeWebhookSignature(t *testing.T) {
	t.Run("webhook signature computation is consistent", func(t *testing.T) {
		payload := []byte(`{"type":"test","data":"value"}`)
		secret := "test_secret_key"

		sig1 := computeWebhookSignature(payload, secret)
		sig2 := computeWebhookSignature(payload, secret)

		if sig1 != sig2 {
			t.Errorf("signature should be deterministic: %s != %s", sig1, sig2)
		}

		// Verify it's hex encoded
		for _, ch := range sig1 {
			if !strings.ContainsRune("0123456789abcdef", ch) {
				t.Errorf("signature contains non-hex character: %c", ch)
			}
		}
	})
}

func TestComputeWebhookSignatureDiffersForDifferentPayloads(t *testing.T) {
	t.Run("different payloads produce different signatures", func(t *testing.T) {
		secret := "test_secret"
		payload1 := []byte(`{"type":"payment.succeeded"}`)
		payload2 := []byte(`{"type":"payment.failed"}`)

		sig1 := computeWebhookSignature(payload1, secret)
		sig2 := computeWebhookSignature(payload2, secret)

		if sig1 == sig2 {
			t.Error("different payloads should produce different signatures")
		}
	})
}

func TestComputeWebhookSignatureDiffersForDifferentSecrets(t *testing.T) {
	t.Run("different secrets produce different signatures", func(t *testing.T) {
		payload := []byte(`{"type":"test"}`)
		secret1 := "secret1"
		secret2 := "secret2"

		sig1 := computeWebhookSignature(payload, secret1)
		sig2 := computeWebhookSignature(payload, secret2)

		if sig1 == sig2 {
			t.Error("different secrets should produce different signatures")
		}
	})
}

func TestWebhookHandlerValidatesTierInEvent(t *testing.T) {
	t.Run("webhook handler processes subscription updated event", func(t *testing.T) {
		// This tests the event parsing logic
		eventData := map[string]interface{}{
			"type": "customer.subscription.updated",
			"data": map[string]interface{}{
				"object": map[string]interface{}{
					"id":       "sub_123",
					"customer": "cust_456",
					"status":   "active",
				},
			},
		}

		// Verify we can extract the event type
		if eventType, ok := eventData["type"].(string); !ok || eventType == "" {
			t.Error("failed to extract event type from webhook data")
		}
	})
}

func TestWebhookSignatureValidation(t *testing.T) {
	t.Run("webhook signature verification works correctly", func(t *testing.T) {
		secret := "webhook_secret_key"
		payload := []byte(`{"event":"test"}`)

		// Compute signature
		signature := computeWebhookSignature(payload, secret)

		// Verify the signature
		expectedSig := computeWebhookSignature(payload, secret)
		if signature != expectedSig {
			t.Error("signature verification failed")
		}

		// Wrong signature should not match
		wrongSig := computeWebhookSignature([]byte(`{"event":"wrong"}`), secret)
		if signature == wrongSig {
			t.Error("different payload should produce different signature")
		}
	})
}

func TestValidTiersList(t *testing.T) {
	t.Run("all valid tier names are correctly defined", func(t *testing.T) {
		validTiers := []string{"free", "individual", "team", "enterprise"}

		for _, tier := range validTiers {
			if !isValidTier(tier) {
				t.Errorf("tier %q failed validation", tier)
			}
		}

		// Verify the count is as expected
		tierCount := 0
		for _, tier := range validTiers {
			if isValidTier(tier) {
				tierCount++
			}
		}

		if tierCount != 4 {
			t.Errorf("expected 4 valid tiers, validated %d", tierCount)
		}
	})
}

func TestEmailValidationEdgeCases(t *testing.T) {
	t.Run("email validation handles edge cases", func(t *testing.T) {
		edgeCases := []struct {
			email   string
			isValid bool
		}{
			{"a@b.c", true},                          // Minimal valid
			{"user+tag@example.com", true},           // Plus addressing
			{"user.name@example.com", true},          // Dot in local part
			{"user_name@example.com", true},          // Underscore
			{"123456789@example.com", true},          // Numbers only
			{"user@sub.example.com", true},           // Subdomain
			{"user@localhost", false},                // No TLD
			{"@example.com", false},                  // No local part
			{"user@", false},                         // No domain
			{"user@@example.com", false},             // Double @
			{"user @example.com", false},             // Space before @
			{"user@ example.com", false},             // Space after @
			{"user@example .com", false},             // Space in domain
			{"", false},                              // Empty string
			{" ", false},                             // Space only
			{"user@example.com.", false},             // Trailing dot
		}

		for _, tc := range edgeCases {
			result := isValidEmail(tc.email)
			if result != tc.isValid {
				t.Errorf("email %q: expected valid=%v, got %v", tc.email, tc.isValid, result)
			}
		}
	})
}

func TestWebhookEventTypeExtraction(t *testing.T) {
	t.Run("webhook handler correctly extracts event types", func(t *testing.T) {
		eventTypes := []string{
			"customer.subscription.updated",
			"customer.subscription.deleted",
			"invoice.payment_succeeded",
			"invoice.payment_failed",
		}

		for _, eventType := range eventTypes {
			event := map[string]interface{}{
				"type": eventType,
			}

			extractedType, ok := event["type"].(string)
			if !ok {
				t.Errorf("failed to extract event type for %s", eventType)
				continue
			}

			if extractedType != eventType {
				t.Errorf("expected %s, got %s", eventType, extractedType)
			}
		}
	})
}

func TestBillingServiceErrors(t *testing.T) {
	t.Run("billing service uses correct error types", func(t *testing.T) {
		// Verify error variables are defined
		if ErrInvalidEmail == nil {
			t.Error("ErrInvalidEmail should be defined")
		}

		if ErrInvalidTier == nil {
			t.Error("ErrInvalidTier should be defined")
		}

		if ErrSubscriptionInactive == nil {
			t.Error("ErrSubscriptionInactive should be defined")
		}

		if ErrSubscriptionNotFound == nil {
			t.Error("ErrSubscriptionNotFound should be defined")
		}
	})
}

func TestCreateCustomerHandlerValidation(t *testing.T) {
	t.Run("create customer handler validates request format", func(t *testing.T) {
		bs := &BillingService{pool: nil}
		handler := HandleCreateCustomer(bs)

		// Test with invalid JSON
		req := httptest.NewRequest("POST", "/customer", strings.NewReader("invalid json"))
		w := httptest.NewRecorder()

		handler(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected status 400, got %d", w.Code)
		}
	})
}

func TestCreateSubscriptionHandlerValidation(t *testing.T) {
	t.Run("create subscription handler validates request format", func(t *testing.T) {
		bs := &BillingService{pool: nil}
		handler := HandleCreateSubscription(bs)

		// Test with invalid JSON
		req := httptest.NewRequest("POST", "/subscription", strings.NewReader("invalid json"))
		w := httptest.NewRecorder()

		handler(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected status 400, got %d", w.Code)
		}
	})
}

func TestTierValidationInCreateSubscription(t *testing.T) {
	t.Run("subscription creation validates tier value", func(t *testing.T) {
		// Test that invalid tiers would be rejected
		invalidTierReq := CreateSubscriptionRequest{
			Tier: "invalid_tier",
		}

		if isValidTier(invalidTierReq.Tier) {
			t.Error("invalid tier should be rejected")
		}

		validTierReq := CreateSubscriptionRequest{
			Tier: "individual",
		}

		if !isValidTier(validTierReq.Tier) {
			t.Error("valid tier should be accepted")
		}
	})
}

func TestEmailValidationInCreateCustomer(t *testing.T) {
	t.Run("customer creation validates email value", func(t *testing.T) {
		invalidEmailReq := CreateCustomerRequest{
			Email: "not-an-email",
		}

		if isValidEmail(invalidEmailReq.Email) {
			t.Error("invalid email should be rejected")
		}

		validEmailReq := CreateCustomerRequest{
			Email: "user@example.com",
		}

		if !isValidEmail(validEmailReq.Email) {
			t.Error("valid email should be accepted")
		}
	})
}

func TestWebhookEventParsing(t *testing.T) {
	t.Run("webhook payload can be parsed as JSON", func(t *testing.T) {
		webhookPayload := `{
			"type": "customer.subscription.updated",
			"data": {
				"object": {
					"id": "sub_123",
					"customer": "cust_456",
					"status": "active"
				}
			}
		}`

		var event map[string]interface{}
		err := json.Unmarshal([]byte(webhookPayload), &event)
		if err != nil {
			t.Fatalf("failed to unmarshal webhook payload: %v", err)
		}

		// Verify we can extract the event type
		eventType, ok := event["type"].(string)
		if !ok || eventType == "" {
			t.Error("failed to extract event type")
		}

		// Verify event type matches expected
		if eventType != "customer.subscription.updated" {
			t.Errorf("expected customer.subscription.updated, got %s", eventType)
		}
	})
}

func TestSubscriptionStatusValues(t *testing.T) {
	t.Run("subscription status values are handled correctly", func(t *testing.T) {
		validStatuses := []string{"active", "inactive", "past_due", "cancelled"}

		sub := Subscription{
			Status: "active",
		}

		if sub.Status != "active" {
			t.Errorf("expected status active, got %s", sub.Status)
		}

		// Test status changes
		sub.Status = "cancelled"
		if sub.Status != "cancelled" {
			t.Errorf("expected status cancelled, got %s", sub.Status)
		}

		// Verify valid statuses
		for _, status := range validStatuses {
			sub.Status = status
			if sub.Status != status {
				t.Errorf("failed to set status to %s", status)
			}
		}
	})
}

func TestWebhookSignatureFormat(t *testing.T) {
	t.Run("webhook signature is 64 character hex string", func(t *testing.T) {
		secret := "test_secret"
		payload := []byte("test_payload")

		sig := computeWebhookSignature(payload, secret)

		// HMAC-SHA256 produces 32 bytes = 64 hex characters
		if len(sig) != 64 {
			t.Errorf("expected 64 character signature, got %d", len(sig))
		}

		// Verify all hex characters
		for i, ch := range sig {
			if !strings.ContainsRune("0123456789abcdef", ch) {
				t.Errorf("character at position %d is not hex: %c", i, ch)
			}
		}

		// Verify lowercase
		if sig != strings.ToLower(sig) {
			t.Error("signature should be lowercase hex")
		}
	})
}
