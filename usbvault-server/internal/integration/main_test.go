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

// TestMain decides whether the FULL-STACK end-to-end integration suite runs.
//
// These tests drive the real HTTP API (SRP register/login, vault, blob
// upload/download) against a running server plus Postgres, Redis and object
// storage. There are exactly two legitimate outcomes:
//
//  1. The suite was REQUESTED (INTEGRATION=1, or API_URL explicitly set) — then
//     a live API MUST be reachable. If it is not, we FAIL LOUDLY (non-zero exit)
//     instead of pretending success. A requested-but-unconfigured run is a CI
//     misconfiguration, not a pass.
//
//  2. The suite was NOT requested — then we t.Skip with a clear message. Skipping
//     when nobody asked for the stack is fine and visible in `go test` output.
//
// The previous implementation pinged API_URL and, on ANY failure, called
// os.Exit(0): the package "passed" by skipping silently, so CI (which never
// started a server) reported green while running ZERO integration tests. That
// is the exact silent-skip this fix removes — a green run can no longer hide an
// empty integration suite.
//
// To run them: start the full stack, then
//
//	INTEGRATION=1 API_URL=http://localhost:8090 \
//	  go test -tags=integration ./internal/integration/...
func TestMain(m *testing.M) {
	requested := os.Getenv("INTEGRATION") == "1" || os.Getenv("API_URL") != ""

	if !requested {
		// Not requested: skip visibly. We cannot call t.Skip from TestMain, so
		// print a clear SKIP line and exit 0 WITHOUT running any test. This is a
		// genuine "not requested" skip, not a masked failure.
		fmt.Println("SKIP internal/integration: full-stack suite not requested " +
			"(set INTEGRATION=1 and API_URL=<base-url> with a live stack to run it)")
		os.Exit(0)
	}

	// Requested: the live API MUST be reachable. Probe it and FAIL LOUDLY if not.
	apiURL := testutil.GetAPIURL()
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		fmt.Fprintf(os.Stderr,
			"FAIL internal/integration: suite REQUESTED (INTEGRATION/API_URL set) but the "+
				"API server is not reachable at %s: %v\n"+
				"The integration suite must not silently pass by skipping — start the full "+
				"stack (API + Postgres + Redis + object storage) or unset INTEGRATION/API_URL.\n",
			apiURL, err)
		os.Exit(1)
	}
	_ = resp.Body.Close()

	os.Exit(m.Run())
}
