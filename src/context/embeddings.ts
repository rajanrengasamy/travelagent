/**
 * Embedding Service
 *
 * Generates vector embeddings using OpenAI's text-embedding-3-small model.
 * Includes caching to reduce API calls for repeated content.
 *
 * @module context/embeddings
 * @see PRD Section 0.7 - Embedding Strategy
 */

import OpenAI from 'openai';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_EMBEDDING_CONFIG, CONTEXT_PATHS, type EmbeddingConfig } from './types.js';

/**
 * Maximum number of embeddings to keep in memory cache
 */
const MAX_CACHE_SIZE = 1000;

/**
 * Approximate characters per token (conservative estimate)
 */
const CHARS_PER_TOKEN = 4;

/**
 * Retry configuration for OpenAI API calls
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff */
  baseDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Random jitter range in milliseconds */
  jitterMs: number;
}

/**
 * Default retry configuration (matches PRD Section 17.3.2 for OpenAI)
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 16000,
  jitterMs: 1000,
};

/**
 * Cache statistics for debugging and monitoring
 */
export interface CacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Current number of cached embeddings */
  size: number;
}

/**
 * Singleton OpenAI client instance
 */
let openaiClient: OpenAI | null = null;

/**
 * Current embedding configuration
 */
let currentConfig: EmbeddingConfig = { ...DEFAULT_EMBEDDING_CONFIG };

/**
 * In-memory cache for embeddings (SHA-256 hash -> embedding)
 */
const embeddingCache = new Map<string, number[]>();

/**
 * Cache statistics tracker
 */
const cacheStats: CacheStats = {
  hits: 0,
  misses: 0,
  size: 0,
};

/**
 * Get or create the singleton OpenAI client
 *
 * @returns OpenAI client instance
 * @throws Error if OPENAI_API_KEY environment variable is not set
 */
export function getEmbeddingClient(): OpenAI {
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
 * Reset the OpenAI client (useful for testing)
 */
export function resetEmbeddingClient(): void {
  openaiClient = null;
}

/**
 * Set embedding configuration
 *
 * @param config - Partial configuration to merge with defaults
 */
export function setEmbeddingConfig(config: Partial<EmbeddingConfig>): void {
  currentConfig = { ...DEFAULT_EMBEDDING_CONFIG, ...config };
}

/**
 * Get current embedding configuration
 *
 * @returns Current embedding configuration
 */
export function getEmbeddingConfig(): EmbeddingConfig {
  return { ...currentConfig };
}

/**
 * Generate a cache key from text using SHA-256 hash
 *
 * @param text - Input text to hash
 * @returns SHA-256 hash of the input text (hex string)
 */
export function generateCacheKey(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Get a cached embedding if available
 *
 * @param text - Input text to look up
 * @returns Cached embedding array or null if not found
 */
export function getCachedEmbedding(text: string): number[] | null {
  const key = generateCacheKey(text);
  const cached = embeddingCache.get(key);

  if (cached) {
    cacheStats.hits++;
    return [...cached]; // Return a copy to prevent mutation
  }

  cacheStats.misses++;
  return null;
}

/**
 * Cache an embedding for future retrieval
 *
 * @param text - Input text (used to generate cache key)
 * @param embedding - Embedding vector to cache
 */
export function cacheEmbedding(text: string, embedding: number[]): void {
  const key = generateCacheKey(text);

  // Evict oldest entries if cache is full (simple FIFO eviction)
  if (embeddingCache.size >= MAX_CACHE_SIZE && !embeddingCache.has(key)) {
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey !== undefined) {
      embeddingCache.delete(firstKey);
    }
  }

  embeddingCache.set(key, [...embedding]); // Store a copy
  cacheStats.size = embeddingCache.size;
}

/**
 * Clear the embedding cache and reset statistics
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
  cacheStats.hits = 0;
  cacheStats.misses = 0;
  cacheStats.size = 0;
}

/**
 * Get the current cache size
 *
 * @returns Number of cached embeddings
 */
export function getEmbeddingCacheSize(): number {
  return embeddingCache.size;
}

/**
 * Get cache statistics for debugging
 *
 * @returns Cache statistics object
 */
export function getCacheStats(): CacheStats {
  return { ...cacheStats };
}

/**
 * Sleep for a specified duration
 *
 * @param ms - Duration in milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate retry delay with exponential backoff and jitter
 *
 * Formula: min(maxDelay, baseDelay * 2^attempt) + random(-jitter, +jitter)
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
function calculateRetryDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = Math.min(config.maxDelayMs, config.baseDelayMs * Math.pow(2, attempt));
  const jitter = (Math.random() * 2 - 1) * config.jitterMs;
  return Math.max(0, exponentialDelay + jitter);
}

/**
 * Type guard to check if error has a status property (API-like error)
 */
function hasStatusProperty(error: unknown): error is { status: number; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  );
}

