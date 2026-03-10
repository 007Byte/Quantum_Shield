package audit

import (
	"testing"
	"time"
)

func TestSecurityEventStructHasRequiredFields(t *testing.T) {
	t.Run("security event struct contains all required fields", func(t *testing.T) {
		event := SecurityEvent{
			EventType:    "AUTH_LOGIN",
			Severity:     "INFO",
			SourceIP:     "192.168.1.1",
			UserAgent:    "Mozilla/5.0",
			UserID:       "user123",
			ResourceType: "vault",
			ResourceID:   "vault456",
			Outcome:      "success",
			Timestamp:    time.Now(),
			Details:      "User logged in successfully",
		}

		// Verify all fields are present and non-empty
		if event.EventType == "" {
			t.Error("EventType is required")
		}
		if event.Severity == "" {
			t.Error("Severity is required")
		}
		if event.SourceIP == "" {
			t.Error("SourceIP is required")
		}
		if event.UserAgent == "" {
			t.Error("UserAgent is required")
		}
		if event.UserID == "" {
			t.Error("UserID is required")
		}
		if event.ResourceType == "" {
			t.Error("ResourceType is required")
		}
		if event.ResourceID == "" {
			t.Error("ResourceID is required")
		}
		if event.Outcome == "" {
			t.Error("Outcome is required")
		}
		if event.Timestamp.IsZero() {
			t.Error("Timestamp is required")
		}
	})
}

func TestAuthLoginEventTypeConstant(t *testing.T) {
	t.Run("AUTH_LOGIN event type constant is defined", func(t *testing.T) {
		if EventAuthLogin == "" {
			t.Error("EventAuthLogin constant is empty")
		}

		if EventAuthLogin != "AUTH_LOGIN" {
			t.Errorf("expected AUTH_LOGIN, got %s", EventAuthLogin)
		}
	})
}

func TestAuthLogoutEventTypeConstant(t *testing.T) {
	t.Run("AUTH_LOGOUT event type constant is defined", func(t *testing.T) {
		if EventAuthLogout == "" {
			t.Error("EventAuthLogout constant is empty")
		}

		if EventAuthLogout != "AUTH_LOGOUT" {
			t.Errorf("expected AUTH_LOGOUT, got %s", EventAuthLogout)
		}
	})
}

func TestAuthFailedEventTypeConstant(t *testing.T) {
	t.Run("AUTH_FAILED event type constant is defined", func(t *testing.T) {
		if EventAuthFailed == "" {
			t.Error("EventAuthFailed constant is empty")
		}

		if EventAuthFailed != "AUTH_FAILED" {
			t.Errorf("expected AUTH_FAILED, got %s", EventAuthFailed)
		}
	})
}

func TestTokenRefreshEventTypeConstant(t *testing.T) {
	t.Run("TOKEN_REFRESH event type constant is defined", func(t *testing.T) {
		if EventTokenRefresh == "" {
			t.Error("EventTokenRefresh constant is empty")
		}

		if EventTokenRefresh != "TOKEN_REFRESH" {
			t.Errorf("expected TOKEN_REFRESH, got %s", EventTokenRefresh)
		}
	})
}

func TestPermissionDeniedEventTypeConstant(t *testing.T) {
	t.Run("PERMISSION_DENIED event type constant is defined", func(t *testing.T) {
		if EventPermissionDenied == "" {
			t.Error("EventPermissionDenied constant is empty")
		}

		if EventPermissionDenied != "PERMISSION_DENIED" {
			t.Errorf("expected PERMISSION_DENIED, got %s", EventPermissionDenied)
		}
	})
}

func TestDataAccessEventTypeConstant(t *testing.T) {
	t.Run("DATA_ACCESS event type constant is defined", func(t *testing.T) {
		if EventDataAccess == "" {
			t.Error("EventDataAccess constant is empty")
		}

		if EventDataAccess != "DATA_ACCESS" {
			t.Errorf("expected DATA_ACCESS, got %s", EventDataAccess)
		}
	})
}

func TestDataExportEventTypeConstant(t *testing.T) {
	t.Run("DATA_EXPORT event type constant is defined", func(t *testing.T) {
		if EventDataExport == "" {
			t.Error("EventDataExport constant is empty")
		}

		if EventDataExport != "DATA_EXPORT" {
			t.Errorf("expected DATA_EXPORT, got %s", EventDataExport)
		}
	})
}

