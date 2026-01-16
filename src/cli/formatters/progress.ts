/**
 * Progress Formatters
 *
 * CLI progress display utilities including:
 * - Spinner for long-running operations
 * - Stage progress display with checkmarks
 * - Progress bar for batch operations
 *
 * Uses the ora library for terminal spinners.
 *
 * @module cli/formatters/progress
 * @see PRD Section 16 - CLI Interface
 * @see Task 22.4 - Progress Formatters
 */

import ora, { type Ora } from 'ora';
import chalk from 'chalk';
import { STAGE_NAMES, type StageNumber } from '../../pipeline/types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Stage display status for progress tracking.
 */
export type StageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * Stage display information.
 */
export interface StageDisplay {
  /** Stage number (0-10) */
  number: StageNumber;
  /** Stage name */
  name: string;
  /** Current status */
  status: StageStatus;
  /** Duration in milliseconds (if completed) */
  durationMs?: number;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Progress spinner options.
 */
export interface SpinnerOptions {
  /** Custom text to display */
  text?: string;
  /** Spinner color */
  color?: 'cyan' | 'green' | 'yellow' | 'red' | 'blue' | 'magenta' | 'white';
  /** Whether to persist spinner on success/fail */
  persist?: boolean;
}

// ============================================================================
// Stage Labels
// ============================================================================

/**
 * Human-readable labels for each stage.
 */
const STAGE_LABELS: Record<StageNumber, string> = {
  0: 'Enhancement',
  1: 'Intake',
  2: 'Router',
  3: 'Workers',
  4: 'Normalize',
  5: 'Dedupe',
  6: 'Rank',
  7: 'Validate',
  8: 'Top Candidates',
  9: 'Aggregate',
  10: 'Results',
};

// ============================================================================
// Status Icons
// ============================================================================

/**
 * Icons for each stage status.
 */
const STATUS_ICONS: Record<StageStatus, string> = {
  pending: chalk.dim('\u25CB'), // ○
  running: chalk.cyan('\u25CF'), // ●
  completed: chalk.green('\u2714'), // ✔
  failed: chalk.red('\u2718'), // ✘
  skipped: chalk.yellow('\u2212'), // −
};

/**
 * Plain text icons for non-TTY output.
 */
const STATUS_ICONS_PLAIN: Record<StageStatus, string> = {
  pending: '[ ]',
  running: '[*]',
  completed: '[+]',
  failed: '[X]',
  skipped: '[-]',
};

// ============================================================================
// Spinner Class
// ============================================================================

/**
 * Progress spinner wrapper with consistent styling.
 *
 * @example
 * ```typescript
 * const spinner = new ProgressSpinner('Loading data...');
 * spinner.start();
 *
 * try {
 *   await loadData();
 *   spinner.succeed('Data loaded successfully');
 * } catch (err) {
 *   spinner.fail('Failed to load data');
 * }
 * ```
 */
export class ProgressSpinner {
  private spinner: Ora;
  private readonly isTTY: boolean;
  private startTime: number = 0;

  /**
   * Create a new progress spinner.
   *
   * @param text - Initial spinner text
   * @param options - Spinner options
   */
  constructor(text: string, options: SpinnerOptions = {}) {
    this.isTTY = process.stdout.isTTY === true;

    this.spinner = ora({
      text,
      color: options.color ?? 'cyan',
      isEnabled: this.isTTY,
      stream: process.stdout,
    });
  }

  /**
   * Start the spinner.
   *
   * @param text - Optional text to display
   */
  start(text?: string): this {
    this.startTime = Date.now();
    if (text) {
      this.spinner.text = text;
    }
    this.spinner.start();
    return this;
  }

  /**
   * Update spinner text.
   *
   * @param text - New text to display
   */
  update(text: string): this {
    this.spinner.text = text;
    return this;
  }

  /**
   * Stop spinner with success state.
   *
   * @param text - Success message
   */
  succeed(text?: string): this {
    const duration = Date.now() - this.startTime;
    const durationStr = duration > 0 ? chalk.dim(` (${formatDuration(duration)})`) : '';
    this.spinner.succeed((text ?? this.spinner.text) + durationStr);
    return this;
  }

  /**
   * Stop spinner with failure state.
   *
   * @param text - Failure message
   */
  fail(text?: string): this {
    this.spinner.fail(text);
    return this;
  }

