/**
 * Resilience Test Service Tests
 *
 * Verifies the chaos/resilience harness: scenario catalog shape, deterministic
 * pass/fail decision (driven by a stubbed Math.random), suite aggregation +
 * history persistence, health-score computation per category, offline/latency
 * simulation flags, conflict resolution strategy selection, and report export.
 * Timer-driven flows use Jest fake timers. auditService + localStorage are the
 * only mocked boundaries; all scoring/aggregation logic runs for real.
 */

import { resilienceTestService } from '../resilienceTestService';
import { auditService } from '@/services/auditService';

// localStorage is the web persistence boundary for test history.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('@/services/auditService', () => ({
  auditService: { log: jest.fn() },
}));

const HISTORY_KEY = 'usbvault:resilience_test_history';

describe('ResilienceTestService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    // Reset singleton in-memory state between tests.
    (resilienceTestService as any).testHistory = [];
    (resilienceTestService as any).simulatedLatency = 0;
    (resilienceTestService as any).isOffline = false;
    resilienceTestService.resetSimulations();
    jest.clearAllMocks();
  });

  describe('getAvailableScenarios', () => {
    it('returns the full catalog of 16 pending scenarios', () => {
      const scenarios = resilienceTestService.getAvailableScenarios();
      expect(scenarios).toHaveLength(16);
      scenarios.forEach(s => {
        expect(s.status).toBe('pending');
        expect(s.id).toMatch(/^scenario_\d{3}$/);
        expect(['network', 'sync', 'conflict', 'storage', 'performance']).toContain(s.category);
      });
    });

    it('returns fresh scenario objects (callers cannot mutate the catalog)', () => {
      const first = resilienceTestService.getAvailableScenarios();
      first[0].status = 'failed';
      const second = resilienceTestService.getAvailableScenarios();
      expect(second[0].status).toBe('pending');
    });
  });

  describe('runScenario', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('marks a scenario passed when the random pass-rate clears the threshold', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.9); // > 0.1 → passed
      const promise = resilienceTestService.runScenario('scenario_001');
      jest.advanceTimersByTime(100);
      const result = await promise;

      expect(result.id).toBe('scenario_001');
      expect(result.status).toBe('passed');
      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeGreaterThanOrEqual(result.startedAt!);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(auditService.log).toHaveBeenCalledWith(
        'TEST_SCENARIO_COMPLETED',
        'scenario_001',
        expect.objectContaining({ status: 'passed' })
      );
    });

    it('marks a scenario failed and attaches an error when below the threshold', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.05); // <= 0.1 → failed
      const promise = resilienceTestService.runScenario('scenario_005');
      jest.advanceTimersByTime(100);
      const result = await promise;

      expect(result.status).toBe('failed');
      expect(result.error).toContain('scenario_005');
    });

    it('returns a failed result for an unknown scenario id', async () => {
      const promise = resilienceTestService.runScenario('does_not_exist');
      const result = await promise;
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Scenario not found');
    });

    it('honors the simulated latency in its completion delay', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.9);
      resilienceTestService.simulateLatency(500);
      const promise = resilienceTestService.runScenario('scenario_002');

      // Not resolved before 100 + 500ms have elapsed.
      jest.advanceTimersByTime(100);
      let settled = false;
      promise.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);

      jest.advanceTimersByTime(500);
      const result = await promise;
      expect(result.status).toBe('passed');
    });
  });

  describe('runSuite / runAllTests', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('aggregates all scenarios into a passing suite and records history', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.9); // all pass
      const promise = resilienceTestService.runSuite('suite_test_1');
      jest.advanceTimersByTime(200);
      const suite = await promise;

      expect(suite.scenarios).toHaveLength(16);
      expect(suite.passCount).toBe(16);
      expect(suite.failCount).toBe(0);
      expect(suite.status).toBe('passed');
      expect(suite.completedAt).toBeDefined();
      // Persisted to history + localStorage.
      expect(resilienceTestService.getTestHistory()).toHaveLength(1);
      expect(JSON.parse(localStorage.getItem(HISTORY_KEY)!)).toHaveLength(1);
      expect(auditService.log).toHaveBeenCalledWith(
        'TEST_SUITE_COMPLETED',
        'suite_test_1',
        expect.objectContaining({ passCount: 16, failCount: 0 })
      );
    });

    it('marks the suite failed when any scenario fails', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.05); // all fail
      const promise = resilienceTestService.runSuite('suite_test_2');
      jest.advanceTimersByTime(200);
      const suite = await promise;

      expect(suite.failCount).toBe(16);
      expect(suite.passCount).toBe(0);
      expect(suite.status).toBe('failed');
    });

    it('runAllTests delegates to runSuite and produces a populated suite', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.9);
      const promise = resilienceTestService.runAllTests();
      jest.advanceTimersByTime(200);
      const suite = await promise;
      expect(suite.id).toMatch(/^suite_\d+$/);
      expect(suite.scenarios).toHaveLength(16);
    });
  });

  describe('getTestHistory / getLastResults', () => {
    it('returns null for last results when no suite has run', () => {
      expect(resilienceTestService.getLastResults()).toBeNull();
    });

    it('getTestHistory returns a copy, not the internal array', () => {
      const seeded: any = { id: 's1', scenarios: [], passCount: 0, failCount: 0 };
      (resilienceTestService as any).testHistory = [seeded];
      const history = resilienceTestService.getTestHistory();
      history.push({ id: 's2' } as any);
      expect(resilienceTestService.getTestHistory()).toHaveLength(1);
    });

    it('getLastResults returns the most recent suite', () => {
      (resilienceTestService as any).testHistory = [{ id: 'first' }, { id: 'second' }];
      expect(resilienceTestService.getLastResults()?.id).toBe('second');
    });
  });

  describe('simulation flags', () => {
    it('simulateOffline / simulateOnline toggle the offline flag and audit it', () => {
      resilienceTestService.simulateOffline();
      expect((resilienceTestService as any).isOffline).toBe(true);
      expect(auditService.log).toHaveBeenCalledWith('RESILIENCE_OFFLINE_SIMULATED', 'network', {
        offline: true,
      });

      resilienceTestService.simulateOnline();
      expect((resilienceTestService as any).isOffline).toBe(false);
      expect(auditService.log).toHaveBeenCalledWith('RESILIENCE_ONLINE_SIMULATED', 'network', {
        offline: false,
      });
    });

    it('simulateLatency records the configured latency', () => {
      resilienceTestService.simulateLatency(250);
      expect((resilienceTestService as any).simulatedLatency).toBe(250);
      expect(auditService.log).toHaveBeenCalledWith('RESILIENCE_LATENCY_SIMULATED', 'network', {
        latencyMs: 250,
      });
    });

    it('resetSimulations restores defaults and clears active intervals', () => {
      resilienceTestService.simulateOffline();
      resilienceTestService.simulateLatency(999);

      resilienceTestService.resetSimulations();

      expect((resilienceTestService as any).isOffline).toBe(false);
      expect((resilienceTestService as any).simulatedLatency).toBe(0);
      expect((resilienceTestService as any).activeSimulations.size).toBe(0);
      expect(auditService.log).toHaveBeenCalledWith('RESILIENCE_SIMULATIONS_RESET', 'config', {});
    });
  });

  describe('simulateConflict', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('resolves with one of the known strategies', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0); // → first strategy
      const promise = resilienceTestService.simulateConflict('file-42');
      jest.advanceTimersByTime(50);
      const result = await promise;

      expect(result.resolved).toBe(true);
      expect(result.strategy).toBe('last_write_wins');
      expect(auditService.log).toHaveBeenCalledWith('RESILIENCE_CONFLICT_SIMULATED', 'file-42', {
        strategy: 'last_write_wins',
      });
    });

    it('selects the merge strategy for the middle random bucket', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5); // floor(0.5*3)=1 → merge
      const promise = resilienceTestService.simulateConflict('file-7');
      jest.advanceTimersByTime(50);
      const result = await promise;
      expect(result.strategy).toBe('merge');
    });
  });

  describe('getHealthScore', () => {
    it('returns a perfect score for every category when no suite has run', () => {
      const { score, breakdown } = resilienceTestService.getHealthScore();
      expect(score).toBe(100);
      expect(breakdown).toEqual({
        network: 100,
        sync: 100,
        conflict: 100,
        storage: 100,
        performance: 100,
      });
    });

    it('computes per-category pass percentages from the last suite', () => {
      // network: 1 of 2 passed → 50; conflict: 0 of 1 → 0; storage: empty → 100.
      (resilienceTestService as any).testHistory = [
        {
          id: 'suite-x',
          scenarios: [
            { category: 'network', status: 'passed' },
            { category: 'network', status: 'failed' },
            { category: 'conflict', status: 'failed' },
            { category: 'performance', status: 'passed' },
            { category: 'sync', status: 'passed' },
          ],
        },
      ];

      const { breakdown, score } = resilienceTestService.getHealthScore();
      expect(breakdown.network).toBe(50);
      expect(breakdown.conflict).toBe(0);
      expect(breakdown.performance).toBe(100);
      expect(breakdown.sync).toBe(100);
      expect(breakdown.storage).toBe(100); // no storage tests → defaults to 100
      // average of [50, 100, 0, 100, 100] = 70
      expect(score).toBe(70);
    });
  });

  describe('exportReport', () => {
    it('serializes health, last suite, and total run count as JSON', () => {
      (resilienceTestService as any).testHistory = [
        { id: 'suite-x', scenarios: [{ category: 'network', status: 'passed' }] },
      ];

      const json = resilienceTestService.exportReport();
      const report = JSON.parse(json);

      expect(report.totalRuns).toBe(1);
      expect(report.lastSuite.id).toBe('suite-x');
      expect(report.health.breakdown.network).toBe(100);
      expect(typeof report.timestamp).toBe('number');
    });
  });
});
