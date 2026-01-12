/**
 * Google Places Worker
 *
 * Implements the Worker interface for Google Places API.
 * Generates location-based search queries from session intent
 * and retrieves verified place data with coordinates, ratings,
 * and detailed information.
 *
 * @module workers/places/worker
 * @see PRD Section 7.3 - Google Places Worker
 * @see Task 10.3 - Worker Implementation
 */

import type { Worker, WorkerContext } from '../types.js';
import type { Session } from '../../schemas/session.js';
import type {
  EnrichedIntent,
  WorkerAssignment,
  WorkerOutput,
} from '../../schemas/worker.js';
import type { Candidate } from '../../schemas/candidate.js';
import type { PlacesClient, Place, PlaceDetails } from './client.js';
import { isRetryableError } from './client.js';
import { mapPlacesToCandidates } from './mapper.js';

// ============================================================================
// Constants
// ============================================================================

/** Default maximum candidates to return */
const DEFAULT_MAX_RESULTS = 15;

/** Default timeout for worker execution (20 seconds) */
const DEFAULT_TIMEOUT_MS = 20000;

/** Maximum queries to generate per execution */
const MAX_QUERIES = 4;

/** Number of top results to fetch details for */
const TOP_RESULTS_FOR_DETAILS = 5;

/** Time allocated per query (fraction of total timeout) */
const QUERY_TIMEOUT_FRACTION = 0.7;

// ============================================================================
// Retry Configuration (PRD Section 17.3.2)
// ============================================================================

/** Maximum retry attempts for API calls */
const MAX_RETRIES = 3;

/** Base delay in milliseconds for exponential backoff */
const BASE_DELAY_MS = 1000;

/** Maximum delay in milliseconds for exponential backoff */
const MAX_DELAY_MS = 8000;

/** Jitter range in milliseconds (+/-500ms per PRD) */
const JITTER_MS = 500;

// ============================================================================
// Retry Helpers
// ============================================================================

/**
 * Sleep for a specified duration.
 *
 * @param ms - Duration in milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter.
 *
 * Uses exponential backoff with +/-500ms jitter as per PRD Section 17.3.2.
 *
 * @param attempt - Current attempt number (0-indexed)
 * @returns Delay in milliseconds with jitter
 */
function calculateDelay(attempt: number): number {
  const exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(2, attempt));
  // Add jitter: random value between -JITTER_MS and +JITTER_MS
  const jitter = (Math.random() * 2 - 1) * JITTER_MS;
  return Math.max(0, exponential + jitter);
}

/**
 * Execute an API call with retry logic.
 *
 * Implements exponential backoff with jitter for retryable errors.
 * PRD Section 17.3.2: 3 retries, 1000ms base, 8000ms max, +/-500ms jitter.
 *
 * @param fn - Async function to execute
 * @returns Result of the function
 * @throws Last error if all retries exhausted or error is not retryable
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if error is not retryable or we've exhausted retries
      if (!isRetryableError(error) || attempt >= MAX_RETRIES) {
        break;
      }

      const delay = calculateDelay(attempt);
      await sleep(delay);
    }
  }

  throw lastError ?? new Error('Unknown error during API call');
}

// ============================================================================
// Query Generation
// ============================================================================

/**
 * Google Place types to use for filtering search results.
 * Maps from interest categories to Google Place types.
 */
const INTEREST_TO_PLACE_TYPES: Record<string, string[]> = {
  food: ['restaurant', 'cafe', 'bakery', 'bar'],
  dining: ['restaurant', 'cafe'],
  coffee: ['cafe'],
  drinks: ['bar', 'night_club'],
  culture: ['museum', 'art_gallery'],
  history: ['museum'],
  art: ['art_gallery'],
  nature: ['park'],
  outdoors: ['park', 'campground'],
  shopping: ['shopping_mall', 'store'],
  wellness: ['spa', 'gym'],
  entertainment: ['movie_theater', 'night_club', 'bowling_alley'],
};

/**
 * Generate search queries based on session and enriched intent.
 *
 * Strategy:
 * 1. Primary destination + top interest query
 * 2. Destination + specific place types from interests
 * 3. Location-specific query (neighborhood if known)
 * 4. Best-rated query for the destination
 *
 * @param session - User session with destinations and interests
 * @param enrichedIntent - Enriched intent from router
 * @returns Array of search queries (up to MAX_QUERIES)
 */
