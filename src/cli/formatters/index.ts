/**
 * CLI Formatters
 *
 * Re-exports all CLI formatting utilities.
 *
 * @module cli/formatters
 */

// Progress display utilities
export {
  ProgressSpinner,
  StageProgressDisplay,
  createSpinner,
  createStageProgress,
  createProgressBar,
  formatDuration,
  type StageStatus,
  type StageDisplay,
  type SpinnerOptions,
  type ProgressBar,
} from './progress.js';

// Run summary formatters
export {
  formatRunSummary,
  formatDegradedRunSummary,
  formatResumeRunSummary,
  formatErrorSummary,
  formatTimingBreakdown,
  formatRunStatusLine,
  formatQuickSummary,
  type RunSummary,
  type DegradedStageInfo,
  type ResumeInfo,
} from './run-summary.js';
