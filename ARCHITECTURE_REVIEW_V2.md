# USBVault Enterprise — Architecture Review v2 (Post-Remediation)

**Date:** March 23, 2026
**Scope:** Full-stack deep audit after completing all 12 items from v1 review
**Focus:** Production-breaking bugs, security vulnerabilities, resource leaks, data integrity risks

---

## Executive Summary

The v1 architecture review addressed 12 structural issues across 4 phases. This second pass performs a deeper audit — reading actual code paths, tracing data flows, and stress-testing assumptions. It surfaces **25 new findings** that the first review's broader scope missed: cryptographic implementation flaws, resource leaks in long-running processes, race conditions in concurrent operations, and defense gaps in the security perimeter.

The findings are grouped by severity. Critical issues should be fixed before any production deployment. High-severity issues should be addressed within the current sprint.

---

## CRITICAL — Fix Before Production

### C-1. `openSealed()` Ignores the Secret Key (Crypto Bypass)
**File:** `usbvault-app/src/crypto/native.ts:333-341`

The sealed-box decryption function accepts a secret key parameter but never uses it. The parameter is named `_secretKeyHex` (underscore convention = intentionally unused). The function derives the decryption key directly from the ephemeral public key embedded in the ciphertext rather than performing ECDH between the sender's ephemeral public key and the recipient's secret key.

**Impact:** Anyone who intercepts a sealed message can decrypt it — the recipient's private key is not involved. This breaks the fundamental E2E guarantee for shared files.

**Fix:** Perform X25519 ECDH between the ephemeral public key and the recipient's secret key to derive the shared secret, then use that to decrypt.

---

### C-2. Stream Cipher Nonce Derivation via XOR (Nonce Reuse Risk)
**File:** `usbvault-crypto/src/streaming.rs:149-156`

Per-chunk nonces are derived by XOR-ing the base nonce with the chunk index. If two files are encrypted with the same key and the same base nonce (possible if the CSPRNG state is cloned or the nonce generation is seeded identically), all chunk nonces will collide. XChaCha20-Poly1305 and AES-GCM both catastrophically fail on nonce reuse — an attacker can XOR the ciphertexts to recover the keystream and both plaintexts.

**Impact:** Plaintext recovery for any two files encrypted under the same key + base nonce pair. Especially dangerous in backup/restore flows where files are re-encrypted.

**Fix:** Derive per-chunk nonces using HKDF with the chunk index as info, not XOR. This ensures nonce independence even under base-nonce collision:
```
chunk_nonce = HKDF-Expand(base_nonce || chunk_index, key, 24)
```

---

### C-3. TOCTOU Race in Vault Rollback Detection
**File:** `usbvault-server/internal/vault/repository.go:231-256`

`CheckRollback` reads `max_state_version`, compares it to the incoming version, then updates it — in three separate, non-atomic SQL statements. Two concurrent requests with the same state version will both pass the check, allowing state rollback attacks.

**Impact:** An attacker can replay older vault state by sending concurrent requests, defeating the entire rollback protection mechanism.

**Fix:** Single atomic UPDATE with a WHERE clause:
```sql
UPDATE vaults SET max_state_version = $1
WHERE id = $2 AND max_state_version < $1
RETURNING max_state_version;
```
If zero rows affected, the version was not newer — reject as rollback.

---

### C-4. WebSocket Read Loop Goroutine Leak
**File:** `usbvault-server/internal/sync/service.go:233-253`

The WebSocket read-loop goroutine blocks on `conn.Read(ctx)`. When the context is cancelled (client disconnect, server shutdown), `Read` does not reliably unblock — the goroutine hangs indefinitely. It only exits on a read error, not on context cancellation.

**Impact:** Every cleanly-disconnected WebSocket client leaks a goroutine permanently. Under sustained load (thousands of mobile clients cycling connections), the server will exhaust memory.

**Fix:** Set a read deadline on the connection that gets refreshed on each successful read. On context cancellation, close the connection to unblock the reader.

---

