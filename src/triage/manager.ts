/**
 * Triage Manager
 *
 * High-level triage state management for categorizing candidates.
 * Builds on storage layer operations for a cleaner API.
 *
 * @see PRD Section 12.5 - Triage Schema
 * @module triage/manager
 */

import type { TriageStatus, TriageEntry, TriageState } from '../schemas/index.js';
import {
  saveTriage,
  loadTriage,
  updateTriageEntry as storageUpdateTriageEntry,
} from '../storage/triage.js';

/**
 * Set triage status for a candidate
 *
 * Creates or updates the triage entry for a candidate.
 * Automatically updates timestamps.
 *
 * @param sessionId - The session ID
 * @param candidateId - The candidate ID to triage
 * @param status - The triage status (must, research, maybe)
 * @param notes - Optional notes about the triage decision
 */
export async function setTriageStatus(
  sessionId: string,
  candidateId: string,
  status: TriageStatus,
  notes?: string
): Promise<void> {
  const entry: TriageEntry = {
    candidateId,
    status,
    notes,
    updatedAt: new Date().toISOString(),
  };

  await storageUpdateTriageEntry(sessionId, entry);
}

/**
 * Get triage status for a candidate
 *
 * @param sessionId - The session ID
 * @param candidateId - The candidate ID to look up
 * @returns The triage entry, or null if not triaged
 */
export async function getTriageStatus(
  sessionId: string,
  candidateId: string
): Promise<TriageEntry | null> {
  const triage = await loadTriage(sessionId);

  if (!triage) {
    return null;
  }

  const entry = triage.entries.find((e) => e.candidateId === candidateId);
  return entry ?? null;
}

/**
 * List all triaged candidates for a session
 *
 * @param sessionId - The session ID
 * @returns Array of all triage entries, empty if none
 */
export async function listTriagedCandidates(
  sessionId: string
): Promise<TriageEntry[]> {
  const triage = await loadTriage(sessionId);

  if (!triage) {
    return [];
  }

  return triage.entries;
}

/**
 * Clear all triage entries for a session
 *
 * Removes all triage state, resetting to empty.
 *
 * @param sessionId - The session ID
 */
export async function clearTriage(sessionId: string): Promise<void> {
  const emptyTriage: TriageState = {
    schemaVersion: 1,
    sessionId,
    entries: [],
    updatedAt: new Date().toISOString(),
  };

  await saveTriage(sessionId, emptyTriage);
}

/**
 * Remove a single triage entry
 *
 * Removes the triage status for a specific candidate.
 * Does nothing if the candidate was not triaged.
 *
 * @param sessionId - The session ID
 * @param candidateId - The candidate ID to untriage
 * @returns true if entry was removed, false if not found
 */
export async function removeTriageEntry(
  sessionId: string,
  candidateId: string
): Promise<boolean> {
  const triage = await loadTriage(sessionId);

  if (!triage) {
    return false;
  }

  const initialLength = triage.entries.length;
  triage.entries = triage.entries.filter((e) => e.candidateId !== candidateId);

  if (triage.entries.length === initialLength) {
    return false; // Entry not found
  }

  triage.updatedAt = new Date().toISOString();
  await saveTriage(sessionId, triage);
  return true;
}

/**
 * Get triage entries filtered by status
 *
 * @param sessionId - The session ID
 * @param status - The status to filter by
 * @returns Array of matching triage entries
 */
export async function listByStatus(
  sessionId: string,
  status: TriageStatus
): Promise<TriageEntry[]> {
  const entries = await listTriagedCandidates(sessionId);
  return entries.filter((e) => e.status === status);
}

/**
 * Count triaged candidates by status
 *
 * @param sessionId - The session ID
 * @returns Object with counts per status
 */
export async function getTriageCounts(
  sessionId: string
): Promise<{ must: number; research: number; maybe: number; total: number }> {
  const entries = await listTriagedCandidates(sessionId);

  const counts = {
    must: 0,
    research: 0,
    maybe: 0,
    total: entries.length,
  };

  for (const entry of entries) {
    counts[entry.status]++;
  }

  return counts;
}
