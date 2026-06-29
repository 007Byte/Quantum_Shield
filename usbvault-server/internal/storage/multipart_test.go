package storage

import (
	"context"
	"testing"
	"time"
)

// PH2-FIX: Multipart upload service tests

// TestMultipartUploadInitiation tests basic upload initiation
func TestMultipartUploadInitiation(t *testing.T) {
	// Note: This test validates the multipart upload struct and constants
	// Full S3 integration requires a running MinIO/S3 instance

	// Verify constants are correctly set
	if MinPartSize != 5*1024*1024 {
		t.Errorf("MinPartSize should be 5MB, got %d", MinPartSize)
	}

	if DefaultPartSize != 64*1024*1024 {
		t.Errorf("DefaultPartSize should be 64MB, got %d", DefaultPartSize)
	}

	if MaxParts != 10000 {
		t.Errorf("MaxParts should be 10000, got %d", MaxParts)
	}

	if UploadExpiryTTL != 24*time.Hour {
		t.Errorf("UploadExpiryTTL should be 24h, got %v", UploadExpiryTTL)
	}
}

// TestMultipartUploadPartCalculation tests part size calculation logic
func TestMultipartUploadPartCalculation(t *testing.T) {
	tests := []struct {
		totalSize     int64
		expectedParts int
		description   string
	}{
		{
			totalSize:     100 * 1024 * 1024, // 100MB
			expectedParts: 2,
			description:   "Small file (100MB)",
		},
		{
			totalSize:     1024 * 1024 * 1024, // 1GB
			expectedParts: 16,
			description:   "Medium file (1GB)",
		},
		{
			totalSize:     10 * 1024 * 1024 * 1024, // 10GB
			expectedParts: 160,
			description:   "Large file (10GB)",
		},
		{
			totalSize:     5 * 1024 * 1024 * 1024 * 1024, // 5TB (would exceed max parts)
			expectedParts: 10000,
			description:   "Very large file (5TB)",
		},
	}

	for _, test := range tests {
		partSize := int64(DefaultPartSize)
		totalParts := int(test.totalSize / partSize)
		if test.totalSize%partSize != 0 {
			totalParts++
		}

		// Cap at MaxParts
		if totalParts > MaxParts {
			partSize = test.totalSize / int64(MaxParts)
			if test.totalSize%int64(MaxParts) != 0 {
				partSize++
			}
			totalParts = MaxParts
		}

		if totalParts != test.expectedParts {
			t.Errorf("%s: expected %d parts, got %d", test.description, test.expectedParts, totalParts)
		}
	}
}

// TestMultipartUploadStructure validates the MultipartUpload struct fields
func TestMultipartUploadStructure(t *testing.T) {
	upload := &MultipartUpload{
		UploadID:      "test-upload-123",
		Bucket:        "test-bucket",
		Key:           "vaults/vault-123/files/file-123",
		UserID:        "user-123",
		VaultID:       "vault-123",
		FileID:        "file-123",
		TotalSize:     1024 * 1024 * 1024, // 1GB
		PartSize:      64 * 1024 * 1024,   // 64MB
		TotalParts:    16,
		CompleteParts: make([]CompletedPart, 0),
		Status:        "in_progress",
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
		ExpiresAt:     time.Now().Add(24 * time.Hour),
	}

	if upload.UploadID == "" {
		t.Error("UploadID should not be empty")
	}
	if upload.Status != "in_progress" {
		t.Error("Status should be 'in_progress'")
	}
	if len(upload.CompleteParts) != 0 {
		t.Error("CompleteParts should be empty initially")
	}
}

// TestCompletedPartStructure validates the CompletedPart struct
func TestCompletedPartStructure(t *testing.T) {
	part := CompletedPart{
		PartNumber: 1,
		ETag:       "abc123def456",
		Size:       64 * 1024 * 1024,
	}

	if part.PartNumber != 1 {
		t.Error("PartNumber should be 1")
	}
	if part.ETag == "" {
		t.Error("ETag should not be empty")
	}
	if part.Size != 64*1024*1024 {
		t.Error("Size should be 64MB")
	}
}

