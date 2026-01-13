/**
 * Relevance Scoring Module
 *
 * Calculates how well a candidate matches the user's enriched intent.
 * Scores are based on destination match, interest overlap, and type relevance.
 *
 * @module ranking/relevance
 * @see PRD Section 14.2 - Relevance Scoring
 * @see todo/tasks-phase0-travel-discovery.md Task 14.2
 */

import type { Candidate, CandidateType } from '../schemas/candidate.js';
import type { EnrichedIntent } from '../schemas/worker.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum points for destination match component
 */
const DESTINATION_MATCH_MAX = 30;

/**
 * Maximum points for interest match component
 */
const INTEREST_MATCH_MAX = 40;

/**
 * Maximum points for type relevance component
 */
const TYPE_RELEVANCE_MAX = 30;

/**
 * Interest keywords that boost 'food' type candidates
 */
const FOOD_INTERESTS: readonly string[] = [
  'food',
  'culinary',
  'restaurants',
  'dining',
  'cuisine',
  'gastronomy',
  'foodie',
  'eating',
  'street food',
  'local food',
  'cooking',
  'chef',
] as const;

/**
 * Interest keywords that boost 'activity' type candidates
 */
const ACTIVITY_INTERESTS: readonly string[] = [
  'adventure',
  'outdoor',
  'outdoors',
  'hiking',
  'trekking',
  'sports',
  'active',
  'water sports',
  'diving',
  'surfing',
  'climbing',
  'kayaking',
  'biking',
  'cycling',
] as const;

/**
 * Interest keywords that boost 'experience' type candidates
 */
const EXPERIENCE_INTERESTS: readonly string[] = [
  'culture',
  'cultural',
  'local',
  'authentic',
  'tradition',
  'traditional',
  'heritage',
  'immersive',
  'unique',
  'off the beaten path',
  'hidden gems',
] as const;

/**
 * Mapping of candidate types to interest keyword sets
 */
const TYPE_INTEREST_MAPPINGS: Record<CandidateType, readonly string[]> = {
  food: FOOD_INTERESTS,
  activity: ACTIVITY_INTERESTS,
  experience: EXPERIENCE_INTERESTS,
  place: [], // Generic type, no bonus
  neighborhood: [], // Generic type, no bonus
  daytrip: [], // Generic type, no bonus
};

/**
 * Bonus points for matching candidate type to interests
 */
const TYPE_MATCH_BONUS = 10;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize text for comparison.
 * Converts to lowercase and removes punctuation.
 *
 * @param text - The text to normalize
 * @returns Normalized text
 *
 * @example
 * ```typescript
 * normalizeText("New York City!") // "new york city"
 * normalizeText("Café & Bar") // "café  bar"
 * ```
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"()\[\]{}<>@#$%^&*+=|\\/_~`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if text contains any of the given terms.
 * Performs case-insensitive, normalized matching.
 *
 * @param text - The text to search in
 * @param terms - Array of terms to search for
 * @returns True if text contains any term
 *
 * @example
 * ```typescript
 * textContainsAny("Tokyo, Japan", ["tokyo", "kyoto"]) // true
 * textContainsAny("Paris, France", ["tokyo", "kyoto"]) // false
 * ```
 */
export function textContainsAny(text: string, terms: string[]): boolean {
  if (terms.length === 0) {
    return false;
  }

  const normalizedText = normalizeText(text);

  return terms.some((term) => {
    const normalizedTerm = normalizeText(term);
    // Check for whole word or substring match
    return normalizedText.includes(normalizedTerm);
  });
}

/**
 * Count how many candidate tags match intent tags.
 * Performs case-insensitive comparison.
 *
 * @param candidateTags - Tags from the candidate
 * @param intentTags - Tags from the enriched intent (interests + inferredTags)
 * @returns Number of matching tags
 *
 * @example
 * ```typescript
 * countMatchingTags(["food", "local", "hidden"], ["food", "culture"])
 * // Returns 1 (only "food" matches)
 * ```
 */
export function countMatchingTags(
  candidateTags: string[],
  intentTags: string[]
): number {
  if (candidateTags.length === 0 || intentTags.length === 0) {
    return 0;
  }

  const normalizedIntentTags = new Set(
    intentTags.map((tag) => normalizeText(tag))
  );

  let matchCount = 0;
  for (const tag of candidateTags) {
    const normalizedTag = normalizeText(tag);
    if (normalizedIntentTags.has(normalizedTag)) {
      matchCount++;
    }
  }

  return matchCount;
}

// ============================================================================
// Scoring Functions
// ============================================================================

