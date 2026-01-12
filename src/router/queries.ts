/**
 * Query Generation for Router Stage
 *
 * Generates worker-specific search queries based on session context.
 * Each worker type (Perplexity, Places, YouTube) gets tailored queries
 * that match its strengths and API capabilities.
 *
 * @module router/queries
 * @see PRD Section 4.1 - Router Stage
 */

import type { Session } from '../schemas/session.js';
import { z } from 'zod';

// ============================================
// Types
// ============================================

/**
 * Query context extracted from a session.
 * Provides structured data for query generation.
 */
export interface QueryContext {
  /** Primary destination (first in list) */
  destination: string;
  /** All destinations */
  allDestinations: string[];
  /** User interests */
  interests: string[];
  /** Key constraints as searchable strings */
  constraints: string[];
  /** Inferred season from dates */
  season?: string;
  /** Trip duration description */
  duration?: string;
}

/**
 * Zod schema for QueryContext validation
 */
export const QueryContextSchema = z.object({
  destination: z.string().min(1),
  allDestinations: z.array(z.string().min(1)),
  interests: z.array(z.string()),
  constraints: z.array(z.string()),
  season: z.string().optional(),
  duration: z.string().optional(),
});

// ============================================
// Worker IDs
// ============================================

export const WORKER_IDS = ['perplexity', 'places', 'youtube'] as const;
export type WorkerId = (typeof WORKER_IDS)[number];

// ============================================
// Constants
// ============================================

/**
 * Month number to season mapping
 */
const MONTH_TO_SEASON: Record<number, string> = {
  1: 'winter',
  2: 'winter',
  3: 'spring',
  4: 'spring',
  5: 'spring',
  6: 'summer',
  7: 'summer',
  8: 'summer',
  9: 'fall',
  10: 'fall',
  11: 'fall',
  12: 'winter',
};

/**
 * Budget level keywords for search queries
 */
const BUDGET_KEYWORDS: Record<string, string[]> = {
  low: ['budget-friendly', 'cheap', 'affordable', 'low-cost'],
  budget: ['budget-friendly', 'cheap', 'affordable'],
  moderate: ['mid-range', 'reasonable', 'value'],
  high: ['upscale', 'premium', 'high-end'],
  luxury: ['luxury', 'exclusive', 'premium', 'five-star'],
};

/**
 * Dietary restriction keywords
 */
const DIETARY_KEYWORDS: Record<string, string[]> = {
  vegetarian: ['vegetarian', 'veg-friendly', 'meat-free'],
  vegan: ['vegan', 'plant-based'],
  halal: ['halal', 'halal-certified'],
  kosher: ['kosher'],
  'gluten-free': ['gluten-free', 'celiac-friendly'],
};

/**
 * Travel style keywords
 */
const TRAVEL_STYLE_KEYWORDS: Record<string, string[]> = {
  family: ['family-friendly', 'kid-friendly', 'with kids', 'for families'],
  solo: ['solo traveler', 'solo-friendly'],
  couple: ['romantic', 'couples', 'honeymoon'],
  group: ['group-friendly', 'groups'],
};

/**
 * Places API category keywords for different interests
 */
const INTEREST_TO_PLACES_CATEGORY: Record<string, string[]> = {
  food: ['restaurant', 'cafe', 'bakery', 'food market'],
  temples: ['temple', 'shrine', 'monastery'],
  museums: ['museum', 'gallery', 'art center'],
  nature: ['park', 'garden', 'hiking trail', 'viewpoint'],
  nightlife: ['bar', 'club', 'nightclub', 'rooftop bar'],
  shopping: ['shopping mall', 'market', 'boutique'],
  photography: ['viewpoint', 'scenic spot', 'landmark'],
  culture: ['cultural center', 'heritage site', 'traditional'],
  history: ['historical site', 'monument', 'castle'],
  adventure: ['adventure park', 'outdoor activity', 'sports'],
  relaxation: ['spa', 'onsen', 'hot spring', 'wellness'],
  beaches: ['beach', 'coast', 'waterfront'],
};

/**
 * YouTube query templates for different content types
 */
