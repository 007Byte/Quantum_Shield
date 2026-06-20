// Command dast-helper generates ZAP-compatible configuration files from the
// DAST endpoint inventory defined in internal/security/dast_config.go.
//
// Usage:
//
//	go run ./cmd/dast-helper -base-url=http://localhost:8080 \
//	    -output-urls=zap-urls.txt -output-context=zap-context.yaml
package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/usbvault/usbvault-server/internal/security"
)

func main() {
	baseURL := flag.String("base-url", "http://localhost:8080", "Base URL of the running server")
	outputURLs := flag.String("output-urls", "", "Path to write the ZAP URL list (empty = stdout)")
	outputContext := flag.String("output-context", "", "Path to write the ZAP context YAML (empty = stdout)")
	flag.Parse()

	// Generate URL list
	urlList := security.GenerateZAPURLList(*baseURL)
	if *outputURLs != "" {
		if err := os.WriteFile(*outputURLs, []byte(urlList), 0644); err != nil {
			fmt.Fprintf(os.Stderr, "error writing URL list: %v\n", err)
			os.Exit(1)
		}
		fmt.Fprintf(os.Stderr, "Wrote %s\n", *outputURLs)
	} else {
		fmt.Print(urlList)
	}

	// Generate ZAP context
	context := security.GenerateZAPContext(*baseURL)
	if *outputContext != "" {
		if err := os.WriteFile(*outputContext, []byte(context), 0644); err != nil {
			fmt.Fprintf(os.Stderr, "error writing context: %v\n", err)
			os.Exit(1)
		}
		fmt.Fprintf(os.Stderr, "Wrote %s\n", *outputContext)
	} else if *outputURLs != "" {
		// If URLs went to file, print context to stdout
		fmt.Print(context)
	}
}
