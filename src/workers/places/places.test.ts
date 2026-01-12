/**
 * Google Places Worker Tests
 *
 * Comprehensive unit tests covering:
 * - PlacesClient: API communication, error handling, call tracking
 * - Mapper: Place to Candidate conversion, source refs, metadata
 * - PlacesWorker: Planning, execution, deduplication, cost tracking
 *
 * @see PRD FR5.2 - Google Places Worker
 * @see Task 10.5 - Google Places Worker Unit Tests
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  PlacesClient,
  PlacesApiError,
  isPlacesApiError,
  isRetryableError,
  type Place,
  type PlaceDetails,
} from './client.js';
import {
  mapPlaceToCandidate,
  mapPlacesToCandidates,
  generatePlaceCandidateId,
  inferCandidateType,
  buildGoogleMapsUrl,
} from './mapper.js';
import { PlacesWorker, generateQueries, deduplicateCandidates } from './worker.js';
import type {
  WorkerContext,
  CostTracker,
  CircuitBreaker,
} from '../types.js';
import type { EnrichedIntent } from '../../schemas/worker.js';
import type { Session } from '../../schemas/session.js';
import type { Candidate } from '../../schemas/candidate.js';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Mock fetch for API tests
 */
const mockFetch = jest.fn<typeof fetch>();

/**
 * Store original fetch for restoration
 */
const originalFetch = global.fetch;

/**
 * Create a mock session for testing
 */
function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    schemaVersion: 1,
    sessionId: '20260401-tokyo-food',
    title: 'Tokyo Food Adventure',
    destinations: ['Tokyo'],
    dateRange: { start: '2026-04-01', end: '2026-04-14' },
    flexibility: { type: 'none' },
    interests: ['food', 'culture', 'local experiences'],
    constraints: {},
    createdAt: '2026-01-10T12:00:00Z',
    ...overrides,
  };
}

/**
 * Create a mock enriched intent for testing
 */
function createMockEnrichedIntent(overrides: Partial<EnrichedIntent> = {}): EnrichedIntent {
  return {
    destinations: ['Tokyo'],
    dateRange: { start: '2026-04-01', end: '2026-04-14' },
    flexibility: { type: 'none' },
    interests: ['food', 'culture', 'local experiences'],
    constraints: {},
    inferredTags: ['asia', 'spring', 'culinary', 'japan'],
    ...overrides,
  };
}

/**
 * Create a mock cost tracker for testing
 */
function createMockCostTracker(): CostTracker {
  return {
    addPerplexity: jest.fn() as CostTracker['addPerplexity'],
    addGemini: jest.fn() as CostTracker['addGemini'],
    addOpenAI: jest.fn() as CostTracker['addOpenAI'],
    addPlacesCall: jest.fn() as CostTracker['addPlacesCall'],
    addYouTubeUnits: jest.fn() as CostTracker['addYouTubeUnits'],
    getCost: jest.fn<CostTracker['getCost']>().mockReturnValue({
      schemaVersion: 1,
      runId: 'test-run',
      providers: {
        perplexity: { tokens: { input: 0, output: 0 }, cost: 0 },
        gemini: { tokens: { input: 0, output: 0 }, cost: 0 },
        openai: { tokens: { input: 0, output: 0 }, cost: 0 },
        places: { calls: 0, cost: 0 },
        youtube: { units: 0, cost: 0 },
      },
      total: 0,
      currency: 'USD',
    }),
    reset: jest.fn() as CostTracker['reset'],
  };
}

/**
 * Create a mock circuit breaker for testing
 */
function createMockCircuitBreaker(openProviders: string[] = []): CircuitBreaker {
  return {
    recordSuccess: jest.fn() as CircuitBreaker['recordSuccess'],
    recordFailure: jest.fn() as CircuitBreaker['recordFailure'],
    isOpen: jest.fn<CircuitBreaker['isOpen']>().mockImplementation(
      (provider: string) => openProviders.includes(provider)
    ),
    getStatus: jest.fn<CircuitBreaker['getStatus']>().mockReturnValue({}),
  };
}

/**
 * Create a mock worker context for testing
 */
function createMockContext(overrides: Partial<WorkerContext> = {}): WorkerContext {
  return {
    session: createMockSession(),
    runId: '20260110-120000',
    enrichedIntent: createMockEnrichedIntent(),
    costTracker: createMockCostTracker(),
    circuitBreaker: createMockCircuitBreaker(),
    ...overrides,
  };
}

/**
 * Sample place data from Google Places API
 */
