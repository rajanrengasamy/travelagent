/**
 * Worker Executor
 *
 * Executes worker assignments in parallel with timeout handling,
 * error recovery, and output persistence.
 *
 * @module workers/executor
 * @see PRD Section FR3 - Worker Framework
 * @see Task 8.4 - Worker Execution
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { WorkerPlan, WorkerAssignment, WorkerOutput } from '../schemas/worker.js';
import {
  createErrorWorkerOutput,
  createSkippedWorkerOutput,
  WorkerOutputSchema,
} from '../schemas/worker.js';
import { atomicWriteJson } from '../storage/atomic.js';
import { getRunDir } from '../storage/paths.js';
import type { Worker, WorkerContext } from './types.js';
import type { WorkerRegistry } from './registry.js';
import { ConcurrencyLimiter } from './concurrency.js';

// ============================================================================
// Constants
// ============================================================================

/** Directory name for worker outputs within run directory */
const WORKER_OUTPUTS_DIR = '03_worker_outputs';

/** Default timeout for worker execution (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30000;

/** Default concurrency limit for parallel worker execution */
const DEFAULT_CONCURRENCY = 3;

// ============================================================================
// Timeout Helper
// ============================================================================

/**
 * Execute a promise with a timeout.
 *
 * Uses Promise.race to enforce timeout. The timeout is always cleaned up
 * in the finally block to prevent timer leaks, whether the promise resolves
 * successfully or times out.
 *
 * @param promise - Promise to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Name for error message
 * @returns Promise result or throws on timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================================================
// Worker Execution
// ============================================================================

/**
 * Options for executeWorkers function.
 */
export interface ExecuteWorkersOptions {
  /** Concurrency limit for parallel execution (default: 3) */
  concurrency?: number;

  /** Skip saving outputs to disk (for testing) */
  skipSaveOutputs?: boolean;
}

/**
 * Execute a single worker assignment.
 *
 * Handles:
 * - Circuit breaker check (skip if open)
 * - Timeout enforcement
 * - Error capture and output generation
 *
 * @param worker - Worker instance
 * @param assignment - Worker assignment to execute
 * @param context - Worker execution context
 * @returns Worker output (always succeeds, errors captured in output)
 */
async function executeSingleWorker(
  worker: Worker,
  assignment: WorkerAssignment,
  context: WorkerContext
): Promise<WorkerOutput> {
  const startTime = Date.now();
  const timeout = assignment.timeout || DEFAULT_TIMEOUT_MS;

  // Check circuit breaker
  if (context.circuitBreaker.isOpen(worker.provider)) {
    return createSkippedWorkerOutput(worker.id);
  }

  try {
    const output = await withTimeout(
      worker.execute(assignment, context),
      timeout,
      `Worker ${worker.id}`
    );

    // Record success in circuit breaker
    context.circuitBreaker.recordSuccess(worker.provider);

    return output;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Record failure in circuit breaker
    context.circuitBreaker.recordFailure(worker.provider);

    return createErrorWorkerOutput(worker.id, errorMessage, durationMs);
  }
}

/**
 * Execute all workers in a plan.
 *
 * Uses Promise.allSettled for parallel execution with failure isolation.
 * Each worker runs independently - one failure doesn't stop others.
 *
 * @param plan - Worker plan with assignments
 * @param context - Worker execution context
 * @param registry - Worker registry for looking up workers
 * @param options - Execution options
 * @returns Array of worker outputs (one per worker in plan)
 *
 * @example
 * ```typescript
 * const outputs = await executeWorkers(plan, context, registry);
 * // outputs[0] = perplexity results
 * // outputs[1] = places results (or error)
 * // outputs[2] = youtube results
 * ```
 */
export async function executeWorkers(
  plan: WorkerPlan,
  context: WorkerContext,
  registry: WorkerRegistry,
  options: ExecuteWorkersOptions = {}
): Promise<WorkerOutput[]> {
  const { concurrency = DEFAULT_CONCURRENCY, skipSaveOutputs = false } = options;
  const limiter = new ConcurrencyLimiter(concurrency);

  // Execute all workers in parallel with concurrency limit
  const results = await Promise.allSettled(
    plan.workers.map(async (assignment) => {
      return limiter.run(async () => {
        const worker = registry.get(assignment.workerId);

        if (!worker) {
          // Worker not found in registry
          return createErrorWorkerOutput(
            assignment.workerId,
            `Worker '${assignment.workerId}' not found in registry`,
            0
          );
        }

        return executeSingleWorker(worker, assignment, context);
      });
    })
  );

  // Extract outputs from settled results
  const outputs = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    // This shouldn't happen since executeSingleWorker catches all errors,
    // but handle it just in case
    const workerId = plan.workers[index]?.workerId ?? 'unknown';
    return createErrorWorkerOutput(
      workerId,
      result.reason instanceof Error ? result.reason.message : String(result.reason),
      0
    );
  });

  // Save outputs to 03_worker_outputs/ directory
  if (!skipSaveOutputs) {
    await saveWorkerOutputs(outputs, context.session.sessionId, context.runId);
  }

  return outputs;
}

