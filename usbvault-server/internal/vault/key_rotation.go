package vault

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// SD-013 FIX: Key rotation status constants
const (
	KeyRotationStatusPending    = "pending"
	KeyRotationStatusInProgress = "in_progress"
	KeyRotationStatusCompleted  = "completed"
	KeyRotationStatusFailed     = "failed"
	KeyRotationStatusRolledBack = "rolled_back"
)

// KeyRotationJob tracks the state of a key rotation operation
type KeyRotationJob struct {
	ID              string    `json:"id"`
	VaultID         string    `json:"vault_id"`
	UserID          string    `json:"user_id"`
	Status          string    `json:"status"`
	TotalFiles      int       `json:"total_files"`
	ProcessedFiles  int       `json:"processed_files"`
	FailedFiles     int       `json:"failed_files"`
	StartedAt       time.Time `json:"started_at"`
	CompletedAt     *time.Time `json:"completed_at,omitempty"`
	ErrorMessage    string    `json:"error_message,omitempty"`
}

// KeyRotationService manages encryption key rotation for vaults
type KeyRotationService struct {
	pool     *pgxpool.Pool
	auditSvc interface {
		LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
	}
}

// NewKeyRotationService creates a new key rotation service
func NewKeyRotationService(pool *pgxpool.Pool, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) *KeyRotationService {
	return &KeyRotationService{
		pool:     pool,
		auditSvc: auditSvc,
	}
}

// InitiateKeyRotation starts a key rotation job for a vault.
// The actual re-encryption is performed client-side (zero-knowledge architecture),
// so this endpoint tracks progress and coordinates the rotation workflow.
//
// Workflow:
// 1. Server creates a rotation job and marks vault as "rotating"
// 2. Client downloads each file's metadata, re-wraps file keys with new master key
// 3. Client uploads re-wrapped keys and reports progress
// 4. Server finalizes rotation when all files are processed
func (krs *KeyRotationService) InitiateKeyRotation(ctx context.Context, userID, vaultID string) (*KeyRotationJob, error) {
	// SQ-005 FIX: Wrap entire operation in transaction with FOR UPDATE lock on vault
	tx, err := krs.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Verify user owns the vault with FOR UPDATE lock
	var ownerID string
	err = tx.QueryRow(ctx,
		`SELECT owner_id FROM vaults WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
		vaultID,
	).Scan(&ownerID)

	if err != nil {
		return nil, fmt.Errorf("vault not found: %w", err)
	}

	if ownerID != userID {
		return nil, fmt.Errorf("unauthorized: only vault owner can rotate keys")
	}

	// Check for existing in-progress rotation
	var existingJobID string
	err = tx.QueryRow(ctx,
		`SELECT id FROM key_rotation_jobs WHERE vault_id = $1 AND status IN ($2, $3)`,
		vaultID, KeyRotationStatusPending, KeyRotationStatusInProgress,
	).Scan(&existingJobID)

	if err == nil {
		return nil, fmt.Errorf("key rotation already in progress (job %s)", existingJobID)
	}

	// Count files that need re-encryption
	var totalFiles int
	err = tx.QueryRow(ctx,
		`SELECT COUNT(*) FROM blobs WHERE vault_id = $1 AND deleted_at IS NULL`,
		vaultID,
	).Scan(&totalFiles)

	if err != nil {
		return nil, fmt.Errorf("failed to count vault files: %w", err)
	}

	// Create rotation job
	job := &KeyRotationJob{
		VaultID:    vaultID,
		UserID:     userID,
		Status:     KeyRotationStatusPending,
		TotalFiles: totalFiles,
		StartedAt:  time.Now().UTC(),
	}

	err = tx.QueryRow(ctx,
		`INSERT INTO key_rotation_jobs (vault_id, user_id, status, total_files, started_at)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		job.VaultID, job.UserID, job.Status, job.TotalFiles, job.StartedAt,
	).Scan(&job.ID)

	if err != nil {
		return nil, fmt.Errorf("failed to create rotation job: %w", err)
	}

	// Mark vault as rotating to prevent concurrent modifications
	if _, err := tx.Exec(ctx,
		`UPDATE vaults SET rotation_status = 'rotating', updated_at = NOW() WHERE id = $1`,
		vaultID,
	); err != nil {
		log.Error().Err(err).Str("vault_id", vaultID).Msg("SQ-001 FIX: failed to mark vault as rotating")
		return nil, fmt.Errorf("failed to mark vault as rotating: %w", err)
	}

	// SQ-005 FIX: Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	krs.auditSvc.LogAction(ctx, userID, "KEY_ROTATION_INITIATED", []byte(fmt.Sprintf("vault=%s,files=%d", vaultID, totalFiles)))
	log.Info().Str("vault_id", vaultID).Str("user_id", userID).Int("total_files", totalFiles).Str("job_id", job.ID).Msg("SD-013 FIX: key rotation initiated")

	return job, nil
}

