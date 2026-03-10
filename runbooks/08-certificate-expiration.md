# Certificate Expiration Runbook

**Severity:** SEV1 (if already expired), SEV2 (if expiring soon)
**Last Updated:** 2026-03-09
**Component:** TLS Certificates, Certificate Pinning Service
**Owner:** Platform Engineering & Security

---

## Overview

This runbook addresses TLS certificate expiration, renewal, and deployment. Covers both standard certificates and certificate pinning scenarios. RTO target is 5-10 minutes for emergency renewal, RPO target is zero data loss.

**Status:** PH1-FIX Implementation Complete (Certificate Pinning Service)

---

## Prerequisites

- AWS Certificate Manager (ACM) console access
- cert-manager installed in Kubernetes
- Let's Encrypt account and API tokens
- kubectl access to production cluster
- DNS management access (for ACME challenges)
- Private key backup access (HSM or secure storage)
- OpenSSL command-line tool
- Certificate pinning service API access (PH1-FIX)
- Monitoring dashboard for cert expiration
- Customer notification templates

---

## Symptoms & Detection

**Symptoms:**
- Browser shows "Certificate Expired" warning
- HTTPS connections refused with SSL error
- Applications show `x509: certificate has expired` errors
- Mobile apps fail SSL validation
- API clients unable to connect (cert pinning failure)
- Monitoring alerts for certs expiring in <7 days
- Services reporting TLS handshake failures

**Detection Tools:**
```bash
# Check certificate expiration date
openssl s_client -connect api.qav.internal:443 -servername api.qav.internal </dev/null | grep "notAfter"

# Get all certs expiring soon
kubectl get certificate -n production -o json | jq '.items[] | {name: .metadata.name, expiresAt: .status.notAfter}'

# Check cert-manager status
kubectl get certificaterequest -n production

# Query monitoring for near-expiry certs
curl -s 'http://prometheus.internal:9090/api/v1/query?query=ssl_cert_not_after' | jq '.data.result[] | {cert: .metric.cert, expires: .value}'

# Check certificate pinning service
curl -s https://cert-pinning.qav.internal/api/v1/pins | jq '.certs[] | {domain: .domain, pin_hash: .public_key_hash, expires: .expires}'
```

---

## Certificate Types