/**
 * Check if an error is retryable (transient)
 *
 * @param error - Error to check
 * @returns True if the error is retryable
 */
function isRetryableError(error: unknown): boolean {
  // Check for API errors (OpenAI.APIError or similar with status property)
  if (hasStatusProperty(error)) {
    const status = error.status;
    // Rate limiting (429) - retryable
    if (status === 429) return true;
    // Server errors (5xx) - retryable
    if (status >= 500) return true;
  }

  // Network errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('socket')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Validate and prepare input text for embedding
 *
 * @param text - Input text to validate
 * @param config - Embedding configuration
 * @returns Prepared text (trimmed and possibly truncated)
 * @throws Error if input is empty
 */
function prepareInput(text: string, config: EmbeddingConfig): string {
  // Handle empty input
  if (!text || text.trim().length === 0) {
    throw new Error('Input text cannot be empty');
  }

  const trimmed = text.trim();
  const maxLength = config.maxTokens * CHARS_PER_TOKEN;

  // Truncate if too long (with warning in non-test environments)
  if (trimmed.length > maxLength) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        `Input text exceeds maximum length (${trimmed.length} chars, ~${Math.ceil(trimmed.length / CHARS_PER_TOKEN)} tokens). ` +
          `Truncating to fit within ${config.maxTokens} token limit.`
      );
    }
    return trimmed.slice(0, maxLength);
  }

  return trimmed;
}

/**
 * Execute an embedding API call with retry logic
 *
 * @param fn - Function to execute
 * @param retryConfig - Retry configuration
 * @returns Result of the function
 * @throws Error after all retries are exhausted
 */
async function withRetry<T>(fn: () => Promise<T>, retryConfig: RetryConfig): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!isRetryableError(error) || attempt >= retryConfig.maxRetries) {
        break;
      }

      // Wait before retrying
      const delay = calculateRetryDelay(attempt, retryConfig);
      await sleep(delay);
    }
  }

  // Throw appropriate error based on status code
  if (hasStatusProperty(lastError)) {
    if (lastError.status === 401) {
      throw new Error('Invalid OpenAI API key. Please check your OPENAI_API_KEY.');
    }
    if (lastError.status === 429) {
      throw new Error('OpenAI rate limit exceeded after retries. Please try again later.');
    }
    throw new Error(
      `OpenAI API error: ${lastError instanceof Error ? lastError.message : String(lastError.message)}`
    );
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Unknown error during embedding generation');
}

/**
 * Options for embedding generation
 */
export interface EmbeddingOptions {
  /** Skip cache lookup (always call API) */
  skipCache?: boolean;
  /** Custom retry configuration */
  retryConfig?: Partial<RetryConfig>;
  /** Custom embedding configuration */
  config?: Partial<EmbeddingConfig>;
}

/**
 * Generate an embedding for a single text input
 *
 * @param text - Text to generate embedding for
 * @param options - Optional configuration
 * @returns Embedding vector (array of numbers with length = dimensions)
 * @throws Error on empty input or permanent API failures
 */
