/**
 * Tests for Ranking Module
 *
 * Comprehensive tests for:
 * - Credibility scoring (ORIGIN_CREDIBILITY, VERIFICATION_BOOSTS, calculateCredibility)
 * - Relevance scoring (calculateRelevance)
 * - Diversity scoring (calculateDiversity, enforceDiversityConstraints)
 * - Overall scoring (calculateOverallScore, getScoreBreakdown, rankCandidates)
 * - Recency scoring (calculateRecency)
 *
 * @see PRD Section 14 - Ranking, Dedupe, and Clustering
 * @see TODO Section 14.0 - Ranking Stage with Diversity
 */

import { describe, it, expect } from '@jest/globals';
import {
  ORIGIN_CREDIBILITY,
  VERIFICATION_BOOSTS,
  calculateCredibility,
} from './credibility.js';
import { calculateRelevance } from './relevance.js';
import {
  DIVERSITY_CONFIG,
  calculateDiversity,
  enforceDiversityConstraints,
  countByType,
} from './diversity.js';
import {
  SCORING_WEIGHTS,
  RECENCY_SCORES,
  calculateRecency,
  calculateOverallScore,
  getScoreBreakdown,
  rankCandidates,
  type RankingContext,
} from './scorer.js';
import type { Candidate } from '../schemas/candidate.js';
import type { EnrichedIntent } from '../schemas/worker.js';

// ============================================================================
// Mock Data Helpers
// ============================================================================

/**
 * Create a mock Candidate for testing
 */
function createMockCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    candidateId: `test-${Math.random().toString(36).substring(7)}`,
    type: 'place',
    title: 'Test Place',
    summary: 'A wonderful test place for testing.',
    locationText: 'Tokyo, Japan',
    tags: ['travel', 'culture'],
    origin: 'web',
    sourceRefs: [
      {
        url: 'https://example.com/test',
        publisher: 'Test Publisher',
        retrievedAt: new Date().toISOString(),
      },
    ],
    confidence: 'provisional',
    score: 50,
    ...overrides,
  };
}

/**
 * Create a mock EnrichedIntent for testing
 */
function createMockIntent(overrides: Partial<EnrichedIntent> = {}): EnrichedIntent {
  return {
    destinations: ['Tokyo', 'Japan'],
    dateRange: { start: '2024-06-01', end: '2024-06-14' },
    flexibility: { type: 'none' },
    interests: ['culture', 'food', 'history'],
    constraints: {},
    inferredTags: ['temple', 'shrine', 'ramen'],
    ...overrides,
  };
}

// ============================================================================
// Credibility Scoring Tests
// ============================================================================

