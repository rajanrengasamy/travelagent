/**
 * Router Planner - Worker selection and budget allocation
 *
 * This module handles the core routing logic for Stage 02:
 * - Selecting which workers to activate based on session characteristics
 * - Allocating resource budgets (maxResults, timeout, priority) per worker
 * - Creating validation plans for social-derived candidates
 *
 * @see PRD Section 5.2 - Router Stage
 */

import type { Session } from '../schemas/session.js';
import type { ValidationPlan } from '../schemas/worker.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Budget allocation for a single worker
 */
export interface WorkerBudget {
  /** Worker identifier (e.g., "perplexity", "places", "youtube") */
  workerId: string;
  /** Maximum number of candidates to return */
  maxResults: number;
  /** Timeout in milliseconds */
  timeout: number;
  /** Execution priority (1=highest, runs first) */
  priority: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Interest keywords that trigger Google Places worker */
const PLACES_INTERESTS = new Set([
  'food',
  'restaurant',
  'restaurants',
  'cafe',
  'cafes',
  'coffee',
  'attraction',
  'attractions',
  'museum',
  'museums',
  'park',
  'parks',
  'hotel',
  'hotels',
  'accommodation',
  'shopping',
  'mall',
  'market',
  'markets',
  'dining',
  'bar',
  'bars',
  'pub',
  'pubs',
]);

/** Interest keywords that trigger YouTube worker */
const YOUTUBE_INTERESTS = new Set([
  'adventure',
  'adventures',
  'photography',
  'photo',
  'nightlife',
  'night life',
  'experience',
  'experiences',
  'hiking',
  'trekking',
  'diving',
  'scuba',
  'surfing',
  'extreme',
  'vlog',
  'vlogs',
]);

/** Minimum trip duration (days) to include YouTube worker */
const YOUTUBE_MIN_DURATION_DAYS = 3;

/** Base budget configurations per worker */
const WORKER_BASE_BUDGETS: Record<string, Omit<WorkerBudget, 'workerId'>> = {
  perplexity: {
    maxResults: 15,
    timeout: 30000,
    priority: 1,
  },
  places: {
    maxResults: 20,
    timeout: 20000,
    priority: 1,
  },
  youtube: {
    maxResults: 10,
    timeout: 45000,
    priority: 2, // Lower priority, takes longer
  },
};

/** Threshold for "many interests" multiplier */
const MANY_INTERESTS_THRESHOLD = 5;

/** Multiplier for maxResults when session has many interests */
const MANY_INTERESTS_MULTIPLIER = 1.5;

/** Base validation count for YouTube-derived candidates */
const BASE_VALIDATION_TOP_N = 5;

/** Additional validation count when session has strict constraints */
const STRICT_CONSTRAINTS_BONUS = 3;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate trip duration in days from session date range
 */
function getTripDurationDays(session: Session): number {
  const start = new Date(session.dateRange.start);
  const end = new Date(session.dateRange.end);
  const diffMs = end.getTime() - start.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
}

/**
 * Check if any session interest matches the given set (case-insensitive)
 */
function hasMatchingInterest(interests: string[], targetSet: Set<string>): boolean {
  return interests.some((interest) => {
    const normalized = interest.toLowerCase().trim();
    // Check exact match
    if (targetSet.has(normalized)) {
      return true;
    }
    // Check if any target word appears in the interest
    for (const target of targetSet) {
      if (normalized.includes(target) || target.includes(normalized)) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Check if session has strict constraints that warrant more validation
 */
function hasStrictConstraints(session: Session): boolean {
  if (!session.constraints) {
    return false;
  }

  const strictKeys = ['budget', 'accessibility', 'dietary', 'safety', 'medical'];
  return strictKeys.some((key) => key in session.constraints!);
}

/**
 * Check if session has skipYouTube constraint
 */
function hasSkipYouTubeConstraint(session: Session): boolean {
  if (!session.constraints) {
    return false;
  }
  return session.constraints['skipYouTube'] === true;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Select which workers to use based on session characteristics
 *
 * Selection logic:
 * - Always include `perplexity` if available (general knowledge)
 * - Include `places` if interests match POI-related keywords
 * - Include `youtube` if trip is long or interests are visual/experiential
 *
 * @param session - The travel session with user intent
 * @param availableWorkers - List of workers that are available to use
 * @returns Filtered list of workers to activate
 */
export function selectWorkers(session: Session, availableWorkers: string[]): string[] {
  const selected: string[] = [];
  const availableSet = new Set(availableWorkers);

  // Always include perplexity if available (general knowledge worker)
  if (availableSet.has('perplexity')) {
    selected.push('perplexity');
  }

  // Include places if interests match POI-related keywords
  if (availableSet.has('places')) {
    if (hasMatchingInterest(session.interests, PLACES_INTERESTS)) {
      selected.push('places');
    }
  }

  // Include youtube based on multiple criteria
  if (availableSet.has('youtube') && !hasSkipYouTubeConstraint(session)) {
    const tripDuration = getTripDurationDays(session);
    const hasYouTubeInterests = hasMatchingInterest(session.interests, YOUTUBE_INTERESTS);

    // Include YouTube if trip is long enough OR has relevant interests
    if (tripDuration > YOUTUBE_MIN_DURATION_DAYS || hasYouTubeInterests) {
      selected.push('youtube');
    }
  }

  return selected;
}

/**
 * Allocate resource budgets per worker
 *
 * Budget logic:
 * - Each worker has base maxResults, timeout, and priority
 * - If session has many interests (>5), increase maxResults by 50%
 *
 * @param workers - List of selected worker IDs
 * @param session - The travel session for context
 * @returns Budget allocation for each worker
 */
export function allocateBudgets(workers: string[], session: Session): WorkerBudget[] {
  const hasManyInterests = session.interests.length > MANY_INTERESTS_THRESHOLD;

  return workers.map((workerId) => {
    const baseBudget = WORKER_BASE_BUDGETS[workerId];

    if (!baseBudget) {
      // Unknown worker - provide sensible defaults
      return {
        workerId,
        maxResults: 10,
        timeout: 30000,
        priority: 2,
      };
    }

    // Calculate adjusted maxResults
    let maxResults = baseBudget.maxResults;
    if (hasManyInterests) {
      maxResults = Math.round(maxResults * MANY_INTERESTS_MULTIPLIER);
    }

    return {
      workerId,
      maxResults,
      timeout: baseBudget.timeout,
      priority: baseBudget.priority,
    };
  });
}

/**
 * Create validation plan for social-derived candidates
 *
 * Validation logic:
 * - If youtube is selected: validate top N candidates from youtube
 * - If only structured workers: no validation needed
 * - Increase validateTopN if session has strict constraints
 *
 * @param workers - List of selected worker IDs
 * @param session - The travel session for context
 * @returns Validation plan specifying what to validate
 */
export function createValidationPlan(workers: string[], session: Session): ValidationPlan {
  const socialWorkers = workers.filter((w) => w === 'youtube');

  // No social workers means no validation needed
  if (socialWorkers.length === 0) {
    return {
      validateTopN: 0,
      origins: [],
    };
  }

  // Calculate how many candidates to validate
  let validateTopN = BASE_VALIDATION_TOP_N;

  // Increase validation for sessions with strict constraints
  if (hasStrictConstraints(session)) {
    validateTopN += STRICT_CONSTRAINTS_BONUS;
  }

  return {
    validateTopN,
    origins: socialWorkers,
  };
}
