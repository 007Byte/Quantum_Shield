package notify

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
)

type Device struct {
	ID           int    `json:"id"`
	UserID       string `json:"user_id"`
	DeviceToken  string `json:"-"` // Never expose
	Platform     string `json:"platform"` // "ios" or "android"
	RegisteredAt time.Time `json:"registered_at"`
}

type NotifyService struct {
	pool *pgxpool.Pool
	// APNs and FCM clients would be initialized here
}

func NewNotifyService(pool *pgxpool.Pool) *NotifyService {
	return &NotifyService{
		pool: pool,
	}
}

func (ns *NotifyService) RegisterDevice(ctx context.Context, pool *pgxpool.Pool, userID, deviceToken, platform string) error {
	_, err := pool.Exec(ctx,
		`INSERT INTO devices (user_id, device_token, platform, registered_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, device_token) DO UPDATE SET platform = $3`,
		userID, deviceToken, platform,
	)

	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Str("platform", platform).Msg("failed to register device")
		return err
	}

	log.Info().Str("user_id", userID).Str("platform", platform).Msg("device registered")
	return nil
}

func (ns *NotifyService) SendNotification(ctx context.Context, pool *pgxpool.Pool, userID, title, body string) error {
	// Retrieve user's devices
	rows, err := pool.Query(ctx,
		`SELECT device_token, platform FROM devices WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	var deviceTokens []struct {
		Token    string
		Platform string
	}

	for rows.Next() {
		var token, platform string
		if err := rows.Scan(&token, &platform); err != nil {
			continue
		}
		deviceTokens = append(deviceTokens, struct {
			Token    string
			Platform string
		}{token, platform})
	}

	// Send to each device (simplified)
	for _, device := range deviceTokens {
		switch device.Platform {
		case "ios":
			// Send via APNs
			log.Debug().Str("user_id", userID).Msg("sending iOS notification")

		case "android":
			// Send via FCM
			log.Debug().Str("user_id", userID).Msg("sending Android notification")
		}
	}

	log.Info().Str("user_id", userID).Int("device_count", len(deviceTokens)).Msg("notifications sent")
	return nil
}

// UnregisterDevice removes a device token for a user (e.g., on logout).
func (ns *NotifyService) UnregisterDevice(ctx context.Context, userID, deviceToken string) error {
	_, err := ns.pool.Exec(ctx,
		`DELETE FROM devices WHERE user_id = $1 AND device_token = $2`,
		userID, deviceToken,
	)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("failed to unregister device")
		return err
	}
	log.Info().Str("user_id", userID).Msg("device unregistered")
	return nil
}

// SendNewDeviceAlert notifies the user that a new device was used to log in.
func (ns *NotifyService) SendNewDeviceAlert(ctx context.Context, userID, deviceInfo string) error {
	return ns.SendNotification(ctx, ns.pool, userID,
		"New Device Login",
		"Your account was accessed from a new device: "+deviceInfo+". If this wasn't you, change your password immediately.",
	)
}

// SendSecurityAlert sends a generic security notification to the user.
func (ns *NotifyService) SendSecurityAlert(ctx context.Context, userID, title, detail string) error {
	return ns.SendNotification(ctx, ns.pool, userID, title, detail)
}

// HTTP Handlers

type RegisterDeviceRequest struct {
	DeviceToken string `json:"device_token"`
	Platform    string `json:"platform"`
}

func HandleRegisterDevice(ns *NotifyService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req RegisterDeviceRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		if err := ns.RegisterDevice(r.Context(), ns.pool, userID, req.DeviceToken, req.Platform); err != nil {
			http.Error(w, "failed to register device", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"status": "registered"})

		log.Info().Str("user_id", userID).Str("platform", req.Platform).Msg("device registered")
	}
}

type UnregisterDeviceRequest struct {
	DeviceToken string `json:"device_token"`
}

func HandleUnregisterDevice(ns *NotifyService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req UnregisterDeviceRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		if err := ns.UnregisterDevice(r.Context(), userID, req.DeviceToken); err != nil {
			http.Error(w, "failed to unregister device", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "unregistered"})
	}
}
