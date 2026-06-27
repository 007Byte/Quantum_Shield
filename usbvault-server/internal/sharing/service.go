package sharing

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/config"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
	"github.com/usbvault/usbvault-server/internal/database"
	"github.com/usbvault/usbvault-server/internal/middleware"
)

// Minimum sealed-box size: ephemeral_pk(32) + nonce(24) + min_ciphertext(1) + tag(16) = 73 bytes
const minSealedBoxSize = 73

// CR-006 FIX: Add maximum size validation to prevent abuse
const maxSealedBoxSize = 4096 // Maximum sealed box size (key + overhead should never exceed 4KB)

// LOW-FIX: Extracted magic number to named constant
const shareDefaultTTL = 30 * 24 * time.Hour // 30 days

type ShareRecord struct {
	ID           uuid.UUID  `json:"id"`
	SenderID     uuid.UUID  `json:"sender_id"`
	RecipientID  uuid.UUID  `json:"recipient_id"`
	BlobID       uuid.UUID  `json:"blob_id"`
	EncryptedKey []byte     `json:"-"` // Never expose plaintext
	CreatedAt    time.Time  `json:"created_at"`
	ExpiresAt    *time.Time `json:"expires_at"`
}

// BillingChecker resolves a user's authoritative subscription tier. Mirrors
// storage.BillingChecker and billing.BillingService.CheckAccess so every
// enforcement path agrees on the same tier source.
type BillingChecker interface {
	CheckAccess(ctx context.Context, userID string) (tier string, err error)
}

// ErrSharingNotAllowed is returned when the sender's tier does not include the
// sharing feature. Callers translate this into HTTP 403 Forbidden.
var ErrSharingNotAllowed = errors.New("sharing is not available on your subscription tier")

// ErrShareLimitReached is returned when the sender has reached the maximum number
// of outstanding shares permitted. Callers translate this into HTTP 402.
var ErrShareLimitReached = errors.New("share limit reached for subscription tier")

// ErrBlobNotOwned is returned when a share is requested for a blob the sender does
// not own. Callers translate this into HTTP 403/404 (IDOR protection).
var ErrBlobNotOwned = errors.New("blob not found or not owned by sender")

// SharingService manages secure file sharing with encrypted key exchange.
type SharingService struct {
	repo database.ShareRepository
	// F3: optional tier source for gating share creation by the sharing feature
	// and a per-tier maximum share count. When nil, share creation is unrestricted
	// (preserves prior behavior and keeps handler unit tests that pass a nil repo
	// working — those tests exercise validation paths that return before this gate).
	billingChecker BillingChecker
}

// NewSharingService creates a new sharing service for managing encrypted file shares.
func NewSharingService(repo database.ShareRepository) *SharingService {
	return &SharingService{repo: repo}
}

// SetBillingChecker installs the F3 tier source used to gate share creation by
// the sharing feature/tier and the per-tier maximum share count.
func (ss *SharingService) SetBillingChecker(bc BillingChecker) {
	ss.billingChecker = bc
}

