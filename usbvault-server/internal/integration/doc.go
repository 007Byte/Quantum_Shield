// Package integration contains end-to-end, HTTP-level integration tests that
// exercise the running USBVault API against a real database and storage layer.
//
// All of the actual test files in this package are guarded by the
// "//go:build integration" constraint, so they only compile and run when the
// integration build tag is supplied:
//
//	go test -tags=integration ./internal/integration/ -v
//
// This file deliberately carries no build tag. Without it, the package would
// contain zero buildable Go files in a normal (untagged) build, and commands
// such as `go test ./internal/integration/` would fail with
// "build constraints exclude all Go files" instead of cleanly reporting that
// there are no (untagged) tests to run. Keeping a single untagged file makes
// the package buildable in both modes.
package integration
