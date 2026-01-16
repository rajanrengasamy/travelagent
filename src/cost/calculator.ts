/**
 * Cost Calculator
 *
 * Functions for calculating costs from usage data.
 * Applies pricing from config/costs.ts to produce cost breakdowns.
 *
 * @module cost/calculator
 * @see PRD Section 9.3 - Cost and Latency Control
 * @see Task 19.2 - Cost Calculator
 */

import { calculateTokenCost, calculateApiCost } from '../config/costs.js';
import type { CostBreakdown, Providers } from '../schemas/cost.js';
import type { CostTrackerImpl, UsageSummary, StageUsage } from './tracker.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Cost breakdown per stage
 */
export interface StageCostBreakdown {
  /** Stage identifier */
  stageId: string;
  /** Per-provider costs */
  providers: Providers;
  /** Total cost for this stage */
  total: number;
}

/**
 * Full cost breakdown with per-stage detail
 */
export interface DetailedCostBreakdown extends CostBreakdown {
  /** Per-stage cost breakdown */
  stages: StageCostBreakdown[];
}

// ============================================================================
// Cost Calculation Functions
// ============================================================================

/**
 * Calculate costs from a CostTracker instance.
 *
 * @param tracker - CostTracker with recorded usage
 * @returns Complete cost breakdown
 */
export function calculateCosts(tracker: CostTrackerImpl): CostBreakdown {
  return tracker.getCost();
}

/**
 * Calculate detailed costs including per-stage breakdown.
 *
 * @param tracker - CostTracker with recorded usage
 * @returns Detailed cost breakdown with per-stage costs
 */
export function calculateDetailedCosts(tracker: CostTrackerImpl): DetailedCostBreakdown {
  const baseCost = tracker.getCost();
  const stageUsage = tracker.getAllStageUsage();

  const stages = stageUsage.map(stage => calculateStageCost(stage));

  return {
    ...baseCost,
    stages,
  };
}

/**
 * Calculate cost for a single stage's usage.
 *
 * @param stageUsage - Usage record for a stage
 * @returns Cost breakdown for the stage
 */
export function calculateStageCost(stageUsage: StageUsage): StageCostBreakdown {
  const providers: Providers = {};
  let total = 0;

  // Perplexity tokens
  if (stageUsage.tokens.perplexity.input > 0 || stageUsage.tokens.perplexity.output > 0) {
    const cost = calculateTokenCost(
      'perplexity',
      stageUsage.tokens.perplexity.input,
      stageUsage.tokens.perplexity.output
    );
    providers.perplexity = {
      tokens: stageUsage.tokens.perplexity,
      cost,
    };
    total += cost;
  }

  // Gemini tokens
  if (stageUsage.tokens.gemini.input > 0 || stageUsage.tokens.gemini.output > 0) {
    const cost = calculateTokenCost(
      'gemini',
      stageUsage.tokens.gemini.input,
      stageUsage.tokens.gemini.output
    );
    providers.gemini = {
      tokens: stageUsage.tokens.gemini,
      cost,
    };
    total += cost;
  }

  // OpenAI tokens
  if (stageUsage.tokens.openai.input > 0 || stageUsage.tokens.openai.output > 0) {
    const cost = calculateTokenCost(
      'openai',
      stageUsage.tokens.openai.input,
      stageUsage.tokens.openai.output
    );
    providers.openai = {
      tokens: stageUsage.tokens.openai,
      cost,
    };
    total += cost;
  }

  // Places API calls
  if (stageUsage.placesCalls > 0) {
    const cost = calculateApiCost('places', 'textSearch', stageUsage.placesCalls);
    providers.places = {
      calls: stageUsage.placesCalls,
      cost,
    };
    total += cost;
  }

  // YouTube units (quota-based, no direct cost)
  if (stageUsage.youtubeUnits > 0) {
    providers.youtube = {
      units: stageUsage.youtubeUnits,
      cost: 0,
    };
  }

  return {
    stageId: stageUsage.stageId,
    providers,
    total,
  };
}

/**
 * Calculate costs from raw usage summary.
 *
 * @param usage - Usage summary data
 * @param runId - Run identifier
 * @returns Complete cost breakdown
 */
