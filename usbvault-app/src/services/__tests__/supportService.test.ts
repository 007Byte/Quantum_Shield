/**
 * Tests for supportService — in-app support tickets, FAQ, config, live chat.
 *
 * Exercises the REAL behavior of SupportService:
 *  - ticket creation (trimming, metadata enrichment, ID shape, prepend ordering)
 *  - rate limiting (>= rateLimitPerDay within 24h) + window expiry
 *  - 50-ticket local cap
 *  - getTickets filtering by status/category
 *  - getTicket lookup
 *  - FAQ filtering by category and full-text search (question/answer/tags)
 *  - getFAQCategories de-dupe + sort
 *  - config load/merge/update persistence to localStorage
 *  - live-chat availability + config gating (Enterprise stubs)
 *
 * Boundary mocked: logger only. localStorage (jsdom) is the real storage the
 * service reads/writes — assertions verify persisted JSON, not mock calls.
 */

jest.mock('@/utils/logger', () => ({
  logger: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const STORAGE_KEY = 'usbvault:support_tickets';
const CONFIG_KEY = 'usbvault:support_config';

type SupportServiceModule = typeof import('../supportService');

/** Load a fresh supportService (its constructor reads config from localStorage). */
function loadService(): SupportServiceModule['supportService'] {
  let mod!: SupportServiceModule;
  jest.isolateModules(() => {
    mod = require('../supportService');
  });
  return mod.supportService;
}

const validTicketParams = {
  subject: '  Cannot unlock vault  ',
  description: '  The unlock button does nothing after entering my password.  ',
  category: 'bug' as const,
  priority: 'high' as const,
  userEmail: 'user@example.com',
};

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

describe('supportService.createTicket', () => {
  it('creates a ticket with trimmed text, enriched metadata, and a TKT- id', () => {
    const service = loadService();
    const ticket = service.createTicket(validTicketParams);

    expect(ticket.id).toMatch(/^TKT-/);
    expect(ticket.subject).toBe('Cannot unlock vault');
    expect(ticket.description).toBe('The unlock button does nothing after entering my password.');
    expect(ticket.status).toBe('submitted');
    expect(ticket.category).toBe('bug');
    expect(ticket.priority).toBe('high');
    expect(ticket.attachmentCount).toBe(0);
    expect(ticket.metadata?.platform).toBeDefined();
    expect(ticket.metadata?.appVersion).toBeDefined();
    expect(new Date(ticket.createdAt).toString()).not.toBe('Invalid Date');
  });

  it('persists the ticket to localStorage and prepends new tickets (newest first)', () => {
    const service = loadService();
    const first = service.createTicket({ ...validTicketParams, subject: 'First' });
    const second = service.createTicket({ ...validTicketParams, subject: 'Second' });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored).toHaveLength(2);
    // unshift means the most recent ticket is index 0.
    expect(stored[0].id).toBe(second.id);
    expect(stored[1].id).toBe(first.id);
  });

  it('merges caller-provided metadata while overriding appVersion/platform', () => {
    const service = loadService();
    const ticket = service.createTicket({
      ...validTicketParams,
      metadata: { vaultId: 'vault-77', appVersion: 'tampered' },
    });
    expect(ticket.metadata?.vaultId).toBe('vault-77');
    // Service-controlled fields win over caller input.
    expect(ticket.metadata?.appVersion).not.toBe('tampered');
  });

  it('enforces the per-day rate limit', () => {
    const service = loadService();
    service.updateConfig({ rateLimitPerDay: 2 });

    service.createTicket(validTicketParams);
    service.createTicket(validTicketParams);

    expect(() => service.createTicket(validTicketParams)).toThrow(/Rate limit exceeded/);
    expect(() => service.createTicket(validTicketParams)).toThrow(/Maximum 2 tickets/);
  });

  it('ignores tickets older than 24h when counting toward the rate limit', () => {
    const service = loadService();
    service.updateConfig({ rateLimitPerDay: 1 });

    // Seed an old ticket (2 days ago) directly into storage.
    const old = {
      id: 'TKT-OLD',
      subject: 'old',
      description: 'old',
      category: 'general',
      priority: 'low',
      status: 'submitted',
      userEmail: 'user@example.com',
      attachmentCount: 0,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([old]));

    // The old ticket does not count, so a fresh ticket is allowed.
    expect(() => service.createTicket(validTicketParams)).not.toThrow();
  });

  it('falls back to default app version/platform metadata when accessors throw', () => {
    const service = loadService();
    // Force the app-version + platform accessors down their catch paths.
    const getItemSpy = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation((key: string) => {
        if (key === 'usbvault:app_version') throw new Error('blocked');
        return null;
      });
    const uaSpy = jest.spyOn(navigator, 'userAgent', 'get').mockImplementation(() => {
      throw new Error('no ua');
    });
    try {
      const ticket = service.createTicket(validTicketParams);
      expect(ticket.metadata?.appVersion).toBe('3.0.0');
      expect(ticket.metadata?.platform).toBe('unknown');
    } finally {
      getItemSpy.mockRestore();
      uaSpy.mockRestore();
    }
  });

  it('caps locally stored tickets at 50', () => {
    const service = loadService();
    service.updateConfig({ rateLimitPerDay: 1000 });
    for (let i = 0; i < 55; i++) {
      service.createTicket({ ...validTicketParams, subject: `T${i}` });
    }
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored).toHaveLength(50);
  });
});

describe('supportService.getTickets / getTicket', () => {
  it('returns all tickets and filters by status and category', () => {
    const service = loadService();
    service.updateConfig({ rateLimitPerDay: 100 });
    const bug = service.createTicket({ ...validTicketParams, category: 'bug' });
    service.createTicket({ ...validTicketParams, category: 'billing' });

    expect(service.getTickets()).toHaveLength(2);
    expect(service.getTickets({ category: 'bug' })).toHaveLength(1);
    expect(service.getTickets({ category: 'bug' })[0].id).toBe(bug.id);
    // All freshly created tickets are 'submitted'.
    expect(service.getTickets({ status: 'submitted' })).toHaveLength(2);
    expect(service.getTickets({ status: 'resolved' })).toHaveLength(0);
  });

  it('looks up a ticket by id and returns undefined for unknown ids', () => {
    const service = loadService();
    const created = service.createTicket(validTicketParams);
    expect(service.getTicket(created.id)?.id).toBe(created.id);
    expect(service.getTicket('TKT-NOPE')).toBeUndefined();
  });

  it('returns an empty list when storage holds malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    const service = loadService();
    expect(service.getTickets()).toEqual([]);
  });
});

