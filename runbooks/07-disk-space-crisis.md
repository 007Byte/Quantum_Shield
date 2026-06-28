# Disk Space Crisis Runbook

**Severity:** SEV1
**Last Updated:** 2026-03-09
**Component:** Storage (Database, S3, Logs, Volumes)
**Owner:** Infrastructure & Platform Engineering

---

## Overview

This runbook covers emergency disk space management for database volumes, S3 buckets, and log storage. RTO target is 10-15 minutes to free space, RPO target is zero data loss.

**Prerequisites:**
- Root access to database and application servers
- AWS S3 and EC2 console access
- Database admin credentials
- Kubernetes node SSH access
- Log management system access
- Backup verification capability
- Storage capacity planning tools

---

## Symptoms & Detection

**Symptoms:**
- Database cannot write (disk full errors in logs)
- Application pods evicted due to disk pressure
- New logs not being written
- Backup jobs failing
- S3 bucket approaching quota
- Database performance degradation
- Pod status showing "DiskPressure"

**Detection Tools:**
```bash
# Check database disk usage
df -h /var/lib/postgresql/data
psql -h prod-db.internal -U postgres -d postgres -c "SELECT pg_database_size('usbvault_db') as size;"

# Check application volumes
kubectl exec -n production deployment/usbvault-api -- df -h /data

# Check node disk pressure
kubectl describe node <node-name> | grep -A 5 "Conditions"

# Check S3 bucket size
aws s3 ls s3://usbvault-data-prod --recursive --summarize | grep "Total Size"

# Check largest files
find /var -type f -size +100M -exec ls -lh {} \; | head -20

# Log volume
du -sh /var/log/* | sort -hr | head -10
```

---

## Disk Space Issues by Location

### Issue 1: Database Disk Full

**Symptoms:**
- PostgreSQL write errors
- `PANIC: Could not write to file`
- Replication lag increasing
- Backup failures

### Issue 2: S3 Bucket Full

**Symptoms:**
- Upload failures with `NoSuchBucket` or quota exceeded
- Backup to S3 failing
- Application cannot store files

### Issue 3: Log Accumulation

**Symptoms:**
- `/var/log` consuming >80% of partition
- Old logs not being rotated
- Application logs growing unbounded

### Issue 4: Kubernetes Pod Eviction

**Symptoms:**
- Pods showing `Evicted` status
- Node shows `DiskPressure=True`
- New pods failing to schedule

---

## Step-by-Step Resolution

### Phase 1: Assess Severity (2 minutes)

1. **Determine which partition is full**
   ```bash
   # Get disk usage by partition
   df -h | grep -E "Use%|100%|9[0-9]%"

   # Identify critical partitions
   # Critical: / (root), /var, /var/log, /var/lib/postgresql, /data
   # Non-critical: /tmp, /var/tmp, /var/cache

   # Check each critical path
   du -sh / /var /var/log /home /data 2>/dev/null | sort -hr
   ```

2. **Estimate time until critical failure**
   ```bash
   # If database is affected
   psql -h prod-db.internal -U postgres -d postgres -c "
     SELECT
       pg_size_pretty(pg_database_size('usbvault_db')) as db_size,
       pg_size_pretty(
         (SELECT setting::bigint * 8192
          FROM pg_settings WHERE name = 'shared_buffers')
       ) as buffer_size;"

   # Check if WAL is consuming space
   du -sh /var/lib/postgresql/data/pg_wal/
   ```

3. **Declare incident if critical**
   ```bash
   # If database or root partition >95% full
   curl -X POST https://events.pagerduty.com/v2/enqueue \
     -H 'Content-Type: application/json' \
     -d '{
       "routing_key": "'"$PD_INTEGRATION_KEY"'",
       "event_action": "trigger",
       "dedup_key": "disk-crisis-'$(date +%s)'",
       "payload": {
         "summary": "CRITICAL: Disk Space Crisis",
         "severity": "critical",
         "source": "Infrastructure Monitoring"
       }
     }'
   ```

### Phase 2: Resolution by Location

#### Path A: Database Disk Full

4. **Check database space usage**
   ```bash
   # Find largest tables
   psql -h prod-db.internal -U postgres -d usbvault_db -c "
     SELECT
       schemaname,
       tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
     FROM pg_tables
     WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
     ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
     LIMIT 20;"

   # Check WAL archive size
   du -sh /var/lib/postgresql/data/pg_wal/
   ls -lh /var/lib/postgresql/data/pg_wal/ | head -20
   ```

5. **Stop new writes to database** (if critically full)
   ```bash
   # Set database to read-only
   psql -h prod-db.internal -U postgres -d usbvault_db -c "
     ALTER DATABASE usbvault_db SET default_transaction_read_only = on;"

   # Notify applications
   kubectl set env deployment/usbvault-api DB_READ_ONLY=true -n production
   kubectl set env deployment/usbvault-worker DB_READ_ONLY=true -n production
   ```

