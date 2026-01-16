/**
 * Cost Tracker
 *
 * Implements the CostTracker interface for tracking API usage and costs
 * across all providers during pipeline execution.
 *
 * The tracker maintains separate counters for:
 * - LLM providers (Perplexity, Gemini, OpenAI): input/output tokens
 * - Places API: number of API calls
 * - YouTube API: quota units consumed
 *
 * Usage can be tracked per stage for detailed breakdown analysis.
 *
 * @module cost/tracker
 * @see PRD Section 9.3 - Cost and Latency Control
 * @see Task 19.1 - Cost Tracking System
 */

import { calculateTokenCost, calculateApiCost } from '../config/costs.js';
import type { Providers } from '../schemas/cost.js';
import type { CostTracker as WorkerCostTracker } from '../workers/types.js';
import type { CostTracker as PipelineCostTracker } from '../pipeline/types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Token usage for LLM providers
 */
export interface TokenUsage {
  input: number;
  output: number;
}

/**
 * Usage record for a single stage
 */
export interface StageUsage {
  /** Stage identifier (e.g., "03_worker_outputs") */
  stageId: string;
  /** Per-provider token usage */
  tokens: {
    perplexity: TokenUsage;
    gemini: TokenUsage;
    openai: TokenUsage;
  };
  /** Number of Places API calls */
  placesCalls: number;
  /** YouTube quota units consumed */
  youtubeUnits: number;
}

/**
 * Full usage summary across all providers
 */
export interface UsageSummary {
  /** Token usage per LLM provider */
  tokens: {
    perplexity: TokenUsage;
    gemini: TokenUsage;
    openai: TokenUsage;
  };
  /** Number of Places API calls */
  placesCalls: number;
  /** YouTube quota units consumed */
  youtubeUnits: number;
  /** Per-stage breakdown (if tracking enabled) */
  stages: StageUsage[];
}

/**
 * Result from getCost() with full cost breakdown
 */
export interface CostResult {
  /** Schema version */
  schemaVersion: number;
  /** Run identifier */
  runId: string;
  /** Per-provider costs */
  providers: Providers;
  /** Total cost in USD */
  total: number;
  /** Currency (always USD) */
  currency: 'USD';
}

// ============================================================================
// CostTracker Class
// ============================================================================

/**
 * CostTracker tracks API usage and calculates costs for a pipeline run.
 *
 * Implements both the worker-specific interface (addPerplexity, addGemini, etc.)
 * and the generic pipeline interface (addTokenUsage, addApiCalls).
 *
 * @example
 * ```typescript
 * const tracker = new CostTrackerImpl('20240115-120000');
 *
 * // Worker-specific methods
 * tracker.addPerplexity(1000, 500);
 * tracker.addPlacesCall();
 *
 * // Generic methods
 * tracker.addTokenUsage('openai', 2000, 1000);
 * tracker.addApiCalls('places', 5);
 *
 * // Get cost breakdown
 * const costs = tracker.getCost();
 * console.log(`Total: $${costs.total.toFixed(4)}`);
 * ```
 */
export class CostTrackerImpl implements WorkerCostTracker, PipelineCostTracker {
  /** Run identifier */
  private readonly runId: string;

  /** Token usage tracking */
  private tokens = {
    perplexity: { input: 0, output: 0 },
    gemini: { input: 0, output: 0 },
    openai: { input: 0, output: 0 },
  };

  /** Places API call count */
  private placesCalls = 0;

  /** YouTube quota units */
  private youtubeUnits = 0;

  /** Per-stage usage tracking (optional) */
  private stages: Map<string, StageUsage> = new Map();

  /** Current stage being tracked */
  private currentStage: string | null = null;

  /**
   * Create a new cost tracker for a run.
   *
   * @param runId - Run identifier for cost attribution
   */
  constructor(runId: string) {
    this.runId = runId;
  }

  // ==========================================================================
  // Worker-specific methods (WorkerCostTracker interface)
  // ==========================================================================

  /**
   * Record token usage for Perplexity API calls.
   *
   * @param input - Number of input tokens
   * @param output - Number of output tokens
   */
  addPerplexity(input: number, output: number): void {
    this.tokens.perplexity.input += input;
    this.tokens.perplexity.output += output;
    this.recordStageTokens('perplexity', input, output);
  }