func TestConfigChangeEventTypeConstant(t *testing.T) {
	t.Run("CONFIG_CHANGE event type constant is defined", func(t *testing.T) {
		if EventConfigChange == "" {
			t.Error("EventConfigChange constant is empty")
		}

		if EventConfigChange != "CONFIG_CHANGE" {
			t.Errorf("expected CONFIG_CHANGE, got %s", EventConfigChange)
		}
	})
}

func TestAccountCreatedEventTypeConstant(t *testing.T) {
	t.Run("ACCOUNT_CREATED event type constant is defined", func(t *testing.T) {
		if EventAccountCreated == "" {
			t.Error("EventAccountCreated constant is empty")
		}

		if EventAccountCreated != "ACCOUNT_CREATED" {
			t.Errorf("expected ACCOUNT_CREATED, got %s", EventAccountCreated)
		}
	})
}

func TestAccountDeletedEventTypeConstant(t *testing.T) {
	t.Run("ACCOUNT_DELETED event type constant is defined", func(t *testing.T) {
		if EventAccountDeleted == "" {
			t.Error("EventAccountDeleted constant is empty")
		}

		if EventAccountDeleted != "ACCOUNT_DELETED" {
			t.Errorf("expected ACCOUNT_DELETED, got %s", EventAccountDeleted)
		}
	})
}

func TestSeverityInfoConstant(t *testing.T) {
	t.Run("SeverityInfo constant is defined", func(t *testing.T) {
		if SeverityInfo == "" {
			t.Error("SeverityInfo constant is empty")
		}

		if SeverityInfo != "INFO" {
			t.Errorf("expected INFO, got %s", SeverityInfo)
		}
	})
}

func TestSeverityWarnConstant(t *testing.T) {
	t.Run("SeverityWarn constant is defined", func(t *testing.T) {
		if SeverityWarn == "" {
			t.Error("SeverityWarn constant is empty")
		}

		if SeverityWarn != "WARN" {
			t.Errorf("expected WARN, got %s", SeverityWarn)
		}
	})
}

func TestSeverityCriticalConstant(t *testing.T) {
	t.Run("SeverityCritical constant is defined", func(t *testing.T) {
		if SeverityCritical == "" {
			t.Error("SeverityCritical constant is empty")
		}

		if SeverityCritical != "CRITICAL" {
			t.Errorf("expected CRITICAL, got %s", SeverityCritical)
		}
	})
}

func TestSecurityEventTypeValidation(t *testing.T) {
	t.Run("security event type values are valid", func(t *testing.T) {
		validEventTypes := []string{
			EventAuthLogin,
			EventAuthLogout,
			EventAuthFailed,
			EventTokenRefresh,
			EventPermissionDenied,
			EventDataAccess,
			EventDataExport,
			EventConfigChange,
			EventAccountCreated,
			EventAccountDeleted,
		}

		for _, eventType := range validEventTypes {
			if eventType == "" {
				t.Error("event type constant is empty")
			}
		}

		// Verify all are unique
		seen := make(map[string]bool)
		for _, eventType := range validEventTypes {
			if seen[eventType] {
				t.Errorf("duplicate event type: %s", eventType)
			}
			seen[eventType] = true
		}
	})
}

func TestSecurityEventSeverityValidation(t *testing.T) {
	t.Run("security event severity values are valid", func(t *testing.T) {
		validSeverities := []string{
			SeverityInfo,
			SeverityWarn,
			SeverityCritical,
		}

		for _, severity := range validSeverities {
			if severity == "" {
				t.Error("severity constant is empty")
			}
		}

		// Verify all are unique
		seen := make(map[string]bool)
		for _, severity := range validSeverities {
			if seen[severity] {
				t.Errorf("duplicate severity: %s", severity)
			}
			seen[severity] = true
		}
	})
}

func TestSecurityEventCreationWithAllFields(t *testing.T) {
	t.Run("security event can be created with all fields", func(t *testing.T) {
		timestamp := time.Now()
		event := SecurityEvent{
			EventType:    EventAuthLogin,
			Severity:     SeverityInfo,
			SourceIP:     "10.0.0.1",
			UserAgent:    "Mozilla/5.0",
			UserID:       "user_abc_123",
			ResourceType: "vault",
			ResourceID:   "vault_xyz_789",
			Outcome:      "success",
			Timestamp:    timestamp,
			Details:      "Successful login from trusted device",
		}

		// Verify all fields
		if event.EventType != EventAuthLogin {
			t.Errorf("expected event type %s, got %s", EventAuthLogin, event.EventType)
		}
		if event.Severity != SeverityInfo {
			t.Errorf("expected severity %s, got %s", SeverityInfo, event.Severity)
		}
		if event.SourceIP != "10.0.0.1" {
			t.Errorf("expected IP 10.0.0.1, got %s", event.SourceIP)
		}
		if event.UserID != "user_abc_123" {
			t.Errorf("expected user ID user_abc_123, got %s", event.UserID)
		}
		if event.Outcome != "success" {
			t.Errorf("expected outcome success, got %s", event.Outcome)
		}
		if event.Timestamp != timestamp {
			t.Error("timestamp was modified")
		}
	})
}