describe('Credibility Scoring', () => {
  describe('ORIGIN_CREDIBILITY constants', () => {
    it('has correct values from PRD', () => {
      expect(ORIGIN_CREDIBILITY.places).toBe(90);
      expect(ORIGIN_CREDIBILITY.web_multi).toBe(80);
      expect(ORIGIN_CREDIBILITY.web_single).toBe(60);
      expect(ORIGIN_CREDIBILITY.youtube_verified).toBe(50);
      expect(ORIGIN_CREDIBILITY.youtube_provisional).toBe(30);
    });
  });

  describe('VERIFICATION_BOOSTS constants', () => {
    it('has correct values from PRD', () => {
      expect(VERIFICATION_BOOSTS.unverified).toBe(0);
      expect(VERIFICATION_BOOSTS.partially_verified).toBe(15);
      expect(VERIFICATION_BOOSTS.verified).toBe(35);
      expect(VERIFICATION_BOOSTS.high).toBe(50);
    });
  });

  describe('calculateCredibility', () => {
    it('returns 90 for Google Places candidates', () => {
      const candidate = createMockCandidate({
        origin: 'places',
        confidence: 'high',
      });
      expect(calculateCredibility(candidate)).toBe(90);
    });

    it('returns 80 for web candidates with 2+ sources (web_multi)', () => {
      const candidate = createMockCandidate({
        origin: 'web',
        sourceRefs: [
          { url: 'https://a.com', retrievedAt: new Date().toISOString() },
          { url: 'https://b.com', retrievedAt: new Date().toISOString() },
        ],
      });
      expect(calculateCredibility(candidate)).toBe(80);
    });

    it('returns 60 for web candidates with 1 source (web_single)', () => {
      const candidate = createMockCandidate({
        origin: 'web',
        sourceRefs: [
          { url: 'https://a.com', retrievedAt: new Date().toISOString() },
        ],
      });
      expect(calculateCredibility(candidate)).toBe(60);
    });

    it('returns 50 for verified YouTube candidates', () => {
      const candidate = createMockCandidate({
        origin: 'youtube',
        confidence: 'verified',
      });
      expect(calculateCredibility(candidate)).toBe(50);
    });

    it('returns 50 for high confidence YouTube candidates', () => {
      const candidate = createMockCandidate({
        origin: 'youtube',
        confidence: 'high',
      });
      expect(calculateCredibility(candidate)).toBe(50);
    });

    it('returns 30 for provisional YouTube candidates', () => {
      const candidate = createMockCandidate({
        origin: 'youtube',
        confidence: 'provisional',
      });
      expect(calculateCredibility(candidate)).toBe(30);
    });

    it('adds 35 points for verified validation status', () => {
      const candidate = createMockCandidate({
        origin: 'web',
        sourceRefs: [{ url: 'https://a.com', retrievedAt: new Date().toISOString() }],
        validation: { status: 'verified' },
      });
      // 60 (web_single) + 35 (verified) = 95
      expect(calculateCredibility(candidate)).toBe(95);
    });

    it('adds 15 points for partially_verified status', () => {
      const candidate = createMockCandidate({
        origin: 'web',
        sourceRefs: [{ url: 'https://a.com', retrievedAt: new Date().toISOString() }],
        validation: { status: 'partially_verified' },
      });
      // 60 (web_single) + 15 (partially_verified) = 75
      expect(calculateCredibility(candidate)).toBe(75);
    });

    it('caps score at 100', () => {
      const candidate = createMockCandidate({
        origin: 'places',
        confidence: 'high',
        validation: { status: 'verified' },
      });
      // 90 (places) + 35 (verified) = 125 -> capped to 100
      expect(calculateCredibility(candidate)).toBe(100);
    });

    it('returns 0 boost for conflict_detected status', () => {
      const candidate = createMockCandidate({
        origin: 'youtube',
        confidence: 'provisional',
        validation: { status: 'conflict_detected' },
      });
      // 30 (youtube_provisional) + 0 (conflict) = 30
      expect(calculateCredibility(candidate)).toBe(30);
    });
  });
});

// ============================================================================
// Relevance Scoring Tests
// ============================================================================

