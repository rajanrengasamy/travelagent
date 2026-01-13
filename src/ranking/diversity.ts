/**
 * Diversity Scoring and Enforcement
 *
 * Calculates diversity scores and enforces diversity constraints for candidates.
 * Diversity ensures variety in candidate types and geographic spread.
 *
 * @module ranking/diversity
 * @see PRD Section 14.3 - Diversity Constraints
 */

import type { Candidate, CandidateType } from '../schemas/candidate.js';

// ============================================================================
// Configuration Constants
// ============================================================================

/**
 * Diversity configuration constants
 * @see PRD Section 14.3 - Diversity Constraints
 */
export const DIVERSITY_CONFIG = {
  /** Maximum candidates of the same type allowed in top 20 */
  maxSameTypeInTop20: 4,
  /** Points deducted per same-type predecessor in results */
  sameTypePenalty: 10,
  /** Maximum penalty that can be applied (caps diversity at 0) */
  maxPenalty: 100,
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Count candidates by their type
 *
 * @param candidates - Array of candidates to count
 * @returns Map of candidate type to count
 */
export function countByType(candidates: Candidate[]): Map<CandidateType, number> {
  const counts = new Map<CandidateType, number>();
  for (const candidate of candidates) {
    const current = counts.get(candidate.type) ?? 0;
    counts.set(candidate.type, current + 1);
  }
  return counts;
}

/**
 * Extract destination (city/region) from location text
 *
 * Uses heuristics to identify the primary destination:
 * - Takes the last segment after comma (typically city or country)
 * - Handles formats like "Shibuya, Tokyo" or "Eiffel Tower, Paris, France"
 *
 * @param locationText - The location text to parse
 * @returns Extracted destination or null if unable to extract
 */
export function extractDestination(locationText: string): string | null {
  if (!locationText || locationText.trim().length === 0) {
    return null;
  }

  const trimmed = locationText.trim();

  // Split by comma and get meaningful segments
  const segments = trimmed.split(',').map((s) => s.trim()).filter((s) => s.length > 0);

  if (segments.length === 0) {
    return null;
  }

  // For single segment, return it as the destination
  if (segments.length === 1) {
    return segments[0];
  }

  // For multiple segments, prefer the second-to-last (usually city)
  // e.g., "Shibuya, Tokyo, Japan" -> "Tokyo"
  // e.g., "Eiffel Tower, Paris" -> "Paris"
  if (segments.length >= 2) {
    // If last segment looks like a country (common country names), use second-to-last
    const lastSegment = segments[segments.length - 1];
    const commonCountries = [
      'japan', 'france', 'italy', 'spain', 'germany', 'uk', 'usa', 'us',
      'thailand', 'vietnam', 'korea', 'china', 'india', 'australia',
      'mexico', 'brazil', 'argentina', 'portugal', 'greece', 'turkey',
    ];
    if (commonCountries.includes(lastSegment.toLowerCase())) {
      return segments[segments.length - 2];
    }
    // Otherwise return the last segment (typically city)
    return lastSegment;
  }

  return segments[0];
}

/**
 * Count candidates by their destination
 *
 * @param candidates - Array of candidates to count
 * @returns Map of destination to count
 */
export function countByDestination(candidates: Candidate[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    if (candidate.locationText) {
      const destination = extractDestination(candidate.locationText);
      if (destination) {
        const normalizedDest = destination.toLowerCase();
        const current = counts.get(normalizedDest) ?? 0;
        counts.set(normalizedDest, current + 1);
      }
    }
  }
  return counts;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Calculate diversity score for a candidate based on predecessors
 *
 * Starts at 100 and applies a penalty for each predecessor of the same type.
 * Formula: 100 - (sameTypePredecessorCount * 10)
 *
 * @param candidate - The candidate to score
 * @param predecessors - Candidates already in the result list (before this one)
 * @returns Diversity score (0-100, higher is better)
 * @see PRD Section 14.3 - Diversity penalty calculation
 */
export function calculateDiversity(candidate: Candidate, predecessors: Candidate[]): number {
  // Count predecessors of the same type
  const sameTypePredecessorCount = predecessors.filter(
    (pred) => pred.type === candidate.type
  ).length;

  // Calculate diversity score with penalty
  const penalty = sameTypePredecessorCount * DIVERSITY_CONFIG.sameTypePenalty;
  const score = DIVERSITY_CONFIG.maxPenalty - penalty;

  // Cap at 100, floor at 0
  return Math.max(0, Math.min(100, score));
}

/**
 * Enforce diversity constraints on a candidate list
 *
 * Constraints enforced:
 * 1. No more than maxSameTypeInTop20 (4) of the same type in top 20
 * 2. Balance geography if multiple destinations are detected
 *
 * Algorithm:
 * - Process candidates in order of their score
 * - Track type counts in the selected set
 * - Skip candidates that would violate type constraints
 * - Apply geographic balancing when multiple destinations exist
 *
 * @param candidates - Array of candidates sorted by score (descending)
 * @returns Reordered/filtered list satisfying diversity constraints
 * @see PRD Section 14.3 - Diversity Constraints
 */
export function enforceDiversityConstraints(candidates: Candidate[]): Candidate[] {
  if (candidates.length === 0) {
    return [];
  }

  // Sort by score descending to process best candidates first
  const sortedCandidates = [...candidates].sort((a, b) => b.score - a.score);

  // Detect unique destinations for geographic balancing
  const allDestinations = new Set<string>();
  for (const candidate of sortedCandidates) {
    if (candidate.locationText) {
      const dest = extractDestination(candidate.locationText);
      if (dest) {
        allDestinations.add(dest.toLowerCase());
      }
    }
  }
  const multipleDestinations = allDestinations.size > 1;

  // Track type counts and destination counts in selected set
  const typeCounts = new Map<CandidateType, number>();
  const destinationCounts = new Map<string, number>();
  const result: Candidate[] = [];
  const deferred: Candidate[] = []; // Candidates deferred due to constraints

  // First pass: select candidates respecting constraints for top 20
  for (const candidate of sortedCandidates) {
    const currentTypeCount = typeCounts.get(candidate.type) ?? 0;

    // Check type constraint for top 20
    if (result.length < 20 && currentTypeCount >= DIVERSITY_CONFIG.maxSameTypeInTop20) {
      // Defer this candidate - it exceeds type limit in top 20
      deferred.push(candidate);
      continue;
    }

    // Check geographic balance if multiple destinations
    if (multipleDestinations && candidate.locationText && result.length < 20) {
      const dest = extractDestination(candidate.locationText);
      if (dest) {
        const normalizedDest = dest.toLowerCase();
        const destCount = destinationCounts.get(normalizedDest) ?? 0;
        const avgPerDest = Math.ceil(20 / allDestinations.size);

        // If this destination is significantly over-represented, defer
        if (destCount >= avgPerDest + 2) {
          deferred.push(candidate);
          continue;
        }

        // Update destination count
        destinationCounts.set(normalizedDest, destCount + 1);
      }
    }

    // Add candidate to result
    result.push(candidate);
    typeCounts.set(candidate.type, currentTypeCount + 1);
  }

  // Second pass: if we haven't filled top 20 yet, continue adding deferred candidates
  // but maintain type constraints within top 20
  if (result.length < 20 && deferred.length > 0) {
    deferred.sort((a, b) => b.score - a.score);

    for (const candidate of deferred) {
      if (result.length >= 20) {
        // Past top 20, add all remaining deferred without constraint
        result.push(candidate);
        continue;
      }

      const currentTypeCount = typeCounts.get(candidate.type) ?? 0;
      if (currentTypeCount >= DIVERSITY_CONFIG.maxSameTypeInTop20) {
        // Still within top 20 and would violate constraint - keep deferring
        continue;
      }

      result.push(candidate);
      typeCounts.set(candidate.type, currentTypeCount + 1);
    }
  } else if (deferred.length > 0) {
    // All top 20 slots filled, add remaining deferred without constraint
    deferred.sort((a, b) => b.score - a.score);
    result.push(...deferred);
  }

  return result;
}
