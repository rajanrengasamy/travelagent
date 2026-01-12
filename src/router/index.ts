/**
 * Router Module Exports
 *
 * The router is Stage 02 in the pipeline. It analyzes the session and creates
 * a WorkerPlan that describes what each worker should do.
 *
 * @module router
 * @see PRD Section 7.6.4 - Router Stage
 */

// Main router function
export { runRouter } from './router.js';

// Intent enrichment
export { enrichIntent, inferTags } from './intent.js';

// Query generation
export { generateQueryVariants } from './queries.js';

// Default/fallback plan (uses planner.ts internally)
export { getDefaultWorkerPlan } from './defaults.js';

// Prompt building
export { buildRouterPrompt } from './prompts.js';
