# Database Recovery Runbook

**Severity:** SEV1
**Last Updated:** 2026-03-09
**Component:** PostgreSQL Primary Database
**Owner:** Platform Engineering

---

## Overview

This runbook guides recovery procedures for PostgreSQL database failures including corruption, failed migrations, and data loss. RTO target is 15 minutes, RPO target is 5 minutes.

---

## Prerequisites

- PostgreSQL 14+ with pg_restore utility installed
- AWS CLI v2 configured with appropriate credentials
- Access to backup S3 bucket (`qav-db-backups-prod`)
- SSH access to database replica server
- Database admin credentials loaded in secure credential manager
- CloudWatch access for monitoring
- PagerDuty integration active

---

## Symptoms & Detection

**Symptoms:**
- Application logs show "connection refused" or "broken pipe" errors
- Database queries timeout consistently
- Replication lag exceeds 1 minute
- Disk I/O errors in system logs
- PostgreSQL process crashes (OOM, SIGSEGV)
- Authentication failures despite correct credentials
- Table/index corruption detected by `pg_dump` errors

**Detection Tools:**
```bash
# Check database connectivity
psql -h prod-db.internal -U app_user -d qav_db -c "SELECT version();"

# Monitor replication status
psql -h prod-db.internal -U postgres -d postgres -c "SELECT * FROM pg_stat_replication;"

# Check database size and free space
df -h /var/lib/postgresql/data
psql -h prod-db.internal -U postgres -d qav_db -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database WHERE datname = 'qav_db';"
```

---

## Step-by-Step Resolution

### Phase 1: Diagnosis (5 minutes)

1. **Confirm database is down**
   ```bash
   pg_isready -h prod-db.internal -p 5432
   ```
   Expected output: `accepting connections` or `rejecting connections`

2. **Check PostgreSQL logs for root cause**
   ```bash
   tail -100 /var/log/postgresql/postgresql.log
   grep -i "fatal\|error\|panic" /var/log/postgresql/postgresql.log | tail -20
   ```

3. **Identify failure type:**
   - **Corruption**: Look for "page verification failed" or "heap corruption"
   - **OOM Kill**: Check `dmesg | tail -20`
   - **Disk Full**: Run `df -h` on database volume
   - **Failed Migration**: Check `pg_catalog.pg_class` integrity

4. **Document findings in incident ticket**
   - Record exact error messages
   - Note affected tables/indexes if known
   - Capture system metrics (CPU, memory, I/O)

### Phase 2: Backup Verification (3 minutes)

5. **Check latest backup status**
   ```bash
   aws s3api list-objects-v2 \
     --bucket qav-db-backups-prod \
     --prefix daily/ \
     --query 'sort_by(Contents, &LastModified)[-1]' \
     --region us-east-1
   ```

6. **Verify backup integrity**
   ```bash
   aws s3api head-object \
     --bucket qav-db-backups-prod \
     --key daily/qav_db_$(date -d '1 day ago' +%Y%m%d).backup
   ```

7. **Confirm replica status** (if not primary failure)
   ```bash
   ssh prod-db-replica.internal
   pg_isready -p 5432
   psql -U postgres -d postgres -c "SELECT NOW() - pg_last_xact_replay_timestamp() AS replication_lag;"
   ```

### Phase 3: Recovery Decision

8. **Choose recovery path:**
   - **Path A (Replica Promotion)**: If primary corrupted but replica healthy → promote replica
   - **Path B (Backup Restore)**: If both corrupted or replica unhealthy → restore from backup
   - **Path C (Point-in-Time Recovery)**: If specific transaction needs rollback → use WAL archives

### Phase 4A: Replica Promotion (if applicable)

9. **Promote replica to primary**
   ```bash
   ssh prod-db-replica.internal
   sudo -u postgres pg_ctl promote -D /var/lib/postgresql/data
   ```

10. **Monitor promotion progress**
    ```bash
    psql -U postgres -d postgres -c "SELECT pg_is_wal_replay_paused();"
    ```

11. **Update DNS/connection strings**
    ```bash
    # Update Route53 endpoint
    aws route53 change-resource-record-sets \
      --hosted-zone-id Z1234567890ABC \
      --change-batch '{
        "Changes": [{
          "Action": "UPSERT",
          "ResourceRecordSet": {
            "Name": "prod-db.internal",
            "Type": "CNAME",
            "TTL": 60,
            "ResourceRecords": [{"Value": "prod-db-replica.internal"}]
          }
        }]
      }'
    ```

12. **Verify applications reconnect**
    ```bash
    psql -h prod-db.internal -U app_user -d qav_db -c "SELECT datname, now() FROM pg_database LIMIT 1;"
    ```

### Phase 4B: Backup Restore (if needed)