const mockPlace: Place = {
  placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
  name: 'Sushi Dai',
  formattedAddress: '5-2-1 Tsukiji, Chuo City, Tokyo 104-0045, Japan',
  geometry: {
    location: {
      lat: 35.6654861,
      lng: 139.7706668,
    },
  },
  rating: 4.7,
  userRatingsTotal: 2500,
  priceLevel: 3,
  types: ['restaurant', 'food', 'point_of_interest', 'establishment'],
  businessStatus: 'OPERATIONAL',
  openingHours: {
    openNow: true,
  },
};

/**
 * Sample place details from Google Places API
 */
const mockPlaceDetails: PlaceDetails = {
  ...mockPlace,
  formattedPhoneNumber: '+81 3-1234-5678',
  website: 'https://sushidai.example.com',
  url: 'https://maps.google.com/?cid=12345',
  openingHours: {
    openNow: true,
    weekdayText: [
      'Monday: 5:00 AM - 2:00 PM',
      'Tuesday: 5:00 AM - 2:00 PM',
      'Wednesday: Closed',
    ],
  },
  editorialSummary: {
    overview: 'Famous sushi restaurant in the Tsukiji area, known for fresh omakase sets.',
  },
  reviews: [
    {
      authorName: 'Travel Expert',
      rating: 5,
      text: 'Best sushi in Tokyo!',
      relativeTimeDescription: '2 weeks ago',
    },
  ],
};

/**
 * Mock text search API response
 */
const mockTextSearchResponse = {
  status: 'OK',
  results: [
    {
      place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      name: 'Sushi Dai',
      formatted_address: '5-2-1 Tsukiji, Chuo City, Tokyo 104-0045, Japan',
      geometry: { location: { lat: 35.6654861, lng: 139.7706668 } },
      rating: 4.7,
      user_ratings_total: 2500,
      price_level: 3,
      types: ['restaurant', 'food', 'point_of_interest', 'establishment'],
      business_status: 'OPERATIONAL',
      opening_hours: { open_now: true },
    },
    {
      place_id: 'ChIJxyz123456789',
      name: 'Tokyo Tower',
      formatted_address: '4-2-8 Shibakoen, Minato City, Tokyo, Japan',
      geometry: { location: { lat: 35.6585805, lng: 139.7454329 } },
      rating: 4.4,
      user_ratings_total: 45000,
      types: ['tourist_attraction', 'point_of_interest', 'establishment'],
      business_status: 'OPERATIONAL',
    },
  ],
};

/**
 * Mock place details API response
 */
const mockDetailsResponse = {
  status: 'OK',
  result: {
    place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    name: 'Sushi Dai',
    formatted_address: '5-2-1 Tsukiji, Chuo City, Tokyo 104-0045, Japan',
    geometry: { location: { lat: 35.6654861, lng: 139.7706668 } },
    rating: 4.7,
    user_ratings_total: 2500,
    price_level: 3,
    types: ['restaurant', 'food', 'point_of_interest', 'establishment'],
    business_status: 'OPERATIONAL',
    formatted_phone_number: '+81 3-1234-5678',
    website: 'https://sushidai.example.com',
    url: 'https://maps.google.com/?cid=12345',
    opening_hours: {
      open_now: true,
      weekday_text: ['Monday: 5:00 AM - 2:00 PM'],
    },
    editorial_summary: {
      overview: 'Famous sushi restaurant in the Tsukiji area.',
    },
    reviews: [
      {
        author_name: 'Travel Expert',
        rating: 5,
        text: 'Best sushi in Tokyo!',
        relative_time_description: '2 weeks ago',
      },
    ],
  },
};

/**
 * Create a mock Response object for fetch
 */
function createMockResponse(data: unknown, options: { ok?: boolean; status?: number } = {}): Response {
  const { ok = true, status = 200 } = options;
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers(),
    redirected: false,
    statusText: ok ? 'OK' : 'Error',
    type: 'basic',
    url: 'https://maps.googleapis.com/maps/api/place/textsearch/json',
    clone: () => createMockResponse(data, options),
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    bytes: async () => new Uint8Array(),
  } as Response;
}

// ============================================================================
// PlacesClient Tests
// ============================================================================

