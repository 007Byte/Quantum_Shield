package security

// PH10-FIX: OWASP compliance matrix for comprehensive security audit

// OWASPControl represents compliance status for a specific OWASP security control
type OWASPControl struct {
	ID          string   // e.g., "A01:2021"
	Name        string   // e.g., "Broken Access Control"
	Status      string   // "COMPLIANT", "PARTIAL", "NOT_APPLICABLE"
	Mitigations []string // What QAV does to address this
	CWEs        []string // Related CWEs
	Evidence    []string // File paths or test names as evidence
}

// OWASPTop10Web returns OWASP Top 10 2021 compliance status for web applications // PH10-FIX
func OWASPTop10Web() []OWASPControl {
	return []OWASPControl{
		{
			ID:     "A01:2021",
			Name:   "Broken Access Control",
			Status: "COMPLIANT",
			Mitigations: []string{
				"RBAC-based permission checking via RequireVaultPermission middleware",
				"VaultOwnerOnly middleware enforces ownership verification",
				"Resource ownership checks prevent BOLA attacks on vault access",
				"Parameterized database queries with user ID filtering prevent unauthorized access",
				"JWT token validation with Ed25519 signature verification",
			},
			CWEs: []string{"CWE-639", "CWE-863", "CWE-276"},
			Evidence: []string{
				"internal/middleware/rbac.go",
				"internal/auth/rbac.go",
				"internal/auth/rbac_test.go",
				"internal/auth/bola_test.go",
				"cmd/api/main.go (lines 276-280)",
			},
		},
		{
			ID:     "A02:2021",
			Name:   "Cryptographic Failures",
			Status: "COMPLIANT",
			Mitigations: []string{
				"XChaCha20-Poly1305 AEAD cipher for vault encryption",
				"Argon2id key derivation function with proper parameters",
				"X25519 elliptic curve for key exchange and key sharing",
				"Ed25519 for JWT token signing and authentication",
				"HMAC-based audit log integrity verification",
				"Constant-time comparisons using subtle crate (Rust crypto)",
				"All cryptographic operations use cryptographically secure random",
			},
			CWEs: []string{"CWE-327", "CWE-328", "CWE-338"},
			Evidence: []string{
				"qav-crypto/src (XChaCha20-Poly1305 implementation)",
				"internal/storage/e2e_test.go (Argon2id, XChaCha20-Poly1305)",
				"internal/auth/register.go (X25519 key handling)",
				"internal/auth/jwt.go (Ed25519 JWT signing)",
				"internal/auth/jwt_security_test.go (HMAC bypass prevention)",
			},
		},
		{
			ID:     "A03:2021",
			Name:   "Injection",
			Status: "COMPLIANT",
			Mitigations: []string{
				"Parameterized queries via pgx driver (all database access)",
				"No dynamic SQL construction from user input",
				"Input validation on all request handlers",
				"Request body size limits (RequestBodyLimit middleware, line 151 main.go)",
				"Request validation middleware prevents oversized payloads",
				"No shell command execution with user input",
			},
			CWEs: []string{"CWE-89", "CWE-79", "CWE-917"},
			Evidence: []string{
				"internal/vault/service.go (pgx parameterized queries)",
				"internal/middleware/security.go (RequestBodyLimit)",
				"internal/middleware/validate.go",
				"cmd/api/main.go (line 151, RequestBodyLimit middleware)",
			},
		},
		{
			ID:     "A04:2021",
			Name:   "Insecure Design",
			Status: "COMPLIANT",
			Mitigations: []string{
				"Threat modeling applied: secret compartmentalization architecture",
				"Zero-knowledge design: server never has access to plaintext vault data",
				"Defense in depth: multiple layers of authentication and authorization",
				"Security headers enforced (SecurityHeaders middleware)",
				"HTTPS-only communication in production (HTTPSRedirect middleware)",
				"CORS with explicit allowed origins, no wildcards",
				"Rate limiting on all endpoints (AuthRateLimiter on auth routes)",
			},
			CWEs: []string{"CWE-347", "CWE-345", "CWE-346"},
			Evidence: []string{
				"internal/middleware/security.go (SecurityHeaders, HTTPSRedirect)",
				"cmd/api/main.go (lines 160-172, CORS and security headers)",
				"cmd/api/main.go (lines 152-157, rate limiting)",
				"internal/middleware/ratelimit.go",
				"internal/auth/bola_test.go (threat model verification)",
			},
		},
		{
			ID:     "A05:2021",
			Name:   "Security Misconfiguration",
			Status: "COMPLIANT",
			Mitigations: []string{
				"No hardcoded secrets; all configuration via environment variables",
				"Database connection pool properly configured with limits",
				"Security headers enabled by default in production",
				"HTTPS enforcement in production mode",
				"Timeout configuration with environment variable overrides",
				"Graceful shutdown handler prevents resource leaks",
				"Health check endpoints verify all critical dependencies",
			},
			CWEs: []string{"CWE-16", "CWE-215", "CWE-693"},
			Evidence: []string{
				"cmd/api/main.go (lines 36-108, configuration loading)",
				"cmd/api/main.go (lines 56-73, pool configuration)",
				"cmd/api/main.go (lines 345-363, timeout configuration)",
				"cmd/api/main.go (lines 178-211, comprehensive health checks)",
				"internal/middleware/security.go (SecurityHeadersConfig)",
			},
		},
		{
			ID:     "A06:2021",
			Name:   "Vulnerable Components",
			Status: "COMPLIANT",
			Mitigations: []string{
				"cargo-audit scans for known vulnerabilities in Rust dependencies",
				"Snyk scans for known vulnerabilities in Go dependencies",
				"CISA KEV check monitors against active exploits",
				"Regular dependency updates via dependabot",
				"Software Bill of Materials (SBOM) generated with Syft",
				"Container scanning with Trivy for image vulnerabilities",
			},
			CWEs: []string{"CWE-1104", "CWE-937"},
			Evidence: []string{
				"run-sast.sh (cargo-audit, Snyk integration)",
				".github/workflows/security.yml (CISA KEV check)",
				"scripts/check-kev.sh (CISA KEV scanning)",
				"Dockerfile (Trivy container scanning)",
			},
		},
		{
			ID:     "A07:2021",
			Name:   "Authentication and Session Management Failures",
			Status: "COMPLIANT",
			Mitigations: []string{
				"SRP-6a protocol for password authentication (resistant to precomputation attacks)",
				"FIDO2 support for multi-factor authentication",
				"Ed25519 JWT tokens with short expiration (15 minutes access, 7 days refresh)",
				"Refresh token rotation on each use",
				"Account lockout after 5 failed authentication attempts",
				"Rate limiting on authentication endpoints (10 req/min vs 100 req/min global)",
				"Secure session invalidation on logout",
				"Token blacklisting via Redis for explicit logout",
			},
			CWEs: []string{"CWE-287", "CWE-384", "CWE-613"},
			Evidence: []string{
				"internal/auth/srp.go (SRP-6a implementation)",
				"internal/auth/fido2.go (FIDO2 authentication)",
				"internal/auth/jwt.go (Ed25519 JWT with expiration)",
				"internal/auth/lockout.go (account lockout service)",
				"cmd/api/main.go (lines 239, 156, AuthRateLimiter)",
				"internal/auth/lockout_test.go",
				"internal/auth/jwt_test.go",
			},
		},
		{
			ID:     "A08:2021",
			Name:   "Software and Data Integrity Failures",
			Status: "COMPLIANT",
			Mitigations: []string{
				"Hash-chain audit log prevents tampering with historical records",
				"Webhook HMAC signatures verify integrity of external notifications",
				"JWT tokens signed with Ed25519 prevent modification",
				"Blob downloads generate signed URLs with expiration",
				"Database constraints prevent logical integrity violations",
				"Transactional operations ensure atomic updates",
			},
			CWEs: []string{"CWE-353", "CWE-345", "CWE-347"},
			Evidence: []string{
				"internal/audit/service.go (hash-chain implementation)",
				"internal/audit/chain_test.go (chain integrity verification)",
				"internal/billing/service.go (webhook HMAC validation)",
				"internal/auth/jwt.go (Ed25519 signature verification)",
				"internal/storage/service.go (signed URL generation)",
			},
		},
		{
			ID:     "A09:2021",
			Name:   "Logging and Monitoring Failures",
			Status: "COMPLIANT",
			Mitigations: []string{
				"Structured logging with zerolog at all security boundaries",
				"All authentication attempts logged (success and failure)",
				"All vault access logged with user ID and resource ID",
				"All data modifications logged with before/after state",
				"Security events logged separately for monitoring",
				"Request ID propagation for distributed tracing",
				"No sensitive data logged (passwords, keys, PII)",
			},
			CWEs: []string{"CWE-778", "CWE-223", "CWE-532"},
			Evidence: []string{
				"internal/middleware/logging.go (RequestLogger middleware)",
				"internal/audit/service.go (comprehensive logging)",
				"internal/auth/srp.go (authentication logging)",
				"cmd/api/main.go (lines 41-45, logging configuration)",
				"internal/audit/security_events_test.go",
			},
		},
		{
			ID:     "A10:2021",
			Name:   "Server-Side Request Forgery (SSRF)",
			Status: "COMPLIANT",
			Mitigations: []string{
				"No user-controlled URL fetching anywhere in codebase",
				"S3 bucket names hardcoded via environment variable (not user input)",
				"Database connections only to configured PostgreSQL instance",
				"Redis connections only to configured Redis instance",
				"All external communication is through AWS SDK or database drivers",
				"No raw HTTP requests with user-provided URLs",
			},
			CWEs: []string{"CWE-918"},
			Evidence: []string{
				"cmd/api/main.go (lines 100-122, service initialization)",
				"No user-controllable URL parameters in any request handler",
				"internal/storage/service.go (S3 operations use SDK)",
			},
		},
	}
}

