/**
 * Parameter Extractor
 *
 * Extracts structured session parameters from refined prompts using
 * pattern matching and text analysis. Converts free-form travel descriptions
 * into structured SessionParams objects.
 *
 * @module enhancement/extractor
 * @see PRD Section FR0.5 - Suggested Refinement
 */

import type { PartialSessionParams } from '../schemas/enhancement.js';
import type { Flexibility, DateRange } from '../schemas/common.js';

// ============================================
// Constants
// ============================================

/**
 * Month name to number mapping (1-indexed)
 */
const MONTH_MAP: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

/**
 * Season to month range mapping
 */
const SEASON_MAP: Record<string, { startMonth: number; endMonth: number }> = {
  spring: { startMonth: 3, endMonth: 5 },
  summer: { startMonth: 6, endMonth: 8 },
  fall: { startMonth: 9, endMonth: 11 },
  autumn: { startMonth: 9, endMonth: 11 },
  winter: { startMonth: 12, endMonth: 2 },
};

/**
 * Interest categories with associated keywords
 */
const INTEREST_CATEGORIES: Record<string, string[]> = {
  food: ['food', 'culinary', 'restaurants', 'street food', 'cuisine', 'dining', 'eating', 'foodie', 'gastronomy', 'ramen', 'sushi', 'izakaya', 'cooking'],
  culture: ['temples', 'museums', 'history', 'cultural', 'heritage', 'shrines', 'historical', 'architecture', 'art', 'traditional', 'ancient'],
  nature: ['hiking', 'beaches', 'mountains', 'nature', 'outdoors', 'parks', 'wildlife', 'scenery', 'landscape', 'trekking', 'trails'],
  adventure: ['adventure', 'extreme', 'sports', 'adrenaline', 'diving', 'surfing', 'climbing', 'bungee', 'rafting', 'kayaking'],
  relaxation: ['spa', 'wellness', 'relaxation', 'beach', 'resort', 'retreat', 'meditation', 'yoga', 'massage', 'tranquil'],
  nightlife: ['nightlife', 'bars', 'clubs', 'parties', 'dancing', 'nightclubs', 'pubs', 'entertainment'],
  shopping: ['shopping', 'markets', 'boutiques', 'malls', 'souvenirs', 'fashion', 'antiques', 'bazaar'],
  photography: ['photography', 'photos', 'instagram', 'scenic', 'views', 'photogenic', 'sunrise', 'sunset'],
};

/**
 * Constraint keywords with their types
 */
const CONSTRAINT_KEYWORDS: Record<string, { key: string; value: string }> = {
  // Budget
  'budget': { key: 'budget', value: 'budget' },
  'budget-friendly': { key: 'budget', value: 'budget' },
  'cheap': { key: 'budget', value: 'budget' },
  'affordable': { key: 'budget', value: 'moderate' },
  'moderate': { key: 'budget', value: 'moderate' },
  'mid-range': { key: 'budget', value: 'moderate' },
  'luxury': { key: 'budget', value: 'luxury' },
  'upscale': { key: 'budget', value: 'luxury' },
  'premium': { key: 'budget', value: 'luxury' },
  'splurge': { key: 'budget', value: 'luxury' },
  // Accessibility
  'wheelchair': { key: 'accessibility', value: 'wheelchair' },
  'accessible': { key: 'accessibility', value: 'required' },
  'disability': { key: 'accessibility', value: 'required' },
  'mobility': { key: 'accessibility', value: 'limited-mobility' },
  // Family
  'family-friendly': { key: 'travelStyle', value: 'family' },
  'with kids': { key: 'travelStyle', value: 'family' },
  'children': { key: 'travelStyle', value: 'family' },
  'family': { key: 'travelStyle', value: 'family' },
  'solo': { key: 'travelStyle', value: 'solo' },
  'couple': { key: 'travelStyle', value: 'couple' },
  'romantic': { key: 'travelStyle', value: 'couple' },
  'honeymoon': { key: 'travelStyle', value: 'couple' },
  'group': { key: 'travelStyle', value: 'group' },
  'friends': { key: 'travelStyle', value: 'group' },
  // Dietary
  'vegetarian': { key: 'dietary', value: 'vegetarian' },
  'vegan': { key: 'dietary', value: 'vegan' },
  'halal': { key: 'dietary', value: 'halal' },
  'kosher': { key: 'dietary', value: 'kosher' },
  'gluten-free': { key: 'dietary', value: 'gluten-free' },
};

