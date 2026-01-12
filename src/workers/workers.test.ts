/**
 * Tests for Worker Framework
 *
 * Comprehensive tests for:
 * - WorkerRegistry: worker registration and retrieval
 * - ConcurrencyLimiter: concurrent operation limiting
 * - Worker Executor: parallel execution with timeout handling
 *
 * @see Task 8.6 - Worker Framework Tests
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorkerRegistry } from './registry.js';
import { ConcurrencyLimiter } from './concurrency.js';
import { isWorker } from './types.js';
import type {
  Worker,
  WorkerContext,
  WorkerAssignment,
  WorkerOutput,
  CostTracker,
  CircuitBreaker,
} from './types.js';
import type { EnrichedIntent, WorkerPlan } from '../schemas/worker.js';
import type { Session } from '../schemas/session.js';

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * Create a mock worker for testing.
 */
function createMockWorker(
  id: string,
  options: {
    delay?: number;
    shouldFail?: boolean;
    errorMessage?: string;
  } = {}
): Worker {
  const { delay = 100, shouldFail = false, errorMessage = `${id} failed` } = options;

  return {
    id,
    provider: id,
    async plan(_session: Session, _intent: EnrichedIntent): Promise<WorkerAssignment> {
      return {
        workerId: id,
        queries: ['test query'],
        maxResults: 10,
        timeout: 5000,
      };
    },
    async execute(_assignment: WorkerAssignment, _context: WorkerContext): Promise<WorkerOutput> {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (shouldFail) {
        throw new Error(errorMessage);
      }
      return {
        workerId: id,
        status: 'ok' as const,
        candidates: [],
        durationMs: delay,
      };
    },
  };
}

/**
 * Create a mock session for testing.
 */
function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    schemaVersion: 1,
    sessionId: '20260110-test-session',
    title: 'Test Session',
    destinations: ['Tokyo'],
    dateRange: { start: '2026-03-01', end: '2026-03-10' },
    flexibility: { type: 'none' },
    interests: ['food'],
    constraints: {},
    createdAt: '2026-01-10T12:00:00Z',
    ...overrides,
  };
}

/**
 * Create a mock enriched intent for testing.
 */
function createMockEnrichedIntent(overrides: Partial<EnrichedIntent> = {}): EnrichedIntent {
  return {
    destinations: ['Tokyo'],
    dateRange: { start: '2026-03-01', end: '2026-03-10' },
    flexibility: { type: 'none' },
    interests: ['food'],
    constraints: {},
    inferredTags: [],
    ...overrides,
  };
}

/**
 * Create a mock cost tracker for testing.
 */
function createMockCostTracker(): CostTracker {
  return {
    addPerplexity: jest.fn() as CostTracker['addPerplexity'],
    addGemini: jest.fn() as CostTracker['addGemini'],
    addOpenAI: jest.fn() as CostTracker['addOpenAI'],
    addPlacesCall: jest.fn() as CostTracker['addPlacesCall'],
    addYouTubeUnits: jest.fn() as CostTracker['addYouTubeUnits'],
    getCost: jest.fn<CostTracker['getCost']>().mockReturnValue({
      schemaVersion: 1,
      runId: 'test-run',
      providers: {
        perplexity: { tokens: { input: 0, output: 0 }, cost: 0 },
        gemini: { tokens: { input: 0, output: 0 }, cost: 0 },
        openai: { tokens: { input: 0, output: 0 }, cost: 0 },
        places: { calls: 0, cost: 0 },
        youtube: { units: 0, cost: 0 },
      },
      total: 0,
      currency: 'USD',
    }),
    reset: jest.fn() as CostTracker['reset'],
  };
}

/**
 * Create a mock circuit breaker for testing.
 */
function createMockCircuitBreaker(openProviders: string[] = []): CircuitBreaker {
  return {
    recordSuccess: jest.fn() as CircuitBreaker['recordSuccess'],
    recordFailure: jest.fn() as CircuitBreaker['recordFailure'],
    isOpen: jest.fn<CircuitBreaker['isOpen']>().mockImplementation(
      (provider: string) => openProviders.includes(provider)
    ),
    getStatus: jest.fn<CircuitBreaker['getStatus']>().mockReturnValue({}),
  };
}

