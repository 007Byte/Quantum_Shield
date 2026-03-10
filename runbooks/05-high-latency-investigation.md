# High Latency Investigation Runbook

**Severity:** SEV2
**Last Updated:** 2026-03-09
**Component:** API Performance & Observability
**Owner:** Platform Engineering & Performance

---

## Overview

This runbook covers systematic investigation and resolution of API latency spikes. Covers slow database queries, S3 timeouts, encryption bottlenecks, and network issues. RTO target is 10-15 minutes to identify root cause.

**Status:** PH2-FIX Implementation Complete (OTEL Tracing & Prometheus Metrics)

---

## Prerequisites

- Access to Prometheus metrics database
- Grafana dashboards configured
- Jaeger distributed tracing access (PH2-FIX)
- OTEL collector running on all services (PH2-FIX)
- kubectl access to production cluster
- Database query analysis tools
- AWS CloudWatch access for S3 metrics
- Connection pooling metrics visibility
- CPU/Memory profiling tools (pprof)
- Load testing capability for reproduction

---

## Symptoms & Detection

**Symptoms:**
- API response time increases significantly (>1000ms p95 vs 200ms baseline)
- Request queue grows
- Customers report slow page loads
- Timeout errors increasing
- Throughput drops while latency rises
- Specific endpoints affected vs system-wide
- Latency correlates with time of day or specific actions

**Detection Tools:**
```bash
# Check current latency metrics
curl -s http://prometheus.internal:9090/api/v1/query?query='histogram_quantile(0.95,http_request_duration_seconds)' | jq .

# Query Grafana for latency dashboard
# Dashboard: API Performance, Panel: P95 Latency
# Look for sudden spike from baseline

# Check application logs for slow queries
kubectl logs -n production deployment/qav-api --tail=1000 | grep -i "duration\|slow\|timeout"

# Check error rates
curl -s http://prometheus.internal:9090/api/v1/query?query='rate(http_requests_total{status=~"5.."}[5m])' | jq .
```

---

## Categories of Latency Issues

### Category A: Database Latency
- Slow queries or missing indexes
- Table locks or high contention
- Query planner inefficiency
- Connection pool exhaustion

### Category B: External Service Latency
- S3 timeout or high latency
- Downstream API timeout
- Network connectivity issue
- Rate limiting by external service

### Category C: Resource Constraint
- CPU throttling
- Memory pressure (GC pauses)
- Disk I/O bottleneck
- Network bandwidth saturation

### Category D: Encryption/Crypto Operations
- Expensive encryption on hot path
- Key rotation overhead
- Certificate validation delays

### Category E: Application Logic
- N+1 query pattern
- Inefficient algorithm
- Memory leak causing GC
- Goroutine/thread leak

---

## Step-by-Step Investigation

### Phase 1: Baseline & Scope (2-3 minutes)

1. **Establish current state**
   ```bash
   # Get current latency metrics
   # Via Prometheus directly:
   curl -s 'http://prometheus.internal:9090/api/v1/query?query=histogram_quantile(0.95,rate(http_request_duration_seconds_bucket[5m]))' | jq '.data.result[] | {metric: .metric, value: .value}'

   # Or via Grafana API:
   curl -s 'http://grafana.internal/api/datasources/proxy/1/api/v1/query?query=http_request_duration_seconds' | jq .

   # What you're looking for: p50, p95, p99 latencies
   # Baseline typical: p95 ~200ms, p99 ~500ms
   # Alert level: p95 >1000ms
   ```

2. **Determine affected scope**
   ```bash
   # Is it all endpoints or specific ones?
   curl -s 'http://prometheus.internal:9090/api/v1/query?query=histogram_quantile(0.95,rate(http_request_duration_seconds_bucket{endpoint!="health"}[5m]))' | jq '.data.result[] | {endpoint: .metric.endpoint, p95: .value}'

   # Is it all servers or specific pods?
   kubectl top pods -n production -l app=qav-api | head -20
   # Look for CPU/memory usage differences

   # Is it increasing over time (leak) or suddenly spiked?
   # Look at 15-min Grafana chart: is it trending up or sudden jump?
   ```