export function calculateCostsFromUsage(usage: UsageSummary, runId: string): CostBreakdown {
  const providers: Providers = {};
  let total = 0;

  // Perplexity
  if (usage.tokens.perplexity.input > 0 || usage.tokens.perplexity.output > 0) {
    const cost = calculateTokenCost(
      'perplexity',
      usage.tokens.perplexity.input,
      usage.tokens.perplexity.output
    );
    providers.perplexity = {
      tokens: usage.tokens.perplexity,
      cost,
    };
    total += cost;
  }

  // Gemini
  if (usage.tokens.gemini.input > 0 || usage.tokens.gemini.output > 0) {
    const cost = calculateTokenCost(
      'gemini',
      usage.tokens.gemini.input,
      usage.tokens.gemini.output
    );
    providers.gemini = {
      tokens: usage.tokens.gemini,
      cost,
    };
    total += cost;
  }

  // OpenAI
  if (usage.tokens.openai.input > 0 || usage.tokens.openai.output > 0) {
    const cost = calculateTokenCost(
      'openai',
      usage.tokens.openai.input,
      usage.tokens.openai.output
    );
    providers.openai = {
      tokens: usage.tokens.openai,
      cost,
    };
    total += cost;
  }

  // Places
  if (usage.placesCalls > 0) {
    const cost = calculateApiCost('places', 'textSearch', usage.placesCalls);
    providers.places = {
      calls: usage.placesCalls,
      cost,
    };
    total += cost;
  }

  // YouTube
  if (usage.youtubeUnits > 0) {
    providers.youtube = {
      units: usage.youtubeUnits,
      cost: 0,
    };
  }

  return {
    schemaVersion: 1,
    runId,
    providers,
    total,
    currency: 'USD',
  };
}

/**
 * Merge multiple cost breakdowns into one.
 * Useful for aggregating costs across multiple runs.
 *
 * @param breakdowns - Array of cost breakdowns to merge
 * @param runId - Run ID for the merged result
 * @returns Merged cost breakdown
 */
export function mergeCostBreakdowns(
  breakdowns: CostBreakdown[],
  runId: string
): CostBreakdown {
  const providers: Providers = {};
  let total = 0;

  // Aggregate token usage for LLM providers
  const perplexityTokens = { input: 0, output: 0 };
  const geminiTokens = { input: 0, output: 0 };
  const openaiTokens = { input: 0, output: 0 };
  let placesCalls = 0;
  let youtubeUnits = 0;

  for (const breakdown of breakdowns) {
    if (breakdown.providers.perplexity) {
      perplexityTokens.input += breakdown.providers.perplexity.tokens.input;
      perplexityTokens.output += breakdown.providers.perplexity.tokens.output;
    }
    if (breakdown.providers.gemini) {
      geminiTokens.input += breakdown.providers.gemini.tokens.input;
      geminiTokens.output += breakdown.providers.gemini.tokens.output;
    }
    if (breakdown.providers.openai) {
      openaiTokens.input += breakdown.providers.openai.tokens.input;
      openaiTokens.output += breakdown.providers.openai.tokens.output;
    }
    if (breakdown.providers.places) {
      placesCalls += breakdown.providers.places.calls;
    }
    if (breakdown.providers.youtube) {
      youtubeUnits += breakdown.providers.youtube.units;
    }
  }

  // Calculate costs for aggregated usage
  if (perplexityTokens.input > 0 || perplexityTokens.output > 0) {
    const cost = calculateTokenCost(
      'perplexity',
      perplexityTokens.input,
      perplexityTokens.output
    );
    providers.perplexity = { tokens: perplexityTokens, cost };
    total += cost;
  }

  if (geminiTokens.input > 0 || geminiTokens.output > 0) {
    const cost = calculateTokenCost(
      'gemini',
      geminiTokens.input,
      geminiTokens.output
    );
    providers.gemini = { tokens: geminiTokens, cost };
    total += cost;
  }

  if (openaiTokens.input > 0 || openaiTokens.output > 0) {
    const cost = calculateTokenCost(
      'openai',
      openaiTokens.input,
      openaiTokens.output
    );
    providers.openai = { tokens: openaiTokens, cost };
    total += cost;
  }

  if (placesCalls > 0) {
    const cost = calculateApiCost('places', 'textSearch', placesCalls);
    providers.places = { calls: placesCalls, cost };
    total += cost;
  }

  if (youtubeUnits > 0) {
    providers.youtube = { units: youtubeUnits, cost: 0 };
  }

  return {
    schemaVersion: 1,
    runId,
    providers,
    total,
    currency: 'USD',
  };
}
