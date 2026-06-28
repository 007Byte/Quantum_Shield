# KEK Escrow Trust Model for OIDC Users

## Overview

USBVault supports two authentication methods: **SRP-6a** (zero-knowledge) and
**OIDC** (SSO). This document describes the cryptographic trust boundaries,
threat model, and the planned KEK-escrow / HSM upgrade path for OIDC.

> **⚠️ Current implementation status.** Server-side KEK **escrow is NOT
> implemented — it is a PLANNED feature.** No code path encrypts or stores a user's
> KEK with a server-held key, and `OIDC_KEK_ENCRYPTION_KEY` is **optional** (an unused
> placeholder reserved for the future rollout — `usbvault-server/internal/oidc/config.go`
> loads it but nothing consumes it). **Today, OIDC users rely on Hybrid mode and the
> server CANNOT decrypt any user's vault** — the zero-knowledge property described below
> holds for OIDC users as well as SRP users. The "server-escrowed KEK" model in the rest
> of this document describes the *future, opt-in* design, NOT current behavior. If/when
> escrow ships it will be an explicit, separately-gated enterprise option backed by the
> HSM path below.

---

## Trust Model Comparison

### SRP-6a (Zero-Knowledge)

In the SRP-6a flow, the user's password **never leaves the device**. The
client-side Rust crypto library (`usbvault-crypto/src/kdf.rs`) derives
a 32-byte Key Encryption Key (KEK) from the password using Argon2id
(64 MB memory, 3 iterations, 4 parallelism lanes, 32-byte salt). The KEK
wraps a randomly generated 64-byte Master Encryption Key (MEK) using
XChaCha20-Poly1305 (24-byte nonce + 64-byte ciphertext + 16-byte tag =
104 bytes). The wrapped MEK blob and the Argon2id salt are stored
server-side in the `vaults` table (`wrapped_mek`, `kek_salt` columns) via
`POST /api/v1/vaults/{vaultID}/key-hierarchy`
(see `usbvault-server/internal/vault/key_hierarchy.go`).

**Critical property**: The server stores only the wrapped MEK and the salt.
It never receives the password, the KEK, or the unwrapped MEK. A full
database compromise yields ciphertext that cannot be decrypted without
brute-forcing the user's password through Argon2id -- a computationally
prohibitive operation with the chosen parameters.

SRP-6a authentication itself uses a verifier derived via Argon2id with
domain-separated context (`"srp-verifier" || salt || identity`), ensuring
the SRP verifier cannot be used to recover the vault KEK even if both
share the same password.

### OIDC (Server-Escrowed KEK)

OIDC provides identity verification (via ID tokens from providers like
Okta, Azure AD, or Google Workspace) but does **not** provide a
user-memorized secret suitable for key derivation. Without a password,
the KEK cannot be derived client-side. Instead, USBVault generates the
KEK master secret randomly and encrypts it with a server-held key before
storing it in the database.

**This means the server can, in principle, decrypt vault contents for
OIDC-only users.** This is the fundamental trust trade-off of OIDC
without a secondary vault password.

The escrow mechanism works as follows:

1. On first OIDC login, the server generates a random 32-byte KEK master
   secret and a random 32-byte escrow salt.
2. A wrap key is derived:
   `HKDF-SHA256(ikm=OIDC_KEK_ENCRYPTION_KEY, salt=user_id || kek_escrow_salt, info="oidc_kek_wrap")`
3. The KEK master secret is encrypted:
   `AES-256-GCM(key=wrap_key, nonce=random_12, plaintext=kek_master_secret)`
4. The ciphertext is stored in `users.wrapped_kek_escrow` (BYTEA) and the
   salt in `users.kek_escrow_salt` (BYTEA), as defined in migration
   `014_oidc_providers.sql`.
5. The user's `auth_method` column is set to `'oidc'`.

On subsequent logins, the server retrieves the wrapped escrow, re-derives
the wrap key using the same HKDF parameters, decrypts the KEK, and
provides it to the client over TLS for the duration of the session.

---

## Cryptographic Details

### Key Derivation Chain (SRP-6a)

```
User Password
  │
  ├──[Argon2id(64MB, t=3, p=4, salt=kek_salt)]──► KEK (32 bytes)
  │                                                   │
  │                                    [XChaCha20-Poly1305 wrap]
  │                                                   │
  │                                                   ▼
  │                                          Wrapped MEK (104 bytes)
  │                                          Stored: vaults.wrapped_mek
  │
  └──[Argon2id(domain="srp-verifier")]──► SRP Verifier
                                          Stored: users.srp_verifier
```

