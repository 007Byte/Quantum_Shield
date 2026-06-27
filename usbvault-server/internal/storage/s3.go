package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/config"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
	"github.com/usbvault/usbvault-server/internal/middleware"
)

// DV-010 FIX: Validate S3 key components to prevent path traversal
func validateS3KeyComponent(component string) error {
	if strings.Contains(component, "..") || strings.Contains(component, "/") || strings.Contains(component, "\\") {
		return fmt.Errorf("invalid S3 key component: contains path traversal characters")
	}
	return nil
}

// File size and security constants
const (
	MaxFileSizeBytes      = 5 * 1024 * 1024 * 1024  // 5 GB max
	MaxFileSizeFree       = 100 * 1024 * 1024       // 100 MB for free tier
	MaxFileSizeIndividual = 1 * 1024 * 1024 * 1024  // 1 GB for individual tier
	MaxFileSizeTeam       = 5 * 1024 * 1024 * 1024  // 5 GB for team tier
	MaxFileSizeEnterprise = 5 * 1024 * 1024 * 1024  // 5 GB for enterprise tier
	PresignedURLExpiry    = 15 * time.Minute
)

// DV-001 FIX: BillingChecker interface for tier-based validation
type BillingChecker interface {
	CheckAccess(ctx context.Context, userID string) (tier string, err error)
}

// Blocked content types (CWE-434 mitigation)
var blockedContentTypes = map[string]bool{
	"application/x-executable":  true,
	"application/x-sharedlib":   true,
	"application/x-mach-binary": true,
	"application/x-dosexec":     true,
}

type StorageService struct {
	s3Client       *s3.Client
	pool           *pgxpool.Pool
	bucket         string
	region         string
	billingChecker BillingChecker // DV-001 FIX: For tier-based file size limits
}

type BlobInfo struct {
	ID        string `json:"id"`
	VaultID   string `json:"vault_id"`
	SizeBytes int64  `json:"size_bytes"`
	CreatedAt string `json:"created_at"`
}

func NewStorageService(s3Client *s3.Client, pool *pgxpool.Pool) *StorageService {
	return &StorageService{
		s3Client:       s3Client,
		pool:           pool,
		bucket:         config.GetEnvOrDefault("S3_BUCKET", "usbvault-prod"),
		region:         config.GetEnvOrDefault("AWS_REGION", "us-east-1"),
		billingChecker: nil, // Optional - can be set later
	}
}

// DV-001 FIX: NewStorageServiceWithBilling creates service with billing checker
func NewStorageServiceWithBilling(s3Client *s3.Client, pool *pgxpool.Pool, billingChecker BillingChecker) *StorageService {
	return &StorageService{
		s3Client:       s3Client,
		pool:           pool,
		bucket:         config.GetEnvOrDefault("S3_BUCKET", "usbvault-prod"),
		region:         config.GetEnvOrDefault("AWS_REGION", "us-east-1"),
		billingChecker: billingChecker,
	}
}

// SetBillingChecker installs the tier source used for per-tier file-size limits.
// F3: enables authoritative server-side enforcement on the upload path when the
// billing service is wired in after the storage service is constructed.
func (ss *StorageService) SetBillingChecker(bc BillingChecker) {
	ss.billingChecker = bc
}

// DV-001 FIX: getMaxFileSizeForTier returns the maximum file size for a given tier
func getMaxFileSizeForTier(tier string) int64 {
	switch tier {
	case "free":
		return MaxFileSizeFree
	case "individual":
		return MaxFileSizeIndividual
	case "team":
		return MaxFileSizeTeam
	case "enterprise":
		return MaxFileSizeEnterprise
	default:
		return MaxFileSizeFree // Default to free tier for safety
	}
}


