/**
 * Social Validation Stage (Stage 07)
 *
 * Validates YouTube-derived candidates from Stage 06 by cross-referencing
 * with Perplexity. Updates candidate validation fields with verification
 * status and notes.
 *
 * **Checkpoint Contract**: This stage returns a `ValidateStageOutput`
 * structure containing all candidates (with updated validation fields)
 * and validation statistics.
 * The checkpoint is written to `07_candidates_validated.json`.
 *
 * @module stages/validate
 * @see PRD Section FR6 - Social Validation
 * @see TODO Section 15.0 - Social Validation Stage (Stage 07)
 */

import type { Candidate } from '../schemas/candidate.js';
import type { TypedStage, StageContext, StageResult } from '../pipeline/types.js';
import { createStageMetadata } from '../schemas/stage.js';
import { CandidateValidator, type ValidationResult } from '../validation/validator.js';
import type { RankStageOutput } from './rank/types.js';
import {
  type ValidateStageOutput,
  type ValidationDetail,
  createEmptyStats,
  toValidationDetail,
  countByStatus,
} from './validate/types.js';

// ============================================================================
// Constants
// ============================================================================

/** Stage identifier */
const STAGE_ID = '07_candidates_validated';
const STAGE_NAME = 'candidates_validated' as const;
const STAGE_NUMBER = 7 as const;

/** Upstream stage identifier */
const UPSTREAM_STAGE = '06_candidates_ranked';

/**
 * Maximum number of YouTube candidates to validate.
 * @see TODO Section 15.3.3 - Select top N for validation: min(10, youtube_count)
 */
const MAX_VALIDATIONS = 10;

/**
 * Concurrency limit for parallel validations.
 * @see TODO Section 15.3.4 - Run validations in parallel with concurrency limit
 */
const VALIDATION_CONCURRENCY = 3;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Identify YouTube-derived candidates.
 * These are candidates with origin 'youtube' or confidence 'provisional'.
 *
 * @see TODO Section 15.3.2 - Identify YouTube-derived candidates
 *
 * @param candidates - All candidates from ranking stage
 * @returns Array of YouTube-derived candidates
 */
function identifyYoutubeCandidates(candidates: Candidate[]): Candidate[] {
  return candidates.filter(
    (c) => c.origin === 'youtube' || c.confidence === 'provisional'
  );
}

/**
 * Select candidates for validation.
 * Selects the top N YouTube candidates by score.
 *
 * @see TODO Section 15.3.3 - Select top N for validation: min(10, youtube_count)
 *
 * @param youtubeCandidates - YouTube-derived candidates
 * @returns Array of candidates to validate
 */
function selectForValidation(youtubeCandidates: Candidate[]): Candidate[] {
  // Already sorted by score from rank stage, take top N
  return youtubeCandidates.slice(0, MAX_VALIDATIONS);
}

/**
 * Run validations with concurrency limit.
 *
 * Uses a simple promise-based concurrency control.
 *
 * @see TODO Section 15.3.4 - Run validations in parallel with concurrency limit
 *
 * @param candidates - Candidates to validate
 * @param validator - Validator instance
 * @param context - Stage context for cost tracking
 * @returns Array of validation results
 */
async function runValidationsWithConcurrency(
  candidates: Candidate[],
  validator: CandidateValidator,
  context: StageContext
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const queue = [...candidates];
  const running: Promise<void>[] = [];

  async function processNext(): Promise<void> {
    const candidate = queue.shift();
    if (!candidate) return;

    try {
      const result = await validator.validateCandidate(
        candidate,
        context.costTracker
      );
      results.push(result);
    } catch (error) {
      // If validation fails, create an unverified result
      results.push({
        candidateId: candidate.candidateId,
        status: 'unverified',
        validation: {
          status: 'unverified',
          notes: error instanceof Error ? error.message : 'Validation error',
        },
        durationMs: 0,
      });
    }

    // Process next item if queue not empty
    if (queue.length > 0) {
      await processNext();
    }
  }

  // Start initial batch of concurrent validations
  for (let i = 0; i < Math.min(VALIDATION_CONCURRENCY, candidates.length); i++) {
    running.push(processNext());
  }

  // Wait for all to complete
  await Promise.all(running);

  return results;
}

/**
 * Update candidate with validation result.
 *
 * @see TODO Section 15.3.5 - Update candidate validation field with status, notes, sources
 *
 * @param candidate - Original candidate
 * @param result - Validation result
 * @returns Updated candidate
 */
function updateCandidateValidation(
  candidate: Candidate,
  result: ValidationResult
): Candidate {
  return {
    ...candidate,
    validation: result.validation,
    // Update confidence based on validation result
    confidence:
      result.status === 'verified'
        ? 'verified'
        : result.status === 'partially_verified'
        ? 'verified'
        : result.status === 'conflict_detected'
        ? 'needs_verification'
        : candidate.confidence,
  };
}

// ============================================================================
// Stage Implementation
// ============================================================================

