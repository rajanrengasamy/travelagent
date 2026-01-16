/**
 * Validation Module Exports
 *
 * Central export point for candidate validation functionality.
 *
 * @module validation
 * @see PRD Section FR6 - Social Validation
 * @see TODO Section 15.4 - Create src/validation/index.ts
 */

// Prompts
export {
  VALIDATION_PROMPT,
  VALIDATION_SYSTEM_PROMPT,
  buildValidationPrompt,
  buildBatchValidationPrompt,
} from './prompts.js';

// Validator
export {
  VALIDATION_TIMEOUT_MS,
  ValidationResponseSchema,
  type ValidationResponse,
  type ValidationResult,
  CandidateValidator,
  validateCandidate,
} from './validator.js';
