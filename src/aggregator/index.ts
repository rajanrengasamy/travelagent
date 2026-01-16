/**
 * Aggregator Module
 *
 * Exports for the aggregator functionality.
 *
 * @module aggregator
 * @see PRD Section 14.5 - Aggregator
 * @see TODO Section 17.5 - Create exports
 */

// Main aggregator function
export { runAggregator, type AggregatorContext } from './aggregator.js';

// Narrative generation
export { generateNarrative, type SessionContext, type NarrativeResult } from './narrative.js';

// Client
export {
  chatCompletion,
  resetOpenAIClient,
  isOpenAIApiError,
  isRetryableError,
  OpenAIApiError,
  type ChatMessage,
  type ChatOptions,
  type ChatResponse,
} from './client.js';

// Prompts
export {
  AGGREGATOR_SYSTEM_PROMPT,
  buildAggregatorPrompt,
  AGGREGATOR_PROMPT,
} from './prompts.js';

// Types
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
  NarrativeSectionSchema,
  HighlightSchema,
  RecommendationSchema,
  createEmptyAggregatorStats,
  createDegradedOutput,
  AGGREGATOR_TIMEOUT_MS,
  MAX_RETRIES,
  BASE_DELAY_MS,
} from './types.js';