6. **Archive old audit logs** (typically the largest table)
   ```bash
   # Check audit log table size
   psql -h prod-db.internal -U postgres -d usbvault_db -c "
     SELECT pg_size_pretty(pg_total_relation_size('public.audit_logs'));"

   # Archive logs older than 90 days
   psql -h prod-db.internal -U app_user -d usbvault_db -c "
     CREATE TABLE audit_logs_archive_202512 AS
     SELECT * FROM audit_logs
     WHERE created_at < '2025-12-01'::date;

     DELETE FROM audit_logs
     WHERE created_at < '2025-12-01'::date;

     VACUUM FULL audit_logs;
     REINDEX TABLE audit_logs;"

   # Export to S3 for long-term storage
   psql -h prod-db.internal -U postgres -d usbvault_db \
     --copy \
     --command="SELECT * FROM audit_logs_archive_202512;" \
     | aws s3 cp - s3://usbvault-audit-archive/audit_logs_202512.tsv

   # Drop archive table once exported
   psql -h prod-db.internal -U postgres -d usbvault_db -c "
     DROP TABLE audit_logs_archive_202512;"
   ```

7. **Clean up WAL files**
   ```bash
   # Force checkpoint to flush WAL
   psql -h prod-db.internal -U postgres -d usbvault_db -c "
     CHECKPOINT;"

   # Check if WAL can be pruned
   psql -h prod-db.internal -U postgres -d postgres -c "
     SELECT pg_wal_lsn_diff(
       pg_current_wal_lsn(),
       (SELECT restart_lsn FROM pg_replication_slots)
     ) as bytes_until_replication_required;"

   # If replica is caught up, clean old WAL
   cd /var/lib/postgresql/data/pg_wal/
   ls -t | tail -n +50 | xargs rm -f  # Keep last 50 WAL files only
   ```

8. **Reclaim space with VACUUM**
   ```bash
   # Aggressive vacuum on largest tables
   psql -h prod-db.internal -U app_user -d usbvault_db -c "
     VACUUM FULL ANALYZE events;
     VACUUM FULL ANALYZE audit_logs;
     VACUUM FULL ANALYZE transactions;"

   # This blocks the table, so run during low-traffic window
   # Or use VACUUM without FULL (non-blocking but slower)
   ```

9. **Re-enable writes**
   ```bash
   # Once space is freed (should have at least 20% free)
   psql -h prod-db.internal -U postgres -d usbvault_db -c "
     ALTER DATABASE usbvault_db SET default_transaction_read_only = off;"

   kubectl set env deployment/usbvault-api DB_READ_ONLY=false -n production
   ```

#### Path B: S3 Bucket Full

10. **Check S3 bucket size and policies**
    ```bash
    # Get bucket size
    aws s3api list-objects-v2 \
      --bucket usbvault-data-prod \
      --query '[Contents[].Size] | add(@)' | python3 -c "import sys, json; print(json.load(sys.stdin) / (1024**3), 'GB')"

    # Check for lifecycle policies
    aws s3api get-bucket-lifecycle-configuration \
      --bucket usbvault-data-prod

    # Find largest objects
    aws s3api list-objects-v2 \
      --bucket usbvault-data-prod \
      --query 'sort_by(Contents, &Size)[-20:].[Key,Size]' \
      --output table
    ```

11. **Implement tiered storage with S3 Glacier**
    ```bash
    # Create lifecycle policy to move old objects to Glacier
    cat > /tmp/lifecycle.json <<'EOF'
    {
      "Rules": [
        {
          "Id": "ArchiveOldFiles",
          "Status": "Enabled",
          "Transitions": [
            {
              "Days": 30,
              "StorageClass": "STANDARD_IA"
            },
            {
              "Days": 90,
              "StorageClass": "GLACIER"
            }
          ],
          "Expiration": {
            "Days": 365
          }
        }
      ]
    }
    EOF

    aws s3api put-bucket-lifecycle-configuration \
      --bucket usbvault-data-prod \
      --lifecycle-configuration file:///tmp/lifecycle.json
    ```

12. **Delete unnecessary files**
    ```bash
    # Find and delete old temporary files
    aws s3 rm s3://usbvault-data-prod/temp/ --recursive

    # Find duplicate/redundant backups
    aws s3api list-objects-v2 --bucket usbvault-data-prod --prefix backup/ \
      --query 'Contents[].[Key,LastModified,Size]' \
      --output table | grep "$(date -d '30 days ago' +%Y-%m)"

    # Delete old backups (keep last 30 days)
    aws s3 rm s3://usbvault-data-prod/backup/ \
      --recursive \
      --exclude "*" \
      --include "$(date -d '40 days ago' +%Y%m%d)*"
    ```

#### Path C: Log Accumulation

13. **Identify and clean old logs**
    ```bash
    # Check log directory sizes
    du -sh /var/log/* | sort -hr | head -20

    # Identify old log files (>30 days)
    find /var/log -name "*.log*" -mtime +30 -exec ls -lh {} \; | head -20

    # Archive to cold storage
    tar -czf /tmp/logs-$(date -d '30 days ago' +%Y%m%d).tar.gz \
      /var/log/*.log.*

    # Upload to S3 Glacier
    aws s3 cp /tmp/logs-*.tar.gz s3://usbvault-log-archive/
    ```