export async function generateEmbedding(
  text: string,
  options?: EmbeddingOptions
): Promise<number[]> {
  const config = { ...currentConfig, ...options?.config };
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...options?.retryConfig };

  // Validate and prepare input
  const preparedText = prepareInput(text, config);

  // Check cache first (unless skipped)
  if (!options?.skipCache) {
    const cached = getCachedEmbedding(preparedText);
    if (cached) {
      return cached;
    }
  }

  const client = getEmbeddingClient();

  const embedding = await withRetry(async () => {
    const response = await client.embeddings.create({
      model: config.model,
      input: preparedText,
      dimensions: config.dimensions,
    });
    return response.data[0].embedding;
  }, retryConfig);

  // Cache the result
  cacheEmbedding(preparedText, embedding);

  return embedding;
}

/**
 * Generate embeddings for multiple texts in batch
 *
 * More efficient than calling generateEmbedding multiple times
 * as it makes a single API call for all uncached texts.
 *
 * @param texts - Array of texts to generate embeddings for
 * @param options - Optional configuration
 * @returns Array of embedding vectors (same order as input texts)
 * @throws Error on empty texts array or permanent API failures
 */
export async function generateEmbeddings(
  texts: string[],
  options?: EmbeddingOptions
): Promise<number[][]> {
  // Handle empty array
  if (!texts || texts.length === 0) {
    return [];
  }

  const config = { ...currentConfig, ...options?.config };
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...options?.retryConfig };

  // Validate and prepare all inputs
  const preparedTexts = texts.map((text) => prepareInput(text, config));

  // Check cache for all texts
  const results: (number[] | null)[] = Array.from<number[] | null>({ length: preparedTexts.length }).fill(null);
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];

  if (!options?.skipCache) {
    preparedTexts.forEach((text, index) => {
      const cached = getCachedEmbedding(text);
      if (cached) {
        results[index] = cached;
      } else {
        uncachedIndices.push(index);
        uncachedTexts.push(text);
      }
    });
  } else {
    preparedTexts.forEach((text, index) => {
      uncachedIndices.push(index);
      uncachedTexts.push(text);
    });
  }

  // If all were cached, return early
  if (uncachedTexts.length === 0) {
    return results as number[][];
  }

  const client = getEmbeddingClient();

  const embeddings = await withRetry(async () => {
    const response = await client.embeddings.create({
      model: config.model,
      input: uncachedTexts,
      dimensions: config.dimensions,
    });
    return response.data.map((item) => item.embedding);
  }, retryConfig);

  // Map results back to original indices and cache
  embeddings.forEach((embedding, i) => {
    const originalIndex = uncachedIndices[i];
    results[originalIndex] = embedding;
    cacheEmbedding(uncachedTexts[i], embedding);
  });

  return results as number[][];
}

/**
 * Load embedding cache from disk
 *
 * @param cachePath - Optional custom cache file path
 * @returns Number of embeddings loaded
 */
export function loadCacheFromDisk(cachePath?: string): number {
  const filePath = cachePath ?? join(CONTEXT_PATHS.EMBEDDINGS_CACHE_DIR, 'cache.json');

  try {
    if (existsSync(filePath)) {
      const data = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, number[]>;
      let loaded = 0;
      Object.entries(data).forEach(([key, value]) => {
        if (embeddingCache.size < MAX_CACHE_SIZE) {
          embeddingCache.set(key, value);
          loaded++;
        }
      });
      cacheStats.size = embeddingCache.size;
      return loaded;
    }
  } catch {
    // Silently fail - cache loading is optional
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Failed to load embedding cache from disk');
    }
  }
  return 0;
}

/**
 * Save embedding cache to disk
 *
 * @param cachePath - Optional custom cache file path
 * @returns True if save was successful
 */
export function saveCacheToDisk(cachePath?: string): boolean {
  const filePath = cachePath ?? join(CONTEXT_PATHS.EMBEDDINGS_CACHE_DIR, 'cache.json');

  try {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const data: Record<string, number[]> = {};
    embeddingCache.forEach((value, key) => {
      data[key] = value;
    });

    writeFileSync(filePath, JSON.stringify(data), 'utf-8');
    return true;
  } catch {
    // Silently fail - cache saving is optional
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Failed to save embedding cache to disk');
    }
    return false;
  }
}
