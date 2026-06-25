package storage

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
)

// PH2-FIX: HTTP handlers for multipart upload API

// HandleInitiateMultipart starts a new multipart upload
func HandleInitiateMultipart(ms *MultipartService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaultID := chi.URLParam(r, "vaultID")
		fileID := chi.URLParam(r, "fileID")

		var req struct {
			TotalSize int64 `json:"total_size"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if req.TotalSize <= 0 {
			http.Error(w, "total_size must be positive", http.StatusBadRequest)
			return
		}

		upload, err := ms.InitiateUpload(r.Context(), userID, vaultID, fileID, req.TotalSize)
		if err != nil {
			// F3: tier file-size limit reached -> 402 Payment Required, matching the
			// single-shot upload path (HandleGenerateUploadURL).
			if errors.Is(err, ErrFileSizeExceedsTier) {
				http.Error(w, "file size exceeds your subscription tier limit; upgrade required", http.StatusPaymentRequired)
				log.Warn().Str("user_id", userID).Str("file_id", fileID).Int64("total_size", req.TotalSize).
					Msg("F3: multipart initiate rejected due to tier file-size limit")
				return
			}
			log.Error().Err(err).Msg("failed to initiate multipart upload")
			http.Error(w, "failed to initiate upload", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"upload_id":   upload.UploadID,
			"part_size":   upload.PartSize,
			"total_parts": upload.TotalParts,
			"expires_at":  upload.ExpiresAt,
		})

		log.Info().
			Str("upload_id", upload.UploadID).
			Str("user_id", userID).
			Str("file_id", fileID).
			Msg("PH2-FIX: multipart upload initiated via HTTP")
	}
}

// HandleGetPartURL generates a presigned URL for uploading a part
func HandleGetPartURL(ms *MultipartService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaultID := chi.URLParam(r, "vaultID")
		uploadID := chi.URLParam(r, "uploadID")
		partNumberStr := chi.URLParam(r, "partNumber")

		partNumber, err := strconv.Atoi(partNumberStr)
		if err != nil || partNumber < 1 || partNumber > MaxParts {
			http.Error(w, "invalid part number", http.StatusBadRequest)
			return
		}

		url, err := ms.GeneratePresignedPartURL(r.Context(), userID, vaultID, uploadID, partNumber)
		if err != nil {
			log.Warn().Err(err).Str("upload_id", uploadID).Str("user_id", userID).Msg("failed to generate presigned part URL")
			http.Error(w, "upload not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"presigned_url": url,
			"upload_id":     uploadID,
		})

		log.Debug().
			Str("upload_id", uploadID).
			Str("user_id", userID).
			Int("part_number", partNumber).
			Msg("PH2-FIX: presigned part URL generated")
	}
}

// HandleCompletePart records a completed part upload
func HandleCompletePart(ms *MultipartService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaultID := chi.URLParam(r, "vaultID")
		uploadID := chi.URLParam(r, "uploadID")

		var req struct {
			PartNumber int    `json:"part_number"`
			ETag       string `json:"etag"`
			Size       int64  `json:"size"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		if req.PartNumber < 1 || req.PartNumber > MaxParts {
			http.Error(w, "invalid part number", http.StatusBadRequest)
			return
		}

		if req.ETag == "" {
			http.Error(w, "etag is required", http.StatusBadRequest)
			return
		}

		if req.Size <= 0 {
			http.Error(w, "size must be positive", http.StatusBadRequest)
			return
		}

		if err := ms.CompletePart(r.Context(), userID, vaultID, uploadID, req.PartNumber, req.ETag, req.Size); err != nil {
			log.Warn().Err(err).Str("upload_id", uploadID).Str("user_id", userID).Msg("failed to record part completion")
			http.Error(w, "upload not found or part invalid", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "part_recorded"})

		log.Debug().
			Str("upload_id", uploadID).
			Str("user_id", userID).
			Int("part_number", req.PartNumber).
			Msg("PH2-FIX: part completion recorded")
	}
}

// HandleFinalizeUpload completes a multipart upload
func HandleFinalizeUpload(ms *MultipartService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaultID := chi.URLParam(r, "vaultID")
		uploadID := chi.URLParam(r, "uploadID")

		if err := ms.FinalizeUpload(r.Context(), userID, vaultID, uploadID); err != nil {
			// F3 (FIX B): the assembled object's REAL size (HeadObject) exceeded the
			// per-tier file-size limit or the S3-sourced cumulative storage quota -> 402.
			// The just-assembled object has already been deleted server-side.
			if errors.Is(err, ErrFileSizeExceedsTier) {
				http.Error(w, "uploaded size exceeds your subscription tier limit; upgrade required", http.StatusPaymentRequired)
				log.Warn().Str("user_id", userID).Str("upload_id", uploadID).
					Msg("F3: multipart finalize rejected due to tier file-size limit")
				return
			}
			log.Error().Err(err).Str("upload_id", uploadID).Str("user_id", userID).Msg("failed to finalize multipart upload")
			http.Error(w, "failed to finalize upload", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "completed"})

		log.Info().
			Str("upload_id", uploadID).
			Str("user_id", userID).
			Msg("PH2-FIX: multipart upload finalized")
	}
}

// HandleAbortUpload cancels a multipart upload
func HandleAbortUpload(ms *MultipartService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaultID := chi.URLParam(r, "vaultID")
		uploadID := chi.URLParam(r, "uploadID")

		if err := ms.AbortUpload(r.Context(), userID, vaultID, uploadID); err != nil {
			log.Warn().Err(err).Str("upload_id", uploadID).Str("user_id", userID).Msg("failed to abort multipart upload")
			http.Error(w, "upload not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "aborted"})

		log.Info().
			Str("upload_id", uploadID).
			Str("user_id", userID).
			Msg("PH2-FIX: multipart upload aborted")
	}
}

// HandleGetProgress returns upload progress
func HandleGetProgress(ms *MultipartService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaultID := chi.URLParam(r, "vaultID")
		uploadID := chi.URLParam(r, "uploadID")

		upload, err := ms.GetUploadProgress(userID, vaultID, uploadID)
		if err != nil {
			log.Warn().Err(err).Str("upload_id", uploadID).Str("user_id", userID).Msg("upload not found for progress check")
			http.Error(w, "upload not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		progressPct := 0.0
		if upload.TotalParts > 0 {
			progressPct = float64(len(upload.CompleteParts)) / float64(upload.TotalParts) * 100
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"upload_id":       upload.UploadID,
			"status":          upload.Status,
			"total_parts":     upload.TotalParts,
			"completed_parts": len(upload.CompleteParts),
			"total_size":      upload.TotalSize,
			"progress_pct":    progressPct,
			"expires_at":      upload.ExpiresAt,
		})

		log.Debug().
			Str("upload_id", uploadID).
			Str("user_id", userID).
			Float64("progress_pct", progressPct).
			Msg("PH2-FIX: upload progress queried")
	}
}
