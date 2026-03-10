/**
 * USBVault Keyboard Shortcuts Service
 *
 * Manages global keyboard shortcuts with customizable bindings, conflict
 * detection, and category organization. Supports enable/disable per shortcut
 * and full reset to defaults. Integrates with window keydown listener.
 *
 * FEAT-11: Keyboard Shortcuts
 *
 * @module services/keyboardShortcutService
 */

import { Platform } from 'react-native';

// ── Types ──────────────────────────────────────────────────────

/**
 * Keyboard shortcut definition.
 */
export interface Shortcut {
  id: string;
  keys: string; // e.g. 'Ctrl+E', 'Shift+Ctrl+L', 'Escape'
  action: string; // e.g. 'encrypt_selected', 'lock_vault'
  description: string;
  enabled: boolean;
  category: string; // e.g. 'file', 'vault', 'navigation'
}

/**
 * Default shortcut bindings.
 */
type DefaultShortcutId =
  | 'encrypt_selected'
  | 'decrypt_selected'
  | 'global_search'
  | 'lock_vault'
  | 'new_secure_note'
  | 'toggle_sidebar'
  | 'open_settings'
  | 'close_modal'
  | 'secure_delete'
  | 'show_shortcuts_help';

const DEFAULT_SHORTCUTS: Record<DefaultShortcutId, Omit<Shortcut, 'id'>> = {
  encrypt_selected: {
    keys: 'Ctrl+E',
    action: 'encrypt_selected',
    description: 'Encrypt selected files',
    enabled: true,
    category: 'file',
  },
  decrypt_selected: {
    keys: 'Ctrl+D',
    action: 'decrypt_selected',
    description: 'Decrypt selected files',
    enabled: true,
    category: 'file',
  },
  global_search: {
    keys: 'Ctrl+K',
    action: 'global_search',
    description: 'Global search / command palette',
    enabled: true,
    category: 'navigation',
  },
  lock_vault: {
    keys: 'Ctrl+Shift+L',
    action: 'lock_vault',
    description: 'Lock vault',
    enabled: true,
    category: 'vault',
  },
  new_secure_note: {
    keys: 'Ctrl+Shift+N',
    action: 'new_secure_note',
    description: 'Create new secure note',
    enabled: true,
    category: 'file',
  },
  toggle_sidebar: {
    keys: 'Ctrl+B',
    action: 'toggle_sidebar',
    description: 'Toggle sidebar',
    enabled: true,
    category: 'navigation',
  },
  open_settings: {
    keys: 'Ctrl+,',
    action: 'open_settings',
    description: 'Open settings',
    enabled: true,
    category: 'navigation',
  },
  close_modal: {
    keys: 'Escape',
    action: 'close_modal',
    description: 'Close modal / cancel',
    enabled: true,
    category: 'navigation',
  },
  secure_delete: {
    keys: 'Ctrl+Shift+Delete',
    action: 'secure_delete',
    description: 'Secure delete selected items',
    enabled: true,
    category: 'file',
  },
  show_shortcuts_help: {
    keys: 'Ctrl+/',
    action: 'show_shortcuts_help',
    description: 'Show shortcuts help',
    enabled: true,
    category: 'help',
  },
};

// ── Constants ──────────────────────────────────────────────────

const STORAGE_KEY = 'usbvault:keyboard_shortcuts';

// ── Helpers ────────────────────────────────────────────────────

function readShortcuts(): Shortcut[] {
  if (Platform.OS !== 'web') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // Ignore
  }

  // Initialize with defaults if not found
  return _initializeDefaults();
}

function _initializeDefaults(): Shortcut[] {
  const shortcuts: Shortcut[] = Object.entries(DEFAULT_SHORTCUTS).map(
    ([id, shortcut]) => ({
      id,
      ...shortcut,
    }),
  );
  writeShortcuts(shortcuts);
  return shortcuts;
}

