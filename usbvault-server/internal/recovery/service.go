package recovery

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	// NumRecoveryCodes is the number of recovery codes generated per user
	NumRecoveryCodes = 10
	// CodeLength is the length of each recovery code segment (3 segments of 4 chars)
	CodeSegmentLength = 4
	// CodeSegments is the number of segments per code
	CodeSegments = 3
)

// RecoveryCode represents a single recovery code entry
type RecoveryCode struct {
	ID        int        `json:"id" db:"id"`
	UserID    uuid.UUID  `json:"user_id" db:"user_id"`
	CodeHash  []byte     `json:"-" db:"code_hash"`
	CodeIndex int        `json:"code_index" db:"code_index"`
	CreatedAt time.Time  `json:"created_at" db:"created_at"`
	UsedAt    *time.Time `json:"used_at,omitempty" db:"used_at"`
}

// Service manages recovery codes for account recovery
type Service struct {
	db *sql.DB
}

// NewService creates a new recovery code service
func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// GenerateCodes creates a new set of recovery codes for a user
// Returns the plaintext codes (display once, then discard)
func (s *Service) GenerateCodes(ctx context.Context, userID uuid.UUID) ([]string, error) {
	// Delete any existing codes first
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM recovery_codes WHERE user_id = $1`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to clear old codes: %w", err)
	}

	codes := make([]string, NumRecoveryCodes)
	for i := 0; i < NumRecoveryCodes; i++ {
		code := generateCode()
		codes[i] = code

		hash := hashCode(code)
		_, err := s.db.ExecContext(ctx,
			`INSERT INTO recovery_codes (user_id, code_hash, code_index, created_at)
			 VALUES ($1, $2, $3, $4)`,
			userID, hash, i, time.Now(),
		)
		if err != nil {
			return nil, fmt.Errorf("failed to store code %d: %w", i, err)
		}
	}

	return codes, nil
}

// VerifyCode checks a recovery code and marks it as used if valid
// Returns true if the code is valid and unused
func (s *Service) VerifyCode(ctx context.Context, userID uuid.UUID, code string) (bool, error) {
	// Normalize the code (remove dashes, uppercase)
	normalized := strings.ToUpper(strings.ReplaceAll(code, "-", ""))
	hash := hashCode(normalized)

	var rc RecoveryCode
	err := s.db.QueryRowContext(ctx,
		`SELECT id, user_id, code_hash, code_index, created_at, used_at
		 FROM recovery_codes
		 WHERE user_id = $1 AND used_at IS NULL`,
		userID,
	).Scan(&rc.ID, &rc.UserID, &rc.CodeHash, &rc.CodeIndex, &rc.CreatedAt, &rc.UsedAt)

	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	// Check all unused codes for a match (constant-time comparison per code)
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, code_hash FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL`,
		userID,
	)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	var matchedID int
	found := false
	for rows.Next() {
		var id int
		var storedHash []byte
		if err := rows.Scan(&id, &storedHash); err != nil {
			continue
		}
		if subtle.ConstantTimeCompare(hash, storedHash) == 1 {
			matchedID = id
			found = true
			// Don't break - continue iterating to maintain constant time
		}
	}

	if !found {
		return false, nil
	}

	// Mark the matched code as used
	now := time.Now()
	_, err = s.db.ExecContext(ctx,
		`UPDATE recovery_codes SET used_at = $1 WHERE id = $2`,
		now, matchedID,
	)
	if err != nil {
		return false, err
	}

	return true, nil
}

// RemainingCodes returns the count of unused recovery codes
func (s *Service) RemainingCodes(ctx context.Context, userID uuid.UUID) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL`,
		userID,
	).Scan(&count)
	return count, err
}

// generateCode creates a random recovery code in format XXXX-XXXX-XXXX
func generateCode() string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no I/1/O/0 for readability
	segments := make([]string, CodeSegments)

	for s := 0; s < CodeSegments; s++ {
		buf := make([]byte, CodeSegmentLength)
		_, _ = rand.Read(buf)
		segment := make([]byte, CodeSegmentLength)
		for i := 0; i < CodeSegmentLength; i++ {
			segment[i] = chars[int(buf[i])%len(chars)]
		}
		segments[s] = string(segment)
	}

	return strings.Join(segments, "-")
}

// hashCode creates a SHA-256 hash of a recovery code
func hashCode(code string) []byte {
	// Normalize: remove dashes, uppercase
	normalized := strings.ToUpper(strings.ReplaceAll(code, "-", ""))
	h := sha256.Sum256([]byte(normalized))
	return h[:]
}

// FormatCodeForDisplay formats a code with dashes for human readability
func FormatCodeForDisplay(code string) string {
	clean := strings.ReplaceAll(code, "-", "")
	if len(clean) != CodeSegmentLength*CodeSegments {
		return code
	}
	segments := make([]string, CodeSegments)
	for i := 0; i < CodeSegments; i++ {
		start := i * CodeSegmentLength
		segments[i] = clean[start : start+CodeSegmentLength]
	}
	return strings.Join(segments, "-")
}

// HexHash returns the hex-encoded hash for debugging (never log actual codes!)
func HexHash(hash []byte) string {
	return hex.EncodeToString(hash)
}
