//go:build integration

package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/pashagolub/pgxmock/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
)

func newH5Redis(t *testing.T) *redis.Client {
	t.Helper()
	mr := miniredis.NewMiniRedis()
	require.NoError(t, mr.Start())
	t.Cleanup(mr.Close)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rc.Close() })
	return rc
}

func TestRecentReauthMarker(t *testing.T) {
	rc := newH5Redis(t)
	ctx := context.Background()

	ok, err := hasRecentReauth(ctx, rc, "u1")
	require.NoError(t, err)
	assert.False(t, ok, "marker absent before any strong auth")

	require.NoError(t, markRecentReauth(ctx, rc, "u1"))
	ok, err = hasRecentReauth(ctx, rc, "u1")
	require.NoError(t, err)
	assert.True(t, ok, "marker present after strong auth")

	// nil client / empty user are safe no-ops (must not panic, must not report present).
	require.NoError(t, markRecentReauth(ctx, nil, "u1"))
	require.NoError(t, markRecentReauth(ctx, rc, ""))
	ok, err = hasRecentReauth(ctx, nil, "u1")
	require.NoError(t, err)
	assert.False(t, ok)
}

// H-5: enrolling a NEW FIDO2 credential requires a recent strong authentication
// (the reauth marker), EXCEPT for the user's first credential.
func TestFIDO2Enroll_StepUpGate(t *testing.T) {
	const userID = "user-h5"

	call := func(t *testing.T, creds string, withMarker bool) *httptest.ResponseRecorder {
		mock, err := pgxmock.NewPool()
		require.NoError(t, err)
		t.Cleanup(mock.Close)
		mock.ExpectQuery("SELECT email_hash FROM users WHERE id").WithArgs(userID).
			WillReturnRows(pgxmock.NewRows([]string{"email_hash"}).AddRow("hashed"))
		mock.ExpectQuery("SELECT webauthn_credentials FROM users WHERE id").WithArgs(userID).
			WillReturnRows(pgxmock.NewRows([]string{"webauthn_credentials"}).AddRow([]byte(creds)))

		rc := newH5Redis(t)
		if withMarker {
			require.NoError(t, markRecentReauth(context.Background(), rc, userID))
		}

		req := httptest.NewRequest("POST", "/fido2/manage/register/init", nil)
		req = req.WithContext(context.WithValue(req.Context(), ctxkeys.UserID, userID))
		w := httptest.NewRecorder()
		HandleFIDO2RegisterChallenge(mock, rc)(w, req)
		return w
	}

	t.Run("existing credential WITHOUT recent reauth is blocked", func(t *testing.T) {
		w := call(t, `[{}]`, false)
		assert.Equal(t, http.StatusForbidden, w.Code)
		assert.Contains(t, w.Body.String(), "STEP_UP_REQUIRED")
	})

	t.Run("existing credential WITH recent reauth proceeds past the gate", func(t *testing.T) {
		w := call(t, `[{}]`, true)
		assert.NotEqual(t, http.StatusForbidden, w.Code)
		assert.NotContains(t, w.Body.String(), "STEP_UP_REQUIRED")
	})

	t.Run("first credential (zero existing) is exempt without reauth", func(t *testing.T) {
		w := call(t, `[]`, false)
		assert.NotEqual(t, http.StatusForbidden, w.Code)
		assert.NotContains(t, w.Body.String(), "STEP_UP_REQUIRED")
	})
}
