/**
 * Session Listing
 *
 * Provides session listing with filtering, sorting, and summary generation.
 *
 * @module sessions/list
 */

import { listSessions as storageListSessions } from '../storage/sessions.js';
import { listRuns } from '../storage/runs.js';

/**
 * Lightweight session summary for listing
 */
export interface SessionSummary {
  /** Human-readable session ID */
  sessionId: string;

  /** User-friendly title */
  title: string;

  /** Destination locations */
  destinations: string[];

  /** ISO8601 creation timestamp */
  createdAt: string;

  /** ISO8601 archive timestamp (if archived) */
  archivedAt?: string;

  /** ID of the most recent run */
  lastRunId?: string;

  /** Total number of pipeline runs */
  runCount: number;
}

/**
 * Options for filtering session list
 */
export interface ListSessionsOptions {
  /** Include archived sessions (default: false) */
  includeArchived?: boolean;

  /** Maximum number of sessions to return */
  limit?: number;

  /** Sort order by createdAt (default: 'desc' - newest first) */
  sortOrder?: 'asc' | 'desc';
}

/**
 * List sessions with optional filtering and sorting.
 *
 * Returns lightweight session summaries including run counts.
 *
 * @param options - Filtering and sorting options
 * @returns Array of session summaries
 *
 * @example
 * ```typescript
 * // Get recent sessions
 * const sessions = await listSessions({ limit: 10 });
 *
 * // Include archived
 * const all = await listSessions({ includeArchived: true });
 *
 * // Oldest first
 * const chronological = await listSessions({ sortOrder: 'asc' });
 * ```
 */
export async function listSessions(
  options: ListSessionsOptions = {}
): Promise<SessionSummary[]> {
  const {
    includeArchived = false,
    limit,
    sortOrder = 'desc',
  } = options;

  // Get sessions from storage
  const sessions = await storageListSessions({ includeArchived });

  // Build summaries with run counts
  const summaries: SessionSummary[] = await Promise.all(
    sessions.map(async (session) => {
      // Get run count for this session
      let runCount = 0;
      let lastRunId: string | undefined;

      try {
        const runs = await listRuns(session.sessionId);
        runCount = runs.length;
        // Runs are returned newest first
        if (runs.length > 0) {
          lastRunId = runs[0];
        }
      } catch {
        // Session might not have runs directory yet
        runCount = 0;
      }

      return {
        sessionId: session.sessionId,
        title: session.title,
        destinations: session.destinations,
        createdAt: session.createdAt,
        archivedAt: session.archivedAt,
        lastRunId: lastRunId ?? session.lastRunId,
        runCount,
      };
    })
  );

  // Sort based on options
  const sorted = summaries.sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();

    if (sortOrder === 'asc') {
      return dateA - dateB;
    }
    return dateB - dateA;
  });

  // Apply limit if specified
  if (limit !== undefined && limit > 0) {
    return sorted.slice(0, limit);
  }

  return sorted;
}

/**
 * Get the total count of sessions.
 *
 * @param options - Filter options
 * @returns Number of sessions
 *
 * @example
 * ```typescript
 * const total = await getSessionCount();
 * const withArchived = await getSessionCount({ includeArchived: true });
 * ```
 */
export async function getSessionCount(
  options: { includeArchived?: boolean } = {}
): Promise<number> {
  const sessions = await storageListSessions(options);
  return sessions.length;
}
