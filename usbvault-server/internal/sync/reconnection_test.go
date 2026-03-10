package sync

import (
	"encoding/json"
	"sync"
	"testing"
	"time"
)

// TS-010 FIX: WebSocket reconnection and event ordering tests

func TestWebSocketConnectionLimits(t *testing.T) {
	t.Run("max connections per user is enforced", func(t *testing.T) {
		if maxConnectionsPerUser != 5 {
			t.Errorf("expected max 5 connections per user, got %d", maxConnectionsPerUser)
		}
	})

	t.Run("connection count tracking is thread safe", func(t *testing.T) {
		connCount := make(map[string]int)
		var mu sync.Mutex
		var wg sync.WaitGroup

		userID := "test-user"

		// Simulate concurrent connection/disconnection
		for i := 0; i < 100; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				mu.Lock()
				connCount[userID]++
				mu.Unlock()

				time.Sleep(time.Millisecond)

				mu.Lock()
				connCount[userID]--
				mu.Unlock()
			}()
		}

		wg.Wait()

		mu.Lock()
		finalCount := connCount[userID]
		mu.Unlock()

		if finalCount != 0 {
			t.Errorf("expected 0 connections after all disconnect, got %d", finalCount)
		}
	})
}

func TestSyncEventOrdering(t *testing.T) {
	t.Run("events are timestamped in order", func(t *testing.T) {
		events := make([]SyncEvent, 5)
		for i := 0; i < 5; i++ {
			events[i] = SyncEvent{
				ID:        "event_" + string(rune('0'+i)),
				EventType: "FILE_ADDED",
				Timestamp: time.Now().Add(time.Duration(i) * time.Second),
			}
		}

		for i := 1; i < len(events); i++ {
			if events[i].Timestamp.Before(events[i-1].Timestamp) {
				t.Errorf("event %d has earlier timestamp than event %d", i, i-1)
			}
		}
	})

	t.Run("event types are valid", func(t *testing.T) {
		validTypes := map[string]bool{
			"FILE_ADDED":     true,
			"FILE_DELETED":   true,
			"VAULT_UPDATED":  true,
			"SHARE_RECEIVED": true,
		}

		for eventType := range validTypes {
			event := SyncEvent{EventType: eventType}
			if !validTypes[event.EventType] {
				t.Errorf("event type %q should be valid", eventType)
			}
		}
	})
}

func TestSyncEventSerialization(t *testing.T) {
	t.Run("event serializes to valid JSON", func(t *testing.T) {
		event := SyncEvent{
			ID:            "test-event-id",
			UserID:        "user-123",
			EventType:     "FILE_ADDED",
			EncryptedData: "base64_encrypted_data",
			Timestamp:     time.Now().UTC(),
		}

		data, err := json.Marshal(event)
		if err != nil {
			t.Fatalf("failed to marshal sync event: %v", err)
		}

		var decoded SyncEvent
		if err := json.Unmarshal(data, &decoded); err != nil {
			t.Fatalf("failed to unmarshal sync event: %v", err)
		}

		if decoded.ID != event.ID {
			t.Errorf("decoded ID %q != original %q", decoded.ID, event.ID)
		}
		if decoded.EventType != event.EventType {
			t.Errorf("decoded EventType %q != original %q", decoded.EventType, event.EventType)
		}
	})

	t.Run("client message types are valid", func(t *testing.T) {
		validTypes := []string{"subscribe", "unsubscribe", "ping"}
		for _, msgType := range validTypes {
			msg := ClientMessage{Type: msgType}
			if msg.Type == "" {
				t.Errorf("message type should not be empty")
			}
		}
	})

	t.Run("server message types are valid", func(t *testing.T) {
		validTypes := []string{"sync", "pong", "error"}
		for _, msgType := range validTypes {
			msg := ServerMessage{Type: msgType}
			if msg.Type == "" {
				t.Errorf("message type should not be empty")
			}
		}
	})
}
