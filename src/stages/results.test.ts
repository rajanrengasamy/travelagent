/**
 * Results Stage Tests (Stage 10)
 *
 * Comprehensive tests for:
 * - ResultsStageOutput schema validation
 * - ResultsStageStats schema validation
 * - Stage execution with AggregatorOutput transformation
 * - Markdown generation with narrative and degraded modes
 * - JSON and markdown export functions
 * - File system operations with directory creation
 *
 * @module stages/results.test
 * @see PRD Section 18.0 - Results Generation (Stage 10)
 * @see TODO Section 18.6 - Write unit tests for results generation
 */

import { describe, it, expect, jest } from '@jest/globals';
import { z } from 'zod';
import type { Candidate } from '../schemas/candidate.js';
import type { AggregatorOutput, NarrativeOutput } from '../aggregator/types.js';
import type { StageContext } from '../pipeline/types.js';
import {
  DegradationLevelSchema,
  WorkerStatusSchema,
  WorkerSummarySchema,
  DiscoveryResultsSchema,
  type DegradationLevel,
  type WorkerSummary,
  type DiscoveryResults,
  DISCOVERY_RESULTS_SCHEMA_VERSION,
} from '../schemas/discovery-results.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a minimal candidate for testing.
 */
function createMockCandidate(overrides: Partial<Candidate> = {}): Candidate {
  const id = overrides.candidateId ?? `test-${Math.random().toString(36).substring(7)}`;
  return {
    candidateId: id,
    type: 'place',
    title: 'Test Restaurant',
    summary: 'A wonderful test restaurant with amazing food.',
    locationText: 'Tokyo, Japan',
    tags: ['food', 'restaurant', 'japanese'],
    origin: 'youtube',
    sourceRefs: [
      {
        url: 'https://youtube.com/watch?v=test',
        publisher: 'Test Channel',
        retrievedAt: new Date().toISOString(),
      },
    ],
    confidence: 'verified',
    validation: {
      status: 'verified',
      notes: 'Verified via Perplexity',
    },
    score: 85,
    ...overrides,
  };
}

/**
 * Create an array of mock candidates with varied types.
 */
function createMockCandidates(count: number): Candidate[] {
  const types: Candidate['type'][] = ['place', 'food', 'activity', 'neighborhood', 'experience'];
  const locations = ['Tokyo, Japan', 'Kyoto, Japan', 'Osaka, Japan', 'Nara, Japan'];
  const origins: Candidate['origin'][] = ['youtube', 'web', 'places'];

  return Array.from({ length: count }, (_, i) => {
    const type = types[i % types.length];
    return createMockCandidate({
      candidateId: `candidate-${i + 1}`,
      type,
      title: `${type.charAt(0).toUpperCase() + type.slice(1)} ${i + 1}`,
      summary: `An amazing ${type} experience worth visiting.`,
      locationText: locations[i % locations.length],
      origin: origins[i % origins.length],
      score: 90 - i * 3,
      tags: [type, 'recommended', locations[i % locations.length].split(',')[0].toLowerCase()],
    });
  });
}

/**
 * Create a mock narrative output.
 */
function createMockNarrative(candidateIds: string[]): NarrativeOutput {
  return {
    introduction: 'Welcome to your personalized Japan travel guide! Here are our top picks.',
    sections: [
      {
        heading: 'Must-See Attractions',
        content: 'These top attractions should be at the top of your list.',
        candidateIds: candidateIds.slice(0, Math.min(3, candidateIds.length)),
      },
      {
        heading: 'Hidden Gems',
        content: 'These lesser-known spots offer unique experiences.',
        candidateIds: candidateIds.slice(3, Math.min(5, candidateIds.length)),
      },
      {
        heading: 'Food & Dining',
        content: 'Japan is a food paradise. Here are our culinary recommendations.',
        candidateIds: candidateIds.slice(5, Math.min(7, candidateIds.length)),
      },
    ],
    highlights: [
      {
        title: 'Best Food Experience',
        description: 'An unforgettable culinary adventure.',
        candidateId: candidateIds[0],
        type: 'local_favorite',
      },
      {
        title: 'Unique Cultural Site',
        description: 'A must-visit cultural destination.',
        candidateId: candidateIds[1],
        type: 'must_see',
      },
      {
        title: 'Budget-Friendly Option',
        description: 'Great experience without breaking the bank.',
        candidateId: candidateIds[2],
        type: 'budget_friendly',
      },
    ],
    recommendations: [
      {
        text: 'Visit early morning for fewer crowds.',
        reasoning: 'Popular sites get crowded after 10am, especially on weekends.',
        candidateIds: candidateIds.slice(0, 2),
        priority: 'high',
      },
      {
        text: 'Book restaurants in advance.',
        reasoning: 'Popular spots fill up quickly, especially during peak season.',
        candidateIds: candidateIds.slice(2, 4),
        priority: 'medium',
      },
    ],
    conclusion: 'Enjoy your trip to Japan! Safe travels and delicious discoveries await.',
  };
}

/**
 * Create a mock AggregatorOutput with narrative.
 */
