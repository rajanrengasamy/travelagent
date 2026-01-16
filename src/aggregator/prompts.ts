/**
 * Aggregator Prompts
 *
 * Prompt templates for the narrative generation aggregator.
 * Uses GPT-5.2 to generate rich, engaging travel narratives
 * from validated candidate data.
 *
 * @module aggregator/prompts
 * @see PRD Section 14.5 - Aggregator
 * @see TODO Section 17.1 - Create aggregator prompts
 */

import type { Candidate } from '../schemas/candidate.js';

// ============================================================================
// System Prompt
// ============================================================================

/**
 * System prompt for the aggregator LLM.
 *
 * Sets the context and role for narrative generation.
 *
 * @see TODO Section 17.1.1 - Create AGGREGATOR_PROMPT template for narrative generation
 */
export const AGGREGATOR_SYSTEM_PROMPT = `You are an expert travel curator and writer. Your task is to synthesize travel discovery data into engaging, personalized narratives.

Your responses should:
1. Be enthusiastic but authentic - avoid clichés and over-the-top language
2. Organize discoveries logically by theme, location, or experience type
3. Highlight what makes each place unique and why it's worth visiting
4. Provide actionable insights (best times to visit, insider tips)
5. Balance popular spots with hidden gems

You receive structured candidate data and must return a JSON narrative structure.`;

// ============================================================================
// User Prompt Template
// ============================================================================

/**
 * Build the user prompt for narrative generation.
 *
 * @see TODO Section 17.1.2 - Include candidate data, session context, and output format instructions
 *
 * @param candidates - Validated and ranked candidates
 * @param sessionContext - Optional context about the user's search
 * @returns Formatted user prompt
 */
export function buildAggregatorPrompt(
  candidates: Candidate[],
  sessionContext?: {
    destination?: string;
    travelDates?: string;
    interests?: string[];
    budget?: string;
  }
): string {
  // Format candidates for the prompt
  const candidateList = candidates
    .map((c, i) => formatCandidate(c, i + 1))
    .join('\n\n');

  // Build context section if available
  const contextSection = sessionContext
    ? `
## Session Context
${sessionContext.destination ? `- Destination: ${sessionContext.destination}` : ''}
${sessionContext.travelDates ? `- Travel Dates: ${sessionContext.travelDates}` : ''}
${sessionContext.interests?.length ? `- Interests: ${sessionContext.interests.join(', ')}` : ''}
${sessionContext.budget ? `- Budget: ${sessionContext.budget}` : ''}
`
    : '';

  return `${contextSection}
## Discovered Places and Experiences

${candidateList}

---

## Your Task

Create an engaging travel narrative from these discoveries. You must respond with valid JSON in exactly this format:

\`\`\`json
{
  "introduction": "A welcoming paragraph setting the scene for the trip...",
  "sections": [
    {
      "heading": "Section Title",
      "content": "Narrative content for this section...",
      "candidateIds": ["candidate-id-1", "candidate-id-2"]
    }
  ],
  "highlights": [
    {
      "title": "Highlight Title",
      "description": "Brief description...",
      "candidateId": "optional-candidate-id",
      "type": "must_see|local_favorite|unique_experience|budget_friendly|luxury"
    }
  ],
  "recommendations": [
    {
      "text": "Recommendation text...",
      "reasoning": "Why this is recommended...",
      "candidateIds": ["candidate-id"],
      "priority": "high|medium|low"
    }
  ],
  "conclusion": "Optional closing thoughts..."
}
\`\`\`

Guidelines:
- Create 2-4 thematic sections (e.g., "Food & Dining", "Hidden Gems", "Must-See Attractions")
- Extract 3-5 highlights that stand out
- Provide 2-4 personalized recommendations
- Reference candidates by their candidateId
- Write in an engaging, helpful tone
- Keep the narrative concise but informative`;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a single candidate for inclusion in the prompt.
 */
function formatCandidate(candidate: Candidate, index: number): string {
  const parts: string[] = [
    `### ${index}. ${candidate.title}`,
    `**ID**: ${candidate.candidateId}`,
    `**Type**: ${candidate.type}`,
    `**Summary**: ${candidate.summary}`,
  ];

  if (candidate.locationText) {
    parts.push(`**Location**: ${candidate.locationText}`);
  }

  if (candidate.tags.length > 0) {
    parts.push(`**Tags**: ${candidate.tags.join(', ')}`);
  }

  parts.push(`**Score**: ${candidate.score}/100`);
  parts.push(`**Confidence**: ${candidate.confidence}`);

  if (candidate.validation?.status) {
    parts.push(`**Validation**: ${candidate.validation.status}`);
  }

  // Include source information
  if (candidate.origin) {
    parts.push(`**Origin**: ${candidate.origin}`);
  }

  // Add metadata highlights if available
  if (candidate.metadata) {
    const meta = candidate.metadata;
    if (meta.rating) {
      parts.push(`**Rating**: ${meta.rating}/5`);
    }
    if (meta.viewCount && meta.viewCount > 10000) {
      parts.push(`**Views**: ${formatNumber(meta.viewCount)}`);
    }
  }

  return parts.join('\n');
}

/**
 * Format a number with K/M suffixes for readability.
 */
function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}

// ============================================================================
// Exports
// ============================================================================

export const AGGREGATOR_PROMPT = {
  system: AGGREGATOR_SYSTEM_PROMPT,
  build: buildAggregatorPrompt,
};
