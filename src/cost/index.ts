/**
 * Cost Tracking Module
 *
 * Tracks API usage and calculates costs for pipeline runs.
 *
 * Components:
 * - CostTrackerImpl: Main tracker class for recording usage
 * - Calculator: Functions for cost calculation
 * - Display: CLI formatting for cost output
 *
 * @module cost
 * @see PRD Section 9.3 - Cost and Latency Control
 * @see Task 19.0 - Cost Tracking System
 */

// ============================================================================
// Tracker Exports
// ============================================================================

export {
  CostTrackerImpl,
  createCostTracker,
  type TokenUsage,
  type StageUsage,
  type UsageSummary,
  type CostResult,
} from './tracker.js';

// ============================================================================
// Calculator Exports
// ============================================================================

export {
  calculateCosts,
  calculateDetailedCosts,
  calculateStageCost,
  calculateCostsFromUsage,
  mergeCostBreakdowns,
  type StageCostBreakdown,
  type DetailedCostBreakdown,
} from './calculator.js';

// ============================================================================
// Display Exports
// ============================================================================

export {
  formatCostBreakdown,
  formatDetailedCostBreakdown,
  formatStageCost,
  formatUsageSummary,
  formatStageUsage,
  formatCostSummaryLine,
  supportsColor,
  green,
  yellow,
  red,
  dim,
} from './display.js';

// ============================================================================
// Re-exports from related modules
// ============================================================================

// Re-export types from schemas for convenience
export type {
  CostBreakdown,
  Providers,
  LLMProviderCost,
  PlacesProviderCost,
  YouTubeProviderCost,
} from '../schemas/cost.js';

// Re-export pricing config for convenience
export {
  TOKEN_COSTS,
  API_COSTS,
  calculateTokenCost,
  calculateApiCost,
  formatCost,
} from '../config/costs.js';
