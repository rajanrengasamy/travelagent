/**
 * Session Archiving
 *
 * Archive and unarchive sessions for organization.
 *
 * @module sessions/archive
 */

import { loadSession, saveSession } from '../storage/sessions.js';
import { SessionIdSchema } from '../schemas/session.js';

/**
 * Archive a session.
 *
 * Sets the archivedAt timestamp to mark the session as archived.
 * Archived sessions are excluded from default listings.
 *
 * This operation is idempotent - archiving an already archived session
 * updates the archivedAt timestamp.
 *
 * @param sessionId - The session ID to archive
 * @throws {Error} If session doesn't exist
 *
 * @example
 * ```typescript
 * await archiveSession('20260107-japan-temples');
 * ```
 */
export async function archiveSession(sessionId: string): Promise<void> {
  // Validate session ID format
  const parseResult = SessionIdSchema.safeParse(sessionId);
  if (!parseResult.success) {
    throw new Error(`Invalid session ID format: ${sessionId}. Expected YYYYMMDD-slug format.`);
  }

  const session = await loadSession(sessionId);
  session.archivedAt = new Date().toISOString();
  await saveSession(session);
}

/**
 * Unarchive a session.
 *
 * Removes the archivedAt timestamp to restore the session to active status.
 *
 * This operation is idempotent - unarchiving an already active session
 * has no effect.
 *
 * @param sessionId - The session ID to unarchive
 * @throws {Error} If session doesn't exist
 *
 * @example
 * ```typescript
 * await unarchiveSession('20260107-japan-temples');
 * ```
 */
export async function unarchiveSession(sessionId: string): Promise<void> {
  // Validate session ID format
  const parseResult = SessionIdSchema.safeParse(sessionId);
  if (!parseResult.success) {
    throw new Error(`Invalid session ID format: ${sessionId}. Expected YYYYMMDD-slug format.`);
  }

  const session = await loadSession(sessionId);
  delete session.archivedAt;
  await saveSession(session);
}

/**
 * Check if a session is archived.
 *
 * @param sessionId - The session ID to check
 * @returns true if session is archived, false otherwise
 * @throws {Error} If session doesn't exist
 *
 * @example
 * ```typescript
 * if (await isArchived('20260107-japan-temples')) {
 *   console.log('Session is archived');
 * }
 * ```
 */
export async function isArchived(sessionId: string): Promise<boolean> {
  const session = await loadSession(sessionId);
  return session.archivedAt !== undefined;
}
