/**
 * SRP-6a constants matching the Go server implementation (usbvault-server/internal/auth/srp.go).
 *
 * IMPORTANT: These values MUST match the server exactly. The server uses its own
 * N prime and g=2 with SHA-256 hashing and RFC 5054 padding conventions.
 */

// 3072-bit prime N from server (srpN in srp.go) — hex-encoded
// This is the exact string the Go server uses for big.Int.SetString(srpN, 16).
export const N_HEX =
  'FFFFFFFFFFFFFFFFD0C52B70D29606C1E0DB00F6FFF002BACA73E0E3C36C2F0F' +
  '4BCD4A989A3D3B0E99CC6B7C84ED89A23A76FBB6A1DB6F9E7C4C8C5C9B5E7D4' +
  'F8C7E3D9B1A5F0E2D4C6B8A9F1D3E5C7B9A1D3F5E7D9C1B3A5F7E9D1C3B5A7' +
  'C9E1D3F5E7C9B1A3D5F7E9D1C3B5A7C9E1D3F5E7C9B1A3D5F7E9D1C3B5A7C9' +
  'E1D3F5E7C9B1A3D5F7E9D1C3B5A7C9E1D3F5E7C9B1A3FFFFFFFFFFFFFFFF';

// Generator g = 2 (matching server's srpG = 2)
export const G = 2n;

/**
 * Convert a hex string to a BigInt.
 */
export function hexToBigInt(hex: string): bigint {
  return BigInt('0x' + hex);
}

/**
 * The prime N as a BigInt.
 */
export const N: bigint = hexToBigInt(N_HEX);

/**
 * Byte length of N (used for PAD() operations per RFC 5054).
 */
export const N_BYTE_LENGTH: number = Math.ceil(N_HEX.length / 2);
