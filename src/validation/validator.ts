/**
 * Candidate Validator
 *
 * Validates travel candidates by cross-referencing with Perplexity.
 * Used in Stage 07 (Social Validation) to verify YouTube-derived candidates.
 *
 * @module validation/validator
 * @see PRD Section FR6 - Social Validation
 * @see TODO Section 15.2 - Validation logic
 */

import { z } from 'zod';
import type { Candidate, CandidateValidation } from '../schemas/candidate.js';
import type { ValidationStatus } from '../schemas/common.js';
import type { CostTracker } from '../pipeline/types.js';
import { PerplexityClient, type Message, isRetryableError } from '../workers/perplexity/client.js';
import { buildValidationPrompt, VALIDATION_SYSTEM_PROMPT } from './prompts.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default validation timeout in milliseconds.
 * @see TODO Section 15.2.3 - 3-second timeout per validation
 */
export const VALIDATION_TIMEOUT_MS = 3000;

/**
 * Maximum retries for validation API calls.
 */
const MAX_RETRIES = 2;

/**
 * Base delay for exponential backoff in milliseconds.
 */
const BASE_DELAY_MS = 500;

// ============================================================================
// Response Schema
// ============================================================================

/**
 * Schema for parsing Perplexity validation responses.
 *
 * Expects a JSON object with verification results.
 */
export const ValidationResponseSchema = z.object({
  exists: z.boolean().nullable(),
  locationCorrect: z.boolean().nullable(),
  isOperational: z.boolean().nullable(),
  hasRecentMentions: z.boolean().nullable().optional(),
  notes: z.string().optional(),
  sources: z.array(z.string()).optional(),
});

export type ValidationResponse = z.infer<typeof ValidationResponseSchema>;

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of validating a single candidate.
 */
export interface ValidationResult {
  /** The candidate that was validated */
  candidateId: string;

  /** Validation status */
  status: ValidationStatus;

  /** Detailed validation result */
  validation: CandidateValidation;

  /** Token usage for this validation */
  tokenUsage?: {
    input: number;
    output: number;
  };

  /** Duration in milliseconds */
  durationMs: number;
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
 *
 * @param content - Raw response content
 * @returns Extracted JSON string
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
 * Parse Perplexity response into ValidationResponse.
 *
 * @param content - Raw response content
 * @returns Parsed validation response or null if parsing fails
 */
function parseValidationResponse(content: string): ValidationResponse | null {
  try {
    const jsonStr = extractJson(content);
    const parsed = JSON.parse(jsonStr) as unknown;
    const result = ValidationResponseSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Determine validation status from response.
 *
 * @see TODO Section 15.2.5 - Parse validation response into status
 *
 * @param response - Parsed validation response
 * @returns Validation status
 */
function determineStatus(response: ValidationResponse): ValidationStatus {
  const { exists, locationCorrect, isOperational } = response;

  // If any field indicates a conflict (false), mark as conflict_detected
  if (exists === false || locationCorrect === false || isOperational === false) {
    return 'conflict_detected';
  }

  // If all verified fields are true, mark as verified
  if (exists === true && locationCorrect === true && isOperational === true) {
    return 'verified';
  }

  // If some fields are true but others are null, mark as partially_verified
  if (exists === true || locationCorrect === true || isOperational === true) {
    return 'partially_verified';
  }

  // If we couldn't verify anything, mark as unverified
  return 'unverified';
}

// ============================================================================
// Validator Implementation
// ============================================================================

/**
 * Validator class for validating candidates using Perplexity.
 *
 * @see TODO Section 15.2 - Validation logic
 */
export class CandidateValidator {
  private client: PerplexityClient;

  /**
   * Create a new CandidateValidator.
   *
   * @param client - Optional Perplexity client (creates new one if not provided)
   */
  constructor(client?: PerplexityClient) {
    this.client = client ?? new PerplexityClient();
  }

  /**
   * Validate a single candidate using Perplexity.
   *
   * @see TODO Section 15.2.1 - validateCandidate implementation
   * @see TODO Section 15.2.2 - Call Perplexity to verify
   * @see TODO Section 15.2.3 - 3-second timeout per validation
   * @see TODO Section 15.2.4 - Handle timeout/error as unverified
   *
   * @param candidate - Candidate to validate
   * @param costTracker - Optional cost tracker for token usage
   * @returns Validation result
   */
  async validateCandidate(
    candidate: Candidate,
    costTracker?: CostTracker
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const location = candidate.locationText ?? 'Unknown location';

    // Build validation prompt
    const prompt = buildValidationPrompt(candidate.title, location);
    const messages: Message[] = [
      { role: 'system', content: VALIDATION_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    // Attempt validation with retries
    let lastError: Error | undefined;
    let response: ValidationResponse | null = null;
    let tokenUsage: { input: number; output: number } | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const chatResponse = await this.client.chat(messages, {
          timeoutMs: VALIDATION_TIMEOUT_MS,
          temperature: 0.1, // Low temperature for fact-checking
          maxTokens: 500, // Validation responses are short
        });

        // Track token usage
        tokenUsage = {
          input: chatResponse.usage.inputTokens,
          output: chatResponse.usage.outputTokens,
        };

        if (costTracker) {
          costTracker.addTokenUsage(
            'perplexity',
            chatResponse.usage.inputTokens,
            chatResponse.usage.outputTokens
          );
        }

        // Parse response
        response = parseValidationResponse(chatResponse.content);
        break; // Success, exit retry loop
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

    const durationMs = Date.now() - startTime;

    // Handle timeout/error as unverified
    // @see TODO Section 15.2.4
    if (!response) {
      return {
        candidateId: candidate.candidateId,
        status: 'unverified',
        validation: {
          status: 'unverified',
          notes: lastError?.message ?? 'Validation failed or timed out',
        },
        tokenUsage,
        durationMs,
      };
    }

    // Determine status and build result
    const status = determineStatus(response);
    const sourceRefs = (response.sources ?? []).map((url) => ({
      url,
      retrievedAt: new Date().toISOString(),
    }));

    return {
      candidateId: candidate.candidateId,
      status,
      validation: {
        status,
        notes: response.notes,
        sources: sourceRefs.length > 0 ? sourceRefs : undefined,
      },
      tokenUsage,
      durationMs,
    };
  }
}

// ============================================================================
// Convenience Function
// ============================================================================

/**
 * Validate a single candidate (convenience function).
 *
 * Creates a new validator instance for one-off validations.
 * For batch validation, use CandidateValidator class directly.
 *
 * @param candidate - Candidate to validate
 * @param costTracker - Optional cost tracker
 * @returns Validation result
 */
export async function validateCandidate(
  candidate: Candidate,
  costTracker?: CostTracker
): Promise<ValidationResult> {
  const validator = new CandidateValidator();
  return validator.validateCandidate(candidate, costTracker);
}
