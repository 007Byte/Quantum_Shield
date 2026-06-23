/**
 * Classroom course module and cipher demo data definitions.
 * Extracted from classroom.tsx for maintainability (MONO-1).
 */

// ── Persistence ──────────────────────────────────────────────

import { Platform } from 'react-native';

export const PROGRESS_KEY = 'usbvault_classroom_progress';

export function loadProgress(): Set<string> {
  if (Platform.OS !== 'web') return new Set();
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    /* localStorage unavailable */
  }
  return new Set();
}

export function saveProgress(completed: Set<string>): void {
  if (Platform.OS !== 'web') return;
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify([...completed]));
  } catch {
    /* localStorage unavailable */
  }
}

// ── Types ────────────────────────────────────────────────────

export interface CourseModule {
  id: string;
  icon: string;
  titleKey: string;
  descKey: string;
  estimatedTime: string;
  color: string;
  sections: { headingKey: string; bodyKey: string }[];
  keyTakeawayKey: string;
}

export interface CipherDemo {
  id: string;
  nameKey: string;
  typeKey: string;
  icon: 'rotate-cw' | 'code' | 'shield' | 'lock' | 'layers' | 'key' | 'bar-chart-2';
  descKey: string;
  takeawayKey?: string;
  /** i18n prefix for Learn More content: {prefix}.howItWorks, .strengths, .weaknesses, .usedIn */
  learnMorePrefix: string;
}

export interface KDFDemo {
  id: string;
  nameKey: string;
  descKey: string;
  color: string;
  isLive: boolean;
  badge?: string;
  learnMorePrefix: string;
}

// ── Course Modules ───────────────────────────────────────────