describe('supportService FAQ', () => {
  it('returns the embedded FAQ set unfiltered', () => {
    const service = loadService();
    const all = service.getFAQ();
    expect(all.length).toBeGreaterThanOrEqual(10);
    expect(all[0]).toHaveProperty('question');
    expect(all[0]).toHaveProperty('answer');
  });

  it('filters FAQ by category', () => {
    const service = loadService();
    const security = service.getFAQ({ category: 'Security' });
    expect(security.length).toBeGreaterThan(0);
    expect(security.every(i => i.category === 'Security')).toBe(true);
  });

  it('searches FAQ across question, answer, and tags (case-insensitive)', () => {
    const service = loadService();
    // "yubikey" appears only in tags of the hardware-keys FAQ.
    const byTag = service.getFAQ({ search: 'YubiKey' });
    expect(byTag.some(i => i.tags.includes('yubikey'))).toBe(true);

    // "quantum" appears in answers/tags of multiple security FAQs.
    const byText = service.getFAQ({ search: 'quantum' });
    expect(byText.length).toBeGreaterThan(0);

    // A term that appears nowhere returns nothing.
    expect(service.getFAQ({ search: 'zzznotpresent' })).toHaveLength(0);
  });

  it('returns sorted, de-duplicated FAQ categories', () => {
    const service = loadService();
    const cats = service.getFAQCategories();
    const sorted = [...cats].sort();
    expect(cats).toEqual(sorted);
    // No duplicates.
    expect(new Set(cats).size).toBe(cats.length);
    expect(cats).toContain('Security');
  });
});

describe('supportService config', () => {
  it('exposes default config when nothing is stored', () => {
    const service = loadService();
    const cfg = service.getConfig();
    expect(cfg.rateLimitPerDay).toBe(10);
    expect(cfg.maxAttachmentSize).toBe(10 * 1024 * 1024);
    expect(cfg.liveChatProvider).toBeNull();
  });

  it('getConfig returns a copy that cannot mutate the internal config', () => {
    const service = loadService();
    const cfg = service.getConfig();
    cfg.rateLimitPerDay = 9999;
    expect(service.getConfig().rateLimitPerDay).toBe(10);
  });

  it('updateConfig merges and persists to localStorage', () => {
    const service = loadService();
    service.updateConfig({ rateLimitPerDay: 25, statusPageUrl: 'https://status.example.com' });

    const cfg = service.getConfig();
    expect(cfg.rateLimitPerDay).toBe(25);
    expect(cfg.statusPageUrl).toBe('https://status.example.com');

    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) as string);
    expect(stored.rateLimitPerDay).toBe(25);
  });

  it('loads stored config on construction, merged over defaults', () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ supportEmail: 'help@corp.test' }));
    const service = loadService();
    const cfg = service.getConfig();
    expect(cfg.supportEmail).toBe('help@corp.test');
    // Unspecified fields fall back to defaults.
    expect(cfg.rateLimitPerDay).toBe(10);
  });

  it('getStatusPageUrl and getSupportEmail reflect the active config', () => {
    const service = loadService();
    service.updateConfig({
      statusPageUrl: 'https://status.corp.test',
      supportEmail: 'support@corp.test',
    });
    expect(service.getStatusPageUrl()).toBe('https://status.corp.test');
    expect(service.getSupportEmail()).toBe('support@corp.test');
  });
});

describe('supportService live chat (Enterprise stubs)', () => {
  it('reports live chat unavailable by default', () => {
    const service = loadService();
    expect(service.isLiveChatAvailable()).toBe(false);
    expect(service.getLiveChatConfig()).toBeNull();
  });

  it('requires both a provider and an app id to be available', () => {
    const service = loadService();
    service.updateConfig({ liveChatProvider: 'intercom', liveChatAppId: '' });
    expect(service.isLiveChatAvailable()).toBe(false);
    expect(service.getLiveChatConfig()).toBeNull();
  });

  it('returns the live chat config once provider and app id are set', () => {
    const service = loadService();
    service.updateConfig({ liveChatProvider: 'zendesk', liveChatAppId: 'app-1234' });
    expect(service.isLiveChatAvailable()).toBe(true);
    expect(service.getLiveChatConfig()).toEqual({ provider: 'zendesk', appId: 'app-1234' });
  });
});
