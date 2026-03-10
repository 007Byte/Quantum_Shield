package audit

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// PH6-FIX: Anomaly detection service for detecting unusual access patterns
type AnomalyDetectionService struct {
	pool *pgxpool.Pool
}

func NewAnomalyDetectionService(pool *pgxpool.Pool) *AnomalyDetectionService {
	return &AnomalyDetectionService{pool: pool}
}

// PH6-FIX: Alert types for anomaly detection
const (
	AlertUnusualHours        = "UNUSUAL_HOURS"
	AlertExcessiveFailures   = "EXCESSIVE_FAILURES"
	AlertRapidGeoChange      = "RAPID_GEO_CHANGE"
	AlertHighFrequencyAccess = "HIGH_FREQUENCY_ACCESS"
)

// PH6-FIX: AnomalyAlert represents a detected security anomaly
type AnomalyAlert struct {
	ID          int64     `json:"id"`
	UserID      string    `json:"user_id"`
	AlertType   string    `json:"alert_type"`
	Severity    string    `json:"severity"`
	Description string    `json:"description"`
	DetectedAt  time.Time `json:"detected_at"`
	Acknowledged bool     `json:"acknowledged"`
}

// PH6-FIX: DetectUnusualAccessPatterns analyzes recent security events for anomalies
func (ads *AnomalyDetectionService) DetectUnusualAccessPatterns(ctx context.Context, userID string) ([]AnomalyAlert, error) {
	var alerts []AnomalyAlert

	// Query recent security events for the user (last 24 hours)
	rows, err := ads.pool.Query(ctx,
		`SELECT event_type, severity, source_ip, outcome, timestamp
		 FROM security_events
		 WHERE user_id = $1 AND timestamp > NOW() - INTERVAL '24 hours'
		 ORDER BY timestamp DESC`,
		userID,
	)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("PH6-FIX: failed to query security events for anomaly detection")
		return nil, err
	}
	defer rows.Close()

	type EventRecord struct {
		EventType string
		Severity  string
		SourceIP  string
		Outcome   string
		Timestamp time.Time
	}

	var events []EventRecord
	for rows.Next() {
		var e EventRecord
		if err := rows.Scan(&e.EventType, &e.Severity, &e.SourceIP, &e.Outcome, &e.Timestamp); err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("PH6-FIX: error scanning event record")
			return nil, err
		}
		events = append(events, e)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	now := time.Now().UTC()

	// Check for unusual hour access (outside 6am-10pm)
	for _, event := range events {
		hour := event.Timestamp.Hour()
		if hour < 6 || hour >= 22 {
			alerts = append(alerts, AnomalyAlert{
				UserID:      userID,
				AlertType:   AlertUnusualHours,
				Severity:    SeverityWarn,
				Description: fmt.Sprintf("Access at unusual hour (%d:00) from %s", hour, event.SourceIP),
				DetectedAt:  now,
				Acknowledged: false,
			})
			break // Only alert once per detection type per call
		}
	}

	// Check for excessive failed auth (>5 in 10 minutes)
	failureCount := 0
	var lastFailureTime time.Time
	for _, event := range events {
		if event.EventType == EventAuthFailed && event.Outcome == "failure" {
			if lastFailureTime.IsZero() || now.Sub(event.Timestamp) <= 10*time.Minute {
				failureCount++
				lastFailureTime = event.Timestamp
			}
		}
	}
	if failureCount > 5 {
		alerts = append(alerts, AnomalyAlert{
			UserID:      userID,
			AlertType:   AlertExcessiveFailures,
			Severity:    SeverityCritical,
			Description: fmt.Sprintf("%d failed authentication attempts in 10 minutes", failureCount),
			DetectedAt:  now,
			Acknowledged: false,
		})
	}

	// Check for rapid geo changes (different IPs in different subnets within 5 minutes)
	if len(events) >= 2 {
		for i := 0; i < len(events)-1; i++ {
			if now.Sub(events[i].Timestamp) <= 5*time.Minute {
				if !isSameSubnet(events[i].SourceIP, events[i+1].SourceIP) {
					alerts = append(alerts, AnomalyAlert{
						UserID:      userID,
						AlertType:   AlertRapidGeoChange,
						Severity:    SeverityWarn,
						Description: fmt.Sprintf("Rapid geographic change detected: %s to %s within 5 minutes", events[i].SourceIP, events[i+1].SourceIP),
						DetectedAt:  now,
						Acknowledged: false,
					})
					break
				}
			}
		}
	}

	// Check for high-frequency data access (>100 in 5 minutes)
	accessCount := 0
	var lastAccessTime time.Time
	for _, event := range events {
		if event.EventType == EventDataAccess {
			if lastAccessTime.IsZero() || now.Sub(event.Timestamp) <= 5*time.Minute {
				accessCount++
				lastAccessTime = event.Timestamp
			}
		}
	}
	if accessCount > 100 {
		alerts = append(alerts, AnomalyAlert{
			UserID:      userID,
			AlertType:   AlertHighFrequencyAccess,
			Severity:    SeverityWarn,
			Description: fmt.Sprintf("%d data access events in 5 minutes - possible data exfiltration", accessCount),
			DetectedAt:  now,
			Acknowledged: false,
		})
	}

	return alerts, nil
}

