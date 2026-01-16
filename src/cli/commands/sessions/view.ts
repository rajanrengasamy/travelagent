/**
 * Sessions View Command
 *
 * Displays detailed information about a specific session including:
 * - Session parameters (destinations, dates, interests)
 * - Enhancement result (if available)
 * - Run history
 *
 * @module cli/commands/sessions/view
 * @see PRD Section 16 - CLI Interface
 * @see Task 23.3 - Sessions View Command
 */

import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import chalk from 'chalk';
import { getBaseCommand, EXIT_CODES } from '../../base-command.js';
import { loadSession } from '../../../storage/sessions.js';
import { listRuns, getLatestRunId, loadRunConfig } from '../../../storage/runs.js';
import { getEnhancementFilePath } from '../../../storage/paths.js';
import type { EnhancementResult } from '../../../schemas/enhancement.js';
import type { RunConfig } from '../../../schemas/run-config.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for the sessions:view command.
 */
export interface ViewSessionOptions {
  /** Output format */
  format?: 'text' | 'json';
  /** Show full enhancement details */
  fullEnhancement?: boolean;
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
function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format flexibility for display.
 *
 * @param flexibility - Flexibility object
 * @returns Formatted string
 */
function formatFlexibility(flexibility: { type: string; days?: number; month?: string }): string {
  switch (flexibility.type) {
    case 'none':
      return 'Fixed dates (no flexibility)';
    case 'plusMinusDays':
      return `+/- ${flexibility.days} days`;
    case 'monthOnly':
      return `Anytime in ${flexibility.month}`;
    default:
      return JSON.stringify(flexibility);
  }
}

/**
 * Load enhancement result if it exists.
 *
 * @param sessionId - Session ID
 * @returns Enhancement result or null
 */
async function loadEnhancementResult(sessionId: string): Promise<EnhancementResult | null> {
  const filePath = getEnhancementFilePath(sessionId);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as EnhancementResult;
  } catch {
    return null;
  }
}

/**
 * Format run status.
 *
 * @param runConfig - Run configuration
 * @returns Status string
 */
function formatRunStatus(runConfig: RunConfig): string {
  if (runConfig.status === 'completed') {
    return chalk.green('completed');
  } else if (runConfig.status === 'failed') {
    return chalk.red('failed');
  } else if (runConfig.status === 'running') {
    return chalk.yellow('running');
  }
  return runConfig.status || 'unknown';
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register the sessions:view command.
 *
 * @param sessionsCmd - Parent sessions command
 */
export function registerViewCommand(sessionsCmd: Command): void {
  sessionsCmd
    .command('view <sessionId>')
    .description('View detailed session information')
    .option('-f, --format <type>', 'Output format: text, json', 'text')
    .option('--full-enhancement', 'Show full enhancement details')
    .action(async (sessionId: string, options: ViewSessionOptions, cmd: Command) => {
      const base = getBaseCommand(cmd.parent!.parent!);

      try {
        await handleView(sessionId, options, base);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            base.error(`Session not found: ${sessionId}`, EXIT_CODES.NOT_FOUND);
          } else {
            base.error(error.message, EXIT_CODES.ERROR);
          }
        }
        throw error;
      }
    });
}

/**
 * Handle the sessions:view command.
 *
 * @param sessionId - Session ID to view
 * @param options - Command options
 * @param base - Base command for output
 */
