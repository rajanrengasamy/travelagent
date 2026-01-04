/**
 * Embedding Service Tests
 *
 * Unit tests for the embedding service with mocked OpenAI API.
 *
 * @module context/embeddings.test
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock embedding vector (1536 dimensions filled with 0.1)
const mockEmbedding = new Array(1536).fill(0.1);

// Helper to create mock OpenAI response
function createMockResponse(embeddings: number[][]) {
  return {
    data: embeddings.map((embedding, index) => ({
      embedding,
      index,
      object: 'embedding' as const,
    })),
    model: 'text-embedding-3-small',
    object: 'list' as const,
    usage: {
      prompt_tokens: 10,
      total_tokens: 10,
    },
  };
}

// Create a mock API error class for testing
class MockAPIError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'APIError';
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = jest.Mock<(...args: any[]) => any>;

// Set up mock for OpenAI module before importing embeddings
const mockCreate = jest.fn() as MockFn;
mockCreate.mockResolvedValue(createMockResponse([mockEmbedding]));

jest.unstable_mockModule('openai', () => {
  const MockOpenAI = jest.fn().mockImplementation(() => ({
    embeddings: {
      create: mockCreate,
    },
  }));
  (MockOpenAI as unknown as { APIError: typeof MockAPIError }).APIError = MockAPIError;
  return {
    default: MockOpenAI,
    __esModule: true,
  };
});

// Import after mocking
const {
  generateEmbedding,
  generateEmbeddings,
  getEmbeddingClient,
  getCachedEmbedding,
  cacheEmbedding,
  clearEmbeddingCache,
  getCacheStats,
  getEmbeddingCacheSize,
  generateCacheKey,
  resetEmbeddingClient,
  setEmbeddingConfig,
  getEmbeddingConfig,
  loadCacheFromDisk,
  saveCacheToDisk,
  DEFAULT_RETRY_CONFIG,
} = await import('./embeddings.js');

const { DEFAULT_EMBEDDING_CONFIG } = await import('./types.js');

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Embedding Service', () => {
  beforeEach(() => {
    // Clear cache and reset client before each test
    clearEmbeddingCache();
    resetEmbeddingClient();
    setEmbeddingConfig(DEFAULT_EMBEDDING_CONFIG);

    // Set up environment
    process.env.OPENAI_API_KEY = 'test-api-key';
    process.env.NODE_ENV = 'test';

    // Reset mock to default behavior
    mockCreate.mockReset();
    mockCreate.mockResolvedValue(createMockResponse([mockEmbedding]));
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.NODE_ENV;
  });

  describe('getEmbeddingClient', () => {
    it('should create OpenAI client with API key', () => {
      const client = getEmbeddingClient();
      expect(client).toBeDefined();
      expect(client.embeddings).toBeDefined();
    });

    it('should return same client instance on multiple calls', () => {
      const client1 = getEmbeddingClient();
      const client2 = getEmbeddingClient();
      expect(client1).toBe(client2);
    });

    it('should throw error when API key is not set', () => {
      delete process.env.OPENAI_API_KEY;
      resetEmbeddingClient();
      expect(() => getEmbeddingClient()).toThrow('OPENAI_API_KEY');
    });
  });

  describe('generateCacheKey', () => {
    it('should generate SHA-256 hash for text', () => {
      const key = generateCacheKey('test text');
      expect(key).toHaveLength(64); // SHA-256 produces 64 hex characters
      expect(key).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate same hash for same text', () => {
      const key1 = generateCacheKey('test text');
      const key2 = generateCacheKey('test text');
      expect(key1).toBe(key2);
    });

    it('should generate different hash for different text', () => {
      const key1 = generateCacheKey('text 1');
      const key2 = generateCacheKey('text 2');
      expect(key1).not.toBe(key2);
    });
  });

  describe('caching functions', () => {
    it('should cache and retrieve embeddings', () => {
      const embedding = [0.1, 0.2, 0.3];
      cacheEmbedding('test text', embedding);

      const cached = getCachedEmbedding('test text');
      expect(cached).toEqual(embedding);
    });

    it('should return null for uncached text', () => {
      const cached = getCachedEmbedding('uncached text');
      expect(cached).toBeNull();
    });

    it('should track cache hits and misses', () => {
      const embedding = [0.1, 0.2, 0.3];
      cacheEmbedding('test text', embedding);

      getCachedEmbedding('test text'); // hit
      getCachedEmbedding('test text'); // hit
      getCachedEmbedding('uncached'); // miss

      const stats = getCacheStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it('should clear cache and reset stats', () => {
      cacheEmbedding('test', [0.1]);
      getCachedEmbedding('test');
      getCachedEmbedding('missing');

      clearEmbeddingCache();

      expect(getEmbeddingCacheSize()).toBe(0);
      const stats = getCacheStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);
    });

    it('should evict oldest entries when cache is full', () => {
      // Fill cache to max size (1000)
      for (let i = 0; i < 1000; i++) {
        cacheEmbedding(`text-${i}`, [i]);
      }
      expect(getEmbeddingCacheSize()).toBe(1000);

      // Add one more - should evict oldest
      cacheEmbedding('new-text', [9999]);
      expect(getEmbeddingCacheSize()).toBe(1000);

      // First entry should be evicted
      expect(getCachedEmbedding('text-0')).toBeNull();
      // New entry should exist
      expect(getCachedEmbedding('new-text')).toEqual([9999]);
    });

    it('should return copy of cached embedding to prevent mutation', () => {
      const original = [0.1, 0.2, 0.3];
      cacheEmbedding('test', original);

      const cached = getCachedEmbedding('test');
      cached![0] = 999;

      const cachedAgain = getCachedEmbedding('test');
      expect(cachedAgain![0]).toBe(0.1);
    });
  });

  describe('generateEmbedding', () => {
    it('should generate embedding for text', async () => {
      const result = await generateEmbedding('test text');

      expect(result).toEqual(mockEmbedding);
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'test text',
        dimensions: 1536,
      });
    });

    it('should use cached embedding on second call', async () => {
      await generateEmbedding('test text');
      const result = await generateEmbedding('test text');

      expect(result).toEqual(mockEmbedding);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should skip cache when skipCache option is true', async () => {
      await generateEmbedding('test text');
      await generateEmbedding('test text', { skipCache: true });

      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should throw error for empty input', async () => {
      await expect(generateEmbedding('')).rejects.toThrow('Input text cannot be empty');
      await expect(generateEmbedding('   ')).rejects.toThrow('Input text cannot be empty');
    });

    it('should trim input text', async () => {
      await generateEmbedding('  test text  ');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          input: 'test text',
        })
      );
    });

    it('should truncate overly long input', async () => {
      const longText = 'a'.repeat(50000); // Much longer than max tokens * 4
      await generateEmbedding(longText);

      const callArgs = mockCreate.mock.calls[0][0] as { input: string };
      expect(callArgs.input.length).toBeLessThan(longText.length);
    });

    it('should use custom config when provided', async () => {
      await generateEmbedding('test', {
        config: { dimensions: 512 },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          dimensions: 512,
        })
      );
    });
  });

  describe('generateEmbeddings (batch)', () => {
    it('should generate embeddings for multiple texts', async () => {
      const texts = ['text 1', 'text 2', 'text 3'];
      const mockEmbeddings = [
        [0.1, 0.2],
        [0.3, 0.4],
        [0.5, 0.6],
      ];
      mockCreate.mockResolvedValueOnce(createMockResponse(mockEmbeddings));

      const results = await generateEmbeddings(texts);

      expect(results).toHaveLength(3);
      expect(results).toEqual(mockEmbeddings);
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: texts,
        dimensions: 1536,
      });
    });

    it('should return empty array for empty input', async () => {
      const result = await generateEmbeddings([]);
      expect(result).toEqual([]);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should use cache for some texts and API for others', async () => {
      // Pre-cache first text
      cacheEmbedding('text 1', [0.1, 0.2]);

      const mockNewEmbeddings = [
        [0.3, 0.4],
        [0.5, 0.6],
      ];
      mockCreate.mockResolvedValueOnce(createMockResponse(mockNewEmbeddings));

      const results = await generateEmbeddings(['text 1', 'text 2', 'text 3']);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual([0.1, 0.2]); // From cache
      expect(results[1]).toEqual([0.3, 0.4]); // From API
      expect(results[2]).toEqual([0.5, 0.6]); // From API

      // Should only call API for uncached texts
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: ['text 2', 'text 3'],
        dimensions: 1536,
      });
    });

    it('should return all from cache when all texts are cached', async () => {
      cacheEmbedding('text 1', [0.1]);
      cacheEmbedding('text 2', [0.2]);

      const results = await generateEmbeddings(['text 1', 'text 2']);

      expect(results).toEqual([[0.1], [0.2]]);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should throw error if any text is empty', async () => {
      await expect(generateEmbeddings(['valid', ''])).rejects.toThrow('Input text cannot be empty');
    });
  });

  describe('error handling', () => {
    it('should throw descriptive error for invalid API key (401)', async () => {
      const apiError = new MockAPIError(401, 'Invalid API key');
      mockCreate.mockRejectedValueOnce(apiError);

      await expect(generateEmbedding('test')).rejects.toThrow('Invalid OpenAI API key');
    });

    it('should throw descriptive error for rate limit (429) after retries', async () => {
      const apiError = new MockAPIError(429, 'Rate limit exceeded');
      // Fail all retries
      mockCreate
        .mockRejectedValueOnce(apiError)
        .mockRejectedValueOnce(apiError)
        .mockRejectedValueOnce(apiError)
        .mockRejectedValueOnce(apiError);

      await expect(
        generateEmbedding('test', {
          retryConfig: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, jitterMs: 0 },
        })
      ).rejects.toThrow('rate limit exceeded');
    });

    it('should retry on transient errors and succeed', async () => {
      const apiError = new MockAPIError(500, 'Server error');
      // Fail first two times, succeed on third
      mockCreate
        .mockRejectedValueOnce(apiError)
        .mockRejectedValueOnce(apiError)
        .mockResolvedValueOnce(createMockResponse([mockEmbedding]));

      const result = await generateEmbedding('test', {
        retryConfig: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, jitterMs: 0 },
      });

      expect(result).toEqual(mockEmbedding);
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it('should not retry on permanent errors (400)', async () => {
      const apiError = new MockAPIError(400, 'Bad request');
      mockCreate.mockRejectedValueOnce(apiError);

      await expect(
        generateEmbedding('test', {
          retryConfig: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, jitterMs: 0 },
        })
      ).rejects.toThrow('Bad request');
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should retry on network errors', async () => {
      const networkError = new Error('ECONNRESET');
      mockCreate
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(createMockResponse([mockEmbedding]));

      const result = await generateEmbedding('test', {
        retryConfig: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10, jitterMs: 0 },
      });

      expect(result).toEqual(mockEmbedding);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe('configuration', () => {
    it('should use default configuration', () => {
      const config = getEmbeddingConfig();
      expect(config).toEqual(DEFAULT_EMBEDDING_CONFIG);
    });

    it('should allow setting custom configuration', () => {
      setEmbeddingConfig({ dimensions: 512 });
      const config = getEmbeddingConfig();
      expect(config.dimensions).toBe(512);
      expect(config.model).toBe('text-embedding-3-small');
    });

    it('should reset to defaults on setEmbeddingConfig with empty object', () => {
      setEmbeddingConfig({ dimensions: 512 });
      setEmbeddingConfig({});
      const config = getEmbeddingConfig();
      expect(config.dimensions).toBe(1536);
    });
  });

  describe('disk cache persistence', () => {
    const testCacheDir = join(tmpdir(), 'embeddings-test-cache');
    const testCachePath = join(testCacheDir, 'test-cache.json');

    beforeEach(() => {
      if (existsSync(testCacheDir)) {
        rmSync(testCacheDir, { recursive: true });
      }
    });

    afterEach(() => {
      if (existsSync(testCacheDir)) {
        rmSync(testCacheDir, { recursive: true });
      }
    });

    it('should save cache to disk', () => {
      cacheEmbedding('text1', [0.1, 0.2]);
      cacheEmbedding('text2', [0.3, 0.4]);

      const result = saveCacheToDisk(testCachePath);
      expect(result).toBe(true);
      expect(existsSync(testCachePath)).toBe(true);
    });

    it('should load cache from disk', () => {
      // Create cache file manually
      mkdirSync(testCacheDir, { recursive: true });
      const cacheData = {
        [generateCacheKey('text1')]: [0.1, 0.2],
        [generateCacheKey('text2')]: [0.3, 0.4],
      };
      writeFileSync(testCachePath, JSON.stringify(cacheData));

      const loaded = loadCacheFromDisk(testCachePath);
      expect(loaded).toBe(2);
      expect(getEmbeddingCacheSize()).toBe(2);
    });

    it('should return 0 when cache file does not exist', () => {
      const loaded = loadCacheFromDisk('/nonexistent/path/cache.json');
      expect(loaded).toBe(0);
    });

    it('should round-trip cache through disk', () => {
      cacheEmbedding('text1', [0.1, 0.2]);
      cacheEmbedding('text2', [0.3, 0.4]);

      saveCacheToDisk(testCachePath);
      clearEmbeddingCache();
      expect(getEmbeddingCacheSize()).toBe(0);

      loadCacheFromDisk(testCachePath);
      expect(getEmbeddingCacheSize()).toBe(2);
    });
  });

  describe('DEFAULT_RETRY_CONFIG', () => {
    it('should have correct values per PRD Section 17.3.2', () => {
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.baseDelayMs).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(16000);
      expect(DEFAULT_RETRY_CONFIG.jitterMs).toBe(1000);
    });
  });
});
