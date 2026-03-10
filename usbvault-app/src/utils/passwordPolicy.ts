/**
 * Password Strength Checker
 *
 * Evaluates password strength using two established assessment frameworks:
 *
 *   1. NIST SP 800-63B (2017) — Digital Identity Guidelines
 *      Key rules applied:
 *        - Minimum length of 8 characters (§5.1.1) — our policy uses 15
 *        - Check against common/weak passwords (§5.1.1)
 *        - Check that the password does not contain the user's own
 *          context information (§5.1.1)
 *        - No mandatory complexity rules per NIST, but complexity is
 *          still scored as a bonus (NIST allows but discourages forced
 *          complexity, so it is advisory here)
 *
 *   2. OWASP Authentication Cheat Sheet (2021)
 *      Key rules applied:
 *        - Minimum 8 characters, recommend 12+ (scored)
 *        - Encourage use of all four character classes:
 *          lowercase, uppercase, digits, special characters
 *        - Reject passwords found in known breach / common-password lists
 *
 * Three input validation strategies:
 *   1. Type Checking   — ensure inputs are strings, not other types
 *   2. Length Validation — enforce min/max lengths on name fields and
 *                          the password itself
 *   3. Pattern / Content Checking — ensure name fields contain only
 *                          alphabetic characters (no digits/symbols)
 */

// ─── Constants ───────────────────────────────────────────────────────

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

/** OWASP recommended minimum */
export const OWASP_MIN_LENGTH = 8;
/** OWASP recommended target for "good" passwords */
export const OWASP_RECOMMENDED_LENGTH = 12;

/** Input field constraints */
export const NAME_MIN_LENGTH = 1;
export const NAME_MAX_LENGTH = 64;

// ─── Types ───────────────────────────────────────────────────────────

export type StrengthLevel = 'weak' | 'fair' | 'good' | 'strong' | 'very_strong';

export interface CharacterClassResult {
  hasLowercase: boolean;
  hasUppercase: boolean;
  hasDigits: boolean;
  hasSpecial: boolean;
  /** Number of character classes present (0-4) */
  classCount: number;
}

export interface PasswordValidationResult {
  isValid: boolean;
  score: number; // 0-5
  level: StrengthLevel;
  estimatedCrackTime: string;
  feedback: string[];
  checks: {
    minLength: boolean;
    maxLength: boolean;
    notCommon: boolean;
    notContextual: boolean;
    notKeyboardPattern: boolean;
    /** True if user context (name, email) was NOT found in the password */
    notUserContext: boolean;
  };
  /** OWASP character class breakdown */
  characterClasses: CharacterClassResult;
}

export interface PasswordContext {
  vaultName?: string;
  username?: string;
  email?: string;
  /** First name for user-context checking */
  firstName?: string;
  /** Last name for user-context checking */
  lastName?: string;
}

export interface HIBPResult {
  isBreached: boolean;
  source: 'hibp' | 'offline_fallback';
  matchCount?: number;
}

// ─── Input Validation ────────────────────────────────────────────────
// Three strategies mirroring input_validation.py:
//   1. Type Checking   — ensure inputs are strings
//   2. Length Validation — enforce min/max lengths
//   3. Pattern / Content Checking — alphabetic-only for name fields

export interface InputValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Strategy 1: Type Checking — ensure the input is a string.
 */
export function validateType(value: unknown, fieldName: string): InputValidationResult {
  if (typeof value !== 'string') {
    return {
      isValid: false,
      errors: [`${fieldName} must be a text string`],
    };
  }
  return { isValid: true, errors: [] };
}

/**
 * Strategy 2: Length Validation — enforce min/max character bounds.
 */
