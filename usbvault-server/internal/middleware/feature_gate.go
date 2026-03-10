package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// RM-011: Feature-based access control middleware
//
// While RequireTier gates endpoints by subscription tier (free/individual/team/enterprise),
// RequireFeature gates by specific feature name. This allows fine-grained control over which
// features are available at each tier, matching the client-side tierService feature matrix.
//
// Feature → minimum tier mapping is the server-side equivalent of TIER_CONFIGS in tierService.ts.

// Feature represents a tier-gated feature name
type Feature string

// Feature constants — must stay in sync with TypeScript tierService.ts Feature type
const (
	FeatureBasicEncryption Feature = "basic_encryption"
	FeaturePasswordManager Feature = "password_manager"
	FeatureSecureMessaging Feature = "secure_messaging"
	FeatureFileSharing     Feature = "file_sharing"
	FeatureGhostMessages   Feature = "ghost_messages"
	FeatureBackupRestore   Feature = "backup_restore"
	FeatureRecoveryPhrase  Feature = "recovery_phrase"
	FeatureFIDO2Auth       Feature = "fido2_auth"
	FeatureBiometricAuth   Feature = "biometric_auth"
	FeatureKeyVerification Feature = "key_verification"
	FeatureMetadataReduction Feature = "metadata_reduction"
	FeatureForensicCleanup Feature = "forensic_cleanup"
	FeatureDefenseDashboard Feature = "defense_dashboard"
	FeaturePrioritySupport Feature = "priority_support"
	FeatureUnlimitedStorage Feature = "unlimited_storage"
	FeatureCustomEncryption Feature = "custom_encryption"
	FeatureEnterpriseQR    Feature = "enterprise_qr"
	FeatureAdvancedAnalytics Feature = "advanced_analytics"
	FeatureDedicatedSupport Feature = "dedicated_support"
	FeatureSSOIntegration  Feature = "sso_integration"
	FeatureAuditExport     Feature = "audit_export"
	FeatureAutoBackup      Feature = "auto_backup"
)

// featureTierMap maps each feature to its minimum required tier.
// This is the server-side source of truth — must match tierService.ts TIER_CONFIGS.
var featureTierMap = map[Feature]string{
	// Free tier features
	FeatureBasicEncryption:  "free",
	FeaturePasswordManager:  "free",
	FeatureSecureMessaging:  "free",
	FeatureFileSharing:      "free",
	FeatureFIDO2Auth:        "free",
	FeatureBiometricAuth:    "free",
	FeatureDefenseDashboard: "free",

	// Pro tier features (individual/team)
	FeatureGhostMessages:     "individual",
	FeatureBackupRestore:     "individual",
	FeatureRecoveryPhrase:    "individual",
	FeatureKeyVerification:   "individual",
	FeatureMetadataReduction: "individual",
	FeatureForensicCleanup:   "individual",
	FeaturePrioritySupport:   "individual",
	FeatureAuditExport:       "individual",
	FeatureAutoBackup:        "individual",

	// Enterprise tier features
	FeatureUnlimitedStorage:  "enterprise",
	FeatureCustomEncryption:  "enterprise",
	FeatureEnterpriseQR:      "enterprise",
	FeatureAdvancedAnalytics: "enterprise",
	FeatureDedicatedSupport:  "enterprise",
	FeatureSSOIntegration:    "enterprise",
}

// tierRanking defines the tier hierarchy for comparison
var tierRanking = map[string]int{
	"free":       0,
	"individual": 1,
	"team":       2,
	"enterprise": 3,
}

// FeatureGateError is the JSON error response for feature gate denials
type FeatureGateError struct {
	Error        string `json:"error"`
	Feature      string `json:"feature"`
	RequiredTier string `json:"required_tier"`
	CurrentTier  string `json:"current_tier"`
}

// RequireFeature creates middleware that checks if the user's subscription tier
// grants access to the specified feature. Returns HTTP 402 Payment Required
// with upgrade information if the feature is not available.
//
// Usage in routes:
//
//	r.With(mw.RequireFeature(FeatureGhostMessages, dbPool)).Post("/ghost", handler)
//	r.With(mw.RequireFeature(FeatureEnterpriseQR, dbPool)).Get("/qr/enterprise", handler)
func RequireFeature(feature Feature, pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := r.Context().Value("user_id").(string)
			if !ok {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			// Look up the minimum tier required for this feature
			requiredTier, known := featureTierMap[feature]
			if !known {
				// Unknown feature — deny by default (fail-closed)
				log.Warn().Str("feature", string(feature)).Msg("RM-011: unknown feature requested — denying")
				http.Error(w, "feature not available", http.StatusForbidden)
				return
			}

			// Free-tier features are always allowed
			if requiredTier == "free" {
				next.ServeHTTP(w, r)
				return
			}

			// Query user's subscription tier
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			var userTier string
			err := pool.QueryRow(ctx,
				`SELECT COALESCE(tier, 'free') FROM subscriptions WHERE user_id = $1 AND status = 'active'`,
				userID,
			).Scan(&userTier)

			if err != nil {
				log.Debug().Str("user_id", userID).Err(err).
					Msg("RM-011: no active subscription found — defaulting to free")
				userTier = "free"
			}

			// Compare tier rankings
			userRank := tierRanking[userTier]
			requiredRank := tierRanking[requiredTier]

			if userRank < requiredRank {
				log.Info().
					Str("user_id", userID).
					Str("feature", string(feature)).
					Str("user_tier", userTier).
					Str("required_tier", requiredTier).
					Msg("RM-011: feature gate denied — upgrade required")

				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusPaymentRequired)
				json.NewEncoder(w).Encode(FeatureGateError{
					Error:        "upgrade required",
					Feature:      string(feature),
					RequiredTier: requiredTier,
					CurrentTier:  userTier,
				})
				return
			}

			// Inject feature info into context for downstream handlers
			ctx2 := context.WithValue(r.Context(), "feature", string(feature))
			ctx2 = context.WithValue(ctx2, "user_tier", userTier)
			next.ServeHTTP(w, r.WithContext(ctx2))
		})
	}
}

// CheckFeatureAccess is a non-middleware helper that checks feature access programmatically.
// Useful inside handlers that need to conditionally enable/disable behavior.
func CheckFeatureAccess(ctx context.Context, pool *pgxpool.Pool, userID string, feature Feature) (bool, string, error) {
	requiredTier, known := featureTierMap[feature]
	if !known {
		return false, "", nil
	}

	if requiredTier == "free" {
		return true, "free", nil
	}

	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var userTier string
	err := pool.QueryRow(queryCtx,
		`SELECT COALESCE(tier, 'free') FROM subscriptions WHERE user_id = $1 AND status = 'active'`,
		userID,
	).Scan(&userTier)

	if err != nil {
		userTier = "free"
	}

	userRank := tierRanking[userTier]
	requiredRank := tierRanking[requiredTier]

	return userRank >= requiredRank, userTier, nil
}
