/**
 * Normalization Stage (Stage 04)
 *
 * Normalizes worker outputs into a unified candidate array.
 * Each worker's output is processed in parallel with timeout handling.
 * Failed normalizations are logged but don't fail the entire stage.
 *
 * **Checkpoint Contract**: This stage returns a `NormalizedCandidatesOutput`
 * structure containing both the candidates array and statistics. The pipeline
 * executor automatically writes this to `04_candidates_normalized.json` via
 * the `writeCheckpoint` function after stage execution completes.
 *
 * @module stages/normalize
 * @see PRD Section 14 (FR2 Stage 04) - Normalization Stage
 * @see TODO Section 12.0 - Normalization Stage (Stage 04)
 */

import type { WorkerOutput } from '../schemas/worker.js';
import type { Candidate } from '../schemas/candidate.js';
import { CandidateSchema } from '../schemas/candidate.js';
import type { TypedStage, StageContext, StageResult } from '../pipeline/types.js';
import { createStageMetadata } from '../schemas/stage.js';
import type { NormalizedCandidatesOutput } from './normalize/checkpoint.js';
import { generateCandidateId, ensureUniqueIds } from './normalize/id-generator.js';
import { getNormalizerForWorker } from './normalize/normalizers.js';

// ============================================================================
// Constants
// ============================================================================

/** Timeout for normalizing a single worker's output (ms) */
const NORMALIZATION_TIMEOUT_MS = 10000;

/** Stage identifier */
const STAGE_ID = '04_candidates_normalized';
const STAGE_NAME = 'candidates_normalized' as const;
const STAGE_NUMBER = 4 as const;

// ============================================================================
// Timeout Helper
// ============================================================================

/**
 * Execute a function with a timeout.
 * Returns undefined if the operation times out (graceful degradation).
 *
 * @param fn - Async function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Name for logging
 * @param logger - Optional logger for timeout messages
 * @returns Function result or undefined on timeout
 */