export function validateLength(
  value: string,
  fieldName: string,
  min: number = NAME_MIN_LENGTH,
  max: number = NAME_MAX_LENGTH,
): InputValidationResult {
  const errors: string[] = [];

  if (value.length < min) {
    errors.push(`${fieldName} must be at least ${min} character${min !== 1 ? 's' : ''}`);
  }
  if (value.length > max) {
    errors.push(`${fieldName} must be at most ${max} characters`);
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Strategy 3: Pattern / Content Checking — ensure name fields contain
 * only alphabetic characters (letters, spaces, hyphens, apostrophes).
 * Digits and symbols are rejected.
 */
export function validateNamePattern(value: string, fieldName: string): InputValidationResult {
  // Allow letters (including Unicode), spaces, hyphens, apostrophes
  const namePattern = /^[a-zA-Z\u00C0-\u024F\s'-]+$/;

  if (!namePattern.test(value)) {
    return {
      isValid: false,
      errors: [`${fieldName} should contain only letters, spaces, hyphens, or apostrophes`],
    };
  }
  return { isValid: true, errors: [] };
}

/**
 * Combined input field validation — runs all three strategies in order.
 */
export function validateInputField(
  value: unknown,
  fieldName: string,
  options: {
    minLength?: number;
    maxLength?: number;
    /** If true, enforce alphabetic-only pattern (for name fields) */
    namePattern?: boolean;
  } = {},
): InputValidationResult {
  const allErrors: string[] = [];

  // Strategy 1: Type check
  const typeResult = validateType(value, fieldName);
  if (!typeResult.isValid) {
    return typeResult; // Can't proceed without a string
  }

  const strValue = value as string;

  // Strategy 2: Length check
  const lengthResult = validateLength(
    strValue,
    fieldName,
    options.minLength ?? NAME_MIN_LENGTH,
    options.maxLength ?? NAME_MAX_LENGTH,
  );
  allErrors.push(...lengthResult.errors);

  // Strategy 3: Pattern check (only for name fields, and only if non-empty)
  if (options.namePattern && strValue.length > 0) {
    const patternResult = validateNamePattern(strValue, fieldName);
    allErrors.push(...patternResult.errors);
  }

  return { isValid: allErrors.length === 0, errors: allErrors };
}

// ─── OWASP Character Class Analysis ─────────────────────────────────

/**
 * Analyze which of the four OWASP character classes are present.
 * Classes: lowercase, uppercase, digits, special characters.
 */
export function analyzeCharacterClasses(password: string): CharacterClassResult {
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasDigits = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  let classCount = 0;
  if (hasLowercase) classCount++;
  if (hasUppercase) classCount++;
  if (hasDigits) classCount++;
  if (hasSpecial) classCount++;

  return { hasLowercase, hasUppercase, hasDigits, hasSpecial, classCount };
}

// ─── Common Password Blocklist (Top ~200 most common) ────────────────
// These are the most frequently seen passwords in data breaches.
// Full NIST compliance would use a larger list; this covers the critical ones.

const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'password', '123456', '12345678', 'qwerty', 'abc123', 'monkey', 'master',
  'dragon', '111111', 'baseball', 'iloveyou', 'trustno1', 'sunshine',
  'letmein', 'football', 'shadow', 'michael', 'login', 'starwars',
  'passw0rd', 'welcome', 'batman', 'solo', 'admin', 'princess',
  'access', 'flower', 'qwerty123', 'password1', 'password123',
  '1234567890', '123456789', '12345', '1234567', '123123', '654321',
  '000000', '1234', 'charlie', 'donald', 'zaq1zaq1', 'mustang',
  'freedom', 'whatever', 'qazwsx', 'trustno1', 'jordan', 'harley',
  'robert', 'matthew', 'daniel', 'andrew', 'andrea', 'joshua',
  'nicole', 'jessica', 'ashley', 'jennifer', 'amanda', 'stephanie',
  'rachel', 'hannah', 'samantha', 'thunder', 'tigger', 'dallas',
  'austin', 'rangers', 'pepper', 'maggie', 'hunter', 'cheese',
  'corvette', 'merlin', 'diamond', 'yellow', 'bigdog', 'secret',
  'summer', 'ginger', 'sparky', 'yankees', 'camaro', 'matrix',
  'falcon', 'guitar', 'internet', 'silver', 'runner', 'killer',
  'phoenix', 'george', 'morgan', 'soccer', 'hockey', 'chicken',
  'startrek', 'redskins', 'butthead', 'blowfish', 'test', 'test123',
  'fuckyou', 'asshole', 'pussy', 'buster', 'cookie', 'computer',
  'midnight', 'nascar', 'peanut', 'cowboys', 'steelers', 'jasmine',
  'winter', 'oliver', 'thomas', 'william', 'joseph', 'jackson',
  'gabriel', 'anthony', 'alexander', 'benjamin', 'nicholas', 'victoria',
  'superman', 'spiderman', 'nothing', 'lakers', 'jordan23', 'iwantu',
  'looking', 'helpme', 'angel', 'please', 'changeme', 'changeit',
  'default', 'temp', 'temporary', 'guest', 'newuser', 'user',
  'administrator', 'root', 'sysadmin', 'backup',
  // Common long passwords / passphrases
  'letmeinplease', 'iloveyouforever', 'passwordpassword',
  'qwertyuiopasdfg', 'abcdefghijklmno', 'aaaaaaaaaaaaaaa',
  'bbbbbbbbbbbbbbb', '111111111111111', '123456789012345',
  '000000000000000', 'passwordpassword1', 'password12345678',
  // Keyboard patterns extended
  'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'qazwsxedc', 'qweasdzxc',
  '1qaz2wsx3edc', 'zaq12wsx', 'p0o9i8u7', '0987654321',
  'poiuytrewq', 'lkjhgfdsa', 'mnbvcxz',
]);

// Keyboard patterns to detect (sequences of adjacent keys)
const KEYBOARD_PATTERNS: readonly string[] = [
  'qwerty', 'qwertz', 'azerty', 'asdf', 'zxcv', 'qweasd', 'qazwsx',
  '1234', '2345', '3456', '4567', '5678', '6789', '7890',
  'abcd', 'bcde', 'cdef', 'defg', 'efgh', 'fghi', 'ghij',
  'hijk', 'ijkl', 'jklm', 'klmn', 'lmno', 'mnop', 'nopq',
  'opqr', 'pqrs', 'qrst', 'rstu', 'stuv', 'tuvw', 'uvwx',
  'vwxy', 'wxyz',
];

// Context-specific terms to block (app-related)
const CONTEXT_BLOCKLIST = [
  'qav', 'vault', 'encrypt', 'decrypt', 'password', 'passphrase',
  'secret', 'master', 'key', 'crypto',
];

// ─── Validation ──────────────────────────────────────────────────────

/**
 * Validates a password against NIST SP 800-63B-4 guidelines and
 * OWASP Authentication Cheat Sheet (2021) recommendations.
 *
 * NIST key requirements:
 * - Minimum 15 characters (our policy, NIST minimum is 8)
 * - No composition rules (no forced uppercase/digits/special chars)
 * - Check against known-compromised password lists
 * - Block context-specific passwords
 * - Block passwords containing user's personal information (§5.1.1)
 *
 * OWASP key rules:
 * - Minimum 8 characters, recommend 12+ (scored)
 * - Encourage use of all four character classes (advisory scoring)
 * - Reject passwords found in known breach / common-password lists
 */
export function validatePassword(
  password: string,
  context?: PasswordContext,
): PasswordValidationResult {
  const feedback: string[] = [];
  const checks = {
    minLength: false,
    maxLength: true,
    notCommon: true,
    notContextual: true,
    notKeyboardPattern: true,
    notUserContext: true,
  };

  // ── Length checks ──
  checks.minLength = password.length >= PASSWORD_MIN_LENGTH;
  checks.maxLength = password.length <= PASSWORD_MAX_LENGTH;

  if (!checks.minLength) {
    feedback.push(`Minimum ${PASSWORD_MIN_LENGTH} characters required (${password.length} entered)`);
  }
  if (!checks.maxLength) {
    feedback.push(`Maximum ${PASSWORD_MAX_LENGTH} characters allowed`);
  }

  // ── Common password check ──
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(password)) {
    checks.notCommon = false;
    feedback.push('This is a commonly used password — choose something unique');
  }

  // Also check if password is a common password with simple substitutions
  const desubstituted = lower
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/!/g, 'i');
  if (desubstituted !== lower && COMMON_PASSWORDS.has(desubstituted)) {
    checks.notCommon = false;
    feedback.push('This resembles a commonly used password with character substitutions');
  }

  // ── Keyboard pattern check ──
  for (const pattern of KEYBOARD_PATTERNS) {
    if (lower.includes(pattern) && pattern.length >= 4) {
      // Only flag if the pattern makes up a significant portion of the password
      if (pattern.length >= lower.length * 0.4) {
        checks.notKeyboardPattern = false;
        feedback.push('Avoid keyboard patterns (e.g., "qwerty", "asdf", "1234")');
        break;
      }
    }
  }

  // ── Repeated character check ──
  if (/(.)\1{4,}/.test(password)) {
    checks.notKeyboardPattern = false;
    if (!feedback.some((f) => f.includes('keyboard'))) {
      feedback.push('Avoid long sequences of repeated characters');
    }
  }

  // ── Sequential character check (abc, 123, etc.) ──
  if (hasLongSequentialChars(password, 5)) {
    checks.notKeyboardPattern = false;
    if (!feedback.some((f) => f.includes('keyboard') || f.includes('repeated'))) {
      feedback.push('Avoid long sequential character runs (e.g., "abcdef", "123456")');
    }
  }

  // ── App-context blocking (vault-specific terms) ──
  for (const term of CONTEXT_BLOCKLIST) {
    if (term.length >= 3 && lower.includes(term)) {
      checks.notContextual = false;
      feedback.push(`Avoid using "${term}" in your password`);
      break;
    }
  }

  // ── User context checking (NIST §5.1.1) ──
  // Password must not contain the user's own context information:
  // first name, last name, username, email local-part.
  if (context) {
    const userTerms: string[] = [];

    if (context.firstName && context.firstName.length >= 3) {
      userTerms.push(context.firstName.toLowerCase());
    }
    if (context.lastName && context.lastName.length >= 3) {
      userTerms.push(context.lastName.toLowerCase());
    }
    if (context.username && context.username.length >= 3) {
      userTerms.push(context.username.toLowerCase());
    }
    if (context.email) {
      const localPart = context.email.split('@')[0].toLowerCase();
      if (localPart.length >= 3) {
        userTerms.push(localPart);
      }
    }
    if (context.vaultName && context.vaultName.length >= 3) {
      userTerms.push(context.vaultName.toLowerCase());
    }

    for (const term of userTerms) {
      if (lower.includes(term)) {
        checks.notUserContext = false;
        feedback.push(`Password must not contain your personal information ("${term}")`);
        break;
      }
    }
  }

  // ── OWASP character class analysis ──
  const characterClasses = analyzeCharacterClasses(password);

  // Advisory feedback for missing character classes (OWASP encourages but
  // NIST discourages *forcing* complexity — so this is advisory only)
  if (checks.minLength && characterClasses.classCount < 3) {
    feedback.push(
      `Tip: using more character types improves strength (${characterClasses.classCount}/4 classes used)`,
    );
  }

  // ── Calculate entropy and crack time ──
  const entropy = calculateEntropy(password);
  const crackTime = estimateCrackTime(entropy);

  // ── Score (0-5) — combines NIST entropy + OWASP class bonus ──
  const score = calculateScore(password, entropy, checks, characterClasses);
  const level = scoreToLevel(score);

  // ── Overall validity ──
  // Password is invalid if it fails any hard check.
  const isValid =
    checks.minLength &&
    checks.maxLength &&
    checks.notCommon &&
    checks.notContextual &&
    checks.notUserContext;

  // Add encouragement for valid passwords
  if (isValid && feedback.length === 0) {
    if (score >= 4) {
      feedback.push('Excellent password strength');
    } else if (score >= 3) {
      feedback.push('Good password — consider making it longer for extra security');
    }
  }

  return {
    isValid,
    score,
    level,
    estimatedCrackTime: crackTime,
    feedback,
    checks,
    characterClasses,
  };
}

