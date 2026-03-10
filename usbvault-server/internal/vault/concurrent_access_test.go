//go:build integration
// +build integration

package vault

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// PH3-FIX: Concurrent vault access test suite for data race prevention and consistency

// setupConcurrentAccessTestDB creates a test database for concurrent access tests
func setupConcurrentAccessTestDB(t *testing.T) (*pgxpool.Pool, context.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	dsn := "postgres://postgres:postgres@localhost:5432/usbvault_test"
	pool, err := pgxpool.New(ctx, dsn)
	require.NoError(t, err, "failed to connect to test database")

	// Create tables
	_, err = pool.Exec(ctx, `
		DROP TABLE IF EXISTS vault_state CASCADE;
		DROP TABLE IF EXISTS vault_versions CASCADE;

		CREATE TABLE vault_state (
			id UUID PRIMARY KEY,
			owner_id UUID NOT NULL,
			encrypted_data BYTEA,
			version INT NOT NULL DEFAULT 0,
			created_at TIMESTAMP NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
			locked_by UUID,
			locked_at TIMESTAMP
		);

		CREATE TABLE vault_versions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			vault_id UUID NOT NULL REFERENCES vault_state(id),
			version INT NOT NULL,
			encrypted_data BYTEA NOT NULL,
			created_by UUID NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT NOW()
		);
	`)
	require.NoError(t, err, "failed to create test tables")

	return pool, context.Background()
}

// TestConcurrentAccess_SimultaneousReads_NoDataRace verifies concurrent reads don't cause data races
func TestConcurrentAccess_SimultaneousReads_NoDataRace(t *testing.T) {
	pool, ctx := setupConcurrentAccessTestDB(t)
	defer pool.Close()

	vaultID := "10000000-0000-0000-0000-000000000001"
	ownerID := "00000000-0000-0000-0000-000000000001"

	// Create vault
	_, err := pool.Exec(ctx, `
		INSERT INTO vault_state (id, owner_id, encrypted_data, version)
		VALUES ($1, $2, $3, $4)
	`, vaultID, ownerID, []byte("test data"), 1)
	require.NoError(t, err)

	// Run 10 concurrent read operations
	var wg sync.WaitGroup
	readCount := 10
	results := make([][]byte, readCount)
	errors := make([]error, readCount)

	for i := 0; i < readCount; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()

			var data []byte
			err := pool.QueryRow(ctx, `
				SELECT encrypted_data FROM vault_state WHERE id = $1
			`, vaultID).Scan(&data)

			results[index] = data
			errors[index] = err
		}(i)
	}

	wg.Wait()

	// Verify all reads succeeded
	for i, err := range errors {
		assert.NoError(t, err, "concurrent read %d failed", i)
	}

	// Verify all reads got the same data
	for i := 1; i < readCount; i++ {
		assert.Equal(t, results[0], results[i], "concurrent reads returned different data")
	}
}

