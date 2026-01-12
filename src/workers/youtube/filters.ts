/**
 * YouTube Video Quality Filters
 *
 * Filters videos based on quality signals to ensure only
 * high-quality, relevant content is processed for candidate extraction.
 *
 * @module workers/youtube/filters
 * @see PRD Section 15.6 - Quality Signals
 * @see Task 11.3 - Quality Filtering
 */

import type { VideoDetails } from './client.js';
import { parseDuration } from './client.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Type-safe filter reason enumeration
 */
export type FilterReason = 'lowViews' | 'tooOld' | 'tooShort' | 'tooLong' | 'noCaptions';

/**
 * Configuration for video quality filters
 */
export interface FilterConfig {
  /** Minimum view count (default: 10000) */
  minViewCount: number;
  /** Maximum age in days (default: 730, i.e., 2 years) */
  maxAgeDays: number;
  /** Minimum duration in seconds (default: 240, i.e., 4 minutes) */
  minDurationSeconds: number;
  /** Maximum duration in seconds (default: 1200, i.e., 20 minutes) */
  maxDurationSeconds: number;
  /** Require captions (default: true) */
  requireCaptions: boolean;
  /** Minimum channel subscriber count - not available via API without OAuth */
  minSubscriberCount?: number;
}

/**
 * Result of filtering with statistics
 */
export interface FilterResult {
  /** Videos that passed all filters */
  passed: VideoDetails[];
  /** Videos that were filtered out */
  filtered: VideoDetails[];
  /** Breakdown of filter reasons */
  stats: {
    total: number;
    passed: number;
    lowViews: number;
    tooOld: number;
    tooShort: number;
    tooLong: number;
    noCaptions: number;
  };
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default filter configuration from PRD Section 15.6
 */
export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  minViewCount: 10000,
  maxAgeDays: 730, // 2 years
  minDurationSeconds: 240, // 4 minutes
  maxDurationSeconds: 1200, // 20 minutes
  requireCaptions: true,
};

// ============================================================================
// Main Filter Function
// ============================================================================

/**
 * Filter videos based on quality signals.
 *
 * Applies the following filters from PRD Section 15.6:
 * - View count > 10,000
 * - Publish date < 2 years
 * - Duration 4-20 minutes
 * - Has captions: true
 *
 * Note: Channel subscriber count filter is not applied because
 * it requires OAuth authentication to access channel statistics.
 *
 * @param videos - Array of video details to filter
 * @param config - Optional filter configuration (uses defaults if not provided)
 * @returns Filtered array of videos
 *
 * @example
 * ```typescript
 * const filtered = filterVideos(videos);
 * console.log(`${filtered.length} videos passed quality filters`);
 * ```
 */
export function filterVideos(
  videos: VideoDetails[],
  config: Partial<FilterConfig> = {}
): VideoDetails[] {
  const fullConfig: FilterConfig = { ...DEFAULT_FILTER_CONFIG, ...config };
  return videos.filter((video) => passesAllFilters(video, fullConfig));
}

/**
 * Filter videos with detailed statistics.
 *
 * Returns both passed videos and a breakdown of why others were filtered.
 *
 * @param videos - Array of video details to filter
 * @param config - Optional filter configuration
 * @returns Filter result with passed videos and statistics
 */
export function filterVideosWithStats(
  videos: VideoDetails[],
  config: Partial<FilterConfig> = {}
): FilterResult {
  const fullConfig: FilterConfig = { ...DEFAULT_FILTER_CONFIG, ...config };
  const passed: VideoDetails[] = [];
  const filtered: VideoDetails[] = [];
  const stats = {
    total: videos.length,
    passed: 0,
    lowViews: 0,
    tooOld: 0,
    tooShort: 0,
    tooLong: 0,
    noCaptions: 0,
  };

  for (const video of videos) {
    const reasons = getFilterReasons(video, fullConfig);

    if (reasons.length === 0) {
      passed.push(video);
      stats.passed++;
    } else {
      filtered.push(video);
      // Count each reason
      for (const reason of reasons) {
        if (reason === 'lowViews') stats.lowViews++;
        if (reason === 'tooOld') stats.tooOld++;
        if (reason === 'tooShort') stats.tooShort++;
        if (reason === 'tooLong') stats.tooLong++;
        if (reason === 'noCaptions') stats.noCaptions++;
      }
    }
  }

  return { passed, filtered, stats };
}

// ============================================================================
// Individual Filter Functions
// ============================================================================

/**
 * Check if video passes view count filter.
 *
 * @param video - Video to check
 * @param minViewCount - Minimum view count threshold
 * @returns true if view count is above threshold
 */
export function passesViewCountFilter(
  video: VideoDetails,
  minViewCount: number = DEFAULT_FILTER_CONFIG.minViewCount
): boolean {
  return video.viewCount >= minViewCount;
}

/**
 * Check if video passes age filter.
 *
 * @param video - Video to check
 * @param maxAgeDays - Maximum age in days
 * @returns true if video is within age limit
 */
