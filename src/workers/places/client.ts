/**
 * Google Places API Client
 *
 * Low-level client for the Google Places API (Text Search and Place Details).
 * Handles authentication, request formatting, rate limiting,
 * error handling, and API call tracking for cost calculation.
 *
 * @module workers/places/client
 * @see PRD FR5.2 - Google Places Worker
 * @see Task 10.1 - Google Places API Client
 */

import { requireApiKey } from '../../config/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for text search requests
 */
export interface SearchOptions {
  /** Location bias (lat,lng) */
  location?: { lat: number; lng: number };
  /** Radius in meters (max 50000) */
  radius?: number;
  /** Place type filter (e.g., 'restaurant', 'tourist_attraction') */
  type?: string;
  /** Language for results (default: 'en') */
  language?: string;
  /** Minimum price level (0-4) */
  minPrice?: number;
  /** Maximum price level (0-4) */
  maxPrice?: number;
  /** Request timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
}

/**
 * Basic place information from text search
 */
export interface Place {
  /** Google Place ID */
  placeId: string;
  /** Place name */
  name: string;
  /** Formatted address */
  formattedAddress: string;
  /** Geographic coordinates */
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  /** User rating (1.0 - 5.0) */
  rating?: number;
  /** Total number of user ratings */
  userRatingsTotal?: number;
  /** Price level (0-4) */
  priceLevel?: number;
  /** Place types */
  types?: string[];
  /** Business status */
  businessStatus?: string;
  /** Opening hours summary */
  openingHours?: {
    openNow?: boolean;
  };
}

/**
 * Detailed place information from Place Details API
 */
export interface PlaceDetails extends Place {
  /** Phone number */
  formattedPhoneNumber?: string;
  /** Website URL */
  website?: string;
  /** Full opening hours */
  openingHours?: {
    openNow?: boolean;
    weekdayText?: string[];
  };
  /** Editorial summary */
  editorialSummary?: {
    overview?: string;
  };
  /** Reviews */
  reviews?: Array<{
    authorName: string;
    rating: number;
    text: string;
    relativeTimeDescription: string;
  }>;
  /** Google Maps URL */
  url?: string;
}

/**
 * Google Places API error with additional context
 */
export class PlacesApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly status: string,
    public readonly isRetryable: boolean
  ) {
    super(message);
    this.name = 'PlacesApiError';
  }
}

// ============================================================================
// API Response Types (Internal)
// ============================================================================

/**
 * Raw text search response from Google Places API
 */
interface TextSearchResponse {
  status: string;
  results: Array<{
    place_id: string;
    name: string;
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
    rating?: number;
    user_ratings_total?: number;
    price_level?: number;
    types?: string[];
    business_status?: string;
    opening_hours?: {
      open_now?: boolean;
    };
  }>;
  next_page_token?: string;
  error_message?: string;
}

/**
 * Raw place details response from Google Places API
 */
interface PlaceDetailsResponse {
  status: string;
  result: {
    place_id: string;
    name: string;
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
    rating?: number;
    user_ratings_total?: number;
    price_level?: number;
    types?: string[];
    business_status?: string;
    formatted_phone_number?: string;
    website?: string;
    url?: string;
    opening_hours?: {
      open_now?: boolean;
      weekday_text?: string[];
    };
    editorial_summary?: {
      overview?: string;
    };
    reviews?: Array<{
      author_name: string;
      rating: number;
      text: string;
      relative_time_description: string;
    }>;
  };
  error_message?: string;
}

// ============================================================================
// Client Implementation
// ============================================================================

/**
 * Default configuration values
 */
const DEFAULTS = {
  language: 'en',
  radius: 50000, // 50km
  timeoutMs: 10000,
} as const;

/**
 * Fields to request from Place Details API
 * Using Field Masks to minimize quota usage
 */
const DETAILS_FIELDS = [
  'place_id',
  'name',
  'formatted_address',
  'geometry',
  'rating',
  'user_ratings_total',
  'price_level',
  'types',
  'business_status',
  'formatted_phone_number',
  'website',
  'url',
  'opening_hours',
  'editorial_summary',
  'reviews',
].join(',');

