# USBVault — Security Policy

## Reporting Security Vulnerabilities

USBVault takes security seriously. We appreciate the security research community's
efforts to responsibly disclose vulnerabilities and help us keep our users safe.

### Machine-Readable Security Policy (RFC 9116)

USBVault publishes a `security.txt` file in accordance with [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116) at:

```
https://usbvault.io/.well-known/security.txt
```

This file provides a standardized, machine-readable way for security researchers to find
our vulnerability disclosure contact information. The file is also served at the
`/.well-known/security.txt` path on all USBVault server instances.

### Responsible Disclosure

If you discover a security vulnerability, please report it responsibly:

1. **Email**: security@usbvault.io (PGP key available at https://usbvault.io/.well-known/pgp-key.txt)
2. **Response time**: We acknowledge reports within 48 hours
3. **Resolution target**: Critical vulnerabilities within 7 days, high within 14 days
4. **Coordination**: We will coordinate disclosure timelines with you

**Do not** disclose vulnerabilities publicly until we have had an opportunity to
investigate and release a fix.

### Vulnerability Disclosure Timeline

USBVault follows a structured disclosure timeline to ensure vulnerabilities are handled
promptly and transparently:

| Phase | Timeframe | Description |
|-------|-----------|-------------|
| **Acknowledgment** | 48 hours | Initial acknowledgment of the report with a tracking ID |
| **Triage** | 5 business days | Assessment of severity, impact, and affected components |
| **Remediation** | 7 days (Critical), 14 days (High), 30 days (Medium), 90 days (Low) | Development and testing of a fix |
| **Notification** | Prior to public release | Reporter is notified of the fix and given the opportunity to verify |
| **Public Disclosure** | 90 days from report (or upon fix release, whichever is sooner) | Coordinated public disclosure with credit to the reporter |

If we are unable to meet these timelines, we will communicate delays to the reporter and
negotiate a mutually acceptable disclosure date.

## Bug Bounty Program

USBVault operates a bug bounty program to incentivize responsible security research.

### Reward Tiers

| Severity | CVSS Score | Reward Range |
|----------|-----------|-------------|
| Critical | 9.0–10.0 | $5,000–$15,000 |
| High | 7.0–8.9 | $2,000–$5,000 |
| Medium | 4.0–6.9 | $500–$2,000 |
| Low | 0.1–3.9 | $100–$500 |

Rewards are determined based on severity, impact, and quality of the report.
Exceptional reports with proof-of-concept exploits may receive higher rewards.

### In Scope

The following assets are in scope for the bug bounty program:

- **USBVault API** (api.usbvault.io) — authentication, authorization, data handling
- **USBVault Web App** — XSS, CSRF, injection, session management
- **USBVault Mobile Apps** (iOS / Android) — data leakage, insecure storage, cert pinning bypass
- **USBVault Desktop Apps** (macOS / Windows / Linux) — privilege escalation, code signing bypass
- **Cryptographic implementation** — key management, encryption/decryption, nonce reuse
- **WebSocket sync protocol** — authentication bypass, data injection, replay attacks

### Out of Scope

The following are explicitly out of scope:

- Social engineering attacks against USBVault employees
- Physical attacks against USBVault infrastructure
- Denial-of-service (DoS/DDoS) attacks
- Automated scanning without prior coordination
- Reports from automated tools without manual verification
- Issues in third-party dependencies (report upstream instead)
- Self-XSS or attacks requiring unlikely user interaction chains
- Rate limiting or brute force on non-authentication endpoints

## Safe Harbor

USBVault commits to working with security researchers under the following safe harbor terms:

- We will not pursue legal action against researchers who follow this policy
- We will not report researchers to law enforcement for good-faith research
- If legal action is initiated by a third party, we will take steps to make it known
  that your actions were conducted in compliance with this policy
- We consider security research conducted under this policy to be authorized
- We waive any CFAA claims for research conducted under this policy

### Researcher Obligations

To qualify for safe harbor and bounty rewards:

- Make a good-faith effort to avoid privacy violations, data destruction, and service disruption
- Only interact with accounts you own or have explicit permission to test
- Do not exfiltrate data beyond what is needed to demonstrate the vulnerability
- Stop testing and report immediately upon discovering sensitive user data
- Provide sufficient detail for us to reproduce and fix the vulnerability

## Supported Versions

USBVault is **pre-release**. Every component is currently at `0.1.0` and there is no
`1.0` or later release. Security reports against the current `0.x` development line are
in scope and welcome.

| Version | Supported |
|---------|-----------|
| 0.1.x (current development) | Yes — actively supported |
| < 0.1.0 | No |

> There are no `1.x`/`2.x` releases yet. Once a stable `1.0` ships, this table will be
> updated with the corresponding support policy.

## Security Architecture

USBVault is a **zero-knowledge** system: all cryptography runs **client-side**, and the
backend stores only ciphertext and wrapped keys — it never sees your password, keys, or
plaintext. Key exchange and sharing use **hybrid post-quantum** encryption combining
**X25519** (classical ECDH) with **ML-KEM-1024** (FIPS 203, post-quantum KEM), so shared
data remains confidential even against a future quantum adversary.

USBVault employs defense-in-depth security:

- **Encryption**: XChaCha20-Poly1305 / AES-256-GCM-SIV with Rust FFI core
- **Post-Quantum Key Exchange**: hybrid X25519 + ML-KEM-1024 (FIPS 203)
- **Key Derivation**: Argon2id (memory-hard, GPU-resistant)
- **Key Exchange**: X25519 ECDH
- **Signing**: Ed25519
- **Transport**: TLS 1.3 with certificate pinning
- **Authentication**: Biometric + MFA with secure token storage
- **Platform Hardening**: Jailbreak/root detection, screenshot prevention, clipboard auto-clear
- **Server**: Non-root containers, WAF, rate limiting, HSTS, CSP
