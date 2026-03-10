package device

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"time"

	"github.com/google/uuid"
)

// DeviceEnrollment represents a registered device
type DeviceEnrollment struct {
	ID                uuid.UUID  `json:"id" db:"id"`
	UserID            uuid.UUID  `json:"user_id" db:"user_id"`
	DeviceFingerprint []byte     `json:"-" db:"device_fingerprint"`
	DevicePublicKey   []byte     `json:"-" db:"device_public_key"`
	DeviceName        string     `json:"device_name" db:"device_name"`
	Platform          string     `json:"platform" db:"platform"`
	EnrolledAt        time.Time  `json:"enrolled_at" db:"enrolled_at"`
	LastSeen          time.Time  `json:"last_seen" db:"last_seen"`
	IsTrusted         bool       `json:"is_trusted" db:"is_trusted"`
	RevokedAt         *time.Time `json:"revoked_at,omitempty" db:"revoked_at"`
}

// Service handles device enrollment and trust management
type Service struct {
	db *sql.DB
}

// NewService creates a new device enrollment service
func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// ComputeFingerprint generates a SHA-256 fingerprint from device hardware identifiers
func ComputeFingerprint(hardwareID string) []byte {
	h := sha256.Sum256([]byte(hardwareID))
	return h[:]
}

// FingerprintHex returns the hex-encoded fingerprint for display
func FingerprintHex(fingerprint []byte) string {
	return hex.EncodeToString(fingerprint)
}

// EnrollDevice registers a new device for a user
func (s *Service) EnrollDevice(ctx context.Context, userID uuid.UUID, fingerprint []byte, publicKey []byte, name string, platform string) (*DeviceEnrollment, error) {
	enrollment := &DeviceEnrollment{
		ID:                uuid.New(),
		UserID:            userID,
		DeviceFingerprint: fingerprint,
		DevicePublicKey:   publicKey,
		DeviceName:        name,
		Platform:          platform,
		EnrolledAt:        time.Now(),
		LastSeen:          time.Now(),
		IsTrusted:         false,
	}

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO device_enrollments (id, user_id, device_fingerprint, device_public_key, device_name, platform, enrolled_at, last_seen, is_trusted)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 ON CONFLICT (user_id, device_fingerprint) DO UPDATE SET
		   last_seen = EXCLUDED.last_seen,
		   device_public_key = EXCLUDED.device_public_key,
		   device_name = EXCLUDED.device_name`,
		enrollment.ID, enrollment.UserID, enrollment.DeviceFingerprint,
		enrollment.DevicePublicKey, enrollment.DeviceName, enrollment.Platform,
		enrollment.EnrolledAt, enrollment.LastSeen, enrollment.IsTrusted,
	)
	if err != nil {
		return nil, err
	}

	return enrollment, nil
}

// VerifyDevice checks if a device fingerprint is enrolled and not revoked
func (s *Service) VerifyDevice(ctx context.Context, userID uuid.UUID, fingerprint []byte) (*DeviceEnrollment, error) {
	var enrollment DeviceEnrollment
	err := s.db.QueryRowContext(ctx,
		`SELECT id, user_id, device_fingerprint, device_public_key, device_name, platform,
		        enrolled_at, last_seen, is_trusted, revoked_at
		 FROM device_enrollments
		 WHERE user_id = $1 AND device_fingerprint = $2 AND revoked_at IS NULL`,
		userID, fingerprint,
	).Scan(
		&enrollment.ID, &enrollment.UserID, &enrollment.DeviceFingerprint,
		&enrollment.DevicePublicKey, &enrollment.DeviceName, &enrollment.Platform,
		&enrollment.EnrolledAt, &enrollment.LastSeen, &enrollment.IsTrusted, &enrollment.RevokedAt,
	)
	if err != nil {
		return nil, err
	}

	// Update last_seen timestamp
	_, _ = s.db.ExecContext(ctx,
		`UPDATE device_enrollments SET last_seen = NOW() WHERE id = $1`,
		enrollment.ID,
	)

	return &enrollment, nil
}

// ListDevices returns all active devices for a user
func (s *Service) ListDevices(ctx context.Context, userID uuid.UUID) ([]DeviceEnrollment, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, user_id, device_fingerprint, device_public_key, device_name, platform,
		        enrolled_at, last_seen, is_trusted, revoked_at
		 FROM device_enrollments
		 WHERE user_id = $1 AND revoked_at IS NULL
		 ORDER BY last_seen DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []DeviceEnrollment
	for rows.Next() {
		var d DeviceEnrollment
		if err := rows.Scan(
			&d.ID, &d.UserID, &d.DeviceFingerprint, &d.DevicePublicKey,
			&d.DeviceName, &d.Platform, &d.EnrolledAt, &d.LastSeen,
			&d.IsTrusted, &d.RevokedAt,
		); err != nil {
			return nil, err
		}
		devices = append(devices, d)
	}
	return devices, nil
}

// TrustDevice marks a device as trusted
func (s *Service) TrustDevice(ctx context.Context, userID uuid.UUID, deviceID uuid.UUID) error {
	result, err := s.db.ExecContext(ctx,
		`UPDATE device_enrollments SET is_trusted = true WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
		deviceID, userID,
	)
	if err != nil {
		return err
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// RevokeDevice marks a device as revoked
func (s *Service) RevokeDevice(ctx context.Context, userID uuid.UUID, deviceID uuid.UUID) error {
	now := time.Now()
	result, err := s.db.ExecContext(ctx,
		`UPDATE device_enrollments SET revoked_at = $1 WHERE id = $2 AND user_id = $3 AND revoked_at IS NULL`,
		now, deviceID, userID,
	)
	if err != nil {
		return err
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// IsNewDevice checks if this fingerprint is seen for the first time
func (s *Service) IsNewDevice(ctx context.Context, userID uuid.UUID, fingerprint []byte) (bool, error) {
	var count int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM device_enrollments WHERE user_id = $1 AND device_fingerprint = $2`,
		userID, fingerprint,
	).Scan(&count)
	if err != nil {
		return false, err
	}
	return count == 0, nil
}