function writeShortcuts(shortcuts: Shortcut[]): void {
  if (Platform.OS !== 'web') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
  } catch {
    // localStorage full or unavailable
  }
}

/**
 * Parse a key combination string into normalized form.
 * Supports 'Ctrl', 'Shift', 'Alt', 'Cmd' modifiers plus key names.
 * Examples: 'Ctrl+E', 'Shift+Ctrl+L', 'Escape'
 *
 * @private
 */
function _normalizeKeys(keys: string): string {
  // Already normalized if contains '+'
  if (keys.includes('+')) {
    return keys;
  }
  // Single key (like 'Escape')
  return keys;
}

/**
 * Match a KeyboardEvent against a shortcut key combination.
 *
 * @private
 */
function _matchesKeyCombination(event: KeyboardEvent, keys: string): boolean {
  const parts = keys.split('+');
  const modifiers = new Set(
    parts.filter(p => ['Ctrl', 'Shift', 'Alt', 'Cmd', 'Meta'].includes(p)).map(p => {
      if (p === 'Cmd' || p === 'Meta') return 'meta';
      return p.toLowerCase();
    }),
  );

  const key = parts[parts.length - 1];

  // Check modifiers
  if (modifiers.has('ctrl') && !event.ctrlKey) return false;
  if (modifiers.has('shift') && !event.shiftKey) return false;
  if (modifiers.has('alt') && !event.altKey) return false;
  if ((modifiers.has('meta') || modifiers.has('cmd')) && !event.metaKey) return false;

  // Check key (case-insensitive, handle special keys)
  const eventKey = event.key.toLowerCase();
  const shortcutKey = key.toLowerCase();

  // Handle special key names
  const keyMap: Record<string, string[]> = {
    'enter': ['enter'],
    'escape': ['escape'],
    'tab': ['tab'],
    'backspace': ['backspace'],
    'delete': ['delete'],
    'arrowup': ['arrowup', 'up'],
    'arrowdown': ['arrowdown', 'down'],
    'arrowleft': ['arrowleft', 'left'],
    'arrowright': ['arrowright', 'right'],
  };

  if (keyMap[shortcutKey]) {
    return keyMap[shortcutKey].includes(eventKey);
  }

  return eventKey === shortcutKey;
}

// ── Service ────────────────────────────────────────────────────

class KeyboardShortcutServiceImpl {
  private _shortcuts: Shortcut[] = [];
  private _listeners: Set<(action: string) => void> = new Set();
  private _keydownListener: ((event: KeyboardEvent) => void) | null = null;
  private _isListening = false;

  constructor() {
    this._shortcuts = readShortcuts();
  }

  /**
   * Register a new custom shortcut.
   * If ID already exists, replaces it.
   *
   * @param shortcut - Shortcut to register
   */
  registerShortcut(shortcut: Shortcut): void {
    // Remove old version if exists
    this._shortcuts = this._shortcuts.filter(s => s.id !== shortcut.id);
    this._shortcuts.push(shortcut);
    writeShortcuts(this._shortcuts);
  }

  /**
   * Unregister a shortcut by ID.
   *
   * @param id - Shortcut ID
   */
  unregisterShortcut(id: string): void {
    this._shortcuts = this._shortcuts.filter(s => s.id !== id);
    writeShortcuts(this._shortcuts);
  }

  /**
   * Get all shortcuts.
   *
   * @returns Array of all Shortcuts
   */
  getShortcuts(): Shortcut[] {
    return [...this._shortcuts];
  }

  /**
   * Get shortcuts organized by category.
   *
   * @returns Map of category name to Shortcut array
   */
  getShortcutsByCategory(): Map<string, Shortcut[]> {
    const categories = new Map<string, Shortcut[]>();

    for (const shortcut of this._shortcuts) {
      if (!categories.has(shortcut.category)) {
        categories.set(shortcut.category, []);
      }
      categories.get(shortcut.category)!.push(shortcut);
    }

    return categories;
  }

