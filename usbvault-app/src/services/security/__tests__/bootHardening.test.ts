/**
 * Unit tests for the boot-hardening orchestrator.
 *
 * Drives runBootHardening through its 6 sequential stages and asserts the real
 * orchestration behavior: stage ordering, the onProgress callback contract,
 * per-stage warning aggregation, graceful degradation (allPassed), and the
 * branch logic inside each stage (native vs web, crypto availability, session
 * brute-force state, ghost-mode re-activation). Only true boundaries are mocked:
 * the audit sink, logger, and the dynamically-imported deviceIntegrity /
 * privacyModes modules. crypto.subtle and sessionStorage run for real (jsdom).
 */

import { runBootHardening, type HardeningStage } from '../bootHardening';
import { auditService } from '@/services/auditService';

jest.mock('@/services/auditService', () => ({
  auditService: { log: jest.fn(() => Promise.resolve()) },
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() },
  fireAndForget: jest.fn(),
}));

// Dynamically imported by stageAntiDebug (native) — default: device is clean.
const mockCheckDeviceIntegrity = jest.fn();
jest.mock('@/services/security/deviceIntegrity', () => ({
  checkDeviceIntegrity: (...args: unknown[]) => mockCheckDeviceIntegrity(...args),
}));

// Dynamically imported by stageGhostMode when re-activating.
const mockEnableGhostMode = jest.fn(() => Promise.resolve());
jest.mock('@/services/security/privacyModes', () => ({
  ghostModeService: { enableGhostMode: () => mockEnableGhostMode() },
}));

const mockedAudit = auditService as unknown as { log: jest.Mock };

const EXPECTED_ORDER: HardeningStage[] = [
  'ANTI_DEBUG',
  'INTEGRITY',
  'MEMORY_LOCK',
  'BRUTE_FORCE',
  'SELF_DESTRUCT',
  'GHOST_MODE',
];

