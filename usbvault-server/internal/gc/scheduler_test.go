package gc

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockJob is a test implementation of the Job interface.
type mockJob struct {
	name      string
	runCount  atomic.Int64
	cleaned   int
	err       error
	runDelay  time.Duration
}

func (j *mockJob) Name() string { return j.name }

func (j *mockJob) Run(ctx context.Context) (int, error) {
	j.runCount.Add(1)
	if j.runDelay > 0 {
		select {
		case <-time.After(j.runDelay):
		case <-ctx.Done():
			return 0, ctx.Err()
		}
	}
	return j.cleaned, j.err
}

// mockLeader implements LeaderChecker for testing.
type mockLeader struct {
	isLeader bool
}

func (m *mockLeader) IsLeader(_ context.Context) bool { return m.isLeader }

func TestScheduler_RegisterAndStart(t *testing.T) {
	t.Parallel()

	job := &mockJob{name: "test_job", cleaned: 5}
	s := NewScheduler()
	s.Register(JobConfig{
		Job:      job,
		Interval: 50 * time.Millisecond,
		Timeout:  1 * time.Second,
		Enabled:  true,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	s.Start(ctx)
	<-ctx.Done()
	s.Stop()

	assert.GreaterOrEqual(t, job.runCount.Load(), int64(1), "job should have run at least once")
}

func TestScheduler_DisabledJob(t *testing.T) {
	t.Parallel()

	job := &mockJob{name: "disabled_job"}
	s := NewScheduler()
	s.Register(JobConfig{
		Job:      job,
		Interval: 10 * time.Millisecond,
		Timeout:  1 * time.Second,
		Enabled:  false,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	s.Start(ctx)
	<-ctx.Done()
	s.Stop()

	assert.Equal(t, int64(0), job.runCount.Load(), "disabled job should not run")
}

func TestScheduler_ManualTrigger(t *testing.T) {
	t.Parallel()

	job := &mockJob{name: "trigger_job", cleaned: 3}
	s := NewScheduler()
	s.Register(JobConfig{
		Job:      job,
		Interval: 1 * time.Hour, // Long interval so it won't fire on schedule
		Timeout:  1 * time.Second,
		Enabled:  true,
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	s.Start(ctx)

	err := s.TriggerJob("trigger_job")
	require.NoError(t, err)

	// Give goroutine time to process
	time.Sleep(50 * time.Millisecond)

	s.Stop()

	assert.GreaterOrEqual(t, job.runCount.Load(), int64(1), "job should have been triggered")
}

func TestScheduler_TriggerNonexistentJob(t *testing.T) {
	t.Parallel()

	s := NewScheduler()
	err := s.TriggerJob("nonexistent")
	assert.ErrorIs(t, err, ErrJobNotFound)
}

func TestScheduler_ErrorsDoNotCrash(t *testing.T) {
	t.Parallel()

	job := &mockJob{
		name: "error_job",
		err:  assert.AnError,
	}
	s := NewScheduler()
	s.Register(JobConfig{
		Job:      job,
		Interval: 30 * time.Millisecond,
		Timeout:  1 * time.Second,
		Enabled:  true,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()

	s.Start(ctx)
	<-ctx.Done()
	s.Stop()

	assert.GreaterOrEqual(t, job.runCount.Load(), int64(1), "job should have run despite errors")

	status, ok := s.GetStatus("error_job")
	require.True(t, ok)
	assert.Greater(t, status.TotalErrors, int64(0))
	assert.NotEmpty(t, status.LastError)
}

func TestScheduler_StopWaitsForRunningJobs(t *testing.T) {
	t.Parallel()

	job := &mockJob{
		name:     "slow_job",
		runDelay: 100 * time.Millisecond,
	}
	s := NewScheduler()
	s.Register(JobConfig{
		Job:      job,
		Interval: 1 * time.Hour,
		Timeout:  5 * time.Second,
		Enabled:  true,
	})

	ctx, cancel := context.WithCancel(context.Background())
	s.Start(ctx)

	// Trigger the job
	_ = s.TriggerJob("slow_job")
	time.Sleep(20 * time.Millisecond) // Let it start

	// Cancel and stop — should wait for the running job
	cancel()
	s.Stop()

	assert.GreaterOrEqual(t, job.runCount.Load(), int64(1))
}

func TestScheduler_GetAllStatuses(t *testing.T) {
	t.Parallel()

	s := NewScheduler()
	s.Register(JobConfig{
		Job:      &mockJob{name: "job_a"},
		Interval: 1 * time.Hour,
		Timeout:  1 * time.Second,
		Enabled:  true,
	})
	s.Register(JobConfig{
		Job:      &mockJob{name: "job_b"},
		Interval: 1 * time.Hour,
		Timeout:  1 * time.Second,
		Enabled:  true,
	})

	statuses := s.GetAllStatuses()
	assert.Len(t, statuses, 2)

	names := make(map[string]bool)
	for _, s := range statuses {
		names[s.Name] = true
	}
	assert.True(t, names["job_a"])
	assert.True(t, names["job_b"])
}

func TestScheduler_LeaderElection_NotLeader(t *testing.T) {
	t.Parallel()

	job := &mockJob{name: "leader_job", cleaned: 1}
	leader := &mockLeader{isLeader: false}

	s := NewSchedulerWithLeader(leader)
	s.Register(JobConfig{
		Job:      job,
		Interval: 30 * time.Millisecond,
		Timeout:  1 * time.Second,
		Enabled:  true,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()

	s.Start(ctx)
	<-ctx.Done()
	s.Stop()

	assert.Equal(t, int64(0), job.runCount.Load(), "non-leader should not run jobs")
}

func TestScheduler_LeaderElection_IsLeader(t *testing.T) {
	t.Parallel()

	job := &mockJob{name: "leader_job", cleaned: 1}
	leader := &mockLeader{isLeader: true}

	s := NewSchedulerWithLeader(leader)
	s.Register(JobConfig{
		Job:      job,
		Interval: 30 * time.Millisecond,
		Timeout:  1 * time.Second,
		Enabled:  true,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()

	s.Start(ctx)
	<-ctx.Done()
	s.Stop()

	assert.GreaterOrEqual(t, job.runCount.Load(), int64(1), "leader should run jobs")
}

func TestJobAdapters(t *testing.T) {
	t.Parallel()

	t.Run("ExpiredBlobJob", func(t *testing.T) {
		mock := &mockBlobCleaner{cleaned: 42}
		job := NewExpiredBlobJob(mock, 30)

		assert.Equal(t, "expired_blobs", job.Name())
		cleaned, err := job.Run(context.Background())
		assert.NoError(t, err)
		assert.Equal(t, 42, cleaned)
		assert.Equal(t, 30, mock.retentionDays)
	})

	t.Run("ExpiredShareJob", func(t *testing.T) {
		mock := &mockShareCleaner{cleaned: 15}
		job := NewExpiredShareJob(mock)

		assert.Equal(t, "expired_shares", job.Name())
		cleaned, err := job.Run(context.Background())
		assert.NoError(t, err)
		assert.Equal(t, 15, cleaned)
	})
}

type mockBlobCleaner struct {
	cleaned       int
	retentionDays int
}

func (m *mockBlobCleaner) CleanupExpiredBlobs(_ context.Context, retentionDays int) (int, error) {
	m.retentionDays = retentionDays
	return m.cleaned, nil
}

type mockShareCleaner struct {
	cleaned int
}

func (m *mockShareCleaner) CleanupExpiredShares(_ context.Context) (int, error) {
	return m.cleaned, nil
}

func TestRandomJitter(t *testing.T) {
	t.Parallel()

	t.Run("zero max returns zero", func(t *testing.T) {
		assert.Equal(t, time.Duration(0), randomJitter(0))
	})

	t.Run("negative max returns zero", func(t *testing.T) {
		assert.Equal(t, time.Duration(0), randomJitter(-1*time.Second))
	})

	t.Run("positive max returns value in range", func(t *testing.T) {
		max := 10 * time.Second
		for i := 0; i < 100; i++ {
			j := randomJitter(max)
			assert.GreaterOrEqual(t, j, time.Duration(0))
			assert.Less(t, j, max)
		}
	})
}
