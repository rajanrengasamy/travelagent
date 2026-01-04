/**
 * Tests for cost configuration
 *
 * @module config/costs.test
 */

import { describe, it, expect } from '@jest/globals';
import {
  TOKEN_COSTS,
  API_COSTS,
  calculateTokenCost,
  calculateApiCost,
  createEmptyCostBreakdown,
  formatCost,
} from './costs.js';

describe('costs', () => {
  describe('TOKEN_COSTS', () => {
    it('should have costs for all providers', () => {
      expect(TOKEN_COSTS.perplexity).toBeDefined();
      expect(TOKEN_COSTS.gemini).toBeDefined();
      expect(TOKEN_COSTS.openai).toBeDefined();
    });

    it('should have inputPerMillion and outputPerMillion for each provider', () => {
      for (const provider of Object.values(TOKEN_COSTS)) {
        expect(provider.inputPerMillion).toBeGreaterThanOrEqual(0);
        expect(provider.outputPerMillion).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('API_COSTS', () => {
    it('should have costs for places provider', () => {
      expect(API_COSTS.places).toBeDefined();
      expect(API_COSTS.places.textSearch).toBe(0.032);
      expect(API_COSTS.places.placeDetails).toBe(0.017);
      expect(API_COSTS.places.autocomplete).toBe(0.00283);
    });

    it('should have zero costs for youtube (quota-based)', () => {
      expect(API_COSTS.youtube).toBeDefined();
      expect(API_COSTS.youtube.searchPerUnit).toBe(0);
      expect(API_COSTS.youtube.detailsPerUnit).toBe(0);
    });
  });

  describe('calculateTokenCost', () => {
    it('should calculate cost correctly for Perplexity', () => {
      // 1M input tokens at $3, 1M output at $15 = $18
      const cost = calculateTokenCost('perplexity', 1_000_000, 1_000_000);
      expect(cost).toBe(18.0);
    });

    it('should calculate cost correctly for Gemini', () => {
      // 1M input at $0.5, 1M output at $3 = $3.5
      const cost = calculateTokenCost('gemini', 1_000_000, 1_000_000);
      expect(cost).toBe(3.5);
    });

    it('should calculate cost correctly for OpenAI', () => {
      // 1M input at $10, 1M output at $30 = $40
      const cost = calculateTokenCost('openai', 1_000_000, 1_000_000);
      expect(cost).toBe(40.0);
    });

    it('should handle small token counts', () => {
      // 1000 input, 500 output for Gemini
      // input: (1000 / 1_000_000) * 0.5 = 0.0005
      // output: (500 / 1_000_000) * 3.0 = 0.0015
      // total: 0.002
      const cost = calculateTokenCost('gemini', 1000, 500);
      expect(cost).toBeCloseTo(0.002, 6);
    });

    it('should return 0 for 0 tokens', () => {
      const cost = calculateTokenCost('openai', 0, 0);
      expect(cost).toBe(0);
    });

    it('should calculate mixed token counts correctly', () => {
      // 500,000 input at $10/M = $5, 250,000 output at $30/M = $7.50
      const cost = calculateTokenCost('openai', 500_000, 250_000);
      expect(cost).toBe(12.5);
    });
  });

  describe('calculateApiCost', () => {
    it('should calculate Places text search cost', () => {
      const cost = calculateApiCost('places', 'textSearch', 100);
      expect(cost).toBe(3.2); // 100 * $0.032
    });

    it('should calculate Places details cost', () => {
      const cost = calculateApiCost('places', 'placeDetails', 100);
      expect(cost).toBeCloseTo(1.7, 10); // 100 * $0.017
    });

    it('should calculate Places autocomplete cost', () => {
      const cost = calculateApiCost('places', 'autocomplete', 1000);
      expect(cost).toBe(2.83); // 1000 * $0.00283
    });

    it('should return 0 for YouTube (quota-based)', () => {
      const cost = calculateApiCost('youtube', 'searchPerUnit', 100);
      expect(cost).toBe(0);
    });

    it('should return 0 for 0 calls', () => {
      const cost = calculateApiCost('places', 'textSearch', 0);
      expect(cost).toBe(0);
    });
  });

  describe('createEmptyCostBreakdown', () => {
    it('should return all zeros', () => {
      const breakdown = createEmptyCostBreakdown();
      expect(breakdown.perplexity).toBe(0);
      expect(breakdown.gemini).toBe(0);
      expect(breakdown.openai).toBe(0);
      expect(breakdown.places).toBe(0);
      expect(breakdown.youtube).toBe(0);
      expect(breakdown.total).toBe(0);
    });

    it('should return a new object each time', () => {
      const breakdown1 = createEmptyCostBreakdown();
      const breakdown2 = createEmptyCostBreakdown();
      expect(breakdown1).not.toBe(breakdown2);
      expect(breakdown1).toEqual(breakdown2);
    });
  });

  describe('formatCost', () => {
    it('should format small costs with 4 decimal places', () => {
      expect(formatCost(0.0045)).toBe('$0.0045');
      expect(formatCost(0.001)).toBe('$0.0010');
      expect(formatCost(0.0099)).toBe('$0.0099');
    });

    it('should format larger costs with 2 decimal places', () => {
      expect(formatCost(1.5)).toBe('$1.50');
      expect(formatCost(12.345)).toBe('$12.35');
      expect(formatCost(0.01)).toBe('$0.01');
    });

    it('should format zero', () => {
      expect(formatCost(0)).toBe('$0.0000');
    });

    it('should handle edge case at boundary', () => {
      expect(formatCost(0.009999)).toBe('$0.0100');
      expect(formatCost(0.01)).toBe('$0.01');
    });
  });
});