### Key Derivation Chain (OIDC Escrow)

```
OIDC_KEK_ENCRYPTION_KEY (32 bytes, env var, base64-encoded)
  │
  ├──[HKDF-SHA256(salt=user_id||kek_escrow_salt, info="oidc_kek_wrap")]
  │                                                   │
  │                                                   ▼
  │                                          Per-User Wrap Key (32 bytes)
  │                                                   │
  │                                    [AES-256-GCM encrypt]
  │                                                   │
  │                                                   ▼
  │                                    Wrapped KEK Escrow (nonce||ct||tag)
  │                                    Stored: users.wrapped_kek_escrow
  │
  Random KEK Master Secret (32 bytes)
  │
  ├──[XChaCha20-Poly1305 wrap]──► Wrapped MEK (104 bytes)
  │                                Stored: vaults.wrapped_mek
  │
  Random MEK (64 bytes: 32 enc + 32 HMAC)
  │
  ├──[HKDF(info="file_encryption:{file_id}")]──► Per-File Key
  ├──[HKDF(info="vault_index_encryption")]──► Index Key
  └──[HKDF(info="stream_chunk_key:"||nonce)]──► Streaming Chunk Key
```

### Encryption Algorithms by Layer

| Layer | SRP Path | OIDC Escrow Path |
|-------|----------|------------------|
| KEK derivation | Argon2id (client-side) | CSPRNG (server-side) |
| KEK storage | Not stored (derived on demand) | AES-256-GCM wrapped in `users.wrapped_kek_escrow` |
| MEK wrapping | XChaCha20-Poly1305 | XChaCha20-Poly1305 (identical) |
| File encryption | XChaCha20-Poly1305 via HKDF-derived keys | Same |
| Index encryption | XChaCha20-Poly1305 | Same |

---

## Threat Matrix