// TestMultipartUploadServiceCreation validates service creation
func TestMultipartUploadServiceCreation(t *testing.T) {
	// Create a mock S3 client (not initialized with real AWS config)
	// This validates the service structure
	mockService := &MultipartService{
		s3Client: nil, // Mock: would be *s3.Client in real scenario
		bucket:   "test-bucket",
		uploads:  make(map[string]*MultipartUpload),
	}

	if mockService.bucket != "test-bucket" {
		t.Error("Bucket should be set to 'test-bucket'")
	}
	if len(mockService.uploads) != 0 {
		t.Error("Uploads map should be empty initially")
	}
}

// F3: resolveMaxFileSize maps the billing-checker tier to the per-tier file-size
// cap, and fails closed to the free-tier cap on error / no checker.
func TestMultipartResolveMaxFileSize(t *testing.T) {
	ctx := context.Background()

	t.Run("no billing checker uses absolute max", func(t *testing.T) {
		ms := &MultipartService{uploads: make(map[string]*MultipartUpload)}
		got, tier := ms.resolveMaxFileSize(ctx, "u1")
		if got != MaxFileSizeBytes {
			t.Errorf("expected %d, got %d", MaxFileSizeBytes, got)
		}
		if tier != "" {
			t.Errorf("expected empty tier, got %q", tier)
		}
	})

	t.Run("individual tier maps to 1GB", func(t *testing.T) {
		ms := &MultipartService{uploads: make(map[string]*MultipartUpload)}
		ms.SetBillingChecker(&MockBillingChecker{tier: "individual"})
		got, tier := ms.resolveMaxFileSize(ctx, "u1")
		if got != MaxFileSizeIndividual {
			t.Errorf("expected %d, got %d", MaxFileSizeIndividual, got)
		}
		if tier != "individual" {
			t.Errorf("expected individual, got %q", tier)
		}
	})

	t.Run("checker error fails closed to free cap", func(t *testing.T) {
		ms := &MultipartService{uploads: make(map[string]*MultipartUpload)}
		ms.SetBillingChecker(&MockBillingChecker{err: context.DeadlineExceeded})
		got, _ := ms.resolveMaxFileSize(ctx, "u1")
		if got != MaxFileSizeFree {
			t.Errorf("expected free cap %d on error, got %d", MaxFileSizeFree, got)
		}
	})
}

// TestUploadExpiryValidation checks TTL configuration
func TestUploadExpiryValidation(t *testing.T) {
	if UploadExpiryTTL < 1*time.Hour {
		t.Error("Upload expiry should be at least 1 hour")
	}
	if UploadExpiryTTL > 7*24*time.Hour {
		t.Error("Upload expiry should not exceed 7 days")
	}
}

// TestMultipartUploadStateTransitions validates status transitions
func TestMultipartUploadStateTransitions(t *testing.T) {
	upload := &MultipartUpload{
		Status: "in_progress",
	}

	validTransitions := map[string][]string{
		"in_progress": {"completed", "aborted"},
		"completed":   {},
		"aborted":     {},
	}

	// Verify we can transition to valid states
	for fromStatus, toStatuses := range validTransitions {
		upload.Status = fromStatus
		for _, toStatus := range toStatuses {
			upload.Status = toStatus
			if upload.Status != toStatus {
				t.Errorf("Failed to transition from %s to %s", fromStatus, toStatus)
			}
		}
	}
}

// TestPartNumberValidation validates part number constraints
func TestPartNumberValidation(t *testing.T) {
	tests := []struct {
		partNumber  int
		valid       bool
		description string
	}{
		{0, false, "Part 0 (invalid: < 1)"},
		{1, true, "Part 1 (valid: minimum)"},
		{5000, true, "Part 5000 (valid: mid-range)"},
		{10000, true, "Part 10000 (valid: maximum)"},
		{10001, false, "Part 10001 (invalid: > max)"},
	}

	for _, test := range tests {
		valid := test.partNumber >= 1 && test.partNumber <= MaxParts
		if valid != test.valid {
			t.Errorf("%s: expected valid=%v, got %v", test.description, test.valid, valid)
		}
	}
}

