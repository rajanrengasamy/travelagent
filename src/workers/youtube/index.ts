/**
 * YouTube Social Signals Worker
 *
 * Searches YouTube for travel videos, extracts transcripts,
 * and uses LLM to mine candidate recommendations.
 * Produces Candidates with origin='youtube' and confidence='provisional'.
 *
 * Architecture:
 * - client.ts: YouTube Data API v3 client
 * - transcript.ts: Transcript fetching via youtube-transcript npm
 * - filters.ts: Quality filtering (views, age, duration, captions)
 * - prompts.ts: LLM extraction prompt templates
 * - extractor.ts: LLM-based candidate extraction from transcripts
 * - worker.ts: Main Worker implementation
 *
 * @module workers/youtube
 * @see PRD Section 15 - YouTube Social Signals
 */

// ============================================================================
// Main Worker Class
// ============================================================================

export { YouTubeWorker, generateQueries } from './worker.js';

// ============================================================================
// API Client
// ============================================================================

export {
  YouTubeClient,
  YouTubeApiError,
  isYouTubeApiError,
  isQuotaExceededError,
  isRetryableError,
  parseDuration,
  type VideoSearchResult,
  type VideoDetails,
  type SearchOptions,
  type QuotaUsage,
} from './client.js';

// ============================================================================
// Transcript Fetching
// ============================================================================

export {
  fetchTranscript,
  fetchTranscriptWithDetails,
  combineSegments,
  cleanTranscriptText,
  findSegmentAtTimestamp,
  extractTextAroundTimestamp,
  TranscriptError,
  isTranscriptError,
  isRetryableTranscriptError,
  type TranscriptSegment,
  type TranscriptResult,
} from './transcript.js';

// ============================================================================
// Quality Filtering
// ============================================================================

export {
  filterVideos,
  filterVideosWithStats,
  passesViewCountFilter,
  passesAgeFilter,
  passesDurationFilter,
  passesCaptionFilter,
  passesAllFilters,
  getFilterReasons,
  sortByQuality,
  calculateQualityScore,
  filterByRelevance,
  DEFAULT_FILTER_CONFIG,
  type FilterConfig,
  type FilterResult,
} from './filters.js';

// ============================================================================
// Extraction Prompts
// ============================================================================

export {
  buildExtractionPrompt,
  buildBatchExtractionPrompt,
  YOUTUBE_EXTRACTION_SYSTEM_PROMPT,
  YOUTUBE_EXTRACTION_PROMPT_VERSION,
  type ExtractedRecommendation,
  type BatchExtractionResponse,
} from './prompts.js';

// ============================================================================
// LLM Extractor
// ============================================================================

export {
  extractCandidatesFromTranscript,
  extractCandidatesFromVideos,
  parseExtractionResponse,
  recommendationToCandidate,
  type YouTubeCandidate,
  type ExtractionOptions,
  type ExtractionResult,
} from './extractor.js';
