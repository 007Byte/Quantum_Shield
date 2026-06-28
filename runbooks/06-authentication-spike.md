# Authentication Spike Runbook

**Severity:** SEV2
**Last Updated:** 2026-03-09
**Component:** Authentication Service, Rate Limiting
**Owner:** Platform Engineering & Security

---

## Overview

This runbook addresses rapid spikes in authentication attempts including brute force attacks, credential stuffing, and token theft. RTO target is 5 minutes to contain attack, RPO target is immediate.

**Status:** PH1-FIX Implementation Complete (Rate Limiting & Auth Lockout Service)

---

## Prerequisites

- Access to authentication service logs
- Rate limiting service dashboard access
- Redis cluster access (for rate limiting state)
- IP blocking capability (WAF/iptables)
- Database access for user account analysis
- AWS WAF console access
- DDoS protection service (AWS Shield)
- Security team escalation procedures
- Customer notification templates

---

## Symptoms & Detection

**Symptoms:**
- Spike in auth endpoint requests (>10x normal)
- High failed login attempt rate
- Same IP hitting auth endpoint many times rapidly
- Credential stuffing patterns (many different usernames from same IP)
- Valid accounts locked after many failed attempts
- Auth service CPU/memory spike
- JWT token validation errors spiking
- Customers unable to login (legitimate traffic blocked)

**Detection Tools:**
```bash
# Check auth request volume
curl -s 'http://prometheus.internal:9090/api/v1/query?query=rate(auth_requests_total[1m])' | jq '.data.result[0].value'

# Check failed auth attempts
curl -s 'http://prometheus.internal:9090/api/v1/query?query=rate(auth_failures_total{reason="invalid_credentials"}[1m])' | jq '.data.result[0].value'

# Check for suspicious IPs
kubectl logs -n production deployment/usbvault-auth --tail=500 | grep -i "failed.*login\|invalid.*credentials" | cut -d' ' -f1 | sort | uniq -c | sort -rn | head -20

# Check rate limiting metrics
redis-cli -h redis-master.internal KEYS "rate-limit:*" | head -20

# Get top source IPs
tail -1000 /var/log/auth.log | awk '{print $1}' | sort | uniq -c | sort -rn | head -20
```

---

## Attack Patterns

### Pattern 1: Brute Force Attack
- Single IP trying many password combinations
- One username, many passwords
- Rate: 10-100 attempts per second

### Pattern 2: Credential Stuffing
- Many usernames, same password (or from stolen database)
- Multiple IPs (distributed)
- Rate: 50-1000 attempts per second

### Pattern 3: Bot Attack
- Automated tool testing endpoints
- Random/garbage usernames
- Specific endpoint targeting

### Pattern 4: Token Theft
- Valid tokens being used from unauthorized IPs
- Session hijacking patterns
- Geographic anomalies

---

## Step-by-Step Resolution

### Phase 1: Detection & Verification (1-2 minutes)

1. **Verify attack is happening**
   ```bash
   # Get auth request rate
   CURRENT_RATE=$(curl -s 'http://prometheus.internal:9090/api/v1/query?query=rate(auth_requests_total[1m])' | jq '.data.result[0].value[1]' | cut -d'"' -f2)

   # Compare to baseline
   BASELINE=50  # requests per minute baseline

   if (( $(echo "$CURRENT_RATE > $BASELINE * 10" | bc -l) )); then
     echo "AUTH SPIKE DETECTED: $CURRENT_RATE req/min (baseline: $BASELINE)"
   fi

   # Check error rate
   ERROR_RATE=$(curl -s 'http://prometheus.internal:9090/api/v1/query?query=rate(auth_failures_total[1m])' | jq '.data.result[0].value[1]' | cut -d'"' -f2)
   echo "Failed attempts: $ERROR_RATE per minute"
   ```

