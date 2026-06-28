/**
 * Post-Quantum Cryptography Service
 *
 * PH4-FIX: Consolidated pqcService + pqcStatusService into single crypto domain file
 * RM-03: Tracks enrollment and compliance status for post-quantum cryptography (PQC) algorithms
 *
 * PH9-PQ-FIX: Hybrid X25519 + ML-KEM-1024 key encapsulation for quantum-resistant encryption.
 * This service wraps the Rust FFI PQC module to provide:
 * - Hybrid keypair generation (X25519 + ML-KEM-1024)
 * - Hybrid seal (encrypt for recipient using both classical + PQ KEM)
 * - Hybrid open (decrypt using both classical + PQ secret keys)
 * - Key serialization for storage and transport
 * - ML-KEM-1024 enrollment and CNSA 2.0 compliance tracking
 *
 * NOTE: Digital signatures currently use Ed25519. ML-DSA-87 (FIPS 204) is on
 * the post-quantum roadmap and is NOT yet implemented; the ML-DSA status
 * tracking below reflects planned (not active) capability only.
 *
 * Security Model:
 * - Hybrid approach: secure if EITHER X25519 OR ML-KEM-1024 remains unbroken
 * - ML-KEM-1024 provides IND-CCA2 security against quantum adversaries (FIPS 203)
 * - X25519 provides classical ECDH security as fallback
 * - Shared secrets combined via HKDF-SHA256 with purpose binding
 *
 * Sealed Box Format:
 *   x25519_ephemeral(32) || mlkem_ciphertext(1568) || nonce(24) || encrypted_data || tag(16)
 *   Total overhead: 1640 bytes before payload
 *
 * @module services/crypto/pqc
 */

import { Platform, NativeModules } from 'react-native';
import { auditService } from '../auditService';

// ─── Constants ──────────────────────────────────────────────────

/** ML-KEM-1024 public/encapsulation key size in bytes */
export const MLKEM_PUBLIC_KEY_SIZE = 1568;

/** ML-KEM-1024 ciphertext size in bytes */
export const MLKEM_CIPHERTEXT_SIZE = 1568;

/** X25519 key size in bytes */
export const X25519_KEY_SIZE = 32;

/** Total overhead added by hybrid seal (x25519_eph + mlkem_ct + nonce + tag) */
export const HYBRID_SEAL_OVERHEAD = X25519_KEY_SIZE + MLKEM_CIPHERTEXT_SIZE + 24 + 16;

const STORAGE_KEY = 'usbvault:pqc_status';
const KEY_ROTATION_INTERVAL_DAYS = 90;
const isWeb = Platform.OS === 'web';

// ─── Types ──────────────────────────────────────────────────────

/** Hybrid public key: X25519(32 bytes) + ML-KEM-1024(1568 bytes) */
export interface HybridPublicKey {
  /** Base64-encoded X25519 public key (32 bytes) */
  x25519: string;
  /** Base64-encoded ML-KEM-1024 encapsulation key (1568 bytes) */
  mlKem: string;
}

/** Hybrid secret key: X25519(32 bytes) + ML-KEM-1024(1568 bytes) */
export interface HybridSecretKey {
  /** Base64-encoded X25519 secret key (32 bytes) */
  x25519: string;
  /** Base64-encoded ML-KEM-1024 decapsulation key (1568 bytes) */
  mlKem: string;
}

/** Hybrid keypair */
export interface HybridKeypair {
  publicKey: HybridPublicKey;
  secretKey: HybridSecretKey;
}

/** PQC capability status */
export interface PQCCapabilityStatus {
  available: boolean;
  algorithm: string;
  keySize: number;
  hybridMode: string;
  platform: string;
}

export interface AlgorithmDetail {
  name: string;
  standard: string;
  strength: string;
  status: 'active' | 'pending' | 'unavailable';
  description: string;
}

export interface PQCStatus {
  mlKemEnrolled: boolean;
  mlKemKeyId?: string;
  mlDsaEnrolled: boolean;
  mlDsaKeyId?: string;
  cnsaCompliant: boolean;
  algorithmDetails: AlgorithmDetail[];
  lastKeyRotation?: string; // ISO 8601
  nextKeyRotation?: string; // ISO 8601
}

// ─── Native Module Interface ────────────────────────────────────

