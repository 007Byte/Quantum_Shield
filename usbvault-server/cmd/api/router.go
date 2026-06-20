package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog/log"

	auth "github.com/usbvault/usbvault-server/internal/auth"
	"github.com/usbvault/usbvault-server/internal/errortracking"
	"github.com/usbvault/usbvault-server/internal/metrics"
	mw "github.com/usbvault/usbvault-server/internal/middleware"
	"github.com/usbvault/usbvault-server/internal/notify"
	oidcpkg "github.com/usbvault/usbvault-server/internal/oidc"
	sharing "github.com/usbvault/usbvault-server/internal/sharing"
	storagepkg "github.com/usbvault/usbvault-server/internal/storage"
	"github.com/usbvault/usbvault-server/internal/sync"
	auditpkg "github.com/usbvault/usbvault-server/internal/audit"
	recoverypkg "github.com/usbvault/usbvault-server/internal/recovery"
	billingpkg "github.com/usbvault/usbvault-server/internal/billing"
	"github.com/usbvault/usbvault-server/internal/gc"
	"github.com/usbvault/usbvault-server/internal/vault"
)

// setupRouter configures the Chi router with all middleware and routes.
func (a *App) setupRouter(isProduction bool) *chi.Mux {
	r := chi.NewRouter()

	// Global middleware
	r.Use(middleware.RequestID)
	// Sentry panic recovery middleware (no-op if DSN not configured)
	r.Use(errortracking.RecoverMiddleware)
	// PH2-FIX: Prometheus business metrics middleware
	r.Use(mw.MetricsMiddleware)
	// PH2-FIX: Add OpenTelemetry tracing middleware
	r.Use(mw.TracingMiddleware)
	r.Use(mw.RequestLogger())
	// MEDIUM-FIX: Apply request body limit middleware to prevent oversized requests
	r.Use(mw.RequestBodyLimit(mw.DefaultRequestBodyLimitConfig()))
	r.Use(mw.NewRateLimiter(a.redisClient, mw.RateLimitConfig{
		PerIP:         100,
		PerUser:       1000,
		Window:        time.Minute,
		AuthEndpoints: 10,
	}))

	// CORS with explicit allowed origins (no wildcards for https://)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   getAllowedOrigins(),
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// HTTPS enforcement
	r.Use(mw.SecurityHeaders(mw.DefaultSecurityHeadersConfig(isProduction)))
	r.Use(mw.HTTPSRedirect(mw.DefaultHTTPSRedirectConfig(isProduction)))

	// RFC 9116: Serve security.txt at well-known path (public, no auth required)
	r.Get("/.well-known/security.txt", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		http.ServeFile(w, r, "static/.well-known/security.txt")
	})

	// Apple Universal Links — AASA (must be served without redirects, Content-Type application/json)
	r.Get("/.well-known/apple-app-site-association", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		http.ServeFile(w, r, "static/.well-known/apple-app-site-association")
	})

	// Android App Links — Digital Asset Links
	r.Get("/.well-known/assetlinks.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		http.ServeFile(w, r, "static/.well-known/assetlinks.json")
	})

	// Auth middleware (extracts JWT if present, doesn't require it)
	r.Use(mw.AuthMiddleware(a.redisClient))

	// Phase 1 Security Fix: Audit middleware logs all mutating requests as security events.
	// This ensures SOC 2 compliance even if handlers forget to call auditService.LogAction().
	r.Use(mw.AuditMiddleware(a.auditService, mw.DefaultAuditMiddlewareConfig()))

	// MEDIUM-FIX: Health check with enhanced deep checks for all critical dependencies
	r.Get("/health", a.handleHealth())

	// Readiness probe (Kubernetes)
	r.Get("/ready", a.handleReady())

	// DE-008 FIX: Connection pool monitoring endpoint
	r.Get("/metrics/pool", a.handleMetricsPool())

	// PH2-FIX: Prometheus metrics endpoint (outside auth, for Prometheus scraping)
	r.Handle("/metrics", promhttp.Handler())

	// Reference metrics import to ensure it's not marked unused
	_ = metrics.VaultCount

	// API routes
	r.Route("/api/v1", func(r chi.Router) {
		// Auth routes (public, with stricter rate limiting)
		r.Route("/auth", func(r chi.Router) {
			r.Use(mw.AuthRateLimiter(a.redisClient))
			r.Post("/srp/init", auth.HandleSRPInit(a.dbPool, a.redisClient, a.lockoutService))
			r.Post("/srp/verify", auth.HandleSRPVerify(a.dbPool, a.redisClient, a.lockoutService, a.auditService))
			r.Post("/fido2/challenge", auth.HandleFIDO2Challenge(a.dbPool, a.redisClient))
			r.Post("/fido2/verify", auth.HandleFIDO2Verify(a.dbPool, a.redisClient, a.auditService))
			r.Post("/register", auth.HandleRegister(a.dbPool, a.auditService))
			r.Post("/refresh", auth.HandleRefreshToken(a.redisClient, a.auditService))
			r.Post("/logout", auth.HandleLogout(a.redisClient, a.auditService))

			// OIDC routes (enterprise SSO)
			if a.oidcService != nil {
				r.Route("/oidc", func(r chi.Router) {
					r.Get("/providers", oidcpkg.HandleListProviders(a.oidcService))
					r.Get("/{slug}/authorize", oidcpkg.HandleAuthorize(a.oidcService))
					r.Post("/{slug}/callback", oidcpkg.HandleCallback(a.oidcService, a.auditService))
				})
			}

			// FIDO2 registration and credential management (authenticated)
			r.Route("/fido2/manage", func(r chi.Router) {
				r.Use(mw.RequireAuth)
				r.Post("/register/init", auth.HandleFIDO2RegisterChallenge(a.dbPool, a.redisClient))
				r.Post("/register/verify", auth.HandleFIDO2RegisterVerify(a.dbPool, a.redisClient, a.auditService))
				r.Get("/credentials", auth.HandleFIDO2ListCredentials(a.dbPool))
				r.Delete("/credentials", auth.HandleFIDO2DeleteCredential(a.dbPool, a.auditService))
			})
		})

		// Vault routes (authenticated)
		r.Route("/vaults", func(r chi.Router) {
			r.Use(mw.RequireAuth)
			r.Post("/", vault.HandleCreateVault(a.vaultService, a.auditService))
			r.Get("/", vault.HandleListVaults(a.vaultService))
			r.With(mw.RequireVaultPermission(a.rbacService, auth.PermRead)).Get("/{vaultID}", vault.HandleGetVault(a.vaultService))
			r.With(mw.RequireVaultPermission(a.rbacService, auth.PermUpdate)).Put("/{vaultID}", vault.HandleUpdateVault(a.vaultService, a.auditService))
			r.With(mw.RequireVaultPermission(a.rbacService, auth.PermDelete)).Delete("/{vaultID}", vault.HandleDeleteVault(a.vaultService, a.auditService))

			// PH1-FIX: Key hierarchy routes for wrappedMek/kekSalt storage
			r.With(mw.RequireVaultPermission(a.rbacService, auth.PermUpdate)).Post("/{vaultID}/key-hierarchy", vault.HandleStoreKeyHierarchy(a.dbPool))
			r.With(mw.RequireVaultPermission(a.rbacService, auth.PermRead)).Get("/{vaultID}/key-hierarchy", vault.HandleGetKeyHierarchy(a.dbPool))

			// Blobs (files) in vault
			r.Route("/{vaultID}/blobs", func(r chi.Router) {
				r.With(mw.RequireVaultPermission(a.rbacService, auth.PermUpdate)).Post("/upload-url", storagepkg.HandleGenerateUploadURL(a.storageService))
				r.With(mw.RequireVaultPermission(a.rbacService, auth.PermRead)).Post("/download-url", storagepkg.HandleGenerateDownloadURL(a.storageService))
				r.With(mw.RequireVaultPermission(a.rbacService, auth.PermRead)).Get("/", storagepkg.HandleListBlobs(a.storageService))
				r.With(mw.RequireVaultPermission(a.rbacService, auth.PermDelete)).Delete("/{blobID}", storagepkg.HandleDeleteBlob(a.storageService, a.auditService))
			})

			// PH2-FIX: Multipart upload routes
			r.Route("/{vaultID}/files/{fileID}/multipart", func(r chi.Router) {
				r.Use(mw.RequireVaultPermission(a.rbacService, auth.PermUpdate))
				r.Post("/", storagepkg.HandleInitiateMultipart(a.multipartService))
				r.Get("/{uploadID}/part/{partNumber}", storagepkg.HandleGetPartURL(a.multipartService))
				r.Post("/{uploadID}/part", storagepkg.HandleCompletePart(a.multipartService))
				r.Post("/{uploadID}/complete", storagepkg.HandleFinalizeUpload(a.multipartService))
				r.Delete("/{uploadID}", storagepkg.HandleAbortUpload(a.multipartService))
				r.Get("/{uploadID}/progress", storagepkg.HandleGetProgress(a.multipartService))
			})

			// RBAC member management routes
			r.Route("/{vaultID}/members", func(r chi.Router) {
				r.With(mw.RequireVaultPermission(a.rbacService, auth.PermRead)).Get("/", vault.HandleListMembers(a.rbacService))
				r.With(mw.VaultOwnerOnly(a.rbacService)).Post("/", vault.HandleAddMember(a.rbacService, a.auditService))
				r.With(mw.VaultOwnerOnly(a.rbacService)).Delete("/{memberUserID}", vault.HandleRemoveMember(a.rbacService, a.auditService))
				r.With(mw.VaultOwnerOnly(a.rbacService)).Post("/transfer-ownership", vault.HandleTransferOwnership(a.rbacService, a.auditService))
			})

			// PH5-FIX: Key rotation routes
			r.With(mw.VaultOwnerOnly(a.rbacService)).Post("/{vaultID}/rotate", vault.HandleInitiateKeyRotation(a.vaultKeyRotationService))
			r.With(mw.RequireVaultPermission(a.rbacService, auth.PermRead)).Get("/{vaultID}/rotation-status", vault.HandleGetRotationStatus(a.vaultKeyRotationService))
		})

		// Sharing routes (authenticated)
		r.Route("/shares", func(r chi.Router) {
			r.Use(mw.RequireAuth)
			r.Post("/", sharing.HandleCreateShare(a.sharingService, a.auditService))
			r.Get("/received", sharing.HandleListReceivedShares(a.sharingService))
			r.Get("/sent", sharing.HandleListSentShares(a.sharingService))
			r.Delete("/{shareID}", sharing.HandleRevokeShare(a.sharingService, a.auditService))
			r.Get("/public-key/{userID}", sharing.HandleGetPublicKey(a.sharingService))
			// PH5-FIX: Public key publication endpoint
			r.Post("/public-key", sharing.HandlePublishPublicKey(a.sharingService))
			// PH5-FIX: Share accept/reject endpoints
			r.Post("/{shareID}/accept", sharing.HandleAcceptShare(a.sharingService))
			r.Post("/{shareID}/reject", sharing.HandleRejectShare(a.sharingService))
			// PH5-FIX: Contact verification endpoints
			r.Get("/fingerprint/{userID}", sharing.HandleGetKeyFingerprint(a.sharingService))
			r.Post("/verify-contact", sharing.HandleVerifyContact(a.contactVerificationService))
		})

		// Audit log routes (authenticated)
		r.Route("/audit", func(r chi.Router) {
			r.Use(mw.RequireAuth)
			r.Get("/", auditpkg.HandleListAuditLog(a.auditService))
			r.Post("/verify", auditpkg.HandleVerifyChain(a.auditService))
			// PH6-FIX: Anomaly detection and compliance report routes
			r.Get("/anomalies", auditpkg.HandleGetAnomalies(a.anomalyDetectionService))
			r.Get("/compliance-report", auditpkg.HandleGenerateComplianceReport(a.complianceService))
			// RM-011: Audit export requires Pro tier (feature-gated)
			r.With(mw.RequireFeature(mw.FeatureAuditExport, a.dbPool)).Get("/compliance-export", auditpkg.HandleExportComplianceCSV(a.complianceService))
		})

		// Billing routes (authenticated except webhook)
		r.Route("/billing", func(r chi.Router) {
			// PH1-FIX: Webhook must be outside RequireAuth — Stripe uses signature verification, not JWT
			r.Post("/webhook", billingpkg.HandleWebhook(a.billingService))

			r.Group(func(r chi.Router) {
				r.Use(mw.RequireAuth)
				r.Post("/customer", billingpkg.HandleCreateCustomer(a.billingService))
				r.Post("/subscribe", billingpkg.HandleCreateSubscription(a.billingService))
				r.Get("/subscription", billingpkg.HandleGetSubscription(a.billingService))
				// PH8-FIX: Subscription lifecycle management routes
				r.Post("/upgrade", billingpkg.HandleUpgradeSubscription(a.billingService))
				r.Post("/downgrade", billingpkg.HandleDowngradeSubscription(a.billingService))
				r.Post("/cancel", billingpkg.HandleCancelSubscription(a.billingService))
				r.Post("/reactivate", billingpkg.HandleReactivateSubscription(a.billingService))
				// PH8-FIX: Stripe Checkout and Portal session routes
				r.Post("/create-checkout-session", billingpkg.HandleCreateCheckoutSession(a.billingService))
				r.Post("/create-portal-session", billingpkg.HandleCreatePortalSession(a.billingService))
			})
		})

		// Notifications (authenticated)
		r.Route("/notify", func(r chi.Router) {
			r.Use(mw.RequireAuth)
			r.Post("/register-device", notify.HandleRegisterDevice(a.notifyService))
			r.Post("/unregister-device", notify.HandleUnregisterDevice(a.notifyService))
		})

		// Recovery codes (authenticated)
		r.Route("/recovery", func(r chi.Router) {
			r.Use(mw.RequireAuth)
			r.Post("/generate", recoverypkg.HandleGenerateCodes(a.dbPool))
			r.Post("/verify", recoverypkg.HandleVerifyCode(a.dbPool, a.auditService))
			r.Get("/remaining", recoverypkg.HandleGetRemainingCodes(a.dbPool))
		})

		// User account routes (authenticated)
		r.Route("/user", func(r chi.Router) {
			r.Use(mw.RequireAuth)
			r.Delete("/account", auth.HandleDeleteAccount(a.dbPool, a.redisClient, a.auditService))
		})

		// PH7-FIX: Sync via WebSocket with JWT auth on upgrade (multi-device)
		// WSHandler performs its own JWT validation from the WebSocket handshake
		// (Sec-WebSocket-Protocol subprotocol, query param, or Authorization header).
		wsHandler := sync.NewWSHandler(a.syncService)
		r.Route("/sync", func(r chi.Router) {
			r.Handle("/ws", wsHandler)
			r.Get("/health", wsHandler.HealthCheck())
		})
		// Legacy route for backward compatibility (authenticated via middleware)
		r.Handle("/sync/legacy", mw.RequireAuth(a.syncService.HandleWebSocket(a.syncService)))

		// PH2-FIX: Key rotation admin endpoint
		r.Route("/admin", func(r chi.Router) {
			r.Use(mw.RequireAuth)
			r.Use(mw.RequireRole("admin", a.dbPool))
			r.Post("/rotate-jwt-keys", a.handleRotateJWTKeys())

			// GC scheduler admin endpoints
			r.Get("/gc/status", gc.HandleGCStatus(a.gcScheduler))
			r.Post("/gc/trigger/{job}", gc.HandleGCTrigger(a.gcScheduler))

			// Backup endpoints
			r.Post("/backups", a.handleCreateBackup())
			r.Get("/backups", a.handleListBackups())
			r.Post("/backups/{backupID}/restore", a.handleRestoreBackup())

			// OIDC provider management (admin only)
			if a.oidcService != nil {
				r.Get("/oidc/providers", oidcpkg.HandleListProviders(a.oidcService))
			}
		})
	})

	return r
}

