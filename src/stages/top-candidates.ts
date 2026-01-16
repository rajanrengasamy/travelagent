/**
 * Top Candidates Selection Stage (Stage 08)
 *
 * Selects the top N candidates from the validated candidate list while
 * enforcing diversity constraints. This is the key resume point for
 * aggregator testing.
 *
 * **Checkpoint Contract**: This stage returns a `TopCandidatesStageOutput`
 * structure containing the selected top candidates and statistics.
 * The checkpoint is written to `08_top_candidates.json`.
 *
 * @module stages/top-candidates
 * @see PRD Section 14.3 - Diversity Constraints
 * @see TODO Section 16.0 - Top Candidates Selection (Stage 08)
 */

import type { Candidate } from '../schemas/candidate.js';
import type { TypedStage, StageContext, StageResult } from '../pipeline/types.js';
import { createStageMetadata } from '../schemas/stage.js';
import { enforceDiversityConstraints, extractDestination } from '../ranking/diversity.js';
import type { ValidateStageOutput } from './validate/types.js';
import {
  type TopCandidatesStageOutput,
  DEFAULT_TOP_N,
  createEmptyTopCandidatesStats,
  countCandidatesByType,
  countCandidatesByDestination,
  calculateScoreStats,
} from './top-candidates/types.js';

// ============================================================================
// Constants
// ============================================================================

/** Stage identifier */
const STAGE_ID = '08_top_candidates';
const STAGE_NAME = 'top_candidates' as const;
const STAGE_NUMBER = 8 as const;

/** Upstream stage identifier */
const UPSTREAM_STAGE = '07_candidates_validated';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the topN value from context config or use default.
 *
 * @see TODO Section 16.1.2 - Select top N candidates (default 30, configurable)
 *
 * @param context - Stage context
 * @returns The topN value to use
 */
function getTopN(context: StageContext): number {
  // Check if config has a maxTopCandidates limit
  const configTopN = context.config?.limits?.maxTopCandidates;
  if (typeof configTopN === 'number' && configTopN > 0) {
    return configTopN;
  }
  return DEFAULT_TOP_N;
}

/**
 * Select top N candidates with diversity constraints.
 *
 * Algorithm:
 * 1. Sort candidates by score descending (should already be sorted from rank stage)
 * 2. Apply diversity constraints using enforceDiversityConstraints
 * 3. Take top N from the reordered list
 *
 * @see TODO Section 16.1.1 - Implement topCandidatesStage
 * @see TODO Section 16.1.3 - Enforce diversity constraints during selection
 *
 * @param candidates - Validated candidates sorted by score
 * @param topN - Number of candidates to select
 * @returns Object with selected candidates and deferred count
 */
function selectTopCandidates(
  candidates: Candidate[],
  topN: number
): { selected: Candidate[]; deferredCount: number } {
  if (candidates.length === 0) {
    return { selected: [], deferredCount: 0 };
  }

  // Ensure candidates are sorted by score descending
  const sortedCandidates = [...candidates].sort((a, b) => b.score - a.score);

  // Apply diversity constraints (reorders list to enforce type/geo limits in top 20)
  const diversified = enforceDiversityConstraints(sortedCandidates);

  // Calculate how many were deferred (positions changed)
  // Count candidates whose final position is different from original
  let deferredCount = 0;
  const originalOrder = new Map(sortedCandidates.map((c, i) => [c.candidateId, i]));
  for (let i = 0; i < Math.min(20, diversified.length); i++) {
    const originalPos = originalOrder.get(diversified[i].candidateId);
    if (originalPos !== undefined && originalPos !== i) {
      deferredCount++;
    }
  }

  // Select top N
  const selected = diversified.slice(0, topN);

  return { selected, deferredCount };
}

// ============================================================================
// Stage Implementation
// ============================================================================

/**
 * Top Candidates Stage (Stage 08)
 *
 * Selects the top N candidates with diversity enforcement for the aggregator.
 * This is the key resume point for testing the aggregator stage in isolation.
 *
 * Input: ValidateStageOutput from Stage 07 (or Candidate[] directly)
 * Output: TopCandidatesStageOutput - top N candidates with statistics
 *
 * @see TODO Section 16.1 - Stage implementation
 *
 * @example
 * ```typescript
 * const result = await topCandidatesStage.execute(context, validateOutput);
 * console.log(`Selected ${result.data.stats.outputCount} of ${result.data.stats.inputCount} candidates`);
 * console.log(`By type: ${JSON.stringify(result.data.stats.byType)}`);
 * ```
 */
export const topCandidatesStage: TypedStage<ValidateStageOutput | Candidate[], TopCandidatesStageOutput> = {
  id: STAGE_ID,
  name: STAGE_NAME,
  number: STAGE_NUMBER,

  async execute(
    context: StageContext,
    input: ValidateStageOutput | Candidate[]
  ): Promise<StageResult<TopCandidatesStageOutput>> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    // Handle both input formats: wrapped output or raw array
    const candidates: Candidate[] = Array.isArray(input) ? input : input.candidates;

    // Get topN from config or default
    const topN = getTopN(context);

    context.logger?.info(`[top-candidates] Processing ${candidates.length} candidates, selecting top ${topN}`);

    // Initialize stats
    const stats = createEmptyTopCandidatesStats(topN);
    stats.inputCount = candidates.length;

    // Handle empty input
    if (candidates.length === 0) {
      context.logger?.info('[top-candidates] No candidates to select');

      const output: TopCandidatesStageOutput = {
        candidates: [],
        stats,
      };

      return buildStageResult(output, context, startedAt, startTime);
    }

    // Select top candidates with diversity constraints
    // @see TODO Section 16.1.3
    const { selected, deferredCount } = selectTopCandidates(candidates, topN);

    // Update stats
    stats.outputCount = selected.length;
    stats.deferredCount = deferredCount;
    stats.byType = countCandidatesByType(selected);
    stats.byDestination = countCandidatesByDestination(selected, extractDestination);

    // Calculate score statistics
    const scoreStats = calculateScoreStats(selected);
    stats.averageScore = scoreStats.average;
    stats.minScore = scoreStats.min;
    stats.maxScore = scoreStats.max;

    context.logger?.info(
      `[top-candidates] Selected ${selected.length} candidates ` +
        `(avg score: ${stats.averageScore}, range: ${stats.minScore}-${stats.maxScore})`
    );

    // Log type distribution at debug level
    if (context.logger?.debug) {
      const typeBreakdown = Object.entries(stats.byType)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ');
      context.logger.debug(`  Type distribution: ${typeBreakdown}`);

      const destBreakdown = Object.entries(stats.byDestination)
        .slice(0, 5) // Top 5 destinations
        .map(([dest, count]) => `${dest}: ${count}`)
        .join(', ');
      if (destBreakdown) {
        context.logger.debug(`  Top destinations: ${destBreakdown}`);
      }
    }

    const output: TopCandidatesStageOutput = {
      candidates: selected,
      stats,
    };

    return buildStageResult(output, context, startedAt, startTime);
  },
};

/**
 * Build the stage result with metadata and timing.
 */
function buildStageResult(
  output: TopCandidatesStageOutput,
  context: StageContext,
  startedAt: string,
  startTime: number
): StageResult<TopCandidatesStageOutput> {
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
      topN: output.stats.topN,
      averageScore: output.stats.averageScore,
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
export default topCandidatesStage;

// Re-export types
export type {
  TopCandidatesStageOutput,
  TopCandidatesStageStats,
} from './top-candidates/types.js';

export { DEFAULT_TOP_N } from './top-candidates/types.js';