/**
 * PlacesClient provides access to the Google Places API.
 *
 * Features:
 * - Text Search for finding places by query
 * - Place Details for detailed information
 * - API call counting for cost tracking
 * - Error handling with retryable flags
 * - Request timeout via AbortController
 *
 * @example
 * ```typescript
 * const client = new PlacesClient();
 *
 * const places = await client.textSearch('restaurants in Tokyo', {
 *   location: { lat: 35.6762, lng: 139.6503 },
 *   type: 'restaurant',
 * });
 *
 * const details = await client.getPlaceDetails(places[0].placeId);
 * console.log(`Calls made: ${client.getCallCount()}`);
 * ```
 */
export class PlacesClient {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/place';
  private callCount = 0;

  /**
   * Create a new Places client.
   *
   * @throws Error if GOOGLE_PLACES_API_KEY is not set
   */
  constructor() {
    this.apiKey = requireApiKey('googlePlaces');
  }

  /**
   * Search for places using text query.
   *
   * Uses the Text Search endpoint which returns up to 20 results per page.
   *
   * @param query - Search query (e.g., "restaurants in Tokyo")
   * @param options - Search options
   * @returns Array of places matching the query
   * @throws PlacesApiError on API errors
   *
   * @example
   * ```typescript
   * const places = await client.textSearch('sushi restaurants in Shibuya', {
   *   type: 'restaurant',
   *   minPrice: 2,
   *   maxPrice: 3,
   * });
   * ```
   */
  async textSearch(query: string, options: SearchOptions = {}): Promise<Place[]> {
    const timeout = options.timeoutMs ?? DEFAULTS.timeoutMs;

    // Build URL with query parameters
    const params = new URLSearchParams({
      query,
      key: this.apiKey,
      language: options.language ?? DEFAULTS.language,
    });

    if (options.location) {
      params.set('location', `${options.location.lat},${options.location.lng}`);
    }

    if (options.radius !== undefined) {
      params.set('radius', String(options.radius));
    }

    if (options.type) {
      params.set('type', options.type);
    }

    if (options.minPrice !== undefined) {
      params.set('minprice', String(options.minPrice));
    }

    if (options.maxPrice !== undefined) {
      params.set('maxprice', String(options.maxPrice));
    }

    const url = `${this.baseUrl}/textsearch/json?${params.toString()}`;
    const response = await this.fetchWithTimeout(url, {}, timeout);

    if (!response.ok) {
      await this.handleHttpError(response);
    }

    const data = (await response.json()) as TextSearchResponse;
    this.callCount++;

    // Check for API-level errors
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      this.handleApiError(data.status, data.error_message);
    }