// UpdateRotationProgress updates the progress of a key rotation job
func (krs *KeyRotationService) UpdateRotationProgress(ctx context.Context, jobID string, processedFiles, failedFiles int) error {
	status := KeyRotationStatusInProgress
	if processedFiles+failedFiles >= 0 {
		// Check total to determine completion
		var totalFiles int
		err := krs.pool.QueryRow(ctx,
			`SELECT total_files FROM key_rotation_jobs WHERE id = $1`,
			jobID,
		).Scan(&totalFiles)

		if err != nil {
			return fmt.Errorf("rotation job not found: %w", err)
		}

		if processedFiles+failedFiles >= totalFiles {
			if failedFiles > 0 {
				status = KeyRotationStatusFailed
			} else {
				status = KeyRotationStatusCompleted
			}
		}
	}

	_, err := krs.pool.Exec(ctx,
		`UPDATE key_rotation_jobs SET processed_files = $1, failed_files = $2, status = $3,
		 completed_at = CASE WHEN $3 IN ('completed', 'failed') THEN NOW() ELSE NULL END
		 WHERE id = $4`,
		processedFiles, failedFiles, status, jobID,
	)

	if err != nil {
		return fmt.Errorf("failed to update rotation progress: %w", err)
	}

	// If completed or failed, update vault rotation_status
	if status == KeyRotationStatusCompleted || status == KeyRotationStatusFailed {
		var vaultID string
		err = krs.pool.QueryRow(ctx,
			`SELECT vault_id FROM key_rotation_jobs WHERE id = $1`, jobID,
		).Scan(&vaultID)

		if err == nil {
			newVaultStatus := "active"
			if status == KeyRotationStatusFailed {
				newVaultStatus = "rotation_failed"
			}
			if _, err := krs.pool.Exec(ctx,
				`UPDATE vaults SET rotation_status = $1, updated_at = NOW() WHERE id = $2`,
				newVaultStatus, vaultID,
			); err != nil {
				log.Error().Err(err).Str("vault_id", vaultID).Str("status", newVaultStatus).Msg("SQ-001 FIX: failed to update vault rotation status")
			}
		}
	}

	return nil
}

// GetRotationStatus returns the current status of a key rotation job
func (krs *KeyRotationService) GetRotationStatus(ctx context.Context, jobID, userID string) (*KeyRotationJob, error) {
	var job KeyRotationJob
	err := krs.pool.QueryRow(ctx,
		`SELECT id, vault_id, user_id, status, total_files, processed_files, failed_files, started_at, completed_at, COALESCE(error_message, '')
		 FROM key_rotation_jobs WHERE id = $1 AND user_id = $2`,
		jobID, userID,
	).Scan(&job.ID, &job.VaultID, &job.UserID, &job.Status, &job.TotalFiles,
		&job.ProcessedFiles, &job.FailedFiles, &job.StartedAt, &job.CompletedAt, &job.ErrorMessage)

	if err != nil {
		return nil, fmt.Errorf("rotation job not found: %w", err)
	}

	return &job, nil
}

// HandleInitiateKeyRotation is the HTTP handler to start key rotation
func HandleInitiateKeyRotation(krs *KeyRotationService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var req struct {
			VaultID string `json:"vault_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		if req.VaultID == "" {
			http.Error(w, "vault_id required", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		job, err := krs.InitiateKeyRotation(ctx, userID, req.VaultID)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Str("vault_id", req.VaultID).Msg("key rotation initiation failed")
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(job)
	}
}

// HandleGetRotationStatus is the HTTP handler to check rotation progress
func HandleGetRotationStatus(krs *KeyRotationService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		jobID := r.URL.Query().Get("job_id")
		if jobID == "" {
			http.Error(w, "job_id required", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		job, err := krs.GetRotationStatus(ctx, jobID, userID)
		if err != nil {
			http.Error(w, "rotation job not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(job)
	}
}