### C-5. Stripe Reconciliation Silently Swallows Decode Errors
**File:** `usbvault-server/internal/billing/service.go:372`

`json.NewDecoder(resp.Body).Decode(&result)` — the error return is not checked. If Stripe returns malformed JSON (API version mismatch, partial response, network error), `result` stays zero-initialized and the billing status update proceeds with wrong data.

**Impact:** Subscription status silently drifts from Stripe's source of truth. Users may lose access to paid features or retain access after cancellation.

**Fix:** Check and log the decode error. On failure, skip the update and increment a reconciliation-failure metric.

---

## HIGH — Fix This Sprint

### H-1. SRP Client Ephemeral Is Non-Functional
**File:** `usbvault-app/src/crypto/native.ts:347-351`

The SRP-6a client ephemeral generation produces random bytes instead of performing the required modular exponentiation (g^a mod N). The public and private keys are unrelated random values, not a DH keypair. This means the SRP handshake either fails silently or degrades to a weaker protocol.

**Impact:** SRP mutual authentication may be broken or bypassable, undermining the zero-knowledge authentication guarantee.

**Fix:** Implement proper SRP-6a ephemeral generation: generate random `a`, compute `A = g^a mod N`, return `(A, a)` as the public/private pair.

---

### H-2. Token Refresh Race Condition
**File:** `usbvault-app/src/services/api.ts:155-177`

When multiple API calls receive 401 simultaneously, each triggers a token refresh. The `refreshTokenInProgress` guard has a narrow race window: between checking `null` and assigning the promise, another call can also enter the refresh path. This causes duplicate refresh requests, and one will fail with an invalid refresh token (already consumed).

**Impact:** Users experience random auth failures when multiple API calls fire concurrently (common on dashboard load). Retry logic masks the problem but adds latency.

**Fix:** Use a mutex or ensure the promise is assigned synchronously before any `await`:
```typescript
if (!refreshPromise) {
  refreshPromise = doRefresh(); // Synchronous assignment
}
return refreshPromise;
```

---

### H-3. Logout Doesn't Clean Up Background Processes
**File:** `usbvault-app/src/stores/authStore.ts:298-326`

The web logout path returns early without stopping: vault polling (15s interval), idle timer (4 event listeners), sharing cleanup interval, sync store subscriptions. These continue making API calls with an expired token, generating 401 errors that trigger token refresh on a logged-out session.

**Impact:** Post-logout resource waste, error storms in logs, and potential session confusion if the user logs into a different account.

**Fix:** Call `stopVaultPolling()`, `stopIdleTimer()`, and service `destroy()` methods before clearing auth state.

---

### H-4. Zustand Store Subscriptions Never Unsubscribe (Memory Leak)
**Files:** `usbvault-app/src/stores/syncStore.ts:77-86`, `offlineStore.ts:30-35`

Both stores call external service `.subscribe()` during initialization but never store or call the unsubscribe handle. Each hot-module reload in development (and each session in production) accumulates listeners.

**Impact:** Unbounded memory growth. In production, memory usage climbs steadily over long sessions until the app is killed.

**Fix:** Store the unsubscribe handles and call them in a cleanup function triggered by logout or app teardown.

---

### H-5. X-Forwarded-For Header Spoofing
**File:** `usbvault-server/internal/middleware/auth.go:251-270`

`getClientIP()` trusts the first entry in `X-Forwarded-For` unconditionally. If the reverse proxy is misconfigured (or absent in dev), a client can spoof their IP to bypass per-IP rate limiting on auth endpoints.

**Impact:** Rate limit bypass on login, registration, and password reset endpoints. Enables credential brute-forcing.

**Fix:** Only trust `X-Forwarded-For` when the request comes from a known proxy IP. Use the rightmost untrusted IP, not the leftmost.

---

### H-6. Rate Limit Fallback Overshoots During Redis Outage
**File:** `usbvault-server/internal/middleware/ratelimit.go:210-219`

When Redis is unavailable, each instance falls back to an in-memory limiter at `limit/2`. With N instances, the effective global limit becomes `N * limit/2`. At 5 instances, that's 2.5× the intended rate.