/**
 * Common destination patterns - countries, regions, and major cities
 */
const DESTINATION_PATTERNS = [
  // Countries
  /\b(Japan|Thailand|Vietnam|Indonesia|Malaysia|Philippines|Singapore|Cambodia|Laos|Myanmar)\b/gi,
  /\b(Italy|France|Spain|Portugal|Greece|Germany|Netherlands|Switzerland|Austria|Belgium)\b/gi,
  /\b(Mexico|Costa Rica|Peru|Chile|Argentina|Brazil|Colombia|Ecuador)\b/gi,
  /\b(Morocco|Egypt|South Africa|Kenya|Tanzania)\b/gi,
  /\b(Australia|New Zealand)\b/gi,
  /\b(India|Nepal|Sri Lanka|Maldives)\b/gi,
  /\b(Turkey|Jordan|Israel|UAE|Dubai)\b/gi,
  /\b(Canada|USA|United States)\b/gi,
  /\b(UK|England|Scotland|Ireland|Wales)\b/gi,
  // Regions
  /\b(Southeast Asia|South Asia|East Asia|Europe|South America|Central America|Middle East|North Africa|East Africa|Oceania|Caribbean|Scandinavia|Balkans)\b/gi,
  // Major cities
  /\b(Tokyo|Kyoto|Osaka|Nara|Hiroshima|Sapporo)\b/gi,
  /\b(Bangkok|Chiang Mai|Phuket|Pattaya|Krabi)\b/gi,
  /\b(Bali|Jakarta|Yogyakarta|Ubud|Lombok)\b/gi,
  /\b(Paris|Lyon|Nice|Marseille|Bordeaux)\b/gi,
  /\b(Rome|Milan|Florence|Venice|Naples|Amalfi)\b/gi,
  /\b(Barcelona|Madrid|Seville|Valencia|Granada)\b/gi,
  /\b(London|Edinburgh|Manchester|Oxford|Cambridge)\b/gi,
  /\b(New York|Los Angeles|San Francisco|Chicago|Miami|Las Vegas|Seattle|Boston)\b/gi,
  /\b(Sydney|Melbourne|Brisbane|Perth|Auckland|Queenstown)\b/gi,
  /\b(Singapore|Hong Kong|Taipei|Seoul|Busan)\b/gi,
  /\b(Lisbon|Porto|Athens|Santorini|Mykonos)\b/gi,
  /\b(Amsterdam|Berlin|Munich|Vienna|Prague|Budapest|Krakow)\b/gi,
  /\b(Marrakech|Cairo|Cape Town|Nairobi)\b/gi,
  /\b(Mexico City|Cancun|Tulum|Playa del Carmen)\b/gi,
  /\b(Lima|Cusco|Machu Picchu|Buenos Aires|Rio de Janeiro|Cartagena)\b/gi,
];

// ============================================
// Main Extraction Function
// ============================================

/**
 * Extract session parameters from a refined prompt.
 *
 * Parses the input text to extract structured travel parameters including
 * destinations, dates, flexibility, interests, and constraints.
 *
 * @param refinedPrompt - The enhanced/refined prompt text
 * @returns Partial session parameters (not all fields required)
 *
 * @example
 * ```typescript
 * const params = await extractSessionParams(
 *   "Exploring Japan in April 2026, focusing on temples and food"
 * );
 * // Returns: {
 * //   destinations: ['Japan'],
 * //   dateRange: { start: '2026-04-01', end: '2026-04-30' },
 * //   interests: ['temples', 'food'],
 * //   inferredTags: ['asia', 'culture', 'food']
 * // }
 * ```
 */
