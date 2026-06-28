# Quantum_Shield — Incident Response Playbook

This document defines how USBVault Engineering responds to production incidents. It covers severity classification, escalation, specific incident playbooks, communication templates, and post-incident review.

For alert-specific response procedures, see also: `usbvault-server/deploy/monitoring/alerting-runbook.md`

---

## Severity Classification

| Severity | Definition | Response SLA | Update Cadence | Examples |
|----------|-----------|-------------|----------------|----------|
| **P1 — Critical** | Service fully down or data integrity at risk | 15 min acknowledge, 1 hr mitigate | Every 30 min | API returning 5xx for all users, data breach detected, JWT key compromise |
| **P2 — Major** | Service degraded for a significant subset of users | 30 min acknowledge, 4 hr mitigate | Every 1 hr | Database connection exhaustion, S3 unavailable, auth failures spiking |
| **P3 — Minor** | Service degraded for a small subset, workaround exists | 4 hr acknowledge, 24 hr mitigate | Daily | Single endpoint errors, elevated latency on non-critical path, cert expiring < 14 days |
| **P4 — Low** | No user impact, preventive action needed | Next business day | As needed | Disk space warning, log volume spike, dependency CVE with no exploit |

---

## On-Call Escalation Path

```
Alert fires (PagerDuty / Prometheus)
  |
  v
Primary On-Call SRE (15 min response)
  |-- Can resolve? --> Resolve, update status page, write incident note
  |
  v (not resolved in 30 min OR P1 severity)
Backend Engineering Lead (Slack #usbvault-engineering)
  |-- Can resolve? --> Resolve + coordinate with SRE
  |
  v (P1 not resolved in 1 hr OR security incident)
CTO + Security On-Call
  |-- Declares major incident
  |-- Assigns Incident Commander
  |-- Activates war room (Slack #incident-active)
```

### Contact Channels

| Role | Primary | Secondary |
|------|---------|-----------|
| On-Call SRE | PagerDuty rotation | Slack #usbvault-ops |
| Engineering Lead | PagerDuty escalation | Slack #usbvault-engineering |
| Security On-Call | PagerDuty security service | security@usbvault.io |
| Incident Commander | Paged via PagerDuty P1 policy | Slack #incident-active |

---

## Incident Playbooks

### 1. Database Connection Exhaustion

**Symptoms**: 503 errors, "connection pool exhausted" in API logs, `/metrics/pool` shows max connections reached.

**Severity**: P2 (P1 if all requests failing)

**Diagnosis**:
```bash
# Check pool stats
curl -s https://api.usbvault.io/metrics/pool | jq .

# Check active PostgreSQL connections
psql "$DATABASE_URL" -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Find long-running queries
psql "$DATABASE_URL" -c "SELECT pid, now()-query_start AS duration, query FROM pg_stat_activity WHERE state='active' ORDER BY duration DESC LIMIT 10;"
```

**Mitigation**:
1. Kill stuck queries: `SELECT pg_terminate_backend(<pid>);` (get approval for production)
2. If a migration is running, wait for completion or schedule for off-peak
3. Temporarily increase pool: set `DB_MAX_CONNECTIONS=50` and restart API
4. Check for connection leaks — connections in `idle in transaction` state for > 60s indicate a bug

**Prevention**: The `idle_in_transaction_session_timeout=60000` PostgreSQL setting (configured in `docker-compose.prod.yml`) auto-terminates stale transactions.

---

### 2. Redis Failure

**Symptoms**: Auth failures spike (sessions lost), rate limiter stops working (all requests pass or all are rejected), elevated latency.

**Severity**: P2 (rate limiter and session store are degraded, but the API can still serve stateless requests)

**Diagnosis**:
```bash
# Check Redis health
docker exec usbvault-redis redis-cli -a "$REDIS_PASSWORD" ping

# Check memory usage
docker exec usbvault-redis redis-cli -a "$REDIS_PASSWORD" info memory

# Check connected clients
docker exec usbvault-redis redis-cli -a "$REDIS_PASSWORD" info clients
```

