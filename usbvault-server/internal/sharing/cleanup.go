package sharing

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// PH5-FIX: CleanupService manages automatic cleanup of expired shares
type CleanupService struct {
	pool *pgxpool.Pool
}

// PH5-FIX: NewCleanupService creates a new cleanup service
func NewCleanupService(pool *pgxpool.Pool) *CleanupService {
	return &CleanupService{pool: pool}
}

// PH5-FIX: CleanupExpiredShares deletes share records where expires_at < NOW()
// Uses batch deletion (LIMIT 100) to prevent locking and allows resuming cleanup
// Returns the count of deleted records
func (cs *CleanupService) CleanupExpiredShares(ctx context.Context) (int, error) {
	var totalDeleted int

	for {
		// PH5-FIX: Delete expired shares in batches to prevent locking
		result, err := cs.pool.Exec(ctx,
			`DELETE FROM share_records
			 WHERE expires_at IS NOT NULL AND expires_at < NOW()
			 LIMIT 100`,
		)

		if err != nil {
			log.Error().Err(err).Msg("failed to cleanup expired shares")
			return 0, fmt.Errorf("failed to cleanup expired shares: %w", err)
		}

		rowsDeleted := result.RowsAffected()
		if rowsDeleted == 0 {
			// No more rows to delete
			break
		}

		totalDeleted += int(rowsDeleted)
		log.Debug().Int64("batch_deleted", rowsDeleted).Int("total_deleted", totalDeleted).Msg("cleanup batch completed")

		// Break if we deleted fewer than the batch size (meaning we're done)
		if rowsDeleted < 100 {
			break
		}
	}

	if totalDeleted > 0 {
		log.Info().Int("deleted_count", totalDeleted).Msg("PH5-FIX: expired shares cleanup completed")
	}

	return totalDeleted, nil
}
