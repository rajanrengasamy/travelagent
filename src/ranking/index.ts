/**
 * Ranking Module Exports
 *
 * Central export point for candidate ranking functionality.
 *
 * @module ranking
 * @see PRD Section 14 - Ranking, Dedupe, and Clustering
 */

// Credibility scoring
export {
  ORIGIN_CREDIBILITY,
  VERIFICATION_BOOSTS,
  calculateCredibility,
} from './credibility.js';

// Relevance scoring
export {
  calculateRelevance,
  normalizeText,
  textContainsAny,
  countMatchingTags,
  calculateDestinationScore,
  calculateInterestScore,
  calculateTypeScore,
} from './relevance.js';

// Diversity scoring and constraints
export {
  DIVERSITY_CONFIG,
  calculateDiversity,
  enforceDiversityConstraints,
  countByType,
  countByDestination,
  extractDestination,
} from './diversity.js';

// Overall scoring
export {
  SCORING_WEIGHTS,
  RECENCY_THRESHOLDS,
  RECENCY_SCORES,
  type RankingContext,
  type ScoreBreakdown,
  calculateRecency,
  calculateOverallScore,
  getScoreBreakdown,
  rankCandidates,
} from './scorer.js';
