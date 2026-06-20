package gc

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// HandleGCStatus returns the status of all registered GC jobs.
func HandleGCStatus(scheduler *Scheduler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		statuses := scheduler.GetAllStatuses()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(statuses)
	}
}

// HandleGCTrigger manually triggers a specific GC job by name.
func HandleGCTrigger(scheduler *Scheduler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobName := chi.URLParam(r, "job")
		if jobName == "" {
			http.Error(w, `{"error":"job name required"}`, http.StatusBadRequest)
			return
		}

		if err := scheduler.TriggerJob(jobName); err != nil {
			if err == ErrJobNotFound {
				http.Error(w, `{"error":"job not found"}`, http.StatusNotFound)
				return
			}
			http.Error(w, `{"error":"trigger failed"}`, http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusAccepted)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status": "triggered",
			"job":    jobName,
		})
	}
}
