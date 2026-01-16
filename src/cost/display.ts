/**
 * Cost Display
 *
 * CLI formatting for cost breakdowns and usage summaries.
 * Produces human-readable output for terminal display.
 *
 * @module cost/display
 * @see PRD Section 9.3 - CLI Cost Display
 * @see Task 19.3 - Cost Display
 */

import { formatCost } from '../config/costs.js';
import type { CostBreakdown } from '../schemas/cost.js';
import type { DetailedCostBreakdown, StageCostBreakdown } from './calculator.js';
import type { UsageSummary, StageUsage } from './tracker.js';

// ============================================================================
// Constants
// ============================================================================

/** Horizontal line for dividers */
const DIVIDER = '----------------------------------------';
const THIN_DIVIDER = '--------------------';

// ============================================================================
// Main Display Functions
// ============================================================================

/**
 * Format a cost breakdown for CLI display.
 *
 * @param breakdown - Cost breakdown to format
 * @returns Formatted string for terminal output
 *
 * @example
 * ```
 * === Cost Summary ===
 * Run: 20240115-120000
 *
 * Provider        Tokens (I/O)        Cost
 * ----------------------------------------
 * Perplexity      1,000 / 500         $0.0165
 * Gemini          2,000 / 800         $0.0034
 * Places          10 calls            $0.3200
 * YouTube         500 units           $0.0000
 * ----------------------------------------
 * Total                               $0.3399
 * ```
 */
export function formatCostBreakdown(breakdown: CostBreakdown): string {
  const lines: string[] = [];

  lines.push('=== Cost Summary ===');
  lines.push(`Run: ${breakdown.runId}`);
  lines.push('');

  // Header
  lines.push(formatTableHeader());
  lines.push(DIVIDER);

  // Provider rows
  const { providers } = breakdown;

  if (providers.perplexity) {
    lines.push(formatLLMProviderRow('Perplexity', providers.perplexity));
  }

  if (providers.gemini) {
    lines.push(formatLLMProviderRow('Gemini', providers.gemini));
  }

  if (providers.openai) {
    lines.push(formatLLMProviderRow('OpenAI', providers.openai));
  }

  if (providers.places) {
    lines.push(formatPlacesRow(providers.places));
  }

  if (providers.youtube) {
    lines.push(formatYouTubeRow(providers.youtube));
  }

  // Total
  lines.push(DIVIDER);
  lines.push(formatTotalRow(breakdown.total));

  return lines.join('\n');
}

/**
 * Format a detailed cost breakdown with per-stage costs.
 *
 * @param breakdown - Detailed cost breakdown to format
 * @returns Formatted string for terminal output
 */