describe('PlacesClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
    process.env.GOOGLE_PLACES_API_KEY = 'test-api-key-12345';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.GOOGLE_PLACES_API_KEY;
  });

  describe('constructor', () => {
    it('creates client when API key is set', () => {
      expect(() => new PlacesClient()).not.toThrow();
    });
  });

  describe('textSearch - successful requests', () => {
    it('returns parsed places on success', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockTextSearchResponse));

      const client = new PlacesClient();
      const results = await client.textSearch('restaurants in Tokyo');

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Sushi Dai');
      expect(results[0].placeId).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');
      expect(results[0].rating).toBe(4.7);
    });

    it('increments call count after successful request', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockTextSearchResponse));

      const client = new PlacesClient();
      expect(client.getCallCount()).toBe(0);

      await client.textSearch('test query');

      expect(client.getCallCount()).toBe(1);
    });

    it('sends correct query parameters', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockTextSearchResponse));

      const client = new PlacesClient();
      await client.textSearch('sushi in Shibuya', {
        type: 'restaurant',
        minPrice: 2,
        maxPrice: 3,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('query=sushi+in+Shibuya');
      expect(url).toContain('type=restaurant');
      expect(url).toContain('minprice=2');
      expect(url).toContain('maxprice=3');
    });

    it('includes location parameter when provided', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockTextSearchResponse));

      const client = new PlacesClient();
      await client.textSearch('restaurants', {
        location: { lat: 35.6762, lng: 139.6503 },
        radius: 5000,
      });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('location=35.6762%2C139.6503');
      expect(url).toContain('radius=5000');
    });

    it('handles ZERO_RESULTS status gracefully', async () => {
      const emptyResponse = { status: 'ZERO_RESULTS', results: [] };
      mockFetch.mockResolvedValueOnce(createMockResponse(emptyResponse));

      const client = new PlacesClient();
      const results = await client.textSearch('nonexistent place xyz123');

      expect(results).toEqual([]);
    });
  });

  describe('textSearch - error handling', () => {
    it('throws retryable error on OVER_QUERY_LIMIT', async () => {
      const errorResponse = { status: 'OVER_QUERY_LIMIT', results: [], error_message: 'Quota exceeded' };
      mockFetch.mockResolvedValueOnce(createMockResponse(errorResponse));

      const client = new PlacesClient();

      try {
        await client.textSearch('test');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(isPlacesApiError(error)).toBe(true);
        if (isPlacesApiError(error)) {
          expect(error.status).toBe('OVER_QUERY_LIMIT');
          expect(error.isRetryable).toBe(true);
        }
      }
    });

    it('throws non-retryable error on REQUEST_DENIED', async () => {
      const errorResponse = { status: 'REQUEST_DENIED', results: [], error_message: 'Invalid API key' };
      mockFetch.mockResolvedValueOnce(createMockResponse(errorResponse));

      const client = new PlacesClient();

      try {
        await client.textSearch('test');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(isPlacesApiError(error)).toBe(true);
        if (isPlacesApiError(error)) {
          expect(error.status).toBe('REQUEST_DENIED');
          expect(error.isRetryable).toBe(false);
        }
      }
    });

    it('throws retryable error on HTTP 429', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: 'Rate limited' }, { ok: false, status: 429 })
      );

      const client = new PlacesClient();

      try {
        await client.textSearch('test');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(isPlacesApiError(error)).toBe(true);
        if (isPlacesApiError(error)) {
          expect(error.statusCode).toBe(429);
          expect(error.isRetryable).toBe(true);
        }
      }
    });

    it('throws retryable error on timeout', async () => {
      mockFetch.mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          const signal = (options as RequestInit)?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const abortError = new Error('The operation was aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            });
          }
        });
      });

      const client = new PlacesClient();

      try {
        await client.textSearch('test', { timeoutMs: 50 });
        fail('Expected timeout error');
      } catch (error) {
        expect(isPlacesApiError(error)).toBe(true);
        if (isPlacesApiError(error)) {
          expect(error.status).toBe('TIMEOUT');
          expect(error.isRetryable).toBe(true);
        }
      }
    }, 5000);
  });

  describe('getPlaceDetails', () => {
    it('returns parsed place details on success', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockDetailsResponse));

      const client = new PlacesClient();
      const details = await client.getPlaceDetails('ChIJN1t_tDeuEmsRUsoyG83frY4');

      expect(details.name).toBe('Sushi Dai');
      expect(details.website).toBe('https://sushidai.example.com');
      expect(details.editorialSummary?.overview).toContain('Famous sushi restaurant');
      expect(details.reviews).toHaveLength(1);
    });

    it('increments call count', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockDetailsResponse));

      const client = new PlacesClient();
      client.resetCallCount();

      await client.getPlaceDetails('test-place-id');

      expect(client.getCallCount()).toBe(1);
    });

    it('throws error on NOT_FOUND status', async () => {
      const errorResponse = { status: 'NOT_FOUND', error_message: 'Place not found' };
      mockFetch.mockResolvedValueOnce(createMockResponse(errorResponse));

      const client = new PlacesClient();

      await expect(client.getPlaceDetails('invalid-id')).rejects.toThrow();
    });
  });

  describe('call counting', () => {
    it('tracks multiple calls', async () => {
      mockFetch.mockResolvedValue(createMockResponse(mockTextSearchResponse));

      const client = new PlacesClient();

      await client.textSearch('query 1');
      await client.textSearch('query 2');
      await client.textSearch('query 3');

      expect(client.getCallCount()).toBe(3);
    });

    it('resets call count', async () => {
      mockFetch.mockResolvedValue(createMockResponse(mockTextSearchResponse));

      const client = new PlacesClient();
      await client.textSearch('test');

      expect(client.getCallCount()).toBe(1);

      client.resetCallCount();
      expect(client.getCallCount()).toBe(0);
    });
  });
});

