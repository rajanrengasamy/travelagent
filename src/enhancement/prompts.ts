/**
 * Enhancement Prompt Templates - Stage 00 prompt enhancement
 *
 * Templates for analyzing user travel prompts, generating clarifying questions,
 * and producing refined prompts with structured parameters.
 *
 * @module enhancement/prompts
 * @see PRD Appendix C - Prompt Templates (C.0, C.0.1, C.0.2)
 * @see PRD Section 8 - FR0: Prompt Enhancement
 */

// ============================================================================
// Types for Template Variables
// ============================================================================

/**
 * Variables for the analysis prompt template.
 */
export interface AnalysisPromptVariables {
  /** The user's original travel prompt */
  userPrompt: string;
}

/**
 * Variables for the clarifying questions prompt template.
 */
export interface ClarifyingQuestionsPromptVariables {
  /** The user's original travel prompt */
  userPrompt: string;
  /** Dimensions that are already clear (should be skipped in questions) */
  clearDimensions: string[];
  /** Dimensions that need clarification */
  missingDimensions: string[];
}

/**
 * Variables for the refinement prompt template.
 */
export interface RefinementPromptVariables {
  /** The user's original travel prompt */
  originalPrompt: string;
  /** Q&A pairs from the clarifying questions phase */
  questionsAndAnswers: string;
}

/**
 * Variables for the feedback prompt template.
 */
export interface FeedbackPromptVariables {
  /** The user's original travel prompt */
  originalPrompt: string;
  /** The previous suggested refinement */
  previousRefinement: string;
  /** User's feedback on the previous refinement */
  userFeedback: string;
}

// ============================================================================
// JSON Output Schema Documentation
// ============================================================================

/**
 * Expected JSON output structure documentation.
 * This matches the PromptAnalysis schema in src/schemas/enhancement.ts.
 */
const JSON_OUTPUT_SCHEMA = `{
  "isClear": boolean,
  "confidence": number (0.0-1.0),
  "suggestedRefinement": string | null,
  "extractedParams": {
    "destinations": string[] | null,
    "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } | null,
    "flexibility": { "type": "none" | "plusMinusDays" | "monthOnly", "days"?: number, "month"?: "YYYY-MM" } | null,
    "interests": string[] | null,
    "constraints": object | null,
    "inferredTags": string[]
  },
  "clarifyingQuestions": string[] | null (2-4 questions if isClear is false),
  "reasoning": string,
  "detectedIntents": string[]
}`;

// ============================================================================
// Analysis Prompt Template
// ============================================================================

/**
 * ANALYSIS_PROMPT - Analyzes user prompts across 5 travel-specific dimensions.
 *
 * Evaluation dimensions with weights:
 * - Destination Specificity (30%): Is there a concrete, searchable location?
 * - Temporal Clarity (25%): Are dates, season, or duration specified?
 * - Interest Articulation (20%): Are activities or themes clear?
 * - Constraint Definition (15%): Are limitations stated (budget, accessibility)?
 * - Trip Type (10%): Solo/couple/family/group? Duration style?
 *
 * Decision logic:
 * - isClear = true: At least 3 dimensions inferable AND (destination OR temporal present)
 * - isClear = false: Fewer than 3 dimensions OR both destination AND dates missing
 *
 * @param variables - The template variables
 * @returns The completed prompt string
 *
 * @see PRD Appendix C.0 - Enhancement Analysis Prompt
 * @see PRD Section 8 FR0.2 - Evaluation Dimensions
 */
