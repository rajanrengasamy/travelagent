/**
 * Per-Worker Normalizers
 *
 * Specialized normalization functions for each worker type.
 * Ensures candidates have consistent structure with proper defaults
 * based on the worker's data characteristics.
 *
 * @module stages/normalize/normalizers
 * @see PRD Section 14 - Normalization Stage
 * @see Task 12.2 - Per-Worker Normalization
 */

import type { WorkerOutput } from '../../schemas/worker.js';
import type { Candidate, CandidateConfidence, CandidateOrigin } from '../../schemas/candidate.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Normalizer function signature for worker outputs
 */
export type WorkerNormalizer = (output: WorkerOutput) => Candidate[];

/**
 * Known worker IDs that have specialized normalizers
 */
export type NormalizableWorkerId = 'perplexity' | 'places' | 'youtube';

// ============================================================================
// Perplexity Normalizer
// ============================================================================

/**
 * Normalize Perplexity worker output.
 *
 * Perplexity produces web knowledge candidates from multiple sources.
 * - Origin: 'web' (web knowledge aggregation)
 * - Confidence: Based on source count - 'provisional' or 'needs_verification'
 *
 * @param output - Worker output from Perplexity
 * @returns Normalized candidates with web origin
 *
 * @example
 * ```typescript
 * const candidates = normalizePerplexityOutput(perplexityOutput);
 * // All candidates have origin: 'web'
 * ```
 */
export function normalizePerplexityOutput(output: WorkerOutput): Candidate[] {
  // Skip if worker failed or was skipped
  if (output.status === 'error' || output.status === 'skipped') {
    return [];
  }

  return output.candidates.map((candidate) => ({
    ...candidate,
    // Ensure web origin
    origin: 'web' as CandidateOrigin,
    // Confidence based on source availability
    confidence: determinePerplexityConfidence(candidate),
    // Default score if not set
    score: candidate.score ?? 50,
    // Ensure arrays are initialized
    tags: candidate.tags ?? [],
    sourceRefs: candidate.sourceRefs ?? [],
  }));
}

/**
 * Determine confidence for Perplexity candidates.
 *
 * Based on source reference count:
 * - 0 sources: needs_verification
 * - 1 source: provisional
 * - 2+ sources: verified (multiple corroborating sources)
 */
function determinePerplexityConfidence(candidate: Candidate): CandidateConfidence {
  const sourceCount = candidate.sourceRefs?.length ?? 0;

  if (sourceCount === 0) {
    return 'needs_verification';
  }
  if (sourceCount === 1) {
    return 'provisional';
  }
  // Multiple sources provide higher confidence
  return 'verified';
}

// ============================================================================
// Google Places Normalizer
// ============================================================================

/**
 * Normalize Google Places worker output.
 *
 * Google Places provides authoritative, verified business data.
 * - Origin: 'places' (Google Places API)
 * - Confidence: 'verified' (Google data is authoritative)
 *
 * @param output - Worker output from Google Places
 * @returns Normalized candidates with places origin and verified confidence
 *
 * @example
 * ```typescript
 * const candidates = normalizePlacesOutput(placesOutput);
 * // All candidates have origin: 'places', confidence: 'verified'
 * ```
 */
export function normalizePlacesOutput(output: WorkerOutput): Candidate[] {
  // Skip if worker failed or was skipped
  if (output.status === 'error' || output.status === 'skipped') {
    return [];
  }

  return output.candidates.map((candidate) => ({
    ...candidate,
    // Ensure places origin
    origin: 'places' as CandidateOrigin,
    // Google Places data is verified/authoritative
    confidence: 'verified' as CandidateConfidence,
    // Use existing score or calculate from rating if available
    score: candidate.score ?? calculatePlacesScore(candidate),
    // Ensure arrays are initialized
    tags: candidate.tags ?? [],
    sourceRefs: candidate.sourceRefs ?? [],
  }));
}

/**
 * Calculate a score for Places candidates if not already set.
 *
 * Uses rating and metadata to determine initial score.
 */
