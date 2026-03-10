package migrations

import (
	"database/sql"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Migration represents a database migration
type Migration struct {
	Version int
	Name    string
	SQL     string
}

// Migrator handles database migrations
type Migrator struct {
	db            *sql.DB
	migrationsDir string
}

// NewMigrator creates a new migrator instance
func NewMigrator(db *sql.DB, migrationsDir string) *Migrator {
	return &Migrator{
		db:            db,
		migrationsDir: migrationsDir,
	}
}

// Migrate runs all pending migrations
func (m *Migrator) Migrate() error {
	// Create schema_migrations table if it doesn't exist
	if err := m.createMigrationsTable(); err != nil {
		return fmt.Errorf("failed to create migrations table: %w", err)
	}

	// Read all migration files
	migrations, err := m.readMigrations()
	if err != nil {
		return fmt.Errorf("failed to read migrations: %w", err)
	}

	// Get already applied migrations
	appliedVersions, err := m.getAppliedVersions()
	if err != nil {
		return fmt.Errorf("failed to get applied versions: %w", err)
	}

	// Apply pending migrations
	for _, migration := range migrations {
		if _, exists := appliedVersions[migration.Version]; !exists {
			if err := m.applyMigration(migration); err != nil {
				return fmt.Errorf("failed to apply migration %d (%s): %w", migration.Version, migration.Name, err)
			}
			log.Printf("Applied migration: %d_%s\n", migration.Version, migration.Name)
		}
	}

	return nil
}

// createMigrationsTable creates the schema_migrations table if it doesn't exist
func (m *Migrator) createMigrationsTable() error {
	query := `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INT PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`
	_, err := m.db.Exec(query)
	return err
}

// readMigrations reads all SQL migration files from the migrations directory
func (m *Migrator) readMigrations() ([]Migration, error) {
	var migrations []Migration

	files, err := ioutil.ReadDir(m.migrationsDir)
	if err != nil {
		return nil, err
	}

	for _, file := range files {
		if !file.IsDir() && strings.HasSuffix(file.Name(), ".sql") {
			// Parse filename: NNN_name.sql
			parts := strings.SplitN(file.Name(), "_", 2)
			if len(parts) != 2 {
				continue
			}

			version := 0
			_, err := fmt.Sscanf(parts[0], "%d", &version)
			if err != nil {
				continue
			}

			// Read file content
			filePath := filepath.Join(m.migrationsDir, file.Name())
			content, err := ioutil.ReadFile(filePath)
			if err != nil {
				return nil, fmt.Errorf("failed to read migration file %s: %w", file.Name(), err)
			}

			name := strings.TrimSuffix(parts[1], ".sql")
			migrations = append(migrations, Migration{
				Version: version,
				Name:    name,
				SQL:     string(content),
			})
		}
	}

	// Sort migrations by version
	sort.Slice(migrations, func(i, j int) bool {
		return migrations[i].Version < migrations[j].Version
	})

	return migrations, nil
}

// getAppliedVersions returns a map of applied migration versions
func (m *Migrator) getAppliedVersions() (map[int]bool, error) {
	applied := make(map[int]bool)

	rows, err := m.db.Query("SELECT version FROM schema_migrations")
	if err != nil {
		// If table doesn't exist yet, return empty map
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

// applyMigration applies a single migration
func (m *Migrator) applyMigration(migration Migration) error {
	tx, err := m.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Execute the migration SQL
	if _, err := tx.Exec(migration.SQL); err != nil {
		return err
	}

	// Record the migration
	insertQuery := `INSERT INTO schema_migrations (version, name) VALUES ($1, $2)`
	if _, err := tx.Exec(insertQuery, migration.Version, migration.Name); err != nil {
		return err
	}

	return tx.Commit()
}

// RollbackLast rolls back the last applied migration
func (m *Migrator) RollbackLast() error {
	// Note: For now, we don't support rollbacks as we don't have down migrations
	// This is a placeholder for future enhancement
	return fmt.Errorf("rollback not yet implemented")
}

// GetStatus returns the current migration status
func (m *Migrator) GetStatus() (map[string]interface{}, error) {
	migrations, err := m.readMigrations()
	if err != nil {
		return nil, err
	}

	applied, err := m.getAppliedVersions()
	if err != nil {
		return nil, err
	}

	status := map[string]interface{}{
		"total":    len(migrations),
		"applied":  len(applied),
		"pending":  len(migrations) - len(applied),
	}

	return status, nil
}
