# API Restart & Rollback Runbook

**Severity:** SEV1
**Last Updated:** 2026-03-09
**Component:** API Server (Kubernetes Deployment)
**Owner:** Platform Engineering

---

## Overview

This runbook covers emergency restart and rollback procedures for the Quantum_Shield API service. Covers scenarios including bad deployments, panic loops, configuration errors, and stuck processes. RTO target is 2-3 minutes.

**Status:** PH1-FIX Implementation Complete (Circuit Breaker Integration)

---

## Prerequisites

- kubectl CLI configured with production cluster access
- Docker registry access (for pulling image versions)
- Git access to deployment manifests repository
- ArgoCD or deployment automation tool access
- Prometheus and Grafana access for metrics
- Pod logs access via kubectl or centralized logging
- PagerDuty escalation procedures
- Slack notification channel (#incidents)

---

## Symptoms & Detection

**Symptoms:**
- API returning 5xx errors consistently (>50% failure rate)
- Pod CrashLoopBackOff status
- Memory or CPU limits being exceeded
- Application panicking in logs
- Configuration validation errors
- Connections timing out
- Circuit breaker opening due to downstream failures
- Deployment that just rolled out is causing issues

**Detection Tools:**
```bash
# Check pod status
kubectl get pods -n production -l app=usbvault-api -o wide

# View pod logs for errors
kubectl logs -n production deployment/usbvault-api --all-containers=true -f

# Check for panic messages
kubectl logs -n production deployment/usbvault-api --all-containers=true | grep -i "panic\|fatal\|error"

# Monitor resource usage
kubectl top pods -n production -l app=usbvault-api

# Check deployment status
kubectl describe deployment usbvault-api -n production

# View recent deployments
kubectl rollout history deployment/usbvault-api -n production

# Check service health endpoint
curl -s http://usbvault-api:8080/health | jq .
```

---

## Failure Categories

### Category 1: Bad Deployment
- Image with bugs or incompatibilities
- Configuration change breaks service
- Just deployed, immediate failures

### Category 2: Panic Loop
- Application crashes immediately on startup
- Memory leak causing OOM
- Stuck goroutines consuming CPU

### Category 3: Config Error
- Invalid environment variables
- Missing secrets
- Certificate issues
- Incorrect feature flags

### Category 4: Resource Constraints
- Out of memory (OOM)
- CPU throttling (can't keep up)
- Stuck connections not draining

---

## Step-by-Step Resolution

### Phase 1: Rapid Assessment (1 minute)

1. **Declare incident**
   ```bash
   curl -X POST https://events.pagerduty.com/v2/enqueue \
     -H 'Content-Type: application/json' \
     -d '{
       "routing_key": "'"$PD_INTEGRATION_KEY"'",
       "event_action": "trigger",
       "dedup_key": "api-incident-'$(date +%s)'",
       "payload": {
         "summary": "API Service Degradation - Investigating",
         "severity": "critical",
         "source": "On-Call SRE"
       }
     }'
   ```

2. **Get pod status immediately**
   ```bash
   # Status summary
   kubectl get pods -n production -l app=usbvault-api -o wide

   # Expected output:
   # usbvault-api-5f7d9c4b8d-abc12   0/1     CrashLoopBackOff   5
   # usbvault-api-5f7d9c4b8d-xyz78   1/1     Running             0

   # If all pods failing, move to Phase 2 Option B (Rollback)
   # If some pods running, might be configuration issue
   ```

3. **Check recent deployment history**
   ```bash
   kubectl rollout history deployment/usbvault-api -n production

   # Output shows revisions
   # REVISION  CHANGE-CAUSE
   # 1         Initial deployment
   # 2         Update app to v1.2.0
   # 3         Update app to v1.3.0 (CURRENT - LIKELY ISSUE)

   # Get details of current vs previous
   kubectl rollout history deployment/usbvault-api -n production --revision=3
   kubectl rollout history deployment/usbvault-api -n production --revision=2
   ```

4. **Quick health check**
   ```bash
   # Try direct port-forward to working pod (if any)
   kubectl port-forward -n production svc/usbvault-api 8080:8080 &

   curl -s http://localhost:8080/health
   # Look at status, error messages
   ```

5. **Identify failure type**
   ```bash
   # Check logs for specific error
   kubectl logs -n production deployment/usbvault-api --previous | tail -50

   # Categorize:
   # - "panic" → Panic Loop (Category 2)
   # - "OOMKilled" → Resource issue (Category 4)
   # - "invalid config" → Config Error (Category 3)
   # - Just deployed → Bad Deployment (Category 1)
   ```

### Phase 2: Emergency Actions

#### Option A: Configuration Hot Fix (if config error)

6. **Identify bad configuration**
   ```bash
   kubectl describe deployment usbvault-api -n production | grep -A 20 "Environment"

   # Or check configmap/secret
   kubectl get configmap usbvault-api-config -n production -o yaml
   kubectl get secret usbvault-api-secret -n production -o yaml

   # Check recent changes
   git log --oneline -10 -- k8s/production/usbvault-api-deployment.yaml
   ```

7. **Fix configuration**
   ```bash
   # Option 1: Edit deployment directly
   kubectl edit deployment usbvault-api -n production
   # Find the bad environment variable or config
   # Remove or correct it
   # Save and exit

   # Option 2: Edit configmap/secret
   kubectl edit configmap usbvault-api-config -n production
   # Fix values, save and exit

   # Option 3: Reapply from Git
   git checkout k8s/production/usbvault-api-deployment.yaml
   kubectl apply -f k8s/production/usbvault-api-deployment.yaml
   ```

8. **Monitor pod restart**
   ```bash
   watch -n 2 'kubectl get pods -n production -l app=usbvault-api'

   # Pods should cycle: Running → Terminating → Pending → Running
   # This typically takes 30 seconds per pod
   ```

#### Option B: Emergency Rollback (if bad deployment)

9. **Rollback to previous working version**
   ```bash
   # Find the last good revision
   kubectl rollout history deployment/usbvault-api -n production

   # Assuming revision 2 was working, revision 3 is broken:
   kubectl rollout undo deployment/usbvault-api -n production --to-revision=2

   # Or just rollback to immediately previous:
   kubectl rollout undo deployment/usbvault-api -n production

   # Monitor rollback progress
   kubectl rollout status deployment/usbvault-api -n production --timeout=5m
   ```

10. **Verify rollback success**
    ```bash
    # Check pod status
    kubectl get pods -n production -l app=usbvault-api

    # All pods should be Running and Ready: 1/1
    # CrashLoopBackOff should disappear

    # Check logs (should be clean)
    kubectl logs -n production deployment/usbvault-api --tail=20

    # Test health endpoint
    kubectl port-forward -n production svc/usbvault-api 8080:8080 &
    curl -s http://localhost:8080/health | jq .
    ```

#### Option C: Graceful Restart (if stuck processes)

11. **Drain connections gracefully**
    ```bash
    # Scale down to 0 (kills all pods)
    kubectl scale deployment usbvault-api --replicas=0 -n production

    # Wait for graceful shutdown (typically 30 seconds)
    sleep 30

    # Verify all pods terminated
    kubectl get pods -n production -l app=usbvault-api

    # Scale back up
    kubectl scale deployment usbvault-api --replicas=3 -n production

    # Monitor startup
    kubectl rollout status deployment/usbvault-api -n production --timeout=5m
    ```

#### Option D: Force Restart (if graceful not working)

12. **Delete pods forcefully**
    ```bash
    # Get pod names
    kubectl get pods -n production -l app=usbvault-api

    # Delete with force and grace period 0
    kubectl delete pod usbvault-api-5f7d9c4b8d-abc12 -n production --grace-period=0 --force

    # Or delete all at once:
    kubectl delete pods -n production -l app=usbvault-api --grace-period=0 --force

    # Kubernetes will immediately spawn replacements
    kubectl get pods -n production -l app=usbvault-api
    ```

### Phase 3: Circuit Breaker Verification (PH1-FIX)

13. **Check circuit breaker status**
    ```bash
    # Query metrics endpoint
    curl -s http://usbvault-api:8080/metrics | grep -i circuit

    # Expected output shows circuit state:
    # usbvault_circuit_breaker_state{service="database"} 0    (closed, normal)
    # usbvault_circuit_breaker_state{service="redis"} 0       (closed, normal)
    # usbvault_circuit_breaker_state{service="s3"} 1          (open, using fallback)

    # Check in Prometheus
    # Query: circuit_breaker_state
    # Should show states, look for "1" (open) values
    ```

14. **Verify health endpoint properly reflects circuit breaker state**
    ```bash
    curl -s http://usbvault-api:8080/health | jq '.circuit_breakers'

    # Should show:
    # {
    #   "database": { "state": "closed", "failures": 0 },
    #   "redis": { "state": "closed", "failures": 0 },
    #   "s3": { "state": "open", "failures": 42, "last_error": "..." }
    # }

    # If critical dependency open, may return 503:
    curl -w "HTTP %{http_code}\n" http://usbvault-api:8080/health
    ```

### Phase 4: Monitoring & Verification

15. **Watch key metrics recover**
    ```bash
    # Monitor error rate (should drop to <1%)
    kubectl exec -n production deployment/usbvault-api \
      -- curl -s localhost:8080/metrics | grep http_requests_total

    # Check latency (should return to <200ms p99)
    kubectl exec -n production deployment/usbvault-api \
      -- curl -s localhost:8080/metrics | grep http_duration_ms

    # Verify no more panics in logs
    kubectl logs -n production deployment/usbvault-api --all-containers=true \
      --since=5m | grep -i "panic\|fatal" | wc -l  # Should be 0
    ```

16. **Verify traffic is returning to normal**
    ```bash
    # Check request rates
    kubectl logs -n production deployment/usbvault-api --tail=100 | grep -c "request"

    # Compare to baseline (typically 500-1000 req/min per pod)

    # Check endpoint response times
    kubectl port-forward -n production svc/usbvault-api 8080:8080 &
    for i in {1..10}; do
      time curl -s http://localhost:8080/api/v1/health >/dev/null
    done
    ```

17. **Test with real requests**
    ```bash
    # Test critical user flows
    curl -X POST http://usbvault-api:8080/api/v1/auth/login \
      -H "Content-Type: application/json" \
      -d '{"username":"test@example.com","password":"test123"}'

    # Expected: 200 OK with auth token (or 401 if creds wrong, not 500)

    # Test a couple other key endpoints
    curl -s http://usbvault-api:8080/api/v1/users | head -c 200
    ```

### Phase 5: Post-Recovery Communication

18. **Update incident status**
    ```bash
    # Notify team that incident is resolved
    aws sns publish \
      --topic-arn arn:aws:sns:us-east-1:123456789012:incidents \
      --message "API Service Restored - v1.2.0 rolled back due to v1.3.0 deployment issues"

    # Update PagerDuty incident
    curl -X PUT https://api.pagerduty.com/incidents/$INCIDENT_ID \
      -H 'Authorization: Token token='"$PD_TOKEN"'' \
      -H 'Content-Type: application/json' \
      -d '{"incidents":[{"type":"incident_reference","id":"'"$INCIDENT_ID"'","status":"resolved"}]}'
    ```

---

## Verification Checklist

- [ ] All pods running and ready: `kubectl get pods -n production -l app=usbvault-api`
- [ ] No CrashLoopBackOff or error states
- [ ] Error rate <1%: Check Prometheus/Grafana
- [ ] P99 latency <200ms: Verify in metrics
- [ ] Health endpoint returns 200: `curl http://usbvault-api:8080/health`
- [ ] Sample API requests succeeding: Test 5 key endpoints
- [ ] Circuit breakers healthy (none stuck open): `curl http://usbvault-api:8080/metrics | grep circuit`
- [ ] No recent panics in logs: `kubectl logs --since=5m | grep panic`
- [ ] Request rate returning to baseline

---

## Escalation Path

**Immediate (0-2 mins):** On-Call SRE
- Quick diagnosis and restart/rollback

**3+ mins if unresolved:** Platform Engineer + Product Lead
- Deeper investigation, check for upstream failures
- Coordinate with other teams if it's not the API itself

**10+ mins if unresolved:** VP Engineering + Incident Commander
- Full incident response
- Prepare customer communication
- Investigate systemic issues

---

## Post-Incident Checklist

- [ ] Identify root cause: bad code, bad config, or environmental issue?
- [ ] If deployment: review code changes in that release
- [ ] If config: verify configuration management and validation
- [ ] If resources: review capacity and scaling policies
- [ ] Test rollback procedures in staging environment
- [ ] Add automated tests to catch similar issues
- [ ] Review deployment pipeline gates and pre-flight checks
- [ ] Update monitoring and alerting
- [ ] Conduct post-mortem with team
- [ ] Schedule incident review meeting
- [ ] Update runbook with new learnings
- [ ] Verify no data loss from the incident

---

## Quick Reference Commands

```bash
# Get current status
kubectl get deployment usbvault-api -n production
kubectl get pods -n production -l app=usbvault-api -o wide

# View logs
kubectl logs -n production deployment/usbvault-api -f
kubectl logs -n production deployment/usbvault-api --previous  # Logs from crashed pod

# Rollback
kubectl rollout undo deployment/usbvault-api -n production
kubectl rollout status deployment/usbvault-api -n production

# Restart
kubectl rollout restart deployment/usbvault-api -n production

# Scale
kubectl scale deployment usbvault-api --replicas=3 -n production

# Describe for detailed status
kubectl describe deployment usbvault-api -n production
kubectl describe pod usbvault-api-5f7d9c4b8d-abc12 -n production

# Port-forward for direct testing
kubectl port-forward -n production svc/usbvault-api 8080:8080
```
