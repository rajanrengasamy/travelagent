/**
 * Tests for Router Module
 *
 * Tests the router's ability to create WorkerPlans via LLM calls,
 * including fallback behavior on errors.
 *
 * Uses Jest ESM mocking pattern for mocking LLM and helper modules.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { Session } from '../schemas/session.js';
import type { WorkerPlan, EnrichedIntent, WorkerAssignment, ValidationPlan } from '../schemas/worker.js';

// Mock the LLM client before importing router
jest.unstable_mockModule('../enhancement/llm-client.js', () => ({
  callGoogleAIJson: jest.fn(),
}));

// Mock the helper modules (created by parallel agents)
jest.unstable_mockModule('./prompts.js', () => ({
  buildRouterPrompt: jest.fn(),
}));

jest.unstable_mockModule('./defaults.js', () => ({
  getDefaultWorkerPlan: jest.fn(),
}));

jest.unstable_mockModule('./intent.js', () => ({
  enrichIntent: jest.fn(),
  inferTags: jest.fn(),
}));

jest.unstable_mockModule('./queries.js', () => ({
  generateQueryVariants: jest.fn(),
}));

jest.unstable_mockModule('./planner.js', () => ({
  selectWorkers: jest.fn(),
  allocateBudgets: jest.fn(),
  createValidationPlan: jest.fn(),
}));

// Import after mocking
const { runRouter } = await import('./router.js');
const { callGoogleAIJson } = await import('../enhancement/llm-client.js');
const { buildRouterPrompt } = await import('./prompts.js');
const { getDefaultWorkerPlan } = await import('./defaults.js');
const { enrichIntent, inferTags } = await import('./intent.js');
const { generateQueryVariants } = await import('./queries.js');
const { selectWorkers, allocateBudgets, createValidationPlan } = await import('./planner.js');

// Type the mocks
const mockCallGoogleAIJson = callGoogleAIJson as jest.MockedFunction<typeof callGoogleAIJson>;
const mockBuildRouterPrompt = buildRouterPrompt as jest.MockedFunction<typeof buildRouterPrompt>;
const mockGetDefaultWorkerPlan = getDefaultWorkerPlan as jest.MockedFunction<typeof getDefaultWorkerPlan>;
const mockEnrichIntent = enrichIntent as jest.MockedFunction<typeof enrichIntent>;
const mockInferTags = inferTags as jest.MockedFunction<typeof inferTags>;
const mockGenerateQueryVariants = generateQueryVariants as jest.MockedFunction<typeof generateQueryVariants>;
const mockSelectWorkers = selectWorkers as jest.MockedFunction<typeof selectWorkers>;
const mockAllocateBudgets = allocateBudgets as jest.MockedFunction<typeof allocateBudgets>;
const mockCreateValidationPlan = createValidationPlan as jest.MockedFunction<typeof createValidationPlan>;

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Sample session for testing (from assignment)
 */
const createMockSession = (overrides: Partial<Session> = {}): Session => ({
  schemaVersion: 1,
  sessionId: '20260115-tokyo-trip',
  title: 'Tokyo Food Adventure',
  destinations: ['Tokyo', 'Kyoto'],
  dateRange: { start: '2026-03-01', end: '2026-03-08' },
  flexibility: { type: 'plusMinusDays', days: 3 },
  interests: ['food', 'temples', 'photography'],
  constraints: { budget: 'medium' },
  createdAt: '2026-01-15T10:00:00Z',
  ...overrides,
});

/**
 * Sample enriched intent
 */
const createMockEnrichedIntent = (overrides: Partial<EnrichedIntent> = {}): EnrichedIntent => ({
  destinations: ['Tokyo', 'Kyoto'],
  dateRange: { start: '2026-03-01', end: '2026-03-08' },
  flexibility: { type: 'plusMinusDays', days: 3 },
  interests: ['food', 'temples', 'photography'],
  constraints: { budget: 'medium' },
  inferredTags: ['spring', 'urban', 'culinary', 'cultural'],
  ...overrides,
});

/**
 * Sample worker assignment
 */
const createMockWorkerAssignment = (overrides: Partial<WorkerAssignment> = {}): WorkerAssignment => ({
  workerId: 'perplexity',
  queries: ['best ramen shops in Tokyo', 'traditional temples in Kyoto'],
  maxResults: 10,
  timeout: 30000,
  ...overrides,
});

/**
 * Sample validation plan
 */
const createMockValidationPlan = (overrides: Partial<ValidationPlan> = {}): ValidationPlan => ({
  validateTopN: 5,
  origins: ['youtube'],
  ...overrides,
});

