/**
 * Enhancement Module
 *
 * Stage 00 prompt enhancement functionality.
 * Provides the complete enhancement pipeline for transforming vague
 * user prompts into structured, actionable travel session parameters.
 *
 * @module enhancement
 * @see PRD Section FR0.6-FR0.9
 */

// Export main enhancer
export { enhancePrompt, EnhanceOptions, EnhancementTimeoutError, TotalTimeoutError } from './enhancer.js';

// Export analysis
export { analyzePrompt } from './analyzer.js';

// Export questions
export { generateClarifyingQuestions, needsClarification, countMissingCriticalDimensions } from './questions.js';

// Export refinement
export {
  generateRefinement,
  generateRefinementWithAnswers,
  generateRefinementWithFeedback,
  createFallbackRefinement,
  isValidRefinement,
  RefinementSuggestion,
} from './refinement.js';

// Export extractor
export {
  extractSessionParams,
  parseDestinations,
  parseDateRange,
  parseFlexibility,
  parseInterests,
  parseConstraints,
} from './extractor.js';

// Re-export types from schemas
export type {
  EnhancementResult,
  EnhancementConfig,
  EnhancementAction,
  PromptAnalysis,
  SessionParams,
  PartialSessionParams,
} from '../schemas/enhancement.js';

export { DEFAULT_ENHANCEMENT_CONFIG, EnhancementResultSchema } from '../schemas/enhancement.js';