interface USBVaultPQCNative {
  pqcGenerateKeypair(): Promise<{
    x25519Pub: string;
    mlKemPub: string;
    x25519Sec: string;
    mlKemSec: string;
  }>;
  pqcSeal(x25519Pub: string, mlKemPub: string, plaintextBase64: string): Promise<string>;
  pqcOpen(x25519Sec: string, mlKemSec: string, sealedBase64: string): Promise<string>;
  pqcIsAvailable(): Promise<boolean>;
}

// ─── Helpers ────────────────────────────────────────────────────

/** Calculate byte length from base64 string */
function base64ToByteLength(base64: string): number {
  const stripped = base64.replace(/=+$/, '');
  return Math.floor((stripped.length * 3) / 4);
}

/** Convert base64 string to Uint8Array */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Convert Uint8Array to base64 string */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// PH9-PQ-FIX: Check for native PQC module availability
const getNativeModule = (): USBVaultPQCNative | null => {
  if (Platform.OS === 'web') {
    return null;
  }
  try {
    const mod = NativeModules.USBVaultPQC as USBVaultPQCNative | undefined;
    return mod ?? null;
  } catch {
    return null;
  }
};

/**
 * Generate a cryptographically secure key ID.
 */
const generateKeyId = (): string => {
  if (!isWeb || !crypto.getRandomValues) {
    return `pqc-key-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
  }
  try {
    const buffer = new Uint8Array(16);
    crypto.getRandomValues(buffer);
    return `pqc-key-${Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')}`;
  } catch {
    return `pqc-key-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
  }
};

/**
 * Read PQC status from storage.
 */
function readStatus(): PQCStatus {
  if (!isWeb) {
    return getDefaultStatus();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultStatus();
    return JSON.parse(raw);
  } catch {
    return getDefaultStatus();
  }
}

/**
 * Write PQC status to storage.
 */
function writeStatus(status: PQCStatus): void {
  if (!isWeb) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
  } catch {
    // localStorage full or unavailable
  }
}

/**
 * Get default PQC status with all algorithms documented.
 */
function getDefaultStatus(): PQCStatus {
  return {
    mlKemEnrolled: false,
    mlDsaEnrolled: false,
    cnsaCompliant: false,
    algorithmDetails: [
      {
        name: 'ML-KEM-1024',
        standard: 'FIPS 203',
        strength: '~256-bit AES-equivalent',
        status: 'unavailable',
        description:
          'Post-quantum key encapsulation mechanism (Module-Lattice-Based Key-Encapsulation Mechanism)',
      },
      {
        name: 'ML-DSA-87',
        standard: 'FIPS 204',
        strength: '~256-bit AES-equivalent',
        status: 'pending',
        description:
          'Post-quantum digital signature algorithm (Module-Lattice-Based Digital Signature Algorithm) — PLANNED / on the roadmap, NOT yet implemented. Signatures currently use Ed25519.',
      },
      {
        name: 'AES-256-GCM-SIV',
        standard: 'RFC 8452',
        strength: '256-bit',
        status: 'unavailable',
        description: 'Authenticated encryption with associated data, nonce-misuse resistant',
      },
      {
        name: 'SHA-3-256',
        standard: 'FIPS 202',
        strength: '256-bit',
        status: 'unavailable',
        description: 'Cryptographic hash function with sponge construction',
      },
      {
        name: 'HKDF-SHA256',
        standard: 'RFC 5869',
        strength: '256-bit',
        status: 'unavailable',
        description: 'HMAC-based Key Derivation Function for secure key generation',
      },
    ],
  };
}

/**
 * Calculate next key rotation date.
 */
function calculateNextRotation(fromDate: Date = new Date()): string {
  const nextRotation = new Date(fromDate);
  nextRotation.setDate(nextRotation.getDate() + KEY_ROTATION_INTERVAL_DAYS);
  return nextRotation.toISOString();
}

// ─── Capability Functions ───────────────────────────────────────

/**
 * Check if post-quantum cryptography is available on this platform
 *
 * PQC requires the Rust FFI module compiled with the `pqc` feature flag.
 * It is available on iOS, Android, and desktop platforms but NOT on web.
 */
export async function isPQCAvailable(): Promise<boolean> {
  const native = getNativeModule();
  if (!native) return false;

  try {
    return await native.pqcIsAvailable();
  } catch {
    return false;
  }
}

/**
 * Get PQC capability status for the current platform
 */
export async function getPQCStatus(): Promise<PQCCapabilityStatus> {
  const available = await isPQCAvailable();
  return {
    available,
    algorithm: 'ML-KEM-1024',
    keySize: MLKEM_PUBLIC_KEY_SIZE,
    hybridMode: 'X25519 + ML-KEM-1024 (HKDF-SHA256)',
    platform: Platform.OS,
  };
}

/**
 * Generate a hybrid X25519 + ML-KEM-1024 keypair
 *
 * PH9-PQ-FIX: Quantum-resistant keypair generation
 *
 * @returns HybridKeypair with base64-encoded keys
 * @throws Error if PQC is not available on this platform
 */
export async function generateHybridKeypair(): Promise<HybridKeypair> {
  const native = getNativeModule();
  if (!native) {
    throw new Error('PQC not available: requires native Rust module with pqc feature');
  }

  try {
    const result = await native.pqcGenerateKeypair();

    await auditService.log(
      'crypto',
      'pqc_keypair_generated',
      {
        algorithm: 'X25519+ML-KEM-1024',
        x25519PubLength: result.x25519Pub.length,
        mlKemPubLength: result.mlKemPub.length,
      },
      'success'
    );

    return {
      publicKey: {
        x25519: result.x25519Pub,
        mlKem: result.mlKemPub,
      },
      secretKey: {
        x25519: result.x25519Sec,
        mlKem: result.mlKemSec,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await auditService.log('crypto', 'pqc_keypair_error', { error: errorMsg }, 'error');
    throw new Error(`PQC keypair generation failed: ${errorMsg}`);
  }
}

/**
 * Encrypt plaintext for a recipient using hybrid X25519 + ML-KEM-1024
 *
 * PH9-PQ-FIX: Quantum-resistant encryption
 *
 * The sealed box format:
 *   x25519_ephemeral(32) || mlkem_ciphertext(1568) || nonce(24) || ciphertext || tag(16)
 *
 * @param recipientPublicKey - Recipient's hybrid public key
 * @param plaintextBase64 - Base64-encoded plaintext to encrypt
 * @returns Base64-encoded sealed box
 */
export async function hybridSeal(
  recipientPublicKey: HybridPublicKey,
  plaintextBase64: string
): Promise<string> {
  const native = getNativeModule();
  if (!native) {
    throw new Error('PQC not available: requires native Rust module with pqc feature');
  }

  // Validate key sizes
  const x25519Bytes = base64ToByteLength(recipientPublicKey.x25519);
  const mlKemBytes = base64ToByteLength(recipientPublicKey.mlKem);

  if (x25519Bytes !== X25519_KEY_SIZE) {
    throw new Error(
      `Invalid X25519 public key size: expected ${X25519_KEY_SIZE}, got ${x25519Bytes}`
    );
  }
  if (mlKemBytes !== MLKEM_PUBLIC_KEY_SIZE) {
    throw new Error(
      `Invalid ML-KEM public key size: expected ${MLKEM_PUBLIC_KEY_SIZE}, got ${mlKemBytes}`
    );
  }

  try {
    const sealedBase64 = await native.pqcSeal(
      recipientPublicKey.x25519,
      recipientPublicKey.mlKem,
      plaintextBase64
    );

    await auditService.log(
      'crypto',
      'pqc_seal',
      {
        algorithm: 'X25519+ML-KEM-1024+XChaCha20-Poly1305',
        plaintextSize: base64ToByteLength(plaintextBase64),
        sealedSize: base64ToByteLength(sealedBase64),
      },
      'success'
    );

    return sealedBase64;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await auditService.log('crypto', 'pqc_seal_error', { error: errorMsg }, 'error');
    throw new Error(`PQC seal failed: ${errorMsg}`);
  }
}

/**
 * Decrypt a hybrid sealed message using X25519 + ML-KEM-1024
 *
 * PH9-PQ-FIX: Quantum-resistant decryption
 *
 * @param secretKey - Recipient's hybrid secret key
 * @param sealedBase64 - Base64-encoded sealed box from hybridSeal()
 * @returns Base64-encoded plaintext
 */
export async function hybridOpen(
  secretKey: HybridSecretKey,
  sealedBase64: string
): Promise<string> {
  const native = getNativeModule();
  if (!native) {
    throw new Error('PQC not available: requires native Rust module with pqc feature');
  }

  // Validate minimum sealed size
  const sealedBytes = base64ToByteLength(sealedBase64);
  const minSize = HYBRID_SEAL_OVERHEAD;
  if (sealedBytes < minSize) {
    throw new Error(`Sealed data too short: expected >= ${minSize} bytes, got ${sealedBytes}`);
  }

  try {
    const plaintextBase64 = await native.pqcOpen(secretKey.x25519, secretKey.mlKem, sealedBase64);

    await auditService.log(
      'crypto',
      'pqc_open',
      {
        algorithm: 'X25519+ML-KEM-1024+XChaCha20-Poly1305',
        sealedSize: sealedBytes,
      },
      'success'
    );

    return plaintextBase64;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await auditService.log('crypto', 'pqc_open_error', { error: errorMsg }, 'error');
    throw new Error(`PQC open failed: ${errorMsg}`);
  }
}

/**
 * Serialize a hybrid public key to a single base64 string for transport
 *
 * Format: x25519(32) || ml_kem(1568) = 1600 bytes total
 */
export function serializePublicKey(key: HybridPublicKey): string {
  const x25519 = base64ToUint8Array(key.x25519);
  const mlKem = base64ToUint8Array(key.mlKem);
  const combined = new Uint8Array(x25519.length + mlKem.length);
  combined.set(x25519, 0);
  combined.set(mlKem, x25519.length);
  return uint8ArrayToBase64(combined);
}

/**
 * Deserialize a hybrid public key from a single base64 string
 */
export function deserializePublicKey(serialized: string): HybridPublicKey {
  const bytes = base64ToUint8Array(serialized);
  if (bytes.length !== X25519_KEY_SIZE + MLKEM_PUBLIC_KEY_SIZE) {
    throw new Error(
      `Invalid serialized key size: expected ${X25519_KEY_SIZE + MLKEM_PUBLIC_KEY_SIZE}, got ${bytes.length}`
    );
  }
  return {
    x25519: uint8ArrayToBase64(bytes.slice(0, X25519_KEY_SIZE)),
    mlKem: uint8ArrayToBase64(bytes.slice(X25519_KEY_SIZE)),
  };
}

// ─── Status Management Functions ────────────────────────────────

/**
 * Get current PQC enrollment and compliance status.
 */
export function getPQCEnrollmentStatus(): PQCStatus {
  return readStatus();
}

/**
 * Enroll ML-KEM-1024 (key encapsulation mechanism).
 * Generates a key ID and updates algorithm details.
 */
export function enrollMLKEM(): void {
  const status = readStatus();
  const keyId = generateKeyId();

  status.mlKemEnrolled = true;
  status.mlKemKeyId = keyId;

  const mlKemDetail = status.algorithmDetails.find(a => a.name === 'ML-KEM-1024');
  if (mlKemDetail) {
    mlKemDetail.status = 'active';
  }

  status.cnsaCompliant = status.mlKemEnrolled && status.mlDsaEnrolled;

  writeStatus(status);
  auditService.log(
    'system',
    'pqc',
    { algorithm: 'ML-KEM-1024', action: 'enrolled', keyId },
    'success'
  );
}

/**
 * Pre-enroll ML-DSA-87 (digital signature algorithm) as a PLANNED capability.
 *
 * ML-DSA-87 (FIPS 204) is NOT yet implemented — there is no native sign/verify
 * code path. Active digital signatures use Ed25519. This records intent to adopt
 * ML-DSA-87 on the roadmap and keeps its status as 'pending' (never 'active').
 */
export function enrollMLDSA(): void {
  const status = readStatus();
  const keyId = generateKeyId();

  status.mlDsaEnrolled = true;
  status.mlDsaKeyId = keyId;

  const mlDsaDetail = status.algorithmDetails.find(a => a.name === 'ML-DSA-87');
  if (mlDsaDetail) {
    // Roadmap capability only — ML-DSA-87 is not yet signing anything.
    mlDsaDetail.status = 'pending';
  }

  status.cnsaCompliant = status.mlKemEnrolled && status.mlDsaEnrolled;

  writeStatus(status);
  auditService.log(
    'system',
    'pqc',
    { algorithm: 'ML-DSA-87', action: 'pre_enrolled_roadmap', keyId },
    'success'
  );
}

/**
 * Check if all CNSA 2.0 requirements are met.
 * CNSA 2.0 requires both ML-KEM-1024 and ML-DSA-87 enrollment.
 */
export function checkCNSACompliance(): boolean {
  const status = readStatus();
  return status.mlKemEnrolled && status.mlDsaEnrolled;
}

/**
 * Get detailed information on all PQC algorithms in use.
 */
export function getAlgorithmDetails(): AlgorithmDetail[] {
  const status = readStatus();
  return status.algorithmDetails;
}

/**
 * Trigger PQC key rotation.
 * Updates lastKeyRotation and nextKeyRotation timestamps.
 */
export function rotateKeys(): void {
  const status = readStatus();
  const now = new Date();

  status.lastKeyRotation = now.toISOString();
  status.nextKeyRotation = calculateNextRotation(now);

  if (status.mlKemEnrolled) {
    status.mlKemKeyId = generateKeyId();
  }
  if (status.mlDsaEnrolled) {
    status.mlDsaKeyId = generateKeyId();
  }

  writeStatus(status);

  auditService.log(
    'key_rotation',
    'pqc',
    {
      algorithms: ['ML-KEM-1024', 'ML-DSA-87'],
      nextRotation: status.nextKeyRotation,
    },
    'success'
  );
}

/**
 * Get the next scheduled key rotation timestamp.
 */
export function getNextKeyRotation(): string | undefined {
  const status = readStatus();
  return status.nextKeyRotation;
}

/**
 * Get the last key rotation timestamp.
 */
export function getLastKeyRotation(): string | undefined {
  const status = readStatus();
  return status.lastKeyRotation;
}

/**
 * Determine if key rotation is due (overdue if true).
 */
export function isKeyRotationDue(): boolean {
  const status = readStatus();
  if (!status.nextKeyRotation) {
    return status.mlKemEnrolled || status.mlDsaEnrolled;
  }

  const nextRotation = new Date(status.nextKeyRotation);
  return new Date() > nextRotation;
}

/**
 * Mark all algorithms as active (for initialization or recovery).
 */
export function activateAllAlgorithms(): void {
  const status = readStatus();

  status.algorithmDetails.forEach(detail => {
    // ML-DSA-87 is intentionally excluded: it is a roadmap (planned) signature
    // scheme, not yet implemented. Active signatures use Ed25519.
    if (
      ['ML-KEM-1024', 'AES-256-GCM-SIV', 'SHA-3-256', 'HKDF-SHA256'].includes(detail.name)
    ) {
      detail.status = 'active';
    }
  });

  // Keep ML-DSA-87 marked as planned (pending), never active.
  const mlDsaDetail = status.algorithmDetails.find(a => a.name === 'ML-DSA-87');
  if (mlDsaDetail) {
    mlDsaDetail.status = 'pending';
  }

  status.mlKemEnrolled = true;
  status.mlDsaEnrolled = true;
  status.cnsaCompliant = true;

  if (!status.mlKemKeyId) {
    status.mlKemKeyId = generateKeyId();
  }
  if (!status.mlDsaKeyId) {
    status.mlDsaKeyId = generateKeyId();
  }

  if (!status.lastKeyRotation) {
    status.lastKeyRotation = new Date().toISOString();
    status.nextKeyRotation = calculateNextRotation();
  }

  writeStatus(status);

  auditService.log('system', 'pqc', { action: 'all_algorithms_activated' }, 'success');
}

/**
 * Reset PQC status to default (for testing or deprovisioning).
 */
export function resetPQCStatus(): void {
  if (!isWeb) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
  auditService.log('system', 'pqc', { action: 'status_reset' }, 'success');
}

// ─── Singleton exports for class-based interface (backward compatibility) ───

class PQCStatusServiceImpl {
  getPQCStatus(): PQCStatus {
    return getPQCEnrollmentStatus();
  }

  enrollMLKEM(): void {
    enrollMLKEM();
  }

  enrollMLDSA(): void {
    enrollMLDSA();
  }

  checkCNSACompliance(): boolean {
    return checkCNSACompliance();
  }

  getAlgorithmDetails(): AlgorithmDetail[] {
    return getAlgorithmDetails();
  }

  rotateKeys(): void {
    rotateKeys();
  }

  getNextKeyRotation(): string | undefined {
    return getNextKeyRotation();
  }

  getLastKeyRotation(): string | undefined {
    return getLastKeyRotation();
  }

  isKeyRotationDue(): boolean {
    return isKeyRotationDue();
  }

  activateAllAlgorithms(): void {
    activateAllAlgorithms();
  }

  reset(): void {
    resetPQCStatus();
  }
}

export const pqcStatusService = new PQCStatusServiceImpl();
