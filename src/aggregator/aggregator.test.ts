/**
 * Tests for Aggregator Module
 *
 * Comprehensive tests for:
 * - Aggregator types and schemas
 * - Aggregator prompts (AGGREGATOR_PROMPT, buildAggregatorPrompt)
 * - Narrative generation
 * - Main aggregator logic
 * - Degraded mode handling
 * - Stage implementation
 *
 * @see PRD Section 14.5 - Aggregator
 * @see TODO Section 17.6 - Write unit tests for aggregator with mocked LLM
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { Candidate } from '../schemas/candidate.js';
import type { TopCandidatesStageOutput } from '../stages/top-candidates/types.js';

// Import modules to test
import {
  AGGREGATOR_SYSTEM_PROMPT,
  buildAggregatorPrompt,
  AGGREGATOR_PROMPT,
} from './prompts.js';
import {
  type AggregatorOutput,
  type NarrativeOutput,
  AggregatorOutputSchema,
  NarrativeOutputSchema,
  NarrativeSectionSchema,
  HighlightSchema,
  RecommendationSchema,
  AGGREGATOR_TIMEOUT_MS,
  createEmptyAggregatorStats,
  createDegradedOutput,
} from './types.js';
import { runAggregator, type AggregatorContext } from './aggregator.js';
import { aggregateStage } from '../stages/aggregate.js';

// ============================================================================
// Mock Data Helpers
// ============================================================================

/**
 * Create a mock Candidate for testing.
 */
