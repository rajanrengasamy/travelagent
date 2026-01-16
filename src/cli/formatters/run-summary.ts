/**
 * Run Summary Formatters
 *
 * CLI output formatters for pipeline run summaries including:
 * - Standard run summary display
 * - Degraded run output (partial results)
 * - Resume run output
 * - Error summary formatting
 *
 * @module cli/formatters/run-summary
 * @see PRD Section 16.3 - Run Summary Format
 * @see PRD Section 16.4 - Resume Run Output
 * @see PRD Section 16.5 - Degraded Run Output
 * @see Task 22.5 - Run Summary Formatters
 */

import chalk from 'chalk';
import type { PipelineResult } from '../../pipeline/executor.js';
import type { CostResult } from '../../cost/tracker.js';
import { formatDuration } from './progress.js';
import { formatCostSummaryLine } from '../../cost/display.js';
import type { CostBreakdown } from '../../schemas/cost.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Run summary data for formatting.
 */
export interface RunSummary {
  /** Session ID */
  sessionId: string;
  /** Run ID */
  runId: string;
  /** Pipeline execution result */
  result: PipelineResult;
  /** Cost breakdown */
  cost?: CostResult;
  /** Number of candidates found */
  candidatesFound?: number;
  /** Top candidates selected */
  topCandidates?: number;
  /** Validations performed */
  validationsPerformed?: number;
}

/**
 * Degraded stage information.
 */
export interface DegradedStageInfo {
  /** Stage ID */
  stageId: string;
  /** Error message */
  error: string;
  /** Whether partial results are available */
  hasPartialResults: boolean;
}

/**
 * Resume run information.
 */
export interface ResumeInfo {
  /** Source run ID */
  sourceRunId: string;
  /** Stage number resumed from */
  fromStage: number;
  /** Stages that were skipped */
  stagesSkipped: string[];
}

// ============================================================================
// Main Formatters
// ============================================================================

/**
 * Format a complete run summary.
 *
 * @param summary - Run summary data
 * @returns Formatted string for terminal output
 *
 * @example
 * ```
 * === Run Complete ===
 * Session: 20260115-tokyo-ramen
 * Run:     20260115-143512
 *
 * Pipeline: SUCCESS
 * Duration: 2m 34s
 * Stages:   11/11 completed
 *
 * Results:
 *   Candidates found:    156
 *   Top candidates:      20
 *   Validations:         10
 *
 * Cost: Perplexity: 5,234 tok | Gemini: 12,453 tok | Total: $0.0892
 * ```
 */
export function formatRunSummary(summary: RunSummary): string {
  const lines: string[] = [];
  const { result } = summary;

  // Header
  lines.push(chalk.bold('=== Run Complete ==='));
  lines.push(`Session: ${chalk.cyan(summary.sessionId)}`);
  lines.push(`Run:     ${chalk.cyan(summary.runId)}`);
  lines.push('');

  // Pipeline status
  const status = result.success ? chalk.green('SUCCESS') : chalk.red('FAILED');
  lines.push(`Pipeline: ${status}`);
  lines.push(`Duration: ${formatDuration(result.timing.durationMs)}`);

  // Stage summary
  const totalStages = result.stagesExecuted.length + result.stagesSkipped.length;
  const completed = result.stagesExecuted.filter(
    (s) => !result.degradedStages.includes(s)
  ).length;
  lines.push(`Stages:   ${completed}/${totalStages} completed`);

  // Degraded stages warning
  if (result.degradedStages.length > 0) {
    lines.push(
      chalk.yellow(`Warning:  ${result.degradedStages.length} stage(s) degraded`)
    );
  }

  lines.push('');

  // Results summary
  if (
    summary.candidatesFound !== undefined ||
    summary.topCandidates !== undefined ||
    summary.validationsPerformed !== undefined
  ) {
    lines.push('Results:');
    if (summary.candidatesFound !== undefined) {
      lines.push(`  Candidates found:    ${summary.candidatesFound}`);
    }
    if (summary.topCandidates !== undefined) {
      lines.push(`  Top candidates:      ${summary.topCandidates}`);
    }
    if (summary.validationsPerformed !== undefined) {
      lines.push(`  Validations:         ${summary.validationsPerformed}`);
    }
    lines.push('');
  }

  // Cost summary
  if (summary.cost) {
    const costBreakdown: CostBreakdown = {
      schemaVersion: summary.cost.schemaVersion,
      runId: summary.cost.runId,
      providers: summary.cost.providers,
      total: summary.cost.total,
      currency: summary.cost.currency,
    };
    lines.push(`Cost: ${formatCostSummaryLine(costBreakdown)}`);
  }

  return lines.join('\n');
}

