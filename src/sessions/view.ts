/**
 * Session Viewing
 *
 * Provides detailed session information including run history.
 *
 * @module sessions/view
 */

import * as fs from 'node:fs/promises';
import { loadSession } from '../storage/sessions.js';
import { listRuns, loadRunConfig, getLatestRunId } from '../storage/runs.js';
import { getEnhancementFilePath } from '../storage/paths.js';
import { SessionIdSchema } from '../schemas/session.js';
import type { Session, RunConfig } from '../schemas/index.js';

/**
 * Summary of a pipeline run
 */
export interface RunSummary {
  /** Run ID (format: YYYYMMDD-HHMMSS[-mode]) */
  runId: string;

  /** Run mode ('full' or 'from-NN') */
  mode: string;

  /** ISO8601 timestamp when run started */
  startedAt: string;

  /** ISO8601 timestamp when run completed (if finished) */
  completedAt?: string;

  /** Number of stages that completed successfully */
  stagesCompleted: number;

  /** Total number of stages in pipeline */
  totalStages: number;

  /** Whether the run completed successfully */
  success: boolean;
}

/**
 * Full session details with run history
 */
export interface SessionDetails {
  /** The session data */
  session: Session;

  /** History of pipeline runs (newest first) */
  runs: RunSummary[];

  /** Enhancement result if prompt enhancement was used */
  enhancementResult?: unknown;

  /** ID of the most recent run */
  latestRunId?: string;
}

/**
 * Total number of stages in the pipeline
 */
const TOTAL_STAGES = 11; // Stages 00-10

/**
 * Convert run ID timestamp to ISO8601 format.
 * Run ID format starts with YYYYMMDD-HHMMSS
 * Returns ISO8601: YYYY-MM-DDTHH:MM:SS.000Z
 *
 * @param runId - Run ID string (format: YYYYMMDD-HHMMSS[-mode])
 * @returns ISO8601 formatted date string
 */
function runIdToIso8601(runId: string): string {
  const match = runId.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (match) {
    const [, year, month, day, hour, min, sec] = match;
    return `${year}-${month}-${day}T${hour}:${min}:${sec}.000Z`;
  }
  return new Date().toISOString(); // Fallback
}

/**
 * Extract run mode from run ID.
 *
 * Run ID format: YYYYMMDD-HHMMSS or YYYYMMDD-HHMMSS-mode
 * The time component (HHMMSS) is always exactly 6 digits.
 * Mode is never purely 6 digits, so we can distinguish them.
 *
 * @param runId - Run ID string
 * @returns Mode string ('full' by default)
 */
function extractRunMode(runId: string): string {
  const match = runId.match(/^\d{8}-(\d{6})(?:-(.+))?$/);
  if (match && match[2]) {
    return match[2];
  }
  return 'full';
}

/**
 * Build run summary from run config.
 *
 * @param runId - The run ID
 * @param config - The run configuration (if available)
 * @returns Run summary object
 */
function buildRunSummary(runId: string, config: RunConfig | null): RunSummary {
  if (config) {
    // Derive success from status
    const success = config.status === 'completed';
    // Mode from config or from runId
    const mode = config.mode === 'from-stage' && config.fromStage
      ? `from-${config.fromStage}`
      : config.mode;

    return {
      runId,
      mode,
      startedAt: config.startedAt,
      completedAt: config.completedAt,
      // Stages completed can be estimated: completed/partial = 11, running/failed = unknown
      stagesCompleted: success || config.status === 'partial' ? TOTAL_STAGES : 0,
      totalStages: TOTAL_STAGES,
      success,
    };
  }

  // Minimal summary when config not available
  return {
    runId,
    mode: extractRunMode(runId),
    startedAt: runIdToIso8601(runId),
    stagesCompleted: 0,
    totalStages: TOTAL_STAGES,
    success: false,
  };
}

/**
 * View detailed session information including run history.
 *
 * @param sessionId - The session ID to view
 * @returns Full session details
 * @throws {Error} If session doesn't exist
 *
 * @example
 * ```typescript
 * const details = await viewSession('20260107-japan-temples');
 * console.log(details.session.title);
 * console.log(`${details.runs.length} runs`);
 * ```
 */
export async function viewSession(sessionId: string): Promise<SessionDetails> {
  // Validate session ID format
  const parseResult = SessionIdSchema.safeParse(sessionId);
  if (!parseResult.success) {
    throw new Error(`Invalid session ID format: ${sessionId}. Expected YYYYMMDD-slug format.`);
  }

  // Load session data
  const session = await loadSession(sessionId);

  // Get run list
  let runIds: string[] = [];
  try {
    runIds = await listRuns(sessionId);
  } catch {
    // No runs yet
  }

  // Build run summaries
  const runs: RunSummary[] = [];
  for (const runId of runIds) {
    try {
      const config = await loadRunConfig(sessionId, runId);
      runs.push(buildRunSummary(runId, config));
    } catch {
      // Config might not exist, add minimal summary
      runs.push(buildRunSummary(runId, null));
    }
  }

  // Try to load enhancement result
  let enhancementResult: unknown;
  try {
    const enhancementPath = getEnhancementFilePath(sessionId);
    const content = await fs.readFile(enhancementPath, 'utf-8');
    enhancementResult = JSON.parse(content);
  } catch {
    // Enhancement file doesn't exist
  }

  // Get latest run ID
  let latestRunId: string | undefined;
  try {
    latestRunId = (await getLatestRunId(sessionId)) ?? undefined;
  } catch {
    // No latest symlink
  }

  return {
    session,
    runs,
    enhancementResult,
    latestRunId,
  };
}