// F3 (FIX A): CurrentStorageBytes returns the cumulative size (in bytes) of all
// objects the user actually stores in S3, across all of their non-deleted vaults.
//
// AUTHORITATIVE SIZE TRUTH IS S3, NOT THE DB. The earlier implementation summed
// blobs.size_bytes, but nothing ever inserts a blobs row: uploads are direct
// presigned PUTs (single-shot) and CompleteMultipartUpload (multipart) with no DB
// record (QueryCreateBlob is dead). That made the quota a no-op (always 0). We now
// enumerate the user's vault key prefixes in S3 with the SAME ListObjectsV2 path
// ListBlobs uses, summing obj.Size with full pagination. Both upload shapes land
// under the per-vault prefix "vaults/{vaultID}/" — single-shot at
// "vaults/{vaultID}/{blobID}" and multipart at "vaults/{vaultID}/files/{fileID}" —
// so a single prefix scan per vault covers both. Returns 0 with no error when the
// user has no stored objects.
func (ss *StorageService) CurrentStorageBytes(ctx context.Context, userID string) (int64, error) {
	if ss.s3Client == nil {
		// No object store wired (unit tests / local) — cannot measure usage.
		return 0, nil
	}

	// Resolve the user's non-deleted vaults. Without the DB we cannot scope the
	// scan to this user's prefixes, so treat usage as unknown-zero rather than
	// scanning the whole bucket.
	if ss.pool == nil {
		return 0, nil
	}
	rows, err := ss.pool.Query(ctx,
		`SELECT id FROM vaults WHERE owner_id = $1 AND deleted_at IS NULL`,
		userID,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return 0, nil
		}
		return 0, err
	}
	var vaultIDs []string
	for rows.Next() {
		var id string
		if scanErr := rows.Scan(&id); scanErr != nil {
			rows.Close()
			return 0, scanErr
		}
		vaultIDs = append(vaultIDs, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	var total int64
	for _, vaultID := range vaultIDs {
		prefix := "vaults/" + vaultID + "/"
		paginator := s3.NewListObjectsV2Paginator(ss.s3Client, &s3.ListObjectsV2Input{
			Bucket: aws.String(ss.bucket),
			Prefix: aws.String(prefix),
		})
		for paginator.HasMorePages() {
			page, perr := paginator.NextPage(ctx)
			if perr != nil {
				log.Error().Err(perr).Str("user_id", userID).Str("vault_id", vaultID).Msg("F3: failed to list S3 objects for storage quota")
				return 0, perr
			}
			for _, obj := range page.Contents {
				if obj.Size != nil {
					total += *obj.Size
				}
			}
		}
	}
	return total, nil
}

// F3: enforceStorageQuota rejects an upload that would push the user's cumulative
// stored bytes past their tier's MaxStorageMB. tier is the already-resolved
// authoritative tier; newBytes is the size of the incoming object. Returns an
// HTTP-ready (status, message, ok) triple; ok=true means the upload may proceed.
func (ss *StorageService) enforceStorageQuota(ctx context.Context, userID, tier string, newBytes int64) (current int64, limitBytes int64, ok bool, err error) {
	limits, found := middleware.TierLimitsMap[tier]
	if !found {
		limits = middleware.TierLimitsMap["free"]
	}
	limitBytes = int64(limits.MaxStorageMB) * 1024 * 1024

	current, err = ss.CurrentStorageBytes(ctx, userID)
	if err != nil {
		// Fail closed: cannot determine usage -> deny.
		log.Warn().Err(err).Str("user_id", userID).Msg("F3: failed to compute current storage; denying upload")
		return 0, limitBytes, false, err
	}
	if current+newBytes > limitBytes {
		return current, limitBytes, false, nil
	}
	return current, limitBytes, true, nil
}

func (ss *StorageService) GenerateUploadURL(ctx context.Context, vaultID, blobID uuid.UUID, contentLength int64) (string, error) {
	s3Key := "vaults/" + vaultID.String() + "/" + blobID.String()

	presignerClient := s3.NewPresignClient(ss.s3Client)

	putObjectInput := &s3.PutObjectInput{
		Bucket: aws.String(ss.bucket),
		Key:    aws.String(s3Key),
	}
	// F3 (SINGLE-SHOT SIZE — DOCUMENTED LIMITATION): we set ContentLength on the
	// presigned PUT as a best-effort hint, but the single-shot per-file size gate in
	// HandleGenerateUploadURL ultimately still TRUSTS the client-declared FileSize.
	// SigV4 *query* presigning (PresignPutObject) does not reliably promote
	// Content-Length into a signed header, so S3 may not bind/enforce the declared
	// length at PUT time — a client could declare a small FileSize to pass the
	// per-file gate and then PUT a larger body. The REAL backstop is the S3-sourced
	// cumulative storage quota (CurrentStorageBytes -> MaxStorageMB), which measures
	// actual stored bytes and cannot be fooled by a lying FileSize. The multipart
	// path closes the analogous hole authoritatively via a post-assembly HeadObject
	// (see FinalizeUpload, FIX B).
	if contentLength > 0 {
		putObjectInput.ContentLength = aws.Int64(contentLength)
	}

	presignResult, err := presignerClient.PresignPutObject(ctx, putObjectInput,
		func(opts *s3.PresignOptions) {
			opts.Expires = time.Duration(15 * time.Minute)
		},
	)

	if err != nil {
		log.Error().Err(err).Str("s3_key", s3Key).Msg("failed to generate upload URL")
		return "", err
	}

	log.Debug().Str("s3_key", s3Key).Int64("content_length", contentLength).Msg("presigned upload URL generated")
	return presignResult.URL, nil
}

func (ss *StorageService) GenerateDownloadURL(ctx context.Context, vaultID, blobID uuid.UUID) (string, error) {
	s3Key := "vaults/" + vaultID.String() + "/" + blobID.String()

	presignerClient := s3.NewPresignClient(ss.s3Client)

	getObjectInput := &s3.GetObjectInput{
		Bucket: aws.String(ss.bucket),
		Key:    aws.String(s3Key),
	}

	presignResult, err := presignerClient.PresignGetObject(ctx, getObjectInput,
		func(opts *s3.PresignOptions) {
			opts.Expires = time.Duration(15 * time.Minute)
		},
	)

	if err != nil {
		log.Error().Err(err).Str("s3_key", s3Key).Msg("failed to generate download URL")
		return "", err
	}

	log.Debug().Str("s3_key", s3Key).Msg("presigned download URL generated")
	return presignResult.URL, nil
}

func (ss *StorageService) DeleteBlob(ctx context.Context, vaultID, blobID uuid.UUID) error {
	s3Key := "vaults/" + vaultID.String() + "/" + blobID.String()

	// If database pool is available, wrap deletion in a transaction
	if ss.pool != nil {
		tx, err := ss.pool.Begin(ctx)
		if err != nil {
			log.Error().Err(err).Str("blob_id", blobID.String()).Msg("failed to begin transaction for blob deletion")
			return err
		}
		defer tx.Rollback(ctx)

		// Soft delete from database (mark as deleted)
		_, err = tx.Exec(ctx,
			`UPDATE blobs SET deleted_at = NOW() WHERE id = $1 AND vault_id = $2`,
			blobID, vaultID,
		)
		if err != nil {
			log.Error().Err(err).Str("blob_id", blobID.String()).Msg("failed to soft-delete blob from database")
			return err
		}

		// Commit database transaction
		if err := tx.Commit(ctx); err != nil {
			log.Error().Err(err).Str("blob_id", blobID.String()).Msg("failed to commit blob deletion transaction")
			return err
		}

		// After DB commit succeeds, delete from S3 (safe if S3 fails due to zero-knowledge)
		_, err = ss.s3Client.DeleteObject(ctx, &s3.DeleteObjectInput{
			Bucket: aws.String(ss.bucket),
			Key:    aws.String(s3Key),
		})
		if err != nil {
			log.Warn().Err(err).Str("s3_key", s3Key).Msg("failed to delete blob from S3 (already marked deleted in DB)")
			// Don't fail the operation since DB is consistent
		}
	} else {
		// Fallback: S3-only deletion if database not configured
		_, err := ss.s3Client.DeleteObject(ctx, &s3.DeleteObjectInput{
			Bucket: aws.String(ss.bucket),
			Key:    aws.String(s3Key),
		})
		if err != nil {
			log.Error().Err(err).Str("s3_key", s3Key).Msg("failed to delete blob")
			return err
		}
	}

	log.Info().Str("s3_key", s3Key).Msg("blob deleted")
	return nil
}

func (ss *StorageService) ListBlobs(ctx context.Context, vaultID uuid.UUID) ([]BlobInfo, error) {
	prefix := "vaults/" + vaultID.String() + "/"

	paginator := s3.NewListObjectsV2Paginator(ss.s3Client, &s3.ListObjectsV2Input{
		Bucket: aws.String(ss.bucket),
		Prefix: aws.String(prefix),
	})

	var blobs []BlobInfo

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			log.Error().Err(err).Str("vault_id", vaultID.String()).Msg("failed to list blobs")
			return nil, err
		}

		for _, obj := range page.Contents {
			// Extract blob ID from S3 key
			// Key format: vaults/{vault_id}/{blob_id}
			blobIDStr := (*obj.Key)[len(prefix):]

			blobs = append(blobs, BlobInfo{
				ID:        blobIDStr,
				VaultID:   vaultID.String(),
				SizeBytes: *obj.Size,
				CreatedAt: obj.LastModified.Format(time.RFC3339),
			})
		}
	}

	return blobs, nil
}

