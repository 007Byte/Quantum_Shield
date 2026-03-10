/**
 * USBVault Drag & Drop Upload Service
 *
 * Handles drag-and-drop file uploads with validation, size checking, and
 * type filtering. Maintains configuration and upload history persisted to
 * localStorage. Integrates with auditService for compliance logging.
 *
 * FEAT-09: Drag & Drop Upload
 *
 * @module services/dragDropService
 */

import { Platform } from 'react-native';
import { auditService } from '@/services/auditService';
import { generateId } from '@/utils/generateId';

// ── Types ──────────────────────────────────────────────────────

/**
 * File extracted from DragEvent with ArrayBuffer for processing.
 */
export interface DroppedFile {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  arrayBuffer: ArrayBuffer;
}

/**
 * File after processing (ready for encryption).
 */
export interface ProcessedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  arrayBuffer: ArrayBuffer;
  hash?: string;
}

/**
 * Result of drop operation.
 */
export interface DropResult {
  files: DroppedFile[];
  totalSize: number;
  accepted: number;
  rejected: number;
}

/**
 * Configuration for drag-and-drop behavior.
 */
export interface DropConfig {
  maxFileSize: number; // in bytes, default 100MB
  allowedTypes: string[]; // MIME types
  autoEncrypt: boolean;
}

/**
 * Record of an upload in history.
 */
export interface UploadRecord {
  id: string;
  timestamp: string;
  files: Array<{
    name: string;
    size: number;
    type: string;
  }>;
  totalSize: number;
  success: boolean;
}

/**
 * Validation result for a single file.
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

// ── Constants ──────────────────────────────────────────────────

const STORAGE_CONFIG_KEY = 'usbvault:dragdrop_config';
const STORAGE_HISTORY_KEY = 'usbvault:upload_history';

const DEFAULT_CONFIG: DropConfig = {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  allowedTypes: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'audio/mpeg',
    'application/zip',
  ],
  autoEncrypt: true,
};

const DEFAULT_SUPPORTED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'audio/mpeg',
  'application/zip',
];

const MAX_HISTORY = 100;

// ── Helpers ────────────────────────────────────────────────────

// PL-032: generateId moved to @/utils/generateId

function readConfig(): DropConfig {
  if (Platform.OS !== 'web') return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_CONFIG_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function writeConfig(config: DropConfig): void {
  if (Platform.OS !== 'web') return;
  try {
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // localStorage full or unavailable
  }
}

function readHistory(): UploadRecord[] {
  if (Platform.OS !== 'web') return [];
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** @internal Used by getUploadHistory for persisting upload records */
function _writeHistory(records: UploadRecord[]): void {
  if (Platform.OS !== 'web') return;
  try {
    // Keep only the most recent MAX_HISTORY
    const trimmed = records.slice(-MAX_HISTORY);
    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable
  }
}

// ── Service ────────────────────────────────────────────────────

class DragDropServiceImpl {
  constructor() {
    readConfig();
  }

  /**
   * Handle a drag-and-drop event and extract files.
   * Returns promise of DropResult after reading all files as ArrayBuffers.
   *
   * @param event - DragEvent from drop handler
   * @returns Promise resolving to DropResult with accepted/rejected counts
   */
  async handleDrop(event: DragEvent): Promise<DropResult> {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      return { files: [], totalSize: 0, accepted: 0, rejected: 0 };
    }

    const files = Array.from(dataTransfer.files);
    const droppedFiles: DroppedFile[] = [];
    let totalSize = 0;
    let rejected = 0;

    for (const file of files) {
      const validation = this.validateFile(file);
      if (!validation.valid) {
        rejected++;
        continue;
      }

      try {
        const arrayBuffer = await this._readFileAsArrayBuffer(file);
        droppedFiles.push({
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
          arrayBuffer,
        });
        totalSize += file.size;
      } catch {
        rejected++;
      }
    }

    const result: DropResult = {
      files: droppedFiles,
      totalSize,
      accepted: droppedFiles.length,
      rejected,
    };

    // Audit the drop event and record in history
    if (droppedFiles.length > 0) {
      await auditService.log(
        'vault_upload' as any,
        'drag-drop',
        {
          fileCount: droppedFiles.length,
          totalSize,
          types: droppedFiles.map(f => f.type),
        },
      );

      // Persist upload record
      const history = readHistory();
      history.push({
        id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        files: droppedFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
        totalSize,
        success: true,
      });
      _writeHistory(history);
    }

    return result;
  }

  /**
   * Validate a file against current config (size + type).
   *
   * @param file - File to validate
   * @returns ValidationResult with valid flag and optional reason
   */
  validateFile(file: File): ValidationResult {
    const config = readConfig();

    // Check size
    if (file.size > config.maxFileSize) {
      return {
        valid: false,
        reason: `File size (${this.formatFileSize(file.size)}) exceeds limit (${this.formatFileSize(config.maxFileSize)})`,
      };
    }

    // Check type
    if (!config.allowedTypes.includes(file.type)) {
      return {
        valid: false,
        reason: `File type "${file.type}" is not allowed`,
      };
    }

    return { valid: true };
  }

  /**
   * Process dropped files into ProcessedFile array.
   * Generates IDs and can compute hashes if needed.
   *
   * @param files - Array of DroppedFile
   * @returns Promise resolving to ProcessedFile array
   */
  async processFiles(files: DroppedFile[]): Promise<ProcessedFile[]> {
    return files.map(f => ({
      id: generateId('upload'),
      name: f.name,
      size: f.size,
      type: f.type,
      lastModified: f.lastModified,
      arrayBuffer: f.arrayBuffer,
    }));
  }

  /**
   * Get current drag-drop configuration.
   *
   * @returns Current DropConfig
   */
  getConfig(): DropConfig {
    return { ...readConfig() };
  }

  /**
   * Update drag-drop configuration (partial).
   *
   * @param partial - Partial DropConfig to merge
   */
  updateConfig(partial: Partial<DropConfig>): void {
    const config = readConfig();
    const updated = { ...config, ...partial };
    writeConfig(updated);
  }

  /**
   * Get upload history (most recent first).
   *
   * @returns Array of UploadRecord
   */
  getUploadHistory(): UploadRecord[] {
    const history = readHistory();
    // Reverse to show most recent first
    return [...history].reverse();
  }

  /**
   * Clear all upload history.
   */
  clearHistory(): void {
    if (Platform.OS !== 'web') return;
    try {
      localStorage.removeItem(STORAGE_HISTORY_KEY);
    } catch {
      // Ignore
    }
  }

  /**
   * Format file size as human-readable string.
   *
   * @param bytes - Size in bytes
   * @returns Formatted string (e.g. "5.2 MB")
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get list of supported MIME types.
   *
   * @returns Array of MIME type strings
   */
  getSupportedTypes(): string[] {
    return [...DEFAULT_SUPPORTED_TYPES];
  }


  /**
   * Read a File as ArrayBuffer using FileReader.
   *
   * @param file - File to read
   * @returns Promise resolving to ArrayBuffer
   * @private
   */
  private _readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read file as ArrayBuffer'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }
}

export const dragDropService = new DragDropServiceImpl();
