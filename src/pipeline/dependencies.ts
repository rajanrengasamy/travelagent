/**
 * Stage Dependency Map
 *
 * Defines the relationships between pipeline stages, enabling:
 * - Resume-from-stage logic
 * - Upstream/downstream stage discovery
 * - Stage validation
 *
 * The pipeline has 11 stages (0-10) with linear dependencies:
 * Enhancement (00) → Intake (01) → Router (02) → Workers (03) →
 * Normalize (04) → Dedupe (05) → Rank (06) → Validate (07) →
 * Top Candidates (08) → Aggregate (09) → Results (10)
 *
 * @module pipeline/dependencies
 * @see PRD Section 11 - Pipeline Architecture
 */

import { type StageNumber, isValidStageNumber } from './types.js';

// Re-export for consumers that import from dependencies.js
export { type StageNumber, isValidStageNumber };

// ============================================================================
// Stage Constants
// ============================================================================

/**
 * Maps each stage number to its upstream (dependency) stage.
 * Stage 0 has no upstream. Stage 1 depends on 0, etc.
 */
export const STAGE_DEPENDENCIES: Record<number, number | null> = {
  0: null, // Enhancement - no upstream
  1: 0, // Intake depends on Enhancement
  2: 1, // Router depends on Intake
  3: 2, // Workers depends on Router
  4: 3, // Normalize depends on Workers
  5: 4, // Dedupe depends on Normalize
  6: 5, // Rank depends on Dedupe
  7: 6, // Validate depends on Rank
  8: 7, // Top Candidates depends on Validate
  9: 8, // Aggregate depends on Top Candidates
  10: 9, // Results depends on Aggregate
};

/**
 * Maps stage number to stage ID (filename prefix).
 * Format: NN_stage_name
 */
export const STAGE_IDS: Record<number, string> = {
  0: '00_enhancement',
  1: '01_intake',
  2: '02_router_plan',
  3: '03_worker_outputs',
  4: '04_candidates_normalized',
  5: '05_candidates_deduped',
  6: '06_candidates_ranked',
  7: '07_candidates_validated',
  8: '08_top_candidates',
  9: '09_aggregator_output',
  10: '10_results',
};

/**
 * Maps stage number to file-based stage name.
 * These are the stage_name portion from STAGE_IDS (without the NN_ prefix).
 *
 * Note: These differ from the semantic StageName type in types.ts.
 * For example, stage 2 has file name 'router_plan' but semantic name 'router'.
 */
export const STAGE_FILE_NAMES: Record<number, string> = {
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
};

/** Total number of stages in the pipeline */
export const TOTAL_STAGES = 11;

/** Valid stage numbers (0-10) */
export const VALID_STAGE_NUMBERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * Assert that a stage number is valid, throwing an error if not.
 *
 * @param stageNumber - The stage number to validate
 * @throws Error if stageNumber is invalid
 */
function assertValidStageNumber(stageNumber: number): asserts stageNumber is StageNumber {
  if (!isValidStageNumber(stageNumber)) {
    throw new Error(`Invalid stage number: ${stageNumber}. Must be an integer from 0 to 10.`);
  }
}

// ============================================================================
// Stage ID and Name Functions
// ============================================================================

/**
 * Get the stage ID for a stage number.
 *
 * @param stageNumber - The stage number (0-10)
 * @returns The stage ID (e.g., "08_top_candidates")
 * @throws Error if stageNumber is invalid
 *
 * @example
 * getStageId(8); // "08_top_candidates"
 * getStageId(0); // "00_enhancement"
 */
export function getStageId(stageNumber: number): string {
  assertValidStageNumber(stageNumber);
  return STAGE_IDS[stageNumber];
}

/**
 * Get the file-based stage name for a stage number.
 *
 * @param stageNumber - The stage number (0-10)
 * @returns The file-based stage name (e.g., "top_candidates")
 * @throws Error if stageNumber is invalid
 *
 * @example
 * getStageName(8); // "top_candidates"
 * getStageName(0); // "enhancement"
 */
export function getStageName(stageNumber: number): string {
  assertValidStageNumber(stageNumber);
  return STAGE_FILE_NAMES[stageNumber];
}

