/**
 * Perplexity Web Knowledge Worker
 *
 * Implements the Worker interface for Perplexity API.
 * Generates search queries from session intent and extracts
 * travel candidates from AI responses.
 *
 * @module workers/perplexity/worker
 * @see PRD Section 7.2 - Perplexity Worker
 * @see Task 9.3 - Worker Implementation
 */

import type { Worker, WorkerContext } from '../types.js';
import type { Session } from '../../schemas/session.js';
import type {
  EnrichedIntent,
  WorkerAssignment,
  WorkerOutput,
} from '../../schemas/worker.js';
import type { Candidate } from '../../schemas/candidate.js';
import type { PerplexityClient, Message, ChatResponse } from './client.js';
import { isRetryableError } from './client.js';
import { parsePerplexityResponse } from './parser.js';
import { buildSearchPrompt, PERPLEXITY_SYSTEM_PROMPT } from './prompts.js';

// ============================================================================
// Constants
// ============================================================================

/** Default maximum candidates to return */
const DEFAULT_MAX_RESULTS = 15;

/** Default timeout for worker execution (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30000;

/** Maximum queries to generate per execution */
const MAX_QUERIES = 4;

/** Time allocated per query (fraction of total timeout) */
const QUERY_TIMEOUT_FRACTION = 0.8;

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

/**
 * Generate search queries based on session and enriched intent.
 *
 * Strategy:
 * 1. Primary destination + main interests query
 * 2. Secondary interests / niche activities query
 * 3. Seasonal/timing specific query (if date context relevant)
 * 4. Constraints-based query (budget, dietary, etc.)
 *
 * @param session - User session with destinations and interests
 * @param enrichedIntent - Enriched intent from router
 * @returns Array of search queries (3-4 queries)
 */
function generateQueries(
  session: Session,
  enrichedIntent: EnrichedIntent
): string[] {
  const queries: string[] = [];
  const destinations = enrichedIntent.destinations;
  const primaryDest = destinations[0] ?? session.destinations[0] ?? '';
  const interests = enrichedIntent.interests;
  const inferredTags = enrichedIntent.inferredTags;
  const constraints = enrichedIntent.constraints;

  if (!primaryDest) {
    return [];
  }

  // Query 1: Primary destination + top interests
  const topInterests = interests.slice(0, 3);
  if (topInterests.length > 0) {
    queries.push(
      `Best ${topInterests.join(' and ')} experiences in ${primaryDest}`
    );
  } else {
    queries.push(`Hidden gems and unique local experiences in ${primaryDest}`);
  }

  // Query 2: Niche / specific interest query
  const nicheInterests = interests.slice(3, 5);
  if (nicheInterests.length > 0) {
    queries.push(
      `${nicheInterests.join(' and ')} recommendations in ${primaryDest}`
    );
  } else if (inferredTags.length > 0) {
    // Use inferred tags for niche query
    queries.push(
      `${inferredTags.slice(0, 2).join(' and ')} activities in ${primaryDest}`
    );
  }

  // Query 3: Seasonal/timing query
  const dateRange = enrichedIntent.dateRange;
  const startDate = new Date(dateRange.start);
  const month = startDate.toLocaleString('en-US', { month: 'long' });
  const year = startDate.getFullYear();
  queries.push(
    `Things to do in ${primaryDest} in ${month} ${year} - local events and seasonal activities`
  );

  // Query 4: Constraints-based query (if any)
  if (constraints) {
    const constraintParts: string[] = [];

    if (constraints.budget === 'budget' || constraints.budget === 'low') {
      constraintParts.push('budget-friendly');
    } else if (constraints.budget === 'luxury' || constraints.budget === 'high') {
      constraintParts.push('luxury');
    }

    if (constraints.familyFriendly || constraints.kids) {
      constraintParts.push('family-friendly');
    }

    if (constraints.accessibility) {
      constraintParts.push('accessible');
    }

    if (constraintParts.length > 0) {
      queries.push(
        `${constraintParts.join(' ')} ${interests[0] ?? 'activities'} in ${primaryDest}`
      );
    }
  }

  // Limit to MAX_QUERIES
  return queries.slice(0, MAX_QUERIES);
}

// ============================================================================
// Worker Implementation
// ============================================================================

