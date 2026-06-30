/**
 * Tests for zero-trace static data and helpers.
 *
 * Platform is a genuine boundary (mocked in jest.setup.js); getPlatformKey
 * branches on Platform.OS at call time, so we flip the mocked OS per case.
 * navigator.platform (jsdom) is overridden for the web heuristics.
 */
import { Platform } from 'react-native';
import {
  ztColors,
  humanizeCategory,
  OS_CLEANERS,
  ADMIN_CLEANERS,
  getPlatformKey,
  getSeverityIcon,
  getSeverityColor,
  getStatusIcon,
  getStatusColor,
} from '../zero-trace.data';

describe('zero-trace.data', () => {
  describe('ztColors palette', () => {
    it('exposes hex colors for the dark-glass theme', () => {
      expect(ztColors.danger).toBe('#EF4444');
      expect(ztColors.warning).toBe('#EAB308');
      expect(ztColors.green).toBe('#10B981');
      expect(ztColors.textSecondary).toBe('#B8B3D1');
    });
  });

  describe('humanizeCategory', () => {
    it('maps known category ids to friendly labels', () => {
      expect(humanizeCategory('clipboard')).toBe('Clipboard');
      expect(humanizeCategory('session_data')).toBe('Session Data');
      expect(humanizeCategory('swap_pagefile')).toBe('Swap / Pagefile');
    });

    it('title-cases unknown snake_case ids as a fallback', () => {
      expect(humanizeCategory('mystery_artifact')).toBe('Mystery Artifact');
      expect(humanizeCategory('single')).toBe('Single');
    });
  });

  describe('OS_CLEANERS / ADMIN_CLEANERS tables', () => {
    it('defines cleaner lists for each supported OS key', () => {
      expect(OS_CLEANERS.macos.length).toBeGreaterThan(0);
      expect(OS_CLEANERS.windows.length).toBeGreaterThan(0);
      expect(OS_CLEANERS.linux.length).toBeGreaterThan(0);
      // Each entry carries a label and an icon.
      for (const entry of OS_CLEANERS.windows) {
        expect(typeof entry.label).toBe('string');
        expect(typeof entry.icon).toBe('string');
      }
    });

    it('defines admin cleaners per OS', () => {
      expect(ADMIN_CLEANERS.macos).toContain('Spotlight re-index with sudo');
      expect(ADMIN_CLEANERS.windows).toEqual(['Prefetch files', 'Event Logs']);
      expect(ADMIN_CLEANERS.linux).toContain('System journal cleanup');
    });
  });

  describe('getPlatformKey', () => {
    const originalOS = Platform.OS;
    const originalNavigator = global.navigator;

    afterEach(() => {
      (Platform as { OS: string }).OS = originalOS;
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        configurable: true,
      });
    });

    it('maps macos and ios to macos', () => {
      (Platform as { OS: string }).OS = 'macos';
      expect(getPlatformKey()).toBe('macos');
      (Platform as { OS: string }).OS = 'ios';
      expect(getPlatformKey()).toBe('macos');
    });

    it('maps windows to windows', () => {
      (Platform as { OS: string }).OS = 'windows';
      expect(getPlatformKey()).toBe('windows');
    });

    it('maps android and linux to linux', () => {
      (Platform as { OS: string }).OS = 'android';
      expect(getPlatformKey()).toBe('linux');
      (Platform as { OS: string }).OS = 'linux';
      expect(getPlatformKey()).toBe('linux');
    });

    it('uses navigator.platform heuristics on web', () => {
      (Platform as { OS: string }).OS = 'web';
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'Win32' },
        configurable: true,
      });
      expect(getPlatformKey()).toBe('windows');

      Object.defineProperty(global, 'navigator', {
        value: { platform: 'MacIntel' },
        configurable: true,
      });
      expect(getPlatformKey()).toBe('macos');

      Object.defineProperty(global, 'navigator', {
        value: { platform: 'Linux x86_64' },
        configurable: true,
      });
      expect(getPlatformKey()).toBe('linux');
    });

    it('falls back to macos for an unrecognized web platform', () => {
      (Platform as { OS: string }).OS = 'web';
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'SomethingElse' },
        configurable: true,
      });
      expect(getPlatformKey()).toBe('macos');
    });

    it('falls back to macos for unknown OS values', () => {
      (Platform as { OS: string }).OS = 'tvos';
      expect(getPlatformKey()).toBe('macos');
    });
  });

  describe('severity helpers', () => {
    it('getSeverityIcon maps severity to a Feather icon name', () => {
      expect(getSeverityIcon('critical')).toBe('alert-circle');
      expect(getSeverityIcon('warning')).toBe('alert-triangle');
      expect(getSeverityIcon('info')).toBe('info');
      expect(getSeverityIcon('unknown')).toBe('info');
    });

    it('getSeverityColor maps severity to a palette color', () => {
      expect(getSeverityColor('critical')).toBe(ztColors.danger);
      expect(getSeverityColor('warning')).toBe(ztColors.warning);
      expect(getSeverityColor('low')).toBe(ztColors.textSecondary);
    });
  });

  describe('status helpers', () => {
    it('getStatusIcon maps status to a Feather icon name', () => {
      expect(getStatusIcon('clean')).toBe('check-circle');
      expect(getStatusIcon('dirty')).toBe('alert-triangle');
      expect(getStatusIcon('requires_desktop')).toBe('lock');
      expect(getStatusIcon('unknown')).toBe('help-circle');
    });

    it('getStatusColor maps status to a palette color', () => {
      expect(getStatusColor('clean')).toBe(ztColors.green);
      expect(getStatusColor('dirty')).toBe(ztColors.warning);
      expect(getStatusColor('requires_desktop')).toBe(ztColors.gray);
      expect(getStatusColor('other')).toBe(ztColors.textSecondary);
    });
  });
});
