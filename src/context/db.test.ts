/**
 * LanceDB Database Layer Tests
 *
 * Tests for connection management, collection initialization, and CRUD operations.
 *
 * @module context/db.test
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  connectToDb,
  closeDb,
  getDbConnection,
  setDbPath,
  resetDbPath,
  getDbPath,
  initializeCollections,
  getCollection,
  collectionExists,
  dropCollection,
  dropAllCollections,
  getDbStatus,
  journalEntryToRow,
  rowToJournalEntry,
  todoSnapshotToRow,
  rowToTodoSnapshot,
  prdSectionToRow,
  rowToPrdSection,
  sessionSummaryToRow,
  rowToSessionSummary,
  COLLECTION_SCHEMAS,
} from './db.js';
import {
  COLLECTION_NAMES,
  type JournalEntry,
  type TodoSnapshot,
  type PrdSection,
  type SessionSummary,
} from './types.js';

describe('LanceDB Database Layer', () => {
  let testDbPath: string;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    testDbPath = await mkdtemp(join(tmpdir(), 'lancedb-test-'));
    setDbPath(testDbPath);
  });

  afterEach(async () => {
    // Close connection and cleanup
    await closeDb();
    resetDbPath();

    // Remove temporary directory
    try {
      await rm(testDbPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ==========================================================================
  // Connection Management Tests
  // ==========================================================================

  describe('Connection Management', () => {
    test('connectToDb creates a new connection', async () => {
      const conn = await connectToDb();
      expect(conn).toBeDefined();
      expect(conn.isOpen()).toBe(true);
    });

    test('connectToDb returns existing connection on subsequent calls', async () => {
      const conn1 = await connectToDb();
      const conn2 = await connectToDb();
      // Should be the same connection instance
      expect(conn1).toBe(conn2);
    });

    test('closeDb closes the connection', async () => {
      await connectToDb();
      await closeDb();
      const conn = getDbConnection();
      expect(conn).toBeNull();
    });

    test('closeDb is safe to call multiple times', async () => {
      await connectToDb();
      await closeDb();
      await closeDb();
      await closeDb();
      expect(getDbConnection()).toBeNull();
    });

    test('getDbConnection returns null when not connected', async () => {
      const conn = getDbConnection();
      expect(conn).toBeNull();
    });

    test('getDbConnection returns connection when connected', async () => {
      await connectToDb();
      const conn = getDbConnection();
      expect(conn).toBeDefined();
      expect(conn?.isOpen()).toBe(true);
    });

    test('connectToDb reconnects after close', async () => {
      const conn1 = await connectToDb();
      await closeDb();
      const conn2 = await connectToDb();
      expect(conn2).toBeDefined();
      expect(conn2.isOpen()).toBe(true);
      // Should be a new connection instance
      expect(conn1).not.toBe(conn2);
    });
  });

  // ==========================================================================
  // Path Management Tests
  // ==========================================================================

  describe('Path Management', () => {
    test('setDbPath changes the database path', () => {
      const customPath = '/custom/path';
      setDbPath(customPath);
      expect(getDbPath()).toBe(customPath);
    });

    test('resetDbPath restores default path', () => {
      setDbPath('/custom/path');
      resetDbPath();
      // Default path should contain .travelagent
      expect(getDbPath()).toContain('.travelagent');
    });
  });

  // ==========================================================================
  // Collection Initialization Tests
  // ==========================================================================

  describe('Collection Initialization', () => {
    test('initializeCollections creates all collections', async () => {
      await initializeCollections();

      for (const collectionName of Object.values(COLLECTION_NAMES)) {
        const exists = await collectionExists(collectionName);
        expect(exists).toBe(true);
      }
    });

    test('initializeCollections is idempotent', async () => {
      await initializeCollections();
      await initializeCollections();
      await initializeCollections();

      const status = await getDbStatus();
      expect(status.collections).toHaveLength(Object.keys(COLLECTION_NAMES).length);
    });

    test('collectionExists returns false for non-existent collection', async () => {
      const exists = await collectionExists('non_existent_collection');
      expect(exists).toBe(false);
    });

    test('collectionExists returns true for existing collection', async () => {
      await initializeCollections();
      const exists = await collectionExists(COLLECTION_NAMES.JOURNAL_ENTRIES);
      expect(exists).toBe(true);
    });
  });

  // ==========================================================================
  // Collection Retrieval Tests
  // ==========================================================================

  describe('Collection Retrieval', () => {
    test('getCollection returns table for existing collection', async () => {
      await initializeCollections();

      const table = await getCollection(COLLECTION_NAMES.JOURNAL_ENTRIES);
      expect(table).toBeDefined();
      expect(table.name).toBe(COLLECTION_NAMES.JOURNAL_ENTRIES);
    });

    test('getCollection throws for non-existent collection', async () => {
      await expect(getCollection('non_existent')).rejects.toThrow(/does not exist/);
    });

    test('getCollection caches table references', async () => {
      await initializeCollections();

      const table1 = await getCollection(COLLECTION_NAMES.JOURNAL_ENTRIES);
      const table2 = await getCollection(COLLECTION_NAMES.JOURNAL_ENTRIES);

      // Should return same cached instance
      expect(table1).toBe(table2);
    });
  });

  // ==========================================================================
  // Collection Drop Tests
  // ==========================================================================

  describe('Collection Drop', () => {
    test('dropCollection removes a collection', async () => {
      await initializeCollections();

      await dropCollection(COLLECTION_NAMES.JOURNAL_ENTRIES);

      const exists = await collectionExists(COLLECTION_NAMES.JOURNAL_ENTRIES);
      expect(exists).toBe(false);
    });

    test('dropCollection is safe for non-existent collection', async () => {
      // Should not throw
      await dropCollection('non_existent_collection');
    });

    test('dropAllCollections removes all collections', async () => {
      await initializeCollections();
      await dropAllCollections();

      const status = await getDbStatus();
      expect(status.collections).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Database Status Tests
  // ==========================================================================

  describe('Database Status', () => {
    test('getDbStatus returns connected status after connection', async () => {
      await initializeCollections();

      const status = await getDbStatus();

      expect(status.connected).toBe(true);
      expect(status.path).toBe(testDbPath);
      expect(status.collections).toContain(COLLECTION_NAMES.JOURNAL_ENTRIES);
      expect(status.error).toBeUndefined();
    });

    test('getDbStatus returns correct collection count', async () => {
      await initializeCollections();

      const status = await getDbStatus();

      expect(status.collections).toHaveLength(Object.keys(COLLECTION_NAMES).length);
    });
  });

  // ==========================================================================
  // Type Converter Tests
  // ==========================================================================

  describe('Type Converters', () => {
    const mockEmbedding = new Array(1536).fill(0.1);

    describe('JournalEntry converters', () => {
      const journalEntry: JournalEntry = {
        id: 'test-entry-1',
        timestamp: '2025-01-02T12:00:00Z',
        content: 'Test journal content',
        summary: 'Test summary',
        topics: ['topic1', 'topic2'],
        embedding: mockEmbedding,
      };

      test('journalEntryToRow converts correctly', () => {
        const row = journalEntryToRow(journalEntry);

        expect(row.id).toBe('test-entry-1');
        expect(row.timestamp).toBe('2025-01-02T12:00:00Z');
        expect(row.content).toBe('Test journal content');
        expect(row.summary).toBe('Test summary');
        expect(row.topics).toBe('["topic1","topic2"]');
        expect(row.embedding).toBe(mockEmbedding);
      });

      test('rowToJournalEntry converts correctly', () => {
        const row = {
          id: 'test-entry-1',
          timestamp: '2025-01-02T12:00:00Z',
          content: 'Test journal content',
          summary: 'Test summary',
          topics: '["topic1","topic2"]',
          embedding: new Float32Array(mockEmbedding),
        };

        const entry = rowToJournalEntry(row);

        expect(entry.id).toBe('test-entry-1');
        expect(entry.topics).toEqual(['topic1', 'topic2']);
        expect(entry.embedding).toHaveLength(1536);
      });

      test('round-trip conversion preserves data', () => {
        const row = journalEntryToRow(journalEntry);
        const converted = rowToJournalEntry({
          ...row,
          embedding: new Float32Array(row.embedding as number[]),
        });

        expect(converted.id).toBe(journalEntry.id);
        expect(converted.topics).toEqual(journalEntry.topics);
      });
    });

    describe('TodoSnapshot converters', () => {
      const todoSnapshot: TodoSnapshot = {
        id: 'snapshot-1',
        timestamp: '2025-01-02T12:00:00Z',
        sections: [
          {
            name: 'Phase 1',
            sectionId: '1.0',
            items: [
              { id: '1.1', description: 'Task 1', completed: true },
              { id: '1.2', description: 'Task 2', completed: false },
            ],
            completionPct: 50,
          },
        ],
        overallCompletionPct: 50,
        embedding: mockEmbedding,
      };

      test('todoSnapshotToRow converts correctly', () => {
        const row = todoSnapshotToRow(todoSnapshot);

        expect(row.id).toBe('snapshot-1');
        expect(row.overallCompletionPct).toBe(50);
        expect(typeof row.sections).toBe('string');
        expect(JSON.parse(row.sections as string)).toHaveLength(1);
      });

      test('rowToTodoSnapshot converts correctly', () => {
        const row = {
          id: 'snapshot-1',
          timestamp: '2025-01-02T12:00:00Z',
          sections: JSON.stringify(todoSnapshot.sections),
          overallCompletionPct: 50,
          embedding: new Float32Array(mockEmbedding),
        };

        const snapshot = rowToTodoSnapshot(row);

        expect(snapshot.sections).toHaveLength(1);
        expect(snapshot.sections[0].items).toHaveLength(2);
      });
    });

    describe('PrdSection converters', () => {
      const prdSection: PrdSection = {
        id: 'prd-section-1',
        sectionNumber: 1,
        title: 'Introduction',
        content: 'This is the introduction section.',
        embedding: mockEmbedding,
      };

      test('prdSectionToRow converts correctly', () => {
        const row = prdSectionToRow(prdSection);

        expect(row.id).toBe('prd-section-1');
        expect(row.sectionNumber).toBe(1);
        expect(row.title).toBe('Introduction');
        expect(row.content).toBe('This is the introduction section.');
      });

      test('rowToPrdSection converts correctly', () => {
        const row = {
          id: 'prd-section-1',
          sectionNumber: 1,
          title: 'Introduction',
          content: 'This is the introduction section.',
          embedding: new Float32Array(mockEmbedding),
        };

        const section = rowToPrdSection(row);

        expect(section.sectionNumber).toBe(1);
        expect(section.embedding).toHaveLength(1536);
      });
    });

    describe('SessionSummary converters', () => {
      const sessionSummary: SessionSummary = {
        id: 'session-1',
        timestamp: '2025-01-02T12:00:00Z',
        summary: 'Completed initial setup',
        workCompleted: ['Set up project', 'Added dependencies'],
        openItems: ['Write tests', 'Document API'],
        embedding: mockEmbedding,
      };

      test('sessionSummaryToRow converts correctly', () => {
        const row = sessionSummaryToRow(sessionSummary);

        expect(row.id).toBe('session-1');
        expect(row.summary).toBe('Completed initial setup');
        expect(row.workCompleted).toBe('["Set up project","Added dependencies"]');
        expect(row.openItems).toBe('["Write tests","Document API"]');
      });

      test('rowToSessionSummary converts correctly', () => {
        const row = {
          id: 'session-1',
          timestamp: '2025-01-02T12:00:00Z',
          summary: 'Completed initial setup',
          workCompleted: '["Set up project","Added dependencies"]',
          openItems: '["Write tests","Document API"]',
          embedding: new Float32Array(mockEmbedding),
        };

        const summary = rowToSessionSummary(row);

        expect(summary.workCompleted).toEqual(['Set up project', 'Added dependencies']);
        expect(summary.openItems).toEqual(['Write tests', 'Document API']);
      });
    });
  });

  // ==========================================================================
  // Schema Definitions Tests
  // ==========================================================================

  describe('Schema Definitions', () => {
    test('COLLECTION_SCHEMAS has all required collections', () => {
      expect(COLLECTION_SCHEMAS[COLLECTION_NAMES.JOURNAL_ENTRIES]).toBeDefined();
      expect(COLLECTION_SCHEMAS[COLLECTION_NAMES.TODO_SNAPSHOTS]).toBeDefined();
      expect(COLLECTION_SCHEMAS[COLLECTION_NAMES.PRD_SECTIONS]).toBeDefined();
      expect(COLLECTION_SCHEMAS[COLLECTION_NAMES.SESSION_SUMMARIES]).toBeDefined();
    });

    test('journal_entries schema has correct fields', () => {
      const schema = COLLECTION_SCHEMAS[COLLECTION_NAMES.JOURNAL_ENTRIES];
      expect(schema.id).toBe('string');
      expect(schema.timestamp).toBe('string');
      expect(schema.content).toBe('string');
      expect(schema.summary).toBe('string');
      expect(schema.topics).toBe('string');
      expect(schema.embedding).toBe('vector(1536)');
    });

    test('todo_snapshots schema has correct fields', () => {
      const schema = COLLECTION_SCHEMAS[COLLECTION_NAMES.TODO_SNAPSHOTS];
      expect(schema.id).toBe('string');
      expect(schema.timestamp).toBe('string');
      expect(schema.sections).toBe('string');
      expect(schema.overallCompletionPct).toBe('float');
      expect(schema.embedding).toBe('vector(1536)');
    });

    test('prd_sections schema has correct fields', () => {
      const schema = COLLECTION_SCHEMAS[COLLECTION_NAMES.PRD_SECTIONS];
      expect(schema.id).toBe('string');
      expect(schema.sectionNumber).toBe('int');
      expect(schema.title).toBe('string');
      expect(schema.content).toBe('string');
      expect(schema.embedding).toBe('vector(1536)');
    });

    test('session_summaries schema has correct fields', () => {
      const schema = COLLECTION_SCHEMAS[COLLECTION_NAMES.SESSION_SUMMARIES];
      expect(schema.id).toBe('string');
      expect(schema.timestamp).toBe('string');
      expect(schema.summary).toBe('string');
      expect(schema.workCompleted).toBe('string');
      expect(schema.openItems).toBe('string');
      expect(schema.embedding).toBe('vector(1536)');
    });
  });

  // ==========================================================================
  // Integration Tests (CRUD operations)
  // ==========================================================================

  describe('Integration Tests', () => {
    test('can add and retrieve data from journal_entries', async () => {
      await initializeCollections();
      const table = await getCollection(COLLECTION_NAMES.JOURNAL_ENTRIES);

      const mockEntry = {
        id: 'test-1',
        timestamp: new Date().toISOString(),
        content: 'Test content',
        summary: 'Test summary',
        topics: '["test"]',
        embedding: new Array(1536).fill(0.1),
      };

      await table.add([mockEntry]);

      // Query all records
      const results = await table.query().limit(10).toArray();
      expect(results.length).toBeGreaterThan(0);

      const found = results.find((r) => r.id === 'test-1');
      expect(found).toBeDefined();
      expect(found?.content).toBe('Test content');
    });

    test('can perform vector search', async () => {
      await initializeCollections();
      const table = await getCollection(COLLECTION_NAMES.JOURNAL_ENTRIES);

      // Add some test data
      const mockEntries = [
        {
          id: 'entry-1',
          timestamp: new Date().toISOString(),
          content: 'Content about cats',
          summary: 'Cat summary',
          topics: '["animals"]',
          embedding: new Array(1536).fill(0.1),
        },
        {
          id: 'entry-2',
          timestamp: new Date().toISOString(),
          content: 'Content about dogs',
          summary: 'Dog summary',
          topics: '["animals"]',
          embedding: new Array(1536).fill(0.2),
        },
      ];

      await table.add(mockEntries);

      // Perform vector search
      const queryVector = new Array(1536).fill(0.15);
      const results = await table.vectorSearch(queryVector).limit(2).toArray();

      expect(results.length).toBe(2);
    });
  });
});
