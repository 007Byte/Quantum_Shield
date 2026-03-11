package migrations

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// Migration represents a database migration
type Migration struct {
	Version int
	Name    string
	SQL     string
}

// Migrator handles database migrations using pgxpool
type Migrator struct {
	pool          *pgxpool.Pool
	migrationsDir string
}

// NewMigrator creates a new migrator instance
func NewMigrator(pool *pgxpool.Pool, migrationsDir string) *Migrator {
	return &Migrator{
		pool:          pool,
		migrationsDir: migrationsDir,
	}
}

// Migrate runs all pending migrations
func (m *Migrator) Migrate(ctx context.Context) error {
	// Create schema_migrations table if it doesn't exist
	if err := m.createMigrationsTable(ctx); err != nil {
		return fmt.Errorf("failed to create migrations table: %w", err)
	}

	// Read all migration files
	migrations, err := m.readMigrations()
	if err != nil {
		return fmt.Errorf("failed to read migrations: %w", err)
	}

	// Get already applied migrations
	appliedVersions, err := m.getAppliedVersions(ctx)
	if err != nil {
		return fmt.Errorf("failed to get applied versions: %w", err)
	}

	applied := 0
	for _, migration := range migrations {
		if _, exists := appliedVersions[migration.Version]; !exists {
			if err := m.applyMigration(ctx, migration); err != nil {
				return fmt.Errorf("failed to apply migration %d (%s): %w", migration.Version, migration.Name, err)
			}
			log.Info().Int("version", migration.Version).Str("name", migration.Name).Msg("applied migration")
			applied++
		}
	}

	if applied == 0 {
		log.Info().Msg("database schema is up to date")
	} else {
		log.Info().Int("applied", applied).Msg("migrations completed")
	}

	return nil
}

// createMigrationsTable creates the schema_migrations table if it doesn't exist
func (m *Migrator) createMigrationsTable(ctx context.Context) error {
	query := `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INT PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`
	_, err := m.pool.Exec(ctx, query)
	return err
}

// readMigrations reads all SQL migration files from the migrations directory
func (m *Migrator) readMigrations() ([]Migration, error) {
	var migrations []Migration

	entries, err := os.ReadDir(m.migrationsDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read migrations directory %s: %w", m.migrationsDir, err)
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		// Parse filename: NNN_name.sql
		parts := strings.SplitN(entry.Name(), "_", 2)
		if len(parts) != 2 {
			continue
		}

		version := 0
		_, err := fmt.Sscanf(parts[0], "%d", &version)
		if err != nil {
			continue
		}

		// Read file content
		filePath := filepath.Join(m.migrationsDir, entry.Name())
		content, err := os.ReadFile(filePath)
		if err != nil {
			return nil, fmt.Errorf("failed to read migration file %s: %w", entry.Name(), err)
		}

		name := strings.TrimSuffix(parts[1], ".sql")
		migrations = append(migrations, Migration{
			Version: version,
			Name:    name,
			SQL:     string(content),
		})
	}

	// Sort migrations by version, then by name for stable ordering of same-version files
	sort.Slice(migrations, func(i, j int) bool {
		if migrations[i].Version != migrations[j].Version {
			return migrations[i].Version < migrations[j].Version
		}
		return migrations[i].Name < migrations[j].Name
	})

	// Deduplicate: keep only the first migration per version
	seen := make(map[int]bool)
	var deduped []Migration
	for _, mig := range migrations {
		if !seen[mig.Version] {
			seen[mig.Version] = true
			deduped = append(deduped, mig)
		}
	}

	return deduped, nil
}

// getAppliedVersions returns a map of applied migration versions
func (m *Migrator) getAppliedVersions(ctx context.Context) (map[int]bool, error) {
	applied := make(map[int]bool)

	rows, err := m.pool.Query(ctx, "SELECT version FROM schema_migrations")
	if err != nil {
		if strings.Contains(err.Error(), "does not exist") {
			return applied, nil
		}
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var version int
		if err := rows.Scan(&version); err != nil {
			return nil, err
		}
		applied[version] = true
	}

	return applied, rows.Err()
}

// applyMigration applies a single migration within a transaction
func (m *Migrator) applyMigration(ctx context.Context, migration Migration) error {
	tx, err := m.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Execute the migration SQL
	if _, err := tx.Exec(ctx, migration.SQL); err != nil {
		return fmt.Errorf("SQL error: %w", err)
	}

	// Record the migration
	if _, err := tx.Exec(ctx,
		`INSERT INTO schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING`,
		migration.Version, migration.Name,
	); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// GetStatus returns the current migration status
func (m *Migrator) GetStatus(ctx context.Context) (map[string]interface{}, error) {
	migrations, err := m.readMigrations()
	if err != nil {
		return nil, err
	}

	applied, err := m.getAppliedVersions(ctx)
	if err != nil {
		return nil, err
	}

	pending := 0
	for _, mig := range migrations {
		if !applied[mig.Version] {
			pending++
		}
	}

	return map[string]interface{}{
		"total":   len(migrations),
		"applied": len(applied),
		"pending": pending,
	}, nil
}
