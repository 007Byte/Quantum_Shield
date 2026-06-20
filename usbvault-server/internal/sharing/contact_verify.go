package sharing

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
)

// PH5-FIX: ComputeKeyFingerprint computes SHA-256 fingerprint of a public key
// and formats it as colon-separated hex pairs (A1:B2:C3:...)
func ComputeKeyFingerprint(publicKey []byte) string {
	hash := sha256.Sum256(publicKey)

	// Convert to hex pairs separated by colons
	var pairs []string
	for _, b := range hash[:] {
		pairs = append(pairs, fmt.Sprintf("%02X", b))
	}

	return strings.Join(pairs, ":")
}

// PH5-FIX: ContactVerificationService manages contact verification with key fingerprints
type ContactVerificationService struct {
	pool *pgxpool.Pool
}

// PH5-FIX: NewContactVerificationService creates a new contact verification service
func NewContactVerificationService(pool *pgxpool.Pool) *ContactVerificationService {
	return &ContactVerificationService{pool: pool}
}

// PH5-FIX: VerifyContact stores a contact verification after out-of-band confirmation
// Validates the fingerprint matches the contact's current public key
func (cvs *ContactVerificationService) VerifyContact(ctx context.Context, userID, contactID uuid.UUID, fingerprint string) error {
	// PH5-FIX: Get the contact's current public key
	var publicKeyBytes []byte
	err := cvs.pool.QueryRow(ctx,
		`SELECT public_key_bytes FROM public_keys WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
		contactID,
	).Scan(&publicKeyBytes)

	if err != nil {
		log.Debug().Err(err).Str("contact_id", contactID.String()).Msg("contact public key not found")
		return fmt.Errorf("contact public key not found")
	}

	// PH5-FIX: Compute fingerprint of the contact's public key
	computedFingerprint := ComputeKeyFingerprint(publicKeyBytes)

	// PH5-FIX: Verify the provided fingerprint matches
	if fingerprint != computedFingerprint {
		log.Warn().Str("user_id", userID.String()).Str("contact_id", contactID.String()).
			Str("expected", computedFingerprint).Str("provided", fingerprint).
			Msg("fingerprint mismatch during contact verification")
		return fmt.Errorf("fingerprint does not match contact's public key")
	}

	// PH5-FIX: Store verification in contact_verifications table
	err = cvs.pool.QueryRow(ctx,
		`INSERT INTO contact_verifications (user_id, contact_user_id, public_key_fingerprint, verified_at)
		 VALUES ($1, $2, $3, NOW())
		 ON CONFLICT (user_id, contact_user_id) DO UPDATE SET public_key_fingerprint = $3, verified_at = NOW()
		 RETURNING id`,
		userID, contactID, fingerprint,
	).Scan(new(string))

	if err != nil {
		log.Error().Err(err).Str("user_id", userID.String()).Str("contact_id", contactID.String()).Msg("failed to verify contact")
		return err
	}

	log.Info().Str("user_id", userID.String()).Str("contact_id", contactID.String()).Str("fingerprint", fingerprint).Msg("contact verified")
	return nil
}

// PH5-FIX: IsContactVerified checks if a contact has been verified for a user
func (cvs *ContactVerificationService) IsContactVerified(ctx context.Context, userID, contactID uuid.UUID) (bool, error) {
	var verifiedAt interface{}
	err := cvs.pool.QueryRow(ctx,
		`SELECT verified_at FROM contact_verifications WHERE user_id = $1 AND contact_user_id = $2`,
		userID, contactID,
	).Scan(&verifiedAt)

	if err != nil {
		if err.Error() == "no rows in result set" {
			return false, nil
		}
		log.Debug().Err(err).Str("user_id", userID.String()).Str("contact_id", contactID.String()).Msg("failed to check contact verification")
		return false, err
	}

	return verifiedAt != nil, nil
}

// PH5-FIX: KeyFingerprintResponse contains the computed fingerprint for a user's public key
type KeyFingerprintResponse struct {
	UserID      string `json:"user_id"`
	Fingerprint string `json:"fingerprint"`
}

// PH5-FIX: HandleGetKeyFingerprint is an HTTP handler that returns a user's public key fingerprint
func HandleGetKeyFingerprint(ss *SharingService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := uuid.Parse(r.PathValue("userID"))
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		// PH5-FIX: Get the user's public key
		publicKey, err := ss.GetPublicKey(r.Context(), userID)
		if err != nil {
			http.Error(w, "public key not found", http.StatusNotFound)
			return
		}

		// PH5-FIX: Compute fingerprint
		fingerprint := ComputeKeyFingerprint(publicKey)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(KeyFingerprintResponse{
			UserID:      userID.String(),
			Fingerprint: fingerprint,
		})
	}
}

// PH5-FIX: VerifyContactRequest contains the contact ID and their public key fingerprint
type VerifyContactRequest struct {
	ContactID   string `json:"contact_id"`
	Fingerprint string `json:"fingerprint"`
}

// PH5-FIX: HandleVerifyContact is an HTTP handler that verifies a contact after out-of-band confirmation
func HandleVerifyContact(cvs *ContactVerificationService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var req VerifyContactRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		userUUID, err := uuid.Parse(userID)
		if err != nil {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		contactUUID, err := uuid.Parse(req.ContactID)
		if err != nil {
			http.Error(w, "invalid contact id", http.StatusBadRequest)
			return
		}

		// PH5-FIX: Verify the contact
		if err := cvs.VerifyContact(r.Context(), userUUID, contactUUID, req.Fingerprint); err != nil {
			log.Warn().Err(err).Str("user_id", userID).Str("contact_id", req.ContactID).Msg("contact verification failed")
			http.Error(w, "contact verification failed", http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNoContent)
	}
}