export async function extractSessionParams(
  refinedPrompt: string
): Promise<PartialSessionParams> {
  const destinations = parseDestinations(refinedPrompt);
  const dateRange = parseDateRange(refinedPrompt);
  const flexibility = parseFlexibility(refinedPrompt);
  const interests = parseInterests(refinedPrompt);
  const constraints = parseConstraints(refinedPrompt);
  const inferredTags = inferTags(refinedPrompt, { destinations, interests });

  // Build result with only defined values
  const result: PartialSessionParams = {};

  if (destinations.length > 0) {
    result.destinations = destinations;
  }

  if (dateRange) {
    result.dateRange = dateRange;
  }

  if (flexibility) {
    result.flexibility = flexibility;
  }

  if (interests.length > 0) {
    result.interests = interests;
  }

  if (Object.keys(constraints).length > 0) {
    result.constraints = constraints;
  }

  if (inferredTags.length > 0) {
    result.inferredTags = inferredTags;
  }

  return result;
}

// ============================================
// Destination Parsing
// ============================================

/**
 * Parse destination names from text.
 *
 * Extracts location names including cities, regions, and countries.
 * Handles multiple destinations separated by "and", commas, or listed format.
 *
 * @param text - Text to parse for destinations
 * @returns Array of unique destination names
 *
 * @example
 * ```typescript
 * parseDestinations("Tokyo and Kyoto, Japan")
 * // Returns: ['Tokyo', 'Kyoto', 'Japan']
 *
 * parseDestinations("traveling through Southeast Asia")
 * // Returns: ['Southeast Asia']
 * ```
 */
export function parseDestinations(text: string): string[] {
  const destinations = new Set<string>();

  // Apply all destination patterns
  for (const pattern of DESTINATION_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        // Normalize case (Title Case)
        destinations.add(normalizeDestination(match));
      }
    }
  }

  // Handle "to [destination]" pattern
  const toPattern = /\bto\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g;
  let match;
  while ((match = toPattern.exec(text)) !== null) {
    const candidate = match[1];
    // Only add if it looks like a place name (starts with capital)
    if (candidate && !isCommonWord(candidate)) {
      destinations.add(normalizeDestination(candidate));
    }
  }

  // Handle "in [destination]" pattern for location context
  const inPattern = /\bin\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g;
  while ((match = inPattern.exec(text)) !== null) {
    const candidate = match[1];
    if (candidate && !isCommonWord(candidate) && !isMonthName(candidate)) {
      destinations.add(normalizeDestination(candidate));
    }
  }

  return Array.from(destinations);
}

/**
 * Normalize destination name to Title Case
 */
function normalizeDestination(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Check if a word is a common English word (not a place name)
 */
function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'for', 'with', 'about',
    'april', 'may', 'march', 'june', 'july', 'august', 'september',
    'october', 'november', 'december', 'january', 'february',
    'spring', 'summer', 'fall', 'autumn', 'winter',
    'early', 'late', 'mid', 'next', 'this',
    'nice', 'good', 'great', 'somewhere', 'anywhere', 'place', 'trip',
  ]);
  return commonWords.has(word.toLowerCase());
}

/**
 * Check if a string is a month name
 */
function isMonthName(text: string): boolean {
  return MONTH_MAP[text.toLowerCase()] !== undefined;
}

// ============================================
// Date Parsing
// ============================================

/**
 * Parse date range from text.
 *
 * Handles various date formats:
 * - Specific dates: "April 15, 2026"
 * - Date ranges: "April 1-14, 2026"
 * - Month only: "April 2026"
 * - Relative: "next spring", "this summer"
 * - Duration: "10 days in April"
 *
 * @param text - Text to parse for dates
 * @returns DateRange object or undefined if no dates found
 *
 * @example
 * ```typescript
 * parseDateRange("traveling in April 2026")
 * // Returns: { start: '2026-04-01', end: '2026-04-30' }
 *
 * parseDateRange("March 15-22, 2026")
 * // Returns: { start: '2026-03-15', end: '2026-03-22' }
 * ```
 */