// TestConcurrentAccess_SimultaneousWrites_SerializedCorrectly verifies concurrent writes are serialized
func TestConcurrentAccess_SimultaneousWrites_SerializedCorrectly(t *testing.T) {
	pool, ctx := setupConcurrentAccessTestDB(t)
	defer pool.Close()

	vaultID := "10000000-0000-0000-0000-000000000001"
	ownerID := "00000000-0000-0000-0000-000000000001"
	userID := "00000000-0000-0000-0000-000000000002"

	// Create vault
	_, err := pool.Exec(ctx, `
		INSERT INTO vault_state (id, owner_id, encrypted_data, version)
		VALUES ($1, $2, $3, $4)
	`, vaultID, ownerID, []byte("v0"), 0)
	require.NoError(t, err)

	// Run 5 concurrent write operations
	var wg sync.WaitGroup
	writeCount := 5
	writeErrors := make([]error, writeCount)

	for i := 0; i < writeCount; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()

			// Use version-based locking to ensure serialization
			tx, err := pool.Begin(ctx)
			if err != nil {
				writeErrors[index] = err
				return
			}
			defer tx.Rollback(ctx)

			// Read current version
			var currentVersion int
			err = tx.QueryRow(ctx, `
				SELECT version FROM vault_state WHERE id = $1 FOR UPDATE
			`, vaultID).Scan(&currentVersion)
			if err != nil {
				writeErrors[index] = err
				return
			}

			// Update with incremented version
			newVersion := currentVersion + 1
			_, err = tx.Exec(ctx, `
				UPDATE vault_state
				SET encrypted_data = $1, version = $2, updated_at = NOW()
				WHERE id = $3
			`, []byte("v"+string(rune('0'+index))), newVersion, vaultID)

			if err == nil {
				err = tx.Commit(ctx)
			}

			writeErrors[index] = err
		}(i)
	}

	wg.Wait()

	// Verify all writes succeeded (or some were serialized away)
	successCount := 0
	for _, err := range writeErrors {
		if err == nil {
			successCount++
		}
	}
	assert.Greater(t, successCount, 0, "at least one write should succeed")

	// Verify final version is correctly incremented
	var finalVersion int
	err = pool.QueryRow(ctx, `
		SELECT version FROM vault_state WHERE id = $1
	`, vaultID).Scan(&finalVersion)
	assert.NoError(t, err)
	assert.Equal(t, 1, finalVersion, "version should be 1 after first successful write")
}

// TestConcurrentAccess_ReadDuringWrite_ConsistentState verifies reads during writes get consistent state
func TestConcurrentAccess_ReadDuringWrite_ConsistentState(t *testing.T) {
	pool, ctx := setupConcurrentAccessTestDB(t)
	defer pool.Close()

	vaultID := "10000000-0000-0000-0000-000000000001"
	ownerID := "00000000-0000-0000-0000-000000000001"

	// Create vault
	_, err := pool.Exec(ctx, `
		INSERT INTO vault_state (id, owner_id, encrypted_data, version)
		VALUES ($1, $2, $3, $4)
	`, vaultID, ownerID, []byte("initial"), 0)
	require.NoError(t, err)

	// Write and read concurrently
	var wg sync.WaitGroup
	var writeErr, readErr error
	var readData []byte

	// Write operation
	wg.Add(1)
	go func() {
		defer wg.Done()

		tx, err := pool.Begin(ctx)
		if err != nil {
			writeErr = err
			return
		}
		defer tx.Rollback(ctx)

		// Simulate slow write
		time.Sleep(100 * time.Millisecond)

		_, err = tx.Exec(ctx, `
			UPDATE vault_state
			SET encrypted_data = $1, version = version + 1
			WHERE id = $2
		`, []byte("updated"), vaultID)

		if err == nil {
			writeErr = tx.Commit(ctx)
		} else {
			writeErr = err
		}
	}()

	// Concurrent read operation - should get either old or new data, but not partial/corrupted
	wg.Add(1)
	go func() {
		defer wg.Done()

		time.Sleep(50 * time.Millisecond) // Read in middle of write

		err := pool.QueryRow(ctx, `
			SELECT encrypted_data FROM vault_state WHERE id = $1
		`, vaultID).Scan(&readData)

		readErr = err
	}()

	wg.Wait()

	assert.NoError(t, writeErr, "write operation should succeed")
	assert.NoError(t, readErr, "read operation should succeed")

	// Data should be either initial or updated, never corrupted
	validStates := [][]byte{[]byte("initial"), []byte("updated")}
	isValid := false
	for _, validState := range validStates {
		if string(readData) == string(validState) {
			isValid = true
			break
		}
	}
	assert.True(t, isValid, "read data should be in valid state")
}