// ============================================================================
// Output Persistence
// ============================================================================

/**
 * Save worker outputs to the run directory.
 *
 * Creates `03_worker_outputs/` directory and saves each worker's
 * output as a separate JSON file for debugging and auditing.
 *
 * @param outputs - Array of worker outputs
 * @param sessionId - Session ID
 * @param runId - Run ID
 *
 * @example
 * ```typescript
 * await saveWorkerOutputs(outputs, '20260110-tokyo', '20260110-143000');
 * // Creates:
 * // ~/.travelagent/sessions/20260110-tokyo/runs/20260110-143000/03_worker_outputs/
 * //   perplexity.json
 * //   places.json
 * //   youtube.json
 * ```
 */
export async function saveWorkerOutputs(
  outputs: WorkerOutput[],
  sessionId: string,
  runId: string
): Promise<void> {
  const outputsDir = path.join(getRunDir(sessionId, runId), WORKER_OUTPUTS_DIR);

  // Ensure directory exists
  await fs.mkdir(outputsDir, { recursive: true });

  // Save each output as a separate file
  await Promise.all(
    outputs.map(async (output) => {
      const filePath = path.join(outputsDir, `${output.workerId}.json`);
      await atomicWriteJson(filePath, output);
    })
  );
}

/**
 * Load worker outputs from a run directory.
 *
 * @param sessionId - Session ID
 * @param runId - Run ID
 * @returns Array of worker outputs, or empty array if not found
 */
export async function loadWorkerOutputs(
  sessionId: string,
  runId: string
): Promise<WorkerOutput[]> {
  const outputsDir = path.join(getRunDir(sessionId, runId), WORKER_OUTPUTS_DIR);

  try {
    const files = await fs.readdir(outputsDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    const outputs = await Promise.all(
      jsonFiles.map(async (file) => {
        const content = await fs.readFile(path.join(outputsDir, file), 'utf-8');
        return WorkerOutputSchema.parse(JSON.parse(content));
      })
    );

    return outputs;
  } catch (error) {
    // Directory doesn't exist or read error
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// ============================================================================
// Execution Summary
// ============================================================================

/**
 * Summary of worker execution results.
 */
export interface ExecutionSummary {
  /** Total number of workers executed */
  total: number;

  /** Number of successful workers (status: ok or partial) */
  successful: number;

  /** Number of failed workers (status: error) */
  failed: number;

  /** Number of skipped workers (status: skipped) */
  skipped: number;

  /** Total candidates collected across all successful workers */
  totalCandidates: number;

  /** Maximum execution duration across all workers (ms) */
  maxDurationMs: number;

  /** Worker IDs that failed */
  failedWorkers: string[];

  /** Worker IDs that were skipped */
  skippedWorkers: string[];
}

/**
 * Generate a summary of worker execution results.
 *
 * Useful for logging, metrics, and reporting.
 *
 * @param outputs - Array of worker outputs from executeWorkers
 * @returns Summary statistics
 *
 * @example
 * ```typescript
 * const summary = summarizeExecution(outputs);
 * console.log(`${summary.successful}/${summary.total} workers succeeded`);
 * console.log(`${summary.totalCandidates} candidates collected`);
 * if (summary.failed > 0) {
 *   console.log(`Failed workers: ${summary.failedWorkers.join(', ')}`);
 * }
 * ```
 */
export function summarizeExecution(outputs: WorkerOutput[]): ExecutionSummary {
  let successful = 0;
  let failed = 0;
  let skipped = 0;
  let totalCandidates = 0;
  let maxDurationMs = 0;
  const failedWorkers: string[] = [];
  const skippedWorkers: string[] = [];

  for (const output of outputs) {
    // Track max duration
    if (output.durationMs > maxDurationMs) {
      maxDurationMs = output.durationMs;
    }

    // Categorize by status
    switch (output.status) {
      case 'ok':
      case 'partial':
        successful++;
        totalCandidates += output.candidates.length;
        break;
      case 'error':
        failed++;
        failedWorkers.push(output.workerId);
        break;
      case 'skipped':
        skipped++;
        skippedWorkers.push(output.workerId);
        break;
    }
  }

  return {
    total: outputs.length,
    successful,
    failed,
    skipped,
    totalCandidates,
    maxDurationMs,
    failedWorkers,
    skippedWorkers,
  };
}
