# Redis Failover Runbook

**Severity:** SEV1
**Last Updated:** 2026-03-09
**Component:** Redis Cluster (Cache & Rate Limiting)
**Owner:** Platform Engineering

---

## Overview

This runbook covers Redis failover scenarios including Out-of-Memory (OOM) conditions, master node failures, and replication lag. Uses Redis Sentinel for automatic failover with manual intervention procedures. RTO target is 5 minutes, RPO target is 0 (in-memory replication).

**Status:** PH1-FIX Implementation Complete (Volatile-LRU Policy + In-Memory Rate Limiter)

---

## Prerequisites

- Access to Redis master and replica nodes
- Redis CLI client installed on bastion host
- AWS EC2 console access
- Sentinel configuration files available
- SSH access to all Redis nodes
- CloudWatch monitoring access
- PagerDuty notification setup
- Kubernetes cluster access for pod restarts

---

## Symptoms & Detection

**Symptoms:**
- Cache misses spike dramatically (>50% of requests)
- Rate limiting stops working (customers bypass limits)
- API requests fail with "READONLY" or "CLUSTERDOWN" errors
- Memory usage shows >90% on Redis master
- High replication lag (>1000ms)
- Sentinel failover alerts in logs
- Customer reports of service degradation
- Circuit breaker pattern not returning responses

**Detection Tools:**
```bash
# Check Redis connectivity and memory
redis-cli -h redis-master.internal PING
redis-cli -h redis-master.internal INFO memory

# Monitor replication status
redis-cli -h redis-master.internal INFO replication

# Check Sentinel status
redis-cli -h sentinel-1.internal -p 26379 SENTINEL masters

# Query CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --metric-name CacheMisses \
  --namespace QAV/Redis \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average
```

---

## Failure Scenarios

### Scenario 1: Redis Out of Memory (OOM)

**Indicators:**
- `redis-cli INFO memory | grep used_memory_human`
- Memory usage > 95%
- Keys being evicted due to maxmemory policy
- Application sees cache inconsistency

**PH1-FIX: Volatile-LRU Policy**
The volatile-lru eviction policy is configured to automatically remove least recently used keys with TTL set, protecting hot data.

---

### Scenario 2: Master Node Failure

**Indicators:**
- Master cannot be reached
- Sentinel detects master unreachable for >30 seconds
- Replication errors in logs
- Connection timeouts from applications

---

### Scenario 3: Replication Lag

**Indicators:**
- `redis-cli -h redis-master.internal INFO replication | grep offset`
- Master and replica offsets diverging
- Lag > 1000ms consistently
- Network issues between nodes

---

## Step-by-Step Resolution

### Phase 1: Assessment (2 minutes)

1. **Verify Redis connectivity**
   ```bash
   redis-cli -h redis-master.internal ping
   echo $?  # Should return 0 if successful

   # Test all nodes
   for node in redis-master redis-replica-1 redis-replica-2; do
     redis-cli -h $node.internal PING
   done
   ```

2. **Check current memory status**
   ```bash
   redis-cli -h redis-master.internal INFO memory | grep -E "used_memory|maxmemory|evicted"
   # Expected output:
   # used_memory_human:2.50G
   # maxmemory:3G
   # evicted_keys:1234

   # If used > 90% of maxmemory, we have OOM condition
   ```

3. **Determine which scenario applies**
   ```bash
   # Scenario 1: OOM (memory pressure)
   USED=$(redis-cli -h redis-master.internal INFO memory | grep used_memory_human | cut -d: -f2 | sed 's/M.*//')
   MAX=$(redis-cli -h redis-master.internal CONFIG GET maxmemory | tail -1)
   if [ $USED -gt $((MAX * 90 / 100)) ]; then
     echo "SCENARIO 1: OOM Condition"
   fi

   # Scenario 2: Master unreachable
   if ! redis-cli -h redis-master.internal PING &>/dev/null; then
     echo "SCENARIO 2: Master Failure"
   fi

   # Scenario 3: Replication lag
   LAG=$(redis-cli -h redis-master.internal INFO replication | grep master_repl_offset)
   REPLICA_LAG=$(redis-cli -h redis-replica-1.internal INFO replication | grep slave_repl_offset)
   echo "Master offset: $LAG, Replica offset: $REPLICA_LAG"
   ```

4. **Check Sentinel status**
   ```bash
   redis-cli -h sentinel-1.internal -p 26379 SENTINEL masters
   # Look for: num_slaves, num_sentinel_slaves, is_master

   redis-cli -h sentinel-1.internal -p 26379 SENTINEL slaves mymaster
   ```

### Phase 2: Resolution by Scenario

#### Path A: Resolving OOM Condition (Scenario 1)