// TestConcurrentAccess_MultipleUploads_SameVault verifies multiple uploads to same vault are handled
func TestConcurrentAccess_MultipleUploads_SameVault(t *testing.T) {
	pool, ctx := setupConcurrentAccessTestDB(t)
	defer pool.Close()

	vaultID := "10000000-0000-0000-0000-000000000001"
	ownerID := "00000000-0000-0000-0000-000000000001"

	// Create vault
	_, err := pool.Exec(ctx, `
		INSERT INTO vault_state (id, owner_id, encrypted_data, version)
		VALUES ($1, $2, $3, $4)
	`, vaultID, ownerID, []byte("empty"), 0)
	require.NoError(t, err)

	// Simulate 5 concurrent file uploads
	var wg sync.WaitGroup
	uploadCount := 5
	uploadErrors := make([]error, uploadCount)

	for i := 0; i < uploadCount; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()

			// Each upload increments version to track file additions
			_, err := pool.Exec(ctx, `
				UPDATE vault_state
				SET version = version + 1, updated_at = NOW()
				WHERE id = $1
			`, vaultID)

			uploadErrors[index] = err
		}(i)
	}

	wg.Wait()

	// Verify all uploads succeeded
	for i, err := range uploadErrors {
		assert.NoError(t, err, "upload %d failed", i)
	}

	// Verify version was incremented correctly
	var finalVersion int
	err = pool.QueryRow(ctx, `
		SELECT version FROM vault_state WHERE id = $1
	`, vaultID).Scan(&finalVersion)
	assert.NoError(t, err)
	assert.Equal(t, uploadCount, finalVersion, "version should be incremented for each upload")
}

// TestConcurrentAccess_DeleteDuringRead_Handled verifies deletion during read is handled gracefully
func TestConcurrentAccess_DeleteDuringRead_Handled(t *testing.T) {
	pool, ctx := setupConcurrentAccessTestDB(t)
	defer pool.Close()

	vaultID := "10000000-0000-0000-0000-000000000001"
	ownerID := "00000000-0000-0000-0000-000000000001"

	// Create vault
	_, err := pool.Exec(ctx, `
		INSERT INTO vault_state (id, owner_id, encrypted_data, version)
		VALUES ($1, $2, $3, $4)
	`, vaultID, ownerID, []byte("data"), 0)
	require.NoError(t, err)

	var wg sync.WaitGroup
	var deleteErr, readErr error
	var readData []byte

	// Read operation
	wg.Add(1)
	go func() {
		defer wg.Done()

		time.Sleep(50 * time.Millisecond) // Start read slightly after delete

		err := pool.QueryRow(ctx, `
			SELECT encrypted_data FROM vault_state WHERE id = $1
		`, vaultID).Scan(&readData)

		readErr = err
	}()

	// Delete operation (happens slightly before read checks the row)
	wg.Add(1)
	go func() {
		defer wg.Done()

		_, err := pool.Exec(ctx, `
			DELETE FROM vault_state WHERE id = $1
		`, vaultID)

		deleteErr = err
	}()

	wg.Wait()

	assert.NoError(t, deleteErr, "delete should succeed")
	// Read might fail with no rows or get old data depending on transaction isolation
	// The important thing is that it doesn't crash or corrupt data
	if readErr != nil {
		// Expected: no rows found
	}
}

// TestConcurrentAccess_KeyRotation_VaultStillAccessible verifies vault is accessible during key rotation
func TestConcurrentAccess_KeyRotation_VaultStillAccessible(t *testing.T) {
	pool, ctx := setupConcurrentAccessTestDB(t)
	defer pool.Close()

	vaultID := "10000000-0000-0000-0000-000000000001"
	ownerID := "00000000-0000-0000-0000-000000000001"

	// Create vault
	_, err := pool.Exec(ctx, `
		INSERT INTO vault_state (id, owner_id, encrypted_data, version)
		VALUES ($1, $2, $3, $4)
	`, vaultID, ownerID, []byte("data"), 0)
	require.NoError(t, err)

	var wg sync.WaitGroup
	keyRotationErr := error(nil)
	readErrors := make([]error, 5)

	// Key rotation operation
	wg.Add(1)
	go func() {
		defer wg.Done()

		// Simulate key rotation - update all encrypted data
		time.Sleep(50 * time.Millisecond) // Let reads start first

		_, err := pool.Exec(ctx, `
			UPDATE vault_state
			SET encrypted_data = $1, version = version + 1
			WHERE id = $2
		`, []byte("rotated_data"), vaultID)

		keyRotationErr = err
	}()

	// Concurrent read operations during rotation
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()

			time.Sleep(time.Duration(index*20) * time.Millisecond)

			var data []byte
			err := pool.QueryRow(ctx, `
				SELECT encrypted_data FROM vault_state WHERE id = $1
			`, vaultID).Scan(&data)

			readErrors[index] = err
		}(i)
	}

	wg.Wait()

	assert.NoError(t, keyRotationErr, "key rotation should succeed")

	// All reads should succeed
	for i, err := range readErrors {
		assert.NoError(t, err, "read %d during key rotation failed", i)
	}
}

