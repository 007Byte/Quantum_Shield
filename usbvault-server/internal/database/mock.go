package database

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// PH4-FIX: Mock database for unit testing
// Implements Pool interface for testing without a real database connection

// MockDB implements Pool for testing without a real database connection
type MockDB struct {
	QueryFunc    func(ctx context.Context, sql string, args ...interface{}) (pgx.Rows, error)
	QueryRowFunc func(ctx context.Context, sql string, args ...interface{}) pgx.Row
	ExecFunc     func(ctx context.Context, sql string, args ...interface{}) (pgconn.CommandTag, error)
	BeginFunc    func(ctx context.Context) (pgx.Tx, error)
	CloseFunc    func()
	PingFunc     func(ctx context.Context) error
}

// Query executes a query that returns rows
func (m *MockDB) Query(ctx context.Context, sql string, args ...interface{}) (pgx.Rows, error) {
	if m.QueryFunc != nil {
		return m.QueryFunc(ctx, sql, args...)
	}
	return nil, nil
}

// QueryRow executes a query that returns a single row
func (m *MockDB) QueryRow(ctx context.Context, sql string, args ...interface{}) pgx.Row {
	if m.QueryRowFunc != nil {
		return m.QueryRowFunc(ctx, sql, args...)
	}
	return nil
}

// Exec executes a command without returning rows
func (m *MockDB) Exec(ctx context.Context, sql string, args ...interface{}) (pgconn.CommandTag, error) {
	if m.ExecFunc != nil {
		return m.ExecFunc(ctx, sql, args...)
	}
	return pgconn.CommandTag{}, nil
}

// Begin starts a transaction
func (m *MockDB) Begin(ctx context.Context) (pgx.Tx, error) {
	if m.BeginFunc != nil {
		return m.BeginFunc(ctx)
	}
	return nil, nil
}

// Close closes the connection pool
func (m *MockDB) Close() {
	if m.CloseFunc != nil {
		m.CloseFunc()
	}
}

// Ping verifies that the database connection is working
func (m *MockDB) Ping(ctx context.Context) error {
	if m.PingFunc != nil {
		return m.PingFunc(ctx)
	}
	return nil
}

// MockVaultRepository implements VaultRepository for testing
type MockVaultRepository struct {
	CreateVaultFunc func(ctx context.Context, ownerID string, encryptedMetadata []byte) (string, error)
	GetVaultFunc    func(ctx context.Context, vaultID string) (*VaultRecord, error)
	ListVaultsFunc  func(ctx context.Context, ownerID string) ([]VaultRecord, error)
	UpdateVaultFunc func(ctx context.Context, vaultID string, encryptedMetadata []byte) error
	DeleteVaultFunc func(ctx context.Context, vaultID string) error
}

// CreateVault creates a new vault
func (m *MockVaultRepository) CreateVault(ctx context.Context, ownerID string, encryptedMetadata []byte) (string, error) {
	if m.CreateVaultFunc != nil {
		return m.CreateVaultFunc(ctx, ownerID, encryptedMetadata)
	}
	return "", nil
}

// GetVault retrieves a vault by ID
func (m *MockVaultRepository) GetVault(ctx context.Context, vaultID string) (*VaultRecord, error) {
	if m.GetVaultFunc != nil {
		return m.GetVaultFunc(ctx, vaultID)
	}
	return nil, nil
}

// ListVaults lists all vaults for a user
func (m *MockVaultRepository) ListVaults(ctx context.Context, ownerID string) ([]VaultRecord, error) {
	if m.ListVaultsFunc != nil {
		return m.ListVaultsFunc(ctx, ownerID)
	}
	return []VaultRecord{}, nil
}

// UpdateVault updates a vault's metadata
func (m *MockVaultRepository) UpdateVault(ctx context.Context, vaultID string, encryptedMetadata []byte) error {
	if m.UpdateVaultFunc != nil {
		return m.UpdateVaultFunc(ctx, vaultID, encryptedMetadata)
	}
	return nil
}

// DeleteVault soft-deletes a vault
func (m *MockVaultRepository) DeleteVault(ctx context.Context, vaultID string) error {
	if m.DeleteVaultFunc != nil {
		return m.DeleteVaultFunc(ctx, vaultID)
	}
	return nil
}
