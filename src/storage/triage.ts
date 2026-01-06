/**
 * Triage Storage Operations
 *
 * Triage state persists across pipeline runs, allowing users to
 * categorize candidates as must/research/maybe.
 *
 * @module storage/triage
 */

import * as fs from 'node:fs/promises';
import {
  TriageStateSchema,
  TriageEntrySchema,
  type TriageState,
  type TriageEntry,
} from '../schemas/index.js';
import { atomicWriteJson } from '../schemas/migrations/index.js';
import { getTriageFilePath } from './paths.js';

/**
 * Save triage state to disk
 *
 * @param sessionId - The session ID
 * @param triage - The triage state to save
 */
export async function saveTriage(sessionId: string, triage: TriageState): Promise<void> {
  const validated = TriageStateSchema.parse(triage);
  const filePath = getTriageFilePath(sessionId);
  await atomicWriteJson(filePath, validated);
}

/**
 * Load triage state from disk
 *
 * @param sessionId - The session ID
 * @returns The triage state, or null if no triage file exists
 * @throws Error if triage file exists but is invalid
 */
export async function loadTriage(sessionId: string): Promise<TriageState | null> {
  const filePath = getTriageFilePath(sessionId);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    return TriageStateSchema.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Update a single triage entry
 *
 * Creates the triage file if it doesn't exist.
 * Updates existing entry or adds new entry.
 *
 * @param sessionId - The session ID
 * @param entry - The triage entry to update/add
 */
export async function updateTriageEntry(
  sessionId: string,
  entry: TriageEntry
): Promise<void> {
  // Validate the entry
  const validatedEntry = TriageEntrySchema.parse(entry);

  // Load existing or create new
  let triage = await loadTriage(sessionId);

  if (!triage) {
    triage = {
      schemaVersion: 1,
      sessionId,
      entries: [],
      updatedAt: new Date().toISOString(),
    };
  }

  // Find and update or add
  const existingIndex = triage.entries.findIndex(
    (e) => e.candidateId === validatedEntry.candidateId
  );

  if (existingIndex >= 0) {
    triage.entries[existingIndex] = validatedEntry;
  } else {
    triage.entries.push(validatedEntry);
  }

  // Update timestamp
  triage.updatedAt = new Date().toISOString();

  await saveTriage(sessionId, triage);
}
