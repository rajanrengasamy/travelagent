/**
 * Manifest Generation Module
 *
 * Generates and manages run manifests with SHA-256 file integrity verification.
 * Each pipeline run produces a manifest.json tracking all stage files and their hashes.
 *
 * @module pipeline/manifest
 * @see PRD Section 11.6 - Run Manifest
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';

import {
  createEmptyManifest,
  addStageToManifest,
  markStagesSkipped,
  finalizeManifest,
  type RunManifest,
  type ManifestStageEntry,
} from '../schemas/manifest.js';
import {
  getStageFilePath,
  getManifestPath,
  atomicWriteJson,
  readJson,
  fileExists,
} from '../storage/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Stage information for manifest generation
 */
export interface StageFileInfo {
  /** Stage identifier (e.g., "08_top_candidates") */
  stageId: string;
  /** Numeric stage number (0-10) */
  stageNumber: number;
  /** Previous stage that fed into this one */
  upstreamStage?: string;
}

/**
 * Result of verifying a manifest's integrity
 */
export interface ManifestVerificationResult {
  /** Whether all stage hashes match */
  valid: boolean;
  /** Per-stage verification details */
  stages: Array<{
    stageId: string;
    expectedHash: string;
    actualHash: string;
    matches: boolean;
  }>;
}

// ============================================================================
// Hash Calculation
// ============================================================================

/**
 * Calculate SHA-256 hash of a file's contents.
 *
 * @param filePath - Absolute path to the file
 * @returns 64-character lowercase hex SHA-256 hash
 * @throws If file doesn't exist or can't be read
 *
 * @example
 * ```typescript
 * const hash = await calculateFileHash('/path/to/file.json');
 * // Returns: 'a3f2b1c4d5e6...' (64 chars)
 * ```
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ============================================================================
// Stage Entry Creation
// ============================================================================

/**
 * Create a ManifestStageEntry from a stage file.
 *
 * Reads the file, calculates its SHA-256 hash, and gets file metadata.
 *
 * @param sessionId - Session ID
 * @param runId - Run ID
 * @param stageId - Stage identifier (e.g., "08_top_candidates")
 * @param upstreamStage - Optional upstream stage identifier
 * @returns ManifestStageEntry with hash and metadata
 * @throws If stage file doesn't exist or can't be read
 *
 * @example
 * ```typescript
 * const entry = await createStageEntry('session-123', 'run-456', '08_top_candidates', '07_validated');
 * // Returns: { stageId: '08_top_candidates', sha256: 'abc123...', sizeBytes: 1234, ... }
 * ```
 */
export async function createStageEntry(
  sessionId: string,
  runId: string,
  stageId: string,
  upstreamStage?: string
): Promise<ManifestStageEntry> {
  const filePath = getStageFilePath(sessionId, runId, stageId);

  // Fetch hash and file stats in parallel for efficiency
  const [hash, stats] = await Promise.all([
    calculateFileHash(filePath),
    fs.stat(filePath),
  ]);

  return {
    stageId,
    filename: `${stageId}.json`,
    createdAt: stats.mtime.toISOString(),
    sha256: hash,
    sizeBytes: stats.size,
    upstreamStage,
  };
}

// ============================================================================
// Manifest Generation
// ============================================================================

/**
 * Generate a manifest for a completed run.
 *
 * Scans all executed stage files and computes their SHA-256 hashes.
 * Records which stages were executed vs skipped (for resume runs).
 *
 * @param sessionId - Session ID
 * @param runId - Run ID
 * @param executedStages - Array of stages that were executed (not skipped)
 * @param skippedStages - Array of stage IDs that were skipped (from-stage resume)
 * @param success - Whether the run completed successfully
 * @returns Complete RunManifest with all stage hashes
 *
 * @example
 * ```typescript
 * const manifest = await generateManifest(
 *   'session-123',
 *   'run-456',
 *   [
 *     { stageId: '08_top_candidates', stageNumber: 8, upstreamStage: '07_validated' },
 *     { stageId: '09_aggregator_output', stageNumber: 9, upstreamStage: '08_top_candidates' },
 *   ],
 *   ['00_enhancement', '01_intake', '02_router', ...],  // skipped stages
 *   true
 * );
 * ```
 */
