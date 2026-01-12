/**
 * Perplexity Search Prompts
 *
 * Prompt templates for querying Perplexity's Sonar API for travel recommendations.
 * Perplexity returns grounded answers with citations, which we parse into Candidates.
 *
 * Design principles:
 * - Structured output format for reliable parsing
 * - Context-aware prompts that incorporate user intent
 * - Focus on actionable, specific recommendations
 * - Explicit citation requirements for sourceRefs
 *
 * @module workers/perplexity/prompts
 * @see PRD FR5.1 - Web Knowledge Worker
 */

import type { EnrichedIntent } from '../../schemas/worker.js';

// ============================================================================
// Recommendation Types
// ============================================================================

/**
 * Valid recommendation types that map to CandidateType
 * Used in prompts to guide Perplexity's output format
 */
export const RECOMMENDATION_TYPES = [
  'restaurant',
  'attraction',
  'activity',
  'neighborhood',
  'day trip',
  'experience',
] as const;

export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

// ============================================================================
// Search Prompt Builder
// ============================================================================

/**
 * Build a search prompt for Perplexity
 *
 * The prompt asks Perplexity to return structured recommendations that can be
 * parsed into Candidate objects. Key features:
 * - Includes destination and date context for seasonal relevance
 * - Incorporates user interests for personalization
 * - Requests specific fields that map to Candidate schema
 * - Asks for citations to populate sourceRefs
 *
 * @param query - The search query (usually from WorkerAssignment.queries)
 * @param intent - Enriched intent from the router stage
 * @returns Formatted prompt string for Perplexity API
 */
export function buildSearchPrompt(query: string, intent: EnrichedIntent): string {
  const destinations = intent.destinations.join(', ');
  const interests = intent.interests.join(', ');
  const dateRange = `${intent.dateRange.start} to ${intent.dateRange.end}`;
  const tags = intent.inferredTags.length > 0 ? intent.inferredTags.join(', ') : 'general travel';

  // Build constraints string if any exist
  const constraintEntries = Object.entries(intent.constraints);
  const constraintsText =
    constraintEntries.length > 0
      ? `\n- Constraints: ${constraintEntries.map(([k, v]) => `${k}: ${v}`).join(', ')}`
      : '';

  return `You are a travel research assistant. Find specific, actionable travel recommendations for: ${query}

Context:
- Destinations: ${destinations}
- Travel dates: ${dateRange}
- Interests: ${interests}
- Tags: ${tags}${constraintsText}

Requirements:
1. Provide 5-10 specific recommendations (places, activities, restaurants, experiences)
2. For each recommendation include:
   - Name of the place/activity
   - Type (restaurant, attraction, activity, neighborhood, day trip, experience)
   - Brief description (2-3 sentences)
   - Location (neighborhood/area within the city)
   - Why it matches the traveler's interests
3. Focus on authentic, local experiences over tourist traps
4. Include a mix of well-known and hidden gems
5. Cite your sources with links when possible

Format each recommendation as a numbered list with bold names:
1. **Place Name** - Brief description including what type it is (restaurant, attraction, activity, neighborhood, day trip, or experience), location within the city, and why it matches the traveler's interests. [cite sources]
2. **Next Place** - Description continues in the same format...`;
}

// ============================================================================
// Validation Prompt Builder
// ============================================================================

/**
 * Build a validation prompt for cross-checking recommendations
 *
 * Used to verify candidates from social sources (YouTube) or to confirm
 * details of web-derived candidates. Asks Perplexity to fact-check existence,
 * location, and operational status.
 *
 * @param placeName - Name of the place to validate
 * @param claimedLocation - Location claimed for the place
 * @returns Formatted validation prompt string
 */
export function buildValidationPrompt(placeName: string, claimedLocation: string): string {
  return `Verify this travel recommendation:

Place: ${placeName}
Claimed location: ${claimedLocation}

Please confirm:
1. Does this place exist?
2. Is the location correct?
3. Is it currently open/operational?
4. Any recent reviews or mentions?

Provide a brief verification with sources. If the place does not exist or has closed, state that clearly.`;
}

// ============================================================================
// Specialized Search Prompts
// ============================================================================

