/**
 * Worker Registry
 *
 * Central registry for worker implementations. Provides worker lookup
 * and management during pipeline execution.
 *
 * @see PRD Section FR3 - Worker Framework
 * @see Task 8.2 - Worker Registry
 * @module workers/registry
 */

import type { Worker, WorkerFactory, WorkerMap } from './types.js';

// ============================================================================
// Worker Registry Class
// ============================================================================

/**
 * WorkerRegistry manages all registered worker implementations.
 *
 * Workers are registered by ID and can be retrieved for execution.
 * The registry supports both direct instance registration and lazy
 * factory-based registration.
 *
 * @example
 * ```typescript
 * const registry = new WorkerRegistry();
 * registry.register(new PerplexityWorker());
 * registry.register(new PlacesWorker());
 *
 * const worker = registry.get('perplexity');
 * if (worker) {
 *   await worker.execute(assignment, context);
 * }
 * ```
 */
export class WorkerRegistry {
  /** Map of worker ID to worker instance */
  private readonly workers: WorkerMap = new Map();

  /** Map of worker ID to factory (for lazy instantiation) */
  private readonly factories: Map<string, WorkerFactory> = new Map();

  /**
   * Register a worker instance directly.
   *
   * @param worker - Worker instance to register
   * @throws Error if a worker with the same ID is already registered
   */
  register(worker: Worker): void {
    if (this.workers.has(worker.id) || this.factories.has(worker.id)) {
      throw new Error(`Worker '${worker.id}' is already registered`);
    }
    this.workers.set(worker.id, worker);
  }

  /**
   * Register a worker factory for lazy instantiation.
   *
   * The factory will be called the first time the worker is requested.
   * This is useful for workers with expensive initialization.
   *
   * @param id - Worker ID
   * @param factory - Factory function that creates the worker
   * @throws Error if a worker with the same ID is already registered
   */
  registerFactory(id: string, factory: WorkerFactory): void {
    if (this.workers.has(id) || this.factories.has(id)) {
      throw new Error(`Worker '${id}' is already registered`);
    }
    this.factories.set(id, factory);
  }

  /**
   * Get a worker by ID.
   *
   * If the worker was registered via factory, instantiates it on first access.
   *
   * @param id - Worker ID to retrieve
   * @returns Worker instance or undefined if not found
   */
  get(id: string): Worker | undefined {
    // Check if already instantiated
    const existing = this.workers.get(id);
    if (existing) {
      return existing;
    }

    // Check for factory and instantiate
    const factory = this.factories.get(id);
    if (factory) {
      const worker = factory();
      this.workers.set(id, worker);
      this.factories.delete(id); // Remove factory after instantiation
      return worker;
    }

    return undefined;
  }

  /**
   * Check if a worker is registered (directly or via factory).
   *
   * @param id - Worker ID to check
   * @returns true if the worker is registered
   */
  has(id: string): boolean {
    return this.workers.has(id) || this.factories.has(id);
  }

  /**
   * Get all available worker IDs.
   *
   * Returns IDs sorted alphabetically for deterministic ordering.
   * This ensures consistent iteration order across runs and tests.
   *
   * @returns Array of registered worker IDs, sorted alphabetically
   */
  getAvailableWorkers(): string[] {
    const directIds = Array.from(this.workers.keys());
    const factoryIds = Array.from(this.factories.keys());
    return [...new Set([...directIds, ...factoryIds])].sort();
  }

  /**
   * Unregister a worker by ID.
   *
   * @param id - Worker ID to remove
   * @returns true if the worker was removed, false if not found
   */
  unregister(id: string): boolean {
    const deletedDirect = this.workers.delete(id);
    const deletedFactory = this.factories.delete(id);
    return deletedDirect || deletedFactory;
  }

  /**
   * Clear all registered workers.
   * Useful for testing or re-initialization.
   */
  clear(): void {
    this.workers.clear();
    this.factories.clear();
  }

  /**
   * Get the count of registered workers.
   *
   * @returns Number of registered workers (including factories)
   */
  get size(): number {
    const ids = this.getAvailableWorkers();
    return ids.length;
  }
}

// ============================================================================
// Default Registry Instance
// ============================================================================

/**
 * Default worker registry instance.
 *
 * This is a singleton that can be used throughout the application.
 * Workers are registered during application initialization.
 */
export const defaultRegistry = new WorkerRegistry();

// ============================================================================
// Default Worker IDs
// ============================================================================

/**
 * Default worker IDs for the Phase 0 pipeline.
 * These represent the three data sources available for discovery.
 */
export const DEFAULT_WORKER_IDS = ['perplexity', 'places', 'youtube'] as const;

/**
 * Type-safe worker ID type derived from defaults.
 */
export type DefaultWorkerId = (typeof DEFAULT_WORKER_IDS)[number];

// ============================================================================
// Stub Worker Implementation
// ============================================================================

/**
 * StubWorker is a placeholder implementation for unregistered workers.
 *
 * Used to populate the registry with known worker IDs before real
 * implementations are available. Calling execute() will throw an error
 * with a helpful message indicating the stub needs to be replaced.
 */
class StubWorker implements Worker {
  readonly id: string;
  readonly provider: string;

  constructor(id: string, provider: string) {
    this.id = id;
    this.provider = provider;
  }

  async plan(
    _session: import('../schemas/session.js').Session,
    _enrichedIntent: import('../schemas/worker.js').EnrichedIntent
  ): Promise<never> {
    throw new Error(
      `Worker "${this.id}" is a stub and has no implementation. ` +
        `Register a real worker implementation before calling plan().`
    );
  }

  async execute(
    _assignment: import('../schemas/worker.js').WorkerAssignment,
    _context: import('./types.js').WorkerContext
  ): Promise<never> {
    throw new Error(
      `Worker "${this.id}" is a stub and has no implementation. ` +
        `Register a real worker implementation before calling execute().`
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a new worker registry with the default workers registered.
 *
 * The registry is pre-populated with stub workers for all Phase 0 worker IDs
 * (perplexity, places, youtube). These stubs allow the registry to report
 * available workers and enable pipeline planning before real implementations
 * are registered.
 *
 * Replace the stubs with real implementations as they become available:
 * ```typescript
 * const registry = createDefaultRegistry();
 * registry.unregister('perplexity');
 * registry.register(new PerplexityWorker()); // Real implementation
 * ```
 *
 * Or use registerFactory for lazy instantiation (preferred when implementations
 * have expensive initialization):
 * ```typescript
 * const registry = new WorkerRegistry();
 * registry.registerFactory('perplexity', () => new PerplexityWorker());
 * ```
 *
 * @returns WorkerRegistry with default stub workers registered
 */
export function createDefaultRegistry(): WorkerRegistry {
  const registry = new WorkerRegistry();

  // Register stub workers for all default worker IDs
  // Real implementations will replace these in Tasks 9, 10, 11
  registry.register(new StubWorker('perplexity', 'perplexity'));
  registry.register(new StubWorker('places', 'google'));
  registry.register(new StubWorker('youtube', 'youtube'));

  return registry;
}