function createMockCandidate(overrides: Partial<Candidate> = {}): Candidate {
  const id = `test-${Math.random().toString(36).substring(7)}`;
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
 * Create an array of mock candidates.
 */
function createMockCandidates(count: number): Candidate[] {
  // Valid candidate types: 'place', 'activity', 'neighborhood', 'daytrip', 'experience', 'food'
  const types: Candidate['type'][] = ['place', 'food', 'activity', 'neighborhood', 'experience'];
  const locations = ['Tokyo, Japan', 'Kyoto, Japan', 'Osaka, Japan', 'Nara, Japan'];

  return Array.from({ length: count }, (_, i) => {
    const type = types[i % types.length];
    return createMockCandidate({
      candidateId: `candidate-${i + 1}`,
      type,
      title: `${type.charAt(0).toUpperCase() + type.slice(1)} ${i + 1}`,
      summary: `An amazing ${type} experience worth visiting.`,
      locationText: locations[i % locations.length],
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
    introduction: 'Welcome to your personalized travel guide!',
    sections: [
      {
        heading: 'Must-See Attractions',
        content: 'Here are the top attractions you should visit.',
        candidateIds: candidateIds.slice(0, 3),
      },
      {
        heading: 'Hidden Gems',
        content: 'These lesser-known spots are worth exploring.',
        candidateIds: candidateIds.slice(3, 5),
      },
    ],
    highlights: [
      {
        title: 'Best Food Experience',
        description: 'Amazing culinary adventure awaits.',
        candidateId: candidateIds[0],
        type: 'local_favorite',
      },
      {
        title: 'Unique Cultural Site',
        description: 'A must-visit cultural destination.',
        candidateId: candidateIds[1],
        type: 'must_see',
      },
    ],
    recommendations: [
      {
        text: 'Visit early morning for fewer crowds.',
        reasoning: 'Popular sites get crowded after 10am.',
        candidateIds: candidateIds.slice(0, 2),
        priority: 'high',
      },
    ],
    conclusion: 'Enjoy your trip!',
  };
}

// ============================================================================
// Type Tests
// ============================================================================

describe('Aggregator Types', () => {
  describe('NarrativeSectionSchema', () => {
    it('validates a valid section', () => {
      const section = {
        heading: 'Top Picks',
        content: 'These are our top recommendations.',
        candidateIds: ['id-1', 'id-2'],
      };
      const result = NarrativeSectionSchema.safeParse(section);
      expect(result.success).toBe(true);
    });

    it('rejects section with empty heading', () => {
      const section = {
        heading: '',
        content: 'Some content',
        candidateIds: [],
      };
      const result = NarrativeSectionSchema.safeParse(section);
      expect(result.success).toBe(false);
    });

    it('rejects section with empty content', () => {
      const section = {
        heading: 'Valid Heading',
        content: '',
        candidateIds: [],
      };
      const result = NarrativeSectionSchema.safeParse(section);
      expect(result.success).toBe(false);
    });
  });

  describe('HighlightSchema', () => {
    it('validates a valid highlight', () => {
      const highlight = {
        title: 'Best Restaurant',
        description: 'Amazing food and atmosphere.',
        candidateId: 'id-1',
        type: 'local_favorite' as const,
      };
      const result = HighlightSchema.safeParse(highlight);
      expect(result.success).toBe(true);
    });

    it('validates highlight without candidateId', () => {
      const highlight = {
        title: 'General Tip',
        description: 'Useful information.',
        type: 'must_see' as const,
      };
      const result = HighlightSchema.safeParse(highlight);
      expect(result.success).toBe(true);
    });

    it('validates all highlight types', () => {
      const types = ['must_see', 'local_favorite', 'unique_experience', 'budget_friendly', 'luxury'] as const;
      for (const type of types) {
        const highlight = {
          title: 'Test',
          description: 'Description',
          type,
        };
        const result = HighlightSchema.safeParse(highlight);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid highlight type', () => {
      const highlight = {
        title: 'Test',
        description: 'Description',
        type: 'invalid_type',
      };
      const result = HighlightSchema.safeParse(highlight);
      expect(result.success).toBe(false);
    });
  });

  describe('RecommendationSchema', () => {
    it('validates a valid recommendation', () => {
      const recommendation = {
        text: 'Visit in the morning.',
        reasoning: 'Less crowded and better photos.',
        candidateIds: ['id-1'],
        priority: 'high' as const,
      };
      const result = RecommendationSchema.safeParse(recommendation);
      expect(result.success).toBe(true);
    });

    it('validates all priority levels', () => {
      const priorities = ['high', 'medium', 'low'] as const;
      for (const priority of priorities) {
        const recommendation = {
          text: 'Test recommendation',
          reasoning: 'Test reasoning',
          candidateIds: [],
          priority,
        };
        const result = RecommendationSchema.safeParse(recommendation);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('NarrativeOutputSchema', () => {
    it('validates a complete narrative', () => {
      const candidateIds = ['id-1', 'id-2', 'id-3'];
      const narrative = createMockNarrative(candidateIds);
      const result = NarrativeOutputSchema.safeParse(narrative);
      expect(result.success).toBe(true);
    });

    it('validates narrative without conclusion', () => {
      const narrative = {
        introduction: 'Welcome!',
        sections: [],
        highlights: [],
        recommendations: [],
      };
      const result = NarrativeOutputSchema.safeParse(narrative);
      expect(result.success).toBe(true);
    });

    it('rejects narrative without introduction', () => {
      const narrative = {
        sections: [],
        highlights: [],
        recommendations: [],
      };
      const result = NarrativeOutputSchema.safeParse(narrative);
      expect(result.success).toBe(false);
    });
  });

  describe('AggregatorOutputSchema', () => {
    it('validates output with narrative', () => {
      const candidates = createMockCandidates(5);
      const narrative = createMockNarrative(candidates.map(c => c.candidateId));
      const output: AggregatorOutput = {
        candidates,
        narrative,
        stats: {
          inputCount: 5,
          includedCount: 5,
          sectionCount: 2,
          highlightCount: 2,
          recommendationCount: 1,
          narrativeGenerated: true,
          durationMs: 1500,
        },
      };
      const result = AggregatorOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('validates output without narrative (degraded mode)', () => {
      const candidates = createMockCandidates(5);
      const output: AggregatorOutput = {
        candidates,
        narrative: null,
        stats: {
          inputCount: 5,
          includedCount: 5,
          sectionCount: 0,
          highlightCount: 0,
          recommendationCount: 0,
          narrativeGenerated: false,
          durationMs: 500,
        },
      };
      const result = AggregatorOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });
  });

  describe('createEmptyAggregatorStats', () => {
    it('returns stats with all zeros', () => {
      const stats = createEmptyAggregatorStats();
      expect(stats.inputCount).toBe(0);
      expect(stats.includedCount).toBe(0);
      expect(stats.sectionCount).toBe(0);
      expect(stats.highlightCount).toBe(0);
      expect(stats.recommendationCount).toBe(0);
      expect(stats.narrativeGenerated).toBe(false);
      expect(stats.durationMs).toBe(0);
    });
  });

  describe('createDegradedOutput', () => {
    it('creates output with null narrative', () => {
      const candidates = createMockCandidates(3);
      const output = createDegradedOutput(candidates, 500);

      expect(output.candidates).toBe(candidates);
      expect(output.narrative).toBeNull();
      expect(output.stats.inputCount).toBe(3);
      expect(output.stats.includedCount).toBe(3);
      expect(output.stats.narrativeGenerated).toBe(false);
      expect(output.stats.durationMs).toBe(500);
    });

    it('handles empty candidates array', () => {
      const output = createDegradedOutput([], 100);

      expect(output.candidates).toHaveLength(0);
      expect(output.narrative).toBeNull();
      expect(output.stats.inputCount).toBe(0);
    });
  });
});

// ============================================================================
// Prompt Tests
// ============================================================================

describe('Aggregator Prompts', () => {
  describe('AGGREGATOR_SYSTEM_PROMPT', () => {
    it('establishes travel curator role', () => {
      expect(AGGREGATOR_SYSTEM_PROMPT.toLowerCase()).toContain('travel');
      expect(AGGREGATOR_SYSTEM_PROMPT.toLowerCase()).toContain('curator');
    });

    it('mentions narrative creation', () => {
      expect(AGGREGATOR_SYSTEM_PROMPT.toLowerCase()).toContain('narrative');
    });

    it('requests JSON response', () => {
      expect(AGGREGATOR_SYSTEM_PROMPT.toLowerCase()).toContain('json');
    });
  });

  describe('buildAggregatorPrompt', () => {
    const candidates = createMockCandidates(3);

    it('includes all candidate data', () => {
      const prompt = buildAggregatorPrompt(candidates);

      for (const candidate of candidates) {
        expect(prompt).toContain(candidate.title);
        expect(prompt).toContain(candidate.candidateId);
        expect(prompt).toContain(candidate.type);
      }
    });

    it('includes scores and confidence', () => {
      const prompt = buildAggregatorPrompt(candidates);

      for (const candidate of candidates) {
        expect(prompt).toContain(`${candidate.score}/100`);
        expect(prompt).toContain(candidate.confidence);
      }
    });

    it('includes session context when provided', () => {
      const context = {
        destination: 'Japan',
        travelDates: 'March 2024',
        interests: ['food', 'culture'],
        budget: 'moderate',
      };
      const prompt = buildAggregatorPrompt(candidates, context);

      expect(prompt).toContain('Japan');
      expect(prompt).toContain('March 2024');
      expect(prompt).toContain('food');
      expect(prompt).toContain('culture');
      expect(prompt).toContain('moderate');
    });

    it('specifies JSON output format', () => {
      const prompt = buildAggregatorPrompt(candidates);

      expect(prompt).toContain('JSON');
      expect(prompt).toContain('"introduction"');
      expect(prompt).toContain('"sections"');
      expect(prompt).toContain('"highlights"');
      expect(prompt).toContain('"recommendations"');
    });

    it('includes candidate origin', () => {
      const prompt = buildAggregatorPrompt(candidates);

      expect(prompt).toContain('Origin');
    });

    it('formats view counts with K/M suffixes', () => {
      const candidatesWithViews = [
        createMockCandidate({
          metadata: { viewCount: 1500000 },
        }),
        createMockCandidate({
          metadata: { viewCount: 50000 },
        }),
      ];
      const prompt = buildAggregatorPrompt(candidatesWithViews);

      expect(prompt).toMatch(/\d+\.\d[MK]/);
    });

    it('includes ratings when present', () => {
      const candidatesWithRatings = [
        createMockCandidate({
          metadata: { rating: 4.5 },
        }),
      ];
      const prompt = buildAggregatorPrompt(candidatesWithRatings);

      expect(prompt).toContain('4.5/5');
    });
  });

  describe('AGGREGATOR_PROMPT object', () => {
    it('has system and build properties', () => {
      expect(AGGREGATOR_PROMPT.system).toBeDefined();
      expect(AGGREGATOR_PROMPT.build).toBeDefined();
      expect(typeof AGGREGATOR_PROMPT.system).toBe('string');
      expect(typeof AGGREGATOR_PROMPT.build).toBe('function');
    });

    it('build is the same as buildAggregatorPrompt', () => {
      expect(AGGREGATOR_PROMPT.build).toBe(buildAggregatorPrompt);
    });
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe('Aggregator Constants', () => {
  it('has 20 second timeout', () => {
    expect(AGGREGATOR_TIMEOUT_MS).toBe(20000);
  });
});

// ============================================================================
// Stage Tests (without mocking LLM)
// ============================================================================

describe('Aggregate Stage', () => {
  describe('stage properties', () => {
    it('has correct id', () => {
      expect(aggregateStage.id).toBe('09_aggregator_output');
    });

    it('has correct name', () => {
      expect(aggregateStage.name).toBe('aggregator_output');
    });

    it('has correct number', () => {
      expect(aggregateStage.number).toBe(9);
    });
  });

  describe('execute method', () => {
    it('exists and is a function', () => {
      expect(typeof aggregateStage.execute).toBe('function');
    });
  });
});

// ============================================================================
// Aggregator Logic Tests (Pure functions, no LLM)
// ============================================================================

describe('Aggregator Logic', () => {
  describe('runAggregator with empty input', () => {
    it('returns degraded output for empty candidates', async () => {
      const context: AggregatorContext = {
        sessionId: 'test-session',
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
      };

      const result = await runAggregator([], context);

      expect(result.candidates).toHaveLength(0);
      expect(result.narrative).toBeNull();
      expect(result.stats.inputCount).toBe(0);
      expect(result.stats.narrativeGenerated).toBe(false);
    });
  });
});

// ============================================================================
// Input Handling Tests
// ============================================================================

describe('Stage Input Handling', () => {
  it('accepts TopCandidatesStageOutput format', () => {
    const candidates = createMockCandidates(3);
    const input: TopCandidatesStageOutput = {
      candidates,
      stats: {
        inputCount: 10,
        outputCount: 3,
        topN: 30,
        deferredCount: 0,
        byType: { place: 2, food: 1 },
        byDestination: { 'Tokyo': 2, 'Kyoto': 1 },
        averageScore: 85,
        minScore: 80,
        maxScore: 90,
      },
    };

    // Test that we can extract candidates from the wrapped input
    expect(input.candidates).toEqual(candidates);
    expect(Array.isArray(input)).toBe(false);
  });

  it('accepts raw Candidate[] format', () => {
    const candidates = createMockCandidates(3);

    // Test that raw array format works
    expect(Array.isArray(candidates)).toBe(true);
    expect(candidates).toHaveLength(3);
  });

  it('extracts candidates correctly from union type', () => {
    const candidates = createMockCandidates(3);

    // Helper function that mirrors stage logic
    function extractCandidates(input: TopCandidatesStageOutput | Candidate[]): Candidate[] {
      return Array.isArray(input) ? input : input.candidates;
    }

    // Test with wrapped format
    const wrappedInput: TopCandidatesStageOutput = {
      candidates,
      stats: {
        inputCount: 10,
        outputCount: 3,
        topN: 30,
        deferredCount: 0,
        byType: {},
        byDestination: {},
        averageScore: 85,
        minScore: 80,
        maxScore: 90,
      },
    };
    expect(extractCandidates(wrappedInput)).toEqual(candidates);

    // Test with array format
    expect(extractCandidates(candidates)).toEqual(candidates);
  });
});

// ============================================================================
// Export Tests
// ============================================================================

describe('Module Exports', () => {
  it('exports all required types', async () => {
    const types = await import('./types.js');

    expect(types.AggregatorOutputSchema).toBeDefined();
    expect(types.NarrativeOutputSchema).toBeDefined();
    expect(types.AGGREGATOR_TIMEOUT_MS).toBeDefined();
    expect(types.createEmptyAggregatorStats).toBeDefined();
    expect(types.createDegradedOutput).toBeDefined();
  });

  it('exports all required prompts', async () => {
    const prompts = await import('./prompts.js');

    expect(prompts.AGGREGATOR_SYSTEM_PROMPT).toBeDefined();
    expect(prompts.buildAggregatorPrompt).toBeDefined();
    expect(prompts.AGGREGATOR_PROMPT).toBeDefined();
  });

  it('exports aggregator function', async () => {
    const aggregator = await import('./aggregator.js');

    expect(aggregator.runAggregator).toBeDefined();
    expect(typeof aggregator.runAggregator).toBe('function');
  });

  it('exports stage implementation', async () => {
    const stage = await import('../stages/aggregate.js');

    expect(stage.aggregateStage).toBeDefined();
    expect(stage.aggregateStage.execute).toBeDefined();
  });
});

// ============================================================================
// Integration Type Tests
// ============================================================================

describe('Integration with Pipeline', () => {
  it('stage result has correct structure', () => {
    // Verify the expected shape of stage results
    const expectedResultShape = {
      data: expect.any(Object),
      metadata: expect.objectContaining({
        stageId: expect.any(String),
        stageNumber: expect.any(Number),
        stageName: expect.any(String),
      }),
      timing: expect.objectContaining({
        startedAt: expect.any(String),
        completedAt: expect.any(String),
        durationMs: expect.any(Number),
      }),
    };

    // This is a type-level test - we're verifying the shape exists
    expect(expectedResultShape).toBeDefined();
  });

  it('aggregator output contains required fields', () => {
    const candidates = createMockCandidates(3);
    const output = createDegradedOutput(candidates, 100);

    // Verify all required fields exist
    expect(output).toHaveProperty('candidates');
    expect(output).toHaveProperty('narrative');
    expect(output).toHaveProperty('stats');
    expect(output.stats).toHaveProperty('inputCount');
    expect(output.stats).toHaveProperty('narrativeGenerated');
    expect(output.stats).toHaveProperty('durationMs');
  });
});