async function withNormalizationTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  operationName: string,
  logger?: StageContext['logger']
): Promise<T | undefined> {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<undefined>((resolve) => {
    timeoutId = setTimeout(() => {
      logger?.warn(`Normalization timeout: ${operationName} exceeded ${timeoutMs}ms`);
      resolve(undefined);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    return result;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}


// ============================================================================
// Normalization Result Type
// ============================================================================

/**
 * Result from normalizing a single worker's output.
 */
interface WorkerNormalizationResult {
  workerId: string;
  candidates: Candidate[];
  success: boolean;
  error?: string;
  durationMs: number;
}

// ============================================================================
// Core Normalization Logic
// ============================================================================

/**
 * Normalize a single worker's output with timeout handling.
 *
 * Uses the stable ID generator from id-generator.ts and per-worker
 * normalizers from normalizers.ts for proper normalization.
 *
 * @param output - Worker output to normalize
 * @param logger - Optional logger for error messages
 * @returns Normalization result
 */
async function normalizeWorkerOutput(
  output: WorkerOutput,
  logger?: StageContext['logger']
): Promise<WorkerNormalizationResult> {
  const startTime = Date.now();
  const workerId = output.workerId;

  // Propagate worker-level errors to the normalization result
  // This ensures stats.errors tracks both worker failures and normalization failures
  if (output.status === 'error') {
    return {
      workerId,
      candidates: [],
      success: true, // Normalization itself succeeded (no candidates to process)
      error: output.error ?? 'Worker returned error status',
      durationMs: Date.now() - startTime,
    };
  }

  try {
    // Get the appropriate normalizer for this worker type
    const normalizer = getNormalizerForWorker(workerId);

    const candidates = await withNormalizationTimeout(
      async () => {
        // First, run the worker-specific normalizer
        const normalized = normalizer(output);

        // Then, assign stable candidate IDs using SHA-256 hash
        return normalized.map((candidate) => ({
          ...candidate,
          candidateId: candidate.candidateId || generateCandidateId(
            candidate.title,
            candidate.locationText,
            candidate.origin
          ),
        }));
      },
      NORMALIZATION_TIMEOUT_MS,
      `Worker ${workerId}`,
      logger
    );

    if (candidates === undefined) {
      // Timeout occurred
      return {
        workerId,
        candidates: [],
        success: false,
        error: `Normalization timed out after ${NORMALIZATION_TIMEOUT_MS}ms`,
        durationMs: Date.now() - startTime,
      };
    }

    // Validate each candidate against schema
    const validatedCandidates: Candidate[] = [];
    for (const candidate of candidates) {
      const parseResult = CandidateSchema.safeParse(candidate);
      if (parseResult.success) {
        validatedCandidates.push(parseResult.data);
      } else {
        logger?.warn(
          `Invalid candidate from ${workerId}: ${parseResult.error.message}`,
          { candidateId: candidate.candidateId }
        );
      }
    }

    return {
      workerId,
      candidates: validatedCandidates,
      success: true,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger?.error(`Failed to normalize ${workerId} output: ${errorMessage}`);

    return {
      workerId,
      candidates: [],
      success: false,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Normalize all worker outputs in parallel.
 *
 * Uses Promise.allSettled for parallel processing with failure isolation.
 * Each worker's normalization runs independently - one failure doesn't stop others.
 * After all workers are processed, ensures unique IDs across the merged candidates.
 *
 * @param workerOutputs - Array of worker outputs from Stage 03
 * @param logger - Optional logger
 * @returns Merged array of all normalized candidates with unique IDs
 */
async function normalizeAllWorkers(
  workerOutputs: WorkerOutput[],
  logger?: StageContext['logger']
): Promise<{
  candidates: Candidate[];
  results: WorkerNormalizationResult[];
}> {
  // Process all workers in parallel
  const results = await Promise.allSettled(
    workerOutputs.map((output) => normalizeWorkerOutput(output, logger))
  );

  const normalizationResults: WorkerNormalizationResult[] = [];
  const allCandidates: Candidate[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];

    if (result.status === 'fulfilled') {
      normalizationResults.push(result.value);
      allCandidates.push(...result.value.candidates);
    } else {
      // This shouldn't happen since normalizeWorkerOutput catches all errors
      const workerId = workerOutputs[i]?.workerId ?? 'unknown';
      const errorMessage = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);

      logger?.error(`Unexpected error normalizing ${workerId}: ${errorMessage}`);

      normalizationResults.push({
        workerId,
        candidates: [],
        success: false,
        error: errorMessage,
        durationMs: 0,
      });
    }
  }

  // Ensure unique IDs across all candidates (handles hash collisions)
  const uniqueCandidates = ensureUniqueIds(allCandidates);

  return { candidates: uniqueCandidates, results: normalizationResults };
}

// ============================================================================
// Stage Implementation
// ============================================================================

/**
 * Count candidates by a specific field value.
 * Used to group candidates by origin or other categorical fields.
 */
function countByField<K extends keyof Candidate>(
  candidates: Candidate[],
  field: K
): Record<string, number> {
  return candidates.reduce(
    (acc, candidate) => {
      const key = String(candidate[field]);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
}

/**
 * Normalize Stage (Stage 04)
 *
 * Takes worker outputs from Stage 03 and normalizes them into a unified
 * candidate array. Each worker's output is processed in parallel with
 * timeout handling. Failed normalizations are logged but don't fail
 * the entire stage (graceful degradation).
 *
 * **Checkpoint Contract**: The pipeline executor calls `writeCheckpoint()`
 * after this stage completes, writing `result.data` (NormalizedCandidatesOutput)
 * to `04_candidates_normalized.json`. This stage returns an enriched structure
 * with both candidates and statistics - no separate checkpoint call is needed.
 *
 * Input: WorkerOutput[] from Stage 03 (worker_outputs)
 * Output: NormalizedCandidatesOutput - candidates array with statistics
 *
 * @example
 * ```typescript
 * const result = await normalizeStage.execute(context, workerOutputs);
 * console.log(`Normalized ${result.data.candidates.length} candidates`);
 * console.log(`By origin:`, result.data.stats.byOrigin);
 * ```
 */
export const normalizeStage: TypedStage<WorkerOutput[], NormalizedCandidatesOutput> = {
  id: STAGE_ID,
  name: STAGE_NAME,
  number: STAGE_NUMBER,

  async execute(
    context: StageContext,
    input: WorkerOutput[]
  ): Promise<StageResult<NormalizedCandidatesOutput>> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    context.logger?.info(`Starting normalization stage with ${input.length} worker outputs`);

    // Normalize all worker outputs in parallel
    const { candidates, results } = await normalizeAllWorkers(input, context.logger);

    // Log summary
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    context.logger?.info(
      `Normalization complete: ${successCount}/${results.length} workers succeeded, ` +
        `${candidates.length} total candidates`
    );

    if (failCount > 0) {
      const failedWorkers = results
        .filter((r) => !r.success)
        .map((r) => `${r.workerId}: ${r.error}`)
        .join(', ');
      context.logger?.warn(`Failed normalizations: ${failedWorkers}`);
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    // Build enriched output with statistics for checkpoint
    // This structure is written to 04_candidates_normalized.json by the executor
    const output: NormalizedCandidatesOutput = {
      candidates,
      stats: {
        totalCandidates: candidates.length,
        byOrigin: countByField(candidates, 'origin'),
        byWorker: Object.fromEntries(results.map((r) => [r.workerId, r.candidates.length])),
        skippedWorkers: results.filter((r) => r.candidates.length === 0 && !r.error).map((r) => r.workerId),
        errors: results.filter((r) => r.error).map((r) => `${r.workerId}: ${r.error}`),
      },
    };

    // Create stage metadata
    const metadata = createStageMetadata({
      stageNumber: STAGE_NUMBER,
      stageName: STAGE_NAME,
      sessionId: context.sessionId,
      runId: context.runId,
      upstreamStage: '03_worker_outputs',
      config: {
        timeoutMs: NORMALIZATION_TIMEOUT_MS,
        workerCount: input.length,
        successCount,
        failCount,
        candidateCount: candidates.length,
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
  },
};

// ============================================================================
// Exports
// ============================================================================

// Export the stage as default for convenience
export default normalizeStage;

// Export individual functions for testing and reuse
export {
  normalizeWorkerOutput,
  normalizeAllWorkers,
  NORMALIZATION_TIMEOUT_MS,
};

// Re-export from sub-modules for convenience
export { generateCandidateId, ensureUniqueIds } from './normalize/id-generator.js';
export {
  normalizePerplexityOutput,
  normalizePlacesOutput,
  normalizeYouTubeOutput,
  getNormalizerForWorker,
} from './normalize/normalizers.js';

// Export types
export type { WorkerNormalizationResult };
export type { NormalizedCandidatesOutput };
