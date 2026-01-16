/**
 * Sessions List Command
 *
 * Lists all discovery sessions in table format.
 * Supports filtering archived sessions.
 *
 * @module cli/commands/sessions/list
 * @see PRD Section 16 - CLI Interface
 * @see Task 23.2 - Sessions List Command
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getBaseCommand, EXIT_CODES } from '../../base-command.js';
import { listSessions } from '../../../storage/sessions.js';
import { listRuns, getLatestRunId } from '../../../storage/runs.js';
import type { Session } from '../../../schemas/session.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for the sessions:list command.
 */
export interface ListSessionsOptions {
  /** Include archived sessions */
  archived?: boolean;
  /** Maximum number of sessions to display */
  limit?: string;
  /** Output format */
  format?: 'table' | 'json';
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a date string for display.
 *
 * @param isoDate - ISO8601 date string
 * @returns Formatted date string
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Truncate a string to a maximum length.
 *
 * @param str - String to truncate
 * @param maxLen - Maximum length
 * @returns Truncated string
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Pad a string to a fixed width.
 *
 * @param str - String to pad
 * @param width - Target width
 * @returns Padded string
 */
function padRight(str: string, width: number): string {
  // Account for ANSI codes by calculating visible length
  const visibleLength = str.replace(/\x1b\[[0-9;]*m/g, '').length;
  const padding = Math.max(0, width - visibleLength);
  return str + ' '.repeat(padding);
}

/**
 * Format session as a table row.
 *
 * @param session - Session to format
 * @param lastRunDate - Date of last run (if any)
 * @param runCount - Number of runs
 * @returns Formatted row string
 */
function formatTableRow(
  session: Session,
  lastRunDate: string | null,
  runCount: number
): string {
  const id = padRight(truncate(session.sessionId, 28), 30);
  const title = padRight(truncate(session.title, 25), 27);
  const created = padRight(formatDate(session.createdAt), 14);
  const lastRun = padRight(lastRunDate ? formatDate(lastRunDate) : '-', 14);
  const runs = padRight(String(runCount), 6);
  const archived = session.archivedAt ? chalk.dim('[archived]') : '';

  return `${id}${title}${created}${lastRun}${runs}${archived}`;
}

/**
 * Format table header.
 *
 * @returns Header row string
 */
function formatTableHeader(): string {
  const header =
    padRight('SESSION ID', 30) +
    padRight('TITLE', 27) +
    padRight('CREATED', 14) +
    padRight('LAST RUN', 14) +
    padRight('RUNS', 6);

  return chalk.bold(header);
}

/**
 * Format table divider.
 *
 * @returns Divider string
 */
function formatTableDivider(): string {
  return chalk.dim('-'.repeat(91));
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register the sessions:list command.
 *
 * @param sessionsCmd - Parent sessions command
 */
export function registerListCommand(sessionsCmd: Command): void {
  sessionsCmd
    .command('list')
    .description('List all discovery sessions')
    .option('-a, --archived', 'Include archived sessions')
    .option('-n, --limit <count>', 'Maximum number of sessions to show', '20')
    .option('-f, --format <type>', 'Output format: table, json', 'table')
    .action(async (options: ListSessionsOptions, cmd: Command) => {
      const base = getBaseCommand(cmd.parent!.parent!);

      try {
        await handleList(options, base);
      } catch (error) {
        if (error instanceof Error) {
          base.error(error.message, EXIT_CODES.ERROR);
        }
        throw error;
      }
    });
}

/**
 * Handle the sessions:list command.
 *
 * @param options - Command options
 * @param base - Base command for output
 */
async function handleList(
  options: ListSessionsOptions,
  base: ReturnType<typeof getBaseCommand>
): Promise<void> {
  base.debug(`Listing sessions (archived: ${options.archived}, limit: ${options.limit})`);

  // Load sessions
  const sessions = await listSessions({
    includeArchived: options.archived,
  });

  // Apply limit
  const limit = parseInt(options.limit || '20', 10);
  const displaySessions = sessions.slice(0, limit);

  // Handle empty case
  if (sessions.length === 0) {
    base.info('No sessions found.');
    base.blank();
    base.info('Create a session with: travel session create --prompt "your travel query"');
    return;
  }

  // JSON output
  if (options.format === 'json') {
    // Gather run info for each session
    const sessionsWithRuns = await Promise.all(
      displaySessions.map(async (session) => {
        const runs = await listRuns(session.sessionId);
        const latestRunId = await getLatestRunId(session.sessionId);
        return {
          ...session,
          runCount: runs.length,
          latestRunId,
        };
      })
    );

    base.json(sessionsWithRuns);
    return;
  }

  // Table output
  base.section('Sessions');
  console.log(formatTableHeader());
  console.log(formatTableDivider());

  // Display each session with run info
  for (const session of displaySessions) {
    try {
      const runs = await listRuns(session.sessionId);
      const latestRunId = await getLatestRunId(session.sessionId);

      // Get last run date if available
      let lastRunDate: string | null = null;
      if (latestRunId) {
        // Parse run ID to extract timestamp (format: YYYYMMDD-HHMMSS-mode)
        const match = latestRunId.match(/^(\d{8})-(\d{6})/);
        if (match) {
          const [, date, time] = match;
          const year = date.slice(0, 4);
          const month = date.slice(4, 6);
          const day = date.slice(6, 8);
          const hour = time.slice(0, 2);
          const min = time.slice(2, 4);
          const sec = time.slice(4, 6);
          lastRunDate = `${year}-${month}-${day}T${hour}:${min}:${sec}Z`;
        }
      }

      console.log(formatTableRow(session, lastRunDate, runs.length));
    } catch (error) {
      // If we can't load run info, still show the session
      console.log(formatTableRow(session, null, 0));
    }
  }

  console.log(formatTableDivider());

  // Summary
  base.blank();
  const totalShowing = displaySessions.length;
  const totalCount = sessions.length;

  if (totalShowing < totalCount) {
    base.info(`Showing ${totalShowing} of ${totalCount} sessions (use --limit to show more)`);
  } else {
    base.info(`Total: ${totalCount} session${totalCount === 1 ? '' : 's'}`);
  }

  if (!options.archived) {
    const { listSessions: listAll } = await import('../../../storage/sessions.js');
    const allSessions = await listAll({ includeArchived: true });
    const archivedCount = allSessions.length - sessions.length;
    if (archivedCount > 0) {
      base.info(chalk.dim(`(${archivedCount} archived session${archivedCount === 1 ? '' : 's'} hidden - use --archived to show)`));
    }
  }
}

export default registerListCommand;
