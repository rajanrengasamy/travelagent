/**
 * Run Manifest Schema
 *
 * Each run produces manifest.json for integrity verification.
 * The manifest tracks all stages executed, their checksums, and pipeline status.
 *
 * @see PRD Section 11.6 - Run Manifest
 */

import { z } from 'zod';
import { SCHEMA_VERSIONS } from './versions.js';
import { ISO8601TimestampSchema } from './common.js';

// ============================================================================
// Stage Entry Schema
// ============================================================================

/**
 * Individual stage entry in the manifest.
 * Contains filename, checksum, and metadata for integrity verification.
 */
export const ManifestStageEntrySchema = z.object({
  /** Stage identifier (e.g., "08_top_candidates") */
  stageId: z.string().min(1),

  /** Output filename (e.g., "08_top_candidates.json") */
  filename: z.string().min(1),

  /** ISO8601 timestamp when stage completed */
  createdAt: ISO8601TimestampSchema,

  /** SHA-256 hash of the stage file contents */
  sha256: z.string().regex(/^[a-f0-9]{64}$/, 'Must be a valid SHA-256 hash'),

  /** File size in bytes */
  sizeBytes: z.number().int().nonnegative(),

  /** Previous stage that fed into this one */
  upstreamStage: z.string().optional(),
});

export type ManifestStageEntry = z.infer<typeof ManifestStageEntrySchema>;

// ============================================================================
// Main Manifest Schema
// ============================================================================

/**
 * RunManifest: Integrity manifest for a pipeline run
 *
 * @see PRD Section 11.6 - "Each run produces manifest.json for integrity verification"
 */
export const RunManifestSchema = z.object({
  /** Schema version for forward compatibility */
  schemaVersion: z.number().int().positive().default(SCHEMA_VERSIONS.manifest),

  /** Unique run identifier */
  runId: z.string().min(1),

  /** Session this run belongs to */
  sessionId: z.string().min(1),

  /** ISO8601 timestamp when manifest was created */
  createdAt: ISO8601TimestampSchema,

  /** Array of stage entries with checksums */
  stages: z.array(ManifestStageEntrySchema),

  /** Stage IDs that were executed in this run */
  stagesExecuted: z.array(z.string()),

  /** Stage IDs that were skipped (e.g., from-stage resume) */
  stagesSkipped: z.array(z.string()),

  /** The final stage ID that completed */
  finalStage: z.string().min(1),

  /** Whether the run completed successfully */
  success: z.boolean(),
});

export type RunManifest = z.infer<typeof RunManifestSchema>;

// ============================================================================
// Schema Version
// ============================================================================

export const MANIFEST_SCHEMA_VERSION = 1;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an empty manifest for a new run
 */
export function createEmptyManifest(runId: string, sessionId: string): RunManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    runId,
    sessionId,
    createdAt: new Date().toISOString(),
    stages: [],
    stagesExecuted: [],
    stagesSkipped: [],
    finalStage: '',
    success: false,
  };
}

/**
 * Add a stage entry to a manifest
 */
export function addStageToManifest(
  manifest: RunManifest,
  entry: ManifestStageEntry
): RunManifest {
  return {
    ...manifest,
    stages: [...manifest.stages, entry],
    stagesExecuted: [...manifest.stagesExecuted, entry.stageId],
    finalStage: entry.stageId,
  };
}

/**
 * Mark stages as skipped in the manifest
 */
export function markStagesSkipped(
  manifest: RunManifest,
  skippedStageIds: string[]
): RunManifest {
  return {
    ...manifest,
    stagesSkipped: [...manifest.stagesSkipped, ...skippedStageIds],
  };
}

/**
 * Finalize the manifest when run completes
 */
export function finalizeManifest(
  manifest: RunManifest,
  success: boolean
): RunManifest {
  return {
    ...manifest,
    success,
    createdAt: new Date().toISOString(), // Update to final timestamp
  };
}