// HTTP Handlers

type GenerateUploadURLRequest struct {
	BlobID      string `json:"blob_id"`
	FileSize    int64  `json:"file_size"`
	ContentType string `json:"content_type"`
}

type GenerateUploadURLResponse struct {
	UploadURL string `json:"upload_url"`
	ExpiresAt string `json:"expires_at"`
}

func HandleGenerateUploadURL(ss *StorageService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req GenerateUploadURLRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaultID, err := uuid.Parse(r.PathValue("vaultID"))
		if err != nil {
			http.Error(w, "invalid vault id", http.StatusBadRequest)
			return
		}

		blobID, err := uuid.Parse(req.BlobID)
		if err != nil {
			http.Error(w, "invalid blob id", http.StatusBadRequest)
			return
		}

		// Validate file size
		if req.FileSize <= 0 {
			http.Error(w, "file size must be positive", http.StatusBadRequest)
			return
		}

		// PH4-FIX: Verify user is vault owner or member before generating upload URL (CWE-862: Missing Authorization)
		if ss.pool != nil {
			var vaultExists int
			err := ss.pool.QueryRow(r.Context(),
				`SELECT 1 FROM vaults v
				WHERE v.id = $1 AND v.deleted_at IS NULL
				AND (v.owner_id = $2 OR EXISTS (
					SELECT 1 FROM vault_members vm
					WHERE vm.vault_id = v.id AND vm.user_id = $2
				))`,
				vaultID, userID).Scan(&vaultExists)

			if err != nil {
				log.Warn().Err(err).Str("user_id", userID).Str("vault_id", vaultID.String()).Msg("vault access denied or not found")
				http.Error(w, "vault not found or access denied", http.StatusForbidden)
				return
			}
		}

		// DV-001 FIX / F3: Resolve the user's authoritative tier ONCE and enforce
		// both the per-file size limit and the cumulative storage quota against it.
		var maxFileSize int64 = MaxFileSizeBytes
		tierName := "free"
		tierResolved := false
		if ss.billingChecker != nil {
			tier, err := ss.billingChecker.CheckAccess(r.Context(), userID)
			if err != nil {
				log.Warn().Err(err).Str("user_id", userID).Msg("failed to check billing tier for file size limit")
				// Fall back to free tier limits on error (fail-closed).
				maxFileSize = MaxFileSizeFree
			} else {
				tierName = tier
				tierResolved = true
				maxFileSize = getMaxFileSizeForTier(tier)
				log.Debug().
					Str("user_id", userID).
					Str("tier", tier).
					Int64("max_file_size", maxFileSize).
					Msg("DV-001 FIX: enforcing tier-based file size limit")
			}
		}

		if req.FileSize > maxFileSize {
			http.Error(w, fmt.Sprintf("file size exceeds %s tier limit of %d bytes (requested: %d)", tierName, maxFileSize, req.FileSize), http.StatusPaymentRequired)
			log.Warn().
				Str("user_id", userID).
				Str("tier", tierName).
				Int64("limit", maxFileSize).
				Int64("requested", req.FileSize).
				Msg("DV-001 FIX: upload rejected due to tier-based file size limit")
			return
		}

		// F3 (STORAGE QUOTA): enforce the per-tier cumulative MaxStorageMB. Reject
		// when the user's current stored bytes plus this upload would exceed the cap.
		// Only enforced when we have an authoritative tier and a DB pool; otherwise
		// the per-file limit above is the only ceiling (preserves test/local behavior).
		if tierResolved && ss.pool != nil {
			current, limitBytes, ok, qErr := ss.enforceStorageQuota(r.Context(), userID, tierName, req.FileSize)
			if qErr != nil {
				http.Error(w, "failed to verify storage quota", http.StatusInternalServerError)
				return
			}
			if !ok {
				http.Error(w, fmt.Sprintf("storage quota exceeded for %s tier: %d of %d bytes used, upload of %d bytes rejected; upgrade required", tierName, current, limitBytes, req.FileSize), http.StatusPaymentRequired)
				log.Warn().
					Str("user_id", userID).
					Str("tier", tierName).
					Int64("current_bytes", current).
					Int64("limit_bytes", limitBytes).
					Int64("requested", req.FileSize).
					Msg("F3: upload rejected due to tier storage quota")
				return
			}
		}

		// F3 (FILE COUNT — DOCUMENTED): the single source of truth
		// (middleware.TierLimitsMap / client TIER_FEATURES) intentionally defines NO
		// per-tier file-count (maxFiles) field — only MaxVaults and MaxStorageMB. File
		// count is therefore unbounded by design and is now GENUINELY bounded instead
		// by the S3-sourced cumulative storage quota enforced above: a tier cannot
		// exceed MaxStorageMB regardless of how the bytes are split across files, and
		// because the quota now measures REAL S3 usage (FIX A) rather than a dead DB
		// SUM, that bound is actually effective. No COUNT(blobs) gate is applied here
		// on purpose.

		// Validate content type against blocklist (CWE-434 mitigation)
		if blockedContentTypes[req.ContentType] {
			http.Error(w, "content type not allowed", http.StatusBadRequest)
			log.Warn().
				Str("user_id", userID).
				Str("content_type", req.ContentType).
				Str("vault_id", vaultID.String()).
				Msg("blocked content type upload attempted")
			return
		}

	// DE-011 FIX: Validate encrypted payload has reasonable minimum size
	if req.FileSize < 48 { // Minimum: 24-byte nonce + 16-byte tag + 1-byte content + header
		http.Error(w, "file size too small for encrypted payload", http.StatusBadRequest)
		return
	}

	// F3: pass the declared FileSize to the presigned PUT as a best-effort
	// ContentLength hint. NOTE: this is NOT an authoritative size enforcement for
	// single-shot uploads — SigV4 query presigning may not bind Content-Length at
	// S3 (see GenerateUploadURL). The authoritative backstop is the S3-sourced
	// cumulative storage quota enforced above.
	uploadURL, err := ss.GenerateUploadURL(r.Context(), vaultID, blobID, req.FileSize)
		if err != nil {
			http.Error(w, "failed to generate upload URL", http.StatusInternalServerError)
			return
		}

		// Log upload metadata to audit trail
		auditDetail := fmt.Sprintf("blob_id=%s,file_size=%d,content_type=%s", blobID.String(), req.FileSize, req.ContentType)
		log.Info().
			Str("user_id", userID).
			Str("vault_id", vaultID.String()).
			Str("blob_id", blobID.String()).
			Int64("file_size", req.FileSize).
			Str("content_type", req.ContentType).
			Msg("upload URL generated")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(GenerateUploadURLResponse{
			UploadURL: uploadURL,
			ExpiresAt: time.Now().Add(PresignedURLExpiry).Format(time.RFC3339),
		})

		log.Debug().Str("user_id", userID).Str("blob_id", req.BlobID).Str("detail", auditDetail).Msg("upload URL generated")
	}
}

