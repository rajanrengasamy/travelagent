/**
 * Tests for Cost Display
 *
 * @module cost/display.test
 */

import { describe, it, expect } from '@jest/globals';
import {
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
import type { CostBreakdown } from '../schemas/cost.js';
import type { DetailedCostBreakdown, StageCostBreakdown } from './calculator.js';
import type { UsageSummary, StageUsage } from './tracker.js';

describe('formatCostBreakdown', () => {
  it('should format a basic cost breakdown', () => {
    const breakdown: CostBreakdown = {
      schemaVersion: 1,
      runId: 'test-run-123',
      providers: {
        perplexity: { tokens: { input: 1000, output: 500 }, cost: 0.0095 },
      },
      total: 0.0095,
      currency: 'USD',
    };

    const output = formatCostBreakdown(breakdown);

    expect(output).toContain('=== Cost Summary ===');
    expect(output).toContain('Run: test-run-123');
    expect(output).toContain('Perplexity');
    expect(output).toContain('1,000 / 500');
    expect(output).toContain('$0.0095');
    expect(output).toContain('Total');
  });

  it('should format all providers', () => {
    const breakdown: CostBreakdown = {
      schemaVersion: 1,
      runId: 'full-run',
      providers: {
        perplexity: { tokens: { input: 1000, output: 500 }, cost: 0.01 },
        gemini: { tokens: { input: 2000, output: 800 }, cost: 0.003 },
        openai: { tokens: { input: 3000, output: 1200 }, cost: 0.06 },
        places: { calls: 10, cost: 0.32 },
        youtube: { units: 500, cost: 0 },
      },
      total: 0.393,
      currency: 'USD',
    };

    const output = formatCostBreakdown(breakdown);

    expect(output).toContain('Perplexity');
    expect(output).toContain('Gemini');
    expect(output).toContain('OpenAI');
    expect(output).toContain('Places');
    expect(output).toContain('10 calls');
    expect(output).toContain('YouTube');
    expect(output).toContain('500 units');
  });

  it('should handle empty providers', () => {
    const breakdown: CostBreakdown = {
      schemaVersion: 1,
      runId: 'empty-run',
      providers: {},
      total: 0,
      currency: 'USD',
    };

    const output = formatCostBreakdown(breakdown);

    expect(output).toContain('=== Cost Summary ===');
    expect(output).toContain('Run: empty-run');
    expect(output).toContain('Total');
    expect(output).toContain('$0.0000');
  });
});

describe('formatDetailedCostBreakdown', () => {
  it('should include main summary and stage breakdown', () => {
    const breakdown: DetailedCostBreakdown = {
      schemaVersion: 1,
      runId: 'detailed-run',
      providers: {
        perplexity: { tokens: { input: 2000, output: 1000 }, cost: 0.021 },
      },
      total: 0.021,
      currency: 'USD',
      stages: [
        {
          stageId: '03_worker_outputs',
          providers: {
            perplexity: { tokens: { input: 2000, output: 1000 }, cost: 0.021 },
          },
          total: 0.021,
        },
      ],
    };

    const output = formatDetailedCostBreakdown(breakdown);

    expect(output).toContain('=== Cost Summary ===');
    expect(output).toContain('=== Per-Stage Costs ===');
    expect(output).toContain('Stage: 03_worker_outputs');
  });

  it('should handle no stages', () => {
    const breakdown: DetailedCostBreakdown = {
      schemaVersion: 1,
      runId: 'no-stages',
      providers: {
        perplexity: { tokens: { input: 1000, output: 500 }, cost: 0.01 },
      },
      total: 0.01,
      currency: 'USD',
      stages: [],
    };

    const output = formatDetailedCostBreakdown(breakdown);

    expect(output).toContain('=== Cost Summary ===');
    expect(output).not.toContain('=== Per-Stage Costs ===');
  });
});

describe('formatStageCost', () => {
  it('should format a stage cost breakdown', () => {
    const stageCost: StageCostBreakdown = {
      stageId: '03_worker_outputs',
      providers: {
        perplexity: { tokens: { input: 1000, output: 500 }, cost: 0.0105 },
        places: { calls: 5, cost: 0.16 },
      },
      total: 0.1705,
    };

    const output = formatStageCost(stageCost);

    expect(output).toContain('Stage: 03_worker_outputs');
    expect(output).toContain('Perplexity');
    expect(output).toContain('1,000/500 tokens');
    expect(output).toContain('Places: 5 calls');
    expect(output).toContain('Total: $0.17');
  });

  it('should handle stage with no usage', () => {
    const stageCost: StageCostBreakdown = {
      stageId: 'empty_stage',
      providers: {},
      total: 0,
    };

    const output = formatStageCost(stageCost);

    expect(output).toContain('Stage: empty_stage');
    expect(output).toContain('Total: $0.0000');
  });
});

describe('formatUsageSummary', () => {
  it('should format usage summary', () => {
    const usage: UsageSummary = {
      tokens: {
        perplexity: { input: 1000, output: 500 },
        gemini: { input: 2000, output: 800 },
        openai: { input: 0, output: 0 },
      },
      placesCalls: 10,
      youtubeUnits: 100,
      stages: [],
    };

    const output = formatUsageSummary(usage);

    expect(output).toContain('=== Usage Summary ===');
    expect(output).toContain('Token Usage:');
    expect(output).toContain('Perplexity: 1,000 in / 500 out');
    expect(output).toContain('Gemini:     2,000 in / 800 out');
    expect(output).toContain('API Usage:');
    expect(output).toContain('Places calls:   10');
    expect(output).toContain('YouTube units:  100');
  });

  it('should include per-stage breakdown', () => {
    const usage: UsageSummary = {
      tokens: {
        perplexity: { input: 1000, output: 500 },
        gemini: { input: 0, output: 0 },
        openai: { input: 0, output: 0 },
      },
      placesCalls: 0,
      youtubeUnits: 0,
      stages: [
        {
          stageId: '03_worker_outputs',
          tokens: {
            perplexity: { input: 1000, output: 500 },
            gemini: { input: 0, output: 0 },
            openai: { input: 0, output: 0 },
          },
          placesCalls: 0,
          youtubeUnits: 0,
        },
      ],
    };

    const output = formatUsageSummary(usage);

    expect(output).toContain('Per-Stage Usage:');
    expect(output).toContain('03_worker_outputs');
    expect(output).toContain('1,500 tokens');
  });
});

describe('formatStageUsage', () => {
  it('should format stage with tokens', () => {
    const stage: StageUsage = {
      stageId: '03_worker_outputs',
      tokens: {
        perplexity: { input: 1000, output: 500 },
        gemini: { input: 0, output: 0 },
        openai: { input: 0, output: 0 },
      },
      placesCalls: 0,
      youtubeUnits: 0,
    };

    const output = formatStageUsage(stage);

    expect(output).toContain('03_worker_outputs');
    expect(output).toContain('1,500 tokens');
  });

  it('should format stage with multiple usage types', () => {
    const stage: StageUsage = {
      stageId: '03_worker_outputs',
      tokens: {
        perplexity: { input: 1000, output: 500 },
        gemini: { input: 0, output: 0 },
        openai: { input: 0, output: 0 },
      },
      placesCalls: 5,
      youtubeUnits: 100,
    };

    const output = formatStageUsage(stage);

    expect(output).toContain('1,500 tokens');
    expect(output).toContain('5 Places calls');
    expect(output).toContain('100 YT units');
  });

  it('should handle stage with no usage', () => {
    const stage: StageUsage = {
      stageId: 'empty_stage',
      tokens: {
        perplexity: { input: 0, output: 0 },
        gemini: { input: 0, output: 0 },
        openai: { input: 0, output: 0 },
      },
      placesCalls: 0,
      youtubeUnits: 0,
    };

    const output = formatStageUsage(stage);

    expect(output).toContain('empty_stage');
    expect(output).toContain('no usage');
  });
});

describe('formatCostSummaryLine', () => {
  it('should format a compact one-line summary', () => {
    const breakdown: CostBreakdown = {
      schemaVersion: 1,
      runId: 'test-run',
      providers: {
        perplexity: { tokens: { input: 1000, output: 500 }, cost: 0.01 },
        places: { calls: 10, cost: 0.32 },
      },
      total: 0.33,
      currency: 'USD',
    };

    const output = formatCostSummaryLine(breakdown);

    expect(output).toContain('Perplexity: 1,500 tok');
    expect(output).toContain('Places: 10 calls');
    expect(output).toContain('Total: $0.33');
    expect(output).toContain(' | ');
  });

  it('should handle empty breakdown', () => {
    const breakdown: CostBreakdown = {
      schemaVersion: 1,
      runId: 'empty-run',
      providers: {},
      total: 0,
      currency: 'USD',
    };

    const output = formatCostSummaryLine(breakdown);

    expect(output).toContain('No usage');
    expect(output).toContain('Total: $0.0000');
  });
});

describe('color helpers', () => {
  describe('supportsColor', () => {
    it('should return false by default', () => {
      expect(supportsColor()).toBe(false);
    });
  });

  describe('green', () => {
    it('should return text unchanged when colors not supported', () => {
      expect(green('test')).toBe('test');
    });
  });

  describe('yellow', () => {
    it('should return text unchanged when colors not supported', () => {
      expect(yellow('test')).toBe('test');
    });
  });

  describe('red', () => {
    it('should return text unchanged when colors not supported', () => {
      expect(red('test')).toBe('test');
    });
  });

  describe('dim', () => {
    it('should return text unchanged when colors not supported', () => {
      expect(dim('test')).toBe('test');
    });
  });
});
