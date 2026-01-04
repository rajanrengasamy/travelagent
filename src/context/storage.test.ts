/**
 * Unit Tests for Context Storage Operations
 *
 * Tests the storage functions with comprehensive mocking for embeddings and db modules.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { JournalEntry, TodoSnapshot, PrdSection, SessionSummary } from './types.js';

// Mock the embeddings module
jest.unstable_mockModule('./embeddings.js', () => ({
  generateEmbedding: jest.fn(),
}));

// Mock collection methods
const mockAdd = jest.fn<any>();
const mockDelete = jest.fn<any>();
const mockQuery = jest.fn<any>();
const mockToArray = jest.fn<any>();
const mockWhere = jest.fn<any>();
const mockLimit = jest.fn<any>();
const mockDropTable = jest.fn<any>();

jest.unstable_mockModule('./db.js', () => ({
  getCollection: jest.fn(),
  collectionExists: jest.fn(),
  connectToDb: jest.fn(),
  journalEntryToRow: jest.fn((entry: JournalEntry) => ({
    id: entry.id,
    timestamp: entry.timestamp,
    content: entry.content,
    summary: entry.summary,
    topics: JSON.stringify(entry.topics),
    embedding: entry.embedding,
  })),
  todoSnapshotToRow: jest.fn((snapshot: TodoSnapshot) => ({
    id: snapshot.id,
    timestamp: snapshot.timestamp,
    sections: JSON.stringify(snapshot.sections),
    overallCompletionPct: snapshot.overallCompletionPct,
    embedding: snapshot.embedding,
  })),
  prdSectionToRow: jest.fn((section: PrdSection) => ({
    id: section.id,
    sectionNumber: section.sectionNumber,
    title: section.title,
    content: section.content,
    embedding: section.embedding,
  })),
  sessionSummaryToRow: jest.fn((summary: SessionSummary) => ({
    id: summary.id,
    timestamp: summary.timestamp,
    summary: summary.summary,
    workCompleted: JSON.stringify(summary.workCompleted),
    openItems: JSON.stringify(summary.openItems),
    embedding: summary.embedding,
  })),
}));

// Import after mocks are set up
const { generateEmbedding } = await import('./embeddings.js');
const { getCollection, collectionExists, connectToDb } = await import('./db.js');
const {
  storeJournalEntry,
  storeTodoSnapshot,
  storePrdSection,
  storeSessionSummary,
  deleteEntry,
  updateEntry,
  storeJournalEntries,
  storePrdSections,
  clearCollection,
  getCollectionCount,
} = await import('./storage.js');

describe('Context Storage Operations', () => {
  // Mock embedding vector
  const mockEmbedding = new Array(1536).fill(0.1);

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default mock implementations
    (generateEmbedding as any).mockResolvedValue(mockEmbedding);
    (collectionExists as any).mockResolvedValue(true);

    // Set up collection mock chain
    mockQuery.mockReturnValue({
      where: mockWhere,
      toArray: mockToArray,
    });
    mockWhere.mockReturnValue({
      limit: mockLimit,
    });
    mockLimit.mockReturnValue({
      toArray: mockToArray,
    });
    mockToArray.mockResolvedValue([]);
    mockAdd.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);

    (getCollection as any).mockResolvedValue({
      add: mockAdd,
      delete: mockDelete,
      query: mockQuery,
    });

    mockDropTable.mockResolvedValue(undefined);
    (connectToDb as any).mockResolvedValue({
      dropTable: mockDropTable,
    });
  });

  afterEach(() => {
    // Use clearAllMocks instead of resetAllMocks to preserve mock implementations
    // resetAllMocks would remove the mock implementations set in the module mock
    jest.clearAllMocks();
  });

  describe('storeJournalEntry', () => {
    it('should store a journal entry with generated embedding', async () => {
      const entry = {
        id: 'journal-001',
        timestamp: '2024-01-15T10:00:00Z',
        content: 'Today I worked on the context persistence system.',
        summary: 'Implemented context storage',
        topics: ['storage', 'lancedb'],
      };

      await storeJournalEntry(entry);

      expect(generateEmbedding).toHaveBeenCalledWith(`${entry.summary}\n\n${entry.content}`);

      expect(mockAdd).toHaveBeenCalledWith([
        expect.objectContaining({
          id: entry.id,
          timestamp: entry.timestamp,
          embedding: mockEmbedding,
        }),
      ]);
    });

    it('should handle embedding generation failure', async () => {
      (generateEmbedding as any).mockRejectedValue(new Error('API rate limit exceeded'));

      const entry = {
        id: 'journal-002',
        timestamp: '2024-01-15T10:00:00Z',
        content: 'Test content',
        summary: 'Test summary',
        topics: [],
      };

      await expect(storeJournalEntry(entry)).rejects.toThrow('API rate limit exceeded');
    });

    it('should handle collection not existing', async () => {
      (getCollection as any).mockRejectedValue(
        new Error("Collection 'journal_entries' does not exist")
      );

      const entry = {
        id: 'journal-003',
        timestamp: '2024-01-15T10:00:00Z',
        content: 'Test content',
        summary: 'Test summary',
        topics: [],
      };

      await expect(storeJournalEntry(entry)).rejects.toThrow(
        "Collection 'journal_entries' does not exist"
      );
    });
  });

  describe('storeTodoSnapshot', () => {
    it('should store a TODO snapshot with embedding from incomplete items', async () => {
      const snapshot = {
        id: 'todo-001',
        timestamp: '2024-01-15T10:00:00Z',
        sections: [
          {
            name: 'Phase 0.0 - Context Persistence',
            sectionId: '0.0',
            items: [
              {
                id: '0.0.1',
                description: 'Create embeddings service',
                completed: true,
                parentId: undefined,
              },
              {
                id: '0.0.2',
                description: 'Create storage layer',
                completed: false,
                parentId: undefined,
              },
            ],
            completionPct: 50,
          },
        ],
        overallCompletionPct: 50,
      };

      await storeTodoSnapshot(snapshot);

      expect(generateEmbedding).toHaveBeenCalledWith(
        'Phase 0.0 - Context Persistence\nCreate storage layer'
      );

      expect(mockAdd).toHaveBeenCalledWith([
        expect.objectContaining({
          id: snapshot.id,
          embedding: mockEmbedding,
        }),
      ]);
    });

    it('should handle empty sections', async () => {
      const snapshot = {
        id: 'todo-002',
        timestamp: '2024-01-15T10:00:00Z',
        sections: [],
        overallCompletionPct: 0,
      };

      await storeTodoSnapshot(snapshot);

      expect(generateEmbedding).toHaveBeenCalledWith('');
    });
  });

  describe('storePrdSection', () => {
    it('should store a PRD section with embedding from title and content', async () => {
      const section = {
        id: 'prd-section-0',
        sectionNumber: 0,
        title: 'Introduction',
        content: 'This document describes the Travel Discovery system.',
      };

      await storePrdSection(section);

      expect(generateEmbedding).toHaveBeenCalledWith(`${section.title}\n\n${section.content}`);

      expect(mockAdd).toHaveBeenCalledWith([
        expect.objectContaining({
          id: section.id,
          sectionNumber: section.sectionNumber,
          embedding: mockEmbedding,
        }),
      ]);
    });
  });

  describe('storeSessionSummary', () => {
    it('should store a session summary with embedding from all text parts', async () => {
      const summary = {
        id: 'session-001',
        timestamp: '2024-01-15T10:00:00Z',
        summary: 'Completed context storage implementation.',
        workCompleted: ['Implemented storeJournalEntry', 'Added tests'],
        openItems: ['Implement retrieval', 'Add integration tests'],
      };

      await storeSessionSummary(summary);

      expect(generateEmbedding).toHaveBeenCalledWith(
        [
          summary.summary,
          'Work completed:',
          ...summary.workCompleted,
          'Open items:',
          ...summary.openItems,
        ].join('\n')
      );

      expect(mockAdd).toHaveBeenCalledWith([
        expect.objectContaining({
          id: summary.id,
          embedding: mockEmbedding,
        }),
      ]);
    });
  });

  describe('deleteEntry', () => {
    it('should delete an entry by ID', async () => {
      await deleteEntry('journal_entries', 'entry-to-delete');

      expect(collectionExists).toHaveBeenCalledWith('journal_entries');
      expect(mockDelete).toHaveBeenCalledWith("id = 'entry-to-delete'");
    });

    it('should throw error if collection does not exist', async () => {
      (collectionExists as any).mockResolvedValue(false);

      await expect(deleteEntry('nonexistent', 'some-id')).rejects.toThrow(
        'Collection "nonexistent" does not exist'
      );
    });

    it('should escape single quotes in ID to prevent SQL injection', async () => {
      await deleteEntry('journal_entries', "id'with'quotes");

      expect(mockDelete).toHaveBeenCalledWith("id = 'id''with''quotes'");
    });
  });

  describe('updateEntry', () => {
    it('should update an entry by fetching, merging, and re-inserting', async () => {
      const existingEntry = {
        id: 'entry-001',
        content: 'Original content',
        summary: 'Original summary',
      };

      mockToArray.mockResolvedValue([existingEntry]);

      await updateEntry<{ id: string; summary?: string }>('journal_entries', 'entry-001', {
        summary: 'Updated summary',
      });

      expect(mockWhere).toHaveBeenCalledWith("id = 'entry-001'");
      expect(mockDelete).toHaveBeenCalledWith("id = 'entry-001'");
      expect(mockAdd).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'entry-001',
          content: 'Original content',
          summary: 'Updated summary',
        }),
      ]);
    });

    it('should throw error if entry not found', async () => {
      mockToArray.mockResolvedValue([]);

      await expect(
        updateEntry<{ id: string }>('journal_entries', 'nonexistent', {})
      ).rejects.toThrow('Entry with id "nonexistent" not found in collection "journal_entries"');
    });

    it('should throw error if collection does not exist', async () => {
      (collectionExists as any).mockResolvedValue(false);

      await expect(updateEntry<{ id: string }>('nonexistent', 'some-id', {})).rejects.toThrow(
        'Collection "nonexistent" does not exist'
      );
    });
  });

  describe('storeJournalEntries (batch)', () => {
    it('should store multiple journal entries', async () => {
      const entries = [
        {
          id: 'journal-batch-1',
          timestamp: '2024-01-15T10:00:00Z',
          content: 'First entry',
          summary: 'Summary 1',
          topics: ['topic1'],
        },
        {
          id: 'journal-batch-2',
          timestamp: '2024-01-15T11:00:00Z',
          content: 'Second entry',
          summary: 'Summary 2',
          topics: ['topic2'],
        },
      ];

      await storeJournalEntries(entries);

      expect(generateEmbedding).toHaveBeenCalledTimes(2);
      expect(generateEmbedding).toHaveBeenCalledWith('Summary 1\n\nFirst entry');
      expect(generateEmbedding).toHaveBeenCalledWith('Summary 2\n\nSecond entry');

      expect(mockAdd).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'journal-batch-1' }),
          expect.objectContaining({ id: 'journal-batch-2' }),
        ])
      );
    });

    it('should handle empty array', async () => {
      await storeJournalEntries([]);

      expect(generateEmbedding).not.toHaveBeenCalled();
      expect(mockAdd).not.toHaveBeenCalled();
    });
  });

  describe('storePrdSections (batch)', () => {
    it('should store multiple PRD sections', async () => {
      const sections = [
        {
          id: 'prd-1',
          sectionNumber: 1,
          title: 'Section 1',
          content: 'Content 1',
        },
        {
          id: 'prd-2',
          sectionNumber: 2,
          title: 'Section 2',
          content: 'Content 2',
        },
      ];

      await storePrdSections(sections);

      expect(generateEmbedding).toHaveBeenCalledTimes(2);
      expect(mockAdd).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'prd-1' }),
          expect.objectContaining({ id: 'prd-2' }),
        ])
      );
    });

    it('should handle empty array', async () => {
      await storePrdSections([]);

      expect(generateEmbedding).not.toHaveBeenCalled();
      expect(mockAdd).not.toHaveBeenCalled();
    });
  });

  describe('clearCollection', () => {
    it('should drop the collection', async () => {
      await clearCollection('journal_entries');

      expect(collectionExists).toHaveBeenCalledWith('journal_entries');
      expect(mockDropTable).toHaveBeenCalledWith('journal_entries');
    });

    it('should do nothing if collection does not exist', async () => {
      (collectionExists as any).mockResolvedValue(false);

      await clearCollection('nonexistent');

      expect(mockDropTable).not.toHaveBeenCalled();
    });
  });

  describe('getCollectionCount', () => {
    it('should return the count of entries', async () => {
      mockToArray.mockResolvedValue([{ id: '1' }, { id: '2' }, { id: '3' }]);

      const count = await getCollectionCount('journal_entries');

      expect(count).toBe(3);
    });

    it('should return 0 if collection does not exist', async () => {
      (collectionExists as any).mockResolvedValue(false);

      const count = await getCollectionCount('nonexistent');

      expect(count).toBe(0);
    });

    it('should return 0 for empty collection', async () => {
      mockToArray.mockResolvedValue([]);

      const count = await getCollectionCount('journal_entries');

      expect(count).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should propagate database errors', async () => {
      (getCollection as any).mockRejectedValue(new Error('Database connection failed'));

      const entry = {
        id: 'journal-error',
        timestamp: '2024-01-15T10:00:00Z',
        content: 'Test content',
        summary: 'Test summary',
        topics: [],
      };

      await expect(storeJournalEntry(entry)).rejects.toThrow('Database connection failed');
    });

    it('should propagate add operation errors', async () => {
      mockAdd.mockRejectedValue(new Error('Write operation failed'));

      const entry = {
        id: 'journal-write-error',
        timestamp: '2024-01-15T10:00:00Z',
        content: 'Test content',
        summary: 'Test summary',
        topics: [],
      };

      await expect(storeJournalEntry(entry)).rejects.toThrow('Write operation failed');
    });
  });
});
