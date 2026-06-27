package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/rs/zerolog/log"

	auth "github.com/usbvault/usbvault-server/internal/auth"
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

// initServices constructs all domain services and stores them in the App.
// This is called after infrastructure is initialized.
func (a *App) initServices(ctx context.Context) error {
	// PH2-FIX: Initialize JWT key rotation service
	keyRotationService := auth.NewKeyRotationService(a.dbPool)
	if err := keyRotationService.Initialize(ctx); err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize JWT key rotation")
	}
	auth.SetKeyRotationService(keyRotationService)

	// PH2-FIX: Start auto-rotation every 90 days
	keyRotationService.StartAutoRotation(ctx, 90*24*time.Hour)
	a.keyRotationService = keyRotationService

	// PH1-FIX: Initialize circuit breakers for all external dependencies
	dbCircuitBreaker := resilience.NewCircuitBreakerWithConfig("database", 5, 30*time.Second)
	redisCircuitBreaker := resilience.NewCircuitBreakerWithConfig("redis", 3, 15*time.Second)
	s3CircuitBreaker := resilience.NewCircuitBreakerWithConfig("s3", 3, 30*time.Second)
	log.Info().Msg("PH1-FIX: circuit breakers initialized for database, redis, and s3")

	// PH1-FIX: Store circuit breakers for health check and middleware access
	a.dbCircuitBreaker = dbCircuitBreaker
	a.redisCircuitBreaker = redisCircuitBreaker
	a.s3CircuitBreaker = s3CircuitBreaker

	// Initialize core services with repository pattern
	// PH4-FIX: Create repository implementations for vault and sharing operations
	vaultRepository := vault.NewPostgresVaultRepository(a.dbPool)
	sharingRepository := sharing.NewPostgresSharingRepository(a.dbPool)

	vaultService := vault.NewVaultService(vaultRepository)
	storageService := storagepkg.NewStorageService(a.s3Client, a.dbPool)
	// PH2-FIX: Initialize multipart upload service
	multipartService := storagepkg.NewMultipartService(a.s3Client, a.s3Bucket)
	sharingService := sharing.NewSharingService(sharingRepository)
	// PH5-FIX: Initialize contact verification and cleanup services
	contactVerificationService := sharing.NewContactVerificationService(a.dbPool)
	cleanupService := sharing.NewCleanupService(a.dbPool)
	blobLifecycleService := storagepkg.NewBlobLifecycleService(a.s3Client, a.dbPool)
	auditService := auditpkg.NewAuditService(a.dbPool)

	a.vaultService = vaultService
	a.storageService = storageService
	a.multipartService = multipartService
	a.sharingService = sharingService
	a.contactVerificationService = contactVerificationService
	a.cleanupService = cleanupService
	a.blobLifecycleService = blobLifecycleService
	a.auditService = auditService

	// GC scheduler: background cleanup for expired blobs, shares, sessions, etc.
	// Phase 1 Security Fix: Enable Redis-based leader election for distributed deployments.
	// Only the leader instance runs GC jobs, preventing duplicate work across replicas.
	gcInstanceID := os.Getenv("GC_INSTANCE_ID")
	if gcInstanceID == "" {
		// Generate a unique instance ID from hostname + PID for single-instance deployments
		hostname, _ := os.Hostname()
		gcInstanceID = fmt.Sprintf("%s-%d", hostname, os.Getpid())
	}
	gcLockKey := getEnvOrDefault("GC_LOCK_KEY", "usbvault:gc:leader")
	gcLockTTL := 30 * time.Second

	gcLeader := gc.NewLeaderElector(a.redisClient, gcLockKey, gcInstanceID, gcLockTTL)
	gcLeader.Start(ctx)
	log.Info().Str("instance_id", gcInstanceID).Str("lock_key", gcLockKey).Msg("GC leader election started")
	a.gcLeader = gcLeader

	gcScheduler := gc.NewSchedulerWithLeader(gcLeader)
	gcScheduler.Register(gc.JobConfig{
		Job:      gc.NewExpiredBlobJob(blobLifecycleService, 30),
		Interval: 6 * time.Hour,
		Jitter:   15 * time.Minute,
		Timeout:  10 * time.Minute,
		Enabled:  true,
	})
	gcScheduler.Register(gc.JobConfig{
		Job:      gc.NewExpiredShareJob(cleanupService),
		Interval: 1 * time.Hour,
		Jitter:   5 * time.Minute,
		Timeout:  5 * time.Minute,
		Enabled:  true,
	})
	gcScheduler.Register(gc.JobConfig{
		Job:      gc.NewSessionCleanupJob(a.dbPool),
		Interval: 30 * time.Minute,
		Jitter:   5 * time.Minute,
		Timeout:  2 * time.Minute,
		Enabled:  true,
	})
	gcScheduler.Register(gc.JobConfig{
		Job:      gc.NewAuditRetentionJob(auditService, 365, 730),
		Interval: 24 * time.Hour,
		Jitter:   1 * time.Hour,
		Timeout:  30 * time.Minute,
		Enabled:  true,
	})
	gcScheduler.Register(gc.JobConfig{
		Job:      gc.NewS3OrphanJob(a.s3Client, a.dbPool, a.s3Bucket, 1000),
		Interval: 24 * time.Hour,
		Jitter:   2 * time.Hour,
		Timeout:  60 * time.Minute,
		Enabled:  true,
	})
	gcScheduler.Register(gc.JobConfig{
		Job:      gc.NewMultipartCleanupJob(a.s3Client, a.s3Bucket, 24*time.Hour),
		Interval: 12 * time.Hour,
		Jitter:   1 * time.Hour,
		Timeout:  15 * time.Minute,
		Enabled:  true,
	})
	gcScheduler.Register(gc.JobConfig{
		Job:      gc.NewRedisScanJob(a.redisClient, 1024*1024), // Report keys > 1MB
		Interval: 6 * time.Hour,
		Jitter:   30 * time.Minute,
		Timeout:  5 * time.Minute,
		Enabled:  true,
	})
	gcScheduler.Start(ctx)
	a.gcScheduler = gcScheduler

	// Additional services
	billingService := billingpkg.NewBillingService(os.Getenv("STRIPE_SECRET_KEY"), a.dbPool)
	notifyService := notify.NewNotifyService(a.dbPool)
	syncService := sync.NewSyncService(a.redisClient)

	a.billingService = billingService
	a.notifyService = notifyService
	a.syncService = syncService

	// F3: wire authoritative server-side tier enforcement now that the tier
	// source (billing/subscriptions + users.subscription_tier) is available.
	//   - Vault creation: enforce per-tier MaxVaults cap.
	//   - File upload: enforce per-tier max file size (DV-001 path).
	vaultService.SetTierLimiter(vault.NewTierLimiter(a.dbPool))
	storageService.SetBillingChecker(billingService)
	// F3: gate the multipart upload path by the same authoritative tier source so a
	// client cannot bypass the single-shot per-tier file-size limit via multipart.
	multipartService.SetBillingChecker(billingService)
	// F3 (FIX A/B): give the multipart path the S3-sourced storage-usage source so
	// the post-assembly finalize check enforces the same cumulative MaxStorageMB
	// quota as the single-shot upload path (authoritative size truth is S3).
	multipartService.SetStorageUsageChecker(storageService)
	// F3: gate share creation by the sharing feature/tier and per-tier maxShares.
	sharingService.SetBillingChecker(billingService)

	// Initialize backup service
	backupConfig, err := backuppkg.LoadBackupConfig()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load backup config")
	}
	var backupService *backuppkg.BackupService
	if backupConfig != nil {
		s3Uploader := backuppkg.NewS3Uploader(a.s3Client)
		backupService = backuppkg.NewBackupService(backupConfig, os.Getenv("DATABASE_URL"), backuppkg.NewDefaultExecutor(), s3Uploader)
		log.Info().Msg("backup service initialized")
	} else {
		log.Warn().Msg("backup service not configured (BACKUP_ENCRYPTION_KEY not set)")
	}
	a.backupService = backupService

	// Authentication and authorization services
	lockoutService := auth.NewAccountLockoutService(a.redisClient)
	rbacService := auth.NewRBACService(a.dbPool)
	// PH5-FIX: Initialize key rotation service for vault
	vaultKeyRotationService := vault.NewKeyRotationService(a.dbPool, auditService)
	// PH6-FIX: Initialize anomaly detection and compliance services
	anomalyDetectionService := auditpkg.NewAnomalyDetectionService(a.dbPool)
	complianceService := auditpkg.NewComplianceService(a.dbPool)

	a.lockoutService = lockoutService
	a.rbacService = rbacService
	a.vaultKeyRotationService = vaultKeyRotationService
	a.anomalyDetectionService = anomalyDetectionService
	a.complianceService = complianceService

	// OIDC (enterprise SSO) — optional, only initialized when OIDC_ENABLED=true
	oidcConfig, err := oidcpkg.LoadConfig()
	if err != nil {
		log.Warn().Err(err).Msg("failed to load OIDC config, SSO will be unavailable")
	} else if oidcConfig != nil && oidcConfig.Enabled {
		oidcService, err := oidcpkg.NewService(oidcConfig, a.dbPool, a.redisClient)
		if err != nil {
			log.Error().Err(err).Msg("failed to initialize OIDC service, SSO will be unavailable")
		} else {
			a.oidcService = oidcService
			log.Info().Msg("OIDC service initialized")
		}
	}

	return nil
}
