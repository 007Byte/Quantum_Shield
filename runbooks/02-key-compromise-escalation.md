# Key Compromise Escalation Runbook

**Severity:** SEV1 (Critical)
**Last Updated:** 2026-03-09
**Component:** Key Management Service (KMS), JWT, API Keys
**Owner:** Security & Platform Engineering

---

## Overview

This runbook addresses immediate response to compromised cryptographic keys including JWT signing keys, Master Encryption Keys (MEK), and API keys. RTO target is 10 minutes for key revocation, RPO target is immediate.

**Status:** PH2-FIX Implementation Complete (New Key Rotation Service Active)

---

## Prerequisites

- Access to AWS KMS console and API
- Admin credentials for JWT key management endpoint
- Access to Redis cluster (active key store)
- Slack access to security-incidents channel
- PagerDuty admin role
- Database access for audit log queries
- Customer notification templates prepared
- SOC 2 compliance coordinator contact information

---

## Symptoms & Detection

**Symptoms:**
- Unauthorized API calls originating from unknown IPs
- JWT tokens accepted with invalid signatures
- Authentication bypass attempts detected
- Suspicious activity in CloudTrail logs
- Key usage spikes in CloudWatch metrics
- External party reports receiving your API credentials
- Code repository contains exposed keys (GitHub secret scanning alerts)
- Unusual permission escalations in audit logs

**Detection Tools:**
```bash
# Check JWT key usage in last hour
aws cloudwatch get-metric-statistics \
  --metric-name JWTKeyRotationCount \
  --namespace QAV/Security \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# Query suspicious auth attempts
psql -h prod-db.internal -U app_user -d qav_db -c "
  SELECT COUNT(*), source_ip, error_type
  FROM auth_logs
  WHERE created_at > NOW() - INTERVAL '1 hour'
    AND status = 'failed'
  GROUP BY source_ip, error_type
  ORDER BY COUNT(*) DESC
  LIMIT 10;"

# Check CloudTrail for key operations
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceType,AttributeValue=AWS::KMS::Key \
  --max-results 50 \
  --region us-east-1
```

---

## Severity Assessment

**SEV1 (Immediate Action):**
- JWT signing key in production compromised
- Master Encryption Key (MEK) exposed
- Multiple API keys leaked to public repositories
- Active unauthorized access detected

**SEV2 (Urgent Response):**
- Single API key leaked (non-critical scope)
- Test/staging keys compromised
- Key exposure in private channel (not yet exploited)

**SEV3 (Standard Process):**
- Outdated keys from previous versions
- Internal key rotation due
- Non-critical integration credentials

---

## Step-by-Step Resolution

### Phase 1: Immediate Containment (0-2 minutes)

1. **Declare incident**
   ```bash
   # Create incident in PagerDuty
   curl -X POST https://events.pagerduty.com/v2/enqueue \
     -H 'Content-Type: application/json' \
     -d '{
       "routing_key": "'"$PD_INTEGRATION_KEY"'",
       "event_action": "trigger",
       "dedup_key": "key-compromise-'$(date +%s)'",
       "payload": {
         "summary": "CRITICAL: Key Compromise Detected",
         "severity": "critical",
         "source": "Security Team",
         "custom_details": {
           "key_type": "JWT/API/MEK",
           "detected_at": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
           "affected_systems": "Authentication, Encryption"
         }
       }
     }'

   # Notify security channel
   aws sns publish \
     --topic-arn arn:aws:sns:us-east-1:123456789012:security-alerts \
     --message "CRITICAL: Key compromise detected. Initiating emergency response."
   ```

2. **Alert security team immediately**
   - Post to #security-incidents Slack channel
   - Message: "CRITICAL: Key compromise - [TYPE] - DO NOT CLOSE UNTIL CLEARED"
   - Tag @security-oncall and @platform-oncall
   - Create war room (Slack huddle or Zoom)

3. **Disable affected access vectors** (immediate, no validation needed)
   - Block API keys via API Gateway WAF rules
   - Add leaked keys to revocation list immediately
   - If database credentials exposed: force password reset for app user
   - If OAuth tokens exposed: invalidate all sessions across platform

### Phase 2: Root Cause Analysis (2-5 minutes)

