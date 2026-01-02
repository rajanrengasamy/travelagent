/**
 * Auto-Journal Trigger Tests
 *
 * @module context/auto-journal.test
 */

import {
  shouldTriggerJournal,
  trackTodoCompletion,
  trackSignificantActions,
  isSignificantAction,
  createEmptyTodoState,
  createEmptySessionStats,
  updateSessionStats,
} from './auto-journal.js';
import type { SessionStats, TodoState, Action, AutoJournalConfig } from './types.js';
import { DEFAULT_AUTO_JOURNAL_CONFIG } from './types.js';

describe('auto-journal', () => {
  describe('shouldTriggerJournal', () => {
    it('should trigger when todos completed exceeds threshold', () => {
      const stats: SessionStats = {
        todosCompleted: 5, // Exceeds threshold of 3
        significantActionsCount: 2,
        durationMinutes: 20, // Exceeds minimum of 15
        sessionStartTime: new Date().toISOString(),
      };

      expect(shouldTriggerJournal(stats)).toBe(true);
    });

    it('should trigger when significant actions exceeds threshold', () => {
      const stats: SessionStats = {
        todosCompleted: 1,
        significantActionsCount: 15, // Exceeds threshold of 10
        durationMinutes: 20,
        sessionStartTime: new Date().toISOString(),
      };

      expect(shouldTriggerJournal(stats)).toBe(true);
    });

    it('should not trigger below thresholds', () => {
      const stats: SessionStats = {
        todosCompleted: 2, // Below threshold of 3
        significantActionsCount: 5, // Below threshold of 10
        durationMinutes: 20,
        sessionStartTime: new Date().toISOString(),
      };

      expect(shouldTriggerJournal(stats)).toBe(false);
    });

    it('should not trigger if session too short', () => {
      const stats: SessionStats = {
        todosCompleted: 10, // Exceeds threshold
        significantActionsCount: 20, // Exceeds threshold
        durationMinutes: 5, // Below minimum of 15
        sessionStartTime: new Date().toISOString(),
      };

      expect(shouldTriggerJournal(stats)).toBe(false);
    });

    it('should trigger at exact threshold values', () => {
      const stats: SessionStats = {
        todosCompleted: 3, // Exactly at threshold
        significantActionsCount: 0,
        durationMinutes: 15, // Exactly at minimum
        sessionStartTime: new Date().toISOString(),
      };

      expect(shouldTriggerJournal(stats)).toBe(true);
    });

    it('should use custom config when provided', () => {
      const customConfig: AutoJournalConfig = {
        todoCompletionThreshold: 1,
        significantActionThreshold: 5,
        significantActions: ['Edit'],
        minSessionDuration: 5,
      };

      const stats: SessionStats = {
        todosCompleted: 1,
        significantActionsCount: 0,
        durationMinutes: 5,
        sessionStartTime: new Date().toISOString(),
      };

      expect(shouldTriggerJournal(stats, customConfig)).toBe(true);
      expect(shouldTriggerJournal(stats, DEFAULT_AUTO_JOURNAL_CONFIG)).toBe(false);
    });
  });

  describe('trackTodoCompletion', () => {
    it('should count newly completed items', () => {
      const before: TodoState = {
        items: new Map([
          ['0.0.1', false],
          ['0.0.2', false],
          ['0.0.3', true], // Already completed
        ]),
        timestamp: '2024-01-01T00:00:00Z',
      };

      const after: TodoState = {
        items: new Map([
          ['0.0.1', true], // Newly completed
          ['0.0.2', true], // Newly completed
          ['0.0.3', true], // Was already completed
        ]),
        timestamp: '2024-01-01T01:00:00Z',
      };

      expect(trackTodoCompletion(before, after)).toBe(2);
    });

    it('should count new items that are completed', () => {
      const before: TodoState = {
        items: new Map([['0.0.1', false]]),
        timestamp: '2024-01-01T00:00:00Z',
      };

      const after: TodoState = {
        items: new Map([
          ['0.0.1', false],
          ['0.0.2', true], // New and completed
        ]),
        timestamp: '2024-01-01T01:00:00Z',
      };

      expect(trackTodoCompletion(before, after)).toBe(1);
    });

    it('should return 0 when no items completed', () => {
      const before: TodoState = {
        items: new Map([
          ['0.0.1', false],
          ['0.0.2', true],
        ]),
        timestamp: '2024-01-01T00:00:00Z',
      };

      const after: TodoState = {
        items: new Map([
          ['0.0.1', false],
          ['0.0.2', true],
        ]),
        timestamp: '2024-01-01T01:00:00Z',
      };

      expect(trackTodoCompletion(before, after)).toBe(0);
    });

    it('should handle empty states', () => {
      const empty = createEmptyTodoState();
      expect(trackTodoCompletion(empty, empty)).toBe(0);
    });

    it('should not count items that were uncompleted', () => {
      const before: TodoState = {
        items: new Map([['0.0.1', true]]),
        timestamp: '2024-01-01T00:00:00Z',
      };

      const after: TodoState = {
        items: new Map([['0.0.1', false]]), // Uncompleted
        timestamp: '2024-01-01T01:00:00Z',
      };

      expect(trackTodoCompletion(before, after)).toBe(0);
    });
  });

  describe('isSignificantAction', () => {
    const significantTypes = DEFAULT_AUTO_JOURNAL_CONFIG.significantActions;

    it('should match exact type', () => {
      const action: Action = {
        type: 'Edit',
        timestamp: new Date().toISOString(),
      };

      expect(isSignificantAction(action, significantTypes)).toBe(true);
    });

    it('should match type:subtype pattern', () => {
      const action: Action = {
        type: 'Bash',
        subtype: 'git commit -m "test"',
        timestamp: new Date().toISOString(),
      };

      expect(isSignificantAction(action, significantTypes)).toBe(true);
    });

    it('should match TodoWrite:completed pattern', () => {
      const action: Action = {
        type: 'TodoWrite',
        subtype: 'completed',
        timestamp: new Date().toISOString(),
      };

      expect(isSignificantAction(action, significantTypes)).toBe(true);
    });

    it('should not match non-significant actions', () => {
      const action: Action = {
        type: 'Read',
        timestamp: new Date().toISOString(),
      };

      expect(isSignificantAction(action, significantTypes)).toBe(false);
    });

    it('should be case-insensitive for subtype matching', () => {
      const action: Action = {
        type: 'Bash',
        subtype: 'GIT COMMIT -m "test"',
        timestamp: new Date().toISOString(),
      };

      expect(isSignificantAction(action, significantTypes)).toBe(true);
    });
  });

  describe('trackSignificantActions', () => {
    it('should count significant actions correctly', () => {
      const actions: Action[] = [
        { type: 'Edit', timestamp: '2024-01-01T00:00:00Z' },
        { type: 'Read', timestamp: '2024-01-01T00:01:00Z' }, // Not significant
        { type: 'Write', timestamp: '2024-01-01T00:02:00Z' },
        { type: 'Bash', subtype: 'git commit', timestamp: '2024-01-01T00:03:00Z' },
        { type: 'Bash', subtype: 'npm test', timestamp: '2024-01-01T00:04:00Z' }, // Not significant
      ];

      expect(trackSignificantActions(actions)).toBe(3);
    });

    it('should return 0 for empty actions', () => {
      expect(trackSignificantActions([])).toBe(0);
    });

    it('should return 0 when no significant actions', () => {
      const actions: Action[] = [
        { type: 'Read', timestamp: '2024-01-01T00:00:00Z' },
        { type: 'Glob', timestamp: '2024-01-01T00:01:00Z' },
      ];

      expect(trackSignificantActions(actions)).toBe(0);
    });

    it('should use custom config when provided', () => {
      const customConfig: AutoJournalConfig = {
        ...DEFAULT_AUTO_JOURNAL_CONFIG,
        significantActions: ['Read', 'Glob'],
      };

      const actions: Action[] = [
        { type: 'Read', timestamp: '2024-01-01T00:00:00Z' },
        { type: 'Edit', timestamp: '2024-01-01T00:01:00Z' },
      ];

      expect(trackSignificantActions(actions, customConfig)).toBe(1);
    });
  });

  describe('createEmptyTodoState', () => {
    it('should create empty state with current timestamp', () => {
      const before = new Date();
      const state = createEmptyTodoState();
      const after = new Date();

      expect(state.items.size).toBe(0);
      expect(new Date(state.timestamp).getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(new Date(state.timestamp).getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('createEmptySessionStats', () => {
    it('should create empty stats with current timestamp', () => {
      const before = new Date();
      const stats = createEmptySessionStats();
      const after = new Date();

      expect(stats.todosCompleted).toBe(0);
      expect(stats.significantActionsCount).toBe(0);
      expect(stats.durationMinutes).toBe(0);
      expect(new Date(stats.sessionStartTime).getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(new Date(stats.sessionStartTime).getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('updateSessionStats', () => {
    it('should accumulate completed todos and significant actions', () => {
      // Set start time to 30 minutes ago
      const startTime = new Date(Date.now() - 30 * 60 * 1000);

      const initialStats: SessionStats = {
        todosCompleted: 2,
        significantActionsCount: 5,
        durationMinutes: 0,
        sessionStartTime: startTime.toISOString(),
      };

      const todosBefore: TodoState = {
        items: new Map([['0.0.1', false]]),
        timestamp: startTime.toISOString(),
      };

      const todosAfter: TodoState = {
        items: new Map([['0.0.1', true]]),
        timestamp: new Date().toISOString(),
      };

      const newActions: Action[] = [
        { type: 'Edit', timestamp: new Date().toISOString() },
        { type: 'Write', timestamp: new Date().toISOString() },
      ];

      const updated = updateSessionStats(initialStats, todosBefore, todosAfter, newActions);

      expect(updated.todosCompleted).toBe(3); // 2 + 1
      expect(updated.significantActionsCount).toBe(7); // 5 + 2
      expect(updated.durationMinutes).toBeGreaterThanOrEqual(29); // Should be ~30 minutes
      expect(updated.sessionStartTime).toBe(initialStats.sessionStartTime);
    });
  });
});
