/**
 * Common Zod Schemas - Shared types used across the pipeline
 *
 * @see PRD Section 12.3 for Flexibility and DateRange definitions
 */

import { z } from 'zod';

// ============================================
// Flexibility Schema
// ============================================

/**
 * Flexibility represents how flexible the user is with their travel dates.
 * - 'none': Fixed dates, no flexibility
 * - 'plusMinusDays': Flexible by N days before/after
 * - 'monthOnly': Only specified the month, any dates within work
 */
export const FlexibilitySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('none'),
  }),
  z.object({
    type: z.literal('plusMinusDays'),
    days: z.number().int().min(1).max(30),
  }),
  z.object({
    type: z.literal('monthOnly'),
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
  }),
]);

export type Flexibility = z.infer<typeof FlexibilitySchema>;

// ============================================
// DateRange Schema
// ============================================

/**
 * DateRange represents a start and end date for travel.
 * Dates are stored as ISO8601 date strings (YYYY-MM-DD).
 */
export const DateRangeSchema = z
  .object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format'),
  })
  .refine((data) => new Date(data.start) <= new Date(data.end), {
    message: 'Start date must be before or equal to end date',
    path: ['end'],
  });

export type DateRange = z.infer<typeof DateRangeSchema>;

// ============================================
// ISO8601 Timestamp Schema
// ============================================

/**
 * ISO8601 timestamp string (e.g., "2024-01-15T10:30:00.000Z")
 */
export const ISO8601TimestampSchema = z.string().datetime({ message: 'Must be a valid ISO8601 timestamp' });

export type ISO8601Timestamp = z.infer<typeof ISO8601TimestampSchema>;

// ============================================
// Coordinates Schema
// ============================================

/**
 * Geographic coordinates (latitude/longitude).
 * @see PRD Section 12.4 - Candidate.coordinates
 */
export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type Coordinates = z.infer<typeof CoordinatesSchema>;

// ============================================
// Source Reference Schema
// ============================================

/**
 * Source reference for candidate attribution.
 * Every candidate must have at least one source reference with a URL.
 * @see PRD Section 12.4 - SourceRef type
 */
export const SourceRefSchema = z.object({
  /** URL of the source */
  url: z.string().url(),
  /** Publisher/website name */
  publisher: z.string().optional(),
  /** When the source was retrieved (ISO8601) */
  retrievedAt: ISO8601TimestampSchema,
  /** Relevant snippet from the source */
  snippet: z.string().optional(),
});

export type SourceRef = z.infer<typeof SourceRefSchema>;

// ============================================
// Enumeration Schemas
// ============================================

/**
 * Validation status for candidates after cross-referencing.
 * @see PRD Section 12.4 - ValidationStatus type
 */
export const ValidationStatusSchema = z.enum([
  'verified',
  'partially_verified',
  'conflict_detected',
  'unverified',
  'not_applicable',
]);

export type ValidationStatus = z.infer<typeof ValidationStatusSchema>;

/**
 * Type of candidate (place, activity, etc.).
 * @see PRD Section 12.4 - CandidateType type
 */
export const CandidateTypeSchema = z.enum([
  'place',
  'activity',
  'neighborhood',
  'daytrip',
  'experience',
  'food',
]);

export type CandidateType = z.infer<typeof CandidateTypeSchema>;

/**
 * Origin worker that produced the candidate.
 * @see PRD Section 12.4 - CandidateOrigin type
 */
export const CandidateOriginSchema = z.enum(['web', 'places', 'youtube']);

export type CandidateOrigin = z.infer<typeof CandidateOriginSchema>;

/**
 * Confidence level for candidate data quality.
 * @see PRD Section 12.4 - CandidateConfidence type
 */
export const CandidateConfidenceSchema = z.enum([
  'needs_verification', // No SourceRef available
  'provisional', // Social-derived, awaiting validation
  'verified', // Has confirmed SourceRef(s)
  'high', // Multiple high-quality sources
]);

export type CandidateConfidence = z.infer<typeof CandidateConfidenceSchema>;

// Alias for backward compatibility
export const ISO8601Schema = ISO8601TimestampSchema;
export type ISO8601 = ISO8601Timestamp;