4. **Identify key type and scope**
   ```bash
   # For JWT keys:
   curl -X GET https://kms.qav.internal/api/v1/keys/jwt \
     -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.keys[].id, .keys[].status'

   # For API keys:
   psql -h prod-db.internal -U app_user -d qav_db -c "
     SELECT key_hash, client_name, created_at, last_used_at
     FROM api_keys
     WHERE status = 'active'
     ORDER BY last_used_at DESC
     LIMIT 20;"

   # For MEK:
   aws kms describe-key --key-id alias/qav-mek-prod
   ```

5. **Determine exposure vector**
   - GitHub repository scan results
   - Slack channel history
   - CI/CD logs and artifact repositories
   - AWS CloudTrail events around key creation
   - Internal security scanner findings
   - Third-party disclosure or researcher report

6. **Assess blast radius**
   - Which microservices use this key?
   - How many customers affected?
   - What data can be accessed with this credential?
   - Time window of potential unauthorized access
   - Log retention period for forensics

### Phase 3: Key Rotation (5-10 minutes)

**PH2-FIX: New Key Rotation Service Implementation**

7. **Initiate emergency key rotation via KMS**
   ```bash
   # Call new PH2-FIX key rotation endpoint
   curl -X POST https://kms.qav.internal/api/v1/keys/rotate \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "key_id": "jwt-primary",
       "rotation_type": "emergency",
       "grace_period_minutes": 5,
       "notify_services": true
     }'
   ```

8. **Monitor rotation status**
   ```bash
   # Watch rotation progress
   watch -n 5 'curl -s https://kms.qav.internal/api/v1/keys/rotation-status \
     -H "Authorization: Bearer $ADMIN_TOKEN" | jq .'

   # Expected progression:
   # - "status": "in_progress"
   # - "services_rotated": 3/5
   # - Updated: qav-api, qav-auth, qav-worker
   ```

9. **Verify new key deployment**
   ```bash
   # Check if services are using new keys
   kubectl logs -n production deployment/qav-api \
     --all-containers=true | grep -i "key_id\|rotation"

   # Query key metadata
   aws kms list-keys | jq '.Keys[] | select(.KeyId | contains("jwt"))'
   ```

10. **Update service configurations** (automated by PH2-FIX service)
    ```bash
    # Verify all services have new key in environment
    kubectl get secrets -n production jwt-keys -o yaml

    # Force pod restarts to pick up new key
    kubectl rollout restart deployment/qav-api -n production
    kubectl rollout restart deployment/qav-auth -n production
    kubectl rollout restart deployment/qav-worker -n production

    # Wait for rollout to complete
    kubectl rollout status deployment/qav-api -n production
    ```

11. **Invalidate old credentials globally**
    ```bash
    # Revoke all tokens signed with old key
    curl -X POST https://auth.qav.internal/api/v1/tokens/revoke-all \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -d '{"reason": "emergency_key_rotation", "affected_key": "jwt-primary-old"}'

    # Clear distributed caches
    redis-cli -c FLUSHALL  # CAUTION: Only in emergency

    # Or selectively:
    redis-cli -c DEL jwt:* auth:session:* api:token:*
    ```

### Phase 4: Audit & Forensics (10-30 minutes)

12. **Query access logs for unauthorized activity**
    ```bash
    # Find all uses of compromised key in last 7 days
    psql -h prod-db.internal -U app_user -d qav_db -c "
      SELECT
        timestamp,
        source_ip,
        user_id,
        action,
        resource,
        result
      FROM audit_logs
      WHERE api_key_hash = '$COMPROMISED_KEY_HASH'
        AND timestamp > NOW() - INTERVAL '7 days'
      ORDER BY timestamp DESC
      LIMIT 1000;" > /tmp/unauthorized_access.txt

    # Summarize suspicious patterns
    cut -d'|' -f2,3,4,5 /tmp/unauthorized_access.txt | sort | uniq -c | sort -rn
    ```

13. **Extract forensic data for investigation**
    ```bash
    # Export relevant logs
    aws s3 sync s3://qav-cloudtrail-logs/2026/03/09/ /tmp/forensics/cloudtrail/

    # Get database audit logs
    pg_dump -h prod-db.internal -U postgres --table audit_logs \
      -d qav_db > /tmp/forensics/audit_logs.sql

    # Package forensics for security team
    tar -czf /tmp/forensics-$(date +%Y%m%d-%H%M%S).tar.gz /tmp/forensics/
    aws s3 cp /tmp/forensics-*.tar.gz s3://qav-security-forensics/
    ```

