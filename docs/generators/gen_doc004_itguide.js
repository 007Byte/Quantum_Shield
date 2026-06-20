/**
 * DOC-004: USBVault Enterprise — IT Deployment Guide v2.0
 * Audience: IT Administrators, Enterprise Deployment Teams
 */

const H = require("./doc_helpers");

async function generate(outDir) {
  console.log("Generating DOC-004: IT Deployment Guide...");

  const children = [
    ...H.coverPage({
      title: "IT Deployment Guide",
      subtitle: "Fortress Enterprise \u2014 Enterprise Infrastructure & Operations",
      docId: "DOC-004", version: "2.0", date: "March 15, 2026",
      classification: "INTERNAL",
      audience: "IT Administrators, Enterprise Deployment Teams",
    }),
    ...H.documentControlPage({
      distribution: [
        ["IT Operations", "Full Access"],
        ["Security & Compliance", "Full Access"],
        ["DevOps Engineering", "Full Access"],
        ["Enterprise Administrators", "Full Access"],
      ],
    }),
    ...H.toc(),

    // 1
    H.h1("1. Overview"),
    H.p("USBVault Enterprise is a portable encrypted file storage system with an optional cloud backend. From IT\u2019s perspective, there are two deployment surfaces: self-contained USB drives (requiring no infrastructure) and the optional cloud backend (enabling sync, sharing, backup, and billing). This guide covers both."),
    H.importantBox("Zero-Knowledge Guarantee:", "The server NEVER handles plaintext data, filenames, or encryption keys. All cryptographic operations execute client-side in a Rust core. Authentication uses SRP-6a (the server never sees passwords). A fully compromised server reveals zero user content."),
    H.pageBreak(),

    // 2
    H.h1("2. Deployment Models"),
    H.p("USBVault supports two deployment models from a single codebase. Organizations can mix both models\u2014some users operating USB-only while others use cloud-connected mode."),
    H.makeTable(
      ["Aspect", "USB-Only (Standalone)", "Cloud-Connected"],
      [
        ["Infrastructure required", "None", "Go server + PostgreSQL + Redis + S3"],
        ["Internet required", "No", "Yes (for cloud features)"],
        ["Authentication", "Vault password only", "SRP-6a + JWT + optional FIDO2"],
        ["Multi-device sync", "No", "Yes (WebSocket + CRDT)"],
        ["Vault sharing", "No", "Yes (PQC-sealed MEK)"],
        ["Cloud backup", "No", "Yes (encrypted blobs in S3)"],
        ["Billing", "N/A", "Stripe integration"],
        ["Best for", "Air-gapped, field ops, max security", "Teams, sync, sharing, backup"],
        ["Admin rights needed", "Only for initial provisioning", "Only for initial provisioning"],
      ],
      [2000, 3680, 3680]
    ),
    H.caption("Table 2.1 \u2014 Deployment Model Comparison"),
    H.pageBreak(),

    // 3
    H.h1("3. USB-Only Deployment"),
    H.p("In USB-only mode, each USB drive\u2019s TOOLS partition (500 MB, visible to the OS) contains everything needed to operate: platform-specific launchers, a portable Node.js runtime, the companion service, and the static web application. No server, no internet, and no admin rights for daily use."),
    H.h2("3.1 What\u2019s on the TOOLS Partition"),
    H.makeTable(
      ["Component", "Size", "Purpose"],
      [
        ["Platform launchers", "~1 MB", "Windows (.exe), macOS (.app), Linux (.sh) launchers"],
        ["Portable Node.js", "~40 MB", "Self-contained Node.js runtime (no system install needed)"],
        ["Companion service", "~5 MB", "Express server for USB bridge operations"],
        ["Static web app", "~15 MB", "Bundled React app served by companion"],
        ["README + Recovery guide", "~100 KB", "User-facing documentation"],
      ],
      [2200, 1200, 5960]
    ),
    H.caption("Table 3.1 \u2014 TOOLS Partition Contents"),
    H.spacer(80),
    H.h2("3.2 System Requirements"),
    H.bullet("Port 3001 must be available on the host (companion binds to 127.0.0.1:3001)"),
    H.bullet("Browser: Chrome, Firefox, Safari, or Edge (latest 2 versions)"),
    H.bullet("No admin rights required for daily use"),
    H.bullet("Admin rights required once for initial USB provisioning (partition creation)"),
    H.pageBreak(),

    // 4
    H.h1("4. Cloud-Connected Deployment"),
    H.h2("4.1 Environment Variables"),
    H.p("The Go server requires the following environment variables. All secrets should be provided via Kubernetes Secrets or a secrets manager\u2014never hardcoded or committed to version control."),
    H.makeStatusTable(
      ["Variable", "Required", "Description", "Example"],
      [
        ["DATABASE_URL", "Yes", "PostgreSQL connection string", "postgres://user:pass@host:5432/usbvault?sslmode=require"],
        ["REDIS_URL", "Yes", "Redis connection string", "redis://:password@host:6379/0"],
        ["AWS_ACCESS_KEY_ID", "Yes", "S3 IAM access key", "(from AWS IAM)"],
        ["AWS_SECRET_ACCESS_KEY", "Yes", "S3 IAM secret key", "(from AWS IAM)"],
        ["S3_BUCKET", "Yes", "S3 bucket for encrypted blobs", "usbvault-prod-blobs"],
        ["S3_REGION", "Yes", "AWS region for S3 bucket", "us-east-1"],
        ["JWT_SECRET", "Yes", "JWT signing secret (min 256 bits)", "(generate with openssl rand -base64 32)"],
        ["STRIPE_SECRET_KEY", "Yes", "Stripe API secret key", "sk_live_..."],
        ["STRIPE_WEBHOOK_SECRET", "Yes", "Stripe webhook signing secret", "whsec_..."],
        ["SENTRY_DSN", "No", "Sentry error tracking DSN", "https://...@sentry.io/..."],
        ["PORT", "No", "Server listen port (default 8080)", "8080"],
        ["LOG_LEVEL", "No", "Logging verbosity (default info)", "info | debug | warn | error"],
      ],
      [2400, 800, 2800, 3360],
      1
    ),
    H.caption("Table 4.1 \u2014 Server Environment Variables"),
    H.pageBreak(),

    // 5
    H.h1("5. Kubernetes Deployment"),
    H.p("The recommended production deployment uses Kubernetes with the following configuration:"),
    H.makeTable(
      ["Resource", "Configuration"],
      [
        ["Replicas", "Minimum 3, maximum 10 via HPA"],
        ["HPA target", "CPU utilization at 70%"],
        ["Liveness probe", "GET /api/v1/health (initial delay 10s, period 30s, timeout 5s)"],
        ["Readiness probe", "GET /api/v1/health (initial delay 5s, period 10s, timeout 3s)"],
        ["Secrets", "Kubernetes Secrets for database, Redis, S3, JWT, Stripe credentials"],
        ["Database migration", "batch/v1 Job with go-migrate (runs before deployment rollout)"],
        ["Ingress", "HTTPS with TLS 1.2+ termination; WebSocket upgrade for /api/v1/sync"],
        ["Resource requests", "CPU 500m / Memory 256Mi"],
        ["Resource limits", "CPU 1000m / Memory 512Mi"],
        ["Rolling update", "maxSurge: 1, maxUnavailable: 0 (zero-downtime deploys)"],
      ],
      [2400, 6960]
    ),
    H.caption("Table 5.1 \u2014 Kubernetes Configuration"),
    H.pageBreak(),

    // 6
    H.h1("6. Docker Deployment"),
    H.p("For development and smaller deployments, docker-compose provides the full stack:"),
    H.makeTable(
      ["Service", "Image", "Purpose"],
      [
        ["usbvault-server", "Custom (multi-stage Alpine build)", "Go API server, non-root user"],
        ["postgres", "postgres:16-alpine", "Primary data store"],
        ["redis", "redis:7-alpine", "Sessions, rate limiting, SRP state"],
      ],
      [2200, 3200, 3960]
    ),
    H.p("The server Docker image uses a multi-stage build: Go build stage compiles a statically linked binary with symbols stripped, and the runtime stage copies only the binary into a minimal Alpine image running as a non-root user."),
    H.pageBreak(),

    // 7
    H.h1("7. Network Requirements"),
    H.makeTable(
      ["Service", "Bind Address", "Port", "Protocol", "Access"],
      [
        ["Companion", "127.0.0.1 (localhost only)", "3001", "HTTP", "Local machine only"],
        ["Server API", "0.0.0.0", "8080", "HTTPS + WebSocket", "Internet-facing (via ingress)"],
        ["PostgreSQL", "Internal", "5432", "TCP + TLS", "Server pods only"],
        ["Redis", "Internal", "6379", "TCP", "Server pods only"],
        ["S3", "AWS endpoint", "443", "HTTPS", "Server pods only"],
      ],
      [1400, 2200, 800, 1800, 3160]
    ),
    H.caption("Table 7.1 \u2014 Network Requirements"),
    H.note("The companion service NEVER binds to 0.0.0.0. It is strictly localhost. This is enforced in the code and cannot be overridden by configuration."),
    H.pageBreak(),

    // 8
    H.h1("8. Security Configuration"),
    H.h2("8.1 CORS"),
    H.p("The companion whitelists only configured frontend origins (localhost variants). The server whitelists the production frontend domain. Both reject cross-origin requests from unlisted origins."),
    H.h2("8.2 Rate Limiting"),
    H.makeTable(
      ["Scope", "Limit", "Notes"],
      [
        ["Companion (general)", "60 requests/min", "Per client (always localhost)"],
        ["Companion (destructive)", "5 requests/min", "Provision, reset, compact operations"],
        ["Server (auth)", "Configurable (recommended: 10/min)", "Per IP address"],
        ["Server (API)", "Configurable per subscription tier", "Per authenticated user"],
      ],
      [2400, 2800, 4160]
    ),
    H.h2("8.3 JWT Configuration"),
    H.bullet("Signing algorithm: HS256 or RS256 (configurable)"),
    H.bullet("Secret: minimum 256 bits (32 bytes of randomness)"),
    H.bullet("Access token lifetime: 1 hour"),
    H.bullet("Refresh token lifetime: 7 days"),
    H.bullet("Token rotation: refresh tokens are single-use (rotated on each refresh)"),
    H.h2("8.4 TLS"),
    H.p("TLS 1.2 or higher is required for all server communications. Certificate management should use cert-manager on Kubernetes with Let\u2019s Encrypt or your organization\u2019s internal CA."),
    H.pageBreak(),

    // 9
    H.h1("9. Monitoring Setup"),
    H.h2("9.1 Prometheus Metrics"),
    H.p("The server exposes a /metrics endpoint for Prometheus scraping. Key metrics include HTTP request rates, latencies (p50/p95/p99), error rates, database connection pool utilization, S3 operation counts, and authentication success/failure rates."),
    H.h2("9.2 Grafana Dashboards"),
    H.p("Import the provided Grafana dashboard JSON files for pre-built visualizations covering API health, authentication patterns, billing events, sync performance, and infrastructure health."),
    H.h2("9.3 Alerting Rules"),
    H.makeTable(
      ["Alert", "Condition", "Severity"],
      [
        ["High error rate", "> 5% 5xx responses over 5 minutes", "Critical"],
        ["Auth failure spike", "> 100 failed auth attempts per minute", "Critical"],
        ["DB pool exhaustion", "Connection utilization > 90%", "Critical"],
        ["S3 upload failures", "> 3 consecutive failures", "Warning"],
        ["Certificate expiry", "< 14 days until expiry", "Warning"],
        ["Pod restarts", "> 3 in 10 minutes", "Critical"],
        ["Disk usage", "> 80% on PostgreSQL volume", "Warning"],
      ],
      [2400, 3400, 3560]
    ),
    H.caption("Table 9.3 \u2014 Recommended Alerting Rules"),
    H.pageBreak(),

    // 10
    H.h1("10. Backup & Recovery"),
    H.h2("10.1 Database Backups"),
    H.bullet("Daily: pg_dump full backup with 30-day retention"),
    H.bullet("Continuous: WAL archiving for point-in-time recovery"),
    H.bullet("Test restore: monthly restoration test to verify backup integrity"),
    H.h2("10.2 S3 Data"),
    H.bullet("Cross-region replication enabled for disaster recovery"),
    H.bullet("Versioning enabled on S3 bucket for accidental deletion protection"),
    H.h2("10.3 Vault Recovery"),
    H.importantBox("Critical:", "Recovery phrases are client-side only. IT cannot recover individual user vaults. This is a fundamental security property of the zero-knowledge architecture. Ensure users understand the importance of their recovery phrases during onboarding."),
    H.pageBreak(),

    // 11
    H.h1("11. Compliance"),
    H.makeTable(
      ["Standard", "Requirement", "USBVault Implementation"],
      [
        ["NIST SP 800-63B", "Minimum 8-character passwords", "Exceeds: 15-character minimum with entropy scoring"],
        ["FIPS 140-3", "Approved cryptographic algorithms", "AES-256-GCM-SIV option (cipher_id 3)"],
        ["GDPR", "Data protection and privacy", "Zero-knowledge: server stores no personal file data"],
        ["SOC 2 Type II", "Security controls and audit trail", "Comprehensive audit logging; access controls"],
        ["HIPAA", "Protected health information security", "Encryption at rest and in transit; access logging"],
      ],
      [1800, 2800, 4760]
    ),
    H.caption("Table 11.1 \u2014 Compliance Coverage"),
    H.pageBreak(),

    // 12
    H.h1("12. Bulk USB Provisioning"),
    H.p("For large enterprise deployments, IT teams can create a master TOOLS partition image and flash it to multiple USB drives simultaneously."),
    H.h2("12.1 Process"),
    H.numbered("Provision a reference USB drive through the normal USBVault setup.", "numbers"),
    H.numbered("Create a disk image of the TOOLS partition (dd on Linux/macOS, or disk imaging software on Windows).", "numbers"),
    H.numbered("Write the image to each target USB drive using dd, Rufus, or Balena Etcher.", "numbers"),
    H.numbered("Each user sets their own vault password on first use\u2014the SECURE partition and VAULT.bin header are created fresh per user.", "numbers"),
    H.note("Never pre-create vaults with shared passwords. Each user must create their own vault with their own password and recovery phrase."),
    H.pageBreak(),

    // 13
    H.h1("13. Troubleshooting"),
    H.h2("13.1 Companion Won\u2019t Start"),
    H.bullet("Port 3001 in use: check for orphaned Node.js processes (Task Manager on Windows, lsof -i :3001 on Unix)"),
    H.bullet("Permission denied: chmod +x the launcher script (Linux/macOS)"),
    H.bullet("macOS Gatekeeper: right-click \u2192 Open to bypass first-launch security prompt"),
    H.h2("13.2 USB Not Detected"),
    H.bullet("Try a different USB port (prefer USB 3.0+ ports)"),
    H.bullet("Check OS disk management (Disk Utility, Disk Management, lsblk) for drive recognition"),
    H.bullet("Verify user is in the appropriate groups (Linux: plugdev, disk)"),
    H.h2("13.3 Permission Errors"),
    H.bullet("Windows: right-click launcher \u2192 Run as Administrator"),
    H.bullet("macOS: system will prompt for sudo when needed"),
    H.bullet("Linux: configure udev rules for USB device access, or add user to plugdev group"),
    H.h2("13.4 Server Issues"),
    H.bullet("Check Kubernetes pod logs: kubectl logs -f deployment/usbvault-server"),
    H.bullet("Verify database connectivity: check DATABASE_URL and network policies"),
    H.bullet("Check Redis connectivity: verify REDIS_URL and authentication"),
    H.bullet("Review Sentry for error reports and stack traces"),

    H.spacer(400),
    H.p([H.italic("End of Document \u2014 USBVault Enterprise IT Deployment Guide v2.0 \u2014 March 15, 2026")], { alignment: H.AlignmentType.CENTER }),
  ];

  await H.buildDoc({
    filename: "USBVault_Enterprise_IT_Deployment_Guide.docx",
    headerTitle: "USBVault Enterprise \u2014 IT Deployment Guide",
    headerClassification: "INTERNAL",
    footerDocId: "DOC-004", footerVersion: "2.0", children, outDir,
  });
}

module.exports = { generate };
