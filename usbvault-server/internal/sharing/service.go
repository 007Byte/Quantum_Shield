package sharing

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// Minimum sealed-box size: ephemeral_pk(32) + nonce(24) + min_ciphertext(1) + tag(16) = 73 bytes
const minSealedBoxSize = 73

// CR-006 FIX: Add maximum size validation to prevent abuse
const maxSealedBoxSize = 4096 // Maximum sealed box size (key + overhead should never exceed 4KB)

// LOW-FIX: Extracted magic number to named constant
const shareDefaultTTL = 30 * 24 * time.Hour // 30 days

type ShareRecord struct {
	ID           uuid.UUID `json:"id"`
	SenderID     uuid.UUID `json:"sender_id"`
	RecipientID  uuid.UUID `json:"recipient_id"`
	BlobID       uuid.UUID `json:"blob_id"`
	EncryptedKey []byte    `json:"-"` // Never expose plaintext
	CreatedAt    time.Time `json:"created_at"`
	ExpiresAt    *time.Time `json:"expires_at"`
}

// SharingService manages secure file sharing with encrypted key exchange.
type SharingService struct {
	pool *pgxpool.Pool
}

// NewSharingService creates a new sharing service for managing encrypted file shares.
func NewSharingService(pool *pgxpool.Pool) *SharingService {
	return &SharingService{pool: pool}
}

// CreateShare creates a new share record with a 30-day expiration by default.
func (ss *SharingService) CreateShare(ctx context.Context, senderID, recipientID, blobID uuid.UUID, encryptedKey []byte) (uuid.UUID, error) {
	shareID := uuid.New()
	expiresAt := time.Now().Add(shareDefaultTTL)

	err := ss.pool.QueryRow(ctx,
		`INSERT INTO share_records (id, sender_id, recipient_id, blob_id, encrypted_key, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6)
         RETURNING id`,
		shareID, senderID, recipientID, blobID, encryptedKey, expiresAt,
	).Scan(&shareID)

	if err != nil {
		log.Error().Err(err).Str("sender_id", senderID.String()).Msg("failed to create share")
		return uuid.Nil, err
	}

	log.Info().Str("share_id", shareID.String()).Str("sender_id", senderID.String()).Str("recipient_id", recipientID.String()).Msg("share created")
	return shareID, nil
}

// ListReceivedShares lists all shares received by a user that haven't expired.
func (ss *SharingService) ListReceivedShares(ctx context.Context, userID uuid.UUID) ([]ShareRecord, error) {
	rows, err := ss.pool.Query(ctx,
		`SELECT id, sender_id, recipient_id, blob_id, created_at, expires_at
         FROM share_records
         WHERE recipient_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var shares []ShareRecord
	for rows.Next() {
		var s ShareRecord
		if err := rows.Scan(&s.ID, &s.SenderID, &s.RecipientID, &s.BlobID, &s.CreatedAt, &s.ExpiresAt); err != nil {
			return nil, err
		}
		shares = append(shares, s)
	}

	return shares, rows.Err()
}

// ListSentShares lists all shares sent by a user.
func (ss *SharingService) ListSentShares(ctx context.Context, userID uuid.UUID) ([]ShareRecord, error) {
	rows, err := ss.pool.Query(ctx,
		`SELECT id, sender_id, recipient_id, blob_id, created_at, expires_at
         FROM share_records
         WHERE sender_id = $1
         ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var shares []ShareRecord
	for rows.Next() {
		var s ShareRecord
		if err := rows.Scan(&s.ID, &s.SenderID, &s.RecipientID, &s.BlobID, &s.CreatedAt, &s.ExpiresAt); err != nil {
			return nil, err
		}
		shares = append(shares, s)
	}

	return shares, rows.Err()
}

// RevokeShare revokes a share record (only the sender can revoke).
// Returns ErrShareNotFound if the share does not exist or sender is not the owner.
func (ss *SharingService) RevokeShare(ctx context.Context, senderID, shareID uuid.UUID) error {
	result, err := ss.pool.Exec(ctx,
		`DELETE FROM share_records WHERE id = $1 AND sender_id = $2`,
		shareID, senderID,
	)

	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrShareNotFound
	}

	log.Info().Str("share_id", shareID.String()).Msg("share revoked")
	return nil
}

