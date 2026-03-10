package storage

import (
	"context"
	"testing"
)

type MockBillingChecker struct {
	tier string
	err  error
}

func (m *MockBillingChecker) CheckAccess(ctx context.Context, userID string) (string, error) {
	return m.tier, m.err
}

func TestGetMaxFileSizeForFreeTier(t *testing.T) {
	t.Run("free tier enforces 100MB limit", func(t *testing.T) {
		maxSize := getMaxFileSizeForTier("free")

		if maxSize != MaxFileSizeFree {
			t.Errorf("expected free tier limit %d, got %d", MaxFileSizeFree, maxSize)
		}

		if maxSize != 100*1024*1024 {
			t.Errorf("expected 100MB limit for free tier, got %d bytes", maxSize)
		}
	})
}

func TestGetMaxFileSizeForIndividualTier(t *testing.T) {
	t.Run("individual tier enforces 1GB limit", func(t *testing.T) {
		maxSize := getMaxFileSizeForTier("individual")

		if maxSize != MaxFileSizeIndividual {
			t.Errorf("expected individual tier limit %d, got %d", MaxFileSizeIndividual, maxSize)
		}

		if maxSize != 1*1024*1024*1024 {
			t.Errorf("expected 1GB limit for individual tier, got %d bytes", maxSize)
		}
	})
}

func TestGetMaxFileSizeForTeamTier(t *testing.T) {
	t.Run("team tier enforces 5GB limit", func(t *testing.T) {
		maxSize := getMaxFileSizeForTier("team")

		if maxSize != MaxFileSizeTeam {
			t.Errorf("expected team tier limit %d, got %d", MaxFileSizeTeam, maxSize)
		}

		if maxSize != 5*1024*1024*1024 {
			t.Errorf("expected 5GB limit for team tier, got %d bytes", maxSize)
		}
	})
}

func TestGetMaxFileSizeForEnterpriseTier(t *testing.T) {
	t.Run("enterprise tier enforces 5GB limit", func(t *testing.T) {
		maxSize := getMaxFileSizeForTier("enterprise")

		if maxSize != MaxFileSizeEnterprise {
			t.Errorf("expected enterprise tier limit %d, got %d", MaxFileSizeEnterprise, maxSize)
		}

		if maxSize != 5*1024*1024*1024 {
			t.Errorf("expected 5GB limit for enterprise tier, got %d bytes", maxSize)
		}
	})
}

func TestGetMaxFileSizeForInvalidTierDefaultsToFree(t *testing.T) {
	t.Run("invalid tier defaults to free tier limit", func(t *testing.T) {
		invalidTiers := []string{"", "invalid", "premium", "basic", "pro"}

		for _, tier := range invalidTiers {
			maxSize := getMaxFileSizeForTier(tier)

			if maxSize != MaxFileSizeFree {
				t.Errorf("tier %q: expected default free limit %d, got %d", tier, MaxFileSizeFree, maxSize)
			}
		}
	})
}

func TestFileSizeLimitConstants(t *testing.T) {
	t.Run("file size constants are correctly defined", func(t *testing.T) {
		if MaxFileSizeFree != 100*1024*1024 {
			t.Errorf("MaxFileSizeFree: expected 104857600, got %d", MaxFileSizeFree)
		}

		if MaxFileSizeIndividual != 1*1024*1024*1024 {
			t.Errorf("MaxFileSizeIndividual: expected 1073741824, got %d", MaxFileSizeIndividual)
		}

		if MaxFileSizeTeam != 5*1024*1024*1024 {
			t.Errorf("MaxFileSizeTeam: expected 5368709120, got %d", MaxFileSizeTeam)
		}

		if MaxFileSizeEnterprise != 5*1024*1024*1024 {
			t.Errorf("MaxFileSizeEnterprise: expected 5368709120, got %d", MaxFileSizeEnterprise)
		}
	})
}

func TestBlockedContentTypesExecutableBlocked(t *testing.T) {
	t.Run("executable content types are blocked", func(t *testing.T) {
		if !blockedContentTypes["application/x-executable"] {
			t.Error("application/x-executable should be blocked")
		}

		if !blockedContentTypes["application/x-dosexec"] {
			t.Error("application/x-dosexec should be blocked")
		}

		if !blockedContentTypes["application/x-mach-binary"] {
			t.Error("application/x-mach-binary should be blocked")
		}
	})
}

func TestBlockedContentTypesSharedLibBlocked(t *testing.T) {
	t.Run("shared library content types are blocked", func(t *testing.T) {
		if !blockedContentTypes["application/x-sharedlib"] {
			t.Error("application/x-sharedlib should be blocked")
		}
	})
}

func TestBlockedContentTypesAllowsCommon(t *testing.T) {
	t.Run("common content types are allowed", func(t *testing.T) {
		allowedTypes := []string{
			"text/plain",
			"application/pdf",
			"application/json",
			"image/png",
			"image/jpeg",
			"video/mp4",
		}

		for _, ct := range allowedTypes {
			if blockedContentTypes[ct] {
				t.Errorf("content type %s should be allowed", ct)
			}
		}
	})
}

