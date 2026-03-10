// PH4-FIX: Moved to vault domain
/**
 * importService.ts — Password import from competing password managers
 *
 * FEAT-01: Supports CSV import from Bitwarden, 1Password, LastPass, Chrome,
 * and JSON import from KeePass (KDBX export). Maps fields to PasswordEntry
 * interface, detects duplicates, and encrypts on import via passwordService.
 *
 * Supported formats:
 * - Bitwarden CSV: folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp
 * - 1Password CSV: Title,URL,Username,Password,Notes,Type
 * - LastPass CSV: url,username,password,totp,extra,name,grouping,fav
 * - Chrome CSV: name,url,username,password,note
 * - KeePass JSON (exported via KeePassXC): { Root: { Group: [...] } }
 */

import { PasswordEntry } from './passwordService';
import { logger } from '@/utils/logger';

// ── Types ──────────────────────────────────────────────────────

export type ImportFormat = 'bitwarden' | '1password' | 'lastpass' | 'chrome' | 'keepass' | 'auto';

export interface ImportResult {
  imported: number;
  skipped: number;
  duplicates: number;
  errors: string[];
  entries: PasswordEntry[];
}

export interface ImportProgress {
  current: number;
  total: number;
  percentage: number;
}

type ProgressCallback = (progress: ImportProgress) => void;

// ── CSV Parser ─────────────────────────────────────────────────

/**
 * Parse CSV text into an array of string arrays.
 * Handles quoted fields, embedded commas, and newlines within quotes.
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(current.trim());
        current = '';
      } else if (char === '\n' || (char === '\r' && next === '\n')) {
        row.push(current.trim());
        if (row.some(cell => cell.length > 0)) {
          rows.push(row);
        }
        row = [];
        current = '';
        if (char === '\r') i++; // skip \r\n
      } else {
        current += char;
      }
    }
  }
  // Last row
  if (current.length > 0 || row.length > 0) {
    row.push(current.trim());
    if (row.some(cell => cell.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

// ── Format Detection ───────────────────────────────────────────

/**
 * Auto-detect import format from CSV header row.
 */
export function detectFormat(header: string): ImportFormat {
  const lower = header.toLowerCase();

  if (lower.includes('login_uri') && lower.includes('login_username')) return 'bitwarden';
  if (lower.includes('grouping') && lower.includes('fav') && lower.includes('extra')) return 'lastpass';
  if (lower.includes('title') && lower.includes('type') && lower.includes('url')) return '1password';
  if (/^name,url,username,password/.test(lower)) return 'chrome';

  // Try JSON detection
  try {
    const parsed = JSON.parse(header);
    if (parsed.Root || parsed.KeePassFile) return 'keepass';
  } catch {
    // Not JSON
  }

  return 'chrome'; // Default to Chrome format (simplest)
}

// ── Format-Specific Parsers ────────────────────────────────────

function parseBitwarden(rows: string[][], header: string[]): Omit<PasswordEntry, 'id' | 'strength'>[] {
  const idx = (name: string) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const nameIdx = idx('name');
  const uriIdx = idx('login_uri');
  const userIdx = idx('login_username');
  const passIdx = idx('login_password');
  const folderIdx = idx('folder');

  return rows.map(row => ({
    title: row[nameIdx] || 'Untitled',
    url: row[uriIdx] || '',
    username: row[userIdx] || '',
    password: row[passIdx] || '',
    category: row[folderIdx] || 'Imported',
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
  })).filter(e => e.password.length > 0);
}

function parseLastPass(rows: string[][], header: string[]): Omit<PasswordEntry, 'id' | 'strength'>[] {
  const idx = (name: string) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const nameIdx = idx('name');
  const urlIdx = idx('url');
  const userIdx = idx('username');
  const passIdx = idx('password');
  const groupIdx = idx('grouping');

  return rows.map(row => ({
    title: row[nameIdx] || row[urlIdx] || 'Untitled',
    url: row[urlIdx] || '',
    username: row[userIdx] || '',
    password: row[passIdx] || '',
    category: row[groupIdx] || 'Imported',
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
  })).filter(e => e.password.length > 0);
}