// handleHealth returns the health check handler
func (a *App) handleHealth() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		healthCtx, healthCancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer healthCancel()

		// Check database connectivity
		dbOK := a.dbPool.Ping(healthCtx) == nil

		// Check Redis connectivity
		redisOK := a.redisClient.Ping(healthCtx).Err() == nil

		// MEDIUM-FIX: Check S3 connectivity
		s3OK := true
		_, err := a.s3Client.HeadBucket(healthCtx, &s3.HeadBucketInput{
			Bucket: getS3BucketName(),
		})
		if err != nil {
			s3OK = false
			log.Warn().Err(err).Msg("S3 health check failed")
		}

		// Return 503 if any critical dependency is down
		status := "ok"
		httpCode := http.StatusOK
		if !dbOK || !redisOK || !s3OK {
			status = "degraded"
			httpCode = http.StatusServiceUnavailable
		}

		w.WriteHeader(httpCode)
		// PH1-FIX: Include circuit breaker states in health check response
		fmt.Fprintf(w, `{"status":"%s","timestamp":"%s","checks":{"database":%t,"redis":%t,"s3":%t},"circuit_breakers":{"database":"%s","redis":"%s","s3":"%s"}}`,
			status, time.Now().Format(time.RFC3339), dbOK, redisOK, s3OK,
			a.dbCircuitBreaker.GetState(), a.redisCircuitBreaker.GetState(), a.s3CircuitBreaker.GetState())
	}
}

