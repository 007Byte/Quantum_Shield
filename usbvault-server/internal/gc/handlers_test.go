package gc

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleGCStatus(t *testing.T) {
	t.Parallel()

	s := NewScheduler()
	s.Register(JobConfig{
		Job:      &mockJob{name: "test_a"},
		Interval: 0,
		Timeout:  0,
		Enabled:  true,
	})

	handler := HandleGCStatus(s)
	req := httptest.NewRequest("GET", "/admin/gc/status", nil)
	w := httptest.NewRecorder()

	handler(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var statuses []JobStatus
	err := json.NewDecoder(w.Body).Decode(&statuses)
	require.NoError(t, err)
	assert.Len(t, statuses, 1)
	assert.Equal(t, "test_a", statuses[0].Name)
}

func TestHandleGCTrigger_Success(t *testing.T) {
	t.Parallel()

	s := NewScheduler()
	s.Register(JobConfig{
		Job:      &mockJob{name: "trigger_test"},
		Interval: 0,
		Timeout:  0,
		Enabled:  true,
	})

	r := chi.NewRouter()
	r.Post("/admin/gc/trigger/{job}", HandleGCTrigger(s))

	req := httptest.NewRequest("POST", "/admin/gc/trigger/trigger_test", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusAccepted, w.Code)

	var resp map[string]string
	err := json.NewDecoder(w.Body).Decode(&resp)
	require.NoError(t, err)
	assert.Equal(t, "triggered", resp["status"])
	assert.Equal(t, "trigger_test", resp["job"])
}

func TestHandleGCTrigger_NotFound(t *testing.T) {
	t.Parallel()

	s := NewScheduler()

	r := chi.NewRouter()
	r.Post("/admin/gc/trigger/{job}", HandleGCTrigger(s))

	req := httptest.NewRequest("POST", "/admin/gc/trigger/nonexistent", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}