2. **Identify attack type**
   ```bash
   # Get top IPs attacking
   kubectl logs -n production deployment/usbvault-auth --tail=2000 | \
     grep -i "failed login\|invalid credentials" | \
     awk '{print $NF}' | \
     sort | uniq -c | sort -rn | head -20

   # Get top usernames being targeted
   kubectl logs -n production deployment/usbvault-auth --tail=2000 | \
     grep "failed login" | \
     awk '{print $(NF-1)}' | \
     sort | uniq -c | sort -rn | head -20

   # Check if distributed (many IPs) or single IP
   UNIQUE_IPS=$(kubectl logs -n production deployment/usbvault-auth --tail=2000 | \
     grep "failed login" | awk '{print $NF}' | sort -u | wc -l)

   if [ $UNIQUE_IPS -gt 50 ]; then
     echo "DISTRIBUTED ATTACK (Credential Stuffing): $UNIQUE_IPS unique IPs"
   else
     echo "SINGLE SOURCE ATTACK (Brute Force): $UNIQUE_IPS unique IPs"
   fi
   ```

3. **Declare incident**
   ```bash
   curl -X POST https://events.pagerduty.com/v2/enqueue \
     -H 'Content-Type: application/json' \
     -d '{
       "routing_key": "'"$PD_INTEGRATION_KEY"'",
       "event_action": "trigger",
       "dedup_key": "auth-spike-'$(date +%s)'",
       "payload": {
         "summary": "Authentication Spike Detected",
         "severity": "warning",
         "source": "Monitoring System"
       }
     }'
   ```

### Phase 2: Immediate Containment (2-3 minutes)

4. **Activate rate limiting** (PH1-FIX: Rate Limiting Service)
   ```bash
   # Check current rate limit config
   redis-cli -h redis-master.internal HGETALL "rate-limit:auth:config"

   # Temporarily tighten rate limit (e.g., 5 attempts per minute per IP)
   redis-cli -h redis-master.internal HSET "rate-limit:auth:config" \
     "max_attempts" "5" \
     "window_seconds" "60"

   # Force flush and rebuild rate limit state
   redis-cli -h redis-master.internal FLUSHDB  # CAUTION: clears all Redis data
   # OR selectively:
   redis-cli -h redis-master.internal --scan --pattern "rate-limit:auth:*" | xargs redis-cli UNLINK

   # Verify rate limiting is working
   curl -s http://prometheus.internal:9090/api/v1/query?query='rate_limit_triggered_total' | jq '.data.result[0].value'
   ```

5. **Block malicious IPs using WAF** (if single source)
   ```bash
   # Get top attacking IP
   TOP_IP=$(kubectl logs -n production deployment/usbvault-auth --tail=2000 | \
     grep "failed login" | \
     awk '{print $NF}' | \
     sort | uniq -c | sort -rn | head -1 | awk '{print $2}')

   echo "Blocking IP: $TOP_IP"

   # Add to AWS WAF IP blocklist
   aws wafv2 create-ip-set \
     --name "auth-attack-ips" \
     --scope REGIONAL \
     --region us-east-1 \
     --ip-address-version IPV4 \
     --addresses "$TOP_IP/32" \
     2>/dev/null || \
   aws wafv2 update-ip-set \
     --name "auth-attack-ips" \
     --scope REGIONAL \
     --region us-east-1 \
     --addresses "$TOP_IP/32" \
     --id $(aws wafv2 list-ip-sets --scope REGIONAL --region us-east-1 | jq -r '.IPSets[0].Id')

   # Verify WAF applied to auth endpoint
   # Check AWS WAF console: IP set applied to WebACL for auth API
   ```

6. **Activate auth lockout service** (PH1-FIX: Auth Lockout Service)
   ```bash
   # Check if accounts are being locked
   curl -s 'http://prometheus.internal:9090/api/v1/query?query=auth_accounts_locked_total' | jq '.data.result[].value'

   # Query locked accounts
   psql -h prod-db.internal -U app_user -d usbvault_db -c "
     SELECT email, locked_at, failed_attempts
     FROM users
     WHERE is_locked = true
     ORDER BY locked_at DESC
     LIMIT 20;"

   # Configure auto-unlock settings
   # (Typically: unlock after 30 minutes or admin manual unlock)
   ```

### Phase 3: Attack Analysis (2-5 minutes)

