/**
 * Discovery Results Schema
 *
 * Zod schemas for the final discovery results output.
 * This is the primary output format for completed discovery runs.
 *
 * @see PRD Section 12.6 - Discovery Results Schema
 */

import { z } from 'zod';
import { CandidateSchema } from './candidate.js';

// ============================================================================
// Enum Schemas
// ============================================================================

/**
 * DegradationLevel: Indicates the overall health of a discovery run
 * @see PRD Section 12.6
 */
export const DegradationLevelSchema = z.enum([
  'none', // Everything succeeded
  'partial_workers', // Some workers failed
  'no_aggregation', // Aggregator failed, raw results
  'timeout', // Run timed out
  'failed', // Zero candidates
]);

export type DegradationLevel = z.infer<typeof DegradationLevelSchema>;

/**
 * WorkerStatus: Status of an individual worker execution
 */
export const WorkerStatusSchema = z.enum([
  'ok', // Worker completed successfully
  'error', // Worker failed completely
  'partial', // Worker returned partial results
  'skipped', // Worker was skipped (disabled or not applicable)
]);

export type WorkerStatus = z.infer<typeof WorkerStatusSchema>;

// ============================================================================
// Nested Object Schemas
// ============================================================================

/**
 * WorkerSummary: Summary of a single worker's execution
 * @see PRD Section 12.6
 */
export const WorkerSummarySchema = z.object({
  workerId: z.string().min(1),
  status: WorkerStatusSchema,
  durationMs: z.number().nonnegative(),
  candidateCount: z.number().nonnegative().int(),
  errorMessage: z.string().optional(),
});

export type WorkerSummary = z.infer<typeof WorkerSummarySchema>;

/**
 * ClusterInfo: Information about a cluster of similar candidates
 * @see PRD Section 12.6
 */
export const ClusterInfoSchema = z.object({
  clusterId: z.string().min(1),
  representativeCandidateId: z.string().min(1),
  alternateCandidateIds: z.array(z.string().min(1)),
});

export type ClusterInfo = z.infer<typeof ClusterInfoSchema>;

/**
 * Degradation: Details about any degradation in results quality
 * @see PRD Section 12.6
 */
export const DegradationSchema = z.object({
  level: DegradationLevelSchema,
  failedWorkers: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type Degradation = z.infer<typeof DegradationSchema>;

// ============================================================================
// Main Discovery Results Schema
// ============================================================================

/**
 * DiscoveryResults: Complete output of a discovery run
 * @see PRD Section 12.6 - Discovery Results Schema
 */
export const DiscoveryResultsSchema = z.object({
  schemaVersion: z.number().int().positive(),
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  createdAt: z.string().datetime(),
  durationMs: z.number().nonnegative(),
  enrichedIntent: z.record(z.string(), z.unknown()).optional(),
  candidates: z.array(CandidateSchema),
  clusters: z.array(ClusterInfoSchema).optional(),
  workerSummary: z.array(WorkerSummarySchema),
  degradation: DegradationSchema,
});

export type DiscoveryResults = z.infer<typeof DiscoveryResultsSchema>;

// ============================================================================
// Schema Version
// ============================================================================

export const DISCOVERY_RESULTS_SCHEMA_VERSION = 1;
