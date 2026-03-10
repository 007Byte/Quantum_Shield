/**
 * Sidebar routing logic tests
 *
 * Tests the route mapping and active route detection logic
 * extracted from the Sidebar component.
 */

import { DashboardNavItem } from '../types';
import { navItems } from '../mockData';

// --- Logic extracted from Sidebar component ---

const routeMap: Record<string, string> = {
  dashboard: '/(tabs)/dashboard',
  encrypt: '/(tabs)/encrypt',
  decrypt: '/(tabs)/decrypt',
  'secure-share': '/(tabs)/share',
  vault: '/(tabs)/vault',
  passwords: '/(tabs)/passwords',
  messages: '/(tabs)/messages',
  activity: '/(tabs)/activity',
  settings: '/(tabs)/settings',
};

function getActiveId(pathname: string): string {
  for (const [id, route] of Object.entries(routeMap)) {
    if (pathname === route || pathname === route.replace('/(tabs)', '')) {
      return id;
    }
  }
  return 'dashboard';
}

function getMainItems(items: DashboardNavItem[]): DashboardNavItem[] {
  return items.filter((item) => item.section !== 'bottom');
}

function getBottomItems(items: DashboardNavItem[]): DashboardNavItem[] {
  return items.filter((item) => item.section === 'bottom');
}

// --- Tests ---

describe('Sidebar: Route Map', () => {
  it('has entries for all expected pages', () => {
    const expectedIds = [
      'dashboard',
      'encrypt',
      'decrypt',
      'secure-share',
      'vault',
      'passwords',
      'messages',
      'activity',
      'settings',
    ];
    expectedIds.forEach((id) => {
      expect(routeMap).toHaveProperty(id);
    });
  });

  it('all routes start with /(tabs)/', () => {
    Object.values(routeMap).forEach((route) => {
      expect(route).toMatch(/^\/\(tabs\)\//);
    });
  });
});

describe('Sidebar: Active Route Detection', () => {
  it('detects dashboard route with full path', () => {
    expect(getActiveId('/(tabs)/dashboard')).toBe('dashboard');
  });

  it('detects dashboard route with short path', () => {
    expect(getActiveId('/dashboard')).toBe('dashboard');
  });

  it('detects encrypt route', () => {
    expect(getActiveId('/(tabs)/encrypt')).toBe('encrypt');
    expect(getActiveId('/encrypt')).toBe('encrypt');
  });

  it('detects decrypt route', () => {
    expect(getActiveId('/(tabs)/decrypt')).toBe('decrypt');
    expect(getActiveId('/decrypt')).toBe('decrypt');
  });

  it('detects secure-share route (maps to /share)', () => {
    expect(getActiveId('/(tabs)/share')).toBe('secure-share');
    expect(getActiveId('/share')).toBe('secure-share');
  });

  it('detects vault route', () => {
    expect(getActiveId('/(tabs)/vault')).toBe('vault');
    expect(getActiveId('/vault')).toBe('vault');
  });

  it('detects passwords route', () => {
    expect(getActiveId('/(tabs)/passwords')).toBe('passwords');
    expect(getActiveId('/passwords')).toBe('passwords');
  });

  it('detects messages route', () => {
    expect(getActiveId('/(tabs)/messages')).toBe('messages');
    expect(getActiveId('/messages')).toBe('messages');
  });

  it('detects activity route', () => {
    expect(getActiveId('/(tabs)/activity')).toBe('activity');
    expect(getActiveId('/activity')).toBe('activity');
  });

  it('detects settings route', () => {
    expect(getActiveId('/(tabs)/settings')).toBe('settings');
    expect(getActiveId('/settings')).toBe('settings');
  });

  it('defaults to dashboard for unknown routes', () => {
    expect(getActiveId('/unknown')).toBe('dashboard');
    expect(getActiveId('/')).toBe('dashboard');
    expect(getActiveId('')).toBe('dashboard');
  });
});

describe('Sidebar: Nav Item Sections', () => {
  it('splits nav items into main and bottom sections', () => {
    const main = getMainItems(navItems);
    const bottom = getBottomItems(navItems);

    expect(main.length).toBeGreaterThan(0);
    expect(bottom.length).toBeGreaterThan(0);

    // All items should be accounted for
    expect(main.length + bottom.length).toBe(navItems.length);
  });

  it('main items do not include settings', () => {
    const main = getMainItems(navItems);
    const mainIds = main.map((item) => item.id);
    // Settings is in the bottom section
    expect(mainIds).not.toContain('settings');
  });

  it('bottom items include settings', () => {
    const bottom = getBottomItems(navItems);
    const bottomIds = bottom.map((item) => item.id);
    expect(bottomIds).toContain('settings');
  });

  it('each nav item has required fields', () => {
    navItems.forEach((item) => {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('iconSet');
      expect(item).toHaveProperty('iconName');
      expect(item.id).toBeTruthy();
      expect(item.label).toBeTruthy();
    });
  });

  it('every nav item id has a corresponding route', () => {
    // All nav items (except 'go-premium') should map to a route
    navItems
      .filter((item) => item.id !== 'go-premium')
      .forEach((item) => {
        expect(routeMap).toHaveProperty(item.id);
      });
  });
});
