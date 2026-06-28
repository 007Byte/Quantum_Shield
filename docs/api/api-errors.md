# Quantum_Shield API Error Catalog

This document describes all error codes and their HTTP status mappings used by the Quantum_Shield API.

## HTTP Status Code Mapping

| Status Code | Meaning | Usage |
|------------|---------|-------|
| 400 | Bad Request | Invalid request format, validation errors, malformed JSON |
| 401 | Unauthorized | Missing or invalid authentication credentials (JWT token) |
| 403 | Forbidden | Authenticated but lacks permission for the resource (authorization) |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | State conflict (e.g., duplicate resource, already exists) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |
| 503 | Service Unavailable | Service degraded (health check failed) |

## Authentication Errors (401 Unauthorized)

### Token Errors
- **INVALID_TOKEN**: JWT token is malformed or tampered with
- **EXPIRED_TOKEN**: JWT token has expired
- **MISSING_TOKEN**: Authorization header is missing or empty
- **INVALID_BEARER**: Bearer token format is invalid
- **TOKEN_REVOKED**: Token has been revoked or blacklisted

### SRP Authentication Errors
- **INVALID_SRP_SESSION**: SRP session ID not found or expired
- **INVALID_SRP_PROOF**: M1 proof verification failed (wrong password)
- **SRP_SESSION_EXPIRED**: SRP session exceeded 5-minute TTL
- **USER_NOT_FOUND**: Email not found in database

### FIDO2 Authentication Errors
- **NO_FIDO2_CREDENTIALS**: User has no registered FIDO2 credentials
- **INVALID_FIDO2_CHALLENGE**: Challenge verification failed
- **FIDO2_SESSION_EXPIRED**: WebAuthn session expired
- **ASSERTION_VERIFICATION_FAILED**: Assertion signature validation failed

### Account Lockout Errors
- **ACCOUNT_LOCKED**: Account locked due to too many failed login attempts
- **LOCKOUT_DURATION_REMAINING**: Account locked, try again in X seconds

## Authorization Errors (403 Forbidden)

### RBAC Errors
- **INSUFFICIENT_PERMISSIONS**: User lacks required permission for operation
- **NOT_VAULT_OWNER**: Operation requires vault owner role
- **NOT_VAULT_MEMBER**: User is not a member of the vault
- **PERMISSION_DENIED**: Explicit permission check failed
- **ROLE_NOT_FOUND**: Specified role does not exist

### Vault Access Errors
- **VAULT_ACCESS_DENIED**: User cannot access this vault
- **BLOB_ACCESS_DENIED**: User cannot access this blob
- **SHARE_ACCESS_DENIED**: User cannot access this share

### Feature Gating Errors
- **FEATURE_REQUIRES_PRO**: Feature is only available in Pro tier
- **FEATURE_REQUIRES_ENTERPRISE**: Feature is only available in Enterprise tier
- **FEATURE_NOT_AVAILABLE**: Feature not available in current subscription tier

## Validation Errors (400 Bad Request)

### Request Format Errors
- **INVALID_JSON**: Request body is not valid JSON
- **MISSING_REQUIRED_FIELD**: Required field is missing from request body
- **INVALID_FIELD_TYPE**: Field type does not match expected type
- **INVALID_FIELD_VALUE**: Field value is invalid or out of range
- **VALIDATION_ERROR**: General validation error

### Email Validation Errors
- **INVALID_EMAIL**: Email format is invalid
- **EMAIL_ALREADY_EXISTS**: Email is already registered
- **EMAIL_NOT_VERIFIED**: Email has not been verified

### Metadata/Key Errors
- **INVALID_METADATA**: Encrypted metadata is empty or exceeds size limit
- **INVALID_KEY_DATA**: Key hierarchy data is malformed or invalid
- **INVALID_SEALED_BOX**: Sealed box is too small or too large
- **KEY_SIZE_MISMATCH**: Key size does not match expected length

