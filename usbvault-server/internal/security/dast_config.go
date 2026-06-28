package security

import (
	"fmt"
	"strings"
)

// PH10-FIX: DAST configuration for dynamic application security testing

// DASTEndpoint represents an API endpoint for dynamic security testing
type DASTEndpoint struct {
	Method       string   // HTTP method (GET, POST, PUT, DELETE)
	Path         string   // API path
	AuthRequired bool     // Whether authentication is required
	TestCases    []string // What to test: "sqli", "xss", "idor", "auth_bypass", "rate_limit", "input_validation"
}

// DASTEndpoints returns all API endpoints for dynamic testing // PH10-FIX
// Based on routes defined in cmd/api/main.go
func DASTEndpoints() []DASTEndpoint {
	return []DASTEndpoint{
		// Health check endpoints (public)
		{
			Method:       "GET",
			Path:         "/health",
			AuthRequired: false,
			TestCases:    []string{"info_disclosure"},
		},
		{
			Method:       "GET",
			Path:         "/ready",
			AuthRequired: false,
			TestCases:    []string{"info_disclosure"},
		},
		{
			Method:       "GET",
			Path:         "/metrics/pool",
			AuthRequired: false,
			TestCases:    []string{"info_disclosure"},
		},

		// Auth endpoints (public with rate limiting)
		{
			Method:       "POST",
			Path:         "/api/v1/auth/srp/init",
			AuthRequired: false,
			TestCases:    []string{"rate_limit", "input_validation", "user_enumeration"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/auth/srp/verify",
			AuthRequired: false,
			TestCases:    []string{"auth_bypass", "rate_limit", "brute_force", "input_validation"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/auth/fido2/challenge",
			AuthRequired: false,
			TestCases:    []string{"auth_bypass", "rate_limit", "input_validation"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/auth/fido2/verify",
			AuthRequired: false,
			TestCases:    []string{"auth_bypass", "rate_limit", "replay_attack", "input_validation"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/auth/refresh",
			AuthRequired: true,
			TestCases:    []string{"token_reuse", "token_forgery", "auth_bypass"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/auth/logout",
			AuthRequired: true,
			TestCases:    []string{"token_blacklist", "session_fixation"},
		},

		// FIDO2 credential management (authenticated)
		{
			Method:       "POST",
			Path:         "/api/v1/auth/fido2/manage/register/init",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "input_validation"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/auth/fido2/manage/register/verify",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "input_validation", "replay_attack"},
		},
		{
			Method:       "GET",
			Path:         "/api/v1/auth/fido2/manage/credentials",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor"},
		},
		{
			Method:       "DELETE",
			Path:         "/api/v1/auth/fido2/manage/credentials",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor"},
		},

		// Vault operations (authenticated with RBAC)
		{
			Method:       "POST",
			Path:         "/api/v1/vaults",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "input_validation", "encryption_validation"},
		},
		{
			Method:       "GET",
			Path:         "/api/v1/vaults",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "info_disclosure"},
		},
		{
			Method:       "GET",
			Path:         "/api/v1/vaults/{vaultID}",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor", "bola"},
		},
		{
			Method:       "PUT",
			Path:         "/api/v1/vaults/{vaultID}",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor", "bola", "privilege_escalation"},
		},
		{
			Method:       "DELETE",
			Path:         "/api/v1/vaults/{vaultID}",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor", "bola", "privilege_escalation"},
		},

		// Blob/file operations
		{
			Method:       "POST",
			Path:         "/api/v1/vaults/{vaultID}/blobs/upload-url",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor", "bola", "signed_url_validation"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/vaults/{vaultID}/blobs/download-url",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor", "bola", "signed_url_validation"},
		},
		{
			Method:       "GET",
			Path:         "/api/v1/vaults/{vaultID}/blobs",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor", "bola", "info_disclosure"},
		},
		{
			Method:       "DELETE",
			Path:         "/api/v1/vaults/{vaultID}/blobs/{blobID}",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor", "bola", "privilege_escalation"},
		},

		// Vault member management (RBAC)
		{
			Method:       "GET",
			Path:         "/api/v1/vaults/{vaultID}/members",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor", "bola", "info_disclosure"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/vaults/{vaultID}/members",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor", "bola", "privilege_escalation"},
		},
		{
			Method:       "DELETE",
			Path:         "/api/v1/vaults/{vaultID}/members/{memberUserID}",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor", "bola", "privilege_escalation"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/vaults/{vaultID}/members/transfer-ownership",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor", "privilege_escalation"},
		},

		// Key rotation
		{
			Method:       "POST",
			Path:         "/api/v1/vaults/{vaultID}/rotate",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor", "privilege_escalation"},
		},
		{
			Method:       "GET",
			Path:         "/api/v1/vaults/{vaultID}/rotation-status",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor", "bola"},
		},

		// Sharing operations
		{
			Method:       "POST",
			Path:         "/api/v1/shares",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "input_validation", "crypto_validation"},
		},
		{
			Method:       "GET",
			Path:         "/api/v1/shares/received",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "info_disclosure"},
		},
		{
			Method:       "GET",
			Path:         "/api/v1/shares/sent",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "info_disclosure"},
		},
		{
			Method:       "DELETE",
			Path:         "/api/v1/shares/{shareID}",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor"},
		},
		{
			Method:       "GET",
			Path:         "/api/v1/shares/public-key/{userID}",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "user_enumeration"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/shares/public-key",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "input_validation"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/shares/{shareID}/accept",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/shares/{shareID}/reject",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor"},
		},
		{
			Method:       "GET",
			Path:         "/api/v1/shares/fingerprint/{userID}",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "info_disclosure"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/shares/verify-contact",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "input_validation"},
		},

		// Audit log operations
		{
			Method:       "GET",
			Path:         "/api/v1/audit",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor", "info_disclosure"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/audit/verify",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "input_validation"},
		},
		{
			Method:       "GET",
			Path:         "/api/v1/audit/anomalies",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "info_disclosure"},
		},
		{
			Method:       "GET",
			Path:         "/api/v1/audit/compliance-report",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "info_disclosure"},
		},
		{
			Method:       "GET",
			Path:         "/api/v1/audit/compliance-export",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "info_disclosure"},
		},

		// Billing operations
		{
			Method:       "POST",
			Path:         "/api/v1/billing/customer",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "input_validation"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/billing/subscribe",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "input_validation"},
		},
		{
			Method:       "GET",
			Path:         "/api/v1/billing/subscription",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/billing/upgrade",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/billing/downgrade",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/billing/cancel",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor"},
		},
		{
			Method:       "POST",
			Path:         "/api/v1/billing/webhook",
			AuthRequired: false,
			TestCases:    []string{"webhook_forgery", "hmac_validation", "replay_attack"},
		},

		// Notifications
		{
			Method:       "POST",
			Path:         "/api/v1/notify/register-device",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "input_validation"},
		},

		// User account operations
		{
			Method:       "DELETE",
			Path:         "/api/v1/user/account",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "idor", "account_deletion"},
		},

		// WebSocket sync
		{
			Method:       "WEBSOCKET",
			Path:         "/api/v1/sync",
			AuthRequired: true,
			TestCases:    []string{"auth_bypass", "input_validation", "connection_security"},
		},
	}
}