// ─── Entropy Calculation ─────────────────────────────────────────────

function calculateEntropy(password: string): number {
  let charsetSize = 0;

  if (/[a-z]/.test(password)) charsetSize += 26;
  if (/[A-Z]/.test(password)) charsetSize += 26;
  if (/[0-9]/.test(password)) charsetSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) charsetSize += 33; // common special chars

  if (charsetSize === 0) charsetSize = 26; // fallback

  // Shannon entropy: length * log2(charsetSize)
  return password.length * Math.log2(charsetSize);
}

function estimateCrackTime(entropyBits: number): string {
  // Assume 10 billion guesses/second (high-end GPU cluster)
  const GUESSES_PER_SECOND = 10_000_000_000;

  const totalGuesses = Math.pow(2, entropyBits);
  // Average case: attacker finds it in half the keyspace
  const secondsToCrack = totalGuesses / (2 * GUESSES_PER_SECOND);

  if (secondsToCrack < 0.001) return 'Instant';
  if (secondsToCrack < 1) return 'Less than 1 second';
  if (secondsToCrack < 60) return `${Math.round(secondsToCrack)} seconds`;
  if (secondsToCrack < 3600) return `${Math.round(secondsToCrack / 60)} minutes`;
  if (secondsToCrack < 86400) return `${Math.round(secondsToCrack / 3600)} hours`;
  if (secondsToCrack < 86400 * 365) return `${Math.round(secondsToCrack / 86400)} days`;
  if (secondsToCrack < 86400 * 365 * 100) return `${Math.round(secondsToCrack / (86400 * 365))} years`;
  if (secondsToCrack < 86400 * 365 * 1_000_000) return `${Math.round(secondsToCrack / (86400 * 365 * 1000))}K+ years`;
  if (secondsToCrack < 86400 * 365 * 1_000_000_000) return `${Math.round(secondsToCrack / (86400 * 365 * 1_000_000))}M+ years`;
  return 'Billions of years';
}

