/**
 * Top Candidates Stage Types
 *
 * Type definitions for the top candidates selection stage (Stage 08).
 * This stage selects the top N candidates for the aggregator while
 * enforcing diversity constraints.
 *
 * @module stages/top-candidates/types
 * @see PRD Section 14.3 - Diversity Constraints
 * @see TODO Section 16.0 - Top Candidates Selection (Stage 08)
 */

import { z } from 'zod';
import { CandidateSchema, type CandidateType } from '../../schemas/candidate.js';

// ============================================================================
// Configuration Constants
// ============================================================================

/**
 * Default number of top candidates to select for aggregator.
 * @see PRD Section 14.3 - "Select top N candidates for aggregator (default 30)"
 */
export const DEFAULT_TOP_N = 30;

// ============================================================================
// Stage Statistics Schema
// ============================================================================

/**
 * TopCandidatesStageStats: Statistics about the top candidates selection.
 */
export const TopCandidatesStageStatsSchema = z.object({
  /** Number of candidates received from upstream (validated candidates) */
  inputCount: z.number().int().nonnegative(),

  /** Number of candidates selected for aggregator */
  outputCount: z.number().int().nonnegative(),

  /** The topN value used for selection */
  topN: z.number().int().positive(),

  /** Breakdown of selected candidates by type */
  byType: z.record(z.string(), z.number().int().nonnegative()),

  /** Breakdown of selected candidates by destination */
  byDestination: z.record(z.string(), z.number().int().nonnegative()),

  /** Number of candidates deferred due to diversity constraints */
  deferredCount: z.number().int().nonnegative(),

  /** Average score of selected candidates */
  averageScore: z.number().nonnegative(),

  /** Score of the lowest-ranked selected candidate */
  minScore: z.number().nonnegative(),

  /** Score of the highest-ranked selected candidate */
  maxScore: z.number().nonnegative(),
});

export type TopCandidatesStageStats = z.infer<typeof TopCandidatesStageStatsSchema>;

// ============================================================================
// Stage Output Schema
// ============================================================================

/**
 * TopCandidatesStageOutput: Output structure for the top candidates stage checkpoint.
 * Written to 08_top_candidates.json.
 *
 * This is the **key resume point** for aggregator testing. The aggregator
 * stage can be resumed from this checkpoint without re-running earlier stages.
 *
 * @see TODO Section 16.1.4 - Key resume point for aggregator testing
 * @see TODO Section 16.1.5 - Write checkpoint to 08_top_candidates.json
 */
export const TopCandidatesStageOutputSchema = z.object({
  /** Top N candidates selected for aggregator, sorted by score descending */
  candidates: z.array(CandidateSchema),

  /** Statistics about the selection process */
  stats: TopCandidatesStageStatsSchema,
});

export type TopCandidatesStageOutput = z.infer<typeof TopCandidatesStageOutputSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create initial empty stats object.
 *
 * @param topN - The topN value used for selection
 */
export function createEmptyTopCandidatesStats(topN: number): TopCandidatesStageStats {
  return {
    inputCount: 0,
    outputCount: 0,
    topN,
    byType: {},
    byDestination: {},
    deferredCount: 0,
    averageScore: 0,
    minScore: 0,
    maxScore: 0,
  };
}

/**
 * Count candidates by their type.
 *
 * @param candidates - Array of candidates to count
 * @returns Record of type to count
 */
export function countCandidatesByType(
  candidates: { type: CandidateType }[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const candidate of candidates) {
    counts[candidate.type] = (counts[candidate.type] ?? 0) + 1;
  }
  return counts;
}

/**
 * Count candidates by their destination.
 *
 * @param candidates - Array of candidates with optional locationText
 * @param extractDest - Function to extract destination from location text
 * @returns Record of destination to count
 */
export function countCandidatesByDestination(
  candidates: { locationText?: string }[],
  extractDest: (locationText: string) => string | null
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const candidate of candidates) {
    if (candidate.locationText) {
      const dest = extractDest(candidate.locationText);
      if (dest) {
        const normalized = dest.toLowerCase();
        counts[normalized] = (counts[normalized] ?? 0) + 1;
      }
    }
  }
  return counts;
}

/**
 * Calculate score statistics for a list of candidates.
 *
 * @param candidates - Array of candidates with scores
 * @returns Object with average, min, and max scores
 */
export function calculateScoreStats(
  candidates: { score: number }[]
): { average: number; min: number; max: number } {
  if (candidates.length === 0) {
    return { average: 0, min: 0, max: 0 };
  }

  let sum = 0;
  let min = Infinity;
  let max = -Infinity;

  for (const candidate of candidates) {
    sum += candidate.score;
    if (candidate.score < min) min = candidate.score;
    if (candidate.score > max) max = candidate.score;
  }

  return {
    average: Math.round((sum / candidates.length) * 100) / 100,
    min,
    max,
  };
}