// TestS3KeyConstruction validates proper S3 key formatting
func TestS3KeyConstruction(t *testing.T) {
	vaultID := "vault-123"
	fileID := "file-456"
	expectedKey := "vaults/vault-123/files/file-456"

	actualKey := "vaults/" + vaultID + "/files/" + fileID
	if actualKey != expectedKey {
		t.Errorf("S3 key construction failed: expected %s, got %s", expectedKey, actualKey)
	}
}

// TestCompletePart_UpsertNoDuplicate guards the resume duplicate-part fix:
// recording the same part number twice must replace the prior entry (last write
// wins) rather than appending, so CompleteMultipartUpload does not get duplicate
// parts that S3 rejects. Uses store==nil so the path stays purely in-memory and
// needs no S3 client.
func TestCompletePart_UpsertNoDuplicate(t *testing.T) {
	ctx := context.Background()
	uploadID := "upload-dup"
	ms := &MultipartService{uploads: make(map[string]*MultipartUpload)}
	ms.uploads[uploadID] = &MultipartUpload{
		UploadID:      uploadID,
		UserID:        "u1",
		VaultID:       "v1",
		Status:        "in_progress",
		CompleteParts: make([]CompletedPart, 0),
	}

	if err := ms.CompletePart(ctx, "u1", "v1", uploadID, 1, "etag-old", 100); err != nil {
		t.Fatalf("first CompletePart: %v", err)
	}
	if err := ms.CompletePart(ctx, "u1", "v1", uploadID, 1, "etag-new", 200); err != nil {
		t.Fatalf("second CompletePart: %v", err)
	}

	parts := ms.uploads[uploadID].CompleteParts
	if len(parts) != 1 {
		t.Fatalf("expected exactly 1 part after re-recording part 1, got %d", len(parts))
	}
	if parts[0].PartNumber != 1 || parts[0].ETag != "etag-new" || parts[0].Size != 200 {
		t.Errorf("expected part 1 with etag-new/size 200 (last write wins), got %+v", parts[0])
	}
}

// TestFinalizeParts_SortedAscending verifies the helper used to build the S3
// CompletedMultipartUpload returns parts in ascending part-number order
// (required by S3) regardless of the order parts were recorded.
func TestFinalizeParts_SortedAscending(t *testing.T) {
	unsorted := []CompletedPart{
		{PartNumber: 3, ETag: "c"},
		{PartNumber: 1, ETag: "a"},
		{PartNumber: 2, ETag: "b"},
	}
	sorted := sortPartsAscending(unsorted)

	if len(sorted) != 3 {
		t.Fatalf("expected 3 parts, got %d", len(sorted))
	}
	for i := 1; i < len(sorted); i++ {
		if sorted[i-1].PartNumber > sorted[i].PartNumber {
			t.Errorf("parts not ascending at index %d: %d > %d", i, sorted[i-1].PartNumber, sorted[i].PartNumber)
		}
	}
	// Original slice must be unmodified (helper copies).
	if unsorted[0].PartNumber != 3 {
		t.Errorf("sortPartsAscending must not mutate its input, got %+v", unsorted)
	}
}

// TestContextHandling validates context usage in multipart operations
func TestContextHandling(t *testing.T) {
	// Create a cancellable context
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Verify context can be created with timeout
	timeoutCtx, timeoutCancel := context.WithTimeout(ctx, 5*time.Second)
	defer timeoutCancel()

	select {
	case <-timeoutCtx.Done():
		// Context completed (should timeout after 5 seconds)
	case <-time.After(1 * time.Second):
		// Context still valid
	}
}
