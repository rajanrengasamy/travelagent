/**
 * Prompt Enhancer
 *
 * Main orchestration logic for the enhancement stage (Stage 00).
 * Manages the interactive flow of analyzing, clarifying, and refining prompts.
 *
 * @module enhancement/enhancer
 * @see PRD Section FR0.6-FR0.9
 */

import {
  EnhancementResult,
  EnhancementResultSchema,
  EnhancementConfig,
  EnhancementAction,
  PartialSessionParams,
  PromptAnalysis,
  DEFAULT_ENHANCEMENT_CONFIG,
} from '../schemas/enhancement.js';
import { getModelConfig } from '../config/models.js';
import { analyzePrompt } from './analyzer.js';
import { generateClarifyingQuestions } from './questions.js';
import {
  generateRefinement,
  generateRefinementWithAnswers,
  generateRefinementWithFeedback,
  RefinementSuggestion,
} from './refinement.js';
import { extractSessionParams } from './extractor.js';

/**
 * Options for the enhance prompt function.
 */
export interface EnhanceOptions {
  /** Override default configuration */
  config?: Partial<EnhancementConfig>;
  /** Callback when clarifying questions are generated */
  onClarifyingQuestions?: (questions: string[]) => Promise<string[]>;
  /** Callback when refinement is suggested */
  onRefinementSuggestion?: (suggestion: RefinementSuggestion) => Promise<EnhancementAction>;
  /** User feedback for another iteration */
  feedback?: string;
}

/**
 * Timeout error for LLM calls
 */
export class EnhancementTimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number
  ) {
    super(message);
    this.name = 'EnhancementTimeoutError';
  }
}

/**
 * Total enhancement timeout error
 */
export class TotalTimeoutError extends Error {
  constructor(
    message: string,
    public readonly elapsedMs: number
  ) {
    super(message);
    this.name = 'TotalTimeoutError';
  }
}


/**
 * Execute a promise with timeout.
 * Uses Promise.race for clean timeout handling.
 *
 * @param promise - The promise to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Name of operation for error message
 * @returns Result of the promise
 * @throws EnhancementTimeoutError if timeout exceeded
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new EnhancementTimeoutError(`${operationName} timed out after ${timeoutMs}ms`, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Check if total timeout has been exceeded.
 *
 * @param startTime - Start timestamp
 * @param totalTimeoutMs - Total timeout in milliseconds
 * @throws TotalTimeoutError if total timeout exceeded
 */
function checkTotalTimeout(startTime: number, totalTimeoutMs: number): void {
  const elapsed = Date.now() - startTime;
  if (elapsed >= totalTimeoutMs) {
    throw new TotalTimeoutError(`Total enhancement timeout exceeded (${totalTimeoutMs}ms)`, elapsed);
  }
}

/**
 * Create result when enhancement is skipped.
 */
function createSkippedResult(prompt: string, modelId: string, startTime: number): EnhancementResult {
  const result: EnhancementResult = {
    schemaVersion: 1,
    originalPrompt: prompt,
    refinedPrompt: prompt,
    wasEnhanced: false,
    extractedParams: {},
    iterationCount: 0,
    modelUsed: modelId,
    processingTimeMs: Date.now() - startTime,
    createdAt: new Date().toISOString(),
  };

  return EnhancementResultSchema.parse(result);
}

/**
 * Create fallback result on error (graceful degradation).
 * Per PRD FR0.8, enhancement failure is non-fatal.
 */
function createFallbackResult(
  prompt: string,
  modelId: string,
  startTime: number,
  error: unknown,
  iterationCount: number = 0,
  lastRefinement?: RefinementSuggestion
): EnhancementResult {
  // Log warning about the error
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.warn(`[Enhancement] Graceful degradation triggered: ${errorMessage}`);

  // Use last refinement if available, otherwise original prompt
  const refinedPrompt = lastRefinement?.refinedPrompt ?? prompt;
  const wasEnhanced = lastRefinement !== undefined;

  const result: EnhancementResult = {
    schemaVersion: 1,
    originalPrompt: prompt,
    refinedPrompt,
    wasEnhanced,
    extractedParams: lastRefinement?.extractedParams ?? {},
    iterationCount,
    modelUsed: modelId,
    processingTimeMs: Date.now() - startTime,
    createdAt: new Date().toISOString(),
  };

  return EnhancementResultSchema.parse(result);
}

/**
 * Create successful enhancement result.
 */
