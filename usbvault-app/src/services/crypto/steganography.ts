// PH4-FIX: Moved from services/steganographyService.ts to crypto domain
import { Platform } from 'react-native';
import { auditService } from '@/services/auditService';

/**
 * Result of steganographic embedding operation
 */
export interface StegoResult {
  success: boolean;
  carrierImageDataUrl?: string;  // Base64 data URL of the stego image
  originalSize: number;
  embeddedSize: number;
  capacityUsedPercent: number;
  error?: string;
}

/**
 * Result of steganographic extraction operation
 */
export interface StegoExtractResult {
  success: boolean;
  data?: Uint8Array;
  decryptedText?: string;
  error?: string;
}

/**
 * Capacity information for a carrier image
 */
export interface StegoCapacity {
  maxBytes: number;
  availableBytes: number;
  imageWidth: number;
  imageHeight: number;
}

/**
 * LSB Steganography Service Implementation
 * Embeds encrypted data into PNG images using least significant bit manipulation
 */
class SteganographyServiceImpl {
  private readonly MAGIC_BYTES = 'USVS'; // USBVault Steganography magic bytes
  private readonly HEADER_SIZE = 28; // 4 (magic) + 4 (length) + 12 (IV) + 8 (GCM tag)
  private readonly IV_SIZE = 12;

  /**
   * Calculate maximum embeddable bytes for a carrier image
   * Each pixel (RGB) has 3 bytes × 3 channels = 3 bits per pixel
   * Divide by 8 to get bytes
   */
  async calculateCapacity(imageDataUrl: string): Promise<StegoCapacity> {
    if (Platform.OS !== 'web') {
      return {
        maxBytes: 0,
        availableBytes: 0,
        imageWidth: 0,
        imageHeight: 0,
      };
    }

    try {
      const { width, height } = await this.getImageDimensions(imageDataUrl);
      // 3 bits per pixel (1 bit per RGB channel), 8 bits = 1 byte
      const totalBits = width * height * 3;
      const maxBytes = Math.floor(totalBits / 8);
      const availableBytes = Math.max(0, maxBytes - this.HEADER_SIZE);

      return {
        maxBytes,
        availableBytes,
        imageWidth: width,
        imageHeight: height,
      };
    } catch (error) {
      auditService.log('system', 'stego_capacity_error', {
        error: (error as Error).message,
      }, 'error');
      return {
        maxBytes: 0,
        availableBytes: 0,
        imageWidth: 0,
        imageHeight: 0,
      };
    }
  }

  /**
   * Embed encrypted data into carrier image using LSB steganography
   */
  async embed(
    carrierImageDataUrl: string,
    secretData: Uint8Array,
    encryptionKeyHex: string
  ): Promise<StegoResult> {
    if (Platform.OS !== 'web') {
      return {
        success: false,
        originalSize: 0,
        embeddedSize: 0,
        capacityUsedPercent: 0,
        error: 'Steganography service only available on web platform',
      };
    }

    try {
      // Validate capacity
      const capacity = await this.calculateCapacity(carrierImageDataUrl);
      if (secretData.length > capacity.availableBytes) {
        return {
          success: false,
          originalSize: 0,
          embeddedSize: secretData.length,
          capacityUsedPercent: 100,
          error: `Data too large: ${secretData.length} bytes exceeds capacity of ${capacity.availableBytes} bytes`,
        };
      }

      // Import encryption key
      const keyBytes = this.hexToBytes(encryptionKeyHex);
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes as BufferSource,
        { name: 'AES-GCM' } as any,
        false,
        ['encrypt']
      );

      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(this.IV_SIZE));

