/**
 * YouTube Worker Tests
 *
 * Unit tests for the YouTube Social Signals Worker.
 * Tests client, transcript fetching, filtering, extraction, and worker execution.
 *
 * @see PRD Section 15 - YouTube Social Signals
 * @see Task 11.8 - Unit Tests
 */

import { describe, it, expect } from '@jest/globals';
import {
  parseDuration,
  isQuotaExceededError,
  YouTubeApiError,
} from './client.js';
import {
  combineSegments,
  cleanTranscriptText,
  findSegmentAtTimestamp,
} from './transcript.js';
import {
  filterVideos,
  passesViewCountFilter,
  passesAgeFilter,
  passesDurationFilter,
  passesCaptionFilter,
  sortByQuality,
  calculateQualityScore,
} from './filters.js';
import {
  buildExtractionPrompt,
  YOUTUBE_EXTRACTION_SYSTEM_PROMPT,
} from './prompts.js';
import { parseExtractionResponse, recommendationToCandidate } from './extractor.js';
import { generateQueries } from './worker.js';
import type { VideoDetails } from './client.js';
import type { TranscriptSegment } from './transcript.js';
import type { Session } from '../../schemas/session.js';
import type { EnrichedIntent } from '../../schemas/worker.js';

// ============================================================================
// Test Data
// ============================================================================

const mockVideoDetails: VideoDetails = {
  videoId: 'abc123',
  title: 'Tokyo Food Guide - Best Restaurants',
  description: 'Exploring the best food in Tokyo...',
  channelId: 'channel123',
  channelTitle: 'TravelExplorer',
  publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
  duration: 'PT15M30S',
  viewCount: 50000,
  likeCount: 2500,
  commentCount: 100,
  hasCaptions: true,
  tags: ['tokyo', 'food', 'travel'],
  thumbnailUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
};

const mockTranscriptSegments: TranscriptSegment[] = [
  { text: 'Welcome to Tokyo!', offset: 0, duration: 3 },
  { text: "Today we're exploring ramen.", offset: 3, duration: 4 },
  { text: 'First stop is Ichiran Ramen in Shibuya.', offset: 7, duration: 5 },
  { text: 'They have amazing tonkotsu.', offset: 12, duration: 3 },
];

function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    schemaVersion: 1,
    sessionId: '20260110-tokyo-food',
    title: 'Best food in Tokyo',
    destinations: ['Tokyo'],
    dateRange: {
      start: '2026-03-01',
      end: '2026-03-10',
    },
    flexibility: { type: 'none' },
    interests: ['food', 'ramen'],
    constraints: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockEnrichedIntent(overrides: Partial<EnrichedIntent> = {}): EnrichedIntent {
  return {
    destinations: ['Tokyo'],
    dateRange: {
      start: '2026-03-01',
      end: '2026-03-10',
    },
    flexibility: { type: 'none' },
    interests: ['food', 'ramen', 'japanese cuisine'],
    constraints: {},
    inferredTags: ['food-focused', 'japan'],
    ...overrides,
  };
}

// ============================================================================
// Client Tests
// ============================================================================

describe('YouTubeClient', () => {
  describe('parseDuration', () => {
    it('should parse duration with hours, minutes, seconds', () => {
      expect(parseDuration('PT1H30M45S')).toBe(5445);
    });

    it('should parse duration with minutes and seconds', () => {
      expect(parseDuration('PT15M30S')).toBe(930);
    });

    it('should parse duration with only minutes', () => {
      expect(parseDuration('PT20M')).toBe(1200);
    });

    it('should parse duration with only seconds', () => {
      expect(parseDuration('PT45S')).toBe(45);
    });

    it('should return 0 for invalid format', () => {
      expect(parseDuration('invalid')).toBe(0);
    });
  });

  describe('isQuotaExceededError', () => {
    it('should detect YouTubeApiError with quota flag', () => {
      const error = new YouTubeApiError('Quota exceeded', 403, false, true);
      expect(isQuotaExceededError(error)).toBe(true);
    });

    it('should detect quota keywords in error message', () => {
      const error = new Error('Daily quota limit exceeded');
      expect(isQuotaExceededError(error)).toBe(true);
    });

    it('should return false for non-quota errors', () => {
      const error = new Error('Network error');
      expect(isQuotaExceededError(error)).toBe(false);
    });
  });
});

// ============================================================================
// Transcript Tests
// ============================================================================

