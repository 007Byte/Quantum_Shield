package gc

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// SessionCleanupJob deletes expired sessions in batches.
type SessionCleanupJob struct {
	pool *pgxpool.Pool
}

func NewSessionCleanupJob(pool *pgxpool.Pool) *SessionCleanupJob {
	return &SessionCleanupJob{pool: pool}
}

func (j *SessionCleanupJob) Name() string { return "expired_sessions" }

func (j *SessionCleanupJob) Run(ctx context.Context) (int, error) {
	total := 0
	batchSize := 500

	for {
		ct, err := j.pool.Exec(ctx,
			`DELETE FROM sessions
			 WHERE id IN (
			   SELECT id FROM sessions
			   WHERE expires_at < NOW()
			   ORDER BY expires_at ASC
			   LIMIT $1
			 )`, batchSize)
		if err != nil {
			return total, err
		}

		deleted := int(ct.RowsAffected())
		total += deleted

		if deleted > 0 {
			log.Debug().Int("batch_deleted", deleted).Msg("GC: session cleanup batch")
		}

		if deleted < batchSize {
			break
		}
	}

	return total, nil
}