14. **Configure log rotation**
    ```bash
    # Check logrotate config
    cat /etc/logrotate.conf
    cat /etc/logrotate.d/usbvault-app

    # Update rotation policy if too aggressive
    cat > /etc/logrotate.d/usbvault-app <<'EOF'
    /var/log/usbvault-api.log {
      daily
      rotate 7
      compress
      delaycompress
      notifempty
      create 0640 app app
      postrotate
        systemctl reload usbvault-api
      endscript
    }
    EOF

    # Force rotation
    logrotate -f /etc/logrotate.conf
    ```

15. **Clean application logs**
    ```bash
    # Check if application logs are in pod storage
    kubectl exec -n production deployment/usbvault-api -- du -sh /var/log/

    # Clear old logs from pods
    kubectl exec -n production deployment/usbvault-api -- sh -c 'rm /var/log/*.log.* || true'

    # Restart to clear logs
    kubectl delete pods -n production -l app=usbvault-api
    ```

#### Path D: Kubernetes Node Disk Pressure

16. **Free space on node**
    ```bash
    # SSH to node
    NODE=$(kubectl get pods -n production deployment/usbvault-api -o jsonpath='{.items[0].spec.nodeName}')
    gcloud compute ssh $NODE --zone us-central1-a

    # Clean container images
    docker image prune -a -f

    # Clean container storage
    docker container prune -f

    # Clean pod logs
    find /var/lib/kubelet/pods -name "*.log" -mtime +7 -delete

    # Clean temp files
    rm -rf /tmp/* /var/tmp/*
    ```

17. **Update Kubernetes disk thresholds**
    ```bash
    # Check current threshold
    kubectl describe node <node-name> | grep -i "disk-pressure"

    # Update kubelet config to use different threshold
    # Edit /etc/kubernetes/kubelet-config.yaml:
    # evictionHard:
    #   nodefs.available: 5%      (default: 10%)
    # or
    # evictionHard:
    #   nodefs.inodesFree: 5%

    # Restart kubelet
    sudo systemctl restart kubelet

    # Drain node if needed
    kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
    kubectl uncordon <node-name>
    ```

### Phase 3: Verification (2-3 minutes)

18. **Verify space has been freed**
    ```bash
    # Check disk usage again
    df -h | grep -E "Use%|Filesystem|9[0-9]%"

    # Should now show <80% usage on all critical partitions

    # For database
    du -sh /var/lib/postgresql/data/

    # For S3
    aws s3 ls s3://usbvault-data-prod --recursive --summarize

    # For logs
    du -sh /var/log
    ```

19. **Verify services are healthy**
    ```bash
    # Database should be writable
    psql -h prod-db.internal -U app_user -d usbvault_db -c "
      INSERT INTO test_table (message) VALUES ('test');
      DELETE FROM test_table;"

    # Application pods should be running
    kubectl get pods -n production | grep -E "Running|Error"

    # No disk pressure warnings
    kubectl get nodes -o json | jq '.items[].status.conditions[] | select(.type=="DiskPressure")'
    ```

20. **Monitor for recurrence**
    ```bash
    # Watch disk usage
    watch -n 60 'df -h | grep -E "Filesystem|/"'

    # Set alerts if trends indicate recurring issue
    # Alert if any partition >85% within 24 hours
    ```

---

## Verification Checklist

- [ ] All critical partitions <80% utilized
- [ ] Database accepts writes
- [ ] No pods in Evicted status
- [ ] Application pods Running and Ready
- [ ] Backup jobs completing successfully
- [ ] No disk-related errors in logs
- [ ] S3 bucket below quota

---

## Escalation Path

**Immediate (0-10 mins):** On-Call Infrastructure Engineer
- Free up space immediately, restore services

**10-20 mins:** Infrastructure Lead
- Long-term storage plan, capacity upgrade

**20+ mins:** VP Engineering & Finance
- Budget for storage expansion if needed

---

## Post-Incident Checklist

- [ ] Document what caused disk to fill (logs, backups, audit logs?)
- [ ] Implement automated archival for large tables
- [ ] Configure S3 lifecycle policies
- [ ] Set up monitoring alerts for disk usage >75%
- [ ] Review log rotation policies
- [ ] Plan storage capacity for next 12 months
- [ ] Implement automated cleanup jobs
- [ ] Document cleanup procedures
- [ ] Test recovery procedures
- [ ] Schedule weekly disk usage review

---

## Prevention Going Forward

```bash
# Add automated audit log archival cron job
# In crontab (weekly):
0 2 * * 0 /usr/local/bin/archive_audit_logs.sh

# Add S3 lifecycle policy
# Automatic transition to Glacier after 90 days

# Add Kubernetes disk monitoring alert
# Alert if any node disk >85% for >5 minutes

# Add database cleanup cronjob
# Daily: VACUUM ANALYZE on large tables
# Weekly: REINDEX on heavily updated tables
```
