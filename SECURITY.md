# Quantum Armor Vault (QAV) — Security Policy

<!-- PH11-FIX: Bug bounty program + responsible disclosure -->

## Reporting Security Vulnerabilities

Quantum Armor Vault takes security seriously. We appreciate the security research community's
efforts to responsibly disclose vulnerabilities and help us keep our users safe.

### Responsible Disclosure

If you discover a security vulnerability, please report it responsibly:

1. **Email**: security@qav.io (PGP key available on request)
2. **Response time**: We acknowledge reports within 48 hours
3. **Resolution target**: Critical vulnerabilities within 7 days, high within 14 days
4. **Coordination**: We will coordinate disclosure timelines with you

**Do not** disclose vulnerabilities publicly until we have had an opportunity to
investigate and release a fix.

## Bug Bounty Program

Quantum Armor Vault operates a bug bounty program to incentivize responsible security research.

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

- **Quantum Armor Vault API** (api.qav.io) — authentication, authorization, data handling
- **Quantum Armor Vault Web App** — XSS, CSRF, injection, session management
- **Quantum Armor Vault Mobile Apps** (iOS / Android) — data leakage, insecure storage, cert pinning bypass
- **Quantum Armor Vault Desktop Apps** (macOS / Windows / Linux) — privilege escalation, code signing bypass
- **Cryptographic implementation** — key management, encryption/decryption, nonce reuse
- **WebSocket sync protocol** — authentication bypass, data injection, replay attacks

### Out of Scope

The following are explicitly out of scope:

- Social engineering attacks against Quantum Armor Vault employees
- Physical attacks against Quantum Armor Vault infrastructure
- Denial-of-service (DoS/DDoS) attacks
- Automated scanning without prior coordination
- Reports from automated tools without manual verification
- Issues in third-party dependencies (report upstream instead)
- Self-XSS or attacks requiring unlikely user interaction chains
- Rate limiting or brute force on non-authentication endpoints

## Safe Harbor

Quantum Armor Vault commits to working with security researchers under the following safe harbor terms:

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

| Version | Supported |
|---------|-----------|
| 2.x.x | Yes |
| 1.x.x | Security patches only |
| < 1.0 | No |

## Security Architecture

Quantum Armor Vault (QAV) employs defense-in-depth security:

- **Encryption**: XChaCha20-Poly1305 / AES-256-GCM-SIV with Rust FFI core
- **Key Derivation**: Argon2id (memory-hard, GPU-resistant)
- **Key Exchange**: X25519 ECDH
- **Signing**: Ed25519
- **Transport**: TLS 1.3 with certificate pinning
- **Authentication**: Biometric + MFA with secure token storage
- **Platform Hardening**: Jailbreak/root detection, screenshot prevention, clipboard auto-clear
- **Server**: Non-root containers, WAF, rate limiting, HSTS, CSP
