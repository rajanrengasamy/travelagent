/**
 * Export Bundler
 *
 * Creates export bundles from session/run data for sharing or backup.
 * Bundles include results, triage state, session info, and optionally stages/raw outputs.
 *
 * @module export/bundler
 * @see PRD Section 21.0 - Export Functionality
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import {
  getSessionDir,
  getRunDir,
  getExportsDir,
  getSessionJsonPath,
  getTriageFilePath,
  getResultsJsonPath,
  getResultsMdPath,
  fileExists,
  atomicWriteJson,
  listStageFiles,
} from '../storage/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for export bundle creation
 */
export interface ExportOptions {
  /** Include stage checkpoint files */
  includeStages?: boolean;

  /** Include raw worker outputs */
  includeRaw?: boolean;

  /** Custom output directory (defaults to run's export dir) */
  outputDir?: string;
}

/**
 * Export bundle manifest describing bundle contents
 */
export interface ExportBundleManifest {
  /** Bundle schema version */
  schemaVersion: number;

  /** ISO8601 timestamp when bundle was created */
  createdAt: string;

  /** Session ID */
  sessionId: string;

  /** Run ID */
  runId: string;

  /** List of files included in bundle */
  files: ExportFileEntry[];

  /** Bundle options used */
  options: ExportOptions;
}

/**
 * Entry describing a file in the export bundle
 */
export interface ExportFileEntry {
  /** Relative path within bundle */
  relativePath: string;

  /** File size in bytes */
  sizeBytes: number;

  /** File category */
  category: 'results' | 'session' | 'triage' | 'cost' | 'stage' | 'raw';
}

/**
 * Result of bundle creation
 */
export interface BundleResult {
  /** Path to the created bundle directory */
  bundlePath: string;

  /** Bundle manifest */
  manifest: ExportBundleManifest;

  /** Total size of all files */
  totalSizeBytes: number;

  /** Count of files by category */
  fileCounts: Record<string, number>;
}

// ============================================================================
// Constants
// ============================================================================

const BUNDLE_SCHEMA_VERSION = 1;

/**
 * Default files that are always included in exports
 */
const DEFAULT_EXPORT_FILES = [
  { source: 'results.json', category: 'results' as const },
  { source: 'results.md', category: 'results' as const },
  { source: 'session.json', category: 'session' as const },
  { source: 'triage.json', category: 'triage' as const },
  { source: 'cost.json', category: 'cost' as const },
];

// ============================================================================
// Bundle Creation
// ============================================================================

/**
 * Creates an export bundle from session/run data.
 *
 * The bundle includes:
 * - Always: results.json, results.md, triage.json, session.json, cost.json
 * - With includeStages: stages/ directory with checkpoint files
 * - With includeRaw: raw/ directory with worker outputs
 *
 * @param sessionId - Session ID to export
 * @param runId - Run ID to export (defaults to 'latest')
 * @param options - Export options
 * @returns Path to the created bundle directory
 *
 * @example
 * ```typescript
 * const bundlePath = await createExportBundle(
 *   '20260115-japan-temples',
 *   '20260115-143000-full',
 *   { includeStages: true }
 * );
 * // Returns: '~/.travelagent/sessions/.../exports/20260115-143512'
 * ```
 */
export async function createExportBundle(
  sessionId: string,
  runId: string = 'latest',
  options: ExportOptions = {}
): Promise<BundleResult> {
  // Validate inputs
  if (!sessionId || sessionId.trim() === '') {
    throw new Error('sessionId is required');
  }

  // Resolve 'latest' to actual run ID
  const resolvedRunId = await resolveRunId(sessionId, runId);

  // Create bundle directory with timestamp
  const bundleDir = await createBundleDirectory(sessionId, resolvedRunId, options);

  // Initialize manifest
  const manifest: ExportBundleManifest = {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    sessionId,
    runId: resolvedRunId,
    files: [],
    options,
  };

  // Copy default files
  await copyDefaultFiles(sessionId, resolvedRunId, bundleDir, manifest);

  // Optionally include stages
  if (options.includeStages) {
    await copyStageFiles(sessionId, resolvedRunId, bundleDir, manifest);
  }

  // Optionally include raw outputs
  if (options.includeRaw) {
    await copyRawFiles(sessionId, resolvedRunId, bundleDir, manifest);
  }

  // Write manifest
  const manifestPath = path.join(bundleDir, 'manifest.json');
  await atomicWriteJson(manifestPath, manifest);

  // Calculate totals
  const totalSizeBytes = manifest.files.reduce((sum, f) => sum + f.sizeBytes, 0);
  const fileCounts = manifest.files.reduce(
    (counts, f) => {
      counts[f.category] = (counts[f.category] || 0) + 1;
      return counts;
    },
    {} as Record<string, number>
  );

  return {
    bundlePath: bundleDir,
    manifest,
    totalSizeBytes,
    fileCounts,
  };
}