// GetPublicKey retrieves a user's public key for encrypting shares to them.
// Returns the most recently created public key for the user.
func (ss *SharingService) GetPublicKey(ctx context.Context, userID uuid.UUID) ([]byte, error) {
	var publicKey []byte

	err := ss.pool.QueryRow(ctx,
		`SELECT public_key_bytes FROM public_keys WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
		userID,
	).Scan(&publicKey)

	if err != nil {
		log.Debug().Err(err).Str("user_id", userID.String()).Msg("public key not found")
		return nil, err
	}

	return publicKey, nil
}

// PH5-FIX: PublishPublicKey stores a user's public key for encryption
// Validates that the key is exactly 32 bytes (X25519 standard) and not all zeros/ones
func (ss *SharingService) PublishPublicKey(ctx context.Context, userID uuid.UUID, publicKeyBytes []byte) error {
	// PH5-FIX: Validate key is exactly 32 bytes (X25519 public key size)
	if len(publicKeyBytes) != 32 {
		return fmt.Errorf("invalid public key size: expected 32 bytes, got %d", len(publicKeyBytes))
	}

	// PH5-FIX: Validate key is not all zeros or all 0xFF
	allZeros := true
	allOnes := true
	for _, b := range publicKeyBytes {
		if b != 0 {
			allZeros = false
		}
		if b != 0xFF {
			allOnes = false
		}
	}

	if allZeros {
		return fmt.Errorf("public key is all zeros (invalid)")
	}
	if allOnes {
		return fmt.Errorf("public key is all ones (invalid)")
	}

	// PH5-FIX: Insert into public_keys table
	err := ss.pool.QueryRow(ctx,
		`INSERT INTO public_keys (user_id, key_type, public_key_bytes, created_at)
		 VALUES ($1, $2, $3, NOW())
		 RETURNING user_id`,
		userID, "x25519", publicKeyBytes,
	).Scan(&userID)

	if err != nil {
		log.Error().Err(err).Str("user_id", userID.String()).Msg("failed to publish public key")
		return err
	}

	log.Info().Str("user_id", userID.String()).Msg("public key published")
	return nil
}

// PH5-FIX: AcceptShare marks a share as accepted by the recipient
// Only the recipient can accept a share
func (ss *SharingService) AcceptShare(ctx context.Context, recipientID, shareID uuid.UUID) error {
	result, err := ss.pool.Exec(ctx,
		`UPDATE share_records SET accepted_at = NOW() WHERE id = $1 AND recipient_id = $2`,
		shareID, recipientID,
	)

	if err != nil {
		log.Error().Err(err).Str("share_id", shareID.String()).Str("recipient_id", recipientID.String()).Msg("failed to accept share")
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrShareNotFound
	}

	log.Info().Str("share_id", shareID.String()).Str("recipient_id", recipientID.String()).Msg("share accepted")
	return nil
}

// PH5-FIX: RejectShare deletes a share record or marks it as rejected
// Only the recipient can reject a share
func (ss *SharingService) RejectShare(ctx context.Context, recipientID, shareID uuid.UUID) error {
	result, err := ss.pool.Exec(ctx,
		`DELETE FROM share_records WHERE id = $1 AND recipient_id = $2`,
		shareID, recipientID,
	)

	if err != nil {
		log.Error().Err(err).Str("share_id", shareID.String()).Str("recipient_id", recipientID.String()).Msg("failed to reject share")
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrShareNotFound
	}

	log.Info().Str("share_id", shareID.String()).Str("recipient_id", recipientID.String()).Msg("share rejected")
	return nil
}

// HTTP Handlers

type CreateShareRequest struct {
	RecipientID  string  `json:"recipient_id"`
	BlobID       string  `json:"blob_id"`
	EncryptedKey string  `json:"encrypted_key"` // Base64-encoded
	ExpiresAt    *string `json:"expires_at"`    // Optional ISO 8601 timestamp
	Permissions  string  `json:"permissions"`   // 'read' or 'read-decrypt'
}

type CreateShareResponse struct {
	ShareID string `json:"share_id"`
}

// HandleCreateShare is an HTTP handler that creates a new share record.
// Validates the encrypted key meets sealed-box format requirements.
func HandleCreateShare(ss *SharingService, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req CreateShareRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		senderID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		recipientID, err := uuid.Parse(req.RecipientID)
		if err != nil {
			http.Error(w, "invalid recipient id", http.StatusBadRequest)
			return
		}

		blobID, err := uuid.Parse(req.BlobID)
		if err != nil {
			http.Error(w, "invalid blob id", http.StatusBadRequest)
			return
		}

		senderUUID, err := uuid.Parse(senderID)
		if err != nil {
			http.Error(w, "invalid sender id", http.StatusBadRequest)
			return
		}

	// MEDIUM-FIX: Validate expiration date is in the future
	if req.ExpiresAt != nil {
		expiresTime, err := time.Parse(time.RFC3339, *req.ExpiresAt)
		if err != nil {
			http.Error(w, "invalid expiration date format (must be RFC3339)", http.StatusBadRequest)
			return
		}
		if expiresTime.Before(time.Now()) {
			http.Error(w, "expiration date must be in the future", http.StatusBadRequest)
			return
		}
	}

	// MEDIUM-FIX: Validate permissions field is one of 'read' or 'read-decrypt'
	if req.Permissions != "" && req.Permissions != "read" && req.Permissions != "read-decrypt" {
		http.Error(w, "permissions must be 'read' or 'read-decrypt'", http.StatusBadRequest)
		return
	}

encryptedKey, err := decodeFromBase64(req.EncryptedKey)
		if err != nil {
			http.Error(w, "invalid base64 encrypted key", http.StatusBadRequest)
			return
		}

		// GAP-008: Validate sealed-box format before persisting
		if err := validateSealedBox(encryptedKey); err != nil {
			log.Warn().Err(err).Str("sender_id", senderID).Msg("rejected invalid sealed box")
			http.Error(w, "encrypted key does not meet sealed-box format requirements", http.StatusBadRequest)
			return
		}

		shareID, err := ss.CreateShare(r.Context(), senderUUID, recipientID, blobID, encryptedKey)
		if err != nil {
			http.Error(w, "failed to create share", http.StatusInternalServerError)
			return
		}

		auditSvc.LogAction(r.Context(), senderID, "SHARE_CREATE", encryptedKey)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(CreateShareResponse{
			ShareID: shareID.String(),
		})
	}
}

// HandleListReceivedShares is an HTTP handler that lists shares received by the authenticated user.
func HandleListReceivedShares(ss *SharingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		userUUID, err := uuid.Parse(userID)
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		shares, err := ss.ListReceivedShares(r.Context(), userUUID)
		if err != nil {
			http.Error(w, "failed to list shares", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(shares)
	}
}

// HandleListSentShares is an HTTP handler that lists shares sent by the authenticated user.
func HandleListSentShares(ss *SharingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		userUUID, err := uuid.Parse(userID)
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		shares, err := ss.ListSentShares(r.Context(), userUUID)
		if err != nil {
			http.Error(w, "failed to list shares", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(shares)
	}
}

// HandleRevokeShare is an HTTP handler that revokes a share (only the sender can revoke).
// Logs audit events for share revocation.
func HandleRevokeShare(ss *SharingService, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		shareID, err := uuid.Parse(r.PathValue("shareID"))
		if err != nil {
			http.Error(w, "invalid share id", http.StatusBadRequest)
			return
		}

		senderUUID, err := uuid.Parse(userID)
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		if err := ss.RevokeShare(r.Context(), senderUUID, shareID); err != nil {
			http.Error(w, "failed to revoke share", http.StatusInternalServerError)
			return
		}

		auditSvc.LogAction(r.Context(), userID, "SHARE_REVOKE", []byte(shareID.String()))

		w.WriteHeader(http.StatusNoContent)
	}
}

type PublicKeyResponse struct {
	UserID    string `json:"user_id"`
	PublicKey string `json:"public_key"`
}

// HandleGetPublicKey is an HTTP handler that retrieves a user's public key for encryption.
func HandleGetPublicKey(ss *SharingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(r.PathValue("userID"))
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		publicKey, err := ss.GetPublicKey(r.Context(), userID)
		if err != nil {
			http.Error(w, "public key not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(PublicKeyResponse{
			UserID:    userID.String(),
			PublicKey: encodeToBase64(publicKey),
		})
	}
}

// PH5-FIX: PublishPublicKeyRequest contains the base64-encoded public key
type PublishPublicKeyRequest struct {
	PublicKey string `json:"public_key"` // Base64-encoded X25519 public key
}

// PH5-FIX: HandlePublishPublicKey is an HTTP handler that publishes a user's public key
func HandlePublishPublicKey(ss *SharingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var req PublishPublicKeyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		publicKeyBytes, err := decodeFromBase64(req.PublicKey)
		if err != nil {
			http.Error(w, "invalid base64 public key", http.StatusBadRequest)
			return
		}

		userUUID, err := uuid.Parse(userID)
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		// PH5-FIX: Call PublishPublicKey to validate and store
		if err := ss.PublishPublicKey(r.Context(), userUUID, publicKeyBytes); err != nil {
			log.Warn().Err(err).Str("user_id", userID).Msg("failed to publish public key")
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(PublicKeyResponse{
			UserID:    userUUID.String(),
			PublicKey: req.PublicKey,
		})
	}
}

// PH5-FIX: HandleAcceptShare is an HTTP handler that accepts a share
func HandleAcceptShare(ss *SharingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		recipientID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		shareID, err := uuid.Parse(r.PathValue("shareID"))
		if err != nil {
			http.Error(w, "invalid share id", http.StatusBadRequest)
			return
		}

		recipientUUID, err := uuid.Parse(recipientID)
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		// PH5-FIX: Accept the share
		if err := ss.AcceptShare(r.Context(), recipientUUID, shareID); err != nil {
			if err == ErrShareNotFound {
				http.Error(w, "share not found or you are not the recipient", http.StatusNotFound)
			} else {
				http.Error(w, "failed to accept share", http.StatusInternalServerError)
			}
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// PH5-FIX: HandleRejectShare is an HTTP handler that rejects a share
func HandleRejectShare(ss *SharingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		recipientID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		shareID, err := uuid.Parse(r.PathValue("shareID"))
		if err != nil {
			http.Error(w, "invalid share id", http.StatusBadRequest)
			return
		}

		recipientUUID, err := uuid.Parse(recipientID)
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		// PH5-FIX: Reject the share
		if err := ss.RejectShare(r.Context(), recipientUUID, shareID); err != nil {
			if err == ErrShareNotFound {
				http.Error(w, "share not found or you are not the recipient", http.StatusNotFound)
			} else {
				http.Error(w, "failed to reject share", http.StatusInternalServerError)
			}
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// Helpers
func encodeToBase64(data []byte) string {
	if len(data) == 0 {
		return ""
	}
	return base64.StdEncoding.EncodeToString(data)
}

func decodeFromBase64(s string) ([]byte, error) {
	if s == "" {
		return nil, nil
	}
	return base64.StdEncoding.DecodeString(s)
}

// validateSealedBox checks that an encrypted key meets minimum sealed-box size requirements.
// A NaCl sealed box contains: ephemeral public key (32) + nonce (24) + ciphertext (≥1) + Poly1305 tag (16) = 73 bytes minimum.
// MEDIUM-FIX: Deeper format validation for sealed-box structure
// Valid sealed-box format:
// - Bytes 0-31: X25519 ephemeral public key (must be non-zero and not all 0xFF bytes)
// - Bytes 32-onwards: Encrypted payload (nonce + ciphertext + tag)
// This function validates the size bounds and checks ephemeral key validity.
func validateSealedBox(data []byte) error {
	if len(data) < minSealedBoxSize {
		return fmt.Errorf("encrypted key too short: got %d bytes, minimum %d for sealed box", len(data), minSealedBoxSize)
	}
	if len(data) > maxSealedBoxSize {
		return fmt.Errorf("encrypted key too large: got %d bytes, maximum %d", len(data), maxSealedBoxSize)
	}

	// MEDIUM-FIX: Validate ephemeral public key (first 32 bytes) is not all zeros or all ones
	ephemeralKey := data[:32]
	allZeros := true
	allOnes := true
	for _, b := range ephemeralKey {
		if b != 0 {
			allZeros = false
		}
		if b != 0xFF {
			allOnes = false
		}
	}

	if allZeros {
		return fmt.Errorf("ephemeral public key is all zeros (invalid)")
	}
	if allOnes {
		return fmt.Errorf("ephemeral public key is all ones (invalid)")
	}

	return nil
}
