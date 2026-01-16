/**
 * Tests for CostTracker
 *
 * @module cost/tracker.test
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  CostTrackerImpl,
  createCostTracker,
} from './tracker.js';

describe('CostTrackerImpl', () => {
  let tracker: CostTrackerImpl;

  beforeEach(() => {
    tracker = new CostTrackerImpl('test-run-123');
  });

  describe('constructor', () => {
    it('should create a tracker with the given runId', () => {
      const cost = tracker.getCost();
      expect(cost.runId).toBe('test-run-123');
    });

    it('should start with zero usage', () => {
      const cost = tracker.getCost();
      expect(cost.total).toBe(0);
      expect(cost.providers).toEqual({});
    });
  });

  describe('addPerplexity', () => {
    it('should track Perplexity token usage', () => {
      tracker.addPerplexity(1000, 500);
      const cost = tracker.getCost();

      expect(cost.providers.perplexity).toBeDefined();
      expect(cost.providers.perplexity?.tokens.input).toBe(1000);
      expect(cost.providers.perplexity?.tokens.output).toBe(500);
    });

    it('should accumulate multiple calls', () => {
      tracker.addPerplexity(1000, 500);
      tracker.addPerplexity(2000, 1000);
      const cost = tracker.getCost();

      expect(cost.providers.perplexity?.tokens.input).toBe(3000);
      expect(cost.providers.perplexity?.tokens.output).toBe(1500);
    });

    it('should calculate cost correctly', () => {
      // 1M input at $3, 1M output at $15 = $18
      tracker.addPerplexity(1_000_000, 1_000_000);
      const cost = tracker.getCost();

      expect(cost.providers.perplexity?.cost).toBe(18.0);
    });
  });

  describe('addGemini', () => {
    it('should track Gemini token usage', () => {
      tracker.addGemini(2000, 800);
      const cost = tracker.getCost();

      expect(cost.providers.gemini).toBeDefined();
      expect(cost.providers.gemini?.tokens.input).toBe(2000);
      expect(cost.providers.gemini?.tokens.output).toBe(800);
    });

    it('should calculate cost correctly', () => {
      // 1M input at $0.5, 1M output at $3 = $3.5
      tracker.addGemini(1_000_000, 1_000_000);
      const cost = tracker.getCost();

      expect(cost.providers.gemini?.cost).toBe(3.5);
    });
  });

  describe('addOpenAI', () => {
    it('should track OpenAI token usage', () => {
      tracker.addOpenAI(5000, 2000);
      const cost = tracker.getCost();

      expect(cost.providers.openai).toBeDefined();
      expect(cost.providers.openai?.tokens.input).toBe(5000);
      expect(cost.providers.openai?.tokens.output).toBe(2000);
    });

    it('should calculate cost correctly', () => {
      // 1M input at $10, 1M output at $30 = $40
      tracker.addOpenAI(1_000_000, 1_000_000);
      const cost = tracker.getCost();

      expect(cost.providers.openai?.cost).toBe(40.0);
    });
  });

  describe('addPlacesCall', () => {
    it('should track Places API calls', () => {
      tracker.addPlacesCall();
      tracker.addPlacesCall();
      tracker.addPlacesCall();
      const cost = tracker.getCost();

      expect(cost.providers.places).toBeDefined();
      expect(cost.providers.places?.calls).toBe(3);
    });

    it('should calculate cost correctly', () => {
      // 100 calls at $0.032 = $3.20
      for (let i = 0; i < 100; i++) {
        tracker.addPlacesCall();
      }
      const cost = tracker.getCost();

      expect(cost.providers.places?.cost).toBe(3.2);
    });
  });

  describe('addYouTubeUnits', () => {
    it('should track YouTube quota units', () => {
      tracker.addYouTubeUnits(100);
      tracker.addYouTubeUnits(50);
      const cost = tracker.getCost();

      expect(cost.providers.youtube).toBeDefined();
      expect(cost.providers.youtube?.units).toBe(150);
    });

    it('should have zero cost (quota-based)', () => {
      tracker.addYouTubeUnits(1000);
      const cost = tracker.getCost();

      expect(cost.providers.youtube?.cost).toBe(0);
    });
  });

  describe('addTokenUsage (generic)', () => {
    it('should route to correct provider method', () => {
      tracker.addTokenUsage('perplexity', 1000, 500);
      tracker.addTokenUsage('gemini', 2000, 800);
      tracker.addTokenUsage('openai', 3000, 1200);
      const cost = tracker.getCost();

      expect(cost.providers.perplexity?.tokens.input).toBe(1000);
      expect(cost.providers.gemini?.tokens.input).toBe(2000);
      expect(cost.providers.openai?.tokens.input).toBe(3000);
    });

    it('should handle case-insensitive provider names', () => {
      tracker.addTokenUsage('PERPLEXITY', 1000, 500);
      tracker.addTokenUsage('Gemini', 2000, 800);
      const cost = tracker.getCost();

      expect(cost.providers.perplexity?.tokens.input).toBe(1000);
      expect(cost.providers.gemini?.tokens.input).toBe(2000);
    });

    it('should ignore unknown providers', () => {
      tracker.addTokenUsage('unknown', 1000, 500);
      const cost = tracker.getCost();

      expect(cost.providers).toEqual({});
      expect(cost.total).toBe(0);
    });
  });

  describe('addApiCalls (generic)', () => {
    it('should route to Places provider', () => {
      tracker.addApiCalls('places', 5);
      const cost = tracker.getCost();

      expect(cost.providers.places?.calls).toBe(5);
    });

    it('should handle case-insensitive provider names', () => {
      tracker.addApiCalls('PLACES', 3);
      const cost = tracker.getCost();

      expect(cost.providers.places?.calls).toBe(3);
    });
  });

  describe('addQuotaUnits (generic)', () => {
    it('should route to YouTube provider', () => {
      tracker.addQuotaUnits('youtube', 100);
      const cost = tracker.getCost();

      expect(cost.providers.youtube?.units).toBe(100);
    });

    it('should handle case-insensitive provider names', () => {
      tracker.addQuotaUnits('YOUTUBE', 50);
      const cost = tracker.getCost();

      expect(cost.providers.youtube?.units).toBe(50);
    });
  });

  describe('getCost', () => {
    it('should return schema version 1', () => {
      const cost = tracker.getCost();
      expect(cost.schemaVersion).toBe(1);
    });

    it('should return USD currency', () => {
      const cost = tracker.getCost();
      expect(cost.currency).toBe('USD');
    });

    it('should calculate total correctly', () => {
      tracker.addPerplexity(1_000_000, 1_000_000); // $18
      tracker.addGemini(1_000_000, 1_000_000); // $3.5
      tracker.addOpenAI(1_000_000, 1_000_000); // $40
      for (let i = 0; i < 100; i++) {
        tracker.addPlacesCall(); // $3.2
      }
      tracker.addYouTubeUnits(500); // $0

      const cost = tracker.getCost();
      expect(cost.total).toBeCloseTo(64.7, 1);
    });

    it('should only include providers with usage', () => {
      tracker.addPerplexity(1000, 500);
      const cost = tracker.getCost();

      expect(cost.providers.perplexity).toBeDefined();
      expect(cost.providers.gemini).toBeUndefined();
      expect(cost.providers.openai).toBeUndefined();
      expect(cost.providers.places).toBeUndefined();
      expect(cost.providers.youtube).toBeUndefined();
    });
  });

  describe('getTotal', () => {
    it('should return aggregated token counts', () => {
      tracker.addPerplexity(1000, 500);
      tracker.addGemini(2000, 800);
      tracker.addOpenAI(3000, 1200);

      const total = tracker.getTotal();

      expect(total.tokens.input).toBe(6000);
      expect(total.tokens.output).toBe(2500);
    });

    it('should return estimated cost', () => {
      tracker.addPerplexity(1_000_000, 1_000_000);
      const total = tracker.getTotal();

      expect(total.estimatedCost).toBe(18.0);
    });
  });

  describe('reset', () => {
    it('should clear all usage', () => {
      tracker.addPerplexity(1000, 500);
      tracker.addGemini(2000, 800);
      tracker.addPlacesCall();
      tracker.addYouTubeUnits(100);

      tracker.reset();

      const cost = tracker.getCost();
      expect(cost.total).toBe(0);
      expect(cost.providers).toEqual({});
    });

    it('should preserve runId', () => {
      tracker.reset();
      const cost = tracker.getCost();
      expect(cost.runId).toBe('test-run-123');
    });
  });

  describe('stage tracking', () => {
    it('should track usage per stage when set', () => {
      tracker.setCurrentStage('03_worker_outputs');
      tracker.addPerplexity(1000, 500);
      tracker.addPlacesCall();

      const stageUsage = tracker.getStageUsage('03_worker_outputs');

      expect(stageUsage).toBeDefined();
      expect(stageUsage?.tokens.perplexity.input).toBe(1000);
      expect(stageUsage?.tokens.perplexity.output).toBe(500);
      expect(stageUsage?.placesCalls).toBe(1);
    });

    it('should track multiple stages independently', () => {
      tracker.setCurrentStage('03_worker_outputs');
      tracker.addPerplexity(1000, 500);

      tracker.setCurrentStage('07_candidates_validated');
      tracker.addGemini(2000, 800);

      const stage3 = tracker.getStageUsage('03_worker_outputs');
      const stage7 = tracker.getStageUsage('07_candidates_validated');

      expect(stage3?.tokens.perplexity.input).toBe(1000);
      expect(stage3?.tokens.gemini.input).toBe(0);

      expect(stage7?.tokens.perplexity.input).toBe(0);
      expect(stage7?.tokens.gemini.input).toBe(2000);
    });

    it('should not track when no stage is set', () => {
      tracker.addPerplexity(1000, 500);

      const allStages = tracker.getAllStageUsage();
      expect(allStages).toHaveLength(0);
    });

    it('should stop tracking when stage is cleared', () => {
      tracker.setCurrentStage('03_worker_outputs');
      tracker.addPerplexity(1000, 500);

      tracker.clearCurrentStage();
      tracker.addGemini(2000, 800);

      const stage3 = tracker.getStageUsage('03_worker_outputs');
      expect(stage3?.tokens.perplexity.input).toBe(1000);
      expect(stage3?.tokens.gemini.input).toBe(0);
    });

    it('should return all stage usage', () => {
      tracker.setCurrentStage('03_worker_outputs');
      tracker.addPerplexity(1000, 500);

      tracker.setCurrentStage('07_candidates_validated');
      tracker.addGemini(2000, 800);

      const allStages = tracker.getAllStageUsage();
      expect(allStages).toHaveLength(2);
      expect(allStages.map(s => s.stageId)).toContain('03_worker_outputs');
      expect(allStages.map(s => s.stageId)).toContain('07_candidates_validated');
    });

    it('should clear stages on reset', () => {
      tracker.setCurrentStage('03_worker_outputs');
      tracker.addPerplexity(1000, 500);

      tracker.reset();

      const allStages = tracker.getAllStageUsage();
      expect(allStages).toHaveLength(0);
    });
  });

  describe('getUsageSummary', () => {
    it('should return complete usage summary', () => {
      tracker.addPerplexity(1000, 500);
      tracker.addGemini(2000, 800);
      tracker.addOpenAI(3000, 1200);
      tracker.addPlacesCall();
      tracker.addYouTubeUnits(100);

      const summary = tracker.getUsageSummary();

      expect(summary.tokens.perplexity.input).toBe(1000);
      expect(summary.tokens.gemini.input).toBe(2000);
      expect(summary.tokens.openai.input).toBe(3000);
      expect(summary.placesCalls).toBe(1);
      expect(summary.youtubeUnits).toBe(100);
    });

    it('should include stage breakdown', () => {
      tracker.setCurrentStage('03_worker_outputs');
      tracker.addPerplexity(1000, 500);

      const summary = tracker.getUsageSummary();

      expect(summary.stages).toHaveLength(1);
      expect(summary.stages[0].stageId).toBe('03_worker_outputs');
    });
  });
});

describe('createCostTracker', () => {
  it('should create a CostTrackerImpl instance', () => {
    const tracker = createCostTracker('my-run-id');

    expect(tracker).toBeInstanceOf(CostTrackerImpl);
    expect(tracker.getCost().runId).toBe('my-run-id');
  });
});