function createSuccessResult(
  originalPrompt: string,
  refinedPrompt: string,
  extractedParams: PartialSessionParams,
  modelId: string,
  startTime: number,
  iterationCount: number,
  wasEnhanced: boolean
): EnhancementResult {
  const result: EnhancementResult = {
    schemaVersion: 1,
    originalPrompt,
    refinedPrompt,
    wasEnhanced,
    extractedParams,
    iterationCount,
    modelUsed: modelId,
    processingTimeMs: Date.now() - startTime,
    createdAt: new Date().toISOString(),
  };

  return EnhancementResultSchema.parse(result);
}

/**
 * Default callback for clarifying questions.
 * Returns empty answers, causing the system to proceed with available info.
 */
async function defaultClarifyingQuestionsCallback(_questions: string[]): Promise<string[]> {
  // Return empty answers - refinement will work with what it has
  return [];
}

/**
 * Default callback for refinement suggestions.
 * In auto-enhance mode, accepts automatically. Otherwise, accepts first suggestion.
 */
function createDefaultRefinementCallback(
  _autoEnhance: boolean
): (suggestion: RefinementSuggestion) => Promise<EnhancementAction> {
  return async (_suggestion: RefinementSuggestion): Promise<EnhancementAction> => {
    // Auto-accept when no callback provided
    return 'accept';
  };
}

/**
 * Enhance a user's travel prompt through analysis and refinement.
 *
 * This is the main entry point for Stage 00 enhancement.
 * Implements the enhancement flow per PRD FR0.6-FR0.9:
 *
 * 1. Analyze prompt for clarity
 * 2. If unclear: get clarifying questions, get answers, generate refinement
 * 3. If clear: generate refinement suggestion
 * 4. Handle user action (accept/reject/feedback)
 * 5. Iterate up to maxIterations times
 *
 * @param prompt - The user's original travel prompt
 * @param options - Enhancement options and callbacks
 * @returns EnhancementResult with refined prompt and extracted params
 */
