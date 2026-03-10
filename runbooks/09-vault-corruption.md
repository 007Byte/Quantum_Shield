# Vault Corruption Runbook

**Severity:** SEV1 (Critical - Encryption System Compromised)
**Last Updated:** 2026-03-09
**Component:** Key Vault, Master Encryption Key (MEK), Secrets Storage
**Owner:** Security & Platform Engineering

---

## Overview

This runbook addresses HashiCorp Vault corruption scenarios including failed encryption operations, truncated metadata, and rollback attack detection. RTO target is 15-30 minutes to restore, RPO target is zero data loss.

**Status:** PH5-FIX Implementation Complete (Rollback Protection with State Versioning)

---

## Prerequisites

- HashiCorp Vault admin access
- AWS KMS access (for unsealing)
- Backup restoration capabilities
- Private encryption keys (stored securely)
- Database backup history available
- System administrator access to Vault server
- Audit log review capability
- Key hierarchy documentation
- Security team escalation procedures
- Legal/compliance contact information

---

## Symptoms & Detection

**Symptoms:**
- Vault responds with encryption/decryption errors
- `integrity check failed` errors in logs
- Secrets cannot be retrieved or stored
- Audit logs show unexpected key operations
- Rollback attempt detected (state version mismatch)
- HAProxy unsealing issues
- Storage backend errors (corrupted database)
- Applications cannot decrypt data

**Detection Tools:**
```bash
# Check Vault health
curl -s https://vault.qav.internal/v1/sys/health | jq .

# Check Vault status
vault status

# Review Vault audit logs for anomalies
tail -100 /var/log/vault/audit.log | grep -i "error\|failed\|decryption"

# Check storage backend integrity
vault debug -service-metrics

# Query encryption operations
curl -s -H "X-Vault-Token: $VAULT_TOKEN" \
  https://vault.qav.internal/v1/sys/audit | jq '.audit | keys'

# Check rollback protection state
curl -s -H "X-Vault-Token: $VAULT_TOKEN" \
  https://vault.qav.internal/v1/sys/rekey/verify | jq '.state_version'
```

---

## Corruption Scenarios

### Scenario 1: Failed Encryption Operation
- Symptom: Certain paths cannot be encrypted/decrypted
- Cause: Key corruption, algorithm mismatch
- Recovery: Key rotation, data re-encryption

### Scenario 2: Truncated Metadata
- Symptom: Secrets exist but metadata is corrupted
- Cause: Incomplete write, storage backend error
- Recovery: Restore from backup

### Scenario 3: Rollback Attack Detection (PH5-FIX)
- Symptom: State version mismatch
- Cause: Unauthorized state restoration attempt
- Recovery: Verify legitimate use case, update state

### Scenario 4: Seal Key Compromise
- Symptom: Cannot unseal Vault, seal key potentially exposed
- Cause: Key leak, hardware failure
- Recovery: Re-seal with new key, rotate key material

---

## Step-by-Step Resolution

### Phase 1: Assessment & Containment (2-5 minutes)

1. **Verify Vault is truly corrupted**
   ```bash
   # Check Vault API status
   curl -s https://vault.qav.internal/v1/sys/health | jq .

   # Expected response should not have errors
   # Common responses:
   # - 200: Unsealed and functional
   # - 429: Unsealed but in standby (HA setup)
   # - 503: Sealed (needs unseal)
   # - 5xx: Internal error (corruption likely)

   # Check connectivity to storage backend
   vault debug -service-metrics | grep -i "storage\|database"

   # Attempt simple read/write
   vault kv get secret/test
   vault kv put secret/test value=test 2>&1
   ```

2. **Identify type of corruption**
   ```bash
   # Check audit logs for the error
   tail -50 /var/log/vault/audit.log | jq '.[] | select(.error | length > 0) | {time: .time, error: .error}'

   # Categorize:
   # - "unable to encrypt" → Encryption key issue (Scenario 1)
   # - "corrupted metadata" → Metadata corruption (Scenario 2)
   # - "state version mismatch" → Rollback attempt (Scenario 3, PH5-FIX)
   # - "seal error" → Seal key issue (Scenario 4)
   ```

