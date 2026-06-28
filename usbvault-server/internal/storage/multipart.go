// Package storage provides AWS S3 multipart upload management with resumable state.
//
// Features:
//   - Multipart uploads for files up to 5GB per part
//   - Resume capability with sequence tracking
//   - Presigned URLs for direct part uploads from clients
//   - Automatic cleanup of expired uploads (24h TTL)
//   - Progress tracking with completed parts
//
// PH2-FIX: Multipart upload support for files >5GB with resumable state.
package storage

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/middleware"
)

// PH2-FIX: Multipart upload support for files >5GB with resumable state.

const (
	MinPartSize     = 5 * 1024 * 1024        // 5MB minimum part size (S3 requirement)
	DefaultPartSize = 64 * 1024 * 1024       // 64MB default part size
	MaxPartSize     = 5 * 1024 * 1024 * 1024 // 5GB max part size
	MaxParts        = 10000                  // S3 max parts per upload
	UploadExpiryTTL = 24 * time.Hour         // 24h expiry for in-progress uploads
)

// MultipartUpload tracks an in-progress S3 multipart upload with resumable state.
//
// Fields:
//   - UploadID: S3 multipart upload ID
//   - Bucket: S3 bucket name
//   - Key: S3 object key (path in bucket)
//   - UserID, VaultID, FileID: Context identifiers
//   - TotalSize, PartSize, TotalParts: Upload dimensions
//   - CompletedParts: Parts already uploaded (with ETags)
//   - Status: in_progress, completed, or aborted
//   - CreatedAt, UpdatedAt, ExpiresAt: Lifecycle timestamps
type MultipartUpload struct {
	UploadID      string          `json:"upload_id"`
	Bucket        string          `json:"bucket"`
	Key           string          `json:"key"`
	UserID        string          `json:"user_id"`
	VaultID       string          `json:"vault_id"`
	FileID        string          `json:"file_id"`
	TotalSize     int64           `json:"total_size"`
	PartSize      int64           `json:"part_size"`
	TotalParts    int             `json:"total_parts"`
	CompleteParts []CompletedPart `json:"completed_parts"`
	Status        string          `json:"status"` // "in_progress", "completed", "aborted"
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
	ExpiresAt     time.Time       `json:"expires_at"`
}

// CompletedPart tracks metadata for a successfully uploaded part.
//
// Fields:
//   - PartNumber: Part sequence number (1-based)
//   - ETag: S3 ETag for integrity verification
//   - Size: Bytes uploaded in this part
type CompletedPart struct {
	PartNumber int    `json:"part_number"`
	ETag       string `json:"etag"`
	Size       int64  `json:"size"`
}

// MultipartService manages the lifecycle of S3 multipart uploads.
// Tracks upload state in memory and handles expiration cleanup.
type MultipartService struct {
	s3Client *s3.Client
	bucket   string
	mu       sync.RWMutex
	uploads  map[string]*MultipartUpload // uploadID -> upload state
	// F3: optional tier source for per-tier file-size enforcement on the
	// multipart path. Mirrors StorageService.billingChecker so the multipart
	// and single-shot paths agree on the authoritative tier. When nil, no
	// tier-based size limit is applied (preserves prior behavior / tests).
	billingChecker BillingChecker
	// F3 (FIX A/B): optional S3-sourced storage-usage source. Satisfied by
	// *StorageService.CurrentStorageBytes. When set, FinalizeUpload enforces the
	// per-tier cumulative MaxStorageMB quota against REAL S3 usage after the
	// object is assembled. When nil, only the per-tier per-file size limit is
	// enforced (preserves prior behavior / tests).
	storageUsage StorageUsageChecker
}

// StorageUsageChecker reports a user's authoritative (S3-sourced) cumulative
// stored bytes. *StorageService satisfies this via CurrentStorageBytes. It lets
// the multipart path enforce the same MaxStorageMB quota as the single-shot path.
type StorageUsageChecker interface {
	CurrentStorageBytes(ctx context.Context, userID string) (int64, error)
}

// NewMultipartService creates a new multipart upload service.
// Starts background cleanup goroutine for expired uploads.
func NewMultipartService(s3Client *s3.Client, bucket string) *MultipartService {
	svc := &MultipartService{
		s3Client: s3Client,
		bucket:   bucket,
		uploads:  make(map[string]*MultipartUpload),
	}
	// Start cleanup goroutine for expired uploads
	go svc.cleanupExpiredUploads()
	return svc
}

