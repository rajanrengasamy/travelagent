/**
 * Aggregator Types
 *
 * Type definitions and Zod schemas for the Aggregator module.
 * The aggregator takes ranked/validated candidates and generates
 * a narrative summary for presentation.
 *
 * @module aggregator/types
 * @see PRD Section 14.5 - Aggregator
 * @see TODO Section 17.0 - Aggregator Stage (Stage 09)
 */

import { z } from 'zod';
import type { Candidate } from '../schemas/candidate.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Aggregator request timeout in milliseconds.
 * @see TODO Section 17.3.3 - Implement 20-second timeout
 */
export const AGGREGATOR_TIMEOUT_MS = 20_000;

/**
 * Maximum retries for aggregator API calls.
 */
export const MAX_RETRIES = 2;

/**
 * Base delay for exponential backoff in milliseconds.
 */
export const BASE_DELAY_MS = 1_000;

// ============================================================================
// Narrative Types
// ============================================================================

/**
 * A section within the narrative output.
 */
export const NarrativeSectionSchema = z.object({
  /** Section heading (e.g., "Top Picks", "Hidden Gems") */
  heading: z.string().min(1),

  /** Narrative text for this section */
  content: z.string().min(1),

  /** Candidate IDs referenced in this section */
  candidateIds: z.array(z.string()),
});

export type NarrativeSection = z.infer<typeof NarrativeSectionSchema>;

/**
 * A highlight extracted from the candidates.
 */
export const HighlightSchema = z.object({
  /** Short highlight title */
  title: z.string().min(1),

  /** Brief description */
  description: z.string(),

  /** Related candidate ID */
  candidateId: z.string().optional(),

  /** Type of highlight */
  type: z.enum(['must_see', 'local_favorite', 'unique_experience', 'budget_friendly', 'luxury']),
});

export type Highlight = z.infer<typeof HighlightSchema>;

/**
 * A recommendation with reasoning.
 */
export const RecommendationSchema = z.object({
  /** Recommendation text */
  text: z.string().min(1),

  /** Why this is recommended */
  reasoning: z.string(),

  /** Related candidate IDs */
  candidateIds: z.array(z.string()),

  /** Priority level */
  priority: z.enum(['high', 'medium', 'low']),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

/**
 * Complete narrative output from the aggregator.
 *
 * @see TODO Section 17.2.2 - Structure output with sections, highlights, and recommendations
 */
export const NarrativeOutputSchema = z.object({
  /** Overall summary/introduction */
  introduction: z.string().min(1),

  /** Organized sections of the narrative */
  sections: z.array(NarrativeSectionSchema),

  /** Key highlights to feature */
  highlights: z.array(HighlightSchema),

  /** Personalized recommendations */
  recommendations: z.array(RecommendationSchema),

  /** Closing thoughts */
  conclusion: z.string().optional(),
});

export type NarrativeOutput = z.infer<typeof NarrativeOutputSchema>;

// ============================================================================
// Aggregator Output Types
// ============================================================================

/**
 * Statistics about the aggregation process.
 */
export const AggregatorStatsSchema = z.object({
  /** Number of input candidates */
  inputCount: z.number().int().nonnegative(),

  /** Number of candidates included in narrative */
  includedCount: z.number().int().nonnegative(),

  /** Number of sections generated */
  sectionCount: z.number().int().nonnegative(),

  /** Number of highlights extracted */
  highlightCount: z.number().int().nonnegative(),

  /** Number of recommendations made */
  recommendationCount: z.number().int().nonnegative(),

  /** Whether narrative was generated or degraded mode was used */
  narrativeGenerated: z.boolean(),

  /** Token usage for the aggregator call */
  tokenUsage: z
    .object({
      input: z.number().int().nonnegative(),
      output: z.number().int().nonnegative(),
    })
    .optional(),

  /** Duration of aggregator call in milliseconds */
  durationMs: z.number().int().nonnegative(),
});

export type AggregatorStats = z.infer<typeof AggregatorStatsSchema>;

/**
 * Complete output from the aggregator stage.
 *
 * This includes the original candidates, the generated narrative,
 * and statistics about the aggregation process.
 */
export const AggregatorOutputSchema = z.object({
  /** The candidates that were aggregated (preserved for downstream) */
  candidates: z.array(z.custom<Candidate>()),

  /** Generated narrative (null if degraded mode) */
  narrative: NarrativeOutputSchema.nullable(),

  /** Aggregation statistics */
  stats: AggregatorStatsSchema,
});

export type AggregatorOutput = z.infer<typeof AggregatorOutputSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create empty aggregator stats with default values.
 */
export function createEmptyAggregatorStats(): AggregatorStats {
  return {
    inputCount: 0,
    includedCount: 0,
    sectionCount: 0,
    highlightCount: 0,
    recommendationCount: 0,
    narrativeGenerated: false,
    durationMs: 0,
  };
}

/**
 * Create degraded aggregator output when narrative generation fails.
 * Returns candidates without a narrative.
 *
 * @see TODO Section 17.3.4 - Implement degraded mode
 *
 * @param candidates - The input candidates
 * @param durationMs - How long the attempt took
 * @returns Degraded output with null narrative
 */
export function createDegradedOutput(
  candidates: Candidate[],
  durationMs: number
): AggregatorOutput {
  return {
    candidates,
    narrative: null,
    stats: {
      inputCount: candidates.length,
      includedCount: candidates.length,
      sectionCount: 0,
      highlightCount: 0,
      recommendationCount: 0,
      narrativeGenerated: false,
      durationMs,
    },
  };
}
