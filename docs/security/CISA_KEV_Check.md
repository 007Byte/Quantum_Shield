# CISA Known Exploited Vulnerabilities (KEV) Compliance - USBVault Enterprise

**Audit Date:** 2026-03-12
**Auditor:** Automated + Manual Review
**Scope:** All USBVault Enterprise dependencies (Rust, Go, Node.js)

---

## Overview

The CISA Known Exploited Vulnerabilities (KEV) catalog lists vulnerabilities that are actively exploited in the wild. Organizations must remediate KEV-listed vulnerabilities on an accelerated timeline.

USBVault Enterprise maintains active monitoring for KEV-listed vulnerabilities across all dependency ecosystems.

---

## Monitoring Infrastructure

### Automated Scanning

| Tool | Ecosystem | Frequency | Configuration |
|------|-----------|-----------|---------------|
| `cargo-audit` | Rust (usbvault-crypto) | Every push + weekly | `.github/workflows/security.yml` |
| `govulncheck` | Go (usbvault-server) | Every push | `.github/workflows/ci.yml` |
| `npm audit` | Node.js (usbvault-app) | Every push + weekly | `.github/workflows/security.yml` |
| `check-kev.sh` | All ecosystems | On demand | `scripts/check-kev.sh` |
| `security-audit.sh` | All ecosystems | On demand / CI | `scripts/security-audit.sh` |
| Trivy | Container images | Every push + weekly | `.github/workflows/security.yml` |

### KEV Cross-Reference Script

The `scripts/check-kev.sh` script:
1. Downloads the latest CISA KEV catalog from `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`
2. Caches the catalog locally for 24 hours
3. Extracts CVE IDs from `Cargo.lock`, `go.sum`, and `package-lock.json`
4. Cross-references project CVE IDs against the KEV catalog
5. Exits with error code 1 if any matches are found

**Evidence:** `scripts/check-kev.sh`

---

## Incident Response Process

When a CISA KEV entry affects a USBVault dependency:

### Immediate (within 24 hours)
1. `check-kev.sh` or CI scan identifies the vulnerability
2. Security team receives notification via CI failure / Dependabot alert
3. Assess impact: determine if the vulnerable code path is reachable in USBVault
4. If reachable: begin emergency patch process

### Short-term (within 48 hours)
5. Update the affected dependency to a patched version
6. Run full security audit: `./scripts/security-audit.sh --full`
7. Verify the fix resolves the KEV issue
8. Deploy patched version to staging

### Resolution (within 7 days)
9. Deploy patched version to production
10. Update security audit documents
11. Post-mortem review if the vulnerability was exploitable

---

## Current Dependency Ecosystems

### Rust (usbvault-crypto)
- **Package manager:** Cargo
- **Lock file:** `usbvault-crypto/Cargo.lock`
- **Audit tool:** `cargo-audit` (RustSec Advisory Database)
- **CI integration:** `.github/workflows/security.yml` cargo-audit job

### Go (usbvault-server)
- **Package manager:** Go modules
- **Lock file:** `usbvault-server/go.sum`
- **Audit tool:** `govulncheck` (Go Vulnerability Database)
- **CI integration:** `.github/workflows/ci.yml` govulncheck step

### Node.js (usbvault-app)
- **Package manager:** npm
- **Lock file:** `usbvault-app/package-lock.json`
- **Audit tool:** `npm audit` (npm Advisory Database)
- **CI integration:** `.github/workflows/security.yml` eslint-security job

---

## SBOM for Supply Chain Transparency

Software Bill of Materials (SBOM) is generated automatically:
- **Format:** SPDX JSON + CycloneDX JSON
- **Tool:** Syft (Anchore)
- **Frequency:** Every push and weekly
- **Configuration:** `.github/workflows/security.yml` (sbom-generation job)
- **Retention:** 90 days as CI artifacts

SBOMs enable rapid identification of affected components when new KEV entries are published.

---

## Status: ACTIVE MONITORING

All dependency ecosystems are covered by automated vulnerability scanning in CI. The CISA KEV cross-reference script provides an additional layer of monitoring. The incident response process ensures timely remediation of any KEV-listed vulnerabilities.

| Check | Status |
|-------|--------|
| Rust dependencies monitored | Active |
| Go dependencies monitored | Active |
| Node.js dependencies monitored | Active |
| CISA KEV cross-reference available | Active |
| SBOM generation automated | Active |
| Incident response process documented | Active |
| Container image scanning | Active |