export function ANALYSIS_PROMPT(variables: AnalysisPromptVariables): string {
  return `You are a travel planning assistant. Analyze the user's travel prompt and determine if it contains enough information to generate high-quality discovery results.

Evaluate across these dimensions:
1. **Destination Specificity** (30%) - Is there a concrete, searchable location?
   - HIGH: Specific city, region, or well-defined area (e.g., "Kyoto, Japan", "Amalfi Coast")
   - MEDIUM: Country or general region (e.g., "Japan", "Southeast Asia")
   - LOW: Vague or missing (e.g., "somewhere warm", no location mentioned)

2. **Temporal Clarity** (25%) - Are dates, season, or duration specified?
   - HIGH: Specific dates or date range (e.g., "April 1-14, 2026")
   - MEDIUM: Season, month, or rough timeframe (e.g., "next spring", "March 2026")
   - LOW: Vague or missing (e.g., "sometime", "eventually", no dates)

3. **Interest Articulation** (20%) - Are activities or themes clear?
   - HIGH: Specific activities listed (e.g., "temples, ramen, cherry blossoms")
   - MEDIUM: General themes (e.g., "cultural experiences", "food tour")
   - LOW: Vague or missing (e.g., "stuff to do", no interests)

4. **Constraint Definition** (15%) - Are limitations stated (budget, accessibility, dietary)?
   - HIGH: Explicit constraints (e.g., "under $200/day", "wheelchair accessible")
   - MEDIUM: Implicit constraints (e.g., "budget-friendly", "easy to walk")
   - LOW: No constraints mentioned (acceptable if not needed)

5. **Trip Type** (10%) - Solo/couple/family/group? Duration style?
   - HIGH: Explicit trip type (e.g., "10-day family trip", "romantic getaway for two")
   - MEDIUM: Inferable from context (e.g., "with kids" implies family)
   - LOW: Ambiguous or missing

USER PROMPT:
<<<USER_PROMPT_START>>>
${variables.userPrompt}
<<<USER_PROMPT_END>>>

DECISION RULES:
- Mark as CLEAR (isClear: true) when:
  - At least 3 dimensions are reasonably inferable (HIGH or MEDIUM)
  - Destination OR temporal context is present
  - A refined version would only make minor improvements

- Mark as AMBIGUOUS (isClear: false) when:
  - Fewer than 3 dimensions are inferable
  - Both destination AND dates are missing
  - Multiple valid interpretations exist

OUTPUT FORMAT:

If CLEAR, provide a suggestedRefinement that:
- Preserves the user's intent and style
- Fills in reasonable defaults for missing dimensions
- Extracts structured parameters

If AMBIGUOUS, provide 2-4 clarifyingQuestions that:
- Prioritize missing critical dimensions (destination, timing)
- Skip questions for dimensions already clear
- Are conversational and helpful, not interrogative
- Help narrow down the user's intent efficiently

Output as valid JSON matching this schema:
${JSON_OUTPUT_SCHEMA}

Output JSON only, no additional text or markdown code blocks.`;
}

// ============================================================================
// Clarifying Questions Prompt Template
// ============================================================================

/**
 * CLARIFYING_QUESTIONS_PROMPT - Generates 2-4 targeted questions for unclear prompts.
 *
 * This prompt is used when the initial analysis determines the prompt is ambiguous.
 * It focuses on generating helpful, conversational questions that prioritize
 * missing critical dimensions (destination, timing) while skipping already-clear ones.
 *
 * @param variables - The template variables
 * @returns The completed prompt string
 *
 * @see PRD Section 8 FR0.3 - Enhancement Flow
 */
export function CLARIFYING_QUESTIONS_PROMPT(variables: ClarifyingQuestionsPromptVariables): string {
  const clearDimsList = variables.clearDimensions.length > 0
    ? variables.clearDimensions.join(', ')
    : 'none';
  const missingDimsList = variables.missingDimensions.length > 0
    ? variables.missingDimensions.join(', ')
    : 'all dimensions need clarification';

  return `You are a helpful travel planning assistant. The user has provided a travel prompt that needs clarification before we can generate useful discovery results.

USER PROMPT:
<<<USER_PROMPT_START>>>
${variables.userPrompt}
<<<USER_PROMPT_END>>>

DIMENSIONS ALREADY CLEAR: ${clearDimsList}
DIMENSIONS NEEDING CLARIFICATION: ${missingDimsList}

Generate 2-4 clarifying questions that:
1. Focus on the missing dimensions listed above
2. DO NOT ask about dimensions already clear
3. Prioritize in this order:
   - Destination (if missing) - "Which region or country interests you?"
   - Timing (if missing) - "When are you planning to travel?"
   - Interests (if missing) - "What type of experiences are you looking for?"
   - Trip type (if missing) - "Who will you be traveling with?"
4. Are conversational and friendly, not interrogative
5. Offer examples to help the user think (e.g., "beaches, mountains, cities?")
6. Can be answered briefly

Do NOT ask about:
- Budget constraints unless specifically relevant
- Accessibility unless other info suggests it's needed
- Dimensions that are already clear from the prompt

Output as valid JSON:
{
  "clarifyingQuestions": [
    "Question 1 with helpful examples?",
    "Question 2?",
    ...
  ],
  "reasoning": "Brief explanation of why these questions will help"
}

Output JSON only, no additional text or markdown code blocks.`;
}

// ============================================================================
// Refinement Prompt Template
// ============================================================================

/**
 * REFINEMENT_PROMPT - Creates refined prompt after user answers clarifying questions.
 *
 * This prompt combines the original user prompt with their answers to clarifying
 * questions, producing a refined prompt with fully extracted structured parameters.
 * The output should always have isClear: true.
 *
 * @param variables - The template variables
 * @returns The completed prompt string
 *
 * @see PRD Appendix C.0.1 - Enhancement with Answers Prompt
 */
