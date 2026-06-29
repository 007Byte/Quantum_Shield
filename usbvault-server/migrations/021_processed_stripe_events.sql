-- 021: Stripe webhook idempotency.
--
-- Stripe delivers webhook events at-least-once, and a captured, signature-valid request
-- can be replayed within the timestamp-tolerance window. Record each processed event id
-- so HandleWebhook processes every event at most once (an INSERT unique-violation on
-- event_id means the event was already handled). Idempotent so re-running is safe.
CREATE TABLE IF NOT EXISTS processed_stripe_events (
    event_id     TEXT PRIMARY KEY,
    event_type   TEXT,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