7. **Determine target accounts**
   ```bash
   # Which accounts are being attacked?
   psql -h prod-db.internal -U app_user -d usbvault_db -c "
     SELECT
       u.email,
       COUNT(aal.id) as failed_attempts,
       MAX(aal.created_at) as last_attempt
     FROM users u
     JOIN auth_attempt_logs aal ON u.id = aal.user_id
     WHERE aal.status = 'failed'
       AND aal.created_at > NOW() - INTERVAL '1 hour'
     GROUP BY u.id, u.email
     ORDER BY failed_attempts DESC
     LIMIT 20;"

   # Are attackers going after admin accounts, common names, or random?
   # This indicates sophistication level
   ```

8. **Check for actual breaches**
   ```bash
   # Did attackers actually get in? (successful logins)
   psql -h prod-db.internal -U app_user -d usbvault_db -c "
     SELECT
       aal.source_ip,
       u.email,
       aal.created_at,
       u.last_login
     FROM auth_attempt_logs aal
     JOIN users u ON aal.user_id = u.id
     WHERE aal.status = 'success'
       AND aal.created_at > NOW() - INTERVAL '1 hour'
     ORDER BY aal.created_at DESC
     LIMIT 50;"

   # If successful logins from attack IPs: accounts may be compromised
   # Move to Key Compromise runbook
   ```

9. **Assess MFA bypass attempts**
   ```bash
   # Check if attackers bypassed MFA
   kubectl logs -n production deployment/usbvault-auth --tail=2000 | grep -i "mfa.*failed\|totp.*invalid"

   # If yes: indicates compromised password AND potentially compromised phone/secret
   # Notify security team immediately
   ```

### Phase 4: Escalation & Mitigation (3-5 minutes)

10. **Block distributed attack (credential stuffing)**
    ```bash
    # If many IPs, can't block by IP alone
    # Enable CAPTCHA on auth endpoint

    # Update auth service config
    kubectl set env deployment/usbvault-auth \
      ENABLE_CAPTCHA=true \
      CAPTCHA_THRESHOLD=3 \
      -n production

    # This requires human verification after 3 failed attempts
    # Blocks bots but allows human users to recover

    # Verify CAPTCHA challenge appearing
    kubectl logs -n production deployment/usbvault-auth | grep -i captcha
    ```

11. **Notify affected users**
    ```bash
    # Prepare notification
    ATTACK_START=$(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ)

    cat > /tmp/user_notification.txt <<EOF
    Subject: Quantum_Shield Security Alert - Authentication Attempt

    We detected unusual authentication activity on your account.

    Time: $ATTACK_START UTC
    Your account is secure and remains locked until you verify ownership.

    WHAT YOU SHOULD DO:
    1. If you did not attempt to login: Your password may be compromised
       - Go to account settings and change your password immediately
       - Enable two-factor authentication if not already enabled
    2. If this was you: Wait 30 minutes for lock to expire, then login normally

    Need help? Contact support@usbvault.io
    EOF
    ```

12. **If high-value accounts compromised: Emergency password reset**
    ```bash
    # Force password reset for affected accounts
    psql -h prod-db.internal -U app_user -d usbvault_db -c "
      UPDATE users
      SET password_reset_required = true,
          password_reset_token = gen_random_uuid(),
          password_reset_expires = NOW() + INTERVAL '24 hours'
      WHERE email IN (
        SELECT email FROM json_array_elements(
          '[\"admin@usbvault.io\", \"ceo@usbvault.io\"]'::jsonb
        ) AS email(text)
      );
    "

    # Send password reset emails
    psql -h prod-db.internal -U app_user -d usbvault_db -c "
      SELECT email, password_reset_token
      FROM users
      WHERE password_reset_required = true;"
    ```

### Phase 5: Recovery & Communication

13. **Unlock legitimate users**
    ```bash
    # After attack subsides, unlock accounts
    # Manual unlock (if needed before auto-unlock timer)
    psql -h prod-db.internal -U app_user -d usbvault_db -c "
      UPDATE users
      SET is_locked = false,
          failed_login_attempts = 0,
          locked_at = NULL
      WHERE is_locked = true
        AND locked_at < NOW() - INTERVAL '30 minutes';"

    # Verify unlock
    psql -h prod-db.internal -U app_user -d usbvault_db -c "
      SELECT COUNT(*)
      FROM users
      WHERE is_locked = true;"
    ```

