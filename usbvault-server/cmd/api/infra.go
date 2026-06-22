package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/usbvault/usbvault-server/internal/tracing"
	"github.com/usbvault/usbvault-server/migrations"
)

// connectDB initializes the PostgreSQL connection pool with configurable limits.
// Runs migrations on startup if the migrations directory exists.
func (a *App) connectDB(ctx context.Context) error {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal().Msg("DATABASE_URL not set")
	}

	// MEDIUM-FIX: Configure connection pool with configurable limits via environment variables
	poolConfig, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to parse database URL")
	}

	// Read max and min connections from environment variables with defaults
	maxConns := getIntEnvOrDefault("DB_MAX_CONNECTIONS", 30)
	minConns := getIntEnvOrDefault("DB_MIN_CONNECTIONS", 5)

	poolConfig.MaxConns = int32(maxConns) //gosec:disable G115 -- DB pool sizes are small operator-set values, no overflow
	poolConfig.MinConns = int32(minConns) //gosec:disable G115 -- DB pool sizes are small operator-set values, no overflow
	poolConfig.MaxConnLifetime = 30 * time.Minute
	poolConfig.MaxConnIdleTime = 5 * time.Minute

	log.Info().
		Int32("max_connections", poolConfig.MaxConns).
		Int32("min_connections", poolConfig.MinConns).
		Msg("database connection pool configured")

	dbPool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create database pool")
	}

	if err := dbPool.Ping(ctx); err != nil {
		log.Fatal().Err(err).Msg("database connection failed")
	}
	log.Info().Msg("database connected")

	// Run database migrations on startup
	migrationsDir := os.Getenv("MIGRATIONS_DIR")
	if migrationsDir == "" {
		migrationsDir = "migrations"
	}
	migrationsDir = filepath.Clean(migrationsDir)
	if info, err := os.Stat(migrationsDir); err == nil && info.IsDir() { //gosec:disable G703 -- operator-configured path from trusted env var, normalized with filepath.Clean
		migrator := migrations.NewMigrator(dbPool, migrationsDir)
		if err := migrator.Migrate(ctx); err != nil {
			log.Fatal().Err(err).Msg("database migration failed")
		}
	} else {
		log.Warn().Str("dir", migrationsDir).Msg("migrations directory not found, skipping auto-migration")
	}

	a.dbPool = dbPool
	return nil
}

// connectRedis initializes the Redis client with optional Sentinel support for high availability.
func (a *App) connectRedis(ctx context.Context) error {
	var redisClient *redis.Client
	sentinelAddrs := os.Getenv("REDIS_SENTINEL_ADDRS")

	if sentinelAddrs != "" {
		// Use Redis Sentinel for failover support
		sentAddrs := strings.Split(sentinelAddrs, ",")
		redisClient = redis.NewFailoverClient(&redis.FailoverOptions{
			SentinelAddrs: sentAddrs,
			MasterName:    getEnvOrDefault("REDIS_SENTINEL_MASTER", "mymaster"),
		})
		log.Info().Strs("sentinel_addrs", sentAddrs).Msg("redis sentinel initialized")
	} else {
		// Fallback to single Redis instance
		redisURL := os.Getenv("REDIS_URL")
		if redisURL == "" {
			if os.Getenv("ENVIRONMENT") == "production" {
				log.Fatal().Msg("REDIS_URL must be set in production")
			}
			redisURL = "redis://localhost:6379"
		}
		redisOpts, err := redis.ParseURL(redisURL)
		if err != nil {
			log.Fatal().Err(err).Str("url", redisURL).Msg("failed to parse REDIS_URL")
		}
		redisClient = redis.NewClient(redisOpts)
	}

	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Fatal().Err(err).Msg("redis connection failed")
	}
	log.Info().Msg("redis connected")

	a.redisClient = redisClient
	return nil
}

// initS3 initializes the S3 client — fails fast if configuration is missing.
func (a *App) initS3(ctx context.Context) error {
	s3Endpoint := os.Getenv("S3_ENDPOINT")
	s3Bucket := getEnvOrDefault("S3_BUCKET", "")
	s3Region := getEnvOrDefault("AWS_REGION", "us-east-1")
	s3AccessKey := getEnvOrDefault("S3_ACCESS_KEY", os.Getenv("AWS_ACCESS_KEY_ID"))
	s3SecretKey := getEnvOrDefault("S3_SECRET_KEY", os.Getenv("AWS_SECRET_ACCESS_KEY"))

	if s3Endpoint == "" {
		log.Fatal().Msg("S3_ENDPOINT not set")
	}
	if s3Bucket == "" {
		log.Fatal().Msg("S3_BUCKET not set")
	}

	log.Info().
		Str("s3_endpoint", s3Endpoint).
		Str("s3_bucket", s3Bucket).
		Str("aws_region", s3Region).
		Bool("has_s3_access_key", s3AccessKey != "").
		Bool("has_s3_secret_key", s3SecretKey != "").
		Msg("resolved s3 configuration")

	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(s3Region),
		config.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(s3AccessKey, s3SecretKey, ""),
		),
	)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load AWS config")
	}

	s3Client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(s3Endpoint)
		o.UsePathStyle = true
	})
	log.Info().Str("endpoint", s3Endpoint).Msg("S3 client initialized")

	a.s3Client = s3Client
	a.s3Bucket = s3Bucket
	return nil
}

// initTracing initializes OpenTelemetry tracing.
func (a *App) initTracing(ctx context.Context) error {
	// PH2-FIX: Initialize OpenTelemetry tracing
	shutdownTracer, err := tracing.InitTracer(ctx, "usbvault-server", "1.0.0")
	if err != nil {
		log.Warn().Err(err).Msg("PH2-FIX: Failed to initialize tracer, continuing without tracing")
		a.shutdownTracer = func(_ context.Context) error { return nil }
		return nil
	}
	a.shutdownTracer = shutdownTracer
	return nil
}
