/**
 * Google Places to Candidate Mapper
 *
 * Transforms Google Places API responses into Candidate objects
 * for the discovery pipeline. Handles field mapping, confidence
 * scoring, and source reference generation.
 *
 * @module workers/places/mapper
 * @see PRD FR5.2 - Google Places Worker
 * @see Task 10.2 - Place to Candidate Mapping
 */

import { createHash } from 'crypto';
import type { Candidate, CandidateType, SourceRef } from '../../schemas/candidate.js';
import type { Place, PlaceDetails } from './client.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Google Maps URL format using CID (place ID).
 * Used when direct URL is not available.
 * @see PRD Section 7.3 - Google Places Worker
 */
const GOOGLE_MAPS_PLACE_URL = 'https://maps.google.com/?cid=';

/**
 * Mapping of Google Place types to CandidateType.
 * Order matters - first match wins.
 */
const TYPE_MAPPINGS: Array<{ types: string[]; candidateType: CandidateType }> = [
  {
    types: ['restaurant', 'food', 'meal_delivery', 'meal_takeaway', 'bakery', 'cafe', 'bar'],
    candidateType: 'food',
  },
  {
    types: [
      'tourist_attraction',
      'museum',
      'art_gallery',
      'aquarium',
      'zoo',
      'amusement_park',
      'stadium',
      'casino',
    ],
    candidateType: 'place',
  },
  {
    types: [
      'gym',
      'spa',
      'bowling_alley',
      'movie_theater',
      'night_club',
      'park',
      'campground',
    ],
    candidateType: 'activity',
  },
  {
    types: ['neighborhood', 'locality', 'sublocality', 'political'],
    candidateType: 'neighborhood',
  },
];

// ============================================================================
// Main Mapping Function
// ============================================================================

/**
 * Map a Google Place (with optional details) to a Candidate object.
 *
 * Creates a fully-formed Candidate with:
 * - Stable ID based on place ID and name
 * - Appropriate type from Google Place types
 * - Google Maps URL as source reference
 * - Metadata including rating, price level, and place ID
 *
 * @param place - Place or PlaceDetails from Google Places API
 * @param destination - Destination context for location text fallback
 * @returns Candidate object ready for the pipeline
 *
 * @example
 * ```typescript
 * const place = await client.getPlaceDetails('ChIJN1t_tDeuEmsRUsoyG83frY4');
 * const candidate = mapPlaceToCandidate(place, 'Sydney');
 * console.log(candidate.title); // Place name
 * console.log(candidate.metadata?.rating); // Google rating
 * ```
 */
export function mapPlaceToCandidate(
  place: Place | PlaceDetails,
  destination: string
): Candidate {
  const now = new Date().toISOString();

  // Generate stable candidate ID
  const candidateId = generatePlaceCandidateId(place.placeId, place.name);

  // Determine candidate type from Google Place types
  const type = inferCandidateType(place.types ?? []);

  // Build summary from available information
  const summary = buildSummary(place);

  // Build source references
  const sourceRefs = buildSourceRefs(place, now);

  // Extract tags from place types and attributes
  const tags = buildTags(place, type);

  // Build location text
  const locationText = buildLocationText(place, destination);

  // Build metadata
  const metadata = buildMetadata(place);

  return {
    candidateId,
    type,
    title: place.name,
    summary,
    locationText,
    coordinates: {
      lat: place.geometry.location.lat,
      lng: place.geometry.location.lng,
    },
    tags,
    origin: 'places',
    sourceRefs,
    confidence: 'verified', // Google Places data is verified
    score: calculateInitialScore(place),
    metadata,
  };
}

/**
 * Map multiple places to candidates.
 *
 * Batch version of mapPlaceToCandidate for convenience.
 *
 * @param places - Array of places from Google Places API
 * @param destination - Destination context
 * @returns Array of Candidate objects
 */