describe('runBootHardening (native platform, Platform.OS=ios)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockedAudit.log.mockClear();
    mockCheckDeviceIntegrity.mockReset();
    mockCheckDeviceIntegrity.mockResolvedValue({ isCompromised: false, riskLevel: 'safe' });
    mockEnableGhostMode.mockClear();
  });

  it('runs all 6 stages in order and reports them in the result', async () => {
    const result = await runBootHardening();

    expect(result.stages.map(s => s.stage)).toEqual(EXPECTED_ORDER);
    expect(result.currentStage).toBe('READY');
    expect(result.allPassed).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(typeof result.totalDurationMs).toBe('number');
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('invokes onProgress once per stage with the correct index/total', async () => {
    const progress: [HardeningStage, number, number][] = [];
    await runBootHardening((stage, index, total) => progress.push([stage, index, total]));

    expect(progress).toHaveLength(6);
    expect(progress.map(p => p[0])).toEqual(EXPECTED_ORDER);
    expect(progress.map(p => p[1])).toEqual([0, 1, 2, 3, 4, 5]);
    expect(progress.every(p => p[2] === 6)).toBe(true);
  });

  it('each stage result carries a numeric duration and passed flag', async () => {
    const { stages } = await runBootHardening();
    for (const s of stages) {
      expect(typeof s.durationMs).toBe('number');
      expect(s.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof s.passed).toBe('boolean');
    }
  });

  it('logs a success audit event summarizing the run when all stages pass', async () => {
    await runBootHardening();
    expect(mockedAudit.log).toHaveBeenCalledWith(
      'system',
      'boot_hardening_complete',
      expect.objectContaining({ allPassed: true, warnings: 0 }),
      'success'
    );
    const payload = mockedAudit.log.mock.calls[0][2];
    expect(payload.stages).toContain('ANTI_DEBUG:OK');
    expect(payload.stages).toContain('GHOST_MODE:OK');
  });

  describe('ANTI_DEBUG stage (native device integrity)', () => {
    it('passes with a warning when the device is reported compromised', async () => {
      mockCheckDeviceIntegrity.mockResolvedValue({ isCompromised: true, riskLevel: 'critical' });
      const { stages, warnings, allPassed } = await runBootHardening();

      const anti = stages.find(s => s.stage === 'ANTI_DEBUG')!;
      expect(anti.passed).toBe(true); // degrades gracefully, does not fail boot
      expect(anti.warning).toContain('risk level critical');
      expect(warnings.some(w => w.includes('ANTI_DEBUG'))).toBe(true);
      expect(allPassed).toBe(true);
    });

    it('passes without warning when the integrity module throws (skipped)', async () => {
      mockCheckDeviceIntegrity.mockRejectedValue(new Error('module missing'));
      const { stages } = await runBootHardening();
      const anti = stages.find(s => s.stage === 'ANTI_DEBUG')!;
      expect(anti.passed).toBe(true);
      expect(anti.warning).toBeUndefined();
    });
  });

  describe('MEMORY_LOCK stage', () => {
    it('passes because jsdom provides a working crypto.subtle.digest', async () => {
      const { stages } = await runBootHardening();
      const mem = stages.find(s => s.stage === 'MEMORY_LOCK')!;
      expect(mem.passed).toBe(true);
      expect(mem.warning).toBeUndefined();
    });

    it('FAILS the stage (degraded boot) when the crypto subsystem throws', async () => {
      const digestSpy = jest
        .spyOn(crypto.subtle, 'digest')
        .mockRejectedValueOnce(new Error('no crypto core'));

      const { stages, allPassed } = await runBootHardening();
      const mem = stages.find(s => s.stage === 'MEMORY_LOCK')!;

      expect(mem.passed).toBe(false);
      expect(mem.warning).toContain('Crypto subsystem unavailable');
      // A failed stage propagates to allPassed=false and a 'warning'-level audit.
      expect(allPassed).toBe(false);
      expect(mockedAudit.log).toHaveBeenCalledWith(
        'system',
        'boot_hardening_complete',
        expect.objectContaining({ allPassed: false }),
        'warning'
      );

      digestSpy.mockRestore();
    });
  });

  describe('BRUTE_FORCE stage (sessionStorage state)', () => {
    it('warns when a prior session recorded failed unlock attempts', async () => {
      sessionStorage.setItem('usbvault:boot_fail_state', JSON.stringify({ count: 3 }));
      const { stages, warnings } = await runBootHardening();

      const bf = stages.find(s => s.stage === 'BRUTE_FORCE')!;
      expect(bf.passed).toBe(true);
      expect(bf.warning).toContain('3 failed unlock attempts');
      expect(warnings.some(w => w.includes('BRUTE_FORCE'))).toBe(true);
    });

    it('does not warn when the recorded fail count is zero', async () => {
      sessionStorage.setItem('usbvault:boot_fail_state', JSON.stringify({ count: 0 }));
      const { stages } = await runBootHardening();
      const bf = stages.find(s => s.stage === 'BRUTE_FORCE')!;
      expect(bf.warning).toBeUndefined();
    });

    it('passes (no warning) when the stored fail state is corrupt JSON', async () => {
      sessionStorage.setItem('usbvault:boot_fail_state', '{not-json');
      const { stages } = await runBootHardening();
      const bf = stages.find(s => s.stage === 'BRUTE_FORCE')!;
      expect(bf.passed).toBe(true);
      expect(bf.warning).toBeUndefined();
    });
  });

  describe('GHOST_MODE stage', () => {
    it('re-activates ghost mode and warns when the previous session left it active', async () => {
      sessionStorage.setItem('usbvault:ghost_active', 'true');
      const { stages, warnings } = await runBootHardening();

      const ghost = stages.find(s => s.stage === 'GHOST_MODE')!;
      expect(mockEnableGhostMode).toHaveBeenCalledTimes(1);
      expect(ghost.warning).toContain('re-activated');
      expect(warnings.some(w => w.includes('GHOST_MODE'))).toBe(true);
    });

    it('does not touch ghost mode when the flag is absent', async () => {
      const { stages } = await runBootHardening();
      const ghost = stages.find(s => s.stage === 'GHOST_MODE')!;
      expect(mockEnableGhostMode).not.toHaveBeenCalled();
      expect(ghost.warning).toBeUndefined();
    });

    it('degrades gracefully when re-activation throws', async () => {
      sessionStorage.setItem('usbvault:ghost_active', 'true');
      mockEnableGhostMode.mockRejectedValueOnce(new Error('ghost unavailable'));
      const { stages } = await runBootHardening();
      const ghost = stages.find(s => s.stage === 'GHOST_MODE')!;
      // Failure inside the inner try is swallowed -> no warning, still passes.
      expect(ghost.passed).toBe(true);
      expect(ghost.warning).toBeUndefined();
    });
  });
});

