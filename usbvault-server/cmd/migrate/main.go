package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/usbvault/usbvault-server/migrations"
)

func main() {
	// Configure logging
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	// Load .env if present
	_ = godotenv.Load()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal().Msg("DATABASE_URL environment variable is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// Connect to database
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to database")
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatal().Err(err).Msg("database ping failed")
	}
	log.Info().Msg("connected to database")

	// Resolve migrations directory relative to the binary or working directory
	migrationsDir := resolveMigrationsDir()
	log.Info().Str("dir", migrationsDir).Msg("using migrations directory")

	migrator := migrations.NewMigrator(pool, migrationsDir)

	// Check for subcommand
	cmd := "up"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}

	switch cmd {
	case "up", "migrate":
		if err := migrator.Migrate(ctx); err != nil {
			log.Fatal().Err(err).Msg("migration failed")
		}
	case "status":
		status, err := migrator.GetStatus(ctx)
		if err != nil {
			log.Fatal().Err(err).Msg("failed to get migration status")
		}
		fmt.Printf("Migration Status:\n")
		fmt.Printf("  Total:   %v\n", status["total"])
		fmt.Printf("  Applied: %v\n", status["applied"])
		fmt.Printf("  Pending: %v\n", status["pending"])
	default:
		fmt.Fprintf(os.Stderr, "Usage: %s [up|status]\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "  up      Run all pending migrations (default)\n")
		fmt.Fprintf(os.Stderr, "  status  Show migration status\n")
		os.Exit(1)
	}
}

// resolveMigrationsDir finds the migrations directory
func resolveMigrationsDir() string {
	// Check MIGRATIONS_DIR env var first
	if dir := os.Getenv("MIGRATIONS_DIR"); dir != "" {
		return dir
	}

	// Try relative to working directory
	candidates := []string{
		"migrations",
		"../migrations",
		"../../migrations",
	}

	// Try relative to the executable
	if execPath, err := os.Executable(); err == nil {
		execDir := filepath.Dir(execPath)
		candidates = append(candidates,
			filepath.Join(execDir, "migrations"),
			filepath.Join(execDir, "..", "migrations"),
		)
	}

	for _, dir := range candidates {
		absDir, err := filepath.Abs(dir)
		if err != nil {
			continue
		}
		if info, err := os.Stat(absDir); err == nil && info.IsDir() {
			return absDir
		}
	}

	// Default fallback
	return "migrations"
}
