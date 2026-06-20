# USBVault Enterprise — On-Call Runbook

## Escalation Path

| Severity | Response Time | Escalation |
|----------|--------------|------------|
| P0 — Service Down | 15 min | Primary on-call → Engineering Lead → CTO |
| P1 — Degraded | 30 min | Primary on-call → Engineering Lead |
| P2 — Non-Critical | 4 hours | Primary on-call |
| P3 — Informational | Next business day | Ticket queue |

## Monitoring Dashboards

- **Grafana**: `<PRODUCTION_GRAFANA_URL>/d/usbvault-overview`
- **Sentry**: `<SENTRY_ORG_URL>/issues/?project=usbvault`
- **PagerDuty**: Alerts auto-route to on-call rotation

See also: `usbvault-server/deploy/monitoring/alerting-runbook.md` for alert-specific response procedures.

---

## Alert Response Procedures

### HighErrorRate (>5% 5xx for 5 min)

**Symptoms**: API returning 500s, client showing "Something went wrong"

**Steps**:
1. Check Grafana error rate panel — which endpoints are failing?
2. Check Sentry for new error clusters
3. Check `kubectl logs -l app=usbvault-api --tail=100` for stack traces
4. Check recent deployments: `kubectl rollout history deployment/usbvault-api`
5. If deployment-related: `kubectl rollout undo deployment/usbvault-api`
6. Check database connectivity: `kubectl exec -it <pod> -- curl localhost:8080/health`
7. Check Redis connectivity (rate limiter, sessions)

**Common causes**: Bad deployment, database connection pool exhaustion, Redis timeout

---

### HighLatency (p99 > 2s for 5 min)

**Symptoms**: App feels slow, timeouts

**Steps**:
1. Check Grafana latency panel — is it all endpoints or specific ones?
2. Check database slow query log
3. Check Redis latency: `redis-cli --latency`
4. Check pod CPU/memory: `kubectl top pods -l app=usbvault-api`
5. Check HPA status: `kubectl get hpa usbvault-api`
6. If database: check connection pool metrics at `/metrics/pool`
7. If S3: check multipart upload operations

**Common causes**: Database query regression, connection pool saturation, S3 latency spike

---

### AuthenticationFailureSpike (>50 failed logins in 5 min)

**Symptoms**: Legitimate users locked out, rate limiter triggering

**Steps**:
1. Check if this is a brute-force attack or a legitimate service issue
2. Check Grafana auth failure panel — single IP or distributed?
3. If single IP: the rate limiter should already be blocking
4. If distributed: check for credential stuffing (different usernames, same password patterns)
5. Check SRP verification logs for error patterns
6. Verify FIDO2/WebAuthn service is responding
7. If legitimate users affected: check JWT key rotation status

**Common causes**: Credential stuffing attack, JWT key expiry, FIDO2 service issue

---

### DatabaseConnectionPoolExhausted

**Symptoms**: 503 errors, "connection pool exhausted" in logs

**Steps**:
1. Check `/metrics/pool` endpoint for pool stats
2. Check for long-running transactions: `SELECT * FROM pg_stat_activity WHERE state = 'active'`
3. Check if a migration is running (locks tables)
4. Increase pool temporarily: set `DB_MAX_CONNECTIONS` env var and restart
5. Check for connection leaks (connections not being returned)

**Common causes**: Long-running queries, connection leaks, traffic spike beyond pool capacity

---

### StorageQuotaExceeded

**Symptoms**: Upload failures, "insufficient storage" errors

**Steps**:
1. Check S3 bucket usage
2. Check per-user storage quotas in database
3. If legitimate growth: increase S3 bucket limits
4. If abuse: check for abnormally large uploads or rapid provisioning
5. Review garbage collection: `kubectl get cronjob gc-expired-blobs`

---

### CertificatePinningFailure

**Symptoms**: Mobile app can't connect, "certificate mismatch" errors

**Steps**:
1. Check if TLS certificate was recently rotated
2. Verify current cert pins match app-embedded pins
3. If cert was rotated: the backup pin should still work
4. If both pins fail: emergency app update required
5. Check `EXPO_PUBLIC_PIN_EXPIRATION` — has it passed?

**Prevention**: Always rotate pins 30 days before expiry. Keep backup pin from intermediate CA.

---

## Common Operations

### Rolling Restart
```bash
kubectl rollout restart deployment/usbvault-api
kubectl rollout status deployment/usbvault-api --timeout=120s
```

### Emergency Rollback
```bash
kubectl rollout undo deployment/usbvault-api
```

### Database Migration Status
```bash
kubectl logs job/usbvault-migration --tail=50
```

### Force JWT Key Rotation
```bash
curl -X POST https://api.usbvault.io/api/v1/admin/rotate-jwt-keys \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Check Circuit Breaker States
```bash
curl https://api.usbvault.io/health | jq '.circuit_breakers'
```

### View Rate Limiter Status
```bash
redis-cli KEYS "ratelimit:*" | head -20
```

---

## Post-Incident

After any P0/P1 incident:
1. Write incident report within 24 hours
2. Identify root cause
3. Create follow-up tickets for preventive measures
4. Update this runbook if a new failure mode was discovered
5. Share learnings in team retro
