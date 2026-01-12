/**
 * Google Places Worker
 *
 * Queries Google Places API for verified location data, ratings, and details.
 * Returns Candidates with origin='places' and verified confidence.
 *
 * Architecture:
 * - client.ts: Low-level API client for Google Places
 * - mapper.ts: Converts API responses to Candidate objects
 * - worker.ts: Main Worker implementation
 *
 * @module workers/places
 * @see PRD FR5.2 - Google Places Worker
 */

// ============================================================================
// Main Worker Class
// ============================================================================

export { PlacesWorker, generateQueries, deduplicateCandidates } from './worker.js';

// ============================================================================
// API Client
// ============================================================================

export {
  PlacesClient,
  PlacesApiError,
  isPlacesApiError,
  isRetryableError,
  type Place,
  type PlaceDetails,
  type SearchOptions,
} from './client.js';

// ============================================================================
// Place to Candidate Mapper
// ============================================================================

export {
  mapPlaceToCandidate,
  mapPlacesToCandidates,
  generatePlaceCandidateId,
  inferCandidateType,
  buildGoogleMapsUrl,
} from './mapper.js';