  /**
   * Record token usage for Gemini API calls.
   *
   * @param input - Number of input tokens
   * @param output - Number of output tokens
   */
  addGemini(input: number, output: number): void {
    this.tokens.gemini.input += input;
    this.tokens.gemini.output += output;
    this.recordStageTokens('gemini', input, output);
  }

  /**
   * Record token usage for OpenAI API calls.
   *
   * @param input - Number of input tokens
   * @param output - Number of output tokens
   */
  addOpenAI(input: number, output: number): void {
    this.tokens.openai.input += input;
    this.tokens.openai.output += output;
    this.recordStageTokens('openai', input, output);
  }

  /**
   * Record a Google Places API call.
   * Each call has a fixed cost regardless of results.
   */
  addPlacesCall(): void {
    this.placesCalls += 1;
    this.recordStagePlacesCalls(1);
  }

  /**
   * Record YouTube Data API quota units consumed.
   *
   * @param units - Number of quota units used
   */
  addYouTubeUnits(units: number): void {
    this.youtubeUnits += units;
    this.recordStageYouTubeUnits(units);
  }

  // ==========================================================================
  // Generic methods (PipelineCostTracker interface)
  // ==========================================================================

  /**
   * Record token usage for a provider.
   *
   * @param provider - Provider identifier ('perplexity', 'gemini', 'openai')
   * @param input - Number of input tokens
   * @param output - Number of output tokens
   */
  addTokenUsage(provider: string, input: number, output: number): void {
    const normalizedProvider = provider.toLowerCase();

    switch (normalizedProvider) {
      case 'perplexity':
        this.addPerplexity(input, output);
        break;
      case 'gemini':
        this.addGemini(input, output);
        break;
      case 'openai':
        this.addOpenAI(input, output);
        break;
      default:
        // Unknown provider - ignore but could log warning
        break;
    }
  }

  /**
   * Record API call count for a provider.
   *
   * @param provider - Provider identifier ('places')
   * @param calls - Number of API calls made
   */
  addApiCalls(provider: string, calls: number): void {
    const normalizedProvider = provider.toLowerCase();

    if (normalizedProvider === 'places') {
      this.placesCalls += calls;
      this.recordStagePlacesCalls(calls);
    }
  }

  /**
   * Record quota units for a provider.
   *
   * @param provider - Provider identifier ('youtube')
   * @param units - Number of quota units consumed
   */
  addQuotaUnits(provider: string, units: number): void {
    const normalizedProvider = provider.toLowerCase();

    if (normalizedProvider === 'youtube') {
      this.addYouTubeUnits(units);
    }
  }

  // ==========================================================================
  // Stage tracking methods
  // ==========================================================================

  /**
   * Set the current stage for usage attribution.
   * All subsequent usage will be attributed to this stage.
   *
   * @param stageId - Stage identifier (e.g., "03_worker_outputs")
   */
  setCurrentStage(stageId: string): void {
    this.currentStage = stageId;

    // Initialize stage record if not exists
    if (!this.stages.has(stageId)) {
      this.stages.set(stageId, {
        stageId,
        tokens: {
          perplexity: { input: 0, output: 0 },
          gemini: { input: 0, output: 0 },
          openai: { input: 0, output: 0 },
        },
        placesCalls: 0,
        youtubeUnits: 0,
      });
    }
  }

  /**
   * Clear the current stage (usage will not be attributed to any stage).
   */
  clearCurrentStage(): void {
    this.currentStage = null;
  }

  /**
   * Get usage for a specific stage.
   *
   * @param stageId - Stage identifier
   * @returns Stage usage record or undefined if not tracked
   */
  getStageUsage(stageId: string): StageUsage | undefined {
    return this.stages.get(stageId);
  }

  /**
   * Get usage for all tracked stages.
   *
   * @returns Array of stage usage records
   */
  getAllStageUsage(): StageUsage[] {
    return Array.from(this.stages.values());
  }

  // ==========================================================================
  // Cost calculation methods
  // ==========================================================================

