/**
 * Intent Enrichment Module
 *
 * Transforms a Session into an EnrichedIntent by enriching the user's
 * travel intent with inferred tags and expanded constraints. This is
 * Stage 02 (Router) of the pipeline.
 *
 * @module router/intent
 * @see PRD Section FR2 - Router Stage
 */

import type { Session } from '../schemas/session.js';
import type { EnrichedIntent } from '../schemas/worker.js';
import type { DateRange } from '../schemas/common.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Month number to name mapping (1-indexed)
 */
const MONTH_NAMES: readonly string[] = [
  '', // 0 index placeholder
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

/**
 * Season definitions by month range
 */
const SEASONS: Record<string, { months: readonly number[]; name: string }> = {
  winter: { months: [12, 1, 2], name: 'winter' },
  spring: { months: [3, 4, 5], name: 'spring' },
  summer: { months: [6, 7, 8], name: 'summer' },
  fall: { months: [9, 10, 11], name: 'fall' },
};

/**
 * Holiday season date ranges (month-day)
 */
const HOLIDAY_SEASON = {
  start: { month: 12, day: 15 },
  end: { month: 1, day: 5 },
};

/**
 * Summer peak months
 */
const SUMMER_PEAK_MONTHS = [6, 7, 8];

/**
 * Region mappings: destination keywords to region tags
 */
const REGION_MAPPINGS: Record<string, readonly string[]> = {
  // Asia regions
  'asia': [
    'japan', 'tokyo', 'kyoto', 'osaka', 'nara', 'hiroshima', 'sapporo',
    'china', 'beijing', 'shanghai', 'hong kong', 'macau',
    'korea', 'south korea', 'seoul', 'busan',
    'taiwan', 'taipei',
  ],
  'east-asia': [
    'japan', 'tokyo', 'kyoto', 'osaka', 'china', 'beijing', 'shanghai',
    'hong kong', 'korea', 'south korea', 'seoul', 'taiwan', 'taipei',
  ],
  'southeast-asia': [
    'thailand', 'bangkok', 'chiang mai', 'phuket', 'krabi',
    'vietnam', 'hanoi', 'ho chi minh', 'saigon',
    'indonesia', 'bali', 'jakarta', 'ubud', 'lombok',
    'malaysia', 'kuala lumpur', 'langkawi', 'penang',
    'singapore', 'philippines', 'manila', 'cebu', 'palawan',
    'cambodia', 'siem reap', 'phnom penh',
    'laos', 'luang prabang', 'myanmar', 'yangon',
  ],
  'south-asia': [
    'india', 'delhi', 'mumbai', 'goa', 'jaipur', 'varanasi',
    'nepal', 'kathmandu', 'sri lanka', 'colombo', 'maldives',
  ],
  // Europe regions
  'europe': [
    'france', 'paris', 'nice', 'lyon', 'bordeaux', 'marseille',
    'italy', 'rome', 'milan', 'florence', 'venice', 'naples', 'amalfi',
    'spain', 'barcelona', 'madrid', 'seville', 'valencia', 'granada',
    'portugal', 'lisbon', 'porto',
    'greece', 'athens', 'santorini', 'mykonos', 'crete',
    'germany', 'berlin', 'munich', 'frankfurt',
    'netherlands', 'amsterdam', 'rotterdam',
    'switzerland', 'zurich', 'geneva', 'lucerne',
    'austria', 'vienna', 'salzburg',
    'uk', 'england', 'london', 'scotland', 'edinburgh', 'ireland', 'dublin',
    'czech republic', 'prague', 'hungary', 'budapest', 'poland', 'krakow',
    'croatia', 'dubrovnik', 'split',
  ],
  'western-europe': [
    'france', 'paris', 'germany', 'berlin', 'netherlands', 'amsterdam',
    'belgium', 'brussels', 'switzerland', 'austria', 'vienna',
  ],
  'southern-europe': [
    'italy', 'rome', 'spain', 'barcelona', 'portugal', 'lisbon', 'greece', 'athens',
  ],
  'scandinavia': [
    'norway', 'oslo', 'sweden', 'stockholm', 'denmark', 'copenhagen',
    'finland', 'helsinki', 'iceland', 'reykjavik',
  ],
  // Americas regions
  'north-america': [
    'usa', 'united states', 'new york', 'los angeles', 'san francisco',
    'chicago', 'miami', 'las vegas', 'seattle', 'boston',
    'canada', 'toronto', 'vancouver', 'montreal',
  ],
  'central-america': [
    'mexico', 'mexico city', 'cancun', 'tulum', 'playa del carmen',
    'costa rica', 'guatemala', 'belize', 'panama', 'honduras', 'nicaragua',
  ],
  'south-america': [
    'brazil', 'rio de janeiro', 'sao paulo', 'argentina', 'buenos aires',
    'peru', 'lima', 'cusco', 'machu picchu', 'colombia', 'bogota', 'cartagena',
    'chile', 'santiago', 'ecuador', 'quito', 'galapagos',
  ],
  'caribbean': [
    'jamaica', 'bahamas', 'cuba', 'havana', 'puerto rico', 'dominican republic',
    'aruba', 'barbados', 'st lucia', 'virgin islands',
  ],
  // Other regions
  'oceania': [
    'australia', 'sydney', 'melbourne', 'brisbane', 'perth', 'cairns',
    'new zealand', 'auckland', 'queenstown', 'wellington', 'fiji',
  ],
  'middle-east': [
    'uae', 'dubai', 'abu dhabi', 'israel', 'tel aviv', 'jerusalem',
    'jordan', 'amman', 'petra', 'turkey', 'istanbul', 'cappadocia',
    'qatar', 'doha', 'oman', 'muscat', 'bahrain',
  ],
  'africa': [
    'south africa', 'cape town', 'johannesburg', 'safari',
    'kenya', 'nairobi', 'tanzania', 'zanzibar', 'serengeti',
    'morocco', 'marrakech', 'fez', 'casablanca',
    'egypt', 'cairo', 'luxor',
  ],
};

/**
 * Major cities (metropolitan/urban tags)
 */
const MAJOR_CITIES: readonly string[] = [
  'tokyo', 'new york', 'london', 'paris', 'los angeles', 'chicago',
  'hong kong', 'singapore', 'sydney', 'dubai', 'shanghai', 'beijing',
  'seoul', 'bangkok', 'barcelona', 'rome', 'berlin', 'amsterdam',
  'toronto', 'melbourne', 'san francisco', 'miami', 'madrid', 'milan',
  'osaka', 'mumbai', 'delhi', 'istanbul', 'moscow', 'buenos aires',
];

/**
 * Interest to tag mappings
 */
const INTEREST_TAG_MAPPINGS: Record<string, readonly string[]> = {
  // Food/culinary
  food: ['culinary', 'foodie'],
  culinary: ['culinary', 'foodie'],
  restaurants: ['culinary', 'foodie'],
  'street food': ['culinary', 'foodie', 'local'],
  cuisine: ['culinary', 'foodie'],
  dining: ['culinary'],
  gastronomy: ['culinary', 'foodie'],
  // Outdoor/nature
  hiking: ['outdoor', 'nature', 'active'],
  trekking: ['outdoor', 'nature', 'active'],
  mountains: ['outdoor', 'nature', 'scenic'],
  nature: ['outdoor', 'nature'],
  outdoors: ['outdoor', 'nature'],
  beaches: ['beach', 'relaxation'],
  beach: ['beach', 'relaxation'],
  // Cultural/historical
  history: ['cultural', 'heritage'],
  historical: ['cultural', 'heritage'],
  museums: ['cultural', 'heritage'],
  temples: ['cultural', 'heritage', 'spiritual'],
  shrines: ['cultural', 'heritage', 'spiritual'],
  architecture: ['cultural', 'heritage'],
  art: ['cultural', 'artistic'],
  // Adventure
  adventure: ['adventure', 'active'],
  diving: ['adventure', 'water-sports'],
  surfing: ['adventure', 'water-sports', 'beach'],
  snorkeling: ['adventure', 'water-sports'],
  // Relaxation
  spa: ['relaxation', 'wellness'],
  wellness: ['relaxation', 'wellness'],
  relaxation: ['relaxation'],
  // Nightlife/entertainment
  nightlife: ['nightlife', 'entertainment'],
  bars: ['nightlife'],
  clubs: ['nightlife'],
  // Shopping
  shopping: ['shopping'],
  markets: ['shopping', 'local'],
  // Photography
  photography: ['photography', 'scenic'],
  scenic: ['photography', 'scenic'],
};

/**
 * Budget levels to tags
 */
const BUDGET_TAG_MAPPINGS: Record<string, readonly string[]> = {
  low: ['budget-friendly', 'economical'],
  budget: ['budget-friendly', 'economical'],
  moderate: ['mid-range'],
  medium: ['mid-range'],
  high: ['luxury', 'premium'],
  luxury: ['luxury', 'premium'],
};

/**
 * Price range mapping
 */
const BUDGET_PRICE_RANGES: Record<string, string> = {
  low: '$-$$',
  budget: '$-$$',
  moderate: '$$-$$$',
  medium: '$$-$$$',
  high: '$$$-$$$$',
  luxury: '$$$$',
};

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Enrich a session into an EnrichedIntent with inferred tags.
 *
 * Transforms the session's travel intent by:
 * - Copying destinations, dateRange, flexibility, interests
 * - Expanding constraints with inferred values
 * - Generating contextual tags from the session data
 *
 * @param session - The session to enrich
 * @returns EnrichedIntent ready for worker dispatch
 *
 * @example
 * ```typescript
 * const session = {
 *   destinations: ['Tokyo', 'Kyoto'],
 *   dateRange: { start: '2026-04-01', end: '2026-04-14' },
 *   flexibility: { type: 'plusMinusDays', days: 3 },
 *   interests: ['food', 'temples', 'hiking'],
 *   constraints: { budget: 'moderate' },
 *   // ... other session fields
 * };
 *
 * const enriched = enrichIntent(session);
 * // enriched.inferredTags includes: ['asia', 'east-asia', 'spring', 'april',
 * //   'week-trip', 'culinary', 'foodie', 'cultural', 'heritage', 'outdoor',
 * //   'nature', 'mid-range']
 * ```
 */
export function enrichIntent(session: Session): EnrichedIntent {
  return {
    destinations: session.destinations,
    dateRange: session.dateRange,
    flexibility: session.flexibility,
    interests: session.interests,
    constraints: expandConstraints(session.constraints),
    inferredTags: inferTags(session),
  };
}

/**
 * Infer contextual tags from session data.
 *
 * Generates tags based on:
 * - **Temporal**: season, month, duration, special periods (holiday, summer peak)
 * - **Destination**: region hints, city type (urban/metropolitan)
 * - **Interests**: mapped to broader categories (food -> culinary, hiking -> outdoor)
 * - **Constraints**: budget level, family-friendly, accessibility
 *
 * @param session - The session to analyze
 * @returns Array of unique inferred tags
 *
 * @example
 * ```typescript
 * const tags = inferTags({
 *   destinations: ['Japan', 'Tokyo'],
 *   dateRange: { start: '2026-12-20', end: '2026-12-30' },
 *   interests: ['food', 'history'],
 *   constraints: { budget: 'high', familyFriendly: true },
 *   // ... other fields
 * });
 * // Returns: ['asia', 'east-asia', 'urban', 'metropolitan', 'winter',
 * //   'december', 'week-trip', 'holiday-season', 'culinary', 'foodie',
 * //   'cultural', 'heritage', 'luxury', 'premium', 'family', 'kid-friendly']
 * ```
 */
export function inferTags(session: Session): string[] {
  const tags: string[] = [];

  // Temporal tags from date range
  const temporalTags = inferTemporalTags(session.dateRange);
  tags.push(...temporalTags);

  // Destination-based tags
  const destinationTags = inferDestinationTags(session.destinations);
  tags.push(...destinationTags);

  // Interest-based tags
  const interestTags = inferInterestTags(session.interests);
  tags.push(...interestTags);

  // Constraint-based tags
  const constraintTags = inferConstraintTags(session.constraints);
  tags.push(...constraintTags);

  // Return unique tags, sorted for deterministic output
  return [...new Set(tags)].sort();
}

/**
 * Expand shorthand constraints into fuller specifications.
 *
 * Adds derived fields based on constraint values:
 * - budget level -> priceRange
 * - familyFriendly -> ageAppropriate
 *
 * @param constraints - Original constraints from session
 * @returns Expanded constraints object
 *
 * @example
 * ```typescript
 * expandConstraints({ budget: 'low', familyFriendly: true })
 * // Returns: {
 * //   budget: 'low',
 * //   priceRange: '$-$$',
 * //   familyFriendly: true,
 * //   ageAppropriate: 'all-ages'
 * // }
 * ```
 */
export function expandConstraints(
  constraints: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!constraints) {
    return {};
  }

  const expanded: Record<string, unknown> = { ...constraints };

  // Expand budget to price range
  const budget = constraints['budget'];
  if (typeof budget === 'string' && budget in BUDGET_PRICE_RANGES) {
    expanded['priceRange'] = BUDGET_PRICE_RANGES[budget];
  }

  // Expand familyFriendly to age appropriate
  if (constraints['familyFriendly'] === true) {
    expanded['ageAppropriate'] = 'all-ages';
  }

  // Expand accessibility with additional context
  if (constraints['accessibility'] === true || constraints['accessibility'] === 'required') {
    expanded['mobilityRequirements'] = 'wheelchair-accessible';
  }

  // Expand dietary restrictions
  const dietary = constraints['dietary'];
  if (typeof dietary === 'string') {
    expanded['dietaryRestrictions'] = [dietary];
  } else if (Array.isArray(dietary)) {
    expanded['dietaryRestrictions'] = dietary;
  }

  return expanded;
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * Infer temporal tags from date range
 */
function inferTemporalTags(dateRange: DateRange): string[] {
  const tags: string[] = [];

  const startDate = new Date(dateRange.start);
  const endDate = new Date(dateRange.end);

  const startMonth = startDate.getMonth() + 1; // 1-indexed
  const startDay = startDate.getDate();
  const endMonth = endDate.getMonth() + 1;
  const endDay = endDate.getDate();

  // Season tag (based on start date)
  const season = getSeasonForMonth(startMonth);
  if (season) {
    tags.push(season);
  }

  // Month tag
  const monthName = MONTH_NAMES[startMonth];
  if (monthName) {
    tags.push(monthName);
  }

  // If trip spans multiple months, add end month too
  if (endMonth !== startMonth) {
    const endMonthName = MONTH_NAMES[endMonth];
    if (endMonthName) {
      tags.push(endMonthName);
    }
  }

  // Duration tag
  const durationDays = calculateDurationDays(startDate, endDate);
  const durationTag = getDurationTag(durationDays);
  if (durationTag) {
    tags.push(durationTag);
  }

  // Special timing tags
  if (isHolidaySeason(startMonth, startDay, endMonth, endDay)) {
    tags.push('holiday-season');
  }

  if (isSummerPeak(startMonth, endMonth)) {
    tags.push('summer-peak');
  }

  return tags;
}

/**
 * Get season name for a month
 */
function getSeasonForMonth(month: number): string | undefined {
  for (const [, seasonData] of Object.entries(SEASONS)) {
    if (seasonData.months.includes(month)) {
      return seasonData.name;
    }
  }
  return undefined;
}

/**
 * Calculate duration in days between two dates
 */
function calculateDurationDays(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((end.getTime() - start.getTime()) / msPerDay) + 1;
}

/**
 * Get duration tag based on number of days
 */
function getDurationTag(days: number): string | undefined {
  if (days < 4) {
    return 'weekend-trip';
  } else if (days <= 8) {
    return 'week-trip';
  } else {
    return 'extended-stay';
  }
}

/**
 * Check if dates fall within holiday season (Dec 15 - Jan 5)
 */
function isHolidaySeason(
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number
): boolean {
  // Check if start or end falls in holiday season
  const startInHoliday =
    (startMonth === 12 && startDay >= HOLIDAY_SEASON.start.day) ||
    (startMonth === 1 && startDay <= HOLIDAY_SEASON.end.day);

  const endInHoliday =
    (endMonth === 12 && endDay >= HOLIDAY_SEASON.start.day) ||
    (endMonth === 1 && endDay <= HOLIDAY_SEASON.end.day);

  // Also check if trip spans the holiday season
  const spansHoliday =
    (startMonth === 12 && endMonth === 1) ||
    (startMonth < 12 && endMonth === 1) ||
    (startMonth === 12 && endMonth > 1);

  return startInHoliday || endInHoliday || spansHoliday;
}

/**
 * Check if dates fall within summer peak (Jun-Aug)
 */
function isSummerPeak(startMonth: number, endMonth: number): boolean {
  return (
    SUMMER_PEAK_MONTHS.includes(startMonth) ||
    SUMMER_PEAK_MONTHS.includes(endMonth)
  );
}

/**
 * Infer destination-based tags
 */
function inferDestinationTags(destinations: string[]): string[] {
  const tags: string[] = [];
  const normalizedDestinations = destinations.map(d => d.toLowerCase());

  // Region tags
  for (const [region, places] of Object.entries(REGION_MAPPINGS)) {
    for (const dest of normalizedDestinations) {
      if (places.some(place => dest.includes(place) || place.includes(dest))) {
        tags.push(region);
        break;
      }
    }
  }

  // Urban/metropolitan tags for major cities
  for (const dest of normalizedDestinations) {
    if (MAJOR_CITIES.some(city => dest.includes(city) || city.includes(dest))) {
      tags.push('urban');
      tags.push('metropolitan');
      break;
    }
  }

  return tags;
}

/**
 * Infer interest-based tags
 */
function inferInterestTags(interests: string[]): string[] {
  const tags: string[] = [];

  for (const interest of interests) {
    const normalizedInterest = interest.toLowerCase();

    // Check for exact match
    if (normalizedInterest in INTEREST_TAG_MAPPINGS) {
      tags.push(...INTEREST_TAG_MAPPINGS[normalizedInterest]);
    }

    // Check for partial matches
    for (const [keyword, mappedTags] of Object.entries(INTEREST_TAG_MAPPINGS)) {
      if (
        normalizedInterest.includes(keyword) ||
        keyword.includes(normalizedInterest)
      ) {
        tags.push(...mappedTags);
      }
    }
  }

  return tags;
}

/**
 * Infer constraint-based tags
 */
function inferConstraintTags(
  constraints: Record<string, unknown> | undefined
): string[] {
  if (!constraints) {
    return [];
  }

  const tags: string[] = [];

  // Budget tags
  const budget = constraints['budget'];
  if (typeof budget === 'string') {
    const budgetLower = budget.toLowerCase();
    if (budgetLower in BUDGET_TAG_MAPPINGS) {
      tags.push(...BUDGET_TAG_MAPPINGS[budgetLower]);
    }
  }

  // Family-friendly tags
  if (constraints['familyFriendly'] === true) {
    tags.push('family');
    tags.push('kid-friendly');
  }

  // Travel style tags
  const travelStyle = constraints['travelStyle'];
  if (typeof travelStyle === 'string') {
    const styleLower = travelStyle.toLowerCase();
    if (styleLower === 'family') {
      tags.push('family');
      tags.push('kid-friendly');
    } else if (styleLower === 'couple' || styleLower === 'romantic') {
      tags.push('romantic');
      tags.push('couples');
    } else if (styleLower === 'solo') {
      tags.push('solo-travel');
    } else if (styleLower === 'group') {
      tags.push('group-travel');
    }
  }

  // Accessibility tags
  if (
    constraints['accessibility'] === true ||
    constraints['accessibility'] === 'required' ||
    typeof constraints['accessibility'] === 'string'
  ) {
    tags.push('accessible');
  }

  // Pace tags
  const pace = constraints['pace'];
  if (typeof pace === 'string') {
    const paceLower = pace.toLowerCase();
    if (paceLower === 'slow' || paceLower === 'relaxed') {
      tags.push('relaxed-pace');
    } else if (paceLower === 'fast' || paceLower === 'packed') {
      tags.push('fast-paced');
    }
  }

  return tags;
}
