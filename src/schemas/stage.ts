/**
 * Stage Metadata Schema
 *
 * Each pipeline stage produces a JSON checkpoint with standard metadata.
 * This enables debugging, resuming from any stage, and iterating on components.
 *
 * @see PRD Section 11.3 - Stage Metadata
 */

import { z } from 'zod';
import { SCHEMA_VERSIONS } from './versions.js';
import { ISO8601TimestampSchema } from './common.js';

// ============================================================================
// Stage ID Pattern
// ============================================================================

/**
 * Stage IDs follow format: NN_stage_name
 * Examples: "00_enhancement", "08_top_candidates", "10_results"
 */
export const STAGE_ID_PATTERN = /^\d{2}_[a-z_]+$/;

export const StageIdSchema = z
  .string()
  .regex(STAGE_ID_PATTERN, 'Stage ID must match pattern NN_stage_name (e.g., "08_top_candidates")');

// ============================================================================
// Stage Metadata Schema
// ============================================================================

/**
 * StageMetadata: Standard metadata included in every stage output file.
 * Provides traceability and supports pipeline resume functionality.
 *
 * @see PRD Section 11.3 - "Each stage file includes standard metadata"
 */
export const StageMetadataSchema = z.object({
  /** Stage identifier: NN_stage_name format */
  stageId: StageIdSchema,

  /** Numeric stage number (0-10) */
  stageNumber: z.number().int().min(0).max(10),

  /** Human-readable stage name (e.g., "top_candidates") */
  stageName: z.string().min(1),

  /** Schema version for this stage format */
  schemaVersion: z.number().int().positive().default(SCHEMA_VERSIONS.stage),

  /** Session this stage belongs to */
  sessionId: z.string().min(1),

  /** Run ID this stage was produced in */
  runId: z.string().min(1),

  /** ISO8601 timestamp when stage completed */
  createdAt: ISO8601TimestampSchema,

  /** Previous stage that fed into this one */
  upstreamStage: z.string().optional(),

  /** Stage-specific configuration used */
  config: z.record(z.string(), z.unknown()).optional(),
});

export type StageMetadata = z.infer<typeof StageMetadataSchema>;

// ============================================================================
// Stage Output Wrapper
// ============================================================================

/**
 * Generic stage output wrapper with metadata.
 * All stage files have a _meta field containing StageMetadata.
 */
export const StageOutputSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    _meta: StageMetadataSchema,
    data: dataSchema,
  });

// ============================================================================
// Schema Version
// ============================================================================

export const STAGE_SCHEMA_VERSION = 1;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create stage metadata for a new stage output
 */
export function createStageMetadata(params: {
  stageNumber: number;
  stageName: string;
  sessionId: string;
  runId: string;
  upstreamStage?: string;
  config?: Record<string, unknown>;
}): StageMetadata {
  const stageId = `${params.stageNumber.toString().padStart(2, '0')}_${params.stageName}`;

  return {
    stageId,
    stageNumber: params.stageNumber,
    stageName: params.stageName,
    schemaVersion: STAGE_SCHEMA_VERSION,
    sessionId: params.sessionId,
    runId: params.runId,
    createdAt: new Date().toISOString(),
    upstreamStage: params.upstreamStage,
    config: params.config,
  };
}

/**
 * Parse stage number from a stage ID
 * @example parseStageNumber("08_top_candidates") // returns 8
 */
export function parseStageNumber(stageId: string): number {
  const match = stageId.match(/^(\d{2})_/);
  if (!match) {
    throw new Error(`Invalid stage ID format: ${stageId}`);
  }
  return parseInt(match[1], 10);
}

/**
 * Parse stage name from a stage ID
 * @example parseStageName("08_top_candidates") // returns "top_candidates"
 */
export function parseStageName(stageId: string): string {
  const match = stageId.match(/^\d{2}_(.+)$/);
  if (!match) {
    throw new Error(`Invalid stage ID format: ${stageId}`);
  }
  return match[1];
}
