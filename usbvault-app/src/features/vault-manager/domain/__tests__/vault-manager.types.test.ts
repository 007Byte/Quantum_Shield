/**
 * vault-manager.types.ts is named *.types but carries real executable logic
 * (constant tables, color/label/date helpers and default modal states), so it
 * is covered here rather than treated as a type-only file.
 */
import {
  SECURITY_LEVELS,
  LOCALE_MAP,
  getSecurityLevelColors,
  getStatusColor,
  getStatusLabel,
  formatDate,
  DEFAULT_CREATE_MODAL,
  DEFAULT_RENAME_MODAL,
} from '../vault-manager.types';

const t = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

describe('vault-manager.types domain logic', () => {
  describe('SECURITY_LEVELS / LOCALE_MAP', () => {
    it('lists the three security levels in ascending order', () => {
      expect(SECURITY_LEVELS).toEqual(['Standard', 'High', 'Maximum']);
    });

    it('maps language codes to BCP-47 locales', () => {
      expect(LOCALE_MAP.en).toBe('en-US');
      expect(LOCALE_MAP.de).toBe('de-DE');
      expect(LOCALE_MAP.fr).toBe('fr-FR');
    });
  });

  describe('getSecurityLevelColors', () => {
    it('returns green for maximum, purple for high, amber for standard', () => {
      expect(getSecurityLevelColors('Maximum').text).toBe('#10B981');
      expect(getSecurityLevelColors('High').text).toBe('#8B5CF6');
      expect(getSecurityLevelColors('Standard').text).toBe('#F59E0B');
    });

    it('is case-insensitive on the level', () => {
      expect(getSecurityLevelColors('maximum').icon).toBe('#10B981');
      expect(getSecurityLevelColors('HIGH').text).toBe('#8B5CF6');
    });

    it('returns a neutral gray palette for unknown levels', () => {
      const colors = getSecurityLevelColors('whatever');
      expect(colors.text).toBe('#94a3b8');
      expect(colors.icon).toBe('#94a3b8');
    });

    it('always returns the full color shape', () => {
      const colors = getSecurityLevelColors('High');
      expect(colors).toHaveProperty('bgLight');
      expect(colors).toHaveProperty('border');
      expect(colors).toHaveProperty('text');
      expect(colors).toHaveProperty('icon');
    });
  });

  describe('getStatusColor / getStatusLabel', () => {
    it('maps healthy/corrupted/locked statuses to colors', () => {
      expect(getStatusColor('healthy')).toBe('#10b981');
      expect(getStatusColor('corrupted')).toBe('#ef4444');
      expect(getStatusColor('locked')).toBe('#f59e0b');
    });

    it('maps statuses to human labels', () => {
      expect(getStatusLabel('healthy')).toBe('Healthy');
      expect(getStatusLabel('corrupted')).toBe('Corrupted');
      expect(getStatusLabel('locked')).toBe('Locked');
    });
  });

  describe('formatDate', () => {
    const NOW = new Date('2026-06-29T12:00:00.000Z').getTime();
    beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
    afterEach(() => jest.useRealTimers());

    const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

    it('renders relative minutes within the hour', () => {
      expect(formatDate(minutesAgo(10), t, 'en')).toBe('vaultManager.mAgo:{"count":10}');
    });

    it('renders relative hours within the day', () => {
      expect(formatDate(minutesAgo(60 * 3), t, 'en')).toBe('vaultManager.hAgo:{"count":3}');
    });

    it('renders relative days within the week', () => {
      expect(formatDate(minutesAgo(60 * 24 * 2), t, 'en')).toBe('vaultManager.dAgo:{"count":2}');
    });

    it('renders an absolute localized date beyond a week', () => {
      const old = new Date(NOW - 60 * 24 * 40 * 60_000).toISOString();
      const result = formatDate(old, t, 'en');
      // Same year → no year segment; should be a short month/day string.
      expect(result).not.toContain('vaultManager.');
      expect(result).toMatch(/May|Apr/);
    });

    it('includes the year for dates in a different year', () => {
      const lastYear = new Date('2024-01-15T12:00:00.000Z').toISOString();
      const result = formatDate(lastYear, t, 'en');
      expect(result).toContain('2024');
    });
  });

  describe('default modal states', () => {
    it('DEFAULT_CREATE_MODAL is hidden with a High default level', () => {
      expect(DEFAULT_CREATE_MODAL.visible).toBe(false);
      expect(DEFAULT_CREATE_MODAL.vaultName).toBe('');
      expect(DEFAULT_CREATE_MODAL.securityLevel).toBe('High');
    });

    it('DEFAULT_RENAME_MODAL is hidden with no target vault', () => {
      expect(DEFAULT_RENAME_MODAL.visible).toBe(false);
      expect(DEFAULT_RENAME_MODAL.vaultId).toBeNull();
      expect(DEFAULT_RENAME_MODAL.newName).toBe('');
    });
  });
});
