/**
 * Candidate Hash Generation for Deduplication
 *
 * Generates stable hashes for candidates to enable ID-based exact matching
 * in Phase 1 of the two-phase deduplication strategy.
 *
 * @see PRD Section 14.1 - Two-Phase Deduplication Strategy
 * @module dedupe/hash
 */

import { createHash } from 'crypto';
import type { Candidate } from '../schemas/candidate.js';
import { normalizeContent } from './normalize.js';

/**
 * Extract city from location text.
 *
 * Handles common formats:
 * - "Place Name, City" -> "City"
 * - "Place Name, City, Country" -> "Country" (last segment)
 * - "City" -> "City"
 *
 * The extracted city is normalized for consistent comparison.
 *
 * @param locationText - The location text to parse
 * @returns Normalized city string, or empty string if not parseable
 *
 * @example
 * ```typescript
 * extractCity('Senso-ji Temple, Asakusa, Tokyo');
 * // Returns: 'tokyo'
 *
 * extractCity('Tokyo');
 * // Returns: 'tokyo'
 *
 * extractCity(undefined);
 * // Returns: ''
 * ```
 */
export function extractCity(locationText: string | undefined): string {
  if (!locationText) {
    return '';
  }

  const parts = locationText.split(',');

  if (parts.length > 1) {
    // Take the last segment (usually city or country)
    return normalizeContent(parts[parts.length - 1]);
  }

  // Single segment - normalize the whole string
  return normalizeContent(locationText);
}

/**
 * Generate a stable hash for a candidate.
 *
 * The hash is computed from a seed string combining:
 * - placeId (if available from Google Places)
 * - Normalized title
 * - Extracted and normalized city from locationText
 *
 * Seed format: `${placeId}|${normalizedTitle}|${city}`
 *
 * This enables exact matching of candidates that refer to the same place,
 * even when sourced from different workers (Perplexity, Places, YouTube).
 *
 * @param candidate - The candidate to generate a hash for
 * @returns 16-character hex string (truncated SHA-256)
 *
 * @example
 * ```typescript
 * const candidate: Candidate = {
 *   candidateId: 'abc123',
 *   title: 'Senso-ji Temple',
 *   locationText: 'Asakusa, Tokyo',
 *   metadata: { placeId: 'ChIJ...' },
 *   // ... other fields
 * };
 * generateCandidateHash(candidate);
 * // Returns: '8a3f2b1c4d5e6f78' (example)
 * ```
 */
export function generateCandidateHash(candidate: Candidate): string {
  const placeId = candidate.metadata?.placeId ?? '';
  const normalizedTitle = normalizeContent(candidate.title);
  const city = extractCity(candidate.locationText);

  const seed = `${placeId}|${normalizedTitle}|${city}`;

  return createHash('sha256').update(seed).digest('hex').substring(0, 16);
}
