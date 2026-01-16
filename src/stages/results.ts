/**
 * Results Stage (Stage 10)
 *
 * Final stage of the discovery pipeline. Takes aggregated output from Stage 09
 * and produces the final DiscoveryResults with JSON and Markdown exports.
 *
 * **Checkpoint Contract**: This stage returns a `ResultsStageOutput`
 * structure containing the discovery results and export file paths.
 * The checkpoint is written to `10_results.json`.
 *
 * @module stages/results
 * @see PRD Section 18.0 - Results Stage (Stage 10)
 * @see TODO Section 18.1 - Stage implementation
 */

import * as path from 'node:path';
import type { TypedStage, StageContext, StageResult } from '../pipeline/types.js';
import { readCheckpointData } from '../pipeline/checkpoint.js';
import { createStageMetadata } from '../schemas/stage.js';
import type { AggregatorOutput } from './aggregate/types.js';
import type { WorkerOutput } from '../schemas/worker.js';
import type {
  ResultsStageOutput,
  ResultsExportPaths,
  ResultsStageStats,
  DiscoveryResults,
  DegradationLevel,
} from './results/types.js';
import { exportResultsJson, exportResultsMd } from './results/export.js';
import { DISCOVERY_RESULTS_SCHEMA_VERSION, type WorkerSummary, type WorkerStatus } from '../schemas/discovery-results.js';

// ============================================================================
// Constants
// ============================================================================

/** Stage identifier */
const STAGE_ID = '10_results';
const STAGE_NAME = 'results' as const;
const STAGE_NUMBER = 10 as const;

/** Upstream stage identifier */
const UPSTREAM_STAGE = '09_aggregator_output';

// ============================================================================
// Stage Implementation
// ============================================================================

/**
 * Results Stage (Stage 10)
 *
 * Final stage that transforms aggregated output into discovery results
 * and exports them to JSON and Markdown files.
 *
 * Input: AggregatorOutput from Stage 09
 * Output: ResultsStageOutput - discovery results with export paths
 *
 * @see TODO Section 18.1.1 - Implement resultsStage
 * @see TODO Section 18.1.5 - Write checkpoint to 10_results.json
 *
 * @example
 * ```typescript
 * const result = await resultsStage.execute(context, aggregatorOutput);
 * console.log(`Exported to: ${result.data.exportPaths.resultsJson}`);
 * console.log(`Markdown at: ${result.data.exportPaths.resultsMd}`);
 * ```
 */
