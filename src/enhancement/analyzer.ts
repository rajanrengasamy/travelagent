/**
 * Prompt Analyzer
 *
 * Analyzes user prompts for clarity and completeness using LLM.
 * Evaluates across 5 dimensions to determine if clarifying questions are needed.
 *
 * @module enhancement/analyzer
 * @see PRD Section FR0.2 - 5-Dimension Analysis
 */

import { PromptAnalysis, PromptAnalysisSchema } from '../schemas/enhancement.js';
import {
  ANALYSIS_PROMPT,
  FEEDBACK_PROMPT,
  type AnalysisPromptVariables,
  type FeedbackPromptVariables,
} from './prompts.js';
import { callGoogleAI, type LLMCallConfig } from './llm-client.js';

/**
 * Type alias for PromptAnalysis for consistency with other modules.
 * Used by the enhancer for type clarity.
 */
export type PromptAnalysisResult = PromptAnalysis;

/**
 * Default clarifying questions returned when LLM call fails
 */
const DEFAULT_CLARIFYING_QUESTIONS = [
  'Which region or country interests you most for this trip?',
  'When are you planning to travel (specific dates or general timeframe)?',
  'What type of experiences are most important to you (adventure, relaxation, culture, food)?',
];

/**
 * Default PromptAnalysis returned on error (graceful degradation)
 */
const DEFAULT_ANALYSIS: PromptAnalysis = {
  isClear: false,
  confidence: 0.0,
  clarifyingQuestions: DEFAULT_CLARIFYING_QUESTIONS,
  reasoning: 'Unable to analyze prompt due to an error. Please answer these clarifying questions.',
};

/**
 * Configuration for the analyzer
 */
export interface AnalyzerConfig {
  /** Timeout in milliseconds for LLM calls */
  timeoutMs: number;
  /** Maximum retries for failed LLM calls */
  maxRetries: number;
}

const DEFAULT_ANALYZER_CONFIG: AnalyzerConfig = {
  timeoutMs: 15000,
  maxRetries: 1,
};

/**
 * Analyze a user prompt for clarity and completeness.
 *
 * Calls the LLM to evaluate the prompt across 5 dimensions:
 * - Destination Specificity (30%)
 * - Temporal Clarity (25%)
 * - Interest Articulation (20%)
 * - Constraint Definition (15%)
 * - Trip Type (10%)
 *
 * Decision Logic:
 * - Clear: At least 3 dimensions inferable, destination OR temporal present
 * - Ambiguous: Fewer than 3 dimensions, or both destination AND dates missing
 *
 * @param prompt - The user's travel prompt
 * @param feedback - Optional user feedback on previous refinement (triggers FEEDBACK_PROMPT)
 * @param config - Optional analyzer configuration
 * @returns PromptAnalysis with isClear, confidence, and either clarifyingQuestions or suggestedRefinement
 */
export async function analyzePrompt(
  prompt: string,
  feedback?: string,
  config: Partial<AnalyzerConfig> = {}
): Promise<PromptAnalysisResult> {
  const { timeoutMs, maxRetries } = { ...DEFAULT_ANALYZER_CONFIG, ...config };

  // Build the prompt - use FEEDBACK_PROMPT if feedback provided, otherwise ANALYSIS_PROMPT
  const fullPrompt = feedback ? buildFeedbackPrompt(prompt, feedback) : buildPrompt(prompt);

  // LLM call configuration - uses unified client with built-in retry/timeout
  const llmConfig: LLMCallConfig = {
    timeoutMs,
    maxRetries,
    jsonMode: true,
  };

  try {
    const result = await callGoogleAI(fullPrompt, 'enhancement', llmConfig);
    const analysis = parseAndValidate(result.text);
    return analysis;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`Prompt analysis failed: ${errorMessage}`);
    return DEFAULT_ANALYSIS;
  }
}

/**
 * Build the full prompt by substituting the user's input into the template.
 *
 * @param userPrompt - The user's raw travel prompt
 * @returns The complete prompt to send to the LLM
 */
export function buildPrompt(userPrompt: string): string {
  const variables: AnalysisPromptVariables = { userPrompt };
  return ANALYSIS_PROMPT(variables);
}

/**
 * Build a feedback prompt when user provides feedback on previous refinement.
 *
 * @param originalPrompt - The user's original travel prompt
 * @param userFeedback - The user's feedback on the previous refinement
 * @param previousRefinement - The previous suggested refinement (optional)
 * @returns The complete feedback prompt to send to the LLM
 */
export function buildFeedbackPrompt(
  originalPrompt: string,
  userFeedback: string,
  previousRefinement = ''
): string {
  const variables: FeedbackPromptVariables = {
    originalPrompt,
    previousRefinement: previousRefinement || originalPrompt,
    userFeedback,
  };
  return FEEDBACK_PROMPT(variables);
}