export const COURSE_MODULES: CourseModule[] = [
  {
    id: 'encryption-fundamentals',
    icon: 'lock',
    titleKey: 'classroom.lesson1Title',
    descKey: 'classroom.lesson1Desc',
    estimatedTime: '~10 min',
    color: '#A855F7',
    sections: [
      {
        headingKey: 'classroom.lesson1.section1.title',
        bodyKey: 'classroom.lesson1.section1.body',
      },
      {
        headingKey: 'classroom.lesson1.section2.title',
        bodyKey: 'classroom.lesson1.section2.body',
      },
      {
        headingKey: 'classroom.lesson1.section3.title',
        bodyKey: 'classroom.lesson1.section3.body',
      },
      {
        headingKey: 'classroom.lesson1.section4.title',
        bodyKey: 'classroom.lesson1.section4.body',
      },
    ],
    keyTakeawayKey: 'classroom.lesson1.takeaway',
  },
  {
    id: 'post-quantum-crypto',
    icon: 'shield',
    titleKey: 'classroom.lesson2Title',
    descKey: 'classroom.lesson2Desc',
    estimatedTime: '~10 min',
    color: '#22D3EE',
    sections: [
      {
        headingKey: 'classroom.lesson2.section1.title',
        bodyKey: 'classroom.lesson2.section1.body',
      },
      {
        headingKey: 'classroom.lesson2.section2.title',
        bodyKey: 'classroom.lesson2.section2.body',
      },
      {
        headingKey: 'classroom.lesson2.section3.title',
        bodyKey: 'classroom.lesson2.section3.body',
      },
      {
        headingKey: 'classroom.lesson2.section4.title',
        bodyKey: 'classroom.lesson2.section4.body',
      },
    ],
    keyTakeawayKey: 'classroom.lesson2.takeaway',
  },
  {
    id: 'password-security',
    icon: 'key',
    titleKey: 'classroom.lesson3Title',
    descKey: 'classroom.lesson3Desc',
    estimatedTime: '~10 min',
    color: '#34D399',
    sections: [
      {
        headingKey: 'classroom.lesson3.section1.title',
        bodyKey: 'classroom.lesson3.section1.body',
      },
      {
        headingKey: 'classroom.lesson3.section2.title',
        bodyKey: 'classroom.lesson3.section2.body',
      },
      {
        headingKey: 'classroom.lesson3.section3.title',
        bodyKey: 'classroom.lesson3.section3.body',
      },
      {
        headingKey: 'classroom.lesson3.section4.title',
        bodyKey: 'classroom.lesson3.section4.body',
      },
    ],
    keyTakeawayKey: 'classroom.lesson3.takeaway',
  },
  {
    id: 'usb-security',
    icon: 'disc',
    titleKey: 'classroom.lesson4Title',
    descKey: 'classroom.lesson4Desc',
    estimatedTime: '~10 min',
    color: '#60A5FA',
    sections: [
      {
        headingKey: 'classroom.lesson4.section1.title',
        bodyKey: 'classroom.lesson4.section1.body',
      },
      {
        headingKey: 'classroom.lesson4.section2.title',
        bodyKey: 'classroom.lesson4.section2.body',
      },
      {
        headingKey: 'classroom.lesson4.section3.title',
        bodyKey: 'classroom.lesson4.section3.body',
      },
      {
        headingKey: 'classroom.lesson4.section4.title',
        bodyKey: 'classroom.lesson4.section4.body',
      },
    ],
    keyTakeawayKey: 'classroom.lesson4.takeaway',
  },
  {
    id: 'zero-trust',
    icon: 'eye-off',
    titleKey: 'classroom.lesson5Title',
    descKey: 'classroom.lesson5Desc',
    estimatedTime: '~10 min',
    color: '#F472B6',
    sections: [
      {
        headingKey: 'classroom.lesson5.section1.title',
        bodyKey: 'classroom.lesson5.section1.body',
      },
      {
        headingKey: 'classroom.lesson5.section2.title',
        bodyKey: 'classroom.lesson5.section2.body',
      },
      {
        headingKey: 'classroom.lesson5.section3.title',
        bodyKey: 'classroom.lesson5.section3.body',
      },
      {
        headingKey: 'classroom.lesson5.section4.title',
        bodyKey: 'classroom.lesson5.section4.body',
      },
    ],
    keyTakeawayKey: 'classroom.lesson5.takeaway',
  },
  {
    id: 'data-recovery',
    icon: 'save',
    titleKey: 'classroom.lesson6Title',
    descKey: 'classroom.lesson6Desc',
    estimatedTime: '~10 min',
    color: '#FBBF24',
    sections: [
      {
        headingKey: 'classroom.lesson6.section1.title',
        bodyKey: 'classroom.lesson6.section1.body',
      },
      {
        headingKey: 'classroom.lesson6.section2.title',
        bodyKey: 'classroom.lesson6.section2.body',
      },
      {
        headingKey: 'classroom.lesson6.section3.title',
        bodyKey: 'classroom.lesson6.section3.body',
      },
      {
        headingKey: 'classroom.lesson6.section4.title',
        bodyKey: 'classroom.lesson6.section4.body',
      },
    ],
    keyTakeawayKey: 'classroom.lesson6.takeaway',
  },
  {
    id: 'threat-detection',
    icon: 'alert-triangle',
    titleKey: 'classroom.lesson7Title',
    descKey: 'classroom.lesson7Desc',
    estimatedTime: '~10 min',
    color: '#EF4444',
    sections: [
      {
        headingKey: 'classroom.lesson7.section1.title',
        bodyKey: 'classroom.lesson7.section1.body',
      },
      {
        headingKey: 'classroom.lesson7.section2.title',
        bodyKey: 'classroom.lesson7.section2.body',
      },
      {
        headingKey: 'classroom.lesson7.section3.title',
        bodyKey: 'classroom.lesson7.section3.body',
      },
      {
        headingKey: 'classroom.lesson7.section4.title',
        bodyKey: 'classroom.lesson7.section4.body',
      },
    ],
    keyTakeawayKey: 'classroom.lesson7.takeaway',
  },
  {
    id: 'advanced-forensics',
    icon: 'search',
    titleKey: 'classroom.lesson8Title',
    descKey: 'classroom.lesson8Desc',
    estimatedTime: '~10 min',
    color: '#818CF8',
    sections: [
      {
        headingKey: 'classroom.lesson8.section1.title',
        bodyKey: 'classroom.lesson8.section1.body',
      },
      {
        headingKey: 'classroom.lesson8.section2.title',
        bodyKey: 'classroom.lesson8.section2.body',
      },
      {
        headingKey: 'classroom.lesson8.section3.title',
        bodyKey: 'classroom.lesson8.section3.body',
      },
      {
        headingKey: 'classroom.lesson8.section4.title',
        bodyKey: 'classroom.lesson8.section4.body',
      },
    ],
    keyTakeawayKey: 'classroom.lesson8.takeaway',
  },
];

// ── Interactive Crypto Lab (V2.0 Fortress Spec §12) ────────────────

