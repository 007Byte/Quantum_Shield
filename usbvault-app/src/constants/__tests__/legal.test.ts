import {
  PRIVACY_POLICY_VERSION,
  PRIVACY_POLICY_DATE,
  TERMS_VERSION,
  TERMS_DATE,
  PRIVACY_POLICY_TEXT,
  TERMS_OF_SERVICE_TEXT,
} from '@/constants/legal';

describe('constants/legal', () => {
  describe('version metadata', () => {
    it('exposes semver-shaped versions and ISO dates that agree across docs', () => {
      expect(PRIVACY_POLICY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
      expect(TERMS_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
      expect(PRIVACY_POLICY_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(TERMS_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Both legal docs are versioned and dated together.
      expect(TERMS_VERSION).toBe(PRIVACY_POLICY_VERSION);
      expect(TERMS_DATE).toBe(PRIVACY_POLICY_DATE);
    });

    it('embeds the version string inside the document body', () => {
      expect(PRIVACY_POLICY_TEXT).toContain(`Version ${PRIVACY_POLICY_VERSION}`);
      expect(TERMS_OF_SERVICE_TEXT).toContain(`Version ${TERMS_VERSION}`);
    });
  });

  describe('privacy policy content', () => {
    it('opens with the PRIVACY POLICY heading', () => {
      expect(PRIVACY_POLICY_TEXT.startsWith('PRIVACY POLICY')).toBe(true);
    });

    it('states the zero-knowledge guarantee and contact channel', () => {
      expect(PRIVACY_POLICY_TEXT).toContain('zero-knowledge');
      expect(PRIVACY_POLICY_TEXT).toContain('privacy@usbvault.io');
    });

    it('covers required regulatory sections (GDPR, CCPA, retention)', () => {
      expect(PRIVACY_POLICY_TEXT).toContain('GDPR');
      expect(PRIVACY_POLICY_TEXT).toContain('CCPA');
      expect(PRIVACY_POLICY_TEXT).toContain('DATA RETENTION');
    });
  });

  describe('terms of service content', () => {
    it('opens with the TERMS OF SERVICE heading', () => {
      expect(TERMS_OF_SERVICE_TEXT.startsWith('TERMS OF SERVICE')).toBe(true);
    });

    it('describes subscription tiers and the legal contact', () => {
      expect(TERMS_OF_SERVICE_TEXT).toContain('SUBSCRIPTION TIERS');
      expect(TERMS_OF_SERVICE_TEXT).toContain('Free');
      expect(TERMS_OF_SERVICE_TEXT).toContain('Enterprise');
      expect(TERMS_OF_SERVICE_TEXT).toContain('legal@usbvault.io');
    });

    it('includes liability and governing-law clauses', () => {
      expect(TERMS_OF_SERVICE_TEXT).toContain('LIMITATION OF LIABILITY');
      expect(TERMS_OF_SERVICE_TEXT).toContain('GOVERNING LAW');
    });
  });
});