const YOUTUBE_TEMPLATES = [
  '{destination} travel vlog {year}',
  '{destination} hidden gems travel guide',
  '{destination} things to do {interest}',
  '{destination} local tips travel',
  'best of {destination} trip {season}',
  '{destination} travel itinerary {duration}',
  '{destination} food tour local guide',
  '{destination} walking tour 4k',
];

/**
 * Perplexity query templates for conversational search
 */
const PERPLEXITY_TEMPLATES = [
  'Best hidden gems in {destination} for {interest} lovers{constraint}',
  'Top local {interest} spots in {destination} that tourists miss',
  'Off-the-beaten-path {interest} experiences in {destination}{constraint}',
  'What are the must-visit places in {destination} for {interest} enthusiasts',
  'Local recommendations for {interest} in {destination}{season}',
];

// ============================================
// Main Functions
// ============================================

/**
 * Generate worker-specific search queries for a session.
 *
 * Produces 3-5 tailored queries based on the worker's strengths:
 * - Perplexity: Long-form conversational queries
 * - Places: Short keyword-focused queries
 * - YouTube: Video-oriented queries with content keywords
 *
 * @param session - Session containing user intent
 * @param workerId - Target worker ID
 * @returns Array of 3-5 search queries
 *
 * @example
 * ```typescript
 * const queries = generateQueryVariants(session, 'perplexity');
 * // Returns: [
 * //   "Best hidden gems in Tokyo for food lovers visiting in winter",
 * //   "Top local food spots in Tokyo that tourists miss",
 * //   ...
 * // ]
 * ```
 */
export function generateQueryVariants(session: Session, workerId: string): string[] {
  const context = buildQueryContext(session);

  switch (workerId) {
    case 'perplexity':
      return generatePerplexityQueries(context);
    case 'places':
      return generatePlacesQueries(context);
    case 'youtube':
      return generateYouTubeQueries(context);
    default:
      return generateGenericQueries(context);
  }
}

/**
 * Build query context from a session.
 *
 * Extracts and structures key elements for query generation:
 * - Primary and all destinations
 * - User interests
 * - Constraint keywords
 * - Inferred season from date range
 * - Trip duration description
 *
 * @param session - Session to extract context from
 * @returns Structured query context
 *
 * @example
 * ```typescript
 * const context = buildQueryContext(session);
 * // Returns: {
 * //   destination: "Tokyo",
 * //   allDestinations: ["Tokyo", "Kyoto"],
 * //   interests: ["food", "temples"],
 * //   constraints: ["budget-friendly"],
 * //   season: "spring",
 * //   duration: "2 weeks"
 * // }
 * ```
 */
export function buildQueryContext(session: Session): QueryContext {
  const destination = session.destinations[0];
  if (!destination) {
    throw new Error('Cannot generate queries without destinations');
  }
  const allDestinations = [...session.destinations];
  const interests = [...session.interests];
  const constraints = formatConstraintKeywords(session.constraints);
  const season = inferSeason(session.dateRange.start);
  const duration = calculateDuration(session.dateRange.start, session.dateRange.end);

  return {
    destination,
    allDestinations,
    interests,
    constraints,
    season,
    duration,
  };
}

/**
 * Convert constraint object to searchable keywords.
 *
 * Transforms structured constraints into query-friendly strings:
 * - Budget levels → budget keywords
 * - Dietary restrictions → dietary keywords
 * - Accessibility needs → accessibility keywords
 * - Travel style → style keywords
 *
 * @param constraints - Constraint object from session
 * @returns Array of searchable keyword strings
 *
 * @example
 * ```typescript
 * formatConstraintKeywords({ budget: 'low', dietary: 'vegetarian' })
 * // Returns: ['budget-friendly', 'cheap', 'vegetarian', 'veg-friendly']
 * ```
 */