export function parseDateRange(text: string): DateRange | undefined {
  const normalizedText = text.toLowerCase();

  // Try specific date range first: "April 1-14, 2026" or "April 1 - 14, 2026"
  const dateRangePattern = /(\w+)\s+(\d{1,2})\s*[-–]\s*(\d{1,2})(?:,?\s*(\d{4}))?/i;
  const dateRangeMatch = text.match(dateRangePattern);
  if (dateRangeMatch) {
    const [, monthStr, startDay, endDay, yearStr] = dateRangeMatch;
    const month = MONTH_MAP[monthStr.toLowerCase()];
    if (month) {
      const year = yearStr ? parseInt(yearStr, 10) : getDefaultYear();
      return {
        start: formatDate(year, month, parseInt(startDay, 10)),
        end: formatDate(year, month, parseInt(endDay, 10)),
      };
    }
  }

  // Try "Month Day, Year" format: "April 15, 2026" (must have a comma or 4-digit year after the day)
  const specificDatePattern = /(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4})|(?=\s+\d{4}))/i;
  const specificMatch = text.match(specificDatePattern);
  if (specificMatch) {
    const [, monthStr, dayStr, yearStr] = specificMatch;
    const month = MONTH_MAP[monthStr.toLowerCase()];
    if (month) {
      // Look for year after the match if not in group
      let year = yearStr ? parseInt(yearStr, 10) : getDefaultYear();
      const yearAfterMatch = text.match(new RegExp(specificMatch[0] + '\\s*(\\d{4})', 'i'));
      if (yearAfterMatch && yearAfterMatch[1]) {
        year = parseInt(yearAfterMatch[1], 10);
      }
      const day = parseInt(dayStr, 10);
      // Assume a 7-day trip for single date
      const startDate = new Date(year, month - 1, day);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);
      return {
        start: formatDate(year, month, day),
        end: formatDateFromDate(endDate),
      };
    }
  }

  // Try "Month Year" format: "April 2026" (month followed directly by 4-digit year)
  const monthYearPattern = /\b(\w+)\s+(\d{4})\b/i;
  const monthYearMatch = text.match(monthYearPattern);
  if (monthYearMatch) {
    const [, monthStr, yearStr] = monthYearMatch;
    const month = MONTH_MAP[monthStr.toLowerCase()];
    if (month) {
      const year = parseInt(yearStr, 10);
      return getMonthRange(year, month);
    }
  }

  // Try duration pattern: "10 days in April"
  const durationPattern = /(\d+)\s*(?:day|night)s?\s+in\s+(\w+)(?:\s*(\d{4}))?/i;
  const durationMatch = text.match(durationPattern);
  if (durationMatch) {
    const [, daysStr, monthStr, yearStr] = durationMatch;
    const month = MONTH_MAP[monthStr.toLowerCase()];
    if (month) {
      const year = yearStr ? parseInt(yearStr, 10) : getDefaultYear();
      const days = parseInt(daysStr, 10);
      // Start mid-month for flexibility
      const startDay = Math.max(1, Math.floor((getDaysInMonth(year, month) - days) / 2));
      const startDate = new Date(year, month - 1, startDay);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + days);
      return {
        start: formatDateFromDate(startDate),
        end: formatDateFromDate(endDate),
      };
    }
  }

  // Try month only: "in April" without year
  const monthOnlyPattern = /\bin\s+(\w+)\b/i;
  const monthOnlyMatch = text.match(monthOnlyPattern);
  if (monthOnlyMatch) {
    const month = MONTH_MAP[monthOnlyMatch[1].toLowerCase()];
    if (month) {
      const year = getDefaultYear();
      return getMonthRange(year, month);
    }
  }

  // Try season: "next spring", "this summer"
  const seasonPattern = /(?:next|this)?\s*(spring|summer|fall|autumn|winter)/i;
  const seasonMatch = normalizedText.match(seasonPattern);
  if (seasonMatch) {
    const season = seasonMatch[1].toLowerCase();
    const seasonData = SEASON_MAP[season];
    if (seasonData) {
      return getSeasonRange(seasonData);
    }
  }

  return undefined;
}

/**
 * Get default year (current year + 1 if we're past mid-year, else current year)
 */
function getDefaultYear(): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 0-indexed

  // If past October, default to next year
  return currentMonth >= 10 ? currentYear + 1 : currentYear;
}

/**
 * Format a date as ISO8601 date string (YYYY-MM-DD)
 */
