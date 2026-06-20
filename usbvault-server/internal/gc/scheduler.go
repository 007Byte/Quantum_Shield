package gc

import (
	"context"
	"math/rand"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/metrics"
)

// Job defines the interface all GC jobs must implement.
type Job interface {
	Name() string
	Run(ctx context.Context) (cleaned int, err error)
}

// JobConfig defines scheduling parameters for a registered job.
type JobConfig struct {
	Job      Job
	Interval time.Duration
	Jitter   time.Duration // Max random jitter added to interval
	Timeout  time.Duration // Per-run context timeout
	Enabled  bool
}

// JobStatus captures the last execution result for a job.
type JobStatus struct {
	Name         string    `json:"name"`
	LastRun      time.Time `json:"last_run"`
	LastDuration float64   `json:"last_duration_seconds"`
	LastCleaned  int       `json:"last_cleaned"`
	LastError    string    `json:"last_error,omitempty"`
	TotalRuns    int64     `json:"total_runs"`
	TotalErrors  int64     `json:"total_errors"`
	NextRun      time.Time `json:"next_run"`
	Running      bool      `json:"running"`
}

// LeaderChecker is an optional interface for leader election.
// If nil, the scheduler assumes it is always the leader.
type LeaderChecker interface {
	IsLeader(ctx context.Context) bool
}

// Scheduler manages the lifecycle of all GC jobs.
type Scheduler struct {
	jobs      []JobConfig
	statuses  map[string]*JobStatus
	mu        sync.RWMutex
	cancel    context.CancelFunc
	wg        sync.WaitGroup
	triggerCh map[string]chan struct{}
	leader    LeaderChecker
}

// NewScheduler creates a new GC scheduler.
func NewScheduler() *Scheduler {
	return &Scheduler{
		statuses:  make(map[string]*JobStatus),
		triggerCh: make(map[string]chan struct{}),
	}
}

// NewSchedulerWithLeader creates a scheduler with leader election support.
func NewSchedulerWithLeader(leader LeaderChecker) *Scheduler {
	s := NewScheduler()
	s.leader = leader
	return s
}

// Register adds a job to the scheduler. Must be called before Start.
func (s *Scheduler) Register(cfg JobConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.jobs = append(s.jobs, cfg)
	s.statuses[cfg.Job.Name()] = &JobStatus{Name: cfg.Job.Name()}
	s.triggerCh[cfg.Job.Name()] = make(chan struct{}, 1)

	log.Info().
		Str("job", cfg.Job.Name()).
		Dur("interval", cfg.Interval).
		Dur("jitter", cfg.Jitter).
		Bool("enabled", cfg.Enabled).
		Msg("GC job registered")
}

// Start launches one goroutine per registered job.
func (s *Scheduler) Start(ctx context.Context) {
	ctx, s.cancel = context.WithCancel(ctx)

	for _, cfg := range s.jobs {
		if !cfg.Enabled {
			log.Info().Str("job", cfg.Job.Name()).Msg("GC job disabled, skipping")
			continue
		}

		s.wg.Add(1)
		go s.runLoop(ctx, cfg)
	}

	log.Info().Int("jobs", len(s.jobs)).Msg("GC scheduler started")
}

// Stop cancels all jobs and waits for them to finish.
func (s *Scheduler) Stop() {
	if s.cancel != nil {
		s.cancel()
	}
	s.wg.Wait()
	log.Info().Msg("GC scheduler stopped")
}

// TriggerJob manually triggers a job by name.
func (s *Scheduler) TriggerJob(name string) error {
	s.mu.RLock()
	ch, ok := s.triggerCh[name]
	s.mu.RUnlock()

	if !ok {
		return ErrJobNotFound
	}

	select {
	case ch <- struct{}{}:
		log.Info().Str("job", name).Msg("GC job manually triggered")
	default:
		log.Info().Str("job", name).Msg("GC job already pending trigger")
	}
	return nil
}

// GetStatus returns the status of a specific job.
func (s *Scheduler) GetStatus(name string) (*JobStatus, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	status, ok := s.statuses[name]
	if !ok {
		return nil, false
	}
	copy := *status
	return &copy, true
}

// GetAllStatuses returns the status of all registered jobs.
func (s *Scheduler) GetAllStatuses() []JobStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]JobStatus, 0, len(s.statuses))
	for _, status := range s.statuses {
		copy := *status
		result = append(result, copy)
	}
	return result
}

func (s *Scheduler) runLoop(ctx context.Context, cfg JobConfig) {
	defer s.wg.Done()

	interval := cfg.Interval + randomJitter(cfg.Jitter)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	jobName := cfg.Job.Name()
	triggerCh := s.triggerCh[jobName]

	log.Info().
		Str("job", jobName).
		Dur("interval", interval).
		Msg("GC job loop started")

	for {
		select {
		case <-ctx.Done():
			log.Info().Str("job", jobName).Msg("GC job loop stopped")
			return
		case <-ticker.C:
			s.executeJob(ctx, cfg)
			// Reset ticker with new jitter for next interval
			ticker.Reset(cfg.Interval + randomJitter(cfg.Jitter))
		case <-triggerCh:
			s.executeJob(ctx, cfg)
		}
	}
}

func (s *Scheduler) executeJob(ctx context.Context, cfg JobConfig) {
	jobName := cfg.Job.Name()

	// Check leader election
	if s.leader != nil && !s.leader.IsLeader(ctx) {
		metrics.GCRunsTotal.WithLabelValues(jobName, "skipped").Inc()
		log.Debug().Str("job", jobName).Msg("GC job skipped: not leader")
		return
	}

	// Mark as running
	s.mu.Lock()
	status := s.statuses[jobName]
	status.Running = true
	s.mu.Unlock()

	// Create per-job timeout context
	jobCtx, cancel := context.WithTimeout(ctx, cfg.Timeout)
	defer cancel()

	start := time.Now()
	cleaned, err := cfg.Job.Run(jobCtx)
	duration := time.Since(start)

	// Record metrics
	metrics.GCDurationSeconds.WithLabelValues(jobName).Observe(duration.Seconds())
	metrics.GCLastRunTimestamp.WithLabelValues(jobName).SetToCurrentTime()

	// Update status
	s.mu.Lock()
	status.LastRun = start
	status.LastDuration = duration.Seconds()
	status.LastCleaned = cleaned
	status.TotalRuns++
	status.NextRun = time.Now().Add(cfg.Interval)
	status.Running = false

	if err != nil {
		status.LastError = err.Error()
		status.TotalErrors++
		s.mu.Unlock()

		metrics.GCRunsTotal.WithLabelValues(jobName, "error").Inc()
		metrics.GCErrorsTotal.WithLabelValues(jobName).Inc()
		log.Error().Err(err).
			Str("job", jobName).
			Dur("duration", duration).
			Msg("GC job failed")
	} else {
		status.LastError = ""
		s.mu.Unlock()

		metrics.GCRunsTotal.WithLabelValues(jobName, "success").Inc()
		if cleaned > 0 {
			metrics.GCItemsCleanedTotal.WithLabelValues(jobName).Add(float64(cleaned))
		}
		log.Info().
			Str("job", jobName).
			Int("cleaned", cleaned).
			Dur("duration", duration).
			Msg("GC job completed")
	}
}

func randomJitter(max time.Duration) time.Duration {
	if max <= 0 {
		return 0
	}
	return time.Duration(rand.Int63n(int64(max)))
}
