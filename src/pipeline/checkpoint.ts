/**
 * Checkpoint Writing Module
 *
 * Wraps stage output with metadata and writes checkpoints atomically.
 * All checkpoints follow the structure: { _meta: StageMetadata, data: <stage output> }
 *
 * @module pipeline/checkpoint
 * @see PRD Section 11.3 - Stage Metadata
 */

import * as fs from 'node:fs/promises';
import {
  createStageMetadata,
  StageMetadataSchema,
  type StageMetadata,
} from '../schemas/stage.js';
import {
  saveStageFile,
  loadStageFile,
  getStageFilePath,
} from '../storage/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for writing a checkpoint
 */
export interface CheckpointOptions {
  /** Stage-specific configuration to include in metadata */
  config?: Record<string, unknown>;
  /** Upstream stage ID that produced input for this stage */
  upstreamStage?: string;
}

/**
 * Result of writing a checkpoint
 */
export interface CheckpointResult {
  /** Full path where checkpoint was written */
  filePath: string;
  /** The metadata that was injected */
  metadata: StageMetadata;
  /** File size in bytes */
  sizeBytes: number;
}

/**
 * Structure of a checkpoint file
 */
export interface Checkpoint<T = unknown> {
  _meta: StageMetadata;
  data: T;
}

// ============================================================================
// Write Functions
// ============================================================================

/**
 * Write a stage checkpoint with automatically injected metadata.
 *
 * Creates a checkpoint file with structure:
 * {
 *   _meta: StageMetadata,
 *   data: <provided data>
 * }
 *
 * Uses atomic write (temp file + rename) to prevent corruption.
 *
 * @param sessionId - Session this checkpoint belongs to
 * @param runId - Run ID for this execution
 * @param stageNumber - Stage number (0-10)
 * @param stageName - Stage name (e.g., "top_candidates")
 * @param data - The stage output data to checkpoint
 * @param options - Optional config and upstream stage info
 * @returns CheckpointResult with file path and metadata
 *
 * @example
 * const result = await writeCheckpoint(
 *   'session-123',
 *   'run-456',
 *   8,
 *   'top_candidates',
 *   { candidates: [...] },
 *   { upstreamStage: '07_candidates_validated' }
 * );
 */
export async function writeCheckpoint(
  sessionId: string,
  runId: string,
  stageNumber: number,
  stageName: string,
  data: unknown,
  options?: CheckpointOptions
): Promise<CheckpointResult> {
  // 1. Create stage metadata using createStageMetadata from schemas
  const metadata = createStageMetadata({
    stageNumber,
    stageName,
    sessionId,
    runId,
    upstreamStage: options?.upstreamStage,
    config: options?.config,
  });

  // 2. Build checkpoint structure: { _meta, data }
  const checkpoint: Checkpoint = {
    _meta: metadata,
    data,
  };

  // 3. Use saveStageFile (which uses atomicWriteJson internally)
  await saveStageFile(sessionId, runId, metadata.stageId, checkpoint);

  // 4. Get file path and size for the result
  const filePath = getStageFilePath(sessionId, runId, metadata.stageId);
  const stats = await fs.stat(filePath);

  // 5. Return CheckpointResult
  return {
    filePath,
    metadata,
    sizeBytes: stats.size,
  };
}

// ============================================================================
// Read Functions
// ============================================================================

/**
 * Read a checkpoint and extract just the data (without metadata).
 *
 * @param sessionId - Session ID
 * @param runId - Run ID
 * @param stageId - Stage ID (format: NN_stage_name)
 * @returns The data field from the checkpoint
 * @throws Error if checkpoint file doesn't exist or has invalid structure
 *
 * @example
 * const data = await readCheckpointData<{ candidates: Candidate[] }>(
 *   'session-1',
 *   'run-1',
 *   '08_top_candidates'
 * );
 */
export async function readCheckpointData<T>(
  sessionId: string,
  runId: string,
  stageId: string
): Promise<T> {
  const checkpoint = await loadStageFile<Checkpoint<T>>(sessionId, runId, stageId);

  if (!validateCheckpointStructure(checkpoint)) {
    throw new Error(
      `Invalid checkpoint structure for ${stageId}: missing _meta or data field`
    );
  }

  return checkpoint.data;
}