export function generateQueries(
  session: Session,
  enrichedIntent: EnrichedIntent
): Array<{ query: string; type?: string }> {
  const queries: Array<{ query: string; type?: string }> = [];
  const destinations = enrichedIntent.destinations;
  const primaryDest = destinations[0] ?? session.destinations[0] ?? '';
  const interests = enrichedIntent.interests;

  if (!primaryDest) {
    return [];
  }

  // Query 1: Primary interest + destination
  const topInterest = interests[0];
  if (topInterest) {
    const placeTypes = INTEREST_TO_PLACE_TYPES[topInterest.toLowerCase()];
    queries.push({
      query: `best ${topInterest} in ${primaryDest}`,
      type: placeTypes?.[0],
    });
  } else {
    queries.push({
      query: `things to do in ${primaryDest}`,
      type: 'tourist_attraction',
    });
  }

  // Query 2: Secondary interest if available
  const secondInterest = interests[1];
  if (secondInterest) {
    const placeTypes = INTEREST_TO_PLACE_TYPES[secondInterest.toLowerCase()];
    queries.push({
      query: `${secondInterest} ${primaryDest}`,
      type: placeTypes?.[0],
    });
  }

  // Query 3: Top attractions in destination
  if (!queries.some((q) => q.type === 'tourist_attraction')) {
    queries.push({
      query: `top attractions in ${primaryDest}`,
      type: 'tourist_attraction',
    });
  }

  // Query 4: Restaurants if not already covered
  const hasFoodQuery = queries.some((q) =>
    ['restaurant', 'cafe', 'food', 'dining'].some(
      (term) => q.query.toLowerCase().includes(term) || q.type === 'restaurant'
    )
  );
  if (!hasFoodQuery) {
    queries.push({
      query: `best restaurants in ${primaryDest}`,
      type: 'restaurant',
    });
  }

  // Limit to MAX_QUERIES
  return queries.slice(0, MAX_QUERIES);
}

// ============================================================================
// Worker Implementation
// ============================================================================

/**
 * PlacesWorker implements the Worker interface for Google Places API.
 *
 * Uses the Places API to find verified locations, restaurants, and
 * attractions based on user intent. Returns candidates with coordinates,
 * ratings, and Google Maps URLs.
 *
 * Features:
 * - Generates multiple contextual search queries
 * - Fetches detailed information for top results
 * - Tracks API calls for cost management
 * - Returns partial results on errors
 *
 * @see PRD Section 7.3 - Google Places Worker
 * @see Task 10.3 - Worker Implementation
 */
export class PlacesWorker implements Worker {
  readonly id = 'places';
  readonly provider = 'places';

  private client: PlacesClient;

  /**
   * Create a new PlacesWorker.
   *
   * @param client - Google Places API client instance
   */
  constructor(client: PlacesClient) {
    this.client = client;
  }

  /**
   * Generate a worker assignment based on session and enriched intent.
   *
   * Creates search queries tailored to the user's destinations and interests.
   * Queries are optimized for Google Places API's text search.
   *
   * @param session - User session with travel intent
   * @param enrichedIntent - Enriched intent from router stage
   * @returns Worker assignment with queries and configuration
   */
  async plan(
    session: Session,
    enrichedIntent: EnrichedIntent
  ): Promise<WorkerAssignment> {
    const queryObjects = generateQueries(session, enrichedIntent);
    const queries = queryObjects.map((q) => q.query);

    return {
      workerId: this.id,
      queries,
      maxResults: DEFAULT_MAX_RESULTS,
      timeout: DEFAULT_TIMEOUT_MS,
    };
  }

