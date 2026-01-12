/**
 * Worker Framework Types
 *
 * Core interfaces for the worker system that powers data discovery.
 * Workers are pluggable data sources (Perplexity, Google Places, YouTube)
 * that execute queries and return candidates.
 *
 * @see PRD Appendix A - Worker Interface
 * @see Task 8.1 - Worker Framework & Interface
 */

import type { Session } from '../schemas/session.js';
import type {
  EnrichedIntent,
  WorkerAssignment,
  WorkerOutput,
} from '../schemas/worker.js';
import type { CostBreakdown } from '../schemas/cost.js';

// Re-export types that workers will commonly need
export type {
  EnrichedIntent,
  WorkerAssignment,
  WorkerOutput,
  WorkerExecutionStatus,
} from '../schemas/worker.js';
export type { CostBreakdown } from '../schemas/cost.js';
export type { Session } from '../schemas/session.js';

// ============================================================================
// Cost Tracker Interface
// ============================================================================

/**
 * CostTracker tracks API usage and costs across all providers.
 *
 * Each provider has a specialized method for recording usage:
 * - LLM providers (Perplexity, Gemini, OpenAI): track input/output tokens
 * - Places API: track number of API calls
 * - YouTube API: track quota units consumed
 *
 * @see PRD Appendix A - CostTracker interface
 */
export interface CostTracker {
  /**
   * Record token usage for Perplexity API calls
   * @param input - Number of input tokens
   * @param output - Number of output tokens
   */
  addPerplexity(input: number, output: number): void;

  /**
   * Record token usage for Gemini API calls
   * @param input - Number of input tokens
   * @param output - Number of output tokens
   */
  addGemini(input: number, output: number): void;

  /**
   * Record token usage for OpenAI API calls
   * @param input - Number of input tokens
   * @param output - Number of output tokens
   */
  addOpenAI(input: number, output: number): void;

  /**
   * Record a Google Places API call
   * Each call has a fixed cost regardless of results
   */
  addPlacesCall(): void;

  /**
   * Record YouTube Data API quota units consumed
   * @param units - Number of quota units used
   */
  addYouTubeUnits(units: number): void;

  /**
   * Get the current cost breakdown for all providers
   * @returns Complete cost breakdown with per-provider and total costs
   */
  getCost(): CostBreakdown;

  /**
   * Reset all tracked costs to zero
   * Called when starting a new run
   */
  reset(): void;
}

// ============================================================================
// Circuit Breaker Interface
// ============================================================================

/**
 * CircuitBreaker prevents cascading failures by disabling providers
 * that are consistently failing.
 *
 * Configuration (from PRD 17.3.3):
 * - Failure threshold: 5 consecutive failures
 * - Time window: 60 seconds
 * - Recovery: Manual reset at end of run
 *
 * When a circuit is "open", the provider should be skipped to avoid
 * wasting time on likely-to-fail requests.
 *
 * @see PRD Section 17.3.3 - Circuit Breaker Pattern
 * @see PRD Appendix A - CircuitBreaker interface
 */
export interface CircuitBreaker {
  /**
   * Record a successful request to a provider
   * Resets the failure counter for that provider
   * @param provider - Provider identifier (e.g., "perplexity", "places")
   */
  recordSuccess(provider: string): void;

  /**
   * Record a failed request to a provider
   * Increments failure counter; may open the circuit
   * @param provider - Provider identifier
   */
  recordFailure(provider: string): void;

  /**
   * Check if a provider's circuit is open (disabled due to failures)
   * @param provider - Provider identifier
   * @returns true if the provider should be skipped
   */
  isOpen(provider: string): boolean;

  /**
   * Get status of all tracked providers
   * @returns Map of provider to failure count and open status
   */
  getStatus(): Record<string, { failures: number; isOpen: boolean }>;
}

// ============================================================================
// Worker Context Interface
// ============================================================================

/**
 * WorkerContext provides the execution environment for workers.
 *
 * Contains all dependencies and shared state that workers need
 * during execution, including cost tracking and circuit breaker.
 *
 * Note: This extends the PRD Appendix A definition by including enrichedIntent,
 * which is necessary for workers to access the router's intent analysis during
 * execution. The PRD type only had session, runId, costTracker, circuitBreaker.
 *
 * @see PRD Appendix A - WorkerContext type
 */
export interface WorkerContext {
  /** The session being processed */
  session: Session;

  /** Unique identifier for this pipeline run */
  runId: string;

  /** Enriched intent from the router stage */
  enrichedIntent: EnrichedIntent;

  /** Cost tracker for recording API usage */
  costTracker: CostTracker;

  /** Circuit breaker for failure protection */
  circuitBreaker: CircuitBreaker;
}

// ============================================================================
// Worker Interface
// ============================================================================

/**
 * Worker is the core interface for all data source implementations.
 *
 * Each worker (Perplexity, Places, YouTube) implements this interface
 * to provide a consistent API for the worker executor.
 *
 * Workflow:
 * 1. plan() - Generate worker-specific queries and configuration
 * 2. execute() - Run the queries and return candidates
 *
 * @see PRD Appendix A - Worker interface
 * @see Task 8.1.1 - Worker interface definition
 */
export interface Worker {
  /**
   * Unique identifier for this worker
   * Used in logs, metrics, and worker registry
   * @example "perplexity", "places", "youtube"
   */
  readonly id: string;

  /**
   * Provider name for cost tracking and circuit breaker
   * Maps to the provider keys in CostTracker and CircuitBreaker
   * @example "perplexity", "places", "youtube"
   */
  readonly provider: string;

  /**
   * Generate a worker-specific execution plan
   *
   * Called by the router to get the worker's assignment based on
   * the session and enriched intent. The worker can customize
   * queries, result limits, and timeouts.
   *
   * Note: PRD Appendix A shows plan() returning WorkerPlan, but this
   * implementation correctly returns WorkerAssignment since each worker
   * plans only its own work. The Router stage (Section 7.0) produces
   * the combined WorkerPlan for all workers.
   *
   * @param session - The session being processed
   * @param enrichedIntent - Enriched intent from router analysis
   * @returns Worker assignment with queries and configuration
   */
  plan(session: Session, enrichedIntent: EnrichedIntent): Promise<WorkerAssignment>;

  /**
   * Execute the worker's assignment and return candidates
   *
   * Called by the worker executor to run the actual data retrieval.
   * Should handle its own retries, timeouts, and error reporting.
   *
   * @param assignment - The assignment from plan() or router
   * @param context - Execution context with dependencies
   * @returns Worker output with candidates and metadata
   */
  execute(assignment: WorkerAssignment, context: WorkerContext): Promise<WorkerOutput>;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if an object implements the Worker interface
 *
 * Validates that the object has:
 * - id: string
 * - provider: string
 * - plan: function
 * - execute: function
 *
 * @param obj - Object to check
 * @returns true if obj is a Worker
 */
export function isWorker(obj: unknown): obj is Worker {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.provider === 'string' &&
    typeof candidate.plan === 'function' &&
    typeof candidate.execute === 'function'
  );
}

// ============================================================================
// Worker Registry Types
// ============================================================================

/**
 * WorkerFactory creates a worker instance
 * Used by the registry for lazy instantiation
 */
export type WorkerFactory = () => Worker;

/**
 * WorkerMap maps worker IDs to their instances
 * Used internally by WorkerRegistry
 */
export type WorkerMap = Map<string, Worker>;
