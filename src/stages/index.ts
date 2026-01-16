/**
 * Pipeline Stages Exports
 *
 * Central export point for all pipeline stage implementations.
 * Each stage is a TypedStage that processes input from upstream
 * and produces output for downstream stages.
 *
 * @module stages
 * @see PRD Section 11 - Pipeline Infrastructure
 */

// Stage 04: Normalization
export { normalizeStage } from './normalize.js';

// Stage 05: Deduplication & Clustering
export { dedupeStage } from './dedupe.js';

// Stage 06: Ranking
export { rankStage } from './rank.js';

// Stage 07: Social Validation
export { validateStage } from './validate.js';

// Stage 08: Top Candidates Selection
export { topCandidatesStage } from './top-candidates.js';

// Stage 09: Aggregator
export { aggregateStage } from './aggregate.js';

// Stage 10: Results (Final Stage)
export { resultsStage } from './results.js';

// Re-export normalization utilities
export * from './normalize/index.js';

// Re-export dedupe utilities
export * from './dedupe/index.js';

// Re-export rank utilities
export * from './rank/index.js';

// Re-export validate utilities
export * from './validate/index.js';

// Re-export top-candidates utilities
export * from './top-candidates/index.js';

// Re-export aggregate utilities
export * from './aggregate/index.js';

// Re-export results utilities
export * from './results/index.js';