describe('Transcript Module', () => {
  describe('combineSegments', () => {
    it('should combine segments into coherent text', () => {
      const result = combineSegments(mockTranscriptSegments);
      expect(result).toBe(
        "Welcome to Tokyo! Today we're exploring ramen. First stop is Ichiran Ramen in Shibuya. They have amazing tonkotsu."
      );
    });

    it('should handle empty array', () => {
      expect(combineSegments([])).toBe('');
    });

    it('should normalize whitespace', () => {
      const segments: TranscriptSegment[] = [
        { text: '  Hello   ', offset: 0, duration: 1 },
        { text: '  World  ', offset: 1, duration: 1 },
      ];
      expect(combineSegments(segments)).toBe('Hello World');
    });
  });

  describe('cleanTranscriptText', () => {
    it('should decode HTML entities', () => {
      expect(cleanTranscriptText('Tom &amp; Jerry')).toBe('Tom & Jerry');
      expect(cleanTranscriptText('5 &lt; 10')).toBe('5 < 10');
      expect(cleanTranscriptText('He said &quot;hello&quot;')).toBe('He said "hello"');
    });

    it('should remove HTML tags', () => {
      expect(cleanTranscriptText('<b>Bold</b> text')).toBe('Bold text');
    });

    it('should normalize whitespace', () => {
      expect(cleanTranscriptText('Multiple    spaces')).toBe('Multiple spaces');
    });
  });

  describe('findSegmentAtTimestamp', () => {
    it('should find segment at given timestamp', () => {
      const segment = findSegmentAtTimestamp(mockTranscriptSegments, 8);
      expect(segment?.text).toBe('First stop is Ichiran Ramen in Shibuya.');
    });

    it('should return undefined for timestamp outside range', () => {
      const segment = findSegmentAtTimestamp(mockTranscriptSegments, 100);
      expect(segment).toBeUndefined();
    });
  });
});

// ============================================================================
// Filter Tests
// ============================================================================