export function passesAgeFilter(
  video: VideoDetails,
  maxAgeDays: number = DEFAULT_FILTER_CONFIG.maxAgeDays
): boolean {
  const publishedDate = new Date(video.publishedAt);
  const now = new Date();
  const ageMs = now.getTime() - publishedDate.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays <= maxAgeDays;
}

/**
 * Check if video passes duration filter.
 *
 * @param video - Video to check
 * @param minSeconds - Minimum duration in seconds
 * @param maxSeconds - Maximum duration in seconds
 * @returns true if duration is within range
 */
export function passesDurationFilter(
  video: VideoDetails,
  minSeconds: number = DEFAULT_FILTER_CONFIG.minDurationSeconds,
  maxSeconds: number = DEFAULT_FILTER_CONFIG.maxDurationSeconds
): boolean {
  const durationSeconds = parseDuration(video.duration);
  return durationSeconds >= minSeconds && durationSeconds <= maxSeconds;
}

/**
 * Check if video has captions available.
 *
 * @param video - Video to check
 * @returns true if video has captions
 */
export function passesCaptionFilter(video: VideoDetails): boolean {
  return video.hasCaptions;
}

/**
 * Check if video passes all quality filters.
 *
 * @param video - Video to check
 * @param config - Filter configuration
 * @returns true if video passes all filters
 */
export function passesAllFilters(
  video: VideoDetails,
  config: FilterConfig = DEFAULT_FILTER_CONFIG
): boolean {
  // Check view count
  if (!passesViewCountFilter(video, config.minViewCount)) {
    return false;
  }

  // Check age
  if (!passesAgeFilter(video, config.maxAgeDays)) {
    return false;
  }

  // Check duration
  if (!passesDurationFilter(video, config.minDurationSeconds, config.maxDurationSeconds)) {
    return false;
  }

  // Check captions
  if (config.requireCaptions && !passesCaptionFilter(video)) {
    return false;
  }

  return true;
}

/**
 * Get reasons why a video was filtered.
 *
 * @param video - Video to check
 * @param config - Filter configuration
 * @returns Array of type-safe filter reasons
 */
export function getFilterReasons(
  video: VideoDetails,
  config: FilterConfig = DEFAULT_FILTER_CONFIG
): FilterReason[] {
  const reasons: FilterReason[] = [];

  if (!passesViewCountFilter(video, config.minViewCount)) {
    reasons.push('lowViews');
  }

  if (!passesAgeFilter(video, config.maxAgeDays)) {
    reasons.push('tooOld');
  }

  const durationSeconds = parseDuration(video.duration);
  if (durationSeconds < config.minDurationSeconds) {
    reasons.push('tooShort');
  }
  if (durationSeconds > config.maxDurationSeconds) {
    reasons.push('tooLong');
  }

  if (config.requireCaptions && !passesCaptionFilter(video)) {
    reasons.push('noCaptions');
  }

  return reasons;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sort videos by quality score (engagement and recency).
 *
 * @param videos - Videos to sort
 * @returns Sorted videos (best first)
 */
export function sortByQuality(videos: VideoDetails[]): VideoDetails[] {
  return [...videos].sort((a, b) => {
    // Calculate a simple quality score based on engagement and recency
    const scoreA = calculateQualityScore(a);
    const scoreB = calculateQualityScore(b);
    return scoreB - scoreA; // Descending order
  });
}

/**
 * Calculate a quality score for ranking videos.
 *
 * Considers:
 * - View count (log scale)
 * - Like/view ratio
 * - Recency
 *
 * @param video - Video to score
 * @returns Quality score (higher is better)
 */
export function calculateQualityScore(video: VideoDetails): number {
  // Log scale for views (prevents very popular videos from dominating)
  const viewScore = Math.log10(Math.max(video.viewCount, 1)) * 10;

  // Like ratio (likes / views)
  const likeRatio = video.viewCount > 0 ? video.likeCount / video.viewCount : 0;
  const likeScore = likeRatio * 100;

  // Recency score (newer is better, decays over 2 years)
  const publishedDate = new Date(video.publishedAt);
  const now = new Date();
  const ageMs = now.getTime() - publishedDate.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 100 - (ageDays / 730) * 100);

  // Weighted combination
  return viewScore * 0.4 + likeScore * 0.3 + recencyScore * 0.3;
}

/**
 * Get videos that are likely travel content based on title/description.
 *
 * @param videos - Videos to filter
 * @param destination - Destination to look for
 * @returns Videos that mention the destination
 */
export function filterByRelevance(
  videos: VideoDetails[],
  destination: string
): VideoDetails[] {
  const destLower = destination.toLowerCase();
  const keywords = destLower.split(/\s+/);

  return videos.filter((video) => {
    const combined = `${video.title} ${video.description}`.toLowerCase();
    // At least one keyword should appear
    return keywords.some((kw) => combined.includes(kw));
  });
}