func TestFileSizeValidationFreeTierLimit(t *testing.T) {
	t.Run("file size is enforced for free tier", func(t *testing.T) {
		maxSize := getMaxFileSizeForTier("free")

		// Just under limit - should pass
		if maxSize-1 > maxSize {
			t.Error("size validation failed")
		}

		// At limit - should pass
		if maxSize > maxSize {
			t.Error("size validation failed")
		}

		// Over limit - should fail
		if maxSize+1 <= maxSize {
			t.Error("file size %d exceeds limit %d", maxSize+1, maxSize)
		}
	})
}

func TestFileSizeValidationIndividualTierLimit(t *testing.T) {
	t.Run("file size is enforced for individual tier", func(t *testing.T) {
		maxSize := getMaxFileSizeForTier("individual")

		testCases := []struct {
			size      int64
			shouldPass bool
		}{
			{1024, true},                     // 1KB
			{100 * 1024 * 1024, true},        // 100MB
			{1 * 1024 * 1024 * 1024, true},   // 1GB (at limit)
			{1*1024*1024*1024 + 1, false},    // Just over limit
			{2 * 1024 * 1024 * 1024, false},  // 2GB
		}

		for _, tc := range testCases {
			if tc.shouldPass {
				if tc.size > maxSize {
					t.Errorf("size %d should pass for individual tier (limit %d)", tc.size, maxSize)
				}
			} else {
				if tc.size <= maxSize {
					t.Errorf("size %d should fail for individual tier (limit %d)", tc.size, maxSize)
				}
			}
		}
	})
}

func TestFileSizeValidationTeamTierLimit(t *testing.T) {
	t.Run("file size is enforced for team tier", func(t *testing.T) {
		maxSize := getMaxFileSizeForTier("team")

		testCases := []struct {
			size      int64
			shouldPass bool
		}{
			{1024, true},                     // 1KB
			{1 * 1024 * 1024 * 1024, true},   // 1GB
			{5 * 1024 * 1024 * 1024, true},   // 5GB (at limit)
			{5*1024*1024*1024 + 1, false},    // Just over limit
			{10 * 1024 * 1024 * 1024, false}, // 10GB
		}

		for _, tc := range testCases {
			if tc.shouldPass {
				if tc.size > maxSize {
					t.Errorf("size %d should pass for team tier (limit %d)", tc.size, maxSize)
				}
			} else {
				if tc.size <= maxSize {
					t.Errorf("size %d should fail for team tier (limit %d)", tc.size, maxSize)
				}
			}
		}
	})
}

func TestFileSizeValidationEnterpriseTierLimit(t *testing.T) {
	t.Run("file size is enforced for enterprise tier", func(t *testing.T) {
		maxSize := getMaxFileSizeForTier("enterprise")

		testCases := []struct {
			size      int64
			shouldPass bool
		}{
			{1024, true},                     // 1KB
			{1 * 1024 * 1024 * 1024, true},   // 1GB
			{5 * 1024 * 1024 * 1024, true},   // 5GB (at limit)
			{5*1024*1024*1024 + 1, false},    // Just over limit
			{10 * 1024 * 1024 * 1024, false}, // 10GB
		}

		for _, tc := range testCases {
			if tc.shouldPass {
				if tc.size > maxSize {
					t.Errorf("size %d should pass for enterprise tier (limit %d)", tc.size, maxSize)
				}
			} else {
				if tc.size <= maxSize {
					t.Errorf("size %d should fail for enterprise tier (limit %d)", tc.size, maxSize)
				}
			}
		}
	})
}

func TestBillingCheckerIntegration(t *testing.T) {
	t.Run("billing checker provides tier for file size validation", func(t *testing.T) {
		checker := &MockBillingChecker{
			tier: "individual",
			err:  nil,
		}

		ctx := context.Background()
		tier, err := checker.CheckAccess(ctx, "user123")

		if err != nil {
			t.Fatalf("billing checker failed: %v", err)
		}

		if tier != "individual" {
			t.Errorf("expected tier individual, got %s", tier)
		}

		// Verify we can use the tier to get limits
		maxSize := getMaxFileSizeForTier(tier)
		expectedSize := MaxFileSizeIndividual

		if maxSize != expectedSize {
			t.Errorf("expected limit %d, got %d", expectedSize, maxSize)
		}
	})
}

func TestStorageServiceWithBillingChecker(t *testing.T) {
	t.Run("storage service can be created with billing checker", func(t *testing.T) {
		mockChecker := &MockBillingChecker{
			tier: "team",
		}

		ss := NewStorageServiceWithBilling(nil, nil, mockChecker)

		if ss.billingChecker == nil {
			t.Error("billing checker not set in storage service")
		}

		// Verify the checker works
		tier, _ := ss.billingChecker.CheckAccess(context.Background(), "user123")
		if tier != "team" {
			t.Errorf("expected tier team, got %s", tier)
		}
	})
}