function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Format a Date object as ISO8601 date string
 */
function formatDateFromDate(date: Date): string {
  return formatDate(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  );
}

/**
 * Get the number of days in a month
 */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Get date range for a full month
 */
function getMonthRange(year: number, month: number): DateRange {
  const lastDay = getDaysInMonth(year, month);
  return {
    start: formatDate(year, month, 1),
    end: formatDate(year, month, lastDay),
  };
}

/**
 * Get date range for a season
 */
function getSeasonRange(seasonData: { startMonth: number; endMonth: number }): DateRange {
  const year = getDefaultYear();
  const { startMonth, endMonth } = seasonData;

  // Handle winter spanning year boundary
  if (startMonth > endMonth) {
    return {
      start: formatDate(year, startMonth, 1),
      end: formatDate(year + 1, endMonth, getDaysInMonth(year + 1, endMonth)),
    };
  }

  return {
    start: formatDate(year, startMonth, 1),
    end: formatDate(year, endMonth, getDaysInMonth(year, endMonth)),
  };
}

// ============================================
// Flexibility Parsing
// ============================================

/**
 * Parse flexibility preference from text.
 *
 * Detects flexibility indicators and returns appropriate Flexibility type.
 *
 * @param text - Text to parse for flexibility
 * @returns Flexibility object or undefined if no flexibility mentioned
 *
 * @example
 * ```typescript
 * parseFlexibility("flexible dates")
 * // Returns: { type: 'plusMinusDays', days: 7 }
 *
 * parseFlexibility("plus or minus 3 days")
 * // Returns: { type: 'plusMinusDays', days: 3 }
 *
 * parseFlexibility("sometime in April")
 * // Returns: { type: 'monthOnly', month: '2026-04' }
 * ```
 */
export function parseFlexibility(text: string): Flexibility | undefined {
  const normalizedText = text.toLowerCase();

  // Check for explicit "+/- N days" pattern
  const plusMinusPattern = /(?:\+\/?-|plus\s*(?:or\s*)?minus|±)\s*(\d+)\s*days?/i;
  const plusMinusMatch = normalizedText.match(plusMinusPattern);
  if (plusMinusMatch) {
    const days = parseInt(plusMinusMatch[1], 10);
    return { type: 'plusMinusDays', days: Math.min(days, 30) };
  }

  // Check for "flexible by N days"
  const flexibleByPattern = /flexible\s+(?:by\s+)?(\d+)\s*days?/i;
  const flexibleByMatch = normalizedText.match(flexibleByPattern);
  if (flexibleByMatch) {
    const days = parseInt(flexibleByMatch[1], 10);
    return { type: 'plusMinusDays', days: Math.min(days, 30) };
  }

  // Check for "sometime in [month]" pattern
  const sometimePattern = /sometime\s+in\s+(\w+)(?:\s+(\d{4}))?/i;
  const sometimeMatch = text.match(sometimePattern);
  if (sometimeMatch) {
    const month = MONTH_MAP[sometimeMatch[1].toLowerCase()];
    if (month) {
      const year = sometimeMatch[2] ? parseInt(sometimeMatch[2], 10) : getDefaultYear();
      return {
        type: 'monthOnly',
        month: `${year}-${String(month).padStart(2, '0')}`,
      };
    }
  }

  // Check for "anytime in [month]" pattern
  const anytimePattern = /anytime\s+in\s+(\w+)(?:\s+(\d{4}))?/i;
  const anytimeMatch = text.match(anytimePattern);
  if (anytimeMatch) {
    const month = MONTH_MAP[anytimeMatch[1].toLowerCase()];
    if (month) {
      const year = anytimeMatch[2] ? parseInt(anytimeMatch[2], 10) : getDefaultYear();
      return {
        type: 'monthOnly',
        month: `${year}-${String(month).padStart(2, '0')}`,
      };
    }
  }

  // Check for general flexibility keywords
  const flexibleKeywords = ['flexible', 'flexibility', 'open dates', 'dates flexible', 'flexible dates', 'not fixed'];
  for (const keyword of flexibleKeywords) {
    if (normalizedText.includes(keyword)) {
      return { type: 'plusMinusDays', days: 7 }; // Default flexibility
    }
  }

  // Check for fixed date indicators (return 'none')
  const fixedKeywords = ['exact dates', 'fixed dates', 'specific dates', 'must be', 'has to be'];
  for (const keyword of fixedKeywords) {
    if (normalizedText.includes(keyword)) {
      return { type: 'none' };
    }
  }

  return undefined;
}

