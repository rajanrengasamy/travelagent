/**
 * Cost Schema
 *
 * Zod schemas for tracking API costs and token usage.
 * Used to monitor and report on resource consumption per run.
 *
 * @see PRD Section 12.7 - Cost Schema
 */

import { z } from 'zod';

// ============================================================================
// Provider Cost Schemas
// ============================================================================

/**
 * TokenUsage: Input/output token counts for LLM providers
 */
export const TokenUsageSchema = z.object({
  input: z.number().nonnegative().int(),
  output: z.number().nonnegative().int(),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/**
 * LLMProviderCost: Cost breakdown for LLM-based providers
 * Used for: Perplexity, Gemini, OpenAI
 */
export const LLMProviderCostSchema = z.object({
  tokens: TokenUsageSchema,
  cost: z.number().nonnegative(),
});

export type LLMProviderCost = z.infer<typeof LLMProviderCostSchema>;

/**
 * PlacesProviderCost: Cost breakdown for Google Places API
 */
export const PlacesProviderCostSchema = z.object({
  calls: z.number().nonnegative().int(),
  cost: z.number().nonnegative(),
});

export type PlacesProviderCost = z.infer<typeof PlacesProviderCostSchema>;

/**
 * YouTubeProviderCost: Cost breakdown for YouTube Data API
 */
export const YouTubeProviderCostSchema = z.object({
  units: z.number().nonnegative().int(),
  cost: z.number().nonnegative(),
});

export type YouTubeProviderCost = z.infer<typeof YouTubeProviderCostSchema>;

// ============================================================================
// Providers Aggregate Schema
// ============================================================================

/**
 * Providers: All provider cost breakdowns
 * @see PRD Section 12.7
 */
export const ProvidersSchema = z.object({
  perplexity: LLMProviderCostSchema.optional(),
  gemini: LLMProviderCostSchema.optional(),
  openai: LLMProviderCostSchema.optional(),
  places: PlacesProviderCostSchema.optional(),
  youtube: YouTubeProviderCostSchema.optional(),
});

export type Providers = z.infer<typeof ProvidersSchema>;

// ============================================================================
// Main Cost Breakdown Schema
// ============================================================================

/**
 * CostBreakdown: Complete cost tracking for a discovery run
 * @see PRD Section 12.7 - Cost Schema
 */
export const CostBreakdownSchema = z.object({
  schemaVersion: z.number().int().positive(),
  runId: z.string().min(1),
  providers: ProvidersSchema,
  total: z.number().nonnegative(),
  currency: z.literal('USD'),
});

export type CostBreakdown = z.infer<typeof CostBreakdownSchema>;

// ============================================================================
// Schema Version
// ============================================================================

export const COST_SCHEMA_VERSION = 1;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an empty cost breakdown for a run
 */
export function createEmptyCostBreakdown(runId: string): CostBreakdown {
  return {
    schemaVersion: COST_SCHEMA_VERSION,
    runId,
    providers: {},
    total: 0,
    currency: 'USD',
  };
}

/**
 * Calculate total cost from providers
 */
export function calculateTotalCost(providers: Providers): number {
  let total = 0;

  if (providers.perplexity) total += providers.perplexity.cost;
  if (providers.gemini) total += providers.gemini.cost;
  if (providers.openai) total += providers.openai.cost;
  if (providers.places) total += providers.places.cost;
  if (providers.youtube) total += providers.youtube.cost;

  return total;
}
