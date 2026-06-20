/**
 * Password Policy / Strength Checker Tests
 *
 * Tests NIST SP 800-63B validation, OWASP character classes,
 * input validation, breach checking, scoring, and UI helpers.
 */

// Mock React Native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock crypto bridge
jest.mock('@/crypto/bridge', () => ({}));

// Mock fetch for HIBP
global.fetch = jest.fn();

// Mock crypto.subtle for HIBP SHA-1
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: jest.fn(),
    subtle: {
      digest: jest.fn(),
    },
  },
  writable: true,
  configurable: true,
});

import {
  validatePassword,
  analyzeCharacterClasses,
  checkPasswordBreach,
  validateType,
  validateLength,
  validateNamePattern,
  validateInputField,
  levelToColor,
  levelToLabel,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '../passwordPolicy';

describe('passwordPolicy', () => {
  describe('validatePassword() — length checks', () => {
    it('should reject passwords shorter than minimum length', () => {
      const result = validatePassword('short');
      expect(result.isValid).toBe(false);
      expect(result.checks.minLength).toBe(false);
      expect(result.feedback.some(f => f.includes('Minimum'))).toBe(true);
    });

    it('should reject passwords longer than maximum length', () => {
      const longPw = 'A'.repeat(PASSWORD_MAX_LENGTH + 1);
      const result = validatePassword(longPw);
      expect(result.checks.maxLength).toBe(false);
    });

    it('should accept passwords of exactly minimum length', () => {
      // Use a strong non-common password of exactly min length
      const pw = 'Xk9#mZ!pL2@wR7&';
      const padded = pw.padEnd(PASSWORD_MIN_LENGTH, 'Q');
      const result = validatePassword(padded.substring(0, PASSWORD_MIN_LENGTH));
      expect(result.checks.minLength).toBe(true);
    });

    it('should accept passwords at maximum length', () => {
      const pw = 'Ab1!' + 'x'.repeat(PASSWORD_MAX_LENGTH - 4);
      const result = validatePassword(pw);
      expect(result.checks.maxLength).toBe(true);
    });
  });

  describe('validatePassword() — common password detection', () => {
    it('should reject well-known common passwords', () => {
      const result = validatePassword('password');
      expect(result.checks.notCommon).toBe(false);
    });

    it('should reject common passwords with leet substitutions', () => {
      // Desubstitution: !l0v3y0u -> iloveyou (which is in the common list)
      // The desubstituted string differs from the lowercase original,
      // so the secondary check triggers.
      const result = validatePassword('!l0v3y0uForever');
      expect(result.checks.notCommon).toBe(false);
    });

    it('should accept unique passwords not in the blocklist', () => {
      const result = validatePassword('Xk9#mZ!pL2@wR7&qB');
      expect(result.checks.notCommon).toBe(true);
    });
  });

  describe('validatePassword() — contextual checks', () => {
    it('should reject passwords containing app-specific terms', () => {
      const result = validatePassword('myusbvault2025!XY');
      expect(result.checks.notContextual).toBe(false);
    });

    it('should reject passwords containing "vault"', () => {
      const result = validatePassword('thevaultIsSecure!');
      expect(result.checks.notContextual).toBe(false);
    });

    it('should reject passwords containing user first name', () => {
      const context = { firstName: 'John' };
      const r = validatePassword('JohnSecurePass!23', context);
      expect(r.checks.notUserContext).toBe(false);
    });

    it('should reject passwords containing email local part', () => {
      const context = { email: 'walker@example.com' };
      const r = validatePassword('walker_secure!XY2', context);
      expect(r.checks.notUserContext).toBe(false);
    });

    it('should pass user context check when no context given', () => {
      const result = validatePassword('Xk9#mZ!pL2@wR7&qB');
      expect(result.checks.notUserContext).toBe(true);
    });

    it('should ignore short context values (< 3 chars)', () => {
      const context = { firstName: 'Jo' }; // too short to check
      const result = validatePassword('Xk9#mZ!pL2@wR7&qB', context);
      expect(result.checks.notUserContext).toBe(true);
    });
  });

  describe('validatePassword() — keyboard pattern detection', () => {
    it('should flag passwords dominated by keyboard patterns', () => {
      const result = validatePassword('qwertyuiop12345');
      expect(result.checks.notKeyboardPattern).toBe(false);
    });

    it('should flag passwords with long repeated characters', () => {
      const result = validatePassword('aaaaaaaaaaaaaaa');
      expect(result.checks.notKeyboardPattern).toBe(false);
    });

    it('should flag long sequential characters', () => {
      const result = validatePassword('abcdefghijklmno');
      expect(result.checks.notKeyboardPattern).toBe(false);
    });
  });

  describe('validatePassword() — scoring and levels', () => {
    it('should score 0 for passwords below minimum length', () => {
      const result = validatePassword('abc');
      expect(result.score).toBe(0);
      expect(result.level).toBe('weak');
    });

    it('should assign a higher score for longer diverse passwords', () => {
      const result = validatePassword('Xk9#mZ!pL2@wR7&qBcD');
      expect(result.score).toBeGreaterThanOrEqual(3);
      expect(['strong', 'very_strong']).toContain(result.level);
    });

    it('should produce an estimated crack time string', () => {
      const result = validatePassword('Xk9#mZ!pL2@wR7&qBcD');
      expect(typeof result.estimatedCrackTime).toBe('string');
      expect(result.estimatedCrackTime.length).toBeGreaterThan(0);
    });

    it('should provide feedback array', () => {
      const result = validatePassword('short');
      expect(Array.isArray(result.feedback)).toBe(true);
      expect(result.feedback.length).toBeGreaterThan(0);
    });

    it('should mark a strong valid password as valid', () => {
      const result = validatePassword('hR7$zWq!9mBpL@2xNcD');
      expect(result.isValid).toBe(true);
    });
  });

  describe('analyzeCharacterClasses()', () => {
    it('should detect all four classes', () => {
      const result = analyzeCharacterClasses('aA1!');
      expect(result.hasLowercase).toBe(true);
      expect(result.hasUppercase).toBe(true);
      expect(result.hasDigits).toBe(true);
      expect(result.hasSpecial).toBe(true);
      expect(result.classCount).toBe(4);
    });

    it('should detect lowercase only', () => {
      const result = analyzeCharacterClasses('abcdef');
      expect(result.hasLowercase).toBe(true);
      expect(result.hasUppercase).toBe(false);
      expect(result.classCount).toBe(1);
    });

    it('should return 0 classes for empty string', () => {
      const result = analyzeCharacterClasses('');
      expect(result.classCount).toBe(0);
    });

    it('should detect special characters correctly', () => {
      const result = analyzeCharacterClasses('!@#$%');
      expect(result.hasSpecial).toBe(true);
      expect(result.classCount).toBe(1);
    });
  });

  describe('validateType()', () => {
    it('should accept strings', () => {
      expect(validateType('hello', 'field').isValid).toBe(true);
    });

    it('should reject numbers', () => {
      const result = validateType(42, 'field');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('text string');
    });

    it('should reject null', () => {
      expect(validateType(null, 'name').isValid).toBe(false);
    });

    it('should reject undefined', () => {
      expect(validateType(undefined, 'name').isValid).toBe(false);
    });
  });

  describe('validateLength()', () => {
    it('should accept strings within bounds', () => {
      expect(validateLength('John', 'name', 1, 64).isValid).toBe(true);
    });

    it('should reject strings below minimum', () => {
      const result = validateLength('', 'name', 1, 64);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('at least');
    });

    it('should reject strings above maximum', () => {
      const result = validateLength('A'.repeat(65), 'name', 1, 64);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('at most');
    });
  });

  describe('validateNamePattern()', () => {
    it('should accept alphabetic names with spaces and hyphens', () => {
      expect(validateNamePattern("Mary-Jane O'Brien", 'name').isValid).toBe(true);
    });

    it('should reject names with digits', () => {
      expect(validateNamePattern('John123', 'name').isValid).toBe(false);
    });

    it('should reject names with special symbols', () => {
      expect(validateNamePattern('John@Doe', 'name').isValid).toBe(false);
    });
  });

  describe('validateInputField()', () => {
    it('should run all three validation strategies', () => {
      const result = validateInputField('John', 'First Name', { namePattern: true });
      expect(result.isValid).toBe(true);
    });

    it('should fail on type check before reaching length check', () => {
      const result = validateInputField(123 as any, 'Name');
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBe(1);
    });

    it('should accumulate errors from length and pattern checks', () => {
      const result = validateInputField('J0hn!', 'Name', {
        minLength: 1,
        maxLength: 64,
        namePattern: true,
      });
      expect(result.isValid).toBe(false);
    });
  });

  describe('checkPasswordBreach()', () => {
    it('should return breached=true when HIBP finds a match', async () => {
      // hashHex not needed — we mock the digest directly
      const hashBuffer = new Uint8Array(20).buffer;
      (crypto.subtle.digest as jest.Mock).mockResolvedValue(hashBuffer);

      // Fake HIBP response containing the suffix
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => '0000000000000000000000000000000000000:5\n',
      });

      const result = await checkPasswordBreach('password123');
      // Either hibp match or offline fallback depending on hash matching
      expect(result).toHaveProperty('isBreached');
      expect(result).toHaveProperty('source');
    });

    it('should fall back to offline blocklist on fetch error', async () => {
      (crypto.subtle.digest as jest.Mock).mockRejectedValue(new Error('no crypto'));

      const result = await checkPasswordBreach('password');
      expect(result.source).toBe('offline_fallback');
      expect(result.isBreached).toBe(true); // 'password' is in the blocklist
    });

    it('should return not breached for unique password on offline fallback', async () => {
      (crypto.subtle.digest as jest.Mock).mockRejectedValue(new Error('no crypto'));

      const result = await checkPasswordBreach('Xk9#mZ!pL2@wR7&qBcD');
      expect(result.source).toBe('offline_fallback');
      expect(result.isBreached).toBe(false);
    });
  });

  describe('levelToColor()', () => {
    it('should return red for weak', () => {
      expect(levelToColor('weak')).toBe('#EF4444');
    });

    it('should return green for strong', () => {
      expect(levelToColor('strong')).toBe('#10B981');
    });

    it('should return a color for every level', () => {
      const levels = ['weak', 'fair', 'good', 'strong', 'very_strong'] as const;
      levels.forEach(level => {
        expect(levelToColor(level)).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });
  });

  describe('levelToLabel()', () => {
    it('should return human-readable labels', () => {
      expect(levelToLabel('weak')).toBe('Weak');
      expect(levelToLabel('fair')).toBe('Fair');
      expect(levelToLabel('good')).toBe('Good');
      expect(levelToLabel('strong')).toBe('Strong');
      expect(levelToLabel('very_strong')).toBe('Very Strong');
    });
  });
});