/**
 * Web platform: stageAntiDebug uses devtools heuristics and stageIntegrity
 * checks for a CSP meta tag. Loaded via isolateModules with Platform.OS='web'.
 */
describe('runBootHardening (web platform)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.head.replaceChildren(); // reset jsdom <head> between tests (no DOM-sink assignment)
  });

  function loadWeb(): typeof import('../bootHardening') {
    let mod!: typeof import('../bootHardening');
    jest.isolateModules(() => {
      jest.resetModules();
      jest.doMock('react-native', () => ({
        Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
      }));
      jest.doMock('@/services/auditService', () => ({
        auditService: { log: jest.fn(() => Promise.resolve()) },
      }));
      jest.doMock('@/utils/logger', () => ({
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() },
        fireAndForget: jest.fn(),
      }));
      mod = require('../bootHardening');
    });
    return mod;
  }

  it('warns about a missing CSP meta tag during the INTEGRITY stage', async () => {
    const { runBootHardening: run } = loadWeb();
    const { stages, warnings } = await run();

    const integrity = stages.find(s => s.stage === 'INTEGRITY')!;
    expect(integrity.passed).toBe(true);
    expect(integrity.warning).toBe('No CSP meta tag found');
    expect(warnings.some(w => w.includes('INTEGRITY'))).toBe(true);
  });

  it('does not warn when a CSP meta tag is present', async () => {
    const meta = document.createElement('meta');
    meta.setAttribute('http-equiv', 'Content-Security-Policy');
    meta.setAttribute('content', "default-src 'self'");
    document.head.appendChild(meta);

    const { runBootHardening: run } = loadWeb();
    const { stages } = await run();

    const integrity = stages.find(s => s.stage === 'INTEGRITY')!;
    expect(integrity.warning).toBeUndefined();
  });

  it('completes all 6 stages on web and reaches READY', async () => {
    const { runBootHardening: run } = loadWeb();
    const { stages, currentStage } = await run();
    expect(stages.map(s => s.stage)).toEqual([
      'ANTI_DEBUG',
      'INTEGRITY',
      'MEMORY_LOCK',
      'BRUTE_FORCE',
      'SELF_DESTRUCT',
      'GHOST_MODE',
    ]);
    expect(currentStage).toBe('READY');
  });

  it('warns during ANTI_DEBUG when a large outer/inner width gap suggests devtools', async () => {
    // The heuristic is window.outerWidth - window.innerWidth > 160.
    const origOuter = window.outerWidth;
    const origInner = window.innerWidth;
    Object.defineProperty(window, 'outerWidth', { configurable: true, value: 1200 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });

    try {
      const { runBootHardening: run } = loadWeb();
      const { stages } = await run();
      const anti = stages.find(s => s.stage === 'ANTI_DEBUG')!;
      expect(anti.passed).toBe(true);
      expect(anti.warning).toBe('Developer tools may be open');
    } finally {
      Object.defineProperty(window, 'outerWidth', { configurable: true, value: origOuter });
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: origInner });
    }
  });
});
