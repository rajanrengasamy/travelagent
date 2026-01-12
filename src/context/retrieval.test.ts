/**
 * Unit Tests for Context Retrieval Operations
 *
 * Tests the retrieval functions with comprehensive mocking for embeddings and db modules.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { JournalEntry, TodoSnapshot, PrdSection, SessionSummary } from './types.js';

// Mock embedding vector
const mockEmbedding = new Array(1536).fill(0.1);

// Mock the embeddings module
jest.unstable_mockModule('./embeddings.js', () => ({
  generateEmbedding: jest.fn(),
}));

// Mock collection methods
const mockSearch = jest.fn<any>();
const mockQuery = jest.fn<any>();
const mockToArray = jest.fn<any>();
const mockWhere = jest.fn<any>();
const mockLimit = jest.fn<any>();
const mockSearchLimit = jest.fn<any>();

jest.unstable_mockModule('./db.js', () => ({
  getCollection: jest.fn(),
  collectionExists: jest.fn(),
  rowToJournalEntry: jest.fn(
    (row: Record<string, unknown>): JournalEntry => ({
      id: row.id as string,
      timestamp: row.timestamp as string,
      content: row.content as string,
      summary: row.summary as string,
      topics: JSON.parse(row.topics as string) as string[],
      embedding: Array.from(row.embedding as number[]),
    })
  ),
  rowToTodoSnapshot: jest.fn(
    (row: Record<string, unknown>): TodoSnapshot => ({
      id: row.id as string,
      timestamp: row.timestamp as string,
      sections: JSON.parse(row.sections as string),
      overallCompletionPct: row.overallCompletionPct as number,
      embedding: Array.from(row.embedding as number[]),
    })
  ),
  rowToPrdSection: jest.fn(
    (row: Record<string, unknown>): PrdSection => ({
      id: row.id as string,
      sectionNumber: row.sectionNumber as number,
      title: row.title as string,
      content: row.content as string,
      embedding: Array.from(row.embedding as number[]),
    })
  ),
  rowToSessionSummary: jest.fn(
    (row: Record<string, unknown>): SessionSummary => ({
      id: row.id as string,
      timestamp: row.timestamp as string,
      summary: row.summary as string,
      workCompleted: JSON.parse(row.workCompleted as string) as string[],
      openItems: JSON.parse(row.openItems as string) as string[],
      embedding: Array.from(row.embedding as number[]),
    })
  ),
}));

// Import after mocks are set up
const { generateEmbedding } = await import('./embeddings.js');
const { getCollection, collectionExists } = await import('./db.js');
const {
  queryJournalEntries,
  getRecentSessions,
  getCurrentTodoState,
  queryPrdSections,
  getRelevantContext,
  queryJournalEntriesWithOptions,
  queryPrdSectionsWithOptions,
  querySessionSummaries,
  getJournalEntryById,
  getPrdSectionById,
  getSessionSummaryById,
  getTodoSnapshots,
  getTodoSectionByPattern,
} = await import('./retrieval.js');

describe('Context Retrieval Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default mock implementations
    (generateEmbedding as any).mockResolvedValue(mockEmbedding);
    (collectionExists as any).mockResolvedValue(true);

    // Set up search chain
    mockSearchLimit.mockReturnValue({
      toArray: mockToArray,
    });
    mockSearch.mockReturnValue({
      limit: mockSearchLimit,
    });

    // Set up query chain
    mockLimit.mockReturnValue({
      toArray: mockToArray,
    });
    mockWhere.mockReturnValue({
      limit: mockLimit,
    });
    mockQuery.mockReturnValue({
      where: mockWhere,
      toArray: mockToArray,
    });

    mockToArray.mockResolvedValue([]);

    (getCollection as any).mockResolvedValue({
      search: mockSearch,
      query: mockQuery,
    });
  });

  afterEach(() => {
    // Use clearAllMocks instead of resetAllMocks to preserve mock implementations
    // resetAllMocks would remove the row converter implementations set in the module mock
    jest.clearAllMocks();
  });

  describe('queryJournalEntries', () => {
    it('should perform vector search and return journal entries', async () => {
      const mockResults = [
        {
          id: 'journal-001',
          timestamp: '2024-01-15T10:00:00Z',
          content: 'Content about storage',
          summary: 'Storage implementation',
          topics: JSON.stringify(['storage']),
          embedding: mockEmbedding,
          _distance: 0.1,
        },
        {
          id: 'journal-002',
          timestamp: '2024-01-14T10:00:00Z',
          content: 'Content about retrieval',
          summary: 'Retrieval implementation',
          topics: JSON.stringify(['retrieval']),
          embedding: mockEmbedding,
          _distance: 0.3,
        },
      ];
      mockToArray.mockResolvedValue(mockResults);

      const results = await queryJournalEntries('storage implementation', 5);

      expect(generateEmbedding).toHaveBeenCalledWith('storage implementation');
      expect(mockSearch).toHaveBeenCalledWith(mockEmbedding);
      expect(mockSearchLimit).toHaveBeenCalledWith(5);
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('journal-001');
    });

    it('should return empty array if collection does not exist', async () => {
      (collectionExists as any).mockResolvedValue(false);

      const results = await queryJournalEntries('test query');

      expect(results).toEqual([]);
      expect(generateEmbedding).not.toHaveBeenCalled();
    });

    it('should use default limit of 10', async () => {
      mockToArray.mockResolvedValue([]);

      await queryJournalEntries('test query');

      expect(mockSearchLimit).toHaveBeenCalledWith(10);
    });

    it('should handle search errors gracefully', async () => {
      (getCollection as any).mockRejectedValue(new Error('Connection failed'));

      const results = await queryJournalEntries('test query');

      expect(results).toEqual([]);
    });
  });

  describe('getRecentSessions', () => {
    it('should return sessions sorted by timestamp descending', async () => {
      const mockSessions = [
        {
          id: 'session-001',
          timestamp: '2024-01-13T10:00:00Z',
          summary: 'Earlier session',
          workCompleted: JSON.stringify(['task1']),
          openItems: JSON.stringify([]),
          embedding: mockEmbedding,
        },
        {
          id: 'session-002',
          timestamp: '2024-01-15T10:00:00Z',
          summary: 'Latest session',
          workCompleted: JSON.stringify(['task2']),
          openItems: JSON.stringify([]),
          embedding: mockEmbedding,
        },
        {
          id: 'session-003',
          timestamp: '2024-01-14T10:00:00Z',
          summary: 'Middle session',
          workCompleted: JSON.stringify(['task3']),
          openItems: JSON.stringify([]),
          embedding: mockEmbedding,
        },
      ];
      mockToArray.mockResolvedValue(mockSessions);

      const results = await getRecentSessions(2);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('session-002'); // Latest
      expect(results[1].id).toBe('session-003'); // Middle
    });

    it('should return empty array if collection does not exist', async () => {
      (collectionExists as any).mockResolvedValue(false);

      const results = await getRecentSessions(3);

      expect(results).toEqual([]);
    });

    it('should return empty array on error', async () => {
      (getCollection as any).mockRejectedValue(new Error('DB error'));

      const results = await getRecentSessions(3);

      expect(results).toEqual([]);
    });
  });

  describe('getCurrentTodoState', () => {
    it('should return the most recent TODO snapshot', async () => {
      const mockSnapshots = [
        {
          id: 'todo-001',
          timestamp: '2024-01-14T10:00:00Z',
          sections: JSON.stringify([{ name: 'Old' }]),
          overallCompletionPct: 30,
          embedding: mockEmbedding,
        },
        {
          id: 'todo-002',
          timestamp: '2024-01-15T10:00:00Z',
          sections: JSON.stringify([{ name: 'Latest' }]),
          overallCompletionPct: 50,
          embedding: mockEmbedding,
        },
      ];
      mockToArray.mockResolvedValue(mockSnapshots);

      const result = await getCurrentTodoState();

      expect(result).not.toBeNull();
      expect(result!.id).toBe('todo-002'); // Most recent
      expect(result!.overallCompletionPct).toBe(50);
    });

    it('should return null if collection does not exist', async () => {
      (collectionExists as any).mockResolvedValue(false);

      const result = await getCurrentTodoState();

      expect(result).toBeNull();
    });

    it('should return null if collection is empty', async () => {
      mockToArray.mockResolvedValue([]);

      const result = await getCurrentTodoState();

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      (getCollection as any).mockRejectedValue(new Error('DB error'));

      const result = await getCurrentTodoState();

      expect(result).toBeNull();
    });
  });

  describe('queryPrdSections', () => {
    it('should perform vector search and return PRD sections', async () => {
      const mockResults = [
        {
          id: 'prd-section-0',
          sectionNumber: 0,
          title: 'Introduction',
          content: 'Overview of the system',
          embedding: mockEmbedding,
          _distance: 0.2,
        },
      ];
      mockToArray.mockResolvedValue(mockResults);

      const results = await queryPrdSections('system overview');

      expect(generateEmbedding).toHaveBeenCalledWith('system overview');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Introduction');
    });

    it('should use default limit of 3', async () => {
      mockToArray.mockResolvedValue([]);

      await queryPrdSections('test query');

      expect(mockSearchLimit).toHaveBeenCalledWith(3);
    });

    it('should return empty array if collection does not exist', async () => {
      (collectionExists as any).mockResolvedValue(false);

      const results = await queryPrdSections('test');

      expect(results).toEqual([]);
    });
  });

  describe('getRelevantContext', () => {
    it('should combine context from all sources', async () => {
      (collectionExists as any).mockResolvedValue(true);

      const sessionData = [
        {
          id: 'session-001',
          timestamp: '2024-01-15T10:00:00Z',
          summary: 'Recent session',
          workCompleted: JSON.stringify(['task1']),
          openItems: JSON.stringify([]),
          embedding: mockEmbedding,
        },
      ];

      mockToArray.mockResolvedValue(sessionData);

      const bundle = await getRelevantContext('architecture implementation');

      expect(bundle).toHaveProperty('recentSessions');
      expect(bundle).toHaveProperty('todoState');
      expect(bundle).toHaveProperty('relevantPrdSections');
      expect(bundle).toHaveProperty('relevantJournalEntries');
      expect(bundle).toHaveProperty('generatedAt');
      expect(typeof bundle.generatedAt).toBe('string');
    });

    it('should handle missing collections gracefully', async () => {
      (collectionExists as any).mockResolvedValue(false);

      const bundle = await getRelevantContext('test query');

      expect(bundle.recentSessions).toEqual([]);
      expect(bundle.todoState).toBeNull();
      expect(bundle.relevantPrdSections).toEqual([]);
      expect(bundle.relevantJournalEntries).toEqual([]);
    });
  });

  describe('queryJournalEntriesWithOptions', () => {
    it('should filter by minimum similarity', async () => {
      const mockResults = [
        {
          id: 'journal-high',
          timestamp: '2024-01-15T10:00:00Z',
          content: 'High similarity',
          summary: 'Summary',
          topics: JSON.stringify([]),
          embedding: mockEmbedding,
          _distance: 0.1,
        },
        {
          id: 'journal-low',
          timestamp: '2024-01-15T10:00:00Z',
          content: 'Low similarity',
          summary: 'Summary',
          topics: JSON.stringify([]),
          embedding: mockEmbedding,
          _distance: 5.0,
        },
      ];
      mockToArray.mockResolvedValue(mockResults);

      const results = await queryJournalEntriesWithOptions('test', {
        minSimilarity: 0.5,
      });

      // similarity = 1 / (1 + distance)
      // For distance 0.1: ~0.91
      // For distance 5.0: ~0.17
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].item.id).toBe('journal-high');
    });

    it('should respect custom limit', async () => {
      mockToArray.mockResolvedValue([]);

      await queryJournalEntriesWithOptions('test', { limit: 5 });

      expect(mockSearchLimit).toHaveBeenCalledWith(5);
    });
  });

  describe('queryPrdSectionsWithOptions', () => {
    it('should filter by minimum similarity', async () => {
      const mockResults = [
        {
          id: 'prd-high',
          sectionNumber: 1,
          title: 'Relevant',
          content: 'Content',
          embedding: mockEmbedding,
          _distance: 0.1,
        },
      ];
      mockToArray.mockResolvedValue(mockResults);

      const results = await queryPrdSectionsWithOptions('test', {
        minSimilarity: 0.5,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('querySessionSummaries', () => {
    it('should perform vector search on session summaries', async () => {
      const mockResults = [
        {
          id: 'session-001',
          timestamp: '2024-01-15T10:00:00Z',
          summary: 'Storage session',
          workCompleted: JSON.stringify(['storage']),
          openItems: JSON.stringify([]),
          embedding: mockEmbedding,
          _distance: 0.1,
        },
      ];
      mockToArray.mockResolvedValue(mockResults);

      const results = await querySessionSummaries('storage', 3);

      expect(generateEmbedding).toHaveBeenCalledWith('storage');
      expect(mockSearchLimit).toHaveBeenCalledWith(3);
      expect(results).toHaveLength(1);
    });
  });

  describe('getJournalEntryById', () => {
    it('should return journal entry by ID', async () => {
      const mockEntry = {
        id: 'journal-001',
        timestamp: '2024-01-15T10:00:00Z',
        content: 'Content',
        summary: 'Summary',
        topics: JSON.stringify(['topic']),
        embedding: mockEmbedding,
      };
      mockToArray.mockResolvedValue([mockEntry]);

      const result = await getJournalEntryById('journal-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('journal-001');
      expect(mockWhere).toHaveBeenCalledWith("id = 'journal-001'");
    });

    it('should return null if not found', async () => {
      mockToArray.mockResolvedValue([]);

      const result = await getJournalEntryById('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null if collection does not exist', async () => {
      (collectionExists as any).mockResolvedValue(false);

      const result = await getJournalEntryById('journal-001');

      expect(result).toBeNull();
    });

    it('should escape single quotes in ID', async () => {
      mockToArray.mockResolvedValue([]);

      await getJournalEntryById("id'with'quotes");

      expect(mockWhere).toHaveBeenCalledWith("id = 'id''with''quotes'");
    });
  });

  describe('getPrdSectionById', () => {
    it('should return PRD section by ID', async () => {
      const mockSection = {
        id: 'prd-001',
        sectionNumber: 1,
        title: 'Title',
        content: 'Content',
        embedding: mockEmbedding,
      };
      mockToArray.mockResolvedValue([mockSection]);

      const result = await getPrdSectionById('prd-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('prd-001');
    });

    it('should return null if not found', async () => {
      mockToArray.mockResolvedValue([]);

      const result = await getPrdSectionById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getSessionSummaryById', () => {
    it('should return session summary by ID', async () => {
      const mockSummary = {
        id: 'session-001',
        timestamp: '2024-01-15T10:00:00Z',
        summary: 'Summary',
        workCompleted: JSON.stringify([]),
        openItems: JSON.stringify([]),
        embedding: mockEmbedding,
      };
      mockToArray.mockResolvedValue([mockSummary]);

      const result = await getSessionSummaryById('session-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('session-001');
    });

    it('should return null if not found', async () => {
      mockToArray.mockResolvedValue([]);

      const result = await getSessionSummaryById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getTodoSnapshots', () => {
    it('should return TODO snapshots sorted by timestamp descending', async () => {
      const mockSnapshots = [
        {
          id: 'todo-001',
          timestamp: '2024-01-13T10:00:00Z',
          sections: JSON.stringify([]),
          overallCompletionPct: 30,
          embedding: mockEmbedding,
        },
        {
          id: 'todo-002',
          timestamp: '2024-01-15T10:00:00Z',
          sections: JSON.stringify([]),
          overallCompletionPct: 50,
          embedding: mockEmbedding,
        },
        {
          id: 'todo-003',
          timestamp: '2024-01-14T10:00:00Z',
          sections: JSON.stringify([]),
          overallCompletionPct: 40,
          embedding: mockEmbedding,
        },
      ];
      mockToArray.mockResolvedValue(mockSnapshots);

      const results = await getTodoSnapshots(2);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('todo-002'); // Latest
      expect(results[1].id).toBe('todo-003'); // Middle
    });

    it('should return empty array if collection does not exist', async () => {
      (collectionExists as any).mockResolvedValue(false);

      const results = await getTodoSnapshots();

      expect(results).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle vector search errors gracefully', async () => {
      (collectionExists as any).mockResolvedValue(true);
      (getCollection as any).mockRejectedValue(new Error('Connection lost'));

      const results = await queryJournalEntries('test');

      expect(results).toEqual([]);
    });

    it('should handle embedding generation errors gracefully', async () => {
      (collectionExists as any).mockResolvedValue(true);
      (generateEmbedding as any).mockRejectedValue(new Error('API error'));

      const results = await queryJournalEntries('test');

      expect(results).toEqual([]);
    });
  });

  describe('getTodoSectionByPattern', () => {
    const mockTodoSnapshot = {
      id: 'todo-001',
      timestamp: '2024-01-15T10:00:00Z',
      sections: JSON.stringify([
        {
          name: 'Phase 14.0 - Ranking Stage',
          sectionId: 'phase-14-0',
          items: [
            { id: '14.0', description: 'Ranking implementation', completed: false },
            { id: '14.0.1', description: 'Create scorer', completed: true, parentId: '14.0' },
          ],
          completionPct: 50,
        },
        {
          name: 'Phase 15.0 - Validation',
          sectionId: 'phase-15-0',
          items: [{ id: '15.0', description: 'Validation stage', completed: false }],
          completionPct: 0,
        },
      ]),
      overallCompletionPct: 25,
      embedding: mockEmbedding,
    };

    it('should find section by number pattern', async () => {
      mockToArray.mockResolvedValue([mockTodoSnapshot]);

      const result = await getTodoSectionByPattern('14.0');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Phase 14.0 - Ranking Stage');
      expect(result!.items).toHaveLength(2);
    });

    it('should find section by keyword', async () => {
      mockToArray.mockResolvedValue([mockTodoSnapshot]);

      const result = await getTodoSectionByPattern('Ranking');

      expect(result).not.toBeNull();
      expect(result!.name).toContain('Ranking');
    });

    it('should find section by phase pattern', async () => {
      mockToArray.mockResolvedValue([mockTodoSnapshot]);

      const result = await getTodoSectionByPattern('15');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Phase 15.0 - Validation');
    });

    it('should return null if no section matches', async () => {
      mockToArray.mockResolvedValue([mockTodoSnapshot]);

      const result = await getTodoSectionByPattern('99.0');

      expect(result).toBeNull();
    });

    it('should return null if no TODO snapshot exists', async () => {
      (collectionExists as any).mockResolvedValue(false);

      const result = await getTodoSectionByPattern('14.0');

      expect(result).toBeNull();
    });

    it('should be case-insensitive', async () => {
      mockToArray.mockResolvedValue([mockTodoSnapshot]);

      const result = await getTodoSectionByPattern('ranking');

      expect(result).not.toBeNull();
      expect(result!.name).toContain('Ranking');
    });

    it('should match sectionId pattern', async () => {
      mockToArray.mockResolvedValue([mockTodoSnapshot]);

      const result = await getTodoSectionByPattern('phase-15');

      expect(result).not.toBeNull();
      expect(result!.sectionId).toBe('phase-15-0');
    });
  });
});