3. **Assess impact scope**
   ```bash
   # Determine which secrets are affected
   vault list secret/

   # Try reading each path
   for path in $(vault list secret/ 2>/dev/null | grep -v "^---"); do
     vault kv get secret/$path 2>&1 | grep -q "error" && echo "FAILED: secret/$path"
   done

   # Check application dependencies
   kubectl logs -n production deployment/qav-api | grep -i "secret\|decrypt\|vault"
   ```

4. **Declare incident**
   ```bash
   curl -X POST https://events.pagerduty.com/v2/enqueue \
     -H 'Content-Type: application/json' \
     -d '{
       "routing_key": "'"$PD_INTEGRATION_KEY"'",
       "event_action": "trigger",
       "dedup_key": "vault-corruption-'$(date +%s)'",
       "payload": {
         "summary": "CRITICAL: Vault Corruption Detected",
         "severity": "critical",
         "source": "Security Team"
       }
     }'
   ```

5. **Scale down dependent applications immediately**
   ```bash
   # Applications trying to access corrupted Vault will fail/hang
   # Gracefully stop them to avoid cascading failures
   kubectl scale deployment qav-api --replicas=0 -n production
   kubectl scale deployment qav-worker --replicas=0 -n production

   # Notify team
   aws sns publish \
     --topic-arn arn:aws:sns:us-east-1:123456789012:security-critical \
     --message "CRITICAL: Vault corruption detected, scaled down dependent services"
   ```

### Phase 2: Resolution Path Selection

6. **Determine if rollback protection triggered** (PH5-FIX)
   ```bash
   # Check state version
   curl -s -H "X-Vault-Token: $VAULT_TOKEN" \
     https://vault.qav.internal/v1/sys/rekey/verify | jq '.state_version'

   # Compare to known good state version from audit logs
   # If state version jumped backwards: ROLLBACK ATTEMPT DETECTED

   # If rollback detected:
   # 1. This is a SECURITY INCIDENT
   # 2. Do NOT proceed with recovery until verified
   # 3. Contact Security & Legal teams immediately
   # 4. Preserve all logs and state for forensics
   ```

7. **If rollback detected, initiate security response**
   ```bash
   # Preserve all evidence
   mkdir -p /tmp/vault-forensics
   cp -r /var/lib/vault/data /tmp/vault-forensics/
   cp -r /var/log/vault /tmp/vault-forensics/

   # Package and secure
   tar -czf /tmp/vault-forensics-$(date +%Y%m%d-%H%M%S).tar.gz /tmp/vault-forensics/
   aws s3 cp /tmp/vault-forensics-*.tar.gz s3://qav-security-forensics/ --sse AES256

   # Contact security team
   cat > /tmp/security_alert.txt <<'EOF'
   CRITICAL SECURITY ALERT: Vault Rollback Attack Detected

   State version regression indicates unauthorized state restoration attempt.
   This violates encryption system integrity guarantees.

   IMMEDIATE ACTIONS REQUIRED:
   1. Security team forensic analysis
   2. Audit all Vault access logs
   3. Determine if encryption keys compromised
   4. Assessment of potential data exfiltration
   5. Regulatory notification (if required)

   DO NOT restore services until investigation complete.
   EOF

   # Escalate to CISO and Legal
   ```

### Phase 3: Standard Corruption Recovery

8. **Backup current state (before recovery)**
   ```bash
   # Preserve corrupted data for forensics
   vault audit disable file/ || true

   # Backup encrypted database
   pg_dump -h vault-postgres.internal -U vault -d vault > /tmp/vault-db-corrupted.sql

   # Store backup securely
   gpg --trust-model always -r security@qav.com -e /tmp/vault-db-corrupted.sql
   aws s3 cp /tmp/vault-db-corrupted.sql.gpg s3://qav-vault-backups/
   ```

