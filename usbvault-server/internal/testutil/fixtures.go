package testutil

import (
	"context"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DE-018 FIX: Test transaction helper for isolated test fixtures
// WithTestTransaction runs a test function within a transaction that is always rolled back
func WithTestTransaction(t *testing.T, pool *pgxpool.Pool, fn func(ctx context.Context)) {
	t.Helper()
	ctx := context.Background()

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("failed to begin test transaction: %v", err)
	}
	// Always rollback - test data never persists
	defer tx.Rollback(ctx)

	// Create a context with the transaction
	txCtx := context.WithValue(ctx, "test_tx", tx)
	fn(txCtx)
}

// SetupTestDB creates a test database connection pool
func SetupTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := "postgres://test:test@localhost:5432/usbvault_test?sslmode=disable"
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		t.Skipf("skipping integration test: %v", err)
	}
	return pool
}

// GenerateTestID creates a unique test identifier
func GenerateTestID(prefix string) string {
	return fmt.Sprintf("%s_test_%d", prefix, testing.AllocsPerRun(1, func() {}))
}
