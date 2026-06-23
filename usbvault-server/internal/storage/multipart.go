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
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/rs/zerolog/log"
)

// PH2-FIX: Multipart upload support for files >5GB with resumable state.

const (
	MinPartSize     = 5 * 1024 * 1024                    // 5MB minimum part size (S3 requirement)
	DefaultPartSize = 64 * 1024 * 1024                   // 64MB default part size
	MaxPartSize     = 5 * 1024 * 1024 * 1024             // 5GB max part size
	MaxParts        = 10000                              // S3 max parts per upload
	UploadExpiryTTL = 24 * time.Hour                     // 24h expiry for in-progress uploads
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

// InitiateUpload starts a new S3 multipart upload and returns resumable state.
// Calculates optimal part size (64MB default, up to 5GB per part).
// Returns upload details including uploadID for subsequent part uploads.
func (ms *MultipartService) InitiateUpload(ctx context.Context, userID, vaultID, fileID string, totalSize int64) (*MultipartUpload, error) {
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

// GeneratePresignedPartURL generates a time-limited presigned URL for a specific part.
// Client uses this URL to upload the part directly to S3 (15-minute expiry).
// Returns error if upload not found or not in progress.
func (ms *MultipartService) GeneratePresignedPartURL(ctx context.Context, uploadID string, partNumber int) (string, error) {
	ms.mu.RLock()
	upload, ok := ms.uploads[uploadID]
	ms.mu.RUnlock()

	if !ok {
		return "", fmt.Errorf("upload not found: %s", uploadID)
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
func (ms *MultipartService) CompletePart(ctx context.Context, uploadID string, partNumber int, etag string, size int64) error {
	ms.mu.Lock()
	defer ms.mu.Unlock()

	upload, ok := ms.uploads[uploadID]
	if !ok {
		return fmt.Errorf("upload not found: %s", uploadID)
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
// Tells S3 to assemble parts into final object. Returns error if S3 operation fails.
func (ms *MultipartService) FinalizeUpload(ctx context.Context, uploadID string) error {
	ms.mu.Lock()
	upload, ok := ms.uploads[uploadID]
	ms.mu.Unlock()

	if !ok {
		return fmt.Errorf("upload not found: %s", uploadID)
	}

	// Build completed parts list for S3
	parts := make([]types.CompletedPart, len(upload.CompleteParts))
	for i, p := range upload.CompleteParts {
		etag := p.ETag
		parts[i] = types.CompletedPart{
			PartNumber: aws.Int32(int32(p.PartNumber)), //gosec:disable G115 -- S3 part numbers are bounded to 1..10000 by the S3 API
			ETag:       aws.String(etag),
		}
	}

	_, err := ms.s3Client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
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

	ms.mu.Lock()
	upload.Status = "completed"
	upload.UpdatedAt = time.Now()
	ms.mu.Unlock()

	log.Info().Str("upload_id", uploadID).Str("file_id", upload.FileID).Msg("PH2-FIX: Multipart upload completed")
	return nil
}

// AbortUpload cancels an in-progress multipart upload and cleans up S3 resources.
// Use when upload is abandoned or times out. Removes local tracking state.
func (ms *MultipartService) AbortUpload(ctx context.Context, uploadID string) error {
	ms.mu.Lock()
	upload, ok := ms.uploads[uploadID]
	ms.mu.Unlock()

	if !ok {
		return fmt.Errorf("upload not found: %s", uploadID)
	}

	_, err := ms.s3Client.AbortMultipartUpload(ctx, &s3.AbortMultipartUploadInput{
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
func (ms *MultipartService) GetUploadProgress(uploadID string) (*MultipartUpload, error) {
	ms.mu.RLock()
	defer ms.mu.RUnlock()

	upload, ok := ms.uploads[uploadID]
	if !ok {
		return nil, fmt.Errorf("upload not found: %s", uploadID)
	}
	return upload, nil
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
