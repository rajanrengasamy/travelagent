/**
 * Validate Stage Types
 *
 * Type definitions for the social validation stage (Stage 07).
 * These types define the output structure for the checkpoint file.
 *
 * @module stages/validate/types
 * @see PRD Section FR6 - Social Validation
 * @see TODO Section 15.0 - Social Validation Stage (Stage 07)
 */

import { z } from 'zod';
import { CandidateSchema, type Candidate } from '../../schemas/candidate.js';
import type { ValidationResult } from '../../validation/validator.js';

// ============================================================================
// Validation Statistics Schema
// ============================================================================

/**
 * ValidateStageStats: Statistics about the validation process.
 */
export const ValidateStageStatsSchema = z.object({
  /** Number of candidates received from upstream (ranked candidates) */
  inputCount: z.number().int().nonnegative(),

  /** Number of candidates in output (same as input) */
  outputCount: z.number().int().nonnegative(),

  /** Number of YouTube-derived candidates found */
  youtubeCount: z.number().int().nonnegative(),

  /** Number of candidates selected for validation */
  validatedCount: z.number().int().nonnegative(),

  /** Number that passed validation (verified or partially_verified) */
  passedCount: z.number().int().nonnegative(),

  /** Number that failed validation (conflict_detected) */
  failedCount: z.number().int().nonnegative(),

  /** Number that could not be validated (unverified) */
  unverifiedCount: z.number().int().nonnegative(),

  /** Number of candidates skipped (non-YouTube or beyond limit) */
  skippedCount: z.number().int().nonnegative(),

  /** Total validation time in milliseconds */
  totalValidationTimeMs: z.number().nonnegative(),
});

export type ValidateStageStats = z.infer<typeof ValidateStageStatsSchema>;

// ============================================================================
// Validation Detail Schema
// ============================================================================

/**
 * ValidationDetail: Details about a single validation attempt.
 * Used for debugging and analysis.
 */
export const ValidationDetailSchema = z.object({
  /** Candidate ID that was validated */
  candidateId: z.string().min(1),

  /** Original origin of the candidate */
  origin: z.string(),

  /** Title of the candidate */
  title: z.string(),

  /** Validation status result */
  status: z.enum(['verified', 'partially_verified', 'conflict_detected', 'unverified', 'not_applicable']),

  /** Duration of validation in milliseconds */
  durationMs: z.number().nonnegative(),

  /** Notes from validation (if any) */
  notes: z.string().optional(),
});

export type ValidationDetail = z.infer<typeof ValidationDetailSchema>;

// ============================================================================
// Stage Output Schema
// ============================================================================

/**
 * ValidateStageOutput: Output structure for the validate stage checkpoint.
 * Written to 07_candidates_validated.json.
 *
 * Contains all candidates (with updated validation fields for YouTube-derived
 * candidates) along with validation statistics and details.
 *
 * @see TODO Section 15.3.7 - Write checkpoint to 07_candidates_validated.json
 */
export const ValidateStageOutputSchema = z.object({
  /** All candidates with updated validation fields */
  candidates: z.array(CandidateSchema),

  /** Detailed validation results for each validated candidate */
  validationDetails: z.array(ValidationDetailSchema),

  /** Statistics about the validation process */
  stats: ValidateStageStatsSchema,
});

export type ValidateStageOutput = z.infer<typeof ValidateStageOutputSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create initial empty stats object.
 */
export function createEmptyStats(): ValidateStageStats {
  return {
    inputCount: 0,
    outputCount: 0,
    youtubeCount: 0,
    validatedCount: 0,
    passedCount: 0,
    failedCount: 0,
    unverifiedCount: 0,
    skippedCount: 0,
    totalValidationTimeMs: 0,
  };
}

/**
 * Convert a ValidationResult to ValidationDetail.
 *
 * @param result - Validation result from validator
 * @param candidate - Original candidate that was validated
 * @returns ValidationDetail for the checkpoint
 */
export function toValidationDetail(
  result: ValidationResult,
  candidate: Candidate
): ValidationDetail {
  return {
    candidateId: result.candidateId,
    origin: candidate.origin,
    title: candidate.title,
    status: result.status,
    durationMs: result.durationMs,
    notes: result.validation.notes,
  };
}

/**
 * Count validation results by status.
 *
 * @param results - Array of validation results
 * @returns Object with counts for each status
 */
export function countByStatus(
  results: ValidationResult[]
): { passed: number; failed: number; unverified: number } {
  let passed = 0;
  let failed = 0;
  let unverified = 0;

  for (const result of results) {
    switch (result.status) {
      case 'verified':
      case 'partially_verified':
        passed++;
        break;
      case 'conflict_detected':
        failed++;
        break;
      case 'unverified':
        unverified++;
        break;
    }
  }

  return { passed, failed, unverified };
}