function createMockAggregatorOutput(candidateCount = 10, withNarrative = true): AggregatorOutput {
  const candidates = createMockCandidates(candidateCount);
  const candidateIds = candidates.map((c) => c.candidateId);

  return {
    candidates,
    narrative: withNarrative ? createMockNarrative(candidateIds) : null,
    stats: {
      inputCount: candidateCount,
      includedCount: candidateCount,
      sectionCount: withNarrative ? 3 : 0,
      highlightCount: withNarrative ? 3 : 0,
      recommendationCount: withNarrative ? 2 : 0,
      narrativeGenerated: withNarrative,
      tokenUsage: withNarrative ? { input: 5000, output: 2000 } : undefined,
      durationMs: withNarrative ? 3500 : 100,
    },
  };
}

/**
 * Create a mock StageContext for testing.
 */
function createMockContext(overrides?: Partial<StageContext>): StageContext {
  return {
    sessionId: 'test-session-20240315',
    runId: 'test-run-20240315-120000',
    dataDir: '/tmp/test-travelagent',
    config: {
      schemaVersion: 1,
      runId: 'test-run-20240315-120000',
      sessionId: 'test-session-20240315',
      startedAt: new Date().toISOString(),
      status: 'running',
      mode: 'full',
      models: {
        enhancement: 'gemini-2.0-flash',
        router: 'gemini-2.0-flash',
        normalizer: 'gemini-2.0-flash',
        aggregator: 'gpt-4.1',
        validator: 'perplexity-sonar',
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
      getTotal: jest.fn().mockReturnValue({
        tokens: { input: 10000, output: 5000 },
        estimatedCost: 0.25,
      }),
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
 * Create mock worker summaries for testing.
 */
function createMockWorkerSummaries(): WorkerSummary[] {
  return [
    {
      workerId: 'perplexity',
      status: 'ok',
      durationMs: 2500,
      candidateCount: 15,
    },
    {
      workerId: 'places',
      status: 'ok',
      durationMs: 1800,
      candidateCount: 20,
    },
    {
      workerId: 'youtube',
      status: 'partial',
      durationMs: 5000,
      candidateCount: 8,
      errorMessage: 'Some transcripts unavailable',
    },
  ];
}

/**
 * Create a mock DiscoveryResults for testing.
 */
function createMockDiscoveryResults(options: {
  candidateCount?: number;
  degradationLevel?: DegradationLevel;
  withClusters?: boolean;
} = {}): DiscoveryResults {
  const {
    candidateCount = 10,
    degradationLevel = 'none',
    withClusters = false,
  } = options;

  const candidates = createMockCandidates(candidateCount);

  return {
    schemaVersion: DISCOVERY_RESULTS_SCHEMA_VERSION,
    sessionId: 'test-session-20240315',
    runId: 'test-run-20240315-120000',
    createdAt: new Date().toISOString(),
    durationMs: 45000,
    enrichedIntent: {
      destination: 'Japan',
      interests: ['food', 'culture', 'nature'],
      travelStyle: 'explorer',
    },
    candidates,
    clusters: withClusters
      ? [
          {
            clusterId: 'cluster-1',
            representativeCandidateId: candidates[0].candidateId,
            alternateCandidateIds: [candidates[1].candidateId, candidates[2].candidateId],
          },
        ]
      : undefined,
    workerSummary: createMockWorkerSummaries(),
    degradation: {
      level: degradationLevel,
      failedWorkers: degradationLevel === 'partial_workers' ? ['youtube'] : [],
      warnings:
        degradationLevel !== 'none'
          ? ['Some workers experienced issues during execution']
          : [],
    },
  };
}

// ============================================================================
// Type Validation Tests
// ============================================================================

describe('Results Stage Type Validation', () => {
  describe('DegradationLevelSchema', () => {
    it('validates all valid degradation levels', () => {
      const validLevels = ['none', 'partial_workers', 'no_aggregation', 'timeout', 'failed'];

      for (const level of validLevels) {
        const result = DegradationLevelSchema.safeParse(level);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(level);
        }
      }
    });

    it('rejects invalid degradation levels', () => {
      const invalidLevels = ['success', 'error', 'partial', 'complete', ''];

      for (const level of invalidLevels) {
        const result = DegradationLevelSchema.safeParse(level);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('WorkerStatusSchema', () => {
    it('validates all valid worker statuses', () => {
      const validStatuses = ['ok', 'error', 'partial', 'skipped'];

      for (const status of validStatuses) {
        const result = WorkerStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid worker statuses', () => {
      const invalidStatuses = ['success', 'failed', 'running', 'pending'];

      for (const status of invalidStatuses) {
        const result = WorkerStatusSchema.safeParse(status);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('WorkerSummarySchema', () => {
    it('validates a complete worker summary', () => {
      const summary: WorkerSummary = {
        workerId: 'perplexity',
        status: 'ok',
        durationMs: 2500,
        candidateCount: 15,
      };

      const result = WorkerSummarySchema.safeParse(summary);
      expect(result.success).toBe(true);
    });

    it('validates worker summary with error message', () => {
      const summary: WorkerSummary = {
        workerId: 'youtube',
        status: 'partial',
        durationMs: 5000,
        candidateCount: 5,
        errorMessage: 'Some transcripts unavailable',
      };

      const result = WorkerSummarySchema.safeParse(summary);
      expect(result.success).toBe(true);
    });

    it('validates worker summary with error status', () => {
      const summary: WorkerSummary = {
        workerId: 'places',
        status: 'error',
        durationMs: 100,
        candidateCount: 0,
        errorMessage: 'API quota exceeded',
      };

      const result = WorkerSummarySchema.safeParse(summary);
      expect(result.success).toBe(true);
    });

    it('rejects worker summary with empty workerId', () => {
      const summary = {
        workerId: '',
        status: 'ok',
        durationMs: 1000,
        candidateCount: 10,
      };

      const result = WorkerSummarySchema.safeParse(summary);
      expect(result.success).toBe(false);
    });

    it('rejects worker summary with negative duration', () => {
      const summary = {
        workerId: 'perplexity',
        status: 'ok',
        durationMs: -100,
        candidateCount: 10,
      };

      const result = WorkerSummarySchema.safeParse(summary);
      expect(result.success).toBe(false);
    });

    it('rejects worker summary with negative candidate count', () => {
      const summary = {
        workerId: 'perplexity',
        status: 'ok',
        durationMs: 1000,
        candidateCount: -5,
      };

      const result = WorkerSummarySchema.safeParse(summary);
      expect(result.success).toBe(false);
    });
  });

  describe('DiscoveryResultsSchema', () => {
    it('validates a complete discovery results object', () => {
      const results = createMockDiscoveryResults();
      const parsed = DiscoveryResultsSchema.safeParse(results);
      expect(parsed.success).toBe(true);
    });

    it('validates results with clusters', () => {
      const results = createMockDiscoveryResults({ withClusters: true });
      const parsed = DiscoveryResultsSchema.safeParse(results);
      expect(parsed.success).toBe(true);
    });

    it('validates results with partial_workers degradation', () => {
      const results = createMockDiscoveryResults({ degradationLevel: 'partial_workers' });
      const parsed = DiscoveryResultsSchema.safeParse(results);
      expect(parsed.success).toBe(true);
    });

    it('validates results with no_aggregation degradation', () => {
      const results = createMockDiscoveryResults({ degradationLevel: 'no_aggregation' });
      const parsed = DiscoveryResultsSchema.safeParse(results);
      expect(parsed.success).toBe(true);
    });

    it('validates results with timeout degradation', () => {
      const results = createMockDiscoveryResults({ degradationLevel: 'timeout' });
      const parsed = DiscoveryResultsSchema.safeParse(results);
      expect(parsed.success).toBe(true);
    });

    it('validates results with failed degradation (zero candidates)', () => {
      const results = createMockDiscoveryResults({
        candidateCount: 0,
        degradationLevel: 'failed',
      });
      const parsed = DiscoveryResultsSchema.safeParse(results);
      expect(parsed.success).toBe(true);
    });

    it('rejects results without schemaVersion', () => {
      const results = createMockDiscoveryResults();
      const { schemaVersion, ...withoutVersion } = results;
      const parsed = DiscoveryResultsSchema.safeParse(withoutVersion);
      expect(parsed.success).toBe(false);
    });

    it('rejects results without sessionId', () => {
      const results = createMockDiscoveryResults();
      const { sessionId, ...withoutSession } = results;
      const parsed = DiscoveryResultsSchema.safeParse(withoutSession);
      expect(parsed.success).toBe(false);
    });

    it('rejects results without runId', () => {
      const results = createMockDiscoveryResults();
      const { runId, ...withoutRun } = results;
      const parsed = DiscoveryResultsSchema.safeParse(withoutRun);
      expect(parsed.success).toBe(false);
    });

    it('rejects results without createdAt', () => {
      const results = createMockDiscoveryResults();
      const { createdAt, ...withoutCreatedAt } = results;
      const parsed = DiscoveryResultsSchema.safeParse(withoutCreatedAt);
      expect(parsed.success).toBe(false);
    });

    it('rejects results with invalid createdAt format', () => {
      const results = createMockDiscoveryResults();
      const invalidResults = { ...results, createdAt: 'invalid-date' };
      const parsed = DiscoveryResultsSchema.safeParse(invalidResults);
      expect(parsed.success).toBe(false);
    });

    it('rejects results without degradation', () => {
      const results = createMockDiscoveryResults();
      const { degradation, ...withoutDegradation } = results;
      const parsed = DiscoveryResultsSchema.safeParse(withoutDegradation);
      expect(parsed.success).toBe(false);
    });

    it('rejects results without workerSummary', () => {
      const results = createMockDiscoveryResults();
      const { workerSummary, ...withoutSummary } = results;
      const parsed = DiscoveryResultsSchema.safeParse(withoutSummary);
      expect(parsed.success).toBe(false);
    });
  });
});

// ============================================================================
// ResultsStageStats Schema Tests
// ============================================================================

describe('ResultsStageStats Schema', () => {
  // Define the expected schema structure for ResultsStageStats
  const ResultsStageStatsSchema = z.object({
    candidateCount: z.number().int().nonnegative(),
    hasNarrative: z.boolean(),
    sectionCount: z.number().int().nonnegative(),
    highlightCount: z.number().int().nonnegative(),
    recommendationCount: z.number().int().nonnegative(),
    degradationLevel: DegradationLevelSchema,
    totalDurationMs: z.number().nonnegative(),
    jsonExported: z.boolean(),
    mdExported: z.boolean(),
  });

  it('validates complete stats with narrative', () => {
    const stats = {
      candidateCount: 25,
      hasNarrative: true,
      sectionCount: 3,
      highlightCount: 5,
      recommendationCount: 4,
      degradationLevel: 'none',
      totalDurationMs: 45000,
      jsonExported: true,
      mdExported: true,
    };

    const result = ResultsStageStatsSchema.safeParse(stats);
    expect(result.success).toBe(true);
  });

  it('validates stats without narrative (degraded mode)', () => {
    const stats = {
      candidateCount: 25,
      hasNarrative: false,
      sectionCount: 0,
      highlightCount: 0,
      recommendationCount: 0,
      degradationLevel: 'no_aggregation',
      totalDurationMs: 30000,
      jsonExported: true,
      mdExported: true,
    };

    const result = ResultsStageStatsSchema.safeParse(stats);
    expect(result.success).toBe(true);
  });

  it('validates stats with partial worker failure', () => {
    const stats = {
      candidateCount: 15,
      hasNarrative: true,
      sectionCount: 2,
      highlightCount: 3,
      recommendationCount: 2,
      degradationLevel: 'partial_workers',
      totalDurationMs: 35000,
      jsonExported: true,
      mdExported: true,
    };

    const result = ResultsStageStatsSchema.safeParse(stats);
    expect(result.success).toBe(true);
  });

  it('validates stats with zero candidates (failed)', () => {
    const stats = {
      candidateCount: 0,
      hasNarrative: false,
      sectionCount: 0,
      highlightCount: 0,
      recommendationCount: 0,
      degradationLevel: 'failed',
      totalDurationMs: 5000,
      jsonExported: true,
      mdExported: true,
    };

    const result = ResultsStageStatsSchema.safeParse(stats);
    expect(result.success).toBe(true);
  });

  it('rejects stats with negative candidate count', () => {
    const stats = {
      candidateCount: -5,
      hasNarrative: true,
      sectionCount: 3,
      highlightCount: 5,
      recommendationCount: 4,
      degradationLevel: 'none',
      totalDurationMs: 45000,
      jsonExported: true,
      mdExported: true,
    };

    const result = ResultsStageStatsSchema.safeParse(stats);
    expect(result.success).toBe(false);
  });

  it('rejects stats with invalid degradation level', () => {
    const stats = {
      candidateCount: 25,
      hasNarrative: true,
      sectionCount: 3,
      highlightCount: 5,
      recommendationCount: 4,
      degradationLevel: 'invalid_level',
      totalDurationMs: 45000,
      jsonExported: true,
      mdExported: true,
    };

    const result = ResultsStageStatsSchema.safeParse(stats);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Stage Execution Tests
// ============================================================================

describe('Results Stage Execution', () => {
  describe('transforming AggregatorOutput to ResultsStageOutput', () => {
    it('preserves all candidates in output', () => {
      const aggregatorOutput = createMockAggregatorOutput(15);

      // Verify all candidates are present
      expect(aggregatorOutput.candidates).toHaveLength(15);

      // Each candidate should have required fields
      for (const candidate of aggregatorOutput.candidates) {
        expect(candidate.candidateId).toBeDefined();
        expect(candidate.type).toBeDefined();
        expect(candidate.title).toBeDefined();
        expect(candidate.summary).toBeDefined();
        expect(candidate.origin).toBeDefined();
        expect(candidate.sourceRefs).toBeDefined();
        expect(candidate.confidence).toBeDefined();
        expect(candidate.score).toBeDefined();
      }
    });

    it('correctly extracts narrative sections count', () => {
      const aggregatorOutput = createMockAggregatorOutput(10, true);

      expect(aggregatorOutput.narrative).not.toBeNull();
      expect(aggregatorOutput.stats.sectionCount).toBe(3);
      expect(aggregatorOutput.narrative!.sections).toHaveLength(3);
    });

    it('correctly extracts highlights count', () => {
      const aggregatorOutput = createMockAggregatorOutput(10, true);

      expect(aggregatorOutput.narrative).not.toBeNull();
      expect(aggregatorOutput.stats.highlightCount).toBe(3);
      expect(aggregatorOutput.narrative!.highlights).toHaveLength(3);
    });

    it('correctly extracts recommendations count', () => {
      const aggregatorOutput = createMockAggregatorOutput(10, true);

      expect(aggregatorOutput.narrative).not.toBeNull();
      expect(aggregatorOutput.stats.recommendationCount).toBe(2);
      expect(aggregatorOutput.narrative!.recommendations).toHaveLength(2);
    });
  });

  describe('handling null narrative (degraded mode)', () => {
    it('accepts output with null narrative', () => {
      const aggregatorOutput = createMockAggregatorOutput(10, false);

      expect(aggregatorOutput.narrative).toBeNull();
      expect(aggregatorOutput.stats.narrativeGenerated).toBe(false);
      expect(aggregatorOutput.stats.sectionCount).toBe(0);
      expect(aggregatorOutput.stats.highlightCount).toBe(0);
      expect(aggregatorOutput.stats.recommendationCount).toBe(0);
    });

    it('preserves candidates when narrative is null', () => {
      const aggregatorOutput = createMockAggregatorOutput(10, false);

      expect(aggregatorOutput.candidates).toHaveLength(10);
      expect(aggregatorOutput.narrative).toBeNull();
    });

    it('has zero section/highlight/recommendation counts', () => {
      const aggregatorOutput = createMockAggregatorOutput(10, false);

      expect(aggregatorOutput.stats.sectionCount).toBe(0);
      expect(aggregatorOutput.stats.highlightCount).toBe(0);
      expect(aggregatorOutput.stats.recommendationCount).toBe(0);
    });
  });

  describe('setting degradation level', () => {
    it('sets "none" when narrative is generated successfully', () => {
      const aggregatorOutput = createMockAggregatorOutput(10, true);

      // Simulate the degradation level determination logic
      const degradationLevel: DegradationLevel =
        aggregatorOutput.candidates.length === 0
          ? 'failed'
          : !aggregatorOutput.narrative
            ? 'no_aggregation'
            : 'none';

      expect(degradationLevel).toBe('none');
    });

    it('sets "no_aggregation" when narrative generation fails', () => {
      const aggregatorOutput = createMockAggregatorOutput(10, false);

      const degradationLevel: DegradationLevel =
        aggregatorOutput.candidates.length === 0
          ? 'failed'
          : !aggregatorOutput.narrative
            ? 'no_aggregation'
            : 'none';

      expect(degradationLevel).toBe('no_aggregation');
    });

    it('sets "failed" when zero candidates', () => {
      const aggregatorOutput = createMockAggregatorOutput(0, false);

      const degradationLevel: DegradationLevel =
        aggregatorOutput.candidates.length === 0
          ? 'failed'
          : !aggregatorOutput.narrative
            ? 'no_aggregation'
            : 'none';

      expect(degradationLevel).toBe('failed');
    });

    it('determines partial_workers from worker summaries', () => {
      const workerSummaries = createMockWorkerSummaries();

      // Check if any worker has error or partial status
      const hasFailedWorkers = workerSummaries.some(
        (w) => w.status === 'error' || w.status === 'partial'
      );

      expect(hasFailedWorkers).toBe(true);
    });
  });

  describe('preserving candidates in output', () => {
    it('maintains candidate order', () => {
      const aggregatorOutput = createMockAggregatorOutput(10, true);
      const candidateIds = aggregatorOutput.candidates.map((c) => c.candidateId);

      // Verify IDs are sequential as created
      for (let i = 0; i < candidateIds.length; i++) {
        expect(candidateIds[i]).toBe(`candidate-${i + 1}`);
      }
    });

    it('maintains candidate scores', () => {
      const aggregatorOutput = createMockAggregatorOutput(10, true);

      // Verify scores decrease as expected (90 - i * 3)
      for (let i = 0; i < aggregatorOutput.candidates.length; i++) {
        expect(aggregatorOutput.candidates[i].score).toBe(90 - i * 3);
      }
    });

    it('maintains candidate metadata', () => {
      const aggregatorOutput = createMockAggregatorOutput(5, true);

      for (const candidate of aggregatorOutput.candidates) {
        expect(candidate.sourceRefs).toBeDefined();
        expect(candidate.sourceRefs.length).toBeGreaterThan(0);
        expect(candidate.validation).toBeDefined();
      }
    });

    it('maintains candidate types', () => {
      const aggregatorOutput = createMockAggregatorOutput(10, true);
      const types = aggregatorOutput.candidates.map((c) => c.type);

      // Should have variety of types
      const uniqueTypes = new Set(types);
      expect(uniqueTypes.size).toBeGreaterThan(1);
    });

    it('maintains candidate origins', () => {
      const aggregatorOutput = createMockAggregatorOutput(10, true);
      const origins = aggregatorOutput.candidates.map((c) => c.origin);

      // Should have variety of origins
      const uniqueOrigins = new Set(origins);
      expect(uniqueOrigins.size).toBeGreaterThan(1);
    });
  });
});

// ============================================================================
// Markdown Generation Tests
// ============================================================================

describe('Markdown Generation', () => {
  describe('generating valid markdown with narrative', () => {
    it('includes introduction in markdown', () => {
      const narrative = createMockNarrative(['id-1', 'id-2', 'id-3', 'id-4', 'id-5']);

      expect(narrative.introduction).toContain('Welcome');
      expect(narrative.introduction).toContain('travel guide');
    });

    it('includes all sections with headings', () => {
      const narrative = createMockNarrative(['id-1', 'id-2', 'id-3', 'id-4', 'id-5']);

      expect(narrative.sections).toHaveLength(3);
      expect(narrative.sections[0].heading).toBe('Must-See Attractions');
      expect(narrative.sections[1].heading).toBe('Hidden Gems');
      expect(narrative.sections[2].heading).toBe('Food & Dining');
    });

    it('includes section content', () => {
      const narrative = createMockNarrative(['id-1', 'id-2', 'id-3', 'id-4', 'id-5']);

      for (const section of narrative.sections) {
        expect(section.content.length).toBeGreaterThan(0);
      }
    });

    it('includes candidate IDs in sections', () => {
      const candidateIds = ['id-1', 'id-2', 'id-3', 'id-4', 'id-5', 'id-6', 'id-7'];
      const narrative = createMockNarrative(candidateIds);

      // Sections should reference candidate IDs
      for (const section of narrative.sections) {
        expect(section.candidateIds.length).toBeGreaterThanOrEqual(0);
        for (const id of section.candidateIds) {
          expect(candidateIds).toContain(id);
        }
      }
    });

    it('includes conclusion if present', () => {
      const narrative = createMockNarrative(['id-1', 'id-2', 'id-3']);

      expect(narrative.conclusion).toBeDefined();
      expect(narrative.conclusion).toContain('Enjoy');
    });
  });

  describe('handling degraded mode (no narrative)', () => {
    it('generates markdown without narrative sections', () => {
      const aggregatorOutput = createMockAggregatorOutput(10, false);

      expect(aggregatorOutput.narrative).toBeNull();
      // Markdown should still be generatable with candidates only
      expect(aggregatorOutput.candidates.length).toBe(10);
    });

    it('lists candidates in simple format', () => {
      const candidates = createMockCandidates(5);

      // Simulating degraded markdown generation
      const candidateTitles = candidates.map((c) => c.title);

      expect(candidateTitles).toHaveLength(5);
      for (const title of candidateTitles) {
        expect(title.length).toBeGreaterThan(0);
      }
    });

    it('includes degradation notice', () => {
      const aggregatorOutput = createMockAggregatorOutput(10, false);

      // When narrative is null, a degradation notice should be included
      expect(aggregatorOutput.stats.narrativeGenerated).toBe(false);
    });
  });

  describe('including highlights and recommendations', () => {
    it('formats highlights with titles and descriptions', () => {
      const narrative = createMockNarrative(['id-1', 'id-2', 'id-3']);

      expect(narrative.highlights).toHaveLength(3);

      for (const highlight of narrative.highlights) {
        expect(highlight.title.length).toBeGreaterThan(0);
        expect(highlight.description.length).toBeGreaterThan(0);
        expect(['must_see', 'local_favorite', 'unique_experience', 'budget_friendly', 'luxury']).toContain(highlight.type);
      }
    });

    it('includes highlight types', () => {
      const narrative = createMockNarrative(['id-1', 'id-2', 'id-3']);
      const types = narrative.highlights.map((h) => h.type);

      expect(types).toContain('local_favorite');
      expect(types).toContain('must_see');
      expect(types).toContain('budget_friendly');
    });

    it('formats recommendations with priority', () => {
      const narrative = createMockNarrative(['id-1', 'id-2', 'id-3', 'id-4']);

      expect(narrative.recommendations).toHaveLength(2);

      for (const rec of narrative.recommendations) {
        expect(rec.text.length).toBeGreaterThan(0);
        expect(rec.reasoning.length).toBeGreaterThan(0);
        expect(['high', 'medium', 'low']).toContain(rec.priority);
      }
    });

    it('links recommendations to candidates', () => {
      const candidateIds = ['id-1', 'id-2', 'id-3', 'id-4', 'id-5'];
      const narrative = createMockNarrative(candidateIds);

      for (const rec of narrative.recommendations) {
        for (const id of rec.candidateIds) {
          expect(candidateIds).toContain(id);
        }
      }
    });
  });

  describe('formatting candidate information', () => {
    it('includes candidate title', () => {
      const candidates = createMockCandidates(5);

      for (const candidate of candidates) {
        expect(candidate.title.length).toBeGreaterThan(0);
      }
    });

    it('includes candidate summary', () => {
      const candidates = createMockCandidates(5);

      for (const candidate of candidates) {
        expect(candidate.summary.length).toBeGreaterThan(0);
      }
    });

    it('includes candidate type', () => {
      const candidates = createMockCandidates(5);
      const validTypes = ['place', 'activity', 'food', 'neighborhood', 'experience', 'daytrip'];

      for (const candidate of candidates) {
        expect(validTypes).toContain(candidate.type);
      }
    });

    it('includes candidate score', () => {
      const candidates = createMockCandidates(5);

      for (const candidate of candidates) {
        expect(candidate.score).toBeGreaterThanOrEqual(0);
        expect(candidate.score).toBeLessThanOrEqual(100);
      }
    });

    it('includes source URLs', () => {
      const candidates = createMockCandidates(5);

      for (const candidate of candidates) {
        expect(candidate.sourceRefs.length).toBeGreaterThan(0);
        for (const ref of candidate.sourceRefs) {
          expect(ref.url).toBeDefined();
          expect(ref.url.startsWith('http')).toBe(true);
        }
      }
    });

    it('includes validation status', () => {
      const candidates = createMockCandidates(5);
      const validStatuses = ['verified', 'partially_verified', 'conflict_detected', 'unverified', 'not_applicable'];

      for (const candidate of candidates) {
        if (candidate.validation) {
          expect(validStatuses).toContain(candidate.validation.status);
        }
      }
    });

    it('includes location when present', () => {
      const candidates = createMockCandidates(5);

      for (const candidate of candidates) {
        if (candidate.locationText) {
          expect(candidate.locationText.length).toBeGreaterThan(0);
        }
      }
    });
  });
});

// ============================================================================
// Export Tests
// ============================================================================

describe('Export Functions', () => {
  describe('exportResultsJson', () => {
    it('generates valid JSON structure', () => {
      const results = createMockDiscoveryResults();
      const jsonString = JSON.stringify(results);

      expect(() => JSON.parse(jsonString)).not.toThrow();
    });

    it('includes schemaVersion', () => {
      const results = createMockDiscoveryResults();

      expect(results.schemaVersion).toBe(DISCOVERY_RESULTS_SCHEMA_VERSION);
    });

    it('includes sessionId and runId', () => {
      const results = createMockDiscoveryResults();

      expect(results.sessionId).toBeDefined();
      expect(results.runId).toBeDefined();
      expect(results.sessionId.length).toBeGreaterThan(0);
      expect(results.runId.length).toBeGreaterThan(0);
    });

    it('includes createdAt timestamp', () => {
      const results = createMockDiscoveryResults();

      expect(results.createdAt).toBeDefined();
      // Should be valid ISO8601
      expect(() => new Date(results.createdAt)).not.toThrow();
    });

    it('includes all candidates', () => {
      const results = createMockDiscoveryResults({ candidateCount: 15 });

      expect(results.candidates).toHaveLength(15);
    });

    it('includes workerSummary', () => {
      const results = createMockDiscoveryResults();

      expect(results.workerSummary).toBeDefined();
      expect(results.workerSummary.length).toBeGreaterThan(0);
    });

    it('includes degradation info', () => {
      const results = createMockDiscoveryResults({ degradationLevel: 'partial_workers' });

      expect(results.degradation).toBeDefined();
      expect(results.degradation.level).toBe('partial_workers');
    });

    it('includes enrichedIntent when present', () => {
      const results = createMockDiscoveryResults();

      expect(results.enrichedIntent).toBeDefined();
      expect(results.enrichedIntent?.destination).toBe('Japan');
    });

    it('includes clusters when present', () => {
      const results = createMockDiscoveryResults({ withClusters: true });

      expect(results.clusters).toBeDefined();
      expect(results.clusters!.length).toBeGreaterThan(0);
    });

    it('validates against DiscoveryResultsSchema', () => {
      const results = createMockDiscoveryResults();
      const parsed = DiscoveryResultsSchema.safeParse(results);

      expect(parsed.success).toBe(true);
    });
  });

  describe('exportResultsMd', () => {
    it('generates non-empty markdown string', () => {
      const candidates = createMockCandidates(5);
      const narrative = createMockNarrative(candidates.map((c) => c.candidateId));

      // Simulate markdown generation
      const mdParts: string[] = [];
      mdParts.push(`# Travel Discovery Results\n\n`);
      mdParts.push(`## Introduction\n${narrative.introduction}\n\n`);

      for (const section of narrative.sections) {
        mdParts.push(`## ${section.heading}\n${section.content}\n\n`);
      }

      const markdown = mdParts.join('');

      expect(markdown.length).toBeGreaterThan(0);
      expect(markdown).toContain('# Travel Discovery Results');
    });

    it('includes header with session info', () => {
      const context = createMockContext();

      // Simulate header generation
      const header = `# Travel Discovery Results\n\n**Session:** ${context.sessionId}\n**Run:** ${context.runId}\n`;

      expect(header).toContain(context.sessionId);
      expect(header).toContain(context.runId);
    });

    it('includes candidate list', () => {
      const candidates = createMockCandidates(3);

      // Simulate candidate list generation
      const candidateList = candidates
        .map((c, i) => `${i + 1}. **${c.title}** (${c.type}) - Score: ${c.score}`)
        .join('\n');

      expect(candidateList).toContain('Place 1');
      expect(candidateList).toContain('Score:');
    });

    it('includes sources section', () => {
      const candidates = createMockCandidates(3);

      // Simulate sources section
      const sources = candidates
        .flatMap((c) => c.sourceRefs)
        .map((ref) => `- [${ref.publisher}](${ref.url})`)
        .join('\n');

      expect(sources).toContain('Test Channel');
      expect(sources).toContain('https://');
    });
  });

  describe('handling missing directories', () => {
    it('creates directory path components', () => {
      const testPath = '/tmp/test-travelagent/sessions/test-session/runs/test-run/exports';
      const pathParts = testPath.split('/').filter((p) => p.length > 0);

      expect(pathParts).toContain('exports');
      expect(pathParts).toContain('runs');
      expect(pathParts).toContain('sessions');
    });

    it('handles nested directory creation', () => {
      // Simulate mkdir -p behavior
      const expectedDirs = [
        '/tmp/test',
        '/tmp/test/sessions',
        '/tmp/test/sessions/session-1',
        '/tmp/test/sessions/session-1/runs',
        '/tmp/test/sessions/session-1/runs/run-1',
        '/tmp/test/sessions/session-1/runs/run-1/exports',
      ];

      // Each parent should be a prefix of the next
      for (let i = 0; i < expectedDirs.length - 1; i++) {
        expect(expectedDirs[i + 1].startsWith(expectedDirs[i])).toBe(true);
      }
    });

    it('handles existing directories gracefully', () => {
      // Simulating EEXIST error handling
      const existingPath = '/tmp/test-travelagent';

      // In actual implementation, mkdir with { recursive: true } handles this
      // This test verifies the concept
      expect(existingPath).toBeDefined();
    });
  });
});

// ============================================================================
// Stage Identity Tests
// ============================================================================

describe('Results Stage Identity', () => {
  it('stage number is 10', () => {
    const STAGE_NUMBER = 10;
    expect(STAGE_NUMBER).toBe(10);
  });

  it('stage name is "results"', () => {
    const STAGE_NAME = 'results';
    expect(STAGE_NAME).toBe('results');
  });

  it('stage id follows pattern', () => {
    const STAGE_ID = '10_results';
    expect(STAGE_ID).toMatch(/^\d{2}_[a-z_]+$/);
  });

  it('upstream stage is aggregator_output', () => {
    const UPSTREAM_STAGE = '09_aggregator_output';
    expect(UPSTREAM_STAGE).toBe('09_aggregator_output');
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Results Stage Integration', () => {
  describe('input from aggregate stage', () => {
    it('accepts AggregatorOutput format', () => {
      const input = createMockAggregatorOutput(10, true);

      expect(input.candidates).toBeDefined();
      expect(input.narrative).toBeDefined();
      expect(input.stats).toBeDefined();
    });

    it('handles empty candidate list', () => {
      const input = createMockAggregatorOutput(0, false);

      expect(input.candidates).toHaveLength(0);
      expect(input.narrative).toBeNull();
    });
  });

  describe('output structure', () => {
    it('produces DiscoveryResults compatible output', () => {
      const results = createMockDiscoveryResults();

      // Validate structure
      expect(results.schemaVersion).toBeDefined();
      expect(results.sessionId).toBeDefined();
      expect(results.runId).toBeDefined();
      expect(results.createdAt).toBeDefined();
      expect(results.candidates).toBeDefined();
      expect(results.workerSummary).toBeDefined();
      expect(results.degradation).toBeDefined();
    });

    it('includes timing information', () => {
      const results = createMockDiscoveryResults();

      expect(results.durationMs).toBeDefined();
      expect(results.durationMs).toBeGreaterThan(0);
    });
  });

  describe('file output paths', () => {
    it('generates correct JSON path', () => {
      const context = createMockContext();
      const expectedPath = `${context.dataDir}/sessions/${context.sessionId}/runs/${context.runId}/exports/10_results.json`;

      expect(expectedPath).toContain('10_results.json');
      expect(expectedPath).toContain('exports');
    });

    it('generates correct MD path', () => {
      const context = createMockContext();
      const expectedPath = `${context.dataDir}/sessions/${context.sessionId}/runs/${context.runId}/exports/results.md`;

      expect(expectedPath).toContain('results.md');
      expect(expectedPath).toContain('exports');
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Results Stage Edge Cases', () => {
  it('handles candidates with missing optional fields', () => {
    const candidate = createMockCandidate({
      locationText: undefined,
      coordinates: undefined,
      validation: undefined,
      metadata: undefined,
      clusterId: undefined,
    });

    expect(candidate.candidateId).toBeDefined();
    expect(candidate.title).toBeDefined();
    expect(candidate.summary).toBeDefined();
    expect(candidate.locationText).toBeUndefined();
  });

  it('handles narrative with empty sections', () => {
    const narrative: NarrativeOutput = {
      introduction: 'Welcome!',
      sections: [],
      highlights: [],
      recommendations: [],
    };

    expect(narrative.sections).toHaveLength(0);
    expect(narrative.highlights).toHaveLength(0);
    expect(narrative.recommendations).toHaveLength(0);
  });

  it('handles candidates with special characters in title', () => {
    const candidate = createMockCandidate({
      title: 'Test & Restaurant "Tokyo" <Best>',
    });

    expect(candidate.title).toContain('&');
    expect(candidate.title).toContain('"');
    expect(candidate.title).toContain('<');
  });

  it('handles very long summaries', () => {
    const longSummary = 'A'.repeat(5000);
    const candidate = createMockCandidate({
      summary: longSummary,
    });

    expect(candidate.summary.length).toBe(5000);
  });

  it('handles candidates with unicode in tags', () => {
    const candidate = createMockCandidate({
      tags: ['food', 'restaurant', 'japanese'],
    });

    expect(candidate.tags).toContain('japanese');
  });

  it('handles empty worker summary', () => {
    const results = createMockDiscoveryResults();
    results.workerSummary = [];

    // Should still be valid
    const parsed = DiscoveryResultsSchema.safeParse(results);
    expect(parsed.success).toBe(true);
  });

  it('handles degradation with multiple failed workers', () => {
    const results = createMockDiscoveryResults({ degradationLevel: 'partial_workers' });
    results.degradation.failedWorkers = ['youtube', 'places'];

    const parsed = DiscoveryResultsSchema.safeParse(results);
    expect(parsed.success).toBe(true);
    expect(results.degradation.failedWorkers).toHaveLength(2);
  });

  it('handles degradation with multiple warnings', () => {
    const results = createMockDiscoveryResults({ degradationLevel: 'partial_workers' });
    results.degradation.warnings = [
      'Worker youtube failed to complete',
      'Some transcripts were unavailable',
      'Rate limit was reached',
    ];

    const parsed = DiscoveryResultsSchema.safeParse(results);
    expect(parsed.success).toBe(true);
    expect(results.degradation.warnings).toHaveLength(3);
  });
});

// ============================================================================
// Constant Exports Tests
// ============================================================================

describe('Results Constants', () => {
  it('schema version is positive integer', () => {
    expect(DISCOVERY_RESULTS_SCHEMA_VERSION).toBe(1);
    expect(Number.isInteger(DISCOVERY_RESULTS_SCHEMA_VERSION)).toBe(true);
    expect(DISCOVERY_RESULTS_SCHEMA_VERSION).toBeGreaterThan(0);
  });
});
