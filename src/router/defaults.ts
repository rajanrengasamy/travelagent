/**
 * Default Fallback Worker Plan
 *
 * Provides a sensible default WorkerPlan when the LLM router fails.
 * Uses the planner module for intelligent worker selection and budget allocation,
 * combined with query generation to ensure the pipeline can proceed.
 *
 * @module router/defaults
 * @see PRD Section 5.2 - Router Stage (02)
 */

import type { Session } from '../schemas/session.js';
import type { WorkerPlan, EnrichedIntent, WorkerAssignment } from '../schemas/worker.js';
import { selectWorkers, allocateBudgets, createValidationPlan } from './planner.js';


/**
 * Generate default queries for a specific worker based on session data
 *
 * @param workerId - The worker identifier
 * @param destination - Primary destination
 * @param interests - User interests (first 2 used)
 * @returns Array of 3 queries tailored to the worker
 */
function generateDefaultQueries(workerId: string, destination: string, interests: string[]): string[] {
  const interest1 = interests[0] || 'things to do';
  const interest2 = interests[1] || 'local attractions';

  switch (workerId) {
    case 'perplexity':
      return [
        `best ${interest1} in ${destination}`,
        `${destination} travel tips and recommendations`,
        `hidden gems and local favorites in ${destination}`,
      ];

    case 'places':
      return [
        `${interest1} ${destination}`,
        `${interest2} ${destination}`,
        `top attractions ${destination}`,
      ];

    case 'youtube':
      return [
        `${destination} travel vlog`,
        `things to do in ${destination}`,
        `${destination} ${interest1} guide`,
      ];

    default:
      // Generic queries for unknown workers
      return [
        `${destination} ${interest1}`,
        `${destination} ${interest2}`,
        `${destination} travel guide`,
      ];
  }
}

/**
 * Infer basic tags from session data
 *
 * Generates reasonable default tags based on available session information.
 *
 * @param session - The session to analyze
 * @returns Array of inferred tags
 */
function inferBasicTags(session: Session): string[] {
  const tags: string[] = [];

  // Add destination-based tag
  if (session.destinations.length > 1) {
    tags.push('multi-destination');
  }

  // Add interest-based tags (first 2)
  session.interests.slice(0, 2).forEach((interest) => {
    const normalized = interest.toLowerCase().replace(/\s+/g, '-');
    tags.push(normalized);
  });

  // Infer trip duration tag
  const start = new Date(session.dateRange.start);
  const end = new Date(session.dateRange.end);
  const durationDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  if (durationDays <= 3) {
    tags.push('short-trip');
  } else if (durationDays <= 7) {
    tags.push('week-trip');
  } else if (durationDays <= 14) {
    tags.push('extended-trip');
  } else {
    tags.push('long-trip');
  }

  // Infer season from start date
  const month = start.getMonth();
  if (month >= 2 && month <= 4) {
    tags.push('spring-travel');
  } else if (month >= 5 && month <= 7) {
    tags.push('summer-travel');
  } else if (month >= 8 && month <= 10) {
    tags.push('fall-travel');
  } else {
    tags.push('winter-travel');
  }

  return tags;
}

/**
 * Create a default WorkerPlan from session data
 *
 * This function is used as a fallback when the LLM router fails.
 * It uses the planner module for intelligent worker selection and budget
 * allocation, combined with query generation to ensure the pipeline can proceed.
 *
 * The planner provides:
 * - Interest-based worker selection (not all workers for all sessions)
 * - Budget allocation with multipliers for complex sessions
 * - Validation plan creation with strict constraint awareness
 *
 * @param session - The session containing user's travel intent
 * @param availableWorkers - List of available worker IDs
 * @returns A WorkerPlan using intelligent planner logic
 *
 * @example
 * ```typescript
 * // When LLM router fails, use defaults
 * try {
 *   plan = await routeWithLLM(session, workers);
 * } catch {
 *   plan = getDefaultWorkerPlan(session, workers);
 * }
 * ```
 */
export function getDefaultWorkerPlan(session: Session, availableWorkers: string[]): WorkerPlan {
  // Use planner for intelligent worker selection based on session interests
  const selectedWorkers = selectWorkers(session, availableWorkers);

  // Allocate budgets with multipliers based on session characteristics
  const budgets = allocateBudgets(selectedWorkers, session);

  // Create validation plan considering strict constraints
  const validationPlan = createValidationPlan(selectedWorkers, session);

  // Use first destination for query generation (fallback to generic if empty)
  const primaryDestination = session.destinations[0] ?? 'destination';
  const interests = session.interests.slice(0, 2);

  // Build enriched intent from session data
  const enrichedIntent: EnrichedIntent = {
    destinations: [...session.destinations],
    dateRange: { ...session.dateRange },
    flexibility: { ...session.flexibility },
    interests: [...session.interests],
    constraints: session.constraints ? { ...session.constraints } : {},
    inferredTags: inferBasicTags(session),
  };

  // Create worker assignments using planner budgets and generated queries
  const workers: WorkerAssignment[] = budgets.map((budget) => ({
    workerId: budget.workerId,
    queries: generateDefaultQueries(budget.workerId, primaryDestination, interests),
    maxResults: budget.maxResults,
    timeout: budget.timeout,
  }));

  return {
    enrichedIntent,
    workers,
    validationPlan,
  };
}

/**
 * List of standard worker IDs
 */
export const STANDARD_WORKERS = ['perplexity', 'places', 'youtube'] as const;

export type StandardWorkerId = (typeof STANDARD_WORKERS)[number];
