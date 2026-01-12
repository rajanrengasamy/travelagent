/**
 * Perplexity API Client
 *
 * Low-level client for the Perplexity chat completions API.
 * Handles authentication, request formatting, rate limiting,
 * error handling, and token usage tracking.
 *
 * @module workers/perplexity/client
 * @see PRD FR5.1 - Perplexity Worker
 * @see Task 9.1 - Perplexity API Client
 */

import { requireApiKey } from '../../config/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Message in the chat conversation
 */
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Options for chat completion requests
 */
export interface ChatOptions {
  /** Model to use (default: sonar-pro) */
  model?: string;
  /** Temperature for response randomness (default: 0.2) */
  temperature?: number;
  /** Maximum tokens in response (default: 4000) */
  maxTokens?: number;
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

/**
 * Citation from Perplexity's web search
 */
export interface Citation {
  /** Source URL */
  url: string;
  /** Page or source title */
  title?: string;
  /** Relevant snippet from the source */
  snippet?: string;
}

/**
 * Response from the chat completion API
 */
export interface ChatResponse {
  /** Generated text content */
  content: string;
  /** Citations from web sources */
  citations: Citation[];
  /** Token usage statistics */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Model that was used */
  model: string;
}

/**
 * Perplexity API error with additional context
 */
export class PerplexityApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly isRetryable: boolean
  ) {
    super(message);
    this.name = 'PerplexityApiError';
  }
}

// ============================================================================
// API Response Types (Internal)
// ============================================================================

/**
 * Raw API response structure from Perplexity
 */
interface PerplexityApiResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  choices: Array<{
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
    delta?: {
      role: string;
      content: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  citations?: string[];
}

// ============================================================================
// Client Implementation
// ============================================================================

/**
 * Default configuration values
 */
const DEFAULTS = {
  model: 'sonar-pro',
  temperature: 0.2,
  maxTokens: 4000,
  timeoutMs: 30000,
} as const;

/**
 * PerplexityClient provides access to the Perplexity AI API.
 *
 * Features:
 * - Chat completions with web search capabilities
 * - Automatic citation extraction
 * - Token usage tracking for cost calculation
 * - Rate limiting and error handling
 * - Request timeout via AbortController
 *
 * @example
 * ```typescript
 * const client = new PerplexityClient();
 *
 * const response = await client.chat([
 *   { role: 'system', content: 'You are a travel expert.' },
 *   { role: 'user', content: 'Best restaurants in Tokyo for sushi' }
 * ]);
 *
 * console.log(response.content);
 * console.log(`Citations: ${response.citations.length}`);
 * console.log(`Tokens: ${response.usage.inputTokens} in, ${response.usage.outputTokens} out`);
 * ```
 */
export class PerplexityClient {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.perplexity.ai';
  private readonly defaultModel = DEFAULTS.model;

  /**
   * Create a new Perplexity client.
   *
   * @throws Error if PERPLEXITY_API_KEY is not set
   */
  constructor() {
    this.apiKey = requireApiKey('perplexity');
  }

  /**
   * Send a chat completion request to Perplexity.
   *
   * Uses the sonar-pro model by default for enhanced web search
   * and citation capabilities.
   *
   * @param messages - Conversation messages
   * @param options - Request options
   * @returns Chat response with content, citations, and usage
   * @throws PerplexityApiError on API errors
   *
   * @example
   * ```typescript
   * const response = await client.chat([
   *   { role: 'user', content: 'Hidden gems in Kyoto for food lovers' }
   * ], { temperature: 0.3 });
   * ```
   */
  async chat(messages: Message[], options: ChatOptions = {}): Promise<ChatResponse> {
    const model = options.model ?? this.defaultModel;
    const timeout = options.timeoutMs ?? DEFAULTS.timeoutMs;

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? DEFAULTS.temperature,
          max_tokens: options.maxTokens ?? DEFAULTS.maxTokens,
        }),
      },
      timeout
    );

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = (await response.json()) as PerplexityApiResponse;
    return this.parseResponse(data);
  }

  /**
   * Execute fetch with timeout using AbortController.
   *
   * @param url - Request URL
   * @param options - Fetch options
   * @param timeoutMs - Timeout in milliseconds
   * @returns Fetch response
   * @throws Error on timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PerplexityApiError(
          `Request timed out after ${timeoutMs}ms`,
          408,
          true // Timeouts are retryable
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Handle API error responses.
   *
   * Categorizes errors by status code:
   * - 429: Rate limit exceeded (retryable)
   * - 5xx: Server errors (retryable)
   * - 4xx: Client errors (not retryable)
   *
   * @param response - Fetch response with error
   * @throws PerplexityApiError with appropriate message and retryable flag
   */
  private async handleError(response: Response): Promise<never> {
    const text = await response.text().catch(() => 'Unknown error');

    // Parse error message from response if JSON
    let errorMessage = text;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed.error?.message) {
        errorMessage = parsed.error.message;
      }
    } catch {
      // Keep raw text as error message
    }

    // Determine if error is retryable
    const isRetryable =
      response.status === 429 || // Rate limit
      response.status >= 500; // Server errors

    // Create descriptive error message
    let message: string;
    if (response.status === 429) {
      message = `Rate limit exceeded: ${errorMessage}`;
    } else if (response.status >= 500) {
      message = `Server error (${response.status}): ${errorMessage}`;
    } else if (response.status === 401) {
      message = `Authentication failed: Invalid API key`;
    } else if (response.status === 403) {
      message = `Access forbidden: ${errorMessage}`;
    } else {
      message = `API error (${response.status}): ${errorMessage}`;
    }

    throw new PerplexityApiError(message, response.status, isRetryable);
  }

  /**
   * Parse the Perplexity API response into our normalized format.
   *
   * Extracts:
   * - Content from the first choice
   * - Citations as structured objects
   * - Token usage for cost tracking
   *
   * @param data - Raw API response
   * @returns Normalized chat response
   */
  private parseResponse(data: PerplexityApiResponse): ChatResponse {
    // Extract content from first choice
    const content = data.choices[0]?.message?.content ?? '';

    // Parse citations - Perplexity returns them as an array of URLs
    const citations: Citation[] = (data.citations ?? []).map((url) => ({
      url,
      // Title and snippet are not provided in the API response
      // They could be extracted from the content if needed
    }));

    return {
      content,
      citations,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
      model: data.model,
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an error is a Perplexity API error
 */
export function isPerplexityApiError(error: unknown): error is PerplexityApiError {
  return error instanceof PerplexityApiError;
}

/**
 * Check if an error is retryable
 *
 * @param error - Error to check
 * @returns true if the error is likely transient and worth retrying
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof PerplexityApiError) {
    return error.isRetryable;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('rate limit') ||
      message.includes('429') ||
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
