/**
 * PH4-FIX: Stub for index crypto service.
 * TODO: Wire to Rust FFI for encrypted index operations.
 */

export async function encryptIndex(_key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  // Stub — returns data unchanged
  return data;
}

export async function decryptIndex(_key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  // Stub — returns data unchanged
  return data;
}

// Aliases used by vaultStore (SG-003)
// These work with base64 strings to match webStorage's saveEncryptedIndex/loadEncryptedIndex API.
export async function encryptFileIndex(key: Uint8Array, data: unknown): Promise<string | null> {
  try {
    const json = JSON.stringify(data);
    const bytes = new TextEncoder().encode(json);
    const encrypted = await encryptIndex(key, bytes);
    // Convert Uint8Array to base64 string for storage
    return btoa(String.fromCharCode(...encrypted));
  } catch {
    return null;
  }
}

export async function decryptFileIndex(_key: Uint8Array, data: string): Promise<unknown[] | null> {
  try {
    // Convert base64 string back to Uint8Array
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const decrypted = await decryptIndex(_key, bytes);
    const json = new TextDecoder().decode(decrypted);
    return JSON.parse(json);
  } catch {
    return null;
  }
}
