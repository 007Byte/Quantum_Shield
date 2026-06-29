/**
 * Tests for the filesystem streaming-crypto bridge (src/crypto/streamBridge.ts).
 *
 * The actual AEAD is the native/Rust module's job (covered by Rust KATs); these
 * tests exercise the JS bridge LOGIC: input validation, chunk framing + the
 * `isFinal` flag, chunkSize clamping, session lifecycle (always freed), error
 * wrapping + destination cleanup, the web fetch/blob fallback, and an
 * encrypt→decrypt round-trip through an identity cipher (proving the
 * chunk-extract / concat / base64 plumbing is correct).
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as bridge from '../bridge';
import { streamEncryptFile, streamDecryptFile } from '../streamBridge';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-file-system', () => ({
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));
jest.mock('../bridge', () => ({
  streamEncryptInit: jest.fn(),
  streamEncryptChunk: jest.fn(),
  streamEncryptFree: jest.fn(),
  streamDecryptInit: jest.fn(),
  streamDecryptChunk: jest.fn(),
  streamDecryptFree: jest.fn(),
}));
jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const fs = FileSystem as jest.Mocked<typeof FileSystem>;
const br = bridge as jest.Mocked<typeof bridge>;

const KEY = 'a'.repeat(64); // valid 64-char hex (32 bytes)
const SRC = 'file:///in.bin';
const DST = 'file:///out.bin';

const b64 = (bytes: number[] | Uint8Array) =>
  Buffer.from(Uint8Array.from(bytes as number[])).toString('base64');

/** Configure FileSystem mocks for a native read of `bytes`, capturing the write. */
function mockNativeFile(bytes: number[]) {
  fs.getInfoAsync.mockResolvedValue({ exists: true, size: bytes.length } as any);
  fs.readAsStringAsync.mockResolvedValue(b64(bytes));
  fs.writeAsStringAsync.mockResolvedValue(undefined as any);
  fs.deleteAsync.mockResolvedValue(undefined as any);
}

beforeEach(() => {
  jest.clearAllMocks();
  (Platform as any).OS = 'ios';
});

describe('streamEncryptFile — input validation', () => {
  it.each([
    ['too short', 'abc'],
    ['empty', ''],
    ['65 chars', 'a'.repeat(65)],
  ])('rejects an invalid key (%s)', async (_label, key) => {
    await expect(streamEncryptFile(key, SRC, DST)).rejects.toThrow('64-character hex');
  });

  it('rejects an empty source path', async () => {
    await expect(streamEncryptFile(KEY, '', DST)).rejects.toThrow('Source path cannot be empty');
  });

  it('rejects an empty destination path', async () => {
    await expect(streamEncryptFile(KEY, SRC, '')).rejects.toThrow(
      'Destination path cannot be empty'
    );
  });
});

