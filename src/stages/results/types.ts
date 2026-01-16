/**
 * Results Stage Types
 *
 * Type definitions for the results stage (Stage 10).
 * This stage produces the final discovery results output including
 * JSON and Markdown exports.
 *
 * @module stages/results/types
 * @see PRD Section 12.6 - Discovery Results Schema
 * @see TODO Section 18.0 - Results Stage (Stage 10)
 */

import { z } from 'zod';
import {
  DiscoveryResultsSchema,
  DegradationLevelSchema,
  type DiscoveryResults,
  type DegradationLevel,
} from '../../schemas/discovery-results.js';

// ============================================================================
// Export Configuration Schema
// ============================================================================

/**
 * ResultsExportConfig: Optional configuration for export behavior.
 *
 * Controls how results are formatted and exported to files.
 */
export const ResultsExportConfigSchema = z.object({
  /**
   * Include raw scoring details in JSON output.
   * When true, includes dimension scores and other scoring internals.
   * @default false
   */
  includeRawScores: z.boolean().optional().default(false),

  /**
   * Custom Markdown template for results output.
   * When provided, uses this template instead of the default format.
   */
  markdownTemplate: z.string().optional(),

  /**
   * Output compact JSON without formatting.
   * When false (default), JSON is pretty-printed for readability.
   * @default false
   */
  compactJson: z.boolean().optional().default(false),
});

export type ResultsExportConfig = z.infer<typeof ResultsExportConfigSchema>;

// ============================================================================
// Export Paths Schema
// ============================================================================

/**
 * ResultsExportPaths: Paths to exported result files.
 */
export const ResultsExportPathsSchema = z.object({
  /** Path to the exported JSON results file */
  resultsJson: z.string().min(1),

  /** Path to the exported Markdown results file */
  resultsMd: z.string().min(1),
});

export type ResultsExportPaths = z.infer<typeof ResultsExportPathsSchema>;

// ============================================================================
// Stage Statistics Schema
// ============================================================================

/**
 * ResultsStageStats: Statistics about the results stage execution.
 *
 * Captures key metrics about the final output including timing,
 * candidate counts, and degradation status.
 */
export const ResultsStageStatsSchema = z.object({
  /** Total number of candidates in final results */
  totalCandidates: z.number().int().nonnegative(),

  /** ISO8601 timestamp when results were exported */
  exportedAt: z.string().datetime(),

  /** Duration of the results stage in milliseconds */
  durationMs: z.number().int().nonnegative(),

  /** Whether a narrative summary was included in results */
  narrativeIncluded: z.boolean(),

  /** Degradation level of the discovery run */
  degradationLevel: DegradationLevelSchema,
});

export type ResultsStageStats = z.infer<typeof ResultsStageStatsSchema>;

// ============================================================================
// Stage Output Schema
// ============================================================================

/**
 * ResultsStageOutput: Output structure for the results stage checkpoint.
 * Written to 10_results.json.
 *
 * This is the final stage output containing the complete discovery results,
 * export file paths, and stage statistics.
 *
 * @see TODO Section 18.1.5 - Write checkpoint to 10_results.json
 */
export const ResultsStageOutputSchema = z.object({
  /** Complete discovery results for this run */
  discoveryResults: DiscoveryResultsSchema,

  /** Paths to exported result files */
  exportPaths: ResultsExportPathsSchema,

  /** Statistics about the results stage */
  stats: ResultsStageStatsSchema,
});

export type ResultsStageOutput = z.infer<typeof ResultsStageOutputSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create initial empty results stage stats.
 *
 * @param degradationLevel - The degradation level for the run
 * @returns Empty stats object with defaults
 */
export function createEmptyResultsStats(
  degradationLevel: DegradationLevel = 'none'
): ResultsStageStats {
  return {
    totalCandidates: 0,
    exportedAt: new Date().toISOString(),
    durationMs: 0,
    narrativeIncluded: false,
    degradationLevel,
  };
}

/**
 * Create default export configuration.
 *
 * @returns Default export config with pretty-printed JSON
 */
export function createDefaultExportConfig(): ResultsExportConfig {
  return {
    includeRawScores: false,
    compactJson: false,
  };
}

/**
 * Validate and parse results stage output.
 *
 * @param data - Raw data to validate
 * @returns Validated ResultsStageOutput
 * @throws ZodError if validation fails
 */
export function parseResultsStageOutput(data: unknown): ResultsStageOutput {
  return ResultsStageOutputSchema.parse(data);
}

/**
 * Validate and parse export configuration.
 *
 * @param data - Raw config data to validate
 * @returns Validated ResultsExportConfig with defaults applied
 */
export function parseExportConfig(data: unknown): ResultsExportConfig {
  return ResultsExportConfigSchema.parse(data);
}

// ============================================================================
// Re-exports for Convenience
// ============================================================================

export { type DiscoveryResults, type DegradationLevel };
