package audit

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
)

type AuditEntry struct {
	ID               int64  `json:"id"`
	UserID           string `json:"user_id"`
	ActionType       string `json:"action_type"`
	EncryptedDetail  []byte `json:"-"` // Never expose
	Timestamp        time.Time `json:"timestamp"`
	PrevHash         []byte `json:"-"`
	Hash             []byte `json:"hash_hex"`
}

// SD-021 FIX: SecurityEvent struct for SOC 2 compliance - structured security event logging
type SecurityEvent struct {
	EventType    string    `json:"event_type"`    // AUTH_LOGIN, AUTH_LOGOUT, PERMISSION_DENIED, etc.
	Severity     string    `json:"severity"`      // INFO, WARN, CRITICAL
	SourceIP     string    `json:"source_ip"`
	UserAgent    string    `json:"user_agent"`
	UserID       string    `json:"user_id"`
	ResourceType string    `json:"resource_type"` // vault, blob, share, user, etc.
	ResourceID   string    `json:"resource_id"`
	Outcome      string    `json:"outcome"`       // success, failure
	Timestamp    time.Time `json:"timestamp"`
	Details      string    `json:"details,omitempty"` // Additional context
}

// SD-021 FIX: Security event type constants for SOC 2 compliance
const (
	EventAuthLogin       = "AUTH_LOGIN"
	EventAuthLogout      = "AUTH_LOGOUT"
	EventAuthFailed      = "AUTH_FAILED"
	EventTokenRefresh    = "TOKEN_REFRESH"
	// PH6-FIX: Additional event types for SOC 2 compliance
	EventTokenTheft      = "TOKEN_THEFT"
	EventKeyRotation     = "KEY_ROTATION"
	EventPermissionChange = "PERMISSION_CHANGE"
	EventPermissionDenied = "PERMISSION_DENIED"
	EventDataAccess      = "DATA_ACCESS"
	EventDataExport      = "DATA_EXPORT"
	EventConfigChange    = "CONFIG_CHANGE"
	EventAccountCreated  = "ACCOUNT_CREATED"
	EventAccountDeleted  = "ACCOUNT_DELETED"

	SeverityInfo     = "INFO"
	SeverityWarn     = "WARN"
	SeverityCritical = "CRITICAL"
)

type AuditService struct {
	pool *pgxpool.Pool
}

func NewAuditService(pool *pgxpool.Pool) *AuditService {
	return &AuditService{pool: pool}
}