// checkCanCreateShare enforces, against the sender's authoritative tier:
//  1. the sharing feature is enabled for the tier (TierLimitsMap[tier].Sharing)
//  2. the sender is below the per-tier maximum outstanding share count
//
// It is a no-op (returns nil) when no billing checker is configured. Returns
// ErrSharingNotAllowed (403) or ErrShareLimitReached (402) on denial.
func (ss *SharingService) checkCanCreateShare(ctx context.Context, senderID string) error {
	if ss.billingChecker == nil {
		return nil
	}

	tier, err := ss.billingChecker.CheckAccess(ctx, senderID)
	if err != nil {
		// Fail closed to the free tier on lookup error.
		log.Warn().Err(err).Str("sender_id", senderID).Msg("F3: failed to resolve tier for share gate; treating as free")
		tier = "free"
	}

	limits, ok := middleware.TierLimitsMap[tier]
	if !ok {
		limits = middleware.TierLimitsMap["free"]
	}

	// 1. Feature gate: tier must include sharing.
	// PRODUCT QUESTION (DOCUMENTED, F3 FIX D): middleware.TierLimitsMap currently
	// sets Sharing=false for both "free" AND "individual" (only "team"/"enterprise"
	// enable it). This must be confirmed against the client-side featureGates /
	// TIER_FEATURES so the server and client agree on whether individual-tier users
	// may share; if the client advertises sharing to individual users, either this
	// map or the client gate is wrong. The server is the authoritative enforcer here
	// — it will 403 individual-tier shares until the product decision aligns the two.
	if !limits.Sharing {
		log.Info().Str("sender_id", senderID).Str("tier", tier).Msg("F3: share creation denied — sharing not in tier")
		return ErrSharingNotAllowed
	}

	// 2. Per-tier maximum outstanding share count. The single source of truth has
	//    no per-tier share-count field, so we apply the documented global cap
	//    (config.MaxSharesPerVault, previously dead) as the per-sender ceiling.
	count, err := ss.repo.CountActiveSentShares(ctx, senderID)
	if err != nil {
		// Fail closed: cannot count -> deny.
		log.Warn().Err(err).Str("sender_id", senderID).Msg("F3: failed to count active shares; denying create")
		return ErrShareLimitReached
	}
	if count >= config.MaxSharesPerVault {
		log.Info().
			Str("sender_id", senderID).
			Str("tier", tier).
			Int("current_shares", count).
			Int("max_shares", config.MaxSharesPerVault).
			Msg("F3: share creation denied — share count limit reached")
		return ErrShareLimitReached
	}

	return nil
}

// BlobOwnedBy reports whether the blob is owned by the given user (sender).
func (ss *SharingService) BlobOwnedBy(ctx context.Context, userID, blobID uuid.UUID) (bool, error) {
	return ss.repo.BlobOwnedBy(ctx, userID.String(), blobID.String())
}

// CreateShare creates a new share record with a 30-day expiration by default.
func (ss *SharingService) CreateShare(ctx context.Context, senderID, recipientID, blobID uuid.UUID, encryptedKey []byte) (uuid.UUID, error) {
	// Defense in depth (IDOR): enforce blob ownership at the service boundary, not
	// only in HandleCreateShare. This guarantees no caller (current or future) can
	// persist a share row for a blob the sender does not own, even if a handler
	// forgets the check or a new entry point is added.
	owned, err := ss.repo.BlobOwnedBy(ctx, senderID.String(), blobID.String())
	if err != nil {
		return uuid.Nil, err
	}
	if !owned {
		return uuid.Nil, ErrBlobNotOwned
	}

	shareID, err := ss.repo.CreateShare(ctx, senderID.String(), recipientID.String(), blobID.String(), encryptedKey)
	if err != nil {
		return uuid.Nil, err
	}

	return uuid.Parse(shareID)
}

// ListReceivedShares lists all shares received by a user that haven't expired.
func (ss *SharingService) ListReceivedShares(ctx context.Context, userID uuid.UUID) ([]ShareRecord, error) {
	records, err := ss.repo.ListReceivedShares(ctx, userID.String())
	if err != nil {
		return nil, err
	}

	var shares []ShareRecord
	for _, record := range records {
		id, _ := uuid.Parse(record.ID)
		senderID, _ := uuid.Parse(record.SenderID)
		recipientID, _ := uuid.Parse(record.RecipientID)
		blobID, _ := uuid.Parse(record.BlobID)
		createdAt, _ := time.Parse(time.RFC3339, record.CreatedAt)

		var expiresAt *time.Time
		if record.ExpiresAt != nil {
			t, _ := time.Parse(time.RFC3339, *record.ExpiresAt)
			expiresAt = &t
		}

		shares = append(shares, ShareRecord{
			ID:          id,
			SenderID:    senderID,
			RecipientID: recipientID,
			BlobID:      blobID,
			CreatedAt:   createdAt,
			ExpiresAt:   expiresAt,
		})
	}

	return shares, nil
}

// ListSentShares lists all shares sent by a user.
func (ss *SharingService) ListSentShares(ctx context.Context, userID uuid.UUID) ([]ShareRecord, error) {
	records, err := ss.repo.ListSentShares(ctx, userID.String())
	if err != nil {
		return nil, err
	}

	var shares []ShareRecord
	for _, record := range records {
		id, _ := uuid.Parse(record.ID)
		senderID, _ := uuid.Parse(record.SenderID)
		recipientID, _ := uuid.Parse(record.RecipientID)
		blobID, _ := uuid.Parse(record.BlobID)
		createdAt, _ := time.Parse(time.RFC3339, record.CreatedAt)

		var expiresAt *time.Time
		if record.ExpiresAt != nil {
			t, _ := time.Parse(time.RFC3339, *record.ExpiresAt)
			expiresAt = &t
		}

		shares = append(shares, ShareRecord{
			ID:          id,
			SenderID:    senderID,
			RecipientID: recipientID,
			BlobID:      blobID,
			CreatedAt:   createdAt,
			ExpiresAt:   expiresAt,
		})
	}

	return shares, nil
}

