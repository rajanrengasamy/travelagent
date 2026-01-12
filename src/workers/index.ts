/**
 * Worker Framework Exports
 *
 * Central export point for the worker framework.
 * Workers are pluggable data sources that fetch travel candidates
 * from various APIs (Perplexity, Google Places, YouTube).
 *
 * @module workers
 * @see PRD Section FR3 - Worker Framework
 * @see Task 8.5 - Worker Exports
 */

// ============================================================================
// Types
// ============================================================================

export type {
  Worker,
  WorkerContext,
  CostTracker,
  CircuitBreaker,
  WorkerFactory,
  WorkerMap,
} from './types.js';

export { isWorker } from './types.js';

// Re-exported schema types for convenience
export type {
  EnrichedIntent,
  WorkerAssignment,
  WorkerOutput,
  WorkerExecutionStatus,
  CostBreakdown,
  Session,
} from './types.js';

// ============================================================================
// Registry
// ============================================================================

export {
  WorkerRegistry,
  createDefaultRegistry,
  defaultRegistry,
  DEFAULT_WORKER_IDS,
} from './registry.js';
export type { DefaultWorkerId } from './registry.js';

// ============================================================================
// Concurrency
// ============================================================================

export { ConcurrencyLimiter, defaultLimiter } from './concurrency.js';
export type { ConcurrencyStats } from './concurrency.js';

// ============================================================================
// Executor
// ============================================================================

export {
  executeWorkers,
  saveWorkerOutputs,
  loadWorkerOutputs,
  summarizeExecution,
} from './executor.js';
export type { ExecuteWorkersOptions, ExecutionSummary } from './executor.js';
