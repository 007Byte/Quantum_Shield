// Package vault — F3: authoritative server-side subscription-tier enforcement.
//
// This file adds per-tier resource-limit enforcement to vault creation. The tier
// is sourced ONLY from trusted server-side state, never from a client-supplied
// header or request body: the PRIMARY source is an active row in the subscriptions
// table (mirroring billing.BillingService.CheckAccess / middleware.RequireTier),
// with users.subscription_tier used only as a non-default override. Limits are
// sourced from the single source of truth in middleware.TierLimitsMap, which
// mirrors the client-side billing TierLimitsMap / featureGates.ts.
package vault

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/usbvault/usbvault-server/internal/middleware"
)

// ErrVaultLimitReached is returned when a user has reached the maximum number of
// vaults permitted by their subscription tier. Callers should translate this into
// an HTTP 402 Payment Required response (upgrade required).
var ErrVaultLimitReached = errors.New("vault limit reached for subscription tier")

// F3 — maxPasswords is INHERENTLY CLIENT-ONLY / NON-ENFORCEABLE server-side.
//
// Individual password entries live INSIDE the client-side end-to-end-encrypted
// vault blob (XChaCha20-Poly1305 ciphertext). The server is zero-knowledge: it
// stores only the opaque encrypted_metadata / blob bytes and never sees the
// decrypted structure, so it cannot count how many password records a vault
// contains. Any per-tier maxPasswords limit can therefore only be advisory and
// MUST be enforced by the client before encrypting. There is deliberately no
// server-side gate for it here; the server enforces the dimensions it CAN observe
// (vault count, file size, cumulative storage, sharing feature/count).

// TierLimiter resolves a user's authoritative subscription tier and enforces the
// per-tier resource limits defined in middleware.TierLimitsMap.
//
// It reads the tier from trusted server-side state only. The PRIMARY source is an
// ACTIVE row in the subscriptions table (set by the Stripe billing webhook), which
// mirrors billing.BillingService.CheckAccess and middleware.RequireTier so all
// enforcement paths agree on the same authoritative value. A paid user with an
// active subscription therefore resolves to their paid tier.
//
// Resolution order:
//  1. subscriptions row WHERE status = 'active' (billing-managed, authoritative)
//  2. users.subscription_tier ONLY as a non-default override (e.g. an admin grant)
//     when there is no active subscription
//
// If neither yields a known tier, it fails closed to the "free" tier.
type TierLimiter struct {
	pool *pgxpool.Pool
}

// NewTierLimiter constructs a TierLimiter backed by the given connection pool.
func NewTierLimiter(pool *pgxpool.Pool) *TierLimiter {
	return &TierLimiter{pool: pool}
}

// ResolveTier returns the authoritative subscription tier for the user. It never
// trusts client input. On any lookup failure it returns "free" (fail-closed).
func (tl *TierLimiter) ResolveTier(ctx context.Context, userID string) string {
	if tl == nil || tl.pool == nil {
		return "free"
	}

	// 1. PRIMARY: an active subscription row (billing-managed). This mirrors
	//    billing.BillingService.CheckAccess and middleware.RequireTier so every
	//    enforcement path agrees on the same authoritative tier. A paid user with
	//    an active subscription resolves to their paid tier here.
	//    DETERMINISM (FIX C): a user may transiently have more than one active
	//    subscription row (e.g. mid-migration / overlapping Stripe events). Select
	//    a single deterministic row by ranking the tier highest-first so the
	//    resolved tier is stable and never grants less than the user is entitled to.
	var subTier string
	err := tl.pool.QueryRow(ctx,
		`SELECT COALESCE(tier::text, 'free') FROM subscriptions
		 WHERE user_id = $1 AND status = 'active'
		 ORDER BY CASE tier::text
		            WHEN 'enterprise' THEN 3
		            WHEN 'team'       THEN 2
		            WHEN 'individual' THEN 1
		            ELSE 0
		          END DESC
		 LIMIT 1`,
		userID,
	).Scan(&subTier)
	switch {
	case err == nil:
		if isKnownTier(subTier) {
			return subTier
		}
	case errors.Is(err, pgx.ErrNoRows):
		// Expected: no active subscription. Fall through to the override column.
	default:
		// A real DB error must not be silently masked as "free". Log it loudly;
		// we still fall through (fail-closed to free) so a transient DB blip never
		// silently grants a paid tier.
		log.Error().Err(err).Str("user_id", userID).Msg("F3: error querying active subscription tier")
	}

	// 2. OVERRIDE: users.subscription_tier, used ONLY as a non-default override
	//    (e.g. an admin/manual grant) when there is no active subscription. A
	//    'free' value here is not treated as an override — it just means no grant.
	var userTier string
	err = tl.pool.QueryRow(ctx,
		`SELECT COALESCE(subscription_tier::text, 'free') FROM users WHERE id = $1`,
		userID,
	).Scan(&userTier)
	switch {
	case err == nil:
		if userTier != "free" && isKnownTier(userTier) {
			return userTier
		}
	case errors.Is(err, pgx.ErrNoRows):
		// Expected for an unknown/deleted user: fail closed to free.
	default:
		log.Warn().Err(err).Str("user_id", userID).Msg("F3: error querying users.subscription_tier override")
	}

	log.Debug().Str("user_id", userID).Msg("F3: no authoritative paid tier found, defaulting to free")
	return "free"
}

