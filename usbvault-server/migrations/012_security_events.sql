-- Migration 012: Create security_events table
-- This table was referenced in migration 003 (index) and multiple services
-- (audit/service.go, audit/anomaly.go, audit/compliance.go) but never created.

CREATE TABLE IF NOT EXISTS security_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    source_ip VARCHAR(45),
    user_agent TEXT,
    user_id VARCHAR(36),
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    outcome VARCHAR(20) NOT NULL DEFAULT 'success',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_security_events_timestamp ON security_events (timestamp);
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events (event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events (severity) WHERE severity IN ('critical', 'high');
CREATE INDEX IF NOT EXISTS idx_security_events_outcome ON security_events (outcome) WHERE outcome = 'failure';

-- Partitioning comment: For high-volume production deployments, consider
-- converting to a partitioned table (PARTITION BY RANGE (timestamp)) with
-- monthly partitions, similar to audit_log.

COMMENT ON TABLE security_events IS 'SOC 2 compliant security event log for anomaly detection and compliance reporting';
COMMENT ON COLUMN security_events.severity IS 'Event severity: info, low, medium, high, critical';
COMMENT ON COLUMN security_events.outcome IS 'Event outcome: success, failure, blocked';
COMMENT ON COLUMN security_events.details IS 'JSON payload with full event details for forensic analysis';