3. **Check external factors**
   ```bash
   # Recent deployment?
   kubectl rollout history deployment/qav-api -n production

   # Traffic surge?
   curl -s 'http://prometheus.internal:9090/api/v1/query?query=rate(http_requests_total[5m])' | jq '.data.result[] | {value}'

   # System resource pressure?
   kubectl top nodes
   kubectl top pods -n production | head -20
   ```

### Phase 2: Targeted Investigation (5-7 minutes)

#### Path A: Database Latency Investigation

4. **Check database query performance**
   ```bash
   # Query active connections
   psql -h prod-db.internal -U app_user -d qav_db -c "
     SELECT
       query,
       query_start,
       NOW() - query_start AS duration,
       state
     FROM pg_stat_activity
     WHERE query NOT LIKE 'pg_%'
       AND state != 'idle'
     ORDER BY duration DESC
     LIMIT 10;"

   # Check slow query log
   psql -h prod-db.internal -U postgres -d qav_db -c "
     SELECT
       query,
       calls,
       mean_exec_time,
       max_exec_time,
       total_exec_time
     FROM pg_stat_statements
     ORDER BY mean_exec_time DESC
     LIMIT 15;"
   ```

5. **Identify missing indexes**
   ```bash
   # Queries using seq scan (inefficient)
   psql -h prod-db.internal -U postgres -d qav_db -c "
     SELECT
       query,
       seq_scan,
       seq_tup_read,
       idx_scan
     FROM pg_stat_user_tables
     WHERE seq_scan > 1000
     ORDER BY seq_scan DESC;"

   # Check for full table scans in slow queries
   psql -h prod-db.internal -U postgres -d qav_db -c "
     EXPLAIN ANALYZE SELECT ... [your slow query];"
   ```

6. **Check connection pool status**
   ```bash
   # Database connections open
   psql -h prod-db.internal -U postgres -d qav_db -c "
     SELECT datname, count(*) as connections
     FROM pg_stat_activity
     GROUP BY datname
     ORDER BY connections DESC;"

   # App sees pool exhaustion?
   kubectl logs -n production deployment/qav-api --tail=100 | grep -i "pool\|connection\|timeout"

   # Increase pool size if needed
   # Edit deployment, set: CONNECTION_POOL_SIZE=50 (default 20)
   ```

7. **Monitor query completion**
   ```bash
   # Check if queries complete
   watch -n 2 'psql -h prod-db.internal -U postgres -d qav_db -c "SELECT COUNT(*) FROM pg_stat_activity WHERE state != \"idle\";"'

   # If count stays high: queries are backing up
   # Kill long-running query if necessary:
   psql -h prod-db.internal -U postgres -d qav_db -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query_start < NOW() - INTERVAL '5 minutes';"
   ```

#### Path B: External Service Latency (S3, etc.)

8. **Check S3 request latency**
   ```bash
   # Via CloudWatch
   aws cloudwatch get-metric-statistics \
     --metric-name FirstByteLatency \
     --namespace AWS/S3 \
     --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) \
     --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
     --period 300 \
     --statistics Average

   # Check app logs for S3 timeouts
   kubectl logs -n production deployment/qav-api --tail=200 | grep -i "s3\|bucket\|timeout"

   # Increase S3 client timeout
   # Edit deployment: S3_REQUEST_TIMEOUT=30000 (ms)
   ```

9. **Check network connectivity**
   ```bash
   # From pod to S3
   kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n production -- \
     curl -w "Time: %{time_total}s\n" https://qav-bucket-prod.s3.amazonaws.com -I

   # Check latency to AWS endpoint
   kubectl run -it --rm debug --image=busybox --restart=Never -n production -- \
     sh -c 'ping -c 5 s3.us-east-1.amazonaws.com'
   ```

#### Path C: Resource Constraint Investigation

10. **Check CPU and memory usage**
    ```bash
    # Pod-level metrics
    kubectl top pods -n production -l app=qav-api

    # Node-level metrics
    kubectl top nodes

    # If CPU >80%: CPU-bound latency
    # If memory >85%: GC pause induced latency

    # Check for CPU throttling (cgroup limits)
    kubectl describe node <node-name> | grep -A 5 Allocated

    # Check GC pauses
    kubectl logs -n production deployment/qav-api | grep -i "gc pause\|garbage collect"
    ```

