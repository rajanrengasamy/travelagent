/**
 * Candidate Clustering for Deduplication
 *
 * Groups similar candidates into clusters using a two-phase approach:
 * 1. Phase 1: ID-based exact matching (placeId or content hash)
 * 2. Phase 2: Similarity-based clustering (threshold 0.80)
 *
 * Merge strategy:
 * - Highest score candidate becomes representative
 * - Up to 3 alternates with different origins preserved
 * - All sourceRefs merged (deduplicated by URL)
 *
 * @module dedupe/cluster
 * @see PRD Section 14.1 - Two-Phase Deduplication Strategy
 * @see TODO Section 13.4 - Cluster formation and merging
 */

import type { Candidate, CandidateOrigin, SourceRef } from '../schemas/candidate.js';
import { generateCandidateHash } from './hash.js';
import { candidateSimilarity, CANDIDATE_SIMILARITY_THRESHOLD } from './similarity.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Information about a cluster of similar candidates.
 */
export interface ClusterInfo {
  /** Unique identifier for this cluster */
  clusterId: string;
  /** The best candidate representing this cluster */
  representative: Candidate;
  /** Up to 3 alternate candidates with different origins */
  alternates: Candidate[];
  /** Total number of candidates merged into this cluster */
  memberCount: number;
}

/**
 * Result of the clustering process.
 */
