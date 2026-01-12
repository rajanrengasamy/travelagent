/**
 * Perplexity Web Knowledge Worker
 *
 * Queries Perplexity's Sonar API for travel recommendations with citations.
 * Returns Candidates with origin='web' and provisional confidence.
 *
 * Architecture:
 * - client.ts: Low-level API client for Perplexity Sonar
 * - parser.ts: Converts API responses to Candidate objects
 * - prompts.ts: Prompt templates for different query types
 * - worker.ts: Main Worker implementation (to be implemented)
 *
 * @module workers/perplexity
 * @see PRD FR5.1 - Web Knowledge Worker
 */

// ============================================================================
// Main Worker Class
// ============================================================================

export { PerplexityWorker, generateQueries, deduplicateCandidates } from './worker.js';

// ============================================================================
// API Client
// ============================================================================

export {
  PerplexityClient,
  PerplexityApiError,
  isPerplexityApiError,
  isRetryableError,
  type Message,
  type ChatOptions,
  type ChatResponse,
  type Citation,
} from './client.js';

// ============================================================================
// Response Parser
// ============================================================================

export {
  parsePerplexityResponse,
  extractRecommendations,
  extractCitationIndices,
  mapCitationsToSourceRefs,
  citationToSourceRef,
  extractPublisher,
  generateCandidateId,
  inferTypeFromContent,
  determineConfidence,
} from './parser.js';

// Note: ChatResponse and Citation types are now re-exported from client.ts via parser.ts
// The ParserChatResponse/ParserCitation aliases are deprecated but kept for backwards compatibility
export type { ChatResponse as ParserChatResponse, Citation as ParserCitation } from './parser.js';

// ============================================================================
// Prompt Builders
// ============================================================================

export {
  buildSearchPrompt,
  buildValidationPrompt,
  buildFoodSearchPrompt,
  buildActivitySearchPrompt,
  PERPLEXITY_SYSTEM_PROMPT,
  VALIDATION_SYSTEM_PROMPT,
  RECOMMENDATION_TYPES,
  type RecommendationType,
} from './prompts.js';
