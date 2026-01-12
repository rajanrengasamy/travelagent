/**
 * Pipeline Type Definitions
 *
 * Core interfaces for the 11-stage pipeline execution framework.
 * These types define the contracts between stages, the execution context,
 * and the results structure.
 *
 * @module pipeline/types
 * @see PRD Section 11 - Pipeline Infrastructure
 */

import type { RunConfig } from '../schemas/run-config.js';
import type { StageMetadata } from '../schemas/stage.js';

// ============================================================================
// Stage Numbers and Names
// ============================================================================

/**
 * Valid stage numbers (0-10) for the 11-stage pipeline.
 *
 * Stage numbering:
 * - 00: Enhancement
 * - 01: Intake
 * - 02: Router
 * - 03: Workers
 * - 04: Normalize
 * - 05: Dedupe
 * - 06: Rank
 * - 07: Validate
 * - 08: Top Candidates
 * - 09: Aggregate
 * - 10: Results
 */
export type StageNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * Union type of all stage names in the pipeline.
 * These match the canonical filenames from PRD Section 11.2.
 */
export type StageName =
  | 'enhancement'
  | 'intake'
  | 'router_plan'
  | 'worker_outputs'
  | 'candidates_normalized'
  | 'candidates_deduped'
  | 'candidates_ranked'
  | 'candidates_validated'
  | 'top_candidates'
  | 'aggregator_output'
  | 'results';

/**
 * Mapping from stage number to stage name.
 * These match the canonical filenames from PRD Section 11.2.
 */
export const STAGE_NAMES: Record<StageNumber, StageName> = {
  0: 'enhancement',
  1: 'intake',
  2: 'router_plan',
  3: 'worker_outputs',
  4: 'candidates_normalized',
  5: 'candidates_deduped',
  6: 'candidates_ranked',
  7: 'candidates_validated',
  8: 'top_candidates',
  9: 'aggregator_output',
  10: 'results',
} as const;

/**
 * Mapping from stage name to stage number.
 * These match the canonical filenames from PRD Section 11.2.
 */
export const STAGE_NUMBERS: Record<StageName, StageNumber> = {
  enhancement: 0,
  intake: 1,
  router_plan: 2,
  worker_outputs: 3,
  candidates_normalized: 4,
  candidates_deduped: 5,
  candidates_ranked: 6,
  candidates_validated: 7,
  top_candidates: 8,
  aggregator_output: 9,
  results: 10,
} as const;

// ============================================================================
// Cost Tracker Interface
// ============================================================================

/**
 * Minimal interface for cost tracking during pipeline execution.
 * The full implementation resides in src/cost/tracker.ts.
 *
 * @see PRD Section 9.3 - Cost Tracking
 */
export interface CostTracker {
  /**
   * Record token usage for a provider.
   * @param provider - Provider identifier (e.g., 'openai', 'perplexity', 'gemini')
   * @param input - Number of input tokens
   * @param output - Number of output tokens
   */
  addTokenUsage(provider: string, input: number, output: number): void;

  /**
   * Record API call count for a provider.
   * @param provider - Provider identifier
   * @param calls - Number of API calls made
   */
  addApiCalls(provider: string, calls: number): void;

  /**
   * Get the current total usage and estimated cost.
   * @returns Token counts and estimated cost in USD
   */
  getTotal(): {
    tokens: { input: number; output: number };
    estimatedCost: number;
  };
}

// ============================================================================
// Logger Interface
// ============================================================================

/**
 * Minimal logger interface for pipeline stages.
 * Allows stages to log at various levels without depending on a specific logger.
 */
export interface Logger {
  /** Log debug-level message (typically hidden in production) */
  debug(message: string, ...args: unknown[]): void;

  /** Log informational message */
  info(message: string, ...args: unknown[]): void;

  /** Log warning message */
  warn(message: string, ...args: unknown[]): void;

  /** Log error message */
  error(message: string, ...args: unknown[]): void;
}

// ============================================================================
// Stage Context
// ============================================================================

/**
 * Runtime context passed to each pipeline stage during execution.
 * Contains all information a stage needs to execute and persist its output.
 *
 * @see PRD Section 11.3 - Stage Metadata
 */
export interface StageContext {
  /** Session identifier (format: YYYYMMDD-<slug>) */
  sessionId: string;

  /** Run identifier (format: YYYYMMDD-HHMMSS[-mode]) */
  runId: string;

  /** Run configuration with models, limits, and flags */
  config: RunConfig;

  /** Cost tracker for recording usage */
  costTracker: CostTracker;

  /** Base data directory (e.g., ~/.travelagent) */
  dataDir: string;

  /** Optional logger for stage output */
  logger?: Logger;
}

// ============================================================================
// Stage Result
// ============================================================================

/**
 * Result returned by a stage after execution.
 * Contains the output data, metadata, and timing information.
 *
 * @typeParam T - The type of the stage output data
 */
export interface StageResult<T> {
  /** The stage output data */
  data: T;

  /** Standard metadata for the stage output */
  metadata: StageMetadata;

  /** Execution timing information */
  timing: {
    /** ISO8601 timestamp when stage started */
    startedAt: string;

    /** ISO8601 timestamp when stage completed */
    completedAt: string;

    /** Duration in milliseconds */
    durationMs: number;
  };

  /** Path where checkpoint was written, if applicable */
  checkpointPath?: string;
}

// ============================================================================
// Stage Interface
// ============================================================================

/**
 * Interface that all pipeline stages must implement.
 * Each stage processes input from upstream and produces output for downstream.
 *
 * Note: This interface uses `unknown` for input/output types because the
 * PipelineExecutor stores heterogeneous stages in a collection and passes
 * data between stages dynamically. For type-safe stage implementations,
 * use the TypedStage interface below which provides generic type parameters.
 *
 * @see PRD Section 11.2 - Stage Architecture
 */
