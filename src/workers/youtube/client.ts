/**
 * YouTube Data API Client
 *
 * Low-level client for the YouTube Data API v3.
 * Handles search queries, video details retrieval, quota tracking,
 * and error handling for quota exceeded scenarios.
 *
 * @module workers/youtube/client
 * @see PRD Section 15 - YouTube Social Signals
 * @see Task 11.1 - YouTube Data API Client
 */

import { requireApiKey } from '../../config/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for video search
 */
export interface SearchOptions {
  /** Maximum results to return (1-50, default 10) */
  maxResults?: number;
  /** Order by relevance (default) or date */
  order?: 'relevance' | 'date' | 'viewCount';
  /** Filter by video duration */
  videoDuration?: 'short' | 'medium' | 'long' | 'any';
  /** Filter by caption availability */
  videoCaption?: 'closedCaption' | 'none' | 'any';
  /** Request timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
  /** Only videos published after this date (ISO8601) */
  publishedAfter?: string;
}

/**
 * Video search result from search.list endpoint
 */
export interface VideoSearchResult {
  /** Video ID */
  videoId: string;
  /** Video title */
  title: string;
  /** Video description (snippet) */
  description: string;
  /** Channel ID */
  channelId: string;
  /** Channel title */
  channelTitle: string;
  /** Thumbnail URL */
  thumbnailUrl: string;
  /** When the video was published */
  publishedAt: string;
}

/**
 * Detailed video information from videos.list endpoint
 */
export interface VideoDetails {
  /** Video ID */
  videoId: string;
  /** Video title */
  title: string;
  /** Full video description */
  description: string;
  /** Channel ID */
  channelId: string;
  /** Channel title */
  channelTitle: string;
  /** When the video was published */
  publishedAt: string;
  /** Video duration in ISO8601 format (e.g., "PT15M33S") */
  duration: string;
  /** View count */
  viewCount: number;
  /** Like count */
  likeCount: number;
  /** Comment count */
  commentCount: number;
  /** Whether captions are available */
  hasCaptions: boolean;
  /** Video tags */
  tags: string[];
  /** Thumbnail URL */
  thumbnailUrl: string;
}

/**
 * Quota usage tracking
 */
export interface QuotaUsage {
  /** Total units consumed */
  totalUnits: number;
  /** Search calls made (100 units each) */
  searchCalls: number;
  /** Video detail calls made (1 unit each) */
  detailCalls: number;
}

/**
 * YouTube API error with additional context
 */
export class YouTubeApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly isRetryable: boolean,
    public readonly isQuotaExceeded: boolean = false
  ) {
    super(message);
    this.name = 'YouTubeApiError';
  }
}

// ============================================================================
// API Response Types (Internal)
// ============================================================================

interface YouTubeSearchResponse {
  kind: string;
  etag: string;
  nextPageToken?: string;
  prevPageToken?: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  items: Array<{
    kind: string;
    etag: string;
    id: {
      kind: string;
      videoId?: string;
    };
    snippet: {
      publishedAt: string;
      channelId: string;
      title: string;
      description: string;
      thumbnails: {
        default?: { url: string };
        medium?: { url: string };
        high?: { url: string };
      };
      channelTitle: string;
      liveBroadcastContent: string;
    };
  }>;
}

interface YouTubeVideosResponse {
  kind: string;
  etag: string;
  items: Array<{
    kind: string;
    etag: string;
    id: string;
    snippet: {
      publishedAt: string;
      channelId: string;
      title: string;
      description: string;
      thumbnails: {
        default?: { url: string };
        medium?: { url: string };
        high?: { url: string };
      };
      channelTitle: string;
      tags?: string[];
      categoryId: string;
    };
    contentDetails: {
      duration: string;
      caption: string;
    };
    statistics: {
      viewCount: string;
      likeCount: string;
      commentCount: string;
    };
  }>;
}

// ============================================================================
// Constants
// ============================================================================

/** Default configuration */
const DEFAULTS = {
  maxResults: 10,
  order: 'relevance' as const,
  videoDuration: 'any' as const,
  videoCaption: 'any' as const,
  timeoutMs: 10000,
} as const;

/** Quota costs per operation */
const QUOTA_COSTS = {
  search: 100,
  videos: 1,
} as const;

// ============================================================================
// Client Implementation
// ============================================================================