  /**
   * Check if a shortcut is enabled.
   *
   * @param id - Shortcut ID
   * @returns true if enabled, false otherwise
   */
  isShortcutEnabled(id: string): boolean {
    const shortcut = this._shortcuts.find(s => s.id === id);
    return shortcut?.enabled ?? false;
  }

  /**
   * Enable a shortcut by ID.
   *
   * @param id - Shortcut ID
   */
  enableShortcut(id: string): void {
    const shortcut = this._shortcuts.find(s => s.id === id);
    if (shortcut) {
      shortcut.enabled = true;
      writeShortcuts(this._shortcuts);
    }
  }

  /**
   * Disable a shortcut by ID.
   *
   * @param id - Shortcut ID
   */
  disableShortcut(id: string): void {
    const shortcut = this._shortcuts.find(s => s.id === id);
    if (shortcut) {
      shortcut.enabled = false;
      writeShortcuts(this._shortcuts);
    }
  }

  /**
   * Update/rebind the key combination for a shortcut.
   *
   * @param id - Shortcut ID
   * @param keys - New key combination (e.g. 'Ctrl+Shift+E')
   */
  updateShortcut(id: string, keys: string): void {
    const shortcut = this._shortcuts.find(s => s.id === id);
    if (shortcut) {
      shortcut.keys = _normalizeKeys(keys);
      writeShortcuts(this._shortcuts);
    }
  }

  /**
   * Handle a KeyboardEvent and return matching action (if any).
   * Does NOT require listening to be started.
   *
   * @param event - KeyboardEvent
   * @returns Action string if matched, null otherwise
   */
  handleKeyDown(event: KeyboardEvent): string | null {
    for (const shortcut of this._shortcuts) {
      if (!shortcut.enabled) continue;

      if (_matchesKeyCombination(event, shortcut.keys)) {
        return shortcut.action;
      }
    }

    return null;
  }

  /**
   * Start global keydown listener (attach to window).
   * Automatically dispatches matched actions to subscribers.
   */
  startListening(): void {
    if (this._isListening || Platform.OS !== 'web') return;

    this._keydownListener = (event: KeyboardEvent) => {
      const action = this.handleKeyDown(event);
      if (action) {
        // Prevent default browser behavior for recognized shortcuts
        event.preventDefault();
        this._notifyListeners(action);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._keydownListener);
      this._isListening = true;
    }
  }

  /**
   * Stop global keydown listener.
   */
  stopListening(): void {
    if (!this._isListening || !this._keydownListener) return;

    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._keydownListener);
    }

    this._keydownListener = null;
    this._isListening = false;
  }

  /**
   * Find shortcuts that conflict with the given key combination.
   *
   * @param keys - Key combination to check (e.g. 'Ctrl+E')
   * @returns Array of conflicting Shortcuts
   */
  getConflicts(keys: string): Shortcut[] {
    const normalized = _normalizeKeys(keys);
    return this._shortcuts.filter(s => s.keys === normalized);
  }

  /**
   * Reset all shortcuts to default bindings.
   */
  resetToDefaults(): void {
    this._shortcuts = _initializeDefaults();
    writeShortcuts(this._shortcuts);
  }

  /**
   * Subscribe to shortcut actions.
   * Called whenever a shortcut is matched (if listening is active).
   *
   * @param listener - Function to call with action string
   * @returns Unsubscribe function
   */
  subscribe(listener: (action: string) => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Check if currently listening.
   *
   * @returns true if global listener is attached
   */
  isListening(): boolean {
    return this._isListening;
  }

  // ── Private helpers ────────────────────────────────────────────

  /**
   * Notify all subscribers of a matched action.
   *
   * @private
   */
  private _notifyListeners(action: string): void {
    this._listeners.forEach(listener => {
      try {
        listener(action);
      } catch {
        // Ignore listener errors
      }
    });
  }
}

export const keyboardShortcutService = new KeyboardShortcutServiceImpl();
