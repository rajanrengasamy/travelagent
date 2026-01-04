/**
 * Auto-Journal Trigger Logic
 *
 * Detects when to automatically trigger journal generation based on
 * session activity thresholds: TODO completions, significant actions,
 * and session duration.
 *
 * @module context/auto-journal
 * @see PRD Section 0.8
 */

import type { AutoJournalConfig, SessionStats, TodoState, Action } from './types.js';
import { DEFAULT_AUTO_JOURNAL_CONFIG } from './types.js';

/**
 * Determines if a journal entry should be triggered based on session statistics.
 *
 * Triggers when any of the following conditions are met (AND session duration is sufficient):
 * - TODOs completed >= threshold (default 3)
 * - Significant actions >= threshold (default 10)
 *
 * @param stats - Current session statistics
 * @param config - Optional custom configuration (defaults to DEFAULT_AUTO_JOURNAL_CONFIG)
 * @returns true if journal should be triggered
 */
export function shouldTriggerJournal(
  stats: SessionStats,
  config: AutoJournalConfig = DEFAULT_AUTO_JOURNAL_CONFIG
): boolean {
  // Check minimum session duration first
  if (stats.durationMinutes < config.minSessionDuration) {
    return false;
  }

  // Trigger if todos completed exceeds threshold
  if (stats.todosCompleted >= config.todoCompletionThreshold) {
    return true;
  }

  // Trigger if significant actions exceeds threshold
  if (stats.significantActionsCount >= config.significantActionThreshold) {
    return true;
  }

  return false;
}

/**
 * Tracks the number of TODO items completed between two states.
 *
 * Counts items that were not completed in the 'before' state but
 * are completed in the 'after' state.
 *
 * @param before - Previous TODO state
 * @param after - Current TODO state
 * @returns Number of newly completed items
 */
export function trackTodoCompletion(before: TodoState, after: TodoState): number {
  let completedCount = 0;

  // Iterate through all items in the 'after' state
  for (const [taskId, isCompleted] of after.items) {
    // Count as completed if:
    // 1. It's completed in 'after' state
    // 2. Either it didn't exist in 'before' OR it wasn't completed in 'before'
    if (isCompleted) {
      const wasCompletedBefore = before.items.get(taskId) ?? false;
      if (!wasCompletedBefore) {
        completedCount++;
      }
    }
  }

  return completedCount;
}

/**
 * Determines if an action is considered "significant" based on type matching.
 *
 * Significant actions are those that indicate meaningful work:
 * - File edits (Edit, Write)
 * - Git commits (Bash:git commit)
 * - TODO completions (TodoWrite:completed)
 *
 * @param action - The action to evaluate
 * @param significantTypes - List of significant action patterns
 * @returns true if the action is significant
 */
export function isSignificantAction(action: Action, significantTypes: string[]): boolean {
  for (const pattern of significantTypes) {
    // Check for exact type match
    if (action.type === pattern) {
      return true;
    }

    // Check for type:subtype pattern match
    if (pattern.includes(':')) {
      const [patternType, patternSubtype] = pattern.split(':');
      if (
        action.type === patternType &&
        action.subtype?.toLowerCase().includes(patternSubtype.toLowerCase())
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Counts the number of significant actions from a list.
 *
 * Uses the configured list of significant action types to filter
 * and count meaningful work actions.
 *
 * @param actions - List of actions to evaluate
 * @param config - Optional custom configuration
 * @returns Count of significant actions
 */
export function trackSignificantActions(
  actions: Action[],
  config: AutoJournalConfig = DEFAULT_AUTO_JOURNAL_CONFIG
): number {
  return actions.filter((action) => isSignificantAction(action, config.significantActions)).length;
}

/**
 * Creates an initial empty TodoState.
 *
 * @returns Empty TodoState with current timestamp
 */
export function createEmptyTodoState(): TodoState {
  return {
    items: new Map<string, boolean>(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Creates an initial empty SessionStats.
 *
 * @returns Empty SessionStats with current timestamp
 */
export function createEmptySessionStats(): SessionStats {
  return {
    todosCompleted: 0,
    significantActionsCount: 0,
    durationMinutes: 0,
    sessionStartTime: new Date().toISOString(),
  };
}

/**
 * Updates session stats with new activity.
 *
 * @param stats - Current session stats
 * @param todosBefore - Previous TODO state
 * @param todosAfter - Current TODO state
 * @param newActions - New actions since last update
 * @param config - Optional custom configuration
 * @returns Updated session stats
 */
export function updateSessionStats(
  stats: SessionStats,
  todosBefore: TodoState,
  todosAfter: TodoState,
  newActions: Action[],
  config: AutoJournalConfig = DEFAULT_AUTO_JOURNAL_CONFIG
): SessionStats {
  const newlyCompleted = trackTodoCompletion(todosBefore, todosAfter);
  const significantNewActions = trackSignificantActions(newActions, config);

  // Calculate duration from session start
  const startTime = new Date(stats.sessionStartTime);
  const now = new Date();
  const durationMinutes = Math.floor((now.getTime() - startTime.getTime()) / (1000 * 60));

  return {
    todosCompleted: stats.todosCompleted + newlyCompleted,
    significantActionsCount: stats.significantActionsCount + significantNewActions,
    durationMinutes,
    sessionStartTime: stats.sessionStartTime,
  };
}
