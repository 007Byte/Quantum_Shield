/**
 * PH4-FIX: Stub for index crypto service.
 * TODO: Wire to Rust FFI for encrypted index operations.
 */

export async function encryptIndex(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  // Stub — returns data unchanged
  return data;
}

export async function decryptIndex(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  // Stub — returns data unchanged
  return data;
}
