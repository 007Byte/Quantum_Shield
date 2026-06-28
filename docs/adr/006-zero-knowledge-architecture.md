# ADR-006: Zero-Knowledge Architecture and Encryption Design

## Status: Accepted

## Date: 2024-02-15

## Context

Quantum_Shield's core security promise is that user data remains encrypted end-to-end. The server must:

- Never access plaintext vault contents
- Never store or derive user passwords
- Never see encryption keys (server cannot decrypt user data)
- Authenticate users without password leakage
- Prove data authenticity without decryption

This requires careful key hierarchy design and client-side encryption architecture.

## Decision

Implement a **zero-knowledge client-encrypted architecture**:

### Key Hierarchy

1. **Master Password** (user-memorable)
   - Stored: Scrypt(password, salt) → Derived Key
   - Never transmitted to server
   - Never used directly for encryption

2. **Key Encryption Key (KEK)**
   - Derived: HKDF-SHA256(Scrypt result, salt="kek")
   - Stored on client in secure storage (iOS Keychain, Android KeyStore)
   - Used only to encrypt Master Encryption Key

3. **Master Encryption Key (MEK)**
   - Derived: HKDF-SHA256(KEK, salt="mek")
   - Encrypted at rest with KEK (stored in encrypted form on device)
   - Transmitted to backend only over TLS (never in plaintext in storage)
   - Rotated annually via re-encryption ceremony

4. **Data Encryption Key (DEK)**
   - Derived per-vault: HKDF-SHA256(MEK, salt=vault_id)
   - Unique per vault, deterministic from MEK
   - Never transmitted; derived on-demand

### Client-Side Encryption Flow

```
User enters password
  ↓
PBKDF2-HMAC-SHA256(password, salt, 100k iterations)
  ↓
KEK ← HKDF(result, "kek")
  ↓
Store: AES-256-GCM(KEK, MEK_plaintext) → MEK_encrypted
  ↓
On vault access:
  DEK ← HKDF(MEK, vault_id)
  plaintext ← XChaCha20-Poly1305-decrypt(vault_ciphertext, DEK)
```

### Server-Side

- Server stores `user.encrypted_mek` (encrypted MEK)
- Server stores `vault.encrypted_data` (encrypted vault)
- Server verifies `vault.auth_tag` (HMAC-SHA256 of encrypted data)
- No decryption possible server-side

## Alternatives Considered

1. **Server-side Master Key (Traditional HSM approach)**
   - Pros: Key rotation centralized, simpler key management
   - Cons: Violates zero-knowledge promise, server compromise leaks all data, requires HSM deployment

2. **No key hierarchy (Direct password derivation)**
   - Pros: Simpler implementation
   - Cons: Password rotation requires re-encrypting all data, no separation of concerns

3. **Deterministic encryption (always same ciphertext for same plaintext)**
   - Pros: Searchable encryption, pattern recognition
   - Cons: Leaks information to passive eavesdropper, breaks semantic security

## Consequences

### Positive Outcomes

- Server compromise does not leak user data (encrypted at rest)
- Zero knowledge maintained: server cannot prove data tampering without decryption
- Key rotation possible without data re-encryption (re-encrypt KEK only)
- Password changes don't require server involvement (client-side only)
- Multi-device sync: each device independently derives same KEK/MEK from password

### Negative Outcomes

- Complex key management (users responsible for password security)
- Lost password = permanently lost data (no password reset possible)
- Key derivation CPU-intensive on client (PBKDF2 100k iterations = 1-2 seconds on mobile)
- Multi-device sync slower: eventual consistency on MEK updates

## Implementation Notes

- All PBKDF2/HKDF derivations performed on client (mobile app)
- Server API: `POST /auth/verify` accepts HMAC-SHA256(KEK, "auth-signature") for authentication
- Vault sync: device sends `vault.encrypted_data` + `vault.nonce` + `vault.auth_tag` to server
- Auth endpoint never receives plaintext password or full KEK (only HMAC signature)
- Backend validates signature without deriving keys