11. **Check disk I/O**
    ```bash
    # From pod or node
    kubectl exec -n production deployment/qav-api -- iostat -x 1 5 | tail -20

    # Look for high iowait (>20%)

    # Check if logs are the problem
    du -sh /var/log/* | sort -hr | head -10
    ```

#### Path D: OTEL Tracing Investigation (PH2-FIX)

12. **Use distributed tracing to pinpoint latency**
    ```bash
    # Query Jaeger API for slow traces
    curl -s 'http://jaeger.internal:16686/api/traces?service=qav-api&maxDuration=5000ms&minDuration=1000ms&limit=20' | jq '.data[] | {duration: .duration, spans: (.spans | length)}'

    # Open Jaeger UI and:
    # 1. Filter by service: qav-api
    # 2. Look for traces with duration >1000ms
    # 3. Click on trace to see span timeline
    # 4. Identify which span is slowest (thickest bar)

    # Check span metrics in Prometheus
    curl -s 'http://prometheus.internal:9090/api/v1/query?query=rate(otel_span_duration_ms_bucket[5m])' | jq '.data.result[] | {span: .metric.span_name, p95: .value}' | sort -k4 -rn
    ```

13. **Analyze request waterfall**
    ```bash
    # In Jaeger UI, examine typical slow request:
    # Look for:
    # - Long database span (query time)
    # - Long network span (S3, external API)
    # - Serial operations that could be parallel
    # - Retry loops

    # Example pattern to look for:
    # request_start
    #   ├─ query_db (200ms)
    #   ├─ transform_data (50ms)
    #   ├─ call_s3 (800ms) ← PROBLEM HERE
    #   └─ format_response (50ms)
    # Total: 1100ms (but S3 is 800ms, needs optimization)
    ```

#### Path E: Encryption/Crypto Investigation

14. **Check encryption operation overhead**
    ```bash
    # Query metrics for encryption operations
    curl -s 'http://prometheus.internal:9090/api/v1/query?query=rate(encryption_operations_duration_ms[5m])' | jq '.data.result[] | {operation: .metric.operation, duration: .value}'

    # Check if key rotation in progress
    kubectl get cronjobs -n production | grep -i rotation
    kubectl get jobs -n production | grep -i rotation

    # Check certificate validation
    kubectl logs -n production deployment/qav-api | grep -i "cert\|tls\|x509"
    ```

### Phase 3: Metrics Deep-Dive with Prometheus (PH2-FIX)

15. **Create Prometheus dashboard queries for root cause**
    ```bash
    # Query 1: Identify slowest endpoints
    # Prometheus query: histogram_quantile(0.95,rate(http_request_duration_seconds_bucket[5m])) by (endpoint)
    curl -s 'http://prometheus.internal:9090/api/v1/query?query=histogram_quantile(0.95,rate(http_request_duration_seconds_bucket[5m])) by (endpoint)' | jq '.data.result[] | {endpoint: .metric.endpoint, p95_ms: (.value[1] * 1000)}'

    # Query 2: Database query latency
    # Prometheus query: rate(db_query_duration_ms_bucket[5m]) by (query)
    curl -s 'http://prometheus.internal:9090/api/v1/query?query=histogram_quantile(0.95,rate(db_query_duration_ms_bucket[5m])) by (query)' | jq '.data.result[] | {query: .metric.query, p95: .value}'

    # Query 3: External service latency
    # Prometheus query: histogram_quantile(0.95,rate(http_duration_ms_bucket{service="s3"}[5m]))
    curl -s 'http://prometheus.internal:9090/api/v1/query?query=histogram_quantile(0.95,rate(http_duration_ms_bucket{service="s3"}[5m]))' | jq '.data.result[].value'
    ```