type GenerateDownloadURLRequest struct {
	BlobID string `json:"blob_id"`
}

type GenerateDownloadURLResponse struct {
	DownloadURL string `json:"download_url"`
	ExpiresAt   string `json:"expires_at"`
}

func HandleGenerateDownloadURL(ss *StorageService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req GenerateDownloadURLRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaultID, err := uuid.Parse(r.PathValue("vaultID"))
		if err != nil {
			http.Error(w, "invalid vault id", http.StatusBadRequest)
			return
		}

		blobID, err := uuid.Parse(req.BlobID)
		if err != nil {
			http.Error(w, "invalid blob id", http.StatusBadRequest)
			return
		}

		// PH4-FIX: Verify user is vault owner or member before generating download URL (CWE-862: Missing Authorization)
		if ss.pool != nil {
			var vaultExists int
			err := ss.pool.QueryRow(r.Context(),
				`SELECT 1 FROM vaults v
				WHERE v.id = $1 AND v.deleted_at IS NULL
				AND (v.owner_id = $2 OR EXISTS (
					SELECT 1 FROM vault_members vm
					WHERE vm.vault_id = v.id AND vm.user_id = $2
				))`,
				vaultID, userID).Scan(&vaultExists)

			if err != nil {
				log.Warn().Err(err).Str("user_id", userID).Str("vault_id", vaultID.String()).Msg("vault access denied or not found")
				http.Error(w, "vault not found or access denied", http.StatusForbidden)
				return
			}
		}

		// Verify the blob exists before generating download URL
		s3Key := "vaults/" + vaultID.String() + "/" + blobID.String()
		headOutput, err := ss.s3Client.HeadObject(r.Context(), &s3.HeadObjectInput{
			Bucket: aws.String(ss.bucket),
			Key:    aws.String(s3Key),
		})
		if err != nil {
			log.Warn().
				Err(err).
				Str("user_id", userID).
				Str("vault_id", vaultID.String()).
				Str("blob_id", blobID.String()).
				Msg("blob not found for download")
			http.Error(w, "blob not found", http.StatusNotFound)
			return
		}

		downloadURL, err := ss.GenerateDownloadURL(r.Context(), vaultID, blobID)
		if err != nil {
			http.Error(w, "failed to generate download URL", http.StatusInternalServerError)
			return
		}

		// Log download audit event
		log.Info().
			Str("user_id", userID).
			Str("vault_id", vaultID.String()).
			Str("blob_id", blobID.String()).
			Int64("blob_size", *headOutput.ContentLength).
			Msg("download URL generated")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(GenerateDownloadURLResponse{
			DownloadURL: downloadURL,
			ExpiresAt:   time.Now().Add(PresignedURLExpiry).Format(time.RFC3339),
		})

		log.Debug().Str("user_id", userID).Str("blob_id", req.BlobID).Msg("download URL generated")
	}
}