/**
 * Build a food-focused search prompt
 *
 * Specialized prompt for culinary recommendations that includes
 * cuisine preferences and dining context.
 *
 * @param query - The search query
 * @param intent - Enriched intent from the router stage
 * @param cuisineTypes - Optional array of cuisine preferences
 * @returns Formatted prompt for food recommendations
 */
export function buildFoodSearchPrompt(
  query: string,
  intent: EnrichedIntent,
  cuisineTypes?: string[]
): string {
  const destinations = intent.destinations.join(', ');
  const dateRange = `${intent.dateRange.start} to ${intent.dateRange.end}`;
  const cuisines = cuisineTypes?.join(', ') || 'local specialties';

  return `You are a culinary travel expert. Find the best food and dining recommendations for: ${query}

Context:
- Destinations: ${destinations}
- Travel dates: ${dateRange}
- Cuisine interests: ${cuisines}
- General interests: ${intent.interests.join(', ')}

Requirements:
1. Provide 5-10 specific restaurant and food recommendations
2. Include a variety: fine dining, casual, street food, markets, food tours
3. For each recommendation include:
   - Name of the restaurant/market/food experience
   - Type (restaurant, cafe, market, food tour, street food)
   - Cuisine type and signature dishes
   - Price range (budget, moderate, upscale)
   - Location (neighborhood)
   - Why it's notable (awards, history, local favorite, etc.)
4. Focus on places with strong local reputation
5. Cite your sources with links when possible

Format each recommendation clearly so it can be parsed.`;
}

/**
 * Build an activity-focused search prompt
 *
 * Specialized prompt for activities, tours, and experiences
 * that considers timing, physical requirements, and group dynamics.
 *
 * @param query - The search query
 * @param intent - Enriched intent from the router stage
 * @returns Formatted prompt for activity recommendations
 */
export function buildActivitySearchPrompt(query: string, intent: EnrichedIntent): string {
  const destinations = intent.destinations.join(', ');
  const dateRange = `${intent.dateRange.start} to ${intent.dateRange.end}`;
  const interests = intent.interests.join(', ');

  return `You are a travel activities expert. Find engaging activities and experiences for: ${query}

Context:
- Destinations: ${destinations}
- Travel dates: ${dateRange}
- Interests: ${interests}
- Tags: ${intent.inferredTags.join(', ')}

Requirements:
1. Provide 5-10 specific activities, tours, or experiences
2. Include a variety: walking tours, workshops, outdoor activities, cultural experiences
3. For each recommendation include:
   - Name of the activity/tour
   - Type (tour, workshop, outdoor activity, cultural experience, day trip)
   - Duration (hours or full day)
   - Brief description of what's included
   - Location or meeting point
   - Best time to do this activity
   - Why it matches the traveler's interests
4. Consider seasonality based on travel dates
5. Cite your sources with links when possible

Format each recommendation clearly so it can be parsed.`;
}

// ============================================================================
// System Prompts
// ============================================================================

/**
 * System prompt for Perplexity API calls
 *
 * Sets the context and behavior for Perplexity's responses.
 * Used as the system message in chat completions.
 */
export const PERPLEXITY_SYSTEM_PROMPT = `You are a knowledgeable travel research assistant with expertise in destinations worldwide. Your role is to provide accurate, specific, and actionable travel recommendations.

Key behaviors:
- Provide factual information backed by reliable sources
- Include specific names, addresses, and locations when available
- Consider seasonality and timing in your recommendations
- Balance popular attractions with lesser-known local favorites
- Always cite your sources when making specific claims
- If you're uncertain about something, say so

Format your responses in a clear, structured way that can be easily parsed.`;

/**
 * System prompt for validation queries
 *
 * Used when cross-checking existing recommendations.
 */
export const VALIDATION_SYSTEM_PROMPT = `You are a fact-checking assistant specializing in travel information. Your role is to verify the accuracy of travel recommendations.

Key behaviors:
- Verify that places exist and are correctly located
- Check if businesses are currently operational
- Look for recent reviews or mentions
- Identify any conflicts or outdated information
- Be explicit when you cannot verify something
- Always cite your sources`;
