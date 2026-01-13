/**
 * Overall Scoring for Candidate Ranking
 *
 * Combines relevance, credibility, recency, and diversity scores
 * into a single weighted overall score for ranking candidates.
 *
 * @module ranking/scorer
 * @see PRD Section 14.2 - Multi-Dimensional Ranking
 * @see TODO Section 14.4 - Overall scoring implementation
 */

import type { Candidate } from '../schemas/candidate.js';
import type { EnrichedIntent } from '../schemas/worker.js';
import { calculateCredibility } from './credibility.js';
import { calculateRelevance } from './relevance.js';
import { calculateDiversity } from './diversity.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Scoring weights for multi-dimensional ranking.
 *
 * @see PRD Section 14.2 - Scoring dimensions table
 */
export const SCORING_WEIGHTS = {
  relevance: 0.35,
  credibility: 0.30,
  recency: 0.20,
  diversity: 0.15,
} as const;

/**
 * Recency scoring thresholds in days.
 * More recent content scores higher.
 */
export const RECENCY_THRESHOLDS = {
  /** Within 30 days = 100 points */
  FRESH: 30,
  /** 30-90 days = 80 points */
  RECENT: 90,
  /** 90-180 days = 60 points */
  MODERATE: 180,
  /** 180-365 days = 40 points */
  OLDER: 365,
  /** Over 1 year = 20 points */
} as const;

/**
 * Recency scores corresponding to thresholds.
 */
export const RECENCY_SCORES = {
  FRESH: 100,
  RECENT: 80,
  MODERATE: 60,
  OLDER: 40,
  STALE: 20,
  UNKNOWN: 50,
} as const;

// ============================================================================
// Types
// ============================================================================

/**
 * Context required for calculating overall scores.
 * Provides enriched intent for relevance and predecessors for diversity.
 */
export interface RankingContext {
  /** Enriched intent from router stage */
  enrichedIntent: EnrichedIntent;
  /** Already-ranked candidates (for diversity calculation) */
  predecessors: Candidate[];
  /** Reference date for recency scoring (defaults to now) */
  referenceDate?: Date;
}

/**
 * Breakdown of individual dimension scores.
 * Useful for debugging and understanding ranking decisions.
 */
