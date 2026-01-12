/**
 * Dedupe Stage Checkpoint
 *
 * Writes the deduplication stage checkpoint (05_candidates_deduped.json).
 * Records deduplicated candidates and cluster information.
 *
 * @module stages/dedupe/checkpoint
 * @see PRD Section 14 - Ranking, Dedupe, and Clustering
 * @see TODO Section 13.0 - Deduplication & Clustering (Stage 05)
 */

import type { StageContext } from '../../pipeline/types.js';
import { writeCheckpoint, type CheckpointResult } from '../../pipeline/checkpoint.js';
import type { DedupeStageOutput, ClusterInfo } from './types.js';
import type { Candidate } from '../../schemas/candidate.js';

// ============================================================================
// Constants
// ============================================================================

/** Stage number for deduplication */
const STAGE_NUMBER = 5;

/** Stage name for deduplication */
const STAGE_NAME = 'candidates_deduped';

/** Upstream stage ID */
const UPSTREAM_STAGE = '04_candidates_normalized';

// ============================================================================
// Checkpoint Writing
// ============================================================================

/**
 * Write the deduplication stage checkpoint.
 *
 * Creates checkpoint file at 05_candidates_deduped.json containing:
 * - Deduplicated candidates (one representative per cluster)
 * - Cluster information showing how candidates were grouped
 * - Statistics about the deduplication process
 *
 * @param context - Pipeline stage context with session/run IDs
 * @param candidates - Deduplicated candidates
 * @param clusters - Cluster information
 * @param stats - Deduplication statistics
 * @returns CheckpointResult with file path and metadata
 *
 * @example
 * ```typescript
 * const result = await writeDedupeCheckpoint(
 *   context,
 *   dedupedCandidates,
 *   clusterInfos,
 *   { originalCount: 50, clusterCount: 35, dedupedCount: 35, duplicatesRemoved: 15 }
 * );
 * ```
 */
export async function writeDedupeCheckpoint(
  context: StageContext,
  candidates: Candidate[],
  clusters: ClusterInfo[],
  stats: DedupeStageOutput['stats']
): Promise<CheckpointResult> {
  const output: DedupeStageOutput = {
    candidates,
    clusters,
    stats,
  };

  return writeCheckpoint(
    context.sessionId,
    context.runId,
    STAGE_NUMBER,
    STAGE_NAME,
    output,
    {
      upstreamStage: UPSTREAM_STAGE,
      config: {
        originalCount: stats.originalCount,
        dedupedCount: stats.dedupedCount,
        duplicatesRemoved: stats.duplicatesRemoved,
        clusterCount: stats.clusterCount,
      },
    }
  );
}
