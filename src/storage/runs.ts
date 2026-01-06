/**
 * Run Storage Operations
 *
 * Management of pipeline run directories, configs, and symlinks.
 *
 * @module storage/runs
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { RunConfigSchema, type RunConfig } from '../schemas/index.js';
import { atomicWriteJson } from '../schemas/migrations/index.js';
import {
  getRunsDir,
  getRunDir,
  getRunConfigPath,
  getLatestRunSymlink,
} from './paths.js';

/**
 * Create run directory structure
 *
 * @param sessionId - The session ID
 * @param runId - The run ID
 */
export async function createRunDir(sessionId: string, runId: string): Promise<void> {
  const runDir = getRunDir(sessionId, runId);
  await fs.mkdir(runDir, { recursive: true });
}

/**
 * Save run configuration
 *
 * @param sessionId - The session ID
 * @param runConfig - The run configuration to save
 */
export async function saveRunConfig(
  sessionId: string,
  runConfig: RunConfig
): Promise<void> {
  const validated = RunConfigSchema.parse(runConfig);
  const filePath = getRunConfigPath(sessionId, validated.runId);
  await atomicWriteJson(filePath, validated);
}

/**
 * Load run configuration
 *
 * @param sessionId - The session ID
 * @param runId - The run ID
 * @returns The run configuration
 * @throws Error if run doesn't exist or config is invalid
 */
export async function loadRunConfig(
  sessionId: string,
  runId: string
): Promise<RunConfig> {
  const filePath = getRunConfigPath(sessionId, runId);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    return RunConfigSchema.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Run not found: ${runId} in session ${sessionId} (path: ${filePath})`);
    }
    throw error;
  }
}

/**
 * List all run IDs for a session
 *
 * @param sessionId - The session ID
 * @returns Array of run IDs, sorted descending (newest first)
 */
export async function listRuns(sessionId: string): Promise<string[]> {
  const runsDir = getRunsDir(sessionId);

  try {
    const entries = await fs.readdir(runsDir, { withFileTypes: true });

    return entries
      .filter((entry) => {
        // Include directories, exclude 'latest' symlink
        if (entry.name === 'latest') return false;
        return entry.isDirectory() || entry.isSymbolicLink();
      })
      .map((entry) => entry.name)
      .filter((name) => name !== 'latest') // Double-check
      .sort((a, b) => b.localeCompare(a)); // Descending order
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Get the latest run ID for a session
 *
 * Reads the 'latest' symlink to determine the most recent run.
 *
 * @param sessionId - The session ID
 * @returns The latest run ID, or null if no runs exist
 */
export async function getLatestRunId(sessionId: string): Promise<string | null> {
  const linkPath = getLatestRunSymlink(sessionId);

  try {
    const target = await fs.readlink(linkPath);
    return path.basename(target);
  } catch {
    return null;
  }
}

/**
 * Update the 'latest' symlink to point to a run
 *
 * @param sessionId - The session ID
 * @param runId - The run ID to link to
 * @throws Error if the target run directory does not exist or is not a directory
 */
export async function updateLatestSymlink(
  sessionId: string,
  runId: string
): Promise<void> {
  const linkPath = getLatestRunSymlink(sessionId);
  const runsDir = getRunsDir(sessionId);
  const targetDir = getRunDir(sessionId, runId);

  // Verify target directory exists before creating symlink
  try {
    const stat = await fs.stat(targetDir);
    if (!stat.isDirectory()) {
      throw new Error(`Target is not a directory: ${runId}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Run directory does not exist: ${runId}`);
    }
    throw error;
  }

  // Ensure the runs directory exists
  await fs.mkdir(runsDir, { recursive: true });

  // Remove existing symlink first
  try {
    await fs.unlink(linkPath);
  } catch (error) {
    // Ignore if doesn't exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  // Create relative symlink (just the runId, not full path)
  await fs.symlink(runId, linkPath);
}