  /**
   * Execute the worker assignment and return candidates.
   *
   * Processes each query through the Google Places API:
   * 1. Text search for places matching query
   * 2. Get details for top results
   * 3. Map to candidates
   *
   * Tracks API calls via costTracker and handles errors gracefully.
   *
   * @param assignment - Worker assignment with queries
   * @param context - Execution context with cost tracker
   * @returns Worker output with candidates and metadata
   */
  async execute(
    assignment: WorkerAssignment,
    context: WorkerContext
  ): Promise<WorkerOutput> {
    const startTime = Date.now();

    // Check circuit breaker before execution (PRD Section 17.3.3)
    if (context.circuitBreaker.isOpen(this.provider)) {
      return {
        workerId: this.id,
        status: 'skipped',
        candidates: [],
        error: 'Circuit breaker open - provider temporarily disabled',
        durationMs: Date.now() - startTime,
      };
    }

    // Reset call counter for this execution
    this.client.resetCallCount();

    const candidates: Candidate[] = [];
    const seenPlaceIds = new Set<string>();
    let lastError: string | undefined;
    let queriesSucceeded = 0;

    // Calculate timeout per query
    const totalTimeout = assignment.timeout || DEFAULT_TIMEOUT_MS;
    const perQueryTimeout = Math.floor(
      (totalTimeout * QUERY_TIMEOUT_FRACTION) / Math.max(assignment.queries.length, 1)
    );

    // Get destination for mapping context
    const destination = context.enrichedIntent.destinations[0] ?? '';

    // Generate query objects with types
    const queryObjects = generateQueries(context.session, context.enrichedIntent);

    // Execute each query with retry logic
    for (let i = 0; i < assignment.queries.length; i++) {
      const query = assignment.queries[i];
      const queryType = queryObjects[i]?.type;

      // Track time for this iteration to properly allocate timeout
      const iterationStartTime = Date.now();

      try {
        // Search for places
        const places = await withRetry<Place[]>(() =>
          this.client.textSearch(query, {
            type: queryType,
            timeoutMs: perQueryTimeout,
          })
        );

        // Track API call
        context.costTracker.addPlacesCall();

        // Filter out already seen places
        const newPlaces = places.filter((p) => !seenPlaceIds.has(p.placeId));
        newPlaces.forEach((p) => seenPlaceIds.add(p.placeId));

        // Fetch details for top results (if we have room)
        const remainingSlots = assignment.maxResults - candidates.length;
        const topPlaces = newPlaces.slice(0, Math.min(TOP_RESULTS_FOR_DETAILS, remainingSlots));

        // Calculate remaining timeout after search elapsed time
        const searchElapsed = Date.now() - iterationStartTime;
        const remainingTimeout = Math.max(100, perQueryTimeout - searchElapsed);

        const detailedPlaces = await this.fetchDetailsForPlaces(
          topPlaces,
          context,
          remainingTimeout
        );

        // Map places to candidates
        // detailedPlaces contains topPlaces with details where available (fallback to basic info)
        // Add remaining basic places that weren't included in topPlaces
        const allPlaces: Array<Place | PlaceDetails> = [];

        // Add places with details (or basic info as fallback)
        allPlaces.push(...detailedPlaces);

        // Add remaining basic places (those not in topPlaces)
        const topPlaceIds = new Set(topPlaces.map((p) => p.placeId));
        const remainingBasicPlaces = newPlaces
          .filter((p) => !topPlaceIds.has(p.placeId))
          .slice(0, remainingSlots - detailedPlaces.length);
        allPlaces.push(...remainingBasicPlaces);

        const mapped = mapPlacesToCandidates(allPlaces, destination);
        candidates.push(...mapped);

        queriesSucceeded++;

        // Record success with circuit breaker
        context.circuitBreaker.recordSuccess(this.provider);

        // Stop early if we have enough candidates
        if (candidates.length >= assignment.maxResults) {
          break;
        }
      } catch (error) {
        // Record failure with circuit breaker
        context.circuitBreaker.recordFailure(this.provider);
        lastError = error instanceof Error ? error.message : String(error);
        // Continue to next query
      }
    }

    // Candidates are already deduplicated by placeId during query processing (seenPlaceIds set)
    // Since candidateId is derived from placeId, no additional deduplication is needed
    const finalCandidates = candidates.slice(0, assignment.maxResults);
    const durationMs = Date.now() - startTime;

    // Determine status based on results
    if (queriesSucceeded === 0 && lastError) {
      return {
        workerId: this.id,
        status: 'error',
        candidates: [],
        error: lastError,
        durationMs,
      };
    }

    if (lastError && queriesSucceeded < assignment.queries.length) {
      return {
        workerId: this.id,
        status: 'partial',
        candidates: finalCandidates,
        error: lastError,
        durationMs,
      };
    }

    return {
      workerId: this.id,
      status: 'ok',
      candidates: finalCandidates,
      durationMs,
    };
  }

  /**
   * Fetch details for a list of places.
   *
   * Makes individual getPlaceDetails calls for each place.
   * Handles errors gracefully - falls back to basic Place info when details fail.
   *
   * @param places - Places to fetch details for
   * @param context - Worker context for cost tracking
   * @param timeoutMs - Timeout per request
   * @returns Array of Place or PlaceDetails (same length as input, basic info used for failures)
   */
  private async fetchDetailsForPlaces(
    places: Place[],
    context: WorkerContext,
    timeoutMs: number
  ): Promise<Array<Place | PlaceDetails>> {
    // Use a Map to track successful detail fetches
    const detailsMap = new Map<string, PlaceDetails>();

    for (const place of places) {
      try {
        const details = await withRetry<PlaceDetails>(() =>
          this.client.getPlaceDetails(place.placeId, timeoutMs)
        );
        context.costTracker.addPlacesCall();
        detailsMap.set(place.placeId, details);
      } catch {
        // Silently skip - basic info will be used as fallback
        // Don't record failure for individual detail fetches
      }
    }

    // Return detailed places where available, fall back to basic info otherwise
    return places.map((p) => detailsMap.get(p.placeId) ?? p);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Remove duplicate candidates by candidateId.
 *
 * @param candidates - Array of candidates (may have duplicates)
 * @returns Deduplicated array preserving first occurrence
 */
export function deduplicateCandidates(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (seen.has(c.candidateId)) {
      return false;
    }
    seen.add(c.candidateId);
    return true;
  });
}