export interface ClusterResult {
  /** All clusters formed from the input candidates */
  clusters: ClusterInfo[];
  /** Deduplicated candidates (one per cluster, with merged data) */
  dedupedCandidates: Candidate[];
  /** Statistics about the clustering process */
  stats: {
    originalCount: number;
    clusterCount: number;
    dedupedCount: number;
    duplicatesRemoved: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of alternate candidates to preserve per cluster */
const MAX_ALTERNATES = 3;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Groups candidates by exact ID matches (placeId or content hash).
 *
 * Phase 1 of deduplication: If Google placeId matches or if generated
 * content hash matches, candidates are grouped together.
 *
 * @param candidates - Input candidates to group
 * @returns Map of group key to candidates in that group
 */
function groupByExactId(candidates: Candidate[]): Map<string, Candidate[]> {
  const groups = new Map<string, Candidate[]>();

  for (const candidate of candidates) {
    // Priority 1: Use placeId if available (most reliable)
    // Priority 2: Fall back to content hash
    const placeId = candidate.metadata?.placeId;
    const key = placeId ? `place:${placeId}` : `hash:${generateCandidateHash(candidate)}`;

    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }

  return groups;
}

/**
 * Merges similar candidates from initial groups into final clusters.
 *
 * Phase 2 of deduplication: Uses candidateSimilarity() to find
 * groups that should be merged even if they don't share exact IDs.
 *
 * @param groups - Initial groups from Phase 1
 * @returns Final cluster information
 */
function mergeSimilarCandidates(groups: Map<string, Candidate[]>): ClusterInfo[] {
  const groupList = Array.from(groups.values());
  const mergedGroups: Candidate[][] = [];
  const processed = new Set<number>();

  for (let i = 0; i < groupList.length; i++) {
    if (processed.has(i)) continue;

    const currentCluster = [...groupList[i]];
    processed.add(i);

    // Try to merge with other groups based on similarity
    for (let j = i + 1; j < groupList.length; j++) {
      if (processed.has(j)) continue;

      // Compare using the highest-scored candidate from each group
      const rep1 = getHighestScoreCandidate(currentCluster);
      const rep2 = getHighestScoreCandidate(groupList[j]);

      if (candidateSimilarity(rep1, rep2) >= CANDIDATE_SIMILARITY_THRESHOLD) {
        currentCluster.push(...groupList[j]);
        processed.add(j);
      }
    }

    mergedGroups.push(currentCluster);
  }

  // Convert merged groups to ClusterInfo
  return mergedGroups.map((members, index) => createClusterInfo(members, index));
}

/**
 * Gets the candidate with the highest score from a list.
 *
 * @param candidates - Candidates to compare
 * @returns Candidate with highest score
 */
function getHighestScoreCandidate(candidates: Candidate[]): Candidate {
  if (candidates.length === 0) {
    throw new Error('Cannot get highest score from empty candidate list');
  }
  if (candidates.length === 1) {
    return candidates[0];
  }

  return candidates.reduce((best, current) => (current.score > best.score ? current : best));
}

/**
 * Selects up to 3 alternates with different origins from the representative.
 *
 * Prioritizes diversity: prefers candidates from origins not yet represented.
 *
 * @param candidates - All candidates in the cluster (excluding representative)
 * @param representativeOrigin - Origin of the representative candidate
 * @returns Up to 3 alternate candidates with diverse origins
 */
function selectDiverseAlternates(
  candidates: Candidate[],
  representativeOrigin: CandidateOrigin
): Candidate[] {
  if (candidates.length === 0) return [];

  // Sort by score descending
  const sorted = [...candidates].sort((a, b) => b.score - a.score);

  const alternates: Candidate[] = [];
  const usedOrigins = new Set<CandidateOrigin>([representativeOrigin]);

  // First pass: select candidates with different origins
  for (const candidate of sorted) {
    if (alternates.length >= MAX_ALTERNATES) break;

    if (!usedOrigins.has(candidate.origin)) {
      alternates.push(candidate);
      usedOrigins.add(candidate.origin);
    }
  }

  // Second pass: if we still have room, fill with highest-scored remaining
  if (alternates.length < MAX_ALTERNATES) {
    for (const candidate of sorted) {
      if (alternates.length >= MAX_ALTERNATES) break;

      if (!alternates.includes(candidate)) {
        alternates.push(candidate);
      }
    }
  }

  return alternates;
}

/**
 * Creates ClusterInfo for a group of candidates.
 *
 * Implements the merge strategy:
 * 1. Sort by score (descending)
 * 2. Highest score becomes representative
 * 3. Keep up to 3 alternates with different origins
 *
 * @param members - All candidates in this cluster
 * @param index - Cluster index for ID generation
 * @returns ClusterInfo with representative and alternates
 */
function createClusterInfo(members: Candidate[], index: number): ClusterInfo {
  const clusterId = `cluster_${index.toString().padStart(3, '0')}`;

  // Sort by score descending to find representative
  const sorted = [...members].sort((a, b) => b.score - a.score);
  const representative = sorted[0];
  const others = sorted.slice(1);

  // Select diverse alternates
  const alternates = selectDiverseAlternates(others, representative.origin);

  return {
    clusterId,
    representative,
    alternates,
    memberCount: members.length,
  };
}

/**
 * Merges all sourceRefs from cluster members, deduplicating by URL.
 *
 * @param cluster - Cluster information with all members
 * @returns Deduplicated array of source references
 */
function mergeClusterSourceRefs(cluster: ClusterInfo): SourceRef[] {
  const seenUrls = new Set<string>();
  const merged: SourceRef[] = [];

  // Start with representative's sourceRefs
  for (const ref of cluster.representative.sourceRefs) {
    if (!seenUrls.has(ref.url)) {
      seenUrls.add(ref.url);
      merged.push(ref);
    }
  }

  // Add alternates' sourceRefs
  for (const alt of cluster.alternates) {
    for (const ref of alt.sourceRefs) {
      if (!seenUrls.has(ref.url)) {
        seenUrls.add(ref.url);
        merged.push(ref);
      }
    }
  }

  return merged;
}

/**
 * Merges all tags from cluster members, deduplicating.
 *
 * @param cluster - Cluster information with all members
 * @returns Deduplicated array of tags
 * @see TODO Section 13.4.4 - Merge tags from all cluster members
 */
function mergeClusterTags(cluster: ClusterInfo): string[] {
  const seenTags = new Set<string>();

  // Start with representative's tags
  for (const tag of cluster.representative.tags) {
    seenTags.add(tag.toLowerCase());
  }

  // Add alternates' tags
  for (const alt of cluster.alternates) {
    for (const tag of alt.tags) {
      seenTags.add(tag.toLowerCase());
    }
  }

  // Return sorted array for consistent output
  return Array.from(seenTags).sort();
}

/**
 * Merges cluster data into a single deduplicated candidate.
 *
 * Creates a new candidate based on the representative with:
 * - Merged sourceRefs from all cluster members
 * - Merged tags from all cluster members
 * - Assigned clusterId
 *
 * @param cluster - Cluster to merge
 * @returns Merged candidate suitable for output
 * @see TODO Section 13.4.4 - Merge strategy
 */
function mergeClusterToCandidate(cluster: ClusterInfo): Candidate {
  return {
    ...cluster.representative,
    clusterId: cluster.clusterId,
    sourceRefs: mergeClusterSourceRefs(cluster),
    tags: mergeClusterTags(cluster),
  };
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Forms clusters from candidates and produces deduplicated output.
 *
 * Two-phase algorithm:
 * - Phase 1: Group by exact ID (placeId or content hash)
 * - Phase 2: Merge groups with similarity >= 0.80
 *
 * Merge strategy:
 * - Highest score candidate becomes representative
 * - Up to 3 alternates with different origins preserved
 * - All sourceRefs merged (deduplicated by URL)
 *
 * @param candidates - Input candidates from normalization stage
 * @returns ClusterResult with clusters, deduplicated candidates, and stats
 *
 * @example
 * ```typescript
 * const result = formClusters(normalizedCandidates);
 * console.log(`Reduced ${result.stats.originalCount} to ${result.stats.dedupedCount}`);
 * console.log(`Formed ${result.clusters.length} clusters`);
 * ```
 */
export function formClusters(candidates: Candidate[]): ClusterResult {
  const originalCount = candidates.length;

  // Handle empty input
  if (originalCount === 0) {
    return {
      clusters: [],
      dedupedCandidates: [],
      stats: {
        originalCount: 0,
        clusterCount: 0,
        dedupedCount: 0,
        duplicatesRemoved: 0,
      },
    };
  }

  // Phase 1: Group by exact ID matches (placeId or hash)
  const idGroups = groupByExactId(candidates);

  // Phase 2: Merge similar candidates within groups and across
  const clusters = mergeSimilarCandidates(idGroups);

  // Create deduped list with merged sourceRefs
  const dedupedCandidates = clusters.map((c) => mergeClusterToCandidate(c));

  return {
    clusters,
    dedupedCandidates,
    stats: {
      originalCount,
      clusterCount: clusters.length,
      dedupedCount: dedupedCandidates.length,
      duplicatesRemoved: originalCount - dedupedCandidates.length,
    },
  };
}
