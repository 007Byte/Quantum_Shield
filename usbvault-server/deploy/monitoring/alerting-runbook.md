# Quantum_Shield — Alerting Runbook

This document provides response procedures for every Prometheus alert defined in `alert_rules.yml`.

---

## 1. HighErrorRate

| Field | Value |
|-------|-------|
| **Severity** | critical |
| **Expression** | `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05` |
| **For** | 5 minutes |

### What it means
More than 5% of all HTTP responses are returning 5xx status codes sustained over 5 minutes. The API is failing for a material fraction of requests.

### Likely causes
- Application crash loop or OOM kill on the `usbvault-api` container.
- Downstream dependency failure (PostgreSQL, Redis, or S3/MinIO unreachable).
- Bad deployment — new code introduced a panic or unhandled error path.
- Resource exhaustion (file descriptors, goroutine leak, connection pool).

### Immediate actions
1. Open the Grafana "API Overview" row. Identify which `path` and `method` labels carry the 5xx traffic.
2. Check container health: `docker ps --filter name=usbvault-api` — look for restart counts.
3. Tail application logs: `docker logs --tail 200 usbvault-api`.
4. If a specific dependency is down, check the "Infrastructure" row for circuit breaker state.
5. If the error rate started at a known deploy time, roll back: `docker compose up -d --no-deps api` with the previous image tag.
6. If PostgreSQL is the cause, check `DatabaseConnectionPoolExhausted` alert and follow that runbook entry.

### Escalation path
1. On-call SRE triages (first 10 min).
2. If not resolved in 15 min, page backend engineering lead.
3. If customer-impacting for > 30 min, notify incident commander and begin public status page update.

### Recovery verification
- Error rate drops below 1% for 10 consecutive minutes.
- No new error log entries for the identified path.
- Health check endpoint returns 200.

---

## 2. HighLatency

