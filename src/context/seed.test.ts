/**
 * Context Seeding Tests
 *
 * Tests for the seed module's pure functions and exported interface.
 * Integration tests with actual file system and database are in tests/context/.
 *
 * @module context/seed.test
 */

import {
  parseJournalEntries,
  parseJournalDate,
  DEFAULT_SEED_PATHS,
  type SeedResult,
  type SeedAllResult,
  type SeedAllOptions,
} from './seed.js';

describe('seed', () => {
  describe('parseJournalEntries', () => {
    it('should parse journal entries by session headers', () => {
      const journalContent = `
# Project Journal

This is the header.

## Session: 2024-01-01 10:00 AEST

### Summary
First session summary.

### Work Completed
- Created file1.ts

## Session: 2024-01-02 14:00 AEST

### Summary
Second session summary.

### Work Completed
- Created file2.ts
      `;

      const entries = parseJournalEntries(journalContent);

      expect(entries).toHaveLength(2);
      expect(entries[0].date).toBe('2024-01-01 10:00 AEST');
      expect(entries[0].content).toContain('First session summary');
      expect(entries[1].date).toBe('2024-01-02 14:00 AEST');
      expect(entries[1].content).toContain('Second session summary');
    });

    it('should handle empty journal', () => {
      const entries = parseJournalEntries('');
      expect(entries).toHaveLength(0);
    });

    it('should handle journal with only header', () => {
      const journalContent = `
# Project Journal

This file maintains session history.
      `;

      const entries = parseJournalEntries(journalContent);
      expect(entries).toHaveLength(0);
    });

    it('should handle single entry', () => {
      const journalContent = `
## Session: 2024-01-01

### Summary
Only session.
      `;

      const entries = parseJournalEntries(journalContent);

      expect(entries).toHaveLength(1);
      expect(entries[0].content).toContain('Only session');
    });

    it('should preserve full content of each entry', () => {
      const journalContent = `
## Session: 2024-01-01

### Summary
Session summary.

### Work Completed
- Item 1
- Item 2

### Key Decisions
- Decision 1

---
      `;

      const entries = parseJournalEntries(journalContent);

      expect(entries).toHaveLength(1);
      expect(entries[0].content).toContain('### Summary');
      expect(entries[0].content).toContain('### Work Completed');
      expect(entries[0].content).toContain('### Key Decisions');
      expect(entries[0].content).toContain('- Item 1');
    });

    it('should handle multiple sections with different formats', () => {
      const journalContent = `
## Session: Monday, January 1, 2024 10:00 AM AEST

Working on context persistence.

## Session: Tuesday, January 2, 2024

Another session.
      `;

      const entries = parseJournalEntries(journalContent);

      expect(entries).toHaveLength(2);
      expect(entries[0].date).toContain('Monday');
      expect(entries[1].date).toContain('Tuesday');
    });

    it('should skip non-session content before first session', () => {
      const journalContent = `
# Project Journal

This is preamble content that should not be parsed as an entry.

Some more intro text.

## Session: 2024-01-01

The actual first session.
      `;

      const entries = parseJournalEntries(journalContent);

      expect(entries).toHaveLength(1);
      expect(entries[0].content).not.toContain('preamble');
    });
  });

  describe('parseJournalDate', () => {
    it('should parse AEST timezone correctly', () => {
      const result = parseJournalDate('2026-01-02 21:41 AEST');
      // AEST is UTC+10, so 21:41 AEST = 11:41 UTC
      expect(result).toBe('2026-01-02T11:41:00.000Z');
    });

    it('should parse AEDT timezone correctly', () => {
      const result = parseJournalDate('2026-01-05 21:50 AEDT');
      // AEDT is UTC+11, so 21:50 AEDT = 10:50 UTC
      expect(result).toBe('2026-01-05T10:50:00.000Z');
    });

    it('should parse lowercase timezone abbreviations', () => {
      const result = parseJournalDate('2026-01-02 10:00 aest');
      // Should work case-insensitively
      expect(result).toBe('2026-01-02T00:00:00.000Z');
    });

    it('should handle US timezones', () => {
      const result = parseJournalDate('2026-01-02 14:00 PST');
      // PST is UTC-8, so 14:00 PST = 22:00 UTC
      expect(result).toBe('2026-01-02T22:00:00.000Z');
    });

    it('should handle UTC timezone', () => {
      const result = parseJournalDate('2026-01-02 12:00 UTC');
      expect(result).toBe('2026-01-02T12:00:00.000Z');
    });

    it('should fallback to native parsing for ISO 8601 strings', () => {
      const result = parseJournalDate('2026-01-02T12:00:00.000Z');
      expect(result).toBe('2026-01-02T12:00:00.000Z');
    });

    it('should return current time for unparseable dates', () => {
      // Suppress console.warn for this test
      const originalWarn = console.warn;
      const warnCalls: string[] = [];
      console.warn = (msg: string) => warnCalls.push(msg);

      const before = Date.now();
      const result = parseJournalDate('invalid date string');
      const after = Date.now();

      // Result should be a valid ISO string within the test execution window
      const resultTime = new Date(result).getTime();
      expect(resultTime).toBeGreaterThanOrEqual(before);
      expect(resultTime).toBeLessThanOrEqual(after);

      // Should have warned about unparseable date
      expect(warnCalls.length).toBeGreaterThan(0);
      expect(warnCalls[0]).toContain('Could not parse date');

      // Restore console.warn
      console.warn = originalWarn;
    });

    it('should handle all Australian timezones', () => {
      // ACST - Australian Central Standard Time (UTC+9:30)
      const acst = parseJournalDate('2026-01-02 10:00 ACST');
      expect(acst).toBe('2026-01-02T00:30:00.000Z');

      // ACDT - Australian Central Daylight Time (UTC+10:30)
      const acdt = parseJournalDate('2026-01-02 10:00 ACDT');
      expect(acdt).toBe('2026-01-01T23:30:00.000Z');

      // AWST - Australian Western Standard Time (UTC+8)
      const awst = parseJournalDate('2026-01-02 10:00 AWST');
      expect(awst).toBe('2026-01-02T02:00:00.000Z');
    });
  });

  describe('DEFAULT_SEED_PATHS', () => {
    it('should have correct default paths', () => {
      expect(DEFAULT_SEED_PATHS.PRD).toBe('docs/phase_0_prd_unified.md');
      expect(DEFAULT_SEED_PATHS.TODO).toBe('todo/tasks-phase0-travel-discovery.md');
      expect(DEFAULT_SEED_PATHS.JOURNAL).toBe('journal.md');
    });

    it('should be immutable (const)', () => {
      // TypeScript enforces this at compile time, but we can verify the values exist
      expect(Object.keys(DEFAULT_SEED_PATHS)).toContain('PRD');
      expect(Object.keys(DEFAULT_SEED_PATHS)).toContain('TODO');
      expect(Object.keys(DEFAULT_SEED_PATHS)).toContain('JOURNAL');
    });
  });

  describe('type interfaces', () => {
    it('should have correct SeedResult interface', () => {
      const result: SeedResult = {
        success: true,
        count: 5,
        errors: [],
      };

      expect(result.success).toBe(true);
      expect(result.count).toBe(5);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow errors in SeedResult', () => {
      const result: SeedResult = {
        success: false,
        count: 0,
        errors: ['Error 1', 'Error 2'],
      };

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it('should have correct SeedAllResult interface', () => {
      const result: SeedAllResult = {
        prd: { success: true, count: 5, errors: [] },
        todo: { success: true, count: 1, errors: [] },
        journal: { success: true, count: 3, errors: [] },
        overallSuccess: true,
      };

      expect(result.overallSuccess).toBe(true);
      expect(result.prd.count).toBe(5);
      expect(result.todo.count).toBe(1);
      expect(result.journal.count).toBe(3);
    });
  });

  describe('exported functions', () => {
    it('should export all required functions', async () => {
      const seed = await import('./seed.js');

      expect(typeof seed.seedPrd).toBe('function');
      expect(typeof seed.seedTodo).toBe('function');
      expect(typeof seed.seedExistingJournal).toBe('function');
      expect(typeof seed.seedAll).toBe('function');
      expect(typeof seed.parseJournalEntries).toBe('function');
      expect(typeof seed.parseJournalDate).toBe('function');
      expect(typeof seed.ensureContextDirs).toBe('function');
    });
  });

  describe('SeedAllOptions interface', () => {
    it('should have correct interface shape', () => {
      // Test that the interface accepts the expected properties
      const options1: SeedAllOptions = {};
      expect(options1.clearExisting).toBeUndefined();

      const options2: SeedAllOptions = { clearExisting: true };
      expect(options2.clearExisting).toBe(true);

      const options3: SeedAllOptions = { clearExisting: false };
      expect(options3.clearExisting).toBe(false);

      const options4: SeedAllOptions = {
        paths: { prd: 'custom/prd.md' },
        clearExisting: true,
      };
      expect(options4.paths?.prd).toBe('custom/prd.md');
      expect(options4.clearExisting).toBe(true);
    });

    it('should accept paths and clearExisting together', () => {
      const options: SeedAllOptions = {
        paths: {
          prd: 'docs/prd.md',
          todo: 'todo/tasks.md',
          journal: 'journal.md',
        },
        clearExisting: true,
      };

      expect(options.paths).toBeDefined();
      expect(options.paths?.prd).toBe('docs/prd.md');
      expect(options.paths?.todo).toBe('todo/tasks.md');
      expect(options.paths?.journal).toBe('journal.md');
      expect(options.clearExisting).toBe(true);
    });
  });
});
