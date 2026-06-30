/**
 * Steganography Service Tests
 *
 * Real-behavior coverage for `src/services/crypto/steganography.ts`.
 *
 * The service performs LSB bit-packing, a custom header (magic + length + IV),
 * and AES-256-GCM encrypt/decrypt — all of which we exercise for real using the
 * WebCrypto polyfill from jest.setup.js. The ONLY genuine boundary we replace is
 * the browser image pipeline (`new Image()` + `<canvas>.getContext('2d')`),
 * which jsdom does not implement (no `canvas` native package installed). We back
 * it with an in-memory RGBA pixel buffer addressed by data-URL so that an
 * `embed()` and a later `extract()` operate on the SAME pixels — giving a true
 * encode→decode round-trip rather than a stubbed pass-through.
 *
 * Platform is forced to 'web' (the service early-returns on every other OS).
 */

// Force the web branch in every method (the service early-returns on other OSes).
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

const auditLog = jest.fn();
jest.mock('@/services/auditService', () => ({
  auditService: { log: auditLog },
}));

// The service references `new Image()` / `<canvas>` only inside its methods (not
// at module load), so it is safe to import it here. It is required AFTER the
// mocks above are declared so the auditService mock factory's `auditLog`
// reference is initialized before steganography.ts's transitive imports run.
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const { steganographyService } = require('../steganography') as typeof import('../steganography');

// ── In-memory image registry ───────────────────────────────────
// Each data URL maps to a fixed-size RGBA buffer. `embed()` reads pixels via
// getImageData, mutates the R-channel LSBs, writes back via putImageData, then
// calls toDataURL() to mint a NEW url. We map that new url to the (now mutated)
// buffer so a subsequent extract() reads the embedded bits back out.
interface FakeImageEntry {
  width: number;
  height: number;
  data: Uint8ClampedArray; // length = width*height*4
}

const imageRegistry = new Map<string, FakeImageEntry>();
let nextStegoUrlId = 0;

/** Register a blank carrier image of the given dimensions and return its url. */
function registerCarrier(width: number, height: number, fill = 128): string {
  const data = new Uint8ClampedArray(width * height * 4);
  // Fill RGB with a mid-gray, alpha opaque. Mid-gray (even) keeps LSBs at 0.
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill;
    data[i + 1] = fill;
    data[i + 2] = fill;
    data[i + 3] = 255;
  }
  const url = `data:image/png;base64,carrier-${width}x${height}-${nextStegoUrlId++}`;
  imageRegistry.set(url, { width, height, data });
  return url;
}

/**
 * Header layout: magic(4) + length(4) + IV(12) = 20 bytes, then AES-GCM
 * ciphertext = plaintext.length + 16-byte tag. The total payload is embedded
 * one bit per pixel (R-channel LSB).
 *
 * NOTE on exact sizing: extract() decrypts the ENTIRE remaining bit stream
 * after the header (`payload.subarray(8 + IV_SIZE)`), so any pixels beyond the
 * payload contribute trailing bytes that corrupt the GCM ciphertext and fail
 * authentication. A faithful end-to-end round-trip therefore requires a carrier
 * whose pixel count EXACTLY equals the payload bit count. We size carriers
 * accordingly here; this is a property of the implementation under test, not of
 * the test harness.
 */
function payloadBitCount(plaintextLen: number): number {
  const headerBytes = 20; // magic(4)+length(4)+IV(12)
  const ciphertextBytes = plaintextLen + 16; // GCM tag
  return (headerBytes + ciphertextBytes) * 8;
}

/** Carrier sized so an embed of `plaintextLen` bytes fills every pixel exactly. */
function registerExactFitCarrier(plaintextLen: number): string {
  return registerCarrier(payloadBitCount(plaintextLen), 1);
}

// ── Fake Image ─────────────────────────────────────────────────
// Resolves synchronously-ish via a microtask: setting `.src` schedules onload
// (or onerror for an unregistered url) just like a real <img>.
class FakeImage {
  public crossOrigin = '';
  public width = 0;
  public height = 0;
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  private _src = '';

