/**
 * Sessions Archive Command
 *
 * Archives a session by setting the archivedAt timestamp.
 * Archived sessions are hidden from list by default but can still be accessed.
 *
 * @module cli/commands/sessions/archive
 * @see PRD Section 16 - CLI Interface
 * @see Task 23.4 - Sessions Archive Command
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getBaseCommand, EXIT_CODES } from '../../base-command.js';
import { loadSession, archiveSession } from '../../../storage/sessions.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for the sessions:archive command.
 */
export interface ArchiveSessionOptions {
  /** Skip confirmation prompt */
  force?: boolean;
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register the sessions:archive command.
 *
 * @param sessionsCmd - Parent sessions command
 */
export function registerArchiveCommand(sessionsCmd: Command): void {
  sessionsCmd
    .command('archive <sessionId>')
    .description('Archive a session (soft-delete)')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (sessionId: string, options: ArchiveSessionOptions, cmd: Command) => {
      const base = getBaseCommand(cmd.parent!.parent!);

      try {
        await handleArchive(sessionId, options, base);
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
 * Handle the sessions:archive command.
 *
 * @param sessionId - Session ID to archive
 * @param options - Command options
 * @param base - Base command for output
 */
async function handleArchive(
  sessionId: string,
  options: ArchiveSessionOptions,
  base: ReturnType<typeof getBaseCommand>
): Promise<void> {
  base.debug(`Archiving session: ${sessionId}`);

  // Load session to verify it exists and check if already archived
  const session = await loadSession(sessionId);

  if (session.archivedAt) {
    base.warn(`Session "${sessionId}" is already archived (${session.archivedAt})`);
    return;
  }

  // Show session info
  base.info(`Session: ${session.title}`);
  base.keyValue('ID', session.sessionId);
  base.keyValue('Destinations', session.destinations.join(', '));
  base.keyValue('Created', new Date(session.createdAt).toLocaleDateString());
  base.blank();

  // Confirmation
  if (!options.force) {
    base.warn(
      'This will archive the session. Archived sessions are hidden from list by default.'
    );
    base.info(chalk.dim('Use --force to skip this prompt, or --archived to see archived sessions.'));
    base.blank();

    // In CLI context without readline, we proceed with a warning
    // A real implementation would use inquirer or similar
    base.info('Proceeding with archive (use --force to suppress this message)...');
  }

  // Archive the session
  await archiveSession(sessionId);

  base.success(`Session "${sessionId}" has been archived`);
  base.blank();
  base.info(`To view archived sessions: travel session list --archived`);
  base.info(`To unarchive, manually edit session.json and remove archivedAt field`);
}

export default registerArchiveCommand;