/**
 * PerplexityWorker implements the Worker interface for web knowledge discovery.
 *
 * Uses Perplexity's sonar models to search for travel recommendations,
 * hidden gems, and local experiences based on user intent.
 *
 * Features:
 * - Generates multiple contextual search queries
 * - Extracts discrete candidates from AI responses
 * - Tracks token usage for cost management
 * - Returns partial results on errors
 *
 * @see PRD Section 7.2 - Perplexity Worker
 * @see Task 9.3 - Worker Implementation
 */
export class PerplexityWorker implements Worker {
  readonly id = 'perplexity';
  readonly provider = 'perplexity';

  private client: PerplexityClient;

  /**
   * Create a new PerplexityWorker.
   *
   * @param client - Perplexity API client instance
   */
  constructor(client: PerplexityClient) {
    this.client = client;
  }

  /**
   * Generate a worker assignment based on session and enriched intent.
   *
   * Creates search queries tailored to the user's destinations, interests,
   * travel dates, and constraints.
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
   * Processes each query through the Perplexity API, parses responses
   * into candidates, and tracks token usage. Returns partial results
   * if some queries fail.
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

    const candidates: Candidate[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let lastError: string | undefined;
    let queriesSucceeded = 0;

    // Calculate timeout per query
    const totalTimeout = assignment.timeout || DEFAULT_TIMEOUT_MS;
    const perQueryTimeout = Math.floor(
      (totalTimeout * QUERY_TIMEOUT_FRACTION) / Math.max(assignment.queries.length, 1)
    );

    // Execute each query with retry logic (PRD Section 17.3.2)
    for (const query of assignment.queries) {
      try {
        const prompt = buildSearchPrompt(query, context.enrichedIntent);
        const messages: Message[] = [
          { role: 'system', content: PERPLEXITY_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ];

        // Wrap API call with retry logic for transient errors
        const response = await withRetry<ChatResponse>(() =>
          this.client.chat(messages, {
            timeoutMs: perQueryTimeout,
          })
        );

        // Track token usage
        totalInputTokens += response.usage.inputTokens;
        totalOutputTokens += response.usage.outputTokens;
        context.costTracker.addPerplexity(
          response.usage.inputTokens,
          response.usage.outputTokens
        );

        // Parse candidates from response
        const destination = context.enrichedIntent.destinations[0] ?? '';
        const parsed = parsePerplexityResponse(response, destination);
        candidates.push(...parsed);
        queriesSucceeded++;

        // Record success with circuit breaker (resets failure counter)
        context.circuitBreaker.recordSuccess(this.provider);

        // Stop early if we have enough candidates
        if (candidates.length >= assignment.maxResults) {
          break;
        }
      } catch (error) {
        // Record failure with circuit breaker (may open circuit after threshold)
        context.circuitBreaker.recordFailure(this.provider);
        // All retries exhausted or non-retryable error - continue with other queries
        lastError = error instanceof Error ? error.message : String(error);
        // Continue to next query
      }
    }

    // Deduplicate candidates by ID
    const uniqueCandidates = deduplicateCandidates(candidates);
    const finalCandidates = uniqueCandidates.slice(0, assignment.maxResults);
    const durationMs = Date.now() - startTime;

    // Determine status based on results
    if (queriesSucceeded === 0 && lastError) {
      // All queries failed
      return {
        workerId: this.id,
        status: 'error',
        candidates: [],
        error: lastError,
        durationMs,
      };
    }

    if (lastError && queriesSucceeded < assignment.queries.length) {
      // Some queries failed, return partial results
      return {
        workerId: this.id,
        status: 'partial',
        candidates: finalCandidates,
        error: lastError,
        durationMs,
        tokenUsage: {
          input: totalInputTokens,
          output: totalOutputTokens,
        },
      };
    }

    // All queries succeeded
    return {
      workerId: this.id,
      status: 'ok',
      candidates: finalCandidates,
      durationMs,
      tokenUsage: {
        input: totalInputTokens,
        output: totalOutputTokens,
      },
    };
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
function deduplicateCandidates(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (seen.has(c.candidateId)) {
      return false;
    }
    seen.add(c.candidateId);
    return true;
  });
}

// ============================================================================
// Exports
// ============================================================================

// Export query generation helpers for testing
export { generateQueries, deduplicateCandidates };
