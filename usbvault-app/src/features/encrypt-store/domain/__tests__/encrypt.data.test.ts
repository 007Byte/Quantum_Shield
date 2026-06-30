import {
  getAlgorithmOptions,
  getSecurityLevels,
  SUPPORTED_FORMATS,
  sanitizeFileName,
  timeAgo,
} from '../encrypt.data';

// Identity translator: returns the key so we can assert wiring without i18n.
const t = (key: string) => key;

describe('encrypt.data', () => {
  describe('getAlgorithmOptions', () => {
    it('returns the three supported algorithms with stable ids and icons', () => {
      const options = getAlgorithmOptions(t);
      expect(options.map(o => o.id)).toEqual(['AES-256-GCM-SIV', 'ChaCha20-Poly1305', 'PQC Kyber']);
      expect(options.map(o => o.icon)).toEqual(['shield', 'zap', 'cpu']);
    });

    it('routes display tags/summaries through the translator', () => {
      const options = getAlgorithmOptions(t);
      expect(options[0].tag).toBe('encrypt.recommended');
      expect(options[0].summary).toBe('encrypt.aes256Summary');
      expect(options[2].tag).toBe('encrypt.quantumSafe');
    });

    it('carries non-empty technical detail rows for each option', () => {
      for (const option of getAlgorithmOptions(t)) {
        expect(option.details.length).toBeGreaterThan(0);
        for (const row of option.details) {
          expect(row.label).toBeTruthy();
          expect(row.value).toBeTruthy();
        }
      }
    });
  });

  describe('getSecurityLevels', () => {
    it('returns Standard/High/Maximum levels with icons', () => {
      const levels = getSecurityLevels(t);
      expect(levels.map(l => l.id)).toEqual(['Standard', 'High', 'Maximum']);
      expect(levels.map(l => l.icon)).toEqual(['lock', 'shield', 'award']);
    });

    it('routes speed/summary through the translator', () => {
      const levels = getSecurityLevels(t);
      expect(levels[0].speed).toBe('encrypt.fastest');
      expect(levels[2].speed).toBe('encrypt.slowest');
    });
  });

  describe('SUPPORTED_FORMATS', () => {
    it('lists common document and media formats', () => {
      expect(SUPPORTED_FORMATS).toContain('PDF');
      expect(SUPPORTED_FORMATS).toContain('Images');
      expect(SUPPORTED_FORMATS).toContain('Videos');
      expect(SUPPORTED_FORMATS.length).toBeGreaterThan(5);
    });
  });

  describe('sanitizeFileName', () => {
    it('strips directory components, keeping the basename', () => {
      expect(sanitizeFileName('/etc/passwd')).toBe('passwd');
      expect(sanitizeFileName('C:\\Users\\me\\report.pdf')).toBe('report.pdf');
    });

    it('removes path-traversal sequences', () => {
      expect(sanitizeFileName('....//....//secret.txt')).toBe('secret.txt');
    });

    it('strips control characters and null bytes', () => {
      expect(sanitizeFileName('na\x00me\x1f.txt')).toBe('name.txt');
    });

    it('removes disallowed characters but keeps safe punctuation', () => {
      expect(sanitizeFileName('my$weird@file!.txt')).toBe('myweirdfile.txt');
      expect(sanitizeFileName('keep-this_name 1.txt')).toBe('keep-this_name 1.txt');
    });

    it('collapses repeated dots and spaces', () => {
      expect(sanitizeFileName('a...b   c.txt')).toBe('a.b c.txt');
    });

    it('trims leading/trailing dots and whitespace', () => {
      expect(sanitizeFileName('  .hidden.  ')).toBe('hidden');
    });

    it('falls back to a default name when nothing safe remains', () => {
      expect(sanitizeFileName('***')).toBe('unnamed-file');
      expect(sanitizeFileName('')).toBe('unnamed-file');
    });

    it('truncates to 255 chars while preserving the extension', () => {
      const longBase = 'f'.repeat(300);
      const result = sanitizeFileName(`${longBase}.pdf`);
      expect(result.length).toBe(255);
      expect(result.endsWith('.pdf')).toBe(true);
    });

    it('truncates an extensionless overly-long name to 255 chars', () => {
      const result = sanitizeFileName('g'.repeat(400));
      expect(result.length).toBe(255);
    });
  });

  describe('timeAgo', () => {
    const NOW = new Date('2026-06-29T12:00:00.000Z').getTime();
    beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
    afterEach(() => jest.restoreAllMocks());

    const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

    it('renders minutes for under an hour', () => {
      expect(timeAgo(minutesAgo(0))).toBe('0m ago');
      expect(timeAgo(minutesAgo(45))).toBe('45m ago');
    });

    it('renders hours under a day', () => {
      expect(timeAgo(minutesAgo(60))).toBe('1h ago');
      expect(timeAgo(minutesAgo(60 * 5))).toBe('5h ago');
    });

    it('renders days under a week', () => {
      expect(timeAgo(minutesAgo(60 * 24))).toBe('1d ago');
      expect(timeAgo(minutesAgo(60 * 24 * 3))).toBe('3d ago');
    });

    it('renders weeks for a week or more', () => {
      expect(timeAgo(minutesAgo(60 * 24 * 7))).toBe('1w ago');
      expect(timeAgo(minutesAgo(60 * 24 * 21))).toBe('3w ago');
    });
  });
});