### File/Blob Errors
- **INVALID_BLOB_ID**: Blob ID format is invalid
- **BLOB_SIZE_EXCEEDS_LIMIT**: File size exceeds tier-based limit
- **INVALID_CONTENT_TYPE**: Content type is not allowed (security)
- **FILE_TOO_LARGE**: File exceeds maximum size for tier
- **FILE_TOO_SMALL**: File size is below minimum
- **INVALID_S3_KEY**: S3 key contains invalid characters (path traversal)

### Billing Errors
- **INVALID_TIER**: Subscription tier is invalid or unknown
- **INVALID_PAYMENT_METHOD**: Payment method ID is invalid
- **INVALID_STRIPE_RESPONSE**: Stripe API returned unexpected response
- **INVALID_WEBHOOK_SIGNATURE**: Stripe webhook signature verification failed

### Sharing Errors
- **INVALID_RECIPIENT_ID**: Recipient user ID is invalid
- **RECIPIENT_NOT_FOUND**: Recipient user does not exist
- **INVALID_PUBLIC_KEY**: Public key format is invalid

### Multipart Upload Errors
- **INVALID_UPLOAD_ID**: Upload ID is not found or invalid
- **INVALID_PART_NUMBER**: Part number is out of range
- **INVALID_ETAG**: ETag value is malformed
- **INVALID_PART_LIST**: Part list is incomplete or invalid

## Resource Not Found Errors (404 Not Found)

### Vault Errors
- **VAULT_NOT_FOUND**: Vault does not exist or was deleted
- **VAULT_DELETED**: Vault has been deleted and is no longer accessible

### File/Blob Errors
- **BLOB_NOT_FOUND**: Blob does not exist in vault
- **FILE_NOT_FOUND**: File does not exist

### Member Errors
- **MEMBER_NOT_FOUND**: Member is not in vault
- **USER_NOT_FOUND**: User does not exist

### Share Errors
- **SHARE_NOT_FOUND**: Share does not exist or has expired
- **SHARE_EXPIRED**: Share has passed expiration date

### Key Errors
- **KEY_NOT_FOUND**: Key hierarchy not found for vault
- **PUBLIC_KEY_NOT_FOUND**: User's public key not found

### Audit Errors
- **AUDIT_ENTRY_NOT_FOUND**: Audit entry does not exist

### Billing Errors
- **SUBSCRIPTION_NOT_FOUND**: No subscription found for user
- **CUSTOMER_NOT_FOUND**: Stripe customer not found

## Conflict Errors (409 Conflict)

### Duplicate Errors
- **DUPLICATE_EMAIL**: Email is already registered
- **DUPLICATE_CREDENTIAL**: Credential already exists
- **DUPLICATE_PUBLIC_KEY**: Public key already published

### State Conflict Errors
- **VAULT_ALREADY_EXISTS**: Vault creation attempted for existing ID
- **MEMBER_ALREADY_EXISTS**: User is already a member of vault
- **SUBSCRIPTION_EXISTS**: Subscription already exists for user
- **ROLLBACK_DETECTED**: State version rollback detected (version <= max)

## Rate Limit Errors (429 Too Many Requests)

- **RATE_LIMIT_EXCEEDED**: Too many requests from this IP
- **RATE_LIMIT_USER_EXCEEDED**: Too many requests from this user
- **AUTH_RATE_LIMIT_EXCEEDED**: Too many authentication attempts

## Server Errors (500 Internal Server Error)

### Database Errors
- **DATABASE_ERROR**: Database query failed
- **DATABASE_CONNECTION_FAILED**: Cannot connect to database
- **TRANSACTION_FAILED**: Database transaction failed

### External Service Errors
- **S3_ERROR**: S3 operation failed
- **S3_CONNECTION_FAILED**: Cannot connect to S3
- **REDIS_ERROR**: Redis operation failed
- **REDIS_CONNECTION_FAILED**: Cannot connect to Redis
- **STRIPE_API_ERROR**: Stripe API call failed
- **STRIPE_CONNECTION_ERROR**: Cannot connect to Stripe

### Cryptography Errors
- **ENCRYPTION_FAILED**: Encryption operation failed
- **DECRYPTION_FAILED**: Decryption operation failed
- **KEY_GENERATION_FAILED**: Key generation failed
- **HASHING_FAILED**: Hashing operation failed
- **SIGNATURE_GENERATION_FAILED**: Signature generation failed

