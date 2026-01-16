/**
 * Tests for Cost Calculator
 *
 * @module cost/calculator.test
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  calculateCosts,
  calculateDetailedCosts,
  calculateStageCost,
  calculateCostsFromUsage,
  mergeCostBreakdowns,
} from './calculator.js';
import { CostTrackerImpl } from './tracker.js';
import type { CostBreakdown } from '../schemas/cost.js';
import type { UsageSummary, StageUsage } from './tracker.js';

describe('calculateCosts', () => {
  let tracker: CostTrackerImpl;

  beforeEach(() => {
    tracker = new CostTrackerImpl('test-run');
  });

  it('should calculate costs from tracker', () => {
    tracker.addPerplexity(1_000_000, 1_000_000); // $18
    tracker.addGemini(1_000_000, 1_000_000); // $3.5

    const breakdown = calculateCosts(tracker);

    expect(breakdown.total).toBeCloseTo(21.5, 1);
    expect(breakdown.runId).toBe('test-run');
  });

  it('should return empty breakdown for no usage', () => {
    const breakdown = calculateCosts(tracker);

    expect(breakdown.total).toBe(0);
    expect(breakdown.providers).toEqual({});
  });
});

describe('calculateDetailedCosts', () => {
  let tracker: CostTrackerImpl;

  beforeEach(() => {
    tracker = new CostTrackerImpl('test-run');
  });

  it('should include per-stage breakdown', () => {
    tracker.setCurrentStage('03_worker_outputs');
    tracker.addPerplexity(1000, 500);

    tracker.setCurrentStage('07_candidates_validated');
    tracker.addGemini(2000, 800);

    const breakdown = calculateDetailedCosts(tracker);

    expect(breakdown.stages).toHaveLength(2);
    expect(breakdown.stages.map(s => s.stageId)).toContain('03_worker_outputs');
    expect(breakdown.stages.map(s => s.stageId)).toContain('07_candidates_validated');
  });

  it('should calculate stage costs correctly', () => {
    tracker.setCurrentStage('03_worker_outputs');
    tracker.addPerplexity(1_000_000, 1_000_000); // $18

    const breakdown = calculateDetailedCosts(tracker);

    const workerStage = breakdown.stages.find(s => s.stageId === '03_worker_outputs');
    expect(workerStage?.total).toBe(18);
  });

  it('should return empty stages array if no stage tracking', () => {
    tracker.addPerplexity(1000, 500);

    const breakdown = calculateDetailedCosts(tracker);

    expect(breakdown.stages).toHaveLength(0);
  });
});

describe('calculateStageCost', () => {
  it('should calculate cost for stage with all providers', () => {
    const stageUsage: StageUsage = {
      stageId: '03_worker_outputs',
      tokens: {
        perplexity: { input: 1_000_000, output: 1_000_000 }, // $18
        gemini: { input: 1_000_000, output: 1_000_000 }, // $3.5
        openai: { input: 1_000_000, output: 1_000_000 }, // $40
      },
      placesCalls: 100, // $3.2
      youtubeUnits: 500, // $0
    };

    const cost = calculateStageCost(stageUsage);

    expect(cost.stageId).toBe('03_worker_outputs');
    expect(cost.total).toBeCloseTo(64.7, 1);
    expect(cost.providers.perplexity?.cost).toBe(18);
    expect(cost.providers.gemini?.cost).toBe(3.5);
    expect(cost.providers.openai?.cost).toBe(40);
    expect(cost.providers.places?.cost).toBe(3.2);
    expect(cost.providers.youtube?.cost).toBe(0);
  });

  it('should only include providers with usage', () => {
    const stageUsage: StageUsage = {
      stageId: '03_worker_outputs',
      tokens: {
        perplexity: { input: 1000, output: 500 },
        gemini: { input: 0, output: 0 },
        openai: { input: 0, output: 0 },
      },
      placesCalls: 0,
      youtubeUnits: 0,
    };

    const cost = calculateStageCost(stageUsage);

    expect(cost.providers.perplexity).toBeDefined();
    expect(cost.providers.gemini).toBeUndefined();
    expect(cost.providers.openai).toBeUndefined();
    expect(cost.providers.places).toBeUndefined();
    expect(cost.providers.youtube).toBeUndefined();
  });

  it('should handle zero usage stage', () => {
    const stageUsage: StageUsage = {
      stageId: 'empty_stage',
      tokens: {
        perplexity: { input: 0, output: 0 },
        gemini: { input: 0, output: 0 },
        openai: { input: 0, output: 0 },
      },
      placesCalls: 0,
      youtubeUnits: 0,
    };

    const cost = calculateStageCost(stageUsage);

    expect(cost.total).toBe(0);
    expect(cost.providers).toEqual({});
  });
});

describe('calculateCostsFromUsage', () => {
  it('should calculate costs from usage summary', () => {
    const usage: UsageSummary = {
      tokens: {
        perplexity: { input: 1_000_000, output: 1_000_000 },
        gemini: { input: 1_000_000, output: 1_000_000 },
        openai: { input: 0, output: 0 },
      },
      placesCalls: 50,
      youtubeUnits: 200,
      stages: [],
    };

    const breakdown = calculateCostsFromUsage(usage, 'my-run-id');

    expect(breakdown.runId).toBe('my-run-id');
    expect(breakdown.schemaVersion).toBe(1);
    expect(breakdown.currency).toBe('USD');
    expect(breakdown.providers.perplexity?.cost).toBe(18);
    expect(breakdown.providers.gemini?.cost).toBe(3.5);
    expect(breakdown.providers.openai).toBeUndefined();
    expect(breakdown.providers.places?.cost).toBe(1.6); // 50 * $0.032
    expect(breakdown.providers.youtube?.units).toBe(200);
  });

  it('should handle empty usage', () => {
    const usage: UsageSummary = {
      tokens: {
        perplexity: { input: 0, output: 0 },
        gemini: { input: 0, output: 0 },
        openai: { input: 0, output: 0 },
      },
      placesCalls: 0,
      youtubeUnits: 0,
      stages: [],
    };

    const breakdown = calculateCostsFromUsage(usage, 'empty-run');

    expect(breakdown.total).toBe(0);
    expect(breakdown.providers).toEqual({});
  });
});

describe('mergeCostBreakdowns', () => {
  it('should merge multiple breakdowns', () => {
    const breakdown1: CostBreakdown = {
      schemaVersion: 1,
      runId: 'run-1',
      providers: {
        perplexity: { tokens: { input: 1000, output: 500 }, cost: 0.0105 },
      },
      total: 0.0105,
      currency: 'USD',
    };

    const breakdown2: CostBreakdown = {
      schemaVersion: 1,
      runId: 'run-2',
      providers: {
        perplexity: { tokens: { input: 2000, output: 1000 }, cost: 0.021 },
        gemini: { tokens: { input: 1000, output: 500 }, cost: 0.002 },
      },
      total: 0.023,
      currency: 'USD',
    };

    const merged = mergeCostBreakdowns([breakdown1, breakdown2], 'merged-run');

    expect(merged.runId).toBe('merged-run');
    expect(merged.providers.perplexity?.tokens.input).toBe(3000);
    expect(merged.providers.perplexity?.tokens.output).toBe(1500);
    expect(merged.providers.gemini?.tokens.input).toBe(1000);
    expect(merged.providers.gemini?.tokens.output).toBe(500);
  });

  it('should recalculate costs from merged usage', () => {
    const breakdown1: CostBreakdown = {
      schemaVersion: 1,
      runId: 'run-1',
      providers: {
        perplexity: { tokens: { input: 500_000, output: 500_000 }, cost: 9 },
      },
      total: 9,
      currency: 'USD',
    };

    const breakdown2: CostBreakdown = {
      schemaVersion: 1,
      runId: 'run-2',
      providers: {
        perplexity: { tokens: { input: 500_000, output: 500_000 }, cost: 9 },
      },
      total: 9,
      currency: 'USD',
    };

    const merged = mergeCostBreakdowns([breakdown1, breakdown2], 'merged-run');

    // 1M input + 1M output = $18
    expect(merged.providers.perplexity?.cost).toBe(18);
    expect(merged.total).toBe(18);
  });

  it('should handle empty array', () => {
    const merged = mergeCostBreakdowns([], 'empty-merge');

    expect(merged.runId).toBe('empty-merge');
    expect(merged.total).toBe(0);
    expect(merged.providers).toEqual({});
  });

  it('should merge Places API calls', () => {
    const breakdown1: CostBreakdown = {
      schemaVersion: 1,
      runId: 'run-1',
      providers: {
        places: { calls: 10, cost: 0.32 },
      },
      total: 0.32,
      currency: 'USD',
    };

    const breakdown2: CostBreakdown = {
      schemaVersion: 1,
      runId: 'run-2',
      providers: {
        places: { calls: 20, cost: 0.64 },
      },
      total: 0.64,
      currency: 'USD',
    };

    const merged = mergeCostBreakdowns([breakdown1, breakdown2], 'merged-run');

    expect(merged.providers.places?.calls).toBe(30);
    expect(merged.providers.places?.cost).toBeCloseTo(0.96, 2); // 30 * $0.032
  });

  it('should merge YouTube quota units', () => {
    const breakdown1: CostBreakdown = {
      schemaVersion: 1,
      runId: 'run-1',
      providers: {
        youtube: { units: 100, cost: 0 },
      },
      total: 0,
      currency: 'USD',
    };

    const breakdown2: CostBreakdown = {
      schemaVersion: 1,
      runId: 'run-2',
      providers: {
        youtube: { units: 200, cost: 0 },
      },
      total: 0,
      currency: 'USD',
    };

    const merged = mergeCostBreakdowns([breakdown1, breakdown2], 'merged-run');

    expect(merged.providers.youtube?.units).toBe(300);
    expect(merged.providers.youtube?.cost).toBe(0);
  });
});
