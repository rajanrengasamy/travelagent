/**
 * OpenAI Chat Client
 *
 * Client for OpenAI chat completions API used by the aggregator.
 * Handles authentication, timeouts, and response parsing.
 *
 * @module aggregator/client
 * @see PRD Section 14.5 - Aggregator
 * @see TODO Section 17.3 - Aggregator logic
 */

import OpenAI from 'openai';
import { getModelConfig } from '../config/models.js';
import { AGGREGATOR_TIMEOUT_MS } from './types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Message in the chat conversation.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Options for chat completion requests.
 */
export interface ChatOptions {
  /** Model to use (overrides config) */
  model?: string;
  /** Temperature for response randomness */
  temperature?: number;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Response from the chat completion API.
 */
export interface ChatResponse {
  /** Generated text content */
  content: string;
  /** Token usage statistics */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Model that was used */
  model: string;
  /** Finish reason */
  finishReason: string;
}

/**
 * OpenAI API error with additional context.
 */
export class OpenAIApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly isRetryable: boolean
  ) {
    super(message);
    this.name = 'OpenAIApiError';
  }
}

// ============================================================================
// Client Implementation
// ============================================================================

/**
 * Singleton OpenAI client instance.
 */
let openaiClient: OpenAI | null = null;

/**
 * Get or create the singleton OpenAI client.
 *
 * @returns OpenAI client instance
 * @throws Error if OPENAI_API_KEY is not set
 */
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY environment variable is not set. ' +
          'Please set it in your .env file or environment.'
      );
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Reset the client (useful for testing).
 */
export function resetOpenAIClient(): void {
  openaiClient = null;
}

/**
 * Send a chat completion request to OpenAI.
 *
 * @see TODO Section 17.3.2 - Call GPT-5.2 with aggregator prompt
 * @see TODO Section 17.3.3 - Implement 20-second timeout
 *
 * @param messages - Conversation messages
 * @param options - Request options
 * @returns Chat response with content and usage
 * @throws OpenAIApiError on API errors or timeout
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<ChatResponse> {
  const client = getOpenAIClient();
  const config = getModelConfig('aggregator');

  const model = options.model ?? config.modelId;
  const temperature = options.temperature ?? config.temperature;
  const maxTokens = options.maxTokens ?? config.maxOutputTokens;
  const timeoutMs = options.timeoutMs ?? AGGREGATOR_TIMEOUT_MS;

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.chat.completions.create(
      {
        model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      },
      {
        signal: controller.signal,
      }
    );

    const choice = response.choices[0];
    if (!choice?.message?.content) {
      throw new OpenAIApiError('Empty response from OpenAI', 500, true);
    }

    return {
      content: choice.message.content,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      model: response.model,
      finishReason: choice.finish_reason ?? 'unknown',
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new OpenAIApiError(
        `Request timed out after ${timeoutMs}ms`,
        408,
        true
      );
    }

    if (error instanceof OpenAI.APIError) {
      const isRetryable =
        error.status === 429 || // Rate limit
        error.status === 500 || // Server error
        error.status === 502 || // Bad gateway
        error.status === 503 || // Service unavailable
        error.status === 504; // Gateway timeout

      throw new OpenAIApiError(
        error.message,
        error.status ?? 500,
        isRetryable
      );
    }

    // Re-throw OpenAIApiError as-is
    if (error instanceof OpenAIApiError) {
      throw error;
    }

    throw new OpenAIApiError(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      true
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an error is an OpenAI API error.
 */
export function isOpenAIApiError(error: unknown): error is OpenAIApiError {
  return error instanceof OpenAIApiError;
}

/**
 * Check if an error is retryable.
 *
 * @param error - Error to check
 * @returns true if the error is transient and worth retrying
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof OpenAIApiError) {
    return error.isRetryable;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('rate limit') ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('503') ||
      message.includes('500') ||
      message.includes('502') ||
      message.includes('504')
    );
  }

  return false;
}