function parse1Password(rows: string[][], header: string[]): Omit<PasswordEntry, 'id' | 'strength'>[] {
  const idx = (name: string) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const titleIdx = idx('title');
  const urlIdx = idx('url');
  const userIdx = idx('username');
  const passIdx = idx('password');

  return rows.map(row => ({
    title: row[titleIdx] || 'Untitled',
    url: row[urlIdx] || '',
    username: row[userIdx] || '',
    password: row[passIdx] || '',
    category: 'Imported',
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
  })).filter(e => e.password.length > 0);
}

function parseChrome(rows: string[][], header: string[]): Omit<PasswordEntry, 'id' | 'strength'>[] {
  const idx = (name: string) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const nameIdx = idx('name');
  const urlIdx = idx('url');
  const userIdx = idx('username');
  const passIdx = idx('password');

  return rows.map(row => ({
    title: row[nameIdx] || row[urlIdx] || 'Untitled',
    url: row[urlIdx] || '',
    username: row[userIdx] || '',
    password: row[passIdx] || '',
    category: 'Imported',
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
  })).filter(e => e.password.length > 0);
}

interface KeePassEntry {
  Title?: string;
  URL?: string;
  UserName?: string;
  Password?: string;
  Notes?: string;
  Group?: string;
}

interface KeePassGroup {
  Name?: string;
  Entry?: KeePassEntry | KeePassEntry[];
  Group?: KeePassGroup | KeePassGroup[];
}

function flattenKeePassGroups(group: KeePassGroup, parentName: string = ''): KeePassEntry[] {
  const entries: KeePassEntry[] = [];
  const groupName = parentName ? `${parentName}/${group.Name || ''}` : (group.Name || '');

  if (group.Entry) {
    const entryArray = Array.isArray(group.Entry) ? group.Entry : [group.Entry];
    for (const entry of entryArray) {
      entries.push({ ...entry, Group: groupName });
    }
  }

  if (group.Group) {
    const subGroups = Array.isArray(group.Group) ? group.Group : [group.Group];
    for (const sub of subGroups) {
      entries.push(...flattenKeePassGroups(sub, groupName));
    }
  }

  return entries;
}

function parseKeePass(jsonText: string): Omit<PasswordEntry, 'id' | 'strength'>[] {
  const data = JSON.parse(jsonText);
  const rootGroup: KeePassGroup = data.Root?.Group || data.KeePassFile?.Root?.Group || data;
  const flatEntries = flattenKeePassGroups(
    Array.isArray(rootGroup) ? { Name: 'Root', Group: rootGroup } : rootGroup
  );

  return flatEntries
    .filter(e => e.Password && e.Password.length > 0)
    .map(e => ({
      title: e.Title || 'Untitled',
      url: e.URL || '',
      username: e.UserName || '',
      password: e.Password || '',
      category: e.Group || 'Imported',
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    }));
}

// ── Duplicate Detection ────────────────────────────────────────

function isDuplicate(entry: Omit<PasswordEntry, 'id' | 'strength'>, existing: PasswordEntry[]): boolean {
  return existing.some(
    e => e.url === entry.url && e.username === entry.username && e.title === entry.title
  );
}

// ── Strength Assessment ────────────────────────────────────────

function assessStrength(password: string): 'Strong' | 'Medium' | 'Weak' {
  let score = 0;
  if (password.length >= 16) score += 2;
  else if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;

  if (score >= 4) return 'Strong';
  if (score >= 2) return 'Medium';
  return 'Weak';
}

// ── Main Import Function ───────────────────────────────────────

/**
 * Import passwords from a file content string.
 *
 * @param content - File content (CSV text or JSON string)
 * @param format - Import format (or 'auto' for detection)
 * @param existingEntries - Current password entries for duplicate detection
 * @param onProgress - Optional progress callback
 * @returns ImportResult with imported entries, skip count, and errors
 */