export interface ScoreBreakdown {
  /** Relevance to user interests (0-100) */
  relevance: number;
  /** Source credibility (0-100) */
  credibility: number;
  /** Content recency (0-100) */
  recency: number;
  /** Diversity vs predecessors (0-100) */
  diversity: number;
  /** Weighted overall score (0-100) */
  overall: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Clamp a score to the valid range [0, 100].
 *
 * @param score - Raw score value
 * @returns Score capped at 100, floored at 0
 */
function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate the age of content in days.
 *
 * @param publishedAt - ISO8601 datetime string
 * @param referenceDate - Date to calculate age from
 * @returns Age in days, or null if date is invalid
 */
function getAgeInDays(publishedAt: string, referenceDate: Date): number | null {
  try {
    const publishedDate = new Date(publishedAt);
    if (isNaN(publishedDate.getTime())) {
      return null;
    }
    const diffMs = referenceDate.getTime() - publishedDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

// ============================================================================
// Recency Scoring
// ============================================================================

/**
 * Calculate recency score based on content publication date.
 *
 * Scoring tiers:
 * - Within 30 days: 100 (fresh content)
 * - 30-90 days: 80 (recent)
 * - 90-180 days: 60 (moderate)
 * - 180-365 days: 40 (older)
 * - Over 1 year: 20 (stale)
 * - No date: 50 (neutral)
 *
 * @param candidate - Candidate to score
 * @param referenceDate - Date to calculate recency from
 * @returns Recency score (0-100)
 * @see PRD Section 14.2 - recency dimension
 */
export function calculateRecency(candidate: Candidate, referenceDate: Date): number {
  const publishedAt = candidate.metadata?.publishedAt;

  // No publication date = neutral score
  if (!publishedAt) {
    return RECENCY_SCORES.UNKNOWN;
  }

  const ageInDays = getAgeInDays(publishedAt, referenceDate);

  // Invalid date = neutral score
  if (ageInDays === null) {
    return RECENCY_SCORES.UNKNOWN;
  }

  // Future dates treated as fresh (edge case)
  if (ageInDays < 0) {
    return RECENCY_SCORES.FRESH;
  }

  // Apply recency thresholds
  if (ageInDays <= RECENCY_THRESHOLDS.FRESH) {
    return RECENCY_SCORES.FRESH;
  }
  if (ageInDays <= RECENCY_THRESHOLDS.RECENT) {
    return RECENCY_SCORES.RECENT;
  }
  if (ageInDays <= RECENCY_THRESHOLDS.MODERATE) {
    return RECENCY_SCORES.MODERATE;
  }
  if (ageInDays <= RECENCY_THRESHOLDS.OLDER) {
    return RECENCY_SCORES.OLDER;
  }

  return RECENCY_SCORES.STALE;
}

// ============================================================================
// Overall Scoring
// ============================================================================

/**
 * Calculate the weighted overall score for a candidate.
 *
 * Formula:
 * ```
 * overall = (relevance * 0.35) + (credibility * 0.30) +
 *           (recency * 0.20) + (diversity * 0.15)
 * ```
 *
 * @param candidate - Candidate to score
 * @param context - Ranking context with enriched intent and predecessors
 * @returns Overall score (0-100)
 * @see PRD Section 14.2 - overallScore formula
 */
export function calculateOverallScore(candidate: Candidate, context: RankingContext): number {
  const referenceDate = context.referenceDate ?? new Date();

  // Calculate individual dimension scores
  const relevance = calculateRelevance(candidate, context.enrichedIntent);
  const credibility = calculateCredibility(candidate);
  const recency = calculateRecency(candidate, referenceDate);
  const diversity = calculateDiversity(candidate, context.predecessors);

  // Apply weights and sum
  const weightedScore =
    relevance * SCORING_WEIGHTS.relevance +
    credibility * SCORING_WEIGHTS.credibility +
    recency * SCORING_WEIGHTS.recency +
    diversity * SCORING_WEIGHTS.diversity;

  return clampScore(Math.round(weightedScore));
}

/**
 * Get a detailed breakdown of all dimension scores.
 *
 * Useful for:
 * - Debugging ranking decisions
 * - Displaying score explanations to users
 * - Analyzing scoring patterns
 *
 * @param candidate - Candidate to analyze
 * @param context - Ranking context
 * @returns Score breakdown with all dimensions and overall
 */
export function getScoreBreakdown(candidate: Candidate, context: RankingContext): ScoreBreakdown {
  const referenceDate = context.referenceDate ?? new Date();

  const relevance = calculateRelevance(candidate, context.enrichedIntent);
  const credibility = calculateCredibility(candidate);
  const recency = calculateRecency(candidate, referenceDate);
  const diversity = calculateDiversity(candidate, context.predecessors);

  // Calculate overall using same formula
  const weightedScore =
    relevance * SCORING_WEIGHTS.relevance +
    credibility * SCORING_WEIGHTS.credibility +
    recency * SCORING_WEIGHTS.recency +
    diversity * SCORING_WEIGHTS.diversity;

  return {
    relevance: clampScore(Math.round(relevance)),
    credibility: clampScore(Math.round(credibility)),
    recency: clampScore(Math.round(recency)),
    diversity: clampScore(Math.round(diversity)),
    overall: clampScore(Math.round(weightedScore)),
  };
}

/**
 * Rank a list of candidates by overall score.
 *
 * This function iteratively calculates scores, using already-scored
 * candidates as predecessors for diversity calculation.
 *
 * @param candidates - Candidates to rank
 * @param enrichedIntent - Enriched intent for relevance scoring
 * @param referenceDate - Optional reference date for recency
 * @returns Candidates sorted by overall score (descending)
 */
export function rankCandidates(
  candidates: Candidate[],
  enrichedIntent: EnrichedIntent,
  referenceDate?: Date
): Candidate[] {
  const rankedCandidates: Candidate[] = [];

  // Sort by score incrementally to maintain diversity calculation order
  const unranked = [...candidates];

  while (unranked.length > 0) {
    // Find the candidate with the highest score given current predecessors
    let bestIdx = 0;
    let bestScore = -1;

    for (let i = 0; i < unranked.length; i++) {
      const context: RankingContext = {
        enrichedIntent,
        predecessors: rankedCandidates,
        referenceDate,
      };
      const score = calculateOverallScore(unranked[i], context);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    // Move best candidate to ranked list with updated score
    const best = unranked.splice(bestIdx, 1)[0];
    rankedCandidates.push({
      ...best,
      score: bestScore,
    });
  }

  return rankedCandidates;
}
