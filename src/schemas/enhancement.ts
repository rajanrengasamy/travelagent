/**
 * Enhancement Stage Schemas - Stage 00 prompt enhancement
 *
 * @see PRD Appendix A: Enhancement Stage (Stage 00)
 */

import { z } from 'zod';
import { FlexibilitySchema, DateRangeSchema, ISO8601TimestampSchema } from './common.js';

// ============================================
// Session Params Schema
// ============================================

/**
 * SessionParams contains the structured parameters extracted from user input.
 * This is the normalized form of user intent used throughout the pipeline.
 *
 * @see PRD Appendix A - SessionParams interface
 */
export const SessionParamsSchema = z.object({
  /** Destination locations */
  destinations: z.array(z.string().min(1)),

  /** Travel date range */
  dateRange: DateRangeSchema,

  /** Date flexibility preference */
  flexibility: FlexibilitySchema,

  /** User interests and activities */
  interests: z.array(z.string().min(1)),

  /** Additional constraints (budget, accessibility, etc.) */
  constraints: z.record(z.string(), z.unknown()),

  /** Tags inferred from the prompt by the enhancement model */
  inferredTags: z.array(z.string()),
});

export type SessionParams = z.infer<typeof SessionParamsSchema>;

/**
 * Partial session params for incremental extraction
 */
export const PartialSessionParamsSchema = SessionParamsSchema.partial();

export type PartialSessionParams = z.infer<typeof PartialSessionParamsSchema>;

// ============================================
// Prompt Analysis Schema
// ============================================

/**
 * PromptAnalysis is the result of analyzing user input for clarity and completeness.
 * When isClear=false, clarifyingQuestions should contain 2-4 questions.
 *
 * @see PRD Appendix A - PromptAnalysis interface
 */
export const PromptAnalysisSchema = z.object({
  /** Whether the prompt is clear enough to proceed */
  isClear: z.boolean(),

  /** Confidence score from 0.0 to 1.0 */
  confidence: z.number().min(0).max(1),

  /** Suggested refinement if the prompt could be improved */
  suggestedRefinement: z.string().optional(),

  /** Parameters that could be extracted from the prompt */
  extractedParams: PartialSessionParamsSchema.optional(),

  /** Questions to ask user when isClear=false (2-4 questions) */
  clarifyingQuestions: z.array(z.string()).min(2).max(4).optional(),

  /** Model's reasoning about the analysis */
  reasoning: z.string(),

  /** Intents detected in the prompt (e.g., "adventure", "relaxation", "culture") */
  detectedIntents: z.array(z.string()).optional(),
});

export type PromptAnalysis = z.infer<typeof PromptAnalysisSchema>;

// ============================================
// Enhancement Result Schema
// ============================================

/**
 * EnhancementResult is the output of the enhancement stage.
 * Contains the refined prompt and extracted parameters.
 *
 * @see PRD Appendix A - EnhancementResult interface
 */
export const EnhancementResultSchema = z.object({
  /** Schema version for forward compatibility */
  schemaVersion: z.number().int().min(1).default(1),

  /** The user's original unmodified prompt */
  originalPrompt: z.string().min(1),

  /** The enhanced/refined prompt */
  refinedPrompt: z.string().min(1),

  /** Whether the prompt was actually modified */
  wasEnhanced: z.boolean(),

  /** Parameters extracted from the prompt */
  extractedParams: PartialSessionParamsSchema,

  /** Number of enhancement iterations performed */
  iterationCount: z.number().int().min(0),

  /** Model identifier used for enhancement */
  modelUsed: z.string(),

  /** Time taken in milliseconds */
  processingTimeMs: z.number().int().min(0),

  /** ISO8601 timestamp when enhancement completed */
  createdAt: ISO8601TimestampSchema,
});

export type EnhancementResult = z.infer<typeof EnhancementResultSchema>;

// ============================================
// Enhancement Action Schema
// ============================================

/**
 * User actions for the enhancement interactive flow.
 * - accept: Accept the enhanced prompt
 * - reject: Reject and use original prompt
 * - feedback: Provide feedback for another iteration
 * - skip: Skip enhancement entirely
 */
export const EnhancementActionSchema = z.enum(['accept', 'reject', 'feedback', 'skip']);

export type EnhancementAction = z.infer<typeof EnhancementActionSchema>;

// ============================================
// Enhancement Config Schema
// ============================================

/**
 * Configuration for the enhancement stage.
 *
 * @see PRD Appendix A - EnhancementConfig interface
 */
export const EnhancementConfigSchema = z.object({
  /** Skip enhancement stage entirely */
  skip: z.boolean().default(false),

  /** Model to use for enhancement */
  model: z.enum(['gemini', 'gpt', 'claude']).default('gemini'),

  /** Maximum number of enhancement iterations */
  maxIterations: z.number().int().min(1).max(10).default(3),

  /** Timeout in milliseconds */
  timeoutMs: z.number().int().min(1000).max(60000).default(15000),

  /** Automatically accept enhancements without user confirmation */
  autoEnhance: z.boolean().default(false),
});

export type EnhancementConfig = z.infer<typeof EnhancementConfigSchema>;

/**
 * Default enhancement configuration values
 */
export const DEFAULT_ENHANCEMENT_CONFIG: EnhancementConfig = {
  skip: false,
  model: 'gemini',
  maxIterations: 3,
  timeoutMs: 15000,
  autoEnhance: false,
};