/**
 * Resolves 'latest' run ID to actual run ID by reading symlink
 */
async function resolveRunId(sessionId: string, runId: string): Promise<string> {
  if (runId !== 'latest') {
    return runId;
  }

  const latestPath = path.join(getSessionDir(sessionId), 'runs', 'latest');
  try {
    const target = await fs.readlink(latestPath);
    return path.basename(target);
  } catch {
    throw new Error(`No 'latest' run found for session ${sessionId}`);
  }
}

/**
 * Creates the bundle directory with timestamp
 */
async function createBundleDirectory(
  sessionId: string,
  runId: string,
  options: ExportOptions
): Promise<string> {
  // Use custom output dir or default to exports dir
  const baseDir = options.outputDir || getExportsDir(sessionId, runId);

  // Create timestamped bundle directory with milliseconds for uniqueness
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23);
  const bundleDir = path.join(baseDir, `export-${timestamp}`);

  await fs.mkdir(bundleDir, { recursive: true });
  return bundleDir;
}

/**
 * Copies default export files to bundle
 */
async function copyDefaultFiles(
  sessionId: string,
  runId: string,
  bundleDir: string,
  manifest: ExportBundleManifest
): Promise<void> {
  const runDir = getRunDir(sessionId, runId);

  for (const file of DEFAULT_EXPORT_FILES) {
    let sourcePath: string;

    // Determine source path based on file
    switch (file.source) {
      case 'session.json':
        sourcePath = getSessionJsonPath(sessionId);
        break;
      case 'triage.json':
        sourcePath = getTriageFilePath(sessionId);
        break;
      case 'results.json':
        sourcePath = getResultsJsonPath(sessionId, runId);
        break;
      case 'results.md':
        sourcePath = getResultsMdPath(sessionId, runId);
        break;
      case 'cost.json':
        sourcePath = path.join(runDir, 'cost.json');
        break;
      default:
        continue;
    }

    // Check if file exists and copy
    if (await fileExists(sourcePath)) {
      const destPath = path.join(bundleDir, file.source);
      await copyFile(sourcePath, destPath);

      const stats = await fs.stat(destPath);
      manifest.files.push({
        relativePath: file.source,
        sizeBytes: stats.size,
        category: file.category,
      });
    }
  }
}

/**
 * Copies stage checkpoint files to bundle
 */
async function copyStageFiles(
  sessionId: string,
  runId: string,
  bundleDir: string,
  manifest: ExportBundleManifest
): Promise<void> {
  const stagesDir = path.join(bundleDir, 'stages');
  await fs.mkdir(stagesDir, { recursive: true });

  // Get list of stage IDs (without .json extension)
  const stageIds = await listStageFiles(sessionId, runId);

  for (const stageId of stageIds) {
    const stageFile = `${stageId}.json`;
    const runDir = getRunDir(sessionId, runId);
    const sourcePath = path.join(runDir, stageFile);
    const destPath = path.join(stagesDir, stageFile);

    if (await fileExists(sourcePath)) {
      await copyFile(sourcePath, destPath);

      const stats = await fs.stat(destPath);
      manifest.files.push({
        relativePath: `stages/${stageFile}`,
        sizeBytes: stats.size,
        category: 'stage',
      });
    }
  }
}

/**
 * Copies raw worker output files to bundle
 */
