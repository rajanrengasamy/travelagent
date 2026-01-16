/**
 * CLI Commands Registry
 *
 * Registers all available CLI commands with the main program.
 * Each command is implemented in its own file and registered here.
 *
 * Available commands:
 * - discover: Run a discovery query
 * - session: Manage sessions (create, list, view, archive)
 * - run: Manage runs (list, resume, export)
 * - config: View and set configuration
 *
 * @module cli/commands
 * @see PRD Section 16 - CLI Interface
 * @see Task 22.6 - Help System and Command Discovery
 * @see Task 23.0 - CLI Session Commands
 */

import type { Command } from 'commander';
import { registerSessionCommands } from './sessions/index.js';
// import { registerDiscoverCommand } from './discover.js';
// import { registerRunCommand } from './run.js';
// import { registerConfigCommand } from './config.js';

/**
 * Register all CLI commands with the program.
 *
 * @param program - Commander program instance
 */
export function registerCommands(program: Command): void {
  // Discovery command - main entry point for travel queries
  // registerDiscoverCommand(program);

  // Session management commands (fully implemented)
  const sessionCmd = program.command('session').description('Manage discovery sessions');
  registerSessionCommands(sessionCmd);

  // Run management commands (placeholder)
  // registerRunCommand(program);

  // Configuration commands (placeholder)
  // registerConfigCommand(program);

  // Placeholder commands for development (discover, run, config, export)
  registerPlaceholderCommands(program);
}

/**
 * Register placeholder commands for testing the CLI framework.
 * These will be replaced with actual implementations.
 *
 * Note: Session commands are now fully implemented in ./sessions/
 *
 * @param program - Commander program instance
 */
function registerPlaceholderCommands(program: Command): void {
  // Discover command placeholder
  program
    .command('discover <query>')
    .description('Run a travel discovery query')
    .option('-s, --session <id>', 'Use existing session')
    .option('--dry-run', 'Show what would be done without executing')
    .option('--skip-enhancement', 'Skip the query enhancement stage')
    .option('--skip-validation', 'Skip the validation stage')
    .action((query: string, options: Record<string, unknown>) => {
      console.log(`[Placeholder] Would discover: "${query}"`);
      console.log('Options:', options);
      console.log('\nThis command is not yet implemented.');
      console.log('The CLI framework is ready for command implementation.');
    });

  // Run command placeholder
  const run = program.command('run').description('Manage pipeline runs');

  run
    .command('list [sessionId]')
    .description('List runs for a session')
    .action((sessionId?: string) => {
      console.log(`[Placeholder] Would list runs${sessionId ? ` for session: ${sessionId}` : ''}`);
    });

  run
    .command('resume')
    .description('Resume a run from a specific stage')
    .option('--from-stage <stage>', 'Stage number to resume from')
    .option('--run <runId>', 'Source run ID')
    .action((options: Record<string, unknown>) => {
      console.log('[Placeholder] Would resume run');
      console.log('Options:', options);
    });

  // Config command placeholder
  const config = program.command('config').description('View and manage configuration');

  config
    .command('show')
    .description('Show current configuration')
    .action(() => {
      console.log('[Placeholder] Would show configuration');
    });

  config
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key: string, value: string) => {
      console.log(`[Placeholder] Would set config: ${key} = ${value}`);
    });

  // Export command placeholder
  program
    .command('export <sessionId>')
    .description('Export session data')
    .option('-r, --run <runId>', 'Specific run to export', 'latest')
    .option('-z, --zip', 'Create a ZIP archive')
    .option('-o, --output <path>', 'Output path')
    .action((sessionId: string, options: Record<string, unknown>) => {
      console.log(`[Placeholder] Would export session: ${sessionId}`);
      console.log('Options:', options);
    });
}

/**
 * Get help text for all available commands.
 *
 * @returns Array of command help entries
 */
export function getCommandHelp(): Array<{ name: string; description: string }> {
  return [
    { name: 'discover <query>', description: 'Run a travel discovery query' },
    { name: 'session create', description: 'Create a new discovery session' },
    { name: 'session list', description: 'List all discovery sessions' },
    { name: 'session view <id>', description: 'View session details' },
    { name: 'session archive <id>', description: 'Archive a session (soft-delete)' },
    { name: 'run list [sessionId]', description: 'List runs for a session' },
    { name: 'run resume', description: 'Resume a run from a specific stage' },
    { name: 'config show', description: 'Show current configuration' },
    { name: 'config set <key> <value>', description: 'Set a configuration value' },
    { name: 'export <sessionId>', description: 'Export session data as ZIP' },
  ];
}