// DASTScanConfig returns OWASP ZAP compatible scan configuration
// This can be used to configure automated DAST tools
func DASTScanConfig() map[string]interface{} {
	return map[string]interface{}{
		"name":        "Quantum_Shield DAST Configuration",
		"description": "OWASP ZAP configuration for Quantum_Shield API security testing",
		"version":     "1.0",
		"scanPolicy": map[string]interface{}{
			"name": "Quantum_Shield Security Scan",
			"policies": []map[string]interface{}{
				{
					"policyid": "10000",
					"name":     "SQL Injection",
					"enabled":  true,
					"riskcode": "3",
				},
				{
					"policyid": "10001",
					"name":     "Cross Site Scripting (Reflected)",
					"enabled":  true,
					"riskcode": "3",
				},
				{
					"policyid": "10002",
					"name":     "Cross Site Scripting (Stored)",
					"enabled":  true,
					"riskcode": "3",
				},
				{
					"policyid": "10003",
					"name":     "Missing Anti-CSRF Tokens",
					"enabled":  false,
					"riskcode": "2",
				},
				{
					"policyid": "10010",
					"name":     "Parameter Pollution",
					"enabled":  true,
					"riskcode": "1",
				},
				{
					"policyid": "10015",
					"name":     "Re-Authenticate",
					"enabled":  true,
					"riskcode": "3",
				},
				{
					"policyid": "10016",
					"name":     "Remote OS Command Injection",
					"enabled":  true,
					"riskcode": "3",
				},
				{
					"policyid": "10017",
					"name":     "Server Side Include",
					"enabled":  true,
					"riskcode": "3",
				},
				{
					"policyid": "10019",
					"name":     "Server Side Template Injection",
					"enabled":  false,
					"riskcode": "3",
				},
				{
					"policyid": "10021",
					"name":     "XPath Injection",
					"enabled":  true,
					"riskcode": "3",
				},
				{
					"policyid": "10098",
					"name":     "Cross Site Request Forgery",
					"enabled":  false,
					"riskcode": "2",
				},
				{
					"policyid": "20012",
					"name":     "Anti CSRF Tokens Scanned",
					"enabled":  false,
					"riskcode": "0",
				},
				{
					"policyid": "20014",
					"name":     "HTTP Response Splitting",
					"enabled":  true,
					"riskcode": "3",
				},
				{
					"policyid": "20015",
					"name":     "Insecure HTTP Method",
					"enabled":  true,
					"riskcode": "2",
				},
				{
					"policyid": "20016",
					"name":     "X-Frame-Options Header Scanner",
					"enabled":  true,
					"riskcode": "2",
				},
				{
					"policyid": "20017",
					"name":     "X-Content-Type-Options Header Missing",
					"enabled":  true,
					"riskcode": "1",
				},
				{
					"policyid": "20018",
					"name":     "Missing Security Header",
					"enabled":  true,
					"riskcode": "1",
				},
				{
					"policyid": "30001",
					"name":     "Buffer Overflow",
					"enabled":  true,
					"riskcode": "3",
				},
				{
					"policyid": "40008",
					"name":     "Parameter Tampering",
					"enabled":  true,
					"riskcode": "1",
				},
				{
					"policyid": "40009",
					"name":     "Server Side Template Injection",
					"enabled":  false,
					"riskcode": "3",
				},
				{
					"policyid": "40014",
					"name":     "Heartbleed OpenSSL Vulnerability",
					"enabled":  true,
					"riskcode": "3",
				},
				{
					"policyid": "40015",
					"name":     "Re-Authenticate",
					"enabled":  true,
					"riskcode": "3",
				},
				{
					"policyid": "40016",
					"name":     "Source Code Disclosure",
					"enabled":  true,
					"riskcode": "3",
				},
				{
					"policyid": "40017",
					"name":     "SQL Injection",
					"enabled":  true,
					"riskcode": "3",
				},
				{
					"policyid": "40018",
					"name":     "Server Side Template Injection",
					"enabled":  false,
					"riskcode": "3",
				},
				{
					"policyid": "50000",
					"name":     "Authentication Verification",
					"enabled":  true,
					"riskcode": "3",
				},
			},
		},
		"authentication": map[string]interface{}{
			"type":      "token",
			"tokenName": "Authorization",
			"tokenType": "Bearer",
		},
		"ratelimit": map[string]interface{}{
			"enabled": true,
			"rules": map[string]interface{}{
				"general":          "100 per minute",
				"authentication":   "10 per minute",
				"brute_force_test": "5 per minute",
			},
		},
		"timeout": map[string]interface{}{
			"connection": 15,
			"read":       15,
			"write":      15,
		},
		"ssl": map[string]interface{}{
			"enforceHTTPS":       true,
			"validateCertificate": true,
		},
		"headers": []map[string]string{
			{
				"name":  "X-Content-Type-Options",
				"value": "nosniff",
			},
			{
				"name":  "X-Frame-Options",
				"value": "DENY",
			},
			{
				"name":  "Strict-Transport-Security",
				"value": "max-age=31536000",
			},
			{
				"name":  "Content-Security-Policy",
				"value": "default-src 'self'",
			},
		},
		"cors": map[string]interface{}{
			"enabled":      true,
			"allowedMethods": []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		},
	}
}

