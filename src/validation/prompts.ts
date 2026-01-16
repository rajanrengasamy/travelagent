/**
 * Social Validation Prompts
 *
 * Prompt templates for validating travel candidates via Perplexity.
 * Used in Stage 07 (Social Validation) to cross-reference YouTube-derived
 * candidates against web sources.
 *
 * @module validation/prompts
 * @see PRD Section FR6 - Social Validation
 * @see TODO Section 15.1 - Validation prompts
 */

// ============================================================================
// Validation Prompt Template
// ============================================================================

/**
 * Template for validating a travel candidate.
 *
 * Variables:
 * - {placeName}: Name of the place/activity to validate
 * - {claimedLocation}: Location where the candidate claims to be
 *
 * The prompt asks Perplexity to verify:
 * 1. Place existence
 * 2. Correct location
 * 3. No obvious closure or mismatch
 *
 * @see TODO Section 15.1.1 - VALIDATION_PROMPT template
 * @see TODO Section 15.1.2 - Include place name, claimed location, verification request
 */
export const VALIDATION_PROMPT = `Verify this travel recommendation:

Place: {placeName}
Claimed location: {claimedLocation}

Please confirm:
1. Does this place exist and is it a real establishment/attraction?
2. Is the location correct (is it actually in/near {claimedLocation})?
3. Is it currently open/operational (not permanently closed)?
4. Are there any recent reviews or mentions confirming this place?

Response format (JSON):
{
  "exists": true/false,
  "locationCorrect": true/false,
  "isOperational": true/false,
  "hasRecentMentions": true/false,
  "notes": "Brief explanation of findings",
  "sources": ["URL1", "URL2"]
}

If you cannot verify something, set that field to null. Be concise in your notes.`;

// ============================================================================
// System Prompt for Validation
// ============================================================================

/**
 * System prompt for validation queries.
 *
 * Sets the context for Perplexity to act as a fact-checker
 * rather than a recommendation generator.
 */
export const VALIDATION_SYSTEM_PROMPT = `You are a fact-checking assistant specializing in travel information verification.

Your role is to verify the accuracy of travel recommendations by:
- Confirming places exist and are correctly located
- Checking if businesses are currently operational
- Looking for recent reviews or mentions
- Identifying any conflicts or outdated information

Key behaviors:
- Be explicit when you cannot verify something
- Always cite your sources
- Respond in the requested JSON format
- Be concise but thorough`;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build a validation prompt for a specific candidate.
 *
 * Substitutes variables in the VALIDATION_PROMPT template with actual values.
 *
 * @param placeName - Name of the place to validate
 * @param claimedLocation - Location claimed for the place
 * @returns Formatted validation prompt
 */
export function buildValidationPrompt(placeName: string, claimedLocation: string): string {
  return VALIDATION_PROMPT
    .replace(/{placeName}/g, placeName)
    .replace(/{claimedLocation}/g, claimedLocation);
}

/**
 * Prompt for batch validation of multiple candidates.
 *
 * More efficient when validating multiple places, as it reduces API calls.
 * However, accuracy may be slightly lower than individual validation.
 *
 * @param places - Array of places to validate
 * @returns Formatted batch validation prompt
 */
export function buildBatchValidationPrompt(
  places: Array<{ name: string; location: string }>
): string {
  const placesList = places
    .map((p, i) => `${i + 1}. "${p.name}" in ${p.location}`)
    .join('\n');

  return `Verify these travel recommendations:

${placesList}

For each place, confirm:
1. Does it exist?
2. Is the location correct?
3. Is it currently operational?

Response format (JSON array):
[
  {
    "index": 1,
    "name": "Place Name",
    "exists": true/false,
    "locationCorrect": true/false,
    "isOperational": true/false,
    "notes": "Brief explanation",
    "sources": ["URL1"]
  },
  ...
]

If you cannot verify something, set that field to null.`;
}