export interface Stage {
  /**
   * Stage identifier in format NN_stage_name.
   * @example "08_top_candidates"
   */
  id: string;

  /**
   * Human-readable stage name.
   * @example "top_candidates"
   */
  name: StageName;

  /**
   * Numeric stage number (0-10).
   */
  number: StageNumber;

  /**
   * Execute the stage with the given context and input.
   *
   * @param context - Runtime context with session, config, and utilities
   * @param input - Output from the upstream stage (type varies by stage)
   * @returns Stage result containing output data and metadata
   */
  execute(context: StageContext, input: unknown): Promise<StageResult<unknown>>;
}

/**
 * Generic-typed stage interface for implementing concrete stages with
 * compile-time type safety.
 *
 * Use this interface when defining individual stage implementations to get
 * better type checking for input/output data. Stages implementing this
 * interface are compatible with the base Stage interface used by PipelineExecutor.
 *
 * @typeParam TInput - The expected input type from the upstream stage
 * @typeParam TOutput - The output type produced by this stage
 *
 * @example
 * ```typescript
 * // Define a typed stage implementation
 * const dedupeStage: TypedStage<NormalizedCandidate[], DedupedCandidate[]> = {
 *   id: '05_candidates_deduped',
 *   name: 'candidates_deduped',
 *   number: 5,
 *   async execute(context, input) {
 *     // input is typed as NormalizedCandidate[]
 *     const deduped = deduplicate(input);
 *     return {
 *       data: deduped, // typed as DedupedCandidate[]
 *       metadata: { ... },
 *       timing: { ... },
 *     };
 *   },
 * };
 *
 * // Register with executor (compatible with Stage interface)
 * executor.registerStage(dedupeStage);
 * ```
 */
export interface TypedStage<TInput = unknown, TOutput = unknown> {
  /**
   * Stage identifier in format NN_stage_name.
   * @example "08_top_candidates"
   */
  id: string;

  /**
   * Human-readable stage name.
   * @example "top_candidates"
   */
  name: StageName;

  /**
   * Numeric stage number (0-10).
   */
  number: StageNumber;

  /**
   * Execute the stage with the given context and typed input.
   *
   * @param context - Runtime context with session, config, and utilities
   * @param input - Output from the upstream stage (typed as TInput)
   * @returns Stage result containing output data typed as TOutput
   */
  execute(context: StageContext, input: TInput): Promise<StageResult<TOutput>>;
}

// ============================================================================
// Execution Options
// ============================================================================

/**
 * Options for pipeline execution.
 * Controls how the pipeline runs, including resume and dry-run modes.
 *
 * @see PRD Section 11.7 - Resume from Stage
 */
export interface ExecuteOptions {
  /**
   * If true, show what would run without executing.
   * Useful for testing pipeline configuration.
   */
  dryRun?: boolean;

  /**
   * Resume from this stage number (0-10).
   * Stages before this number will be skipped, loading from previous run.
   */
  fromStage?: StageNumber;

  /**
   * Source run ID for resume mode.
   * Required when fromStage is specified.
   */
  sourceRunId?: string;

  /**
   * Stop execution after this stage number.
   * Useful for partial pipeline runs during development.
   */
  stopAfterStage?: StageNumber;

  /**
   * If true, continue execution when a stage fails instead of stopping.
   * Failed stages are recorded in the result's `degradedStages` array.
   * Downstream stages receive null as input and must handle it gracefully.
   *
   * This enables "graceful degradation" where partial results are allowed.
   *
   * @default false
   * @see PRD Section 10.1 - Pipeline Flow (partial results allowed)
   * @see PRD Section 4.2 - Success Metrics (pipeline completes with partial results)
   */
  continueOnError?: boolean;
}

// ============================================================================
// Stage Info for Manifest
// ============================================================================

/**
 * Lightweight stage information for the run manifest.
 * Contains file metadata without the full stage output.
 *
 * @see PRD Section 11.6 - Run Manifest
 */
export interface StageInfo {
  /** Stage identifier (e.g., "08_top_candidates") */
  stageId: string;

  /** Filename of the stage output (e.g., "08_top_candidates.json") */
  filename: string;

  /** ISO8601 timestamp when stage file was created */
  createdAt: string;

  /** SHA-256 hash of the file contents for integrity verification */
  sha256: string;

  /** Size of the file in bytes */
  sizeBytes: number;

  /** Stage ID of the upstream stage, if any */
  upstreamStage?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a stage number as a two-digit string with leading zero.
 * @param num - Stage number (0-10)
 * @returns Two-digit string (e.g., "00", "08", "10")
 */
export function formatStageNumber(num: StageNumber): string {
  return num.toString().padStart(2, '0');
}

/**
 * Build a stage ID from number and name.
 * @param num - Stage number
 * @param name - Stage name
 * @returns Stage ID in format NN_stage_name
 */
export function buildStageId(num: StageNumber, name: StageName): string {
  return `${formatStageNumber(num)}_${name}`;
}

/**
 * Check if a value is a valid stage number.
 * @param value - Value to check
 * @returns True if value is a valid stage number (0-10)
 */
export function isValidStageNumber(value: unknown): value is StageNumber {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10;
}

/**
 * Check if a value is a valid stage name.
 * @param value - Value to check
 * @returns True if value is a valid stage name
 */
export function isValidStageName(value: unknown): value is StageName {
  return typeof value === 'string' && value in STAGE_NUMBERS;
}