**Mitigation**:
1. If Redis is OOM: it is configured with `maxmemory-policy volatile-lru` which evicts expiring keys first. Check if maxmemory is too low.
2. If Redis process crashed: `docker restart usbvault-redis`. Session data is persisted via AOF (`appendonly yes`).
3. If Redis is unreachable (network): check Docker network `usbvault-backend` and container DNS.
4. If data is corrupt: stop Redis, delete `appendonly.aof`, restart. Users will need to re-authenticate.

**Impact**: While Redis is down, rate limiting is disabled (fail-open) and all active sessions are lost. Users must log in again once Redis recovers.

---

### 3. S3/MinIO Storage Unavailable

**Symptoms**: File upload/download failures, vault operations fail with storage errors, `/health` reports storage degradation.

**Severity**: P2 (vault read/write is broken but auth and metadata operations still work)

**Diagnosis**:
```bash
# Check MinIO health (Docker deployment)
curl -sf http://localhost:9000/minio/health/live && echo "OK" || echo "FAIL"

# Check S3 bucket accessibility (AWS)
aws s3 ls s3://${S3_BUCKET} --max-items 1

# Check API logs for storage errors
docker logs usbvault-api 2>&1 | grep -i "s3\|storage\|minio" | tail -20
```

**Mitigation**:
1. If MinIO container crashed: `docker restart usbvault-minio`. Data is on a persistent volume.
2. If AWS S3: check AWS Health Dashboard for regional issues. Consider failing over to a different region.
3. If the bucket was deleted: recreate it and restore from versioned copies or backup.
4. If credentials expired: rotate `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` and restart API.

**Note**: The bucket `usbvault-encrypted-blobs` has versioning enabled. Accidental deletes can be recovered from version history.

---

### 4. JWT Key Compromise

**Symptoms**: Unauthorized access detected in audit logs, tokens appearing for non-existent users, security alert from monitoring.

**Severity**: P1 — treat as a security incident

**Immediate Actions** (within 15 minutes):
1. **Rotate keys immediately**:
   ```bash
   # Generate new key pair
   ./scripts/generate-secrets.sh --force /etc/usbvault/secrets/

   # Restart API to pick up new keys
   # Docker:
   docker restart usbvault-api
   # Kubernetes:
   kubectl rollout restart deployment/usbvault-api -n usbvault
   ```
2. **Invalidate all sessions**: flush the Redis session store to force re-authentication:
   ```bash
   # This logs out ALL users — use only during confirmed compromise
   docker exec usbvault-redis redis-cli -a "$REDIS_PASSWORD" FLUSHDB
   ```
   Note: In production Redis, `FLUSHDB` is disabled via `rename-command`. Restart Redis with a fresh data volume instead.
3. **Review audit logs** for unauthorized actions performed with compromised tokens.
4. **Notify affected users** (see Communication Templates below).

**Follow-up**:
- Determine how the key was compromised (leaked in logs, exposed env var, insider threat)
- Review access controls on `/etc/usbvault/secrets/` and Kubernetes secrets
- Enable audit logging for secret access if not already configured

---

### 5. Data Breach Response

**Severity**: P1 — activate full incident response

**First 30 minutes**:
1. **Contain**: Identify the attack vector and close it. This may mean taking the service offline.
2. **Preserve evidence**: Do NOT destroy logs. Snapshot database, Redis, and API logs immediately.
3. **Assemble team**: Page Incident Commander, Security On-Call, Engineering Lead, and Legal.
4. **Assess scope**: Which users are affected? What data was accessed?

**Assessment checklist**:
- [ ] Which API endpoints were exploited? (check audit logs: `usbvault_audit_log_entries_total`)
- [ ] Were vault contents (encrypted blobs) accessed? (blobs are client-side encrypted — even if exfiltrated, they are unusable without user keys)
- [ ] Were user credentials accessed? (passwords are never stored — SRP verifiers are one-way)
- [ ] Was metadata exposed? (user emails, vault names, timestamps)
- [ ] Is the attacker still active? (check for ongoing unusual API calls)