// ============================================================================
// isRetryableError Tests
// ============================================================================

describe('isRetryableError', () => {
  it('returns true for PlacesApiError with isRetryable=true', () => {
    const error = new PlacesApiError('Quota exceeded', 429, 'OVER_QUERY_LIMIT', true);
    expect(isRetryableError(error)).toBe(true);
  });

  it('returns false for PlacesApiError with isRetryable=false', () => {
    const error = new PlacesApiError('Invalid request', 400, 'INVALID_REQUEST', false);
    expect(isRetryableError(error)).toBe(false);
  });

  it('returns true for Error with quota message', () => {
    const error = new Error('API quota exceeded');
    expect(isRetryableError(error)).toBe(true);
  });

  it('returns true for Error with timeout message', () => {
    const error = new Error('Connection timeout');
    expect(isRetryableError(error)).toBe(true);
  });

  it('returns false for non-Error values', () => {
    expect(isRetryableError('string error')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

// ============================================================================
// Mapper Tests
// ============================================================================

describe('mapPlaceToCandidate', () => {
  it('creates candidate with correct structure', () => {
    const candidate = mapPlaceToCandidate(mockPlace, 'Tokyo');

    expect(candidate.candidateId).toMatch(/^[a-f0-9]{16}$/);
    expect(candidate.title).toBe('Sushi Dai');
    expect(candidate.origin).toBe('places');
    expect(candidate.confidence).toBe('verified');
    expect(candidate.coordinates).toEqual({
      lat: 35.6654861,
      lng: 139.7706668,
    });
  });

  it('sets correct type for restaurant', () => {
    const candidate = mapPlaceToCandidate(mockPlace, 'Tokyo');
    expect(candidate.type).toBe('food');
  });

  it('sets correct type for tourist attraction', () => {
    const attraction: Place = {
      ...mockPlace,
      types: ['tourist_attraction', 'point_of_interest'],
    };
    const candidate = mapPlaceToCandidate(attraction, 'Tokyo');
    expect(candidate.type).toBe('place');
  });

  it('includes Google Maps URL as source ref', () => {
    const candidate = mapPlaceToCandidate(mockPlaceDetails, 'Tokyo');

    expect(candidate.sourceRefs.length).toBeGreaterThan(0);
    const mapsSource = candidate.sourceRefs.find((s) => s.publisher === 'Google Maps');
    expect(mapsSource).toBeDefined();
    expect(mapsSource?.url).toContain('maps.google.com');
  });

  it('includes website as secondary source ref when available', () => {
    const candidate = mapPlaceToCandidate(mockPlaceDetails, 'Tokyo');

    const websiteSource = candidate.sourceRefs.find(
      (s) => s.url === 'https://sushidai.example.com'
    );
    expect(websiteSource).toBeDefined();
  });

  it('uses editorial summary when available', () => {
    const candidate = mapPlaceToCandidate(mockPlaceDetails, 'Tokyo');
    expect(candidate.summary).toContain('Famous sushi restaurant');
  });

  it('builds summary from attributes when no editorial summary', () => {
    const candidate = mapPlaceToCandidate(mockPlace, 'Tokyo');
    expect(candidate.summary).toContain('4.7 stars');
    expect(candidate.summary).toContain('expensive');
  });

  it('includes metadata with placeId and rating', () => {
    const candidate = mapPlaceToCandidate(mockPlace, 'Tokyo');

    expect(candidate.metadata?.placeId).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');
    expect(candidate.metadata?.rating).toBe(4.7);
    expect(candidate.metadata?.priceLevel).toBe(3);
  });

  it('calculates reasonable initial score', () => {
    const candidate = mapPlaceToCandidate(mockPlace, 'Tokyo');

    // High rating (4.7) + many reviews (2500) should give high score
    expect(candidate.score).toBeGreaterThan(60);
    expect(candidate.score).toBeLessThanOrEqual(100);
  });

  it('includes relevant tags', () => {
    const candidate = mapPlaceToCandidate(mockPlace, 'Tokyo');

    expect(candidate.tags).toContain('food');
    expect(candidate.tags).toContain('dining');
    expect(candidate.tags).toContain('highly-rated'); // 4.7 rating
    expect(candidate.tags).toContain('popular'); // 2500 reviews
  });
});

describe('mapPlacesToCandidates', () => {
  it('maps multiple places', () => {
    const places = [mockPlace, { ...mockPlace, placeId: 'different-id', name: 'Another Place' }];
    const candidates = mapPlacesToCandidates(places, 'Tokyo');

    expect(candidates).toHaveLength(2);
    expect(candidates[0].title).toBe('Sushi Dai');
    expect(candidates[1].title).toBe('Another Place');
  });
});

describe('generatePlaceCandidateId', () => {
  it('generates 16-character hex ID', () => {
    const id = generatePlaceCandidateId('ChIJtest123', 'Test Place');
    expect(id).toMatch(/^[a-f0-9]{16}$/);
  });

  it('generates same ID for same input', () => {
    const id1 = generatePlaceCandidateId('ChIJtest123', 'Test Place');
    const id2 = generatePlaceCandidateId('ChIJtest123', 'Test Place');
    expect(id1).toBe(id2);
  });

  it('generates different IDs for different place IDs', () => {
    const id1 = generatePlaceCandidateId('ChIJtest123', 'Test Place');
    const id2 = generatePlaceCandidateId('ChIJtest456', 'Test Place');
    expect(id1).not.toBe(id2);
  });

  it('is case-insensitive for name', () => {
    const id1 = generatePlaceCandidateId('ChIJtest123', 'Test Place');
    const id2 = generatePlaceCandidateId('ChIJtest123', 'test place');
    expect(id1).toBe(id2);
  });
});

describe('inferCandidateType', () => {
  it('identifies food types', () => {
    expect(inferCandidateType(['restaurant', 'food'])).toBe('food');
    expect(inferCandidateType(['cafe', 'establishment'])).toBe('food');
    expect(inferCandidateType(['bar', 'point_of_interest'])).toBe('food');
  });

  it('identifies place types', () => {
    expect(inferCandidateType(['tourist_attraction'])).toBe('place');
    expect(inferCandidateType(['museum', 'establishment'])).toBe('place');
  });

  it('identifies activity types', () => {
    expect(inferCandidateType(['gym', 'health'])).toBe('activity');
    expect(inferCandidateType(['spa'])).toBe('activity');
  });

  it('identifies neighborhood types', () => {
    expect(inferCandidateType(['neighborhood', 'political'])).toBe('neighborhood');
  });

  it('defaults to place for unknown types', () => {
    expect(inferCandidateType(['unknown_type'])).toBe('place');
    expect(inferCandidateType([])).toBe('place');
  });
});

describe('buildGoogleMapsUrl', () => {
  it('uses place URL when available', () => {
    const url = buildGoogleMapsUrl(mockPlaceDetails);
    expect(url).toBe('https://maps.google.com/?cid=12345');
  });

  it('falls back to place ID format when no URL', () => {
    const url = buildGoogleMapsUrl(mockPlace);
    expect(url).toContain('?cid=');
    expect(url).toContain(mockPlace.placeId);
  });
});

// ============================================================================
// PlacesWorker Tests
// ============================================================================

describe('PlacesWorker', () => {
  /**
   * Create a mock PlacesClient for testing
   */
  function createMockClient(overrides: Partial<{
    textSearch: ReturnType<typeof jest.fn>;
    getPlaceDetails: ReturnType<typeof jest.fn>;
  }> = {}): PlacesClient {
    return {
      textSearch: overrides.textSearch ?? jest.fn<() => Promise<Place[]>>().mockResolvedValue([
        mockPlace,
        { ...mockPlace, placeId: 'place-2', name: 'Second Place' },
      ]),
      getPlaceDetails: overrides.getPlaceDetails ?? jest.fn<() => Promise<PlaceDetails>>().mockResolvedValue(mockPlaceDetails),
      getCallCount: jest.fn().mockReturnValue(0),
      resetCallCount: jest.fn(),
    } as unknown as PlacesClient;
  }

  describe('plan()', () => {
    it('generates queries based on session and intent', async () => {
      const client = createMockClient();
      const worker = new PlacesWorker(client);
      const session = createMockSession();
      const intent = createMockEnrichedIntent();

      const assignment = await worker.plan(session, intent);

      expect(assignment.queries.length).toBeGreaterThan(0);
      expect(assignment.queries.length).toBeLessThanOrEqual(4);
    });

    it('returns valid WorkerAssignment structure', async () => {
      const client = createMockClient();
      const worker = new PlacesWorker(client);
      const session = createMockSession();
      const intent = createMockEnrichedIntent();

      const assignment = await worker.plan(session, intent);

      expect(assignment.workerId).toBe('places');
      expect(Array.isArray(assignment.queries)).toBe(true);
      expect(typeof assignment.maxResults).toBe('number');
      expect(assignment.maxResults).toBeGreaterThan(0);
      expect(typeof assignment.timeout).toBe('number');
    });

    it('includes destination in queries', async () => {
      const client = createMockClient();
      const worker = new PlacesWorker(client);
      const session = createMockSession();
      const intent = createMockEnrichedIntent({ destinations: ['Kyoto'] });

      const assignment = await worker.plan(session, intent);

      const hasDestination = assignment.queries.some((q) =>
        q.toLowerCase().includes('kyoto')
      );
      expect(hasDestination).toBe(true);
    });

    it('includes interests in queries', async () => {
      const client = createMockClient();
      const worker = new PlacesWorker(client);
      const session = createMockSession();
      const intent = createMockEnrichedIntent({ interests: ['food', 'museums'] });

      const assignment = await worker.plan(session, intent);

      const hasInterest = assignment.queries.some(
        (q) => q.toLowerCase().includes('food') || q.toLowerCase().includes('museums')
      );
      expect(hasInterest).toBe(true);
    });

    it('returns empty queries when no destination', async () => {
      const client = createMockClient();
      const worker = new PlacesWorker(client);
      const session = createMockSession({ destinations: [] });
      const intent = createMockEnrichedIntent({ destinations: [] });

      const assignment = await worker.plan(session, intent);

      expect(assignment.queries).toEqual([]);
    });
  });

  describe('execute()', () => {
    it('returns candidates on successful API response', async () => {
      const mockSearch = jest.fn<() => Promise<Place[]>>().mockResolvedValue([
        mockPlace,
        { ...mockPlace, placeId: 'place-2', name: 'Second Place' },
      ]);

      const client = createMockClient({ textSearch: mockSearch });
      const worker = new PlacesWorker(client);
      const context = createMockContext();

      const assignment = {
        workerId: 'places',
        queries: ['restaurants in Tokyo'],
        maxResults: 10,
        timeout: 20000,
      };

      const output = await worker.execute(assignment, context);

      expect(output.status).toBe('ok');
      expect(output.candidates.length).toBeGreaterThan(0);
      expect(output.workerId).toBe('places');
      expect(output.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('tracks API calls via costTracker', async () => {
      const client = createMockClient();
      const worker = new PlacesWorker(client);
      const costTracker = createMockCostTracker();
      const context = createMockContext({ costTracker });

      const assignment = {
        workerId: 'places',
        queries: ['test query'],
        maxResults: 10,
        timeout: 20000,
      };

      await worker.execute(assignment, context);

      // Should have called addPlacesCall for search + detail fetches
      expect(costTracker.addPlacesCall).toHaveBeenCalled();
    });

    it('handles errors gracefully and returns error status', async () => {
      const mockSearch = jest.fn<() => Promise<Place[]>>().mockRejectedValue(
        new Error('API connection failed')
      );

      const client = createMockClient({ textSearch: mockSearch });
      const worker = new PlacesWorker(client);
      const context = createMockContext();

      const assignment = {
        workerId: 'places',
        queries: ['test query'],
        maxResults: 10,
        timeout: 20000,
      };

      const output = await worker.execute(assignment, context);

      expect(output.status).toBe('error');
      expect(output.candidates).toEqual([]);
      expect(output.error).toContain('API connection failed');
    });

    it('returns partial status when some queries fail', async () => {
      let callCount = 0;
      const mockSearch = jest.fn<() => Promise<Place[]>>().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([mockPlace]);
        }
        return Promise.reject(new Error('Query failed'));
      });

      const client = createMockClient({ textSearch: mockSearch });
      const worker = new PlacesWorker(client);
      const context = createMockContext();

      const assignment = {
        workerId: 'places',
        queries: ['Query 1', 'Query 2'],
        maxResults: 10,
        timeout: 20000,
      };

      const output = await worker.execute(assignment, context);

      expect(output.status).toBe('partial');
      expect(output.candidates.length).toBeGreaterThan(0);
      expect(output.error).toBeDefined();
    });

    it('skips when circuit breaker is open', async () => {
      const client = createMockClient();
      const worker = new PlacesWorker(client);
      const circuitBreaker = createMockCircuitBreaker(['places']);
      const context = createMockContext({ circuitBreaker });

      const assignment = {
        workerId: 'places',
        queries: ['test query'],
        maxResults: 10,
        timeout: 20000,
      };

      const output = await worker.execute(assignment, context);

      expect(output.status).toBe('skipped');
      expect(output.candidates).toEqual([]);
      expect(output.error).toContain('Circuit breaker');
    });

    it('records circuit breaker events', async () => {
      const client = createMockClient();
      const worker = new PlacesWorker(client);
      const circuitBreaker = createMockCircuitBreaker();
      const context = createMockContext({ circuitBreaker });

      const assignment = {
        workerId: 'places',
        queries: ['test query'],
        maxResults: 10,
        timeout: 20000,
      };

      await worker.execute(assignment, context);

      expect(circuitBreaker.recordSuccess).toHaveBeenCalledWith('places');
    });

    it('respects maxResults limit', async () => {
      const manyPlaces = Array.from({ length: 10 }, (_, i) => ({
        ...mockPlace,
        placeId: `place-${i}`,
        name: `Place ${i}`,
      }));

      const mockSearch = jest.fn<() => Promise<Place[]>>().mockResolvedValue(manyPlaces);
      const client = createMockClient({ textSearch: mockSearch });
      const worker = new PlacesWorker(client);
      const context = createMockContext();

      const assignment = {
        workerId: 'places',
        queries: ['query 1', 'query 2'],
        maxResults: 5,
        timeout: 20000,
      };

      const output = await worker.execute(assignment, context);

      expect(output.candidates.length).toBeLessThanOrEqual(5);
    });

    it('deduplicates candidates across queries', async () => {
      // Both queries return the same place
      const mockSearch = jest.fn<() => Promise<Place[]>>().mockResolvedValue([mockPlace]);
      const client = createMockClient({ textSearch: mockSearch });
      const worker = new PlacesWorker(client);
      const context = createMockContext();

      const assignment = {
        workerId: 'places',
        queries: ['Tokyo restaurants', 'Sushi in Tokyo'],
        maxResults: 10,
        timeout: 20000,
      };

      const output = await worker.execute(assignment, context);

      // Should deduplicate - same place appears once
      const placeIds = output.candidates.map((c) => c.metadata?.placeId);
      const uniqueIds = new Set(placeIds);
      expect(uniqueIds.size).toBe(placeIds.length);
    });

    it('sets correct worker properties', () => {
      const client = createMockClient();
      const worker = new PlacesWorker(client);

      expect(worker.id).toBe('places');
      expect(worker.provider).toBe('places');
    });

    it('candidates have origin=places', async () => {
      const client = createMockClient();
      const worker = new PlacesWorker(client);
      const context = createMockContext();

      const assignment = {
        workerId: 'places',
        queries: ['test query'],
        maxResults: 10,
        timeout: 20000,
      };

      const output = await worker.execute(assignment, context);

      for (const candidate of output.candidates) {
        expect(candidate.origin).toBe('places');
      }
    });

    it('candidates have confidence=verified', async () => {
      const client = createMockClient();
      const worker = new PlacesWorker(client);
      const context = createMockContext();

      const assignment = {
        workerId: 'places',
        queries: ['test query'],
        maxResults: 10,
        timeout: 20000,
      };

      const output = await worker.execute(assignment, context);

      for (const candidate of output.candidates) {
        expect(candidate.confidence).toBe('verified');
      }
    });
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('generateQueries', () => {
  it('generates destination-based queries', () => {
    const session = createMockSession();
    const intent = createMockEnrichedIntent();

    const queries = generateQueries(session, intent);

    expect(queries.length).toBeGreaterThan(0);
    expect(queries.some((q) => q.query.includes('Tokyo'))).toBe(true);
  });

  it('includes interest-based queries', () => {
    const session = createMockSession();
    const intent = createMockEnrichedIntent({ interests: ['food', 'culture'] });

    const queries = generateQueries(session, intent);

    expect(queries.some((q) => q.query.toLowerCase().includes('food'))).toBe(true);
  });

  it('includes place types for filtering', () => {
    const session = createMockSession();
    const intent = createMockEnrichedIntent({ interests: ['food'] });

    const queries = generateQueries(session, intent);

    const foodQuery = queries.find((q) => q.query.toLowerCase().includes('food'));
    expect(foodQuery?.type).toBe('restaurant');
  });

  it('limits queries to maximum of 4', () => {
    const session = createMockSession();
    const intent = createMockEnrichedIntent({
      interests: ['food', 'culture', 'history', 'art', 'music'],
    });

    const queries = generateQueries(session, intent);

    expect(queries.length).toBeLessThanOrEqual(4);
  });

  it('returns empty array when no destination', () => {
    const session = createMockSession({ destinations: [] });
    const intent = createMockEnrichedIntent({ destinations: [] });

    const queries = generateQueries(session, intent);

    expect(queries).toEqual([]);
  });

  it('includes tourist attractions query', () => {
    const session = createMockSession();
    const intent = createMockEnrichedIntent({ interests: [] });

    const queries = generateQueries(session, intent);

    expect(queries.some((q) => q.type === 'tourist_attraction')).toBe(true);
  });
});

describe('deduplicateCandidates', () => {
  it('removes duplicate candidates by ID', () => {
    const candidates: Candidate[] = [
      {
        candidateId: 'abc123',
        title: 'Place A',
        summary: 'Description A',
        type: 'place',
        origin: 'places',
        confidence: 'verified',
        sourceRefs: [],
        tags: [],
        score: 50,
      },
      {
        candidateId: 'abc123', // Duplicate ID
        title: 'Place A Copy',
        summary: 'Another description',
        type: 'place',
        origin: 'places',
        confidence: 'verified',
        sourceRefs: [],
        tags: [],
        score: 60,
      },
      {
        candidateId: 'def456',
        title: 'Place B',
        summary: 'Description B',
        type: 'place',
        origin: 'places',
        confidence: 'verified',
        sourceRefs: [],
        tags: [],
        score: 40,
      },
    ];

    const result = deduplicateCandidates(candidates);

    expect(result.length).toBe(2);
    expect(result[0].title).toBe('Place A');
  });

  it('preserves order of first occurrences', () => {
    const candidates: Candidate[] = [
      {
        candidateId: 'first',
        title: 'First',
        summary: 'Desc',
        type: 'place',
        origin: 'places',
        confidence: 'verified',
        sourceRefs: [],
        tags: [],
        score: 50,
      },
      {
        candidateId: 'second',
        title: 'Second',
        summary: 'Desc',
        type: 'place',
        origin: 'places',
        confidence: 'verified',
        sourceRefs: [],
        tags: [],
        score: 50,
      },
      {
        candidateId: 'first', // Duplicate
        title: 'First Again',
        summary: 'Desc',
        type: 'place',
        origin: 'places',
        confidence: 'verified',
        sourceRefs: [],
        tags: [],
        score: 50,
      },
    ];

    const result = deduplicateCandidates(candidates);

    expect(result.length).toBe(2);
    expect(result[0].candidateId).toBe('first');
    expect(result[1].candidateId).toBe('second');
  });

  it('handles empty array', () => {
    const result = deduplicateCandidates([]);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// Integration-style Tests
// ============================================================================

describe('End-to-end flow', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
    process.env.GOOGLE_PLACES_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.GOOGLE_PLACES_API_KEY;
  });

  it('maps real-world-like response into valid candidates', () => {
    const places: Place[] = [
      {
        placeId: 'ChIJ1',
        name: 'Tsukiji Outer Market',
        formattedAddress: '5 Chome Tsukiji, Chuo City, Tokyo 104-0045, Japan',
        geometry: { location: { lat: 35.6654, lng: 139.7707 } },
        rating: 4.4,
        userRatingsTotal: 15000,
        priceLevel: 2,
        types: ['tourist_attraction', 'point_of_interest'],
        businessStatus: 'OPERATIONAL',
      },
      {
        placeId: 'ChIJ2',
        name: 'Ichiran Shibuya',
        formattedAddress: '1-22-7 Jinnan, Shibuya City, Tokyo, Japan',
        geometry: { location: { lat: 35.6618, lng: 139.6992 } },
        rating: 4.3,
        userRatingsTotal: 5000,
        priceLevel: 1,
        types: ['restaurant', 'food'],
        businessStatus: 'OPERATIONAL',
      },
    ];

    const candidates = mapPlacesToCandidates(places, 'Tokyo');

    expect(candidates).toHaveLength(2);

    // Verify first candidate
    const tsukiji = candidates.find((c) => c.title === 'Tsukiji Outer Market');
    expect(tsukiji).toBeDefined();
    if (tsukiji) {
      expect(tsukiji.origin).toBe('places');
      expect(tsukiji.confidence).toBe('verified');
      expect(tsukiji.candidateId).toMatch(/^[a-f0-9]{16}$/);
      expect(tsukiji.sourceRefs.length).toBeGreaterThan(0);
      expect(tsukiji.type).toBe('place');
      expect(tsukiji.tags).toContain('popular');
    }

    // Verify second candidate
    const ichiran = candidates.find((c) => c.title === 'Ichiran Shibuya');
    expect(ichiran).toBeDefined();
    if (ichiran) {
      expect(ichiran.type).toBe('food');
      expect(ichiran.tags).toContain('budget-friendly');
    }

    // All candidates should have required fields
    for (const candidate of candidates) {
      expect(candidate.candidateId).toBeDefined();
      expect(candidate.title).toBeDefined();
      expect(candidate.summary).toBeDefined();
      expect(candidate.origin).toBe('places');
      expect(candidate.confidence).toBe('verified');
      expect(candidate.coordinates).toBeDefined();
      expect(candidate.coordinates?.lat).toBeDefined();
      expect(candidate.coordinates?.lng).toBeDefined();
      expect(Array.isArray(candidate.tags)).toBe(true);
      expect(Array.isArray(candidate.sourceRefs)).toBe(true);
      expect(candidate.sourceRefs.length).toBeGreaterThan(0);
    }
  });
});
