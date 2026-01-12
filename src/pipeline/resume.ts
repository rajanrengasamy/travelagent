/**
 * Resume-from-Stage Logic
 *
 * Enables resuming pipeline execution from any stage by loading
 * data from a previous run and skipping upstream stages.
 *
 * This is a key feature for:
 * - Debugging specific stages
 * - Iterating on aggregator/results without re-running workers
 * - Recovering from failures
 *
 * @module pipeline/resume
 * @see PRD Section 11.7 - Resume from Stage
 */

import { z } from 'zod';
import { loadStageFile } from '../storage/index.js';
import { StageMetadataSchema } from '../schemas/stage.js';
import {
  STAGE_IDS,
  getUpstreamStages,
  getDownstreamStages,
  isValidStageNumber,
  getStageId,
} from './dependencies.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of validating a stage file for resume
 */
export interface StageValidationResult {
  /** Whether the stage file is valid for resuming */
  valid: boolean;
  /** Validation error messages if invalid */
  errors: string[];
  /** The validated metadata if valid */
  metadata?: z.infer<typeof StageMetadataSchema>;
}

/**
 * Information about stages to execute in a resume run
 */
export interface ResumeExecutionPlan {
  /** Stage number to resume from */
  fromStage: number;
  /** Stage IDs that will be skipped (already computed) */
  stagesToSkip: string[];
  /** Stage IDs that will be executed */
  stagesToExecute: string[];
  /** Stage number to load input from (fromStage - 1) */
  inputStage: number;
  /** Stage ID to load input from */
  inputStageId: string;
}

// ============================================================================
// Stage Loading Functions
// ============================================================================

/**
 * Load a stage file from a previous run for resuming.
 *
 * Loads the full checkpoint file and extracts the data field,
 * discarding the metadata wrapper.
 *
 * @typeParam T - Expected type of the stage data
 * @param sessionId - Session ID
 * @param sourceRunId - Run ID to load from
 * @param stageNumber - Stage number (0-10)
 * @returns The stage data (without _meta wrapper)
 * @throws Error if file doesn't exist or fails validation
 *
 * @example
 * ```typescript
 * // Load top candidates from a previous run
 * const topCandidates = await loadStageForResume<TopCandidatesData>(
 *   '20260107-paris-trip',
 *   '20260107-143512-full',
 *   8
 * );
 * ```
 */
export async function loadStageForResume<T>(
  sessionId: string,
  sourceRunId: string,
  stageNumber: number
): Promise<T> {
  // 1. Validate stage number
  if (!isValidStageNumber(stageNumber)) {
    throw new Error(`Invalid stage number: ${stageNumber}. Must be 0-10.`);
  }

  // 2. Get stage ID from stage number
  const stageId = getStageId(stageNumber);

  // 3. Load stage file using storage layer
  const checkpoint = await loadStageFile<{ _meta: unknown; data: T }>(
    sessionId,
    sourceRunId,
    stageId
  );

  // 4. Validate checkpoint structure
  const validation = validateStageFile(checkpoint, stageNumber);
  if (!validation.valid) {
    throw new Error(
      `Invalid stage file ${stageId} for resume: ${validation.errors.join(', ')}`
    );
  }

  // 5. Extract and return the data field
  return checkpoint.data;
}

/**
 * Load stage metadata from a previous run.
 *
 * @param sessionId - Session ID
 * @param sourceRunId - Run ID to load from
 * @param stageNumber - Stage number (0-10)
 * @returns The stage metadata
 * @throws Error if file doesn't exist or fails validation
 */