export function formatConstraintKeywords(
  constraints: Record<string, unknown> | undefined
): string[] {
  if (!constraints) {
    return [];
  }

  const keywords: string[] = [];

  // Budget constraints
  if (typeof constraints.budget === 'string') {
    const budgetLevel = constraints.budget.toLowerCase();
    const budgetTerms = BUDGET_KEYWORDS[budgetLevel];
    if (budgetTerms) {
      keywords.push(...budgetTerms);
    }
  }

  // Dietary constraints
  if (typeof constraints.dietary === 'string') {
    const dietary = constraints.dietary.toLowerCase();
    const dietaryTerms = DIETARY_KEYWORDS[dietary];
    if (dietaryTerms) {
      keywords.push(...dietaryTerms);
    }
  }

  // Accessibility constraints
  if (constraints.accessibility === true || constraints.accessibility === 'required') {
    keywords.push('wheelchair accessible', 'accessible');
  } else if (constraints.accessibility === 'wheelchair') {
    keywords.push('wheelchair accessible');
  } else if (constraints.accessibility === 'limited-mobility') {
    keywords.push('mobility-friendly', 'accessible');
  }

  // Family-friendly
  if (constraints.familyFriendly === true) {
    keywords.push('family-friendly', 'kid-friendly');
  }

  // Travel style
  if (typeof constraints.travelStyle === 'string') {
    const style = constraints.travelStyle.toLowerCase();
    const styleTerms = TRAVEL_STYLE_KEYWORDS[style];
    if (styleTerms) {
      keywords.push(...styleTerms);
    }
  }

  return keywords;
}

// ============================================
// Worker-Specific Query Generators
// ============================================

/**
 * Generate conversational queries for Perplexity (web search).
 *
 * Creates long-form, natural language queries that work well
 * with AI-powered web search. Includes context naturally.
 */
function generatePerplexityQueries(context: QueryContext): string[] {
  const queries: string[] = [];
  const maxQueries = 5;

  // Build constraint suffix for natural inclusion
  const constraintSuffix = context.constraints.length > 0
    ? ` ${context.constraints[0]}`
    : '';

  // Build season suffix
  const seasonSuffix = context.season
    ? ` visiting in ${context.season}`
    : '';

  // Generate queries from templates, varying interests
  const interestsToUse = context.interests.length > 0
    ? context.interests
    : ['things to do', 'attractions', 'experiences'];

  for (let i = 0; i < Math.min(maxQueries, interestsToUse.length + 2); i++) {
    const interest = interestsToUse[i % interestsToUse.length];
    const template = PERPLEXITY_TEMPLATES[i % PERPLEXITY_TEMPLATES.length];

    const query = template
      .replace('{destination}', context.destination)
      .replace('{interest}', interest)
      .replace('{constraint}', constraintSuffix)
      .replace('{season}', seasonSuffix);

    if (!queries.includes(query)) {
      queries.push(query);
    }
  }

  // Add a destination-combination query if multiple destinations
  if (context.allDestinations.length > 1 && queries.length < maxQueries) {
    const destinations = context.allDestinations.slice(0, 3).join(' and ');
    queries.push(`Best travel itinerary for ${destinations}${seasonSuffix}`);
  }

  // Add a general "hidden gems" query
  if (queries.length < maxQueries) {
    queries.push(
      `Underrated places to visit in ${context.destination} that most tourists don't know about`
    );
  }

  return queries.slice(0, maxQueries);
}

/**
 * Generate keyword-focused queries for Google Places API.
 *
 * Creates short, category-based queries optimized for Places search.
 * Focus on specific venue types and locations.
 */
function generatePlacesQueries(context: QueryContext): string[] {
  const queries: string[] = [];
  const maxQueries = 5;

  // Map interests to Places categories
  const categories: string[] = [];
  for (const interest of context.interests) {
    const interestLower = interest.toLowerCase();
    const placeCategories = INTEREST_TO_PLACES_CATEGORY[interestLower];
    if (placeCategories) {
      categories.push(...placeCategories);
    }
  }

  // If no specific interests, use general categories
  if (categories.length === 0) {
    categories.push('restaurant', 'tourist attraction', 'park', 'museum', 'landmark');
  }

  // Deduplicate categories
  const uniqueCategories = [...new Set(categories)];

  // Generate queries: "category destination"
  for (const category of uniqueCategories.slice(0, maxQueries)) {
    // For Places API, short keyword queries work best
    const query = `${category} ${context.destination}`;
    if (!queries.includes(query)) {
      queries.push(query);
    }
  }

  // Add constraint-modified queries if space
  if (context.constraints.length > 0 && queries.length < maxQueries) {
    const constraint = context.constraints[0];
    const category = uniqueCategories[0] ?? 'restaurant';
    queries.push(`${constraint} ${category} ${context.destination}`);
  }

  // Add queries for other destinations if space
  for (const dest of context.allDestinations.slice(1)) {
    if (queries.length >= maxQueries) break;
    const category = uniqueCategories[0] ?? 'attraction';
    queries.push(`${category} ${dest}`);
  }

  return queries.slice(0, maxQueries);
}