// handleReady returns the readiness probe handler for Kubernetes
func (a *App) handleReady() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		readyCtx, readyCancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer readyCancel()
		if err := a.dbPool.Ping(readyCtx); err != nil {
			http.Error(w, "not ready", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"status":"ready"}`)
	}
}

// handleMetricsPool returns the connection pool monitoring handler
func (a *App) handleMetricsPool() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		stats := a.dbPool.Stat()
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"total_conns":%d,"idle_conns":%d,"acquired_conns":%d,"max_conns":%d,"constructing_conns":%d,"new_conns_count":%d,"max_lifetime_destroy_count":%d,"max_idle_destroy_count":%d}`,
			stats.TotalConns(), stats.IdleConns(), stats.AcquiredConns(),
			stats.MaxConns(), stats.ConstructingConns(), stats.NewConnsCount(),
			stats.MaxLifetimeDestroyCount(), stats.MaxIdleDestroyCount())
	}
}

// handleRotateJWTKeys handles the JWT key rotation endpoint
func (a *App) handleRotateJWTKeys() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := a.keyRotationService.RotateKey(r.Context()); err != nil {
			log.Error().Err(err).Msg("JWT key rotation failed")
			http.Error(w, "key rotation failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "rotated",
			"new_kid": a.keyRotationService.GetActiveKID(),
		})
	}
}

