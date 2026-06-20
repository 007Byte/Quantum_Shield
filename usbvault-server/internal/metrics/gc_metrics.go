package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// GC scheduler metrics

var (
	GCRunsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "usbvault_gc_runs_total",
			Help: "Total GC job runs by job name and status",
		},
		[]string{"job", "status"},
	)

	GCDurationSeconds = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "usbvault_gc_duration_seconds",
			Help:    "GC job execution duration",
			Buckets: []float64{0.1, 0.5, 1, 5, 10, 30, 60, 300},
		},
		[]string{"job"},
	)

	GCItemsCleanedTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "usbvault_gc_items_cleaned_total",
			Help: "Total items cleaned by GC jobs",
		},
		[]string{"job"},
	)

	GCErrorsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "usbvault_gc_errors_total",
			Help: "Total GC job errors",
		},
		[]string{"job"},
	)

	GCLastRunTimestamp = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "usbvault_gc_last_run_timestamp",
			Help: "Unix timestamp of last GC job run",
		},
		[]string{"job"},
	)
)
