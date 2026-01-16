#!/usr/bin/env node
/**
 * Travel Discovery Orchestrator CLI
 *
 * Main entry point for the travel CLI tool.
 * Uses commander for command parsing and execution.
 *
 * Usage:
 *   travel --help
 *   travel discover "best ramen in tokyo"
 *   travel session list
 *   travel run resume --from-stage 8
 *
 * @module cli
 * @see PRD Section 16 - CLI Interface
 * @see Task 22.0 - CLI Framework Setup
 */

import { Command } from 'commander';
import { VERSION } from './version.js';
import { BaseCommand, type GlobalOptions } from './base-command.js';
import { registerCommands } from './commands/index.js';

// ============================================================================
// Main Program Setup
// ============================================================================

/**
 * Create and configure the main CLI program.
 *
 * @returns Configured commander Program instance
 */
export function createProgram(): Command {
  const program = new Command();

  // Program metadata
  program
    .name('travel')
    .description('Travel Discovery Orchestrator - Find the best travel destinations using AI')
    .version(VERSION, '-V, --version', 'Display version number');

  // Global options (available to all commands)
  program
    .option('-v, --verbose', 'Enable verbose output for debugging')
    .option('-q, --quiet', 'Suppress all non-essential output')
    .option('--no-color', 'Disable colored output')
    .option('--data-dir <path>', 'Override default data directory (~/.travelagent)');

  // Create base command helper with global options
  program.hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts() as GlobalOptions;
    const baseCommand = new BaseCommand(opts);

    // Store base command in program for subcommands to access
    thisCommand.setOptionValue('_baseCommand', baseCommand);

    // Validate mutually exclusive flags
    if (opts.verbose && opts.quiet) {
      baseCommand.error('Cannot use both --verbose and --quiet flags');
    }
  });

  // Register all subcommands
  registerCommands(program);

  // Global error handling
  program.exitOverride((err) => {
    if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
      process.exit(0);
    }
    process.exit(1);
  });

  return program;
}

/**
 * Main CLI entry point.
 * Parses arguments and executes the appropriate command.
 */
export async function main(): Promise<void> {
  const program = createProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    // Error already handled by commander or base command
    if (error instanceof Error && error.message) {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
