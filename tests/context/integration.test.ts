/**
 * Context Persistence Integration Tests
 *
 * End-to-end tests for the context persistence system that verify
 * the complete flow from storage to retrieval using a real LanceDB instance.
 *
 * These tests use a separate test database directory to avoid interfering
 * with production data.
 *
 * @module tests/context/integration
 * @see PRD Section 0.0.12 - Context Persistence Tests
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Test data directory
const TEST_DATA_DIR = join(tmpdir(), 'travelagent-test-context');
const TEST_DB_DIR = join(TEST_DATA_DIR, 'lancedb');
const TEST_CACHE_DIR = join(TEST_DATA_DIR, 'embeddings-cache');

// Mock embedding for tests - actual OpenAI API is mocked
const mockEmbedding = new Array(1536).fill(0.1);

// Mock the embeddings module to avoid hitting OpenAI API
const mockGenerateEmbedding = jest.fn<(text: string) => Promise<number[]>>();
const mockGenerateEmbeddings = jest.fn<(texts: string[]) => Promise<number[][]>>();

jest.unstable_mockModule('../../src/context/embeddings.js', () => ({
  generateEmbedding: mockGenerateEmbedding,
  generateEmbeddings: mockGenerateEmbeddings,
}));

// Import after mocking
const { setDbPath, connectToDb, closeDb, initializeCollections, dropAllCollections, collectionExists } =
  await import('../../src/context/db.js');
const {
  storeJournalEntry,
  storePrdSection,
  storeTodoSnapshot,
  storeSessionSummary,
} = await import('../../src/context/storage.js');
const {
  queryJournalEntries,
  queryPrdSections,
  getCurrentTodoState,
  getRelevantContext,
} = await import('../../src/context/retrieval.js');
const { parsePrdSections } = await import('../../src/context/indexers/prd.js');
const { parseTodoSections, calculateOverallCompletion } = await import('../../src/context/indexers/todo.js');

describe('Context Persistence Integration Tests', () => {
  beforeAll(async () => {
    // Set up test environment
    mockGenerateEmbedding.mockResolvedValue(mockEmbedding);
    mockGenerateEmbeddings.mockImplementation(async (texts: string[]) =>
      texts.map(() => [...mockEmbedding])
    );

    // Clean up and create test directories
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
    mkdirSync(TEST_DB_DIR, { recursive: true });
    mkdirSync(TEST_CACHE_DIR, { recursive: true });

    // Configure db to use test directory
    setDbPath(TEST_DB_DIR);

    // Connect and initialize
    await connectToDb();
    await initializeCollections();
  });

  afterAll(async () => {
    // Clean up
    await closeDb();
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateEmbedding.mockResolvedValue(mockEmbedding);
    mockGenerateEmbeddings.mockImplementation(async (texts: string[]) =>
      texts.map(() => [...mockEmbedding])
    );
  });

  describe('Journal Entry Flow (Store → Retrieve by semantic query)', () => {
    it('should store and retrieve journal entry by semantic query', async () => {
      // Store a journal entry
      const entry = {
        id: 'journal-test-001',
        timestamp: new Date().toISOString(),
        content: 'Today I implemented the context persistence system using LanceDB for vector storage.',
        summary: 'Implemented context persistence with LanceDB',
        topics: ['lancedb', 'context', 'persistence'],
      };

      await storeJournalEntry(entry);

      // Query for the entry
      const results = await queryJournalEntries('context persistence', 5);

      expect(results.length).toBeGreaterThanOrEqual(1);
      const found = results.find(r => r.id === 'journal-test-001');
      expect(found).toBeDefined();
      expect(found!.summary).toContain('context persistence');
      expect(found!.topics).toContain('lancedb');
    });

    it('should store multiple entries and retrieve relevant ones', async () => {
      // Store multiple entries
      const entries = [
        {
          id: 'journal-test-002',
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          content: 'Worked on embedding service with OpenAI integration.',
          summary: 'Embedding service implementation',
          topics: ['embeddings', 'openai'],
        },
        {
          id: 'journal-test-003',
          timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          content: 'Fixed bugs in the TODO indexer parsing logic.',
          summary: 'TODO indexer bug fixes',
          topics: ['todo', 'indexer', 'bugfix'],
        },
        {
          id: 'journal-test-004',
          timestamp: new Date().toISOString(),
          content: 'Added vector search capabilities to the retrieval module.',
          summary: 'Vector search implementation',
          topics: ['vector', 'search', 'retrieval'],
        },
      ];

      for (const entry of entries) {
        await storeJournalEntry(entry);
      }

      // Query for embedding-related entries
      const results = await queryJournalEntries('embedding vector search', 10);

      expect(results.length).toBeGreaterThanOrEqual(1);
      // Results should be returned (mock always matches)
      expect(results.some(r => r.id.startsWith('journal-test-'))).toBe(true);
    });
  });

  describe('PRD Indexing Flow (Index → Query specific section → Get content)', () => {
    it('should parse PRD sections and store them for querying', async () => {
      // Create a mock PRD
      const mockPrd = `# Travel Discovery PRD

## 1. Executive Summary

This PRD describes the Travel Discovery Orchestrator system.

## 2. Technical Architecture

The system uses a multi-stage pipeline architecture with LanceDB for storage.

## 3. Data Model

Candidates have structured fields including name, location, and sources.
`;

      // Parse sections
      const sections = parsePrdSections(mockPrd);

      expect(sections.length).toBeGreaterThanOrEqual(3);

      // Store each section
      for (const section of sections) {
        await storePrdSection({
          id: section.id,
          sectionNumber: section.sectionNumber,
          title: section.title,
          content: section.content,
        });
      }

      // Query for architecture section
      const results = await queryPrdSections('technical architecture pipeline', 3);

      expect(results.length).toBeGreaterThanOrEqual(1);
      // Should find the architecture section
      expect(results.some(r => r.content.toLowerCase().includes('architecture'))).toBe(true);
    });

    it('should retrieve PRD sections by content similarity', async () => {
      // Query for data model section
      const results = await queryPrdSections('data model candidates fields', 3);

      expect(results.length).toBeGreaterThanOrEqual(1);
      // Should return relevant sections
      expect(results.every(r => r.id && r.content)).toBe(true);
    });
  });

  describe('TODO Snapshot Flow (Snapshot → Retrieve completion stats)', () => {
    it('should store and retrieve TODO snapshot with completion stats', async () => {
      // Create a TODO snapshot
      const mockTodoContent = `## Tasks

### Phase 0.0 - Context Persistence

- [x] **0.0.1 Embedding Service**
  - [x] 0.0.1.1 Create embeddings.ts
  - [x] 0.0.1.2 Implement generateEmbedding
  - [ ] 0.0.1.3 Add caching

- [ ] **0.0.2 Storage Layer**
  - [x] 0.0.2.1 Create storage.ts
  - [ ] 0.0.2.2 Implement storeJournalEntry
`;

      // Parse sections
      const sections = parseTodoSections(mockTodoContent);
      const overallPct = calculateOverallCompletion(sections);

      // Store snapshot
      const snapshot = {
        id: 'todo-test-001',
        timestamp: new Date().toISOString(),
        sections,
        overallCompletionPct: overallPct,
      };

      await storeTodoSnapshot(snapshot);

      // Retrieve current state
      const currentState = await getCurrentTodoState();

      expect(currentState).not.toBeNull();
      expect(currentState!.id).toBe('todo-test-001');
      expect(currentState!.sections.length).toBeGreaterThan(0);
      expect(typeof currentState!.overallCompletionPct).toBe('number');
    });

    it('should calculate correct completion stats', async () => {
      const mockTodoContent = `## Tasks

### Phase 1

- [x] Task 1
- [x] Task 2
- [ ] Task 3
- [ ] Task 4
`;

      const sections = parseTodoSections(mockTodoContent);
      const overallPct = calculateOverallCompletion(sections);

      // 2 of 4 = 50%
      expect(overallPct).toBe(50);

      // Store snapshot
      await storeTodoSnapshot({
        id: 'todo-test-002',
        timestamp: new Date().toISOString(),
        sections,
        overallCompletionPct: overallPct,
      });

      const currentState = await getCurrentTodoState();
      expect(currentState!.overallCompletionPct).toBe(50);
    });
  });

  describe('getRelevantContext Flow (Combine all sources)', () => {
    it('should combine context from journal, PRD, and session sources', async () => {
      // First store some session summaries
      await storeSessionSummary({
        id: 'session-test-001',
        timestamp: new Date().toISOString(),
        summary: 'Completed context persistence implementation',
        workCompleted: ['Embedding service', 'Storage layer'],
        openItems: ['Integration tests'],
      });

      // Query for relevant context
      const context = await getRelevantContext('context persistence implementation');

      // Context should have entries from multiple sources
      expect(context).toBeDefined();
      expect(context.relevantJournalEntries).toBeDefined();
      expect(context.relevantPrdSections).toBeDefined();
      expect(context.recentSessions).toBeDefined();
      expect(context.todoState).toBeDefined();
    });

    it('should handle queries when some collections are empty', async () => {
      // Query for something unrelated
      const context = await getRelevantContext('unrelated topic xyz');

      // Should still return a valid structure
      expect(context).toBeDefined();
      expect(Array.isArray(context.relevantJournalEntries)).toBe(true);
      expect(Array.isArray(context.relevantPrdSections)).toBe(true);
    });
  });

  describe('Fallback behavior when LanceDB unavailable', () => {
    it('should handle collection not existing gracefully', async () => {
      // Drop all collections to simulate fresh state
      await dropAllCollections();

      // Queries should return empty results, not throw
      const journals = await queryJournalEntries('test');
      expect(journals).toEqual([]);

      const prdSections = await queryPrdSections('test');
      expect(prdSections).toEqual([]);

      const todoState = await getCurrentTodoState();
      expect(todoState).toBeNull();

      // Re-initialize for other tests
      await initializeCollections();
    });

    it('should verify collection existence correctly', async () => {
      // Check that collections exist after initialization
      const journalExists = await collectionExists('journal_entries');
      const todoExists = await collectionExists('todo_snapshots');
      const prdExists = await collectionExists('prd_sections');
      const sessionExists = await collectionExists('session_summaries');

      expect(journalExists).toBe(true);
      expect(todoExists).toBe(true);
      expect(prdExists).toBe(true);
      expect(sessionExists).toBe(true);
    });
  });

  describe('/startagain Context Bundle Flow', () => {
    it('should provide context bundle for new session start', async () => {
      // Store some relevant data first
      await storeJournalEntry({
        id: 'journal-startagain-001',
        timestamp: new Date().toISOString(),
        content: 'Last session focused on implementing the retrieval layer.',
        summary: 'Retrieval layer implementation',
        topics: ['retrieval', 'lancedb'],
      });

      await storeSessionSummary({
        id: 'session-startagain-001',
        timestamp: new Date().toISOString(),
        summary: 'Completed retrieval functions for all collection types',
        workCompleted: ['queryJournalEntries', 'queryPrdSections', 'getCurrentTodoState'],
        openItems: ['Integration tests', 'Error handling improvements'],
      });

      // Simulate /startagain query
      const context = await getRelevantContext('current project status and next tasks');

      // Should have relevant context for resuming work
      expect(context.relevantJournalEntries.length).toBeGreaterThanOrEqual(1);
      expect(context.recentSessions.length).toBeGreaterThanOrEqual(1);

      // The context should help answer "what was done" and "what's next"
      const hasJournalWithRetrieval = context.relevantJournalEntries.some(
        (j: { content: string }) => j.content.toLowerCase().includes('retrieval')
      );
      expect(hasJournalWithRetrieval).toBe(true);
    });

    it('should retrieve recent session summaries for context', async () => {
      // Add more session summaries with different timestamps
      const sessions = [
        {
          id: 'session-recent-001',
          timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          summary: 'Started context persistence work',
          workCompleted: ['Initial setup'],
          openItems: ['Embedding service', 'Storage layer'],
        },
        {
          id: 'session-recent-002',
          timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          summary: 'Completed embedding and storage',
          workCompleted: ['Embedding service', 'Storage layer'],
          openItems: ['Retrieval layer'],
        },
        {
          id: 'session-recent-003',
          timestamp: new Date().toISOString(),
          summary: 'Finished retrieval implementation',
          workCompleted: ['Retrieval layer'],
          openItems: ['Integration tests'],
        },
      ];

      for (const session of sessions) {
        await storeSessionSummary(session);
      }

      // Get context which should include recent sessions
      const context = await getRelevantContext('session progress summary');

      expect(context.recentSessions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle empty query gracefully', async () => {
      // Empty query should still work
      const context = await getRelevantContext('');

      expect(context).toBeDefined();
    });

    it('should handle special characters in queries', async () => {
      // Query with special characters
      const results = await queryJournalEntries("test's query with \"quotes\"", 5);

      // Should not throw
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle very long queries', async () => {
      // Very long query
      const longQuery = 'context '.repeat(1000);
      const results = await queryJournalEntries(longQuery, 5);

      // Should not throw
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