14. **Monitor for recurrence**
    ```bash
    # Create alert for similar patterns
    # Set rate limit alert: >100 failed auth attempts per minute

    # Monitor for next 24 hours
    watch -n 60 'curl -s "http://prometheus.internal:9090/api/v1/query?query=rate(auth_failures_total[5m])" | jq ".data.result[0].value"'

    # Keep IP blocklist active for 48 hours
    ```

15. **Post-incident communication**
    ```bash
    # Update status page
    curl -X POST https://statuspage.io/api/v1/pages/$PAGE_ID/incidents \
      -H 'Authorization: OAuth oauth_token='"$STATUSPAGE_TOKEN" \
      -H 'Content-Type: application/json' \
      -d '{
        "incident": {
          "name": "Authentication Spike - Resolved",
          "status": "resolved",
          "impact": "minor",
          "body": "We experienced elevated failed authentication attempts due to credential stuffing attack. Attack has been contained with rate limiting and IP blocking. No customer accounts compromised."
        }
      }'

    # Notify customers via email
    aws sns publish \
      --topic-arn arn:aws:sns:us-east-1:123456789012:customer-alerts \
      --message "Quantum_Shield Security Notice: Auth spike detected and contained. No impact to your accounts."
    ```

---

## Verification Checklist

- [ ] Auth request rate returned to baseline (<100 req/min)
- [ ] Failed attempt rate <1 per minute
- [ ] Rate limiting active and blocking attacks
- [ ] WAF/IP blocks in place (if single source)
- [ ] No legitimate users reporting access issues
- [ ] Locked accounts beginning to unlock automatically
- [ ] No successful unauthorized logins detected
- [ ] Incident ticket documenting attack details

---

## Escalation Path

**Immediate (0-5 mins):** On-Call Security Engineer
- Confirm attack, activate rate limiting
- Block if single source

**10 mins:** Security Lead + Platform Engineering
- Deeper analysis, determine if accounts compromised
- Coordinate user notifications

**30+ mins:** VP Engineering + Legal/Compliance (if user data accessed)
- Assess breach severity
- Prepare regulatory notifications if needed

---

## Post-Incident Checklist

- [ ] Document attack details: timing, IP sources, targeted accounts
- [ ] Analyze whether attack exploited weak passwords
- [ ] Check if any accounts used same password as known breaches
- [ ] Implement mandatory password reset for compromised accounts
- [ ] Audit MFA adoption (can we mandate it?)
- [ ] Review rate limiting thresholds (were they adequate?)
- [ ] Plan for enhanced CAPTCHA or other anti-bot measures
- [ ] Consider IP reputation service integration
- [ ] Schedule security team meeting to discuss
- [ ] Update monitoring alerts for future attacks
- [ ] Document lessons learned in wiki
- [ ] Consider hiring security consultant for penetration testing

---

## Quick Reference Commands

```bash
# Check attack in progress
curl -s 'http://prometheus.internal:9090/api/v1/query?query=rate(auth_failures_total[1m])' | jq '.data.result[0].value'

# Get top attacking IPs
kubectl logs -n production deployment/usbvault-auth --tail=2000 | grep "failed" | awk '{print $NF}' | sort | uniq -c | sort -rn

# Block IP immediately
aws wafv2 create-ip-set --name "block-ips" --scope REGIONAL --ip-address-version IPV4 --addresses "192.0.2.1/32"

# Check locked accounts
psql -h prod-db.internal -U app_user -d usbvault_db -c "SELECT COUNT(*) FROM users WHERE is_locked = true;"

# Unlock all accounts
psql -h prod-db.internal -U app_user -d usbvault_db -c "UPDATE users SET is_locked = false, failed_login_attempts = 0;"

# Enable CAPTCHA
kubectl set env deployment/usbvault-auth ENABLE_CAPTCHA=true -n production

# Monitor real-time
kubectl logs -n production deployment/usbvault-auth -f | grep -i "failed\|error"
```