describe('streamEncryptFile — native happy path', () => {
  it('inits with the key, streams one final chunk, writes output, frees the session', async () => {
    mockNativeFile([1, 2, 3, 4, 5]);
    br.streamEncryptInit.mockResolvedValue('sess-1');
    br.streamEncryptChunk.mockImplementation(async (_s, chunk) => Uint8Array.from(chunk)); // identity
    br.streamEncryptFree.mockResolvedValue(undefined as any);
    const onProgress = jest.fn();

    const res = await streamEncryptFile(KEY, SRC, DST, { onProgress });

    expect(br.streamEncryptInit).toHaveBeenCalledTimes(1);
    // key passed as the raw 32 bytes, not the hex string
    expect((br.streamEncryptInit.mock.calls[0][0] as Buffer).length).toBe(32);
    expect(br.streamEncryptChunk).toHaveBeenCalledTimes(1);
    expect(br.streamEncryptChunk.mock.calls[0][2]).toBe(true); // isFinal on the only chunk
    expect(fs.writeAsStringAsync).toHaveBeenCalledWith(
      DST,
      b64([1, 2, 3, 4, 5]),
      expect.anything()
    );
    expect(br.streamEncryptFree).toHaveBeenCalledWith('sess-1');
    expect(res.bytesWritten).toBe(5);
    expect(onProgress).toHaveBeenLastCalledWith(5, 5);
  });

  it('splits into multiple chunks and sets isFinal only on the last', async () => {
    const bytes = Array.from({ length: 10000 }, (_v, i) => i % 256);
    mockNativeFile(bytes);
    br.streamEncryptInit.mockResolvedValue('s');
    br.streamEncryptChunk.mockImplementation(async (_s, chunk) => Uint8Array.from(chunk));

    const res = await streamEncryptFile(KEY, SRC, DST, { chunkSize: 4096 });

    expect(br.streamEncryptChunk).toHaveBeenCalledTimes(3); // 4096 + 4096 + 1808
    const finals = br.streamEncryptChunk.mock.calls.map(c => c[2]);
    expect(finals).toEqual([false, false, true]);
    expect(res.bytesWritten).toBe(10000);
  });

  it('clamps chunkSize up to the 4KB minimum', async () => {
    mockNativeFile(Array.from({ length: 200 }, () => 7));
    br.streamEncryptInit.mockResolvedValue('s');
    br.streamEncryptChunk.mockImplementation(async (_s, chunk) => Uint8Array.from(chunk));

    await streamEncryptFile(KEY, SRC, DST, { chunkSize: 100 }); // below 4096 min

    // 200 bytes < clamped 4096 → exactly one chunk (not two)
    expect(br.streamEncryptChunk).toHaveBeenCalledTimes(1);
  });
});

describe('streamEncryptFile — errors & cleanup', () => {
  it('throws and cleans up the destination when the source is missing (no session leaked)', async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: false } as any);
    fs.deleteAsync.mockResolvedValue(undefined as any);

    await expect(streamEncryptFile(KEY, SRC, DST)).rejects.toThrow('Source file not found');
    expect(fs.deleteAsync).toHaveBeenCalledWith(DST, { idempotent: true });
    expect(br.streamEncryptInit).not.toHaveBeenCalled();
    expect(br.streamEncryptFree).not.toHaveBeenCalled();
  });

  it('wraps a chunk failure, cleans up dest, and still frees the session', async () => {
    mockNativeFile([1, 2, 3]);
    br.streamEncryptInit.mockResolvedValue('sess-err');
    br.streamEncryptChunk.mockRejectedValue(new Error('aead fail'));
    br.streamEncryptFree.mockResolvedValue(undefined as any);

    await expect(streamEncryptFile(KEY, SRC, DST)).rejects.toThrow(
      'File encryption failed: aead fail'
    );
    expect(fs.deleteAsync).toHaveBeenCalledWith(DST, { idempotent: true });
    expect(br.streamEncryptFree).toHaveBeenCalledWith('sess-err'); // finally still runs
  });

  it('tolerates a session-free failure (logs, does not fail the operation)', async () => {
    mockNativeFile([9, 9]);
    br.streamEncryptInit.mockResolvedValue('s');
    br.streamEncryptChunk.mockImplementation(async (_s, chunk) => Uint8Array.from(chunk));
    br.streamEncryptFree.mockRejectedValue(new Error('free boom'));

    const res = await streamEncryptFile(KEY, SRC, DST);
    expect(res.bytesWritten).toBe(2);
  });
});

describe('streamDecryptFile — validation & errors', () => {
  it('rejects an invalid key', async () => {
    await expect(streamDecryptFile('short', SRC, DST)).rejects.toThrow('64-character hex');
  });

  it('throws "Encrypted file not found" when source is missing', async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: false } as any);
    fs.deleteAsync.mockResolvedValue(undefined as any);
    await expect(streamDecryptFile(KEY, SRC, DST)).rejects.toThrow('Encrypted file not found');
  });

  it('wraps a decrypt-chunk failure and frees the session', async () => {
    mockNativeFile([1, 2, 3]);
    br.streamDecryptInit.mockResolvedValue('d');
    br.streamDecryptChunk.mockRejectedValue(new Error('hmac mismatch'));
    br.streamDecryptFree.mockResolvedValue(undefined as any);
    await expect(streamDecryptFile(KEY, SRC, DST)).rejects.toThrow(
      'File decryption failed: hmac mismatch'
    );
    expect(br.streamDecryptFree).toHaveBeenCalledWith('d');
  });
});