func TestSecurityEventAuthenticationScenarios(t *testing.T) {
	t.Run("authentication events are properly defined", func(t *testing.T) {
		testCases := []struct {
			scenario string
			event    string
			severity string
		}{
			{"successful login", EventAuthLogin, SeverityInfo},
			{"user logout", EventAuthLogout, SeverityInfo},
			{"failed login", EventAuthFailed, SeverityWarn},
			{"token refresh", EventTokenRefresh, SeverityInfo},
		}

		for _, tc := range testCases {
			if tc.event == "" {
				t.Errorf("scenario %q: event type is empty", tc.scenario)
			}
			if tc.severity == "" {
				t.Errorf("scenario %q: severity is empty", tc.scenario)
			}
		}
	})
}

func TestSecurityEventDataAccessScenarios(t *testing.T) {
	t.Run("data access events are properly defined", func(t *testing.T) {
		testCases := []struct {
			scenario string
			event    string
			severity string
		}{
			{"data access", EventDataAccess, SeverityInfo},
			{"data export", EventDataExport, SeverityWarn},
			{"permission denied", EventPermissionDenied, SeverityCritical},
		}

		for _, tc := range testCases {
			if tc.event == "" {
				t.Errorf("scenario %q: event type is empty", tc.scenario)
			}
			if tc.severity == "" {
				t.Errorf("scenario %q: severity is empty", tc.scenario)
			}
		}
	})
}

func TestSecurityEventAdministrationScenarios(t *testing.T) {
	t.Run("administration events are properly defined", func(t *testing.T) {
		testCases := []struct {
			scenario string
			event    string
			severity string
		}{
			{"config change", EventConfigChange, SeverityWarn},
			{"account created", EventAccountCreated, SeverityInfo},
			{"account deleted", EventAccountDeleted, SeverityCritical},
		}

		for _, tc := range testCases {
			if tc.event == "" {
				t.Errorf("scenario %q: event type is empty", tc.scenario)
			}
			if tc.severity == "" {
				t.Errorf("scenario %q: severity is empty", tc.severity)
			}
		}
	})
}

func TestSecurityEventOutcomeValues(t *testing.T) {
	t.Run("security event outcome values are valid", func(t *testing.T) {
		validOutcomes := []string{"success", "failure"}

		event := SecurityEvent{
			EventType: EventAuthLogin,
			Outcome:   "success",
		}

		if !contains(validOutcomes, event.Outcome) {
			t.Errorf("invalid outcome: %s", event.Outcome)
		}

		event.Outcome = "failure"
		if !contains(validOutcomes, event.Outcome) {
			t.Errorf("invalid outcome: %s", event.Outcome)
		}
	})
}

func TestSecurityEventTimestampHandling(t *testing.T) {
	t.Run("security event timestamp is properly handled", func(t *testing.T) {
		// Test with zero timestamp
		event := SecurityEvent{
			EventType: EventAuthLogin,
		}

		if !event.Timestamp.IsZero() {
			t.Error("expected zero timestamp initially")
		}

		// Test with set timestamp
		now := time.Now()
		event.Timestamp = now

		if event.Timestamp != now {
			t.Errorf("timestamp not properly set")
		}

		// Test that timestamps are UTC capable
		utcTime := time.Now().UTC()
		event.Timestamp = utcTime

		if event.Timestamp.Location() == nil {
			t.Error("timestamp location should be set")
		}
	})
}

func TestSecurityEventResourceTypes(t *testing.T) {
	t.Run("security event resource types are valid", func(t *testing.T) {
		validResourceTypes := []string{"vault", "blob", "share", "user"}

		for _, resourceType := range validResourceTypes {
			event := SecurityEvent{
				EventType:    EventDataAccess,
				ResourceType: resourceType,
				ResourceID:   "resource_123",
			}

			if event.ResourceType != resourceType {
				t.Errorf("expected resource type %s, got %s", resourceType, event.ResourceType)
			}
		}
	})
}

