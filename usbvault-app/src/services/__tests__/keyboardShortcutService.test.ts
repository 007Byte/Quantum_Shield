/**
 * Keyboard Shortcut Service Tests — Utility/UX
 *
 * Tests shortcut registration, matching, conflict detection,
 * category organization, enable/disable, and listener management.
 */

import { keyboardShortcutService } from '../keyboardShortcutService';

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

describe('KeyboardShortcutService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    keyboardShortcutService.stopListening();
    keyboardShortcutService.resetToDefaults();
  });

  // ============================================================================
  // Test: Default Shortcuts
  // ============================================================================
  describe('default shortcuts', () => {
    it('should initialize with default shortcuts', () => {
      const shortcuts = keyboardShortcutService.getShortcuts();

      expect(shortcuts.length).toBeGreaterThan(0);
      expect(shortcuts.some(s => s.action === 'encrypt_selected')).toBe(true);
      expect(shortcuts.some(s => s.action === 'lock_vault')).toBe(true);
      expect(shortcuts.some(s => s.action === 'global_search')).toBe(true);
    });

    it('should have all defaults enabled', () => {
      const shortcuts = keyboardShortcutService.getShortcuts();
      shortcuts.forEach(s => {
        expect(s.enabled).toBe(true);
      });
    });

    it('should have proper key bindings', () => {
      const shortcuts = keyboardShortcutService.getShortcuts();
      const encrypt = shortcuts.find(s => s.action === 'encrypt_selected');
      expect(encrypt?.keys).toBe('Ctrl+E');

      const lock = shortcuts.find(s => s.action === 'lock_vault');
      expect(lock?.keys).toBe('Ctrl+Shift+L');
    });
  });

  // ============================================================================
  // Test: Shortcut Registration
  // ============================================================================
  describe('registerShortcut', () => {
    it('should register a new custom shortcut', () => {
      keyboardShortcutService.registerShortcut({
        id: 'custom_action',
        keys: 'Ctrl+Shift+X',
        action: 'custom_action',
        description: 'Custom action',
        enabled: true,
        category: 'custom',
      });

      const shortcuts = keyboardShortcutService.getShortcuts();
      expect(shortcuts.some(s => s.id === 'custom_action')).toBe(true);
    });

    it('should replace existing shortcut with same ID', () => {
      keyboardShortcutService.registerShortcut({
        id: 'encrypt_selected',
        keys: 'Ctrl+Shift+E',
        action: 'encrypt_selected',
        description: 'Updated encrypt',
        enabled: true,
        category: 'file',
      });

      const shortcuts = keyboardShortcutService.getShortcuts();
      const encrypt = shortcuts.find(s => s.id === 'encrypt_selected');
      expect(encrypt?.keys).toBe('Ctrl+Shift+E');
    });
  });

  describe('unregisterShortcut', () => {
    it('should remove a shortcut by ID', () => {
      const before = keyboardShortcutService.getShortcuts().length;
      keyboardShortcutService.unregisterShortcut('encrypt_selected');
      const after = keyboardShortcutService.getShortcuts().length;

      expect(after).toBe(before - 1);
    });
  });

  // ============================================================================
  // Test: Enable/Disable
  // ============================================================================
  describe('enable/disable shortcuts', () => {
    it('should disable a shortcut', () => {
      keyboardShortcutService.disableShortcut('encrypt_selected');
      expect(keyboardShortcutService.isShortcutEnabled('encrypt_selected')).toBe(false);
    });

    it('should enable a disabled shortcut', () => {
      keyboardShortcutService.disableShortcut('encrypt_selected');
      keyboardShortcutService.enableShortcut('encrypt_selected');
      expect(keyboardShortcutService.isShortcutEnabled('encrypt_selected')).toBe(true);
    });

    it('should return false for non-existent shortcut', () => {
      expect(keyboardShortcutService.isShortcutEnabled('nonexistent')).toBe(false);
    });
  });

  // ============================================================================
  // Test: Update Key Binding
  // ============================================================================
  describe('updateShortcut', () => {
    it('should update key binding', () => {
      keyboardShortcutService.updateShortcut('encrypt_selected', 'Ctrl+Shift+E');

      const shortcuts = keyboardShortcutService.getShortcuts();
      const encrypt = shortcuts.find(s => s.id === 'encrypt_selected');
      expect(encrypt?.keys).toBe('Ctrl+Shift+E');
    });

    it('should do nothing for non-existent shortcut', () => {
      const before = keyboardShortcutService.getShortcuts();
      keyboardShortcutService.updateShortcut('nonexistent', 'Ctrl+X');
      const after = keyboardShortcutService.getShortcuts();

      expect(before.length).toBe(after.length);
    });
  });

  // ============================================================================
  // Test: Key Matching
  // ============================================================================
  describe('handleKeyDown', () => {
    it('should match Ctrl+E to encrypt_selected', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'e',
        ctrlKey: true,
      });

      const action = keyboardShortcutService.handleKeyDown(event);
      expect(action).toBe('encrypt_selected');
    });

    it('should match Ctrl+Shift+L to lock_vault', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'l',
        ctrlKey: true,
        shiftKey: true,
      });

      const action = keyboardShortcutService.handleKeyDown(event);
      expect(action).toBe('lock_vault');
    });

    it('should match Escape to close_modal', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
      });

      const action = keyboardShortcutService.handleKeyDown(event);
      expect(action).toBe('close_modal');
    });

    it('should return null for unmatched key', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        altKey: true,
      });

      const action = keyboardShortcutService.handleKeyDown(event);
      expect(action).toBeNull();
    });

    it('should not match disabled shortcuts', () => {
      keyboardShortcutService.disableShortcut('encrypt_selected');

      const event = new KeyboardEvent('keydown', {
        key: 'e',
        ctrlKey: true,
      });

      const action = keyboardShortcutService.handleKeyDown(event);
      expect(action).toBeNull();
    });
  });

  // ============================================================================
  // Test: Categories
  // ============================================================================
  describe('getShortcutsByCategory', () => {
    it('should organize shortcuts by category', () => {
      const categories = keyboardShortcutService.getShortcutsByCategory();

      expect(categories.has('file')).toBe(true);
      expect(categories.has('vault')).toBe(true);
      expect(categories.has('navigation')).toBe(true);

      const fileShortcuts = categories.get('file')!;
      expect(fileShortcuts.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Test: Conflict Detection
  // ============================================================================
  describe('getConflicts', () => {
    it('should detect conflicting key bindings', () => {
      const conflicts = keyboardShortcutService.getConflicts('Ctrl+E');
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].keys).toBe('Ctrl+E');
    });

    it('should return empty array for unique binding', () => {
      const conflicts = keyboardShortcutService.getConflicts('Ctrl+Alt+Shift+Z');
      expect(conflicts).toEqual([]);
    });
  });

  // ============================================================================
  // Test: Reset to Defaults
  // ============================================================================
  describe('resetToDefaults', () => {
    it('should restore all default shortcuts', () => {
      // Modify a shortcut
      keyboardShortcutService.disableShortcut('encrypt_selected');
      keyboardShortcutService.updateShortcut('encrypt_selected', 'Ctrl+Shift+X');

      keyboardShortcutService.resetToDefaults();

      const shortcuts = keyboardShortcutService.getShortcuts();
      const encrypt = shortcuts.find(s => s.id === 'encrypt_selected');
      expect(encrypt?.enabled).toBe(true);
      expect(encrypt?.keys).toBe('Ctrl+E');
    });
  });

  // ============================================================================
  // Test: Listener Management
  // ============================================================================
  describe('listening', () => {
    it('should not be listening initially', () => {
      expect(keyboardShortcutService.isListening()).toBe(false);
    });

    it('should start and stop listening', () => {
      keyboardShortcutService.startListening();
      expect(keyboardShortcutService.isListening()).toBe(true);

      keyboardShortcutService.stopListening();
      expect(keyboardShortcutService.isListening()).toBe(false);
    });

    it('should not start listening twice', () => {
      keyboardShortcutService.startListening();
      keyboardShortcutService.startListening(); // Should be no-op

      expect(keyboardShortcutService.isListening()).toBe(true);
      keyboardShortcutService.stopListening();
    });
  });

  // ============================================================================
  // Test: Subscription
  // ============================================================================
  describe('subscribe', () => {
    it('should return an unsubscribe function', () => {
      const listener = jest.fn();
      const unsub = keyboardShortcutService.subscribe(listener);

      expect(typeof unsub).toBe('function');
      unsub();
    });
  });
});