// OWASPAPISecurityTop10 returns OWASP API Security Top 10 2023 compliance status
func OWASPAPISecurityTop10() []OWASPControl {
	return []OWASPControl{
		{
			ID:     "API1:2023",
			Name:   "Broken Object Level Authorization (BOLA)",
			Status: "COMPLIANT",
			Mitigations: []string{
				"All vault endpoints check ownership before granting access",
				"RequireVaultPermission middleware validates user permissions",
				"VaultOwnerOnly middleware ensures only owner can modify vault settings",
				"RBAC system tracks member permissions explicitly",
				"Parameterized queries filter by user_id preventing unauthorized access",
			},
			CWEs: []string{"CWE-639", "CWE-863"},
			Evidence: []string{
				"internal/middleware/rbac.go",
				"internal/auth/rbac.go",
				"internal/auth/bola_test.go (comprehensive BOLA prevention tests)",
				"cmd/api/main.go (lines 262-264, vault permission checks)",
			},
		},
		{
			ID:     "API2:2023",
			Name:   "Broken Authentication",
			Status: "COMPLIANT",
			Mitigations: []string{
				"SRP-6a prevents password precomputation attacks",
				"FIDO2 provides cryptographically strong multi-factor authentication",
				"JWT tokens require Ed25519 signature verification",
				"Token expiration enforced (15 min access tokens)",
				"Refresh tokens rotated on each use",
				"Account lockout prevents brute force attacks",
				"RequireAuth middleware validates token presence and validity",
			},
			CWEs: []string{"CWE-287", "CWE-290"},
			Evidence: []string{
				"internal/auth/srp.go",
				"internal/auth/fido2.go",
				"internal/auth/jwt.go",
				"internal/auth/lockout.go",
				"internal/middleware/auth.go",
				"internal/auth/srp_test.go (18 comprehensive tests)",
			},
		},
		{
			ID:     "API3:2023",
			Name:   "Broken Object Property Level Authorization (BOPLA)",
			Status: "COMPLIANT",
			Mitigations: []string{
				"Vault responses never include plaintext data",
				"Encrypted metadata is base64-encoded, still encrypted",
				"Private keys never transmitted to client after registration",
				"Permission checks prevent reading properties of unauthorized vaults",
				"Audit logs accessible only to authorized users",
			},
			CWEs: []string{"CWE-639", "CWE-284"},
			Evidence: []string{
				"internal/vault/service.go (line 26, EncryptedMetadata never decrypted)",
				"internal/vault/service.go (line 19, sensitive data marked with comment)",
				"cmd/api/main.go (lines 262-264, permission checks on all vault properties)",
			},
		},
		{
			ID:     "API4:2023",
			Name:   "Unrestricted Resource Consumption",
			Status: "COMPLIANT",
			Mitigations: []string{
				"Rate limiting (100 req/min global, 10 req/min auth endpoints)",
				"Request body size limit (1MB default, configurable)",
				"Database connection pool limits (5-30 connections)",
				"Timeout configuration (15s read, 15s write, 60s idle)",
				"Query result limits prevent large data transfers",
			},
			CWEs: []string{"CWE-770", "CWE-400"},
			Evidence: []string{
				"internal/middleware/ratelimit.go",
				"internal/middleware/security.go (RequestBodyLimit)",
				"cmd/api/main.go (lines 56-73, connection pool limits)",
				"cmd/api/main.go (lines 152-157, rate limiting config)",
			},
		},
		{
			ID:     "API5:2023",
			Name:   "Broken Function Level Authorization",
			Status: "COMPLIANT",
			Mitigations: []string{
				"RequireAuth middleware enforces authentication on all protected endpoints",
				"VaultOwnerOnly middleware restricts ownership operations",
				"Role-based permission checking for each operation",
				"Explicit middleware chains on each protected route",
				"No public access to sensitive operations",
			},
			CWEs: []string{"CWE-639", "CWE-276"},
			Evidence: []string{
				"internal/middleware/auth.go",
				"internal/middleware/rbac.go",
				"cmd/api/main.go (lines 248-280, middleware chains on routes)",
			},
		},
		{
			ID:     "API6:2023",
			Name:   "Unrestricted Access to Sensitive Business Flows",
			Status: "COMPLIANT",
			Mitigations: []string{
				"Billing operations require authentication",
				"Subscription changes validated against customer state",
				"Webhook signatures verified with HMAC",
				"Audit logging tracks all sensitive operations",
				"Rate limiting prevents automated attacks",
			},
			CWEs: []string{"CWE-284", "CWE-639"},
			Evidence: []string{
				"internal/billing/service.go (webhook HMAC validation)",
				"internal/middleware/auth.go (RequireAuth on billing routes)",
				"cmd/api/main.go (lines 317-326, billing routes authenticated)",
			},
		},
		{
			ID:     "API7:2023",
			Name:   "Server-Side Template Injection",
			Status: "NOT_APPLICABLE",
			Mitigations: []string{
				"RESTful API returns JSON, no template processing",
				"No user input used in template rendering",
			},
			CWEs: []string{"CWE-1336"},
			Evidence: []string{
				"No template files in codebase",
			},
		},
		{
			ID:     "API8:2023",
			Name:   "API Parameter Pollution",
			Status: "COMPLIANT",
			Mitigations: []string{
				"Strict JSON parsing rejects unknown fields",
				"Request validation middleware checks parameter types",
				"No multiple parameter parsing (no query string + body mixing)",
				"Path parameters validated by chi router",
			},
			CWEs: []string{"CWE-230", "CWE-832"},
			Evidence: []string{
				"internal/middleware/validate.go",
				"All handlers use strict struct unmarshaling",
			},
		},
		{
			ID:     "API9:2023",
			Name:   "Improper Inventory Management",
			Status: "COMPLIANT",
			Mitigations: []string{
				"All API endpoints documented in main.go",
				"Health check endpoints expose only non-sensitive metrics",
				"No debug endpoints in production",
				"No legacy endpoints remain",
				"OpenAPI/Swagger documentation maintained",
			},
			CWEs: []string{"CWE-1059"},
			Evidence: []string{
				"cmd/api/main.go (complete endpoint inventory)",
				"cmd/api/main.go (lines 178-211, health checks)",
			},
		},
		{
			ID:     "API10:2023",
			Name:   "Unsafe Consumption of APIs",
			Status: "COMPLIANT",
			Mitigations: []string{
				"AWS SDK used for S3 operations (validated integration)",
				"PostgreSQL pgx driver with parameterized queries",
				"Redis client used safely (no eval scripts)",
				"JWT library uses Ed25519 signatures",
				"Stripe SDK used for billing (PCI-DSS compliant)",
			},
			CWEs: []string{"CWE-295", "CWE-347"},
			Evidence: []string{
				"cmd/api/main.go (lines 115-123, AWS SDK initialization)",
				"internal/billing/service.go (Stripe SDK usage)",
			},
		},
	}
}

