# Quantum_Shield — Production Launch Checklist
**Date**: 2026-03-12 | **Version**: 1.0

## 1. Infrastructure Readiness
- [ ] PostgreSQL RDS provisioned (encryption + Multi-AZ)
- [ ] Redis ElastiCache provisioned
- [ ] S3 bucket with encryption + versioning + lifecycle
- [ ] DNS configured for api.usbvault.io
- [ ] TLS certificate issued for production domain
- [ ] Certificate pins extracted and configured
- [ ] Kubernetes namespace + secrets created
- [x] K8s deployment manifests ready (`deploy/k8s/deployment.yaml`, `service.yaml`, `migration-job.yaml`)
- [x] HPA configured (3-10 pods, CPU 70%, Memory 80%) — `deploy/k8s/hpa.yaml`
- [x] NetworkPolicy restricting pod communication — `deploy/k8s/service.yaml` (Ingress from ingress-nginx, Egress to PostgreSQL + Redis + DNS only)
- [x] Docker multi-stage production build — `usbvault-server/Dockerfile` (golang:1.23-alpine builder + alpine:3.19 runtime)

## 2. Application Readiness
- [x] Health endpoints: `/health`, `/ready`, `/metrics` — `cmd/api/main.go`, `internal/middleware/metrics.go`
- [x] Circuit breakers for all external dependencies — `internal/resilience/circuit_breaker_test.go`, `internal/metrics/metrics.go`
- [x] Rate limiting enabled (per-IP + per-user) — `internal/middleware/ratelimit.go` (atomic Lua scripts in Redis, fail-closed fallback)
- [x] CORS restricted to production origins — `internal/middleware/security.go`
- [x] Security headers (HSTS, CSP, X-Frame-Options) — `internal/middleware/security.go` (HSTS 1yr + includeSubDomains + preload)
- [x] Database migration system with rollback — K8s init container, `migration-job.yaml`, `scripts/migration-rollback.sh`
- [x] Graceful shutdown with connection draining — `cmd/api/main.go` (30-second shutdown context)
- [x] Request ID tracking + structured logging — `internal/apierrors/errors.go`, `internal/middleware/security.go` (X-Request-ID)

## 3. Security Readiness
- [x] OWASP Top 10 (2021) audit — 9/10 mitigated — `docs/security/OWASP_Top10_2021_Audit.md`
- [x] OWASP API Top 10 (2023) audit — 9/10 mitigated — `docs/security/OWASP_API_Top10_2023_Audit.md`
- [x] OWASP Mobile Top 10 (2024) audit — 10/10 mitigated — `docs/security/OWASP_Mobile_Top10_2024_Audit.md`
- [x] OWASP MASTG L1 audit — 24/24 controls passed — `docs/security/OWASP_MASTG_L1_Audit.md`
- [x] CWE Top 25 (2024) scan — 22/25 mitigated, 3 N/A — `docs/security/CWE_Top25_2024_Audit.md`
- [x] All CRITICAL findings remediated (4/4) — `docs/security/Phase10_Security_Report.md`
- [x] All HIGH findings remediated (6/6) — `docs/security/Phase10_Security_Report.md`
- [x] Automated pentest harness (14 tests passing) — `internal/security/pentest_runner_test.go`
- [x] SAST enforced in CI (Semgrep + gosec + ESLint) — `.github/workflows/security.yml`
- [x] DAST scanning configured (ZAP authenticated) — `internal/security/dast_config.go`, `.github/workflows/security.yml`
- [x] IAST middleware implemented — `internal/middleware/iast_middleware.go`, `iast_middleware_test.go`
- [x] Secret detection in CI (gitleaks) — `.gitleaks.toml`, `.pre-commit-config.yaml`
- [x] SBOM generation (SPDX + CycloneDX) — `.github/workflows/security.yml`, `.github/workflows/container-sign.yml`
- [x] Vulnerability disclosure policy (security.txt) — `usbvault-server/static/.well-known/security.txt` (RFC 9116 compliant)
- [ ] Certificate pins configured for production domain
- [ ] Stripe live webhook secret configured
- [ ] External cryptographic review (recommended)