describe('Relevance Scoring', () => {
  describe('calculateRelevance', () => {
    it('awards points for destination match in locationText', () => {
      const candidate = createMockCandidate({
        locationText: 'Tokyo, Japan',
      });
      const intent = createMockIntent({
        destinations: ['Tokyo'],
      });
      const score = calculateRelevance(candidate, intent);
      expect(score).toBeGreaterThanOrEqual(30); // At least destination match points
    });

    it('awards 0 destination points when no match', () => {
      const candidate = createMockCandidate({
        locationText: 'Paris, France',
        title: 'Eiffel Tower',
        summary: 'Famous landmark',
        tags: [],
      });
      const intent = createMockIntent({
        destinations: ['Tokyo'],
        interests: [],
        inferredTags: [],
      });
      const score = calculateRelevance(candidate, intent);
      expect(score).toBeLessThan(30); // No destination or interest match
    });

    it('awards points for tag overlap with interests', () => {
      const candidate = createMockCandidate({
        tags: ['culture', 'history', 'temple'],
        locationText: 'Unknown',
      });
      const intent = createMockIntent({
        destinations: ['Tokyo'],
        interests: ['culture', 'history'],
        inferredTags: [],
      });
      const score = calculateRelevance(candidate, intent);
      expect(score).toBeGreaterThan(0);
    });

    it('awards type bonus for food candidates with food interests', () => {
      const candidate = createMockCandidate({
        type: 'food',
        tags: ['ramen', 'japanese'],
        locationText: 'Tokyo',
      });
      const intent = createMockIntent({
        destinations: ['Tokyo'],
        interests: ['food', 'culinary'],
      });
      const score = calculateRelevance(candidate, intent);
      expect(score).toBeGreaterThanOrEqual(30); // destination + type bonus
    });

    it('awards type bonus for activity candidates with adventure interests', () => {
      const candidate = createMockCandidate({
        type: 'activity',
        tags: ['hiking'],
        locationText: 'Tokyo',
      });
      const intent = createMockIntent({
        destinations: ['Tokyo'],
        interests: ['adventure', 'outdoor'],
      });
      const score = calculateRelevance(candidate, intent);
      expect(score).toBeGreaterThanOrEqual(30);
    });

    it('returns score capped at 100', () => {
      const candidate = createMockCandidate({
        type: 'food',
        tags: ['food', 'culture', 'history', 'adventure', 'local'],
        locationText: 'Tokyo, Japan',
        title: 'Tokyo Food Tour',
        summary: 'A wonderful Tokyo food experience',
      });
      const intent = createMockIntent({
        destinations: ['Tokyo', 'Japan'],
        interests: ['food', 'culture', 'history', 'adventure', 'local'],
        inferredTags: ['food', 'culture'],
      });
      const score = calculateRelevance(candidate, intent);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('returns score floored at 0', () => {
      const candidate = createMockCandidate({
        locationText: '',
        title: '',
        summary: '',
        tags: [],
      });
      const intent = createMockIntent({
        destinations: [],
        interests: [],
        inferredTags: [],
      });
      const score = calculateRelevance(candidate, intent);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// Diversity Scoring Tests
// ============================================================================

describe('Diversity Scoring', () => {
  describe('DIVERSITY_CONFIG', () => {
    it('has correct values from PRD', () => {
      expect(DIVERSITY_CONFIG.maxSameTypeInTop20).toBe(4);
      expect(DIVERSITY_CONFIG.sameTypePenalty).toBe(10);
      expect(DIVERSITY_CONFIG.maxPenalty).toBe(100);
    });
  });

  describe('calculateDiversity', () => {
    it('returns 100 when no predecessors', () => {
      const candidate = createMockCandidate({ type: 'place' });
      expect(calculateDiversity(candidate, [])).toBe(100);
    });

    it('applies -10 per same-type predecessor', () => {
      const candidate = createMockCandidate({ type: 'place' });
      const predecessors = [
        createMockCandidate({ type: 'place' }),
        createMockCandidate({ type: 'place' }),
      ];
      // 100 - (2 * 10) = 80
      expect(calculateDiversity(candidate, predecessors)).toBe(80);
    });

    it('ignores different-type predecessors', () => {
      const candidate = createMockCandidate({ type: 'place' });
      const predecessors = [
        createMockCandidate({ type: 'food' }),
        createMockCandidate({ type: 'activity' }),
      ];
      expect(calculateDiversity(candidate, predecessors)).toBe(100);
    });

    it('floors score at 0', () => {
      const candidate = createMockCandidate({ type: 'place' });
      const predecessors = Array(15).fill(null).map(() =>
        createMockCandidate({ type: 'place' })
      );
      expect(calculateDiversity(candidate, predecessors)).toBe(0);
    });
  });

  describe('countByType', () => {
    it('counts candidates by type correctly', () => {
      const candidates = [
        createMockCandidate({ type: 'place' }),
        createMockCandidate({ type: 'place' }),
        createMockCandidate({ type: 'food' }),
        createMockCandidate({ type: 'activity' }),
      ];
      const counts = countByType(candidates);
      expect(counts.get('place')).toBe(2);
      expect(counts.get('food')).toBe(1);
      expect(counts.get('activity')).toBe(1);
    });
  });

  describe('enforceDiversityConstraints', () => {
    it('preserves all candidates when diversity constraints are met', () => {
      const candidates = [
        createMockCandidate({ type: 'place', score: 90 }),
        createMockCandidate({ type: 'food', score: 85 }),
        createMockCandidate({ type: 'activity', score: 80 }),
      ];
      const result = enforceDiversityConstraints(candidates);
      expect(result.length).toBe(3);
    });

    it('limits same type to 4 in top 20 when mixed types available', () => {
      // Create 25 candidates: 15 places, 10 food
      const candidates = [
        ...Array(15).fill(null).map((_, i) =>
          createMockCandidate({ type: 'place', score: 100 - i })
        ),
        ...Array(10).fill(null).map((_, i) =>
          createMockCandidate({ type: 'food', score: 85 - i })
        ),
      ];
      const result = enforceDiversityConstraints(candidates);
      const top20 = result.slice(0, 20);
      const placeCounts = top20.filter(c => c.type === 'place').length;
      expect(placeCounts).toBeLessThanOrEqual(4);
    });

    it('returns empty array for empty input', () => {
      expect(enforceDiversityConstraints([])).toEqual([]);
    });
  });
});

// ============================================================================
// Recency Scoring Tests
// ============================================================================

describe('Recency Scoring', () => {
  describe('calculateRecency', () => {
    const referenceDate = new Date('2024-06-01T12:00:00.000Z');

    it('returns 100 for content published within 30 days', () => {
      const candidate = createMockCandidate({
        metadata: { publishedAt: '2024-05-15T12:00:00.000Z' },
      });
      expect(calculateRecency(candidate, referenceDate)).toBe(RECENCY_SCORES.FRESH);
    });

    it('returns 80 for content published 30-90 days ago', () => {
      const candidate = createMockCandidate({
        metadata: { publishedAt: '2024-03-15T12:00:00.000Z' },
      });
      expect(calculateRecency(candidate, referenceDate)).toBe(RECENCY_SCORES.RECENT);
    });

    it('returns 60 for content published 90-180 days ago', () => {
      const candidate = createMockCandidate({
        metadata: { publishedAt: '2024-01-15T12:00:00.000Z' },
      });
      expect(calculateRecency(candidate, referenceDate)).toBe(RECENCY_SCORES.MODERATE);
    });

    it('returns 40 for content published 180-365 days ago', () => {
      const candidate = createMockCandidate({
        metadata: { publishedAt: '2023-08-01T12:00:00.000Z' },
      });
      expect(calculateRecency(candidate, referenceDate)).toBe(RECENCY_SCORES.OLDER);
    });

    it('returns 20 for content published over 1 year ago', () => {
      const candidate = createMockCandidate({
        metadata: { publishedAt: '2022-01-01T12:00:00.000Z' },
      });
      expect(calculateRecency(candidate, referenceDate)).toBe(RECENCY_SCORES.STALE);
    });

    it('returns 50 when no publishedAt date', () => {
      const candidate = createMockCandidate({
        metadata: {},
      });
      expect(calculateRecency(candidate, referenceDate)).toBe(RECENCY_SCORES.UNKNOWN);
    });

    it('returns 50 when metadata is undefined', () => {
      const candidate = createMockCandidate();
      delete (candidate as Record<string, unknown>).metadata;
      expect(calculateRecency(candidate, referenceDate)).toBe(RECENCY_SCORES.UNKNOWN);
    });

    it('returns 100 for future dates', () => {
      const candidate = createMockCandidate({
        metadata: { publishedAt: '2024-07-01T12:00:00.000Z' },
      });
      expect(calculateRecency(candidate, referenceDate)).toBe(RECENCY_SCORES.FRESH);
    });
  });
});

// ============================================================================
// Overall Scoring Tests
// ============================================================================

describe('Overall Scoring', () => {
  describe('SCORING_WEIGHTS', () => {
    it('has correct weights from PRD', () => {
      expect(SCORING_WEIGHTS.relevance).toBe(0.35);
      expect(SCORING_WEIGHTS.credibility).toBe(0.30);
      expect(SCORING_WEIGHTS.recency).toBe(0.20);
      expect(SCORING_WEIGHTS.diversity).toBe(0.15);
    });

    it('weights sum to 1.0', () => {
      const sum =
        SCORING_WEIGHTS.relevance +
        SCORING_WEIGHTS.credibility +
        SCORING_WEIGHTS.recency +
        SCORING_WEIGHTS.diversity;
      expect(sum).toBeCloseTo(1.0);
    });
  });

  describe('calculateOverallScore', () => {
    it('combines all dimension scores with weights', () => {
      const candidate = createMockCandidate({
        origin: 'places', // High credibility
        locationText: 'Tokyo, Japan',
        tags: ['culture'],
        metadata: { publishedAt: new Date().toISOString() }, // Fresh
      });
      const context: RankingContext = {
        enrichedIntent: createMockIntent(),
        predecessors: [],
        referenceDate: new Date(),
      };
      const score = calculateOverallScore(candidate, context);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('returns lower score with more same-type predecessors', () => {
      const candidate = createMockCandidate({ type: 'place' });
      const intent = createMockIntent();

      const scoreNoPredecessors = calculateOverallScore(candidate, {
        enrichedIntent: intent,
        predecessors: [],
      });

      const scoreWithPredecessors = calculateOverallScore(candidate, {
        enrichedIntent: intent,
        predecessors: [
          createMockCandidate({ type: 'place' }),
          createMockCandidate({ type: 'place' }),
        ],
      });

      expect(scoreWithPredecessors).toBeLessThan(scoreNoPredecessors);
    });

    it('caps score at 100', () => {
      const candidate = createMockCandidate({
        origin: 'places',
        validation: { status: 'verified' },
        locationText: 'Tokyo, Japan',
        tags: ['culture', 'food', 'history'],
        metadata: { publishedAt: new Date().toISOString() },
      });
      const context: RankingContext = {
        enrichedIntent: createMockIntent(),
        predecessors: [],
      };
      const score = calculateOverallScore(candidate, context);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('getScoreBreakdown', () => {
    it('returns all dimension scores', () => {
      const candidate = createMockCandidate({
        origin: 'places',
        locationText: 'Tokyo',
      });
      const context: RankingContext = {
        enrichedIntent: createMockIntent(),
        predecessors: [],
      };
      const breakdown = getScoreBreakdown(candidate, context);

      expect(breakdown).toHaveProperty('relevance');
      expect(breakdown).toHaveProperty('credibility');
      expect(breakdown).toHaveProperty('recency');
      expect(breakdown).toHaveProperty('diversity');
      expect(breakdown).toHaveProperty('overall');
    });

    it('returns consistent overall with calculateOverallScore', () => {
      const candidate = createMockCandidate();
      const context: RankingContext = {
        enrichedIntent: createMockIntent(),
        predecessors: [],
        referenceDate: new Date(),
      };

      const breakdown = getScoreBreakdown(candidate, context);
      const overallScore = calculateOverallScore(candidate, context);

      expect(breakdown.overall).toBe(overallScore);
    });
  });

  describe('rankCandidates', () => {
    it('sorts candidates by overall score descending', () => {
      const candidates = [
        createMockCandidate({ origin: 'youtube', confidence: 'provisional' }), // Low credibility
        createMockCandidate({ origin: 'places' }), // High credibility
        createMockCandidate({ origin: 'web' }), // Medium credibility
      ];
      const intent = createMockIntent();
      const ranked = rankCandidates(candidates, intent);

      // Scores should be in descending order
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
      }
    });

    it('returns empty array for empty input', () => {
      const intent = createMockIntent();
      const ranked = rankCandidates([], intent);
      expect(ranked).toEqual([]);
    });

    it('updates candidate scores', () => {
      const candidates = [
        createMockCandidate({ score: 0 }),
        createMockCandidate({ score: 0 }),
      ];
      const intent = createMockIntent();
      const ranked = rankCandidates(candidates, intent);

      // All candidates should have updated scores
      for (const candidate of ranked) {
        expect(candidate.score).toBeGreaterThan(0);
      }
    });

    it('considers diversity when ranking', () => {
      // Create many candidates of same type
      const candidates = Array(5).fill(null).map((_, i) =>
        createMockCandidate({
          candidateId: `candidate-${i}`,
          type: 'place',
          origin: 'places', // Same credibility
          locationText: 'Tokyo',
        })
      );
      const intent = createMockIntent();
      const ranked = rankCandidates(candidates, intent);

      // Later candidates should have lower scores due to diversity penalty
      expect(ranked[0].score).toBeGreaterThan(ranked[ranked.length - 1].score);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Ranking Integration', () => {
  it('ranks a realistic set of candidates correctly', () => {
    const candidates: Candidate[] = [
      createMockCandidate({
        candidateId: 'places-temple',
        type: 'place',
        title: 'Senso-ji Temple',
        locationText: 'Tokyo, Japan',
        origin: 'places',
        confidence: 'high',
        tags: ['temple', 'culture', 'history'],
        metadata: { publishedAt: new Date().toISOString() },
      }),
      createMockCandidate({
        candidateId: 'youtube-food',
        type: 'food',
        title: 'Best Ramen in Tokyo',
        locationText: 'Tokyo',
        origin: 'youtube',
        confidence: 'provisional',
        tags: ['ramen', 'food'],
        metadata: { publishedAt: '2023-01-01T12:00:00.000Z' },
      }),
      createMockCandidate({
        candidateId: 'web-activity',
        type: 'activity',
        title: 'Mount Fuji Day Trip',
        locationText: 'Fuji, Japan',
        origin: 'web',
        sourceRefs: [
          { url: 'https://a.com', retrievedAt: new Date().toISOString() },
          { url: 'https://b.com', retrievedAt: new Date().toISOString() },
        ],
        confidence: 'verified',
        tags: ['hiking', 'nature', 'adventure'],
      }),
    ];

    const intent = createMockIntent({
      destinations: ['Tokyo', 'Japan'],
      interests: ['culture', 'temple', 'history'],
    });

    const ranked = rankCandidates(candidates, intent, new Date());

    // Places temple should rank high due to:
    // - High credibility (places origin)
    // - Good relevance (matches destination + interests)
    // - Fresh content
    // - No diversity penalty (first)
    expect(ranked[0].title).toBe('Senso-ji Temple');

    // All candidates should have valid scores
    for (const candidate of ranked) {
      expect(candidate.score).toBeGreaterThanOrEqual(0);
      expect(candidate.score).toBeLessThanOrEqual(100);
    }
  });
});
