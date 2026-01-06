/**
 * Stage File Storage Operations
 *
 * Stage files are checkpoints produced by each pipeline stage.
 * They follow the naming convention: XX_stage_name.json
 *
 * @module storage/stages
 */

import * as fs from 'node:fs/promises';
import { type ZodSchema } from 'zod';
import { STAGE_ID_PATTERN, parseStageNumber } from '../schemas/stage.js';
import { atomicWriteJson } from '../schemas/migrations/index.js';
import { getRunDir, getStageFilePath } from './paths.js';

/**
 * Save a stage file (checkpoint)
 *
 * @param sessionId - The session ID
 * @param runId - The run ID
 * @param stageId - The stage ID (e.g., "08_top_candidates")
 * @param data - The stage data to save (should include _meta)
 */
export async function saveStageFile(
  sessionId: string,
  runId: string,
  stageId: string,
  data: unknown
): Promise<void> {
  if (!STAGE_ID_PATTERN.test(stageId)) {
    throw new Error(
      `Invalid stageId format: ${stageId}. Expected NN_stage_name (e.g., 04_candidates_normalized)`
    );
  }
  const filePath = getStageFilePath(sessionId, runId, stageId);
  await atomicWriteJson(filePath, data);
}

/**
 * Load a stage file
 *
 * Per PRD Section 12.1, loading persisted data should include schema validation.
 * The optional schema parameter enables callers to validate the loaded data.
 *
 * @param sessionId - The session ID
 * @param runId - The run ID
 * @param stageId - The stage ID
 * @param schema - Optional Zod schema to validate the loaded data
 * @returns The stage data (validated if schema provided)
 * @throws Error if file doesn't exist or validation fails
 */
export async function loadStageFile<T>(
  sessionId: string,
  runId: string,
  stageId: string,
  schema?: ZodSchema<T>
): Promise<T> {
  const filePath = getStageFilePath(sessionId, runId, stageId);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    // If schema provided, validate against it (PRD 12.1 compliance)
    if (schema) {
      return schema.parse(data);
    }

    return data as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Stage file not found: ${stageId} in run ${runId} (path: ${filePath})`);
    }
    throw error;
  }
}

/**
 * Check if a stage file exists
 *
 * @param sessionId - The session ID
 * @param runId - The run ID
 * @param stageId - The stage ID
 * @returns true if stage file exists
 */
export async function stageFileExists(
  sessionId: string,
  runId: string,
  stageId: string
): Promise<boolean> {
  const filePath = getStageFilePath(sessionId, runId, stageId);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all stage files in a run
 *
 * @param sessionId - The session ID
 * @param runId - The run ID
 * @returns Array of stage IDs (without .json extension), sorted by stage number
 */
export async function listStageFiles(
  sessionId: string,
  runId: string
): Promise<string[]> {
  const runDir = getRunDir(sessionId, runId);

  try {
    const entries = await fs.readdir(runDir, { withFileTypes: true });

    return entries
      .filter((entry) => {
        if (!entry.isFile()) return false;
        if (!entry.name.endsWith('.json')) return false;
        const stageId = entry.name.slice(0, -5); // Remove .json
        return STAGE_ID_PATTERN.test(stageId);
      })
      .map((entry) => entry.name.slice(0, -5)) // Remove .json extension
      .sort((a, b) => parseStageNumber(a) - parseStageNumber(b));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
