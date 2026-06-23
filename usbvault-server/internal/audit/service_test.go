//go:build integration
// +build integration

package audit

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/pashagolub/pgxmock/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
)

// ============================================================================
// Test NewAuditService
// ============================================================================

func TestNewAuditService(t *testing.T) {
	t.Parallel()

	t.Run("creates audit service with database pool", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		require.NoError(t, err)
		defer mock.Close()

		svc := NewAuditService(mock)

		assert.NotNil(t, svc)
		assert.Equal(t, mock, svc.pool)
	})
}

// ============================================================================
// Test LogAction
// ============================================================================

func TestLogAction(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		userID        string
		actionType    string
		encryptedData []byte
		setupDB       func(pgxmock.PgxPoolIface)
		expectError   bool
		validateEntry func(*testing.T, *AuditEntry)
	}{
		{
			name:          "logs action for new user",
			userID:        "user-123",
			actionType:    "LOGIN",
			encryptedData: []byte("encrypted_login_data"),
			setupDB: func(mock pgxmock.PgxPoolIface) {
				// No previous entries
				mock.ExpectQuery("SELECT hash FROM audit_log WHERE user_id").
					WithArgs("user-123").
					WillReturnError(pgx.ErrNoRows)

				// Insert new entry
				mock.ExpectExec("INSERT INTO audit_log").
					WithArgs("user-123", "LOGIN", []byte("encrypted_login_data"), mockTimeArg{}, mockByteArrayArg{}, mockByteArrayArg{}).
					WillReturnResult(pgxmock.NewResult("INSERT", 1))
			},
			expectError: false,
		},
		{
			name:          "creates hash chain from previous entry",
			userID:        "user-456",
			actionType:    "FILE_ACCESSED",
			encryptedData: []byte("file_access_data"),
			setupDB: func(mock pgxmock.PgxPoolIface) {
				// Previous entry exists
				prevHash := make([]byte, 32)
				mock.ExpectQuery("SELECT hash FROM audit_log WHERE user_id").
					WithArgs("user-456").
					WillReturnRows(pgxmock.NewRows([]string{"hash"}).AddRow(prevHash))

				// Insert new entry
				mock.ExpectExec("INSERT INTO audit_log").
					WithArgs("user-456", "FILE_ACCESSED", []byte("file_access_data"), mockTimeArg{}, mockByteArrayArg{}, mockByteArrayArg{}).
					WillReturnResult(pgxmock.NewResult("INSERT", 1))
			},
			expectError: false,
		},
		{
			name:          "handles database errors gracefully",
			userID:        "user-789",
			actionType:    "PERMISSION_DENIED",
			encryptedData: []byte("denial_data"),
			setupDB: func(mock pgxmock.PgxPoolIface) {
				// No previous entries
				mock.ExpectQuery("SELECT hash FROM audit_log WHERE user_id").
					WithArgs("user-789").
					WillReturnError(pgx.ErrNoRows)

				// Insert fails
				mock.ExpectExec("INSERT INTO audit_log").
					WithArgs("user-789", "PERMISSION_DENIED", []byte("denial_data"), mockTimeArg{}, mockByteArrayArg{}, mockByteArrayArg{}).
					WillReturnError(context.DeadlineExceeded)
			},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mock, err := pgxmock.NewPool()
			require.NoError(t, err)
			defer mock.Close()

			tt.setupDB(mock)

			svc := NewAuditService(mock)
			ctx := context.Background()

			err = svc.LogAction(ctx, tt.userID, tt.actionType, tt.encryptedData)

			if tt.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}

			// Verify all expectations
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

// ============================================================================
// Test Hash Chain Computation
// ============================================================================

func TestHashChainComputation(t *testing.T) {
	t.Parallel()

	t.Run("computes sha256 hash correctly", func(t *testing.T) {
		prevHash := make([]byte, 32)
		actionType := "LOGIN"
		encryptedDetail := []byte("encrypted_data")
		timestamp := time.Now().UTC()

		h := sha256.New()
		h.Write(prevHash)
		h.Write([]byte(actionType))
		h.Write(encryptedDetail)
		h.Write([]byte(timestamp.Format(time.RFC3339Nano)))
		computedHash := h.Sum(nil)

		assert.Len(t, computedHash, 32)
		assert.NotEmpty(t, computedHash)
	})

	t.Run("hash includes all components", func(t *testing.T) {
		hash1 := sha256.New()
		hash1.Write([]byte("prev_hash_data"))
		hash1.Write([]byte("ACTION_TYPE"))
		hash1.Write([]byte("encrypted"))
		hash1.Write([]byte("2024-03-07T10:00:00.000000000Z"))

		hash2 := sha256.New()
		hash2.Write([]byte("prev_hash_data"))
		hash2.Write([]byte("ACTION_TYPE"))
		hash2.Write([]byte("encrypted"))
		hash2.Write([]byte("2024-03-07T10:00:00.000000001Z")) // Different timestamp

		h1 := hash1.Sum(nil)
		h2 := hash2.Sum(nil)

		assert.NotEqual(t, h1, h2, "different timestamps should produce different hashes")
	})

	t.Run("hash changes with different action types", func(t *testing.T) {
		prevHash := make([]byte, 32)
		encryptedDetail := []byte("data")
		timestamp := time.Now().UTC()

		h1 := sha256.New()
		h1.Write(prevHash)
		h1.Write([]byte("LOGIN"))
		h1.Write(encryptedDetail)
		h1.Write([]byte(timestamp.Format(time.RFC3339Nano)))

		h2 := sha256.New()
		h2.Write(prevHash)
		h2.Write([]byte("LOGOUT"))
		h2.Write(encryptedDetail)
		h2.Write([]byte(timestamp.Format(time.RFC3339Nano)))

		hash1 := h1.Sum(nil)
		hash2 := h2.Sum(nil)

		assert.NotEqual(t, hash1, hash2)
	})
}

// ============================================================================
// Test VerifyChain
// ============================================================================

func TestVerifyChain(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		userID      string
		setupDB     func(pgxmock.PgxPoolIface)
		expectValid bool
		expectError bool
	}{
		{
			name:   "valid chain returns true",
			userID: "user-123",
			setupDB: func(mock pgxmock.PgxPoolIface) {
				prevHash := make([]byte, 32)

				// VerifyChain recomputes the hash over the stored timestamp using
				// time.RFC3339Nano, so the expected hash must be computed over the
				// exact timestamp value stored in the row.
				ts := time.Date(2024, 3, 7, 10, 0, 0, 0, time.UTC)

				h := sha256.New()
				h.Write(prevHash)
				h.Write([]byte("LOGIN"))
				h.Write([]byte("data"))
				h.Write([]byte(ts.Format(time.RFC3339Nano)))
				currentHash := h.Sum(nil)

				mock.ExpectQuery("SELECT id, action_type, encrypted_detail, timestamp, prev_hash, hash FROM audit_log").
					WithArgs("user-123", int64(0), 1000).
					WillReturnRows(pgxmock.NewRows(
						[]string{"id", "action_type", "encrypted_detail", "timestamp", "prev_hash", "hash"},
					).AddRow(int64(1), "LOGIN", []byte("data"), ts, prevHash, currentHash))
			},
			expectValid: true,
			expectError: false,
		},
		{
			name:   "empty chain returns true",
			userID: "user-456",
			setupDB: func(mock pgxmock.PgxPoolIface) {
				mock.ExpectQuery("SELECT id, action_type, encrypted_detail, timestamp, prev_hash, hash FROM audit_log").
					WithArgs("user-456", int64(0), 1000).
					WillReturnRows(pgxmock.NewRows(
						[]string{"id", "action_type", "encrypted_detail", "timestamp", "prev_hash", "hash"},
					))
			},
			expectValid: true,
			expectError: false,
		},
		{
			name:   "broken chain returns false",
			userID: "user-789",
			setupDB: func(mock pgxmock.PgxPoolIface) {
				// Chain broken: entry 2's prev_hash doesn't match entry 1's hash.
				// Entry 1 must be internally valid so verification reaches entry 2
				// and trips the prev_hash continuity check.
				ts := time.Date(2024, 3, 7, 10, 0, 0, 0, time.UTC)
				entry1Prev := make([]byte, 32)

				h1 := sha256.New()
				h1.Write(entry1Prev)
				h1.Write([]byte("ACTION1"))
				h1.Write([]byte("data1"))
				h1.Write([]byte(ts.Format(time.RFC3339Nano)))
				entry1Hash := h1.Sum(nil)

				// Entry 2 claims a prev_hash that does not equal entry 1's hash.
				wrongPrev := make([]byte, 32)
				wrongPrev[0] = 0xFF

				mock.ExpectQuery("SELECT id, action_type, encrypted_detail, timestamp, prev_hash, hash FROM audit_log").
					WithArgs("user-789", int64(0), 1000).
					WillReturnRows(pgxmock.NewRows(
						[]string{"id", "action_type", "encrypted_detail", "timestamp", "prev_hash", "hash"},
					).
						AddRow(int64(1), "ACTION1", []byte("data1"), ts, entry1Prev, entry1Hash).
						AddRow(int64(2), "ACTION2", []byte("data2"), ts, wrongPrev, make([]byte, 32))) // Wrong prev_hash
			},
			expectValid: false,
			expectError: false,
		},
		{
			name:   "tampered hash detected",
			userID: "user-101",
			setupDB: func(mock pgxmock.PgxPoolIface) {
				prevHash := make([]byte, 32)
				tamperedHash := make([]byte, 32)
				tamperedHash[0] = 0xFF // Doesn't match computed hash

				mock.ExpectQuery("SELECT id, action_type, encrypted_detail, timestamp, prev_hash, hash FROM audit_log").
					WithArgs("user-101", int64(0), 1000).
					WillReturnRows(pgxmock.NewRows(
						[]string{"id", "action_type", "encrypted_detail", "timestamp", "prev_hash", "hash"},
					).AddRow(int64(1), "ACTION", []byte("data"), time.Now(), prevHash, tamperedHash)) // Stored hash doesn't match computed
			},
			expectValid: false,
			expectError: false,
		},
		{
			name:   "database error returns error",
			userID: "user-202",
			setupDB: func(mock pgxmock.PgxPoolIface) {
				mock.ExpectQuery("SELECT id, action_type, encrypted_detail, timestamp, prev_hash, hash FROM audit_log").
					WithArgs("user-202", int64(0), 1000).
					WillReturnError(context.DeadlineExceeded)
			},
			expectValid: false,
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mock, err := pgxmock.NewPool()
			require.NoError(t, err)
			defer mock.Close()

			tt.setupDB(mock)

			svc := NewAuditService(mock)
			ctx := context.Background()

			valid, err := svc.VerifyChain(ctx, tt.userID)

			if tt.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expectValid, valid)
			}

			// Verify expectations
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

// ============================================================================
// Test ListAuditLog
// ============================================================================

func TestListAuditLog(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		userID      string
		limit       int
		offset      int
		setupDB     func(pgxmock.PgxPoolIface)
		expectCount int
		expectError bool
	}{
		{
			name:   "returns paginated entries",
			userID: "user-123",
			limit:  10,
			offset: 0,
			setupDB: func(mock pgxmock.PgxPoolIface) {
				mock.ExpectQuery("SELECT id, user_id, action_type, timestamp, hash FROM audit_log").
					WithArgs("user-123", 10, 0).
					WillReturnRows(pgxmock.NewRows(
						[]string{"id", "user_id", "action_type", "timestamp", "hash"},
					).
						AddRow(int64(1), "user-123", "LOGIN", time.Now(), make([]byte, 32)).
						AddRow(int64(2), "user-123", "FILE_ACCESSED", time.Now(), make([]byte, 32)).
						AddRow(int64(3), "user-123", "LOGOUT", time.Now(), make([]byte, 32)))
			},
			expectCount: 3,
			expectError: false,
		},
		{
			name:   "handles pagination correctly",
			userID: "user-456",
			limit:  5,
			offset: 10,
			setupDB: func(mock pgxmock.PgxPoolIface) {
				mock.ExpectQuery("SELECT id, user_id, action_type, timestamp, hash FROM audit_log").
					WithArgs("user-456", 5, 10).
					WillReturnRows(pgxmock.NewRows(
						[]string{"id", "user_id", "action_type", "timestamp", "hash"},
					).
						AddRow(int64(11), "user-456", "ACTION1", time.Now(), make([]byte, 32)).
						AddRow(int64(12), "user-456", "ACTION2", time.Now(), make([]byte, 32)))
			},
			expectCount: 2,
			expectError: false,
		},
		{
			name:   "returns empty list for user with no entries",
			userID: "user-789",
			limit:  10,
			offset: 0,
			setupDB: func(mock pgxmock.PgxPoolIface) {
				mock.ExpectQuery("SELECT id, user_id, action_type, timestamp, hash FROM audit_log").
					WithArgs("user-789", 10, 0).
					WillReturnRows(pgxmock.NewRows(
						[]string{"id", "user_id", "action_type", "timestamp", "hash"},
					))
			},
			expectCount: 0,
			expectError: false,
		},
		{
			name:   "returns error on database failure",
			userID: "user-101",
			limit:  10,
			offset: 0,
			setupDB: func(mock pgxmock.PgxPoolIface) {
				mock.ExpectQuery("SELECT id, user_id, action_type, timestamp, hash FROM audit_log").
					WithArgs("user-101", 10, 0).
					WillReturnError(context.DeadlineExceeded)
			},
			expectCount: 0,
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mock, err := pgxmock.NewPool()
			require.NoError(t, err)
			defer mock.Close()

			tt.setupDB(mock)

			svc := NewAuditService(mock)
			ctx := context.Background()

			entries, err := svc.ListAuditLog(ctx, tt.userID, tt.limit, tt.offset)

			if tt.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Len(t, entries, tt.expectCount)
			}

			// Verify expectations
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

// ============================================================================
// Test AuditEntry Struct
// ============================================================================

func TestAuditEntry(t *testing.T) {
	t.Parallel()

	t.Run("audit entry has all required fields", func(t *testing.T) {
		entry := AuditEntry{
			ID:              1,
			UserID:          "user-123",
			ActionType:      "LOGIN",
			EncryptedDetail: []byte("encrypted_data"),
			Timestamp:       time.Now(),
			PrevHash:        make([]byte, 32),
			Hash:            make([]byte, 32),
		}

		assert.NotZero(t, entry.ID)
		assert.NotEmpty(t, entry.UserID)
		assert.NotEmpty(t, entry.ActionType)
		assert.NotEmpty(t, entry.EncryptedDetail)
		assert.False(t, entry.Timestamp.IsZero())
		assert.Len(t, entry.PrevHash, 32)
		assert.Len(t, entry.Hash, 32)
	})
}

// ============================================================================
// Test HTTP Handlers
// ============================================================================

func TestHandleListAuditLog(t *testing.T) {
	t.Parallel()

	t.Run("lists audit log for authenticated user", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		require.NoError(t, err)
		defer mock.Close()

		mock.ExpectQuery("SELECT id, user_id, action_type, timestamp, hash FROM audit_log").
			WithArgs("user-123", 50, 0).
			WillReturnRows(pgxmock.NewRows(
				[]string{"id", "user_id", "action_type", "timestamp", "hash"},
			).
				AddRow(int64(1), "user-123", "LOGIN", time.Now(), make([]byte, 32)))

		svc := NewAuditService(mock)
		handler := HandleListAuditLog(svc)

		req := httptest.NewRequest("GET", "/audit?limit=50&offset=0", nil)
		ctx := context.WithValue(req.Context(), ctxkeys.UserID, "user-123")
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		handler(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)
		assert.NotNil(t, resp["entries"])

		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("rejects unauthenticated request", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		require.NoError(t, err)
		defer mock.Close()

		svc := NewAuditService(mock)
		handler := HandleListAuditLog(svc)

		req := httptest.NewRequest("GET", "/audit", nil)
		w := httptest.NewRecorder()

		handler(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

func TestHandleVerifyChain(t *testing.T) {
	t.Parallel()

	t.Run("verifies chain for authenticated user", func(t *testing.T) {
		mock, err := pgxmock.NewPool()
		require.NoError(t, err)
		defer mock.Close()

		mock.ExpectQuery("SELECT id, action_type, encrypted_detail, timestamp, prev_hash, hash FROM audit_log").
			WithArgs("user-123", int64(0), 1000).
			WillReturnRows(pgxmock.NewRows(
				[]string{"id", "action_type", "encrypted_detail", "timestamp", "prev_hash", "hash"},
			))

		svc := NewAuditService(mock)
		handler := HandleVerifyChain(svc)

		req := httptest.NewRequest("GET", "/audit/verify", nil)
		ctx := context.WithValue(req.Context(), ctxkeys.UserID, "user-123")
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		handler(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var resp VerifyChainResponse
		json.Unmarshal(w.Body.Bytes(), &resp)
		assert.True(t, resp.Valid)

		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

// ============================================================================
// Mock helpers for pgxmock
// ============================================================================

type mockTimeArg struct{}

func (m mockTimeArg) Match(v interface{}) bool {
	_, ok := v.(time.Time)
	return ok
}

type mockByteArrayArg struct{}

func (m mockByteArrayArg) Match(v interface{}) bool {
	_, ok := v.([]byte)
	return ok
}