// ============================================================================
// Dependency Functions
// ============================================================================

/**
 * Get the immediate upstream stage for a given stage.
 *
 * @param stageNumber - The stage number (0-10)
 * @returns The upstream stage number, or null for stage 0
 * @throws Error if stageNumber is invalid
 *
 * @example
 * getImmediateUpstream(5); // 4
 * getImmediateUpstream(0); // null
 */
export function getImmediateUpstream(stageNumber: number): number | null {
  assertValidStageNumber(stageNumber);
  return STAGE_DEPENDENCIES[stageNumber];
}

/**
 * Get all upstream stages for a given stage (recursive dependencies).
 * Returns stages in order from earliest to immediate upstream.
 *
 * @param stageNumber - The stage number (0-10)
 * @returns Array of upstream stage numbers, earliest first
 * @throws Error if stageNumber is invalid
 *
 * @example
 * getUpstreamStages(5); // [0, 1, 2, 3, 4]
 * getUpstreamStages(0); // []
 * getUpstreamStages(2); // [0, 1]
 */
export function getUpstreamStages(stageNumber: number): number[] {
  assertValidStageNumber(stageNumber);

  const upstream: number[] = [];
  let current: number | null = STAGE_DEPENDENCIES[stageNumber];

  // Walk back through dependencies
  while (current !== null) {
    upstream.unshift(current); // Add to front to maintain order
    current = STAGE_DEPENDENCIES[current];
  }

  return upstream;
}

/**
 * Get all downstream stages that depend on a given stage.
 * Returns stages in order from immediate downstream to final.
 *
 * @param stageNumber - The stage number (0-10)
 * @returns Array of downstream stage numbers, immediate first
 * @throws Error if stageNumber is invalid
 *
 * @example
 * getDownstreamStages(5); // [6, 7, 8, 9, 10]
 * getDownstreamStages(10); // []
 * getDownstreamStages(0); // [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
 */
export function getDownstreamStages(stageNumber: number): number[] {
  assertValidStageNumber(stageNumber);

  const downstream: number[] = [];

  // Collect all stages after this one (since it's a linear pipeline)
  for (let i = stageNumber + 1; i <= 10; i++) {
    downstream.push(i);
  }

  return downstream;
}

/**
 * Get the stages that would be skipped when resuming from a given stage.
 * These are the stages that have already been completed in a previous run.
 *
 * @param fromStage - The stage number to resume from
 * @returns Array of stage numbers that will be skipped
 * @throws Error if fromStage is invalid
 *
 * @example
 * getStagesToSkip(8); // [0, 1, 2, 3, 4, 5, 6, 7]
 * getStagesToSkip(0); // []
 */
export function getStagesToSkip(fromStage: number): number[] {
  assertValidStageNumber(fromStage);
  return getUpstreamStages(fromStage);
}

/**
 * Get the stages that would be executed when resuming from a given stage.
 * Includes the fromStage itself and all downstream stages.
 *
 * @param fromStage - The stage number to resume from
 * @returns Array of stage numbers that will be executed
 * @throws Error if fromStage is invalid
 *
 * @example
 * getStagesToExecute(8); // [8, 9, 10]
 * getStagesToExecute(0); // [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
 */
export function getStagesToExecute(fromStage: number): number[] {
  assertValidStageNumber(fromStage);
  return [fromStage, ...getDownstreamStages(fromStage)];
}

/**
 * Check if one stage depends on another (directly or transitively).
 *
 * @param stage - The stage that might depend on upstream
 * @param upstream - The potential upstream stage
 * @returns true if stage depends on upstream
 * @throws Error if either stage number is invalid
 *
 * @example
 * dependsOn(5, 2); // true - stage 5 depends on stage 2
 * dependsOn(2, 5); // false - stage 2 does not depend on stage 5
 * dependsOn(3, 3); // false - a stage does not depend on itself
 */
export function dependsOn(stage: number, upstream: number): boolean {
  assertValidStageNumber(stage);
  assertValidStageNumber(upstream);

  return getUpstreamStages(stage).includes(upstream);
}
