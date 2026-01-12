/**
 * Dedupe Stage Types
 *
 * Type definitions for the deduplication and clustering stage.
 * These types define the output structure for Stage 05.
 *
 * @module stages/dedupe/types
 * @see PRD Section 14 - Ranking, Dedupe, and Clustering
 * @see TODO Section 13.0 - Deduplication & Clustering (Stage 05)
 */

import { z } from 'zod';
import { CandidateSchema, type Candidate } from '../../schemas/candidate.js';

// ============================================================================
// Cluster Info Schema
// ============================================================================

/**
 * ClusterInfo: Information about a cluster of similar candidates.
 * Each cluster has a representative candidate (the "best" one) and
 * up to 3 alternate candidates with different origins.
 *
 * @see TODO Section 13.4 - Cluster formation and merging
 */
export const ClusterInfoSchema = z.object({
  /** Unique cluster identifier */
  clusterId: z.string().min(1),

  /** The best candidate representing this cluster (highest score) */
  representative: CandidateSchema,

  /** Up to 3 alternate candidates with different origins */
  alternates: z.array(CandidateSchema).max(3),

  /** Total number of candidates merged into this cluster */
  memberCount: z.number().int().positive(),
});

export type ClusterInfo = z.infer<typeof ClusterInfoSchema>;

// ============================================================================
// Cluster Result Types
// ============================================================================

/**
 * Result from the clustering/deduplication process.
 * Returned by formClusters() in src/dedupe/cluster.ts.
 */
export interface ClusterResult {
  /** All clusters formed from the input candidates */
  clusters: ClusterInfo[];

  /** Deduplicated candidates (one per cluster, with merged data) */
  dedupedCandidates: Candidate[];

  /** Statistics about the deduplication process */
  stats: {
    /** Number of candidates before deduplication */
    originalCount: number;
    /** Number of clusters formed */
    clusterCount: number;
    /** Number of unique candidates after deduplication */
    dedupedCount: number;
    /** Number of duplicates removed */
    duplicatesRemoved: number;
  };
}

// ============================================================================
// Stage Output Types
// ============================================================================

/**
 * DedupeStageOutput: Output structure for the dedupe stage checkpoint.
 * Written to 05_candidates_deduped.json.
 */
export interface DedupeStageOutput {
  /** Deduplicated candidates (representatives from each cluster) */
  candidates: Candidate[];

  /** Information about each cluster formed */
  clusters: ClusterInfo[];

  /** Statistics about the deduplication process */
  stats: {
    /** Number of candidates before deduplication */
    originalCount: number;
    /** Number of clusters formed */
    clusterCount: number;
    /** Number of unique candidates after deduplication */
    dedupedCount: number;
    /** Number of duplicates removed */
    duplicatesRemoved: number;
  };
}

/**
 * Zod schema for DedupeStageOutput validation.
 */
export const DedupeStageOutputSchema = z.object({
  candidates: z.array(CandidateSchema),
  clusters: z.array(ClusterInfoSchema),
  stats: z.object({
    originalCount: z.number().int().nonnegative(),
    clusterCount: z.number().int().nonnegative(),
    dedupedCount: z.number().int().nonnegative(),
    duplicatesRemoved: z.number().int().nonnegative(),
  }),
});
