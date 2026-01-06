/**
 * Storage Layer
 *
 * File-based persistence for sessions, runs, stages, triage, and config.
 * All write operations use atomic temp file + rename pattern.
 *
 * @module storage
 */

// Path utilities
export {
  getDataDir,
  getSessionsDir,
  getSessionDir,
  getRunsDir,
  getRunDir,
  getStageFilePath,
  getLatestRunSymlink,
  getSessionJsonPath,
  getTriageFilePath,
  getEnhancementFilePath,
  getRunConfigPath,
  getManifestPath,
  getGlobalConfigPath,
  getExportsDir,
  getResultsJsonPath,
  getResultsMdPath,
} from './paths.js';

// Atomic operations
export { atomicWriteJson, readJson, fileExists } from './atomic.js';

// Session operations
export {
  saveSession,
  loadSession,
  listSessions,
  archiveSession,
  sessionExists,
} from './sessions.js';

// Run operations
export {
  createRunDir,
  saveRunConfig,
  loadRunConfig,
  listRuns,
  getLatestRunId,
  updateLatestSymlink,
} from './runs.js';

// Stage operations
export {
  saveStageFile,
  loadStageFile,
  stageFileExists,
  listStageFiles,
} from './stages.js';

// Triage operations
export { saveTriage, loadTriage, updateTriageEntry } from './triage.js';

// Config operations
export {
  GlobalConfigSchema,
  DEFAULT_GLOBAL_CONFIG,
  saveGlobalConfig,
  loadGlobalConfig,
  type GlobalConfig,
} from './config.js';
