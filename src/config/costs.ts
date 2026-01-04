/**
 * Cost Configuration
 *
 * Token costs and API pricing for cost tracking.
 * All costs are in USD.
 *
 * @module config/costs
 * @see PRD Section 9.3 - Cost and Latency Control
 */

import { z } from 'zod';

/**
 * Token costs per provider (USD per million tokens)
 */
export const TOKEN_COSTS = {
  perplexity: {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
  },
  gemini: {
    inputPerMillion: 0.5,
    outputPerMillion: 3.0,
  },
  openai: {
    inputPerMillion: 10.0,
    outputPerMillion: 30.0,
  },
} as const;

/**
 * API call costs (USD per call)
 */
export const API_COSTS = {
  places: {
    textSearch: 0.032, // $32 per 1000 calls
    placeDetails: 0.017, // $17 per 1000 calls
    autocomplete: 0.00283, // $2.83 per 1000 calls
  },
  youtube: {
    // YouTube is quota-based, not cost-based
    // 10,000 units per day free, search = 100 units, video details = 1 unit
    searchPerUnit: 0,
    detailsPerUnit: 0,
  },
} as const;

export type TokenProvider = keyof typeof TOKEN_COSTS;
export type ApiProvider = keyof typeof API_COSTS;

/**
 * Calculate cost for token usage
 */
export function calculateTokenCost(
  provider: TokenProvider,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = TOKEN_COSTS[provider];
  const inputCost = (inputTokens / 1_000_000) * costs.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * costs.outputPerMillion;
  return inputCost + outputCost;
}

/**
 * Calculate cost for API calls
 */
export function calculateApiCost<T extends ApiProvider>(
  provider: T,
  callType: keyof (typeof API_COSTS)[T],
  callCount: number
): number {
  const costs = API_COSTS[provider];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const costPerCall = costs[callType as keyof typeof costs] as number;
  return costPerCall * callCount;
}

/**
 * Token usage tracking
 */
export interface TokenUsage {
  provider: TokenProvider;
  inputTokens: number;
  outputTokens: number;
  task?: string;
}

/**
 * API usage tracking
 */
export interface ApiUsage {
  provider: ApiProvider;
  callType: string;
  callCount: number;
}

/**
 * Cost breakdown by provider
 */
export interface CostBreakdown {
  perplexity: number;
  gemini: number;
  openai: number;
  places: number;
  youtube: number;
  total: number;
}

/**
 * Schema for cost breakdown validation
 */
export const costBreakdownSchema = z.object({
  perplexity: z.number().nonnegative(),
  gemini: z.number().nonnegative(),
  openai: z.number().nonnegative(),
  places: z.number().nonnegative(),
  youtube: z.number().nonnegative(),
  total: z.number().nonnegative(),
});

/**
 * Create an empty cost breakdown
 */
export function createEmptyCostBreakdown(): CostBreakdown {
  return {
    perplexity: 0,
    gemini: 0,
    openai: 0,
    places: 0,
    youtube: 0,
    total: 0,
  };
}

/**
 * Format cost for display (e.g., "$0.0450")
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}
