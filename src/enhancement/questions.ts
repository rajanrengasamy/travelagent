/**
 * Clarifying Question Generator
 *
 * Generates targeted questions to clarify ambiguous travel prompts.
 * Questions prioritize critical missing dimensions (destination, timing).
 *
 * @module enhancement/questions
 * @see PRD Section FR0.3-FR0.4 - Enhancement Flow and Clarifying Questions
 */

import type { PromptAnalysis } from '../schemas/enhancement.js';

/**
 * Question templates for each dimension.
 * Templates are conversational, not interrogative per PRD FR0.4.
 */
const QUESTION_TEMPLATES = {
  destination: [
    'Where are you thinking of traveling? A specific city, region, or country?',
    'Which region or country are you most interested in? (e.g., Southeast Asia, Mediterranean, Japan)',
    'Do you have a destination in mind, or would you like suggestions for a particular type of trip?',
  ],
  temporal: [
    'When are you planning to travel? Any specific dates or just a general timeframe?',
    'When are you planning to travel? (specific dates, month, or season)',
    'Do you have travel dates in mind, or are you flexible on timing?',
  ],
  duration: [
    'How long is your trip? (weekend getaway, 1 week, 2+ weeks)',
    'How many days or weeks are you planning for this trip?',
  ],
  interests: [
    'What activities or experiences are you most interested in?',
    'What experiences are most important to you? (food, culture, adventure, relaxation, nature)',
    'What kind of things do you enjoy doing on vacation?',
  ],
  constraints: [
    'Do you have any budget constraints or special requirements? (accessibility, family-friendly, dietary)',
    'Any must-haves or deal-breakers we should know about?',
    'Are there any practical constraints we should consider? (budget, mobility needs, etc.)',
  ],
  tripType: [
    "Is this a solo trip, couple's getaway, family vacation, or group trip?",
    "Who's traveling? (solo, couple, family with kids, group of friends)",
    'Tell me a bit about who will be on this trip.',
  ],
} as const;

/**
 * Dimension priority order for question selection.
 * Critical dimensions (destination, temporal) come first per PRD FR0.4.
 * Duration is grouped with temporal since both relate to timing (25% weight).
 */
const DIMENSION_PRIORITY: (keyof typeof QUESTION_TEMPLATES)[] = [
  'destination',
  'temporal',
  'duration', // MIN-2: Grouped with temporal per PRD temporal clarity weighting
  'interests',
  'constraints',
  'tripType',
];

/**
 * Analyze which dimensions are missing or weak from the prompt analysis.
 *
 * @param analysis - The prompt analysis result
 * @returns Set of dimensions that need clarification
 */
function detectMissingDimensions(analysis: PromptAnalysis): Set<keyof typeof QUESTION_TEMPLATES> {
  const missing = new Set<keyof typeof QUESTION_TEMPLATES>();
  const params = analysis.extractedParams;

  // Check destination - missing if no destinations or empty array
  if (!params?.destinations || params.destinations.length === 0) {
    missing.add('destination');
  }

  // Check temporal - missing if no dateRange
  if (!params?.dateRange) {
    missing.add('temporal');
  }

  // Check interests - missing if no interests or very few
  if (!params?.interests || params.interests.length < 2) {
    missing.add('interests');
  }

  // Check constraints - only add if critical dimensions are present
  // and we have room for more questions
  if (params?.destinations && params.destinations.length > 0) {
    if (!params?.constraints || Object.keys(params.constraints).length === 0) {
      missing.add('constraints');
    }
  }

  // Check trip type - infer from reasoning or detected intents
  const hasTripType = analysis.detectedIntents?.some(
    (intent) =>
      intent.toLowerCase().includes('solo') ||
      intent.toLowerCase().includes('family') ||
      intent.toLowerCase().includes('couple') ||
      intent.toLowerCase().includes('group')
  );

  if (!hasTripType && params?.destinations && params.destinations.length > 0) {
    missing.add('tripType');
  }

  return missing;
}