## 4. Monitoring & Observability
- [x] Prometheus metrics (20+ business metrics) — `deploy/monitoring/prometheus.yml`, `internal/middleware/metrics.go`
- [x] Alert rules (7 production alerts) — `deploy/monitoring/alert_rules.yml`
- [x] Grafana dashboard provisioned — `deploy/monitoring/grafana-dashboard.json`, `grafana-provisioning/`
- [x] Alerting runbook documented — `deploy/monitoring/alerting-runbook.md` (response procedures for all 7 alerts)
- [x] OpenTelemetry tracing (OTLP, 10% sampling) — `internal/tracing/tracing.go`, `internal/middleware/tracing.go`
- [x] Sentry client integration (PII-scrubbed) — `usbvault-app/src/utils/sentry.ts` (beforeSend + beforeBreadcrumb PII stripping)
- [x] Sentry server integration (PII-scrubbed) — `usbvault-server/internal/errortracking/sentry.go` (email regex scrubbing, header redaction)
- [x] PagerDuty webhook configured — `deploy/monitoring/pagerduty.yml`
- [ ] Sentry DSN configured for production
- [ ] 7-day burn-in monitoring completed

## 5. Compliance & Documentation
- [x] Deployment runbook — `docs/DEPLOYMENT.md` (9-step production runbook)
- [x] 10 operational runbooks — `deploy/monitoring/alerting-runbook.md` (7 alert runbooks + troubleshooting)
- [x] Security audit report (Phase 10) — `docs/security/Phase10_Security_Report.md`, `docs/security/Phase10_AST_Gate.md`
- [x] Phase 7, 8, 9, 10 AST Gates passed — `docs/security/Phase7_AST_Gate.md`, `Phase8_AST_Gate.md`, `Phase9_AST_Gate.md`, `Phase10_AST_Gate.md`
- [x] Bug bounty / disclosure program documented — `SECURITY.md` + `usbvault-server/static/.well-known/security.txt`
- [ ] Privacy policy published
- [ ] Terms of service published

## 6. Distribution
- [ ] Apple Developer account configured in eas.json
- [ ] Google Play Console configured
- [ ] EAS production build tested successfully
- [ ] App Store review submission
- [ ] Google Play review submission

---

## 7. Rollback Trigger Thresholds (LAUNCH-4)

Automated rollback is triggered when ANY of the following thresholds are breached during or after deployment. Thresholds are evaluated via Prometheus alert rules (`deploy/monitoring/alert_rules.yml`).

| Metric | Threshold | Window | Alert Rule | Action |
|--------|-----------|--------|------------|--------|
| API 5xx error rate | > 1% of total requests | 5 min rolling | `APIHighErrorRate` | Immediate rollback |
| p99 API latency | > 500ms | 5 min rolling | `APIHighLatency` | Investigate; rollback if > 1s |
| Goroutine count | > 20% above baseline | 10 min rolling | `GoroutineLeakDetected` | Investigate; rollback if growing |
| Pod memory RSS | > 80% of limit (410 MB) | 5 min rolling | `PodMemoryHigh` | Restart pod; rollback if recurring |
| Pod restart count | > 3 restarts in 15 min | 15 min window | `PodCrashLooping` | Immediate rollback |
| Database connection pool | > 80% utilization | 5 min rolling | `DBConnectionPoolExhausted` | Investigate; rollback if stuck |
| Health endpoint failure | 3 consecutive failures | 90 sec (3x30s) | Kubernetes liveness probe | Automatic pod kill + reschedule |

### Rollback Procedure
1. **Automatic**: Kubernetes deployment rollback via `kubectl rollout undo deployment/usbvault-api`
2. **Canary**: Flagger (when configured) auto-promotes or rolls back based on above metrics
3. **Manual gate**: For database migrations, run `scripts/migration-rollback.sh` before rollback
4. **RTO target**: < 5 minutes from anomaly detection to rollback completion
5. **Post-rollback**: Notify on-call via PagerDuty, create incident in runbook

---

## Summary
- **Verified (in repo)**: 39 items
- **Blocked (external accounts)**: 19 items
- **Gate Status**: READY pending external account configuration