    return this.parseSearchResults(data);
  }

  /**
   * Get detailed information about a place.
   *
   * Uses the Place Details endpoint with field masks to optimize costs.
   *
   * @param placeId - Google Place ID
   * @param timeoutMs - Request timeout in milliseconds
   * @returns Detailed place information
   * @throws PlacesApiError on API errors
   *
   * @example
   * ```typescript
   * const details = await client.getPlaceDetails('ChIJN1t_tDeuEmsRUsoyG83frY4');
   * console.log(details.website);
   * console.log(details.reviews?.length);
   * ```
   */
  async getPlaceDetails(placeId: string, timeoutMs: number = DEFAULTS.timeoutMs): Promise<PlaceDetails> {
    const params = new URLSearchParams({
      place_id: placeId,
      key: this.apiKey,
      fields: DETAILS_FIELDS,
      language: DEFAULTS.language,
    });

    const url = `${this.baseUrl}/details/json?${params.toString()}`;
    const response = await this.fetchWithTimeout(url, {}, timeoutMs);

    if (!response.ok) {
      await this.handleHttpError(response);
    }

    const data = (await response.json()) as PlaceDetailsResponse;
    this.callCount++;

    // Check for API-level errors
    if (data.status !== 'OK') {
      this.handleApiError(data.status, data.error_message);
    }

    return this.parseDetailsResult(data.result);
  }

  /**
   * Get the total number of API calls made by this client.
   *
   * Used for cost tracking - each call has a fixed cost.
   *
   * @returns Number of API calls made
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Reset the API call counter.
   *
   * Called when starting a new run.
   */
  resetCallCount(): void {
    this.callCount = 0;
  }

  /**
   * Execute fetch with timeout using AbortController.
   *
   * @param url - Request URL
   * @param options - Fetch options
   * @param timeoutMs - Timeout in milliseconds
   * @returns Fetch response
   * @throws Error on timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PlacesApiError(
          `Request timed out after ${timeoutMs}ms`,
          408,
          'TIMEOUT',
          true // Timeouts are retryable
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Handle HTTP-level errors.
   *
   * @param response - Fetch response with error
   * @throws PlacesApiError with appropriate message and retryable flag
   */
  private async handleHttpError(response: Response): Promise<never> {
    const text = await response.text().catch(() => 'Unknown error');

    const isRetryable = response.status === 429 || response.status >= 500;

    let message: string;
    if (response.status === 429) {
      message = `Quota exceeded: ${text}`;
    } else if (response.status >= 500) {
      message = `Server error (${response.status}): ${text}`;
    } else if (response.status === 401 || response.status === 403) {
      message = `Authentication failed: Invalid or unauthorized API key`;
    } else {
      message = `API error (${response.status}): ${text}`;
    }

    throw new PlacesApiError(message, response.status, 'HTTP_ERROR', isRetryable);
  }

  /**
   * Handle Google Places API status errors.
   *
   * @param status - API status code
   * @param errorMessage - Optional error message from API
   * @throws PlacesApiError with appropriate message and retryable flag
   */
  private handleApiError(status: string, errorMessage?: string): never {
    const message = errorMessage ?? `API returned status: ${status}`;

    // Determine if error is retryable based on status
    const isRetryable = status === 'OVER_QUERY_LIMIT' || status === 'UNKNOWN_ERROR';

    // Determine HTTP-like status code for error classification
    let statusCode: number;
    switch (status) {
      case 'OVER_QUERY_LIMIT':
        statusCode = 429;
        break;
      case 'REQUEST_DENIED':
        statusCode = 403;
        break;
      case 'INVALID_REQUEST':
        statusCode = 400;
        break;
      case 'NOT_FOUND':
        statusCode = 404;
        break;
      default:
        statusCode = 500;
    }

    throw new PlacesApiError(message, statusCode, status, isRetryable);
  }

  /**
   * Parse text search response into Place array.
   *
   * Filters out results with missing geometry/location data to prevent runtime errors.
   *
   * @param data - Raw API response
   * @returns Array of Place objects with valid coordinates
   */
  private parseSearchResults(data: TextSearchResponse): Place[] {
    return data.results
      .filter(
        (result) =>
          result.geometry?.location?.lat != null &&
          result.geometry?.location?.lng != null
      )
      .map((result) => ({
        placeId: result.place_id,
        name: result.name,
        formattedAddress: result.formatted_address,
        geometry: {
          location: {
            lat: result.geometry.location.lat,
            lng: result.geometry.location.lng,
          },
        },
        rating: result.rating,
        userRatingsTotal: result.user_ratings_total,
        priceLevel: result.price_level,
        types: result.types,
        businessStatus: result.business_status,
        openingHours: result.opening_hours
          ? { openNow: result.opening_hours.open_now }
          : undefined,
      }));
  }

  /**
   * Parse place details response into PlaceDetails object.
   *
   * @param result - Raw API result
   * @returns PlaceDetails object
   */
  private parseDetailsResult(result: PlaceDetailsResponse['result']): PlaceDetails {
    return {
      placeId: result.place_id,
      name: result.name,
      formattedAddress: result.formatted_address,
      geometry: {
        location: {
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
        },
      },
      rating: result.rating,
      userRatingsTotal: result.user_ratings_total,
      priceLevel: result.price_level,
      types: result.types,
      businessStatus: result.business_status,
      formattedPhoneNumber: result.formatted_phone_number,
      website: result.website,
      url: result.url,
      openingHours: result.opening_hours
        ? {
            openNow: result.opening_hours.open_now,
            weekdayText: result.opening_hours.weekday_text,
          }
        : undefined,
      editorialSummary: result.editorial_summary,
      reviews: result.reviews?.map((review) => ({
        authorName: review.author_name,
        rating: review.rating,
        text: review.text,
        relativeTimeDescription: review.relative_time_description,
      })),
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an error is a Places API error
 */
export function isPlacesApiError(error: unknown): error is PlacesApiError {
  return error instanceof PlacesApiError;
}

/**
 * Check if an error is retryable
 *
 * @param error - Error to check
 * @returns true if the error is likely transient and worth retrying
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof PlacesApiError) {
    return error.isRetryable;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('rate limit') ||
      message.includes('quota') ||
      message.includes('429') ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('503') ||
      message.includes('500') ||
      message.includes('502') ||
      message.includes('504')
    );
  }

  return false;
}