/**
 * Read a checkpoint's metadata only.
 *
 * @param sessionId - Session ID
 * @param runId - Run ID
 * @param stageId - Stage ID (format: NN_stage_name)
 * @returns The StageMetadata from the checkpoint
 * @throws Error if checkpoint file doesn't exist or has invalid structure
 *
 * @example
 * const meta = await readCheckpointMetadata('session-1', 'run-1', '08_top_candidates');
 * console.log(meta.createdAt);
 */
export async function readCheckpointMetadata(
  sessionId: string,
  runId: string,
  stageId: string
): Promise<StageMetadata> {
  const checkpoint = await loadStageFile<Checkpoint>(sessionId, runId, stageId);

  if (!validateCheckpointStructure(checkpoint)) {
    throw new Error(
      `Invalid checkpoint structure for ${stageId}: missing _meta or data field`
    );
  }

  return checkpoint._meta;
}

/**
 * Read a full checkpoint including both metadata and data.
 *
 * @param sessionId - Session ID
 * @param runId - Run ID
 * @param stageId - Stage ID (format: NN_stage_name)
 * @returns The full checkpoint object
 * @throws Error if checkpoint file doesn't exist or has invalid structure
 */
export async function readCheckpoint<T>(
  sessionId: string,
  runId: string,
  stageId: string
): Promise<Checkpoint<T>> {
  const checkpoint = await loadStageFile<Checkpoint<T>>(sessionId, runId, stageId);

  if (!validateCheckpointStructure(checkpoint)) {
    throw new Error(
      `Invalid checkpoint structure for ${stageId}: missing _meta or data field`
    );
  }

  return checkpoint;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate that a checkpoint has correct structure.
 *
 * Checks for:
 * - Presence of _meta field
 * - Presence of data field
 * - Valid _meta structure (validates against StageMetadataSchema)
 *
 * @param checkpoint - The checkpoint object to validate
 * @returns true if checkpoint has valid structure, false otherwise
 *
 * @example
 * const isValid = validateCheckpointStructure(loadedData);
 * if (!isValid) {
 *   throw new Error('Invalid checkpoint');
 * }
 */
export function validateCheckpointStructure(checkpoint: unknown): checkpoint is Checkpoint {
  // Check basic object structure
  if (typeof checkpoint !== 'object' || checkpoint === null) {
    return false;
  }

  const obj = checkpoint as Record<string, unknown>;

  // Check for _meta field
  if (!('_meta' in obj) || obj._meta === undefined) {
    return false;
  }

  // Check for data field (can be any value including null, but key must exist)
  if (!('data' in obj)) {
    return false;
  }

  // Validate _meta against StageMetadataSchema
  const metaResult = StageMetadataSchema.safeParse(obj._meta);
  if (!metaResult.success) {
    return false;
  }

  return true;
}

/**
 * Get detailed validation errors for a checkpoint structure.
 *
 * @param checkpoint - The checkpoint object to validate
 * @returns Array of validation error messages, empty if valid
 */
export function getCheckpointValidationErrors(checkpoint: unknown): string[] {
  const errors: string[] = [];

  if (typeof checkpoint !== 'object' || checkpoint === null) {
    errors.push('Checkpoint must be a non-null object');
    return errors;
  }

  const obj = checkpoint as Record<string, unknown>;

  if (!('_meta' in obj) || obj._meta === undefined) {
    errors.push('Missing required field: _meta');
  }

  if (!('data' in obj)) {
    errors.push('Missing required field: data');
  }

  if ('_meta' in obj && obj._meta !== undefined) {
    const metaResult = StageMetadataSchema.safeParse(obj._meta);
    if (!metaResult.success) {
      for (const issue of metaResult.error.issues) {
        errors.push(`_meta.${issue.path.join('.')}: ${issue.message}`);
      }
    }
  }

  return errors;
}
