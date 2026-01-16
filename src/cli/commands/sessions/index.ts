/**
 * Sessions Commands Index
 *
 * Registers all session-related CLI commands:
 * - sessions:create - Create new sessions
 * - sessions:list - List all sessions
 * - sessions:view - View session details
 * - sessions:archive - Archive sessions
 *
 * @module cli/commands/sessions
 * @see PRD Section 16 - CLI Interface
 * @see Task 23.0 - CLI Session Commands
 */

import type { Command } from 'commander';
import { registerCreateCommand } from './create.js';
import { registerListCommand } from './list.js';
import { registerViewCommand } from './view.js';
import { registerArchiveCommand } from './archive.js';

/**
 * Register all session commands with the parent sessions command.
 *
 * @param sessionsCmd - Parent 'session' command from commander
 */
export function registerSessionCommands(sessionsCmd: Command): void {
  registerCreateCommand(sessionsCmd);
  registerListCommand(sessionsCmd);
  registerViewCommand(sessionsCmd);
  registerArchiveCommand(sessionsCmd);
}

// Re-export individual command registrations for testing
export { registerCreateCommand } from './create.js';
export { registerListCommand } from './list.js';
export { registerViewCommand } from './view.js';
export { registerArchiveCommand } from './archive.js';
