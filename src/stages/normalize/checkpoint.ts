/**
 * Normalize Stage Checkpoint
 *
 * Writes the normalization stage checkpoint (04_candidates_normalized.json).
 * Collects candidates from all workers and records stats about the output.
 *
 * @module stages/normalize/checkpoint
 * @see PRD Section 12.0 - Normalization Stage
 */

import type { StageContext } from '../../pipeline/types.js';
import type { Candidate } from '../../schemas/candidate.js';
import { writeCheckpoint, type CheckpointResult } from '../../pipeline/checkpoint.js';
import type { WorkerNormalizationResult } from '../normalize.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Statistics about a worker's contribution to normalization.
 * Simplified view of worker results for checkpoint storage.
 */
export interface WorkerStats {
  /** Worker identifier (e.g., 'perplexity', 'google_places', 'youtube') */
  workerId: string;
  /** Number of candidates produced by this worker */
  count: number;
  /** Error message if worker failed */
  error?: string;
}

/**
 * Convert WorkerNormalizationResult array to WorkerStats array.
 *
 * This bridges the gap between the detailed normalization results
 * produced by the stage execution and the simplified stats stored
 * in the checkpoint file.
 *
 * @param results - Normalization results from normalizeAllWorkers()
 * @returns Simplified worker stats for checkpoint storage
 *
 * @example
 * ```typescript
 * const { results } = await normalizeAllWorkers(workerOutputs, logger);
 * const stats = toWorkerStats(results);
 * await writeNormalizeCheckpoint(context, candidates, stats);
 * ```
 */
export function toWorkerStats(results: WorkerNormalizationResult[]): WorkerStats[] {
  return results.map((r) => ({
    workerId: r.workerId,
    count: r.candidates.length,
    error: r.success ? undefined : r.error,
  }));
}

/**
 * Output structure for the normalize stage checkpoint
 */
export interface NormalizedCandidatesOutput {
  /** All normalized candidates from all workers */
  candidates: Candidate[];
  /** Statistics about the normalization process */
  stats: {
    /** Total number of candidates produced */
    totalCandidates: number;
    /** Candidate counts by origin (web, social, places) */
    byOrigin: Record<string, number>;
    /** Candidate counts by worker ID */
    byWorker: Record<string, number>;
    /** Workers that produced zero candidates (but no error) */
    skippedWorkers: string[];
    /** Error messages from workers that failed */
    errors: string[];
  };
}

// ============================================================================
// Helper Functions
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

// ============================================================================
// Checkpoint Writing
// ============================================================================

/**
 * Write the normalization stage checkpoint.
 *
 * Creates checkpoint file at 04_candidates_normalized.json containing:
 * - All normalized candidates from workers
 * - Statistics about candidate sources and counts
 * - Any errors encountered during normalization
 *
 * @param context - Pipeline stage context with session/run IDs
 * @param candidates - Normalized candidates from all workers
 * @param workerStats - Statistics from each worker
 * @returns CheckpointResult with file path and metadata
 *
 * @example
 * ```typescript
 * const result = await writeNormalizeCheckpoint(
 *   context,
 *   normalizedCandidates,
 *   [
 *     { workerId: 'perplexity', count: 15 },
 *     { workerId: 'google_places', count: 10 },
 *     { workerId: 'youtube', count: 5, error: 'Rate limited' },
 *   ]
 * );
 * ```
 */
export async function writeNormalizeCheckpoint(
  context: StageContext,
  candidates: Candidate[],
  workerStats: WorkerStats[]
): Promise<CheckpointResult> {
  // Build output with stats
  const output: NormalizedCandidatesOutput = {
    candidates,
    stats: {
      totalCandidates: candidates.length,
      byOrigin: countByField(candidates, 'origin'),
      byWorker: Object.fromEntries(workerStats.map((w) => [w.workerId, w.count])),
      skippedWorkers: workerStats.filter((w) => w.count === 0 && !w.error).map((w) => w.workerId),
      errors: workerStats.filter((w) => w.error).map((w) => `${w.workerId}: ${w.error}`),
    },
  };

  // Write checkpoint using pipeline infrastructure
  return writeCheckpoint(
    context.sessionId,
    context.runId,
    4, // Stage 04
    'candidates_normalized',
    output,
    { upstreamStage: '03_worker_outputs' }
  );
}