5. **Verify eviction policy is set to volatile-lru**
   ```bash
   redis-cli -h redis-master.internal CONFIG GET maxmemory-policy
   # Should return: volatile-lru

   # If not set correctly:
   redis-cli -h redis-master.internal CONFIG SET maxmemory-policy volatile-lru
   redis-cli -h redis-master.internal CONFIG REWRITE  # Persist to config file
   ```

6. **Monitor eviction metrics** (PH1-FIX: In-Memory Rate Limiter)
   ```bash
   # Check evicted keys in last 5 minutes
   redis-cli -h redis-master.internal INFO stats | grep evicted_keys

   # Check connected clients
   redis-cli -h redis-master.internal INFO clients | grep connected_clients

   # List keys by memory usage (top 20)
   redis-cli -h redis-master.internal --scan --pattern '*' | while read key; do
     echo "$(redis-cli -h redis-master.internal MEMORY USAGE $key) $key"
   done | sort -rn | head -20
   ```

7. **Enable debug logging to identify hot keys**
   ```bash
   redis-cli -h redis-master.internal CONFIG SET loglevel debug
   tail -f /var/log/redis/redis.log | grep -i "evicted\|memory"

   # After 5 minutes of monitoring:
   redis-cli -h redis-master.internal CONFIG SET loglevel notice
   ```

8. **Increase maxmemory allocation** (if persistent OOM)
   ```bash
   # Check current allocation
   redis-cli -h redis-master.internal CONFIG GET maxmemory

   # Increase by 1GB (e.g., from 3G to 4G)
   redis-cli -h redis-master.internal CONFIG SET maxmemory 4gb
   redis-cli -h redis-master.internal CONFIG REWRITE

   # Verify
   redis-cli -h redis-master.internal CONFIG GET maxmemory
   ```

9. **Monitor rate limiter fallback** (PH1-FIX: In-Memory Rate Limiter)
   ```bash
   # Check if in-memory rate limiter kicked in
   kubectl logs -n production -l app=usbvault-api | grep -i "rate.*limit\|fallback"

   # Verify rate limiting still working
   # Quick test: 101 requests in rapid succession should hit limit
   for i in {1..101}; do
     curl -s -H "X-API-Key: test-key" https://api.usbvault.internal/v1/users \
       -w "HTTP %{http_code}\n" | tail -1
   done | sort | uniq -c
   # Should see some 429 (Too Many Requests) responses
   ```

10. **Verify cache recovery**
    ```bash
    # Check cache hit ratio improving
    watch -n 5 'redis-cli -h redis-master.internal INFO stats | grep -E "hits|misses"'

    # Should see gradual reduction in evicted keys
    watch -n 5 'redis-cli -h redis-master.internal INFO stats | grep evicted_keys'
    ```

#### Path B: Resolving Master Failure (Scenario 2)

11. **Verify master is truly down**
    ```bash
    ping -c 3 redis-master.internal
    ssh redis-master.internal "systemctl status redis"  # If can SSH
    redis-cli -h redis-master.internal --help  # To see actual error
    ```

12. **Check if Sentinel already started failover**
    ```bash
    redis-cli -h sentinel-1.internal -p 26379 SENTINEL masters
    # Look for: role (should be "master" if promoted)

    # Check Sentinel logs
    tail -50 /var/log/redis/sentinel.log | grep -i "failover\|promoted"
    ```

13. **If Sentinel didn't failover, manually promote replica**
    ```bash
    # Force Sentinel to failover
    redis-cli -h sentinel-1.internal -p 26379 SENTINEL failover mymaster

    # Monitor promotion progress
    watch -n 2 'redis-cli -h sentinel-1.internal -p 26379 SENTINEL masters'

    # Wait for replica to become master (role: master)
    # This typically takes 10-30 seconds
    ```

14. **Update application configuration**
    ```bash
    # Applications use DNS or service discovery, so typically automatic
    # But verify they're connecting to new master:

    redis-cli -h redis-replica-1.internal info replication
    # Should now show:
    # role:master
    # connected_slaves:1

    redis-cli -h redis-replica-2.internal info replication
    # Should now show:
    # role:slave
    # master_host:redis-replica-1.internal
    ```

15. **Rebuild failed master as replica**
    ```bash
    # SSH to old master instance
    ssh redis-master.internal

    # Stop Redis
    sudo systemctl stop redis

    # Clear old data (since it was master, it's behind now)
    sudo rm -f /var/lib/redis/dump.rdb
    sudo rm -f /var/lib/redis/appendonly.aof

    # Update sentinel config to point to new master
    sudo vi /etc/redis/sentinel.conf
    # Find line: sentinel monitor mymaster [OLD_MASTER_IP] 6379
    # Change to: sentinel monitor mymaster redis-replica-1.internal 6379

    # Restart Redis
    sudo systemctl start redis

    # Verify it syncs
    redis-cli -h redis-master.internal INFO replication
    # Should show:
    # role:slave
    # master_host:redis-replica-1.internal
    # master_sync_in_progress:0
    ```