export async function loadStageMetadataForResume(
  sessionId: string,
  sourceRunId: string,
  stageNumber: number
): Promise<z.infer<typeof StageMetadataSchema>> {
  if (!isValidStageNumber(stageNumber)) {
    throw new Error(`Invalid stage number: ${stageNumber}. Must be 0-10.`);
  }

  const stageId = getStageId(stageNumber);
  const checkpoint = await loadStageFile<{ _meta: unknown; data: unknown }>(
    sessionId,
    sourceRunId,
    stageId
  );

  const validation = validateStageFile(checkpoint, stageNumber);
  if (!validation.valid || !validation.metadata) {
    throw new Error(
      `Invalid stage file ${stageId} for resume: ${validation.errors.join(', ')}`
    );
  }

  return validation.metadata;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate that a stage file has correct structure for resuming.
 *
 * Checks:
 * - Has _meta field with valid StageMetadata
 * - Has data field
 * - _meta.stageNumber matches expected stage number
 *
 * @param data - The loaded stage file content
 * @param stageNumber - Expected stage number
 * @returns Validation result with errors if invalid
 *
 * @example
 * ```typescript
 * const checkpoint = await loadStageFile(sessionId, runId, stageId);
 * const result = validateStageFile(checkpoint, 8);
 * if (!result.valid) {
 *   console.error('Invalid:', result.errors);
 * }
 * ```
 */
export function validateStageFile(
  data: unknown,
  stageNumber: number
): StageValidationResult {
  const errors: string[] = [];

  // Check basic object structure
  if (typeof data !== 'object' || data === null) {
    return {
      valid: false,
      errors: ['Stage file must be a non-null object'],
    };
  }

  const obj = data as Record<string, unknown>;

  // Check for _meta field
  if (!('_meta' in obj) || obj._meta === undefined) {
    errors.push('Missing required field: _meta');
  }

  // Check for data field
  if (!('data' in obj)) {
    errors.push('Missing required field: data');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Validate _meta against StageMetadataSchema
  const metaResult = StageMetadataSchema.safeParse(obj._meta);
  if (!metaResult.success) {
    for (const issue of metaResult.error.issues) {
      errors.push(`_meta.${issue.path.join('.')}: ${issue.message}`);
    }
    return { valid: false, errors };
  }

  // Verify stageNumber matches
  if (metaResult.data.stageNumber !== stageNumber) {
    errors.push(
      `Stage number mismatch: expected ${stageNumber}, got ${metaResult.data.stageNumber}`
    );
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    metadata: metaResult.data,
  };
}

/**
 * Check if a stage file is valid for resuming (boolean convenience function).
 *
 * @param data - The loaded stage file content
 * @param stageNumber - Expected stage number
 * @returns true if valid, false otherwise
 */
export function isValidStageFileForResume(
  data: unknown,
  stageNumber: number
): boolean {
  return validateStageFile(data, stageNumber).valid;
}

// ============================================================================
// Stage Calculation Functions
// ============================================================================

/**
 * Get stage IDs that should be skipped when resuming from a stage.
 * This includes all upstream stages (they're already computed).
 *
 * @param fromStage - Stage number to resume from
 * @returns Array of stage IDs to skip
 * @throws Error if fromStage is invalid
 *
 * @example
 * ```typescript
 * getStagesToSkip(8);
 * // Returns: ['00_enhancement', '01_intake', '02_router_plan',
 * //           '03_worker_outputs', '04_candidates_normalized',
 * //           '05_candidates_deduped', '06_candidates_ranked',
 * //           '07_candidates_validated']
 *
 * getStagesToSkip(0);
 * // Returns: []
 * ```
 */
export function getStagesToSkip(fromStage: number): string[] {
  if (!isValidStageNumber(fromStage)) {
    throw new Error(`Invalid stage number: ${fromStage}. Must be 0-10.`);
  }

  const upstreamNumbers = getUpstreamStages(fromStage);
  return upstreamNumbers.map((n) => STAGE_IDS[n]);
}

/**
 * Get stage IDs that need to be executed when resuming from a stage.
 * This includes the from-stage and all downstream stages.
 *
 * @param fromStage - Stage number to resume from
 * @returns Array of stage IDs to execute, including fromStage
 * @throws Error if fromStage is invalid
 *
 * @example
 * ```typescript
 * getStagesToExecute(8);
 * // Returns: ['08_top_candidates', '09_aggregator_output', '10_results']
 *
 * getStagesToExecute(0);
 * // Returns: ['00_enhancement', '01_intake', '02_router_plan', ...]
 * ```
 */
export function getStagesToExecute(fromStage: number): string[] {
  if (!isValidStageNumber(fromStage)) {
    throw new Error(`Invalid stage number: ${fromStage}. Must be 0-10.`);
  }

  const downstreamNumbers = getDownstreamStages(fromStage);
  return [STAGE_IDS[fromStage], ...downstreamNumbers.map((n) => STAGE_IDS[n])];
}

/**
 * Create a complete execution plan for resuming from a stage.
 *
 * @param fromStage - Stage number to resume from
 * @returns Execution plan with all stage information
 * @throws Error if fromStage is invalid or is stage 0 (can't resume from start)
 *
 * @example
 * ```typescript
 * const plan = createResumeExecutionPlan(8);
 * // plan.stagesToSkip = ['00_enhancement', ... , '07_candidates_validated']
 * // plan.stagesToExecute = ['08_top_candidates', '09_aggregator_output', '10_results']
 * // plan.inputStage = 7
 * // plan.inputStageId = '07_candidates_validated'
 * ```
 */
export function createResumeExecutionPlan(fromStage: number): ResumeExecutionPlan {
  if (!isValidStageNumber(fromStage)) {
    throw new Error(`Invalid stage number: ${fromStage}. Must be 0-10.`);
  }

  if (fromStage === 0) {
    // Resuming from stage 0 is just a full run, but we still support it
    return {
      fromStage: 0,
      stagesToSkip: [],
      stagesToExecute: getStagesToExecute(0),
      inputStage: -1, // No input stage for stage 0
      inputStageId: '', // No input stage ID for stage 0
    };
  }

  const inputStage = fromStage - 1;

  return {
    fromStage,
    stagesToSkip: getStagesToSkip(fromStage),
    stagesToExecute: getStagesToExecute(fromStage),
    inputStage,
    inputStageId: STAGE_IDS[inputStage],
  };
}

/**
 * Get the stage number that provides input for a given stage.
 *
 * @param stageNumber - Stage number (1-10, not 0)
 * @returns The input stage number
 * @throws Error if stageNumber is 0 (no input stage) or invalid
 */
export function getInputStageNumber(stageNumber: number): number {
  if (!isValidStageNumber(stageNumber)) {
    throw new Error(`Invalid stage number: ${stageNumber}. Must be 0-10.`);
  }

  if (stageNumber === 0) {
    throw new Error('Stage 0 has no input stage');
  }

  return stageNumber - 1;
}

/**
 * Get the stage ID that provides input for a given stage.
 *
 * @param stageNumber - Stage number (1-10, not 0)
 * @returns The input stage ID
 * @throws Error if stageNumber is 0 (no input stage) or invalid
 */
export function getInputStageId(stageNumber: number): string {
  return STAGE_IDS[getInputStageNumber(stageNumber)];
}