// SetBillingChecker installs the tier source used for per-tier file-size limits
// on the multipart path. F3: enables authoritative server-side enforcement so a
// client cannot bypass the single-shot DV-001 file-size gate by using multipart.
func (ms *MultipartService) SetBillingChecker(bc BillingChecker) {
	ms.billingChecker = bc
}

// SetStorageUsageChecker installs the S3-sourced storage-usage source used to
// enforce the per-tier cumulative MaxStorageMB quota on the multipart finalize
// path. F3 (FIX A/B): keeps the multipart and single-shot paths consistent so a
// client cannot exceed its tier's total storage by routing bytes through
// multipart. *StorageService satisfies StorageUsageChecker.
func (ms *MultipartService) SetStorageUsageChecker(c StorageUsageChecker) {
	ms.storageUsage = c
}

// resolveMaxFileSize returns the authoritative per-tier max file size for the
// user, defaulting to the free-tier limit when no billing checker is wired or the
// tier lookup fails (fail-closed).
func (ms *MultipartService) resolveMaxFileSize(ctx context.Context, userID string) (int64, string) {
	if ms.billingChecker == nil {
		// No tier source configured: do not impose a tier-based size cap here.
		// The hard S3 per-part / per-object ceilings still apply elsewhere.
		return MaxFileSizeBytes, ""
	}
	tier, err := ms.billingChecker.CheckAccess(ctx, userID)
	if err != nil {
		log.Warn().Err(err).Str("user_id", userID).Msg("F3: failed to resolve tier for multipart size limit; using free-tier cap")
		return MaxFileSizeFree, "free"
	}
	return getMaxFileSizeForTier(tier), tier
}

// ErrFileSizeExceedsTier is returned when a multipart upload's declared or actual
// size exceeds the per-tier file-size limit. Callers should translate this into an
// HTTP 402 Payment Required response (upgrade required), matching the single-shot
// upload path (storage.HandleGenerateUploadURL).
var ErrFileSizeExceedsTier = fmt.Errorf("file size exceeds subscription tier limit")