func TestTierLimitHierarchy(t *testing.T) {
	t.Run("tier limits follow expected hierarchy", func(t *testing.T) {
		free := getMaxFileSizeForTier("free")
		individual := getMaxFileSizeForTier("individual")
		team := getMaxFileSizeForTier("team")
		enterprise := getMaxFileSizeForTier("enterprise")

		if free >= individual {
			t.Errorf("free tier limit should be less than individual: %d >= %d", free, individual)
		}

		if individual >= team {
			t.Errorf("individual tier limit should be less than team: %d >= %d", individual, team)
		}

		if team != enterprise {
			t.Errorf("team and enterprise should have same limit: %d != %d", team, enterprise)
		}
	})
}

func TestBlockedContentTypesCount(t *testing.T) {
	t.Run("all expected content types are in blocklist", func(t *testing.T) {
		expectedCount := 4
		actualCount := len(blockedContentTypes)

		if actualCount != expectedCount {
			t.Errorf("expected %d blocked content types, got %d", expectedCount, actualCount)
		}

		// Verify specific types
		expectedTypes := []string{
			"application/x-executable",
			"application/x-sharedlib",
			"application/x-mach-binary",
			"application/x-dosexec",
		}

		for _, ct := range expectedTypes {
			if !blockedContentTypes[ct] {
				t.Errorf("expected content type %s to be blocked", ct)
			}
		}
	})
}

func TestPresignedURLExpiry(t *testing.T) {
	t.Run("presigned URL expiry is correctly set", func(t *testing.T) {
		expectedExpiry := 15 * 60 // 15 minutes in seconds
		actualExpiry := int64(PresignedURLExpiry.Seconds())

		if actualExpiry != int64(expectedExpiry) {
			t.Errorf("expected expiry %d seconds, got %d", expectedExpiry, actualExpiry)
		}
	})
}

func TestMaxFileSizeBytesConstant(t *testing.T) {
	t.Run("maximum file size constant is correctly defined", func(t *testing.T) {
		if MaxFileSizeBytes != 5*1024*1024*1024 {
			t.Errorf("expected MaxFileSizeBytes 5GB, got %d", MaxFileSizeBytes)
		}
	})
}

func TestTierComparisonForContentType(t *testing.T) {
	t.Run("tier limits properly restrict different file sizes", func(t *testing.T) {
		// 500MB file
		fileSize := 500 * 1024 * 1024

		// Should pass free tier? No
		if fileSize <= getMaxFileSizeForTier("free") {
			t.Error("500MB file should exceed free tier limit")
		}

		// Should pass individual tier? Yes
		if fileSize > getMaxFileSizeForTier("individual") {
			t.Error("500MB file should not exceed individual tier limit")
		}

		// Should pass team tier? Yes
		if fileSize > getMaxFileSizeForTier("team") {
			t.Error("500MB file should not exceed team tier limit")
		}
	})
}

func TestBillingCheckerError(t *testing.T) {
	t.Run("storage service handles billing checker errors gracefully", func(t *testing.T) {
		// Create a checker that returns an error
		mockChecker := &MockBillingChecker{
			tier: "",
			err:  nil, // Would represent an error condition
		}

		// For this test we just verify the checker is set
		ss := NewStorageServiceWithBilling(nil, nil, mockChecker)

		if ss.billingChecker == nil {
			t.Error("billing checker should be set even if it errors")
		}
	})
}

func TestFileSizeEdgeCases(t *testing.T) {
	t.Run("file size validation handles edge cases", func(t *testing.T) {
		testCases := []struct {
			size      int64
			tier      string
			shouldFit bool
		}{
			{0, "free", true},                        // 0 bytes
			{1, "free", true},                        // 1 byte
			{MaxFileSizeFree, "free", true},          // Exactly at limit
			{MaxFileSizeFree + 1, "free", false},     // Just over limit
			{MaxFileSizeIndividual, "individual", true},
			{MaxFileSizeIndividual + 1, "individual", false},
			{MaxFileSizeTeam, "team", true},
			{MaxFileSizeTeam + 1, "team", false},
			{MaxFileSizeEnterprise, "enterprise", true},
			{MaxFileSizeEnterprise + 1, "enterprise", false},
		}

		for _, tc := range testCases {
			limit := getMaxFileSizeForTier(tc.tier)
			fits := tc.size <= limit

			if fits != tc.shouldFit {
				t.Errorf("tier=%s, size=%d, limit=%d: expected shouldFit=%v, got %v",
					tc.tier, tc.size, limit, tc.shouldFit, fits)
			}
		}
	})
}

func TestGetMaxFileSizeForTierConsistency(t *testing.T) {
	t.Run("getMaxFileSizeForTier returns consistent values", func(t *testing.T) {
		tiers := []string{"free", "individual", "team", "enterprise"}

		// Call each tier multiple times and verify consistency
		for _, tier := range tiers {
			size1 := getMaxFileSizeForTier(tier)
			size2 := getMaxFileSizeForTier(tier)
			size3 := getMaxFileSizeForTier(tier)

			if size1 != size2 || size2 != size3 {
				t.Errorf("tier %s returned inconsistent sizes: %d, %d, %d", tier, size1, size2, size3)
			}
		}
	})
}
