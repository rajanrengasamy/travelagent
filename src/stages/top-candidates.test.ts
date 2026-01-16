/**
 * Top Candidates Stage Tests
 *
 * Tests for the top candidates selection stage (Stage 08).
 * Verifies correct selection of top N candidates with diversity constraints.
 *
 * @module stages/top-candidates.test
 * @see TODO Section 16.2 - Write unit tests for top candidates selection
 */

import { describe, it, expect, jest } from '@jest/globals';
import { topCandidatesStage, DEFAULT_TOP_N } from './top-candidates.js';
import type { Candidate, CandidateType } from '../schemas/candidate.js';
import type { StageContext } from '../pipeline/types.js';
import type { ValidateStageOutput } from './validate/types.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a minimal candidate for testing
 */
function createCandidate(
  overrides: Partial<Candidate> & { candidateId: string }
): Candidate {
  return {
    candidateId: overrides.candidateId,
    type: overrides.type ?? 'place',
    title: overrides.title ?? `Test ${overrides.candidateId}`,
    summary: overrides.summary ?? 'Test summary',
    tags: overrides.tags ?? [],
    origin: overrides.origin ?? 'web',
    sourceRefs: overrides.sourceRefs ?? [],
    confidence: overrides.confidence ?? 'verified',
    score: overrides.score ?? 50,
    locationText: overrides.locationText,
    coordinates: overrides.coordinates,
    validation: overrides.validation,
    clusterId: overrides.clusterId,
    metadata: overrides.metadata,
  };
}

/**
 * Create multiple candidates with sequential IDs and scores.
 * Uses varied types to avoid diversity constraint issues.
 */
function createCandidates(count: number, baseScore = 80): Candidate[] {
  const types: CandidateType[] = ['place', 'activity', 'food', 'experience', 'neighborhood', 'daytrip'];
  return Array.from({ length: count }, (_, i) =>
    createCandidate({
      candidateId: `cand-${i + 1}`,
      type: types[i % types.length], // Rotate through types
      score: baseScore - i, // Descending scores
      title: `Candidate ${i + 1}`,
    })
  );
}

/**
 * Create a minimal stage context for testing
 */
function createContext(overrides?: Partial<StageContext>): StageContext {
  return {
    sessionId: 'test-session',
    runId: 'test-run',
    dataDir: '/tmp/test',
    config: {
      schemaVersion: 1,
      runId: 'test-run',
      sessionId: 'test-session',
      startedAt: new Date().toISOString(),
      status: 'running',
      mode: 'full',
      models: {
        enhancement: 'test-model',
        router: 'test-model',
        normalizer: 'test-model',
        aggregator: 'test-model',
        validator: 'test-model',
      },
      promptVersions: {
        enhancement: 'v1',
        router: 'v1',
        aggregator: 'v1',
        youtubeExtraction: 'v1',
        validation: 'v1',
      },
      limits: {
        maxCandidatesPerWorker: 20,
        maxTopCandidates: 30,
        maxValidations: 10,
        workerTimeout: 30000,
      },
      flags: {
        skipEnhancement: false,
        skipValidation: false,
        skipYoutube: false,
      },
    },
    costTracker: {
      addTokenUsage: jest.fn(),
      addApiCalls: jest.fn(),
      addQuotaUnits: jest.fn(),
      getUsage: jest.fn().mockReturnValue({ tokens: 0, apiCalls: 0 }),
    } as any,
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    ...overrides,
  };
}

/**
 * Wrap candidates in ValidateStageOutput format
 */
function wrapAsValidateOutput(candidates: Candidate[]): ValidateStageOutput {
  return {
    candidates,
    validationDetails: [],
    stats: {
      inputCount: candidates.length,
      outputCount: candidates.length,
      youtubeCount: 0,
      validatedCount: 0,
      passedCount: 0,
      failedCount: 0,
      unverifiedCount: 0,
      skippedCount: candidates.length,
      totalValidationTimeMs: 0,
    },
  };
}

// ============================================================================
// Stage Identity Tests
// ============================================================================

