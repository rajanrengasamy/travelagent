/**
 * Aggregate Stage Types
 *
 * Re-exports the aggregator types for use in the stage module.
 *
 * @module stages/aggregate/types
 * @see TODO Section 17.4 - Stage implementation
 */

// Re-export all types from the aggregator module
export {
  type AggregatorOutput,
  type AggregatorStats,
  type NarrativeOutput,
  type NarrativeSection,
  type Highlight,
  type Recommendation,
  AggregatorOutputSchema,
  AggregatorStatsSchema,
  NarrativeOutputSchema,
  createEmptyAggregatorStats,
  createDegradedOutput,
} from '../../aggregator/types.js';
