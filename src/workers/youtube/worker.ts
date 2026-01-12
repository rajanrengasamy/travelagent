/**
 * YouTube Social Signals Worker
 *
 * Implements the Worker interface for YouTube video discovery.
 * Searches for travel videos, fetches transcripts, and extracts
 * candidate recommendations using LLM.
 *
 * @module workers/youtube/worker
 * @see PRD Section 15 - YouTube Social Signals
 * @see Task 11.6 - Worker Implementation
 */

import type { Worker, WorkerContext } from '../types.js';
import type { Session } from '../../schemas/session.js';
import type {
  EnrichedIntent,
  WorkerAssignment,
  WorkerOutput,
} from '../../schemas/worker.js';
import type { Candidate } from '../../schemas/candidate.js';
import {
  YouTubeClient,
  isQuotaExceededError,
  isRetryableError as isClientRetryableError,
  type VideoDetails,
} from './client.js';
import { fetchTranscript, isRetryableTranscriptError } from './transcript.js';
import { filterVideos, sortByQuality } from './filters.js';
import { extractCandidatesFromTranscript, type YouTubeCandidate } from './extractor.js';

// ============================================================================
// Constants
// ============================================================================

/** Default maximum candidates to return */
const DEFAULT_MAX_RESULTS = 10;

/** Default timeout for worker execution (45 seconds) */
const DEFAULT_TIMEOUT_MS = 45000;

/** Maximum search queries to generate */
const MAX_QUERIES = 5;

/** Maximum videos to process per query */
const MAX_VIDEOS_PER_QUERY = 5;

/** Timeout for individual transcript fetch (10 seconds) */
const TRANSCRIPT_TIMEOUT_MS = 10000;

/** Timeout for individual LLM extraction (15 seconds) */
const EXTRACTION_TIMEOUT_MS = 15000;

// ============================================================================
// Retry Configuration (PRD Section 17.3.2)
// ============================================================================

const YOUTUBE_API_RETRY = {
  maxRetries: 2,
  baseDelayMs: 1000,
  maxDelayMs: 4000,
  jitterMs: 500,
};

const TRANSCRIPT_RETRY = {
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 2000,
  jitterMs: 200,
};

// ============================================================================
// Retry Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateDelay(
  attempt: number,
  config: { baseDelayMs: number; maxDelayMs: number; jitterMs: number }
): number {
  const exponential = Math.min(config.maxDelayMs, config.baseDelayMs * Math.pow(2, attempt));
  const jitter = (Math.random() * 2 - 1) * config.jitterMs;
  return Math.max(0, exponential + jitter);
}

async function withRetry<T>(
  fn: () => Promise<T>,
  isRetryable: (error: unknown) => boolean,
  config: { maxRetries: number; baseDelayMs: number; maxDelayMs: number; jitterMs: number }
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryable(error) || attempt >= config.maxRetries) {
        break;
      }

      const delay = calculateDelay(attempt, config);
      await sleep(delay);
    }
  }

  throw lastError ?? new Error('Unknown error during API call');
}

// ============================================================================
// Query Generation
// ============================================================================

/**
 * Generate YouTube search queries based on session and enriched intent.
 *
 * Creates 3-5 queries following PRD Section 15.5:
 * - "{destination} travel guide"
 * - "{destination} things to do"
 * - "{destination} hidden gems"
 * - "{destination} {interest}" for top interests
 * - "{destination} food tour" or similar for food-focused trips
 *
 * @param session - User session with destinations and interests
 * @param enrichedIntent - Enriched intent from router
 * @returns Array of search queries (3-5 queries)
 */
function generateQueries(
  session: Session,
  enrichedIntent: EnrichedIntent
): string[] {
  const queries: string[] = [];
  const destinations = enrichedIntent.destinations;
  const primaryDest = destinations[0] ?? session.destinations[0] ?? '';
  const interests = enrichedIntent.interests;

  if (!primaryDest) {
    return [];
  }

  // Query 1: General travel guide
  queries.push(`${primaryDest} travel guide`);

  // Query 2: Things to do
  queries.push(`${primaryDest} things to do`);

  // Query 3: Hidden gems
  queries.push(`${primaryDest} hidden gems local tips`);

  // Query 4-5: Interest-specific queries
  if (interests.length > 0) {
    // Food-related interests
    const foodInterests = interests.filter((i) =>
      ['food', 'restaurants', 'cuisine', 'dining', 'eating'].some((f) =>
        i.toLowerCase().includes(f)
      )
    );

    if (foodInterests.length > 0) {
      queries.push(`${primaryDest} best food where to eat`);
    } else {
      // Use top interest
      queries.push(`${primaryDest} ${interests[0]}`);
    }

    // Add second interest if available
    if (interests.length > 1) {
      queries.push(`${primaryDest} ${interests[1]}`);
    }
  }

  // Limit to MAX_QUERIES and deduplicate
  const uniqueQueries = [...new Set(queries)];
  return uniqueQueries.slice(0, MAX_QUERIES);
}

