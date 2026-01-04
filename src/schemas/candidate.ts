/**
 * Candidate Schema
 *
 * Zod schemas for the Candidate data type.
 * Candidates are the core discovery results from workers.
 *
 * @see PRD Section 12.4 - Candidate Schema
 */

import { z } from 'zod';
import {
  SourceRefSchema,
  ValidationStatusSchema,
  CandidateTypeSchema,
  CandidateOriginSchema,
  CandidateConfidenceSchema,
  CoordinatesSchema,
} from './common.js';

// Re-export common types for convenience
export {
  SourceRefSchema,
  ValidationStatusSchema,
  CandidateTypeSchema,
  CandidateOriginSchema,
  CandidateConfidenceSchema,
  CoordinatesSchema,
} from './common.js';

export type {
  SourceRef,
  ValidationStatus,
  CandidateType,
  CandidateOrigin,
  CandidateConfidence,
  Coordinates,
} from './common.js';

// ============================================================================
// Nested Object Schemas
// ============================================================================

/**
 * CandidateValidation: Validation result for a candidate
 */
export const CandidateValidationSchema = z.object({
  status: ValidationStatusSchema,
  notes: z.string().optional(),
  sources: z.array(SourceRefSchema).optional(),
});

export type CandidateValidation = z.infer<typeof CandidateValidationSchema>;

/**
 * CandidateMetadata: Optional platform-specific data
 */
export const CandidateMetadataSchema = z.object({
  placeId: z.string().optional(), // Google Places ID
  videoId: z.string().optional(), // YouTube video ID
  channelName: z.string().optional(), // YouTube channel
  viewCount: z.number().nonnegative().int().optional(), // YouTube views
  rating: z.number().min(1).max(5).optional(), // Google rating (1-5 scale)
  priceLevel: z.number().int().min(0).max(4).optional(), // Google price level (0-4)
  timestampSeconds: z.number().nonnegative().int().optional(), // Video timestamp
  publishedAt: z.string().datetime().optional(), // When content was published
});

export type CandidateMetadata = z.infer<typeof CandidateMetadataSchema>;

// ============================================================================
// Main Candidate Schema
// ============================================================================

/**
 * Candidate: A discovered place, activity, or experience
 * @see PRD Section 12.4 - Candidate Schema
 */
export const CandidateSchema = z.object({
  candidateId: z.string().min(1),
  type: CandidateTypeSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  locationText: z.string().optional(),
  coordinates: CoordinatesSchema.optional(),
  tags: z.array(z.string()),
  origin: CandidateOriginSchema,
  sourceRefs: z.array(SourceRefSchema),
  confidence: CandidateConfidenceSchema,
  validation: CandidateValidationSchema.optional(),
  score: z.number().min(0).max(100), // Ranking score (0-100, higher is better)
  clusterId: z.string().optional(),
  metadata: CandidateMetadataSchema.optional(),
});

export type Candidate = z.infer<typeof CandidateSchema>;

// ============================================================================
// Schema Version
// ============================================================================

export const CANDIDATE_SCHEMA_VERSION = 1;
