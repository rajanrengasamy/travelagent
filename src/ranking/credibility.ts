/**
 * Credibility Scoring for Candidate Ranking
 *
 * Calculates credibility scores based on candidate origin and verification status.
 * Higher credibility indicates more trustworthy data sources.
 *
 * Scoring factors:
 * - Origin type (Google Places is most credible, YouTube least)
 * - Number of source references (web_multi vs web_single)
 * - Verification status (from validation stage)
 * - Confidence level (for YouTube-derived candidates)
 *
 * @module ranking/credibility
 * @see PRD Section 14.2 - Credibility Scoring
 */

import type {
  Candidate,
  CandidateOrigin,
  ValidationStatus,
  CandidateConfidence,
} from '../schemas/candidate.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Base credibility scores by candidate origin.
 *
 * - places: 90 - Google Places API provides official, verified business data
 * - web_multi: 80 - Multiple web sources provide cross-validation
 * - web_single: 60 - Single web source has less corroboration
 * - youtube_verified: 50 - YouTube data that has been verified
 * - youtube_provisional: 30 - Unverified YouTube-derived data
 *
 * @see PRD Section 14.2 - ORIGIN_CREDIBILITY
 */
export const ORIGIN_CREDIBILITY = {
  places: 90,
  web_multi: 80,
  web_single: 60,
  youtube_verified: 50,
  youtube_provisional: 30,
} as const;

/**
 * Credibility boosts based on validation status.
 *
 * Applied after base origin credibility to reward verified candidates.
 *
 * - unverified: 0 - No verification attempted or failed
 * - partially_verified: 15 - Some aspects verified
 * - verified: 35 - Fully verified by validation stage
 * - high: 50 - Official source (tourism board, venue website)
 *
 * @see PRD Section 14.2 - VERIFICATION_BOOSTS
 */
export const VERIFICATION_BOOSTS = {
  unverified: 0,
  partially_verified: 15,
  verified: 35,
  high: 50,
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets the base credibility score for a candidate based on its origin.
 *
 * For web origin, checks sourceRefs count to distinguish web_multi vs web_single.
 * For youtube origin, checks confidence level for youtube_verified vs youtube_provisional.
 *
 * @param origin - The candidate's origin worker
 * @param sourceRefsCount - Number of source references
 * @param confidence - The candidate's confidence level
 * @returns Base credibility score from ORIGIN_CREDIBILITY
 */
function getBaseCredibility(
  origin: CandidateOrigin,
  sourceRefsCount: number,
  confidence: CandidateConfidence
): number {
  switch (origin) {
    case 'places':
      return ORIGIN_CREDIBILITY.places;

    case 'web':
      // 2+ sources = web_multi, otherwise web_single
      return sourceRefsCount >= 2
        ? ORIGIN_CREDIBILITY.web_multi
        : ORIGIN_CREDIBILITY.web_single;

    case 'youtube':
      // Check confidence: 'verified' or 'high' = youtube_verified
      return confidence === 'verified' || confidence === 'high'
        ? ORIGIN_CREDIBILITY.youtube_verified
        : ORIGIN_CREDIBILITY.youtube_provisional;

    default: {
      // Exhaustive check - TypeScript will error if a case is missed
      const exhaustiveCheck: never = origin;
      throw new Error(`Unhandled origin: ${exhaustiveCheck}`);
    }
  }
}

/**
 * Gets the verification boost for a validation status.
 *
 * Maps ValidationStatus to VERIFICATION_BOOSTS keys:
 * - 'verified' -> verified (35)
 * - 'partially_verified' -> partially_verified (15)
 * - 'conflict_detected' -> unverified (0) - conflicts reduce trust
 * - 'unverified' -> unverified (0)
 * - 'not_applicable' -> unverified (0)
 *
 * @param status - The candidate's validation status
 * @returns Verification boost value
 */
function getVerificationBoost(status: ValidationStatus | undefined): number {
  if (!status) {
    return VERIFICATION_BOOSTS.unverified;
  }

  switch (status) {
    case 'verified':
      return VERIFICATION_BOOSTS.verified;
    case 'partially_verified':
      return VERIFICATION_BOOSTS.partially_verified;
    case 'conflict_detected':
    case 'unverified':
    case 'not_applicable':
      return VERIFICATION_BOOSTS.unverified;
    default: {
      // Exhaustive check
      const exhaustiveCheck: never = status;
      throw new Error(`Unhandled validation status: ${exhaustiveCheck}`);
    }
  }
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Calculates the credibility score for a candidate.
 *
 * The credibility score reflects how trustworthy the candidate's data is,
 * based on its origin source and verification status.
 *
 * Calculation:
 * 1. Get base credibility from origin (web needs sourceRefs count check)
 * 2. Add verification boost based on validation status
 * 3. Cap at 100, floor at 0
 *
 * @param candidate - The candidate to score
 * @returns Credibility score between 0 and 100
 * @see PRD Section 14.2 - calculateCredibility specification
 * @example
 * ```typescript
 * // Google Places candidate (highest credibility)
 * calculateCredibility({
 *   origin: 'places',
 *   sourceRefs: [{ url: '...', retrievedAt: '...' }],
 *   confidence: 'high',
 *   validation: { status: 'verified' }
 * });
 * // 90 (base) + 35 (verified) = 125 -> capped to 100
 *
 * // Web candidate with multiple sources
 * calculateCredibility({
 *   origin: 'web',
 *   sourceRefs: [{ url: '...' }, { url: '...' }],
 *   confidence: 'verified'
 * });
 * // 80 (web_multi) + 0 (no validation) = 80
 *
 * // Unverified YouTube candidate
 * calculateCredibility({
 *   origin: 'youtube',
 *   sourceRefs: [{ url: '...' }],
 *   confidence: 'provisional'
 * });
 * // 30 (youtube_provisional) + 0 (no validation) = 30
 * ```
 */
export function calculateCredibility(candidate: Candidate): number {
  // Step 1: Get base credibility from origin
  const baseCredibility = getBaseCredibility(
    candidate.origin,
    candidate.sourceRefs.length,
    candidate.confidence
  );

  // Step 2: Get verification boost from validation status
  const verificationBoost = getVerificationBoost(candidate.validation?.status);

  // Step 3: Calculate total and apply bounds
  const rawScore = baseCredibility + verificationBoost;

  // Cap at 100, floor at 0
  return Math.max(0, Math.min(100, rawScore));
}
