/**
 * Zod Schemas for All Data Types
 *
 * Central export point for all schema definitions used in the pipeline.
 *
 * @see PRD Section 12 - Data Model
 * @see PRD Appendix A - TypeScript Types
 */

// ============================================================================
// Version Registry
// ============================================================================

export { SCHEMA_VERSIONS, getCurrentVersion, isCurrentVersion, type SchemaType } from './versions.js';

// ============================================================================
// Common Types
// ============================================================================

export {
  FlexibilitySchema,
  DateRangeSchema,
  ISO8601TimestampSchema,
  CoordinatesSchema,
  SourceRefSchema,
  ValidationStatusSchema,
  CandidateTypeSchema,
  CandidateOriginSchema,
  CandidateConfidenceSchema,
  type Flexibility,
  type DateRange,
  type ISO8601Timestamp,
  type Coordinates,
  type SourceRef,
  type ValidationStatus,
  type CandidateType,
  type CandidateOrigin,
  type CandidateConfidence,
} from './common.js';

// ============================================================================
// Session Schema (PRD 12.3)
// ============================================================================

export {
  SessionSchema,
  SessionIdSchema,
  CreateSessionInputSchema,
  SESSION_ID_PATTERN,
  type Session,
  type CreateSessionInput,
} from './session.js';

// ============================================================================
// Enhancement Stage Schema (PRD Appendix A)
// ============================================================================

export {
  SessionParamsSchema,
  PartialSessionParamsSchema,
  PromptAnalysisSchema,
  EnhancementResultSchema,
  EnhancementActionSchema,
  EnhancementConfigSchema,
  DEFAULT_ENHANCEMENT_CONFIG,
  type SessionParams,
  type PartialSessionParams,
  type PromptAnalysis,
  type EnhancementResult,
  type EnhancementAction,
  type EnhancementConfig,
} from './enhancement.js';

// ============================================================================
// Candidate Schema (PRD 12.4)
// ============================================================================

export {
  CandidateValidationSchema,
  CandidateMetadataSchema,
  CandidateSchema,
  CANDIDATE_SCHEMA_VERSION,
  type CandidateValidation,
  type CandidateMetadata,
  type Candidate,
} from './candidate.js';

// ============================================================================
// Triage Schema (PRD 12.5)
// ============================================================================

export {
  TriageStatusSchema,
  TriageEntrySchema,
  TriageStateSchema,
  parseTriageState,
  safeParseTriageState,
  type TriageStatus,
  type TriageEntry,
  type TriageState,
} from './triage.js';

// ============================================================================
// Discovery Results Schema (PRD 12.6)
// ============================================================================

export {
  DegradationLevelSchema,
  WorkerStatusSchema,
  WorkerSummarySchema,
  ClusterInfoSchema,
  DegradationSchema,
  DiscoveryResultsSchema,
  DISCOVERY_RESULTS_SCHEMA_VERSION,
  type DegradationLevel,
  type WorkerStatus,
  type WorkerSummary,
  type ClusterInfo,
  type Degradation,
  type DiscoveryResults,
} from './discovery-results.js';

// ============================================================================
// Cost Schema (PRD 12.7)
// ============================================================================

export {
  TokenUsageSchema,
  LLMProviderCostSchema,
  PlacesProviderCostSchema,
  YouTubeProviderCostSchema,
  ProvidersSchema,
  CostBreakdownSchema,
  COST_SCHEMA_VERSION,
  createEmptyCostBreakdown,
  calculateTotalCost,
  type TokenUsage,
  type LLMProviderCost,
  type PlacesProviderCost,
  type YouTubeProviderCost,
  type Providers,
  type CostBreakdown,
} from './cost.js';

// ============================================================================
// Stage Metadata Schema (PRD 11.3)
// ============================================================================

export {
  StageIdSchema,
  StageMetadataSchema,
  StageOutputSchema,
  STAGE_ID_PATTERN,
  STAGE_SCHEMA_VERSION,
  createStageMetadata,
  parseStageNumber,
  parseStageName,
  type StageMetadata,
} from './stage.js';

// ============================================================================
// Run Configuration Schema (PRD 11.5)
// ============================================================================

export {
  RunStatusSchema,
  RunModeSchema,
  ModelsConfigSchema,
  PromptVersionsSchema,
  LimitsConfigSchema,
  FlagsConfigSchema,
  SeedSourceSchema,
  RunConfigSchema,
  RUN_CONFIG_SCHEMA_VERSION,
  DEFAULT_LIMITS,
  DEFAULT_FLAGS,
  type RunStatus,
  type RunMode,
  type ModelsConfig,
  type PromptVersions,
  type LimitsConfig,
  type FlagsConfig,
  type SeedSource,
  type RunConfig,
} from './run-config.js';

// ============================================================================
// Run Manifest Schema (PRD 11.6)
// ============================================================================

export {
  ManifestStageEntrySchema,
  RunManifestSchema,
  MANIFEST_SCHEMA_VERSION,
  createEmptyManifest,
  addStageToManifest,
  markStagesSkipped,
  finalizeManifest,
  type ManifestStageEntry,
  type RunManifest,
} from './manifest.js';

// ============================================================================
// Worker Schemas (PRD Appendix A)
// ============================================================================

export {
  WorkerExecutionStatusSchema,
  EnrichedIntentSchema,
  WorkerAssignmentSchema,
  ValidationPlanSchema,
  WorkerPlanSchema,
  WorkerTokenUsageSchema,
  WorkerOutputSchema,
  WORKER_SCHEMA_VERSION,
  createErrorWorkerOutput,
  createSkippedWorkerOutput,
  type WorkerExecutionStatus,
  type EnrichedIntent,
  type WorkerAssignment,
  type ValidationPlan,
  type WorkerPlan,
  type WorkerTokenUsage,
  type WorkerOutput,
} from './worker.js';

// ============================================================================
// Migration Utilities (PRD 12.1)
// ============================================================================

export {
  migrateSchema,
  needsMigration,
  registerMigration,
  hasMigration,
  getRegisteredMigrations,
  loadAndMigrate,
  loadMigrateAndSave,
  atomicWriteJson,
  type Migration,
} from './migrations/index.js';