**Impact:** Rate limiting becomes ineffective during Redis outages — exactly when the system is most vulnerable (degraded state).

**Fix:** Use `limit / expectedInstanceCount` for the fallback, or fail closed (deny all requests) on auth-critical endpoints.

---

### H-7. Electron CSP Allows unsafe-inline and unsafe-eval
**File:** `electron-shell/src/main.ts:56-59`

The Content Security Policy for the renderer process includes `'unsafe-inline'` and `'unsafe-eval'` in `script-src`. Combined with the 14 IPC handlers exposed via the preload bridge, any XSS vulnerability in the renderer grants full access to USB operations (read/write vault bytes, eject drives, format containers).

**Impact:** XSS → full vault access escalation path. A single injection in the web content gives the attacker direct USB I/O.

**Fix:** Remove `unsafe-inline` and `unsafe-eval`. Use nonce-based CSP for inline scripts if needed.

---

### H-8. IPC Handlers Accept Unbounded Data Without Validation
**File:** `electron-shell/src/usb-ipc-adapter.ts:131-159`

IPC handlers for `usb:appendBytes` and `usb:writeHeader` accept arbitrary `Buffer` data with no size validation. The `mountPoint` parameter in multiple handlers is not sanitized for path traversal (e.g., `../../etc/passwd`).

**Impact:** A compromised renderer can write arbitrary data to any filesystem path, corrupt vault containers with oversized writes, or perform path traversal attacks.

**Fix:** Validate `mountPoint` against a whitelist of known USB mount paths. Enforce a maximum buffer size per IPC call.

---

## MEDIUM — Address in Next Sprint

### M-1. No API Response Validation on Frontend
**File:** `usbvault-app/src/services/api.ts:355-379`

API responses are cast to TypeScript types without runtime validation. If the server returns unexpected shapes (missing fields, wrong types), the app will crash at unpredictable points rather than at the API boundary.

**Fix:** Add runtime schema validation (Zod or io-ts) for critical API responses, especially auth and crypto-related endpoints.

---

### M-2. Missing Request Cancellation on Component Unmount
**Files:** Throughout `usbvault-app/src/app/(tabs)/` screens

API calls in `useEffect` don't use `AbortController`. When a user navigates away mid-request, the response handler runs on an unmounted component, causing React warnings and potential state corruption.

**Fix:** Pass `AbortController.signal` to axios requests. Cancel on effect cleanup.

---

### M-3. Activity Polling Continues on Hidden Tabs
**File:** `usbvault-app/src/app/(tabs)/activity.tsx:105-110`

The activity screen polls every 5 seconds regardless of tab visibility. This wastes bandwidth and battery on mobile, and generates unnecessary server load.

**Fix:** Use `document.visibilityState` or `AppState` to pause polling when the tab/app is backgrounded.

---

### M-4. Metadata Reduction Batch Timer Never Stopped
**File:** `usbvault-app/src/services/security/metadataReductionService.ts:347-372`

The batch processing `setInterval` is created in `startBatchTimer()` but `stopBatchTimer()` is never called in the app lifecycle.

**Fix:** Call `stopBatchTimer()` during logout/cleanup.

---

### M-5. Unbounded Vault List in Memory
**File:** `usbvault-app/src/stores/vaultListStore.ts:273-280`

All vaults are loaded into a single array in memory. No pagination, no virtualization. Users with hundreds of vaults will experience degraded performance and high memory usage.

**Fix:** Implement cursor-based pagination in the API and store. Use `FlatList` with windowing for rendering.

---

### M-6. Missing Pagination Guard in Repository Layer
**File:** `usbvault-server/internal/vault/repository.go:74-103`

`ListVaults` has no hard maximum on the `limit` parameter. If any handler passes an uncapped limit, the query returns unbounded results.

**Fix:** Enforce `maxResultsPerQuery = 1000` at the repository level regardless of caller input.

---

### M-7. HTTP Response Body Not Closed in Device Attestation
**File:** `usbvault-server/internal/device/attestation.go:472-479`

