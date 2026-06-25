package vault

import (
	"context"
	"testing"

	"github.com/usbvault/usbvault-server/internal/middleware"
)

// F3: unit tests for the pure (non-DB) parts of tier enforcement.

func TestIsKnownTier(t *testing.T) {
	t.Parallel()

	known := []string{"free", "individual", "team", "enterprise"}
	for _, tier := range known {
		if !isKnownTier(tier) {
			t.Errorf("tier %q should be known", tier)
		}
	}

	unknown := []string{"", "premium", "basic", "pro", "nonsense"}
	for _, tier := range unknown {
		if isKnownTier(tier) {
			t.Errorf("tier %q should NOT be known", tier)
		}
	}
}

func TestTierLimitsForDefaultsToFree(t *testing.T) {
	t.Parallel()

	free := middleware.TierLimitsMap["free"]

	for _, tier := range []string{"", "bogus", "premium"} {
		got := tierLimitsFor(tier)
		if got.MaxVaults != free.MaxVaults {
			t.Errorf("tier %q: expected free MaxVaults %d, got %d", tier, free.MaxVaults, got.MaxVaults)
		}
	}

	// Known tiers map to their own limits.
	if tierLimitsFor("team").MaxVaults != middleware.TierLimitsMap["team"].MaxVaults {
		t.Error("team tier should map to team limits")
	}
}

func TestVaultLimitDecision(t *testing.T) {
	t.Parallel()

	// Mirrors the count-vs-cap decision in CheckCanCreateVault without a DB.
	cases := []struct {
		tier        string
		count       int
		shouldAllow bool
	}{
		{"free", 0, true},        // free cap is 1
		{"free", 1, false},       // at cap
		{"individual", 4, true},  // individual cap is 5
		{"individual", 5, false}, // at cap
		{"enterprise", 100000, true}, // unlimited (-1)
	}

	for _, tc := range cases {
		limits := tierLimitsFor(tc.tier)
		allow := limits.MaxVaults < 0 || tc.count < limits.MaxVaults
		if allow != tc.shouldAllow {
			t.Errorf("tier=%s count=%d cap=%d: expected allow=%v, got %v",
				tc.tier, tc.count, limits.MaxVaults, tc.shouldAllow, allow)
		}
	}
}

func TestAdvisoryLockKeyDeterministic(t *testing.T) {
	t.Parallel()

	// Same userID must always map to the same lock key (so concurrent creates for
	// one user contend on the same advisory lock).
	a := advisoryLockKey("user-abc")
	b := advisoryLockKey("user-abc")
	if a != b {
		t.Errorf("advisoryLockKey not deterministic: %d != %d", a, b)
	}

	// Different users should (overwhelmingly) get different keys.
	if advisoryLockKey("user-abc") == advisoryLockKey("user-xyz") {
		t.Error("advisoryLockKey collided for distinct users")
	}

	// Empty string must not panic and must be stable.
	if advisoryLockKey("") != advisoryLockKey("") {
		t.Error("advisoryLockKey for empty string not stable")
	}
}

func TestNilLimiterIsPermissive(t *testing.T) {
	t.Parallel()

	var tl *TierLimiter // nil
	if err := tl.CheckCanCreateVault(context.Background(), "user-1"); err != nil {
		t.Errorf("nil limiter should be permissive, got %v", err)
	}
	if got := tl.ResolveTier(context.Background(), "user-1"); got != "free" {
		t.Errorf("nil limiter ResolveTier should default to free, got %q", got)
	}
}
