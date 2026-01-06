/**
 * Path Resolution Utilities
 *
 * Provides consistent path generation for the storage layer.
 * All paths follow the structure defined in PRD Section 13.
 *
 * Directory Structure:
 * ```
 * ~/.travelagent/                                    # Default data directory
 * ├── config.json                                    # Global CLI config
 * └── sessions/
 *     └── <session_id>/                              # e.g., 20260102-japan-food-temples
 *         ├── session.json                           # Session definition
 *         ├── 00_enhancement.json                    # Prompt enhancement result
 *         ├── triage.json                            # Triage state (persists across runs)
 *         └── runs/
 *             ├── latest -> 20260102-143512-full     # Symlink to latest run
 *             └── <run_id>/                          # e.g., 20260102-143512-full
 *                 ├── run.json                       # Run config snapshot
 *                 ├── manifest.json                  # Run manifest with stage hashes
 *                 └── XX_stage_name.json             # Stage checkpoint files
 * ```
 *
 * @module storage/paths
 * @see PRD Section 13 - Storage Layout
 */

import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Validates an ID string to prevent path traversal attacks.
 *
 * Rejects IDs containing:
 * - `..` (parent directory traversal)
 * - `/` (forward slash - Unix path separator)
 * - `\` (backslash - Windows path separator)
 *
 * @param id - The ID to validate
 * @param idName - Name of the ID for error messages (e.g., 'sessionId', 'runId')
 * @throws {Error} If the ID contains path traversal characters
 */
function validateIdSecurity(id: string, idName: string): void {
  if (id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new Error(`${idName} contains invalid characters (path traversal not allowed)`);
  }
}

/**
 * Gets the root data directory for the application.
 *
 * Uses the `TRAVELAGENT_DATA_DIR` environment variable if set,
 * otherwise defaults to `~/.travelagent/`.
 *
 * @returns Absolute path to the data directory
 * @example
 * ```typescript
 * // With env var set
 * process.env.TRAVELAGENT_DATA_DIR = '/custom/path';
 * getDataDir(); // '/custom/path'
 *
 * // Without env var (default)
 * getDataDir(); // '/Users/username/.travelagent'
 * ```
 */
export function getDataDir(): string {
  const envDir = process.env.TRAVELAGENT_DATA_DIR;

  if (envDir) {
    // Resolve relative paths and expand ~ if present
    if (envDir.startsWith('~')) {
      return path.join(os.homedir(), envDir.slice(1));
    }
    return path.resolve(envDir);
  }

  // Default: ~/.travelagent
  return path.join(os.homedir(), '.travelagent');
}

/**
 * Gets the sessions root directory.
 *
 * @returns Absolute path to the sessions directory
 * @example
 * ```typescript
 * getSessionsDir(); // '/Users/username/.travelagent/sessions'
 * ```
 */
export function getSessionsDir(): string {
  return path.join(getDataDir(), 'sessions');
}

/**
 * Gets the directory path for a specific session.
 *
 * Session directories contain:
 * - session.json: Session definition
 * - 00_enhancement.json: Enhancement result (if enhancement was used)
 * - triage.json: Triage state (persists across runs)
 * - runs/: Directory containing all pipeline runs
 *
 * @param sessionId - The session ID (format: YYYYMMDD-slug)
 * @returns Absolute path to the session directory
 * @throws {Error} If sessionId is empty
 * @example
 * ```typescript
 * getSessionDir('20260102-japan-food-temples');
 * // '/Users/username/.travelagent/sessions/20260102-japan-food-temples'
 * ```
 */
export function getSessionDir(sessionId: string): string {
  if (!sessionId || sessionId.trim() === '') {
    throw new Error('sessionId is required');
  }
  validateIdSecurity(sessionId, 'sessionId');

  return path.join(getSessionsDir(), sessionId);
}

/**
 * Gets the runs directory for a session.
 *
 * @param sessionId - The session ID
 * @returns Absolute path to the runs directory
 */
export function getRunsDir(sessionId: string): string {
  return path.join(getSessionDir(sessionId), 'runs');
}

/**
 * Gets the directory path for a specific run within a session.
 *
 * Run directories contain:
 * - run.json: Run configuration snapshot
 * - manifest.json: Run manifest with stage hashes
 * - XX_stage_name.json: Stage checkpoint files
 *
 * @param sessionId - The session ID (format: YYYYMMDD-slug)
 * @param runId - The run ID (format: YYYYMMDD-HHMMSS[-mode])
 * @returns Absolute path to the run directory
 * @throws {Error} If sessionId or runId is empty
 * @example
 * ```typescript
 * getRunDir('20260102-japan-food-temples', '20260102-143512-full');
 * // '/Users/username/.travelagent/sessions/20260102-japan-food-temples/runs/20260102-143512-full'
 * ```
 */
export function getRunDir(sessionId: string, runId: string): string {
  if (!sessionId || sessionId.trim() === '') {
    throw new Error('sessionId is required');
  }
  if (!runId || runId.trim() === '') {
    throw new Error('runId is required');
  }
  validateIdSecurity(sessionId, 'sessionId');
  validateIdSecurity(runId, 'runId');

  return path.join(getRunsDir(sessionId), runId);
}

/**
 * Gets the file path for a stage checkpoint file.
 *
 * Stage files follow the naming convention: `XX_stage_name.json`
 * where XX is the stage number (00-10).
 *
 * @param sessionId - The session ID
 * @param runId - The run ID
 * @param stageId - The stage ID (format: XX_stage_name, e.g., "04_candidates_normalized")
 * @returns Absolute path to the stage file
 * @throws {Error} If any parameter is empty
 * @example
 * ```typescript
 * getStageFilePath('20260102-japan-food-temples', '20260102-143512-full', '04_candidates_normalized');
 * // '/Users/username/.travelagent/sessions/20260102-japan-food-temples/runs/20260102-143512-full/04_candidates_normalized.json'
 * ```
 */
export function getStageFilePath(sessionId: string, runId: string, stageId: string): string {
  if (!sessionId || sessionId.trim() === '') {
    throw new Error('sessionId is required');
  }
  if (!runId || runId.trim() === '') {
    throw new Error('runId is required');
  }
  if (!stageId || stageId.trim() === '') {
    throw new Error('stageId is required');
  }
  validateIdSecurity(sessionId, 'sessionId');
  validateIdSecurity(runId, 'runId');
  validateIdSecurity(stageId, 'stageId');

  // Ensure .json extension
  const fileName = stageId.endsWith('.json') ? stageId : `${stageId}.json`;

  return path.join(getRunDir(sessionId, runId), fileName);
}

/**
 * Gets the path to the "latest" symlink for a session's runs.
 *
 * The "latest" symlink points to the most recent run directory.
 * This provides a stable path for accessing the latest run output.
 *
 * @param sessionId - The session ID
 * @returns Absolute path to the latest symlink
 * @throws {Error} If sessionId is empty
 * @example
 * ```typescript
 * getLatestRunSymlink('20260102-japan-food-temples');
 * // '/Users/username/.travelagent/sessions/20260102-japan-food-temples/runs/latest'
 * ```
 */
export function getLatestRunSymlink(sessionId: string): string {
  if (!sessionId || sessionId.trim() === '') {
    throw new Error('sessionId is required');
  }
  validateIdSecurity(sessionId, 'sessionId');

  return path.join(getRunsDir(sessionId), 'latest');
}

// ============================================
// Additional Path Helpers
// ============================================

/**
 * Gets the path to the session.json file for a session.
 *
 * @param sessionId - The session ID
 * @returns Absolute path to session.json
 */
export function getSessionJsonPath(sessionId: string): string {
  return path.join(getSessionDir(sessionId), 'session.json');
}

/**
 * Gets the path to the triage.json file for a session.
 * Triage state persists across runs.
 *
 * @param sessionId - The session ID
 * @returns Absolute path to triage.json
 */
export function getTriageFilePath(sessionId: string): string {
  return path.join(getSessionDir(sessionId), 'triage.json');
}

/**
 * Gets the path to the enhancement result file (Stage 00).
 * Enhancement is stored at session level, not run level.
 *
 * @param sessionId - The session ID
 * @returns Absolute path to 00_enhancement.json
 */
export function getEnhancementFilePath(sessionId: string): string {
  return path.join(getSessionDir(sessionId), '00_enhancement.json');
}

/**
 * Gets the path to the run.json file (run config snapshot).
 *
 * @param sessionId - The session ID
 * @param runId - The run ID
 * @returns Absolute path to run.json
 */
export function getRunConfigPath(sessionId: string, runId: string): string {
  return path.join(getRunDir(sessionId, runId), 'run.json');
}

/**
 * Gets the path to the manifest.json file for a run.
 *
 * @param sessionId - The session ID
 * @param runId - The run ID
 * @returns Absolute path to manifest.json
 */
export function getManifestPath(sessionId: string, runId: string): string {
  return path.join(getRunDir(sessionId, runId), 'manifest.json');
}

/**
 * Gets the path to the global config.json file.
 *
 * @returns Absolute path to config.json
 */
export function getGlobalConfigPath(): string {
  return path.join(getDataDir(), 'config.json');
}

/**
 * Gets the path to the exports directory for a run.
 *
 * @param sessionId - The session ID
 * @param runId - The run ID
 * @returns Absolute path to exports directory
 */
export function getExportsDir(sessionId: string, runId: string): string {
  return path.join(getRunDir(sessionId, runId), 'exports');
}

/**
 * Gets the path to the results.json file for a run.
 *
 * @param sessionId - The session ID
 * @param runId - The run ID
 * @returns Absolute path to results.json
 */
export function getResultsJsonPath(sessionId: string, runId: string): string {
  return path.join(getExportsDir(sessionId, runId), 'results.json');
}

/**
 * Gets the path to the results.md file for a run.
 *
 * @param sessionId - The session ID
 * @param runId - The run ID
 * @returns Absolute path to results.md
 */
export function getResultsMdPath(sessionId: string, runId: string): string {
  return path.join(getExportsDir(sessionId, runId), 'results.md');
}