function calculatePlacesScore(candidate: Candidate): number {
  let score = 60; // Higher base for verified places

  // Boost based on rating if available
  if (candidate.metadata?.rating !== undefined) {
    const rating = candidate.metadata.rating;
    // Rating 4.5+ adds 20 points, 4.0+ adds 10, 3.5+ adds 5
    if (rating >= 4.5) score += 20;
    else if (rating >= 4.0) score += 10;
    else if (rating >= 3.5) score += 5;
    else if (rating < 3.0) score -= 10;
  }

  // Ensure bounds
  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// YouTube Normalizer
// ============================================================================

/**
 * Normalize YouTube worker output.
 *
 * YouTube provides social-derived candidates from video content.
 * - Origin: 'youtube' (YouTube Data API + transcript extraction)
 * - Confidence: 'provisional' (social content needs validation)
 *
 * @param output - Worker output from YouTube
 * @returns Normalized candidates with youtube origin and provisional confidence
 *
 * @example
 * ```typescript
 * const candidates = normalizeYouTubeOutput(youtubeOutput);
 * // All candidates have origin: 'youtube', confidence: 'provisional'
 * ```
 */
export function normalizeYouTubeOutput(output: WorkerOutput): Candidate[] {
  // Skip if worker failed or was skipped
  if (output.status === 'error' || output.status === 'skipped') {
    return [];
  }

  return output.candidates.map((candidate) => ({
    ...candidate,
    // Ensure youtube origin
    origin: 'youtube' as CandidateOrigin,
    // Social content starts as provisional until validated
    confidence: 'provisional' as CandidateConfidence,
    // Lower default score for social content (per PRD credibility guidelines)
    score: candidate.score ?? calculateYouTubeScore(candidate),
    // Ensure arrays are initialized
    tags: ensureYouTubeTags(candidate.tags),
    sourceRefs: candidate.sourceRefs ?? [],
  }));
}

/**
 * Calculate a score for YouTube candidates if not already set.
 *
 * Uses view count and channel engagement to determine initial score.
 */
function calculateYouTubeScore(candidate: Candidate): number {
  let score = 30; // Lower base for social content

  // Boost based on view count if available
  if (candidate.metadata?.viewCount !== undefined) {
    const views = candidate.metadata.viewCount;
    // High view count suggests popular content
    if (views >= 1_000_000) score += 15;
    else if (views >= 100_000) score += 10;
    else if (views >= 10_000) score += 5;
  }

  // Ensure bounds
  return Math.max(0, Math.min(100, score));
}

/**
 * Ensure YouTube-derived candidates have the 'youtube' tag.
 *
 * This helps with filtering and identification in later stages.
 */
function ensureYouTubeTags(tags: string[] | undefined): string[] {
  const result = tags ?? [];

  // Add youtube tag if not present
  if (!result.includes('youtube')) {
    return ['youtube', ...result];
  }

  return result;
}

// ============================================================================
// Normalizer Registry
// ============================================================================

/**
 * Map of worker IDs to their normalizer functions.
 */
const NORMALIZER_MAP: Record<NormalizableWorkerId, WorkerNormalizer> = {
  perplexity: normalizePerplexityOutput,
  places: normalizePlacesOutput,
  youtube: normalizeYouTubeOutput,
};

/**
 * Get the appropriate normalizer for a worker ID.
 *
 * Returns a specialized normalizer if one exists for the worker,
 * otherwise returns a generic normalizer that passes through candidates
 * with default values.
 *
 * @param workerId - Worker identifier (e.g., 'perplexity', 'places', 'youtube')
 * @returns Normalizer function for the worker
 *
 * @example
 * ```typescript
 * const normalizer = getNormalizerForWorker('perplexity');
 * const candidates = normalizer(workerOutput);
 * ```
 */
export function getNormalizerForWorker(workerId: string): WorkerNormalizer {
  // Check for specialized normalizer
  if (workerId in NORMALIZER_MAP) {
    return NORMALIZER_MAP[workerId as NormalizableWorkerId];
  }

  // Return generic normalizer for unknown workers
  return createGenericNormalizer(workerId);
}

/**
 * Create a generic normalizer for unknown worker types.
 *
 * Preserves existing candidate data while ensuring required fields
 * have sensible defaults.
 *
 * @param workerId - Worker identifier (for logging)
 * @returns Generic normalizer function
 */
function createGenericNormalizer(_workerId: string): WorkerNormalizer {
  return (output: WorkerOutput): Candidate[] => {
    if (output.status === 'error' || output.status === 'skipped') {
      return [];
    }

    // Note: Caller should log warning for unknown worker types using hasSpecializedNormalizer()
    // This avoids console.warn in favor of structured logging at the call site

    return output.candidates.map((candidate) => ({
      ...candidate,
      // Keep existing origin or default to 'web'
      origin: candidate.origin ?? ('web' as CandidateOrigin),
      // Keep existing confidence or default to provisional
      confidence: candidate.confidence ?? ('provisional' as CandidateConfidence),
      // Default score
      score: candidate.score ?? 40,
      // Ensure arrays
      tags: candidate.tags ?? [],
      sourceRefs: candidate.sourceRefs ?? [],
    }));
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a worker ID has a specialized normalizer.
 *
 * @param workerId - Worker identifier to check
 * @returns True if a specialized normalizer exists
 */
export function hasSpecializedNormalizer(workerId: string): boolean {
  return workerId in NORMALIZER_MAP;
}

/**
 * Get all worker IDs that have specialized normalizers.
 *
 * @returns Array of worker IDs with specialized normalizers
 */
export function getSpecializedNormalizerIds(): NormalizableWorkerId[] {
  return Object.keys(NORMALIZER_MAP) as NormalizableWorkerId[];
}