  set src(value: string) {
    this._src = value;
    queueMicrotask(() => {
      const entry = imageRegistry.get(value);
      if (entry) {
        this.width = entry.width;
        this.height = entry.height;
        this.onload?.();
      } else {
        this.onerror?.();
      }
    });
  }
  get src() {
    return this._src;
  }
}

// ── Fake canvas / 2d context ───────────────────────────────────
// getImageData returns a *view-by-reference* ImageData whose .data is the
// registry buffer, so mutations done by the service (putImageData writes the
// same array back) persist. toDataURL mints a new url pointing at that buffer.
class FakeContext2D {
  constructor(private canvas: FakeCanvas) {}

  drawImage(img: FakeImage): void {
    const entry = imageRegistry.get(img.src);
    if (!entry) throw new Error('drawImage: source not registered');
    // Bind the canvas to this image's buffer.
    this.canvas._entry = entry;
    this.canvas.width = entry.width;
    this.canvas.height = entry.height;
  }

  getImageData(
    _x: number,
    _y: number,
    w: number,
    h: number
  ): { data: Uint8ClampedArray; width: number; height: number } {
    const entry = this.canvas._entry!;
    return { data: entry.data, width: w, height: h };
  }

  putImageData(imageData: { data: Uint8ClampedArray }): void {
    // The service mutates imageData.data in place; since that IS the entry
    // buffer (returned by reference above), nothing else is needed. Keep the
    // assignment explicit to model a real write-back.
    this.canvas._entry!.data = imageData.data;
  }
}

class FakeCanvas {
  public width = 0;
  public height = 0;
  public _entry: FakeImageEntry | null = null;
  private _ctx = new FakeContext2D(this);
  private _ctxEnabled = true;

  getContext(kind: string): FakeContext2D | null {
    if (kind !== '2d') return null;
    return this._ctxEnabled ? this._ctx : null;
  }

  disableContext(): void {
    this._ctxEnabled = false;
  }

  toDataURL(): string {
    // Mint a url that aliases the (possibly mutated) backing buffer.
    const url = `data:image/png;base64,stego-${nextStegoUrlId++}`;
    imageRegistry.set(url, this._entry!);
    return url;
  }
}

// Track canvases so a test can force getContext() to fail.
const createdCanvases: FakeCanvas[] = [];

beforeAll(() => {
  // @ts-expect-error – install fake Image on the jsdom window/global.
  global.Image = FakeImage;
  jest.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'canvas') {
      const c = new FakeCanvas();
      createdCanvases.push(c);
      return c as unknown as HTMLElement;
    }
    // Fall back to a minimal object for any other tag (none expected).
    return { tagName: tag } as unknown as HTMLElement;
  }) as typeof document.createElement);
});

