-- 020: add accepted_at to share_records.
--
-- AcceptShare runs `UPDATE share_records SET accepted_at = NOW() WHERE id = $1 AND
-- recipient_id = $2`, but share_records never had an accepted_at column (it existed only
-- on vault_members), so every share-acceptance errored. Add the column the code targets.
-- Idempotent so re-running the migration is safe.
ALTER TABLE share_records ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE;