async function handleView(
  sessionId: string,
  options: ViewSessionOptions,
  base: ReturnType<typeof getBaseCommand>
): Promise<void> {
  base.debug(`Loading session: ${sessionId}`);

  // Load session
  const session = await loadSession(sessionId);

  // Load enhancement result
  const enhancement = await loadEnhancementResult(sessionId);

  // Load run history
  const runIds = await listRuns(sessionId);
  const latestRunId = await getLatestRunId(sessionId);

  // Load run configs for history
  const runConfigs: Array<{ runId: string; config: RunConfig | null }> = [];
  for (const runId of runIds.slice(0, 10)) {
    // Limit to 10 most recent
    try {
      const config = await loadRunConfig(sessionId, runId);
      runConfigs.push({ runId, config });
    } catch {
      runConfigs.push({ runId, config: null });
    }
  }

  // JSON output
  if (options.format === 'json') {
    base.json({
      session,
      enhancement,
      runs: {
        total: runIds.length,
        latestRunId,
        history: runConfigs,
      },
    });
    return;
  }

  // Text output
  base.section(`Session: ${session.sessionId}`);

  // Basic info
  base.keyValue('Title', session.title);
  base.keyValue('Created', formatDateTime(session.createdAt));
  if (session.archivedAt) {
    base.keyValue('Archived', chalk.dim(formatDateTime(session.archivedAt)));
  }
  base.blank();

  // Travel parameters
  console.log(chalk.bold('Travel Parameters'));
  base.divider();
  base.keyValue('Destinations', session.destinations.join(', '));
  base.keyValue('Dates', `${session.dateRange.start} to ${session.dateRange.end}`);
  base.keyValue('Flexibility', formatFlexibility(session.flexibility));
  base.keyValue('Interests', session.interests.join(', '));
  if (session.constraints && Object.keys(session.constraints).length > 0) {
    base.keyValue('Constraints', '');
    for (const [key, value] of Object.entries(session.constraints)) {
      console.log(`    ${chalk.dim(key + ':')} ${JSON.stringify(value)}`);
    }
  }
  base.blank();

  // Enhancement result
  if (enhancement) {
    console.log(chalk.bold('Enhancement'));
    base.divider();
    base.keyValue('Status', enhancement.wasEnhanced ? chalk.green('Enhanced') : chalk.dim('Not enhanced'));
    base.keyValue('Model', enhancement.modelUsed);
    base.keyValue('Iterations', String(enhancement.iterationCount));
    base.keyValue('Processing Time', `${enhancement.processingTimeMs}ms`);

    if (options.fullEnhancement) {
      base.blank();
      console.log(chalk.dim('Original Prompt:'));
      console.log(`  "${enhancement.originalPrompt}"`);
      base.blank();
      console.log(chalk.dim('Refined Prompt:'));
      console.log(`  "${enhancement.refinedPrompt}"`);

      if (enhancement.extractedParams) {
        base.blank();
        console.log(chalk.dim('Extracted Parameters:'));
        console.log(JSON.stringify(enhancement.extractedParams, null, 2));
      }
    } else {
      base.info(chalk.dim('(use --full-enhancement to see prompt details)'));
    }
    base.blank();
  }

  // Run history
  console.log(chalk.bold('Run History'));
  base.divider();

  if (runIds.length === 0) {
    base.info(chalk.dim('No runs yet'));
    base.blank();
    base.info(`Start a run with: travel discover ${sessionId}`);
  } else {
    base.keyValue('Total Runs', String(runIds.length));
    base.keyValue('Latest Run', latestRunId || 'N/A');
    base.blank();

    // Recent runs table
    console.log(chalk.dim('Recent Runs:'));
    for (const { runId, config } of runConfigs) {
      const isLatest = runId === latestRunId;
      const prefix = isLatest ? chalk.cyan('* ') : '  ';
      const status = config ? formatRunStatus(config) : chalk.dim('unknown');
      const mode = config?.mode || 'full';

      // Extract timestamp from runId (format: YYYYMMDD-HHMMSS-mode)
      let timestamp = runId;
      const match = runId.match(/^(\d{8})-(\d{6})/);
      if (match) {
        const [, date, time] = match;
        const year = date.slice(0, 4);
        const month = date.slice(4, 6);
        const day = date.slice(6, 8);
        const hour = time.slice(0, 2);
        const min = time.slice(2, 4);
        timestamp = `${year}-${month}-${day} ${hour}:${min}`;
      }

      console.log(`${prefix}${chalk.white(runId)}`);
      console.log(`    ${chalk.dim('Status:')} ${status}  ${chalk.dim('Mode:')} ${mode}  ${chalk.dim('Time:')} ${timestamp}`);
    }

    if (runIds.length > 10) {
      base.blank();
      base.info(chalk.dim(`(showing 10 of ${runIds.length} runs)`));
    }
  }

  base.blank();

  // Actions hint
  console.log(chalk.bold('Actions'));
  base.divider();
  base.info(`View run: travel run view ${sessionId} <runId>`);
  base.info(`New run: travel discover ${sessionId}`);
  base.info(`Archive: travel session archive ${sessionId}`);
}

export default registerViewCommand;
