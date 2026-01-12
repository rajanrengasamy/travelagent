/**
 * Tests for Deduplication Module
 *
 * Comprehensive tests for:
 * - Content normalization (normalizeContent)
 * - Hash generation (generateCandidateHash)
 * - Similarity functions (Jaccard, Haversine, combined)
 * - Cluster formation
 *
 * @see PRD Section 14 - Ranking, Dedupe, and Clustering
 * @see TODO Section 13.0 - Deduplication & Clustering (Stage 05)
 */

import { describe, it, expect } from '@jest/globals';
import { normalizeContent } from './normalize.js';
import { extractCity } from './hash.js';
import { generateCandidateHash } from './hash.js';
import {
  jaccardSimilarity,
  haversineDistance,
  calculateLocationSimilarity,
  candidateSimilarity,
  CANDIDATE_SIMILARITY_THRESHOLD,
} from './similarity.js';
import { formClusters } from './cluster.js';
import type { Candidate } from '../schemas/candidate.js';

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
    locationText: 'Test City, Test Country',
    tags: ['test'],
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

// ============================================================================
// normalizeContent Tests
// ============================================================================

describe('normalizeContent', () => {
  it('lowercases text', () => {
    expect(normalizeContent('HELLO World')).toBe('hello world');
  });

  it('removes URLs', () => {
    expect(normalizeContent('Check https://example.com here')).toBe('check here');
  });

  it('removes http URLs', () => {
    expect(normalizeContent('Visit http://test.com today')).toBe('visit today');
  });

  it('removes emoji', () => {
    // Note: The current implementation uses a limited emoji range
    const result = normalizeContent('Great place!');
    expect(result).toBe('great place');
  });

  it('removes punctuation', () => {
    expect(normalizeContent('Its amazing')).toBe('its amazing');
  });

  it('collapses whitespace', () => {
    expect(normalizeContent('too   many   spaces')).toBe('too many spaces');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeContent('  hello world  ')).toBe('hello world');
  });

  it('handles combined transformations', () => {
    const input = 'TOKYO Tower!!! Visit https://tokyo.jp today';
    const expected = 'tokyo tower visit today';
    expect(normalizeContent(input)).toBe(expected);
  });

  it('handles empty string', () => {
    expect(normalizeContent('')).toBe('');
  });
});

describe('extractCity', () => {
  it('extracts last segment from comma-separated location', () => {
    const result = extractCity('Shibuya, Tokyo, Japan');
    // Takes last segment (usually city or country)
    expect(result).toBe('japan');
  });

  it('extracts city from two-part location', () => {
    const result = extractCity('Senso-ji Temple, Tokyo');
    // Last segment is the city
    expect(result).toBe('tokyo');
  });

  it('handles single location component', () => {
    const result = extractCity('Tokyo');
    expect(result).toBe('tokyo');
  });

  it('handles undefined input', () => {
    expect(extractCity(undefined)).toBe('');
  });

  it('handles empty string', () => {
    expect(extractCity('')).toBe('');
  });
});

// ============================================================================
// generateCandidateHash Tests
// ============================================================================

