/**
 * Journal Generator Tests
 *
 * @module context/journal-generator.test
 */

import {
  extractWorkCompleted,
  extractOpenItems,
  extractKeyDecisions,
  extractTopics,
  formatJournalEntry,
  generateSessionSummary,
  createCondensedSummary,
} from './journal-generator.js';
import type { GeneratedJournalEntry } from './types.js';

describe('journal-generator', () => {
  describe('extractWorkCompleted', () => {
    it('should extract work completed items from context', () => {
      const context = `
        Today we created the auto-journal module.
        Implemented the shouldTriggerJournal function.
        Added unit tests for the trigger logic.
        Fixed a bug in the todo tracking.
      `;

      const items = extractWorkCompleted(context);

      expect(items.length).toBeGreaterThan(0);
      expect(items.some((i) => i.toLowerCase().includes('auto-journal'))).toBe(true);
    });

    it('should extract checked checkboxes', () => {
      const context = `
        - [x] Create auto-journal.ts with trigger detection logic
        - [x] Implement shouldTriggerJournal function
        - [ ] Write unit tests
      `;

      const items = extractWorkCompleted(context);

      expect(items.length).toBeGreaterThanOrEqual(2);
    });

    it('should limit to 10 items', () => {
      const context = Array(20)
        .fill(0)
        .map((_, i) => `Created file${i}.ts with implementation`)
        .join('\n');

      const items = extractWorkCompleted(context);

      expect(items.length).toBeLessThanOrEqual(10);
    });

    it('should handle empty context', () => {
      expect(extractWorkCompleted('')).toEqual([]);
      expect(extractWorkCompleted('   ')).toEqual([]);
    });

    it('should filter out very short items', () => {
      const context = 'Created x. Implemented the full auto-journal module.';
      const items = extractWorkCompleted(context);

      // The very short item 'x' should be filtered out
      expect(items.every((i) => i.length > 5)).toBe(true);
    });
  });

  describe('extractOpenItems', () => {
    it('should extract open items from context', () => {
      const context = `
        We need to implement the embeddings service next.
        Still needs work on the storage layer.
        Next step: add integration tests.
      `;

      const items = extractOpenItems(context);

      expect(items.length).toBeGreaterThan(0);
    });

    it('should extract unchecked checkboxes', () => {
      const context = `
        - [x] Create auto-journal.ts
        - [ ] Write unit tests for auto-journal
        - [ ] Add integration tests
      `;

      const items = extractOpenItems(context);

      expect(items.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle empty context', () => {
      expect(extractOpenItems('')).toEqual([]);
    });
  });

  describe('extractKeyDecisions', () => {
    it('should extract key decisions from context', () => {
      const context = `
        We decided to use LanceDB for vector storage because it's embedded.
        The approach: use OpenAI embeddings with caching.
        Going with text-embedding-3-small for cost efficiency.
      `;

      const items = extractKeyDecisions(context);

      expect(items.length).toBeGreaterThan(0);
    });

    it('should limit to 5 decisions', () => {
      const context = Array(10)
        .fill(0)
        .map((_, i) => `Decided to implement feature${i} because it's important`)
        .join('\n');

      const items = extractKeyDecisions(context);

      expect(items.length).toBeLessThanOrEqual(5);
    });

    it('should handle empty context', () => {
      expect(extractKeyDecisions('')).toEqual([]);
    });
  });

  describe('extractTopics', () => {
    it('should extract topics from context', () => {
      const context = `
        Today we worked on the LanceDB integration and embeddings.
        The vector database setup is complete.
        Added tests using Jest.
      `;

      const topics = extractTopics(context);

      expect(topics).toContain('vector-db');
      expect(topics).toContain('testing');
    });

    it('should extract multiple topics', () => {
      const context = `
        Working on the RAG pipeline for context retrieval.
        The API client is almost ready.
        TypeScript interfaces are defined with Zod.
      `;

      const topics = extractTopics(context);

      expect(topics.length).toBeGreaterThan(0);
      expect(topics).toContain('rag');
      expect(topics).toContain('api');
      expect(topics).toContain('typescript');
    });

    it('should handle case insensitivity', () => {
      const context = 'LANCEDB and TYPESCRIPT and RAG';
      const topics = extractTopics(context);

      expect(topics).toContain('vector-db');
      expect(topics).toContain('typescript');
      expect(topics).toContain('rag');
    });

    it('should handle empty context', () => {
      expect(extractTopics('')).toEqual([]);
    });
  });

  describe('formatJournalEntry', () => {
    it('should format journal entry as markdown', () => {
      const entry: GeneratedJournalEntry = {
        content: '',
        summary: 'This session completed 3 items.',
        workCompleted: ['Created auto-journal.ts', 'Added tests'],
        openItems: ['Implement embeddings service'],
        keyDecisions: ['Using LanceDB for storage'],
        topics: ['vector-db', 'testing'],
      };

      const formatted = formatJournalEntry(entry);

      expect(formatted).toContain('---');
      expect(formatted).toContain('## Session:');
      expect(formatted).toContain('### Summary');
      expect(formatted).toContain('This session completed 3 items.');
      expect(formatted).toContain('### Work Completed');
      expect(formatted).toContain('- Created auto-journal.ts');
      expect(formatted).toContain('### Open Items');
      expect(formatted).toContain('- [ ] Implement embeddings service');
      expect(formatted).toContain('### Key Decisions');
      expect(formatted).toContain('### Topics');
      expect(formatted).toContain('`vector-db`');
    });

    it('should omit empty sections', () => {
      const entry: GeneratedJournalEntry = {
        content: '',
        summary: 'Brief session.',
        workCompleted: [],
        openItems: [],
        keyDecisions: [],
        topics: [],
      };

      const formatted = formatJournalEntry(entry);

      expect(formatted).toContain('### Summary');
      expect(formatted).not.toContain('### Work Completed');
      expect(formatted).not.toContain('### Open Items');
      expect(formatted).not.toContain('### Key Decisions');
      expect(formatted).not.toContain('### Topics');
    });
  });

  describe('generateSessionSummary', () => {
    it('should generate complete session summary', async () => {
      const context = `
        Created the auto-journal.ts file with trigger detection.
        Implemented shouldTriggerJournal function.
        Decided to use 3 todos as the completion threshold.
        Need to add more tests.
        Working on the journal generator next.
      `;

      const entry = await generateSessionSummary(context);

      expect(entry.summary).toBeTruthy();
      expect(entry.content).toContain('## Session:');
      expect(entry.workCompleted.length).toBeGreaterThan(0);
      expect(entry.topics).toContain('journal');
    });

    it('should handle empty context', async () => {
      const entry = await generateSessionSummary('');

      expect(entry.summary).toBeTruthy();
      expect(entry.workCompleted).toEqual([]);
      expect(entry.openItems).toEqual([]);
    });

    it('should set content from formatted entry', async () => {
      const context = 'Implemented the storage layer for context persistence.';
      const entry = await generateSessionSummary(context);

      expect(entry.content).toContain('---');
      expect(entry.content).toContain('## Session:');
    });
  });

  describe('createCondensedSummary', () => {
    it('should create condensed summary from full entry', () => {
      const entry: GeneratedJournalEntry = {
        content: 'Full content...',
        summary: 'This session completed 3 items.',
        workCompleted: ['Created file1.ts', 'Added tests', 'Fixed bugs'],
        openItems: ['Need to add docs', 'Deploy to staging'],
        keyDecisions: ['Using TypeScript strict mode'],
        topics: ['testing'],
      };

      const condensed = createCondensedSummary(entry);

      expect(condensed).toContain('This session completed 3 items.');
      expect(condensed).toContain('Completed:');
      expect(condensed).toContain('Open:');
      expect(condensed).toContain('Decisions:');
    });

    it('should limit items in condensed summary', () => {
      const entry: GeneratedJournalEntry = {
        content: 'Full content...',
        summary: 'Big session.',
        workCompleted: ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5'],
        openItems: ['Open 1', 'Open 2', 'Open 3', 'Open 4'],
        keyDecisions: ['Decision 1', 'Decision 2', 'Decision 3'],
        topics: [],
      };

      const condensed = createCondensedSummary(entry);

      // Should have max 3 work completed, 2 open, 2 decisions
      const workMatches = condensed.match(/Item \d/g) || [];
      const openMatches = condensed.match(/Open \d/g) || [];
      const decisionMatches = condensed.match(/Decision \d/g) || [];

      expect(workMatches.length).toBeLessThanOrEqual(3);
      expect(openMatches.length).toBeLessThanOrEqual(2);
      expect(decisionMatches.length).toBeLessThanOrEqual(2);
    });

    it('should handle empty arrays', () => {
      const entry: GeneratedJournalEntry = {
        content: '',
        summary: 'Empty session.',
        workCompleted: [],
        openItems: [],
        keyDecisions: [],
        topics: [],
      };

      const condensed = createCondensedSummary(entry);

      expect(condensed).toBe('Empty session.');
    });
  });
});