export const CIPHER_DEMOS: CipherDemo[] = [
  {
    id: 'caesar',
    nameKey: 'classroom.cipher.caesar.name',
    typeKey: 'classroom.cipher.caesar.type',
    icon: 'rotate-cw',
    descKey: 'classroom.cipher.caesar.desc',
    learnMorePrefix: 'classroom.learn.caesar',
  },
  {
    id: 'xor',
    nameKey: 'classroom.cipher.xor.name',
    typeKey: 'classroom.cipher.xor.type',
    icon: 'code',
    descKey: 'classroom.cipher.xor.desc',
    learnMorePrefix: 'classroom.learn.xor',
  },
  {
    id: 'aes-gcm',
    nameKey: 'classroom.cipher.aesGcm.name',
    typeKey: 'classroom.cipher.aesGcm.type',
    icon: 'shield',
    descKey: 'classroom.cipher.aesGcm.desc',
    learnMorePrefix: 'classroom.learn.aesGcm',
  },
  {
    id: 'xchacha',
    nameKey: 'classroom.cipher.xchacha.name',
    typeKey: 'classroom.cipher.xchacha.type',
    icon: 'lock',
    descKey: 'classroom.cipher.xchacha.desc',
    learnMorePrefix: 'classroom.learn.xchacha',
  },
  {
    id: 'aes-cbc',
    nameKey: 'classroom.cipher.aesCbc.name',
    typeKey: 'classroom.cipher.aesCbc.type',
    icon: 'layers',
    descKey: 'classroom.cipher.aesCbc.desc',
    takeawayKey: 'classroom.cipher.aesCbc.takeaway',
    learnMorePrefix: 'classroom.learn.aesCbc',
  },
  {
    id: 'rsa',
    nameKey: 'classroom.cipher.rsa.name',
    typeKey: 'classroom.cipher.rsa.type',
    icon: 'key',
    descKey: 'classroom.cipher.rsa.desc',
    takeawayKey: 'classroom.cipher.rsa.takeaway',
    learnMorePrefix: 'classroom.learn.rsa',
  },
  {
    id: 'chacha-compare',
    nameKey: 'classroom.cipher.chachaCompare.name',
    typeKey: 'classroom.cipher.chachaCompare.type',
    icon: 'bar-chart-2',
    descKey: 'classroom.cipher.chachaCompare.desc',
    takeawayKey: 'classroom.cipher.chachaCompare.takeaway',
    learnMorePrefix: 'classroom.learn.chachaCompare',
  },
];

// ── Cipher Helper Functions ──────────────────────────────────

export function caesarEncrypt(text: string, shift: number): string {
  return text
    .split('')
    .map(c => {
      if (c >= 'a' && c <= 'z')
        return String.fromCharCode(((c.charCodeAt(0) - 97 + shift) % 26) + 97);
      if (c >= 'A' && c <= 'Z')
        return String.fromCharCode(((c.charCodeAt(0) - 65 + shift) % 26) + 65);
      return c;
    })
    .join('');
}

export function xorEncrypt(text: string, key: string): string {
  const keyBytes = new TextEncoder().encode(key || 'k');
  const textBytes = new TextEncoder().encode(text);
  const result = textBytes.map((b, i) => b ^ keyBytes[i % keyBytes.length]);
  return Array.from(result)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ');
}

// ── KDF Lab ──────────────────────────────────────────────────

export const KDF_DEMOS: KDFDemo[] = [
  {
    id: 'pbkdf2',
    nameKey: 'classroom.kdf.pbkdf2.name',
    descKey: 'classroom.kdf.pbkdf2.desc',
    color: '#60A5FA',
    isLive: true,
    learnMorePrefix: 'classroom.learn.pbkdf2',
  },
  {
    id: 'bcrypt',
    nameKey: 'classroom.kdf.bcrypt.name',
    descKey: 'classroom.kdf.bcrypt.desc',
    color: '#34D399',
    isLive: false,
    learnMorePrefix: 'classroom.learn.bcrypt',
  },
  {
    id: 'scrypt',
    nameKey: 'classroom.kdf.scrypt.name',
    descKey: 'classroom.kdf.scrypt.desc',
    color: '#FBBF24',
    isLive: false,
    learnMorePrefix: 'classroom.learn.scrypt',
  },
  {
    id: 'argon2i',
    nameKey: 'classroom.kdf.argon2i.name',
    descKey: 'classroom.kdf.argon2i.desc',
    color: '#F472B6',
    isLive: false,
    learnMorePrefix: 'classroom.learn.argon2i',
  },
  {
    id: 'argon2id',
    nameKey: 'classroom.kdf.argon2id.name',
    descKey: 'classroom.kdf.argon2id.desc',
    color: '#A855F7',
    isLive: false,
    badge: 'classroom.kdf.argon2id.badge',
    learnMorePrefix: 'classroom.learn.argon2id',
  },
  {
    id: 'hkdf',
    nameKey: 'classroom.kdf.hkdf.name',
    descKey: 'classroom.kdf.hkdf.desc',
    color: '#22D3EE',
    isLive: true,
    learnMorePrefix: 'classroom.learn.hkdf',
  },
];
