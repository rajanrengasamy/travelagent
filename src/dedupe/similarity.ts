/**
 * Similarity Functions for Candidate Deduplication
 *
 * Provides algorithms for comparing candidates based on:
 * - Text similarity (Jaccard coefficient)
 * - Geographic proximity (Haversine distance)
 * - Combined multi-signal similarity scoring
 *
 * @module dedupe/similarity
 * @see PRD Section 14.1 - Phase 2: Multi-Signal Similarity
 */

import type { Candidate, Coordinates } from '../schemas/candidate.js';
import { normalizeContent } from './normalize.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Threshold for considering two candidates as duplicates.
 * Candidates with similarity >= 0.85 are clustered together.
 *
 * @see PRD Section 14.1 - Phase 2 clustering threshold
 * @see TODO Section 13.4.2 - similarity-based clustering (threshold 0.85)
 */
export const CANDIDATE_SIMILARITY_THRESHOLD = 0.85;

/**
 * Distance thresholds for location similarity scoring (in meters).
 */
export const DISTANCE_THRESHOLDS = {
  /** Same place - within 50 meters */
  SAME_PLACE: 50,
  /** Very close - within 200 meters */
  VERY_CLOSE: 200,
  /** Close - within 500 meters */
  CLOSE: 500,
} as const;

// ============================================================================
// Text Similarity
// ============================================================================

/**
 * Calculates Jaccard similarity coefficient between two strings.
 *
 * The Jaccard index is defined as the size of the intersection divided by
 * the size of the union of two sets. For text, we tokenize by whitespace
 * after normalization.
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns Similarity score between 0.0 (no overlap) and 1.0 (identical)
 * @example
 * ```typescript
 * jaccardSimilarity("tokyo tower", "tokyo tower");
 * // 1.0
 *
 * jaccardSimilarity("tokyo tower", "tokyo skytree");
 * // 0.333... (intersection: "tokyo", union: "tokyo tower skytree")
 *
 * jaccardSimilarity("", "");
 * // 1.0 (both empty = identical)
 * ```
 */
export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(
    normalizeContent(a)
      .split(' ')
      .filter((t) => t.length > 0)
  );
  const tokensB = new Set(
    normalizeContent(b)
      .split(' ')
      .filter((t) => t.length > 0)
  );

  // Both empty strings are considered identical
  if (tokensA.size === 0 && tokensB.size === 0) {
    return 1.0;
  }

  // One empty, one not = no similarity
  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0.0;
  }

  const intersection = [...tokensA].filter((x) => tokensB.has(x));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.length / union.size;
}

// ============================================================================
// Geographic Similarity
// ============================================================================

/**
 * Calculates the Haversine distance between two geographic coordinates.
 *
 * The Haversine formula determines the great-circle distance between two
 * points on a sphere given their longitudes and latitudes.
 *
 * @param coordA - First coordinate (lat/lng)
 * @param coordB - Second coordinate (lat/lng)
 * @returns Distance in meters
 * @example
 * ```typescript
 * // Tokyo Tower to Tokyo Skytree (~8km)
 * haversineDistance(
 *   { lat: 35.6586, lng: 139.7454 },
 *   { lat: 35.7101, lng: 139.8107 }
 * );
 * // ~8100 meters
 * ```
 */
export function haversineDistance(coordA: Coordinates, coordB: Coordinates): number {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg: number): number => deg * (Math.PI / 180);

  const dLat = toRad(coordB.lat - coordA.lat);
  const dLng = toRad(coordB.lng - coordA.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coordA.lat)) *
      Math.cos(toRad(coordB.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculates location similarity between two candidates.
 *
 * Uses two strategies:
 * 1. If both candidates have coordinates: use Haversine distance
 *    - <50m = 1.0 (same place)
 *    - <200m = 0.8 (very close)
 *    - <500m = 0.5 (close)
 *    - >=500m = 0.0 (different places)
 *
 * 2. Fallback: Jaccard similarity on locationText
 *
 * @param a - First candidate
 * @param b - Second candidate
 * @returns Location similarity score between 0.0 and 1.0
 * @example
 * ```typescript
 * // Same coordinates = 1.0
 * calculateLocationSimilarity(
 *   { coordinates: { lat: 35.6586, lng: 139.7454 }, locationText: "Tokyo Tower" },
 *   { coordinates: { lat: 35.6586, lng: 139.7454 }, locationText: "Tokyo Tower" }
 * );
 * // 1.0
 * ```
 */
export function calculateLocationSimilarity(a: Candidate, b: Candidate): number {
  // If both have coordinates, use Haversine distance
  if (a.coordinates && b.coordinates) {
    const distanceM = haversineDistance(a.coordinates, b.coordinates);

    if (distanceM < DISTANCE_THRESHOLDS.SAME_PLACE) {
      return 1.0;
    }
    if (distanceM < DISTANCE_THRESHOLDS.VERY_CLOSE) {
      return 0.8;
    }
    if (distanceM < DISTANCE_THRESHOLDS.CLOSE) {
      return 0.5;
    }
    return 0.0;
  }

  // Fallback: compare location text using Jaccard similarity
  const locationA = a.locationText ?? '';
  const locationB = b.locationText ?? '';

  return jaccardSimilarity(locationA, locationB);
}

// ============================================================================
// Combined Similarity
// ============================================================================

/**
 * Calculates overall similarity between two candidates.
 *
 * Uses a weighted combination of:
 * - 60% title similarity (Jaccard)
 * - 40% location similarity
 *
 * @param a - First candidate
 * @param b - Second candidate
 * @returns Combined similarity score between 0.0 and 1.0
 * @see PRD Section 14.1 - candidateSimilarity formula
 * @example
 * ```typescript
 * candidateSimilarity(candidateA, candidateB);
 * // 0.85 (above threshold = likely duplicates)
 * ```
 */
export function candidateSimilarity(a: Candidate, b: Candidate): number {
  const titleSim = jaccardSimilarity(a.title, b.title);
  const locationSim = calculateLocationSimilarity(a, b);

  // 60% title, 40% location
  return titleSim * 0.6 + locationSim * 0.4;
}