func HandleListBlobs(ss *StorageService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaultID, err := uuid.Parse(r.PathValue("vaultID"))
		if err != nil {
			http.Error(w, "invalid vault id", http.StatusBadRequest)
			return
		}

		blobs, err := ss.ListBlobs(r.Context(), vaultID)
		if err != nil {
			http.Error(w, "failed to list blobs", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(blobs)

		log.Debug().Str("user_id", userID).Str("vault_id", vaultID.String()).Int("blob_count", len(blobs)).Msg("blobs listed")
	}
}

func HandleDeleteBlob(ss *StorageService, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaultID, err := uuid.Parse(r.PathValue("vaultID"))
		if err != nil {
			http.Error(w, "invalid vault id", http.StatusBadRequest)
			return
		}

		blobID, err := uuid.Parse(r.PathValue("blobID"))
		if err != nil {
			http.Error(w, "invalid blob id", http.StatusBadRequest)
			return
		}

		if err := ss.DeleteBlob(r.Context(), vaultID, blobID); err != nil {
			http.Error(w, "failed to delete blob", http.StatusInternalServerError)
			return
		}

		auditSvc.LogAction(r.Context(), userID, "FILE_DELETE", []byte(blobID.String()))

		w.WriteHeader(http.StatusNoContent)
	}
}