| Threat | SRP-6a Impact | OIDC Escrow Impact | Mitigation |
|--------|--------------|-------------------|------------|
| **Database breach** (attacker gets full DB dump) | No impact. Wrapped MEK cannot be decrypted without user password + Argon2id. | Attacker has `wrapped_kek_escrow` but not `OIDC_KEK_ENCRYPTION_KEY`. Cannot decrypt. | Encrypt DB at rest. Rotate `OIDC_KEK_ENCRYPTION_KEY` periodically. |
| **Server memory compromise** (attacker reads process memory) | No impact. KEK exists only on client device. | **Critical.** `OIDC_KEK_ENCRYPTION_KEY` is in server memory. Attacker can derive all per-user wrap keys and decrypt all OIDC escrows. | HSM upgrade (Phase 2) removes key from memory. |
| **`OIDC_KEK_ENCRYPTION_KEY` leak** (env var exposed) | No impact. SRP users have no escrow. | **Critical.** Combined with DB access, attacker can decrypt all OIDC users' vaults. | Store in HSM or secrets manager with audit logging. Rotate immediately on suspected exposure. |
| **Database breach + key leak** (both compromised) | No impact. | **Full compromise.** Attacker can decrypt every OIDC user's vault contents. | Defense in depth: HSM, network segmentation, DB encryption, key rotation. |
| **Admin insider threat** | Cannot decrypt. Admin has DB access but not user passwords. | **Can decrypt** if admin also has access to `OIDC_KEK_ENCRYPTION_KEY` (e.g., via env vars or secrets manager). | Separation of duties: DB admins should not have access to encryption key infrastructure. HSM with dual-control key ceremony. |
| **OIDC provider compromise** (attacker gets valid ID tokens) | No impact (SRP users don't use OIDC). | Attacker can authenticate as user and receive decrypted KEK from server. Equivalent to account takeover. | Enforce MFA at OIDC provider. Bind sessions to device attestation. Monitor for anomalous OIDC logins. |
| **TLS interception** (MITM on client-server) | SRP-6a is resistant to MITM (verifier-based). KEK never transits network. | Attacker could intercept decrypted KEK in transit from server to client. | Certificate pinning (`usbvault-app/src/services/certificatePinning.ts`). HSTS. |

---

## Competitor Comparison

| Product | OIDC/SSO Trust Model | KEK Escrow? |
|---------|---------------------|-------------|
| **1Password** | Secret Key + master password required even with SSO. Zero-knowledge maintained. | No escrow. Lost password = lost data. |
| **Bitwarden** | SSO with "Key Connector" (org-hosted key server). Similar escrow model. | Yes, org-managed. |
| **USBVault (SRP)** | Zero-knowledge. Password required for key derivation. | No escrow. |
| **USBVault (OIDC-only)** | Server-escrowed KEK. Convenience trade-off. | Yes, server-managed. |
| **USBVault (Hybrid, recommended)** | OIDC for identity + vault password for KEK. Zero-knowledge preserved. | No escrow. |

---

## HSM Upgrade Path (Phase 2)

### Goal

Move `OIDC_KEK_ENCRYPTION_KEY` from a software environment variable to a
hardware security module (HSM), ensuring the master wrapping key **never
exists in server memory** in plaintext.

### Architecture

```
Current (Phase 1):                    Target (Phase 2):
┌────────────────┐                    ┌────────────────┐
│ Server Process │                    │ Server Process │
│                │                    │                │
│ KEK_ENC_KEY    │                    │  (no key)      │
│ in memory      │                    │                │
│ ┌────────────┐ │                    │ ┌────────────┐ │
│ │ HKDF + GCM │ │                    │ │ PKCS#11    │ │
│ │ (software) │ │                    │ │ API call   │ │
│ └────────────┘ │                    │ └─────┬──────┘ │
└────────────────┘                    └───────┼────────┘
                                              │ mTLS
                                     ┌────────▼────────┐
                                     │ HSM Cluster     │
                                     │                 │
                                     │ KEK_ENC_KEY     │
                                     │ (non-exportable)│
                                     │ AES-256 wrap    │
                                     └─────────────────┘
```

### Supported HSM Backends

| Provider | Service | PKCS#11 | FIPS 140-2 Level | Approx. Cost |
|----------|---------|---------|------------------|-------------|
| AWS | CloudHSM | Yes (via SDK) | Level 3 | ~$1.50/hr per HSM |
| Azure | Dedicated HSM / Managed HSM | Yes | Level 3 | ~$4.28/hr (Dedicated) |
| Google | Cloud HSM (via Cloud KMS) | Via KMS API | Level 3 | ~$1.00/key version/mo |
| On-prem | Thales Luna / Entrust nShield | Native PKCS#11 | Level 3 | CapEx varies |

### Envelope Encryption with HSM

The HSM performs only the outer wrapping layer. The per-user HKDF
derivation is replaced by an HSM `WrapKey` operation:

1. Server sends `(user_id, kek_escrow_salt, plaintext_kek)` to HSM.
2. HSM derives a per-user wrapping key internally using its
   non-exportable master key and the provided context.
3. HSM returns `wrapped_kek_escrow` (AES-256-KWP or AES-256-GCM,
   depending on HSM capabilities).
4. Server stores the wrapped blob in `users.wrapped_kek_escrow` as before.

On unwrap, the server sends the wrapped blob and context to the HSM; the
HSM returns only the plaintext KEK. The master wrapping key never leaves
the HSM boundary.

### Migration Strategy (Software to HSM)

Migration does **not** require re-encrypting existing vaults:

1. Deploy HSM and generate new master wrapping key inside HSM.
2. For each OIDC user: decrypt `wrapped_kek_escrow` with old software key,
   re-wrap with HSM, update `users.wrapped_kek_escrow`.
3. Add `kek_escrow_version` column to `users` table to track which
   wrapping method was used (1 = software AES-256-GCM, 2 = HSM-backed).
4. Run migration as a background job with progress tracking.
5. After all users are migrated, revoke and destroy the software key.
6. Vault contents (wrapped MEKs, encrypted files) are untouched -- only
   the outermost escrow wrapping layer changes.

### Operational Requirements

- HSM cluster must be deployed in at least 2 availability zones.
- Key ceremony requires dual-control (two authorized personnel).
- HSM audit logs must be shipped to SIEM (CloudTrail for AWS, Activity
  Log for Azure).
- Backup the HSM key to a separate HSM or secure offline backup per
  vendor-specific procedure. Loss of the HSM key = loss of all OIDC
  users' vault access.

---

## Hybrid Mode (Recommended for Enterprise)

The recommended enterprise configuration combines OIDC identity
verification with a separate vault password for key derivation:

```
OIDC Provider (Okta, Azure AD, etc.)
  │
  └──► Identity verification: "This is user alice@corp.com"
       │
       ▼
Vault Password (entered separately after SSO)
  │
  └──[Argon2id]──► KEK (32 bytes, client-side only)
                    │
                    └──[XChaCha20-Poly1305 wrap]──► Wrapped MEK
```

In this mode:
- `users.auth_method` = `'hybrid'` (extending the existing `'srp'`/`'oidc'`
  enum in `014_oidc_providers.sql`)
- `users.wrapped_kek_escrow` is NULL (no escrow needed)
- `users.srp_verifier` and `users.srp_salt` remain populated
- OIDC handles SSO, session management, and group/role mapping
- The vault password handles key derivation (zero-knowledge)

**Trade-off**: Users must remember a vault password in addition to SSO.
If lost, vault data is unrecoverable (same as SRP-only). Enterprise
admins should pair this with the recovery phrase mechanism
(`usbvault-crypto/src/vault/recovery.rs`).

---

## Configuration

### Environment Variables

| Variable | Purpose | Generation | Storage |
|----------|---------|------------|---------|
| `OIDC_KEK_ENCRYPTION_KEY` | Master key for wrapping OIDC users' escrowed KEKs. 32 bytes, base64-encoded. | `openssl rand -base64 32` | Secrets manager (AWS Secrets Manager, Vault, Azure Key Vault). **Never** in `.env` files, Dockerfiles, or source control. |
| `OIDC_SECRET_ENCRYPTION_KEY` | Encrypts OIDC client secrets stored in `oidc_providers.client_secret_encrypted`. Separate from KEK escrow. | `openssl rand -base64 32` | Same as above. |
| `OIDC_ENABLED` | Feature flag. Set to `"true"` to enable OIDC. | N/A | Environment config. |
| `OIDC_CALLBACK_BASE_URL` | OAuth callback URL. Default: `https://app.usbvault.io/auth/oidc/callback` | N/A | Environment config. |

### Key Rotation Procedure for `OIDC_KEK_ENCRYPTION_KEY`

1. Generate new key: `openssl rand -base64 32`
2. Set `OIDC_KEK_ENCRYPTION_KEY_NEW` env var with the new key.
3. Run migration job: for each OIDC user, decrypt escrow with old key,
   re-encrypt with new key, update `users.wrapped_kek_escrow`.
4. After all rows are migrated, swap `OIDC_KEK_ENCRYPTION_KEY` to the
   new value and remove `OIDC_KEK_ENCRYPTION_KEY_NEW`.
5. Securely destroy the old key.
6. This is a zero-downtime operation -- both keys are valid during
   the migration window.

---

## Compliance Notes

### SOC 2 Type II

- **SRP mode**: Meets CC6.1 (logical access) with zero-knowledge proof.
  Encryption keys are never accessible to service operators, satisfying
  CC6.7 (restriction of access to system components).
- **OIDC escrow mode**: Requires compensating controls -- HSM for key
  storage, separation of duties for DB vs. key access, audit logging of
  all escrow decrypt operations. Document the trust boundary in the
  system description.
- **Hybrid mode**: Meets the same controls as SRP mode.

### GDPR (Article 32)

- Encryption at rest satisfies "pseudonymisation and encryption of
  personal data." OIDC escrow mode should be documented in the Data
  Protection Impact Assessment (DPIA) as the data processor holds
  technical capability to decrypt.
- Hybrid mode avoids this: processor cannot decrypt without the user's
  vault password.

### HIPAA (Security Rule, 45 CFR 164.312)

- **Access Control (a)(1)**: Both modes enforce unique user identification
  and authentication.
- **Encryption (e)(2)(ii)**: Both modes encrypt ePHI at rest. OIDC escrow
  mode means the covered entity must treat the server operator as having
  potential access to ePHI -- this affects BAA (Business Associate
  Agreement) obligations.
- **Hybrid mode**: Recommended for HIPAA-covered entities. Server
  operator cannot access ePHI, simplifying BAA scope.

---

## Database Schema Reference

Tables involved (see `usbvault-server/migrations/014_oidc_providers.sql`):

- `users.auth_method` -- `'srp'`, `'oidc'`, or `'hybrid'`
- `users.wrapped_kek_escrow` -- BYTEA, AES-256-GCM ciphertext of KEK
- `users.kek_escrow_salt` -- BYTEA, 32-byte random salt for HKDF
- `users.srp_verifier` -- nullable for OIDC-only users
- `users.srp_salt` -- nullable for OIDC-only users
- `oidc_providers` -- per-tenant IdP configurations
- `oidc_identities` -- links OIDC subjects to USBVault user accounts

Source files:
- `usbvault-server/internal/oidc/config.go` -- OIDC config loading,
  AES-256-GCM encrypt/decrypt for client secrets
- `usbvault-crypto/src/kdf.rs` -- Argon2id KDF, XChaCha20-Poly1305
  MEK wrapping, HKDF domain separation map
- `usbvault-server/internal/vault/key_hierarchy.go` -- Key hierarchy
  persistence endpoints
