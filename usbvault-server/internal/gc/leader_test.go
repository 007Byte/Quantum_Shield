package gc

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLeaderElector_AcquiresLeadership(t *testing.T) {
	t.Parallel()

	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer client.Close()

	le := NewLeaderElector(client, "test:gc:leader", "instance-1", 5*time.Second)

	ctx, cancel := context.WithCancel(context.Background())
	le.Start(ctx)
	defer func() {
		cancel()
		le.Stop()
	}()

	// Give time to acquire
	time.Sleep(50 * time.Millisecond)

	assert.True(t, le.IsLeader(ctx), "should have acquired leadership")

	// Verify Redis key exists
	val, err := client.Get(ctx, "test:gc:leader").Result()
	require.NoError(t, err)
	assert.Equal(t, "instance-1", val)
}

func TestLeaderElector_SecondInstanceDoesNotAcquire(t *testing.T) {
	t.Parallel()

	mr := miniredis.RunT(t)
	client1 := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	client2 := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer client1.Close()
	defer client2.Close()

	le1 := NewLeaderElector(client1, "test:gc:leader2", "instance-1", 5*time.Second)
	le2 := NewLeaderElector(client2, "test:gc:leader2", "instance-2", 5*time.Second)

	ctx, cancel := context.WithCancel(context.Background())
	le1.Start(ctx)
	time.Sleep(50 * time.Millisecond)

	le2.Start(ctx)
	time.Sleep(50 * time.Millisecond)

	assert.True(t, le1.IsLeader(ctx), "instance-1 should be leader")
	assert.False(t, le2.IsLeader(ctx), "instance-2 should not be leader")

	cancel()
	le1.Stop()
	le2.Stop()
}

func TestLeaderElector_ReleasesOnStop(t *testing.T) {
	t.Parallel()

	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer client.Close()

	le := NewLeaderElector(client, "test:gc:leader3", "instance-1", 5*time.Second)

	ctx, cancel := context.WithCancel(context.Background())
	le.Start(ctx)
	time.Sleep(50 * time.Millisecond)

	assert.True(t, le.IsLeader(ctx))

	cancel()
	le.Stop()

	// Key should be deleted
	exists, err := client.Exists(context.Background(), "test:gc:leader3").Result()
	require.NoError(t, err)
	assert.Equal(t, int64(0), exists, "leader key should be released")
}

func TestLeaderElector_FailoverOnExpiry(t *testing.T) {
	t.Parallel()

	mr := miniredis.RunT(t)
	client1 := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	client2 := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer client1.Close()
	defer client2.Close()

	// Short TTL for fast testing
	le1 := NewLeaderElector(client1, "test:gc:leader4", "instance-1", 200*time.Millisecond)
	le2 := NewLeaderElector(client2, "test:gc:leader4", "instance-2", 200*time.Millisecond)

	ctx1, cancel1 := context.WithCancel(context.Background())
	le1.Start(ctx1)
	time.Sleep(50 * time.Millisecond)
	assert.True(t, le1.IsLeader(ctx1))

	// Kill leader 1
	cancel1()
	le1.Stop()

	// Wait for TTL to expire
	mr.FastForward(300 * time.Millisecond)

	// Leader 2 should acquire
	ctx2, cancel2 := context.WithCancel(context.Background())
	le2.Start(ctx2)
	time.Sleep(50 * time.Millisecond)

	assert.True(t, le2.IsLeader(ctx2), "instance-2 should acquire leadership after TTL expiry")

	cancel2()
	le2.Stop()
}