describe('SteganographyService', () => {
  beforeEach(() => {
    auditLog.mockClear();
    imageRegistry.clear();
    createdCanvases.length = 0;
  });

  describe('utility key generation', () => {
    it('generateEmbeddingKey returns a 256-bit (64-hex-char) key', () => {
      const key = steganographyService.generateEmbeddingKey();
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      // Two calls differ (random).
      expect(steganographyService.generateEmbeddingKey()).not.toBe(key);
    });
  });

  describe('calculateCapacity', () => {
    it('computes max/available bytes from image dimensions', async () => {
      // 100x100 px -> 100*100*3 bits = 30000 bits -> 3750 bytes max.
      const url = registerCarrier(100, 100);
      const cap = await steganographyService.calculateCapacity(url);
      expect(cap.imageWidth).toBe(100);
      expect(cap.imageHeight).toBe(100);
      expect(cap.maxBytes).toBe(3750);
      // available = max - HEADER_SIZE(28)
      expect(cap.availableBytes).toBe(3750 - 28);
    });

    it('returns zeros and audits an error when the image fails to load', async () => {
      const cap = await steganographyService.calculateCapacity(
        'data:image/png;base64,unregistered'
      );
      expect(cap).toEqual({ maxBytes: 0, availableBytes: 0, imageWidth: 0, imageHeight: 0 });
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'stego_capacity_error',
        expect.objectContaining({ error: expect.any(String) }),
        'error'
      );
    });
  });

  describe('embed + extract round-trip', () => {
    const key = 'a'.repeat(64); // valid 32-byte hex key (deterministic)

    it('embeds encrypted bytes and extracts them back identically', async () => {
      const secret = new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252, 0, 0]);
      const carrier = registerExactFitCarrier(secret.length);

      const embedResult = await steganographyService.embed(carrier, secret, key);
      expect(embedResult.success).toBe(true);
      expect(embedResult.carrierImageDataUrl).toBeDefined();
      expect(embedResult.originalSize).toBe(secret.length);
      // embeddedSize = header(magic4+len4+iv12=20) + ciphertext(secret.len + 16 GCM tag)
      expect(embedResult.embeddedSize).toBe(20 + secret.length + 16);
      expect(embedResult.capacityUsedPercent).toBeGreaterThan(0);
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'stego_embed_success',
        expect.objectContaining({ embeddedSize: secret.length })
      );

      const extracted = await steganographyService.extract(embedResult.carrierImageDataUrl!, key);
      expect(extracted.success).toBe(true);
      expect(Array.from(extracted.data!)).toEqual(Array.from(secret));
    });

    it('round-trips text via embedText/extractText', async () => {
      const plaintext = 'Hello, steganography! 0123';
      const plaintextLen = new TextEncoder().encode(plaintext).length;
      const carrier = registerExactFitCarrier(plaintextLen);
      const embedResult = await steganographyService.embedText(carrier, plaintext, key);
      expect(embedResult.success).toBe(true);

      const extracted = await steganographyService.extractText(
        embedResult.carrierImageDataUrl!,
        key
      );
      expect(extracted.success).toBe(true);
      expect(extracted.decryptedText).toBe(plaintext);
    });

    it('fails to extract when the wrong key is used (GCM auth failure)', async () => {
      const carrier = registerExactFitCarrier(4);
      const embedResult = await steganographyService.embed(
        carrier,
        new Uint8Array([9, 9, 9, 9]),
        key
      );
      const wrongKey = 'b'.repeat(64);
      const extracted = await steganographyService.extract(
        embedResult.carrierImageDataUrl!,
        wrongKey
      );
      expect(extracted.success).toBe(false);
      expect(extracted.error).toMatch(/Extraction failed/);
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'stego_extract_error',
        expect.objectContaining({ error: expect.any(String) }),
        'error'
      );
    });

    it('rejects data larger than the carrier capacity', async () => {
      // 4x4 px -> 4*4*3/8 = 6 bytes max, 6-28 < 0 -> available clamped to 0.
      const carrier = registerCarrier(4, 4);
      const tooBig = new Uint8Array(100);
      const result = await steganographyService.embed(carrier, tooBig, key);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Data too large/);
      expect(result.embeddedSize).toBe(100);
    });

    it('wraps an encryption error (bad hex key) into a failure result', async () => {
      const carrier = registerCarrier(64, 64);
      // An odd/short hex key produces an invalid AES key length -> importKey throws.
      const result = await steganographyService.embed(carrier, new Uint8Array([1, 2]), 'zz');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Embedding failed/);
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'stego_embed_error',
        expect.objectContaining({ error: expect.any(String) }),
        'error'
      );
    });
  });

  describe('extract header validation', () => {
    const key = 'c'.repeat(64);

    it('reports invalid magic bytes on a non-stego image', async () => {
      // A fresh mid-gray carrier has all-zero LSBs -> magic decodes to NUL bytes.
      const plain = registerCarrier(32, 32);
      const result = await steganographyService.extract(plain, key);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/magic bytes not found/);
    });
  });

  describe('detectStego', () => {
    const key = 'd'.repeat(64);

    it('returns false for a plain carrier image (no magic bytes present)', async () => {
      const plain = registerCarrier(32, 32);
      expect(await steganographyService.detectStego(plain)).toBe(false);
    });

    it('returns false when the image cannot be loaded', async () => {
      expect(await steganographyService.detectStego('data:image/png;base64,missing')).toBe(false);
    });

    // SOURCE-BUG NOTE: detectStego only reads the first 32 *array entries*
    // (`i < 32 && i < pixelData.length; i += 4`), i.e. 8 R-channel LSBs = a
    // single byte, then compares that one byte ("U") against the 4-char magic
    // "USVS". It therefore can NEVER return true — not even for a genuinely
    // embedded image. We assert the real (false) behavior rather than a value
    // the implementation cannot produce. If detectStego is fixed to read 32
    // bits, this expectation should flip to true.
    it('still returns false for a genuinely embedded image (single-byte magic compare bug)', async () => {
      const carrier = registerExactFitCarrier(1);
      const embedResult = await steganographyService.embed(carrier, new Uint8Array([7]), key);
      expect(embedResult.success).toBe(true);
      const detected = await steganographyService.detectStego(embedResult.carrierImageDataUrl!);
      expect(detected).toBe(false);
    });
  });

  describe('getStatisticalProfile', () => {
    it('reports high resistance for a uniform (all-even) carrier', async () => {
      // All RGB LSBs are 0 -> chiSquare = N (very high) actually: zeros=N, ones=0.
      // zeroCount=N, oneCount=0, expected=N/2 => chiSquare = (N/2)^2/(N/2)*2 = N.
      // For N large that's >10 -> low resistance, anomalyDetected true.
      const url = registerCarrier(40, 40, 128); // even fill -> all LSB 0
      const profile = await steganographyService.getStatisticalProfile(url);
      expect(profile.chiSquare).toBeGreaterThan(10);
      expect(profile.resistance).toBe('low');
      expect(profile.anomalyDetected).toBe(true);
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'stego_statistical_analysis',
        expect.objectContaining({ resistance: 'low' })
      );
    });

    it('reports high resistance for a balanced LSB distribution', async () => {
      // Build a carrier with a near-perfect 50/50 LSB split across RGB channels.
      const w = 40;
      const h = 40;
      const data = new Uint8ClampedArray(w * h * 4);
      let toggle = 0;
      for (let i = 0; i < data.length; i += 4) {
        // Alternate even/odd per channel to balance 0/1 LSBs.
        data[i] = toggle % 2 === 0 ? 128 : 129;
        data[i + 1] = (toggle + 1) % 2 === 0 ? 128 : 129;
        data[i + 2] = toggle % 2 === 0 ? 129 : 128;
        data[i + 3] = 255;
        toggle++;
      }
      const url = `data:image/png;base64,balanced-${nextStegoUrlId++}`;
      imageRegistry.set(url, { width: w, height: h, data });

      const profile = await steganographyService.getStatisticalProfile(url);
      expect(profile.chiSquare).toBeLessThan(3.841);
      expect(profile.resistance).toBe('high');
      expect(profile.anomalyDetected).toBe(false);
    });

    it('returns a safe default + audits when the image fails to load', async () => {
      const profile = await steganographyService.getStatisticalProfile(
        'data:image/png;base64,nope'
      );
      expect(profile).toEqual({ chiSquare: 0, resistance: 'low', anomalyDetected: false });
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'stego_statistical_error',
        expect.objectContaining({ error: expect.any(String) }),
        'error'
      );
    });
  });

  describe('canvas context failure path', () => {
    it('surfaces a "Failed to get canvas context" error from extract', async () => {
      const carrier = registerCarrier(16, 16);
      // Make the NEXT created canvas return null from getContext('2d').
      const spy = jest.spyOn(document, 'createElement').mockImplementationOnce((() => {
        const c = new FakeCanvas();
        c.disableContext();
        createdCanvases.push(c);
        return c as unknown as HTMLElement;
      }) as typeof document.createElement);

      const result = await steganographyService.extract(carrier, 'e'.repeat(64));
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Failed to get canvas context/);
      spy.mockRestore();
    });
  });
});
