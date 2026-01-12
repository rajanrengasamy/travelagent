/**
 * Tests for Parameter Extractor
 *
 * Tests cover all parsing functions for extracting session parameters
 * from refined prompts per PRD Section FR0.5.
 */

import { describe, it, expect } from '@jest/globals';
import {
  extractSessionParams,
  parseDestinations,
  parseDateRange,
  parseFlexibility,
  parseInterests,
  parseConstraints,
  getDefaultYear,
} from './extractor.js';

describe('extractSessionParams', () => {
  it('extracts all parameters from a complete prompt', async () => {
    const prompt = 'Exploring Japan in April 2026, focusing on temples and food. Flexible dates preferred.';
    const result = await extractSessionParams(prompt);

    expect(result.destinations).toContain('Japan');
    expect(result.dateRange).toBeDefined();
    expect(result.dateRange?.start).toBe('2026-04-01');
    expect(result.dateRange?.end).toBe('2026-04-30');
    expect(result.interests).toEqual(expect.arrayContaining(['temples', 'food']));
    expect(result.flexibility).toBeDefined();
    expect(result.inferredTags).toBeDefined();
  });

  it('returns only defined fields', async () => {
    const prompt = 'I want to visit somewhere nice.';
    const result = await extractSessionParams(prompt);

    // Should not have undefined fields
    expect(Object.values(result).every((v) => v !== undefined)).toBe(true);
  });

  it('extracts parameters from PRD example', async () => {
    const prompt = `Exploring Japan in April 2026, focusing on:
- Traditional temples and shrines (Kyoto, Nara)
- Authentic Japanese cuisine (ramen, sushi, izakaya, street food)
- Cherry blossom season experiences

Trip style: Flexible dates (+/-7 days around early-mid April)`;

    const result = await extractSessionParams(prompt);

    expect(result.destinations).toEqual(expect.arrayContaining(['Japan', 'Kyoto', 'Nara']));
    expect(result.interests).toEqual(
      expect.arrayContaining(['temples', 'shrines', 'ramen', 'sushi', 'izakaya', 'street food'])
    );
    expect(result.flexibility).toEqual({ type: 'plusMinusDays', days: 7 });
    expect(result.inferredTags).toEqual(expect.arrayContaining(['asia', 'culture', 'food']));
  });
});

describe('parseDestinations', () => {
  it('extracts single country', () => {
    expect(parseDestinations('I want to visit Japan')).toContain('Japan');
  });

  it('extracts multiple countries', () => {
    const result = parseDestinations('Traveling through Thailand, Vietnam, and Cambodia');
    expect(result).toEqual(expect.arrayContaining(['Thailand', 'Vietnam', 'Cambodia']));
  });

  it('extracts cities', () => {
    const result = parseDestinations('Tokyo and Kyoto trip');
    expect(result).toEqual(expect.arrayContaining(['Tokyo', 'Kyoto']));
  });

  it('extracts regions', () => {
    expect(parseDestinations('Backpacking through Southeast Asia')).toContain('Southeast Asia');
  });

  it('extracts mixed destinations', () => {
    const result = parseDestinations('Japan trip focusing on Tokyo, Kyoto, and Nara');
    expect(result).toEqual(expect.arrayContaining(['Japan', 'Tokyo', 'Kyoto', 'Nara']));
  });

  it('handles "to destination" pattern', () => {
    expect(parseDestinations('Planning a trip to Paris')).toContain('Paris');
  });

  it('handles "in destination" pattern', () => {
    expect(parseDestinations('Spending a week in Barcelona')).toContain('Barcelona');
  });

  it('does not extract month names as destinations', () => {
    const result = parseDestinations('Traveling in April to France');
    expect(result).not.toContain('April');
    expect(result).toContain('France');
  });

  it('normalizes destination case', () => {
    const result = parseDestinations('visiting TOKYO and kyoto');
    expect(result).toContain('Tokyo');
    expect(result).toContain('Kyoto');
  });

  it('returns empty array for text without destinations', () => {
    // Note: "Nice" would be detected as a destination (it's a city in France)
    // Using lowercase "nice" or other words that aren't place names
    expect(parseDestinations('i want to go somewhere great soon')).toEqual([]);
  });
});

