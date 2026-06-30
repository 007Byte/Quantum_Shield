/**
 * Tests for the webStyle helpers.
 *
 * Platform is a genuine boundary (mocked in jest.setup.js with OS='ios'). The
 * helpers branch on Platform.OS at call time, so we flip the mocked OS to drive
 * both the native (drop web props) and web (apply web props) code paths.
 */
import { Platform } from 'react-native';
import { webStyle, webOnly } from '@/utils/webStyle';

describe('utils/webStyle', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    (Platform as { OS: string }).OS = originalOS;
  });

  describe('webStyle', () => {
    it('returns the base unchanged on a native platform', () => {
      (Platform as { OS: string }).OS = 'ios';
      const base = { borderRadius: 12, padding: 16 };
      const result = webStyle(base, { backdropFilter: 'blur(18px)' });
      expect(result).toBe(base);
      expect(result).not.toHaveProperty('backdropFilter');
    });

    it('merges web-only props onto the base on web', () => {
      (Platform as { OS: string }).OS = 'web';
      const base = { borderRadius: 12, padding: 16 };
      const result = webStyle(base, {
        backdropFilter: 'blur(18px)',
        boxShadow: '0 0 20px rgba(0,0,0,0.3)',
      });
      expect(result).toEqual({
        borderRadius: 12,
        padding: 16,
        backdropFilter: 'blur(18px)',
        boxShadow: '0 0 20px rgba(0,0,0,0.3)',
      });
      // Returns a new object on web, does not mutate the base.
      expect(result).not.toBe(base);
      expect(base).toEqual({ borderRadius: 12, padding: 16 });
    });

    it('lets web props override base props of the same key on web', () => {
      (Platform as { OS: string }).OS = 'web';
      const result = webStyle({ position: 'absolute' }, { position: 'fixed' });
      expect((result as { position: string }).position).toBe('fixed');
    });
  });

  describe('webOnly', () => {
    it('returns an empty object on a native platform', () => {
      (Platform as { OS: string }).OS = 'android';
      expect(webOnly({ boxShadow: '0 0 10px purple' })).toEqual({});
    });

    it('returns the web styles object on web', () => {
      (Platform as { OS: string }).OS = 'web';
      const web = { cursor: 'pointer', userSelect: 'none' };
      expect(webOnly(web)).toEqual(web);
    });
  });
});
