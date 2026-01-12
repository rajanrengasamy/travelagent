/**
 * Session Creation
 *
 * Creates new travel planning sessions with validation and ID generation.
 *
 * @module sessions/create
 */

import { CreateSessionInputSchema, SessionSchema, type Session } from '../schemas/index.js';
import { saveSession, listSessions as storageListSessions } from '../storage/sessions.js';
import { getSessionDir } from '../storage/paths.js';
import { generateSessionId, handleCollision } from './id-generator.js';
import type { Flexibility } from '../schemas/common.js';
import * as fs from 'node:fs/promises';

/**
 * Parameters for creating a new session
 */
export interface CreateSessionParams {
  /** User-friendly title for the session */
  title: string;

  /** List of destination locations */
  destinations: string[];

  /** Travel date range */
  dateRange: {
    start: string;
    end: string;
  };

  /** Date flexibility preference */
  flexibility: Flexibility;

  /** User interests/activities */
  interests: string[];

  /** Optional constraints (budget, accessibility, etc.) */
  constraints?: Record<string, unknown>;

  /** Original user prompt (used for ID generation) */
  prompt?: string;
}

/**
 * Create a new travel planning session.
 *
 * This function:
 * 1. Validates the input parameters
 * 2. Generates a human-readable session ID
 * 3. Handles ID collisions if needed
 * 4. Creates the session directory structure
 * 5. Saves the session to disk
 *
 * @param params - Session creation parameters
 * @returns The created session
 * @throws {ZodError} If validation fails
 *
 * @example
 * ```typescript
 * const session = await createSession({
 *   title: 'Japan Adventure',
 *   destinations: ['Tokyo', 'Kyoto'],
 *   dateRange: { start: '2026-04-01', end: '2026-04-14' },
 *   flexibility: { type: 'plusMinusDays', days: 3 },
 *   interests: ['temples', 'food', 'cherry blossoms'],
 *   prompt: 'Japan in April, temples and food'
 * });
 * ```
 */
export async function createSession(params: CreateSessionParams): Promise<Session> {
  // Validate input parameters
  const validatedInput = CreateSessionInputSchema.parse({
    title: params.title,
    destinations: params.destinations,
    dateRange: params.dateRange,
    flexibility: params.flexibility,
    interests: params.interests,
    constraints: params.constraints,
  });

  // Generate session ID
  const baseId = generateSessionId(
    params.prompt ?? '',
    params.destinations,
    params.interests
  );

  // Get existing session IDs for collision detection
  const existingSessions = await storageListSessions({ includeArchived: true });
  const existingIds = existingSessions.map((s) => s.sessionId);

  // Handle potential collision
  const sessionId = handleCollision(baseId, existingIds);

  // Create session object
  const session: Session = SessionSchema.parse({
    schemaVersion: 1,
    sessionId,
    title: validatedInput.title,
    destinations: validatedInput.destinations,
    dateRange: validatedInput.dateRange,
    flexibility: validatedInput.flexibility,
    interests: validatedInput.interests,
    constraints: validatedInput.constraints,
    createdAt: new Date().toISOString(),
  });

  // Create session directory
  const sessionDir = getSessionDir(sessionId);
  await fs.mkdir(sessionDir, { recursive: true });

  // Save session
  await saveSession(session);

  return session;
}