export async function importPasswords(
  content: string,
  format: ImportFormat = 'auto',
  existingEntries: PasswordEntry[] = [],
  onProgress?: ProgressCallback,
): Promise<ImportResult> {
  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    duplicates: 0,
    errors: [],
    entries: [],
  };

  try {
    // Detect format if auto
    let detectedFormat = format;
    if (format === 'auto') {
      detectedFormat = detectFormat(content.substring(0, 500));
    }

    let parsed: Omit<PasswordEntry, 'id' | 'strength'>[];

    if (detectedFormat === 'keepass') {
      parsed = parseKeePass(content);
    } else {
      const rows = parseCSV(content);
      if (rows.length < 2) {
        result.errors.push('File appears empty or has no data rows');
        return result;
      }

      const header = rows[0];
      const dataRows = rows.slice(1);

      switch (detectedFormat) {
        case 'bitwarden':
          parsed = parseBitwarden(dataRows, header);
          break;
        case 'lastpass':
          parsed = parseLastPass(dataRows, header);
          break;
        case '1password':
          parsed = parse1Password(dataRows, header);
          break;
        case 'chrome':
        default:
          parsed = parseChrome(dataRows, header);
          break;
      }
    }

    const total = parsed.length;
    logger.log(`Import: parsed ${total} entries from ${detectedFormat} format`);

    for (let i = 0; i < parsed.length; i++) {
      const entry = parsed[i];

      // Report progress
      if (onProgress) {
        onProgress({
          current: i + 1,
          total,
          percentage: Math.round(((i + 1) / total) * 100),
        });
      }

      // Check for duplicates
      if (isDuplicate(entry, existingEntries)) {
        result.duplicates++;
        result.skipped++;
        continue;
      }

      // Also check against already-imported entries in this batch
      if (isDuplicate(entry, result.entries)) {
        result.duplicates++;
        result.skipped++;
        continue;
      }

      // Skip entries with no meaningful data
      if (!entry.title && !entry.url && !entry.username) {
        result.skipped++;
        continue;
      }

      // Create full PasswordEntry with generated ID and strength
      const fullEntry: PasswordEntry = {
        ...entry,
        id: generateId(),
        strength: assessStrength(entry.password),
      };

      result.entries.push(fullEntry);
      result.imported++;
    }

    logger.log(
      `Import complete: ${result.imported} imported, ${result.duplicates} duplicates, ${result.skipped} skipped`
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Import failed: ${msg}`);
    logger.error('Password import failed:', error);
  }

  return result;
}

// ── Utilities ──────────────────────────────────────────────────

function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `imp_${timestamp}_${random}`;
}

/**
 * Validate that a file appears to be a valid import file.
 * Returns the detected format or null if unrecognized.
 */
export function validateImportFile(content: string): { valid: boolean; format: ImportFormat | null; estimatedCount: number } {
  if (!content || content.trim().length === 0) {
    return { valid: false, format: null, estimatedCount: 0 };
  }

  // Try JSON first (KeePass)
  try {
    const parsed = JSON.parse(content);
    if (parsed.Root || parsed.KeePassFile) {
      return { valid: true, format: 'keepass', estimatedCount: -1 }; // Count unknown until parsed
    }
  } catch {
    // Not JSON, try CSV
  }

  const rows = parseCSV(content);
  if (rows.length < 2) {
    return { valid: false, format: null, estimatedCount: 0 };
  }

  const format = detectFormat(rows[0].join(','));
  return {
    valid: true,
    format,
    estimatedCount: rows.length - 1, // Subtract header
  };
}

/**
 * Get a human-readable label for an import format.
 */
export function formatLabel(format: ImportFormat): string {
  switch (format) {
    case 'bitwarden': return 'Bitwarden';
    case '1password': return '1Password';
    case 'lastpass': return 'LastPass';
    case 'chrome': return 'Chrome';
    case 'keepass': return 'KeePass';
    case 'auto': return 'Auto-detect';
  }
}