export function mapPlacesToCandidates(
  places: Array<Place | PlaceDetails>,
  destination: string
): Candidate[] {
  return places.map((place) => mapPlaceToCandidate(place, destination));
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a stable candidate ID from place ID and name.
 *
 * Uses SHA-256 hash truncated to 16 characters for a stable,
 * deterministic identifier. Includes 'places' prefix for origin clarity.
 *
 * @param placeId - Google Place ID
 * @param name - Place name
 * @returns 16-character hex string ID
 */
export function generatePlaceCandidateId(placeId: string, name: string): string {
  const seed = `places|${placeId}|${name.toLowerCase().trim()}`;
  return createHash('sha256').update(seed).digest('hex').slice(0, 16);
}

// ============================================================================
// Type Inference
// ============================================================================

/**
 * Infer CandidateType from Google Place types.
 *
 * Uses a priority-based mapping - first matching type category wins.
 * Defaults to 'place' if no specific match found.
 *
 * @param types - Array of Google Place types
 * @returns Inferred CandidateType
 */
export function inferCandidateType(types: string[]): CandidateType {
  for (const mapping of TYPE_MAPPINGS) {
    for (const type of types) {
      if (mapping.types.includes(type)) {
        return mapping.candidateType;
      }
    }
  }
  return 'place'; // Default
}

// ============================================================================
// Summary Building
// ============================================================================

/**
 * Build a summary string from place information.
 *
 * Prioritizes editorial summary if available (from PlaceDetails),
 * otherwise constructs from available fields.
 *
 * @param place - Place or PlaceDetails object
 * @returns Summary string
 */
function buildSummary(place: Place | PlaceDetails): string {
  // Use editorial summary if available (PlaceDetails only)
  const details = place as PlaceDetails;
  if (details.editorialSummary?.overview) {
    return details.editorialSummary.overview;
  }

  // Build from available information
  const parts: string[] = [];

  // Add type description
  const primaryType = getPrimaryType(place.types ?? []);
  if (primaryType) {
    parts.push(formatTypeName(primaryType));
  }

  // Add rating info
  if (place.rating !== undefined) {
    const ratingStr = `${place.rating.toFixed(1)} stars`;
    const reviewCount = place.userRatingsTotal
      ? ` (${place.userRatingsTotal.toLocaleString()} reviews)`
      : '';
    parts.push(`rated ${ratingStr}${reviewCount}`);
  }

  // Add price level
  if (place.priceLevel !== undefined) {
    parts.push(formatPriceLevel(place.priceLevel));
  }

  // Add address context
  const addressParts = place.formattedAddress.split(',');
  if (addressParts.length > 1) {
    parts.push(`located in ${addressParts.slice(0, 2).join(',').trim()}`);
  }

  // Add opening status if available
  if (place.openingHours?.openNow !== undefined) {
    parts.push(place.openingHours.openNow ? 'currently open' : 'currently closed');
  }

  return parts.length > 0
    ? parts.join('. ').replace(/\.\./g, '.') + '.'
    : `A place in ${place.formattedAddress}`;
}

/**
 * Get the primary (most specific) place type.
 *
 * Filters out generic types like 'point_of_interest' and 'establishment'.
 *
 * @param types - Array of place types
 * @returns Primary type or undefined
 */
function getPrimaryType(types: string[]): string | undefined {
  const genericTypes = ['point_of_interest', 'establishment', 'political', 'locality'];
  return types.find((t) => !genericTypes.includes(t));
}

/**
 * Format a place type into a human-readable name.
 *
 * @param type - Google Place type (snake_case)
 * @returns Formatted name
 */
function formatTypeName(type: string): string {
  // Handle special cases
  const specialCases: Record<string, string> = {
    meal_delivery: 'Restaurant with delivery',
    meal_takeaway: 'Restaurant with takeaway',
    tourist_attraction: 'Tourist attraction',
    art_gallery: 'Art gallery',
    night_club: 'Night club',
    movie_theater: 'Movie theater',
  };

  if (type in specialCases) {
    return specialCases[type];
  }

  // Default: capitalize and replace underscores
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
}

/**
 * Format price level to human-readable string.
 *
 * @param level - Price level (0-4)
 * @returns Formatted price string
 */
function formatPriceLevel(level: number): string {
  const labels = ['free', 'inexpensive', 'moderate', 'expensive', 'very expensive'];
  return labels[level] ?? 'unknown price';
}

// ============================================================================
// Source Reference Building
// ============================================================================

/**
 * Build source references for a place.
 *
 * Generates Google Maps URL as the primary source.
 * Also includes website if available (from PlaceDetails).
 *
 * @param place - Place or PlaceDetails object
 * @param retrievedAt - ISO8601 timestamp
 * @returns Array of SourceRef objects
 */
function buildSourceRefs(place: Place | PlaceDetails, retrievedAt: string): SourceRef[] {
  const sourceRefs: SourceRef[] = [];

  // Primary source: Google Maps URL
  const mapsUrl = buildGoogleMapsUrl(place);
  sourceRefs.push({
    url: mapsUrl,
    publisher: 'Google Maps',
    retrievedAt,
  });

  // Secondary source: Place website (if available in PlaceDetails)
  const details = place as PlaceDetails;
  if (details.website) {
    sourceRefs.push({
      url: details.website,
      publisher: extractPublisher(details.website),
      retrievedAt,
    });
  }

  return sourceRefs;
}

/**
 * Build Google Maps URL for a place.
 *
 * Uses the place URL if available (from PlaceDetails),
 * otherwise constructs from place ID.
 *
 * @param place - Place object
 * @returns Google Maps URL
 */
export function buildGoogleMapsUrl(place: Place | PlaceDetails): string {
  const details = place as PlaceDetails;

  // Use the direct URL if available
  if (details.url) {
    return details.url;
  }

  // Fall back to place ID URL format
  return `${GOOGLE_MAPS_PLACE_URL}${place.placeId}`;
}

/**
 * Extract publisher/domain name from URL.
 *
 * @param url - The source URL
 * @returns Publisher name or undefined if parsing fails
 */
function extractPublisher(url: string): string | undefined {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

// ============================================================================
// Tag Building
// ============================================================================

/**
 * Build tags from place types and attributes.
 *
 * @param place - Place object
 * @param candidateType - Inferred candidate type
 * @returns Array of tags
 */
function buildTags(place: Place | PlaceDetails, candidateType: CandidateType): string[] {
  const tags: string[] = [candidateType];

  // Add relevant place types as tags
  const typeToTagMap: Record<string, string> = {
    restaurant: 'dining',
    cafe: 'coffee',
    bar: 'nightlife',
    museum: 'culture',
    park: 'outdoors',
    spa: 'wellness',
    gym: 'fitness',
    tourist_attraction: 'attraction',
    art_gallery: 'art',
    bakery: 'bakery',
  };

  for (const type of place.types ?? []) {
    if (type in typeToTagMap) {
      const tag = typeToTagMap[type];
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }
  }

  // Add price-based tags
  if (place.priceLevel !== undefined) {
    if (place.priceLevel <= 1) {
      tags.push('budget-friendly');
    } else if (place.priceLevel >= 3) {
      tags.push('upscale');
    }
  }

  // Add rating-based tags
  if (place.rating !== undefined && place.rating >= 4.5) {
    tags.push('highly-rated');
  }

  // Add review count tag
  if (place.userRatingsTotal !== undefined && place.userRatingsTotal >= 1000) {
    tags.push('popular');
  }

  return tags;
}

// ============================================================================
// Location Building
// ============================================================================

/**
 * Build location text from place address.
 *
 * Extracts the most relevant parts of the address for display.
 * Uses the last 2 parts of the address (typically city, country) to
 * better handle international address formats.
 *
 * @param place - Place object
 * @param destination - Destination fallback
 * @returns Location text
 */
function buildLocationText(place: Place | PlaceDetails, destination: string): string {
  if (!place.formattedAddress) {
    return destination;
  }

  // Extract location from address using last parts for better international support
  // Examples:
  //   "123 Street, Neighborhood, City, Country" -> "City, Country"
  //   "Shop 5, Building, District, City, Country" -> "City, Country"
  const parts = place.formattedAddress.split(',').map((p) => p.trim());

  if (parts.length >= 3) {
    // Use last 2 parts (typically city, country)
    return parts.slice(-2).join(', ');
  } else if (parts.length >= 2) {
    return parts.join(', ');
  }

  return place.formattedAddress;
}

// ============================================================================
// Metadata Building
// ============================================================================

/**
 * Build metadata object for the candidate.
 *
 * Includes Google Places-specific fields: placeId, rating, priceLevel.
 *
 * @param place - Place object
 * @returns Metadata object
 */
function buildMetadata(place: Place | PlaceDetails): Candidate['metadata'] {
  return {
    placeId: place.placeId,
    rating: place.rating,
    priceLevel: place.priceLevel,
  };
}

// ============================================================================
// Score Calculation
// ============================================================================

/**
 * Calculate initial score for a place.
 *
 * Uses rating, review count, and business status to determine initial score.
 * Score range: 0-100 (will be adjusted by ranking stage).
 *
 * @param place - Place object
 * @returns Initial score (0-100)
 */
function calculateInitialScore(place: Place | PlaceDetails): number {
  let score = 50; // Base score

  // Rating component (0-25 points)
  if (place.rating !== undefined) {
    // Rating 4.0-5.0 maps to 15-25 points
    // Rating 3.0-4.0 maps to 5-15 points
    // Rating below 3.0 maps to 0-5 points
    score += Math.min(25, (place.rating / 5) * 25);
  }

  // Review count component (0-15 points)
  if (place.userRatingsTotal !== undefined) {
    // Log scale for review count
    // 1000+ reviews = 15 points, 100+ = 10 points, 10+ = 5 points
    const reviewScore = Math.min(15, Math.log10(place.userRatingsTotal + 1) * 5);
    score += reviewScore;
  }

  // Business status penalty
  if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') {
    score -= 20; // Penalty for closed/temporarily closed
  }

  // Ensure score is within bounds
  return Math.max(0, Math.min(100, Math.round(score)));
}
