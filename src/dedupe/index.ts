/**
 * Deduplication Module Exports
 *
 * Provides deduplication and clustering functionality for candidates.
 * Exports content normalization, hash generation, similarity functions,
 * and clustering algorithms for the dedupe stage (Stage 05).
 *
 * @module dedupe
 * @see PRD Section 15 (FR2 Stage 05) - Deduplication Stage
 * @see TODO Section 13.0 - Deduplication & Clustering (Stage 05)
 */

// Content normalization (Task 13.1)
export { normalizeContent } from './normalize.js';

// Hash generation (Task 13.2)
export { generateCandidateHash, extractCity } from './hash.js';

// Similarity functions (Task 13.3)
export {
  jaccardSimilarity,
  haversineDistance,
  calculateLocationSimilarity,
  candidateSimilarity,
  CANDIDATE_SIMILARITY_THRESHOLD,
  DISTANCE_THRESHOLDS,
} from './similarity.js';

// Clustering (Task 13.4)
export { formClusters, type ClusterInfo, type ClusterResult } from './cluster.js';

// Re-export stage output type for convenience
export type { DedupeStageOutput } from '../stages/dedupe/types.js';
