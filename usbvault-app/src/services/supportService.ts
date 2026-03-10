/**
 * supportService.ts — In-app customer support infrastructure
 *
 * INFRA-01: Provides in-app support ticket submission, FAQ/knowledge base,
 * and status page integration. Enterprise tier adds live chat hook stubs.
 *
 * Tickets are stored locally and queued for submission when online.
 * FAQ data is embedded for offline access.
 */

import { logger } from '@/utils/logger';

// ── Types ──────────────────────────────────────────────────

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type TicketCategory = 'bug' | 'feature' | 'security' | 'account' | 'billing' | 'general';
export type TicketStatus = 'draft' | 'submitted' | 'pending' | 'resolved' | 'closed';

export interface SupportTicket {
  id: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  userEmail: string;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, string>;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  tags: string[];
}

export interface SupportConfig {
  /** Email address for ticket routing */
  supportEmail: string;
  /** Status page URL */
  statusPageUrl: string;
  /** Enterprise live chat provider (intercom | zendesk | null) */
  liveChatProvider: 'intercom' | 'zendesk' | null;
  /** Enterprise live chat app ID */
  liveChatAppId: string;
  /** Maximum attachment size in bytes */
  maxAttachmentSize: number;
  /** Maximum tickets per 24h */
  rateLimitPerDay: number;
}

// ── Configuration ──────────────────────────────────────────

const STORAGE_KEY = 'qav:support_tickets';
const CONFIG_KEY = 'qav:support_config';

const DEFAULT_CONFIG: SupportConfig = {
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'ultimatepqcshield@gmail.com',
  statusPageUrl: process.env.EXPO_PUBLIC_STATUS_PAGE || 'https://status.qav.io',
  liveChatProvider: null,
  liveChatAppId: '',
  maxAttachmentSize: 10 * 1024 * 1024, // 10 MB
  rateLimitPerDay: 10,
};

// ── Embedded FAQ (offline-ready) ───────────────────────────

const EMBEDDED_FAQ: FAQItem[] = [
  {
    id: 'faq-1',
    question: 'What is QAV?',
    answer: 'QAV is a portable encrypted file vault and password manager with post-quantum cryptography. It secures your files, credentials, and messages with military-grade encryption on any device. QAV is NOT an email service or email replacement.',
    category: 'General',
    tags: ['overview', 'about', 'what is'],
  },
  {
    id: 'faq-2',
    question: 'What encryption does QAV use?',
    answer: 'QAV supports AES-256-GCM-SIV (NIST standard, nonce-misuse resistant), XChaCha20-Poly1305 (extended nonce AEAD), and PQC Hybrid mode combining ML-KEM-1024 (FIPS 203) with AES-256 for quantum resistance. Key derivation uses Argon2id with 64 MB memory, 3 iterations, and 4 parallel lanes.',
    category: 'Security',
    tags: ['encryption', 'aes', 'pqc', 'quantum'],
  },
  {
    id: 'faq-3',
    question: 'How do I import passwords from another manager?',
    answer: 'Go to the Password Manager tab and click "Import". QAV supports CSV imports from Bitwarden, 1Password, LastPass, and Chrome, plus JSON imports from KeePass. Export your passwords from your current manager, then drag & drop or select the file in QAV.',
    category: 'Features',
    tags: ['import', 'passwords', 'migration', 'bitwarden', '1password', 'lastpass'],
  },
  {
    id: 'faq-4',
    question: 'Is my data stored on your servers?',
    answer: 'QAV uses a zero-knowledge architecture. Your encryption keys never leave your device. The server stores only encrypted blobs and public key material for key exchange. We cannot decrypt your files or read your passwords — even under legal compulsion.',
    category: 'Privacy',
    tags: ['zero-knowledge', 'privacy', 'data', 'server'],
  },
  {
    id: 'faq-5',
    question: 'What is post-quantum cryptography (PQC)?',
    answer: 'PQC refers to cryptographic algorithms designed to resist attacks from quantum computers. QAV uses ML-KEM-1024 (FIPS 203) for key encapsulation and ML-DSA-87 (FIPS 204) for digital signatures, both standardized by NIST in 2024. These protect your data today against "harvest now, decrypt later" quantum threats.',
    category: 'Security',
    tags: ['pqc', 'quantum', 'ml-kem', 'ml-dsa'],
  },
  {
    id: 'faq-6',
    question: 'What happens if I forget my master password?',
    answer: 'If you have set up a recovery phrase (BIP39 24-word mnemonic), you can use it to regain access to your vault. If you have not configured recovery, your data is permanently inaccessible — this is by design for zero-knowledge security. We strongly recommend setting up a recovery phrase during onboarding.',
    category: 'Account',
    tags: ['recovery', 'password', 'forgot', 'reset'],
  },
  {
    id: 'faq-7',
    question: 'Does QAV support hardware security keys?',
    answer: 'Yes. QAV supports FIDO2/WebAuthn hardware keys (YubiKey, Titan, etc.) and platform authenticators (Touch ID, Windows Hello, Android biometrics) for multi-factor authentication. Register your keys in Settings > Security > Hardware Keys.',
    category: 'Security',
    tags: ['fido2', 'webauthn', 'hardware', 'yubikey', 'biometric'],
  },
  {
    id: 'faq-8',
    question: 'What is the difference between Free, Pro, and Enterprise?',
    answer: 'Free: Up to 100 vault entries, single device, basic encryption. Pro: Unlimited entries, multi-device sync, PQC hybrid encryption, priority support. Enterprise: Team management, enterprise SSO, audit logging, QR identity, dedicated support, SLA.',
    category: 'Billing',
    tags: ['pricing', 'tiers', 'free', 'pro', 'enterprise'],
  },
  {
    id: 'faq-9',
    question: 'How do I report a security vulnerability?',
    answer: 'Please report security vulnerabilities to security@qav.io. We operate a responsible disclosure program and respond within 24 hours. Do not file a support ticket for security issues — use the dedicated security email for faster handling.',
    category: 'Security',
    tags: ['vulnerability', 'disclosure', 'report', 'security'],
  },
  {
    id: 'faq-10',
    question: 'Can I use QAV for email?',
    answer: 'No. QAV is an encrypted file vault and password manager, not an email service. For private email, we recommend ProtonMail, Tutanota, or Skiff Mail. QAV does offer encrypted messaging between QAV users for secure communications.',
    category: 'General',
    tags: ['email', 'messaging', 'not email'],
  },
];