The response body is read with `io.ReadAll()` for error logging, then `json.Decode` attempts to read the same (already-consumed) body. The body is never closed with `defer resp.Body.Close()`.

**Fix:** Add `defer resp.Body.Close()` immediately after the HTTP call. Buffer the body once and decode from the buffer.

---

### M-8. Async Audit Logging Drops Trace Context
**File:** `usbvault-server/internal/middleware/audit.go:86-119`

The audit goroutine creates a fresh `context.Background()`, discarding the request's trace ID and cancellation signal. Audit entries can't be correlated with the requests that generated them.

**Fix:** Extract the trace ID from the request context and inject it into the background context.

---

### M-9. Kubernetes Egress Policy Is Wide-Open
**File:** `deploy/k8s/production-values.yaml:328-330`

The network policy allows unrestricted egress (`to: []`). A compromised pod can exfiltrate data to any external endpoint or establish C2 channels.

**Fix:** Restrict egress to known destinations: PostgreSQL, Redis, S3/MinIO, Stripe API, and DNS only.

---

## Priority Matrix

| # | Finding | Severity | Category | Risk |
|---|---------|----------|----------|------|
| C-1 | openSealed() ignores secret key | **Critical** | Crypto | E2E sharing broken |
| C-2 | Nonce derivation via XOR | **Critical** | Crypto | Plaintext recovery |
| C-3 | TOCTOU in rollback check | **Critical** | Concurrency | State rollback attacks |
| C-4 | WebSocket goroutine leak | **Critical** | Resource Leak | Memory exhaustion |
| C-5 | Stripe decode error swallowed | **Critical** | Data Integrity | Billing drift |
| H-1 | SRP ephemeral non-functional | **High** | Crypto | Auth bypass |
| H-2 | Token refresh race condition | **High** | Concurrency | Random auth failures |
| H-3 | Logout doesn't stop background | **High** | Resource Leak | Post-logout error storms |
| H-4 | Zustand subscription leak | **High** | Resource Leak | Unbounded memory growth |
| H-5 | X-Forwarded-For spoofing | **High** | Security | Rate limit bypass |
| H-6 | Rate limit fallback overshoot | **High** | Security | Brute-force during outage |
| H-7 | Electron CSP too permissive | **High** | Security | XSS → vault access |
| H-8 | IPC handlers unvalidated | **High** | Security | Path traversal, DoS |
| M-1 | No API response validation | Medium | Reliability | Unpredictable crashes |
| M-2 | Missing request cancellation | Medium | Performance | React warnings, state bugs |
| M-3 | Activity polls on hidden tabs | Medium | Performance | Wasted resources |
| M-4 | Batch timer never stopped | Medium | Resource Leak | Orphaned interval |
| M-5 | Unbounded vault list | Medium | Performance | Degraded UX at scale |
| M-6 | Repository missing pagination cap | Medium | DoS | Memory exhaustion |
| M-7 | Response body not closed | Medium | Resource Leak | Connection exhaustion |
| M-8 | Audit drops trace context | Medium | Observability | Can't correlate events |
| M-9 | Egress policy wide-open | Medium | Security | Data exfiltration |

---

## Recommended Execution Order

**Phase 1 — Crypto Integrity (Immediate):**
C-1, C-2, H-1 — Fix the broken cryptographic primitives. These undermine the entire zero-knowledge guarantee.

**Phase 2 — Server Stability (Week 1):**
C-3, C-4, C-5 — Fix the rollback race, goroutine leak, and Stripe decode. These cause data corruption and resource exhaustion.

**Phase 3 — Client Resilience (Week 2):**
H-2, H-3, H-4 — Fix token refresh, logout cleanup, and subscription leaks. These cause user-visible failures.

**Phase 4 — Security Hardening (Week 3):**
H-5, H-6, H-7, H-8, M-9 — Fix rate limit bypass, Electron CSP, IPC validation, and network policies.

**Phase 5 — Polish (Ongoing):**
M-1 through M-8 — API validation, request cancellation, polling efficiency, pagination caps.
