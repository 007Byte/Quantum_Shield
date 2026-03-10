// Package database provides data access abstractions and interfaces for database operations.
//
// Features:
//   - Database abstraction interfaces for dependency injection
//   - Supports testing with mock implementations
//   - Repository pattern for domain-specific data operations
//   - Transaction support with context-based cancellation
//
// PH4-FIX: Database abstraction interfaces for dependency injection.
// This enables testing without a real database and simplifies future DB migrations.
package database

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// QueryExecutor abstracts basic database query operations.
// Implemented by pgxpool.Pool and single pgx.Conn for transaction support.
type QueryExecutor interface {
	Query(ctx context.Context, sql string, args ...interface{}) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...interface{}) pgx.Row
	Exec(ctx context.Context, sql string, args ...interface{}) (pgconn.CommandTag, error)
}

// TransactionExecutor extends QueryExecutor with transaction support.
// Allows executing queries within a database transaction context.
type TransactionExecutor interface {
	QueryExecutor
	Begin(ctx context.Context) (pgx.Tx, error)
}

// Pool represents a full database connection pool (pgxpool.Pool satisfies this interface).
// Supports transactions, pinging, and connection lifecycle management.
type Pool interface {
	TransactionExecutor
	Close()
	Ping(ctx context.Context) error
}

// VaultRepository defines data access operations for vaults.
// PH4-FIX: Repository pattern for vault operations with interface-based abstraction.
type VaultRepository interface {
	CreateVault(ctx context.Context, ownerID string, encryptedMetadata []byte) (string, error)
	GetVault(ctx context.Context, vaultID string) (*VaultRecord, error)
	ListVaults(ctx context.Context, ownerID string) ([]VaultRecord, error)
	UpdateVault(ctx context.Context, vaultID string, encryptedMetadata []byte) error
	DeleteVault(ctx context.Context, vaultID string) error
}

// VaultRecord represents a vault record retrieved from the database.
//
// Fields:
//   - ID: Vault unique identifier
//   - OwnerID: User who owns the vault
//   - EncryptedMetadata: Binary encrypted vault metadata
//   - CreatedAt: ISO 8601 creation timestamp
//   - UpdatedAt: ISO 8601 last modification timestamp
type VaultRecord struct {
	ID                string
	OwnerID           string
	EncryptedMetadata []byte
	CreatedAt         string
	UpdatedAt         string
}