/**
 * Parse LLM response and validate against schema.
 *
 * Attempts to extract JSON from the response if it's wrapped in markdown code blocks.
 *
 * @param responseText - Raw response text from the LLM
 * @returns Validated PromptAnalysis
 */
export function parseAndValidate(responseText: string): PromptAnalysis {
  // Try to extract JSON from response (handle markdown code blocks)
  const jsonString = extractJsonString(responseText);

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error(`Failed to parse JSON from LLM response: ${responseText.substring(0, 200)}`);
  }

  // Validate with Zod schema
  const result = PromptAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`LLM response failed schema validation: ${result.error.message}`);
  }

  // Ensure logical consistency
  return ensureConsistency(result.data);
}

/**
 * Extract JSON string from LLM response, handling markdown code blocks.
 *
 * @param text - Raw response text
 * @returns Extracted JSON string
 */
function extractJsonString(text: string): string {
  // Check for markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find JSON object directly
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  // Return as-is and let JSON.parse handle errors
  return text.trim();
}

/**
 * Ensure logical consistency in the analysis result.
 *
 * - If isClear=true, ensure suggestedRefinement is present
 * - If isClear=false, ensure clarifyingQuestions has 2-4 items
 *
 * @param analysis - The parsed analysis
 * @returns Consistent analysis
 */
function ensureConsistency(analysis: PromptAnalysis): PromptAnalysis {
  if (analysis.isClear) {
    // Clear prompts should have a suggested refinement
    if (!analysis.suggestedRefinement) {
      return {
        ...analysis,
        suggestedRefinement: 'No refinement needed - prompt is already well-structured.',
      };
    }
  } else {
    // Ambiguous prompts must have clarifying questions
    if (!analysis.clarifyingQuestions || analysis.clarifyingQuestions.length < 2) {
      return {
        ...analysis,
        clarifyingQuestions: DEFAULT_CLARIFYING_QUESTIONS,
      };
    }
    // Ensure 2-4 questions (truncate if more)
    if (analysis.clarifyingQuestions.length > 4) {
      return {
        ...analysis,
        clarifyingQuestions: analysis.clarifyingQuestions.slice(0, 4),
      };
    }
  }

  return analysis;
}

/**
 * Create a PromptAnalysis from clarifying question answers.
 *
 * This is a helper for when the user has answered clarifying questions
 * and we need to create a new analysis based on their responses.
 *
 * @param originalPrompt - The original user prompt
 * @param answers - Map of question to answer
 * @returns A clear PromptAnalysis with combined information
 */
export function createAnalysisFromAnswers(
  originalPrompt: string,
  answers: Record<string, string>
): PromptAnalysis {
  // Combine original prompt with answers for refinement
  const answersText = Object.entries(answers)
    .map(([q, a]) => `${q}\n  Answer: ${a}`)
    .join('\n');

  const combinedRefinement = `${originalPrompt}\n\nAdditional details:\n${answersText}`;

  return {
    isClear: true,
    confidence: 0.8,
    suggestedRefinement: combinedRefinement,
    reasoning: 'User provided additional details through clarifying questions.',
  };
}

/**
 * Calculate dimension scores from analysis (for debugging/display).
 *
 * @param analysis - The prompt analysis
 * @returns Object with dimension weights applied
 */
export function getDimensionScores(analysis: PromptAnalysis): Record<string, number> {
  // Dimension weights from PRD FR0.2
  const weights = {
    destinationSpecificity: 0.3,
    temporalClarity: 0.25,
    interestArticulation: 0.2,
    constraintDefinition: 0.15,
    tripType: 0.1,
  };

  // Use confidence as a proxy for overall score
  // Individual dimensions can be inferred from extractedParams
  const params = analysis.extractedParams;
  const scores: Record<string, number> = {};

  // Destination Specificity: check if destinations array has items
  const hasDestination = params?.destinations && params.destinations.length > 0;
  scores.destinationSpecificity = hasDestination ? weights.destinationSpecificity : 0;

  // Temporal Clarity: check if dateRange is present
  const hasDates = params?.dateRange !== undefined;
  scores.temporalClarity = hasDates ? weights.temporalClarity : 0;

  // Interest Articulation: check if interests array has items
  const hasInterests = params?.interests && params.interests.length > 0;
  scores.interestArticulation = hasInterests ? weights.interestArticulation : 0;

  // Constraint Definition: check if constraints object has keys
  const hasConstraints = params?.constraints && Object.keys(params.constraints).length > 0;
  scores.constraintDefinition = hasConstraints ? weights.constraintDefinition : 0;

  // Trip Type: infer from constraints or tags
  const hasTripType =
    params?.inferredTags?.some((tag) =>
      ['solo', 'couple', 'family', 'group', 'business'].includes(tag.toLowerCase())
    ) ?? false;
  scores.tripType = hasTripType ? weights.tripType : 0;

  // Total score
  scores.total = Object.values(scores).reduce((sum, score) => sum + score, 0);

  return scores;
}