| Field | Value |
|-------|-------|
| **Severity** | warning |
| **Expression** | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2` |
| **For** | 5 minutes |

### What it means
The 95th percentile HTTP response time exceeds 2 seconds. Users experience slow page loads and API timeouts.

### Likely causes
- Database query performance degradation (missing index, table bloat, long-running transactions).
- Redis cache miss storm or Redis latency spike.
- S3/MinIO storage latency for large vault operations.
- Increased traffic without proportional scaling.
- Garbage collection pressure from memory overuse.

### Immediate actions
1. Open the Grafana "API Overview" row and check which endpoints show elevated latency.
2. Check PostgreSQL slow query log: `docker exec usbvault-postgres psql -U usbvault -c "SELECT pid, now() - query_start AS duration, query FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC LIMIT 10;"`.
3. Check Redis latency: `docker exec usbvault-redis redis-cli --latency`.
4. Review the "Storage & Crypto" row — if upload duration is high, the bottleneck may be S3.
5. If load-related, scale API replicas if running in swarm/k8s.

### Escalation path
1. On-call SRE investigates (first 15 min).
2. If database-related, escalate to DBA or backend engineer.
3. If infrastructure-related (disk I/O, network), escalate to platform team.

### Recovery verification
- P95 latency returns below 1 second for 10 consecutive minutes.
- No active slow queries in PostgreSQL.

---

## 3. AuthenticationFailureSpike

| Field | Value |
|-------|-------|
| **Severity** | critical |
| **Expression** | `rate(auth_failures_total[5m]) > 10` |
| **For** | 2 minutes |

### What it means
Authentication failures are exceeding 10 per second. This may indicate a brute-force attack, credential-stuffing campaign, or a broken client deployment.

### Likely causes
- Brute-force or credential-stuffing attack against the SRP or FIDO2 auth endpoints.
- Client application bug sending malformed authentication payloads after an update.
- Key/certificate rotation that left clients with stale credentials.
- Rate limiter misconfiguration allowing excessive attempts.

### Immediate actions
1. Open the Grafana "Security" row. Check `usbvault_auth_attempts_total` to see which `method` (srp/fido2) and whether failures are from many IPs or a single source.
2. Check `usbvault_rate_limit_hits_total` — if rate limiter is rejecting, it is working. If not, verify rate limiter is active.
3. Check application logs for source IPs: `docker logs usbvault-api 2>&1 | grep -i "auth.*fail" | tail -50`.
4. If attack confirmed, add offending IP ranges to the WAF/firewall block list.
5. If client bug, coordinate with frontend team to issue a hotfix or revert.
6. Verify no accounts have been compromised — check `usbvault_security_events_total` for account lockout events.

### Escalation path
1. On-call SRE + Security on-call simultaneously (this is a potential security incident).
2. If confirmed attack, initiate incident response procedure per company security policy.
3. Notify CISO if any account compromise is detected.

### Related runbook reference
- See PagerDuty configuration in `deploy/monitoring/pagerduty.yml` for routing.

### Recovery verification
- Auth failure rate drops below 1/sec for 10 minutes.
- No unauthorized access detected in audit logs (`usbvault_audit_log_entries_total`).
- Rate limiters confirmed active and correctly configured.

---

## 4. DatabaseConnectionPoolExhausted

| Field | Value |
|-------|-------|
| **Severity** | warning |
| **Expression** | `pg_stat_activity_count / pg_settings_max_connections > 0.8` |
| **For** | 5 minutes |

### What it means
PostgreSQL active connections have reached 80% of `max_connections`. If connections continue to grow, new requests will fail with "too many connections" errors.

### Likely causes
- Connection leak in application code (connections not returned to pool).
- Traffic spike without connection pool limit enforcement.
- Long-running transactions holding connections open (migrations, batch jobs, stuck queries).
- Connection pool misconfiguration (`max_open_conns` too high or `max_idle_conns` too low).

### Immediate actions
1. Check active connections: `docker exec usbvault-postgres psql -U usbvault -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"`.
2. Identify long-running queries: `docker exec usbvault-postgres psql -U usbvault -c "SELECT pid, now() - query_start AS duration, query FROM pg_stat_activity WHERE state != 'idle' ORDER BY duration DESC LIMIT 10;"`.
3. Kill stuck queries if safe: `SELECT pg_terminate_backend(<pid>);`.
4. Check API container pool settings — ensure `max_open_conns` is set to a value well below `max_connections`.
5. If a batch job or migration is running, allow it to complete or schedule it for off-peak hours.
6. As a temporary measure, increase `max_connections` in PostgreSQL config (requires restart).

### Escalation path
1. On-call SRE (first 10 min).
2. DBA or backend engineer if connection leak suspected.
3. If query kill is required on production, get approval from engineering lead.

### Recovery verification
- Connection utilization drops below 60% of max.
- No "too many connections" errors in application logs.
- `HighErrorRate` alert has not fired as a consequence.

---

## 5. DiskSpaceLow

| Field | Value |
|-------|-------|
| **Severity** | warning |
| **Expression** | `(node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100 < 15` |
| **For** | 10 minutes |

### What it means
Available disk space on a monitored node has dropped below 15%. If it reaches 0%, services will crash, databases will corrupt, and logs will stop writing.

### Likely causes
- Log files growing unbounded (application, PostgreSQL, or system logs).
- Database WAL (Write-Ahead Log) accumulation from replication lag or failed archival.
- Large file uploads filling the MinIO/S3 data volume.
- Docker images and dangling volumes consuming space.
- Audit log retention not enforced.

### Immediate actions
1. Identify which filesystem is low: check the `device` label on the alert or run `df -h` on the host.
2. Check Docker disk usage: `docker system df`.
3. Clean up unused Docker resources: `docker system prune -f` (does NOT remove named volumes).
4. Check log sizes: `du -sh /var/log/* | sort -rh | head -10`.
5. If PostgreSQL WAL, check replication status and archive command.
6. If MinIO data volume, review vault storage quotas and consider expanding the volume.
7. Rotate and compress old logs immediately if they are the primary consumer.