// InitiateUpload starts a new S3 multipart upload and returns resumable state.
// Calculates optimal part size (64MB default, up to 5GB per part).
// Returns upload details including uploadID for subsequent part uploads.
//
// F3: enforces the per-tier max file size against the client-declared totalSize
// BEFORE creating the S3 upload, returning ErrFileSizeExceedsTier when exceeded.
// This is only an EARLY GATE — the client controls totalSize and can under-declare
// it. The AUTHORITATIVE size/quota enforcement is the post-assembly HeadObject in
// FinalizeUpload (FIX B), which measures the real object and deletes it on
// violation. Keeping this early check avoids creating S3 multipart state for an
// obviously-oversized declared upload.
func (ms *MultipartService) InitiateUpload(ctx context.Context, userID, vaultID, fileID string, totalSize int64) (*MultipartUpload, error) {
	// SECURITY: vaultID and fileID are interpolated into the S3 object key below.
	// Reject empty values and path separators / traversal so a caller cannot escape
	// the "vaults/<vaultID>/files/<fileID>" namespace and target arbitrary object keys.
	for _, id := range []string{vaultID, fileID} {
		if id == "" || strings.ContainsAny(id, "/\\") || strings.Contains(id, "..") {
			return nil, fmt.Errorf("invalid id: must not be empty or contain path separators")
		}
	}

	// F3: early gate on the declared size against the user's tier before any S3 work.
	maxFileSize, tier := ms.resolveMaxFileSize(ctx, userID)
	if totalSize > maxFileSize {
		log.Warn().
			Str("user_id", userID).
			Str("tier", tier).
			Int64("limit", maxFileSize).
			Int64("declared_total_size", totalSize).
			Msg("F3: multipart upload rejected — declared size exceeds tier limit")
		return nil, ErrFileSizeExceedsTier
	}

	key := fmt.Sprintf("vaults/%s/files/%s", vaultID, fileID)

	// Calculate part size and count
	partSize := int64(DefaultPartSize)
	totalParts := int(totalSize / partSize)
	if totalSize%partSize != 0 {
		totalParts++
	}
	if totalParts > MaxParts {
		partSize = totalSize / int64(MaxParts)
		if totalSize%int64(MaxParts) != 0 {
			partSize++
		}
		totalParts = MaxParts
	}

	// Initiate S3 multipart upload
	output, err := ms.s3Client.CreateMultipartUpload(ctx, &s3.CreateMultipartUploadInput{
		Bucket:               aws.String(ms.bucket),
		Key:                  aws.String(key),
		ServerSideEncryption: types.ServerSideEncryptionAes256,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to initiate S3 multipart upload: %w", err)
	}

	upload := &MultipartUpload{
		UploadID:      *output.UploadId,
		Bucket:        ms.bucket,
		Key:           key,
		UserID:        userID,
		VaultID:       vaultID,
		FileID:        fileID,
		TotalSize:     totalSize,
		PartSize:      partSize,
		TotalParts:    totalParts,
		CompleteParts: make([]CompletedPart, 0),
		Status:        "in_progress",
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
		ExpiresAt:     time.Now().Add(UploadExpiryTTL),
	}

	ms.mu.Lock()
	ms.uploads[upload.UploadID] = upload
	ms.mu.Unlock()

	log.Info().
		Str("upload_id", upload.UploadID).
		Str("file_id", fileID).
		Int64("total_size", totalSize).
		Int("total_parts", totalParts).
		Msg("PH2-FIX: Multipart upload initiated")

	return upload, nil
}

// ErrUploadNotFound is returned when an upload does not exist or the caller is
// not authorized to access it. The same error is used for both cases so callers
// cannot distinguish "exists but not yours" from "does not exist" (avoids
// cross-tenant enumeration).
var ErrUploadNotFound = fmt.Errorf("upload not found")

// authorizedUpload looks up an upload and verifies it belongs to the caller.
// SECURITY (cross-tenant IDOR): every operation keyed by uploadID must confirm
// the stored upload's UserID and VaultID match the authenticated caller before
// acting on it; otherwise a user could supply another tenant's uploadID.
// Caller must hold ms.mu (read or write) for the duration of using the result,
// or copy what it needs while still holding the lock.
func (ms *MultipartService) authorizedUpload(uploadID, userID, vaultID string) (*MultipartUpload, error) {
	upload, ok := ms.uploads[uploadID]
	if !ok {
		return nil, ErrUploadNotFound
	}
	if upload.UserID != userID || upload.VaultID != vaultID {
		return nil, ErrUploadNotFound
	}
	return upload, nil
}

// GeneratePresignedPartURL generates a time-limited presigned URL for a specific part.
// Client uses this URL to upload the part directly to S3 (15-minute expiry).
// Returns error if upload not found, not owned by the caller, or not in progress.
func (ms *MultipartService) GeneratePresignedPartURL(ctx context.Context, userID, vaultID, uploadID string, partNumber int) (string, error) {
	ms.mu.RLock()
	upload, err := ms.authorizedUpload(uploadID, userID, vaultID)
	ms.mu.RUnlock()

	if err != nil {
		return "", err
	}
	if upload.Status != "in_progress" {
		return "", fmt.Errorf("upload is not in progress: %s", upload.Status)
	}

	// Use presign client for generating URLs
	presignClient := s3.NewPresignClient(ms.s3Client)
	presigned, err := presignClient.PresignUploadPart(ctx, &s3.UploadPartInput{
		Bucket:     aws.String(upload.Bucket),
		Key:        aws.String(upload.Key),
		UploadId:   aws.String(upload.UploadID),
		PartNumber: aws.Int32(int32(partNumber)), //gosec:disable G115 -- S3 part numbers are bounded to 1..10000 by the S3 API
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", fmt.Errorf("failed to generate presigned URL: %w", err)
	}

	return presigned.URL, nil
}

// CompletePart records a successfully uploaded part and updates progress state.
// Called after client uploads a part and receives the ETag from S3.
func (ms *MultipartService) CompletePart(ctx context.Context, userID, vaultID, uploadID string, partNumber int, etag string, size int64) error {
	ms.mu.Lock()
	defer ms.mu.Unlock()

	upload, err := ms.authorizedUpload(uploadID, userID, vaultID)
	if err != nil {
		return err
	}

	upload.CompleteParts = append(upload.CompleteParts, CompletedPart{
		PartNumber: partNumber,
		ETag:       etag,
		Size:       size,
	})
	upload.UpdatedAt = time.Now()

	log.Info().
		Str("upload_id", uploadID).
		Int("part", partNumber).
		Int("completed", len(upload.CompleteParts)).
		Int("total", upload.TotalParts).
		Msg("PH2-FIX: Part completed")

	return nil
}

// FinalizeUpload completes the S3 multipart upload after all parts are uploaded.
// Tells S3 to assemble parts into the final object, then enforces tier limits
// against the REAL assembled object size.
//
// F3 (FIX B): the client-reported CompletePart sizes are NOT trusted for
// enforcement — a client can lie about part sizes the same way it can under-declare
// TotalSize at initiate. The authoritative enforcement is a HeadObject on the final
// key AFTER CompleteMultipartUpload assembles it, which returns the true
// ContentLength. We enforce that real size against both the per-tier max file size
// (getMaxFileSizeForTier) and the S3-sourced cumulative storage quota
// (MaxStorageMB). If either is exceeded, we DeleteObject the just-assembled object
// and return ErrFileSizeExceedsTier (-> HTTP 402). The InitiateUpload TotalSize
// check remains only as an early gate.
func (ms *MultipartService) FinalizeUpload(ctx context.Context, userID, vaultID, uploadID string) error {
	ms.mu.Lock()
	upload, err := ms.authorizedUpload(uploadID, userID, vaultID)
	ms.mu.Unlock()

	if err != nil {
		return err
	}

	// Build completed parts list for S3.
	parts := make([]types.CompletedPart, len(upload.CompleteParts))
	for i, p := range upload.CompleteParts {
		etag := p.ETag
		parts[i] = types.CompletedPart{
			PartNumber: aws.Int32(int32(p.PartNumber)), //gosec:disable G115 -- S3 part numbers are bounded to 1..10000 by the S3 API
			ETag:       aws.String(etag),
		}
	}

	_, err = ms.s3Client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
		Bucket:   aws.String(upload.Bucket),
		Key:      aws.String(upload.Key),
		UploadId: aws.String(upload.UploadID),
		MultipartUpload: &types.CompletedMultipartUpload{
			Parts: parts,
		},
	})
	if err != nil {
		return fmt.Errorf("failed to complete multipart upload: %w", err)
	}

	// F3 (FIX B): authoritative post-assembly enforcement. HeadObject the final
	// key to get the REAL ContentLength (never trust client-reported part sizes).
	head, headErr := ms.s3Client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(upload.Bucket),
		Key:    aws.String(upload.Key),
	})
	if headErr != nil {
		// Fail closed: if we cannot verify the assembled size, delete the object so
		// an unverified (possibly oversized) object cannot persist.
		log.Warn().Err(headErr).Str("upload_id", uploadID).Str("key", upload.Key).
			Msg("F3: failed to HeadObject after multipart finalize; deleting object (fail-closed)")
		ms.deleteFinalObject(ctx, upload.Bucket, upload.Key, uploadID)
		return fmt.Errorf("failed to verify assembled object size: %w", headErr)
	}
	var realSize int64
	if head.ContentLength != nil {
		realSize = *head.ContentLength
	}

	maxFileSize, tier := ms.resolveMaxFileSize(ctx, userID)
	if realSize > maxFileSize {
		log.Warn().
			Str("user_id", userID).
			Str("tier", tier).
			Str("upload_id", uploadID).
			Int64("limit", maxFileSize).
			Int64("real_size", realSize).
			Int64("declared_total_size", upload.TotalSize).
			Msg("F3: multipart finalize rejected — assembled object exceeds per-tier file-size limit; deleting object")
		ms.deleteFinalObject(ctx, upload.Bucket, upload.Key, uploadID)
		return ErrFileSizeExceedsTier
	}

	// F3 (FIX A/B): enforce the per-tier cumulative storage quota against REAL S3
	// usage. CurrentStorageBytes already counts the just-assembled object (it is now
	// listed under the vault prefix), so compare current usage directly to the cap.
	if ms.storageUsage != nil {
		limits, found := middleware.TierLimitsMap[tier]
		if !found {
			limits = middleware.TierLimitsMap["free"]
		}
		limitBytes := int64(limits.MaxStorageMB) * 1024 * 1024
		current, usageErr := ms.storageUsage.CurrentStorageBytes(ctx, userID)
		if usageErr != nil {
			// Fail closed: cannot determine usage -> delete the new object and reject.
			log.Warn().Err(usageErr).Str("user_id", userID).Str("upload_id", uploadID).
				Msg("F3: failed to compute storage usage after multipart finalize; deleting object (fail-closed)")
			ms.deleteFinalObject(ctx, upload.Bucket, upload.Key, uploadID)
			return ErrFileSizeExceedsTier
		}
		if current > limitBytes {
			log.Warn().
				Str("user_id", userID).
				Str("tier", tier).
				Str("upload_id", uploadID).
				Int64("current_bytes", current).
				Int64("limit_bytes", limitBytes).
				Int64("real_size", realSize).
				Msg("F3: multipart finalize rejected — cumulative storage quota exceeded; deleting object")
			ms.deleteFinalObject(ctx, upload.Bucket, upload.Key, uploadID)
			return ErrFileSizeExceedsTier
		}
	}

	ms.mu.Lock()
	upload.Status = "completed"
	upload.UpdatedAt = time.Now()
	delete(ms.uploads, uploadID)
	ms.mu.Unlock()

	log.Info().Str("upload_id", uploadID).Str("file_id", upload.FileID).Int64("real_size", realSize).Msg("PH2-FIX: Multipart upload completed")
	return nil
}