// handleCreateBackup handles backup creation
func (a *App) handleCreateBackup() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if a.backupService == nil {
			http.Error(w, "backup service not configured", http.StatusServiceUnavailable)
			return
		}
		meta, err := a.backupService.Backup(r.Context())
		if err != nil {
			log.Error().Err(err).Msg("backup creation failed")
			http.Error(w, "backup failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(meta)
	}
}

// handleListBackups handles listing backups
func (a *App) handleListBackups() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if a.backupService == nil {
			http.Error(w, "backup service not configured", http.StatusServiceUnavailable)
			return
		}
		backups, err := a.backupService.ListBackups()
		if err != nil {
			log.Error().Err(err).Msg("backup listing failed")
			http.Error(w, "failed to list backups", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(backups)
	}
}

// handleRestoreBackup handles backup restoration
func (a *App) handleRestoreBackup() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if a.backupService == nil {
			http.Error(w, "backup service not configured", http.StatusServiceUnavailable)
			return
		}
		backupID := chi.URLParam(r, "backupID")
		if backupID == "" {
			http.Error(w, "backup ID required", http.StatusBadRequest)
			return
		}
		if err := a.backupService.Restore(r.Context(), backupID); err != nil {
			log.Error().Err(err).Str("backup_id", backupID).Msg("backup restore failed")
			http.Error(w, "restore failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":    "restored",
			"backup_id": backupID,
		})
	}
}
