/**
 * Run Configuration Schema
 *
 * Each pipeline run produces a run.json capturing exact configuration.
 * This enables reproducibility and debugging.
 *
 * @see PRD Section 11.5 - Run Configuration
 */

import { z } from 'zod';
import { SCHEMA_VERSIONS } from './versions.js';
import { ISO8601TimestampSchema } from './common.js';

// ============================================================================
// Run Status Schema
// ============================================================================

/**
 * Run status values
 * - running: Pipeline is executing
 * - completed: Pipeline finished successfully
 * - failed: Pipeline failed completely
 * - partial: Pipeline completed with degraded results
 */
export const RunStatusSchema = z.enum(['running', 'completed', 'failed', 'partial']);

export type RunStatus = z.infer<typeof RunStatusSchema>;

// ============================================================================
// Run Mode Schema
// ============================================================================

/**
 * Run mode values
 * - full: Complete pipeline run from stage 00
 * - from-stage: Resume from a specific stage
 */
export const RunModeSchema = z.enum(['full', 'from-stage']);

export type RunMode = z.infer<typeof RunModeSchema>;

// ============================================================================
// Nested Config Schemas
// ============================================================================

/**
 * Model configuration - which models are used for each LLM-powered stage
 * @see PRD Section 11.5 - RunConfig.models
 */
export const ModelsConfigSchema = z.object({
  enhancement: z.string().min(1),
  router: z.string().min(1),
  normalizer: z.string().min(1),
  aggregator: z.string().min(1),
  validator: z.string().min(1),
});

export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;

/**
 * Prompt versions - git SHA or version string for each prompt template
 * @see PRD Section 11.5 - RunConfig.promptVersions
 */
export const PromptVersionsSchema = z.object({
  enhancement: z.string().min(1),
  router: z.string().min(1),
  aggregator: z.string().min(1),
  youtubeExtraction: z.string().min(1),
  validation: z.string().min(1),
});

export type PromptVersions = z.infer<typeof PromptVersionsSchema>;

/**
 * Pipeline limits configuration
 */
export const LimitsConfigSchema = z.object({
  /** Max candidates each worker can return */
  maxCandidatesPerWorker: z.number().int().positive(),

  /** Max candidates to pass to aggregation */
  maxTopCandidates: z.number().int().positive(),

  /** Max candidates to validate */
  maxValidations: z.number().int().nonnegative(),

  /** Worker timeout in milliseconds */
  workerTimeout: z.number().int().positive(),
});

export type LimitsConfig = z.infer<typeof LimitsConfigSchema>;

/**
 * Feature flags for optional pipeline behavior
 * @see PRD Section 11.5 - RunConfig.flags
 */
export const FlagsConfigSchema = z.object({
  /** Skip the enhancement stage */
  skipEnhancement: z.boolean(),

  /** Skip the validation stage */
  skipValidation: z.boolean(),

  /** Skip the YouTube worker */
  skipYoutube: z.boolean(),
});

export type FlagsConfig = z.infer<typeof FlagsConfigSchema>;

/**
 * Seed source for from-stage runs - references the source stage file
 */
export const SeedSourceSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  stageFile: z.string().min(1),
});

export type SeedSource = z.infer<typeof SeedSourceSchema>;

// ============================================================================
// Main Run Config Schema
// ============================================================================

/**
 * RunConfig: Complete configuration for a pipeline run
 *
 * @see PRD Section 11.5 - "Each run produces run.json capturing exact configuration"
 */
export const RunConfigSchema = z.object({
  /** Schema version for forward compatibility */
  schemaVersion: z.number().int().positive().default(SCHEMA_VERSIONS.runConfig),

  /** Unique run identifier */
  runId: z.string().min(1),

  /** Session this run belongs to */
  sessionId: z.string().min(1),

  /** ISO8601 timestamp when run started */
  startedAt: ISO8601TimestampSchema,

  /** ISO8601 timestamp when run completed (if finished) */
  completedAt: ISO8601TimestampSchema.optional(),

  /** Current run status */
  status: RunStatusSchema,

  /** Run mode: full or from-stage */
  mode: RunModeSchema,

  /** Stage to resume from (when mode is 'from-stage') */
  fromStage: z.string().optional(),

  /** Source run ID for from-stage runs */
  sourceRunId: z.string().optional(),

  /** Model identifiers for each LLM-powered stage */
  models: ModelsConfigSchema,

  /** Version identifiers for prompt templates */
  promptVersions: PromptVersionsSchema,

  /** Pipeline execution limits */
  limits: LimitsConfigSchema,

  /** Feature flags */
  flags: FlagsConfigSchema,

  /** Seed source for from-stage runs */
  seedSource: SeedSourceSchema.optional(),
});

export type RunConfig = z.infer<typeof RunConfigSchema>;

// ============================================================================
// Schema Version
// ============================================================================

export const RUN_CONFIG_SCHEMA_VERSION = 1;

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default limits configuration
 */
export const DEFAULT_LIMITS: LimitsConfig = {
  maxCandidatesPerWorker: 20,
  maxTopCandidates: 50,
  maxValidations: 10,
  workerTimeout: 30000, // 30 seconds
};

/**
 * Default flags configuration
 */
export const DEFAULT_FLAGS: FlagsConfig = {
  skipEnhancement: false,
  skipValidation: false,
  skipYoutube: false,
};

/**
 * Default prompt versions configuration
 * @see PRD Section 11.5 - RunConfig.promptVersions
 */
export const DEFAULT_PROMPT_VERSIONS: PromptVersions = {
  enhancement: 'v1.0.0',
  router: 'v1.0.0',
  aggregator: 'v1.0.0',
  youtubeExtraction: 'v1.0.0',
  validation: 'v1.0.0',
};

/**
 * Default models configuration
 * @see PRD Section 9.1 - Model Selection Matrix
 */
export const DEFAULT_MODELS: ModelsConfig = {
  enhancement: 'gemini-3-flash-preview',
  router: 'gemini-3-flash-preview',
  normalizer: 'gemini-3-flash-preview',
  aggregator: 'gemini-3-flash-preview',
  validator: 'gemini-3-flash-preview',
};