/**
 * Calculate destination match score.
 * Awards points if candidate location matches any intent destination.
 *
 * @param candidate - The candidate to score
 * @param enrichedIntent - The user's enriched intent
 * @returns Score from 0 to DESTINATION_MATCH_MAX
 */
export function calculateDestinationScore(
  candidate: Candidate,
  enrichedIntent: EnrichedIntent
): number {
  if (!candidate.locationText || enrichedIntent.destinations.length === 0) {
    return 0;
  }

  // Also check title and summary for destination mentions
  const searchText = [
    candidate.locationText,
    candidate.title,
    candidate.summary,
  ].join(' ');

  if (textContainsAny(searchText, enrichedIntent.destinations)) {
    return DESTINATION_MATCH_MAX;
  }

  return 0;
}

/**
 * Calculate interest match score.
 * Scores based on tag overlap between candidate and intent.
 *
 * @param candidate - The candidate to score
 * @param enrichedIntent - The user's enriched intent
 * @returns Score from 0 to INTEREST_MATCH_MAX
 */
export function calculateInterestScore(
  candidate: Candidate,
  enrichedIntent: EnrichedIntent
): number {
  // Combine interests and inferred tags
  const allIntentTags = [
    ...enrichedIntent.interests,
    ...enrichedIntent.inferredTags,
  ];

  if (candidate.tags.length === 0 || allIntentTags.length === 0) {
    return 0;
  }

  const matchCount = countMatchingTags(candidate.tags, allIntentTags);

  if (matchCount === 0) {
    return 0;
  }

  // Scale score based on match ratio, capped at max
  // More matches = higher score, but diminishing returns
  const matchRatio = matchCount / Math.min(candidate.tags.length, allIntentTags.length);
  const rawScore = matchRatio * INTEREST_MATCH_MAX;

  return Math.min(rawScore, INTEREST_MATCH_MAX);
}

/**
 * Calculate type relevance score.
 * Awards bonus points if candidate type aligns with user interests.
 *
 * @param candidate - The candidate to score
 * @param enrichedIntent - The user's enriched intent
 * @returns Score from 0 to TYPE_RELEVANCE_MAX
 */
export function calculateTypeScore(
  candidate: Candidate,
  enrichedIntent: EnrichedIntent
): number {
  let score = 0;

  const relevantInterests = TYPE_INTEREST_MAPPINGS[candidate.type];

  // Check if any user interests match this type's keywords
  const allUserInterests = [
    ...enrichedIntent.interests,
    ...enrichedIntent.inferredTags,
  ];

  for (const interest of allUserInterests) {
    const normalizedInterest = normalizeText(interest);

    for (const keyword of relevantInterests) {
      if (
        normalizedInterest.includes(normalizeText(keyword)) ||
        normalizeText(keyword).includes(normalizedInterest)
      ) {
        score += TYPE_MATCH_BONUS;
        break; // Only award once per interest
      }
    }
  }

  return Math.min(score, TYPE_RELEVANCE_MAX);
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Calculate overall relevance score for a candidate.
 *
 * Scores 0-100 based on:
 * - **Destination match** (0-30): Does locationText contain any destination?
 * - **Interest match** (0-40): How many tags overlap with interests/inferredTags?
 * - **Type relevance** (0-30): Does candidate type align with interest keywords?
 *
 * @param candidate - The candidate to score
 * @param enrichedIntent - The user's enriched intent from router stage
 * @returns Relevance score from 0 to 100
 *
 * @example
 * ```typescript
 * const candidate = {
 *   type: 'food',
 *   title: 'Tsukiji Fish Market',
 *   summary: 'Famous wholesale fish market',
 *   locationText: 'Tokyo, Japan',
 *   tags: ['food', 'seafood', 'local', 'market'],
 *   // ... other fields
 * };
 *
 * const intent = {
 *   destinations: ['Tokyo', 'Kyoto'],
 *   interests: ['food', 'culture'],
 *   inferredTags: ['culinary', 'foodie', 'east-asia'],
 *   // ... other fields
 * };
 *
 * const score = calculateRelevance(candidate, intent);
 * // Returns ~80 (30 destination + 30 interest + 20 type)
 * ```
 */
export function calculateRelevance(
  candidate: Candidate,
  enrichedIntent: EnrichedIntent
): number {
  const destinationScore = calculateDestinationScore(candidate, enrichedIntent);
  const interestScore = calculateInterestScore(candidate, enrichedIntent);
  const typeScore = calculateTypeScore(candidate, enrichedIntent);

  const totalScore = destinationScore + interestScore + typeScore;

  // Cap at 100, floor at 0
  return Math.max(0, Math.min(100, totalScore));
}