/**
 * Format a degraded run summary.
 *
 * Shows which stages failed and whether partial results are available.
 *
 * @param summary - Run summary data
 * @param degradedInfo - Degraded stage details
 * @returns Formatted string for terminal output
 *
 * @see PRD Section 16.5 - Degraded Run Output
 *
 * @example
 * ```
 * === Run Complete (Degraded) ===
 * Session: 20260115-tokyo-ramen
 * Run:     20260115-143512
 *
 * Pipeline: PARTIAL SUCCESS
 * Duration: 1m 45s
 *
 * Degraded Stages:
 *   ! 03_worker_outputs - API timeout (partial results available)
 *   ! 07_candidates_validated - Rate limit exceeded (no results)
 *
 * Note: Results may be incomplete due to degraded stages.
 * ```
 */
export function formatDegradedRunSummary(
  summary: RunSummary,
  degradedInfo: DegradedStageInfo[]
): string {
  const lines: string[] = [];
  const { result } = summary;

  // Header with degraded indicator
  lines.push(chalk.bold(chalk.yellow('=== Run Complete (Degraded) ===')));
  lines.push(`Session: ${chalk.cyan(summary.sessionId)}`);
  lines.push(`Run:     ${chalk.cyan(summary.runId)}`);
  lines.push('');

  // Pipeline status
  lines.push(`Pipeline: ${chalk.yellow('PARTIAL SUCCESS')}`);
  lines.push(`Duration: ${formatDuration(result.timing.durationMs)}`);
  lines.push('');

  // Degraded stages details
  if (degradedInfo.length > 0) {
    lines.push(chalk.yellow('Degraded Stages:'));
    for (const info of degradedInfo) {
      const partialLabel = info.hasPartialResults
        ? chalk.dim('(partial results available)')
        : chalk.dim('(no results)');
      lines.push(
        `  ${chalk.yellow('!')} ${info.stageId} - ${info.error} ${partialLabel}`
      );
    }
    lines.push('');
  }

  // Warning note
  lines.push(
    chalk.dim('Note: Results may be incomplete due to degraded stages.')
  );

  // Cost summary if available
  if (summary.cost) {
    lines.push('');
    const costBreakdown: CostBreakdown = {
      schemaVersion: summary.cost.schemaVersion,
      runId: summary.cost.runId,
      providers: summary.cost.providers,
      total: summary.cost.total,
      currency: summary.cost.currency,
    };
    lines.push(`Cost: ${formatCostSummaryLine(costBreakdown)}`);
  }

  return lines.join('\n');
}

/**
 * Format a resume run summary.
 *
 * Shows which stages were skipped and the source run.
 *
 * @param summary - Run summary data
 * @param resumeInfo - Resume information
 * @returns Formatted string for terminal output
 *
 * @see PRD Section 16.4 - Resume Run Output
 *
 * @example
 * ```
 * === Resume Run Complete ===
 * Session: 20260115-tokyo-ramen
 * Run:     20260115-153000-resume
 *
 * Resumed from: Stage 8 (top_candidates)
 * Source run:   20260115-143512
 *
 * Pipeline: SUCCESS
 * Duration: 45s
 * Stages:   3 executed, 8 skipped
 *
 * Skipped Stages:
 *   - 00_enhancement
 *   - 01_intake
 *   - ... (6 more)
 * ```
 */
export function formatResumeRunSummary(
  summary: RunSummary,
  resumeInfo: ResumeInfo
): string {
  const lines: string[] = [];
  const { result } = summary;

  // Header
  lines.push(chalk.bold('=== Resume Run Complete ==='));
  lines.push(`Session: ${chalk.cyan(summary.sessionId)}`);
  lines.push(`Run:     ${chalk.cyan(summary.runId)}`);
  lines.push('');

  // Resume information
  lines.push(`Resumed from: Stage ${resumeInfo.fromStage}`);
  lines.push(`Source run:   ${resumeInfo.sourceRunId}`);
  lines.push('');

  // Pipeline status
  const status = result.success ? chalk.green('SUCCESS') : chalk.red('FAILED');
  lines.push(`Pipeline: ${status}`);
  lines.push(`Duration: ${formatDuration(result.timing.durationMs)}`);
  lines.push(
    `Stages:   ${result.stagesExecuted.length} executed, ${result.stagesSkipped.length} skipped`
  );
  lines.push('');

  // Skipped stages summary
  if (resumeInfo.stagesSkipped.length > 0) {
    lines.push(chalk.dim('Skipped Stages:'));
    const maxToShow = 3;
    for (let i = 0; i < Math.min(maxToShow, resumeInfo.stagesSkipped.length); i++) {
      lines.push(chalk.dim(`  - ${resumeInfo.stagesSkipped[i]}`));
    }
    if (resumeInfo.stagesSkipped.length > maxToShow) {
      lines.push(
        chalk.dim(`  ... (${resumeInfo.stagesSkipped.length - maxToShow} more)`)
      );
    }
    lines.push('');
  }

  // Results summary
  if (
    summary.candidatesFound !== undefined ||
    summary.topCandidates !== undefined
  ) {
    lines.push('Results:');
    if (summary.candidatesFound !== undefined) {
      lines.push(`  Candidates found:    ${summary.candidatesFound}`);
    }
    if (summary.topCandidates !== undefined) {
      lines.push(`  Top candidates:      ${summary.topCandidates}`);
    }
    lines.push('');
  }

  // Cost summary
  if (summary.cost) {
    const costBreakdown: CostBreakdown = {
      schemaVersion: summary.cost.schemaVersion,
      runId: summary.cost.runId,
      providers: summary.cost.providers,
      total: summary.cost.total,
      currency: summary.cost.currency,
    };
    lines.push(`Cost: ${formatCostSummaryLine(costBreakdown)}`);
  }

  return lines.join('\n');
}