/**
 * YouTubeClient provides access to the YouTube Data API v3.
 *
 * Features:
 * - Video search by query with filtering
 * - Video details retrieval (metadata, statistics)
 * - Quota usage tracking
 * - Quota exceeded error detection
 *
 * @example
 * ```typescript
 * const client = new YouTubeClient();
 *
 * // Search for videos
 * const results = await client.search('Tokyo food guide', { maxResults: 5 });
 *
 * // Get video details
 * const details = await client.getVideoDetails(['abc123', 'def456']);
 *
 * // Check quota usage
 * console.log(`Quota used: ${client.getQuotaUsage().totalUnits} units`);
 * ```
 */
export class YouTubeClient {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://www.googleapis.com/youtube/v3';
  private quotaUsage: QuotaUsage = {
    totalUnits: 0,
    searchCalls: 0,
    detailCalls: 0,
  };

  /**
   * Create a new YouTube client.
   *
   * @throws Error if YOUTUBE_API_KEY is not set
   */
  constructor() {
    this.apiKey = requireApiKey('youtube');
  }

  /**
   * Search for videos matching a query.
   *
   * Costs 100 quota units per call.
   *
   * @param query - Search query string
   * @param options - Search options
   * @returns Array of video search results
   * @throws YouTubeApiError on API errors
   */
  async search(query: string, options: SearchOptions = {}): Promise<VideoSearchResult[]> {
    const maxResults = options.maxResults ?? DEFAULTS.maxResults;
    const timeout = options.timeoutMs ?? DEFAULTS.timeoutMs;

    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: String(Math.min(maxResults, 50)),
      order: options.order ?? DEFAULTS.order,
      videoDuration: options.videoDuration ?? DEFAULTS.videoDuration,
      key: this.apiKey,
    });

    // Add optional filters
    if (options.videoCaption && options.videoCaption !== 'any') {
      params.set('videoCaption', options.videoCaption);
    }

    if (options.publishedAfter) {
      params.set('publishedAfter', options.publishedAfter);
    }

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/search?${params.toString()}`,
      { method: 'GET' },
      timeout
    );

    if (!response.ok) {
      await this.handleError(response);
    }

    // Track quota usage
    this.quotaUsage.searchCalls++;
    this.quotaUsage.totalUnits += QUOTA_COSTS.search;

    const data = (await response.json()) as YouTubeSearchResponse;
    return this.parseSearchResponse(data);
  }

  /**
   * Get detailed information for multiple videos.
   *
   * Costs 1 quota unit per call (regardless of video count, up to 50).
   *
   * @param videoIds - Array of video IDs (max 50)
   * @returns Array of video details
   * @throws YouTubeApiError on API errors
   */
  async getVideoDetails(
    videoIds: string[],
    timeoutMs: number = DEFAULTS.timeoutMs
  ): Promise<VideoDetails[]> {
    if (videoIds.length === 0) {
      return [];
    }

    // API allows max 50 IDs per call
    const idsToFetch = videoIds.slice(0, 50);

    const params = new URLSearchParams({
      part: 'snippet,contentDetails,statistics',
      id: idsToFetch.join(','),
      key: this.apiKey,
    });

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/videos?${params.toString()}`,
      { method: 'GET' },
      timeoutMs
    );

    if (!response.ok) {
      await this.handleError(response);
    }

    // Track quota usage
    this.quotaUsage.detailCalls++;
    this.quotaUsage.totalUnits += QUOTA_COSTS.videos;

    const data = (await response.json()) as YouTubeVideosResponse;
    return this.parseVideosResponse(data);
  }

  /**
   * Get current quota usage.
   *
   * @returns Quota usage statistics
   */
  getQuotaUsage(): QuotaUsage {
    return { ...this.quotaUsage };
  }

  /**
   * Reset quota usage tracking.
   * Called at the start of a new run.
   */
  resetQuotaUsage(): void {
    this.quotaUsage = {
      totalUnits: 0,
      searchCalls: 0,
      detailCalls: 0,
    };
  }

  /**
   * Execute fetch with timeout using AbortController.
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
        throw new YouTubeApiError(
          `Request timed out after ${timeoutMs}ms`,
          408,
          true,
          false
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Handle API error responses.
   *
   * Detects quota exceeded (403) errors and marks them appropriately.
   */
  private async handleError(response: Response): Promise<never> {
    const text = await response.text().catch(() => 'Unknown error');

    let errorMessage = text;
    let isQuotaExceeded = false;

    // Parse error message from response if JSON
    try {
      const parsed = JSON.parse(text) as {
        error?: {
          message?: string;
          errors?: Array<{ reason?: string }>;
        };
      };
      if (parsed.error?.message) {
        errorMessage = parsed.error.message;
      }
      // Check for quota exceeded reason
      const reasons = parsed.error?.errors?.map((e) => e.reason) ?? [];
      isQuotaExceeded = reasons.some(
        (r) =>
          r === 'quotaExceeded' ||
          r === 'dailyLimitExceeded' ||
          r === 'rateLimitExceeded'
      );
    } catch {
      // Keep raw text as error message
    }

    // Also check status code and message for quota issues
    if (response.status === 403) {
      const lowerMessage = errorMessage.toLowerCase();
      if (
        lowerMessage.includes('quota') ||
        lowerMessage.includes('limit exceeded') ||
        lowerMessage.includes('daily limit')
      ) {
        isQuotaExceeded = true;
      }
    }

    // Determine if error is retryable (only transient errors, not quota)
    const isRetryable =
      !isQuotaExceeded &&
      (response.status === 429 || response.status >= 500);

    // Create descriptive error message
    let message: string;
    if (isQuotaExceeded) {
      message = `YouTube API quota exceeded: ${errorMessage}`;
    } else if (response.status === 429) {
      message = `Rate limit exceeded: ${errorMessage}`;
    } else if (response.status >= 500) {
      message = `Server error (${response.status}): ${errorMessage}`;
    } else if (response.status === 401) {
      message = `Authentication failed: Invalid API key`;
    } else if (response.status === 403) {
      message = `Access forbidden: ${errorMessage}`;
    } else {
      message = `API error (${response.status}): ${errorMessage}`;
    }

    throw new YouTubeApiError(message, response.status, isRetryable, isQuotaExceeded);
  }

  /**
   * Parse search response into VideoSearchResult objects.
   */
  private parseSearchResponse(data: YouTubeSearchResponse): VideoSearchResult[] {
    return data.items
      .filter((item) => item.id.videoId) // Only include video results
      .map((item) => ({
        videoId: item.id.videoId!,
        title: item.snippet.title,
        description: item.snippet.description,
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle,
        thumbnailUrl:
          item.snippet.thumbnails.high?.url ??
          item.snippet.thumbnails.medium?.url ??
          item.snippet.thumbnails.default?.url ??
          '',
        publishedAt: item.snippet.publishedAt,
      }));
  }

  /**
   * Parse videos response into VideoDetails objects.
   */
  private parseVideosResponse(data: YouTubeVideosResponse): VideoDetails[] {
    return data.items.map((item) => ({
      videoId: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      channelId: item.snippet.channelId,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      duration: item.contentDetails.duration,
      viewCount: parseInt(item.statistics.viewCount ?? '0', 10),
      likeCount: parseInt(item.statistics.likeCount ?? '0', 10),
      commentCount: parseInt(item.statistics.commentCount ?? '0', 10),
      hasCaptions: item.contentDetails.caption === 'true',
      tags: item.snippet.tags ?? [],
      thumbnailUrl:
        item.snippet.thumbnails.high?.url ??
        item.snippet.thumbnails.medium?.url ??
        item.snippet.thumbnails.default?.url ??
        '',
    }));
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an error is a YouTube API error
 */
export function isYouTubeApiError(error: unknown): error is YouTubeApiError {
  return error instanceof YouTubeApiError;
}

/**
 * Check if an error indicates quota exceeded
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (error instanceof YouTubeApiError) {
    return error.isQuotaExceeded;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('quota') ||
      message.includes('daily limit') ||
      message.includes('limit exceeded')
    );
  }
  return false;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof YouTubeApiError) {
    return error.isRetryable;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
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

/**
 * Parse ISO8601 duration to seconds.
 *
 * @example
 * parseDuration('PT15M33S') // 933
 * parseDuration('PT1H30M') // 5400
 *
 * @param duration - ISO8601 duration string
 * @returns Duration in seconds
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return 0;
  }

  const hours = parseInt(match[1] ?? '0', 10);
  const minutes = parseInt(match[2] ?? '0', 10);
  const seconds = parseInt(match[3] ?? '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}
