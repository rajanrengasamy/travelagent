/**
 * Pipeline Executor
 *
 * Manages stage registration and executes the 11-stage pipeline.
 * Supports full runs and resume-from-stage mode.
 *
 * Key features:
 * - Stage registration and validation
 * - Full pipeline execution
 * - Resume from any stage
 * - Dry-run mode
 * - Per-stage timing tracking
 * - Error handling with graceful degradation
 *
 * @module pipeline/executor
 * @see PRD Section 11 - Pipeline Infrastructure
 */

import type {
  Stage,
  StageContext,
  StageResult,
  ExecuteOptions,
} from './types.js';
import { isValidStageNumber, getStageId } from './dependencies.js';
import { writeCheckpoint } from './checkpoint.js';
import { generateManifest, saveManifest, type StageFileInfo } from './manifest.js';
import { loadStageForResume, createResumeExecutionPlan } from './resume.js';
import { updateLatestSymlink } from '../storage/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Timing information for pipeline execution
 */
export interface PipelineTiming {
  /** ISO8601 timestamp when pipeline started */
  startedAt: string;
  /** ISO8601 timestamp when pipeline completed */
  completedAt: string;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Duration per stage in milliseconds */
  perStage: Record<string, number>;
}

/**
 * Error record for a stage failure
 */
export interface StageError {
  /** Stage ID where error occurred */
  stageId: string;
  /** Error message */
  error: string;
  /** Whether execution continued after this error */
  continued?: boolean;
}

/**
 * Result of a complete pipeline execution
 */
export interface PipelineResult {
  /** Whether the pipeline completed successfully (no errors, or all errors were in degraded stages) */
  success: boolean;
  /** Stage IDs that were executed (includes both successful and degraded stages) */
  stagesExecuted: string[];
  /** Stage IDs that were skipped (e.g., in resume mode) */
  stagesSkipped: string[];
  /**
   * Stage IDs that failed but execution continued (graceful degradation).
   * Only populated when continueOnError is enabled.
   * @see PRD Section 10.1 - Pipeline Flow (partial results allowed)
   */
  degradedStages: string[];
  /** The final stage ID that completed (or was attempted in degraded mode) */
  finalStage: string;
  /** Timing information */
  timing: PipelineTiming;
  /** Errors encountered during execution */
  errors: StageError[];
}

/**
 * Callback for stage lifecycle events
 */
export interface ExecutorCallbacks {
  /** Called when a stage starts */
  onStageStart?: (stageId: string, stageNumber: number) => void;
  /** Called when a stage completes successfully */
  onStageComplete?: (stageId: string, result: StageResult<unknown>) => void;
  /** Called when a stage fails */
  onStageError?: (stageId: string, error: Error) => void;
  /** Called when a stage is skipped (resume mode) */
  onStageSkip?: (stageId: string) => void;
}

// ============================================================================
// Pipeline Executor Class
// ============================================================================

/**
 * Pipeline executor that manages stage execution.
 *
 * @example
 * ```typescript
 * const executor = new PipelineExecutor();
 *
 * // Register all stages
 * executor.registerStages([
 *   enhancementStage,
 *   intakeStage,
 *   routerStage,
 *   // ... other stages
 * ]);
 *
 * // Execute full pipeline
 * const result = await executor.execute(context);
 *
 * // Or resume from stage 8
 * const resumeResult = await executor.executeFromStage(
 *   context,
 *   8,
 *   'previous-run-id'
 * );
 * ```
 */
export class PipelineExecutor {
  private stages: Map<number, Stage> = new Map();
  private callbacks: ExecutorCallbacks = {};

  // ==========================================================================
  // Stage Registration
  // ==========================================================================

  /**
   * Register a stage with the executor.
   *
   * @param stage - Stage to register
   * @throws Error if stage number is invalid or already registered
   */
  registerStage(stage: Stage): void {
    if (!isValidStageNumber(stage.number)) {
      throw new Error(
        `Invalid stage number ${stage.number} for stage ${stage.id}. Must be 0-10.`
      );
    }

    if (this.stages.has(stage.number)) {
      throw new Error(
        `Stage ${stage.number} is already registered (${this.stages.get(stage.number)?.id})`
      );
    }

    this.stages.set(stage.number, stage);
  }

  /**
   * Register multiple stages.
   *
   * @param stages - Array of stages to register
   */
  registerStages(stages: Stage[]): void {
    for (const stage of stages) {
      this.registerStage(stage);
    }
  }