// ============================================
// Interest Parsing
// ============================================

/**
 * Parse interests and activities from text.
 *
 * Extracts activity keywords and normalizes them to common terms.
 *
 * @param text - Text to parse for interests
 * @returns Array of unique interest keywords
 *
 * @example
 * ```typescript
 * parseInterests("I want to visit temples and try local food")
 * // Returns: ['temples', 'food']
 *
 * parseInterests("looking for adventure and hiking")
 * // Returns: ['adventure', 'hiking']
 * ```
 */
export function parseInterests(text: string): string[] {
  const normalizedText = text.toLowerCase();
  const interests = new Set<string>();

  // Check each category for matching keywords
  for (const keywords of Object.values(INTEREST_CATEGORIES)) {
    for (const keyword of keywords) {
      // Use word boundary matching for single words
      if (keyword.includes(' ')) {
        // Multi-word phrase - simple includes
        if (normalizedText.includes(keyword)) {
          interests.add(keyword);
        }
      } else {
        // Single word - use regex for word boundary
        const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
        if (pattern.test(normalizedText)) {
          interests.add(keyword);
        }
      }
    }
  }

  // Also look for "focusing on X" or "interested in X" patterns
  const focusPattern = /(?:focusing on|interested in|love|enjoy|want to see|want to experience)\s+([^,.]+)/gi;
  let match;
  while ((match = focusPattern.exec(text)) !== null) {
    const phrase = match[1].trim().toLowerCase();
    // Split by "and" or commas
    const parts = phrase.split(/\s+and\s+|,\s*/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed && trimmed.length < 30) {
        interests.add(trimmed);
      }
    }
  }

  return Array.from(interests);
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================
// Constraint Parsing
// ============================================

/**
 * Parse constraints from text.
 *
 * Extracts budget, accessibility, dietary, and other constraints.
 *
 * @param text - Text to parse for constraints
 * @returns Record of constraint key-value pairs
 *
 * @example
 * ```typescript
 * parseConstraints("luxury trip with wheelchair accessibility")
 * // Returns: { budget: 'luxury', accessibility: 'wheelchair' }
 *
 * parseConstraints("budget-friendly vegetarian options needed")
 * // Returns: { budget: 'budget', dietary: 'vegetarian' }
 * ```
 */
export function parseConstraints(text: string): Record<string, unknown> {
  const normalizedText = text.toLowerCase();
  const constraints: Record<string, unknown> = {};

  // Check for constraint keywords
  for (const [keyword, config] of Object.entries(CONSTRAINT_KEYWORDS)) {
    if (normalizedText.includes(keyword.toLowerCase())) {
      constraints[config.key] = config.value;
    }
  }

  // Parse explicit budget amounts
  const budgetPattern = /\$\s*(\d+(?:,\d{3})*)\s*(?:per\s+day|\/day|daily)?/i;
  const budgetMatch = text.match(budgetPattern);
  if (budgetMatch) {
    const amount = parseInt(budgetMatch[1].replace(/,/g, ''), 10);
    constraints['budgetAmount'] = amount;
    constraints['budgetPeriod'] = budgetMatch[0].toLowerCase().includes('day') ? 'daily' : 'total';
  }

  // Parse trip duration preferences
  const durationPattern = /(\d+)\s*(?:day|night)s?(?:\s+trip)?/i;
  const durationMatch = text.match(durationPattern);
  if (durationMatch) {
    constraints['preferredDuration'] = parseInt(durationMatch[1], 10);
  }

  // Parse pace preference
  if (normalizedText.includes('slow pace') || normalizedText.includes('relaxed pace')) {
    constraints['pace'] = 'slow';
  } else if (normalizedText.includes('fast pace') || normalizedText.includes('packed itinerary')) {
    constraints['pace'] = 'fast';
  } else if (normalizedText.includes('moderate pace') || normalizedText.includes('balanced')) {
    constraints['pace'] = 'moderate';
  }

  return constraints;
}