export function formatDetailedCostBreakdown(breakdown: DetailedCostBreakdown): string {
  const lines: string[] = [];

  // Main summary
  lines.push(formatCostBreakdown(breakdown));

  // Per-stage breakdown if available
  if (breakdown.stages.length > 0) {
    lines.push('');
    lines.push('=== Per-Stage Costs ===');
    lines.push('');

    for (const stage of breakdown.stages) {
      lines.push(formatStageCost(stage));
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Format a stage cost breakdown.
 *
 * @param stageCost - Stage cost breakdown
 * @returns Formatted string
 */
export function formatStageCost(stageCost: StageCostBreakdown): string {
  const lines: string[] = [];

  lines.push(`Stage: ${stageCost.stageId}`);
  lines.push(THIN_DIVIDER);

  const { providers } = stageCost;

  if (providers.perplexity) {
    lines.push(formatCompactLLMRow('Perplexity', providers.perplexity));
  }

  if (providers.gemini) {
    lines.push(formatCompactLLMRow('Gemini', providers.gemini));
  }

  if (providers.openai) {
    lines.push(formatCompactLLMRow('OpenAI', providers.openai));
  }

  if (providers.places) {
    lines.push(`  Places: ${providers.places.calls} calls - ${formatCost(providers.places.cost)}`);
  }

  if (providers.youtube) {
    lines.push(`  YouTube: ${providers.youtube.units} units - ${formatCost(providers.youtube.cost)}`);
  }

  lines.push(`  Total: ${formatCost(stageCost.total)}`);

  return lines.join('\n');
}

/**
 * Format a usage summary (without costs).
 *
 * @param usage - Usage summary to format
 * @returns Formatted string
 */
export function formatUsageSummary(usage: UsageSummary): string {
  const lines: string[] = [];

  lines.push('=== Usage Summary ===');
  lines.push('');

  lines.push('Token Usage:');
  lines.push(
    `  Perplexity: ${formatNumber(usage.tokens.perplexity.input)} in / ${formatNumber(usage.tokens.perplexity.output)} out`
  );
  lines.push(
    `  Gemini:     ${formatNumber(usage.tokens.gemini.input)} in / ${formatNumber(usage.tokens.gemini.output)} out`
  );
  lines.push(
    `  OpenAI:     ${formatNumber(usage.tokens.openai.input)} in / ${formatNumber(usage.tokens.openai.output)} out`
  );
  lines.push('');

  lines.push('API Usage:');
  lines.push(`  Places calls:   ${formatNumber(usage.placesCalls)}`);
  lines.push(`  YouTube units:  ${formatNumber(usage.youtubeUnits)}`);

  // Per-stage breakdown if available
  if (usage.stages.length > 0) {
    lines.push('');
    lines.push('Per-Stage Usage:');
    for (const stage of usage.stages) {
      lines.push(formatStageUsage(stage));
    }
  }

  return lines.join('\n');
}

/**
 * Format a stage usage record.
 *
 * @param stage - Stage usage record
 * @returns Formatted string
 */
export function formatStageUsage(stage: StageUsage): string {
  const parts: string[] = [];

  const totalTokens =
    stage.tokens.perplexity.input +
    stage.tokens.perplexity.output +
    stage.tokens.gemini.input +
    stage.tokens.gemini.output +
    stage.tokens.openai.input +
    stage.tokens.openai.output;

  if (totalTokens > 0) {
    parts.push(`${formatNumber(totalTokens)} tokens`);
  }

  if (stage.placesCalls > 0) {
    parts.push(`${stage.placesCalls} Places calls`);
  }

  if (stage.youtubeUnits > 0) {
    parts.push(`${stage.youtubeUnits} YT units`);
  }

  const usage = parts.length > 0 ? parts.join(', ') : 'no usage';

  return `  ${stage.stageId}: ${usage}`;
}

/**
 * Format a compact one-line cost summary.
 *
 * @param breakdown - Cost breakdown
 * @returns Single-line summary string
 */
export function formatCostSummaryLine(breakdown: CostBreakdown): string {
  const parts: string[] = [];

  const { providers } = breakdown;

  if (providers.perplexity) {
    const tokens = providers.perplexity.tokens.input + providers.perplexity.tokens.output;
    parts.push(`Perplexity: ${formatNumber(tokens)} tok`);
  }

  if (providers.gemini) {
    const tokens = providers.gemini.tokens.input + providers.gemini.tokens.output;
    parts.push(`Gemini: ${formatNumber(tokens)} tok`);
  }

  if (providers.openai) {
    const tokens = providers.openai.tokens.input + providers.openai.tokens.output;
    parts.push(`OpenAI: ${formatNumber(tokens)} tok`);
  }

  if (providers.places) {
    parts.push(`Places: ${providers.places.calls} calls`);
  }

  if (providers.youtube) {
    parts.push(`YouTube: ${providers.youtube.units} units`);
  }

  const usage = parts.length > 0 ? parts.join(' | ') : 'No usage';

  return `${usage} | Total: ${formatCost(breakdown.total)}`;
}

// ============================================================================
// Table Formatting Helpers
// ============================================================================

/**
 * Format table header row.
 */
function formatTableHeader(): string {
  return padColumn('Provider', 16) + padColumn('Usage', 20) + 'Cost';
}

/**
 * Format LLM provider row (with tokens).
 */
function formatLLMProviderRow(
  name: string,
  data: { tokens: { input: number; output: number }; cost: number }
): string {
  const tokensStr = `${formatNumber(data.tokens.input)} / ${formatNumber(data.tokens.output)}`;
  return padColumn(name, 16) + padColumn(tokensStr, 20) + formatCost(data.cost);
}

/**
 * Format compact LLM row for stage display.
 */
function formatCompactLLMRow(
  name: string,
  data: { tokens: { input: number; output: number }; cost: number }
): string {
  return `  ${name}: ${formatNumber(data.tokens.input)}/${formatNumber(data.tokens.output)} tokens - ${formatCost(data.cost)}`;
}

/**
 * Format Places API row.
 */
function formatPlacesRow(data: { calls: number; cost: number }): string {
  return padColumn('Places', 16) + padColumn(`${data.calls} calls`, 20) + formatCost(data.cost);
}

/**
 * Format YouTube row.
 */
function formatYouTubeRow(data: { units: number; cost: number }): string {
  return padColumn('YouTube', 16) + padColumn(`${data.units} units`, 20) + formatCost(data.cost);
}

/**
 * Format total row.
 */
function formatTotalRow(total: number): string {
  return padColumn('Total', 16) + padColumn('', 20) + formatCost(total);
}

/**
 * Pad a string to fill a column.
 */
function padColumn(str: string, width: number): string {
  return str.padEnd(width);
}

/**
 * Format a number with commas for readability.
 */
function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

// ============================================================================
// Color Helpers (for future terminal color support)
// ============================================================================

/**
 * Check if terminal supports colors.
 * For now, returns false. Can be extended with chalk/colorette.
 */
export function supportsColor(): boolean {
  // Could check process.stdout.isTTY and TERM env var
  return false;
}

/**
 * Wrap text in green (success) color if supported.
 */
export function green(text: string): string {
  return supportsColor() ? `\x1b[32m${text}\x1b[0m` : text;
}

/**
 * Wrap text in yellow (warning) color if supported.
 */
export function yellow(text: string): string {
  return supportsColor() ? `\x1b[33m${text}\x1b[0m` : text;
}

/**
 * Wrap text in red (error) color if supported.
 */
export function red(text: string): string {
  return supportsColor() ? `\x1b[31m${text}\x1b[0m` : text;
}

/**
 * Wrap text in dim color if supported.
 */
export function dim(text: string): string {
  return supportsColor() ? `\x1b[2m${text}\x1b[0m` : text;
}