  /**
   * Get a registered stage by number.
   *
   * @param number - Stage number (0-10)
   * @returns The stage, or undefined if not registered
   */
  getStage(number: number): Stage | undefined {
    return this.stages.get(number);
  }

  /**
   * Get all registered stages.
   *
   * @returns Array of registered stages sorted by number
   */
  getAllStages(): Stage[] {
    return Array.from(this.stages.values()).sort((a, b) => a.number - b.number);
  }

  /**
   * Check if all stages (0-10) are registered.
   *
   * @returns true if all 11 stages are registered
   */
  isComplete(): boolean {
    for (let i = 0; i <= 10; i++) {
      if (!this.stages.has(i)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get list of missing stage numbers.
   *
   * @returns Array of stage numbers that are not registered
   */
  getMissingStages(): number[] {
    const missing: number[] = [];
    for (let i = 0; i <= 10; i++) {
      if (!this.stages.has(i)) {
        missing.push(i);
      }
    }
    return missing;
  }

  /**
   * Set event callbacks for stage lifecycle.
   *
   * @param callbacks - Callback functions for stage events
   */
  setCallbacks(callbacks: ExecutorCallbacks): void {
    this.callbacks = callbacks;
  }

  // ==========================================================================
  // Full Pipeline Execution
  // ==========================================================================

  /**
   * Execute the full pipeline from stage 0.
   *
   * @param context - Stage context with session, runId, config, etc.
   * @param options - Execution options (dryRun, stopAfterStage)
   * @returns Pipeline execution result
   * @throws Error if required stages are not registered
   *
   * @example
   * ```typescript
   * const result = await executor.execute(context, {
   *   dryRun: false,
   *   stopAfterStage: 8, // Stop after top candidates
   * });
   * ```
   */
  async execute(
    context: StageContext,
    options?: ExecuteOptions
  ): Promise<PipelineResult> {
    const startedAt = new Date().toISOString();
    const perStage: Record<string, number> = {};
    const executed: string[] = [];
    const errors: StageError[] = [];
    const executedStageInfo: StageFileInfo[] = [];
    const degraded: string[] = [];

    let previousOutput: unknown = null;
    let finalStage = '';

    // Determine which stages to execute and whether to continue on error
    const stopAfter = options?.stopAfterStage ?? 10;
    const continueOnError = options?.continueOnError ?? false;

    for (let i = 0; i <= stopAfter; i++) {
      const stage = this.stages.get(i);
      if (!stage) {
        throw new Error(
          `Stage ${i} (${getStageId(i)}) not registered. Call registerStage() first.`
        );
      }

      // Dry run - just log what would happen
      if (options?.dryRun) {
        executed.push(stage.id);
        finalStage = stage.id;
        this.callbacks.onStageComplete?.(stage.id, {
          data: null,
          metadata: {
            stageId: stage.id,
            stageNumber: stage.number,
            stageName: stage.name,
            schemaVersion: 1,
            sessionId: context.sessionId,
            runId: context.runId,
            createdAt: new Date().toISOString(),
          },
          timing: {
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: 0,
          },
        });
        continue;
      }

      const stageStart = Date.now();
      this.callbacks.onStageStart?.(stage.id, stage.number);

      try {
        // Execute stage
        const result = await stage.execute(context, previousOutput);

        // Write checkpoint
        await writeCheckpoint(
          context.sessionId,
          context.runId,
          stage.number,
          stage.name,
          result.data,
          { upstreamStage: i > 0 ? this.stages.get(i - 1)?.id : undefined }
        );

        // Track stage info for manifest
        executedStageInfo.push({
          stageId: stage.id,
          stageNumber: stage.number,
          upstreamStage: i > 0 ? this.stages.get(i - 1)?.id : undefined,
        });

        previousOutput = result.data;
        executed.push(stage.id);
        finalStage = stage.id;

        this.callbacks.onStageComplete?.(stage.id, result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Record timing even for failed stages
        perStage[stage.id] = Date.now() - stageStart;

        this.callbacks.onStageError?.(
          stage.id,
          error instanceof Error ? error : new Error(errorMessage)
        );

        if (continueOnError) {
          // Graceful degradation: record error and continue
          errors.push({
            stageId: stage.id,
            error: errorMessage,
            continued: true,
          });
          degraded.push(stage.id);
          executed.push(stage.id);
          finalStage = stage.id;

          // Pass null to downstream stages - they must handle null input gracefully
          previousOutput = null;
          continue;
        } else {
          // Default behavior: stop on error
          errors.push({
            stageId: stage.id,
            error: errorMessage,
            continued: false,
          });
          break;
        }
      }

      perStage[stage.id] = Date.now() - stageStart;
    }

    const completedAt = new Date().toISOString();

    // Determine success: true if no errors, or if all stages completed with graceful degradation
    // With continueOnError, success means pipeline completed (even with partial results)
    const pipelineCompleted = continueOnError
      ? executed.length > 0 && finalStage === this.stages.get(stopAfter)?.id
      : errors.length === 0;

    // Generate and save manifest if we executed any stages
    if (executed.length > 0 && !options?.dryRun) {
      const manifest = await generateManifest(
        context.sessionId,
        context.runId,
        executedStageInfo,
        [], // No skipped stages for full run
        pipelineCompleted
      );
      await saveManifest(context.sessionId, context.runId, manifest);

      // Update latest symlink
      await updateLatestSymlink(context.sessionId, context.runId);
    }

    return {
      success: pipelineCompleted,
      stagesExecuted: executed,
      stagesSkipped: [],
      degradedStages: degraded,
      finalStage,
      timing: {
        startedAt,
        completedAt,
        durationMs: Date.now() - new Date(startedAt).getTime(),
        perStage,
      },
      errors,
    };
  }

  // ==========================================================================
  // Resume from Stage Execution
  // ==========================================================================

  /**
   * Execute pipeline resuming from a specific stage.
   *
   * Loads input data from a previous run and executes from the specified
   * stage onwards.
   *
   * @param context - Stage context
   * @param fromStage - Stage number to resume from (1-10, not 0)
   * @param sourceRunId - Run ID to load initial data from
   * @param options - Execution options (dryRun, stopAfterStage)
   * @returns Pipeline execution result
   * @throws Error if fromStage is 0 (use execute() instead)
   *
   * @example
   * ```typescript
   * // Resume from stage 8 (top candidates) using data from previous run
   * const result = await executor.executeFromStage(
   *   context,
   *   8,
   *   '20260107-143512-full'
   * );
   * // This will load stage 7 output from the source run
   * // and execute stages 8, 9, 10
   * ```
   */
  async executeFromStage(
    context: StageContext,
    fromStage: number,
    sourceRunId: string,
    options?: ExecuteOptions
  ): Promise<PipelineResult> {
    // Validate fromStage
    if (!isValidStageNumber(fromStage)) {
      throw new Error(`Invalid stage number: ${fromStage}. Must be 0-10.`);
    }

    // If resuming from stage 0, just do a full run
    if (fromStage === 0) {
      return this.execute(context, options);
    }

    const startedAt = new Date().toISOString();
    const perStage: Record<string, number> = {};
    const errors: StageError[] = [];
    const executedStageInfo: StageFileInfo[] = [];
    const degraded: string[] = [];

    // Get execution plan and options
    const plan = createResumeExecutionPlan(fromStage);
    const skipped = plan.stagesToSkip;
    const toExecute = plan.stagesToExecute;
    const executed: string[] = [];
    const continueOnError = options?.continueOnError ?? false;

    // Notify about skipped stages
    for (const stageId of skipped) {
      this.callbacks.onStageSkip?.(stageId);
    }

    // Load input from previous run (output of stage before fromStage)
    let previousOutput: unknown;
    if (fromStage > 0) {
      const inputStageNumber = fromStage - 1;
      try {
        previousOutput = await loadStageForResume(
          context.sessionId,
          sourceRunId,
          inputStageNumber
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to load input stage ${inputStageNumber} from run ${sourceRunId}: ${errorMessage}`
        );
      }
    }

    let finalStage = '';

    // Determine stop point
    const stopAfter = options?.stopAfterStage ?? 10;

    for (const stageId of toExecute) {
      // Find the stage number from the ID
      const stageNum = parseInt(stageId.substring(0, 2), 10);

      // Validate the extracted stage number
      if (!isValidStageNumber(stageNum)) {
        throw new Error(
          `Invalid stage ID format: "${stageId}". Expected format NN_stage_name (e.g., "08_top_candidates").`
        );
      }

      // Check if we should stop
      if (stageNum > stopAfter) {
        break;
      }

      const stage = this.stages.get(stageNum);
      if (!stage) {
        throw new Error(
          `Stage ${stageNum} (${stageId}) not registered. Call registerStage() first.`
        );
      }

      // Dry run - just log what would happen
      if (options?.dryRun) {
        executed.push(stage.id);
        finalStage = stage.id;
        this.callbacks.onStageComplete?.(stage.id, {
          data: null,
          metadata: {
            stageId: stage.id,
            stageNumber: stage.number,
            stageName: stage.name,
            schemaVersion: 1,
            sessionId: context.sessionId,
            runId: context.runId,
            createdAt: new Date().toISOString(),
          },
          timing: {
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: 0,
          },
        });
        continue;
      }

      const stageStart = Date.now();
      this.callbacks.onStageStart?.(stage.id, stage.number);

      try {
        // Execute stage
        const result = await stage.execute(context, previousOutput);

        // Write checkpoint
        const upstreamStage =
          stageNum === fromStage
            ? plan.inputStageId // First executed stage's upstream is from source run
            : this.stages.get(stageNum - 1)?.id;

        await writeCheckpoint(
          context.sessionId,
          context.runId,
          stage.number,
          stage.name,
          result.data,
          { upstreamStage }
        );

        // Track stage info for manifest
        executedStageInfo.push({
          stageId: stage.id,
          stageNumber: stage.number,
          upstreamStage,
        });

        previousOutput = result.data;
        executed.push(stage.id);
        finalStage = stage.id;

        this.callbacks.onStageComplete?.(stage.id, result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Record timing even for failed stages
        perStage[stage.id] = Date.now() - stageStart;

        this.callbacks.onStageError?.(
          stage.id,
          error instanceof Error ? error : new Error(errorMessage)
        );

        if (continueOnError) {
          // Graceful degradation: record error and continue
          errors.push({
            stageId: stage.id,
            error: errorMessage,
            continued: true,
          });
          degraded.push(stage.id);
          executed.push(stage.id);
          finalStage = stage.id;

          // Pass null to downstream stages - they must handle null input gracefully
          previousOutput = null;
          continue;
        } else {
          // Default behavior: stop on error
          errors.push({
            stageId: stage.id,
            error: errorMessage,
            continued: false,
          });
          break;
        }
      }

      perStage[stage.id] = Date.now() - stageStart;
    }

    const completedAt = new Date().toISOString();

    // Determine success: with continueOnError, success means pipeline completed to the end
    // The expected final stage in resume mode is the last stage in toExecute (up to stopAfter)
    const expectedFinalStageId = toExecute.filter(id => {
      const num = parseInt(id.substring(0, 2), 10);
      return num <= stopAfter;
    }).pop();
    const pipelineCompleted = continueOnError
      ? executed.length > 0 && finalStage === expectedFinalStageId
      : errors.length === 0;

    // Generate and save manifest if we executed any stages
    if (executed.length > 0 && !options?.dryRun) {
      const manifest = await generateManifest(
        context.sessionId,
        context.runId,
        executedStageInfo,
        skipped,
        pipelineCompleted
      );
      await saveManifest(context.sessionId, context.runId, manifest);

      // Update latest symlink
      await updateLatestSymlink(context.sessionId, context.runId);
    }

    return {
      success: pipelineCompleted,
      stagesExecuted: executed,
      stagesSkipped: skipped,
      degradedStages: degraded,
      finalStage,
      timing: {
        startedAt,
        completedAt,
        durationMs: Date.now() - new Date(startedAt).getTime(),
        perStage,
      },
      errors,
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Validate that all required stages are registered for execution.
   *
   * @param fromStage - Starting stage number (must be 0-10)
   * @param toStage - Ending stage number (must be 0-10)
   * @returns Array of missing stage numbers
   * @throws Error if fromStage or toStage is not a valid stage number (0-10)
   */
  validateStagesForExecution(fromStage: number, toStage: number): number[] {
    if (!isValidStageNumber(fromStage) || !isValidStageNumber(toStage)) {
      throw new Error(`Invalid stage range: ${fromStage}-${toStage}. Must be 0-10.`);
    }

    const missing: number[] = [];
    for (let i = fromStage; i <= toStage; i++) {
      if (!this.stages.has(i)) {
        missing.push(i);
      }
    }
    return missing;
  }

  /**
   * Clear all registered stages.
   * Useful for testing.
   */
  clear(): void {
    this.stages.clear();
    this.callbacks = {};
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new PipelineExecutor instance.
 *
 * @returns New PipelineExecutor
 */
export function createPipelineExecutor(): PipelineExecutor {
  return new PipelineExecutor();
}
