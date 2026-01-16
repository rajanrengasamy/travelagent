/**
 * Aggregator Stage (Stage 09)
 *
 * Takes top candidates from Stage 08 and generates a narrative summary
 * using GPT. Supports degraded mode when narrative generation fails.
 *
 * **Checkpoint Contract**: This stage returns an `AggregatorOutput`
 * structure containing the candidates and generated narrative.
 * The checkpoint is written to `09_aggregator_output.json`.
 *
 * @module stages/aggregate
 * @see PRD Section 14.5 - Aggregator
 * @see TODO Section 17.4 - Stage implementation
 */

import type { Candidate } from '../schemas/candidate.js';
import type { TypedStage, StageContext, StageResult } from '../pipeline/types.js';
import { createStageMetadata } from '../schemas/stage.js';
import { runAggregator } from '../aggregator/aggregator.js';
import type { TopCandidatesStageOutput } from './top-candidates/types.js';
import type { AggregatorOutput } from './aggregate/types.js';

// ============================================================================
// Constants
// ============================================================================

/** Stage identifier */
const STAGE_ID = '09_aggregator_output';
const STAGE_NAME = 'aggregator_output' as const;
const STAGE_NUMBER = 9 as const;

/** Upstream stage identifier */
const UPSTREAM_STAGE = '08_top_candidates';

// ============================================================================
// Stage Implementation
// ============================================================================

/**
 * Aggregate Stage (Stage 09)
 *
 * Generates a narrative summary from the top candidates selected in Stage 08.
 * Uses GPT to create engaging travel content with sections, highlights,
 * and recommendations.
 *
 * Input: TopCandidatesStageOutput from Stage 08 (or Candidate[] directly)
 * Output: AggregatorOutput - candidates with narrative (or degraded output)
 *
 * @see TODO Section 17.4.1 - Implement aggregateStage
 * @see TODO Section 17.4.2 - Write checkpoint to 09_aggregator_output.json
 *
 * @example
 * ```typescript
 * const result = await aggregateStage.execute(context, topCandidatesOutput);
 * if (result.data.narrative) {
 *   console.log(`Generated ${result.data.narrative.sections.length} sections`);
 * } else {
 *   console.log('Using degraded mode (no narrative)');
 * }
 * ```
 */
export const aggregateStage: TypedStage<TopCandidatesStageOutput | Candidate[], AggregatorOutput> = {
  id: STAGE_ID,
  name: STAGE_NAME,
  number: STAGE_NUMBER,

  async execute(
    context: StageContext,
    input: TopCandidatesStageOutput | Candidate[]
  ): Promise<StageResult<AggregatorOutput>> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    // Handle both input formats: wrapped output or raw array
    const candidates: Candidate[] = Array.isArray(input) ? input : input.candidates;

    context.logger?.info(`[aggregate] Processing ${candidates.length} candidates`);

    // Run the aggregator
    const output = await runAggregator(candidates, {
      sessionId: context.sessionId,
      costTracker: context.costTracker,
      logger: context.logger,
    });

    // Log results
    if (output.narrative) {
      context.logger?.info(
        `[aggregate] Generated narrative: ${output.stats.sectionCount} sections, ` +
          `${output.stats.highlightCount} highlights, ` +
          `${output.stats.recommendationCount} recommendations`
      );
    } else {
      context.logger?.info('[aggregate] Using degraded mode (no narrative generated)');
    }

    // Log token usage if available
    if (output.stats.tokenUsage && context.logger?.debug) {
      context.logger.debug(
        `  Token usage: ${output.stats.tokenUsage.input} input, ` +
          `${output.stats.tokenUsage.output} output`
      );
    }

    return buildStageResult(output, context, startedAt, startTime);
  },
};

/**
 * Build the stage result with metadata and timing.
 */
function buildStageResult(
  output: AggregatorOutput,
  context: StageContext,
  startedAt: string,
  startTime: number
): StageResult<AggregatorOutput> {
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
      includedCount: output.stats.includedCount,
      sectionCount: output.stats.sectionCount,
      highlightCount: output.stats.highlightCount,
      recommendationCount: output.stats.recommendationCount,
      narrativeGenerated: output.stats.narrativeGenerated,
      aggregatorDurationMs: output.stats.durationMs,
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
export default aggregateStage;

// Re-export types
export type {
  AggregatorOutput,
  AggregatorStats,
  NarrativeOutput,
  NarrativeSection,
  Highlight,
  Recommendation,
} from './aggregate/types.js';
