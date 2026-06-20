import { create } from 'zustand';

/**
 * Zustand store for sidebar UI state.
 * Persists collapsed/expanded category state across route navigations.
 */

interface SidebarState {
  /** Map of group name → whether it's collapsed. true = collapsed */
  collapsedSections: Record<string, boolean>;
  /** Whether the store has been initialized with group names */
  initialized: boolean;
  /** Whether the mobile sidebar drawer is open */
  isDrawerOpen: boolean;
  /** Initialize with all groups collapsed (only runs once) */
  initGroups: (groups: string[]) => void;
  /** Toggle a single group's collapsed state */
  toggleSection: (group: string) => void;
  /** Open or close the mobile sidebar drawer */
  setDrawerOpen: (open: boolean) => void;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  collapsedSections: {},
  initialized: false,
  isDrawerOpen: false,

  setDrawerOpen: (open: boolean) => set({ isDrawerOpen: open }),

  initGroups: (groups: string[]) => {
    // Only initialize once — subsequent calls are no-ops
    if (get().initialized) return;
    const defaults: Record<string, boolean> = {};
    for (const group of groups) {
      defaults[group] = true; // collapsed by default
    }
    set({ collapsedSections: defaults, initialized: true });
  },

  toggleSection: (group: string) => {
    set(state => ({
      collapsedSections: {
        ...state.collapsedSections,
        [group]: !state.collapsedSections[group],
      },
    }));
  },
}));
