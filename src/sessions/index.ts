/**
 * Session Management Module
 *
 * High-level session operations for the Travel Discovery Orchestrator.
 *
 * This module provides:
 * - Human-readable ID generation (sessions and runs)
 * - Session creation with validation
 * - Session listing with filtering
 * - Session details with run history
 * - Session archiving/unarchiving
 *
 * @module sessions
 */

// ID Generation
export {
  generateSessionId,
  generateSlug,
  handleCollision,
  generateRunId,
} from './id-generator.js';

// Session Creation
export { createSession, type CreateSessionParams } from './create.js';

// Session Listing
export {
  listSessions,
  getSessionCount,
  type SessionSummary,
  type ListSessionsOptions,
} from './list.js';

// Session Viewing
export {
  viewSession,
  type SessionDetails,
  type RunSummary,
} from './view.js';

// Session Archiving
export { archiveSession, unarchiveSession, isArchived } from './archive.js';