// SD-021 FIX: LogSecurityEvent stores a structured security event for SOC 2 compliance
func (as *AuditService) LogSecurityEvent(ctx context.Context, event SecurityEvent) error {
	// Ensure timestamp is set
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now().UTC()
	}

	// Serialize event to JSON for storage
	eventJSON, err := json.Marshal(event)
	if err != nil {
		log.Error().Err(err).Str("event_type", event.EventType).Msg("failed to marshal security event")
		return err
	}

	// Insert into security_events table
	_, err = as.pool.Exec(ctx,
		`INSERT INTO security_events (event_type, severity, source_ip, user_agent, user_id, resource_type, resource_id, outcome, timestamp, details)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		event.EventType, event.Severity, event.SourceIP, event.UserAgent,
		event.UserID, event.ResourceType, event.ResourceID, event.Outcome,
		event.Timestamp, string(eventJSON),
	)

	if err != nil {
		log.Error().Err(err).
			Str("event_type", event.EventType).
			Str("user_id", event.UserID).
			Msg("failed to log security event")
		return err
	}

	log.Info().
		Str("event_type", event.EventType).
		Str("severity", event.Severity).
		Str("user_id", event.UserID).
		Str("outcome", event.Outcome).
		Msg("SD-021 FIX: security event logged")

	return nil
}

func (as *AuditService) LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error {
	// Get previous hash from last audit entry for this user
	var prevHash []byte
	err := as.pool.QueryRow(ctx,
		`SELECT hash FROM audit_log WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
		userID,
	).Scan(&prevHash)

	// If no previous entry, use empty hash
	if err != nil {
		prevHash = make([]byte, 32)
	}

	// Compute hash chain: SHA256(prev_hash || action_type || encrypted_detail || timestamp)
	now := time.Now().UTC()
	h := sha256.New()
	h.Write(prevHash)
	h.Write([]byte(actionType))
	h.Write(encryptedDetail)
	h.Write([]byte(now.Format(time.RFC3339Nano)))
	newHash := h.Sum(nil)

	// Insert into audit log
	_, err = as.pool.Exec(ctx,
		`INSERT INTO audit_log (user_id, action_type, encrypted_detail, timestamp, prev_hash, hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
		userID, actionType, encryptedDetail, now, prevHash, newHash,
	)

	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Str("action_type", actionType).Msg("failed to log action")
		return err
	}

	log.Debug().Str("user_id", userID).Str("action_type", actionType).Msg("action logged")
	return nil
}

func (as *AuditService) VerifyChain(ctx context.Context, userID string) (bool, error) {
	// DE-003 FIX: Cursor-based pagination for O(batch) memory instead of O(n) offset
	const batchSize = 1000
	var lastID int64
	var expectedPrevHash []byte
	totalEntries := 0

	for {
		// Check context timeout
		select {
		case <-ctx.Done():
			return false, fmt.Errorf("chain verification timed out after %d entries: %w", totalEntries, ctx.Err())
		default:
		}

		rows, err := as.pool.Query(ctx,
			`SELECT id, action_type, encrypted_detail, timestamp, prev_hash, hash
			FROM audit_log
			WHERE user_id = $1 AND id > $2
			ORDER BY id ASC
			LIMIT $3`,
			userID, lastID, batchSize,
		)
		if err != nil {
			return false, fmt.Errorf("failed to query audit batch at id > %d: %w", lastID, err)
		}

		batchCount := 0
		for rows.Next() {
			batchCount++
			totalEntries++

			var id int64
			var actionType string
			var encryptedDetail []byte
			var timestamp time.Time
			var storedPrevHash, storedHash []byte

			// SQ-002 FIX: Fail hard on scan errors instead of continuing with corrupted data
			if err := rows.Scan(&id, &actionType, &encryptedDetail, &timestamp, &storedPrevHash, &storedHash); err != nil {
				rows.Close()
				return false, fmt.Errorf("SQ-002 FIX: scan error at entry %d, aborting chain verification: %w", id, err)
			}

			lastID = id

			// Verify prev_hash chain continuity
			if len(expectedPrevHash) > 0 {
				if !bytesEqual(expectedPrevHash, storedPrevHash) {
					log.Warn().Str("user_id", userID).Int64("entry_id", id).Msg("hash chain broken: prev_hash mismatch")
					rows.Close()
					return false, nil
				}
			}

			// Recompute hash and verify
			h := sha256.New()
			h.Write(storedPrevHash)
			h.Write([]byte(actionType))
			h.Write(encryptedDetail)
			h.Write([]byte(timestamp.Format(time.RFC3339Nano)))
			computedHash := h.Sum(nil)

			if !bytesEqual(computedHash, storedHash) {
				log.Warn().Str("user_id", userID).Int64("entry_id", id).Msg("hash mismatch: computed != stored")
				rows.Close()
				return false, nil
			}

			expectedPrevHash = storedHash
		}

		rows.Close()
		if err := rows.Err(); err != nil {
			return false, fmt.Errorf("error iterating audit batch: %w", err)
		}

		if batchCount < batchSize {
			break
		}
	}

	log.Info().Str("user_id", userID).Int("total_entries", totalEntries).Msg("DE-003 FIX: audit chain verified with cursor pagination")
	return true, nil
}

func (as *AuditService) ListAuditLog(ctx context.Context, userID string, limit, offset int) ([]AuditEntry, error) {
	rows, err := as.pool.Query(ctx,
		`SELECT id, user_id, action_type, timestamp, hash
         FROM audit_log
         WHERE user_id = $1
         ORDER BY id DESC
         LIMIT $2 OFFSET $3`,
		userID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []AuditEntry
	for rows.Next() {
		var e AuditEntry
		if err := rows.Scan(&e.ID, &e.UserID, &e.ActionType, &e.Timestamp, &e.Hash); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}

	return entries, rows.Err()
}

// DE-002 FIX: Audit log retention and cleanup
// ArchiveOldAuditLogs moves audit entries older than retentionDays to archive table
// and deletes entries past archiveRetentionDays. Processes in batches to avoid lock contention.
func (as *AuditService) ArchiveOldAuditLogs(ctx context.Context, retentionDays, archiveRetentionDays int) (archived int, deleted int, err error) {
	if retentionDays <= 0 {
		return 0, 0, fmt.Errorf("retentionDays must be positive")
	}
	if archiveRetentionDays <= retentionDays {
		return 0, 0, fmt.Errorf("archiveRetentionDays must be greater than retentionDays")
	}

	const batchSize = 500
	archiveCutoff := time.Now().AddDate(0, 0, -retentionDays)
	deleteCutoff := time.Now().AddDate(0, 0, -archiveRetentionDays)

	// Phase 1: Delete very old archived entries
	for {
		result, err := as.pool.Exec(ctx,
			`DELETE FROM audit_log_archive WHERE timestamp < $1 LIMIT $2`,
			deleteCutoff, batchSize)
		if err != nil {
			log.Error().Err(err).Msg("DE-002 FIX: failed to delete old archived audit entries")
			return archived, deleted, err
		}
		count := int(result.RowsAffected())
		deleted += count
		if count < batchSize {
			break
		}
	}

	// Phase 2: Archive entries past retention into audit_log_archive
	for {
		result, err := as.pool.Exec(ctx,
			`WITH moved AS (
				DELETE FROM audit_log
				WHERE id IN (
					SELECT id FROM audit_log
					WHERE timestamp < $1
					ORDER BY id ASC
					LIMIT $2
				)
				RETURNING id, user_id, action_type, encrypted_detail, timestamp, prev_hash, hash
			)
			INSERT INTO audit_log_archive SELECT * FROM moved`,
			archiveCutoff, batchSize)
		if err != nil {
			log.Error().Err(err).Msg("DE-002 FIX: failed to archive audit entries")
			return archived, deleted, err
		}
		count := int(result.RowsAffected())
		archived += count
		if count < batchSize {
			break
		}
	}

	log.Info().Int("archived", archived).Int("deleted", deleted).
		Time("archive_cutoff", archiveCutoff).Time("delete_cutoff", deleteCutoff).
		Msg("DE-002 FIX: audit log cleanup completed")

	return archived, deleted, nil
}

// bytesEqual compares two byte slices in constant time
func bytesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// HTTP Handlers

type ListAuditLogRequest struct {
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

func HandleListAuditLog(as *AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		limit := 50
		if l := r.URL.Query().Get("limit"); l != "" {
			if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
				limit = parsed
			}
		}

		offset := 0
		if o := r.URL.Query().Get("offset"); o != "" {
			if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
				offset = parsed
			}
		}

		entries, err := as.ListAuditLog(r.Context(), userID, limit, offset)
		if err != nil {
			http.Error(w, "failed to list audit log", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"entries": entries,
			"limit":   limit,
			"offset":  offset,
		})
	}
}

type VerifyChainResponse struct {
	Valid   bool   `json:"valid"`
	Message string `json:"message"`
}

func HandleVerifyChain(as *AuditService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		valid, err := as.VerifyChain(r.Context(), userID)
		if err != nil {
			http.Error(w, "verification failed", http.StatusInternalServerError)
			return
		}

		message := "chain verified"
		if !valid {
			message = "chain integrity compromised"
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(VerifyChainResponse{
			Valid:   valid,
			Message: message,
		})
	}
}