describe('parseDateRange', () => {
  it('parses "Month Year" format', () => {
    const result = parseDateRange('Traveling in April 2026');
    expect(result).toEqual({
      start: '2026-04-01',
      end: '2026-04-30',
    });
  });

  it('parses date range format "April 1-14, 2026"', () => {
    const result = parseDateRange('Trip from April 1-14, 2026');
    expect(result).toEqual({
      start: '2026-04-01',
      end: '2026-04-14',
    });
  });

  it('parses date range with en-dash', () => {
    const result = parseDateRange('March 15\u201322, 2026');
    expect(result).toEqual({
      start: '2026-03-15',
      end: '2026-03-22',
    });
  });

  it('parses specific date and infers 7-day trip', () => {
    const result = parseDateRange('Starting April 10, 2026');
    expect(result).toBeDefined();
    expect(result?.start).toBe('2026-04-10');
  });

  it('parses duration pattern "10 days in April"', () => {
    const result = parseDateRange('10 days in April 2026');
    expect(result).toBeDefined();
    expect(result?.start.startsWith('2026-04')).toBe(true);
    expect(result?.end.startsWith('2026-04')).toBe(true);
  });

  it('parses "next spring"', () => {
    const result = parseDateRange('Planning to go next spring');
    expect(result).toBeDefined();
    // Spring is March-May
    expect(result?.start.endsWith('-03-01')).toBe(true);
    expect(result?.end.endsWith('-05-31')).toBe(true);
  });

  it('parses "summer" season', () => {
    const result = parseDateRange('Summer vacation plans');
    expect(result).toBeDefined();
    // Summer is June-August
    expect(result?.start.endsWith('-06-01')).toBe(true);
    expect(result?.end.endsWith('-08-31')).toBe(true);
  });

  it('handles winter spanning year boundary', () => {
    const result = parseDateRange('Winter trip');
    expect(result).toBeDefined();
    // Winter is Dec-Feb, so end year should be start year + 1
    const startYear = parseInt(result!.start.substring(0, 4), 10);
    const endYear = parseInt(result!.end.substring(0, 4), 10);
    expect(endYear).toBe(startYear + 1);
  });

  it('parses month only without year and uses default year', () => {
    const result = parseDateRange('in April');
    expect(result).toBeDefined();
    const expectedYear = getDefaultYear();
    expect(result?.start).toBe(`${expectedYear}-04-01`);
  });

  it('returns undefined for text without dates', () => {
    expect(parseDateRange('I want to go somewhere nice')).toBeUndefined();
  });

  it('handles abbreviated month names', () => {
    const result = parseDateRange('Trip in Mar 2026');
    expect(result).toEqual({
      start: '2026-03-01',
      end: '2026-03-31',
    });
  });

  it('parses June correctly when "may" appears as modal verb (MIN-1)', () => {
    // The word "may" as a modal verb should not be confused with "May" the month
    // This sentence should parse June, not May
    const result = parseDateRange('I may go to Japan in June 2026');
    expect(result).toEqual({
      start: '2026-06-01',
      end: '2026-06-30',
    });
    // Ensure May was NOT parsed
    expect(result?.start).not.toContain('-05-');
  });
});

describe('parseFlexibility', () => {
  it('parses "+/- N days" pattern', () => {
    expect(parseFlexibility('+/- 3 days')).toEqual({
      type: 'plusMinusDays',
      days: 3,
    });
  });

  it('parses plus minus symbol', () => {
    expect(parseFlexibility('\u00b13 days')).toEqual({
      type: 'plusMinusDays',
      days: 3,
    });
  });

  it('parses "plus or minus N days"', () => {
    expect(parseFlexibility('plus or minus 5 days')).toEqual({
      type: 'plusMinusDays',
      days: 5,
    });
  });

  it('parses "flexible by N days"', () => {
    expect(parseFlexibility('flexible by 4 days')).toEqual({
      type: 'plusMinusDays',
      days: 4,
    });
  });

  it('parses "sometime in Month" pattern', () => {
    const result = parseFlexibility('sometime in April 2026');
    expect(result).toEqual({
      type: 'monthOnly',
      month: '2026-04',
    });
  });

  it('parses "anytime in Month" pattern', () => {
    const result = parseFlexibility('anytime in March');
    expect(result?.type).toBe('monthOnly');
    expect(result && 'month' in result && result.month.endsWith('-03')).toBe(true);
  });

  it('returns default flexibility for general "flexible" keyword', () => {
    expect(parseFlexibility('dates are flexible')).toEqual({
      type: 'plusMinusDays',
      days: 7,
    });
  });

  it('parses "open dates"', () => {
    expect(parseFlexibility('open dates work for us')).toEqual({
      type: 'plusMinusDays',
      days: 7,
    });
  });

  it('parses fixed date indicators', () => {
    expect(parseFlexibility('exact dates required')).toEqual({
      type: 'none',
    });
  });

  it('returns undefined when no flexibility mentioned', () => {
    expect(parseFlexibility('I want to go to Japan')).toBeUndefined();
  });

  it('caps flexibility at 30 days', () => {
    const result = parseFlexibility('+/- 50 days');
    expect(result).toEqual({
      type: 'plusMinusDays',
      days: 30,
    });
  });
});