func TestSecurityEventWithDetails(t *testing.T) {
	t.Run("security event details field is optional", func(t *testing.T) {
		// Test without details
		event1 := SecurityEvent{
			EventType: EventAuthLogin,
			Severity:  SeverityInfo,
		}

		if event1.Details != "" {
			t.Error("expected empty details")
		}

		// Test with details
		event2 := SecurityEvent{
			EventType: EventAuthLogin,
			Severity:  SeverityInfo,
			Details:   "Login from new device",
		}

		if event2.Details != "Login from new device" {
			t.Errorf("details not properly set: %s", event2.Details)
		}
	})
}

func TestSecurityEventIPAddresses(t *testing.T) {
	t.Run("security event handles various IP formats", func(t *testing.T) {
		testCases := []string{
			"192.168.1.1",
			"10.0.0.1",
			"2001:0db8:85a3:0000:0000:8a2e:0370:7334",
			"127.0.0.1",
			"::1",
		}

		for _, ip := range testCases {
			event := SecurityEvent{
				EventType: EventAuthLogin,
				SourceIP:  ip,
			}

			if event.SourceIP != ip {
				t.Errorf("IP not properly stored: %s", event.SourceIP)
			}
		}
	})
}

func TestSecurityEventUserAgents(t *testing.T) {
	t.Run("security event handles various user agent formats", func(t *testing.T) {
		testCases := []string{
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
			"curl/7.68.0",
			"python-requests/2.25.1",
		}

		for _, ua := range testCases {
			event := SecurityEvent{
				EventType: EventAuthLogin,
				UserAgent: ua,
			}

			if event.UserAgent != ua {
				t.Errorf("user agent not properly stored: %s", event.UserAgent)
			}
		}
	})
}

func TestSecurityEventIDs(t *testing.T) {
	t.Run("security event handles user and resource IDs", func(t *testing.T) {
		testCases := []struct {
			userID     string
			resourceID string
		}{
			{"user123", "resource456"},
			{"abcd-1234-efgh-5678", "vault-xyz-789"},
			{"user@example.com", "vault_id_with_underscores"},
		}

		for _, tc := range testCases {
			event := SecurityEvent{
				EventType:  EventDataAccess,
				UserID:     tc.userID,
				ResourceID: tc.resourceID,
			}

			if event.UserID != tc.userID {
				t.Errorf("user ID not properly stored: %s", event.UserID)
			}

			if event.ResourceID != tc.resourceID {
				t.Errorf("resource ID not properly stored: %s", event.ResourceID)
			}
		}
	})
}

func TestSecurityEventConstantsAreDistinct(t *testing.T) {
	t.Run("all event type constants are distinct", func(t *testing.T) {
		events := map[string]string{
			"AUTH_LOGIN":       EventAuthLogin,
			"AUTH_LOGOUT":      EventAuthLogout,
			"AUTH_FAILED":      EventAuthFailed,
			"TOKEN_REFRESH":    EventTokenRefresh,
			"PERMISSION_DENIED": EventPermissionDenied,
			"DATA_ACCESS":      EventDataAccess,
			"DATA_EXPORT":      EventDataExport,
			"CONFIG_CHANGE":    EventConfigChange,
			"ACCOUNT_CREATED":  EventAccountCreated,
			"ACCOUNT_DELETED":  EventAccountDeleted,
		}

		seen := make(map[string]bool)
		for name, value := range events {
			if seen[value] {
				t.Errorf("duplicate event value for %s: %s", name, value)
			}
			seen[value] = true
		}
	})
}

func TestSecurityEventSeverityConstantsAreDistinct(t *testing.T) {
	t.Run("all severity constants are distinct", func(t *testing.T) {
		severities := map[string]string{
			"INFO":     SeverityInfo,
			"WARN":     SeverityWarn,
			"CRITICAL": SeverityCritical,
		}

		seen := make(map[string]bool)
		for name, value := range severities {
			if seen[value] {
				t.Errorf("duplicate severity value for %s: %s", name, value)
			}
			seen[value] = true
		}

		// Verify count
		if len(severities) != 3 {
			t.Errorf("expected 3 severity levels, got %d", len(severities))
		}
	})
}

func contains(slice []string, item string) bool {
	for _, v := range slice {
		if v == item {
			return true
		}
	}
	return false
}
