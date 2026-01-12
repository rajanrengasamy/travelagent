/**
 * Context Persistence Module
 *
 * RAG-based context persistence system for Claude Code session management.
 * Uses LanceDB for vector storage and OpenAI for embeddings.
 *
 * @module context
 * @see PRD Section 0 - Development Infrastructure
 */

// Re-export all types
export * from './types.js';

// Embedding service
export * from './embeddings.js';

// Database layer
export * from './db.js';

// Storage operations
export * from './storage.js';

// Retrieval operations
export * from './retrieval.js';

// Indexers for PRD and TODO parsing
export * from './indexers/index.js';

// Auto-journal trigger logic
export * from './auto-journal.js';

// Journal generation
export * from './journal-generator.js';

// Seeding utilities
export * from './seed.js';

// Session cache for cross-skill context sharing
export * from './session-cache.js';

// VectorDB lock mechanism for concurrent access
export * from './lock.js';

// Session preflight for unified context retrieval
export * from './session-preflight.js';

// PRD/TODO section mapping registry
export * from './section-mapping.js';
