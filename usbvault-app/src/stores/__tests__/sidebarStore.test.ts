/**
 * Sidebar Store Tests
 *
 * Tests initGroups, toggleSection, state persistence, and re-initialization guard.
 */

// Mock React Native
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

import { useSidebarStore } from '../sidebarStore';

describe('sidebarStore', () => {
  beforeEach(() => {
    // Reset the store to initial state before each test
    useSidebarStore.setState({
      collapsedSections: {},
      initialized: false,
    });
  });

  describe('initial state', () => {
    it('should start with empty collapsedSections', () => {
      const state = useSidebarStore.getState();
      expect(state.collapsedSections).toEqual({});
    });

    it('should start as not initialized', () => {
      const state = useSidebarStore.getState();
      expect(state.initialized).toBe(false);
    });
  });

  describe('initGroups', () => {
    it('should initialize all groups as collapsed', () => {
      const { initGroups } = useSidebarStore.getState();
      initGroups(['Files', 'Shares', 'Settings']);

      const state = useSidebarStore.getState();
      expect(state.collapsedSections).toEqual({
        Files: true,
        Shares: true,
        Settings: true,
      });
    });

    it('should set initialized flag to true', () => {
      const { initGroups } = useSidebarStore.getState();
      initGroups(['Files']);

      expect(useSidebarStore.getState().initialized).toBe(true);
    });

    it('should be a no-op on subsequent calls', () => {
      const { initGroups } = useSidebarStore.getState();
      initGroups(['Files', 'Shares']);
      initGroups(['Different', 'Groups']);

      const state = useSidebarStore.getState();
      // Should still have original groups, not the second call's groups
      expect(state.collapsedSections).toEqual({
        Files: true,
        Shares: true,
      });
      expect(state.collapsedSections['Different']).toBeUndefined();
    });

    it('should handle empty groups array', () => {
      const { initGroups } = useSidebarStore.getState();
      initGroups([]);

      const state = useSidebarStore.getState();
      expect(state.collapsedSections).toEqual({});
      expect(state.initialized).toBe(true);
    });

    it('should handle single group', () => {
      const { initGroups } = useSidebarStore.getState();
      initGroups(['OnlyOne']);

      expect(useSidebarStore.getState().collapsedSections).toEqual({ OnlyOne: true });
    });
  });

  describe('toggleSection', () => {
    it('should toggle a collapsed section to expanded', () => {
      const { initGroups } = useSidebarStore.getState();
      initGroups(['Files', 'Shares']);

      useSidebarStore.getState().toggleSection('Files');
      const state = useSidebarStore.getState();
      expect(state.collapsedSections['Files']).toBe(false);
      expect(state.collapsedSections['Shares']).toBe(true);
    });

    it('should toggle an expanded section back to collapsed', () => {
      const { initGroups } = useSidebarStore.getState();
      initGroups(['Files']);

      useSidebarStore.getState().toggleSection('Files'); // false
      useSidebarStore.getState().toggleSection('Files'); // true
      expect(useSidebarStore.getState().collapsedSections['Files']).toBe(true);
    });

    it('should not affect other sections', () => {
      const { initGroups } = useSidebarStore.getState();
      initGroups(['A', 'B', 'C']);

      useSidebarStore.getState().toggleSection('B');
      const state = useSidebarStore.getState();
      expect(state.collapsedSections['A']).toBe(true);
      expect(state.collapsedSections['B']).toBe(false);
      expect(state.collapsedSections['C']).toBe(true);
    });

    it('should create section entry for unknown group names', () => {
      useSidebarStore.getState().toggleSection('NewSection');
      const state = useSidebarStore.getState();
      // undefined toggled becomes true (since !undefined === true)
      expect(state.collapsedSections['NewSection']).toBe(true);
    });

    it('should handle rapid successive toggles', () => {
      const { initGroups } = useSidebarStore.getState();
      initGroups(['Fast']);

      // Toggle 5 times: true -> false -> true -> false -> true
      for (let i = 0; i < 5; i++) {
        useSidebarStore.getState().toggleSection('Fast');
      }
      // After 5 toggles from true: should be false
      expect(useSidebarStore.getState().collapsedSections['Fast']).toBe(false);
    });
  });

  describe('state persistence across calls', () => {
    it('should maintain state between getState calls', () => {
      const { initGroups } = useSidebarStore.getState();
      initGroups(['X', 'Y']);

      useSidebarStore.getState().toggleSection('X');

      // Verify state is maintained
      const finalState = useSidebarStore.getState();
      expect(finalState.collapsedSections['X']).toBe(false);
      expect(finalState.collapsedSections['Y']).toBe(true);
      expect(finalState.initialized).toBe(true);
    });

    it('should allow subscribe for state changes', () => {
      const changes: any[] = [];
      const unsub = useSidebarStore.subscribe(state => {
        changes.push({ ...state.collapsedSections });
      });

      const { initGroups } = useSidebarStore.getState();
      initGroups(['A']);
      useSidebarStore.getState().toggleSection('A');

      expect(changes.length).toBeGreaterThanOrEqual(2);
      unsub();
    });
  });

  describe('store shape', () => {
    it('should expose initGroups as a function', () => {
      expect(typeof useSidebarStore.getState().initGroups).toBe('function');
    });

    it('should expose toggleSection as a function', () => {
      expect(typeof useSidebarStore.getState().toggleSection).toBe('function');
    });

    it('should have collapsedSections as a plain object', () => {
      expect(typeof useSidebarStore.getState().collapsedSections).toBe('object');
    });
  });
});
