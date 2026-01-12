/**
 * Deduplication Stage (Stage 05)
 *
 * Deduplicates and clusters normalized candidates from Stage 04.
 * Groups similar candidates together and selects the best representative
 * from each cluster, preserving source references and metadata.
 *
 * **Checkpoint Contract**: This stage returns a `DedupeStageOutput`
 * structure containing deduplicated candidates, cluster information,
 * and statistics. The checkpoint is written to `05_candidates_deduped.json`.
 *
 * @module stages/dedupe
 * @see PRD Section 14 - Ranking, Dedupe, and Clustering
 * @see TODO Section 13.0 - Deduplication & Clustering (Stage 05)
 */

import type { Candidate } from '../schemas/candidate.js';
import type { TypedStage, StageContext, StageResult } from '../pipeline/types.js';
import { createStageMetadata } from '../schemas/stage.js';
import { formClusters } from '../dedupe/cluster.js';
import type { DedupeStageOutput } from './dedupe/types.js';
import type { NormalizedCandidatesOutput } from './normalize/checkpoint.js';

// ============================================================================
// Constants
// ============================================================================

/** Stage identifier */
const STAGE_ID = '05_candidates_deduped';
const STAGE_NAME = 'candidates_deduped' as const;
const STAGE_NUMBER = 5 as const;

/** Upstream stage identifier */
const UPSTREAM_STAGE = '04_candidates_normalized';

// ============================================================================
// Stage Implementation
// ============================================================================

/**
 * Dedupe Stage (Stage 05)
 *
 * Takes normalized candidates from Stage 04 and removes duplicates by:
 * 1. Hashing normalized title + location for exact matches
 * 2. Computing Jaccard similarity for fuzzy matching
 * 3. Clustering candidates above similarity threshold
 * 4. Selecting best representative from each cluster
 * 5. Merging source references and tags from all cluster members
 *
 * Input: NormalizedCandidatesOutput from Stage 04 (or Candidate[] directly)
 * Output: DedupeStageOutput - deduplicated candidates with cluster info
 *
 * @example
 * ```typescript
 * const result = await dedupeStage.execute(context, normalizedOutput);
 * console.log(`Reduced ${result.data.stats.originalCount} → ${result.data.stats.dedupedCount}`);
 * console.log(`Duplicates removed: ${result.data.stats.duplicatesRemoved}`);
 * ```
 */
export const dedupeStage: TypedStage<NormalizedCandidatesOutput | Candidate[], DedupeStageOutput> = {
  id: STAGE_ID,
  name: STAGE_NAME,
  number: STAGE_NUMBER,

  async execute(
    context: StageContext,
    input: NormalizedCandidatesOutput | Candidate[]
  ): Promise<StageResult<DedupeStageOutput>> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    // Handle both input formats: wrapped output or raw array
    const candidates: Candidate[] = Array.isArray(input) ? input : input.candidates;

    context.logger?.info(`[dedupe] Processing ${candidates.length} candidates`);

    // Run clustering/deduplication
    const clusterResult = formClusters(candidates);

    context.logger?.info(
      `[dedupe] Reduced ${clusterResult.stats.originalCount} → ${clusterResult.stats.dedupedCount} candidates ` +
        `(${clusterResult.stats.duplicatesRemoved} duplicates removed, ${clusterResult.stats.clusterCount} clusters)`
    );

    // Log cluster details at debug level
    if (context.logger?.debug) {
      const multiMemberClusters = clusterResult.clusters.filter((c) => c.memberCount > 1);
      if (multiMemberClusters.length > 0) {
        context.logger.debug(
          `[dedupe] ${multiMemberClusters.length} clusters with multiple members:`
        );
        for (const cluster of multiMemberClusters.slice(0, 5)) {
          const origins = [
            cluster.representative.origin,
            ...cluster.alternates.map((a) => a.origin),
          ].join(', ');
          context.logger.debug(
            `  - ${cluster.clusterId}: ${cluster.memberCount} members, ` +
              `origins=[${origins}]`
          );
        }
        if (multiMemberClusters.length > 5) {
          context.logger.debug(`  ... and ${multiMemberClusters.length - 5} more`);
        }
      }
    }

    // Build stage output
    const output: DedupeStageOutput = {
      candidates: clusterResult.dedupedCandidates,
      clusters: clusterResult.clusters,
      stats: clusterResult.stats,
    };

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    // Create stage metadata
    const metadata = createStageMetadata({
      stageNumber: STAGE_NUMBER,
      stageName: STAGE_NAME,
      sessionId: context.sessionId,
      runId: context.runId,
      upstreamStage: UPSTREAM_STAGE,
      config: {
        originalCount: clusterResult.stats.originalCount,
        dedupedCount: clusterResult.stats.dedupedCount,
        duplicatesRemoved: clusterResult.stats.duplicatesRemoved,
        clusterCount: clusterResult.stats.clusterCount,
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
export default dedupeStage;

// Re-export types
export type { DedupeStageOutput } from './dedupe/types.js';
export type { ClusterInfo, ClusterResult } from './dedupe/types.js';