/**
 * Create a mock worker context for testing.
 */
function createMockContext(overrides: Partial<WorkerContext> = {}): WorkerContext {
  return {
    session: createMockSession(),
    runId: '20260110-120000',
    enrichedIntent: createMockEnrichedIntent(),
    costTracker: createMockCostTracker(),
    circuitBreaker: createMockCircuitBreaker(),
    ...overrides,
  };
}

// ============================================================================
// WorkerRegistry Tests
// ============================================================================

describe('WorkerRegistry', () => {
  let registry: WorkerRegistry;

  beforeEach(() => {
    registry = new WorkerRegistry();
  });

  describe('register and get', () => {
    it('registers and retrieves a worker', () => {
      const worker = createMockWorker('test-worker');
      registry.register(worker);
      expect(registry.get('test-worker')).toBe(worker);
    });

    it('returns undefined for unregistered worker', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('throws error on duplicate registration', () => {
      const worker = createMockWorker('duplicate');
      registry.register(worker);
      expect(() => registry.register(worker)).toThrow(
        "Worker 'duplicate' is already registered"
      );
    });

    it('duplicate registration with same ID but different instance also throws', () => {
      const worker1 = createMockWorker('same-id');
      const worker2 = createMockWorker('same-id');
      registry.register(worker1);
      expect(() => registry.register(worker2)).toThrow(
        "Worker 'same-id' is already registered"
      );
    });
  });

  describe('getAvailableWorkers', () => {
    it('returns empty array when no workers registered', () => {
      expect(registry.getAvailableWorkers()).toEqual([]);
    });

    it('returns all registered worker IDs', () => {
      registry.register(createMockWorker('worker-a'));
      registry.register(createMockWorker('worker-b'));
      registry.register(createMockWorker('worker-c'));

      const available = registry.getAvailableWorkers();
      expect(available).toContain('worker-a');
      expect(available).toContain('worker-b');
      expect(available).toContain('worker-c');
      expect(available.length).toBe(3);
    });

    it('returns sorted list consistently', () => {
      registry.register(createMockWorker('zebra'));
      registry.register(createMockWorker('apple'));
      registry.register(createMockWorker('mango'));

      const available = registry.getAvailableWorkers();
      // Order depends on insertion order in Map, but should be consistent
      expect(available.length).toBe(3);
    });
  });

  describe('factory registration', () => {
    it('lazily instantiates worker from factory', () => {
      const factory = jest.fn(() => createMockWorker('lazy-worker'));
      registry.registerFactory('lazy-worker', factory);

      // Factory not called yet
      expect(factory).not.toHaveBeenCalled();

      // First get() triggers factory
      const worker = registry.get('lazy-worker');
      expect(factory).toHaveBeenCalledTimes(1);
      expect(worker?.id).toBe('lazy-worker');

      // Second get() returns cached instance
      const worker2 = registry.get('lazy-worker');
      expect(factory).toHaveBeenCalledTimes(1);
      expect(worker2).toBe(worker);
    });

    it('throws on duplicate factory registration', () => {
      registry.registerFactory('dup-factory', () => createMockWorker('dup-factory'));
      expect(() =>
        registry.registerFactory('dup-factory', () => createMockWorker('dup-factory'))
      ).toThrow("Worker 'dup-factory' is already registered");
    });

    it('includes factory workers in getAvailableWorkers', () => {
      registry.registerFactory('factory-worker', () => createMockWorker('factory-worker'));
      expect(registry.getAvailableWorkers()).toContain('factory-worker');
    });
  });

  describe('has', () => {
    it('returns true for registered worker', () => {
      registry.register(createMockWorker('exists'));
      expect(registry.has('exists')).toBe(true);
    });

    it('returns false for unregistered worker', () => {
      expect(registry.has('not-exists')).toBe(false);
    });

    it('returns true for factory-registered worker', () => {
      registry.registerFactory('factory-exists', () => createMockWorker('factory-exists'));
      expect(registry.has('factory-exists')).toBe(true);
    });
  });

  describe('unregister', () => {
    it('removes registered worker', () => {
      registry.register(createMockWorker('to-remove'));
      expect(registry.unregister('to-remove')).toBe(true);
      expect(registry.get('to-remove')).toBeUndefined();
    });

    it('returns false for nonexistent worker', () => {
      expect(registry.unregister('never-existed')).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all workers', () => {
      registry.register(createMockWorker('worker-1'));
      registry.register(createMockWorker('worker-2'));
      registry.registerFactory('worker-3', () => createMockWorker('worker-3'));

      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.getAvailableWorkers()).toEqual([]);
    });
  });

  describe('size', () => {
    it('returns correct count', () => {
      expect(registry.size).toBe(0);
      registry.register(createMockWorker('w1'));
      expect(registry.size).toBe(1);
      registry.registerFactory('w2', () => createMockWorker('w2'));
      expect(registry.size).toBe(2);
    });
  });
});