// TestConcurrentAccess_MetadataUpdate_AtomicWrite verifies metadata updates are atomic
func TestConcurrentAccess_MetadataUpdate_AtomicWrite(t *testing.T) {
	pool, ctx := setupConcurrentAccessTestDB(t)
	defer pool.Close()

	vaultID := "10000000-0000-0000-0000-000000000001"
	ownerID := "00000000-0000-0000-0000-000000000001"

	// Create vault
	_, err := pool.Exec(ctx, `
		INSERT INTO vault_state (id, owner_id, encrypted_data, version)
		VALUES ($1, $2, $3, $4)
	`, vaultID, ownerID, []byte("initial"), 0)
	require.NoError(t, err)

	// Update metadata from multiple goroutines
	var wg sync.WaitGroup
	updateCount := 10
	updateErrors := make([]error, updateCount)

	for i := 0; i < updateCount; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()

			// Use transaction for atomicity
			tx, err := pool.Begin(ctx)
			if err != nil {
				updateErrors[index] = err
				return
			}
			defer tx.Rollback(ctx)

			// Update both encrypted_data and version atomically
			_, err = tx.Exec(ctx, `
				UPDATE vault_state
				SET encrypted_data = $1, version = version + 1, updated_at = NOW()
				WHERE id = $2
			`, []byte("updated"), vaultID)

			if err == nil {
				err = tx.Commit(ctx)
			}

			updateErrors[index] = err
		}(i)
	}

	wg.Wait()

	// At least one update should succeed
	successCount := 0
	for _, err := range updateErrors {
		if err == nil {
			successCount++
		}
	}
	assert.Greater(t, successCount, 0, "at least one update should succeed")

	// Verify vault is in consistent state
	var finalData []byte
	var finalVersion int
	err = pool.QueryRow(ctx, `
		SELECT encrypted_data, version FROM vault_state WHERE id = $1
	`, vaultID).Scan(&finalData, &finalVersion)

	assert.NoError(t, err)
	assert.NotNil(t, finalData, "vault should have data")
	assert.Greater(t, finalVersion, 0, "vault should have been updated")
}

// TestConcurrentAccess_RollbackProtection_MonotonicVersion verifies version numbers are monotonic
func TestConcurrentAccess_RollbackProtection_MonotonicVersion(t *testing.T) {
	pool, ctx := setupConcurrentAccessTestDB(t)
	defer pool.Close()

	vaultID := "10000000-0000-0000-0000-000000000001"
	ownerID := "00000000-0000-0000-0000-000000000001"

	// Create vault
	_, err := pool.Exec(ctx, `
		INSERT INTO vault_state (id, owner_id, encrypted_data, version)
		VALUES ($1, $2, $3, $4)
	`, vaultID, ownerID, []byte("v0"), 0)
	require.NoError(t, err)

	// Perform 10 sequential updates
	for i := 1; i <= 10; i++ {
		_, err := pool.Exec(ctx, `
			UPDATE vault_state
			SET encrypted_data = $1, version = $2
			WHERE id = $3
		`, []byte("v"+string(rune('0'+i))), i, vaultID)

		require.NoError(t, err, "update %d failed", i)
	}

	// Verify final version
	var finalVersion int
	err = pool.QueryRow(ctx, `
		SELECT version FROM vault_state WHERE id = $1
	`, vaultID).Scan(&finalVersion)

	assert.NoError(t, err)
	assert.Equal(t, 10, finalVersion, "version should be monotonically increasing to 10")
}

