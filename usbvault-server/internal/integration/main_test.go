//go:build integration

package integration

import (
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/usbvault/usbvault-server/internal/testutil"
)

// TestMain skips this package when the live API server it requires is not
// reachable. These are FULL-STACK end-to-end tests: they drive the real HTTP
// API (register/login, vault, blob upload/download) against a running server
// plus Postgres, Redis and object storage. Without that stack there is nothing
// to exercise, so rather than hard-fail we skip (the tests document a genuine
// infrastructure dependency, not a code defect).
//
// To run them: start the full stack, set API_URL to its base URL, then
//
//	go test -tags=integration ./internal/integration/...
//
// NOTE: the APIClient in internal/testutil/fixtures.go is also stale vs the
// current SRP-based API (it still uses password /auth/register+/auth/login and
// direct blob POST instead of /auth/srp/* + presigned S3 URLs). Bringing these
// tests back to life needs both a stack harness and a client rewrite — tracked
// as follow-up.
func TestMain(m *testing.M) {
	apiURL := testutil.GetAPIURL()
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		fmt.Printf("SKIP internal/integration: API server not reachable at %s (full-stack tests require a running API)\n", apiURL)
		os.Exit(0)
	}
	_ = resp.Body.Close()
	os.Exit(m.Run())
}
