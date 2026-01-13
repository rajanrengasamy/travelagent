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

// Re-export normalization utilities
export * from './normalize/index.js';

// Re-export dedupe utilities
export * from './dedupe/index.js';

// Re-export rank utilities
export * from './rank/index.js';