9. **Path A: Restore from known-good backup**
   ```bash
   # Find latest good backup
   ls -lh /var/backups/vault-backup-*.tar.gz | tail -5

   # Verify backup integrity
   tar -tzf /var/backups/vault-backup-20250308.tar.gz > /dev/null
   echo "Backup integrity: OK"

   # Stop Vault (if still running)
   systemctl stop vault

   # Clear corrupted data
   rm -rf /var/lib/vault/data/*

   # Restore from backup
   tar -xzf /var/backups/vault-backup-20250308.tar.gz -C /var/lib/vault/

   # Restore permissions
   chown -R vault:vault /var/lib/vault/

   # Start Vault
   systemctl start vault

   # Unseal Vault
   vault operator unseal $UNSEAL_KEY_1
   vault operator unseal $UNSEAL_KEY_2
   vault operator unseal $UNSEAL_KEY_3
   ```

10. **Path B: Decrypt and re-encrypt (if encryption corrupted)**
    ```bash
    # If only encryption corrupted (data still exists)
    # Re-encrypt with new key

    # Rotate encryption key
    vault write -f transit/keys/qav-encryption-key/rotate

    # This rotates the key material but doesn't decrypt existing data
    # For existing secrets, they're encrypted with old key version

    # If old key is corrupted, we need to:
    # 1. Recover plaintext (from backup)
    # 2. Re-encrypt with new key
    # 3. Store again

    # Alternatively, if using transparent key rotation:
    # Vault will automatically re-encrypt on next write
    ```

11. **Verify no data loss**
    ```bash
    # Compare restored vs corrupted
    vault list secret/ > /tmp/restored-secrets.txt

    # Check critical secrets exist
    vault kv get secret/database/password
    vault kv get secret/api-keys/stripe
    vault kv get secret/encryption/mek

    # Verify encryption operations work
    vault write -f transit/keys/test/rotate
    vault write transit/encrypt/test plaintext=$(echo "test" | base64)

    # Should complete without errors
    ```

12. **Restore key hierarchy consistency** (PH5-FIX)
    ```bash
    # Verify state version is consistent
    curl -s -H "X-Vault-Token: $VAULT_TOKEN" \
      https://vault.qav.internal/v1/sys/rekey/verify | jq '.state_version'

    # Check encryption key versions match audit log
    vault list transit/keys/qav-encryption-key/keys/
    # Should show: 1, 2, 3, ... (sequential)

    # Verify Master Encryption Key (MEK) state
    aws kms describe-key --key-id alias/qav-mek-prod | jq '.KeyMetadata | {CreationDate, LastRotationDate}'
    ```

### Phase 4: Seal Key Recovery (if applicable)

13. **If Seal key is compromised**
    ```bash
    # Current seal status
    vault status | grep -i "seal\|unseal"

    # If Vault is already unsealed (seal key exposed):
    # Must re-seal with new key material

    # Generate new seal key
    vault operator rekey -init \
      -key-shares=5 \
      -key-threshold=3

    # This starts rekey operation
    # Provide unseal keys interactively
    vault operator rekey -nonce=$NONCE -key-shares=5 -key-threshold=3

    # New seal keys will be generated
    # Distribute to key custodians securely

    # After rekey:
    vault operator rekey -cancel  # If need to abort
    ```

14. **Rotate AWS KMS seal key**
    ```bash
    # If using AWS KMS for seal:
    aws kms create-key \
      --description "Vault Seal Key (Emergency Rotation)" \
      --origin AWS_KMS

    # Get new key ARN
    NEW_KEY_ARN=$(aws kms describe-key --key-id alias/vault-seal | jq '.KeyMetadata.Arn')

    # Update Vault config
    cat > /etc/vault/config.hcl <<EOF
    seal "awskms" {
      kms_key_id = "$NEW_KEY_ARN"
      region     = "us-east-1"
    }
    EOF

    # Restart Vault
    systemctl restart vault

    # Unseal with new key
    vault operator unseal
    ```

### Phase 5: Service Recovery