/**
 * Format pipeline errors for display.
 *
 * @param errors - Array of stage errors from pipeline result
 * @returns Formatted error summary
 */
export function formatErrorSummary(
  errors: Array<{ stageId: string; error: string; continued?: boolean }>
): string {
  const lines: string[] = [];

  lines.push(chalk.bold.red('=== Errors ==='));
  lines.push('');

  for (const err of errors) {
    const icon = err.continued ? chalk.yellow('\u26A0') : chalk.red('\u2718');
    const continuedLabel = err.continued
      ? chalk.dim(' (continued)')
      : chalk.red(' (stopped)');

    lines.push(`${icon} ${err.stageId}${continuedLabel}`);
    lines.push(`  ${chalk.dim(err.error)}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format per-stage timing breakdown.
 *
 * @param timing - Timing information from pipeline result
 * @returns Formatted timing summary
 */
export function formatTimingBreakdown(
  timing: { perStage: Record<string, number>; durationMs: number }
): string {
  const lines: string[] = [];

  lines.push(chalk.bold('=== Timing Breakdown ==='));
  lines.push('');

  // Sort stages by number
  const stages = Object.entries(timing.perStage).sort(([a], [b]) => {
    const numA = parseInt(a.substring(0, 2), 10);
    const numB = parseInt(b.substring(0, 2), 10);
    return numA - numB;
  });

  // Calculate bar widths
  const maxDuration = Math.max(...Object.values(timing.perStage), 1);
  const barWidth = 30;

  for (const [stageId, durationMs] of stages) {
    const percentage = Math.round((durationMs / timing.durationMs) * 100);
    const barLength = Math.round((durationMs / maxDuration) * barWidth);
    const bar = chalk.green('\u2588'.repeat(barLength));

    lines.push(
      `${stageId.padEnd(22)} ${bar} ${formatDuration(durationMs).padStart(8)} (${percentage}%)`
    );
  }

  lines.push('');
  lines.push(`${'Total'.padEnd(22)} ${' '.repeat(barWidth)} ${formatDuration(timing.durationMs)}`);

  return lines.join('\n');
}

/**
 * Format a compact one-line run status.
 *
 * @param sessionId - Session ID
 * @param runId - Run ID
 * @param success - Whether run succeeded
 * @param durationMs - Duration in milliseconds
 * @returns Single-line status string
 */
export function formatRunStatusLine(
  sessionId: string,
  runId: string,
  success: boolean,
  durationMs: number
): string {
  const status = success ? chalk.green('\u2714 SUCCESS') : chalk.red('\u2718 FAILED');
  return `${status} ${sessionId}/${runId} (${formatDuration(durationMs)})`;
}

/**
 * Format a quick summary for the end of a run.
 *
 * @param result - Pipeline result
 * @returns Compact summary string
 */
export function formatQuickSummary(result: PipelineResult): string {
  const parts: string[] = [];

  // Status - check degraded first since success can be true with degraded stages
  if (result.degradedStages.length > 0) {
    parts.push(chalk.yellow('\u26A0 Pipeline complete (degraded)'));
  } else if (result.success) {
    parts.push(chalk.green('\u2714 Pipeline complete'));
  } else {
    parts.push(chalk.red('\u2718 Pipeline failed'));
  }

  // Duration
  parts.push(chalk.dim(`(${formatDuration(result.timing.durationMs)})`));

  // Stages
  parts.push(
    chalk.dim(
      `[${result.stagesExecuted.length} executed${result.stagesSkipped.length > 0 ? `, ${result.stagesSkipped.length} skipped` : ''}]`
    )
  );

  return parts.join(' ');
}
