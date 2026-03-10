/**
 * passwordService.ts — Encrypted password manager persistence
 *
 * Stores password entries in localStorage with AES-GCM encryption
 * derived from a fixed key (in production this would use the vault master key).
 * Also provides a secure random password generator.
 */

import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';
const STORAGE_KEY = 'qav:passwords';

export interface PasswordEntry {
  id: string;
  title: string;
  username: string;
  password: string;
  url: string;
  category: string;
  strength: 'Strong' | 'Medium' | 'Weak';
  createdAt: string;
  lastModified: string;
}

// ── Encryption helpers (AES-GCM via WebCrypto) ────────────────

async function getDerivedKey(): Promise<CryptoKey | null> {
  if (!isWeb || typeof crypto === 'undefined' || !crypto.subtle) return null;
  try {
    // Derive a key from the app namespace (in production, use vault master key)
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode('qav-password-manager-key-v1'),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    return await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: encoder.encode('qav-pw-salt'), iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  } catch {
    return null;
  }
}

async function encryptData(data: string): Promise<string> {
  const key = await getDerivedKey();
  if (!key) return btoa(data); // Fallback to base64 if no WebCrypto
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return Array.from(combined).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function decryptData(hex: string): Promise<string> {
  // Try hex decryption first
  const key = await getDerivedKey();
  if (!key) {
    // Fallback from base64
    try { return atob(hex); } catch { return hex; }
  }
  try {
    const bytes = new Uint8Array(hex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);
    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plainBuffer);
  } catch {
    // If decryption fails, might be legacy base64 data
    try { return atob(hex); } catch { return hex; }
  }
}

// ── CRUD operations ───────────────────────────────────────────

async function loadEntries(): Promise<PasswordEntry[]> {
  if (!isWeb) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const decrypted = await decryptData(raw);
    return JSON.parse(decrypted);
  } catch {
    return [];
  }
}

async function saveEntries(entries: PasswordEntry[]): Promise<void> {
  if (!isWeb) return;
  try {
    const json = JSON.stringify(entries);
    const encrypted = await encryptData(json);
    localStorage.setItem(STORAGE_KEY, encrypted);
  } catch {
    // Silent fail
  }
}

async function addEntry(entry: Omit<PasswordEntry, 'id' | 'createdAt' | 'lastModified'>): Promise<PasswordEntry> {
  const entries = await loadEntries();
  const newEntry: PasswordEntry = {
    ...entry,
    id: `pw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
  };
  entries.unshift(newEntry);
  await saveEntries(entries);
  return newEntry;
}

async function updateEntry(id: string, updates: Partial<Omit<PasswordEntry, 'id' | 'createdAt'>>): Promise<PasswordEntry | null> {
  const entries = await loadEntries();
  const index = entries.findIndex(e => e.id === id);
  if (index === -1) return null;
  entries[index] = { ...entries[index], ...updates, lastModified: new Date().toISOString() };
  await saveEntries(entries);
  return entries[index];
}

async function deleteEntry(id: string): Promise<boolean> {
  const entries = await loadEntries();
  const filtered = entries.filter(e => e.id !== id);
  if (filtered.length === entries.length) return false;
  await saveEntries(filtered);
  return true;
}

async function getCount(): Promise<number> {
  const entries = await loadEntries();
  return entries.length;
}

// ── Password generator ────────────────────────────────────────

const CHARSET_LOWER = 'abcdefghijklmnopqrstuvwxyz';
const CHARSET_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CHARSET_DIGITS = '0123456789';
const CHARSET_SYMBOLS = '!@#$%^&*()-_=+[]{}|;:,.<>?';

export interface GeneratorOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
}

function generatePassword(options: GeneratorOptions = { length: 20, uppercase: true, lowercase: true, digits: true, symbols: true }): string {
  let charset = '';
  const required: string[] = [];

  if (options.lowercase) { charset += CHARSET_LOWER; required.push(CHARSET_LOWER); }
  if (options.uppercase) { charset += CHARSET_UPPER; required.push(CHARSET_UPPER); }
  if (options.digits) { charset += CHARSET_DIGITS; required.push(CHARSET_DIGITS); }
  if (options.symbols) { charset += CHARSET_SYMBOLS; required.push(CHARSET_SYMBOLS); }

  if (!charset) charset = CHARSET_LOWER + CHARSET_UPPER + CHARSET_DIGITS;

  const length = Math.max(options.length, required.length, 8);
  const result: string[] = [];

  // Use crypto.getRandomValues for secure randomness
  const randomValues = new Uint32Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomValues);
  } else {
    for (let i = 0; i < length; i++) randomValues[i] = Math.floor(Math.random() * 0xFFFFFFFF);
  }

  // Ensure at least one from each required character set
  required.forEach((set, i) => {
    result[i] = set[randomValues[i] % set.length];
  });

  // Fill remaining with random chars from full charset
  for (let i = required.length; i < length; i++) {
    result[i] = charset[randomValues[i] % charset.length];
  }

  // Fisher-Yates shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomValues[i] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.join('');
}

// ── Export singleton ──────────────────────────────────────────

export const passwordService = {
  loadEntries,
  saveEntries,
  addEntry,
  updateEntry,
  deleteEntry,
  getCount,
  generatePassword,
};