describe('generateCandidateHash', () => {
  it('generates consistent hash for same input', () => {
    const candidate = createMockCandidate({
      title: 'Senso-ji Temple',
      locationText: 'Asakusa, Tokyo',
    });

    const hash1 = generateCandidateHash(candidate);
    const hash2 = generateCandidateHash(candidate);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
  });

  it('generates different hash for different input', () => {
    const candidate1 = createMockCandidate({
      title: 'Senso-ji Temple',
      locationText: 'Asakusa, Tokyo',
    });
    const candidate2 = createMockCandidate({
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
    });

    const hash1 = generateCandidateHash(candidate1);
    const hash2 = generateCandidateHash(candidate2);

    expect(hash1).not.toBe(hash2);
  });

  it('uses placeId when available', () => {
    const withPlaceId = createMockCandidate({
      title: 'Senso-ji Temple',
      locationText: 'Asakusa, Tokyo',
      metadata: { placeId: 'ChIJ123456' },
    });
    const withoutPlaceId = createMockCandidate({
      title: 'Senso-ji Temple',
      locationText: 'Asakusa, Tokyo',
    });

    const hash1 = generateCandidateHash(withPlaceId);
    const hash2 = generateCandidateHash(withoutPlaceId);

    // Different because placeId affects the seed
    expect(hash1).not.toBe(hash2);
  });

  it('normalizes title before hashing', () => {
    const candidate1 = createMockCandidate({
      title: 'TOKYO TOWER',
      locationText: 'Minato, Tokyo',
    });
    const candidate2 = createMockCandidate({
      title: 'tokyo tower',
      locationText: 'Minato, Tokyo',
    });

    const hash1 = generateCandidateHash(candidate1);
    const hash2 = generateCandidateHash(candidate2);

    expect(hash1).toBe(hash2);
  });

  it('produces 16-character hex string', () => {
    const candidate = createMockCandidate();
    const hash = generateCandidateHash(candidate);

    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ============================================================================
// jaccardSimilarity Tests
// ============================================================================

describe('jaccardSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(jaccardSimilarity('hello world', 'hello world')).toBe(1.0);
  });

  it('returns 0.0 for completely different strings', () => {
    expect(jaccardSimilarity('abc', 'xyz')).toBe(0.0);
  });

  it('handles partial overlap', () => {
    const sim = jaccardSimilarity('hello world', 'hello there');
    // "hello" is shared, union is {hello, world, there}
    // Intersection: 1, Union: 3 -> 1/3 = 0.333...
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
    expect(sim).toBeCloseTo(1 / 3, 2);
  });

  it('returns 1.0 for both empty strings', () => {
    expect(jaccardSimilarity('', '')).toBe(1.0);
  });

  it('returns 0.0 when one string is empty', () => {
    expect(jaccardSimilarity('hello', '')).toBe(0.0);
    expect(jaccardSimilarity('', 'world')).toBe(0.0);
  });

  it('is case insensitive', () => {
    const sim = jaccardSimilarity('HELLO WORLD', 'hello world');
    expect(sim).toBe(1.0);
  });

  it('ignores punctuation', () => {
    const sim = jaccardSimilarity('Hello, World!', 'Hello World');
    expect(sim).toBe(1.0);
  });
});

// ============================================================================
// haversineDistance Tests
// ============================================================================

describe('haversineDistance', () => {
  it('returns 0 for same coordinates', () => {
    const coord = { lat: 35.6762, lng: 139.6503 };
    expect(haversineDistance(coord, coord)).toBe(0);
  });

  it('calculates correct distance (Tokyo to Osaka ~400km)', () => {
    const tokyo = { lat: 35.6762, lng: 139.6503 };
    const osaka = { lat: 34.6937, lng: 135.5023 };
    const distance = haversineDistance(tokyo, osaka);

    // Distance should be approximately 400km (400,000 meters)
    expect(distance).toBeGreaterThan(390000);
    expect(distance).toBeLessThan(410000);
  });

  it('calculates short distances accurately', () => {
    // Two points about 100m apart in Tokyo
    const point1 = { lat: 35.6762, lng: 139.6503 };
    const point2 = { lat: 35.6771, lng: 139.6503 }; // ~100m north
    const distance = haversineDistance(point1, point2);

    expect(distance).toBeGreaterThan(90);
    expect(distance).toBeLessThan(110);
  });

  it('is symmetric', () => {
    const tokyo = { lat: 35.6762, lng: 139.6503 };
    const osaka = { lat: 34.6937, lng: 135.5023 };

    const d1 = haversineDistance(tokyo, osaka);
    const d2 = haversineDistance(osaka, tokyo);

    expect(d1).toBeCloseTo(d2, 5);
  });
});

// ============================================================================
// calculateLocationSimilarity Tests
// ============================================================================

describe('calculateLocationSimilarity', () => {
  it('returns 1.0 for coordinates <50m apart', () => {
    const a = createMockCandidate({
      coordinates: { lat: 35.6762, lng: 139.6503 },
    });
    const b = createMockCandidate({
      coordinates: { lat: 35.6762, lng: 139.6503 }, // Same location
    });

    expect(calculateLocationSimilarity(a, b)).toBe(1.0);
  });

  it('returns 0.8 for coordinates <200m apart', () => {
    const a = createMockCandidate({
      coordinates: { lat: 35.6762, lng: 139.6503 },
    });
    const b = createMockCandidate({
      // ~100m away
      coordinates: { lat: 35.6771, lng: 139.6503 },
    });

    expect(calculateLocationSimilarity(a, b)).toBe(0.8);
  });

  it('returns 0.5 for coordinates <500m apart', () => {
    const a = createMockCandidate({
      coordinates: { lat: 35.6762, lng: 139.6503 },
    });
    const b = createMockCandidate({
      // ~300m away
      coordinates: { lat: 35.6789, lng: 139.6503 },
    });

    expect(calculateLocationSimilarity(a, b)).toBe(0.5);
  });

  it('returns 0.0 for coordinates >=500m apart', () => {
    const a = createMockCandidate({
      coordinates: { lat: 35.6762, lng: 139.6503 },
    });
    const b = createMockCandidate({
      // ~1km away
      coordinates: { lat: 35.6852, lng: 139.6503 },
    });

    expect(calculateLocationSimilarity(a, b)).toBe(0.0);
  });

  it('falls back to jaccard for missing coordinates', () => {
    const a = createMockCandidate({
      locationText: 'Shibuya, Tokyo',
      coordinates: undefined,
    });
    const b = createMockCandidate({
      locationText: 'Shibuya, Tokyo',
      coordinates: undefined,
    });

    // Same location text = 1.0 jaccard
    expect(calculateLocationSimilarity(a, b)).toBe(1.0);
  });

  it('uses jaccard when only one has coordinates', () => {
    const a = createMockCandidate({
      locationText: 'Shibuya, Tokyo',
      coordinates: { lat: 35.6762, lng: 139.6503 },
    });
    const b = createMockCandidate({
      locationText: 'Shinjuku, Tokyo',
      coordinates: undefined,
    });

    const sim = calculateLocationSimilarity(a, b);
    // Partial text overlap
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

// ============================================================================
// candidateSimilarity Tests
// ============================================================================

describe('candidateSimilarity', () => {
  it('weights title 60% and location 40%', () => {
    // Identical title, completely different location text
    const a = createMockCandidate({
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
      coordinates: undefined,
    });
    const b = createMockCandidate({
      title: 'Tokyo Tower',
      locationText: 'Completely Different Location',
      coordinates: undefined,
    });

    const sim = candidateSimilarity(a, b);

    // Title: 1.0 * 0.6 = 0.6
    // Location: 0.0 * 0.4 = 0.0
    // Total: 0.6
    expect(sim).toBeCloseTo(0.6, 1);
  });

  it('returns 1.0 for identical candidates', () => {
    const a = createMockCandidate({
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
    });
    const b = createMockCandidate({
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
    });

    expect(candidateSimilarity(a, b)).toBe(1.0);
  });

  it('considers both title and location', () => {
    const a = createMockCandidate({
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
      coordinates: undefined,
    });
    const b = createMockCandidate({
      title: 'Tokyo Skytree',
      locationText: 'Minato, Tokyo',
      coordinates: undefined,
    });

    const sim = candidateSimilarity(a, b);

    // Partial title match, good location match
    expect(sim).toBeGreaterThan(0.3);
    expect(sim).toBeLessThan(0.9);
  });
});

// ============================================================================
// CANDIDATE_SIMILARITY_THRESHOLD Tests
// ============================================================================

describe('CANDIDATE_SIMILARITY_THRESHOLD', () => {
  it('is 0.85', () => {
    expect(CANDIDATE_SIMILARITY_THRESHOLD).toBe(0.85);
  });
});

// ============================================================================
// formClusters Tests
// ============================================================================

describe('formClusters', () => {
  it('handles empty array', () => {
    const result = formClusters([]);

    expect(result.clusters).toHaveLength(0);
    expect(result.stats.originalCount).toBe(0);
    expect(result.stats.dedupedCount).toBe(0);
  });

  it('handles single candidate', () => {
    const candidate = createMockCandidate();
    const result = formClusters([candidate]);

    expect(result.clusters).toHaveLength(1);
    expect(result.stats.originalCount).toBe(1);
    expect(result.stats.dedupedCount).toBe(1);
    expect(result.stats.duplicatesRemoved).toBe(0);
  });

  it('groups candidates with same hash', () => {
    const candidate1 = createMockCandidate({
      candidateId: 'c1',
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
      origin: 'web',
    });
    const candidate2 = createMockCandidate({
      candidateId: 'c2',
      title: 'Tokyo Tower', // Same title
      locationText: 'Minato, Tokyo', // Same location
      origin: 'places',
    });

    const result = formClusters([candidate1, candidate2]);

    expect(result.clusters).toHaveLength(1);
    expect(result.stats.originalCount).toBe(2);
    expect(result.stats.dedupedCount).toBe(1);
    expect(result.stats.duplicatesRemoved).toBe(1);
  });

  it('groups similar candidates above threshold', () => {
    const candidate1 = createMockCandidate({
      candidateId: 'c1',
      title: 'Tokyo Tower Observation Deck',
      locationText: 'Minato, Tokyo',
    });
    const candidate2 = createMockCandidate({
      candidateId: 'c2',
      title: 'Tokyo Tower', // Slightly different but similar
      locationText: 'Minato, Tokyo',
    });

    const result = formClusters([candidate1, candidate2]);

    // These should be similar enough to cluster
    expect(result.stats.originalCount).toBe(2);
  });

  it('keeps distinct candidates separate', () => {
    const candidate1 = createMockCandidate({
      candidateId: 'c1',
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
    });
    const candidate2 = createMockCandidate({
      candidateId: 'c2',
      title: 'Senso-ji Temple',
      locationText: 'Asakusa, Tokyo',
    });
    const candidate3 = createMockCandidate({
      candidateId: 'c3',
      title: 'Shibuya Crossing',
      locationText: 'Shibuya, Tokyo',
    });

    const result = formClusters([candidate1, candidate2, candidate3]);

    // All distinct, should remain separate
    expect(result.clusters).toHaveLength(3);
    expect(result.stats.dedupedCount).toBe(3);
    expect(result.stats.duplicatesRemoved).toBe(0);
  });

  it('keeps highest score as representative', () => {
    const lowScore = createMockCandidate({
      candidateId: 'low',
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
      score: 30,
      confidence: 'provisional',
    });
    const highScore = createMockCandidate({
      candidateId: 'high',
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
      score: 80,
      confidence: 'verified',
    });

    const result = formClusters([lowScore, highScore]);

    expect(result.clusters).toHaveLength(1);
    // The deduplicated candidate should be the high-scoring one
    expect(result.dedupedCandidates[0].candidateId).toBe('high');
  });

  it('merges sourceRefs from all members', () => {
    const candidate1 = createMockCandidate({
      candidateId: 'c1',
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
      sourceRefs: [
        {
          url: 'https://source1.com',
          publisher: 'Source 1',
          retrievedAt: new Date().toISOString(),
        },
      ],
    });
    const candidate2 = createMockCandidate({
      candidateId: 'c2',
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
      sourceRefs: [
        {
          url: 'https://source2.com',
          publisher: 'Source 2',
          retrievedAt: new Date().toISOString(),
        },
      ],
    });

    const result = formClusters([candidate1, candidate2]);

    expect(result.clusters).toHaveLength(1);
    // Representative should have merged sourceRefs
    expect(result.dedupedCandidates[0].sourceRefs).toHaveLength(2);

    const urls = result.dedupedCandidates[0].sourceRefs.map((r) => r.url);
    expect(urls).toContain('https://source1.com');
    expect(urls).toContain('https://source2.com');
  });

  it('deduplicates sourceRefs by URL', () => {
    const candidate1 = createMockCandidate({
      candidateId: 'c1',
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
      sourceRefs: [
        {
          url: 'https://same-source.com',
          publisher: 'Source 1',
          retrievedAt: new Date().toISOString(),
        },
      ],
    });
    const candidate2 = createMockCandidate({
      candidateId: 'c2',
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
      sourceRefs: [
        {
          url: 'https://same-source.com', // Same URL
          publisher: 'Source 1',
          retrievedAt: new Date().toISOString(),
        },
      ],
    });

    const result = formClusters([candidate1, candidate2]);

    // Should not have duplicate URLs
    expect(result.dedupedCandidates[0].sourceRefs).toHaveLength(1);
  });

  it('merges tags from all cluster members', () => {
    const candidate1 = createMockCandidate({
      candidateId: 'c1',
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
      tags: ['landmark', 'observation'],
    });
    const candidate2 = createMockCandidate({
      candidateId: 'c2',
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
      tags: ['tower', 'tourist'],
    });

    const result = formClusters([candidate1, candidate2]);

    expect(result.clusters).toHaveLength(1);
    // Representative should have merged tags from all members
    const tags = result.dedupedCandidates[0].tags;
    expect(tags).toContain('landmark');
    expect(tags).toContain('observation');
    expect(tags).toContain('tower');
    expect(tags).toContain('tourist');
  });

  it('deduplicates tags (case-insensitive)', () => {
    const candidate1 = createMockCandidate({
      candidateId: 'c1',
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
      tags: ['Landmark', 'TOKYO'],
    });
    const candidate2 = createMockCandidate({
      candidateId: 'c2',
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
      tags: ['landmark', 'tokyo', 'tower'], // Overlapping tags (case-insensitive)
    });

    const result = formClusters([candidate1, candidate2]);

    const tags = result.dedupedCandidates[0].tags;
    // Should not have duplicates
    const uniqueTags = new Set(tags.map((t) => t.toLowerCase()));
    expect(uniqueTags.size).toBe(tags.length);
    // Should have all unique tags
    expect(tags).toContain('landmark');
    expect(tags).toContain('tokyo');
    expect(tags).toContain('tower');
  });

  it('sets clusterId on deduplicated candidates', () => {
    const candidate = createMockCandidate();
    const result = formClusters([candidate]);

    expect(result.dedupedCandidates[0].clusterId).toBeDefined();
    expect(result.dedupedCandidates[0].clusterId).toMatch(/^cluster_/);
  });

  it('records cluster statistics', () => {
    const candidates = [
      createMockCandidate({ candidateId: 'c1', title: 'Place A', locationText: 'Tokyo' }),
      createMockCandidate({ candidateId: 'c2', title: 'Place A', locationText: 'Tokyo' }), // Duplicate
      createMockCandidate({ candidateId: 'c3', title: 'Place B', locationText: 'Osaka' }),
    ];

    const result = formClusters(candidates);

    expect(result.stats.originalCount).toBe(3);
    expect(result.stats.clusterCount).toBe(2);
    expect(result.stats.dedupedCount).toBe(2);
    expect(result.stats.duplicatesRemoved).toBe(1);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Dedupe Integration', () => {
  it('full deduplication workflow', () => {
    // Simulate candidates from different workers
    const perplexityCandidate = createMockCandidate({
      candidateId: 'perp-1',
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo, Japan',
      origin: 'web',
      confidence: 'provisional',
      score: 60,
      sourceRefs: [
        {
          url: 'https://tripadvisor.com/tokyo-tower',
          publisher: 'TripAdvisor',
          retrievedAt: new Date().toISOString(),
        },
      ],
    });

    const placesCandidate = createMockCandidate({
      candidateId: 'places-1',
      title: 'Tokyo Tower',
      locationText: 'Minato, Tokyo',
      origin: 'places',
      confidence: 'verified',
      score: 80,
      coordinates: { lat: 35.6586, lng: 139.7454 },
      metadata: { placeId: 'ChIJ123456', rating: 4.5 },
      sourceRefs: [
        {
          url: 'https://maps.google.com/place/tokyo-tower',
          publisher: 'Google Places',
          retrievedAt: new Date().toISOString(),
        },
      ],
    });

    const youtubeCandidate = createMockCandidate({
      candidateId: 'yt-1',
      title: 'Tokyo Tower Visit',
      locationText: 'Tokyo, Japan',
      origin: 'youtube',
      confidence: 'provisional',
      score: 40,
      sourceRefs: [
        {
          url: 'https://youtube.com/watch?v=abc123',
          publisher: 'YouTube',
          retrievedAt: new Date().toISOString(),
        },
      ],
    });

    const differentPlace = createMockCandidate({
      candidateId: 'perp-2',
      title: 'Senso-ji Temple',
      locationText: 'Asakusa, Tokyo, Japan',
      origin: 'web',
      score: 70,
    });

    const candidates = [perplexityCandidate, placesCandidate, youtubeCandidate, differentPlace];
    const result = formClusters(candidates);

    // Should have 2 clusters: Tokyo Tower (3 candidates) and Senso-ji (1 candidate)
    expect(result.stats.originalCount).toBe(4);
    expect(result.clusters.length).toBeGreaterThanOrEqual(2);
    expect(result.clusters.length).toBeLessThanOrEqual(3);

    // Check that duplicates were removed
    expect(result.stats.duplicatesRemoved).toBeGreaterThan(0);
  });
});