describe('topCandidatesStage', () => {
  describe('stage identity', () => {
    it('has correct stage id', () => {
      expect(topCandidatesStage.id).toBe('08_top_candidates');
    });

    it('has correct stage name', () => {
      expect(topCandidatesStage.name).toBe('top_candidates');
    });

    it('has correct stage number', () => {
      expect(topCandidatesStage.number).toBe(8);
    });
  });

  // ============================================================================
  // Input Handling Tests
  // ============================================================================

  describe('input handling', () => {
    it('accepts ValidateStageOutput input', async () => {
      const candidates = createCandidates(10);
      const input = wrapAsValidateOutput(candidates);
      const context = createContext();

      const result = await topCandidatesStage.execute(context, input);

      expect(result.data.candidates).toHaveLength(10);
      expect(result.data.stats.inputCount).toBe(10);
    });

    it('accepts Candidate[] input directly', async () => {
      const candidates = createCandidates(10);
      const context = createContext();

      const result = await topCandidatesStage.execute(context, candidates);

      expect(result.data.candidates).toHaveLength(10);
      expect(result.data.stats.inputCount).toBe(10);
    });

    it('handles empty input', async () => {
      const context = createContext();

      const result = await topCandidatesStage.execute(context, []);

      expect(result.data.candidates).toHaveLength(0);
      expect(result.data.stats.inputCount).toBe(0);
      expect(result.data.stats.outputCount).toBe(0);
    });
  });

  // ============================================================================
  // Top N Selection Tests
  // ============================================================================

  describe('top N selection', () => {
    it('selects default 30 candidates when more are available', async () => {
      const candidates = createCandidates(50);
      const context = createContext();

      const result = await topCandidatesStage.execute(context, candidates);

      expect(result.data.candidates).toHaveLength(DEFAULT_TOP_N);
      expect(result.data.stats.topN).toBe(DEFAULT_TOP_N);
    });

    it('selects all candidates when fewer than topN', async () => {
      const candidates = createCandidates(15);
      const context = createContext();

      const result = await topCandidatesStage.execute(context, candidates);

      expect(result.data.candidates).toHaveLength(15);
      expect(result.data.stats.outputCount).toBe(15);
    });

    it('uses config.limits.maxTopCandidates when set', async () => {
      const candidates = createCandidates(50);
      const context = createContext();
      context.config.limits.maxTopCandidates = 10;

      const result = await topCandidatesStage.execute(context, candidates);

      expect(result.data.candidates).toHaveLength(10);
      expect(result.data.stats.topN).toBe(10);
    });

    it('selects candidates sorted by score descending', async () => {
      const candidates = [
        createCandidate({ candidateId: '1', score: 50 }),
        createCandidate({ candidateId: '2', score: 90 }),
        createCandidate({ candidateId: '3', score: 70 }),
      ];
      const context = createContext();
      context.config.limits.maxTopCandidates = 3;

      const result = await topCandidatesStage.execute(context, candidates);

      expect(result.data.candidates[0].candidateId).toBe('2'); // score 90
      expect(result.data.candidates[1].candidateId).toBe('3'); // score 70
      expect(result.data.candidates[2].candidateId).toBe('1'); // score 50
    });
  });

  // ============================================================================
  // Diversity Constraint Tests
  // ============================================================================

  describe('diversity constraints', () => {
    it('enforces max 4 of same type in top 20', async () => {
      // Create 25 food candidates
      const candidates = Array.from({ length: 25 }, (_, i) =>
        createCandidate({
          candidateId: `food-${i + 1}`,
          type: 'food',
          score: 100 - i,
        })
      );
      const context = createContext();
      context.config.limits.maxTopCandidates = 20;

      const result = await topCandidatesStage.execute(context, candidates);

      // Should only have 4 food candidates in top 20 (max same type)
      const foodInTop20 = result.data.candidates
        .slice(0, 20)
        .filter((c) => c.type === 'food');
      expect(foodInTop20.length).toBeLessThanOrEqual(4);
    });

    it('allows diversity with mixed types', async () => {
      const types: CandidateType[] = ['place', 'activity', 'food', 'experience'];
      const candidates: Candidate[] = [];

      // Create 8 candidates of each type (32 total)
      for (let i = 0; i < 8; i++) {
        for (const type of types) {
          candidates.push(
            createCandidate({
              candidateId: `${type}-${i + 1}`,
              type,
              score: 100 - i * 4 - types.indexOf(type), // Interleaved scores
            })
          );
        }
      }

      const context = createContext();
      context.config.limits.maxTopCandidates = 20;

      const result = await topCandidatesStage.execute(context, candidates);

      // With mixed types, should have good diversity
      const typeCounts = new Map<string, number>();
      for (const c of result.data.candidates.slice(0, 20)) {
        typeCounts.set(c.type, (typeCounts.get(c.type) ?? 0) + 1);
      }

      // Each type should have at most 4 in top 20
      for (const count of typeCounts.values()) {
        expect(count).toBeLessThanOrEqual(4);
      }
    });

    it('tracks deferred count when diversity constraints applied', async () => {
      // Create 10 food candidates with high scores
      const candidates = Array.from({ length: 10 }, (_, i) =>
        createCandidate({
          candidateId: `food-${i + 1}`,
          type: 'food',
          score: 100 - i,
        })
      );
      const context = createContext();
      context.config.limits.maxTopCandidates = 10;

      const result = await topCandidatesStage.execute(context, candidates);

      // Some should be deferred due to diversity constraints
      // (but all still included since only 10 total)
      expect(result.data.stats).toHaveProperty('deferredCount');
    });
  });

  // ============================================================================
  // Statistics Tests
  // ============================================================================

  describe('statistics', () => {
    it('calculates correct score statistics', async () => {
      const candidates = [
        createCandidate({ candidateId: '1', score: 100 }),
        createCandidate({ candidateId: '2', score: 80 }),
        createCandidate({ candidateId: '3', score: 60 }),
      ];
      const context = createContext();

      const result = await topCandidatesStage.execute(context, candidates);

      expect(result.data.stats.maxScore).toBe(100);
      expect(result.data.stats.minScore).toBe(60);
      expect(result.data.stats.averageScore).toBe(80); // (100+80+60)/3 = 80
    });

    it('counts candidates by type', async () => {
      const candidates = [
        createCandidate({ candidateId: '1', type: 'food', score: 90 }),
        createCandidate({ candidateId: '2', type: 'food', score: 85 }),
        createCandidate({ candidateId: '3', type: 'place', score: 80 }),
        createCandidate({ candidateId: '4', type: 'activity', score: 75 }),
      ];
      const context = createContext();

      const result = await topCandidatesStage.execute(context, candidates);

      expect(result.data.stats.byType).toEqual({
        food: 2,
        place: 1,
        activity: 1,
      });
    });

    it('counts candidates by destination', async () => {
      const candidates = [
        createCandidate({ candidateId: '1', locationText: 'Shibuya, Tokyo, Japan', score: 90 }),
        createCandidate({ candidateId: '2', locationText: 'Shinjuku, Tokyo, Japan', score: 85 }),
        createCandidate({ candidateId: '3', locationText: 'Eiffel Tower, Paris, France', score: 80 }),
      ];
      const context = createContext();

      const result = await topCandidatesStage.execute(context, candidates);

      expect(result.data.stats.byDestination).toEqual({
        tokyo: 2,
        paris: 1,
      });
    });
  });

  // ============================================================================
  // Result Structure Tests
  // ============================================================================

  describe('result structure', () => {
    it('returns correct StageResult structure', async () => {
      const candidates = createCandidates(5);
      const context = createContext();

      const result = await topCandidatesStage.execute(context, candidates);

      // Check data structure
      expect(result.data).toHaveProperty('candidates');
      expect(result.data).toHaveProperty('stats');
      expect(Array.isArray(result.data.candidates)).toBe(true);

      // Check metadata
      expect(result.metadata).toHaveProperty('stageNumber', 8);
      expect(result.metadata).toHaveProperty('stageName', 'top_candidates');
      expect(result.metadata).toHaveProperty('sessionId', 'test-session');
      expect(result.metadata).toHaveProperty('runId', 'test-run');
      expect(result.metadata).toHaveProperty('upstreamStage', '07_candidates_validated');

      // Check timing
      expect(result.timing).toHaveProperty('startedAt');
      expect(result.timing).toHaveProperty('completedAt');
      expect(result.timing).toHaveProperty('durationMs');
      expect(typeof result.timing.durationMs).toBe('number');
    });

    it('includes config in metadata', async () => {
      const candidates = createCandidates(10);
      const context = createContext();
      context.config.limits.maxTopCandidates = 5;

      const result = await topCandidatesStage.execute(context, candidates);

      expect(result.metadata.config).toMatchObject({
        inputCount: 10,
        outputCount: 5,
        topN: 5,
      });
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('handles single candidate', async () => {
      const candidates = [createCandidate({ candidateId: '1', score: 75 })];
      const context = createContext();

      const result = await topCandidatesStage.execute(context, candidates);

      expect(result.data.candidates).toHaveLength(1);
      expect(result.data.stats.averageScore).toBe(75);
      expect(result.data.stats.minScore).toBe(75);
      expect(result.data.stats.maxScore).toBe(75);
    });

    it('handles candidates with same score', async () => {
      const types: CandidateType[] = ['place', 'activity', 'food', 'experience', 'neighborhood'];
      const candidates = Array.from({ length: 5 }, (_, i) =>
        createCandidate({
          candidateId: `cand-${i + 1}`,
          type: types[i], // Different types to avoid diversity constraints
          score: 80, // All same score
        })
      );
      const context = createContext();

      const result = await topCandidatesStage.execute(context, candidates);

      expect(result.data.candidates).toHaveLength(5);
      expect(result.data.stats.averageScore).toBe(80);
    });

    it('handles candidates with zero score', async () => {
      const candidates = [
        createCandidate({ candidateId: '1', score: 0 }),
        createCandidate({ candidateId: '2', score: 0 }),
      ];
      const context = createContext();

      const result = await topCandidatesStage.execute(context, candidates);

      expect(result.data.candidates).toHaveLength(2);
      expect(result.data.stats.averageScore).toBe(0);
      expect(result.data.stats.minScore).toBe(0);
      expect(result.data.stats.maxScore).toBe(0);
    });

    it('handles candidates without locationText', async () => {
      const candidates = [
        createCandidate({ candidateId: '1', score: 90 }),
        createCandidate({ candidateId: '2', score: 80 }),
      ];
      const context = createContext();

      const result = await topCandidatesStage.execute(context, candidates);

      expect(result.data.stats.byDestination).toEqual({});
    });

    it('preserves candidate properties through selection', async () => {
      const candidate = createCandidate({
        candidateId: 'test-1',
        type: 'food',
        title: 'Sushi Restaurant',
        summary: 'Amazing sushi place',
        tags: ['sushi', 'japanese', 'seafood'],
        origin: 'youtube',
        confidence: 'verified',
        score: 95,
        locationText: 'Tsukiji, Tokyo, Japan',
        validation: {
          status: 'verified',
          notes: 'Confirmed existence via Perplexity',
        },
        metadata: {
          videoId: 'abc123',
          channelName: 'FoodVlogger',
        },
      });
      const context = createContext();

      const result = await topCandidatesStage.execute(context, [candidate]);

      const selected = result.data.candidates[0];
      expect(selected.candidateId).toBe('test-1');
      expect(selected.type).toBe('food');
      expect(selected.title).toBe('Sushi Restaurant');
      expect(selected.tags).toEqual(['sushi', 'japanese', 'seafood']);
      expect(selected.validation?.status).toBe('verified');
      expect(selected.metadata?.videoId).toBe('abc123');
    });
  });

  // ============================================================================
  // Logging Tests
  // ============================================================================

  describe('logging', () => {
    it('logs processing info', async () => {
      const candidates = createCandidates(10);
      const context = createContext();

      await topCandidatesStage.execute(context, candidates);

      expect(context.logger?.info).toHaveBeenCalledWith(
        expect.stringContaining('[top-candidates] Processing 10 candidates')
      );
    });

    it('logs selection results', async () => {
      const candidates = createCandidates(10);
      const context = createContext();

      await topCandidatesStage.execute(context, candidates);

      expect(context.logger?.info).toHaveBeenCalledWith(
        expect.stringContaining('[top-candidates] Selected')
      );
    });
  });
});

// ============================================================================
// Type Helpers Tests
// ============================================================================

describe('top-candidates/types', () => {
  describe('createEmptyTopCandidatesStats', () => {
    it('creates stats with specified topN', async () => {
      const { createEmptyTopCandidatesStats } = await import('./top-candidates/types.js');

      const stats = createEmptyTopCandidatesStats(25);

      expect(stats.topN).toBe(25);
      expect(stats.inputCount).toBe(0);
      expect(stats.outputCount).toBe(0);
      expect(stats.deferredCount).toBe(0);
      expect(stats.byType).toEqual({});
      expect(stats.byDestination).toEqual({});
    });
  });

  describe('countCandidatesByType', () => {
    it('counts candidates correctly', async () => {
      const { countCandidatesByType } = await import('./top-candidates/types.js');

      const candidates = [
        { type: 'food' as const },
        { type: 'food' as const },
        { type: 'place' as const },
      ];

      const counts = countCandidatesByType(candidates);

      expect(counts).toEqual({ food: 2, place: 1 });
    });
  });

  describe('countCandidatesByDestination', () => {
    it('counts destinations correctly', async () => {
      const { countCandidatesByDestination } = await import('./top-candidates/types.js');
      const { extractDestination } = await import('../ranking/diversity.js');

      const candidates = [
        { locationText: 'Shibuya, Tokyo, Japan' },
        { locationText: 'Shinjuku, Tokyo' },
        { locationText: 'Louvre, Paris, France' },
      ];

      const counts = countCandidatesByDestination(candidates, extractDestination);

      expect(counts).toEqual({ tokyo: 2, paris: 1 });
    });
  });

  describe('calculateScoreStats', () => {
    it('calculates correct statistics', async () => {
      const { calculateScoreStats } = await import('./top-candidates/types.js');

      const candidates = [
        { score: 100 },
        { score: 50 },
        { score: 75 },
      ];

      const stats = calculateScoreStats(candidates);

      expect(stats.min).toBe(50);
      expect(stats.max).toBe(100);
      expect(stats.average).toBe(75);
    });

    it('handles empty array', async () => {
      const { calculateScoreStats } = await import('./top-candidates/types.js');

      const stats = calculateScoreStats([]);

      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
      expect(stats.average).toBe(0);
    });
  });
});

// ============================================================================
// DEFAULT_TOP_N Export Test
// ============================================================================

describe('DEFAULT_TOP_N', () => {
  it('is exported and equals 30', () => {
    expect(DEFAULT_TOP_N).toBe(30);
  });
});
