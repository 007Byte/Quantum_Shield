package sharing

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// KeyChangeNotification represents a notification about key rotation
type KeyChangeNotification struct {
	ID               uuid.UUID `json:"id"`
	VaultID          uuid.UUID `json:"vault_id"`
	InitiatedBy      uuid.UUID `json:"initiated_by"`
	NotificationType string    `json:"notification_type"` // "key_rotation", "revocation", "share_update"
	Message          string    `json:"message"`
	CreatedAt        time.Time `json:"created_at"`
	AcknowledgedAt   *time.Time `json:"acknowledged_at,omitempty"`
}

// NotificationService handles key change notifications to vault members
type NotificationService struct {
	db *sql.DB
}

// NewNotificationService creates a new notification service
func NewNotificationService(db *sql.DB) *NotificationService {
	return &NotificationService{db: db}
}

// NotifyKeyRotation sends key rotation notifications to all vault members
func (ns *NotificationService) NotifyKeyRotation(ctx context.Context, vaultID uuid.UUID, initiatedBy uuid.UUID) error {
	// Get all members of the vault
	rows, err := ns.db.QueryContext(ctx,
		`SELECT user_id FROM vault_members WHERE vault_id = $1 AND user_id != $2`,
		vaultID, initiatedBy,
	)
	if err != nil {
		return fmt.Errorf("failed to query vault members: %w", err)
	}
	defer rows.Close()

	var memberIDs []uuid.UUID
	for rows.Next() {
		var memberID uuid.UUID
		if err := rows.Scan(&memberID); err != nil {
			continue
		}
		memberIDs = append(memberIDs, memberID)
	}

	// Create notification for each member
	for _, memberID := range memberIDs {
		notification := KeyChangeNotification{
			ID:               uuid.New(),
			VaultID:          vaultID,
			InitiatedBy:      initiatedBy,
			NotificationType: "key_rotation",
			Message:          fmt.Sprintf("Encryption keys for vault have been rotated. Please re-verify shared access."),
			CreatedAt:        time.Now(),
		}

		notifJSON, _ := json.Marshal(notification)

		// Store in audit log for persistence
		_, err := ns.db.ExecContext(ctx,
			`INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address)
             VALUES ($1, 'key_rotation_notification', 'vault', $2, $3, '0.0.0.0')`,
			memberID, vaultID, string(notifJSON),
		)
		if err != nil {
			// Log but don't fail - notification is best-effort
			log.Warn().Err(err).Str("member_id", memberID.String()).Str("vault_id", vaultID.String()).Msg("failed to store key rotation notification")
			continue
		}
	}

	log.Info().Str("vault_id", vaultID.String()).Int("member_count", len(memberIDs)).Msg("key rotation notifications sent")
	return nil
}

// NotifyShareRevocation sends revocation notifications
func (ns *NotificationService) NotifyShareRevocation(ctx context.Context, vaultID uuid.UUID, revokedUserID uuid.UUID, initiatedBy uuid.UUID) error {
	notification := KeyChangeNotification{
		ID:               uuid.New(),
		VaultID:          vaultID,
		InitiatedBy:      initiatedBy,
		NotificationType: "revocation",
		Message:          "Your access to this vault has been revoked. Encryption keys have been rotated.",
		CreatedAt:        time.Now(),
	}

	notifJSON, _ := json.Marshal(notification)

	_, err := ns.db.ExecContext(ctx,
		`INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address)
         VALUES ($1, 'share_revocation_notification', 'vault', $2, $3, '0.0.0.0')`,
		revokedUserID, vaultID, string(notifJSON),
	)

	if err != nil {
		log.Error().Err(err).Str("revoked_user_id", revokedUserID.String()).Str("vault_id", vaultID.String()).Msg("failed to store share revocation notification")
		return err
	}

	log.Info().Str("revoked_user_id", revokedUserID.String()).Str("vault_id", vaultID.String()).Msg("share revocation notification sent")
	return nil
}

// GetPendingNotifications retrieves unacknowledged key change notifications for a user
func (ns *NotificationService) GetPendingNotifications(ctx context.Context, userID uuid.UUID) ([]KeyChangeNotification, error) {
	rows, err := ns.db.QueryContext(ctx,
		`SELECT details FROM audit_log
         WHERE user_id = $1
         AND action IN ('key_rotation_notification', 'share_revocation_notification')
         AND created_at > NOW() - INTERVAL '30 days'
         ORDER BY created_at DESC
         LIMIT 50`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query pending notifications: %w", err)
	}
	defer rows.Close()

	var notifications []KeyChangeNotification
	for rows.Next() {
		var detailsJSON string
		if err := rows.Scan(&detailsJSON); err != nil {
			log.Warn().Err(err).Msg("failed to scan notification details")
			continue
		}
		var n KeyChangeNotification
		if err := json.Unmarshal([]byte(detailsJSON), &n); err != nil {
			log.Warn().Err(err).Msg("failed to unmarshal notification JSON")
			continue
		}
		notifications = append(notifications, n)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating notifications: %w", err)
	}

	log.Debug().Str("user_id", userID.String()).Int("count", len(notifications)).Msg("retrieved pending notifications")
	return notifications, nil
}

// NotifyShareUpdate sends a notification when a share is created or updated
func (ns *NotificationService) NotifyShareUpdate(ctx context.Context, vaultID uuid.UUID, shareID uuid.UUID, recipientID uuid.UUID, initiatedBy uuid.UUID, action string) error {
	message := fmt.Sprintf("A vault share has been %s. Share ID: %s", action, shareID.String())

	notification := KeyChangeNotification{
		ID:               uuid.New(),
		VaultID:          vaultID,
		InitiatedBy:      initiatedBy,
		NotificationType: "share_update",
		Message:          message,
		CreatedAt:        time.Now(),
	}

	notifJSON, _ := json.Marshal(notification)

	_, err := ns.db.ExecContext(ctx,
		`INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address)
         VALUES ($1, 'share_update_notification', 'vault', $2, $3, '0.0.0.0')`,
		recipientID, vaultID, string(notifJSON),
	)

	if err != nil {
		log.Error().Err(err).Str("recipient_id", recipientID.String()).Str("vault_id", vaultID.String()).Msg("failed to store share update notification")
		return err
	}

	log.Info().Str("recipient_id", recipientID.String()).Str("vault_id", vaultID.String()).Str("action", action).Msg("share update notification sent")
	return nil
}
