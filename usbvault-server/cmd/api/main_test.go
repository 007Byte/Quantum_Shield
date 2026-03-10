package main

import (
	"os"
	"testing"
)

func TestGetEnvOrDefault_WithValue(t *testing.T) {
	key := "TEST_KEY_WITH_VALUE"
	value := "test-value"
	defaultValue := "default-value"

	os.Setenv(key, value)
	defer os.Unsetenv(key)

	result := getEnvOrDefault(key, defaultValue)

	if result != value {
		t.Errorf("expected %q, got %q", value, result)
	}
}

func TestGetEnvOrDefault_WithoutValue(t *testing.T) {
	key := "TEST_KEY_WITHOUT_VALUE_" + randomString(10)
	defaultValue := "default-value"

	// Ensure the key is not set
	os.Unsetenv(key)

	result := getEnvOrDefault(key, defaultValue)

	if result != defaultValue {
		t.Errorf("expected %q, got %q", defaultValue, result)
	}
}

func TestGetEnvOrDefault_EmptyEnvValue(t *testing.T) {
	key := "TEST_KEY_EMPTY"
	defaultValue := "default-value"

	os.Setenv(key, "")
	defer os.Unsetenv(key)

	result := getEnvOrDefault(key, defaultValue)

	// Empty string should trigger fallback to default
	if result != defaultValue {
		t.Errorf("expected %q, got %q", defaultValue, result)
	}
}

func TestExtractRedisAddr_StandardURL(t *testing.T) {
	testCases := []struct {
		name     string
		redisURL string
		expected string
	}{
		{
			name:     "standard redis URL",
			redisURL: "redis://localhost:6379",
			expected: "localhost:6379",
		},
		{
			name:     "redis URL with IP",
			redisURL: "redis://192.168.1.1:6379",
			expected: "192.168.1.1:6379",
		},
		{
			name:     "redis URL with different port",
			redisURL: "redis://redis-server:12345",
			expected: "redis-server:12345",
		},
		{
			name:     "localhost with default port",
			redisURL: "redis://localhost:6379",
			expected: "localhost:6379",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := extractRedisAddr(tc.redisURL)
			if result != tc.expected {
				t.Errorf("expected %q, got %q", tc.expected, result)
			}
		})
	}
}

func TestExtractRedisAddr_TooShort(t *testing.T) {
	tooShortURL := "redis://"
	expected := "localhost:6379" // Default fallback

	result := extractRedisAddr(tooShortURL)

	if result != expected {
		t.Errorf("expected %q, got %q", expected, result)
	}
}

func TestExtractRedisAddr_VeryShort(t *testing.T) {
	veryShortURL := "redis"
	expected := "localhost:6379" // Default fallback

	result := extractRedisAddr(veryShortURL)

	if result != expected {
		t.Errorf("expected %q, got %q", expected, result)
	}
}

func TestExtractRedisAddr_Empty(t *testing.T) {
	emptyURL := ""
	expected := "localhost:6379" // Default fallback

	result := extractRedisAddr(emptyURL)

	if result != expected {
		t.Errorf("expected %q, got %q", expected, result)
	}
}

func TestExtractRedisAddr_ExactlyEightChars(t *testing.T) {
	eightCharURL := "redis://"
	expected := "localhost:6379" // Default fallback (length == 8)

	result := extractRedisAddr(eightCharURL)

	if result != expected {
		t.Errorf("expected %q, got %q", expected, result)
	}
}

func TestExtractRedisAddr_WithPassword(t *testing.T) {
	// Note: Simple extraction just removes "redis://" prefix
	// Password in URL would be included in extracted addr if present
	redisURL := "redis://user:password@localhost:6379"
	expected := "user:password@localhost:6379"

	result := extractRedisAddr(redisURL)

	if result != expected {
		t.Errorf("expected %q, got %q", expected, result)
	}
}

func TestExtractRedisAddr_MultipleColons(t *testing.T) {
	redisURL := "redis://localhost:6379:extra"
	expected := "localhost:6379:extra"

	result := extractRedisAddr(redisURL)

	if result != expected {
		t.Errorf("expected %q, got %q", expected, result)
	}
}

func TestExtractRedisAddr_LongAddress(t *testing.T) {
	longAddr := "redis://redis-prod-cluster-001.internal.company.com:26379"
	expected := "redis-prod-cluster-001.internal.company.com:26379"

	result := extractRedisAddr(longAddr)

	if result != expected {
		t.Errorf("expected %q, got %q", expected, result)
	}
}

func TestGetEnvOrDefault_MultipleKeys(t *testing.T) {
	// Test that function works independently for different keys
	key1 := "TEST_KEY_1"
	key2 := "TEST_KEY_2"
	value1 := "value-1"
	value2 := "value-2"
	defaultValue := "default"

	os.Setenv(key1, value1)
	defer os.Unsetenv(key1)

	os.Setenv(key2, value2)
	defer os.Unsetenv(key2)

	result1 := getEnvOrDefault(key1, defaultValue)
	result2 := getEnvOrDefault(key2, defaultValue)
	result3 := getEnvOrDefault("nonexistent", defaultValue)

	if result1 != value1 {
		t.Errorf("expected key1=%q, got %q", value1, result1)
	}
	if result2 != value2 {
		t.Errorf("expected key2=%q, got %q", value2, result2)
	}
	if result3 != defaultValue {
		t.Errorf("expected nonexistent=%q, got %q", defaultValue, result3)
	}
}

func TestExtractRedisAddr_EdgeCases(t *testing.T) {
	testCases := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "URL with only scheme",
			input:    "redis://",
			expected: "localhost:6379",
		},
		{
			name:     "Very long hostname",
			input:    "redis://this-is-a-very-long-hostname-that-might-be-used.redis.cache.windows.net:6379",
			expected: "this-is-a-very-long-hostname-that-might-be-used.redis.cache.windows.net:6379",
		},
		{
			name:     "IPv6 address (simplified)",
			input:    "redis://[::1]:6379",
			expected: "[::1]:6379",
		},
		{
			name:     "Just scheme and slash",
			input:    "redis:/",
			expected: "localhost:6379",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := extractRedisAddr(tc.input)
			if result != tc.expected {
				t.Errorf("expected %q, got %q", tc.expected, result)
			}
		})
	}
}

// Helper function to generate random strings for test isolation
func randomString(length int) string {
	chars := "abcdefghijklmnopqrstuvwxyz0123456789"
	result := make([]byte, length)
	for i := 0; i < length; i++ {
		result[i] = chars[i%len(chars)]
	}
	return string(result)
}

func BenchmarkExtractRedisAddr(b *testing.B) {
	redisURL := "redis://redis-prod.internal.company.com:6379"
	for i := 0; i < b.N; i++ {
		extractRedisAddr(redisURL)
	}
}

func BenchmarkGetEnvOrDefault(b *testing.B) {
	os.Setenv("BENCH_TEST_KEY", "bench-value")
	defer os.Unsetenv("BENCH_TEST_KEY")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		getEnvOrDefault("BENCH_TEST_KEY", "default")
	}
}