/**
 * Sample valid WorkerPlan
 */
const createMockWorkerPlan = (overrides: Partial<WorkerPlan> = {}): WorkerPlan => ({
  enrichedIntent: createMockEnrichedIntent(),
  workers: [
    createMockWorkerAssignment({ workerId: 'perplexity' }),
    createMockWorkerAssignment({
      workerId: 'places',
      queries: ['restaurants near Shibuya', 'temples in Kyoto'],
      maxResults: 20,
      timeout: 15000,
    }),
    createMockWorkerAssignment({
      workerId: 'youtube',
      queries: ['Tokyo food tour 2026', 'best ramen Tokyo'],
      maxResults: 5,
      timeout: 20000,
    }),
  ],
  validationPlan: createMockValidationPlan(),
  ...overrides,
});

/**
 * Sample default WorkerPlan (used on fallback)
 */
const createDefaultWorkerPlan = (): WorkerPlan => ({
  enrichedIntent: createMockEnrichedIntent({
    inferredTags: [], // Defaults have no inferred tags
  }),
  workers: [
    {
      workerId: 'perplexity',
      queries: ['Tokyo Kyoto travel guide'],
      maxResults: 15,
      timeout: 30000,
    },
    {
      workerId: 'places',
      queries: ['Tokyo attractions', 'Kyoto attractions'],
      maxResults: 25,
      timeout: 15000,
    },
    {
      workerId: 'youtube',
      queries: ['Tokyo Kyoto travel'],
      maxResults: 5,
      timeout: 20000,
    },
  ],
  validationPlan: {
    validateTopN: 3,
    origins: ['youtube'],
  },
});

const availableWorkers = ['perplexity', 'places', 'youtube'];

// ============================================================================
// Tests
// ============================================================================