// ─── Scoring ─────────────────────────────────────────────────────────

/**
 * Calculates a 0-5 score combining NIST entropy-based assessment with
 * OWASP character class diversity as an advisory bonus.
 */
function calculateScore(
  password: string,
  entropy: number,
  checks: PasswordValidationResult['checks'],
  charClasses: CharacterClassResult,
): number {
  let score = 0;

  // Entropy-based scoring (primary factor per NIST)
  if (entropy >= 80) score += 3;
  else if (entropy >= 60) score += 2;
  else if (entropy >= 40) score += 1;

  // Length bonus
  if (password.length >= 20) score += 1;
  if (password.length >= 30) score += 1;

  // OWASP character class bonus (advisory, not required)
  // Using all 4 classes earns +1; using 3 classes earns +0.5 (rounded)
  if (charClasses.classCount === 4) score += 1;

  // Penalties
  if (!checks.notCommon) score = Math.max(0, score - 2);
  if (!checks.notContextual) score = Math.max(0, score - 1);
  if (!checks.notUserContext) score = Math.max(0, score - 1);
  if (!checks.notKeyboardPattern) score = Math.max(0, score - 1);
  if (!checks.minLength) score = 0;

  return Math.min(5, score);
}

function scoreToLevel(score: number): StrengthLevel {
  if (score <= 0) return 'weak';
  if (score === 1) return 'fair';
  if (score === 2) return 'good';
  if (score <= 4) return 'strong';
  return 'very_strong';
}

