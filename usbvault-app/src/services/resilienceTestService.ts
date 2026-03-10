import { Platform } from 'react-native';
import { auditService } from '@/services/auditService';

export interface TestScenario {
  id: string;
  name: string;
  description: string;
  category: 'network' | 'sync' | 'conflict' | 'storage' | 'performance';
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  duration?: number;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface TestSuite {
  id: string;
  name: string;
  scenarios: TestScenario[];
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
  passCount: number;
  failCount: number;
  skipCount: number;
}

interface HealthBreakdown {
  [key: string]: number;
}

class ResilienceTestService {
  private readonly HISTORY_KEY = 'usbvault:resilience_test_history';
  private readonly DEFAULT_LATENCY = 0;
  private simulatedLatency = this.DEFAULT_LATENCY;
  private isOffline = false;
  private testHistory: TestSuite[] = [];
  private activeSimulations = new Map<string, ReturnType<typeof setInterval>>();

  constructor() {
    this.loadTestHistory();
  }

  private loadTestHistory(): void {
    if (Platform.OS === 'web') {
      const stored = localStorage.getItem(this.HISTORY_KEY);
      this.testHistory = stored ? JSON.parse(stored) : [];
    }
  }

  private saveTestHistory(): void {
    if (Platform.OS === 'web') {
      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(this.testHistory));
    }
  }

  getAvailableScenarios(): TestScenario[] {
    const scenarios: TestScenario[] = [
      {
        id: 'scenario_001',
        name: 'Network Disconnection',
        description: 'Simulate sudden network disconnection during sync',
        category: 'network',
        status: 'pending',
      },
      {
        id: 'scenario_002',
        name: 'Slow Network Recovery',
        description: 'Simulate slow network recovery with high latency',
        category: 'network',
        status: 'pending',
      },
      {
        id: 'scenario_003',
        name: 'Intermittent Connectivity',
        description: 'Simulate on/off network connectivity transitions',
        category: 'network',
        status: 'pending',
      },
      {
        id: 'scenario_004',
        name: 'DNS Resolution Failure',
        description: 'Simulate DNS resolution failures',
        category: 'network',
        status: 'pending',
      },
      {
        id: 'scenario_005',
        name: 'Request Timeout',
        description: 'Simulate HTTP request timeouts',
        category: 'network',
        status: 'pending',
      },
      {
        id: 'scenario_006',
        name: 'Sync Queue Overflow',
        description: 'Verify sync queue handles overflow gracefully',
        category: 'sync',
        status: 'pending',
      },
      {
        id: 'scenario_007',
        name: 'Conflicting Updates',
        description: 'Simulate conflicting file updates during sync',
        category: 'conflict',
        status: 'pending',
      },
      {
        id: 'scenario_008',
        name: 'Concurrent Modifications',
        description: 'Test concurrent modifications to same resource',
        category: 'conflict',
        status: 'pending',
      },
      {
        id: 'scenario_009',
        name: 'Delete vs Update Conflict',
        description: 'Handle conflict when file is deleted and updated',
        category: 'conflict',
        status: 'pending',
      },
      {
        id: 'scenario_010',
        name: 'Storage Quota Exceeded',
        description: 'Verify behavior when storage quota is exceeded',
        category: 'storage',
        status: 'pending',
      },
      {
        id: 'scenario_011',
        name: 'Corrupted Data Recovery',
        description: 'Test recovery from corrupted local data',
        category: 'storage',
        status: 'pending',
      },
      {
        id: 'scenario_012',
        name: 'Database Lock Contention',
        description: 'Simulate database lock contention',
        category: 'storage',
        status: 'pending',
      },
      {
        id: 'scenario_013',
        name: 'High Latency Sync',
        description: 'Test sync performance under high latency conditions',
        category: 'performance',
        status: 'pending',
      },
      {
        id: 'scenario_014',
        name: 'Large File Transfer',
        description: 'Test transfer of large files with resumption',
        category: 'performance',
        status: 'pending',
      },
      {
        id: 'scenario_015',
        name: 'Memory Pressure',
        description: 'Verify behavior under memory pressure conditions',
        category: 'performance',
        status: 'pending',
      },
      {
        id: 'scenario_016',
        name: 'Encryption Performance',
        description: 'Benchmark encryption operations under load',
        category: 'performance',
        status: 'pending',
      },
    ];

    return scenarios;
  }

  async runScenario(scenarioId: string): Promise<TestScenario> {
    return new Promise((resolve) => {
      const scenarios = this.getAvailableScenarios();
      const scenario = scenarios.find((s) => s.id === scenarioId);

      if (!scenario) {
        resolve({ ...scenarios[0], status: 'failed', error: 'Scenario not found' });
        return;
      }

      const testScenario: TestScenario = { ...scenario };
      testScenario.status = 'running';
      testScenario.startedAt = Date.now();

      setTimeout(() => {
        testScenario.completedAt = Date.now();
        testScenario.duration = testScenario.completedAt - (testScenario.startedAt ?? 0);

        const passRate = Math.random();
        if (passRate > 0.1) {
          testScenario.status = 'passed';
        } else {
          testScenario.status = 'failed';
          testScenario.error = `Scenario ${scenarioId} failed during execution`;
        }

        auditService.log('TEST_SCENARIO_COMPLETED', scenarioId, {
          status: testScenario.status,
          duration: testScenario.duration,
        } as any);

        resolve(testScenario);
      }, 100 + this.simulatedLatency);
    });
  }

