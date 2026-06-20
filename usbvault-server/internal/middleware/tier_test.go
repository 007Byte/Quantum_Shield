package middleware

import (
	"testing"
)

// PH8-FIX: Tier gating middleware tests

func TestCompareTiers(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		a, b     string
		expected int
	}{
		{"free < individual", "free", "individual", -1},
		{"free < team", "free", "team", -1},
		{"free < enterprise", "free", "enterprise", -1},
		{"individual < team", "individual", "team", -1},
		{"individual < enterprise", "individual", "enterprise", -1},
		{"team < enterprise", "team", "enterprise", -1},
		{"enterprise > team", "enterprise", "team", 1},
		{"team > individual", "team", "individual", 1},
		{"individual > free", "individual", "free", 1},
		{"free == free", "free", "free", 0},
		{"individual == individual", "individual", "individual", 0},
		{"team == team", "team", "team", 0},
		{"enterprise == enterprise", "enterprise", "enterprise", 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CompareTiers(tt.a, tt.b)
			if result != tt.expected {
				t.Errorf("CompareTiers(%q, %q) = %d, want %d", tt.a, tt.b, result, tt.expected)
			}
		})
	}
}

func TestTierHierarchyCompleteness(t *testing.T) {
	t.Parallel()

	// Verify all four tiers are present in the ranking
	expectedTiers := []string{"free", "individual", "team", "enterprise"}
	for _, tier := range expectedTiers {
		rank, ok := tierRanking[tier]
		if !ok {
			t.Errorf("tier %q missing from tierRanking map", tier)
			continue
		}
		if rank < 0 {
			t.Errorf("tier %q has negative rank %d", tier, rank)
		}
	}

	// Verify strict ordering: free < individual < team < enterprise
	if tierRanking["free"] >= tierRanking["individual"] {
		t.Error("free should rank below individual")
	}
	if tierRanking["individual"] >= tierRanking["team"] {
		t.Error("individual should rank below team")
	}
	if tierRanking["team"] >= tierRanking["enterprise"] {
		t.Error("team should rank below enterprise")
	}
}

func TestMissingTierDefaultsToFree(t *testing.T) {
	t.Parallel()

	// An unknown tier should have rank 0 (same as free) from the map default
	unknownRank := tierRanking["nonexistent"]
	freeRank := tierRanking["free"]
	if unknownRank != 0 {
		t.Errorf("unknown tier rank should be 0 (zero value), got %d", unknownRank)
	}
	if freeRank != 0 {
		t.Errorf("free tier rank should be 0, got %d", freeRank)
	}
}

func TestFreeUserBlockedFromTeamFeature(t *testing.T) {
	t.Parallel()

	// Simulate: free user (rank 0) trying to access team-gated endpoint (rank 2)
	userTier := "free"
	requiredTier := "team"

	userRank := tierRanking[userTier]
	requiredRank := tierRanking[requiredTier]

	if userRank >= requiredRank {
		t.Errorf("free user (rank %d) should be blocked from team feature (rank %d)", userRank, requiredRank)
	}
}

func TestEnterpriseUserAllowedEverything(t *testing.T) {
	t.Parallel()

	enterpriseRank := tierRanking["enterprise"]

	for _, tier := range []string{"free", "individual", "team", "enterprise"} {
		requiredRank := tierRanking[tier]
		if enterpriseRank < requiredRank {
			t.Errorf("enterprise user (rank %d) should pass tier check for %q (rank %d)", enterpriseRank, tier, requiredRank)
		}
	}
}

func TestTierLimitsMapCompleteness(t *testing.T) {
	t.Parallel()

	expectedTiers := []string{"free", "individual", "team", "enterprise"}
	for _, tier := range expectedTiers {
		limits, ok := TierLimitsMap[tier]
		if !ok {
			t.Errorf("TierLimitsMap missing tier %q", tier)
			continue
		}

		// Verify limits are sensible
		if limits.MaxVaults == 0 {
			t.Errorf("tier %q has MaxVaults == 0, should be positive or -1 (unlimited)", tier)
		}
		if limits.MaxStorageMB == 0 {
			t.Errorf("tier %q has MaxStorageMB == 0", tier)
		}
		if len(limits.Algorithms) == 0 {
			t.Errorf("tier %q has no algorithms", tier)
		}
	}
}

func TestTierLimitsHierarchy(t *testing.T) {
	t.Parallel()

	free := TierLimitsMap["free"]
	individual := TierLimitsMap["individual"]
	team := TierLimitsMap["team"]
	enterprise := TierLimitsMap["enterprise"]

	// Vaults: free < individual < team < enterprise (enterprise uses -1 for unlimited)
	if free.MaxVaults >= individual.MaxVaults {
		t.Errorf("free vaults (%d) should be less than individual (%d)", free.MaxVaults, individual.MaxVaults)
	}
	if individual.MaxVaults >= team.MaxVaults {
		t.Errorf("individual vaults (%d) should be less than team (%d)", individual.MaxVaults, team.MaxVaults)
	}
	// Enterprise uses -1 for unlimited
	if enterprise.MaxVaults != -1 {
		t.Errorf("enterprise MaxVaults should be -1 (unlimited), got %d", enterprise.MaxVaults)
	}

	// Storage: free < individual < team < enterprise
	if free.MaxStorageMB >= individual.MaxStorageMB {
		t.Error("free storage should be less than individual")
	}
	if individual.MaxStorageMB >= team.MaxStorageMB {
		t.Error("individual storage should be less than team")
	}
	if team.MaxStorageMB >= enterprise.MaxStorageMB {
		t.Error("team storage should be less than enterprise")
	}

	// Sharing: only team and enterprise
	if free.Sharing {
		t.Error("free tier should not have sharing")
	}
	if individual.Sharing {
		t.Error("individual tier should not have sharing")
	}
	if !team.Sharing {
		t.Error("team tier should have sharing")
	}
	if !enterprise.Sharing {
		t.Error("enterprise tier should have sharing")
	}

	// Audit logs: only team and enterprise
	if free.AuditLogs {
		t.Error("free tier should not have audit logs")
	}
	if !team.AuditLogs {
		t.Error("team tier should have audit logs")
	}
	if !enterprise.AuditLogs {
		t.Error("enterprise tier should have audit logs")
	}
}

func TestAllTiersHaveAES256GCM(t *testing.T) {
	t.Parallel()

	for tier, limits := range TierLimitsMap {
		found := false
		for _, alg := range limits.Algorithms {
			if alg == "aes-256-gcm" {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("tier %q should include aes-256-gcm algorithm", tier)
		}
	}
}
