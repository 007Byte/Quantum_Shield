package config

// DE-020 FIX: Environment variable documentation
// This file documents all environment variables used by the Quantum_Shield server.
//
// Required Variables:
//   DATABASE_URL          - PostgreSQL connection string (e.g., postgres://user:pass@host:5432/dbname?sslmode=require)
//
// Optional Variables (with defaults):
//   SERVER_PORT           - HTTP server port (default: "8080")
//   LOG_LEVEL             - Logging level: "debug", "info", "warn", "error" (default: "info")
//   AWS_REGION            - AWS region for S3 (default: "us-east-1")
//   S3_BUCKET             - S3 bucket name (default: "usbvault-prod")
//   STRIPE_SECRET_KEY     - Stripe API secret key
//   STRIPE_WEBHOOK_SECRET - Stripe webhook signing secret
//   REDIS_URL             - Redis connection URL (default: "redis://localhost:6379")
//   REDIS_SENTINEL_ADDRS  - Comma-separated Redis Sentinel addresses (enables HA mode)
//   REDIS_SENTINEL_MASTER - Redis Sentinel master name (default: "mymaster")
//   CORS_ALLOWED_ORIGINS  - Comma-separated allowed CORS origins
//   ENVIRONMENT           - Deployment environment: "development", "staging", "production"
//   DB_MAX_CONNECTIONS    - Max database connections (default: 30)
//   DB_MIN_CONNECTIONS    - Min database connections (default: 5)
//   MAX_REQUEST_BODY_SIZE - Max request body size in bytes (default: 1048576 = 1MB)
//   SERVER_READ_TIMEOUT   - HTTP read timeout (default: "15s")
//   SERVER_WRITE_TIMEOUT  - HTTP write timeout (default: "15s")
//   SERVER_IDLE_TIMEOUT   - HTTP idle timeout (default: "60s")
//   API_HOST              - API hostname for HTTPS redirect
//   JWT_PRIVATE_KEY_FILE  - Path to ED25519 private key file
//   JWT_PUBLIC_KEY_FILE   - Path to ED25519 public key file
