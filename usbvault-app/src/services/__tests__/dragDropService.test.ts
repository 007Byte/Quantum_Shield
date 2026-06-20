/**
 * Drag & Drop Service Tests — Utility/UX
 *
 * Tests file validation, configuration management, upload history,
 * file processing, and format helpers.
 */

import { dragDropService } from '../dragDropService';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock React Native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock audit service
jest.mock('@/services/auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock generateId
jest.mock('@/utils/generateId', () => ({
  generateId: jest.fn((prefix: string) => `${prefix}-test-${Date.now()}`),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  },
}));

describe('DragDropService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  // ============================================================================
  // Test: File Validation
  // ============================================================================
  describe('validateFile', () => {
    it('should accept valid PDF file', () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      const result = dragDropService.validateFile(file);
      expect(result.valid).toBe(true);
    });

    it('should accept valid image file', () => {
      const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' });
      const result = dragDropService.validateFile(file);
      expect(result.valid).toBe(true);
    });

    it('should reject file exceeding max size', () => {
      // Create a mock file that reports large size
      const file = {
        name: 'huge.pdf',
        size: 200 * 1024 * 1024, // 200MB
        type: 'application/pdf',
        lastModified: Date.now(),
      } as File;

      const result = dragDropService.validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds limit');
    });

    it('should reject unsupported file type', () => {
      const file = new File(['content'], 'script.exe', { type: 'application/x-msdownload' });
      const result = dragDropService.validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not allowed');
    });

    it('should accept zero-size file of valid type', () => {
      const file = new File([], 'empty.txt', { type: 'text/plain' });
      const result = dragDropService.validateFile(file);
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Test: File Processing
  // ============================================================================
  describe('processFiles', () => {
    it('should assign IDs to processed files', async () => {
      const files = [
        {
          name: 'test.pdf',
          size: 1024,
          type: 'application/pdf',
          lastModified: Date.now(),
          arrayBuffer: new ArrayBuffer(1024),
        },
      ];

      const processed = await dragDropService.processFiles(files);

      expect(processed).toHaveLength(1);
      expect(processed[0].id).toBeDefined();
      expect(processed[0].name).toBe('test.pdf');
      expect(processed[0].size).toBe(1024);
    });

    it('should handle empty file array', async () => {
      const processed = await dragDropService.processFiles([]);
      expect(processed).toEqual([]);
    });

    it('should preserve file metadata during processing', async () => {
      const lastMod = Date.now() - 86400000;
      const files = [
        {
          name: 'doc.docx',
          size: 2048,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          lastModified: lastMod,
          arrayBuffer: new ArrayBuffer(2048),
        },
      ];

      const processed = await dragDropService.processFiles(files);

      expect(processed[0].type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(processed[0].lastModified).toBe(lastMod);
    });
  });

  // ============================================================================
  // Test: Configuration
  // ============================================================================
  describe('configuration', () => {
    it('should return default config', () => {
      const config = dragDropService.getConfig();

      expect(config.maxFileSize).toBe(100 * 1024 * 1024);
      expect(config.autoEncrypt).toBe(true);
      expect(config.allowedTypes.length).toBeGreaterThan(0);
    });

    it('should update config partially', () => {
      dragDropService.updateConfig({ maxFileSize: 50 * 1024 * 1024 });

      const config = dragDropService.getConfig();
      expect(config.maxFileSize).toBe(50 * 1024 * 1024);
      expect(config.autoEncrypt).toBe(true); // Unchanged
    });

    it('should persist config to localStorage', () => {
      dragDropService.updateConfig({ autoEncrypt: false });

      const stored = localStorage.getItem('usbvault:dragdrop_config');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.autoEncrypt).toBe(false);
    });
  });

  // ============================================================================
  // Test: Upload History
  // ============================================================================
  describe('upload history', () => {
    it('should return empty history initially', () => {
      const history = dragDropService.getUploadHistory();
      expect(history).toEqual([]);
    });

    it('should clear history', () => {
      localStorage.setItem(
        'usbvault:upload_history',
        JSON.stringify([{ id: 'test', timestamp: new Date().toISOString() }])
      );

      dragDropService.clearHistory();

      const stored = localStorage.getItem('usbvault:upload_history');
      expect(stored).toBeNull();
    });
  });

  // ============================================================================
  // Test: File Size Formatting
  // ============================================================================
  describe('formatFileSize', () => {
    it('should format zero bytes', () => {
      expect(dragDropService.formatFileSize(0)).toBe('0 B');
    });

    it('should format bytes', () => {
      expect(dragDropService.formatFileSize(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(dragDropService.formatFileSize(1024)).toBe('1 KB');
    });

    it('should format megabytes', () => {
      expect(dragDropService.formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
    });

    it('should format gigabytes with decimals', () => {
      const result = dragDropService.formatFileSize(1.5 * 1024 * 1024 * 1024);
      expect(result).toBe('1.5 GB');
    });
  });

  // ============================================================================
  // Test: Supported Types
  // ============================================================================
  describe('getSupportedTypes', () => {
    it('should return array of MIME types', () => {
      const types = dragDropService.getSupportedTypes();

      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
      expect(types).toContain('application/pdf');
      expect(types).toContain('image/jpeg');
      expect(types).toContain('text/plain');
    });

    it('should return a copy (not a reference)', () => {
      const types1 = dragDropService.getSupportedTypes();
      const types2 = dragDropService.getSupportedTypes();
      expect(types1).not.toBe(types2);
    });
  });

  // ============================================================================
  // Test: handleDrop
  // ============================================================================
  describe('handleDrop', () => {
    it('should return empty result when no dataTransfer', async () => {
      const event = { dataTransfer: null } as DragEvent;
      const result = await dragDropService.handleDrop(event);

      expect(result.files).toEqual([]);
      expect(result.accepted).toBe(0);
      expect(result.rejected).toBe(0);
    });

    it('should return empty result when no files in dataTransfer', async () => {
      const event = {
        dataTransfer: { files: [] },
      } as unknown as DragEvent;

      const result = await dragDropService.handleDrop(event);

      expect(result.files).toEqual([]);
      expect(result.totalSize).toBe(0);
    });
  });
});
