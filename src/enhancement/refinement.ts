/**
 * Refinement Suggestion Generator
 *
 * Generates refined prompts and extracts structured parameters from
 * user travel prompts. Supports iterative refinement with user answers
 * and feedback.
 *
 * @module enhancement/refinement
 * @see PRD Section FR0.4-FR0.5 - Clarifying Questions and Suggested Refinement
 */

import { z } from 'zod';
import type { PartialSessionParams, PromptAnalysis } from '../schemas/enhancement.js';
import { PartialSessionParamsSchema } from '../schemas/enhancement.js';
import {
  REFINEMENT_PROMPT,
  FEEDBACK_PROMPT,
  type RefinementPromptVariables,
  type FeedbackPromptVariables,
} from './prompts.js';
import { callGoogleAI, extractJson } from './llm-client.js';

/**
 * Refinement suggestion returned by the enhancement process.
 */
export interface RefinementSuggestion {
  /** The refined, enhanced prompt text */
  refinedPrompt: string;
  /** Extracted session parameters */
  extractedParams: PartialSessionParams;
  /** Explanation of what was refined */
  explanation: string;
}

/**
 * Schema for validating LLM refinement response
 */
const RefinementResponseSchema = z.object({
  isClear: z.boolean().optional(),
  suggestedRefinement: z.string().optional(),
  refinedPrompt: z.string().optional(),
  extractedParams: PartialSessionParamsSchema.optional(),
  explanation: z.string().optional(),
  reasoning: z.string().optional(),
});

/**
 * Normalize response to RefinementSuggestion format.
 * Handles variations in LLM response structure.
 */
function normalizeResponse(parsed: unknown): RefinementSuggestion {
  const validated = RefinementResponseSchema.parse(parsed);

  // Prefer suggestedRefinement over refinedPrompt (matches PRD schema)
  const refinedPrompt = validated.suggestedRefinement ?? validated.refinedPrompt ?? '';
  const explanation = validated.explanation ?? validated.reasoning ?? '';

  if (!refinedPrompt) {
    throw new Error('No refined prompt in LLM response');
  }

  return {
    refinedPrompt,
    extractedParams: validated.extractedParams ?? {},
    explanation,
  };
}

/**
 * Generate a refinement suggestion from analysis.
 *
 * If the analysis already contains suggestedRefinement and extractedParams,
 * uses those directly. Otherwise, calls the LLM to generate a refinement.
 *
 * @param prompt - The original user prompt
 * @param analysis - The prompt analysis result
 * @returns Refinement suggestion with enhanced prompt and extracted params
 *
 * @example
 * ```typescript
 * const analysis = { isClear: true, confidence: 0.85, ... };
 * const refinement = await generateRefinement("Japan in April", analysis);
 * console.log(refinement.refinedPrompt);
 * // "Exploring Japan in April 2026, focusing on..."
 * ```
 */
export async function generateRefinement(
  prompt: string,
  analysis: PromptAnalysis
): Promise<RefinementSuggestion> {
  // If analysis already has a good refinement, use it directly
  if (analysis.suggestedRefinement && analysis.extractedParams) {
    return {
      refinedPrompt: analysis.suggestedRefinement,
      extractedParams: analysis.extractedParams,
      explanation: analysis.reasoning,
    };
  }

  // Use REFINEMENT_PROMPT with no Q&A (direct refinement based on analysis)
  const variables: RefinementPromptVariables = {
    originalPrompt: prompt,
    questionsAndAnswers: `Analysis summary: ${analysis.reasoning ?? 'No additional context'}`,
  };

  const llmPrompt = REFINEMENT_PROMPT(variables);
  const result = await callGoogleAI(llmPrompt, 'enhancement');

  // Parse and validate response using shared JSON extractor
  const parsed = extractJson(result.text);
  return normalizeResponse(parsed);
}

/**
 * Generate refinement after user answers clarifying questions.
 *
 * Combines the original prompt with user answers to create a comprehensive
 * refinement that incorporates all gathered information.
 *
 * @param prompt - The original user prompt
 * @param _analysis - The prompt analysis result (unused but kept for interface compatibility)
 * @param questions - Array of clarifying questions that were asked
 * @param answers - Array of user answers (same order as questions)
 * @returns Refinement suggestion incorporating all answers
 *
 * @example
 * ```typescript
 * const questions = ["Where do you want to go?", "When are you traveling?"];
 * const answers = ["Japan", "April 2026"];
 * const refinement = await generateRefinementWithAnswers(
 *   "I want a vacation",
 *   analysis,
 *   questions,
 *   answers
 * );
 * ```
 */
export async function generateRefinementWithAnswers(
  prompt: string,
  _analysis: PromptAnalysis,
  questions: string[],
  answers: string[]
): Promise<RefinementSuggestion> {
  // Format Q&A pairs
  const qaPairs = questions
    .map((q, i) => `Q: ${q}\nA: ${answers[i] ?? '(no answer)'}`)
    .join('\n\n');

  // Build the prompt from template
  const variables: RefinementPromptVariables = {
    originalPrompt: prompt,
    questionsAndAnswers: qaPairs,
  };

  const llmPrompt = REFINEMENT_PROMPT(variables);
  const result = await callGoogleAI(llmPrompt, 'enhancement');

  // Parse and validate response using shared JSON extractor
  const parsed = extractJson(result.text);
  return normalizeResponse(parsed);
}

/**
 * Generate refinement incorporating user feedback.
 *
 * Adjusts a previous refinement based on user feedback, maintaining
 * aspects they liked and changing aspects they didn't.
 *
 * @param prompt - The original user prompt
 * @param previousRefinement - The previous refinement that received feedback
 * @param feedback - User's feedback on the previous refinement
 * @returns Improved refinement addressing the feedback
 *
 * @example
 * ```typescript
 * const refinement = await generateRefinementWithFeedback(
 *   "Japan in April",
 *   "Exploring Japan in April 2026...",
 *   "I want to focus more on food experiences, less on temples"
 * );
 * ```
 */
export async function generateRefinementWithFeedback(
  prompt: string,
  previousRefinement: string,
  feedback: string
): Promise<RefinementSuggestion> {
  // Build the prompt from template
  const variables: FeedbackPromptVariables = {
    originalPrompt: prompt,
    previousRefinement,
    userFeedback: feedback,
  };

  const llmPrompt = FEEDBACK_PROMPT(variables);
  const result = await callGoogleAI(llmPrompt, 'enhancement');

  // Parse and validate response using shared JSON extractor
  const parsed = extractJson(result.text);
  return normalizeResponse(parsed);
}

/**
 * Create a basic refinement without LLM call (fallback for errors or testing).
 *
 * @param prompt - The original user prompt
 * @param analysis - The prompt analysis result
 * @returns Basic refinement using available data
 */
export function createFallbackRefinement(
  prompt: string,
  analysis: PromptAnalysis
): RefinementSuggestion {
  // Use whatever we have from the analysis
  return {
    refinedPrompt: analysis.suggestedRefinement ?? prompt,
    extractedParams: analysis.extractedParams ?? {},
    explanation:
      'Fallback refinement: using original prompt or analysis suggestion without enhancement.',
  };
}

/**
 * Validate that a refinement suggestion has required fields.
 *
 * @param suggestion - The refinement suggestion to validate
 * @returns True if the suggestion is valid
 */
export function isValidRefinement(suggestion: RefinementSuggestion): boolean {
  return (
    typeof suggestion.refinedPrompt === 'string' &&
    suggestion.refinedPrompt.length > 0 &&
    typeof suggestion.explanation === 'string' &&
    typeof suggestion.extractedParams === 'object'
  );
}