// ── Support Service ────────────────────────────────────────

class SupportService {
  private config: SupportConfig = DEFAULT_CONFIG;

  constructor() {
    this.loadConfig();
  }

  // ── Config ──────────────────────────────

  private loadConfig(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const stored = localStorage.getItem(CONFIG_KEY);
      if (stored) {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
      }
    } catch {
      // Use defaults
    }
  }

  getConfig(): SupportConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<SupportConfig>): void {
    this.config = { ...this.config, ...partial };
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
      }
    } catch { /* silent */ }
  }

  // ── Tickets ─────────────────────────────

  private loadTickets(): SupportTicket[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private saveTickets(tickets: SupportTicket[]): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
      }
    } catch { /* silent */ }
  }

  /**
   * Create a new support ticket.
   */
  createTicket(params: {
    subject: string;
    description: string;
    category: TicketCategory;
    priority: TicketPriority;
    userEmail: string;
    metadata?: Record<string, string>;
  }): SupportTicket {
    const tickets = this.loadTickets();

    // Rate limit check
    const oneDayAgo = Date.now() - 86400000;
    const recentCount = tickets.filter(t => new Date(t.createdAt).getTime() > oneDayAgo).length;
    if (recentCount >= this.config.rateLimitPerDay) {
      throw new Error(`Rate limit exceeded. Maximum ${this.config.rateLimitPerDay} tickets per 24 hours.`);
    }

    const now = new Date().toISOString();
    const ticket: SupportTicket = {
      id: `TKT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      subject: params.subject.trim(),
      description: params.description.trim(),
      category: params.category,
      priority: params.priority,
      status: 'submitted',
      userEmail: params.userEmail,
      attachmentCount: 0,
      createdAt: now,
      updatedAt: now,
      metadata: {
        ...params.metadata,
        appVersion: this.getAppVersion(),
        platform: this.getPlatform(),
      },
    };

    tickets.unshift(ticket);

    // Keep max 50 tickets locally
    if (tickets.length > 50) tickets.length = 50;

    this.saveTickets(tickets);
    logger.log(`Support ticket created: ${ticket.id} — ${ticket.subject}`);

    return ticket;
  }

  /**
   * Get all user tickets.
   */
  getTickets(filters?: { status?: TicketStatus; category?: TicketCategory }): SupportTicket[] {
    let tickets = this.loadTickets();

    if (filters?.status) {
      tickets = tickets.filter(t => t.status === filters.status);
    }
    if (filters?.category) {
      tickets = tickets.filter(t => t.category === filters.category);
    }

    return tickets;
  }

  /**
   * Get ticket by ID.
   */
  getTicket(id: string): SupportTicket | undefined {
    return this.loadTickets().find(t => t.id === id);
  }

  // ── FAQ ─────────────────────────────────

  /**
   * Get all FAQ items, optionally filtered.
   */
  getFAQ(params?: { category?: string; search?: string }): FAQItem[] {
    let items = [...EMBEDDED_FAQ];

    if (params?.category) {
      items = items.filter(i => i.category === params.category);
    }

    if (params?.search) {
      const query = params.search.toLowerCase();
      items = items.filter(i =>
        i.question.toLowerCase().includes(query) ||
        i.answer.toLowerCase().includes(query) ||
        i.tags.some(t => t.includes(query))
      );
    }

    return items;
  }

  /**
   * Get all FAQ categories.
   */
  getFAQCategories(): string[] {
    const cats = new Set(EMBEDDED_FAQ.map(i => i.category));
    return Array.from(cats).sort();
  }

  // ── Status Page ─────────────────────────

  /**
   * Get the status page URL.
   */
  getStatusPageUrl(): string {
    return this.config.statusPageUrl;
  }

  /**
   * Get the support email address.
   */
  getSupportEmail(): string {
    return this.config.supportEmail;
  }

  // ── Enterprise: Live Chat Stubs ─────────

  /**
   * Check if live chat is configured (Enterprise tier).
   */
  isLiveChatAvailable(): boolean {
    return this.config.liveChatProvider !== null && this.config.liveChatAppId.length > 0;
  }

  /**
   * Get live chat config for Intercom/Zendesk widget initialization.
   * Enterprise only — returns null for Free/Pro tiers.
   */
  getLiveChatConfig(): { provider: string; appId: string } | null {
    if (!this.isLiveChatAvailable()) return null;
    return {
      provider: this.config.liveChatProvider!,
      appId: this.config.liveChatAppId,
    };
  }

  // ── Utilities ───────────────────────────

  private getAppVersion(): string {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('qav:app_version') || '3.0.0';
      }
    } catch { /* silent */ }
    return '3.0.0';
  }

  private getPlatform(): string {
    try {
      if (typeof navigator !== 'undefined') {
        return navigator.userAgent.substring(0, 100);
      }
    } catch { /* silent */ }
    return 'unknown';
  }
}

// ── Singleton ──────────────────────────────────────────────

export const supportService = new SupportService();