describe('round-trip framing (identity cipher) proves chunk-extract/concat/base64', () => {
  it('encrypt then decrypt reproduces the original bytes across multiple chunks', async () => {
    const original = Array.from({ length: 9000 }, (_v, i) => (i * 7) % 256);

    // ENCRYPT with identity cipher; capture what gets written to disk.
    mockNativeFile(original);
    br.streamEncryptInit.mockResolvedValue('e');
    br.streamEncryptChunk.mockImplementation(async (_s, chunk) => Uint8Array.from(chunk));
    let encryptedB64 = '';
    fs.writeAsStringAsync.mockImplementation(async (_p, data) => {
      encryptedB64 = data as string;
    });
    await streamEncryptFile(KEY, SRC, DST, { chunkSize: 4096 });
    expect(Buffer.from(encryptedB64, 'base64')).toEqual(Buffer.from(Uint8Array.from(original)));

    // DECRYPT that exact ciphertext; capture the plaintext written out.
    jest.clearAllMocks();
    (Platform as any).OS = 'ios';
    fs.getInfoAsync.mockResolvedValue({ exists: true, size: original.length } as any);
    fs.readAsStringAsync.mockResolvedValue(encryptedB64);
    br.streamDecryptInit.mockResolvedValue('d');
    br.streamDecryptChunk.mockImplementation(async (_s, chunk) => Uint8Array.from(chunk));
    let decryptedB64 = '';
    fs.writeAsStringAsync.mockImplementation(async (_p, data) => {
      decryptedB64 = data as string;
    });
    const res = await streamDecryptFile(KEY, SRC, DST, { chunkSize: 4096 });

    expect(Buffer.from(decryptedB64, 'base64')).toEqual(Buffer.from(Uint8Array.from(original)));
    expect(res.bytesWritten).toBe(9000);
  });
});

describe('web fallback (Platform.OS === "web")', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetchOk(bytes: number[]) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: async () => ({
        size: bytes.length,
        arrayBuffer: async () => Uint8Array.from(bytes).buffer,
      }),
    }) as any;
  }

  it('encrypts via fetch+blob without touching the filesystem', async () => {
    (Platform as any).OS = 'web';
    mockFetchOk([1, 2, 3, 4]);
    br.streamEncryptInit.mockResolvedValue('w');
    br.streamEncryptChunk.mockImplementation(async (_s, chunk) => Uint8Array.from(chunk));
    br.streamEncryptFree.mockResolvedValue(undefined as any);

    const res = await streamEncryptFile(KEY, 'blob:abc', DST);

    expect(br.streamEncryptInit).toHaveBeenCalledTimes(1);
    expect(br.streamEncryptFree).toHaveBeenCalledTimes(1);
    expect(fs.getInfoAsync).not.toHaveBeenCalled(); // web path bypasses expo-file-system
    expect(res.bytesWritten).toBe(4);
  });

  it('rejects when the web fetch is not ok', async () => {
    (Platform as any).OS = 'web';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, statusText: 'Not Found' }) as any;
    await expect(streamEncryptFile(KEY, 'blob:x', DST)).rejects.toThrow('Failed to fetch file');
  });

  it('decrypts via fetch+blob on web', async () => {
    (Platform as any).OS = 'web';
    mockFetchOk([5, 6, 7]);
    br.streamDecryptInit.mockResolvedValue('w');
    br.streamDecryptChunk.mockImplementation(async (_s, chunk) => Uint8Array.from(chunk));
    br.streamDecryptFree.mockResolvedValue(undefined as any);

    const res = await streamDecryptFile(KEY, 'blob:y', DST);
    expect(res.bytesWritten).toBe(3);
    expect(br.streamDecryptFree).toHaveBeenCalledTimes(1);
  });
});