export function REFINEMENT_PROMPT(variables: RefinementPromptVariables): string {
  return `The user has answered clarifying questions about their travel plans. Combine their original prompt with their answers to create an optimized travel discovery prompt.

ORIGINAL PROMPT:
<<<USER_PROMPT_START>>>
${variables.originalPrompt}
<<<USER_PROMPT_END>>>

CLARIFYING QUESTIONS AND ANSWERS:
<<<USER_ANSWERS_START>>>
${variables.questionsAndAnswers}
<<<USER_ANSWERS_END>>>

Your task:
1. Create a refined prompt that naturally incorporates ALL information from both the original prompt and the answers
2. Extract structured parameters for destinations, dates, interests, and constraints
3. Infer reasonable defaults for any remaining gaps
4. Preserve the user's voice and intent

The refined prompt should:
- Read naturally, as if the user wrote it themselves with full detail
- Include specific, searchable location names
- Specify dates or at least month/season
- List concrete activities and interests
- Mention any constraints or travel style preferences

Output as valid JSON with isClear: true:
${JSON_OUTPUT_SCHEMA}

Always set isClear to true and provide a suggestedRefinement.
Always include extractedParams with as much structure as possible.
For dateRange, use ISO format (YYYY-MM-DD). If only month is known, use first and last day of that month.
For flexibility, infer from context (e.g., "flexible" suggests plusMinusDays with 3-7 days).

Output JSON only, no additional text or markdown code blocks.`;
}

// ============================================================================
// Feedback Prompt Template
// ============================================================================

/**
 * FEEDBACK_PROMPT - Adjusts refinement based on user feedback.
 *
 * This prompt handles the case where the user provides feedback on a suggested
 * refinement, allowing iterative improvement of the enhanced prompt.
 *
 * @param variables - The template variables
 * @returns The completed prompt string
 *
 * @see PRD Appendix C.0.2 - Enhancement with Feedback Prompt
 */
export function FEEDBACK_PROMPT(variables: FeedbackPromptVariables): string {
  return `The user provided feedback on a suggested travel prompt refinement. Adjust the refinement based on their specific concerns.

ORIGINAL PROMPT:
<<<USER_PROMPT_START>>>
${variables.originalPrompt}
<<<USER_PROMPT_END>>>

PREVIOUS SUGGESTION:
${variables.previousRefinement}

USER FEEDBACK:
<<<FEEDBACK_START>>>
${variables.userFeedback}
<<<FEEDBACK_END>>>

Your task:
1. Carefully read the user's feedback to understand what they want changed
2. Create an improved refinement that addresses their concerns
3. Keep aspects they didn't complain about
4. Re-extract structured parameters if the changes affect them

Common feedback types and how to handle:
- "Too specific" - Broaden the scope, use regions instead of cities
- "Wrong dates" - Correct the dates to match what user actually wants
- "Missing X" - Add the missing element naturally
- "Don't want Y" - Remove Y and related suggestions
- "More focused on Z" - Emphasize Z more prominently

Output as valid JSON with isClear: true:
${JSON_OUTPUT_SCHEMA}

Always set isClear to true.
Update extractedParams to reflect any changes from the feedback.
Explain in reasoning what was changed and why.

Output JSON only, no additional text or markdown code blocks.`;
}

// ============================================================================
// System Context (Optional Enhancement)
// ============================================================================

/**
 * SYSTEM_CONTEXT - Optional system-level context for enhanced model behavior.
 *
 * This can be prepended to any prompt to establish consistent behavior.
 * Use sparingly as it adds to token usage.
 */
export const SYSTEM_CONTEXT = `You are a travel planning AI assistant specializing in helping users articulate and refine their travel ideas. You excel at:
- Understanding vague travel desires and making them actionable
- Asking the right questions to clarify intent
- Extracting structured data from natural language
- Suggesting improvements while respecting user preferences

Always be helpful, conversational, and efficient. Never invent facts about destinations.
Output valid JSON only when requested.`;

// ============================================================================
// Dimension Names for Programmatic Use
// ============================================================================

/**
 * The 5 evaluation dimensions with their weights.
 * Useful for programmatic dimension tracking.
 */
export const EVALUATION_DIMENSIONS = {
  destinationSpecificity: { weight: 0.30, label: 'Destination Specificity' },
  temporalClarity: { weight: 0.25, label: 'Temporal Clarity' },
  interestArticulation: { weight: 0.20, label: 'Interest Articulation' },
  constraintDefinition: { weight: 0.15, label: 'Constraint Definition' },
  tripType: { weight: 0.10, label: 'Trip Type' },
} as const;

export type DimensionKey = keyof typeof EVALUATION_DIMENSIONS;

/**
 * Dimension rating levels for analysis.
 */
export type DimensionRating = 'HIGH' | 'MEDIUM' | 'LOW';
