/**
 * Triage Schema
 *
 * Triage state for organizing candidates into action categories.
 *
 * @see PRD Section 12.5 - Triage Schema
 */

import { z } from 'zod';
import { SCHEMA_VERSIONS } from './versions.js';
import { ISO8601TimestampSchema } from './common.js';

/**
 * Triage status values
 *
 * - must: Must-do items for the trip
 * - research: Need more research before deciding
 * - maybe: Possible if time permits
 */
export const TriageStatusSchema = z.enum(['must', 'research', 'maybe']);

export type TriageStatus = z.infer<typeof TriageStatusSchema>;

/**
 * Single triage entry linking a candidate to a status
 */
export const TriageEntrySchema = z.object({
  candidateId: z.string().min(1),
  status: TriageStatusSchema,
  notes: z.string().optional(),
  updatedAt: ISO8601TimestampSchema,
});

export type TriageEntry = z.infer<typeof TriageEntrySchema>;

/**
 * Triage state for a session - collection of triage entries
 *
 * @see PRD Section 12.1 - schemaVersion for migration support
 */
export const TriageStateSchema = z.object({
  schemaVersion: z.number().int().positive().default(SCHEMA_VERSIONS.triage),
  sessionId: z.string().min(1),
  entries: z.array(TriageEntrySchema),
  updatedAt: ISO8601TimestampSchema,
});

export type TriageState = z.infer<typeof TriageStateSchema>;

/**
 * Parse and validate triage state
 */
export function parseTriageState(data: unknown): TriageState {
  return TriageStateSchema.parse(data);
}

/**
 * Safely parse triage state (returns success/error result)
 */
export function safeParseTriageState(data: unknown) {
  return TriageStateSchema.safeParse(data);
}