      // Encrypt data with AES-256-GCM
      const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv } as any,
        cryptoKey,
        secretData as BufferSource
      );
      const encryptedBytes = new Uint8Array(encryptedData);

      // Build payload: magic (4) + length (4) + IV (12) + encrypted data
      const magicBytes = new TextEncoder().encode(this.MAGIC_BYTES);
      const lengthBytes = new Uint8Array(4);
      new DataView(lengthBytes.buffer).setUint32(0, secretData.length, false);

      const payload = new Uint8Array(
        magicBytes.length + 4 + iv.length + encryptedBytes.length
      );
      let offset = 0;
      payload.set(magicBytes, offset);
      offset += magicBytes.length;
      payload.set(lengthBytes, offset);
      offset += 4;
      payload.set(iv, offset);
      offset += iv.length;
      payload.set(encryptedBytes, offset);

      // Get canvas and image data
      const { canvas, ctx, imageData } = await this.getCanvasWithImage(
        carrierImageDataUrl
      );
      const pixelData = imageData.data;

      // Embed payload into LSBs
      let bitIndex = 0;
      for (let i = 0; i < payload.length; i++) {
        const byte = payload[i];
        for (let bit = 0; bit < 8; bit++) {
          const pixelIndex = bitIndex * 4;
          const bitValue = (byte >> (7 - bit)) & 1;

          // Embed in R channel LSB
          pixelData[pixelIndex] = (pixelData[pixelIndex] & 0xfe) | bitValue;
          bitIndex++;
        }
      }

      // Write modified image data back to canvas
      ctx.putImageData(imageData, 0, 0);
      const stegoImageDataUrl = canvas.toDataURL('image/png');

      const capacityUsedPercent = Math.round(
        (payload.length / capacity.maxBytes) * 100
      );

      auditService.log('system', 'stego_embed_success', {
        embeddedSize: secretData.length,
        payloadSize: payload.length,
        capacityUsedPercent,
        imageWidth: canvas.width,
        imageHeight: canvas.height,
      });

      return {
        success: true,
        carrierImageDataUrl: stegoImageDataUrl,
        originalSize: secretData.length,
        embeddedSize: payload.length,
        capacityUsedPercent,
      };
    } catch (error) {
      const errorMsg = (error as Error).message;
      auditService.log('system', 'stego_embed_error', {
        error: errorMsg,
      }, 'error');
      return {
        success: false,
        originalSize: 0,
        embeddedSize: 0,
        capacityUsedPercent: 0,
        error: `Embedding failed: ${errorMsg}`,
      };
    }
  }

  /**
   * Extract and decrypt data from steganographic image
   */
  async extract(
    stegoImageDataUrl: string,
    decryptionKeyHex: string
  ): Promise<StegoExtractResult> {
    if (Platform.OS !== 'web') {
      return {
        success: false,
        error: 'Steganography service only available on web platform',
      };
    }

    try {
      // Get canvas and image data
      const { imageData } = await this.getCanvasWithImage(stegoImageDataUrl);
      const pixelData = imageData.data;

      // Extract payload from LSBs
      const extractedBits: number[] = [];
      for (let i = 0; i < pixelData.length; i += 4) {
        // Extract from R channel LSB
        const rLsb = pixelData[i] & 1;
        extractedBits.push(rLsb);
      }

      // Convert bits to bytes
      const extractedBytes: number[] = [];
      for (let i = 0; i < extractedBits.length; i += 8) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          byte = (byte << 1) | (extractedBits[i + bit] || 0);
        }
        extractedBytes.push(byte);
      }
      const payload = new Uint8Array(extractedBytes);

      // Parse header
      const magicBytesArray = payload.subarray(0, 4);
      const magicString = new TextDecoder().decode(magicBytesArray);

      if (magicString !== this.MAGIC_BYTES) {
        return {
          success: false,
          error: 'Invalid steganographic image: magic bytes not found',
        };
      }

      const dataLength = new DataView(payload.buffer, 4, 4).getUint32(0, false);
      const iv = payload.subarray(8, 8 + this.IV_SIZE);
      const encryptedData = payload.subarray(8 + this.IV_SIZE);

      // Validate data length
      if (dataLength <= 0 || dataLength > encryptedData.length) {
        return {
          success: false,
          error: 'Invalid data length in steganographic header',
        };
      }

      // Import decryption key
      const keyBytes = this.hexToBytes(decryptionKeyHex);
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes as BufferSource,
        { name: 'AES-GCM' } as any,
        false,
        ['decrypt']
      );

      // Decrypt data
      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv } as any,
        cryptoKey,
        encryptedData as BufferSource
      );
      const decryptedBytes = new Uint8Array(decryptedData).subarray(
        0,
        dataLength
      );

      auditService.log('system', 'stego_extract_success', {
        extractedSize: dataLength,
      });

      return {
        success: true,
        data: decryptedBytes,
      };
    } catch (error) {
      const errorMsg = (error as Error).message;
      auditService.log('system', 'stego_extract_error', {
        error: errorMsg,
      }, 'error');
      return {
        success: false,
        error: `Extraction failed: ${errorMsg}`,
      };
    }
  }

  /**
   * Convenience wrapper: embed plaintext into image
   */
  async embedText(
    carrierImageDataUrl: string,
    plaintext: string,
    encryptionKeyHex: string
  ): Promise<StegoResult> {
    const textBytes = new TextEncoder().encode(plaintext);
    return this.embed(carrierImageDataUrl, textBytes, encryptionKeyHex);
  }

  /**
   * Convenience wrapper: extract plaintext from image
   */
  async extractText(
    stegoImageDataUrl: string,
    decryptionKeyHex: string
  ): Promise<StegoExtractResult> {
    const result = await this.extract(stegoImageDataUrl, decryptionKeyHex);

    if (result.success && result.data) {
      try {
        const decryptedText = new TextDecoder().decode(result.data);
        return {
          success: true,
          data: result.data,
          decryptedText,
        };
      } catch (error) {
        return {
          success: false,
          error: 'Failed to decode extracted data as text',
        };
      }
    }

    return result;
  }

  /**
   * Generate a random 256-bit encryption key
   */
  generateEmbeddingKey(): string {
    const keyBytes = crypto.getRandomValues(new Uint8Array(32)); // 256 bits
    return this.bytesToHex(keyBytes);
  }

  /**
   * Detect steganographic content by checking for magic bytes
   */
  async detectStego(imageDataUrl: string): Promise<boolean> {
    if (Platform.OS !== 'web') {
      return false;
    }

    try {
      const { imageData } = await this.getCanvasWithImage(imageDataUrl);
      const pixelData = imageData.data;

      // Extract first 32 bits for magic bytes
      const magicBits: number[] = [];
      for (let i = 0; i < 32 && i < pixelData.length; i += 4) {
        magicBits.push(pixelData[i] & 1);
      }

      // Convert to bytes
      const magicBytes: number[] = [];
      for (let i = 0; i < magicBits.length; i += 8) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          byte = (byte << 1) | (magicBits[i + bit] || 0);
        }
        magicBytes.push(byte);
      }

      const extractedMagic = new TextDecoder().decode(
        new Uint8Array(magicBytes)
      );
      return extractedMagic === this.MAGIC_BYTES;
    } catch (error) {
      return false;
    }
  }

  /**
   * Chi-square analysis of LSB distribution (statistical stego resistance metric)
   */
  async getStatisticalProfile(imageDataUrl: string): Promise<{
    chiSquare: number;
    resistance: 'low' | 'medium' | 'high';
    anomalyDetected: boolean;
  }> {
    if (Platform.OS !== 'web') {
      return {
        chiSquare: 0,
        resistance: 'low',
        anomalyDetected: false,
      };
    }

    try {
      const { imageData } = await this.getCanvasWithImage(imageDataUrl);
      const pixelData = imageData.data;

      // Collect LSB values for all RGB channels
      const lsbValues: number[] = [];
      for (let i = 0; i < pixelData.length; i += 4) {
        // R, G, B channels (skip alpha)
        lsbValues.push(pixelData[i] & 1);
        lsbValues.push(pixelData[i + 1] & 1);
        lsbValues.push(pixelData[i + 2] & 1);
      }

      // Calculate chi-square statistic for 0/1 distribution
      // Expected: ~50% zeros, ~50% ones
      const zeroCount = lsbValues.filter((bit) => bit === 0).length;
      const oneCount = lsbValues.length - zeroCount;
      const expected = lsbValues.length / 2;

      const chiSquare =
        Math.pow(zeroCount - expected, 2) / expected +
        Math.pow(oneCount - expected, 2) / expected;

      // Chi-square critical value at 0.05 significance level: ~3.841
      // Higher chi-square = more anomalous = potential stego content
      const anomalyDetected = chiSquare > 10;

      let resistance: 'low' | 'medium' | 'high';
      if (chiSquare < 3.841) {
        resistance = 'high'; // Natural variation
      } else if (chiSquare < 10) {
        resistance = 'medium'; // Some anomaly
      } else {
        resistance = 'low'; // Significant anomaly
      }

      auditService.log('system', 'stego_statistical_analysis', {
        chiSquare: chiSquare.toFixed(2),
        resistance,
        anomalyDetected,
        sampleSize: lsbValues.length,
      });

      return {
        chiSquare,
        resistance,
        anomalyDetected,
      };
    } catch (error) {
      auditService.log('system', 'stego_statistical_error', {
        error: (error as Error).message,
      }, 'error');
      return {
        chiSquare: 0,
        resistance: 'low',
        anomalyDetected: false,
      };
    }
  }

  /**
   * Get canvas and image data from image data URL
   */
  private async getCanvasWithImage(
    imageDataUrl: string
  ): Promise<{
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    imageData: ImageData;
  }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        resolve({ canvas, ctx, imageData });
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = imageDataUrl;
    });
  }

  /**
   * Get image dimensions from data URL
   */
  private getImageDimensions(
    imageDataUrl: string
  ): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = imageDataUrl;
    });
  }

  /**
   * Convert hex string to Uint8Array
   */
  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Convert Uint8Array to hex string
   */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

/**
 * Singleton instance of the steganography service
 */
export const steganographyService = new SteganographyServiceImpl();