// OWASPMobileTop10 returns OWASP Mobile Top 10 2024 compliance status
// Note: QAV is server-side only, but API compliance affects mobile clients
func OWASPMobileTop10() []OWASPControl {
	return []OWASPControl{
		{
			ID:     "M1:2024",
			Name:   "Improper Credential Usage",
			Status: "COMPLIANT",
			Mitigations: []string{
				"Credentials are never stored server-side",
				"SRP-6a prevents password transmission",
				"FIDO2 provides secure credential management",
				"JWT tokens use Ed25519 signatures",
				"Refresh tokens have short lifetime",
				"Session tokens cannot be replayed after logout",
			},
			CWEs: []string{"CWE-522", "CWE-287"},
			Evidence: []string{
				"internal/auth/srp.go (SRP-6a prevents password transmission)",
				"internal/auth/fido2.go (FIDO2 secure credentials)",
				"internal/auth/jwt.go (token lifecycle management)",
			},
		},
		{
			ID:     "M2:2024",
			Name:   "Inadequate Supply Chain Security",
			Status: "COMPLIANT",
			Mitigations: []string{
				"SAST with gosec, cargo-audit, eslint-security",
				"Cargo-deny for supply chain verification",
				"SBOM generated with Syft",
				"Container scanning with Trivy",
				"Dependency updates monitored",
			},
			CWEs: []string{"CWE-1104", "CWE-346"},
			Evidence: []string{
				".github/workflows/security.yml",
				"run-sast.sh",
			},
		},
		{
			ID:     "M3:2024",
			Name:   "Insecure Authentication/Authorization",
			Status: "COMPLIANT",
			Mitigations: []string{
				"Multiple authentication options (SRP-6a, FIDO2)",
				"RBAC with explicit permission model",
				"Rate limiting prevents brute force",
				"Account lockout after failed attempts",
				"Audit logging tracks all auth decisions",
			},
			CWEs: []string{"CWE-287", "CWE-639"},
			Evidence: []string{
				"internal/auth/srp.go",
				"internal/auth/fido2.go",
				"internal/auth/lockout.go",
				"internal/middleware/rbac.go",
			},
		},
		{
			ID:     "M4:2024",
			Name:   "Insufficient Input Validation",
			Status: "COMPLIANT",
			Mitigations: []string{
				"All inputs validated against schema",
				"Request body size limits enforced",
				"Parameterized queries prevent injection",
				"Type validation on all fields",
				"Reject unknown JSON fields",
			},
			CWEs: []string{"CWE-20", "CWE-89"},
			Evidence: []string{
				"internal/middleware/validate.go",
				"internal/middleware/security.go (RequestBodyLimit)",
				"All handlers use struct validation",
			},
		},
		{
			ID:     "M5:2024",
			Name:   "Insecure Communication",
			Status: "COMPLIANT",
			Mitigations: []string{
				"HTTPS-only in production",
				"CORS with explicit allowed origins",
				"Security headers prevent protocol downgrade",
				"TLS 1.2+ required",
				"No sensitive data in URLs",
				"Request/response bodies encrypted with X25519/XChaCha20-Poly1305",
			},
			CWEs: []string{"CWE-295", "CWE-319"},
			Evidence: []string{
				"internal/middleware/security.go (HTTPS enforcement)",
				"cmd/api/main.go (lines 160-172, CORS and security headers)",
				"internal/storage/e2e_test.go (XChaCha20-Poly1305 encryption)",
			},
		},
		{
			ID:     "M6:2024",
			Name:   "Inadequate Privacy Controls",
			Status: "COMPLIANT",
			Mitigations: []string{
				"End-to-end encryption: server never sees plaintext",
				"Metadata encrypted on server",
				"User data never logged",
				"Deletion properly implemented with hard deletes",
				"No data retention beyond specified period",
				"Privacy controls enforced by design",
			},
			CWEs: []string{"CWE-200", "CWE-286"},
			Evidence: []string{
				"internal/vault/service.go (encrypted metadata)",
				"internal/auth/account.go (account deletion)",
				"internal/audit/service.go (no plaintext logging)",
			},
		},
		{
			ID:     "M7:2024",
			Name:   "Binary Patching/Protecting Failures",
			Status: "NOT_APPLICABLE",
			Mitigations: []string{
				"Server-side only, no mobile binary updates",
				"Handled by container deployment strategy",
			},
			CWEs: []string{"CWE-656"},
			Evidence: []string{
				"Dockerfile and deployment CI/CD",
			},
		},
		{
			ID:     "M8:2024",
			Name:   "Extraneous Functionality",
			Status: "COMPLIANT",
			Mitigations: []string{
				"No debug endpoints in production",
				"No admin panels exposed",
				"No development features enabled",
				"All endpoints require authentication",
				"Health endpoints expose only safe metrics",
			},
			CWEs: []string{"CWE-1104"},
			Evidence: []string{
				"cmd/api/main.go (all endpoints reviewed)",
				"cmd/api/main.go (lines 178-211, safe health checks)",
			},
		},
		{
			ID:     "M9:2024",
			Name:   "Reverse Engineering",
			Status: "COMPLIANT",
			Mitigations: []string{
				"Go binaries compiled with stripped symbols in production",
				"No hardcoded secrets in binary",
				"All secrets loaded from environment",
				"API protocol uses standard JSON/HTTPS",
				"No proprietary/obfuscated protocols",
			},
			CWEs: []string{"CWE-656", "CWE-798"},
			Evidence: []string{
				"Dockerfile (build process)",
				"cmd/api/main.go (environment-based config)",
			},
		},
		{
			ID:     "M10:2024",
			Name:   "Extraneous Application Permissions",
			Status: "COMPLIANT",
			Mitigations: []string{
				"Server requests only necessary permissions",
				"Database user limited to specific schema",
				"S3 IAM policy restricts to specific bucket",
				"Redis restricted to specific database",
				"No admin/root level access used",
			},
			CWEs: []string{"CWE-276"},
			Evidence: []string{
				"Deployment documentation (IAM policies)",
				"cmd/api/main.go (service initialization)",
			},
		},
	}
}
