/**
 * Base Command
 *
 * Provides common functionality for all CLI commands including:
 * - Global option handling (verbose, quiet, no-color)
 * - Consistent error handling and exit codes
 * - Output utilities (log, warn, error)
 * - Progress spinner integration
 *
 * @module cli/base-command
 * @see PRD Section 16 - CLI Interface
 * @see Task 22.3 - Base Command
 */

import chalk from 'chalk';
import { getDataDir } from '../storage/paths.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Global CLI options available to all commands.
 */
export interface GlobalOptions {
  /** Enable verbose output for debugging */
  verbose?: boolean;
  /** Suppress all non-essential output */
  quiet?: boolean;
  /** Disable colored output */
  color?: boolean; // commander inverts --no-color to color: false
  /** Override default data directory */
  dataDir?: string;
}

/**
 * Log levels for output control.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ============================================================================
// Exit Codes
// ============================================================================

/**
 * Standard exit codes for the CLI.
 */
export const EXIT_CODES = {
  /** Successful execution */
  SUCCESS: 0,
  /** General error */
  ERROR: 1,
  /** Invalid usage or arguments */
  USAGE_ERROR: 2,
  /** Resource not found (session, run, etc.) */
  NOT_FOUND: 3,
  /** API or network error */
  API_ERROR: 4,
  /** User cancelled operation */
  CANCELLED: 130,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

// ============================================================================
// BaseCommand Class
// ============================================================================

/**
 * Base command class providing common CLI functionality.
 *
 * All command handlers should receive a BaseCommand instance
 * to access consistent logging, error handling, and options.
 *
 * @example
 * ```typescript
 * async function discoverHandler(query: string, options: DiscoverOptions, cmd: Command) {
 *   const base = cmd.opts()._baseCommand as BaseCommand;
 *
 *   base.info(`Discovering: ${query}`);
 *
 *   try {
 *     const results = await runPipeline(query);
 *     base.success('Discovery complete!');
 *   } catch (err) {
 *     base.error('Discovery failed', err);
 *   }
 * }
 * ```
 */
export class BaseCommand {
  /** Global options from CLI */
  readonly options: GlobalOptions;

  /** Whether colored output is enabled */
  private readonly useColor: boolean;

  /** Resolved data directory path */
  readonly dataDir: string;

  /**
   * Create a new BaseCommand instance.
   *
   * @param options - Global CLI options
   */
  constructor(options: GlobalOptions) {
    this.options = options;
    this.useColor = options.color !== false && process.stdout.isTTY === true;
    this.dataDir = options.dataDir ?? getDataDir();

    // Configure chalk based on color preference
    if (!this.useColor) {
      chalk.level = 0;
    }
  }

  // ==========================================================================
  // Output Methods
  // ==========================================================================

  /**
   * Log a debug message (only visible in verbose mode).
   *
   * @param message - Message to log
   * @param args - Additional arguments to log
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.options.verbose) {
      console.log(chalk.dim(`[DEBUG] ${message}`), ...args);
    }
  }

  /**
   * Log an informational message (hidden in quiet mode).
   *
   * @param message - Message to log
   * @param args - Additional arguments to log
   */
  info(message: string, ...args: unknown[]): void {
    if (!this.options.quiet) {
      console.log(message, ...args);
    }
  }

  /**
   * Log a warning message (always visible).
   *
   * @param message - Warning message
   * @param args - Additional arguments to log
   */
  warn(message: string, ...args: unknown[]): void {
    console.warn(chalk.yellow(`Warning: ${message}`), ...args);
  }

  /**
   * Log an error message and optionally exit.
   *
   * @param message - Error message
   * @param errorOrCode - Error object or exit code
   */
  error(message: string, errorOrCode?: Error | ExitCode): void {
    console.error(chalk.red(`Error: ${message}`));

    if (errorOrCode instanceof Error) {
      if (this.options.verbose) {
        console.error(chalk.dim(errorOrCode.stack ?? errorOrCode.message));
      }
      process.exit(EXIT_CODES.ERROR);
    } else if (typeof errorOrCode === 'number') {
      process.exit(errorOrCode);
    } else {
      process.exit(EXIT_CODES.ERROR);
    }
  }

  /**
   * Log a success message with green checkmark.
   *
   * @param message - Success message
   */
  success(message: string): void {
    if (!this.options.quiet) {
      console.log(chalk.green(`${this.useColor ? '\u2714' : '[OK]'} ${message}`));
    }
  }

  /**
   * Log a failure message with red X.
   *
   * @param message - Failure message
   */
  fail(message: string): void {
    console.log(chalk.red(`${this.useColor ? '\u2718' : '[FAIL]'} ${message}`));
  }

  /**
   * Print a blank line (hidden in quiet mode).
   */
  blank(): void {
    if (!this.options.quiet) {
      console.log();
    }
  }

  /**
   * Print a horizontal divider line.
   *
   * @param char - Character to use for divider (default: '-')
   * @param width - Width of divider (default: 40)
   */
  divider(char = '-', width = 40): void {
    if (!this.options.quiet) {
      console.log(chalk.dim(char.repeat(width)));
    }
  }

  /**
   * Print a section header.
   *
   * @param title - Section title
   */
  section(title: string): void {
    if (!this.options.quiet) {
      console.log();
      console.log(chalk.bold(title));
      this.divider('=', title.length);
    }
  }

  /**
   * Print data as formatted JSON.
   *
   * @param data - Data to print
   */
  json(data: unknown): void {
    console.log(JSON.stringify(data, null, 2));
  }

  /**
   * Print a key-value pair.
   *
   * @param key - Label
   * @param value - Value to display
   */
  keyValue(key: string, value: string | number): void {
    if (!this.options.quiet) {
      console.log(`${chalk.dim(key + ':')} ${value}`);
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Check if verbose mode is enabled.
   */
  isVerbose(): boolean {
    return this.options.verbose === true;
  }

  /**
   * Check if quiet mode is enabled.
   */
  isQuiet(): boolean {
    return this.options.quiet === true;
  }

  /**
   * Check if colors are enabled.
   */
  hasColor(): boolean {
    return this.useColor;
  }

  /**
   * Exit with success code.
   */
  exit(): never {
    process.exit(EXIT_CODES.SUCCESS);
  }

  /**
   * Exit with specific code.
   *
   * @param code - Exit code
   */
  exitWith(code: ExitCode): never {
    process.exit(code);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a BaseCommand from global options.
 *
 * @param options - Global CLI options
 * @returns New BaseCommand instance
 */
export function createBaseCommand(options: GlobalOptions): BaseCommand {
  return new BaseCommand(options);
}

/**
 * Get the base command from a commander Command instance.
 * Used by subcommand handlers to access shared functionality.
 *
 * @param cmd - Commander command instance
 * @returns BaseCommand or throws if not found
 */
export function getBaseCommand(cmd: { opts(): Record<string, unknown> }): BaseCommand {
  const base = cmd.opts()['_baseCommand'];
  if (!(base instanceof BaseCommand)) {
    // Create a default one if not available (for testing)
    return new BaseCommand({});
  }
  return base;
}
