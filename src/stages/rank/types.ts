/**
 * Rank Stage Types
 *
 * Type definitions for the ranking stage (Stage 06).
 * These types define the output structure for the checkpoint file.
 *
 * @module stages/rank/types
 * @see PRD Section 14 - Ranking, Dedupe, and Clustering
 * @see TODO Section 14.5 - Rank stage implementation
 */

import { z } from 'zod';
import { CandidateSchema, type Candidate } from '../../schemas/candidate.js';

// ============================================================================
// Score Distribution Schema
// ============================================================================

/**
 * ScoreDistribution: Breakdown of candidates by score range.
 * Helps analyze the quality distribution of ranked results.
 */
export const ScoreDistributionSchema = z.object({
  /** Candidates with score >= 80 */
  high: z.number().int().nonnegative(),

  /** Candidates with score >= 50 and < 80 */
  medium: z.number().int().nonnegative(),

  /** Candidates with score < 50 */
  low: z.number().int().nonnegative(),
});

export type ScoreDistribution = z.infer<typeof ScoreDistributionSchema>;

// ============================================================================
// Stage Statistics Schema
// ============================================================================

/**
 * RankStageStats: Statistics about the ranking process.
 */
export const RankStageStatsSchema = z.object({
  /** Number of candidates received from upstream */
  inputCount: z.number().int().nonnegative(),

  /** Number of candidates in output (same as input for ranking) */
  outputCount: z.number().int().nonnegative(),

  /** Average score across all candidates */
  averageScore: z.number().min(0).max(100),

  /** Distribution of scores by range */
  scoreDistribution: ScoreDistributionSchema,
});

export type RankStageStats = z.infer<typeof RankStageStatsSchema>;

// ============================================================================
// Stage Output Schema
// ============================================================================

/**
 * RankStageOutput: Output structure for the rank stage checkpoint.
 * Written to 06_candidates_ranked.json.
 *
 * Contains all candidates sorted by score descending, along with
 * statistics about the ranking process.
 */
export const RankStageOutputSchema = z.object({
  /** Ranked candidates sorted by score descending */
  candidates: z.array(CandidateSchema),

  /** Statistics about the ranking process */
  stats: RankStageStatsSchema,
});

export type RankStageOutput = z.infer<typeof RankStageOutputSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate score distribution from a list of candidates.
 *
 * @param candidates - Candidates with scores
 * @returns Score distribution object
 */
export function calculateScoreDistribution(candidates: Candidate[]): ScoreDistribution {
  let high = 0;
  let medium = 0;
  let low = 0;

  for (const candidate of candidates) {
    if (candidate.score >= 80) {
      high++;
    } else if (candidate.score >= 50) {
      medium++;
    } else {
      low++;
    }
  }

  return { high, medium, low };
}

/**
 * Calculate the average score from a list of candidates.
 *
 * @param candidates - Candidates with scores
 * @returns Average score (0 if empty)
 */
export function calculateAverageScore(candidates: Candidate[]): number {
  if (candidates.length === 0) {
    return 0;
  }

  const totalScore = candidates.reduce((sum, c) => sum + c.score, 0);
  return Math.round((totalScore / candidates.length) * 100) / 100; // Round to 2 decimals
}