**Note on USBVault's zero-knowledge architecture**: Vault contents are encrypted client-side before upload. The server never sees plaintext. A database breach exposes metadata and SRP verifiers but NOT vault contents or user passwords.

**Regulatory obligations**:
- GDPR: Notify supervisory authority within 72 hours if EU user data is affected
- State breach notification laws vary — consult Legal immediately
- PCI DSS: If payment data is involved (unlikely — Stripe handles card data), follow PCI incident response

---

### 6. DDoS / Rate Limit Exhaustion

**Symptoms**: Legitimate users getting 429 responses, API latency spiking, Redis memory usage climbing from rate limit keys.

**Severity**: P2 (P1 if service is fully unreachable)

**Diagnosis**:
```bash
# Check rate limiter metrics
curl -s https://api.usbvault.io/metrics | grep rate_limit

# Check top IPs hitting rate limits (from Nginx access logs)
docker logs usbvault-nginx 2>&1 | awk '{print $1}' | sort | uniq -c | sort -rn | head -20

# Check Redis memory from rate limit keys
docker exec usbvault-redis redis-cli -a "$REDIS_PASSWORD" DBSIZE
```

**Mitigation**:
1. **If single-source**: Block at the Nginx/WAF level before it reaches the API:
   ```bash
   # Add to Nginx deny list and reload
   echo "deny <attacker-ip>;" >> /etc/nginx/conf.d/blocklist.conf
   docker exec usbvault-nginx nginx -s reload
   ```
2. **If distributed**: Enable upstream DDoS protection (Cloudflare, AWS Shield, etc.)
3. **If rate limiter is too aggressive**: The API rate limiter is configured at 100 req/min per IP, 1000 req/min per user, and 10 req/min for auth endpoints. Adjust in `router.go` if legitimate traffic exceeds these.
4. **If Redis is overwhelmed by rate limit keys**: They are set with TTLs and will expire. If memory is critical, restart Redis (rate limit state is ephemeral).

---

## Monitoring and Alerting

### Prometheus Endpoints

The API server exposes metrics at `GET /metrics` in Prometheus text format. Key metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Total requests by method, path, status |
| `http_request_duration_seconds` | Histogram | Request latency distribution |
| `auth_failures_total` | Counter | Failed authentication attempts |
| `usbvault_audit_events_total` | Counter | Audit log events by severity |
| `usbvault_rate_limit_hits_total` | Counter | Rate limiter rejections |
| `usbvault_auth_attempts_total` | Counter | Auth attempts by method (srp/fido2) |
| `usbvault_security_events_total` | Counter | Security events (lockouts, anomalies) |

### Grafana Dashboard

Import the dashboard from `usbvault-server/deploy/monitoring/grafana-dashboard.json`. Panels:
- API Overview (request rate, error rate, latency percentiles)
- Security (auth failures, rate limit hits, audit events)
- Infrastructure (connection pool, Redis memory, disk usage)
- Storage & Crypto (upload duration, S3 operations)

### Alert Rules

Defined in `usbvault-server/deploy/monitoring/`. Critical alerts:
- `HighErrorRate` — >5% 5xx responses sustained 5 min
- `HighLatency` — p95 > 2s sustained 5 min
- `AuthenticationFailureSpike` — >10 auth failures/sec sustained 2 min
- `DatabaseConnectionPoolExhausted` — >80% pool utilization sustained 5 min
- `DiskSpaceLow` — <15% available sustained 10 min
- `MemoryUsageHigh` — >90% system memory sustained 5 min
- `CertificateExpiringSoon` — TLS cert expires within 30 days

---

## Communication Templates

### Status Page Update (Service Degradation)

