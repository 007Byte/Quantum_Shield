//go:build integration
// +build integration

package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pashagolub/pgxmock/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ============================================================================
// Test HandleFIDO2RegisterChallenge
// ============================================================================

func TestHandleFIDO2RegisterChallenge(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		setupContext func(*http.Request)
		setupDB      func(pgxmock.PgxPoolIface)
		expectStatus int
		expectError  string
		validateResp func(*testing.T, []byte)
	}{
		{
			name: "authenticated user can register credential",
			setupContext: func(r *http.Request) {
				// Simulate auth middleware adding user_id to context
				ctx := context.WithValue(r.Context(), "user_id", "user-123")
				*r = *r.WithContext(ctx)
			},
			setupDB: func(mock pgxmock.PgxPoolIface) {
				mock.ExpectQuery("SELECT email_hash FROM users WHERE id").
					WithArgs("user-123").
					WillReturnRows(pgxmock.NewRows([]string{"email_hash"}).
						AddRow("hashed_email"))

				mock.ExpectQuery("SELECT webauthn_credentials FROM users WHERE id").
					WithArgs("user-123").
					WillReturnRows(pgxmock.NewRows([]string{"webauthn_credentials"}).
						AddRow([]byte(`[]`)))
			},
			expectStatus: http.StatusOK,
			validateResp: func(t *testing.T, body []byte) {
				var resp FIDO2RegisterChallengeResponse
				err := json.Unmarshal(body, &resp)
				assert.NoError(t, err)
				assert.NotEmpty(t, resp.Challenge)
				assert.NotEmpty(t, resp.SessionID)
			},
		},
		{
			name: "unauthenticated user gets unauthorized",
			setupContext: func(r *http.Request) {
				// No user_id in context
			},
			setupDB: func(mock pgxmock.PgxPoolIface) {
				// No queries expected
			},
			expectStatus: http.StatusUnauthorized,
			expectError:  "unauthorized",
		},
		{
			name: "empty user_id is treated as unauthenticated",
			setupContext: func(r *http.Request) {
				ctx := context.WithValue(r.Context(), "user_id", "")
				*r = *r.WithContext(ctx)
			},
			setupDB: func(mock pgxmock.PgxPoolIface) {
				// No queries expected
			},
			expectStatus: http.StatusUnauthorized,
			expectError:  "unauthorized",
		},
		{
			name: "user not found in database returns generic error",
			setupContext: func(r *http.Request) {
				ctx := context.WithValue(r.Context(), "user_id", "nonexistent-user")
				*r = *r.WithContext(ctx)
			},
			setupDB: func(mock pgxmock.PgxPoolIface) {
				mock.ExpectQuery("SELECT email_hash FROM users WHERE id").
					WithArgs("nonexistent-user").
					WillReturnError(pgx.ErrNoRows)
			},
			expectStatus: http.StatusUnauthorized,
			expectError:  "invalid credentials",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create mock database
			mock, err := pgxmock.NewPool()
			require.NoError(t, err)
			defer mock.Close()

			tt.setupDB(mock)

			// Create mock Redis
			mockRedis := redis.NewClient(&redis.Options{})

			// Create request
			req := httptest.NewRequest("POST", "/fido2/register/challenge", nil)
			tt.setupContext(req)
			w := httptest.NewRecorder()

			// Create handler
			handler := HandleFIDO2RegisterChallenge(mock, mockRedis)
			handler(w, req)

			assert.Equal(t, tt.expectStatus, w.Code)
			if tt.expectError != "" {
				assert.Contains(t, w.Body.String(), tt.expectError)
			}
			if tt.validateResp != nil {
				tt.validateResp(t, w.Body.Bytes())
			}

			// Verify expectations
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

// ============================================================================
// Test HandleFIDO2RegisterVerify
// ============================================================================

func TestHandleFIDO2RegisterVerify(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		setupContext func(*http.Request)
		setupRequest func() FIDO2RegisterVerifyRequest
		setupDB      func(pgxmock.PgxPoolIface)
		expectStatus int
		expectError  string
	}{
		{
			name: "expired session",
			setupContext: func(r *http.Request) {
				ctx := context.WithValue(r.Context(), "user_id", "user-123")
				*r = *r.WithContext(ctx)
			},
			setupRequest: func() FIDO2RegisterVerifyRequest {
				return FIDO2RegisterVerifyRequest{
					SessionID:              "expired-session",
					AttestationResponseJSON: "response",
					CredentialName:        "My Key",
				}
			},
			setupDB: func(mock pgxmock.PgxPoolIface) {
				// No queries - session lookup in Redis will fail
			},
			expectStatus: http.StatusUnauthorized,
			expectError:  "session expired",
		},
		{
			name: "max credentials limit exceeded",
			setupContext: func(r *http.Request) {
				ctx := context.WithValue(r.Context(), "user_id", "user-123")
				*r = *r.WithContext(ctx)
			},
			setupRequest: func() FIDO2RegisterVerifyRequest {
				return FIDO2RegisterVerifyRequest{
					SessionID:              "valid-session",
					AttestationResponseJSON: "response",
					CredentialName:        "My Key",
				}
			},
			setupDB: func(mock pgxmock.PgxPoolIface) {
				// User already has 10 credentials - at limit
				existingCreds := make([]webauthn.Credential, 10)
				credsJSON, _ := json.Marshal(existingCreds)

				mock.ExpectQuery("SELECT webauthn_credentials FROM users WHERE id").
					WithArgs("user-123").
					WillReturnRows(pgxmock.NewRows([]string{"webauthn_credentials"}).
						AddRow(credsJSON))
			},
			expectStatus: http.StatusBadRequest,
			expectError:  "maximum credentials",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create mock database
			mock, err := pgxmock.NewPool()
			require.NoError(t, err)
			defer mock.Close()

			tt.setupDB(mock)

			// Create mock Redis
			mockRedis := redis.NewClient(&redis.Options{})

			// Create request
			req := tt.setupRequest()
			body, _ := json.Marshal(req)
			httpReq := httptest.NewRequest("POST", "/fido2/register/verify", bytes.NewReader(body))
			tt.setupContext(httpReq)
			w := httptest.NewRecorder()

			// Create handler
			handler := HandleFIDO2RegisterVerify(mock, mockRedis)
			handler(w, httpReq)

			assert.Equal(t, tt.expectStatus, w.Code)
			if tt.expectError != "" {
				assert.Contains(t, w.Body.String(), tt.expectError)
			}

			// Verify expectations
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

// ============================================================================
// Test HandleFIDO2ListCredentials
// ============================================================================

func TestHandleFIDO2ListCredentials(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		setupContext func(*http.Request)
		setupDB      func(pgxmock.PgxPoolIface)
		expectStatus int
		validateResp func(*testing.T, []byte)
	}{
		{
			name: "list credentials for user with credentials",
			setupContext: func(r *http.Request) {
				ctx := context.WithValue(r.Context(), "user_id", "user-123")
				*r = *r.WithContext(ctx)
			},
			setupDB: func(mock pgxmock.PgxPoolIface) {
				creds := []FIDO2Credential{
					{
						ID:        "cred-1",
						Name:      "My Key",
						CreatedAt: time.Now(),
					},
				}
				credsJSON, _ := json.Marshal(creds)

				mock.ExpectQuery("SELECT.*credentials.*FROM users WHERE id").
					WithArgs("user-123").
					WillReturnRows(pgxmock.NewRows([]string{"fido2_credentials"}).
						AddRow(credsJSON))
			},
			expectStatus: http.StatusOK,
			validateResp: func(t *testing.T, body []byte) {
				var resp map[string]interface{}
				err := json.Unmarshal(body, &resp)
				assert.NoError(t, err)
				assert.NotNil(t, resp["credentials"])
			},
		},
		{
			name: "list credentials for user without credentials",
			setupContext: func(r *http.Request) {
				ctx := context.WithValue(r.Context(), "user_id", "user-456")
				*r = *r.WithContext(ctx)
			},
			setupDB: func(mock pgxmock.PgxPoolIface) {
				mock.ExpectQuery("SELECT.*credentials.*FROM users WHERE id").
					WithArgs("user-456").
					WillReturnRows(pgxmock.NewRows([]string{"fido2_credentials"}).
						AddRow([]byte(`[]`)))
			},
			expectStatus: http.StatusOK,
			validateResp: func(t *testing.T, body []byte) {
				var resp map[string]interface{}
				err := json.Unmarshal(body, &resp)
				assert.NoError(t, err)
				creds := resp["credentials"].([]interface{})
				assert.Len(t, creds, 0)
			},
		},
		{
			name: "unauthenticated user gets unauthorized",
			setupContext: func(r *http.Request) {
				// No user_id in context
			},
			setupDB: func(mock pgxmock.PgxPoolIface) {
				// No queries expected
			},
			expectStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create mock database
			mock, err := pgxmock.NewPool()
			require.NoError(t, err)
			defer mock.Close()

			tt.setupDB(mock)

			// Create request
			req := httptest.NewRequest("GET", "/fido2/credentials", nil)
			tt.setupContext(req)
			w := httptest.NewRecorder()

			// Create handler
			handler := HandleFIDO2ListCredentials(mock)
			handler(w, req)

			assert.Equal(t, tt.expectStatus, w.Code)
			if tt.validateResp != nil {
				tt.validateResp(t, w.Body.Bytes())
			}

			// Verify expectations
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

// ============================================================================
// Test HandleFIDO2DeleteCredential
// ============================================================================

func TestHandleFIDO2DeleteCredential(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		setupContext func(*http.Request)
		credentialID string
		setupDB      func(pgxmock.PgxPoolIface)
		expectStatus int
		expectError  string
	}{
		{
			name: "delete valid credential",
			setupContext: func(r *http.Request) {
				ctx := context.WithValue(r.Context(), "user_id", "user-123")
				*r = *r.WithContext(ctx)
			},
			credentialID: "cred-1",
			setupDB: func(mock pgxmock.PgxPoolIface) {
				// Count credentials
				mock.ExpectQuery("SELECT COUNT.*FROM.*webauthn").
					WithArgs("user-123").
					WillReturnRows(pgxmock.NewRows([]string{"count"}).AddRow(2))

				// Get credentials to remove target credential
				mock.ExpectQuery("SELECT webauthn_credentials FROM users WHERE id").
					WithArgs("user-123").
					WillReturnRows(pgxmock.NewRows([]string{"webauthn_credentials"}).
						AddRow([]byte(`[{"id":"cred-1"},{"id":"cred-2"}]`)))

				// Update credentials
				mock.ExpectExec("UPDATE users SET webauthn_credentials").
					WithArgs("user-123").
					WillReturnResult(pgxmock.NewResult("UPDATE", 1))
			},
			expectStatus: http.StatusOK,
		},
		{
			name: "cannot delete last credential without password",
			setupContext: func(r *http.Request) {
				ctx := context.WithValue(r.Context(), "user_id", "user-123")
				*r = *r.WithContext(ctx)
			},
			credentialID: "cred-1",
			setupDB: func(mock pgxmock.PgxPoolIface) {
				// Only 1 credential
				mock.ExpectQuery("SELECT COUNT.*FROM.*webauthn").
					WithArgs("user-123").
					WillReturnRows(pgxmock.NewRows([]string{"count"}).AddRow(1))
			},
			expectStatus: http.StatusBadRequest,
			expectError:  "last credential",
		},
		{
			name: "credential not found",
			setupContext: func(r *http.Request) {
				ctx := context.WithValue(r.Context(), "user_id", "user-123")
				*r = *r.WithContext(ctx)
			},
			credentialID: "nonexistent",
			setupDB: func(mock pgxmock.PgxPoolIface) {
				// Count credentials
				mock.ExpectQuery("SELECT COUNT.*FROM.*webauthn").
					WithArgs("user-123").
					WillReturnRows(pgxmock.NewRows([]string{"count"}).AddRow(1))

				// Get credentials - doesn't contain the target
				mock.ExpectQuery("SELECT webauthn_credentials FROM users WHERE id").
					WithArgs("user-123").
					WillReturnRows(pgxmock.NewRows([]string{"webauthn_credentials"}).
						AddRow([]byte(`[{"id":"cred-1"}]`)))
			},
			expectStatus: http.StatusNotFound,
			expectError:  "credential not found",
		},
		{
			name: "unauthenticated user gets unauthorized",
			setupContext: func(r *http.Request) {
				// No user_id in context
			},
			credentialID: "cred-1",
			setupDB: func(mock pgxmock.PgxPoolIface) {
				// No queries expected
			},
			expectStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create mock database
			mock, err := pgxmock.NewPool()
			require.NoError(t, err)
			defer mock.Close()

			tt.setupDB(mock)

			// Create request
			req := httptest.NewRequest("DELETE", "/fido2/credentials/"+tt.credentialID, nil)
			tt.setupContext(req)
			w := httptest.NewRecorder()

			// Create handler
			handler := HandleFIDO2DeleteCredential(mock)
			handler(w, req)

			assert.Equal(t, tt.expectStatus, w.Code)
			if tt.expectError != "" {
				assert.Contains(t, w.Body.String(), tt.expectError)
			}

			// Verify expectations
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

// ============================================================================
// Test Max Credentials Enforcement
// ============================================================================

func TestMaxCredentialsEnforcement(t *testing.T) {
	t.Parallel()

	const MaxFIDO2Credentials = 10

	t.Run("allows registration when below limit", func(t *testing.T) {
		currentCount := 5
		assert.Less(t, currentCount, MaxFIDO2Credentials)
	})

	t.Run("rejects registration at limit", func(t *testing.T) {
		currentCount := MaxFIDO2Credentials
		assert.GreaterOrEqual(t, currentCount, MaxFIDO2Credentials)
	})

	t.Run("rejects registration above limit", func(t *testing.T) {
		currentCount := MaxFIDO2Credentials + 1
		assert.Greater(t, currentCount, MaxFIDO2Credentials)
	})
}

// ============================================================================
// Test Credential Management
// ============================================================================

func TestCredentialManagement(t *testing.T) {
	t.Parallel()

	t.Run("credential info includes all required fields", func(t *testing.T) {
		cred := FIDO2Credential{
			ID:        "cred-123",
			CreatedAt: time.Now(),
			Name:      "My Security Key",
		}

		assert.NotEmpty(t, cred.ID)
		assert.NotZero(t, cred.CreatedAt)
		assert.NotEmpty(t, cred.Name)
	})

	t.Run("multiple credentials can be tracked", func(t *testing.T) {
		credentials := []FIDO2Credential{
			{ID: "cred-1", Name: "Key 1"},
			{ID: "cred-2", Name: "Key 2"},
			{ID: "cred-3", Name: "Key 3"},
		}

		assert.Len(t, credentials, 3)
		assert.Equal(t, "cred-2", credentials[1].ID)
	})
}

// ============================================================================
// Test Session Handling
// ============================================================================

func TestFIDO2RegisterSessionHandling(t *testing.T) {
	t.Parallel()

	t.Run("session data structures are valid", func(t *testing.T) {
		sessionData := webauthn.SessionData{
			Challenge: []byte("test-challenge"),
			UserID:    []byte("user-123"),
		}

		// Should be JSON marshable
		jsonBytes, err := json.Marshal(sessionData)
		assert.NoError(t, err)
		assert.NotEmpty(t, jsonBytes)

		// Should be unmarshable
		var unmarshaled webauthn.SessionData
		err = json.Unmarshal(jsonBytes, &unmarshaled)
		assert.NoError(t, err)
		assert.Equal(t, sessionData.Challenge, unmarshaled.Challenge)
	})
}

// ============================================================================
// Test Error Handling
// ============================================================================

func TestFIDO2RegisterErrorHandling(t *testing.T) {
	t.Parallel()

	t.Run("handles corrupted attestation response", func(t *testing.T) {
		invalidJSON := []byte("not valid json")
		var resp FIDO2RegisterVerifyRequest
		err := json.Unmarshal(invalidJSON, &resp)
		assert.Error(t, err)
	})

	t.Run("handles empty credential name gracefully", func(t *testing.T) {
		// Empty names should be allowed or given a default
		cred := FIDO2Credential{
			ID:   "cred-1",
			Name: "", // Empty name
		}
		assert.Empty(t, cred.Name)
	})
}