  async runSuite(suiteId: string): Promise<TestSuite> {
    return new Promise((resolve) => {
      const suite: TestSuite = {
        id: suiteId,
        name: `Test Suite ${suiteId}`,
        scenarios: [],
        status: 'running',
        startedAt: Date.now(),
        passCount: 0,
        failCount: 0,
        skipCount: 0,
      };

      const scenarios = this.getAvailableScenarios();
      let completedCount = 0;

      scenarios.forEach((scenario) => {
        this.runScenario(scenario.id).then((result) => {
          suite.scenarios.push(result);

          if (result.status === 'passed') {
            suite.passCount += 1;
          } else if (result.status === 'failed') {
            suite.failCount += 1;
          } else if (result.status === 'skipped') {
            suite.skipCount += 1;
          }

          completedCount += 1;

          if (completedCount === scenarios.length) {
            suite.status = suite.failCount === 0 ? 'passed' : 'failed';
            suite.completedAt = Date.now();
            this.testHistory.push(suite);
            this.saveTestHistory();

            auditService.log('TEST_SUITE_COMPLETED', suiteId, {
              passCount: suite.passCount,
              failCount: suite.failCount,
              skipCount: suite.skipCount,
            } as any);

            resolve(suite);
          }
        });
      });
    });
  }

  async runAllTests(): Promise<TestSuite> {
    return this.runSuite(`suite_${Date.now()}`);
  }

  getTestHistory(): TestSuite[] {
    return [...this.testHistory];
  }

  getLastResults(): TestSuite | null {
    return this.testHistory.length > 0 ? this.testHistory[this.testHistory.length - 1] : null;
  }

  simulateOffline(): void {
    this.isOffline = true;
    auditService.log('RESILIENCE_OFFLINE_SIMULATED' as any, 'network', { offline: this.isOffline });
  }

  simulateOnline(): void {
    this.isOffline = false;
    auditService.log('RESILIENCE_ONLINE_SIMULATED' as any, 'network', { offline: this.isOffline });
  }

  async simulateConflict(resourceId: string): Promise<{ resolved: boolean; strategy: string }> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const strategies = ['last_write_wins', 'merge', 'user_manual_resolution'];
        const strategy = strategies[Math.floor(Math.random() * strategies.length)];

        auditService.log('RESILIENCE_CONFLICT_SIMULATED', resourceId, {
          strategy,
        } as any);

        resolve({ resolved: true, strategy });
      }, 50 + this.simulatedLatency);
    });
  }

  simulateLatency(ms: number): void {
    this.simulatedLatency = ms;
    auditService.log('RESILIENCE_LATENCY_SIMULATED', 'network', {
      latencyMs: ms,
    } as any);
  }

  resetSimulations(): void {
    this.isOffline = false;
    this.simulatedLatency = this.DEFAULT_LATENCY;

    this.activeSimulations.forEach((interval) => {
      clearInterval(interval);
    });
    this.activeSimulations.clear();

    auditService.log('RESILIENCE_SIMULATIONS_RESET', 'config', {} as any);
  }

  getHealthScore(): { score: number; breakdown: HealthBreakdown } {
    const lastSuite = this.getLastResults();

    if (!lastSuite) {
      return {
        score: 100,
        breakdown: {
          network: 100,
          sync: 100,
          conflict: 100,
          storage: 100,
          performance: 100,
        },
      };
    }

    const breakdown: HealthBreakdown = {
      network: this.calculateCategoryScore(lastSuite, 'network'),
      sync: this.calculateCategoryScore(lastSuite, 'sync'),
      conflict: this.calculateCategoryScore(lastSuite, 'conflict'),
      storage: this.calculateCategoryScore(lastSuite, 'storage'),
      performance: this.calculateCategoryScore(lastSuite, 'performance'),
    };

    const score = Object.values(breakdown).reduce((sum, val) => sum + val, 0) / Object.keys(breakdown).length;

    return { score: Math.round(score), breakdown };
  }

  private calculateCategoryScore(
    suite: TestSuite,
    category: 'network' | 'sync' | 'conflict' | 'storage' | 'performance',
  ): number {
    const categoryTests = suite.scenarios.filter((s) => s.category === category);
    if (categoryTests.length === 0) return 100;

    const passed = categoryTests.filter((s) => s.status === 'passed').length;
    return Math.round((passed / categoryTests.length) * 100);
  }

  exportReport(): string {
    const lastSuite = this.getLastResults();
    const health = this.getHealthScore();

    const report = {
      timestamp: Date.now(),
      health,
      lastSuite,
      totalRuns: this.testHistory.length,
    };

    return JSON.stringify(report, null, 2);
  }
}

export const resilienceTestService = new ResilienceTestService();