  /**
   * Stop spinner with warning state.
   *
   * @param text - Warning message
   */
  warn(text?: string): this {
    this.spinner.warn(text);
    return this;
  }

  /**
   * Stop spinner with info state.
   *
   * @param text - Info message
   */
  info(text?: string): this {
    this.spinner.info(text);
    return this;
  }

  /**
   * Stop spinner without any symbol.
   */
  stop(): this {
    this.spinner.stop();
    return this;
  }

  /**
   * Clear the spinner.
   */
  clear(): this {
    this.spinner.clear();
    return this;
  }

  /**
   * Check if spinner is currently spinning.
   */
  isSpinning(): boolean {
    return this.spinner.isSpinning;
  }
}

// ============================================================================
// Stage Progress Display
// ============================================================================

/**
 * Display pipeline stage progress with checkmarks.
 *
 * @example
 * ```typescript
 * const progress = new StageProgressDisplay();
 *
 * progress.startStage(0);
 * // ... run enhancement stage
 * progress.completeStage(0, 1234);
 *
 * progress.startStage(1);
 * // ... run intake stage
 * progress.failStage(1, 'Network error');
 *
 * progress.printSummary();
 * ```
 */
export class StageProgressDisplay {
  private stages: Map<StageNumber, StageDisplay> = new Map();
  private readonly isTTY: boolean;
  private currentSpinner: ProgressSpinner | null = null;

  /**
   * Create a new stage progress display.
   */
  constructor() {
    this.isTTY = process.stdout.isTTY === true;

    // Initialize all stages as pending
    for (let i = 0; i <= 10; i++) {
      const num = i as StageNumber;
      this.stages.set(num, {
        number: num,
        name: STAGE_NAMES[num],
        status: 'pending',
      });
    }
  }

  /**
   * Mark a stage as running.
   *
   * @param stageNumber - Stage number to start
   */
  startStage(stageNumber: StageNumber): void {
    const stage = this.stages.get(stageNumber);
    if (stage) {
      stage.status = 'running';

      // Start spinner for running stage
      if (this.isTTY) {
        this.currentSpinner = new ProgressSpinner(
          `${STAGE_LABELS[stageNumber]}...`
        );
        this.currentSpinner.start();
      } else {
        console.log(`[*] Stage ${stageNumber}: ${STAGE_LABELS[stageNumber]}...`);
      }
    }
  }

  /**
   * Mark a stage as completed.
   *
   * @param stageNumber - Stage number that completed
   * @param durationMs - Duration in milliseconds
   */
  completeStage(stageNumber: StageNumber, durationMs: number): void {
    const stage = this.stages.get(stageNumber);
    if (stage) {
      stage.status = 'completed';
      stage.durationMs = durationMs;

      // Stop spinner with success
      if (this.currentSpinner) {
        this.currentSpinner.succeed(
          `${STAGE_LABELS[stageNumber]} complete`
        );
        this.currentSpinner = null;
      } else {
        const durationStr = formatDuration(durationMs);
        console.log(`[+] Stage ${stageNumber}: ${STAGE_LABELS[stageNumber]} (${durationStr})`);
      }
    }
  }

  /**
   * Mark a stage as failed.
   *
   * @param stageNumber - Stage number that failed
   * @param error - Error message
   */
  failStage(stageNumber: StageNumber, error: string): void {
    const stage = this.stages.get(stageNumber);
    if (stage) {
      stage.status = 'failed';
      stage.error = error;

      // Stop spinner with failure
      if (this.currentSpinner) {
        this.currentSpinner.fail(`${STAGE_LABELS[stageNumber]} failed`);
        this.currentSpinner = null;
      } else {
        console.log(`[X] Stage ${stageNumber}: ${STAGE_LABELS[stageNumber]} - ${error}`);
      }
    }
  }

  /**
   * Mark a stage as skipped.
   *
   * @param stageNumber - Stage number that was skipped
   */
  skipStage(stageNumber: StageNumber): void {
    const stage = this.stages.get(stageNumber);
    if (stage) {
      stage.status = 'skipped';

      if (!this.isTTY) {
        console.log(`[-] Stage ${stageNumber}: ${STAGE_LABELS[stageNumber]} (skipped)`);
      }
    }
  }

  /**
   * Get the display for a specific stage.
   *
   * @param stageNumber - Stage number
   * @returns Stage display information
   */
  getStageDisplay(stageNumber: StageNumber): StageDisplay | undefined {
    return this.stages.get(stageNumber);
  }