### Type 1: Standard TLS Certificates
- Domain: api.qav.internal, qav.com
- Issued by: Let's Encrypt (free) or commercial CA
- Renewal: Via cert-manager, typically 90 days (Let's Encrypt)

### Type 2: Internal mTLS Certificates
- Used for service-to-service authentication
- Self-signed or internal CA issued
- Longer validity (1-2 years typical)

### Type 3: Mobile App Certificate Pinning (PH1-FIX)
- Public key hash stored in mobile app
- Renewal requires app update
- Risk: app breaks if cert rotated without notice

---

## Step-by-Step Resolution

### Phase 1: Assessment (2 minutes)

1. **Identify expired or expiring certificates**
   ```bash
   # Get all certs in cluster
   kubectl get certificate -n production -o wide

   # Check specific cert status
   kubectl describe certificate api-tls -n production | grep -A 5 "Conditions"

   # Get expiration dates
   kubectl get secret -n production -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.data.tls\.crt}{"\n"}{end}' | \
     while read name crt; do
       echo "$name: $(echo $crt | base64 -d | openssl x509 -noout -dates)"
     done
   ```

2. **Verify impact scope**
   ```bash
   # Is API actually down?
   curl -v https://api.qav.internal/health 2>&1 | grep -i "certificate\|error\|ssl"

   # Which services are affected?
   kubectl get svc -n production | grep -E "https|tls"

   # Check if certificate pinning involved
   curl -s https://cert-pinning.qav.internal/api/v1/pins | jq '.certs[] | select(.expires < now) | .domain'
   ```

3. **Determine severity**
   ```bash
   # If already expired:
   EXPIRES=$(date -d '2025-01-15' +%s)
   NOW=$(date +%s)
   if [ $NOW -gt $EXPIRES ]; then
     echo "EXPIRED - SEV1 Emergency Response"
   fi

   # If expiring within 7 days:
   DAYS=$((($EXPIRES - $NOW) / 86400))
   if [ $DAYS -le 7 ] && [ $DAYS -gt 0 ]; then
     echo "Expiring in $DAYS days - SEV2 Urgent Response"
   fi
   ```

### Phase 2: Emergency Certificate Deployment

4. **Check if cert-manager can auto-renew**
   ```bash
   # cert-manager should renew 30 days before expiry automatically
   kubectl get certificaterequest -n production | grep -i "pending\|failed"

   # Check cert-manager logs
   kubectl logs -n cert-manager deployment/cert-manager --tail=50 | grep -i "certificate\|error\|renewal"

   # If cert-manager is working, wait for renewal
   # Or trigger manual renewal
   kubectl annotate certificate api-tls -n production \
     cert-manager.io/issue-temporary-certificate=true \
     --overwrite
   ```

5. **Manual certificate renewal via Let's Encrypt**
   ```bash
   # If cert-manager fails, renew manually
   curl -s https://api.certbot.eff.org/v1/certificates \
     -d 'domain=api.qav.internal' \
     -d 'email=admin@qav.com'

   # Or use certbot directly
   certbot renew --cert-name api.qav.internal --force-renewal

   # This requires DNS challenge resolution
   # Ensure DNS TXT records can be created/verified
   ```

6. **Use emergency cert from Let's Encrypt**
   ```bash
   # If ACME challenge fails, request emergency cert
   curl -X POST https://acme-v02.api.letsencrypt.org/acme/new-order \
     -d '{"identifiers":[{"type":"dns","value":"api.qav.internal"}]}' \
     -H "Content-Type: application/jose+json"

   # Monitor challenge status
   # Typically takes 5-10 minutes for DNS propagation
   ```

7. **Deploy new certificate to Kubernetes**
   ```bash
   # Create secret with new certificate
   kubectl create secret tls api-tls-new \
     --cert=/path/to/new/cert.pem \
     --key=/path/to/new/key.pem \
     --dry-run=client \
     -o yaml | kubectl apply -f -

   # Update service/ingress to use new secret
   kubectl patch ingress api-tls -n production -p '{
     "spec":{
       "tls":[{
         "hosts":["api.qav.internal"],
         "secretName":"api-tls-new"
       }]
     }
   }'

   # Or update via kubectl edit
   kubectl edit ingress api-tls -n production
   # Change: secretName: api-tls → secretName: api-tls-new
   ```

8. **Verify certificate deployment**
   ```bash
   # Check cert is now served
   openssl s_client -connect api.qav.internal:443 -servername api.qav.internal </dev/null | \
     openssl x509 -noout -dates

   # Should show: notBefore and notAfter with new dates

   # Test HTTPS connectivity
   curl -v https://api.qav.internal/health 2>&1 | grep -i "ssl\|certificate"
   # Should NOT see certificate error
   ```

### Phase 3: Certificate Pinning Update (if applicable, PH1-FIX)

9. **Update certificate pinning service** (PH1-FIX)
   ```bash
   # Get new certificate's public key hash
   openssl x509 -in /path/to/new/cert.pem -pubkey -noout | \
     openssl pkey -pubin -outform DER | \
     openssl dgst -sha256 -binary | \
     base64

   # Register pin with pinning service
   curl -X POST https://cert-pinning.qav.internal/api/v1/pins \
     -H "Authorization: Bearer $CERT_ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "domain": "api.qav.internal",
       "public_key_hash": "sha256/'"$NEW_PIN_HASH"'",
       "certificate_hash": "sha256/'"$CERT_HASH"'",
       "valid_from": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
       "valid_to": "'$(date -u -d '90 days' +%Y-%m-%dT%H:%M:%SZ)'",
       "primary": true
     }'

   # Keep old pin as backup (set primary: false)
   curl -X POST https://cert-pinning.qav.internal/api/v1/pins \
     -H "Authorization: Bearer $CERT_ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "domain": "api.qav.internal",
       "public_key_hash": "sha256/'"$OLD_PIN_HASH"'",
       "primary": false
     }'
   ```

10. **Notify mobile app team of pin update**
    ```bash
    # Mobile apps may need to be updated if using certificate pinning
    # Send notification to mobile team:
    cat > /tmp/notification.txt <<'EOF'
    Subject: Certificate Pinning Update Required

    The QAV API certificate has been renewed.

    NEW PIN (take effect immediately):
    sha256/[NEW_PIN_HASH]

    BACKUP PIN (still valid for 30 days):
    sha256/[OLD_PIN_HASH]

    ACTION REQUIRED:
    Update mobile app to include the new pin in the next release.
    The backup pin allows for graceful transition period.

    Recommended implementation:
    1. Release v2.5.1 with both pins
    2. After 30 days, release v2.6.0 with old pin removed
    EOF

    # Notify via Slack/email
    ```

### Phase 4: Internal mTLS Certificates

11. **Renew internal service certificates**
    ```bash
    # Check expiration of all internal certs
    for cert in $(find /etc/kubernetes/pki -name "*.crt"); do
      echo "$cert:"
      openssl x509 -in $cert -noout -dates
    done

    # If kubeadm-managed, use kubeadm to renew
    kubeadm certs renew all

    # Verify renewal
    kubeadm certs check-expiration
    ```

12. **Restart services to pick up new certs**
    ```bash
    # Restart control plane components if renewed
    kubectl -n kube-system delete pod -l component=kube-apiserver
    kubectl -n kube-system delete pod -l component=kube-controller-manager
    kubectl -n kube-system delete pod -l component=kube-scheduler

    # These will auto-restart and pick up new certs

    # Verify cluster is still healthy
    kubectl get nodes
    kubectl get pods -n kube-system | grep -E "running|failed"
    ```

### Phase 5: Communication & Monitoring

13. **Notify customers (if applicable)**
    ```bash
    # If customer-facing service affected
    aws sns publish \
      --topic-arn arn:aws:sns:us-east-1:123456789012:customer-alerts \
      --message "QAV API Certificate Renewed - No action required. Service fully operational."

    # Update status page
    curl -X POST https://statuspage.io/api/v1/pages/$PAGE_ID/incidents \
      -H 'Authorization: OAuth oauth_token='"$STATUSPAGE_TOKEN" \
      -H 'Content-Type: application/json' \
      -d '{
        "incident": {
          "name": "Certificate Renewal Completed",
          "status": "resolved",
          "impact": "none",
          "body": "API certificate has been successfully renewed."
        }
      }'
    ```

14. **Setup monitoring alerts for future expirations**
    ```bash
    # Create Prometheus alert rule
    cat > /tmp/cert-alert.yaml <<'EOF'
    groups:
    - name: certificates
      rules:
      - alert: CertificateExpiringSoon
        expr: ssl_cert_not_after - time() < 7 * 24 * 3600
        for: 1h
        annotations:
          summary: "Certificate {{ $labels.cert }} expiring in < 7 days"
      - alert: CertificateExpired
        expr: ssl_cert_not_after - time() < 0
        annotations:
          summary: "Certificate {{ $labels.cert }} EXPIRED!"
    EOF

    kubectl apply -f /tmp/cert-alert.yaml -n monitoring
    ```

15. **Configure cert-manager for automatic renewal**
    ```bash
    # Ensure cert-manager is configured for auto-renewal
    kubectl get certificate -n production -o yaml | grep -A 5 "renewBefore"
    # Should show: renewBefore: 720h (30 days before expiry)

    # If not set:
    kubectl patch certificate api-tls -n production --type='json' -p='[
      {"op": "replace", "path": "/spec/renewBefore", "value": "720h"}
    ]'
    ```

---

## Verification Checklist

- [ ] HTTPS service accepting connections without cert errors
- [ ] `openssl s_client` shows new expiration date
- [ ] API health endpoint returns 200 OK
- [ ] No TLS handshake errors in application logs
- [ ] Certificate pinning service updated (if applicable)
- [ ] Monitoring alerts configured for future expirations
- [ ] cert-manager configured for auto-renewal
- [ ] Customers notified if needed
- [ ] No browser warnings on certificate

---

## Escalation Path

**Immediate (0-5 mins):** On-Call Infrastructure Engineer
- Deploy emergency certificate, verify service

**5-10 mins:** Platform Engineering Lead
- Ensure long-term solution (auto-renewal configuration)
- Plan mobile app updates if needed

**10-30 mins:** VP Engineering (if customer impact)
- Prepare communication
- Coordinate with customer success team

---

## Post-Incident Checklist

- [ ] Verify cert-manager is working and auto-renewing
- [ ] Review certificate monitoring alerts and thresholds
- [ ] Document manual renewal process (in case auto fails)
- [ ] Test certificate renewal in staging environment
- [ ] Review all custom certificates (not managed by cert-manager)
- [ ] Plan for certificate pinning updates in app roadmap
- [ ] Setup calendar reminder for cert audits (monthly)
- [ ] Document which systems need certificate updates
- [ ] Ensure backup CA is available and tested
- [ ] Review disaster recovery procedures for cert loss

---

## Quick Reference

```bash
# Check certificate expiration
openssl s_client -connect api.qav.internal:443 </dev/null | openssl x509 -noout -dates

# Check Kubernetes cert
kubectl get secret api-tls -n production -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -dates

# List all certs in cluster
kubectl get certificate -n production

# Renew specific cert
kubectl annotate certificate api-tls -n production cert-manager.io/issue-temporary-certificate=true --overwrite

# Check cert-manager logs
kubectl logs -n cert-manager deployment/cert-manager -f

# Get certificate details
kubectl describe certificate api-tls -n production

# View ingress TLS config
kubectl get ingress api-tls -n production -o yaml | grep -A 10 "tls:"
```
