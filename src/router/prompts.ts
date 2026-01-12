/**
 * Router Prompt Templates
 *
 * Generates prompts for the LLM router that analyzes session intent
 * and produces a WorkerPlan for the pipeline workers.
 *
 * @module router/prompts
 * @see PRD Section 5.2 - Router Stage (02)
 */

import type { Session } from '../schemas/session.js';

/**
 * Worker capability descriptions for the router prompt.
 *
 * These descriptions inform the LLM router about each worker's strengths
 * so it can distribute queries appropriately.
 *
 * TODO(Section-8.0): When the Worker Framework is implemented, refactor to
 * source these capabilities from the centralized worker registry instead of
 * hardcoding them here. This will prevent duplication and ensure consistency
 * across the codebase.
 * @see docs/phase_0_prd_unified.md Section 8.0 - Worker Framework
 * @see src/workers/registry.ts (future implementation)
 */
const WORKER_CAPABILITIES: Record<string, string> = {
  perplexity:
    'Web knowledge worker - searches travel blogs, recent articles, expert recommendations, and web content. Best for finding hidden gems, local tips, seasonal advice, and comprehensive travel guides.',
  places:
    'Google Places API worker - searches for POIs, restaurants, attractions, hotels, and verified business listings. Best for finding specific venues with ratings, reviews, addresses, and opening hours.',
  youtube:
    'YouTube worker - searches travel vlogs, local recommendations, and video content. Best for finding visual travel guides, personal experiences, walking tours, and authentic local perspectives.',
};

/**
 * Build the router prompt for LLM-based worker plan generation
 *
 * The prompt instructs the LLM to analyze the session and produce a WorkerPlan
 * that distributes queries across available workers based on their strengths.
 *
 * @param session - The session containing user's travel intent
 * @param availableWorkers - List of available worker IDs (e.g., ["perplexity", "places", "youtube"])
 * @returns Formatted prompt string for the LLM
 *
 * @example
 * ```typescript
 * const prompt = buildRouterPrompt(session, ['perplexity', 'places', 'youtube']);
 * const result = await callGoogleAIJson(prompt, 'router');
 * ```
 */
export function buildRouterPrompt(session: Session, availableWorkers: string[]): string {
  // Build worker capabilities section
  const workerDescriptions = availableWorkers
    .map((workerId) => {
      const capability = WORKER_CAPABILITIES[workerId] || `${workerId} worker - custom data source`;
      return `- **${workerId}**: ${capability}`;
    })
    .join('\n');

  // Format session data for the prompt
  const sessionContext = `
## Session Information

- **Session ID**: ${session.sessionId}
- **Title**: ${session.title}
- **Destinations**: ${session.destinations.join(', ')}
- **Date Range**: ${session.dateRange.start} to ${session.dateRange.end}
- **Flexibility**: ${formatFlexibility(session.flexibility)}
- **Interests**: ${session.interests.join(', ')}
${session.constraints ? `- **Constraints**: ${JSON.stringify(session.constraints)}` : ''}
`;

  return `You are a travel discovery router. Your job is to analyze a user's travel session and create an optimized WorkerPlan that distributes queries across available data workers.

${sessionContext}

## Available Workers

${workerDescriptions}

## Your Task

Analyze the session and produce a WorkerPlan JSON object with the following structure:

### 1. EnrichedIntent
Expand and enrich the user's travel intent with inferred context:
- **destinations**: Copy from session
- **dateRange**: Copy from session (start and end dates)
- **flexibility**: Copy from session
- **interests**: Copy from session
- **constraints**: Copy from session (or empty object if none)
- **inferredTags**: Array of 3-8 relevant tags you infer from the context. Examples:
  - Season tags: "summer-travel", "winter-destination", "shoulder-season"
  - Trip type: "family-trip", "solo-travel", "romantic-getaway", "backpacking"
  - Budget level: "budget-friendly", "mid-range", "luxury"
  - Activity focus: "foodie", "adventure-sports", "cultural-immersion", "beach-relaxation"
  - Special interests: "photography-spots", "off-the-beaten-path", "local-experiences"

### 2. Workers Array
For each available worker, create an assignment with:
- **workerId**: The worker identifier
- **queries**: Array of 3 search queries tailored to that worker's strengths
- **maxResults**: Number between 10-20 (recommend 15)
- **timeout**: Timeout in milliseconds (recommend 30000)

Query guidelines per worker:
- **perplexity**: Use natural language queries like "best hidden restaurants in [destination]", "local tips for visiting [destination] in [month]", combine destinations with interests
- **places**: Use search terms like "[interest] in [destination]", "[destination] restaurants", focus on specific POI types
- **youtube**: Use video-friendly queries like "[destination] travel vlog 2024", "things to do in [destination]", "[destination] local food tour"

### 3. ValidationPlan
Specify how to validate social-derived candidates:
- **validateTopN**: Number of top candidates to validate (recommend 5)
- **origins**: Array of origins to prioritize for validation (typically ["youtube"])

## Output Format

Return a valid JSON object matching this exact structure:

\`\`\`json
{
  "enrichedIntent": {
    "destinations": ["destination1", "destination2"],
    "dateRange": {
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD"
    },
    "flexibility": { "type": "none" },
    "interests": ["interest1", "interest2"],
    "constraints": {},
    "inferredTags": ["tag1", "tag2", "tag3"]
  },
  "workers": [
    {
      "workerId": "perplexity",
      "queries": ["query1", "query2", "query3"],
      "maxResults": 15,
      "timeout": 30000
    }
  ],
  "validationPlan": {
    "validateTopN": 5,
    "origins": ["youtube"]
  }
}
\`\`\`

## Important Rules

1. Only include workers from the available workers list: [${availableWorkers.join(', ')}]
2. Each worker must have exactly 3 queries
3. Queries should be specific to the destination(s) and interests
4. Make queries diverse - don't repeat the same search with minor variations
5. Combine multiple interests into single queries where appropriate
6. Consider the travel dates when crafting queries (seasonal activities, events)
7. Return ONLY the JSON object, no additional text

Now analyze the session and generate the WorkerPlan:`;
}

/**
 * Format flexibility for human-readable display in the prompt
 */
function formatFlexibility(flexibility: Session['flexibility']): string {
  switch (flexibility.type) {
    case 'none':
      return 'Fixed dates';
    case 'plusMinusDays':
      return `Flexible +/- ${flexibility.days} days`;
    case 'monthOnly':
      return `Flexible within ${flexibility.month}`;
    default:
      return 'Unknown flexibility';
  }
}

export { WORKER_CAPABILITIES };
