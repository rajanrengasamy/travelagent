/**
 * Session Storage Operations
 *
 * CRUD operations for session data.
 * Sessions are stored as JSON files in the sessions directory.
 *
 * @module storage/sessions
 */

import * as fs from 'node:fs/promises';
import { SessionSchema, type Session } from '../schemas/index.js';
import { atomicWriteJson } from '../schemas/migrations/index.js';
import { getSessionsDir, getSessionJsonPath } from './paths.js';

/**
 * Save a session to disk
 *
 * @param session - The session to save
 */
export async function saveSession(session: Session): Promise<void> {
  const validated = SessionSchema.parse(session);
  const filePath = getSessionJsonPath(validated.sessionId);
  await atomicWriteJson(filePath, validated);
}

/**
 * Load a session from disk
 *
 * @param sessionId - The session ID to load
 * @returns The loaded session
 * @throws Error if session doesn't exist or is invalid
 */
export async function loadSession(sessionId: string): Promise<Session> {
  const filePath = getSessionJsonPath(sessionId);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    return SessionSchema.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Session not found: ${sessionId} (path: ${filePath})`);
    }
    throw error;
  }
}

/**
 * List all sessions
 *
 * @param options - Filter options
 * @param options.includeArchived - Include archived sessions (default: false)
 * @returns Array of sessions, sorted by createdAt descending
 */
export async function listSessions(options?: {
  includeArchived?: boolean;
}): Promise<Session[]> {
  const sessionsDir = getSessionsDir();
  const sessions: Session[] = [];

  try {
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      try {
        const session = await loadSession(entry.name);
        // Filter out archived unless explicitly included
        if (!options?.includeArchived && session.archivedAt) continue;
        sessions.push(session);
      } catch (error) {
        // Log warning for debugging but continue loading other sessions
        console.warn(`Warning: Failed to load session '${entry.name}':`,
          error instanceof Error ? error.message : String(error));
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  // Sort by createdAt descending (newest first)
  return sessions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Archive a session
 *
 * Sets the archivedAt timestamp on the session.
 *
 * @param sessionId - The session ID to archive
 * @throws Error if session doesn't exist
 */
export async function archiveSession(sessionId: string): Promise<void> {
  const session = await loadSession(sessionId);
  session.archivedAt = new Date().toISOString();
  await saveSession(session);
}

/**
 * Check if a session exists
 *
 * @param sessionId - The session ID to check
 * @returns true if session exists, false otherwise
 */
export async function sessionExists(sessionId: string): Promise<boolean> {
  const filePath = getSessionJsonPath(sessionId);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