### Escalation path
1. On-call SRE (immediate).
2. If infrastructure provisioning is needed (volume expansion), escalate to platform/cloud team.
3. If database WAL, escalate to DBA.

### Recovery verification
- Available disk space is above 25%.
- Alert has cleared and does not re-fire within 30 minutes.
- Root cause addressed (log rotation configured, volume expanded, etc.).

---

## 6. MemoryUsageHigh

| Field | Value |
|-------|-------|
| **Severity** | critical |
| **Expression** | `(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 90` |
| **For** | 5 minutes |

### What it means
System memory usage exceeds 90%. The OOM killer may start terminating processes, which can cause data corruption and service outages.

### Likely causes
- Memory leak in the USBVault API (goroutine leak, unbounded cache growth).
- Redis consuming excessive memory (no eviction policy, dataset larger than expected).
- PostgreSQL `shared_buffers` or `work_mem` over-provisioned relative to system RAM.
- Too many containers scheduled on the same host.
- Large file encryption operations consuming temporary memory buffers.

### Immediate actions
1. Identify the top memory consumers: `docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"`.
2. If the API is the consumer, check goroutine count via the `/debug/pprof/goroutine` endpoint (if enabled) or application metrics.
3. If Redis, check memory: `docker exec usbvault-redis redis-cli info memory`. Set `maxmemory-policy allkeys-lru` if not configured.
4. Restart the offending container as an immediate mitigation: `docker restart <container>`.
5. If system-wide, consider migrating workloads or adding swap as temporary relief.

### Escalation path
1. On-call SRE (immediate — critical severity).
2. If memory leak confirmed, page backend engineering for root-cause analysis.
3. If infrastructure under-provisioned, escalate to platform team for capacity increase.

### Recovery verification
- Memory usage drops below 80%.
- No OOM kill entries in `dmesg` or system journal.
- Service health checks all passing.

---

## 7. CertificateExpiringSoon

| Field | Value |
|-------|-------|
| **Severity** | warning |
| **Expression** | `probe_ssl_earliest_cert_expiry - time() < 30 * 24 * 3600` |
| **For** | 1 hour |

### What it means
A TLS certificate monitored by the blackbox exporter will expire within 30 days. If it expires, clients will receive TLS errors and the service will be effectively unavailable.

### Likely causes
- Automatic certificate renewal (e.g., Let's Encrypt / cert-manager) has stopped working.
- DNS validation for certificate renewal is failing.
- Certificate was manually provisioned and the renewal was not scheduled.
- ACME account credentials expired or rate-limited.

### Immediate actions
1. Identify which certificate is expiring from the alert labels (target/instance).
2. Check the certificate expiry directly: `echo | openssl s_client -connect <host>:443 2>/dev/null | openssl x509 -noout -dates`.
3. If using Let's Encrypt / certbot, check renewal: `certbot renew --dry-run`.
4. If using cert-manager (Kubernetes), check the Certificate resource status: `kubectl describe certificate <name>`.
5. Check DNS records are correct for ACME challenge validation.
6. If automated renewal cannot be fixed quickly, manually issue a certificate and install it.

### Escalation path
1. On-call SRE (first response, non-urgent if > 14 days remain).
2. If renewal mechanism is broken, escalate to platform/infrastructure team.
3. If < 7 days remain, treat as critical and escalate immediately.

### Recovery verification
- `probe_ssl_earliest_cert_expiry - time()` shows more than 60 days remaining after renewal.
- Automated renewal dry-run succeeds.
- Alert clears.

---

## General Escalation Contacts

| Role | Channel |
|------|---------|
| On-call SRE | PagerDuty (see `deploy/monitoring/pagerduty.yml`) |
| Backend Engineering Lead | Slack #usbvault-engineering |
| Security On-call | PagerDuty security service |
| Platform / Infrastructure | Slack #platform-ops |
| Incident Commander | Paged automatically for P1 incidents |