13. **Stop all application connections**
    ```bash
    # Scale down app pods
    kubectl scale deployment qav-api --replicas=0 -n production
    kubectl scale deployment qav-worker --replicas=0 -n production

    # Wait for graceful shutdown
    sleep 30
    ```

14. **Stop PostgreSQL safely**
    ```bash
    sudo systemctl stop postgresql
    sudo rm -rf /var/lib/postgresql/data/pg_wal/*
    sudo rm -rf /var/lib/postgresql/data/base/*
    ```

15. **Download latest backup**
    ```bash
    cd /var/lib/postgresql
    aws s3 cp s3://qav-db-backups-prod/daily/qav_db_$(date -d '1 day ago' +%Y%m%d).backup .

    # Verify checksum
    aws s3api head-object --bucket qav-db-backups-prod \
      --key daily/qav_db_$(date -d '1 day ago' +%Y%m%d).backup.sha256
    sha256sum -c qav_db_*.backup.sha256
    ```

16. **Restore from backup**
    ```bash
    sudo systemctl start postgresql

    # Wait for initialization
    sleep 10

    sudo -u postgres pg_restore \
      --verbose \
      --no-acl \
      --if-exists \
      --clean \
      --format=custom \
      --dbname=postgres \
      /var/lib/postgresql/data/qav_db_*.backup
    ```

17. **Restore custom settings**
    ```sql
    -- Restore parameter settings
    ALTER DATABASE qav_db SET shared_preload_libraries = 'pg_stat_statements,pgcrypto';
    ALTER DATABASE qav_db SET max_connections = 200;
    ALTER DATABASE qav_db SET work_mem = '4MB';
    ```

18. **Restore user permissions**
    ```bash
    sudo -u postgres psql -d qav_db -f /backup/roles.sql
    sudo -u postgres psql -d qav_db -f /backup/grants.sql
    ```

19. **Rebuild replication**
    ```bash
    # On replica:
    ssh prod-db-replica.internal
    sudo systemctl stop postgresql
    sudo rm -rf /var/lib/postgresql/data/*

    # On primary:
    sudo -u postgres pg_basebackup \
      --pgdata=/var/lib/postgresql/data \
      --format=p \
      --xlog-method=stream \
      -h prod-db.internal \
      -U replication

    sudo chown postgres:postgres /var/lib/postgresql/data
    sudo chmod 700 /var/lib/postgresql/data
    sudo systemctl start postgresql
    ```

### Phase 5: Application Recovery

20. **Verify database health**
    ```bash
    psql -h prod-db.internal -U app_user -d qav_db -c "
      SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
      FROM pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 10;"
    ```

21. **Scale applications back up**
    ```bash
    kubectl scale deployment qav-api --replicas=3 -n production
    kubectl scale deployment qav-worker --replicas=2 -n production

    # Monitor pod startup
    kubectl logs -n production -l app=qav-api --tail=50 -f
    ```

22. **Run data integrity checks**
    ```bash
    psql -h prod-db.internal -U app_user -d qav_db -f /scripts/integrity_checks.sql
    ```

---

## Verification Steps

- [ ] Database accepts connections: `pg_isready -h prod-db.internal`
- [ ] Replication lag is near zero: `SELECT now() - pg_last_xact_replay_timestamp();`
- [ ] All critical tables present: `SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';`
- [ ] Application health checks pass: `curl -s http://qav-api:8080/health | jq .status`
- [ ] Background jobs resuming: `SELECT COUNT(*) FROM jobs WHERE status = 'pending';`
- [ ] No error spikes in logs: `grep -i "error\|warning" /var/log/app.log | wc -l`
- [ ] Customer-facing dashboards updating: Monitor metrics in production environment

---

## Escalation Path

**Level 1 (First 15 mins):** On-call Database Engineer
- Diagnose and attempt Replica Promotion or Point-in-Time Recovery

**Level 2 (15+ mins, if unresolved):** Database Platform Lead + Senior SRE
- Review backup integrity
- Initiate full restore procedure
- Coordinate with application teams

**Level 3 (30+ mins, if major data loss):** VP Engineering + Legal/Compliance
- Assess data loss scope
- Prepare customer communication
- Initiate incident post-mortem

**External Escalation (if >1hr downtime):** Customer Support + Executive Team
- Notify affected customers
- Post status updates
- Prepare public incident report

---

## Post-Incident Checklist

- [ ] Document exact RCA in ticket with error logs
- [ ] Review backup strategy effectiveness
- [ ] Verify all data restored correctly (sample queries on key tables)
- [ ] Schedule capacity review if disk/memory was factor
- [ ] Review replication configuration for lag prevention
- [ ] Update runbook with any new procedures discovered
- [ ] Schedule PostgreSQL health check with DBA team
- [ ] Add monitoring alerts for future failures (replication lag > 5min)
- [ ] Conduct blameless postmortem within 48 hours
- [ ] Distribute findings to ops and engineering teams