// ============================================================================
// Worker Implementation
// ============================================================================

/**
 * YouTubeWorker implements the Worker interface for social signals discovery.
 *
 * Workflow:
 * 1. Generate search queries based on session intent
 * 2. Search YouTube for relevant travel videos
 * 3. Fetch video details and filter by quality
 * 4. Fetch transcripts for qualifying videos
 * 5. Extract candidate recommendations via LLM
 *
 * Error Handling:
 * - Quota exceeded: Disables worker for the run
 * - Transcript unavailable: Skips video, continues with others
 * - Extraction failure: Skips video, continues with others
 *
 * @see PRD Section 15 - YouTube Social Signals
 * @see Task 11.6 - Worker Implementation
 */
export class YouTubeWorker implements Worker {
  readonly id = 'youtube';
  readonly provider = 'youtube';

  private client: YouTubeClient;
  private quotaExceeded = false;

  /**
   * Create a new YouTubeWorker.
   *
   * @param client - Optional YouTube API client (creates new if not provided)
   */
  constructor(client?: YouTubeClient) {
    this.client = client ?? new YouTubeClient();
  }

  /**
   * Generate a worker assignment based on session and enriched intent.
   *
   * Creates YouTube-optimized search queries.
   *
   * @param session - User session with travel intent
   * @param enrichedIntent - Enriched intent from router stage
   * @returns Worker assignment with queries and configuration
   */
  async plan(
    session: Session,
    enrichedIntent: EnrichedIntent
  ): Promise<WorkerAssignment> {
    const queries = generateQueries(session, enrichedIntent);

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
   * Implements the full YouTube discovery pipeline:
   * 1. Search for videos
   * 2. Get video details
   * 3. Filter by quality
   * 4. Fetch transcripts
   * 5. Extract candidates via LLM
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

    // Check circuit breaker before execution
    if (context.circuitBreaker.isOpen(this.provider)) {
      return {
        workerId: this.id,
        status: 'skipped',
        candidates: [],
        error: 'Circuit breaker open - provider temporarily disabled',
        durationMs: Date.now() - startTime,
      };
    }

    // Check if quota was exceeded earlier
    if (this.quotaExceeded) {
      return {
        workerId: this.id,
        status: 'skipped',
        candidates: [],
        error: 'YouTube API quota exceeded - disabled for this run',
        durationMs: Date.now() - startTime,
      };
    }

    const candidates: Candidate[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let lastError: string | undefined;
    let videosProcessed = 0;
    let transcriptsFetched = 0;

    try {
      // Step 1: Search for videos and get details
      const { videos: allVideos, hadSuccessfulSearch } = await this.searchAndGetDetails(
        assignment.queries,
        context
      );

      // If no searches succeeded and no videos found, return error status
      if (allVideos.length === 0 && !hadSuccessfulSearch) {
        return {
          workerId: this.id,
          status: 'error',
          candidates: [],
          error: 'All YouTube search queries failed',
          durationMs: Date.now() - startTime,
        };
      }

      // Step 2: Filter by quality
      const filteredVideos = filterVideos(allVideos);
      const sortedVideos = sortByQuality(filteredVideos);

      // Step 3: Process videos (transcript + extraction)
      const maxVideos = Math.min(sortedVideos.length, assignment.maxResults);
      const destination = context.enrichedIntent.destinations[0] ?? '';

      for (let i = 0; i < maxVideos && candidates.length < assignment.maxResults; i++) {
        const video = sortedVideos[i];
        videosProcessed++;

        // Track extraction token usage even if extraction fails
        let extractionTokens = { input: 0, output: 0 };
        try {
          // Fetch transcript with retry
          const transcript = await withRetry(
            () => fetchTranscript(video.videoId, TRANSCRIPT_TIMEOUT_MS),
            isRetryableTranscriptError,
            TRANSCRIPT_RETRY
          );

          if (!transcript) {
            // No transcript available, skip this video
            continue;
          }

          transcriptsFetched++;

          // Extract candidates from transcript
          const result = await extractCandidatesFromTranscript(
            transcript,
            video,
            destination,
            { timeoutMs: EXTRACTION_TIMEOUT_MS }
          );

          extractionTokens = result.tokenUsage;
          candidates.push(...result.candidates);

          // Track token usage with cost tracker
          context.costTracker.addGemini(result.tokenUsage.input, result.tokenUsage.output);

          // Record success with circuit breaker
          context.circuitBreaker.recordSuccess(this.provider);
        } catch (error) {
          // Log but continue with other videos
          lastError = error instanceof Error ? error.message : String(error);

          // Only skip recording for non-fatal "transcript unavailable" errors
          // Other transcript errors (e.g., network failures) should still trip the breaker
          const isTranscriptUnavailable =
            error instanceof Error &&
            (error.message.includes('Transcript is disabled') ||
              error.message.includes('No transcript available'));

          if (!isTranscriptUnavailable) {
            context.circuitBreaker.recordFailure(this.provider);
          }
        } finally {
          // Always track token usage, even partial usage from failed extractions
          totalInputTokens += extractionTokens.input;
          totalOutputTokens += extractionTokens.output;
        }
      }
    } catch (error) {
      // Handle quota exceeded
      if (isQuotaExceededError(error)) {
        this.quotaExceeded = true;
        context.circuitBreaker.recordFailure(this.provider);

        return {
          workerId: this.id,
          status: candidates.length > 0 ? 'partial' : 'error',
          candidates: candidates as YouTubeCandidate[],
          error: 'YouTube API quota exceeded',
          durationMs: Date.now() - startTime,
          tokenUsage:
            totalInputTokens > 0 || totalOutputTokens > 0
              ? { input: totalInputTokens, output: totalOutputTokens }
              : undefined,
        };
      }

      context.circuitBreaker.recordFailure(this.provider);
      lastError = error instanceof Error ? error.message : String(error);
    }

    // Track YouTube API quota usage
    const quotaUsage = this.client.getQuotaUsage();
    context.costTracker.addYouTubeUnits(quotaUsage.totalUnits);

    const durationMs = Date.now() - startTime;

    // Determine final status
    if (candidates.length === 0 && lastError) {
      return {
        workerId: this.id,
        status: 'error',
        candidates: [],
        error: lastError,
        durationMs,
      };
    }

    if (lastError && candidates.length > 0) {
      return {
        workerId: this.id,
        status: 'partial',
        candidates: candidates as YouTubeCandidate[],
        error: lastError,
        durationMs,
        tokenUsage: { input: totalInputTokens, output: totalOutputTokens },
      };
    }

    return {
      workerId: this.id,
      status: 'ok',
      candidates: candidates as YouTubeCandidate[],
      durationMs,
      tokenUsage:
        totalInputTokens > 0 || totalOutputTokens > 0
          ? { input: totalInputTokens, output: totalOutputTokens }
          : undefined,
    };
  }

  /**
   * Search for videos and get their details.
   *
   * @param queries - Search queries
   * @param context - Execution context
   * @returns Object with video details and success indicator
   */
  private async searchAndGetDetails(
    queries: string[],
    context: WorkerContext
  ): Promise<{ videos: VideoDetails[]; hadSuccessfulSearch: boolean }> {
    const allVideoIds = new Set<string>();
    const allVideos: VideoDetails[] = [];
    let hadSuccessfulSearch = false;

    // Calculate published after date (2 years ago)
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const publishedAfter = twoYearsAgo.toISOString();

    // Execute searches
    for (const query of queries) {
      try {
        const searchResults = await withRetry(
          () =>
            this.client.search(query, {
              maxResults: MAX_VIDEOS_PER_QUERY,
              order: 'relevance',
              videoDuration: 'medium', // 4-20 minutes
              publishedAfter,
            }),
          isClientRetryableError,
          YOUTUBE_API_RETRY
        );

        hadSuccessfulSearch = true;

        // Collect unique video IDs
        for (const result of searchResults) {
          if (!allVideoIds.has(result.videoId)) {
            allVideoIds.add(result.videoId);
          }
        }

        context.circuitBreaker.recordSuccess(this.provider);
      } catch (error) {
        if (isQuotaExceededError(error)) {
          throw error; // Propagate quota errors
        }
        context.circuitBreaker.recordFailure(this.provider);
        // Continue with other queries
      }
    }

    // Get details for all videos
    if (allVideoIds.size > 0) {
      try {
        const details = await withRetry(
          () => this.client.getVideoDetails(Array.from(allVideoIds)),
          isClientRetryableError,
          YOUTUBE_API_RETRY
        );

        allVideos.push(...details);
        context.circuitBreaker.recordSuccess(this.provider);
      } catch (error) {
        if (isQuotaExceededError(error)) {
          throw error;
        }
        context.circuitBreaker.recordFailure(this.provider);
      }
    }

    return { videos: allVideos, hadSuccessfulSearch };
  }

  /**
   * Reset worker state for a new run.
   */
  reset(): void {
    this.quotaExceeded = false;
    this.client.resetQuotaUsage();
  }
}

// ============================================================================
// Exports
// ============================================================================

export { generateQueries };