describe('parseInterests', () => {
  it('extracts food-related interests', () => {
    const result = parseInterests('I love food, especially ramen and sushi');
    expect(result).toEqual(expect.arrayContaining(['food', 'ramen', 'sushi']));
  });

  it('extracts culture-related interests', () => {
    const result = parseInterests('Want to see temples, museums, and historical sites');
    expect(result).toEqual(expect.arrayContaining(['temples', 'museums', 'historical']));
  });

  it('extracts nature-related interests', () => {
    const result = parseInterests('Looking for hiking and beach activities');
    expect(result).toEqual(expect.arrayContaining(['hiking', 'beach']));
  });

  it('extracts adventure-related interests', () => {
    const result = parseInterests('Want some adventure, maybe diving or surfing');
    expect(result).toEqual(expect.arrayContaining(['adventure', 'diving', 'surfing']));
  });

  it('extracts from "focusing on X" pattern', () => {
    const result = parseInterests('focusing on local culture and street food');
    // The pattern extracts multi-word phrases and also matches keywords
    expect(result).toEqual(expect.arrayContaining(['street food']));
    expect(result.some(i => i.includes('culture'))).toBe(true);
  });

  it('extracts from "interested in X" pattern', () => {
    const result = parseInterests('interested in nightlife and bars');
    expect(result).toEqual(expect.arrayContaining(['nightlife', 'bars']));
  });

  it('handles multi-word interests', () => {
    const result = parseInterests('Want to experience street food culture');
    expect(result).toContain('street food');
  });

  it('returns empty array for text without interests', () => {
    expect(parseInterests('I want to go somewhere')).toEqual([]);
  });
});

describe('parseConstraints', () => {
  it('extracts budget constraint', () => {
    expect(parseConstraints('budget-friendly trip')).toHaveProperty('budget', 'budget');
    expect(parseConstraints('luxury vacation')).toHaveProperty('budget', 'luxury');
    expect(parseConstraints('moderate budget')).toHaveProperty('budget', 'moderate');
  });

  it('extracts accessibility constraint', () => {
    expect(parseConstraints('need wheelchair accessibility')).toHaveProperty('accessibility', 'wheelchair');
  });

  it('extracts travel style constraint', () => {
    expect(parseConstraints('family-friendly activities')).toHaveProperty('travelStyle', 'family');
    expect(parseConstraints('solo travel')).toHaveProperty('travelStyle', 'solo');
    expect(parseConstraints('romantic getaway')).toHaveProperty('travelStyle', 'couple');
    expect(parseConstraints('trip with friends')).toHaveProperty('travelStyle', 'group');
  });

  it('extracts dietary constraint', () => {
    expect(parseConstraints('vegetarian options needed')).toHaveProperty('dietary', 'vegetarian');
    expect(parseConstraints('must have halal food')).toHaveProperty('dietary', 'halal');
  });

  it('extracts explicit budget amount', () => {
    const result = parseConstraints('budget of $150 per day');
    expect(result.budgetAmount).toBe(150);
    expect(result.budgetPeriod).toBe('daily');
  });

  it('extracts trip duration preference', () => {
    const result = parseConstraints('planning a 10 day trip');
    expect(result.preferredDuration).toBe(10);
  });

  it('extracts pace preference', () => {
    expect(parseConstraints('slow pace preferred')).toHaveProperty('pace', 'slow');
    expect(parseConstraints('packed itinerary')).toHaveProperty('pace', 'fast');
  });

  it('extracts multiple constraints', () => {
    const result = parseConstraints('luxury family trip with vegetarian options');
    expect(result.budget).toBe('luxury');
    expect(result.travelStyle).toBe('family');
    expect(result.dietary).toBe('vegetarian');
  });

  it('returns empty object for text without constraints', () => {
    expect(parseConstraints('I want to go to Japan')).toEqual({});
  });
});

describe('inferTags', () => {
  it('infers region tags from destinations', async () => {
    const result = await extractSessionParams('Trip to Tokyo and Kyoto');
    expect(result.inferredTags).toContain('asia');
  });

  it('infers category tags from interests', async () => {
    const result = await extractSessionParams('Japan trip for temples and ramen');
    expect(result.inferredTags).toEqual(expect.arrayContaining(['culture', 'food']));
  });

  it('infers season tags from text', async () => {
    const result = await extractSessionParams('Cherry blossom viewing in Japan');
    expect(result.inferredTags).toEqual(expect.arrayContaining(['spring', 'photography']));
  });

  it('infers experience type tags', async () => {
    const result = await extractSessionParams('Looking for off the beaten path experiences');
    expect(result.inferredTags).toContain('offbeat');
  });

  it('infers trip style tags', async () => {
    const result = await extractSessionParams('Planning our honeymoon in Bali');
    expect(result.inferredTags).toContain('romantic');
  });
});

describe('getDefaultYear', () => {
  it('returns a valid year', () => {
    const year = getDefaultYear();
    expect(year).toBeGreaterThanOrEqual(new Date().getFullYear());
    expect(year).toBeLessThanOrEqual(new Date().getFullYear() + 1);
  });
});