14. **Identify impacted user accounts**
    ```bash
    # Find which customers had data accessed
    psql -h prod-db.internal -U app_user -d qav_db -c "
      SELECT DISTINCT customer_id, COUNT(*) as access_count
      FROM audit_logs
      WHERE api_key_hash = '$COMPROMISED_KEY_HASH'
      GROUP BY customer_id
      ORDER BY access_count DESC;" > /tmp/impacted_customers.txt
    ```

### Phase 5: Compliance & Communication (ongoing)

15. **Trigger compliance notification procedures**
    - Contact Legal & Compliance team immediately
    - Document incident with date/time/scope
    - Prepare breach notification under SOC 2, HIPAA, GDPR if applicable
    - File incident in compliance tracking system
    - Schedule audit review within 24 hours

16. **Prepare customer notifications**
    ```bash
    # For each affected customer:
    # 1. Identify scope of data accessed
    # 2. Draft notification email with:
    #    - What happened
    #    - When discovered
    #    - Actions taken (key rotation, session revocation)
    #    - What customer should do
    #    - Point of contact for questions

    # Example template:
    cat > /tmp/customer_notification.txt <<'EOF'
    Subject: Security Notice - API Key Incident

    Dear [CUSTOMER_NAME],

    We are writing to inform you of a security incident involving API keys
    used to access Quantum_Shield services.

    WHAT HAPPENED:
    On [DATE] at [TIME], we discovered that API key(s) associated with your
    account may have been exposed in [SOURCE].

    SCOPE:
    - Accounts affected: [ACCOUNTS]
    - Data accessed: [DATA TYPES]
    - Time window: [START] to [DETECTION TIME]

    ACTIONS TAKEN:
    - Affected keys have been revoked immediately
    - All sessions authenticated with old keys have been terminated
    - New API keys have been generated and are ready for use
    - Our security team is investigating the source of the exposure

    WHAT YOU SHOULD DO:
    1. Rotate your credentials in your control panel
    2. Review your recent API activity for anomalies
    3. Contact us if you see suspicious activity

    We take security seriously and apologize for this incident.
    EOF
    ```

17. **Post status page updates**
    - Create incident on statuspage.io
    - Update every 15 minutes during active remediation
    - Post final summary once investigation complete

---

## Verification Steps

- [ ] New key generated and deployed to all services
- [ ] Old keys removed from active use (confirmed in KMS)
- [ ] All prior tokens invalidated: `curl -s https://auth.qav.internal/api/v1/token-status | jq .revoked_count`
- [ ] Authentication works with new keys: `curl -X POST https://api.qav.internal/v1/auth -d '{"client_id":"test"}'`
- [ ] No unauthorized access attempts in last 10 mins: `grep UNAUTHORIZED /var/log/app.log | wc -l`
- [ ] Customer notifications sent to all affected parties
- [ ] Forensic logs secured and archived
- [ ] Incident ticket contains complete RCA

---

## Escalation Path

**Immediate (0-10 mins):** Security Engineer + On-Call DBA
- Contain exposure, revoke keys, start rotation

**15 mins:** CISO + Legal Counsel
- Assess compliance obligations
- Decide on customer disclosure timeline

**30 mins:** VP Engineering + Customer Success
- Determine communication strategy
- Plan customer outreach

**1+ hour:** Executive Leadership + Board Notification (if major)
- Public incident communication
- Regulatory filing (if required)

---

## Post-Incident Checklist

- [ ] Complete security investigation by security team
- [ ] Finalize RCA document with all findings
- [ ] Conduct blameless post-mortem within 24 hours
- [ ] Update key rotation procedures based on lessons learned
- [ ] Implement additional secret scanning in CI/CD pipeline
- [ ] Review and strengthen key management controls
- [ ] Schedule security awareness training for team
- [ ] Verify all customers have rotated credentials
- [ ] Update runbook with any new procedures discovered
- [ ] Consider third-party security audit if major incident
- [ ] Document lessons learned in wiki
- [ ] Schedule follow-up verification in 30 days