// ============================================
// Tag Inference
// ============================================

/**
 * Infer tags from extracted data.
 *
 * Generates semantic tags based on destinations, interests, and text content.
 *
 * @param text - Original text
 * @param params - Extracted parameters
 * @returns Array of inferred tags
 */
function inferTags(
  text: string,
  params: { destinations: string[]; interests: string[] }
): string[] {
  const tags = new Set<string>();
  const normalizedText = text.toLowerCase();

  // Region tags based on destinations
  const regionMappings: Record<string, string[]> = {
    asia: ['Japan', 'Thailand', 'Vietnam', 'Indonesia', 'Malaysia', 'Philippines', 'Singapore', 'Cambodia', 'Laos', 'Myanmar', 'China', 'Korea', 'Taiwan', 'Hong Kong', 'India', 'Nepal', 'Sri Lanka', 'Tokyo', 'Kyoto', 'Bangkok', 'Bali', 'Southeast Asia', 'East Asia', 'South Asia'],
    europe: ['Italy', 'France', 'Spain', 'Portugal', 'Greece', 'Germany', 'Netherlands', 'Switzerland', 'Austria', 'Belgium', 'UK', 'England', 'Scotland', 'Ireland', 'Paris', 'Rome', 'London', 'Barcelona', 'Amsterdam', 'Prague', 'Vienna', 'Scandinavia', 'Balkans'],
    americas: ['Mexico', 'Costa Rica', 'Peru', 'Chile', 'Argentina', 'Brazil', 'Colombia', 'Ecuador', 'USA', 'Canada', 'South America', 'Central America', 'New York', 'Los Angeles', 'Miami'],
    oceania: ['Australia', 'New Zealand', 'Sydney', 'Melbourne', 'Auckland', 'Queenstown'],
    middleeast: ['Turkey', 'Jordan', 'Israel', 'UAE', 'Dubai', 'Morocco', 'Egypt'],
    africa: ['South Africa', 'Kenya', 'Tanzania', 'Cape Town', 'Nairobi', 'Morocco', 'Egypt', 'North Africa', 'East Africa'],
  };

  for (const [region, places] of Object.entries(regionMappings)) {
    for (const dest of params.destinations) {
      if (places.some(p => p.toLowerCase() === dest.toLowerCase())) {
        tags.add(region);
        break;
      }
    }
  }

  // Category tags based on interests
  for (const [category, keywords] of Object.entries(INTEREST_CATEGORIES)) {
    for (const interest of params.interests) {
      if (keywords.includes(interest.toLowerCase())) {
        tags.add(category);
        break;
      }
    }
  }

  // Season tags
  if (normalizedText.includes('cherry blossom') || normalizedText.includes('sakura')) {
    tags.add('spring');
    tags.add('photography');
  }
  if (normalizedText.includes('autumn leaves') || normalizedText.includes('fall foliage')) {
    tags.add('autumn');
    tags.add('photography');
  }
  for (const season of Object.keys(SEASON_MAP)) {
    if (normalizedText.includes(season)) {
      tags.add(season);
    }
  }

  // Experience type tags
  if (normalizedText.includes('off the beaten path') || normalizedText.includes('hidden gem')) {
    tags.add('offbeat');
  }
  if (normalizedText.includes('first time') || normalizedText.includes('never been')) {
    tags.add('first-visit');
  }
  if (normalizedText.includes('return') || normalizedText.includes('again')) {
    tags.add('returning');
  }
  if (normalizedText.includes('bucket list')) {
    tags.add('bucket-list');
  }

  // Trip style tags
  if (normalizedText.includes('honeymoon') || normalizedText.includes('romantic')) {
    tags.add('romantic');
  }
  if (normalizedText.includes('backpack')) {
    tags.add('backpacking');
  }

  return Array.from(tags);
}

// ============================================
// Exports
// ============================================

export {
  getDefaultYear,
  formatDate,
  formatDateFromDate,
  getDaysInMonth,
};