  /**
   * Get the current cost breakdown for all providers.
   *
   * @returns Complete cost breakdown with per-provider and total costs
   */
  getCost(): CostResult {
    // Calculate costs using config pricing
    const perplexityCost = calculateTokenCost(
      'perplexity',
      this.tokens.perplexity.input,
      this.tokens.perplexity.output
    );

    const geminiCost = calculateTokenCost(
      'gemini',
      this.tokens.gemini.input,
      this.tokens.gemini.output
    );

    const openaiCost = calculateTokenCost(
      'openai',
      this.tokens.openai.input,
      this.tokens.openai.output
    );

    // Places API uses text search pricing as default
    const placesCost = calculateApiCost('places', 'textSearch', this.placesCalls);

    // YouTube is quota-based (free within daily limit)
    const youtubeCost = 0;

    // Build providers object
    const providers: Providers = {};

    if (this.tokens.perplexity.input > 0 || this.tokens.perplexity.output > 0) {
      providers.perplexity = {
        tokens: this.tokens.perplexity,
        cost: perplexityCost,
      };
    }

    if (this.tokens.gemini.input > 0 || this.tokens.gemini.output > 0) {
      providers.gemini = {
        tokens: this.tokens.gemini,
        cost: geminiCost,
      };
    }

    if (this.tokens.openai.input > 0 || this.tokens.openai.output > 0) {
      providers.openai = {
        tokens: this.tokens.openai,
        cost: openaiCost,
      };
    }

    if (this.placesCalls > 0) {
      providers.places = {
        calls: this.placesCalls,
        cost: placesCost,
      };
    }

    if (this.youtubeUnits > 0) {
      providers.youtube = {
        units: this.youtubeUnits,
        cost: youtubeCost,
      };
    }

    const total = perplexityCost + geminiCost + openaiCost + placesCost + youtubeCost;

    return {
      schemaVersion: 1,
      runId: this.runId,
      providers,
      total,
      currency: 'USD',
    };
  }

  /**
   * Get the current total usage and estimated cost.
   * Implements the PipelineCostTracker interface.
   *
   * @returns Token counts and estimated cost in USD
   */
  getTotal(): { tokens: { input: number; output: number }; estimatedCost: number } {
    const totalInput =
      this.tokens.perplexity.input +
      this.tokens.gemini.input +
      this.tokens.openai.input;

    const totalOutput =
      this.tokens.perplexity.output +
      this.tokens.gemini.output +
      this.tokens.openai.output;

    const costResult = this.getCost();

    return {
      tokens: { input: totalInput, output: totalOutput },
      estimatedCost: costResult.total,
    };
  }

  /**
   * Get the full usage summary including per-stage breakdown.
   *
   * @returns Complete usage summary
   */
  getUsageSummary(): UsageSummary {
    return {
      tokens: { ...this.tokens },
      placesCalls: this.placesCalls,
      youtubeUnits: this.youtubeUnits,
      stages: this.getAllStageUsage(),
    };
  }

  /**
   * Reset all tracked costs to zero.
   * Called when starting a new run.
   */
  reset(): void {
    this.tokens = {
      perplexity: { input: 0, output: 0 },
      gemini: { input: 0, output: 0 },
      openai: { input: 0, output: 0 },
    };
    this.placesCalls = 0;
    this.youtubeUnits = 0;
    this.stages.clear();
    this.currentStage = null;
  }

  // ==========================================================================
  // Private helpers for stage tracking
  // ==========================================================================

  /**
   * Record token usage for the current stage.
   */
  private recordStageTokens(
    provider: 'perplexity' | 'gemini' | 'openai',
    input: number,
    output: number
  ): void {
    if (this.currentStage) {
      const stage = this.stages.get(this.currentStage);
      if (stage) {
        stage.tokens[provider].input += input;
        stage.tokens[provider].output += output;
      }
    }
  }

  /**
   * Record Places API calls for the current stage.
   */
  private recordStagePlacesCalls(calls: number): void {
    if (this.currentStage) {
      const stage = this.stages.get(this.currentStage);
      if (stage) {
        stage.placesCalls += calls;
      }
    }
  }

  /**
   * Record YouTube quota units for the current stage.
   */
  private recordStageYouTubeUnits(units: number): void {
    if (this.currentStage) {
      const stage = this.stages.get(this.currentStage);
      if (stage) {
        stage.youtubeUnits += units;
      }
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new cost tracker for a run.
 *
 * @param runId - Run identifier for cost attribution
 * @returns New CostTracker instance
 */
export function createCostTracker(runId: string): CostTrackerImpl {
  return new CostTrackerImpl(runId);
}