// PH6-FIX: isSameSubnet checks if two IP addresses are in the same /24 subnet
func isSameSubnet(ip1, ip2 string) bool {
	net1 := net.ParseIP(ip1)
	net2 := net.ParseIP(ip2)

	if net1 == nil || net2 == nil {
		return false
	}

	// For IPv4, check /24 subnet
	if net1.To4() != nil && net2.To4() != nil {
		return net1.String()[:len(net1.String())-2] == net2.String()[:len(net2.String())-2]
	}

	return net1.String() == net2.String()
}

// PH6-FIX: RecordAnomaly stores detected anomalies in the database
func (ads *AnomalyDetectionService) RecordAnomaly(ctx context.Context, alert AnomalyAlert) error {
	if alert.DetectedAt.IsZero() {
		alert.DetectedAt = time.Now().UTC()
	}

	_, err := ads.pool.Exec(ctx,
		`INSERT INTO anomaly_alerts (user_id, alert_type, severity, description, detected_at, acknowledged)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		alert.UserID, alert.AlertType, alert.Severity, alert.Description,
		alert.DetectedAt, alert.Acknowledged,
	)

	if err != nil {
		log.Error().Err(err).Str("user_id", alert.UserID).Str("alert_type", alert.AlertType).
			Msg("PH6-FIX: failed to record anomaly alert")
		return err
	}

	log.Info().
		Str("user_id", alert.UserID).
		Str("alert_type", alert.AlertType).
		Str("severity", alert.Severity).
		Msg("PH6-FIX: anomaly alert recorded")

	return nil
}

// PH6-FIX: HandleGetAnomalies is the HTTP handler for listing anomalies
func HandleGetAnomalies(ads *AnomalyDetectionService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value("user_id").(string)
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

		rows, err := ads.pool.Query(r.Context(),
			`SELECT id, user_id, alert_type, severity, description, detected_at, acknowledged
			 FROM anomaly_alerts
			 WHERE user_id = $1
			 ORDER BY detected_at DESC
			 LIMIT $2 OFFSET $3`,
			userID, limit, offset,
		)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("PH6-FIX: failed to query anomaly alerts")
			http.Error(w, "failed to list anomalies", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var alerts []AnomalyAlert
		for rows.Next() {
			var a AnomalyAlert
			if err := rows.Scan(&a.ID, &a.UserID, &a.AlertType, &a.Severity, &a.Description, &a.DetectedAt, &a.Acknowledged); err != nil {
				log.Error().Err(err).Msg("PH6-FIX: error scanning anomaly alert")
				http.Error(w, "failed to scan alerts", http.StatusInternalServerError)
				return
			}
			alerts = append(alerts, a)
		}

		if err := rows.Err(); err != nil {
			log.Error().Err(err).Msg("PH6-FIX: error iterating anomaly alerts")
			http.Error(w, "failed to iterate alerts", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"alerts": alerts,
			"limit":  limit,
			"offset": offset,
		})
	}
}
