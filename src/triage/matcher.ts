/**
 * Triage Matcher
 *
 * Handles candidate matching across discovery runs to preserve triage state.
 * When candidates are re-discovered, their IDs may change but title/location
 * remain the same. The matcher finds existing triage entries for these candidates.
 *
 * @module triage/matcher
 */

import * as crypto from 'node:crypto';
import type { Candidate } from '../schemas/index.js';
import type { TriageEntry } from '../schemas/triage.js';
import { loadTriage } from '../storage/triage.js';

/**
 * Generate a hash from title and location for matching
 *
 * Creates a consistent hash that can be used to match candidates
 * across runs even if their candidateIds change.
 *
 * @param title - The candidate title
 * @param locationText - Optional location text
 * @returns A hex hash string
 */
export function generateTitleLocationHash(
  title: string,
  locationText?: string
): string {
  // Normalize: lowercase, trim whitespace, remove extra spaces
  const normalizedTitle = title.toLowerCase().trim().replace(/\s+/g, ' ');
  const normalizedLocation = (locationText ?? '').toLowerCase().trim().replace(/\s+/g, ' ');

  const combined = `${normalizedTitle}|${normalizedLocation}`;
  return crypto.createHash('sha256').update(combined).digest('hex').slice(0, 16);
}

/**
 * Generate hash for a candidate
 *
 * @param candidate - The candidate to hash
 * @returns A hex hash string
 */
export function hashCandidate(candidate: Candidate): string {
  return generateTitleLocationHash(candidate.title, candidate.locationText);
}

/**
 * Match a candidate against existing triage entries
 *
 * Attempts to find an existing triage entry for a candidate:
 * 1. First tries exact candidateId match
 * 2. Falls back to title+location hash matching
 *
 * @param sessionId - The session ID
 * @param candidateId - The candidate's ID
 * @param titleHash - Hash of candidate's title+location
 * @param existingHashes - Map of candidateId to titleHash for existing entries
 * @returns The matched candidateId from triage, or null if no match
 */
export async function matchCandidateAcrossRuns(
  sessionId: string,
  candidateId: string,
  titleHash: string,
  existingHashes?: Map<string, string>
): Promise<string | null> {
  const triage = await loadTriage(sessionId);

  if (!triage || triage.entries.length === 0) {
    return null;
  }

  // Strategy 1: Exact candidateId match
  const exactMatch = triage.entries.find((e) => e.candidateId === candidateId);
  if (exactMatch) {
    return exactMatch.candidateId;
  }

  // Strategy 2: Title+location hash fallback
  if (existingHashes) {
    for (const entry of triage.entries) {
      const entryHash = existingHashes.get(entry.candidateId);
      if (entryHash === titleHash) {
        return entry.candidateId;
      }
    }
  }

  return null;
}

/**
 * Build a hash map for candidates
 *
 * Creates a map of candidateId -> titleHash for efficient lookups.
 *
 * @param candidates - Array of candidates
 * @returns Map of candidateId to titleHash
 */
export function buildCandidateHashMap(
  candidates: Candidate[]
): Map<string, string> {
  const hashMap = new Map<string, string>();

  for (const candidate of candidates) {
    const hash = hashCandidate(candidate);
    hashMap.set(candidate.candidateId, hash);
  }

  return hashMap;
}

/**
 * Migrate triage entries to new candidate IDs
 *
 * When candidates are re-discovered with different IDs, this function
 * updates the triage entries to use the new IDs while preserving status.
 *
 * @param sessionId - The session ID
 * @param oldToNewIdMap - Map of old candidateId to new candidateId
 * @returns Number of entries migrated
 */
export async function migrateTriageEntries(
  sessionId: string,
  oldToNewIdMap: Map<string, string>
): Promise<number> {
  const triage = await loadTriage(sessionId);

  if (!triage || triage.entries.length === 0) {
    return 0;
  }

  let migratedCount = 0;

  for (const entry of triage.entries) {
    const newId = oldToNewIdMap.get(entry.candidateId);
    if (newId && newId !== entry.candidateId) {
      entry.candidateId = newId;
      entry.updatedAt = new Date().toISOString();
      migratedCount++;
    }
  }

  if (migratedCount > 0) {
    triage.updatedAt = new Date().toISOString();
    // Import saveTriage dynamically to avoid circular dependency
    const { saveTriage } = await import('../storage/triage.js');
    await saveTriage(sessionId, triage);
  }

  return migratedCount;
}

/**
 * Reconcile new candidates with existing triage state
 *
 * Given a new set of candidates from a discovery run, this function:
 * 1. Finds matches for candidates that already have triage entries
 * 2. Updates triage entries with new candidateIds if needed
 * 3. Returns which new candidates have existing triage state
 *
 * This is the main entry point for preserving triage across runs.
 *
 * @param sessionId - The session ID
 * @param newCandidates - Candidates from the new discovery run
 * @param previousCandidates - Candidates from the previous run (for hash matching)
 * @returns Map of new candidateId to existing TriageEntry
 */
export async function reconcileTriageState(
  sessionId: string,
  newCandidates: Candidate[],
  previousCandidates: Candidate[]
): Promise<Map<string, TriageEntry>> {
  const triage = await loadTriage(sessionId);
  const result = new Map<string, TriageEntry>();

  if (!triage || triage.entries.length === 0) {
    return result;
  }

  // Build hash maps for matching
  const previousHashes = buildCandidateHashMap(previousCandidates);
  const newHashes = buildCandidateHashMap(newCandidates);

  // Create a lookup for triage entries by candidateId
  const triageByCandidate = new Map<string, TriageEntry>();
  for (const entry of triage.entries) {
    triageByCandidate.set(entry.candidateId, entry);
  }

  // Also create a lookup by hash from previous candidates
  const triageByHash = new Map<string, TriageEntry>();
  for (const entry of triage.entries) {
    const hash = previousHashes.get(entry.candidateId);
    if (hash) {
      triageByHash.set(hash, entry);
    }
  }

  // Match each new candidate
  for (const newCandidate of newCandidates) {
    // Strategy 1: Exact ID match
    const exactEntry = triageByCandidate.get(newCandidate.candidateId);
    if (exactEntry) {
      result.set(newCandidate.candidateId, exactEntry);
      continue;
    }

    // Strategy 2: Hash match
    const newHash = newHashes.get(newCandidate.candidateId);
    if (newHash) {
      const hashEntry = triageByHash.get(newHash);
      if (hashEntry) {
        result.set(newCandidate.candidateId, hashEntry);
      }
    }
  }

  return result;
}