// CheckCanCreateVault enforces the per-tier MaxVaults limit. It returns
// ErrVaultLimitReached when the user is at or above their tier's vault cap.
// A MaxVaults of -1 means unlimited (enterprise).
//
// NOTE: this is a non-atomic pre-check kept for callers/tests that want a cheap
// look-ahead. The authoritative, race-free enforcement happens in
// CreateVaultAtomic, which counts and inserts inside one transaction under an
// advisory lock. Do not rely on this method alone to enforce the cap.
func (tl *TierLimiter) CheckCanCreateVault(ctx context.Context, userID string) error {
	if tl == nil || tl.pool == nil {
		// No limiter configured — preserve prior unrestricted behavior.
		return nil
	}

	tier := tl.ResolveTier(ctx, userID)
	limits := tierLimitsFor(tier)

	if limits.MaxVaults < 0 {
		return nil // unlimited
	}

	var count int
	err := tl.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM vaults WHERE owner_id = $1 AND deleted_at IS NULL`,
		userID,
	).Scan(&count)
	if err != nil {
		// Fail closed: if we cannot count, do not allow exceeding the free cap.
		log.Warn().Err(err).Str("user_id", userID).Msg("F3: failed to count vaults; denying create")
		return ErrVaultLimitReached
	}

	if count >= limits.MaxVaults {
		log.Info().
			Str("user_id", userID).
			Str("tier", tier).
			Int("current_vaults", count).
			Int("max_vaults", limits.MaxVaults).
			Msg("F3: vault creation denied — tier limit reached")
		return ErrVaultLimitReached
	}

	return nil
}

// advisoryLockKey derives a stable 64-bit key for a Postgres advisory lock from a
// user's vault-creation critical section. We hash the userID (FNV-1a) and tag the
// high bits with a domain constant so this lock cannot collide with advisory locks
// used elsewhere. The lock serializes concurrent vault creates for one user so the
// count+insert below cannot interleave and exceed MaxVaults (TOCTOU fix).
func advisoryLockKey(userID string) int64 {
	const offset64 = 1469598103934665603
	const prime64 = 1099511628211
	var h uint64 = offset64
	for i := 0; i < len(userID); i++ {
		h ^= uint64(userID[i])
		h *= prime64
	}
	// Domain tag in the top byte ("vault-create" namespace) to avoid collisions
	// with any other advisory-lock users in this codebase.
	h = (h & 0x00FFFFFFFFFFFFFF) | (0x5A << 56)
	// #nosec G115 -- intentional bit-reinterpret of a 64-bit FNV-1a hash into a
	// Postgres bigint for pg_advisory_xact_lock; wraparound to a negative value is
	// harmless and deterministic for a lock key.
	return int64(h) //nolint:gosec // G115: intentional reinterpret, see #nosec annotation above
}

// CreateVaultAtomic enforces the per-tier MaxVaults cap and inserts the new vault
// inside a single transaction, eliminating the check-then-create TOCTOU race.
//
// Concurrency: it takes a transaction-scoped Postgres advisory lock keyed by the
// userID (pg_advisory_xact_lock), so two concurrent creates for the same user are
// serialized; the second sees the first's committed/uncommitted row count under the
// same lock and is rejected once the cap is reached. The lock is released
// automatically when the transaction commits or rolls back.
//
// It returns the new vault's UUID string on success, ErrVaultLimitReached when the
// tier cap is reached, or the underlying DB error otherwise.
func (tl *TierLimiter) CreateVaultAtomic(ctx context.Context, userID string, encryptedMetadata []byte) (string, error) {
	tier := tl.ResolveTier(ctx, userID)
	limits := tierLimitsFor(tier)

	tx, err := tl.pool.Begin(ctx)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("F3: failed to begin vault-create tx")
		return "", err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback after commit is a no-op

	// Serialize concurrent creates for this user. The lock is held for the
	// duration of the transaction.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, advisoryLockKey(userID)); err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("F3: failed to acquire vault-create advisory lock")
		return "", err
	}

	if limits.MaxVaults >= 0 {
		var count int
		if err := tx.QueryRow(ctx,
			`SELECT COUNT(*) FROM vaults WHERE owner_id = $1 AND deleted_at IS NULL`,
			userID,
		).Scan(&count); err != nil {
			log.Warn().Err(err).Str("user_id", userID).Msg("F3: failed to count vaults in tx; denying create")
			return "", ErrVaultLimitReached
		}
		if count >= limits.MaxVaults {
			log.Info().
				Str("user_id", userID).
				Str("tier", tier).
				Int("current_vaults", count).
				Int("max_vaults", limits.MaxVaults).
				Msg("F3: vault creation denied — tier limit reached (atomic)")
			return "", ErrVaultLimitReached
		}
	}

	var vaultID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO vaults (id, owner_id, encrypted_metadata, created_at, updated_at)
		 VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
		 RETURNING id`,
		userID, encryptedMetadata,
	).Scan(&vaultID); err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("F3: failed to insert vault in tx")
		return "", err
	}

	if err := tx.Commit(ctx); err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("F3: failed to commit vault-create tx")
		return "", err
	}

	log.Info().Str("vault_id", vaultID).Str("user_id", userID).Str("tier", tier).Msg("F3: vault created (atomic, tier-checked)")
	return vaultID, nil
}

// tierLimitsFor returns the limits for a tier from the single source of truth,
// defaulting to the free tier for unknown values.
func tierLimitsFor(tier string) middleware.TierLimits {
	if limits, ok := middleware.TierLimitsMap[tier]; ok {
		return limits
	}
	return middleware.TierLimitsMap["free"]
}

// isKnownTier reports whether the tier string is one of the recognized tiers.
func isKnownTier(tier string) bool {
	_, ok := middleware.TierLimitsMap[tier]
	return ok
}
