package gc

import (
	"context"
	"strconv"
	"strings"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

// RedisScanJob is a read-only observability job that reports on Redis memory usage.
type RedisScanJob struct {
	client    *redis.Client
	threshold int64 // Report keys larger than this (bytes)
}

func NewRedisScanJob(client *redis.Client, threshold int64) *RedisScanJob {
	return &RedisScanJob{client: client, threshold: threshold}
}

func (j *RedisScanJob) Name() string { return "redis_scan" }

func (j *RedisScanJob) Run(ctx context.Context) (int, error) {
	// Get memory info
	info, err := j.client.Info(ctx, "memory").Result()
	if err != nil {
		return 0, err
	}

	var usedMemory, peakMemory int64
	var fragRatio string

	for _, line := range strings.Split(info, "\r\n") {
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		switch parts[0] {
		case "used_memory":
			usedMemory, _ = strconv.ParseInt(parts[1], 10, 64)
		case "used_memory_peak":
			peakMemory, _ = strconv.ParseInt(parts[1], 10, 64)
		case "mem_fragmentation_ratio":
			fragRatio = parts[1]
		}
	}

	log.Info().
		Int64("used_memory_bytes", usedMemory).
		Int64("peak_memory_bytes", peakMemory).
		Str("fragmentation_ratio", fragRatio).
		Msg("GC: Redis memory report")

	// Scan for large keys
	largeKeys := 0
	var cursor uint64

	for {
		if ctx.Err() != nil {
			return largeKeys, ctx.Err()
		}

		keys, nextCursor, err := j.client.Scan(ctx, cursor, "*", 100).Result()
		if err != nil {
			return largeKeys, err
		}

		for _, key := range keys {
			usage, err := j.client.MemoryUsage(ctx, key).Result()
			if err != nil {
				continue
			}
			if usage > j.threshold {
				largeKeys++
				log.Warn().
					Str("key", key).
					Int64("bytes", usage).
					Msg("GC: large Redis key detected")
			}
		}

		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	return largeKeys, nil
}