export async function enhancePrompt(prompt: string, options?: EnhanceOptions): Promise<EnhancementResult> {
  const startTime = Date.now();
  const config: EnhancementConfig = { ...DEFAULT_ENHANCEMENT_CONFIG, ...options?.config };
  const modelConfig = getModelConfig('enhancement');
  const timeoutMs = config.timeoutMs;
  const totalTimeoutMs = config.totalTimeoutMs;

  // Skip enhancement if configured (FR0.6 - Skip action)
  if (config.skip) {
    return createSkippedResult(prompt, modelConfig.modelId, startTime);
  }

  // Set up callbacks with defaults
  const onClarifyingQuestions = options?.onClarifyingQuestions ?? defaultClarifyingQuestionsCallback;
  const onRefinementSuggestion =
    options?.onRefinementSuggestion ?? createDefaultRefinementCallback(config.autoEnhance);

  let iterationCount = 0;
  let currentPrompt = prompt;
  let currentFeedback = options?.feedback;
  let lastRefinement: RefinementSuggestion | undefined;

  try {
    // Main iteration loop (FR0.7 - Max iterations)
    while (iterationCount < config.maxIterations) {
      checkTotalTimeout(startTime, totalTimeoutMs);
      iterationCount++;

      // Step 1: Analyze the prompt
      let analysis: PromptAnalysis;
      try {
        analysis = await withTimeout(analyzePrompt(currentPrompt), timeoutMs, 'Prompt analysis');
      } catch (error) {
        // Graceful degradation on analysis failure (FR0.8)
        if (error instanceof EnhancementTimeoutError) {
          console.warn(`[Enhancement] Analysis timed out, proceeding with original prompt`);
        }
        return createFallbackResult(prompt, modelConfig.modelId, startTime, error, iterationCount, lastRefinement);
      }

      checkTotalTimeout(startTime, totalTimeoutMs);

      // Step 2: Handle based on clarity
      let refinement: RefinementSuggestion;

      if (!analysis.isClear) {
        // Prompt is unclear - get clarifying questions
        let questions: string[];
        try {
          questions =
            analysis.clarifyingQuestions && analysis.clarifyingQuestions.length > 0
              ? analysis.clarifyingQuestions
              : generateClarifyingQuestions(currentPrompt, analysis);
        } catch (error) {
          // Proceed without questions on failure
          console.warn(`[Enhancement] Question generation failed, proceeding with analysis`);
          questions = [];
        }

        checkTotalTimeout(startTime, totalTimeoutMs);

        // Get answers via callback (may include user wait time)
        let answers: string[] = [];
        if (questions.length > 0) {
          try {
            answers = await onClarifyingQuestions(questions);
          } catch (error) {
            // Proceed without answers if callback fails
            console.warn(`[Enhancement] Clarifying questions callback failed`);
          }
        }

        checkTotalTimeout(startTime, totalTimeoutMs);

        // Generate refinement with answers
        try {
          refinement = await withTimeout(
            generateRefinementWithAnswers(currentPrompt, analysis, questions, answers),
            timeoutMs,
            'Refinement with answers'
          );
        } catch (error) {
          return createFallbackResult(prompt, modelConfig.modelId, startTime, error, iterationCount, lastRefinement);
        }
      } else {
        // Prompt is clear - generate direct refinement
        try {
          refinement = await withTimeout(
            generateRefinement(currentPrompt, analysis),
            timeoutMs,
            'Refinement generation'
          );
        } catch (error) {
          return createFallbackResult(prompt, modelConfig.modelId, startTime, error, iterationCount, lastRefinement);
        }
      }

      lastRefinement = refinement;
      checkTotalTimeout(startTime, totalTimeoutMs);

      // Step 3: Get user action via callback
      let action: EnhancementAction;
      try {
        action = await onRefinementSuggestion(refinement);
      } catch (error) {
        // Default to accept if callback fails
        console.warn(`[Enhancement] Refinement callback failed, defaulting to accept`);
        action = 'accept';
      }

      // Step 4: Handle user action (FR0.6)
      switch (action) {
        case 'accept': {
          // Extract final params and return
          let extractedParams: PartialSessionParams;
          try {
            extractedParams = await withTimeout(
              extractSessionParams(refinement.refinedPrompt),
              timeoutMs,
              'Parameter extraction'
            );
          } catch (error) {
            // Use params from refinement on extraction failure
            console.warn(`[Enhancement] Parameter extraction failed, using refinement params`);
            extractedParams = refinement.extractedParams ?? {};
          }

          return createSuccessResult(
            prompt,
            refinement.refinedPrompt,
            extractedParams,
            modelConfig.modelId,
            startTime,
            iterationCount,
            true
          );
        }

        case 'reject': {
          // Return original prompt with best-effort extraction (FR0.6)
          let extractedParams: PartialSessionParams = {};
          try {
            extractedParams = await withTimeout(
              extractSessionParams(prompt),
              timeoutMs,
              'Parameter extraction for rejected prompt'
            );
          } catch (error) {
            console.warn(`[Enhancement] Parameter extraction failed for rejected prompt`);
          }

          return createSuccessResult(
            prompt,
            prompt,
            extractedParams,
            modelConfig.modelId,
            startTime,
            iterationCount,
            false
          );
        }

        case 'feedback': {
          // Re-analyze with feedback for next iteration
          // Use feedback to regenerate refinement with specific adjustments
          if (currentFeedback && lastRefinement) {
            try {
              refinement = await withTimeout(
                generateRefinementWithFeedback(currentPrompt, lastRefinement.refinedPrompt, currentFeedback),
                timeoutMs,
                'Refinement with feedback'
              );
              lastRefinement = refinement;
            } catch (error) {
              console.warn(`[Enhancement] Refinement with feedback failed`);
            }
          }
          // Update current prompt for next iteration
          currentPrompt = lastRefinement?.refinedPrompt ?? currentPrompt;
          continue;
        }

        case 'skip': {
          // Skip enhancement entirely
          return createSkippedResult(prompt, modelConfig.modelId, startTime);
        }
      }
    }

    // Max iterations reached (FR0.7) - use last suggestion
    console.warn(`[Enhancement] Max iterations (${config.maxIterations}) reached, using last suggestion`);

    if (lastRefinement) {
      return createSuccessResult(
        prompt,
        lastRefinement.refinedPrompt,
        lastRefinement.extractedParams ?? {},
        modelConfig.modelId,
        startTime,
        iterationCount,
        true
      );
    }

    // No refinement available - return original
    return createSkippedResult(prompt, modelConfig.modelId, startTime);
  } catch (error) {
    // Graceful degradation for any unhandled error (FR0.8)
    return createFallbackResult(prompt, modelConfig.modelId, startTime, error, iterationCount, lastRefinement);
  }
}
