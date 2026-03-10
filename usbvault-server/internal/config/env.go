package config

import (
	"fmt"
	"os"
	"strings"
)

// GetEnvOrDefault returns the value of the environment variable named by key,
// or the provided default value if the variable is not set or empty.
func GetEnvOrDefault(key, defaultValue string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultValue
}

// DV-016 FIX: ValidateRequiredEnvVars checks that all required environment variables are set at startup
func ValidateRequiredEnvVars() error {
	required := []string{
		"DATABASE_URL",
	}

	var missing []string
	for _, key := range required {
		if os.Getenv(key) == "" {
			missing = append(missing, key)
		}
	}

	if len(missing) > 0 {
		return fmt.Errorf("missing required environment variables: %s", strings.Join(missing, ", "))
	}
	return nil
}