/**
 * Select the best question variant for a dimension.
 * Uses a simple rotation based on analysis confidence to add variety.
 *
 * @param dimension - The dimension to get a question for
 * @param seed - A seed value for selecting variants (e.g., confidence * 100)
 * @returns A question string
 */
function selectQuestionVariant(dimension: keyof typeof QUESTION_TEMPLATES, seed: number): string {
  const templates = QUESTION_TEMPLATES[dimension];
  const index = Math.floor(seed) % templates.length;
  return templates[index];
}

/**
 * Generate clarifying questions based on prompt analysis.
 *
 * Questions target missing or weak dimensions, prioritizing:
 * 1. Destination (if missing) - CRITICAL
 * 2. Temporal/timing (if missing) - CRITICAL
 * 3. Interests (if vague)
 * 4. Constraints/trip type (if helpful)
 *
 * @param _prompt - The original user prompt. Currently unused but retained for:
 *   - API stability with existing callers (enhancer.ts)
 *   - Future use: context-aware question generation (e.g., avoiding questions
 *     about topics already mentioned in the prompt text)
 * @param analysis - The prompt analysis result
 * @returns Array of 2-4 clarifying questions
 *
 * @example
 * ```typescript
 * const analysis = {
 *   isClear: false,
 *   confidence: 0.3,
 *   reasoning: 'Missing destination and timing',
 *   extractedParams: { interests: ['food'] }
 * };
 * const questions = generateClarifyingQuestions("I want a vacation", analysis);
 * // Returns 2-4 questions targeting missing dimensions
 * ```
 */
export function generateClarifyingQuestions(_prompt: string, analysis: PromptAnalysis): string[] {
  // If analysis already has clarifying questions from the LLM, prefer those
  if (
    analysis.clarifyingQuestions &&
    analysis.clarifyingQuestions.length >= 2 &&
    analysis.clarifyingQuestions.length <= 4
  ) {
    return analysis.clarifyingQuestions;
  }

  const missingDimensions = detectMissingDimensions(analysis);
  const questions: string[] = [];

  // Use confidence as a seed for variety in question selection
  const seed = analysis.confidence * 100;

  // Add questions in priority order
  for (const dimension of DIMENSION_PRIORITY) {
    if (missingDimensions.has(dimension) && questions.length < 4) {
      questions.push(selectQuestionVariant(dimension, seed + questions.length));
    }
  }

  // Ensure we have at least 2 questions per PRD requirement
  // If we have fewer than 2 missing dimensions, add follow-up questions
  if (questions.length < 2) {
    // Find dimensions we haven't asked about
    for (const dimension of DIMENSION_PRIORITY) {
      if (!missingDimensions.has(dimension) && questions.length < 2) {
        // Ask for more detail on existing dimensions
        if (dimension === 'interests') {
          questions.push("Is there anything specific you'd like to experience or avoid during your trip?");
        } else if (dimension === 'constraints') {
          questions.push('Any preferences on accommodation style, pace of travel, or budget?');
        }
      }
    }
  }

  // Fallback if we still don't have enough questions
  while (questions.length < 2) {
    if (!questions.some((q) => q.includes('experience'))) {
      questions.push('What kind of experience are you hoping for on this trip?');
    } else {
      questions.push('Is there anything else that would help us plan your trip?');
      break;
    }
  }

  // Cap at 4 questions per PRD FR0.4
  return questions.slice(0, 4);
}

/**
 * Check if a prompt analysis requires clarifying questions.
 *
 * @param analysis - The prompt analysis result
 * @returns True if questions should be asked
 */
export function needsClarification(analysis: PromptAnalysis): boolean {
  return !analysis.isClear || analysis.confidence < 0.6;
}

/**
 * Get the count of missing critical dimensions.
 * Critical dimensions are destination and temporal per PRD.
 *
 * @param analysis - The prompt analysis result
 * @returns Number of missing critical dimensions (0-2)
 */
export function countMissingCriticalDimensions(analysis: PromptAnalysis): number {
  let count = 0;
  const params = analysis.extractedParams;

  if (!params?.destinations || params.destinations.length === 0) {
    count++;
  }
  if (!params?.dateRange) {
    count++;
  }

  return count;
}
