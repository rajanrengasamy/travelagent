/**
 * Worker Schemas
 *
 * Types for worker planning, execution, and output.
 * Workers are the data sources (Perplexity, Google Places, YouTube).
 *
 * @see PRD Appendix A - Worker Interface
 */

import { z } from 'zod';
import { FlexibilitySchema, DateRangeSchema } from './common.js';
import { CandidateSchema } from './candidate.js';

// ============================================================================
// Worker Status Schema
// ============================================================================

/**
 * Worker execution status
 * - ok: Worker completed successfully
 * - error: Worker failed completely
 * - partial: Worker returned partial results
 * - skipped: Worker was skipped (disabled or not applicable)
 */
export const WorkerExecutionStatusSchema = z.enum(['ok', 'error', 'partial', 'skipped']);

export type WorkerExecutionStatus = z.infer<typeof WorkerExecutionStatusSchema>;

// ============================================================================
// Enriched Intent Schema
// ============================================================================

/**
 * EnrichedIntent: Expanded session intent from the router stage.
 * Contains the normalized, enriched version of the user's travel intent.
 *
 * @see PRD Appendix A - EnrichedIntent type
 */
export const EnrichedIntentSchema = z.object({
  /** Target destinations */
  destinations: z.array(z.string().min(1)),

  /** Travel date range */
  dateRange: DateRangeSchema,

  /** Date flexibility preference */
  flexibility: FlexibilitySchema,

  /** User interests and activities */
  interests: z.array(z.string().min(1)),

  /** Additional constraints (budget, accessibility, etc.) */
  constraints: z.record(z.string(), z.unknown()),

  /** Tags inferred by the router from the session context */
  inferredTags: z.array(z.string()),
});

export type EnrichedIntent = z.infer<typeof EnrichedIntentSchema>;

// ============================================================================
// Worker Plan Schema
// ============================================================================

/**
 * Individual worker assignment within a plan
 */
export const WorkerAssignmentSchema = z.object({
  /** Worker identifier (e.g., "perplexity", "places", "youtube") */
  workerId: z.string().min(1),

  /** Search queries to execute */
  queries: z.array(z.string().min(1)),

  /** Maximum results to return */
  maxResults: z.number().int().positive(),

  /** Timeout in milliseconds */
  timeout: z.number().int().positive(),
});

export type WorkerAssignment = z.infer<typeof WorkerAssignmentSchema>;

/**
 * Validation plan for social-derived candidates
 */
export const ValidationPlanSchema = z.object({
  /** Number of top candidates to validate */
  validateTopN: z.number().int().nonnegative(),

  /** Origins to prioritize for validation (e.g., ["youtube"]) */
  origins: z.array(z.string()),
});

export type ValidationPlan = z.infer<typeof ValidationPlanSchema>;

/**
 * WorkerPlan: Router output that describes what each worker should do.
 *
 * @see PRD Appendix A - WorkerPlan type
 */
export const WorkerPlanSchema = z.object({
  /** Enriched intent from session analysis */
  enrichedIntent: EnrichedIntentSchema,

  /** Individual worker assignments */
  workers: z.array(WorkerAssignmentSchema),

  /** Plan for validating social-derived candidates */
  validationPlan: ValidationPlanSchema,
});

export type WorkerPlan = z.infer<typeof WorkerPlanSchema>;

// ============================================================================
// Worker Output Schema
// ============================================================================

/**
 * Token usage for LLM-powered workers
 */
export const WorkerTokenUsageSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
});

export type WorkerTokenUsage = z.infer<typeof WorkerTokenUsageSchema>;

/**
 * WorkerOutput: Result from a single worker execution.
 *
 * @see PRD Appendix A - WorkerOutput type
 */
export const WorkerOutputSchema = z.object({
  /** Worker identifier */
  workerId: z.string().min(1),

  /** Execution status */
  status: WorkerExecutionStatusSchema,

  /** Candidates produced by this worker */
  candidates: z.array(CandidateSchema),

  /** Raw API response data (for debugging) */
  rawData: z.unknown().optional(),

  /** Error message if status is 'error' or 'partial' */
  error: z.string().optional(),

  /** Execution duration in milliseconds */
  durationMs: z.number().int().nonnegative(),

  /** Token usage for LLM-powered workers */
  tokenUsage: WorkerTokenUsageSchema.optional(),
});

export type WorkerOutput = z.infer<typeof WorkerOutputSchema>;

// ============================================================================
// Schema Version
// ============================================================================

export const WORKER_SCHEMA_VERSION = 1;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an error worker output
 */
export function createErrorWorkerOutput(
  workerId: string,
  error: string,
  durationMs: number
): WorkerOutput {
  return {
    workerId,
    status: 'error',
    candidates: [],
    error,
    durationMs,
  };
}

/**
 * Create a skipped worker output
 */
export function createSkippedWorkerOutput(workerId: string): WorkerOutput {
  return {
    workerId,
    status: 'skipped',
    candidates: [],
    durationMs: 0,
  };
}
