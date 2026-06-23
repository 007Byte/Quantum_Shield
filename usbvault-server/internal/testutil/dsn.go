package testutil

import "os"

// IntegrationDSN returns the Postgres connection string for the DB-backed
// integration tests (//go:build integration). It reads TEST_DATABASE_URL when
// set so local runs can target any host/port, and otherwise falls back to the
// value the CI Postgres service provides. The integration tests self-provision
// their own schema, so the target database only needs to exist and be reachable.
func IntegrationDSN() string {
	if dsn := os.Getenv("TEST_DATABASE_URL"); dsn != "" {
		return dsn
	}
	return "postgres://postgres:postgres@localhost:5432/usbvault_test"
}