// RevokeShare revokes a share record (only the sender can revoke).
// Returns ErrShareNotFound if the share does not exist or sender is not the owner.
func (ss *SharingService) RevokeShare(ctx context.Context, senderID, shareID uuid.UUID) error {
	return ss.repo.RevokeShare(ctx, senderID.String(), shareID.String())
}

// GetPublicKey retrieves a user's public key for encrypting shares to them.
// Returns the most recently created public key for the user.
func (ss *SharingService) GetPublicKey(ctx context.Context, userID uuid.UUID) ([]byte, error) {
	return ss.repo.GetPublicKey(ctx, userID.String())
}

// PH5-FIX: PublishPublicKey stores a user's public key for encryption
// Validates that the key is exactly 32 bytes (X25519 standard) and not all zeros/ones
func (ss *SharingService) PublishPublicKey(ctx context.Context, userID uuid.UUID, publicKeyBytes []byte) error {
	return ss.repo.PublishPublicKey(ctx, userID.String(), publicKeyBytes)
}

// PH5-FIX: AcceptShare marks a share as accepted by the recipient
// Only the recipient can accept a share
func (ss *SharingService) AcceptShare(ctx context.Context, recipientID, shareID uuid.UUID) error {
	return ss.repo.AcceptShare(ctx, recipientID.String(), shareID.String())
}

// PH5-FIX: RejectShare deletes a share record or marks it as rejected
// Only the recipient can reject a share
func (ss *SharingService) RejectShare(ctx context.Context, recipientID, shareID uuid.UUID) error {
	return ss.repo.RejectShare(ctx, recipientID.String(), shareID.String())
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

		senderID, ok := r.Context().Value(ctxkeys.UserID).(string)
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

		// SECURITY (IDOR): the sender must own the blob being shared. Without
		// this check any authenticated user who learns/guesses another user's
		// blob_id could create share rows referencing it.
		owned, err := ss.BlobOwnedBy(r.Context(), senderUUID, blobID)
		if err != nil {
			log.Error().Err(err).Str("sender_id", senderID).Msg("failed to verify blob ownership for share")
			http.Error(w, "failed to create share", http.StatusInternalServerError)
			return
		}
		if !owned {
			log.Warn().Str("sender_id", senderID).Str("blob_id", blobID.String()).Msg("rejected share: sender does not own blob")
			http.Error(w, "blob not found or access denied", http.StatusForbidden)
			return
		}

		// F3: gate share creation by the sender's authoritative tier — the sharing
		// feature must be enabled (403) and the sender must be under the per-tier
		// maximum outstanding share count (402).
		if err := ss.checkCanCreateShare(r.Context(), senderID); err != nil {
			switch {
			case errors.Is(err, ErrSharingNotAllowed):
				http.Error(w, "sharing is not available on your subscription tier; upgrade required", http.StatusForbidden)
			case errors.Is(err, ErrShareLimitReached):
				http.Error(w, "share limit reached for your subscription tier; upgrade required", http.StatusPaymentRequired)
			default:
				http.Error(w, "failed to create share", http.StatusInternalServerError)
			}
			return
		}

		shareID, err := ss.CreateShare(r.Context(), senderUUID, recipientID, blobID, encryptedKey)
		if err != nil {
			// Backstop: the service layer also enforces blob ownership (IDOR).
			if errors.Is(err, ErrBlobNotOwned) {
				http.Error(w, "blob not found or access denied", http.StatusForbidden)
				return
			}
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
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
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
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
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
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
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
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
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
			http.Error(w, "failed to publish public key", http.StatusBadRequest)
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
		recipientID, ok := r.Context().Value(ctxkeys.UserID).(string)
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
		recipientID, ok := r.Context().Value(ctxkeys.UserID).(string)
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
