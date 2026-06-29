package main

import (
	"context"
	"crypto/tls"
	"net/http"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/joho/godotenv"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	auth "github.com/usbvault/usbvault-server/internal/auth"
	"github.com/usbvault/usbvault-server/internal/errortracking"
	oidcpkg "github.com/usbvault/usbvault-server/internal/oidc"
	"github.com/usbvault/usbvault-server/internal/resilience"
	sharing "github.com/usbvault/usbvault-server/internal/sharing"
	storagepkg "github.com/usbvault/usbvault-server/internal/storage"
	"github.com/usbvault/usbvault-server/internal/sync"
	auditpkg "github.com/usbvault/usbvault-server/internal/audit"
	backuppkg "github.com/usbvault/usbvault-server/internal/backup"
	billingpkg "github.com/usbvault/usbvault-server/internal/billing"
	"github.com/usbvault/usbvault-server/internal/gc"
	"github.com/usbvault/usbvault-server/internal/notify"
	"github.com/usbvault/usbvault-server/internal/vault"
)

// App holds all application state and services
type App struct {
	// Infrastructure
	dbPool       *pgxpool.Pool
	redisClient  *redis.Client
	s3Client     *s3.Client
	s3Bucket     string
	shutdownTracer func(context.Context) error

	// Circuit breakers
	dbCircuitBreaker    *resilience.CircuitBreaker
	redisCircuitBreaker *resilience.CircuitBreaker
	s3CircuitBreaker    *resilience.CircuitBreaker

	// Core services
	vaultService    *vault.VaultService
	storageService  *storagepkg.StorageService
	multipartService *storagepkg.MultipartService
	sharingService   *sharing.SharingService
	contactVerificationService *sharing.ContactVerificationService
	cleanupService   *sharing.CleanupService
	blobLifecycleService *storagepkg.BlobLifecycleService
	auditService    *auditpkg.AuditService

	// Auth services
	keyRotationService *auth.KeyRotationService
	lockoutService     *auth.AccountLockoutService
	rbacService        *auth.RBACService

	// Vault services
	vaultKeyRotationService *vault.KeyRotationService

	// OIDC (enterprise SSO)
	oidcService *oidcpkg.Service

	// Additional services
	billingService     *billingpkg.BillingService
	notifyService      *notify.NotifyService
	syncService        *sync.SyncService
	backupService      *backuppkg.BackupService
	anomalyDetectionService *auditpkg.AnomalyDetectionService
	complianceService  *auditpkg.ComplianceService

	// GC and background jobs
	gcScheduler *gc.Scheduler
	gcLeader    *gc.LeaderElector

	// HTTP server
	server *http.Server
}