#### Path C: Resolving Replication Lag (Scenario 3)

16. **Check network connectivity between master and replica**
    ```bash
    # From master
    ping -c 5 redis-replica-1.internal

    # Check for packet loss
    mtr -r -c 10 redis-replica-1.internal

    # Check Redis replication buffer
    redis-cli -h redis-master.internal INFO clients | grep -i "output_buffer"
    ```

17. **Monitor replication progress**
    ```bash
    # Check master replication offset
    redis-cli -h redis-master.internal INFO replication | grep master_repl_offset

    # Check replica offset
    redis-cli -h redis-replica-1.internal INFO replication | grep slave_repl_offset

    # Calculate lag
    MASTER_OFFSET=$(redis-cli -h redis-master.internal INFO replication | grep master_repl_offset | cut -d: -f2)
    REPLICA_OFFSET=$(redis-cli -h redis-replica-1.internal INFO replication | grep slave_repl_offset | cut -d: -f2)
    echo "Lag: $((MASTER_OFFSET - REPLICA_OFFSET)) bytes"
    ```

18. **Increase replication buffer if needed**
    ```bash
    # Current settings
    redis-cli -h redis-master.internal CONFIG GET client-output-buffer-limit

    # Increase replication buffer (e.g., 256MB)
    redis-cli -h redis-master.internal CONFIG SET client-output-buffer-limit "slave 256mb 64mb 60"
    redis-cli -h redis-master.internal CONFIG REWRITE

    # Verify
    redis-cli -h redis-master.internal CONFIG GET client-output-buffer-limit
    ```

19. **Check for slow disk I/O on replica**
    ```bash
    ssh redis-replica-1.internal
    iostat -x 1 10 | tail -20  # Monitor I/O wait percentage

    # If high I/O wait:
    sudo systemctl restart redis  # Graceful restart might clear issues
    ```

20. **Monitor lag resolution**
    ```bash
    watch -n 1 'redis-cli -h redis-replica-1.internal INFO replication | grep seconds_behind_master'

    # Should trend toward 0
    ```

### Phase 3: Verification

21. **Verify all nodes healthy**
    ```bash
    for node in redis-master redis-replica-1 redis-replica-2; do
      echo "=== $node ==="
      redis-cli -h $node.internal PING
      redis-cli -h $node.internal INFO replication | grep -E "role:|connected"
      redis-cli -h $node.internal INFO memory | grep used_memory_human
    done
    ```

22. **Test cache functionality**
    ```bash
    # Basic cache test
    redis-cli -h redis-master.internal SET test-key "test-value" EX 60
    redis-cli -h redis-master.internal GET test-key
    # Should return: "test-value"

    # Test rate limiting (should work with failover)
    curl -H "X-API-Key: test" https://api.usbvault.internal/v1/health -v
    ```

23. **Check application connectivity**
    ```bash
    kubectl logs -n production -l app=usbvault-api --tail=50 | grep -i redis

    # Should see successful connections, no timeouts
    ```

---

## Verification Checklist

- [ ] Redis master is responding to PING
- [ ] All replicas are healthy and replicating: `redis-cli INFO replication`
- [ ] Memory usage is below 85%: `redis-cli INFO memory`
- [ ] Replication lag is <100ms: `redis-cli -h replica INFO replication | grep seconds_behind`
- [ ] Cache hit ratio is stable: Check CloudWatch metrics
- [ ] Rate limiting working: Send 101 requests, verify 429 responses
- [ ] No error spikes in application logs
- [ ] Sentinel is active and monitoring: `redis-cli -h sentinel SENTINEL masters`

---

## Escalation Path

**Level 1 (0-5 mins):** On-Call SRE
- Assess situation, attempt quick fixes (OOM increase, Sentinel failover)

**Level 2 (5-10 mins, if unresolved):** Senior Platform Engineer
- Deeper diagnostics, manual failover procedures
- Network team if connectivity issues

**Level 3 (10-30 mins, if persistent):** Infrastructure Lead + Database Team
- Review system capacity
- Plan for scale-up or cluster rebalancing

**Level 4 (30+ mins, if data loss):** VP Engineering + CTO
- Assess impact on customers
- Plan communication and remediation

---

## Post-Incident Checklist

- [ ] Document root cause (OOM, hardware failure, network issue)
- [ ] Review memory capacity vs actual usage patterns
- [ ] Analyze eviction metrics for hot keys
- [ ] Verify Sentinel configuration is correct
- [ ] Check network connectivity between nodes
- [ ] Test failover procedures in staging
- [ ] Update monitoring alerts (OOM threshold, replication lag)
- [ ] Plan capacity upgrade if needed
- [ ] Schedule redundancy review (single points of failure?)
- [ ] Conduct team training on recovery procedures
- [ ] Update runbook with any new learnings
- [ ] Monitor Redis cluster health daily for 7 days