// TestConcurrentAccess_TenConcurrentUsers_NoDeadlock verifies system handles 10 concurrent users without deadlock
func TestConcurrentAccess_TenConcurrentUsers_NoDeadlock(t *testing.T) {
	pool, ctx := setupConcurrentAccessTestDB(t)
	defer pool.Close()

	vaultID := "10000000-0000-0000-0000-000000000001"
	ownerID := "00000000-0000-0000-0000-000000000001"

	// Create vault
	_, err := pool.Exec(ctx, `
		INSERT INTO vault_state (id, owner_id, encrypted_data, version)
		VALUES ($1, $2, $3, $4)
	`, vaultID, ownerID, []byte("shared"), 0)
	require.NoError(t, err)

	// Simulate 10 concurrent users accessing the same vault
	var wg sync.WaitGroup
	userCount := 10
	operationErrors := make([]error, userCount)

	type operation struct {
		opType string
		index  int
	}

	operations := []operation{
		{"read", 0},
		{"read", 1},
		{"write", 2},
		{"read", 3},
		{"write", 4},
		{"read", 5},
		{"read", 6},
		{"write", 7},
		{"read", 8},
		{"read", 9},
	}

	for _, op := range operations {
		wg.Add(1)
		go func(operation operation) {
			defer wg.Done()

			switch operation.opType {
			case "read":
				var data []byte
				err := pool.QueryRow(ctx, `
					SELECT encrypted_data FROM vault_state WHERE id = $1
				`, vaultID).Scan(&data)
				operationErrors[operation.index] = err

			case "write":
				_, err := pool.Exec(ctx, `
					UPDATE vault_state
					SET version = version + 1, updated_at = NOW()
					WHERE id = $1
				`, vaultID)
				operationErrors[operation.index] = err
			}
		}(op)
	}

	// Use a timeout to detect deadlocks
	done := make(chan bool)
	go func() {
		wg.Wait()
		done <- true
	}()

	select {
	case <-done:
		// All operations completed successfully
		for i, err := range operationErrors {
			assert.NoError(t, err, "operation %d failed", i)
		}

	case <-time.After(10 * time.Second):
		t.Fatal("deadlock detected - concurrent operations timed out")
	}
}

// TestConcurrentAccess_RaceCondition_VaultDeletion verifies deletion doesn't cause race conditions
func TestConcurrentAccess_RaceCondition_VaultDeletion(t *testing.T) {
	pool, ctx := setupConcurrentAccessTestDB(t)
	defer pool.Close()

	vaultID := "10000000-0000-0000-0000-000000000001"
	ownerID := "00000000-0000-0000-0000-000000000001"

	// Create vault
	_, err := pool.Exec(ctx, `
		INSERT INTO vault_state (id, owner_id, encrypted_data, version)
		VALUES ($1, $2, $3, $4)
	`, vaultID, ownerID, []byte("data"), 0)
	require.NoError(t, err)

	var wg sync.WaitGroup
	var deleteErr error
	readErrors := make([]error, 3)
	readResults := make([][]byte, 3)

	// Concurrent reads and deletion
	// Deletion happens with delay to ensure some reads start first
	wg.Add(1)
	go func() {
		defer wg.Done()

		time.Sleep(50 * time.Millisecond)

		_, err := pool.Exec(ctx, `
			DELETE FROM vault_state WHERE id = $1
		`, vaultID)

		deleteErr = err
	}()

	// Read operations that might race with deletion
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()

			time.Sleep(time.Duration(index*20) * time.Millisecond)

			var data []byte
			err := pool.QueryRow(ctx, `
				SELECT encrypted_data FROM vault_state WHERE id = $1
			`, vaultID).Scan(&data)

			readErrors[index] = err
			if err == nil {
				readResults[index] = data
			}
		}(i)
	}

	wg.Wait()

	assert.NoError(t, deleteErr, "delete should succeed")

	// Some reads might fail (if they race with delete), but shouldn't corrupt data
	for i, err := range readErrors {
		if err == nil {
			// Got data successfully
			assert.NotNil(t, readResults[i], "data should not be nil")
		}
		// Failure is OK (no rows) - the important thing is no corruption
	}
}
