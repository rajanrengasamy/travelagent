/**
 * Pipeline Infrastructure
 *
 * Stage execution framework for the 11-stage discovery pipeline.
 * Provides stage interfaces, execution context, checkpointing, and resume logic.
 *
 * @module pipeline
 * @see PRD Section 11 - Pipeline Infrastructure
 */

// Type definitions and constants
export {
  // Stage number and name types
  type StageNumber,
  type StageName,
  STAGE_NAMES,
  STAGE_NUMBERS,

  // Core interfaces
  type CostTracker,
  type Logger,
  type StageContext,
  type StageResult,
  type Stage,
  type ExecuteOptions,
  type StageInfo,

  // Helper functions
  formatStageNumber,
  buildStageId,
  isValidStageNumber,
  isValidStageName,
} from './types.js';

// Checkpoint writing
export {
  writeCheckpoint,
  readCheckpointData,
  readCheckpointMetadata,
  readCheckpoint,
  validateCheckpointStructure,
  getCheckpointValidationErrors,
  type CheckpointOptions,
  type CheckpointResult,
  type Checkpoint,
} from './checkpoint.js';

// Stage dependencies
export {
  // Constants
  STAGE_DEPENDENCIES,
  STAGE_IDS,
  STAGE_FILE_NAMES,
  TOTAL_STAGES,
  VALID_STAGE_NUMBERS,

  // Getters
  getStageId,
  getStageName,
  getImmediateUpstream,

  // Dependency traversal
  getUpstreamStages,
  getDownstreamStages,
  getStagesToSkip,
  getStagesToExecute,
  dependsOn,
} from './dependencies.js';

// Manifest generation
export {
  type StageFileInfo,
  type ManifestVerificationResult,
  calculateFileHash,
  createStageEntry,
  generateManifest,
  saveManifest,
  loadManifest,
  verifyManifest,
} from './manifest.js';

// Resume-from-stage logic
export {
  type StageValidationResult,
  type ResumeExecutionPlan,
  loadStageForResume,
  loadStageMetadataForResume,
  validateStageFile,
  isValidStageFileForResume,
  getStagesToSkip as getResumeStagesToSkip, // Aliased to avoid conflict with dependencies.js
  getStagesToExecute as getResumeStagesToExecute, // Aliased to avoid conflict with dependencies.js
  createResumeExecutionPlan,
  getInputStageNumber,
  getInputStageId,
} from './resume.js';

// Pipeline executor
export {
  type PipelineTiming,
  type StageError,
  type PipelineResult,
  type ExecutorCallbacks,
  PipelineExecutor,
  createPipelineExecutor,
} from './executor.js';