/**
 * Validate Stage (Stage 07)
 *
 * Validates YouTube-derived candidates using Perplexity cross-referencing.
 * Candidates that pass validation get their status updated; candidates that
 * fail are flagged with conflict_detected.
 *
 * Input: RankStageOutput from Stage 06 (or Candidate[] directly)
 * Output: ValidateStageOutput - all candidates with updated validation fields
 *
 * @see TODO Section 15.3 - Stage implementation
 *
 * @example
 * ```typescript
 * const result = await validateStage.execute(context, rankOutput);
 * console.log(`Validated ${result.data.stats.validatedCount} candidates`);
 * console.log(`Passed: ${result.data.stats.passedCount}`);
 * console.log(`Failed: ${result.data.stats.failedCount}`);
 * ```
 */
export const validateStage: TypedStage<RankStageOutput | Candidate[], ValidateStageOutput> = {
  id: STAGE_ID,
  name: STAGE_NAME,
  number: STAGE_NUMBER,

  async execute(
    context: StageContext,
    input: RankStageOutput | Candidate[]
  ): Promise<StageResult<ValidateStageOutput>> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    // Handle both input formats: wrapped output or raw array
    const candidates: Candidate[] = Array.isArray(input) ? input : input.candidates;

    context.logger?.info(`[validate] Processing ${candidates.length} candidates`);

    // Initialize stats
    const stats = createEmptyStats();
    stats.inputCount = candidates.length;
    stats.outputCount = candidates.length;

    // Identify YouTube candidates
    // @see TODO Section 15.3.2
    const youtubeCandidates = identifyYoutubeCandidates(candidates);
    stats.youtubeCount = youtubeCandidates.length;

    context.logger?.info(`[validate] Found ${youtubeCandidates.length} YouTube-derived candidates`);

    // Skip if no YouTube candidates present
    // @see TODO Section 15.3.6
    if (youtubeCandidates.length === 0) {
      context.logger?.info('[validate] No YouTube candidates to validate, skipping');

      stats.skippedCount = candidates.length;

      const output: ValidateStageOutput = {
        candidates,
        validationDetails: [],
        stats,
      };

      return buildStageResult(output, context, startedAt, startTime);
    }

    // Select candidates for validation
    // @see TODO Section 15.3.3
    const toValidate = selectForValidation(youtubeCandidates);
    stats.validatedCount = toValidate.length;
    stats.skippedCount = candidates.length - toValidate.length;

    context.logger?.info(`[validate] Validating ${toValidate.length} top YouTube candidates`);

    // Create validator and run validations
    const validator = new CandidateValidator();
    const validationResults = await runValidationsWithConcurrency(
      toValidate,
      validator,
      context
    );

    // Calculate stats from results
    const statusCounts = countByStatus(validationResults);
    stats.passedCount = statusCounts.passed;
    stats.failedCount = statusCounts.failed;
    stats.unverifiedCount = statusCounts.unverified;
    stats.totalValidationTimeMs = validationResults.reduce(
      (sum, r) => sum + r.durationMs,
      0
    );

    // Build validation details
    const validationDetails: ValidationDetail[] = validationResults.map((result) => {
      const candidate = candidates.find((c) => c.candidateId === result.candidateId);
      return toValidationDetail(result, candidate!);
    });

    // Create a map of validation results by candidate ID
    const resultMap = new Map<string, ValidationResult>();
    for (const result of validationResults) {
      resultMap.set(result.candidateId, result);
    }

    // Update candidates with validation results
    // @see TODO Section 15.3.5
    const updatedCandidates = candidates.map((candidate) => {
      const result = resultMap.get(candidate.candidateId);
      if (result) {
        return updateCandidateValidation(candidate, result);
      }
      return candidate;
    });

    context.logger?.info(
      `[validate] Completed: ${stats.passedCount} passed, ` +
        `${stats.failedCount} failed, ${stats.unverifiedCount} unverified`
    );

    // Log validation details at debug level
    if (context.logger?.debug) {
      for (const detail of validationDetails) {
        context.logger.debug(
          `  - ${detail.title}: ${detail.status} (${detail.durationMs}ms)`
        );
      }
    }

    const output: ValidateStageOutput = {
      candidates: updatedCandidates,
      validationDetails,
      stats,
    };

    return buildStageResult(output, context, startedAt, startTime);
  },
};

/**
 * Build the stage result with metadata and timing.
 */
function buildStageResult(
  output: ValidateStageOutput,
  context: StageContext,
  startedAt: string,
  startTime: number
): StageResult<ValidateStageOutput> {
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startTime;

  const metadata = createStageMetadata({
    stageNumber: STAGE_NUMBER,
    stageName: STAGE_NAME,
    sessionId: context.sessionId,
    runId: context.runId,
    upstreamStage: UPSTREAM_STAGE,
    config: {
      inputCount: output.stats.inputCount,
      outputCount: output.stats.outputCount,
      youtubeCount: output.stats.youtubeCount,
      validatedCount: output.stats.validatedCount,
      passedCount: output.stats.passedCount,
      failedCount: output.stats.failedCount,
    },
  });

  return {
    data: output,
    metadata,
    timing: {
      startedAt,
      completedAt,
      durationMs,
    },
  };
}

// ============================================================================
// Exports
// ============================================================================

// Export the stage as default for convenience
export default validateStage;

// Re-export types
export type {
  ValidateStageOutput,
  ValidateStageStats,
  ValidationDetail,
} from './validate/types.js';
