-- PH1-FIX: Add missing billing columns for scheduled operations
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS downgrade_scheduled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS downgrade_to_tier subscription_tier;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_interval VARCHAR(20) DEFAULT 'month';

-- Index for scheduled downgrade processing
CREATE INDEX IF NOT EXISTS idx_subscriptions_pending_downgrade
    ON subscriptions(downgrade_scheduled_at)
    WHERE downgrade_scheduled_at IS NOT NULL AND status = 'active';