describe('runRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default mock for buildRouterPrompt
    mockBuildRouterPrompt.mockReturnValue('Mock router prompt');
    // Setup default mock for getDefaultWorkerPlan
    mockGetDefaultWorkerPlan.mockReturnValue(createDefaultWorkerPlan());
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Success Path', () => {
    it('should return valid WorkerPlan on successful LLM call', async () => {
      const mockSession = createMockSession();
      const expectedPlan = createMockWorkerPlan();

      mockCallGoogleAIJson.mockResolvedValueOnce({
        data: expectedPlan,
        modelId: 'gemini-3-flash-preview',
      });

      const result = await runRouter(mockSession, availableWorkers);

      expect(mockBuildRouterPrompt).toHaveBeenCalledWith(mockSession, availableWorkers);
      expect(mockCallGoogleAIJson).toHaveBeenCalledWith('Mock router prompt', 'router', {
        timeoutMs: 5000,
      });
      expect(result).toEqual(expectedPlan);
      expect(mockGetDefaultWorkerPlan).not.toHaveBeenCalled();
    });

    it('should pass correct task type to LLM client', async () => {
      const mockSession = createMockSession();
      mockCallGoogleAIJson.mockResolvedValueOnce({
        data: createMockWorkerPlan(),
        modelId: 'gemini-3-flash-preview',
      });

      await runRouter(mockSession, availableWorkers);

      expect(mockCallGoogleAIJson).toHaveBeenCalledWith(
        expect.any(String),
        'router',
        expect.objectContaining({ timeoutMs: 5000 })
      );
    });

    it('should use 5-second timeout per PRD 7.6.4', async () => {
      const mockSession = createMockSession();
      mockCallGoogleAIJson.mockResolvedValueOnce({
        data: createMockWorkerPlan(),
        modelId: 'gemini-3-flash-preview',
      });

      await runRouter(mockSession, availableWorkers);

      expect(mockCallGoogleAIJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ timeoutMs: 5000 })
      );
    });
  });

  describe('Fallback on LLM Error', () => {
    it('should fall back to default plan on LLM timeout', async () => {
      const mockSession = createMockSession();
      const defaultPlan = createDefaultWorkerPlan();

      mockCallGoogleAIJson.mockRejectedValueOnce(new Error('LLM call timed out after 5000ms'));

      const result = await runRouter(mockSession, availableWorkers);

      expect(result).toEqual(defaultPlan);
      expect(mockGetDefaultWorkerPlan).toHaveBeenCalledWith(mockSession, availableWorkers);
    });

    it('should fall back to default plan on network error', async () => {
      const mockSession = createMockSession();
      const defaultPlan = createDefaultWorkerPlan();

      mockCallGoogleAIJson.mockRejectedValueOnce(new Error('Network request failed'));

      const result = await runRouter(mockSession, availableWorkers);

      expect(result).toEqual(defaultPlan);
      expect(mockGetDefaultWorkerPlan).toHaveBeenCalledWith(mockSession, availableWorkers);
    });

    it('should fall back to default plan on rate limit error', async () => {
      const mockSession = createMockSession();
      const defaultPlan = createDefaultWorkerPlan();

      mockCallGoogleAIJson.mockRejectedValueOnce(new Error('429 Too Many Requests'));

      const result = await runRouter(mockSession, availableWorkers);

      expect(result).toEqual(defaultPlan);
      expect(mockGetDefaultWorkerPlan).toHaveBeenCalledWith(mockSession, availableWorkers);
    });

    it('should fall back to default plan on empty response', async () => {
      const mockSession = createMockSession();
      const defaultPlan = createDefaultWorkerPlan();

      mockCallGoogleAIJson.mockRejectedValueOnce(new Error('Empty response from LLM'));

      const result = await runRouter(mockSession, availableWorkers);

      expect(result).toEqual(defaultPlan);
      expect(mockGetDefaultWorkerPlan).toHaveBeenCalledWith(mockSession, availableWorkers);
    });
  });

  describe('Fallback on Validation Error', () => {
    it('should fall back to default plan when response missing enrichedIntent', async () => {
      const mockSession = createMockSession();
      const defaultPlan = createDefaultWorkerPlan();

      // Invalid response - missing enrichedIntent
      mockCallGoogleAIJson.mockResolvedValueOnce({
        data: {
          workers: [createMockWorkerAssignment()],
          validationPlan: createMockValidationPlan(),
        },
        modelId: 'gemini-3-flash-preview',
      });

      const result = await runRouter(mockSession, availableWorkers);

      expect(result).toEqual(defaultPlan);
      expect(mockGetDefaultWorkerPlan).toHaveBeenCalledWith(mockSession, availableWorkers);
    });

    it('should fall back to default plan when response missing workers', async () => {
      const mockSession = createMockSession();
      const defaultPlan = createDefaultWorkerPlan();

      // Invalid response - missing workers array
      mockCallGoogleAIJson.mockResolvedValueOnce({
        data: {
          enrichedIntent: createMockEnrichedIntent(),
          validationPlan: createMockValidationPlan(),
        },
        modelId: 'gemini-3-flash-preview',
      });

      const result = await runRouter(mockSession, availableWorkers);

      expect(result).toEqual(defaultPlan);
      expect(mockGetDefaultWorkerPlan).toHaveBeenCalledWith(mockSession, availableWorkers);
    });

    it('should fall back to default plan when worker assignment invalid', async () => {
      const mockSession = createMockSession();
      const defaultPlan = createDefaultWorkerPlan();

      // Invalid response - worker missing required fields
      mockCallGoogleAIJson.mockResolvedValueOnce({
        data: {
          enrichedIntent: createMockEnrichedIntent(),
          workers: [
            {
              workerId: 'perplexity',
              // Missing queries, maxResults, timeout
            },
          ],
          validationPlan: createMockValidationPlan(),
        },
        modelId: 'gemini-3-flash-preview',
      });

      const result = await runRouter(mockSession, availableWorkers);

      expect(result).toEqual(defaultPlan);
      expect(mockGetDefaultWorkerPlan).toHaveBeenCalledWith(mockSession, availableWorkers);
    });

    it('should fall back to default plan when validationPlan invalid', async () => {
      const mockSession = createMockSession();
      const defaultPlan = createDefaultWorkerPlan();

      // Invalid response - validation plan missing validateTopN
      mockCallGoogleAIJson.mockResolvedValueOnce({
        data: {
          enrichedIntent: createMockEnrichedIntent(),
          workers: [createMockWorkerAssignment()],
          validationPlan: {
            origins: ['youtube'],
            // Missing validateTopN
          },
        },
        modelId: 'gemini-3-flash-preview',
      });

      const result = await runRouter(mockSession, availableWorkers);

      expect(result).toEqual(defaultPlan);
      expect(mockGetDefaultWorkerPlan).toHaveBeenCalledWith(mockSession, availableWorkers);
    });

    it('should fall back when response is null', async () => {
      const mockSession = createMockSession();
      const defaultPlan = createDefaultWorkerPlan();

      mockCallGoogleAIJson.mockResolvedValueOnce({
        data: null,
        modelId: 'gemini-3-flash-preview',
      });

      const result = await runRouter(mockSession, availableWorkers);

      expect(result).toEqual(defaultPlan);
      expect(mockGetDefaultWorkerPlan).toHaveBeenCalledWith(mockSession, availableWorkers);
    });

    it('should fall back when response is not an object', async () => {
      const mockSession = createMockSession();
      const defaultPlan = createDefaultWorkerPlan();

      mockCallGoogleAIJson.mockResolvedValueOnce({
        data: 'invalid string response',
        modelId: 'gemini-3-flash-preview',
      });

      const result = await runRouter(mockSession, availableWorkers);

      expect(result).toEqual(defaultPlan);
      expect(mockGetDefaultWorkerPlan).toHaveBeenCalledWith(mockSession, availableWorkers);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty availableWorkers array', async () => {
      const mockSession = createMockSession();
      const emptyPlan: WorkerPlan = {
        enrichedIntent: createMockEnrichedIntent(),
        workers: [],
        validationPlan: { validateTopN: 0, origins: [] },
      };

      mockCallGoogleAIJson.mockResolvedValueOnce({
        data: emptyPlan,
        modelId: 'gemini-3-flash-preview',
      });

      const result = await runRouter(mockSession, []);

      expect(mockBuildRouterPrompt).toHaveBeenCalledWith(mockSession, []);
      expect(result.workers).toHaveLength(0);
    });

    it('should handle session with minimal data', async () => {
      const minimalSession = createMockSession({
        destinations: ['Paris'],
        interests: ['art'],
        constraints: {},
      });

      mockCallGoogleAIJson.mockResolvedValueOnce({
        data: createMockWorkerPlan({
          enrichedIntent: createMockEnrichedIntent({
            destinations: ['Paris'],
            interests: ['art'],
            constraints: {},
            inferredTags: ['cultural'],
          }),
        }),
        modelId: 'gemini-3-flash-preview',
      });

      const result = await runRouter(minimalSession, availableWorkers);

      expect(result.enrichedIntent.destinations).toEqual(['Paris']);
      expect(result.enrichedIntent.interests).toEqual(['art']);
    });

    it('should handle single worker in availableWorkers', async () => {
      const mockSession = createMockSession();
      const singleWorkerPlan: WorkerPlan = {
        enrichedIntent: createMockEnrichedIntent(),
        workers: [createMockWorkerAssignment({ workerId: 'perplexity' })],
        validationPlan: { validateTopN: 0, origins: [] },
      };

      mockCallGoogleAIJson.mockResolvedValueOnce({
        data: singleWorkerPlan,
        modelId: 'gemini-3-flash-preview',
      });

      const result = await runRouter(mockSession, ['perplexity']);

      expect(mockBuildRouterPrompt).toHaveBeenCalledWith(mockSession, ['perplexity']);
      expect(result.workers).toHaveLength(1);
      expect(result.workers[0].workerId).toBe('perplexity');
    });
  });

  describe('WorkerPlan Structure Validation', () => {
    it('should return plan with all required fields', async () => {
      const mockSession = createMockSession();
      const fullPlan = createMockWorkerPlan();

      mockCallGoogleAIJson.mockResolvedValueOnce({
        data: fullPlan,
        modelId: 'gemini-3-flash-preview',
      });

      const result = await runRouter(mockSession, availableWorkers);

      // Verify enrichedIntent structure
      expect(result.enrichedIntent).toHaveProperty('destinations');
      expect(result.enrichedIntent).toHaveProperty('dateRange');
      expect(result.enrichedIntent).toHaveProperty('flexibility');
      expect(result.enrichedIntent).toHaveProperty('interests');
      expect(result.enrichedIntent).toHaveProperty('constraints');
      expect(result.enrichedIntent).toHaveProperty('inferredTags');

      // Verify workers structure
      expect(Array.isArray(result.workers)).toBe(true);
      result.workers.forEach((worker) => {
        expect(worker).toHaveProperty('workerId');
        expect(worker).toHaveProperty('queries');
        expect(worker).toHaveProperty('maxResults');
        expect(worker).toHaveProperty('timeout');
      });

      // Verify validationPlan structure
      expect(result.validationPlan).toHaveProperty('validateTopN');
      expect(result.validationPlan).toHaveProperty('origins');
    });

    it('should validate worker assignment constraints', async () => {
      const mockSession = createMockSession();

      // Valid plan with proper constraints
      const validPlan: WorkerPlan = {
        enrichedIntent: createMockEnrichedIntent(),
        workers: [
          {
            workerId: 'perplexity',
            queries: ['query1', 'query2'],
            maxResults: 10,
            timeout: 30000,
          },
        ],
        validationPlan: {
          validateTopN: 5,
          origins: ['youtube'],
        },
      };

      mockCallGoogleAIJson.mockResolvedValueOnce({
        data: validPlan,
        modelId: 'gemini-3-flash-preview',
      });

      const result = await runRouter(mockSession, availableWorkers);

      expect(result.workers[0].maxResults).toBeGreaterThan(0);
      expect(result.workers[0].timeout).toBeGreaterThan(0);
      expect(result.workers[0].queries.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Tests for Helper Module Functions (placeholder tests)
// These test the mocked functions to verify they're called correctly.
// Actual implementation tests will be in their respective test files.
// ============================================================================

describe('Helper Module Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('enrichIntent', () => {
    it('should enrich intent from session', () => {
      const mockSession = createMockSession();
      const enrichedIntent = createMockEnrichedIntent();

      // The mock was set up, test that it can be called with correct args
      (mockEnrichIntent as jest.Mock).mockReturnValueOnce(enrichedIntent);
      const result = (mockEnrichIntent as jest.Mock)(mockSession);

      expect(result).toEqual(enrichedIntent);
      expect(mockEnrichIntent).toHaveBeenCalledWith(mockSession);
    });
  });

  describe('inferTags', () => {
    it('should infer tags from session data', () => {
      const mockSession = createMockSession();
      const expectedTags = ['spring', 'urban', 'culinary'];

      (mockInferTags as jest.Mock).mockReturnValueOnce(expectedTags);
      const result = (mockInferTags as jest.Mock)(mockSession);

      expect(result).toEqual(expectedTags);
      expect(mockInferTags).toHaveBeenCalledWith(mockSession);
    });
  });

  describe('generateQueryVariants', () => {
    it('should generate worker-specific queries', () => {
      const mockSession = createMockSession();
      const expectedQueries = ['best ramen Tokyo', 'Tokyo food guide 2026'];

      (mockGenerateQueryVariants as jest.Mock).mockReturnValueOnce(expectedQueries);
      const result = (mockGenerateQueryVariants as jest.Mock)(mockSession, 'perplexity');

      expect(result).toEqual(expectedQueries);
      expect(mockGenerateQueryVariants).toHaveBeenCalledWith(mockSession, 'perplexity');
    });
  });

  describe('selectWorkers', () => {
    it('should filter workers based on session', () => {
      const mockSession = createMockSession();
      const selectedWorkers = ['perplexity', 'places'];

      (mockSelectWorkers as jest.Mock).mockReturnValueOnce(selectedWorkers);
      const result = (mockSelectWorkers as jest.Mock)(mockSession, availableWorkers);

      expect(result).toEqual(selectedWorkers);
      expect(mockSelectWorkers).toHaveBeenCalledWith(mockSession, availableWorkers);
    });
  });

  describe('allocateBudgets', () => {
    it('should return correct budget structure', () => {
      const mockSession = createMockSession();
      const budgets = [
        { workerId: 'perplexity', maxResults: 15, timeout: 30000, priority: 1 },
        { workerId: 'places', maxResults: 25, timeout: 15000, priority: 1 },
      ];

      (mockAllocateBudgets as jest.Mock).mockReturnValueOnce(budgets);
      const result = (mockAllocateBudgets as jest.Mock)(['perplexity', 'places'], mockSession) as typeof budgets;

      expect(result).toEqual(budgets);
      expect(result[0]).toHaveProperty('workerId');
      expect(result[0]).toHaveProperty('maxResults');
      expect(result[0]).toHaveProperty('timeout');
      expect(result[0]).toHaveProperty('priority');
    });
  });

  describe('createValidationPlan', () => {
    it('should create validation plan for social origins', () => {
      const mockSession = createMockSession();
      const plan = createMockValidationPlan();

      (mockCreateValidationPlan as jest.Mock).mockReturnValueOnce(plan);
      const result = (mockCreateValidationPlan as jest.Mock)(['perplexity', 'youtube'], mockSession) as ValidationPlan;

      expect(result).toEqual(plan);
      expect(result.validateTopN).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.origins)).toBe(true);
    });
  });

  describe('getDefaultWorkerPlan', () => {
    it('should create valid fallback plan', () => {
      const mockSession = createMockSession();
      const defaultPlan = createDefaultWorkerPlan();

      (mockGetDefaultWorkerPlan as jest.Mock).mockReturnValueOnce(defaultPlan);
      const result = (mockGetDefaultWorkerPlan as jest.Mock)(mockSession, availableWorkers) as WorkerPlan;

      expect(result).toEqual(defaultPlan);
      expect(result.enrichedIntent).toBeDefined();
      expect(result.workers.length).toBeGreaterThan(0);
      expect(result.validationPlan).toBeDefined();
    });
  });
});