16. **Correlate metrics with problem time window**
    ```bash
    # Get latency spike time from Grafana
    # Note: spike occurred at 14:32 UTC

    # Query metrics at that time
    curl -s 'http://prometheus.internal:9090/api/v1/query_range?query=http_request_duration_seconds&start=1646899920&end=1646899980&step=10' | jq '.data.result[0].values'

    # Look at pod events at that time
    kubectl get events -n production --sort-by='.lastTimestamp' | grep "14:3[0-5]"

    # Check for pod restarts/scaling events
    kubectl describe deployment qav-api -n production | grep -A 20 "Replicas:"
    ```

### Phase 4: Resolution (varies by root cause)

17. **If database query is slow: Optimize**
    ```bash
    # Add index for slow query
    psql -h prod-db.internal -U postgres -d qav_db -c "
      CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
      -- Use CONCURRENTLY to avoid locking during business hours
    "

    # Or rewrite query for efficiency
    # Get query plan to understand issue:
    psql -h prod-db.internal -U app_user -d qav_db -c "EXPLAIN ANALYZE SELECT ...;"

    # Restart app to clear query plan cache
    kubectl rollout restart deployment/qav-api -n production
    ```

18. **If S3 latency is high: Optimize**
    ```bash
    # Use S3 transfer acceleration (if available)
    # Or migrate hot files to CloudFront

    # Increase S3 timeout and retry
    kubectl set env deployment/qav-api \
      S3_REQUEST_TIMEOUT=60000 \
      S3_RETRY_COUNT=3 \
      -n production

    # Or batch S3 operations
    # Adjust code to use multi-get instead of individual gets
    ```

19. **If resource-constrained: Scale**
    ```bash
    # Increase pod replicas
    kubectl scale deployment qav-api --replicas=5 -n production

    # Or increase resource limits
    kubectl set resources deployment qav-api \
      --limits=cpu=2,memory=2Gi \
      --requests=cpu=1,memory=1Gi \
      -n production

    # Or add node autoscaling
    # Ensure cluster autoscaler is enabled
    ```

20. **If GC pause is issue: Tune JVM (if applicable)**
    ```bash
    # Adjust Java GC settings
    kubectl set env deployment/qav-api \
      JAVA_OPTS="-XX:+UseG1GC -XX:MaxGCPauseMillis=200" \
      -n production
    ```

### Phase 5: Monitoring Recovery

21. **Verify latency improvement**
    ```bash
    # Watch Grafana latency dashboard for 5 minutes
    # Should see p95 return to baseline (<250ms)

    # Query Prometheus directly
    watch -n 10 'curl -s "http://prometheus.internal:9090/api/v1/query?query=histogram_quantile(0.95,rate(http_request_duration_seconds_bucket[5m]))" | jq ".data.result[0].value"'

    # Check error rates still low
    curl -s 'http://prometheus.internal:9090/api/v1/query?query=rate(http_requests_total{status=~"5.."}[5m])' | jq '.data.result[].value'
    ```

---

## Verification Checklist

- [ ] P95 latency returned to baseline (<250ms)
- [ ] P99 latency <500ms
- [ ] Error rate <0.1%
- [ ] No database lock warnings
- [ ] CPU usage <70% on all pods
- [ ] Memory usage <75% on all pods
- [ ] No slow query logs
- [ ] Jaeger traces show normal distribution
- [ ] All endpoints meeting SLA

---

## Escalation Path

**Level 1 (0-10 mins):** On-Call SRE
- Initial investigation, identify root cause category

**Level 2 (10-20 mins, if unresolved):** Senior Engineer (Database or Infrastructure)
- Deep analysis, optimization, tuning

**Level 3 (20+ mins, if widespread):** Engineering Lead + Product
- Consider feature flags, traffic shifting
- Communicate status to customers

---

## Post-Incident Checklist

- [ ] Document root cause and resolution steps taken
- [ ] Add monitoring alert if new issue type
- [ ] Review whether issue was preventable
- [ ] Add database indexes discovered
- [ ] Review query optimization opportunities
- [ ] Plan capacity increase if load-driven
- [ ] Add test case for latency regression
- [ ] Update runbook with new troubleshooting procedures
- [ ] Schedule architecture review if systemic issue