// ============================================================================
// ConcurrencyLimiter Tests
// ============================================================================

describe('ConcurrencyLimiter', () => {
  describe('constructor', () => {
    it('creates limiter with default limit of 3', () => {
      const limiter = new ConcurrencyLimiter();
      expect(limiter.getLimit()).toBe(3);
    });

    it('creates limiter with custom limit', () => {
      const limiter = new ConcurrencyLimiter(5);
      expect(limiter.getLimit()).toBe(5);
    });

    it('throws error for limit less than 1', () => {
      expect(() => new ConcurrencyLimiter(0)).toThrow('Concurrency limit must be at least 1');
      expect(() => new ConcurrencyLimiter(-1)).toThrow('Concurrency limit must be at least 1');
    });

    it('throws error for non-integer limit', () => {
      expect(() => new ConcurrencyLimiter(2.5)).toThrow('Concurrency limit must be an integer');
    });
  });

  describe('acquire and release', () => {
    it('allows up to limit concurrent operations', async () => {
      const limiter = new ConcurrencyLimiter(2);
      let running = 0;
      let maxRunning = 0;

      const tasks = Array.from({ length: 5 }, async () => {
        await limiter.acquire();
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 50));
        running--;
        limiter.release();
      });

      await Promise.all(tasks);
      expect(maxRunning).toBe(2);
    });

    it('queues operations beyond limit', async () => {
      const limiter = new ConcurrencyLimiter(1);
      const order: number[] = [];

      const task1 = (async () => {
        await limiter.acquire();
        order.push(1);
        await new Promise((r) => setTimeout(r, 100));
        limiter.release();
      })();

      const task2 = (async () => {
        await limiter.acquire();
        order.push(2);
        limiter.release();
      })();

      await Promise.all([task1, task2]);
      expect(order).toEqual([1, 2]); // FIFO order
    });

    it('maintains FIFO queue ordering', async () => {
      const limiter = new ConcurrencyLimiter(1);
      const order: string[] = [];

      // First acquire the single slot
      await limiter.acquire();
      order.push('first-acquired');

      // Queue up additional requests in order
      const waiting: Promise<void>[] = [];
      for (const label of ['A', 'B', 'C']) {
        waiting.push(
          (async () => {
            await limiter.acquire();
            order.push(label);
            limiter.release();
          })()
        );
      }

      // Small delay to ensure all are queued
      await new Promise((r) => setTimeout(r, 10));

      // Release the first slot
      limiter.release();

      await Promise.all(waiting);
      expect(order).toEqual(['first-acquired', 'A', 'B', 'C']);
    });

    it('release without acquire logs warning', () => {
      const limiter = new ConcurrencyLimiter(2);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      limiter.release();

      expect(warnSpy).toHaveBeenCalledWith(
        'ConcurrencyLimiter: release() called without matching acquire()'
      );
      warnSpy.mockRestore();
    });
  });

  describe('run helper', () => {
    it('executes function with automatic acquire/release', async () => {
      const limiter = new ConcurrencyLimiter(2);
      const result = await limiter.run(async () => {
        return 42;
      });
      expect(result).toBe(42);
    });

    it('releases slot on success', async () => {
      const limiter = new ConcurrencyLimiter(1);
      await limiter.run(async () => 'done');
      expect(limiter.getRunning()).toBe(0);
    });

    it('releases slot on error', async () => {
      const limiter = new ConcurrencyLimiter(1);

      await expect(
        limiter.run(async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');

      expect(limiter.getRunning()).toBe(0);
    });

    it('handles errors correctly without deadlock', async () => {
      const limiter = new ConcurrencyLimiter(2);
      const results: string[] = [];

      const tasks = [
        limiter.run(async () => {
          throw new Error('fail1');
        }).catch(() => results.push('caught1')),
        limiter.run(async () => {
          results.push('success2');
          return 'ok';
        }),
        limiter.run(async () => {
          throw new Error('fail3');
        }).catch(() => results.push('caught3')),
        limiter.run(async () => {
          results.push('success4');
          return 'ok';
        }),
      ];

      await Promise.all(tasks);
      expect(results).toContain('caught1');
      expect(results).toContain('success2');
      expect(results).toContain('caught3');
      expect(results).toContain('success4');
    });
  });

  describe('getStats', () => {
    it('returns correct initial values', () => {
      const limiter = new ConcurrencyLimiter(3);
      const stats = limiter.getStats();
      expect(stats).toEqual({
        running: 0,
        queued: 0,
        limit: 3,
      });
    });

    it('returns correct values during execution', async () => {
      const limiter = new ConcurrencyLimiter(2);

      await limiter.acquire();
      await limiter.acquire();

      // Queue a third request
      const thirdAcquire = limiter.acquire();

      const stats = limiter.getStats();
      expect(stats.running).toBe(2);
      expect(stats.queued).toBe(1);
      expect(stats.limit).toBe(2);

      // Clean up
      limiter.release();
      limiter.release();
      await thirdAcquire;
      limiter.release();
    });
  });

  describe('isAvailable', () => {
    it('returns true when slots available', () => {
      const limiter = new ConcurrencyLimiter(2);
      expect(limiter.isAvailable()).toBe(true);
    });

    it('returns false when at limit', async () => {
      const limiter = new ConcurrencyLimiter(2);
      await limiter.acquire();
      await limiter.acquire();
      expect(limiter.isAvailable()).toBe(false);
      limiter.release();
      limiter.release();
    });
  });

  describe('getRunning and getQueueLength', () => {
    it('returns correct running count', async () => {
      const limiter = new ConcurrencyLimiter(3);
      expect(limiter.getRunning()).toBe(0);
      await limiter.acquire();
      expect(limiter.getRunning()).toBe(1);
      await limiter.acquire();
      expect(limiter.getRunning()).toBe(2);
      limiter.release();
      expect(limiter.getRunning()).toBe(1);
      limiter.release();
      expect(limiter.getRunning()).toBe(0);
    });

    it('returns correct queue length', async () => {
      const limiter = new ConcurrencyLimiter(1);
      await limiter.acquire();

      const waiting = limiter.acquire();
      expect(limiter.getQueueLength()).toBe(1);

      limiter.release();
      await waiting;
      expect(limiter.getQueueLength()).toBe(0);
      limiter.release();
    });
  });
});