async function copyRawFiles(
  sessionId: string,
  runId: string,
  bundleDir: string,
  manifest: ExportBundleManifest
): Promise<void> {
  const rawDir = path.join(bundleDir, 'raw');
  await fs.mkdir(rawDir, { recursive: true });

  const runDir = getRunDir(sessionId, runId);
  const sourceRawDir = path.join(runDir, 'raw');

  // Check if raw directory exists
  if (!(await fileExists(sourceRawDir))) {
    return;
  }

  // Copy all files from raw directory
  try {
    const rawFiles = await fs.readdir(sourceRawDir);

    for (const rawFile of rawFiles) {
      const sourcePath = path.join(sourceRawDir, rawFile);
      const destPath = path.join(rawDir, rawFile);

      // Only copy files (not directories)
      const sourceStats = await fs.stat(sourcePath);
      if (sourceStats.isFile()) {
        await copyFile(sourcePath, destPath);

        manifest.files.push({
          relativePath: `raw/${rawFile}`,
          sizeBytes: sourceStats.size,
          category: 'raw',
        });
      }
    }
  } catch (error) {
    // Raw directory may not exist for all runs
  }
}

/**
 * Copies a file from source to destination
 */
async function copyFile(source: string, dest: string): Promise<void> {
  await fs.copyFile(source, dest);
}

// ============================================================================
// Bundle Validation
// ============================================================================

/**
 * Validates a bundle directory has required files
 *
 * @param bundlePath - Path to bundle directory
 * @returns Validation result with any missing files
 */
export async function validateBundle(bundlePath: string): Promise<{
  valid: boolean;
  manifestPresent: boolean;
  missingRequired: string[];
  presentFiles: string[];
}> {
  const presentFiles: string[] = [];
  const missingRequired: string[] = [];

  // Check for manifest
  const manifestPath = path.join(bundlePath, 'manifest.json');
  const manifestPresent = await fileExists(manifestPath);

  // Required files
  const requiredFiles = ['results.json', 'session.json'];

  for (const file of requiredFiles) {
    const filePath = path.join(bundlePath, file);
    if (await fileExists(filePath)) {
      presentFiles.push(file);
    } else {
      missingRequired.push(file);
    }
  }

  // Check for optional files
  const optionalFiles = ['results.md', 'triage.json', 'cost.json'];
  for (const file of optionalFiles) {
    const filePath = path.join(bundlePath, file);
    if (await fileExists(filePath)) {
      presentFiles.push(file);
    }
  }

  return {
    valid: manifestPresent && missingRequired.length === 0,
    manifestPresent,
    missingRequired,
    presentFiles,
  };
}

// ============================================================================
// Bundle Listing
// ============================================================================

/**
 * Lists all export bundles for a session/run
 *
 * @param sessionId - Session ID
 * @param runId - Run ID
 * @returns Array of bundle info with paths and timestamps
 */
export async function listBundles(
  sessionId: string,
  runId: string
): Promise<
  Array<{
    bundlePath: string;
    bundleName: string;
    createdAt: string;
  }>
> {
  const exportsDir = getExportsDir(sessionId, runId);

  try {
    const entries = await fs.readdir(exportsDir);
    const bundles: Array<{
      bundlePath: string;
      bundleName: string;
      createdAt: string;
    }> = [];

    for (const entry of entries) {
      const entryPath = path.join(exportsDir, entry);
      const stats = await fs.stat(entryPath);

      if (stats.isDirectory() && entry.startsWith('export-')) {
        // Try to parse timestamp from directory name
        const timestampMatch = entry.match(/^export-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})$/);
        let createdAt = stats.mtime.toISOString();

        if (timestampMatch) {
          // Parse timestamp from directory name
          createdAt = timestampMatch[1].replace(/-/g, (m, offset) =>
            offset === 4 || offset === 7 ? '-' : offset === 13 || offset === 16 ? ':' : m
          );
        }

        bundles.push({
          bundlePath: entryPath,
          bundleName: entry,
          createdAt,
        });
      }
    }

    // Sort by creation time (newest first)
    return bundles.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

// ============================================================================
// Bundle Deletion
// ============================================================================

/**
 * Deletes an export bundle
 *
 * @param bundlePath - Path to bundle directory to delete
 */
export async function deleteBundle(bundlePath: string): Promise<void> {
  // Validate it's a bundle directory (has manifest.json or starts with export-)
  const isBundle =
    (await fileExists(path.join(bundlePath, 'manifest.json'))) ||
    path.basename(bundlePath).startsWith('export-');

  if (!isBundle) {
    throw new Error('Path does not appear to be an export bundle');
  }

  await fs.rm(bundlePath, { recursive: true });
}