// GenerateZAPURLList produces a newline-delimited list of URLs suitable for
// ZAP's URL import (-U flag). Path parameters like {vaultID} are replaced
// with placeholder UUIDs so ZAP can spider them.
func GenerateZAPURLList(baseURL string) string {
	baseURL = strings.TrimRight(baseURL, "/")
	endpoints := DASTEndpoints()

	var lines []string
	for _, ep := range endpoints {
		if ep.Method == "WEBSOCKET" {
			continue // ZAP URL list does not support WebSocket
		}
		path := replacePathParams(ep.Path)
		lines = append(lines, fmt.Sprintf("%s%s", baseURL, path))
	}
	return strings.Join(lines, "\n") + "\n"
}

// GenerateZAPContext produces a YAML-formatted ZAP context file that includes
// all endpoints, authentication configuration (JWT bearer), and active scan
// policy settings derived from DASTScanConfig().
func GenerateZAPContext(baseURL string) string {
	baseURL = strings.TrimRight(baseURL, "/")
	endpoints := DASTEndpoints()
	scanConfig := DASTScanConfig()

	var b strings.Builder

	// Header
	b.WriteString("# ZAP Context — auto-generated from dast_config.go\n")
	b.WriteString("---\n")
	b.WriteString("env:\n")
	b.WriteString("  contexts:\n")
	b.WriteString("    - name: \"USBVault API\"\n")
	b.WriteString(fmt.Sprintf("      urls:\n        - \"%s\"\n", baseURL))

	// Include regexes for all paths so ZAP scopes them
	b.WriteString("      includePaths:\n")
	for _, ep := range endpoints {
		if ep.Method == "WEBSOCKET" {
			continue
		}
		// Convert path params to regex wildcards for ZAP scope
		regexPath := pathToRegex(ep.Path)
		b.WriteString(fmt.Sprintf("        - \"%s%s\"\n", strings.ReplaceAll(baseURL, ".", "\\."), regexPath))
	}

	// Authentication section (JWT bearer)
	auth, _ := scanConfig["authentication"].(map[string]interface{})
	tokenName, _ := auth["tokenName"].(string)
	tokenType, _ := auth["tokenType"].(string)
	b.WriteString("      authentication:\n")
	b.WriteString("        method: \"header\"\n")
	b.WriteString("        parameters:\n")
	b.WriteString(fmt.Sprintf("          headerName: \"%s\"\n", tokenName))
	b.WriteString(fmt.Sprintf("          headerValue: \"%s {%%token%%}\"\n", tokenType))

	// Endpoint details as technology annotations
	b.WriteString("  parameters:\n")
	b.WriteString("    failOnError: true\n")
	b.WriteString("    progressToStdout: true\n")

	// Active scan policy
	b.WriteString("  policy:\n")
	b.WriteString("    name: \"USBVault Security Scan\"\n")
	b.WriteString("    rules:\n")

	policies, _ := scanConfig["scanPolicy"].(map[string]interface{})
	policyList, _ := policies["policies"].([]map[string]interface{})
	for _, p := range policyList {
		enabled, _ := p["enabled"].(bool)
		name, _ := p["name"].(string)
		id, _ := p["policyid"].(string)
		b.WriteString(fmt.Sprintf("      - id: %s\n", id))
		b.WriteString(fmt.Sprintf("        name: \"%s\"\n", name))
		if enabled {
			b.WriteString("        strength: \"medium\"\n")
			b.WriteString("        threshold: \"medium\"\n")
		} else {
			b.WriteString("        threshold: \"off\"\n")
		}
	}

	// Endpoint inventory as comments for reference
	b.WriteString("  # Endpoint inventory:\n")
	for _, ep := range endpoints {
		b.WriteString(fmt.Sprintf("  #   %s %s (auth=%v) tests=%s\n",
			ep.Method, ep.Path, ep.AuthRequired, strings.Join(ep.TestCases, ",")))
	}

	return b.String()
}

// replacePathParams replaces {param} placeholders with deterministic UUIDs
func replacePathParams(path string) string {
	replacements := map[string]string{
		"{vaultID}":      "00000000-0000-0000-0000-000000000001",
		"{blobID}":       "00000000-0000-0000-0000-000000000002",
		"{memberUserID}": "00000000-0000-0000-0000-000000000003",
		"{shareID}":      "00000000-0000-0000-0000-000000000004",
		"{userID}":       "00000000-0000-0000-0000-000000000005",
	}
	result := path
	for param, value := range replacements {
		result = strings.ReplaceAll(result, param, value)
	}
	return result
}

// pathToRegex converts a path with {param} segments to a regex for ZAP scope
func pathToRegex(path string) string {
	// Escape dots, replace path params with UUID-matching regex
	result := strings.ReplaceAll(path, ".", "\\.")
	for _, param := range []string{"{vaultID}", "{blobID}", "{memberUserID}", "{shareID}", "{userID}"} {
		result = strings.ReplaceAll(result, param, "[^/]+")
	}
	return result + "$"
}
