/**
 * Router Module - Main Router Logic
 *
 * Orchestrates the creation of a WorkerPlan by calling the LLM with a router prompt.
 * Falls back to default plan on any error (LLM failure, validation error, timeout).
 *
 * @module router/router
 * @see PRD Section 7.6.4 - Router Stage
 */

import { callGoogleAIJson } from '../enhancement/llm-client.js';
import { WorkerPlanSchema, type WorkerPlan } from '../schemas/worker.js';
import type { Session } from '../schemas/session.js';
import { buildRouterPrompt } from './prompts.js';
import { getDefaultWorkerPlan } from './defaults.js';

/**
 * Router timeout in milliseconds (per PRD 7.6.4)
 */
const ROUTER_TIMEOUT_MS = 5000;

/**
 * Run the router to create a WorkerPlan for the given session.
 *
 * The router uses an LLM to analyze the session and determine:
 * - Which workers to invoke (perplexity, places, youtube)
 * - What queries each worker should execute
 * - How many results each worker should return
 * - Validation plan for social-derived candidates
 *
 * On any failure (LLM error, timeout, validation error), falls back to
 * a default worker plan that invokes all available workers.
 *
 * @param session - The travel planning session to route
 * @param availableWorkers - List of worker IDs that can be used (e.g., ['perplexity', 'places', 'youtube'])
 * @returns WorkerPlan describing what each worker should do
 *
 * @example
 * ```typescript
 * const session = await getSession('20260115-tokyo-trip');
 * const plan = await runRouter(session, ['perplexity', 'places', 'youtube']);
 * // plan.workers contains assignments for each worker
 * ```
 */
export async function runRouter(
  session: Session,
  availableWorkers: string[]
): Promise<WorkerPlan> {
  try {
    // Build the prompt for the router LLM
    const prompt = buildRouterPrompt(session, availableWorkers);

    // Call the LLM with router task type and 5-second timeout
    const { data } = await callGoogleAIJson<unknown>(prompt, 'router', {
      timeoutMs: ROUTER_TIMEOUT_MS,
    });

    // Validate the LLM response against WorkerPlanSchema
    const result = WorkerPlanSchema.safeParse(data);
    if (result.success) {
      return result.data;
    }

    // Validation failed - log and fall back to default
    // TODO: Replace with structured logger when project-wide logging is implemented (see Logger interface in pipeline/types.ts)
    console.warn('[Router] Response validation failed:', result.error.format());
    return getDefaultWorkerPlan(session, availableWorkers);
  } catch (error) {
    // LLM call failed (timeout, network error, etc.) - fall back to default
    // TODO: Replace with structured logger when project-wide logging is implemented (see Logger interface in pipeline/types.ts)
    console.warn('[Router] LLM call failed:', error instanceof Error ? error.message : error);
    return getDefaultWorkerPlan(session, availableWorkers);
  }
}
