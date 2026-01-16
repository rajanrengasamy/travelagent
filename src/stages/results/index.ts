/**
 * Results Stage Exports
 *
 * Central exports for the results stage (Stage 10) module.
 *
 * @module stages/results
 * @see PRD Section 18.0 - Results Stage (Stage 10)
 */

// Types
export {
  ResultsExportConfigSchema,
  ResultsExportPathsSchema,
  ResultsStageStatsSchema,
  ResultsStageOutputSchema,
  createEmptyResultsStats,
  createDefaultExportConfig,
  parseResultsStageOutput,
  parseExportConfig,
  type ResultsExportConfig,
  type ResultsExportPaths,
  type ResultsStageStats,
  type ResultsStageOutput,
  type DiscoveryResults,
  type DegradationLevel,
} from './types.js';

// Export utilities
export { exportResultsJson, exportResultsMd, generateMarkdownReport } from './export.js';
