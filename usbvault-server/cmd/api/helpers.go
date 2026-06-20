package main

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
)

// getEnvOrDefault returns the environment variable value or a default if not set
func getEnvOrDefault(key, defaultValue string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultValue
}

// getAllowedOrigins returns the list of allowed CORS origins from environment
// Reads CORS_ALLOWED_ORIGINS (comma-separated) or uses development defaults
func getAllowedOrigins() []string {
	originsStr := os.Getenv("CORS_ALLOWED_ORIGINS")
	if originsStr == "" {
		if os.Getenv("ENVIRONMENT") == "production" {
			log.Fatal().Msg("CORS_ALLOWED_ORIGINS must be set in production")
		}
		// Development defaults
		return []string{"https://localhost:3000", "https://localhost:8081"}
	}

	var origins []string
	for _, origin := range strings.Split(originsStr, ",") {
		trimmed := strings.TrimSpace(origin)
		if trimmed != "" {
			origins = append(origins, trimmed)
		}
	}

	if len(origins) == 0 {
		if os.Getenv("ENVIRONMENT") == "production" {
			log.Fatal().Msg("CORS_ALLOWED_ORIGINS must be set in production")
		}
		return []string{"https://localhost:3000", "https://localhost:8081"}
	}

	return origins
}

// extractRedisAddr extracts host:port from redis://host:port
func extractRedisAddr(redisURL string) string {
	// Simple extraction of host:port from redis://host:port
	if len(redisURL) > 8 {
		return redisURL[8:]
	}
	return "localhost:6379"
}

// parseDurationFromEnv parses a duration from an environment variable with a default
func parseDurationFromEnv(key string, defaultDuration time.Duration) time.Duration {
	val := os.Getenv(key)
	if val == "" {
		return defaultDuration
	}

	duration, err := time.ParseDuration(val)
	if err != nil {
		log.Warn().Err(err).Str("key", key).Str("value", val).Msg("failed to parse duration from env, using default")
		return defaultDuration
	}

	return duration
}

// getIntEnvOrDefault parses an integer from an environment variable with a default
func getIntEnvOrDefault(key string, defaultValue int) int {
	val := os.Getenv(key)
	if val == "" {
		return defaultValue
	}

	intVal, err := strconv.Atoi(val)
	if err != nil {
		log.Warn().Err(err).Str("key", key).Str("value", val).Msg("failed to parse int from env, using default")
		return defaultValue
	}

	return intVal
}

// getS3BucketName returns the S3 bucket name for health checks
func getS3BucketName() *string {
	bucket := getEnvOrDefault("S3_BUCKET", "usbvault-files")
	return &bucket
}