```
Title: [Investigating] Elevated Error Rates on USBVault API

Body:
We are investigating reports of intermittent errors when accessing USBVault.
Your encrypted vault data remains secure — this issue affects service
availability, not data integrity.

We will provide an update within 30 minutes.

Impact: [Describe affected functionality — e.g., "File uploads and downloads
may fail intermittently. Existing cached/offline data remains accessible."]

Started: YYYY-MM-DD HH:MM UTC
```

### Status Page Update (Resolution)

```
Title: [Resolved] USBVault API Service Restored

Body:
The issue causing [describe symptoms] has been resolved. Root cause was
[brief non-technical description]. All services are operating normally.

No user data was affected. No action is required on your part.

Duration: HH:MM - HH:MM UTC (X hours Y minutes)
```

### Customer Notification (Security Incident)

```
Subject: Important Security Notice from USBVault

Body:
We are writing to inform you of a security incident that occurred on
[date]. [Describe what happened in plain language.]

What was affected:
- [List specific data types exposed, if any]

What was NOT affected:
- Your vault contents remain encrypted with your personal keys and were
  not accessible to the attacker. USBVault uses zero-knowledge encryption —
  we never have access to your decryption keys or plaintext data.
- Your password was not exposed. USBVault uses SRP (Secure Remote Password)
  protocol — your password is never sent to or stored on our servers.

What we are doing:
- [List remediation steps taken]

What you should do:
- [List any user actions required, e.g., "re-authenticate on your next login"]

If you have questions, contact security@usbvault.io.
```

---

## Post-Incident Review

Every P1 and P2 incident requires a blameless post-incident review (PIR) within 48 hours. P3 incidents get a PIR at the team's discretion.

### PIR Template

```
# Post-Incident Review: [Incident Title]

**Date of Incident**: YYYY-MM-DD
**Duration**: HH:MM - HH:MM UTC (total X hours Y minutes)
**Severity**: P1 / P2
**Incident Commander**: [Name]
**Author**: [Name]
**Review Date**: YYYY-MM-DD

## Summary
[2-3 sentences: what happened, who was affected, how it was resolved]

## Timeline (UTC)
- HH:MM — [Event: alert fired / symptom observed]
- HH:MM — [Event: on-call acknowledged]
- HH:MM — [Event: root cause identified]
- HH:MM — [Event: mitigation applied]
- HH:MM — [Event: service restored]
- HH:MM — [Event: incident declared resolved]

## Root Cause
[Technical explanation of why the incident occurred. Be specific — name the
component, the failure mode, and why existing safeguards did not prevent it.]

## Impact
- Users affected: [count or percentage]
- Data impact: [none / metadata exposed / encrypted blobs accessed (still encrypted)]
- Revenue impact: [if applicable]
- Duration of user-facing impact: [X minutes/hours]

## What Went Well
- [e.g., "Alerting detected the issue within 2 minutes"]
- [e.g., "Rollback procedure worked as documented"]

## What Could Be Improved
- [e.g., "Took 20 minutes to identify root cause because logs lacked correlation IDs"]
- [e.g., "Runbook did not cover this specific failure mode"]

## Action Items
| Action | Owner | Priority | Ticket |
|--------|-------|----------|--------|
| [e.g., Add circuit breaker for S3 calls] | [Name] | High | [LINK] |
| [e.g., Update runbook with this failure mode] | [Name] | Medium | [LINK] |
| [e.g., Add alerting for X metric] | [Name] | Medium | [LINK] |

## Lessons Learned
[What does the team now know that it did not know before? What systemic
issue does this incident reveal?]
```

### PIR Process

1. Incident Commander schedules the review meeting within 48 hours
2. Author (usually the engineer who resolved the incident) drafts the PIR using the template above
3. Team reviews in a blameless meeting — focus on systems, not individuals
4. Action items are filed as tickets with owners and deadlines
5. PIR document is stored in `docs/incidents/YYYY-MM-DD-<title>.md`
6. If this incident revealed a new failure mode, update `docs/ON_CALL_RUNBOOK.md` and the alerting runbook