  /**
   * Get all stage displays.
   *
   * @returns Array of stage displays
   */
  getAllStages(): StageDisplay[] {
    return Array.from(this.stages.values());
  }

  /**
   * Format a single stage line.
   *
   * @param stage - Stage display info
   * @returns Formatted string
   */
  formatStageLine(stage: StageDisplay): string {
    const icon = this.isTTY ? STATUS_ICONS[stage.status] : STATUS_ICONS_PLAIN[stage.status];
    const num = stage.number.toString().padStart(2, '0');
    const name = STAGE_LABELS[stage.number];

    let line = `${icon} ${num} ${name}`;

    if (stage.durationMs !== undefined) {
      line += chalk.dim(` (${formatDuration(stage.durationMs)})`);
    }

    if (stage.error) {
      line += chalk.red(` - ${stage.error}`);
    }

    return line;
  }

  /**
   * Print a summary of all stages.
   */
  printSummary(): void {
    console.log();
    console.log(chalk.bold('Pipeline Progress'));
    console.log(chalk.dim('─'.repeat(40)));

    for (const stage of this.getAllStages()) {
      console.log(this.formatStageLine(stage));
    }

    console.log();
  }

  /**
   * Get counts of stages by status.
   *
   * @returns Status counts
   */
  getCounts(): Record<StageStatus, number> {
    const counts: Record<StageStatus, number> = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    };

    for (const stage of this.stages.values()) {
      counts[stage.status]++;
    }

    return counts;
  }

  /**
   * Check if all stages completed successfully.
   */
  isSuccess(): boolean {
    for (const stage of this.stages.values()) {
      if (stage.status === 'failed') {
        return false;
      }
    }
    return true;
  }

  /**
   * Get total duration of all completed stages.
   */
  getTotalDuration(): number {
    let total = 0;
    for (const stage of this.stages.values()) {
      if (stage.durationMs) {
        total += stage.durationMs;
      }
    }
    return total;
  }
}

// ============================================================================
// Progress Bar
// ============================================================================

/**
 * Simple progress bar for batch operations.
 *
 * @example
 * ```typescript
 * const progress = createProgressBar(100, 'Processing');
 *
 * for (let i = 0; i < 100; i++) {
 *   await processItem(i);
 *   progress.update(i + 1);
 * }
 *
 * progress.complete();
 * ```
 */
export interface ProgressBar {
  /** Update progress to a specific value */
  update(current: number): void;
  /** Complete the progress bar */
  complete(): void;
  /** Fail the progress bar */
  fail(message?: string): void;
}

/**
 * Create a progress bar.
 *
 * @param total - Total items to process
 * @param label - Label to display
 * @param width - Bar width in characters
 * @returns Progress bar interface
 */
export function createProgressBar(
  total: number,
  label: string = 'Progress',
  width: number = 30
): ProgressBar {
  const isTTY = process.stdout.isTTY === true;
  let lastOutput = '';

  const render = (current: number) => {
    const percentage = Math.min(100, Math.round((current / total) * 100));
    const filled = Math.round((current / total) * width);
    const empty = width - filled;

    const bar = chalk.green('\u2588'.repeat(filled)) + chalk.dim('\u2591'.repeat(empty));
    const output = `${label}: ${bar} ${percentage}% (${current}/${total})`;

    if (isTTY) {
      // Clear previous line and write new one
      if (lastOutput) {
        process.stdout.write('\r' + ' '.repeat(lastOutput.length) + '\r');
      }
      process.stdout.write(output);
      lastOutput = output;
    }
  };

  return {
    update(current: number) {
      render(current);
    },

    complete() {
      if (isTTY && lastOutput) {
        process.stdout.write('\n');
      }
      console.log(chalk.green(`${label}: Complete (${total} items)`));
    },

    fail(message?: string) {
      if (isTTY && lastOutput) {
        process.stdout.write('\n');
      }
      console.log(chalk.red(`${label}: Failed${message ? ` - ${message}` : ''}`));
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format a duration in milliseconds to human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Create a spinner for a single operation.
 *
 * @param text - Spinner text
 * @param options - Spinner options
 * @returns Progress spinner
 */
export function createSpinner(text: string, options?: SpinnerOptions): ProgressSpinner {
  return new ProgressSpinner(text, options);
}

/**
 * Create a stage progress display.
 *
 * @returns Stage progress display
 */
export function createStageProgress(): StageProgressDisplay {
  return new StageProgressDisplay();
}
