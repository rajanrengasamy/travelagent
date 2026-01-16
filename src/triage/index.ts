/**
 * Triage System
 *
 * Exports for the triage management system.
 * Allows users to categorize candidates as must/research/maybe.
 *
 * @module triage
 */

// Manager functions - high-level triage operations
export {
  setTriageStatus,
  getTriageStatus,
  listTriagedCandidates,
  clearTriage,
  removeTriageEntry,
  listByStatus,
  getTriageCounts,
} from './manager.js';

// Matcher functions - candidate matching across runs
export {
  generateTitleLocationHash,
  hashCandidate,
  matchCandidateAcrossRuns,
  buildCandidateHashMap,
  migrateTriageEntries,
  reconcileTriageState,
} from './matcher.js';

// Re-export types from schemas for convenience
export type { TriageStatus, TriageEntry, TriageState } from '../schemas/triage.js';
