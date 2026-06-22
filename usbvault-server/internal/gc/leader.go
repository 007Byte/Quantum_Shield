package gc

import (
	"context"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

// LeaderElector provides Redis-based leader election for GC scheduling.
// Only the leader instance runs GC jobs to prevent duplicate work in multi-replica deployments.
type LeaderElector struct {
	client     *redis.Client
	lockKey    string
	instanceID string
	ttl        time.Duration
	renewEvery time.Duration

	mu       sync.RWMutex
	isLeader bool
	cancel   context.CancelFunc
	wg       sync.WaitGroup
}

// NewLeaderElector creates a new Redis-based leader elector.
func NewLeaderElector(client *redis.Client, lockKey, instanceID string, ttl time.Duration) *LeaderElector {
	return &LeaderElector{
		client:     client,
		lockKey:    lockKey,
		instanceID: instanceID,
		ttl:        ttl,
		renewEvery: ttl / 3,
	}
}

// IsLeader returns whether this instance currently holds the leader lock.
func (le *LeaderElector) IsLeader(_ context.Context) bool {
	le.mu.RLock()
	defer le.mu.RUnlock()
	return le.isLeader
}

// Start begins the leader election background loop.
func (le *LeaderElector) Start(ctx context.Context) {
	ctx, le.cancel = context.WithCancel(ctx)
	le.wg.Add(1)

	go func() { //gosec:disable G118 -- long-lived leader-election worker with its own lifecycle context, intentionally decoupled from any request
		defer le.wg.Done()

		// Try to acquire immediately
		le.tryAcquire(ctx)

		ticker := time.NewTicker(le.renewEvery)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				le.release(context.Background())
				log.Info().Str("instance", le.instanceID).Msg("GC leader election stopped")
				return
			case <-ticker.C:
				if le.IsLeader(ctx) {
					le.tryRenew(ctx)
				} else {
					le.tryAcquire(ctx)
				}
			}
		}
	}()
}

// Stop cancels the leader election loop and releases the lock.
func (le *LeaderElector) Stop() {
	if le.cancel != nil {
		le.cancel()
	}
	le.wg.Wait()
}

func (le *LeaderElector) tryAcquire(ctx context.Context) {
	ok, err := le.client.SetNX(ctx, le.lockKey, le.instanceID, le.ttl).Result()
	if err != nil {
		log.Warn().Err(err).Msg("GC leader election: Redis error during acquire")
		le.mu.Lock()
		le.isLeader = false
		le.mu.Unlock()
		return
	}

	le.mu.Lock()
	le.isLeader = ok
	le.mu.Unlock()

	if ok {
		log.Info().Str("instance", le.instanceID).Msg("GC leader election: acquired leadership")
	}
}

func (le *LeaderElector) tryRenew(ctx context.Context) {
	// Verify we still own the lock
	val, err := le.client.Get(ctx, le.lockKey).Result()
	if err != nil || val != le.instanceID {
		le.mu.Lock()
		le.isLeader = false
		le.mu.Unlock()
		log.Warn().Msg("GC leader election: lost leadership")
		return
	}

	// Renew TTL
	le.client.Expire(ctx, le.lockKey, le.ttl)
}

func (le *LeaderElector) release(ctx context.Context) {
	le.mu.Lock()
	wasLeader := le.isLeader
	le.isLeader = false
	le.mu.Unlock()

	if wasLeader {
		// Only delete if we still own it
		val, err := le.client.Get(ctx, le.lockKey).Result()
		if err == nil && val == le.instanceID {
			le.client.Del(ctx, le.lockKey)
		}
		log.Info().Str("instance", le.instanceID).Msg("GC leader election: released leadership")
	}
}