export async function generateManifest(
  sessionId: string,
  runId: string,
  executedStages: StageFileInfo[],
  skippedStages: string[],
  success: boolean
): Promise<RunManifest> {
  // 1. Create empty manifest
  let manifest = createEmptyManifest(runId, sessionId);

  // 2. Process each executed stage and add to manifest
  for (const stage of executedStages) {
    const entry = await createStageEntry(
      sessionId,
      runId,
      stage.stageId,
      stage.upstreamStage
    );
    manifest = addStageToManifest(manifest, entry);
  }

  // 3. Mark skipped stages
  if (skippedStages.length > 0) {
    manifest = markStagesSkipped(manifest, skippedStages);
  }

  // 4. Finalize manifest with success status
  manifest = finalizeManifest(manifest, success);

  return manifest;
}

// ============================================================================
// Manifest Persistence
// ============================================================================

/**
 * Save a manifest to the run directory.
 *
 * Uses atomic write to ensure file integrity.
 *
 * @param sessionId - Session ID
 * @param runId - Run ID
 * @param manifest - The manifest to save
 * @returns Path where manifest was saved
 *
 * @example
 * ```typescript
 * const path = await saveManifest('session-123', 'run-456', manifest);
 * // Returns: '/path/to/sessions/session-123/runs/run-456/manifest.json'
 * ```
 */
export async function saveManifest(
  sessionId: string,
  runId: string,
  manifest: RunManifest
): Promise<string> {
  const manifestPath = getManifestPath(sessionId, runId);
  await atomicWriteJson(manifestPath, manifest);
  return manifestPath;
}

/**
 * Load an existing manifest from a run directory.
 *
 * @param sessionId - Session ID
 * @param runId - Run ID
 * @returns The loaded manifest, or null if it doesn't exist
 *
 * @example
 * ```typescript
 * const manifest = await loadManifest('session-123', 'run-456');
 * if (manifest) {
 *   console.log(`Run completed: ${manifest.success}`);
 * }
 * ```
 */
export async function loadManifest(
  sessionId: string,
  runId: string
): Promise<RunManifest | null> {
  const manifestPath = getManifestPath(sessionId, runId);

  const exists = await fileExists(manifestPath);
  if (!exists) {
    return null;
  }

  return readJson<RunManifest>(manifestPath);
}

// ============================================================================
// Manifest Verification
// ============================================================================

/**
 * Verify manifest integrity by recalculating hashes.
 *
 * Compares stored SHA-256 hashes against recalculated hashes for each stage file.
 * Useful for detecting file corruption or tampering.
 *
 * @param sessionId - Session ID
 * @param runId - Run ID
 * @returns Verification result with per-stage hash comparison
 * @throws If manifest doesn't exist
 *
 * @example
 * ```typescript
 * const result = await verifyManifest('session-123', 'run-456');
 * if (!result.valid) {
 *   const corrupted = result.stages.filter(s => !s.matches);
 *   console.error('Corrupted stages:', corrupted.map(s => s.stageId));
 * }
 * ```
 */
export async function verifyManifest(
  sessionId: string,
  runId: string
): Promise<ManifestVerificationResult> {
  const manifest = await loadManifest(sessionId, runId);
  if (!manifest) {
    throw new Error(`Manifest not found for run ${runId} in session ${sessionId}`);
  }

  const stageResults: ManifestVerificationResult['stages'] = [];
  let allValid = true;

  for (const stage of manifest.stages) {
    const filePath = getStageFilePath(sessionId, runId, stage.stageId);

    let actualHash: string;
    try {
      actualHash = await calculateFileHash(filePath);
    } catch {
      // File missing or unreadable - mark as invalid
      actualHash = '<file_not_found>';
    }

    const matches = actualHash === stage.sha256;
    if (!matches) {
      allValid = false;
    }

    stageResults.push({
      stageId: stage.stageId,
      expectedHash: stage.sha256,
      actualHash,
      matches,
    });
  }

  return {
    valid: allValid,
    stages: stageResults,
  };
}
