/**
 * Session Schema - Core session data structure
 *
 * ## Schema Versioning Design
 *
 * The `schemaVersion` field uses `.default(1)` which is intentional for these reasons:
 *
 * 1. **New session creation**: When creating a session via `SessionSchema.parse()`,
 *    callers don't need to explicitly set schemaVersion - it defaults to 1.
 *    This is the primary input convenience the default provides.
 *
 * 2. **Persisted data loading**: When reading data from disk, the migration
 *    framework (`src/schemas/migrations/index.ts`) handles versioning independently:
 *    - `extractSchemaVersion()` reads the version from raw JSON
 *    - Missing/invalid versions default to 1 (legacy data assumption)
 *    - `migrateSchema()` runs the migration chain and updates the version
 *    - After migration, `schemaVersion` is always explicitly set to current
 *
 * 3. **The default is NOT a security risk**: Persisted data without schemaVersion
 *    is treated as version 1 by the migration framework, which then applies
 *    any necessary migrations before Zod validation occurs.
 *
 * This pattern is consistent across all versioned schemas in the project
 * (session, stage, triage, enhancement, run-config, manifest).
 *
 * @see PRD Section 12.1 - Schema Versioning Strategy
 * @see PRD Section 12.3 - Session Schema
 * @see src/schemas/migrations/index.ts - Migration framework
 */

import { z } from 'zod';
import { FlexibilitySchema, DateRangeSchema, ISO8601TimestampSchema } from './common.js';

// ============================================
// Session ID Pattern
// ============================================

/**
 * Session IDs are human-readable with format: YYYYMMDD-slug
 * Examples: "20240115-tokyo-adventure", "20240220-europe-trip"
 */
export const SESSION_ID_PATTERN = /^\d{8}-[a-z0-9-]+$/;

export const SessionIdSchema = z
  .string()
  .regex(SESSION_ID_PATTERN, 'Session ID must match pattern YYYYMMDD-slug (e.g., "20240115-tokyo-trip")');

// ============================================
// Session Schema
// ============================================

/**
 * Session represents a single travel planning session.
 * Sessions contain the user's intent and track pipeline runs.
 *
 * @see PRD Section 12.3
 */
export const SessionSchema = z.object({
  /**
   * Schema version for forward compatibility.
   * Default is applied during input parsing (new session creation).
   * For persisted data, migration framework handles missing versions.
   * @see File-level JSDoc for full versioning design explanation
   */
  schemaVersion: z.number().int().min(1).default(1),

  /** Human-readable session ID: YYYYMMDD-slug */
  sessionId: SessionIdSchema,

  /** User-friendly title for the session */
  title: z.string().min(1, 'Title is required'),

  /** List of destination locations (at least 1 required) */
  destinations: z.array(z.string().min(1)).min(1, 'At least one destination is required'),

  /** Travel date range */
  dateRange: DateRangeSchema,

  /** Date flexibility preference */
  flexibility: FlexibilitySchema,

  /** User interests/activities (at least 1 required) */
  interests: z.array(z.string().min(1)).min(1, 'At least one interest is required'),

  /** Optional constraints (budget, accessibility, dietary, etc.) */
  constraints: z.record(z.string(), z.unknown()).optional(),

  /** ISO8601 timestamp when session was created */
  createdAt: ISO8601TimestampSchema,

  /** ISO8601 timestamp when session was archived (if applicable) */
  archivedAt: ISO8601TimestampSchema.optional(),

  /** ID of the most recent pipeline run */
  lastRunId: z.string().optional(),
});

export type Session = z.infer<typeof SessionSchema>;

// ============================================
// Session Creation Helper
// ============================================

/**
 * Input schema for creating a new session (without generated fields)
 */
export const CreateSessionInputSchema = SessionSchema.omit({
  schemaVersion: true,
  sessionId: true,
  createdAt: true,
  archivedAt: true,
  lastRunId: true,
});

export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;
