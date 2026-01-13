/**
 * Ranking Stage (Stage 06)
 *
 * Ranks deduplicated candidates from Stage 05 using multi-dimensional scoring.
 * Candidates are scored on relevance, credibility, recency, and diversity,
 * then sorted by overall score descending.
 *
 * **Checkpoint Contract**: This stage returns a `RankStageOutput`
 * structure containing ranked candidates and statistics.
 * The checkpoint is written to `06_candidates_ranked.json`.
 *
 * @module stages/rank
 * @see PRD Section 14 - Ranking, Dedupe, and Clustering
 * @see TODO Section 14.5 - Rank stage implementation
 */

import type { Candidate } from '../schemas/candidate.js';
import type { EnrichedIntent } from '../schemas/worker.js';
import type { TypedStage, StageContext, StageResult } from '../pipeline/types.js';
import { createStageMetadata } from '../schemas/stage.js';
import { rankCandidates } from '../ranking/scorer.js';
import type { DedupeStageOutput } from './dedupe/types.js';
import {
  type RankStageOutput,
  calculateScoreDistribution,
  calculateAverageScore,
} from './rank/types.js';

// ============================================================================
// Constants
// ============================================================================

/** Stage identifier */
const STAGE_ID = '06_candidates_ranked';
const STAGE_NAME = 'candidates_ranked' as const;
const STAGE_NUMBER = 6 as const;

/** Upstream stage identifier */
const UPSTREAM_STAGE = '05_candidates_deduped';

// ============================================================================
// Default Enriched Intent
// ============================================================================

/**
 * Create a minimal default enriched intent when none is available.
 * This allows the stage to function even without router output.
 */
function createDefaultEnrichedIntent(): EnrichedIntent {
  const today = new Date().toISOString().split('T')[0];

  return {
    destinations: [],
    dateRange: {
      start: today,
      end: today,
    },
    flexibility: { type: 'none' },
    interests: [],
    constraints: {},
    inferredTags: [],
  };
}

// ============================================================================
// Stage Implementation
// ============================================================================

/**
 * Rank Stage (Stage 06)
 *
 * Takes deduplicated candidates from Stage 05 and ranks them by:
 * 1. Calculating multi-dimensional scores (relevance, credibility, recency, diversity)
 * 2. Applying weighted scoring formula
 * 3. Sorting by overall score descending
 * 4. Computing statistics about score distribution
 *
 * Input: DedupeStageOutput from Stage 05 (or Candidate[] directly)
 * Output: RankStageOutput - ranked candidates with stats
 *
 * @example
 * ```typescript
 * const result = await rankStage.execute(context, dedupeOutput);
 * console.log(`Ranked ${result.data.stats.inputCount} candidates`);
 * console.log(`Average score: ${result.data.stats.averageScore}`);
 * console.log(`High quality: ${result.data.stats.scoreDistribution.high}`);
 * ```
 */
export const rankStage: TypedStage<DedupeStageOutput | Candidate[], RankStageOutput> = {
  id: STAGE_ID,
  name: STAGE_NAME,
  number: STAGE_NUMBER,

  async execute(
    context: StageContext,
    input: DedupeStageOutput | Candidate[]
  ): Promise<StageResult<RankStageOutput>> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    // Handle both input formats: wrapped output or raw array
    const candidates: Candidate[] = Array.isArray(input) ? input : input.candidates;

    context.logger?.info(`[rank] Processing ${candidates.length} candidates`);

    // Get enriched intent from context config or use defaults
    // The enrichedIntent might be stored in config from the router stage
    const enrichedIntent: EnrichedIntent =
      (context.config as Record<string, unknown>).enrichedIntent as EnrichedIntent |
      undefined ?? createDefaultEnrichedIntent();

    // Score and rank all candidates
    const rankedCandidates = rankCandidates(candidates, enrichedIntent);

    // Calculate statistics
    const scoreDistribution = calculateScoreDistribution(rankedCandidates);
    const averageScore = calculateAverageScore(rankedCandidates);

    context.logger?.info(
      `[rank] Ranked ${rankedCandidates.length} candidates, ` +
        `avg score: ${averageScore.toFixed(1)}, ` +
        `distribution: high=${scoreDistribution.high}, medium=${scoreDistribution.medium}, low=${scoreDistribution.low}`
    );

    // Log top candidates at debug level
    if (context.logger?.debug && rankedCandidates.length > 0) {
      context.logger.debug('[rank] Top 5 candidates:');
      for (const candidate of rankedCandidates.slice(0, 5)) {
        context.logger.debug(
          `  - [${candidate.score}] ${candidate.title} (${candidate.origin})`
        );
      }
    }

    // Build stage output
    const output: RankStageOutput = {
      candidates: rankedCandidates,
      stats: {
        inputCount: candidates.length,
        outputCount: rankedCandidates.length,
        averageScore,
        scoreDistribution,
      },
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
        inputCount: candidates.length,
        outputCount: rankedCandidates.length,
        averageScore,
        scoreDistribution,
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
export default rankStage;

// Re-export types
export type { RankStageOutput, RankStageStats, ScoreDistribution } from './rank/types.js';