export const resultsStage: TypedStage<AggregatorOutput, ResultsStageOutput> = {
  id: STAGE_ID,
  name: STAGE_NAME,
  number: STAGE_NUMBER,

  async execute(
    context: StageContext,
    input: AggregatorOutput
  ): Promise<StageResult<ResultsStageOutput>> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    try {
      context.logger?.info(
        `[results] Processing ${input.candidates.length} candidates for final output`
      );

      // Build discovery results from aggregator output
      const discoveryResults = await buildDiscoveryResults(input, context, startTime);

      // Determine export paths
      const exportPaths = buildExportPaths(context);

      // Export to JSON and Markdown
      context.logger?.info(`[results] Exporting to ${exportPaths.resultsJson}`);
      await exportResultsJson(discoveryResults, exportPaths.resultsJson);

      context.logger?.info(`[results] Exporting to ${exportPaths.resultsMd}`);
      await exportResultsMd(discoveryResults, input.narrative, exportPaths.resultsMd);

      // Calculate final duration
      const durationMs = Date.now() - startTime;

      // Build stats
      const stats: ResultsStageStats = {
        totalCandidates: input.candidates.length,
        exportedAt: new Date().toISOString(),
        durationMs,
        narrativeIncluded: input.narrative !== null,
        degradationLevel: discoveryResults.degradation.level,
      };

      context.logger?.info(
        `[results] Completed in ${durationMs}ms - ${input.candidates.length} candidates exported`
      );

      // Build stage output
      const output: ResultsStageOutput = {
        discoveryResults,
        exportPaths,
        stats,
      };

      return buildStageResult(output, context, startedAt, startTime);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.logger?.error(`[results] Stage execution failed: ${message}`);
      throw new Error(`Results stage failed: ${message}`, { cause: error });
    }
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build DiscoveryResults from AggregatorOutput.
 *
 * Transforms the aggregator output into the final discovery results format
 * with proper session metadata and degradation tracking.
 *
 * Attempts to read worker summaries from Stage 03 checkpoint for complete
 * degradation reporting. Falls back to empty array if checkpoint unavailable.
 */
async function buildDiscoveryResults(
  input: AggregatorOutput,
  context: StageContext,
  startTime: number
): Promise<DiscoveryResults> {
  // Determine degradation level based on narrative and candidate count
  const degradationLevel = determineDegradationLevel(input);

  // Try to load worker summaries from Stage 03 checkpoint
  // Falls back to empty array if checkpoint unavailable
  const workerSummary = await loadWorkerSummary(context);

  // Calculate duration from stage start
  // Note: Total pipeline duration would be tracked by the pipeline executor
  const durationMs = Date.now() - startTime;

  return {
    schemaVersion: DISCOVERY_RESULTS_SCHEMA_VERSION,
    sessionId: context.sessionId,
    runId: context.runId,
    createdAt: new Date().toISOString(),
    durationMs,
    candidates: input.candidates,
    workerSummary,
    degradation: {
      level: degradationLevel,
      failedWorkers: extractFailedWorkers(workerSummary),
      warnings: buildWarnings(input, degradationLevel),
    },
  };
}

/**
 * Load worker summaries from Stage 03 checkpoint.
 *
 * Attempts to read the 03_worker_outputs checkpoint and convert
 * WorkerOutput[] to WorkerSummary[]. Returns empty array on failure.
 *
 * @see PRD Section 12.6 - Discovery Results must include worker summary
 */
async function loadWorkerSummary(context: StageContext): Promise<WorkerSummary[]> {
  try {
    // Read worker outputs from Stage 03 checkpoint
    const workerOutputs = await readCheckpointData<WorkerOutput[]>(
      context.sessionId,
      context.runId,
      '03_worker_outputs'
    );

    // Convert WorkerOutput[] to WorkerSummary[]
    return workerOutputs.map((output): WorkerSummary => ({
      workerId: output.workerId,
      status: convertWorkerStatus(output.status),
      durationMs: output.durationMs,
      candidateCount: output.candidates.length,
      errorMessage: output.error,
    }));
  } catch {
    // Checkpoint may not exist (e.g., resumed from later stage)
    // Return empty array - degradation tracking will still work
    context.logger?.debug(
      '[results] Could not load worker summary from checkpoint, using empty array'
    );
    return [];
  }
}

/**
 * Convert WorkerExecutionStatus to WorkerStatus enum.
 *
 * Both enums use the same values ('ok', 'error', 'partial', 'skipped')
 * but are defined in different schemas for type safety.
 */
function convertWorkerStatus(status: string): WorkerStatus {
  // Both enums have matching values, safe to cast
  return status as WorkerStatus;
}

/**
 * Determine the degradation level based on input state.
 */
function determineDegradationLevel(input: AggregatorOutput): DegradationLevel {
  // No candidates at all = failed
  if (input.candidates.length === 0) {
    return 'failed';
  }

  // No narrative = aggregation failed
  if (input.narrative === null) {
    return 'no_aggregation';
  }

  // Check for partial results (stats indicate issues)
  if (input.stats.inputCount > input.stats.includedCount) {
    return 'partial_workers';
  }

  return 'none';
}

/**
 * Extract failed worker IDs from worker summary.
 */
function extractFailedWorkers(
  workerSummary: Array<{ workerId: string; status: string }>
): string[] {
  return workerSummary
    .filter((w) => w.status === 'error')
    .map((w) => w.workerId);
}

/**
 * Build warning messages based on degradation state.
 */
function buildWarnings(input: AggregatorOutput, level: DegradationLevel): string[] {
  const warnings: string[] = [];

  if (level === 'no_aggregation') {
    warnings.push('Narrative generation failed - results presented without summary');
  }

  if (level === 'failed') {
    warnings.push('No candidates found - discovery run produced no results');
  }

  if (input.stats.inputCount > input.stats.includedCount) {
    const excluded = input.stats.inputCount - input.stats.includedCount;
    warnings.push(`${excluded} candidates were excluded from final output`);
  }

  return warnings;
}

/**
 * Build export paths based on context configuration.
 *
 * Uses the standard storage layout from PRD Section 13:
 * {dataDir}/sessions/{sessionId}/runs/{runId}/exports/
 */
function buildExportPaths(context: StageContext): ResultsExportPaths {
  // Construct the exports directory path following the storage layout
  // Path: {dataDir}/sessions/{sessionId}/runs/{runId}/exports/
  const exportsDir = path.join(
    context.dataDir,
    'sessions',
    context.sessionId,
    'runs',
    context.runId,
    'exports'
  );

  return {
    resultsJson: path.join(exportsDir, '10_results.json'),
    resultsMd: path.join(exportsDir, 'results.md'),
  };
}

/**
 * Build the stage result with metadata and timing.
 */
function buildStageResult(
  output: ResultsStageOutput,
  context: StageContext,
  startedAt: string,
  startTime: number
): StageResult<ResultsStageOutput> {
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startTime;

  const metadata = createStageMetadata({
    stageNumber: STAGE_NUMBER,
    stageName: STAGE_NAME,
    sessionId: context.sessionId,
    runId: context.runId,
    upstreamStage: UPSTREAM_STAGE,
    config: {
      totalCandidates: output.stats.totalCandidates,
      narrativeIncluded: output.stats.narrativeIncluded,
      degradationLevel: output.stats.degradationLevel,
      exportPaths: output.exportPaths,
    },
  });

  return {
    data: output,
    metadata,
    timing: {
      startedAt,
      completedAt,
      durationMs,
    },
  };
}

// ============================================================================
// Exports
// ============================================================================

// Export the stage as default for convenience
export default resultsStage;

// Re-export types from results module
export type {
  ResultsStageOutput,
  ResultsExportPaths,
  ResultsStageStats,
  ResultsExportConfig,
  DiscoveryResults,
  DegradationLevel,
} from './results/types.js';

// Re-export export utilities
export { exportResultsJson, exportResultsMd, generateMarkdownReport } from './results/export.js';