describe('Filters Module', () => {
  describe('passesViewCountFilter', () => {
    it('should pass videos above threshold', () => {
      expect(passesViewCountFilter(mockVideoDetails, 10000)).toBe(true);
    });

    it('should reject videos below threshold', () => {
      const lowViews = { ...mockVideoDetails, viewCount: 5000 };
      expect(passesViewCountFilter(lowViews, 10000)).toBe(false);
    });
  });

  describe('passesAgeFilter', () => {
    it('should pass recent videos', () => {
      const recent = {
        ...mockVideoDetails,
        publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
      expect(passesAgeFilter(recent, 365)).toBe(true);
    });

    it('should reject old videos', () => {
      const old = {
        ...mockVideoDetails,
        publishedAt: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString(),
      };
      expect(passesAgeFilter(old, 730)).toBe(false);
    });
  });

  describe('passesDurationFilter', () => {
    it('should pass videos within duration range', () => {
      const video = { ...mockVideoDetails, duration: 'PT10M' };
      expect(passesDurationFilter(video, 240, 1200)).toBe(true);
    });

    it('should reject too short videos', () => {
      const video = { ...mockVideoDetails, duration: 'PT2M' };
      expect(passesDurationFilter(video, 240, 1200)).toBe(false);
    });

    it('should reject too long videos', () => {
      const video = { ...mockVideoDetails, duration: 'PT30M' };
      expect(passesDurationFilter(video, 240, 1200)).toBe(false);
    });
  });

  describe('passesCaptionFilter', () => {
    it('should pass videos with captions', () => {
      expect(passesCaptionFilter(mockVideoDetails)).toBe(true);
    });

    it('should reject videos without captions', () => {
      const noCaptions = { ...mockVideoDetails, hasCaptions: false };
      expect(passesCaptionFilter(noCaptions)).toBe(false);
    });
  });

  describe('filterVideos', () => {
    it('should filter videos based on all criteria', () => {
      const videos: VideoDetails[] = [
        mockVideoDetails, // passes all
        { ...mockVideoDetails, videoId: 'low', viewCount: 100 }, // low views
        { ...mockVideoDetails, videoId: 'nocap', hasCaptions: false }, // no captions
      ];

      const result = filterVideos(videos);
      expect(result).toHaveLength(1);
      expect(result[0].videoId).toBe('abc123');
    });
  });

  describe('sortByQuality', () => {
    it('should sort videos by quality score descending', () => {
      const videos: VideoDetails[] = [
        { ...mockVideoDetails, videoId: 'low', viewCount: 1000, likeCount: 10 },
        { ...mockVideoDetails, videoId: 'high', viewCount: 100000, likeCount: 10000 },
        mockVideoDetails,
      ];

      const sorted = sortByQuality(videos);
      expect(sorted[0].videoId).toBe('high');
    });
  });

  describe('calculateQualityScore', () => {
    it('should calculate positive score for good videos', () => {
      const score = calculateQualityScore(mockVideoDetails);
      expect(score).toBeGreaterThan(0);
    });

    it('should give higher score to videos with more engagement', () => {
      const low = { ...mockVideoDetails, viewCount: 1000, likeCount: 10 };
      const high = { ...mockVideoDetails, viewCount: 100000, likeCount: 10000 };

      expect(calculateQualityScore(high)).toBeGreaterThan(calculateQualityScore(low));
    });
  });
});

// ============================================================================
// Prompts Tests
// ============================================================================

describe('Prompts Module', () => {
  describe('buildExtractionPrompt', () => {
    it('should build prompt with video details', () => {
      const prompt = buildExtractionPrompt(
        'This is a transcript about Tokyo food...',
        'Tokyo Food Guide',
        'Tokyo',
        'TravelChannel'
      );

      expect(prompt).toContain('Tokyo');
      expect(prompt).toContain('Tokyo Food Guide');
      expect(prompt).toContain('TravelChannel');
      expect(prompt).toContain('TRANSCRIPT');
    });

    it('should truncate long transcripts', () => {
      const longTranscript = 'a'.repeat(10000);
      const prompt = buildExtractionPrompt(
        longTranscript,
        'Title',
        'Destination',
        'Channel'
      );

      expect(prompt).toContain('[transcript truncated]');
      expect(prompt.length).toBeLessThan(longTranscript.length);
    });
  });

  describe('YOUTUBE_EXTRACTION_SYSTEM_PROMPT', () => {
    it('should contain extraction instructions', () => {
      expect(YOUTUBE_EXTRACTION_SYSTEM_PROMPT).toContain('travel');
      expect(YOUTUBE_EXTRACTION_SYSTEM_PROMPT).toContain('recommendation');
      expect(YOUTUBE_EXTRACTION_SYSTEM_PROMPT).toContain('JSON');
    });
  });
});

// ============================================================================
// Extractor Tests
// ============================================================================

describe('Extractor Module', () => {
  describe('parseExtractionResponse', () => {
    it('should parse valid JSON array', () => {
      const response = `[
        {
          "name": "Ichiran Ramen",
          "type": "food",
          "description": "Famous tonkotsu ramen chain",
          "location": "Shibuya",
          "timestampSeconds": 120
        }
      ]`;

      const result = parseExtractionResponse(response);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Ichiran Ramen');
      expect(result[0].type).toBe('food');
    });

    it('should handle JSON in markdown code blocks', () => {
      const response = '```json\n[{"name": "Place", "type": "place", "description": "A place"}]\n```';
      const result = parseExtractionResponse(response);
      expect(result).toHaveLength(1);
    });

    it('should return empty array for invalid JSON', () => {
      const result = parseExtractionResponse('This is not JSON');
      expect(result).toHaveLength(0);
    });

    it('should recover partial valid recommendations', () => {
      const response = `[
        {"name": "Valid", "type": "food", "description": "Good"},
        {"name": "", "type": "invalid"},
        {"name": "Also Valid", "type": "place", "description": "Also good"}
      ]`;

      const result = parseExtractionResponse(response);
      expect(result).toHaveLength(2);
    });
  });

  describe('recommendationToCandidate', () => {
    it('should convert recommendation to YouTube candidate', () => {
      const recommendation = {
        name: 'Ichiran Ramen',
        type: 'food' as const,
        description: 'Famous tonkotsu ramen chain',
        location: 'Shibuya',
        timestampSeconds: 120,
      };

      const candidate = recommendationToCandidate(recommendation, mockVideoDetails, 'Tokyo');

      expect(candidate.title).toBe('Ichiran Ramen');
      expect(candidate.type).toBe('food');
      expect(candidate.origin).toBe('youtube');
      expect(candidate.confidence).toBe('provisional');
      expect(candidate.metadata?.videoId).toBe('abc123');
      expect(candidate.metadata?.channelName).toBe('TravelExplorer');
      expect(candidate.metadata?.timestampSeconds).toBe(120);
      expect(candidate.sourceRefs[0].url).toContain('youtube.com/watch?v=abc123&t=120');
    });

    it('should include youtube tag', () => {
      const recommendation = {
        name: 'Test Place',
        type: 'place' as const,
        description: 'A test place',
      };

      const candidate = recommendationToCandidate(recommendation, mockVideoDetails, 'Tokyo');
      expect(candidate.tags).toContain('youtube');
    });
  });
});

// ============================================================================
// Worker Tests
// ============================================================================

describe('YouTubeWorker', () => {
  describe('generateQueries', () => {
    it('should generate travel-focused queries', () => {
      const session = createMockSession();
      const intent = createMockEnrichedIntent();

      const queries = generateQueries(session, intent);

      expect(queries.length).toBeGreaterThan(0);
      expect(queries.length).toBeLessThanOrEqual(5);
      expect(queries.some((q) => q.includes('Tokyo'))).toBe(true);
      expect(queries.some((q) => q.includes('travel guide'))).toBe(true);
    });

    it('should include interest-based queries', () => {
      const session = createMockSession();
      const intent = createMockEnrichedIntent();

      const queries = generateQueries(session, intent);
      expect(queries.some((q) => q.includes('food'))).toBe(true);
    });

    it('should return empty array for empty destinations', () => {
      const emptyIntent = { ...createMockEnrichedIntent(), destinations: [] };
      const emptySession = { ...createMockSession(), destinations: [] };
      const queries = generateQueries(emptySession, emptyIntent);
      expect(queries).toHaveLength(0);
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  describe('YouTubeApiError', () => {
    it('should create error with correct properties', () => {
      const error = new YouTubeApiError('Test error', 429, true, false);

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(429);
      expect(error.isRetryable).toBe(true);
      expect(error.isQuotaExceeded).toBe(false);
      expect(error.name).toBe('YouTubeApiError');
    });

    it('should mark quota errors correctly', () => {
      const error = new YouTubeApiError('Quota exceeded', 403, false, true);

      expect(error.isQuotaExceeded).toBe(true);
      expect(error.isRetryable).toBe(false);
    });
  });
});