/**
 * Generate video-oriented queries for YouTube.
 *
 * Creates queries with video content keywords like "travel",
 * "vlog", "guide" that surface relevant video content.
 */
function generateYouTubeQueries(context: QueryContext): string[] {
  const queries: string[] = [];
  const maxQueries = 5;
  const currentYear = new Date().getFullYear();

  // Build substitution values
  const interest = context.interests[0] ?? 'travel';
  const season = context.season ?? '';
  const duration = context.duration ?? '';

  // Generate from templates
  for (const template of YOUTUBE_TEMPLATES.slice(0, maxQueries)) {
    const query = template
      .replace('{destination}', context.destination)
      .replace('{interest}', interest)
      .replace('{year}', String(currentYear))
      .replace('{season}', season)
      .replace('{duration}', duration)
      .replace(/\s+/g, ' ')
      .trim();

    if (!queries.includes(query) && query.length > 5) {
      queries.push(query);
    }
  }

  // Add interest-specific video queries
  for (const userInterest of context.interests.slice(0, 2)) {
    if (queries.length >= maxQueries) break;
    const query = `${context.destination} ${userInterest} travel vlog`;
    if (!queries.includes(query)) {
      queries.push(query);
    }
  }

  // Add multi-destination query if applicable
  if (context.allDestinations.length > 1 && queries.length < maxQueries) {
    const destinations = context.allDestinations.slice(0, 2).join(' ');
    queries.push(`${destinations} trip itinerary travel`);
  }

  return queries.slice(0, maxQueries);
}

/**
 * Generate generic queries for unknown workers.
 *
 * Fallback that produces simple destination + interest queries.
 */
function generateGenericQueries(context: QueryContext): string[] {
  const queries: string[] = [];
  const maxQueries = 4;

  // Simple "destination interest" patterns
  queries.push(`${context.destination} travel guide`);

  for (const interest of context.interests.slice(0, 2)) {
    queries.push(`${context.destination} ${interest}`);
  }

  if (context.constraints.length > 0) {
    queries.push(`${context.constraints[0]} travel ${context.destination}`);
  }

  return queries.slice(0, maxQueries);
}

// ============================================
// Helper Functions
// ============================================

/**
 * Infer season from a date string.
 *
 * @param dateStr - ISO date string (YYYY-MM-DD)
 * @returns Season name or undefined
 */
function inferSeason(dateStr: string): string | undefined {
  const match = dateStr.match(/^\d{4}-(\d{2})-\d{2}$/);
  if (!match) {
    return undefined;
  }

  const month = parseInt(match[1], 10);
  return MONTH_TO_SEASON[month];
}

/**
 * Calculate trip duration description.
 *
 * @param startStr - Start date (YYYY-MM-DD)
 * @param endStr - End date (YYYY-MM-DD)
 * @returns Human-readable duration or undefined
 */
function calculateDuration(startStr: string, endStr: string): string | undefined {
  const start = new Date(startStr);
  const end = new Date(endStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return undefined;
  }

  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return undefined;
  }

  if (diffDays <= 3) {
    return 'weekend trip';
  } else if (diffDays <= 7) {
    return '1 week';
  } else if (diffDays <= 14) {
    return '2 weeks';
  } else if (diffDays <= 21) {
    return '3 weeks';
  } else {
    return 'month long trip';
  }
}

// ============================================
// Exports
// ============================================

export {
  inferSeason,
  calculateDuration,
  generatePerplexityQueries,
  generatePlacesQueries,
  generateYouTubeQueries,
  generateGenericQueries,
};
