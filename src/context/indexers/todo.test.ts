/**
 * TODO Indexer Tests
 *
 * Tests for TODO parsing, section extraction, completion tracking, and snapshots.
 * Uses jest.unstable_mockModule for proper ESM mocking of fs/promises.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { TodoSection, TodoSnapshot } from '../types.js';

// Create mock readFile function before any imports
const mockReadFile = jest.fn<(path: string, encoding: string) => Promise<string>>();

// Mock fs/promises with ESM-compatible pattern
jest.unstable_mockModule('fs/promises', () => ({
  readFile: mockReadFile,
  __esModule: true,
}));

// Import the module under test AFTER setting up mocks
const {
  parseTodoSections,
  parseTodoItems,
  calculateCompletionStats,
  calculateOverallCompletion,
  snapshotTodo,
  diffTodoStates,
  extractTaskId,
  isTodoItem,
  isCompleted,
  getIndentLevel,
  extractDescription,
  isSectionHeader,
  extractSectionId,
  generateSnapshotId,
  getSnapshotSummary,
  getGranularTodoSummary,
} = await import('./todo.js');

describe('TODO Indexer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFile.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('extractTaskId', () => {
    it('should extract task IDs from regular items', () => {
      expect(extractTaskId('- [ ] 0.0.1.1 Install dependencies')).toBe('0.0.1.1');
      expect(extractTaskId('- [x] 1.2 Complete task')).toBe('1.2');
      expect(extractTaskId('- [ ] 0.0.5 Some task')).toBe('0.0.5');
    });

    it('should extract task IDs from bold headers', () => {
      expect(extractTaskId('- [ ] **0.0.1 Embedding Service**')).toBe('0.0.1');
      expect(extractTaskId('- [x] **12.5 Large Number**')).toBe('12.5');
    });

    it('should return null for items without IDs', () => {
      expect(extractTaskId('- [ ] Create file')).toBeNull();
      expect(extractTaskId('- [x] Just a description')).toBeNull();
      expect(extractTaskId('Some random text')).toBeNull();
    });

    it('should handle indented items', () => {
      expect(extractTaskId('  - [ ] 0.0.1.1 Indented task')).toBe('0.0.1.1');
      expect(extractTaskId('    - [x] 2.3.4 Deep indent')).toBe('2.3.4');
    });
  });

  describe('isTodoItem', () => {
    it('should identify TODO items', () => {
      expect(isTodoItem('- [ ] Incomplete')).toBe(true);
      expect(isTodoItem('- [x] Complete')).toBe(true);
      expect(isTodoItem('  - [ ] Indented')).toBe(true);
    });

    it('should reject non-TODO lines', () => {
      expect(isTodoItem('## Header')).toBe(false);
      expect(isTodoItem('Regular text')).toBe(false);
      expect(isTodoItem('- Regular list item')).toBe(false);
      expect(isTodoItem('')).toBe(false);
    });
  });

  describe('isCompleted', () => {
    it('should identify completed items', () => {
      expect(isCompleted('- [x] Done')).toBe(true);
      expect(isCompleted('- [X] Also done')).toBe(true);
      expect(isCompleted('  - [x] Indented done')).toBe(true);
    });

    it('should identify incomplete items', () => {
      expect(isCompleted('- [ ] Not done')).toBe(false);
      expect(isCompleted('  - [ ] Indented not done')).toBe(false);
    });
  });

  describe('getIndentLevel', () => {
    it('should return correct indent levels', () => {
      expect(getIndentLevel('No indent')).toBe(0);
      expect(getIndentLevel('  Two spaces')).toBe(2);
      expect(getIndentLevel('    Four spaces')).toBe(4);
      expect(getIndentLevel('      Six spaces')).toBe(6);
    });
  });

  describe('extractDescription', () => {
    it('should extract clean descriptions', () => {
      expect(extractDescription('- [ ] 0.0.1 Install dependencies')).toBe('Install dependencies');
      expect(extractDescription('- [x] **0.0.2 Embedding Service**')).toBe('Embedding Service');
      expect(extractDescription('- [ ] Create file')).toBe('Create file');
    });

    it('should handle complex descriptions', () => {
      expect(extractDescription('  - [ ] 1.2.3 Do something with `code`')).toBe(
        'Do something with `code`'
      );
    });
  });

  describe('parseTodoItems', () => {
    it('should parse complete and incomplete items', () => {
      const content = `
- [ ] 0.0.1 First task
- [x] 0.0.2 Second task
- [ ] 0.0.3 Third task
`;
      const items = parseTodoItems(content, 'test');

      expect(items).toHaveLength(3);
      expect(items[0].id).toBe('0.0.1');
      expect(items[0].completed).toBe(false);
      expect(items[1].id).toBe('0.0.2');
      expect(items[1].completed).toBe(true);
      expect(items[2].id).toBe('0.0.3');
      expect(items[2].completed).toBe(false);
    });

    it('should handle nested items', () => {
      const content = `
- [ ] **0.0.1 Parent Task**
  - [ ] 0.0.1.1 Child task 1
  - [x] 0.0.1.2 Child task 2
    - [ ] 0.0.1.2.1 Grandchild
`;
      const items = parseTodoItems(content, 'test');

      expect(items).toHaveLength(4);

      // Parent
      expect(items[0].id).toBe('0.0.1');
      expect(items[0].parentId).toBeUndefined();

      // Children
      expect(items[1].id).toBe('0.0.1.1');
      expect(items[1].parentId).toBe('0.0.1');

      expect(items[2].id).toBe('0.0.1.2');
      expect(items[2].parentId).toBe('0.0.1');

      // Grandchild
      expect(items[3].id).toBe('0.0.1.2.1');
      expect(items[3].parentId).toBe('0.0.1.2');
    });

    it('should generate IDs for items without task IDs', () => {
      const content = `
- [ ] First item without ID
- [ ] Second item without ID
`;
      const items = parseTodoItems(content, 'section-1');

      expect(items).toHaveLength(2);
      expect(items[0].id).toBe('section-1-item-0');
      expect(items[1].id).toBe('section-1-item-1');
    });

    it('should handle empty content', () => {
      expect(parseTodoItems('', 'test')).toHaveLength(0);
      expect(parseTodoItems('   \n  \n', 'test')).toHaveLength(0);
    });
  });

  describe('isSectionHeader', () => {
    it('should identify H3 headers', () => {
      expect(isSectionHeader('### Phase 0.0 - Context')).toBe(true);
      expect(isSectionHeader('###Phase Without Space')).toBe(false);
    });

    it('should identify bold task group headers', () => {
      expect(isSectionHeader('- [ ] **0.0.1 Embedding Service**')).toBe(true);
      expect(isSectionHeader('- [x] **1.2 Another Group**')).toBe(true);
    });

    it('should reject regular items', () => {
      expect(isSectionHeader('- [ ] 0.0.1.1 Regular item')).toBe(false);
      expect(isSectionHeader('## H2 Header')).toBe(false);
    });
  });

  describe('extractSectionId', () => {
    it('should extract phase numbers', () => {
      expect(extractSectionId('### Phase 0.0 - Context')).toBe('phase-0-0');
      expect(extractSectionId('### Phase 1.2 - Something')).toBe('phase-1-2');
    });

    it('should extract task IDs from bold headers', () => {
      expect(extractSectionId('- [ ] **0.0.1 Service**')).toBe('task-0-0-1');
    });

    it('should slugify other headers', () => {
      expect(extractSectionId('### Summary')).toBe('summary');
    });
  });

  describe('parseTodoSections', () => {
    const sampleTodo = `## Relevant Files

Some notes here.

## Tasks

### Phase 0.0 - Context Persistence Infrastructure

- [ ] **0.0.0 Context Persistence Setup**
  - [ ] 0.0.1 Install LanceDB
  - [x] 0.0.2 Create directory
  - [ ] 0.0.3 Verify API key

- [ ] **0.0.1 Embedding Service**
  - [ ] 0.0.1.1 Create embeddings.ts
  - [ ] 0.0.1.2 Implement generateEmbedding

### Phase 1 - Main Features

- [ ] **1.0 Feature One**
  - [ ] 1.0.1 Sub task
  - [x] 1.0.2 Done sub task
`;

    it('should parse sections with items', () => {
      const sections = parseTodoSections(sampleTodo);

      expect(sections).toHaveLength(2);
      expect(sections[0].name).toContain('Phase 0.0');
      expect(sections[1].name).toContain('Phase 1');
    });

    it('should extract items within sections', () => {
      const sections = parseTodoSections(sampleTodo);

      // Phase 0.0 should have items from both task groups
      expect(sections[0].items.length).toBeGreaterThan(0);
    });

    it('should calculate completion percentage', () => {
      const sections = parseTodoSections(sampleTodo);

      // Each section should have a completion percentage
      for (const section of sections) {
        expect(section.completionPct).toBeGreaterThanOrEqual(0);
        expect(section.completionPct).toBeLessThanOrEqual(100);
      }
    });

    it('should handle empty TODO', () => {
      expect(parseTodoSections('')).toHaveLength(0);
      expect(parseTodoSections('## No Tasks section')).toHaveLength(0);
    });

    it('should handle TODO with only Tasks header', () => {
      const todo = `## Tasks

Nothing here yet.
`;
      const sections = parseTodoSections(todo);
      expect(sections).toHaveLength(0);
    });
  });

  describe('calculateCompletionStats', () => {
    it('should calculate stats for mixed items', () => {
      const section: Pick<TodoSection, 'items'> = {
        items: [
          { id: '1', description: 'A', completed: true },
          { id: '2', description: 'B', completed: false },
          { id: '3', description: 'C', completed: true },
          { id: '4', description: 'D', completed: false },
        ],
      };

      const stats = calculateCompletionStats(section);

      expect(stats.total).toBe(4);
      expect(stats.completed).toBe(2);
      expect(stats.percentage).toBe(50);
    });

    it('should handle all completed', () => {
      const section: Pick<TodoSection, 'items'> = {
        items: [
          { id: '1', description: 'A', completed: true },
          { id: '2', description: 'B', completed: true },
        ],
      };

      const stats = calculateCompletionStats(section);

      expect(stats.percentage).toBe(100);
    });

    it('should handle none completed', () => {
      const section: Pick<TodoSection, 'items'> = {
        items: [
          { id: '1', description: 'A', completed: false },
          { id: '2', description: 'B', completed: false },
        ],
      };

      const stats = calculateCompletionStats(section);

      expect(stats.percentage).toBe(0);
    });

    it('should handle empty items', () => {
      const section: Pick<TodoSection, 'items'> = { items: [] };

      const stats = calculateCompletionStats(section);

      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.percentage).toBe(0);
    });

    it('should round percentage', () => {
      const section: Pick<TodoSection, 'items'> = {
        items: [
          { id: '1', description: 'A', completed: true },
          { id: '2', description: 'B', completed: false },
          { id: '3', description: 'C', completed: false },
        ],
      };

      const stats = calculateCompletionStats(section);

      expect(stats.percentage).toBe(33); // 1/3 = 33.33... rounds to 33
    });
  });

  describe('calculateOverallCompletion', () => {
    it('should calculate overall stats across sections', () => {
      const sections: TodoSection[] = [
        {
          name: 'Section 1',
          sectionId: 's1',
          items: [
            { id: '1', description: 'A', completed: true },
            { id: '2', description: 'B', completed: true },
          ],
          completionPct: 100,
        },
        {
          name: 'Section 2',
          sectionId: 's2',
          items: [
            { id: '3', description: 'C', completed: false },
            { id: '4', description: 'D', completed: false },
          ],
          completionPct: 0,
        },
      ];

      const overall = calculateOverallCompletion(sections);

      expect(overall).toBe(50); // 2 of 4 = 50%
    });

    it('should handle empty sections array', () => {
      expect(calculateOverallCompletion([])).toBe(0);
    });
  });

  describe('snapshotTodo', () => {
    const sampleTodo = `## Tasks

### Phase 0.0

- [ ] **0.0.1 Task Group**
  - [x] 0.0.1.1 Done
  - [ ] 0.0.1.2 Not done
`;

    it('should create snapshot with sections', async () => {
      mockReadFile.mockResolvedValue(sampleTodo);

      const snapshot = await snapshotTodo('/path/to/todo.md');

      expect(snapshot.id).toMatch(/^todo-snapshot-/);
      expect(snapshot.timestamp).toBeTruthy();
      expect(snapshot.sections).toHaveLength(1);
      expect(snapshot.overallCompletionPct).toBeGreaterThanOrEqual(0);
    });

    it('should call store function if provided', async () => {
      mockReadFile.mockResolvedValue(sampleTodo);
      const storeFn = jest
        .fn<(snapshot: TodoSnapshot) => Promise<void>>()
        .mockResolvedValue(undefined);

      await snapshotTodo('/path/to/todo.md', storeFn);

      expect(storeFn).toHaveBeenCalledTimes(1);

      // Verify the snapshot was passed to store function
      const calledWith = storeFn.mock.calls[0][0];
      expect(calledWith.id).toMatch(/^todo-snapshot-/);
      expect(Array.isArray(calledWith.sections)).toBe(true);
    });

    it('should generate unique snapshot IDs', async () => {
      mockReadFile.mockResolvedValue(sampleTodo);

      const snapshot1 = await snapshotTodo('/path/to/todo.md');
      const snapshot2 = await snapshotTodo('/path/to/todo.md');

      expect(snapshot1.id).not.toBe(snapshot2.id);
    });
  });

  describe('diffTodoStates', () => {
    const createSnapshot = (items: Array<{ id: string; completed: boolean }>): TodoSnapshot => ({
      id: 'test',
      timestamp: new Date().toISOString(),
      sections: [
        {
          name: 'Test',
          sectionId: 'test',
          items: items.map((i) => ({ ...i, description: 'desc' })),
          completionPct: 0,
        },
      ],
      overallCompletionPct: 0,
      embedding: [],
    });

    it('should detect completed items', () => {
      const before = createSnapshot([
        { id: '1', completed: false },
        { id: '2', completed: false },
      ]);
      const after = createSnapshot([
        { id: '1', completed: true },
        { id: '2', completed: false },
      ]);

      const diff = diffTodoStates(before, after);

      expect(diff.completed).toEqual(['1']);
      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual([]);
    });

    it('should detect added items', () => {
      const before = createSnapshot([{ id: '1', completed: false }]);
      const after = createSnapshot([
        { id: '1', completed: false },
        { id: '2', completed: false },
      ]);

      const diff = diffTodoStates(before, after);

      expect(diff.added).toEqual(['2']);
      expect(diff.completed).toEqual([]);
      expect(diff.removed).toEqual([]);
    });

    it('should detect removed items', () => {
      const before = createSnapshot([
        { id: '1', completed: false },
        { id: '2', completed: false },
      ]);
      const after = createSnapshot([{ id: '1', completed: false }]);

      const diff = diffTodoStates(before, after);

      expect(diff.removed).toEqual(['2']);
      expect(diff.added).toEqual([]);
      expect(diff.completed).toEqual([]);
    });

    it('should handle multiple changes', () => {
      const before = createSnapshot([
        { id: '1', completed: false },
        { id: '2', completed: false },
        { id: '3', completed: true },
      ]);
      const after = createSnapshot([
        { id: '1', completed: true }, // completed
        { id: '3', completed: true }, // unchanged
        { id: '4', completed: false }, // added
        // '2' removed
      ]);

      const diff = diffTodoStates(before, after);

      expect(diff.completed).toEqual(['1']);
      expect(diff.added).toEqual(['4']);
      expect(diff.removed).toEqual(['2']);
    });

    it('should not count already-completed items as newly completed', () => {
      const before = createSnapshot([{ id: '1', completed: true }]);
      const after = createSnapshot([{ id: '1', completed: true }]);

      const diff = diffTodoStates(before, after);

      expect(diff.completed).toEqual([]);
    });

    it('should handle empty snapshots', () => {
      const empty = createSnapshot([]);
      const withItems = createSnapshot([{ id: '1', completed: false }]);

      const diff1 = diffTodoStates(empty, withItems);
      expect(diff1.added).toEqual(['1']);

      const diff2 = diffTodoStates(withItems, empty);
      expect(diff2.removed).toEqual(['1']);
    });
  });

  describe('generateSnapshotId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateSnapshotId();
      const id2 = generateSnapshotId();

      expect(id1).not.toBe(id2);
    });

    it('should have correct format', () => {
      const id = generateSnapshotId();

      expect(id).toMatch(/^todo-snapshot-\d{8}-\d{6}-[a-z0-9]{4}$/);
    });
  });

  describe('getSnapshotSummary', () => {
    it('should generate text summary', () => {
      const snapshot: TodoSnapshot = {
        id: 'test-snapshot',
        timestamp: '2024-01-15T10:30:00Z',
        sections: [
          {
            name: 'Phase 1',
            sectionId: 'phase-1',
            items: [
              { id: '1.1', description: 'First task', completed: true },
              { id: '1.2', description: 'Second task', completed: false },
            ],
            completionPct: 50,
          },
        ],
        overallCompletionPct: 50,
        embedding: [],
      };

      const summary = getSnapshotSummary(snapshot);

      expect(summary).toContain('50% complete');
      expect(summary).toContain('Phase 1');
      expect(summary).toContain('[x] 1.1');
      expect(summary).toContain('[ ] 1.2');
    });
  });

  describe('edge cases', () => {
    it('should handle malformed TODO items gracefully', () => {
      const content = `
- [?] Invalid checkbox
- [] Missing space
-[ ] No space after dash
- [ ] Valid item
`;
      const items = parseTodoItems(content, 'test');

      // Only items matching - [ ] or - [x] pattern are parsed
      // Invalid checkbox [?] is not matched
      // Missing space [] is not matched
      // No space after dash -[ ] is not matched
      expect(items.length).toBe(1);
      expect(items[0].description).toBe('Valid item');
    });

    it('should handle sections with only headers', () => {
      const todo = `## Tasks

### Phase 0.0

### Phase 1.0
`;
      const sections = parseTodoSections(todo);

      // Both sections exist but have no items
      expect(sections).toHaveLength(2);
      expect(sections[0].items).toHaveLength(0);
      expect(sections[1].items).toHaveLength(0);
    });
  });

  describe('getGranularTodoSummary', () => {
    const createSnapshot = (): TodoSnapshot => ({
      id: 'test-snapshot',
      timestamp: '2024-01-15T10:30:00Z',
      sections: [
        {
          name: 'Phase 14.0 - Ranking Stage',
          sectionId: 'phase-14-0',
          items: [
            { id: '14.0', description: 'Ranking implementation', completed: false },
            { id: '14.0.1', description: 'Create scorer module', completed: true, parentId: '14.0' },
            { id: '14.0.2', description: 'Add scoring tests', completed: false, parentId: '14.0' },
            {
              id: '14.0.2.1',
              description: 'Unit tests for scorer',
              completed: false,
              parentId: '14.0.2',
            },
          ],
          completionPct: 25,
        },
        {
          name: 'Phase 15.0 - Validation',
          sectionId: 'phase-15-0',
          items: [
            { id: '15.0', description: 'Validation stage', completed: false },
            { id: '15.0.1', description: 'Schema validation', completed: false, parentId: '15.0' },
          ],
          completionPct: 0,
        },
      ],
      overallCompletionPct: 12,
      embedding: [],
    });

    it('should render hierarchical task structure', () => {
      const snapshot = createSnapshot();
      const summary = getGranularTodoSummary(snapshot);

      // Should contain section headers
      expect(summary).toContain('### Phase 14.0 - Ranking Stage (25%)');
      expect(summary).toContain('### Phase 15.0 - Validation (0%)');

      // Should contain top-level tasks
      expect(summary).toContain('- [ ] 14.0 Ranking implementation');

      // Should NOT contain completed items by default
      expect(summary).not.toContain('14.0.1 Create scorer module');

      // Should contain nested items with indentation
      expect(summary).toContain('  - [ ] 14.0.2 Add scoring tests');
      expect(summary).toContain('    - [ ] 14.0.2.1 Unit tests for scorer');
    });

    it('should show completed items when showCompleted is true', () => {
      const snapshot = createSnapshot();
      const summary = getGranularTodoSummary(snapshot, { showCompleted: true });

      // Should contain completed items
      expect(summary).toContain('[x] 14.0.1 Create scorer module');
    });

    it('should filter by section name', () => {
      const snapshot = createSnapshot();
      const summary = getGranularTodoSummary(snapshot, { sectionFilter: '14.0' });

      // Should only contain Phase 14.0
      expect(summary).toContain('Phase 14.0');
      expect(summary).not.toContain('Phase 15.0');
    });

    it('should filter by keyword', () => {
      const snapshot = createSnapshot();
      const summary = getGranularTodoSummary(snapshot, { sectionFilter: 'Ranking' });

      // Should only contain the Ranking section
      expect(summary).toContain('Ranking Stage');
      expect(summary).not.toContain('Validation');
    });

    it('should limit items with maxItems option', () => {
      const snapshot = createSnapshot();
      const summary = getGranularTodoSummary(snapshot, { maxItems: 2 });

      // Should contain truncation message
      expect(summary).toContain('truncated at 2 items');

      // Count the task lines (lines starting with "- [ ]" or "- [x]")
      const taskLines = summary.split('\n').filter((line) => /^\s*-\s\[[ x]\]/.test(line));
      expect(taskLines.length).toBe(2);
    });

    it('should handle empty sections', () => {
      const emptySnapshot: TodoSnapshot = {
        id: 'empty',
        timestamp: '2024-01-15T10:30:00Z',
        sections: [],
        overallCompletionPct: 0,
        embedding: [],
      };

      const summary = getGranularTodoSummary(emptySnapshot);
      expect(summary).toBe('');
    });

    it('should handle section with all completed items (no output when showCompleted=false)', () => {
      const allCompletedSnapshot: TodoSnapshot = {
        id: 'all-done',
        timestamp: '2024-01-15T10:30:00Z',
        sections: [
          {
            name: 'Phase 1.0 - Done',
            sectionId: 'phase-1-0',
            items: [
              { id: '1.0', description: 'First task', completed: true },
              { id: '1.1', description: 'Second task', completed: true },
            ],
            completionPct: 100,
          },
        ],
        overallCompletionPct: 100,
        embedding: [],
      };

      const summary = getGranularTodoSummary(allCompletedSnapshot);

      // Should have section header but no items
      expect(summary).toContain('### Phase 1.0 - Done (100%)');
      expect(summary).not.toContain('- [ ]');
      expect(summary).not.toContain('- [x]');
    });
  });
});