### Token/JWT Errors
- **JWT_GENERATION_FAILED**: Failed to generate JWT token
- **JWT_SIGNATURE_FAILED**: Failed to sign JWT token
- **TOKEN_GENERATION_FAILED**: Failed to generate refresh token

### WebAuthn Errors
- **WEBAUTHN_INIT_FAILED**: Failed to initialize WebAuthn
- **CHALLENGE_GENERATION_FAILED**: Failed to generate challenge
- **ATTESTATION_VERIFICATION_FAILED**: Attestation verification failed
- **ASSERTION_VERIFICATION_FAILED**: Assertion verification failed

### Email Errors
- **EMAIL_SEND_FAILED**: Failed to send email notification
- **VERIFICATION_EMAIL_FAILED**: Failed to send verification email

### Generic Server Errors
- **INTERNAL_SERVER_ERROR**: Unexpected server error
- **SERVICE_UNAVAILABLE**: Service temporarily unavailable
- **OPERATION_TIMEOUT**: Operation exceeded timeout

## Service Unavailable (503 Service Unavailable)

- **SERVICE_DEGRADED**: One or more critical dependencies are down
- **DATABASE_UNAVAILABLE**: Database is not responding
- **CACHE_UNAVAILABLE**: Redis cache is not responding
- **STORAGE_UNAVAILABLE**: S3 storage is not responding
- **CIRCUIT_BREAKER_OPEN**: Circuit breaker is open for external service

## Error Response Format

All error responses follow this format:

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {
    "field": "additional context if applicable",
    "reason": "specific reason if applicable"
  }
}
```

### Example Error Responses

**Invalid Request (400):**
```json
{
  "code": "MISSING_REQUIRED_FIELD",
  "message": "Field 'email' is required",
  "details": {
    "field": "email"
  }
}
```

**Unauthorized (401):**
```json
{
  "code": "EXPIRED_TOKEN",
  "message": "JWT token has expired",
  "details": {
    "expires_at": "2025-03-09T12:00:00Z"
  }
}
```

**Forbidden (403):**
```json
{
  "code": "INSUFFICIENT_PERMISSIONS",
  "message": "User does not have permission to update this vault",
  "details": {
    "required_permission": "write",
    "user_role": "viewer"
  }
}
```

**Not Found (404):**
```json
{
  "code": "VAULT_NOT_FOUND",
  "message": "Vault with ID 'abc123' does not exist",
  "details": {
    "vault_id": "abc123"
  }
}
```

**Rate Limited (429):**
```json
{
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests",
  "details": {
    "retry_after_seconds": 60,
    "limit": "100 requests per minute"
  }
}
```

**Server Error (500):**
```json
{
  "code": "DATABASE_ERROR",
  "message": "Failed to query database",
  "details": {
    "request_id": "req_12345"
  }
}
```

## Best Practices for Error Handling

### Client-Side
1. Always check the `code` field for programmatic error handling
2. Display the `message` field to users in their language
3. Use the `details` object for additional context
4. Implement exponential backoff for 5xx errors
5. Respect `retry_after` header for rate limit errors
6. Handle 503 responses by retrying after a delay

### Server-Side
1. Log all errors with request ID for debugging
2. Include request ID in error responses for tracing
3. Never expose internal stack traces to clients
4. Use consistent error codes across all endpoints
5. Include actionable information in error messages
6. Rate limit authentication endpoints more strictly
7. Implement circuit breakers for external services
8. Monitor error rates for security incidents

## Security Considerations

- **Do NOT log sensitive data** (passwords, tokens, keys) in error messages
- **Do NOT expose internal errors** to clients; wrap them in generic messages
- **Do NOT leak information** about existence of resources when access is denied
- **Use 401/403 consistently** to avoid information disclosure
- **Implement rate limiting** especially on authentication endpoints
- **Log security-relevant errors** separately for audit purposes
- **Monitor for attack patterns** such as brute force or enumeration attempts

## Related Documents

- [OpenAPI Specification](./openapi.yaml)
- [Security Guidelines](../../SECURITY.md)
