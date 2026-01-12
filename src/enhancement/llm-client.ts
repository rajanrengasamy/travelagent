/**
 * Unified LLM Client for Google Generative AI
 *
 * Provides a consistent interface for calling Google Generative AI across
 * all enhancement modules. Consolidates retry logic, timeout handling,
 * and JSON extraction.
 *
 * @module enhancement/llm-client
 * @see MAJ-2 - Architecture consistency fix
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireApiKey } from '../config/index.js';
import { getModelConfig, type ModelConfig, type TaskType } from '../config/models.js';

/**
 * Configuration for LLM calls
 */
export interface LLMCallConfig {
  /** Timeout in milliseconds (default: 15000) */
  timeoutMs?: number;
  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds for exponential backoff (default: 8000) */
  maxDelayMs?: number;
  /** Request JSON response format (default: false) */
  jsonMode?: boolean;
}

const DEFAULT_CONFIG: Required<LLMCallConfig> = {
  timeoutMs: 15000,
  maxRetries: 2,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  jsonMode: false,
};

/**
 * Result from an LLM call
 */
export interface LLMCallResult {
  /** Raw text response from the model */
  text: string;
  /** Model ID that was used */
  modelId: string;
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay in milliseconds
 * @returns Delay in milliseconds with jitter
 */
function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
  const jitter = Math.random() * 0.3 * exponential;
  return exponential + jitter;
}

/**
 * Determine if an error is retryable
 *
 * Retryable errors include:
 * - Rate limits (429)
 * - Timeouts
 * - Network errors
 * - Server errors (5xx)
 *
 * @param error - The error to check
 * @returns True if the error is likely transient and worth retrying
 */
export function isRetryableError(error: unknown): boolean {
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

/**
 * Execute a function with timeout using Promise.race pattern
 *
 * The Google Generative AI SDK does not support AbortSignal, so we use
 * Promise.race to implement timeout behavior.
 *
 * @param fn - Async function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @returns Result of the function or throws timeout error
 */
async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`LLM call timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    return result;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Execute a function with retry logic
 *
 * @param fn - Async function to execute
 * @param config - Retry configuration
 * @returns Result of the function
 * @throws Last error if all retries exhausted
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  config: Required<LLMCallConfig>
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableError(error) || attempt >= config.maxRetries) {
        break;
      }

      const delay = calculateDelay(attempt, config.baseDelayMs, config.maxDelayMs);
      await sleep(delay);
    }
  }

  throw lastError ?? new Error('Unknown error during LLM call');
}

/**
 * Extract JSON from LLM response text
 *
 * Handles common response formats:
 * - Raw JSON object
 * - JSON wrapped in markdown code blocks (```json ... ```)
 * - JSON embedded in prose text
 *
 * @param text - Raw response text from LLM
 * @returns Parsed JSON object
 * @throws Error if JSON cannot be extracted or parsed
 */
export function extractJson<T = unknown>(text: string): T {
  let cleanText = text.trim();

  // Handle markdown code blocks (```json ... ``` or ``` ... ```)
  const codeBlockMatch = cleanText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    cleanText = codeBlockMatch[1].trim();
  }

  // Try to find JSON object if not already clean
  if (!cleanText.startsWith('{') && !cleanText.startsWith('[')) {
    const jsonMatch = cleanText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      cleanText = jsonMatch[1];
    }
  }

  try {
    return JSON.parse(cleanText) as T;
  } catch {
    throw new Error(`Failed to parse JSON from LLM response: ${text.substring(0, 200)}`);
  }
}

/**
 * Call Google Generative AI with unified error handling
 *
 * Uses the @google/generative-ai SDK with:
 * - Configurable timeout via Promise.race
 * - Exponential backoff retry for transient errors
 * - JSON mode support for structured responses
 *
 * @param prompt - The prompt to send to the model
 * @param task - Task type for model selection (default: 'enhancement')
 * @param config - Optional call configuration
 * @returns LLM call result with text and model info
 *
 * @example
 * ```typescript
 * // Simple text generation
 * const result = await callGoogleAI('Analyze this travel prompt: ...');
 * console.log(result.text);
 *
 * // With JSON mode for structured output
 * const result = await callGoogleAI(prompt, 'enhancement', { jsonMode: true });
 * const data = extractJson(result.text);
 * ```
 */
export async function callGoogleAI(
  prompt: string,
  task: TaskType = 'enhancement',
  config: LLMCallConfig = {}
): Promise<LLMCallResult> {
  const fullConfig: Required<LLMCallConfig> = { ...DEFAULT_CONFIG, ...config };
  const modelConfig = getModelConfig(task);
  const apiKey = requireApiKey('googleAi');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelConfig.modelId });

  const result = await withRetry(
    () =>
      withTimeout(async () => {
        const response = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: modelConfig.temperature,
            maxOutputTokens: modelConfig.maxOutputTokens,
            ...(fullConfig.jsonMode && { responseMimeType: 'application/json' }),
          },
        });

        const text = response.response.text();
        if (!text) {
          throw new Error('Empty response from LLM');
        }

        return text;
      }, fullConfig.timeoutMs),
    fullConfig
  );

  return {
    text: result,
    modelId: modelConfig.modelId,
  };
}

/**
 * Call Google Generative AI and extract JSON response
 *
 * Convenience wrapper that combines callGoogleAI with JSON extraction.
 * Automatically enables JSON mode for better structured output.
 *
 * @param prompt - The prompt to send to the model
 * @param task - Task type for model selection (default: 'enhancement')
 * @param config - Optional call configuration
 * @returns Parsed JSON response
 *
 * @example
 * ```typescript
 * interface AnalysisResult {
 *   isClear: boolean;
 *   confidence: number;
 * }
 *
 * const analysis = await callGoogleAIJson<AnalysisResult>(prompt);
 * console.log(analysis.confidence);
 * ```
 */
export async function callGoogleAIJson<T = unknown>(
  prompt: string,
  task: TaskType = 'enhancement',
  config: LLMCallConfig = {}
): Promise<{ data: T; modelId: string }> {
  const result = await callGoogleAI(prompt, task, { ...config, jsonMode: true });
  const data = extractJson<T>(result.text);
  return { data, modelId: result.modelId };
}

/**
 * Get the model configuration for a task
 *
 * Re-exported for convenience so modules don't need to import from config/models.
 */
export { getModelConfig, type ModelConfig, type TaskType };