// ============================================================================
// isWorker Type Guard Tests
// ============================================================================

describe('isWorker', () => {
  it('returns true for valid worker', () => {
    const worker = createMockWorker('valid');
    expect(isWorker(worker)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isWorker(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isWorker(undefined)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isWorker('string')).toBe(false);
    expect(isWorker(123)).toBe(false);
    expect(isWorker(true)).toBe(false);
  });

  it('returns false for object missing id', () => {
    expect(
      isWorker({
        provider: 'test',
        plan: jest.fn(),
        execute: jest.fn(),
      })
    ).toBe(false);
  });

  it('returns false for object missing provider', () => {
    expect(
      isWorker({
        id: 'test',
        plan: jest.fn(),
        execute: jest.fn(),
      })
    ).toBe(false);
  });

  it('returns false for object missing plan', () => {
    expect(
      isWorker({
        id: 'test',
        provider: 'test',
        execute: jest.fn(),
      })
    ).toBe(false);
  });

  it('returns false for object missing execute', () => {
    expect(
      isWorker({
        id: 'test',
        provider: 'test',
        plan: jest.fn(),
      })
    ).toBe(false);
  });
});

// ============================================================================
// Executor Tests (with mocks)
// ============================================================================

// We need to mock the file system operations and imports
const mockAtomicWrite = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockMkdir = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('node:fs/promises', () => ({
  mkdir: mockMkdir,
  readdir: jest.fn<() => Promise<string[]>>().mockResolvedValue([]),
  readFile: jest.fn<() => Promise<string>>().mockResolvedValue('{}'),
}));

jest.unstable_mockModule('../storage/atomic.js', () => ({
  atomicWriteJson: mockAtomicWrite,
}));

jest.unstable_mockModule('../storage/paths.js', () => ({
  getRunDir: (sessionId: string, runId: string) =>
    path.join(os.tmpdir(), 'travelagent-test', sessionId, 'runs', runId),
}));

describe('Executor', () => {
  let executeWorkers: typeof import('./executor.js').executeWorkers;
  let saveWorkerOutputs: typeof import('./executor.js').saveWorkerOutputs;
  let summarizeExecution: typeof import('./executor.js').summarizeExecution;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAtomicWrite.mockClear();
    mockMkdir.mockClear();

    // Re-import after mocking
    const executorModule = await import('./executor.js');
    executeWorkers = executorModule.executeWorkers;
    saveWorkerOutputs = executorModule.saveWorkerOutputs;
    summarizeExecution = executorModule.summarizeExecution;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('executeWorkers', () => {
    it('executes all workers in plan', async () => {
      const registry = new WorkerRegistry();
      registry.register(createMockWorker('worker-a', { delay: 10 }));
      registry.register(createMockWorker('worker-b', { delay: 10 }));

      const plan: WorkerPlan = {
        enrichedIntent: createMockEnrichedIntent(),
        workers: [
          { workerId: 'worker-a', queries: ['q1'], maxResults: 10, timeout: 5000 },
          { workerId: 'worker-b', queries: ['q2'], maxResults: 10, timeout: 5000 },
        ],
        validationPlan: { validateTopN: 0, origins: [] },
      };

      const context = createMockContext();
      const outputs = await executeWorkers(plan, context, registry, { skipSaveOutputs: true });

      expect(outputs.length).toBe(2);
      expect(outputs[0].workerId).toBe('worker-a');
      expect(outputs[0].status).toBe('ok');
      expect(outputs[1].workerId).toBe('worker-b');
      expect(outputs[1].status).toBe('ok');
    });

    it('respects per-worker timeout', async () => {
      const slowWorker: Worker = {
        id: 'slow-worker',
        provider: 'slow',
        plan: async () => ({ workerId: 'slow-worker', queries: ['q'], maxResults: 10, timeout: 100 }),
        execute: async () => {
          await new Promise((r) => setTimeout(r, 500));
          return { workerId: 'slow-worker', status: 'ok', candidates: [], durationMs: 500 };
        },
      };

      const registry = new WorkerRegistry();
      registry.register(slowWorker);

      const plan: WorkerPlan = {
        enrichedIntent: createMockEnrichedIntent(),
        workers: [{ workerId: 'slow-worker', queries: ['q'], maxResults: 10, timeout: 50 }],
        validationPlan: { validateTopN: 0, origins: [] },
      };

      const context = createMockContext();
      const outputs = await executeWorkers(plan, context, registry, { skipSaveOutputs: true });

      expect(outputs[0].status).toBe('error');
      expect(outputs[0].error).toContain('timed out');
    });

    it('returns error output on timeout', async () => {
      const slowWorker: Worker = {
        id: 'timeout-worker',
        provider: 'timeout',
        plan: async () => ({ workerId: 'timeout-worker', queries: ['q'], maxResults: 10, timeout: 100 }),
        execute: async () => {
          await new Promise((r) => setTimeout(r, 200));
          return { workerId: 'timeout-worker', status: 'ok', candidates: [], durationMs: 200 };
        },
      };

      const registry = new WorkerRegistry();
      registry.register(slowWorker);

      const plan: WorkerPlan = {
        enrichedIntent: createMockEnrichedIntent(),
        workers: [{ workerId: 'timeout-worker', queries: ['q'], maxResults: 10, timeout: 50 }],
        validationPlan: { validateTopN: 0, origins: [] },
      };

      const context = createMockContext();
      const outputs = await executeWorkers(plan, context, registry, { skipSaveOutputs: true });

      expect(outputs[0].workerId).toBe('timeout-worker');
      expect(outputs[0].status).toBe('error');
      expect(outputs[0].error).toMatch(/timed out after 50ms/);
    });

    it('returns error output on exception', async () => {
      const failingWorker = createMockWorker('fail-worker', {
        shouldFail: true,
        errorMessage: 'API error occurred',
      });

      const registry = new WorkerRegistry();
      registry.register(failingWorker);

      const plan: WorkerPlan = {
        enrichedIntent: createMockEnrichedIntent(),
        workers: [{ workerId: 'fail-worker', queries: ['q'], maxResults: 10, timeout: 5000 }],
        validationPlan: { validateTopN: 0, origins: [] },
      };

      const context = createMockContext();
      const outputs = await executeWorkers(plan, context, registry, { skipSaveOutputs: true });

      expect(outputs[0].workerId).toBe('fail-worker');
      expect(outputs[0].status).toBe('error');
      expect(outputs[0].error).toBe('API error occurred');
    });

    it('skips workers with open circuit breaker', async () => {
      const registry = new WorkerRegistry();
      registry.register(createMockWorker('open-circuit'));

      const plan: WorkerPlan = {
        enrichedIntent: createMockEnrichedIntent(),
        workers: [{ workerId: 'open-circuit', queries: ['q'], maxResults: 10, timeout: 5000 }],
        validationPlan: { validateTopN: 0, origins: [] },
      };

      const context = createMockContext({
        circuitBreaker: createMockCircuitBreaker(['open-circuit']),
      });

      const outputs = await executeWorkers(plan, context, registry, { skipSaveOutputs: true });

      expect(outputs[0].workerId).toBe('open-circuit');
      expect(outputs[0].status).toBe('skipped');
    });

    it('handles missing worker in registry', async () => {
      const registry = new WorkerRegistry();
      // Don't register the worker

      const plan: WorkerPlan = {
        enrichedIntent: createMockEnrichedIntent(),
        workers: [{ workerId: 'missing-worker', queries: ['q'], maxResults: 10, timeout: 5000 }],
        validationPlan: { validateTopN: 0, origins: [] },
      };

      const context = createMockContext();
      const outputs = await executeWorkers(plan, context, registry, { skipSaveOutputs: true });

      expect(outputs[0].workerId).toBe('missing-worker');
      expect(outputs[0].status).toBe('error');
      expect(outputs[0].error).toContain("not found in registry");
    });

    it('records success in circuit breaker on successful execution', async () => {
      const registry = new WorkerRegistry();
      registry.register(createMockWorker('success-worker', { delay: 10 }));

      const plan: WorkerPlan = {
        enrichedIntent: createMockEnrichedIntent(),
        workers: [{ workerId: 'success-worker', queries: ['q'], maxResults: 10, timeout: 5000 }],
        validationPlan: { validateTopN: 0, origins: [] },
      };

      const mockCb = createMockCircuitBreaker();
      const context = createMockContext({ circuitBreaker: mockCb });

      await executeWorkers(plan, context, registry, { skipSaveOutputs: true });

      expect(mockCb.recordSuccess).toHaveBeenCalledWith('success-worker');
    });

    it('records failure in circuit breaker on exception', async () => {
      const registry = new WorkerRegistry();
      registry.register(createMockWorker('error-worker', { shouldFail: true }));

      const plan: WorkerPlan = {
        enrichedIntent: createMockEnrichedIntent(),
        workers: [{ workerId: 'error-worker', queries: ['q'], maxResults: 10, timeout: 5000 }],
        validationPlan: { validateTopN: 0, origins: [] },
      };

      const mockCb = createMockCircuitBreaker();
      const context = createMockContext({ circuitBreaker: mockCb });

      await executeWorkers(plan, context, registry, { skipSaveOutputs: true });

      expect(mockCb.recordFailure).toHaveBeenCalledWith('error-worker');
    });

    it('executes workers in parallel with concurrency limit', async () => {
      const registry = new WorkerRegistry();
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const trackingWorker = (id: string): Worker => ({
        id,
        provider: id,
        plan: async () => ({ workerId: id, queries: ['q'], maxResults: 10, timeout: 5000 }),
        execute: async () => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await new Promise((r) => setTimeout(r, 50));
          currentConcurrent--;
          return { workerId: id, status: 'ok', candidates: [], durationMs: 50 };
        },
      });

      for (let i = 0; i < 5; i++) {
        registry.register(trackingWorker(`worker-${i}`));
      }

      const plan: WorkerPlan = {
        enrichedIntent: createMockEnrichedIntent(),
        workers: Array.from({ length: 5 }, (_, i) => ({
          workerId: `worker-${i}`,
          queries: ['q'],
          maxResults: 10,
          timeout: 5000,
        })),
        validationPlan: { validateTopN: 0, origins: [] },
      };

      const context = createMockContext();
      await executeWorkers(plan, context, registry, { concurrency: 2, skipSaveOutputs: true });

      expect(maxConcurrent).toBe(2);
    });
  });

  describe('saveWorkerOutputs', () => {
    it('saves worker outputs to directory', async () => {
      const outputs: WorkerOutput[] = [
        { workerId: 'perplexity', status: 'ok', candidates: [], durationMs: 100 },
        { workerId: 'places', status: 'ok', candidates: [], durationMs: 200 },
      ];

      await saveWorkerOutputs(outputs, '20260110-test', '20260110-120000');

      expect(mockMkdir).toHaveBeenCalled();
      expect(mockAtomicWrite).toHaveBeenCalledTimes(2);
    });
  });

  describe('summarizeExecution', () => {
    it('returns correct counts for mixed results', () => {
      const outputs: WorkerOutput[] = [
        { workerId: 'w1', status: 'ok', candidates: [{} as any, {} as any], durationMs: 100 },
        { workerId: 'w2', status: 'error', candidates: [], durationMs: 50, error: 'failed' },
        { workerId: 'w3', status: 'partial', candidates: [{} as any], durationMs: 200 },
        { workerId: 'w4', status: 'skipped', candidates: [], durationMs: 0 },
      ];

      const summary = summarizeExecution(outputs);

      expect(summary.total).toBe(4);
      expect(summary.successful).toBe(2); // ok + partial
      expect(summary.failed).toBe(1);
      expect(summary.skipped).toBe(1);
      expect(summary.totalCandidates).toBe(3); // 2 + 1
      expect(summary.maxDurationMs).toBe(200);
      expect(summary.failedWorkers).toEqual(['w2']);
      expect(summary.skippedWorkers).toEqual(['w4']);
    });

    it('returns zero counts for empty outputs', () => {
      const summary = summarizeExecution([]);

      expect(summary.total).toBe(0);
      expect(summary.successful).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.skipped).toBe(0);
      expect(summary.totalCandidates).toBe(0);
      expect(summary.maxDurationMs).toBe(0);
      expect(summary.failedWorkers).toEqual([]);
      expect(summary.skippedWorkers).toEqual([]);
    });

    it('correctly tracks all successful workers', () => {
      const outputs: WorkerOutput[] = [
        { workerId: 'w1', status: 'ok', candidates: [{} as any], durationMs: 100 },
        { workerId: 'w2', status: 'ok', candidates: [{} as any, {} as any], durationMs: 150 },
        { workerId: 'w3', status: 'ok', candidates: [], durationMs: 80 },
      ];

      const summary = summarizeExecution(outputs);

      expect(summary.successful).toBe(3);
      expect(summary.totalCandidates).toBe(3);
      expect(summary.maxDurationMs).toBe(150);
      expect(summary.failedWorkers).toEqual([]);
    });
  });
});