15. **Re-enable dependent services**
    ```bash
    # Verify Vault is fully functional
    vault status | grep -E "Sealed|Version|Storage"

    # Quick sanity check
    vault kv get secret/test

    # Scale applications back up
    kubectl scale deployment qav-api --replicas=3 -n production
    kubectl scale deployment qav-worker --replicas=2 -n production

    # Monitor startup
    kubectl rollout status deployment/qav-api -n production
    ```

16. **Verify encrypted data access works**
    ```bash
    # Test application can read secrets
    kubectl logs -n production -l app=qav-api --tail=50 | grep -i "secret\|vault"

    # Should see successful secret reads, no errors

    # Health check API
    curl -s http://qav-api:8080/health | jq '.status'
    # Should return "healthy"
    ```

### Phase 6: Post-Corruption Analysis

17. **Comprehensive audit of Vault operations**
    ```bash
    # Export complete audit log
    tail -10000 /var/log/vault/audit.log > /tmp/vault-audit-full.json

    # Analyze for suspicious activity
    jq '.[] | select(.error | length > 0)' /tmp/vault-audit-full.json | \
      jq -r '[.time, .request.operation, .request.path, .error] | @csv' > /tmp/vault-errors.csv

    # Check for unauthorized access
    jq '.[] | select(.request.operation == "update" or .request.operation == "delete")' \
      /tmp/vault-audit-full.json | \
      jq '[.auth.client_token[0:8], .request.path, .time]'

    # Share with security team
    aws s3 cp /tmp/vault-audit-full.json s3://qav-vault-backups/forensics/
    ```

18. **Plan preventive measures**
    ```bash
    # Implement Vault HA for redundancy
    # Current: Single Vault instance
    # Target: 3-node HA cluster with Raft storage

    # Schedule Vault upgrade
    # Current: 1.14.0, Target: Latest stable

    # Enable additional audit logs
    vault audit enable file file_path=/var/log/vault/audit-detailed.log

    # Implement read-only replicas
    vault write sys/replication/dr/secondary/enable \
      token=<replication-token>
    ```

---

## Verification Checklist

- [ ] Vault responds to API requests without errors
- [ ] All critical secrets readable: database password, API keys, encryption keys
- [ ] State version consistent and correct (PH5-FIX rollback protection)
- [ ] Encryption operations working: write, read, rotate
- [ ] Applications can access secrets without errors
- [ ] Audit logs showing only legitimate operations
- [ ] No rollback indicators in logs
- [ ] Backup restored correctly (if used)

---

## Escalation Path

**Immediate (0-5 mins):** Security Engineer + DBA
- Assess damage, preserve evidence
- If rollback detected → Go to Level 2 immediately

**5-15 mins:** CISO + VP Engineering
- Determine if data compromise occurred
- Plan customer notification if needed

**15-30 mins:** CEO + Legal Counsel (if rollback or data compromise)
- Regulatory notification planning
- Public incident response

---

## Post-Incident Checklist

- [ ] Complete forensic analysis of audit logs
- [ ] Determine root cause (user error, hardware failure, attack?)
- [ ] Verify no encryption keys compromised
- [ ] Restore Vault backups schedule (daily minimum)
- [ ] Test backup restoration procedure monthly
- [ ] Implement Vault HA for redundancy
- [ ] Plan Vault upgrade to latest version
- [ ] Enable additional monitoring/alerting
- [ ] Review Vault access controls (who can access what?)
- [ ] Implement additional audit logging
- [ ] Conduct security audit of encryption practices
- [ ] Document lessons learned
- [ ] Schedule incident post-mortem

---

## Key Vault Disaster Recovery

```bash
# Automated daily backup
0 2 * * * /usr/local/bin/vault-backup.sh

# Backup script location
# /usr/local/bin/vault-backup.sh should:
# 1. Export all secrets (encrypted)
# 2. Backup Vault database
# 3. Store in S3 with versioning
# 4. Verify backup integrity
# 5. Test recovery procedure monthly
```

---

## Critical Contacts

- CISO: security-lead@qav.com
- Legal: legal@qav.com
- Compliance Officer: compliance@qav.com
- Incident Commander: [on-call rotation]
- Database Administrator: dba@qav.com