// ─── Helper: Sequential Character Detection ─────────────────────────

function hasLongSequentialChars(password: string, minLength: number): boolean {
  let ascending = 1;
  let descending = 1;

  for (let i = 1; i < password.length; i++) {
    const diff = password.charCodeAt(i) - password.charCodeAt(i - 1);
    if (diff === 1) {
      ascending++;
      descending = 1;
      if (ascending >= minLength) return true;
    } else if (diff === -1) {
      descending++;
      ascending = 1;
      if (descending >= minLength) return true;
    } else {
      ascending = 1;
      descending = 1;
    }
  }
  return false;
}

// ─── HIBP k-Anonymity Breach Check ──────────────────────────────────

/**
 * Check if a password appears in known data breaches using the
 * Have I Been Pwned k-anonymity API.
 *
 * Only the first 5 characters of the SHA-1 hash are sent to the server,
 * preserving privacy. The full hash is compared locally.
 *
 * @returns HIBPResult with breach status and source
 */
export async function checkPasswordBreach(password: string): Promise<HIBPResult> {
  try {
    // SHA-1 hash the password
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();

    const prefix = hashHex.substring(0, 5);
    const suffix = hashHex.substring(5);

    // Query HIBP API (k-anonymity: only prefix sent)
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' }, // Add padding to prevent response size analysis
    });

    if (!response.ok) {
      throw new Error(`HIBP API returned ${response.status}`);
    }

    const text = await response.text();
    const lines = text.split('\n');

    for (const line of lines) {
      const [hashSuffix, count] = line.trim().split(':');
      if (hashSuffix === suffix) {
        return {
          isBreached: true,
          source: 'hibp',
          matchCount: parseInt(count, 10),
        };
      }
    }

    return { isBreached: false, source: 'hibp' };
  } catch {
    // Network error or API unavailable — fall back to local blocklist
    const lower = password.toLowerCase();
    const isCommon = COMMON_PASSWORDS.has(lower);
    return {
      isBreached: isCommon,
      source: 'offline_fallback',
    };
  }
}

// ─── UI Helpers ──────────────────────────────────────────────────────

export function levelToColor(level: StrengthLevel): string {
  switch (level) {
    case 'weak': return '#EF4444';
    case 'fair': return '#F59E0B';
    case 'good': return '#3B82F6';
    case 'strong': return '#10B981';
    case 'very_strong': return '#06D6A0';
  }
}

export function levelToLabel(level: StrengthLevel): string {
  switch (level) {
    case 'weak': return 'Weak';
    case 'fair': return 'Fair';
    case 'good': return 'Good';
    case 'strong': return 'Strong';
    case 'very_strong': return 'Very Strong';
  }
}
