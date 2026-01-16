/**
 * Aggregator
 *
 * Main aggregator logic that orchestrates narrative generation
 * from validated candidates. Includes degraded mode support.
 *
 * @module aggregator/aggregator
 * @see PRD Section 14.5 - Aggregator
 * @see TODO Section 17.3 - Aggregator main logic
 */

import type { Candidate } from '../schemas/candidate.js';
import type { CostTracker } from '../pipeline/types.js';
import { generateNarrative, type SessionContext } from './narrative.js';
import {
  type AggregatorOutput,
  type AggregatorStats,
  createDegradedOutput,
} from './types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Context for the aggregator run.
 */
export interface AggregatorContext {
  /** Session identifier */
  sessionId: string;
  /** Optional session context for personalization */
  session?: SessionContext;
  /** Cost tracker for token usage */
  costTracker?: CostTracker;
  /** Logger for debug output */
  logger?: {
    info(msg: string): void;
    debug?(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
  };
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Run the aggregator on a set of candidates.
 *
 * This is the main entry point for the aggregator. It:
 * 1. Validates input
 * 2. Calls GPT to generate a narrative
 * 3. Returns results or falls back to degraded mode on failure
 *
 * @see TODO Section 17.3.1 - Implement runAggregator
 * @see TODO Section 17.3.3 - Implement 20-second timeout (handled in client)
 * @see TODO Section 17.3.4 - Implement degraded mode
 * @see TODO Section 17.3.5 - Track token usage
 *
 * @param candidates - Validated and ranked candidates from top-candidates stage
 * @param context - Aggregator context with session info and utilities
 * @returns Aggregator output with narrative or degraded output
 */
export async function runAggregator(
  candidates: Candidate[],
  context: AggregatorContext
): Promise<AggregatorOutput> {
  const startTime = Date.now();

  context.logger?.info(
    `[aggregator] Processing ${candidates.length} candidates`
  );

  // Handle empty input
  if (candidates.length === 0) {
    context.logger?.info('[aggregator] No candidates to aggregate');
    return createDegradedOutput([], Date.now() - startTime);
  }

  // Attempt narrative generation
  const result = await generateNarrative(
    candidates,
    context.session,
    context.costTracker
  );

  // Check if narrative generation succeeded
  if (result.narrative) {
    context.logger?.info(
      `[aggregator] Generated narrative with ${result.narrative.sections.length} sections, ` +
        `${result.narrative.highlights.length} highlights`
    );

    // Build successful output
    const stats: AggregatorStats = {
      inputCount: candidates.length,
      includedCount: countIncludedCandidates(result.narrative, candidates),
      sectionCount: result.narrative.sections.length,
      highlightCount: result.narrative.highlights.length,
      recommendationCount: result.narrative.recommendations.length,
      narrativeGenerated: true,
      tokenUsage: result.tokenUsage,
      durationMs: result.durationMs,
    };

    return {
      candidates,
      narrative: result.narrative,
      stats,
    };
  }

  // Narrative generation failed - use degraded mode
  // @see TODO Section 17.3.4
  context.logger?.warn(
    `[aggregator] Narrative generation failed: ${result.error}. Using degraded mode.`
  );

  const stats: AggregatorStats = {
    inputCount: candidates.length,
    includedCount: candidates.length,
    sectionCount: 0,
    highlightCount: 0,
    recommendationCount: 0,
    narrativeGenerated: false,
    tokenUsage: result.tokenUsage,
    durationMs: result.durationMs,
  };

  return {
    candidates,
    narrative: null,
    stats,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Count how many candidates are referenced in the narrative.
 */
function countIncludedCandidates(
  narrative: NonNullable<AggregatorOutput['narrative']>,
  candidates: Candidate[]
): number {
  const referencedIds = new Set<string>();

  // Collect IDs from sections
  for (const section of narrative.sections) {
    for (const id of section.candidateIds) {
      referencedIds.add(id);
    }
  }

  // Collect IDs from highlights
  for (const highlight of narrative.highlights) {
    if (highlight.candidateId) {
      referencedIds.add(highlight.candidateId);
    }
  }

  // Collect IDs from recommendations
  for (const rec of narrative.recommendations) {
    for (const id of rec.candidateIds) {
      referencedIds.add(id);
    }
  }

  // Count how many candidates are actually in our input
  let count = 0;
  for (const candidate of candidates) {
    if (referencedIds.has(candidate.candidateId)) {
      count++;
    }
  }

  return count;
}