// deleteFinalObject best-effort deletes an assembled multipart object that failed
// post-finalize tier/quota enforcement, and clears local tracking state. The
// multipart upload itself is already complete at this point (no AbortMultipartUpload
// is possible), so the assembled object must be removed via DeleteObject.
func (ms *MultipartService) deleteFinalObject(ctx context.Context, bucket, key, uploadID string) {
	if _, err := ms.s3Client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}); err != nil {
		log.Warn().Err(err).Str("upload_id", uploadID).Str("key", key).
			Msg("F3: failed to delete rejected oversized/over-quota multipart object")
	}
	ms.mu.Lock()
	delete(ms.uploads, uploadID)
	ms.mu.Unlock()
}

// AbortUpload cancels an in-progress multipart upload and cleans up S3 resources.
// Use when upload is abandoned or times out. Removes local tracking state.
func (ms *MultipartService) AbortUpload(ctx context.Context, userID, vaultID, uploadID string) error {
	ms.mu.Lock()
	upload, err := ms.authorizedUpload(uploadID, userID, vaultID)
	ms.mu.Unlock()

	if err != nil {
		return err
	}

	_, err = ms.s3Client.AbortMultipartUpload(ctx, &s3.AbortMultipartUploadInput{
		Bucket:   aws.String(upload.Bucket),
		Key:      aws.String(upload.Key),
		UploadId: aws.String(upload.UploadID),
	})
	if err != nil {
		return fmt.Errorf("failed to abort multipart upload: %w", err)
	}

	ms.mu.Lock()
	upload.Status = "aborted"
	upload.UpdatedAt = time.Now()
	delete(ms.uploads, uploadID)
	ms.mu.Unlock()

	log.Info().Str("upload_id", uploadID).Msg("PH2-FIX: Multipart upload aborted")
	return nil
}

// GetUploadProgress returns current upload state including completed parts and progress percentage.
// The caller must own the upload (matching UserID and VaultID).
func (ms *MultipartService) GetUploadProgress(userID, vaultID, uploadID string) (*MultipartUpload, error) {
	ms.mu.RLock()
	defer ms.mu.RUnlock()

	return ms.authorizedUpload(uploadID, userID, vaultID)
}

// cleanupExpiredUploads periodically aborts expired uploads
func (ms *MultipartService) cleanupExpiredUploads() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		ms.mu.Lock()
		now := time.Now()
		for id, upload := range ms.uploads {
			if upload.Status == "in_progress" && now.After(upload.ExpiresAt) {
				log.Warn().Str("upload_id", id).Msg("PH2-FIX: Aborting expired multipart upload")
				// Best-effort abort
				ms.s3Client.AbortMultipartUpload(context.Background(), &s3.AbortMultipartUploadInput{
					Bucket:   aws.String(upload.Bucket),
					Key:      aws.String(upload.Key),
					UploadId: aws.String(upload.UploadID),
				})
				delete(ms.uploads, id)
			}
		}
		ms.mu.Unlock()
	}
}