// Run initializes the application and starts the HTTP server.
// It handles graceful shutdown on receiving SIGINT or SIGTERM.
func (a *App) Run(ctx context.Context) error {
	// Load environment variables
	_ = godotenv.Load()

	// Initialize Sentry error tracking (no-op if SENTRY_DSN is empty)
	if err := errortracking.Init(
		os.Getenv("SENTRY_DSN"),
		os.Getenv("ENVIRONMENT"),
		"1.0.0",
	); err != nil {
		log.Warn().Err(err).Msg("Failed to initialize Sentry, continuing without error tracking")
	}
	defer errortracking.Flush(2 * time.Second)

	// Initialize tracing
	if err := a.initTracing(ctx); err != nil {
		log.Fatal().Err(err).Msg("failed to initialize tracing")
	}

	// Initialize infrastructure (DB, Redis, S3)
	if err := a.connectDB(ctx); err != nil {
		log.Fatal().Err(err).Msg("failed to connect to database")
	}

	if err := a.connectRedis(ctx); err != nil {
		log.Fatal().Err(err).Msg("failed to connect to redis")
	}

	if err := a.initS3(ctx); err != nil {
		log.Fatal().Err(err).Msg("failed to initialize S3")
	}

	// Initialize services
	if err := a.initServices(ctx); err != nil {
		log.Fatal().Err(err).Msg("failed to initialize services")
	}

	// Set up HTTP server
	isProduction := os.Getenv("ENVIRONMENT") == "production"

	// MED-FIX (user enumeration): the decoy SRP-init salt for non-existent
	// accounts is derived via an HMAC keyed on SRP_ENUM_SECRET. In production
	// this secret MUST be set and at least 32 bytes so the decoy salt is
	// unguessable; otherwise an attacker could recompute the deterministic decoy
	// salt and distinguish real from fake accounts. Mirrors the ENVIRONMENT==
	// "production" fail-closed gate used for the JWT key-at-rest KEK. Dev/test
	// fall back to an empty secret (still deterministic) so local runs/tests work.
	if isProduction && len(os.Getenv("SRP_ENUM_SECRET")) < 32 {
		log.Fatal().Msg("SRP_ENUM_SECRET must be set to at least 32 bytes in production (anti-enumeration decoy salt key)")
	}

	router := a.setupRouter(isProduction)

	// MEDIUM-FIX: Configurable server timeouts via environment variables
	port := getEnvOrDefault("SERVER_PORT", "8080")
	readTimeout := parseDurationFromEnv("SERVER_READ_TIMEOUT", 15*time.Second)
	writeTimeout := parseDurationFromEnv("SERVER_WRITE_TIMEOUT", 15*time.Second)
	idleTimeout := parseDurationFromEnv("SERVER_IDLE_TIMEOUT", 60*time.Second)

	log.Info().
		Dur("read_timeout", readTimeout).
		Dur("write_timeout", writeTimeout).
		Dur("idle_timeout", idleTimeout).
		Msg("server timeouts configured")

	// TLS 1.3 minimum with strong cipher suites — defense in depth even behind a reverse proxy.
	// When TLS_CERT_FILE and TLS_KEY_FILE are set, the server terminates TLS directly.
	// Otherwise, it runs plain HTTP (expecting TLS termination at the reverse proxy).
	tlsConfig := &tls.Config{
		MinVersion: tls.VersionTLS13,
		CurvePreferences: []tls.CurveID{
			tls.X25519,
			tls.CurveP256,
		},
	}

	a.server = &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  readTimeout,
		WriteTimeout: writeTimeout,
		IdleTimeout:  idleTimeout,
		TLSConfig:    tlsConfig,
	}

	// Start the server in a goroutine (main.go handles signal listening)
	tlsCertFile := os.Getenv("TLS_CERT_FILE")
	tlsKeyFile := os.Getenv("TLS_KEY_FILE")

	go func() {
		if tlsCertFile != "" && tlsKeyFile != "" {
			log.Info().Str("port", port).Msg("starting server with TLS 1.3")
			if err := a.server.ListenAndServeTLS(tlsCertFile, tlsKeyFile); err != nil && err != http.ErrServerClosed {
				log.Fatal().Err(err).Msg("server error")
			}
		} else {
			if isProduction {
				log.Warn().Msg("TLS_CERT_FILE/TLS_KEY_FILE not set — running plain HTTP in production (ensure reverse proxy terminates TLS)")
			}
			log.Info().Str("port", port).Msg("starting server (plain HTTP — expects TLS termination at reverse proxy)")
			if err := a.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Fatal().Err(err).Msg("server error")
			}
		}
	}()

	return nil
}

// Shutdown gracefully shuts down the application, closing all connections and stopping background jobs.
func (a *App) Shutdown(ctx context.Context) error {
	// MEDIUM-FIX: Create shutdown context with 30-second timeout
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// MEDIUM-FIX: Gracefully shutdown HTTP server
	if a.server != nil {
		if err := a.server.Shutdown(shutdownCtx); err != nil {
			log.Error().Err(err).Msg("server shutdown error")
		}
	}
	log.Info().Msg("server shutdown complete")

	// Stop GC scheduler before closing connections
	if a.gcScheduler != nil {
		a.gcScheduler.Stop()
	}
	if a.gcLeader != nil {
		a.gcLeader.Stop()
	}

	// MEDIUM-FIX: Close database pool
	if a.dbPool != nil {
		a.dbPool.Close()
		log.Info().Msg("database pool closed")
	}

	// MEDIUM-FIX: Close Redis connections
	if a.redisClient != nil {
		a.redisClient.Close()
		log.Info().Msg("redis connection closed")
	}

	// Shutdown tracer
	if a.shutdownTracer != nil {
		if err := a.shutdownTracer(shutdownCtx); err != nil {
			log.Error().Err(err).Msg("tracer shutdown error")
		}
	}

	log.Info().Msg("graceful shutdown complete")
	return nil
}
