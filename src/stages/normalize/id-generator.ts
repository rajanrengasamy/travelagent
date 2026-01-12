/**
 * Candidate ID Generation
 *
 * Generates stable, deterministic candidate IDs based on content hash.
 * Used by the normalization stage (Stage 04) to assign unique identifiers.
 *
 * ID Format: <origin>-<hash> where hash is first 8 chars of SHA-256
 *
 * @module stages/normalize/id-generator
 * @see PRD Section 12.4 - Candidate Schema
 */

import * as crypto from 'node:crypto';
import type { Candidate } from '../../schemas/candidate.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Length of hash suffix in candidate IDs (8 hex chars = 32 bits)
 */
const HASH_LENGTH = 8;

// ============================================================================
// String Normalization
// ============================================================================

/**
 * Normalize a string for hashing.
 *
 * Applies consistent transformations:
 * 1. Lowercase
 * 2. Remove special characters (keep only alphanumeric and spaces)
 * 3. Collapse multiple spaces to single space
 * 4. Trim leading/trailing whitespace
 *
 * @param text - Input text to normalize
 * @returns Normalized text suitable for hashing
 *
 * @example
 * ```typescript
 * normalizeForHash('  The GRAND Temple!  ');
 * // Returns: 'the grand temple'
 * ```
 */
export function normalizeForHash(text: string): string {
  if (!text) {
    return '';
  }

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
}

// ============================================================================
// Hash Generation
// ============================================================================

/**
 * Generate SHA-256 hash of content and return first N hex characters.
 *
 * @param content - Content to hash
 * @param length - Number of hex characters to return (default: 8)
 * @returns Truncated hex hash
 *
 * @example
 * ```typescript
 * hashContent('tokyo tower');
 * // Returns: 'a1b2c3d4' (8 hex chars)
 * ```
 */
export function hashContent(content: string, length: number = HASH_LENGTH): string {
  const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  return hash.substring(0, length);
}

// ============================================================================
// Candidate ID Generation
// ============================================================================

/**
 * Generate a stable, deterministic candidate ID based on content.
 *
 * Algorithm:
 * 1. Normalize the title (lowercase, remove special chars, collapse whitespace)
 * 2. Normalize locationText similarly (or use empty string if undefined)
 * 3. Create seed string: `${normalizedTitle}|${normalizedLocation}`
 * 4. Hash with SHA-256, take first 8 hex chars
 * 5. Format as: `${origin}-${hash}`
 *
 * @param title - Candidate title
 * @param locationText - Optional location text
 * @param origin - Candidate origin (web, places, youtube)
 * @returns Stable candidate ID (e.g., "web-a1b2c3d4", "places-f5e6d7c8")
 *
 * @example
 * ```typescript
 * generateCandidateId('Tokyo Tower', 'Minato, Tokyo, Japan', 'places');
 * // Returns: 'places-a1b2c3d4'
 *
 * generateCandidateId('Best Ramen Spots', undefined, 'web');
 * // Returns: 'web-f5e6d7c8'
 * ```
 */
export function generateCandidateId(
  title: string,
  locationText: string | undefined,
  origin: string
): string {
  // Normalize inputs
  const normalizedTitle = normalizeForHash(title);
  const normalizedLocation = normalizeForHash(locationText ?? '');

  // Create seed string with separator to avoid collisions
  // (e.g., "tokyo|tower" vs "tokyotower|" would be different)
  const seed = `${normalizedTitle}|${normalizedLocation}`;

  // Generate hash
  const hash = hashContent(seed);

  // Format as origin-hash
  return `${origin}-${hash}`;
}

// ============================================================================
// Collision Handling
// ============================================================================

/**
 * Ensure unique IDs across a set of candidates.
 *
 * Handles collisions by appending sequential suffix (-1, -2, etc.).
 * Preserves original candidate objects, only modifying candidateId.
 *
 * @param candidates - Array of candidates with potentially duplicate IDs
 * @returns New array of candidates with unique IDs
 *
 * @example
 * ```typescript
 * const candidates = [
 *   { candidateId: 'web-a1b2c3d4', title: 'Place A', ... },
 *   { candidateId: 'web-a1b2c3d4', title: 'Place B', ... }, // collision
 *   { candidateId: 'places-f5e6d7c8', title: 'Place C', ... },
 * ];
 *
 * const unique = ensureUniqueIds(candidates);
 * // Returns: [
 * //   { candidateId: 'web-a1b2c3d4', ... },
 * //   { candidateId: 'web-a1b2c3d4-1', ... },
 * //   { candidateId: 'places-f5e6d7c8', ... },
 * // ]
 * ```
 */
export function ensureUniqueIds(candidates: Candidate[]): Candidate[] {
  const seenIds = new Set<string>();
  const result: Candidate[] = [];

  for (const candidate of candidates) {
    let uniqueId = candidate.candidateId;

    // If ID already seen, append suffix until unique
    if (seenIds.has(uniqueId)) {
      let suffix = 1;
      let candidateId = `${candidate.candidateId}-${suffix}`;

      while (seenIds.has(candidateId)) {
        suffix++;
        candidateId = `${candidate.candidateId}-${suffix}`;
      }

      uniqueId = candidateId;
    }

    // Track this ID as seen
    seenIds.add(uniqueId);

    // Create new candidate with updated ID (immutable pattern)
    result.push({
      ...candidate,
      candidateId: uniqueId,
    });
  }

  return result;
}

// ============================================================================
// Batch ID Generation
// ============================================================================

/**
 * Generate candidate IDs for an array of candidates and ensure uniqueness.
 *
 * Convenience function that combines ID generation with collision handling.
 *
 * @param candidates - Array of candidates (candidateId field will be overwritten)
 * @returns Array of candidates with unique, stable IDs
 *
 * @example
 * ```typescript
 * const candidatesWithIds = generateCandidateIds(rawCandidates);
 * ```
 */
export function generateCandidateIds(
  candidates: Array<Omit<Candidate, 'candidateId'> & { candidateId?: string }>
): Candidate[] {
  // First pass: generate IDs based on content
  const withIds = candidates.map((candidate) => ({
    ...candidate,
    candidateId: generateCandidateId(
      candidate.title,
      candidate.locationText,
      candidate.origin
    ),
  })) as Candidate[];

  // Second pass: ensure uniqueness
  return ensureUniqueIds(withIds);
}
