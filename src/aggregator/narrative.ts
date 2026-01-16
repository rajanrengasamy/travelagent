/**
 * Narrative Generator
 *
 * Generates travel narratives from candidate data using GPT.
 * Handles prompt building, response parsing, and validation.
 *
 * @module aggregator/narrative
 * @see PRD Section 14.5 - Aggregator
 * @see TODO Section 17.2 - Narrative generation
 */

import type { Candidate } from '../schemas/candidate.js';
import type { CostTracker } from '../pipeline/types.js';
import { chatCompletion, isRetryableError, type ChatMessage } from './client.js';
import { AGGREGATOR_SYSTEM_PROMPT, buildAggregatorPrompt } from './prompts.js';
import {
  type NarrativeOutput,
  NarrativeOutputSchema,
  AGGREGATOR_TIMEOUT_MS,
  MAX_RETRIES,
  BASE_DELAY_MS,
} from './types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Session context for narrative personalization.
 */
export interface SessionContext {
  destination?: string;
  travelDates?: string;
  interests?: string[];
  budget?: string;
}

/**
 * Result of narrative generation.
 */
export interface NarrativeResult {
  /** Generated narrative (null on failure) */
  narrative: NarrativeOutput | null;
  /** Token usage */
  tokenUsage?: {
    input: number;
    output: number;
  };
  /** Duration in milliseconds */
  durationMs: number;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract JSON from a response that might contain markdown code blocks.
 */
function extractJson(content: string): string {
  // Try to find JSON in markdown code block
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find JSON object directly
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return content;
}

/**
 * Parse and validate the narrative response.
 */
function parseNarrativeResponse(content: string): NarrativeOutput | null {
  try {
    const jsonStr = extractJson(content);
    const parsed = JSON.parse(jsonStr) as unknown;
    const result = NarrativeOutputSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }

    // Log validation errors for debugging
    console.warn('[narrative] Schema validation failed:', result.error.message);
    return null;
  } catch (error) {
    console.warn('[narrative] JSON parse failed:', error);
    return null;
  }
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Generate a narrative from candidates using GPT.
 *
 * @see TODO Section 17.2.1 - Implement generateNarrative
 * @see TODO Section 17.2.2 - Structure output with sections, highlights, and recommendations
 *
 * @param candidates - Validated and ranked candidates
 * @param session - Optional session context for personalization
 * @param costTracker - Optional cost tracker
 * @returns Narrative result with output or error
 */
export async function generateNarrative(
  candidates: Candidate[],
  session?: SessionContext,
  costTracker?: CostTracker
): Promise<NarrativeResult> {
  const startTime = Date.now();

  // Handle empty input
  if (candidates.length === 0) {
    return {
      narrative: null,
      durationMs: Date.now() - startTime,
      error: 'No candidates to aggregate',
    };
  }

  // Build messages for the LLM
  const messages: ChatMessage[] = [
    { role: 'system', content: AGGREGATOR_SYSTEM_PROMPT },
    { role: 'user', content: buildAggregatorPrompt(candidates, session) },
  ];

  // Attempt with retries
  let lastError: Error | undefined;
  let tokenUsage: { input: number; output: number } | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await chatCompletion(messages, {
        timeoutMs: AGGREGATOR_TIMEOUT_MS,
      });

      // Track token usage
      tokenUsage = {
        input: response.usage.inputTokens,
        output: response.usage.outputTokens,
      };

      if (costTracker) {
        costTracker.addTokenUsage(
          'openai',
          response.usage.inputTokens,
          response.usage.outputTokens
        );
      }

      // Parse response
      const narrative = parseNarrativeResponse(response.content);

      if (narrative) {
        return {
          narrative,
          tokenUsage,
          durationMs: Date.now() - startTime,
        };
      }

      // Failed to parse - treat as retryable
      lastError = new Error('Failed to parse narrative response');
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry non-retryable errors
      if (!isRetryableError(error) || attempt >= MAX_RETRIES) {
        break;
      }

      // Exponential backoff
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  // All attempts failed
  return {
    narrative: null,
    tokenUsage,
    durationMs: Date.now() - startTime,
    error: lastError?.message ?? 'Narrative generation failed',
  };
}
