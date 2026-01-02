/**
 * TODO Indexing Module
 *
 * Parses TODO markdown files and creates snapshots for vector storage.
 * Handles task extraction, completion tracking, and state diffing.
 *
 * @module context/indexers/todo
 * @see PRD Section 0.4 - Data Collections
 */

import { readFile } from 'fs/promises';
import type {
  TodoSection,
  TodoItem,
  TodoSnapshot,
  CompletionStats,
} from '../types.js';

/**
 * Parsed TODO item from markdown
 */
export interface ParsedTodoItem {
  id: string;
  description: string;
  completed: boolean;
  parentId?: string;
  indentLevel: number;
}

/**
 * Result of snapshot diff operation
 */
export interface TodoDiff {
  completed: string[];
  added: string[];
  removed: string[];
}

/**
 * Generates unique snapshot ID
 *
 * @returns Timestamp-based snapshot ID
 */
export function generateSnapshotId(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const random = Math.random().toString(36).slice(2, 6);
  return `todo-snapshot-${timestamp}-${random}`;
}

/**
 * Extracts task ID from a TODO item line
 *
 * Handles formats like:
 * - "- [ ] 0.0.1.1 Install dependencies" -> "0.0.1.1"
 * - "- [x] **0.0.1 Embedding Service**"  -> "0.0.1"
 * - "- [ ] Create file"                  -> null (no ID)
 *
 * @param line - TODO item line
 * @returns Task ID or null if none found
 */
export function extractTaskId(line: string): string | null {
  // Match task IDs like 0.0.1.1, 1.2, 0.0.5, etc.
  // Can be after checkbox, possibly wrapped in ** for bold
  const patterns = [
    /^\s*-\s*\[[ x]\]\s*\*\*(\d+(?:\.\d+)*)\s/, // Bold header: - [ ] **0.0.1
    /^\s*-\s*\[[ x]\]\s*(\d+(?:\.\d+)*)\s/,     // Regular: - [ ] 0.0.1.1
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Checks if a line is a TODO item
 *
 * Matches standard markdown checkbox format: "- [ ]" or "- [x]"
 * Requires at least one space after the dash.
 *
 * @param line - Line to check
 * @returns True if line is a TODO item
 */
export function isTodoItem(line: string): boolean {
  // Must have: optional leading whitespace, dash, at least one space, checkbox
  return /^\s*- \[[ x]\]/.test(line);
}

/**
 * Checks if a TODO item is completed
 *
 * @param line - TODO item line
 * @returns True if item is completed ([x])
 */
export function isCompleted(line: string): boolean {
  return /^\s*- \[x\]/i.test(line);
}

/**
 * Gets the indentation level of a line
 *
 * @param line - Line to check
 * @returns Number of leading spaces
 */
export function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

/**
 * Extracts description from a TODO item line
 *
 * @param line - TODO item line
 * @returns Clean description text
 */
export function extractDescription(line: string): string {
  // Remove checkbox, leading whitespace, and optional task ID
  let desc = line
    .replace(/^\s*- \[[ x]\]\s*/, '')   // Remove checkbox
    .replace(/^\*\*[\d.]+\s*/, '')       // Remove bold task ID
    .replace(/^\d+(?:\.\d+)*\s+/, '')    // Remove plain task ID
    .replace(/\*\*/g, '')                 // Remove remaining bold markers
    .trim();

  return desc;
}

/**
 * Parses individual TODO items from section content
 *
 * @param sectionContent - Content of a TODO section
 * @param sectionId - ID of parent section for generating item IDs
 * @returns Array of parsed TODO items
 */
export function parseTodoItems(
  sectionContent: string,
  sectionId: string = 'unknown'
): TodoItem[] {
  const items: TodoItem[] = [];
  const lines = sectionContent.split('\n');

  // Track parent items by indent level for hierarchy
  const parentStack: { id: string; indent: number }[] = [];
  let itemIndex = 0;

  for (const line of lines) {
    if (!isTodoItem(line)) {
      continue;
    }

    const taskId = extractTaskId(line);
    const completed = isCompleted(line);
    const indentLevel = getIndentLevel(line);
    const description = extractDescription(line);

    // Generate ID if not present in the line
    const id = taskId || `${sectionId}-item-${itemIndex}`;
    itemIndex++;

    // Determine parent based on indentation
    while (
      parentStack.length > 0 &&
      parentStack[parentStack.length - 1].indent >= indentLevel
    ) {
      parentStack.pop();
    }

    const parentId =
      parentStack.length > 0
        ? parentStack[parentStack.length - 1].id
        : undefined;

    items.push({
      id,
      description,
      completed,
      parentId,
    });

    // Add to parent stack for potential children
    parentStack.push({ id, indent: indentLevel });
  }

  return items;
}

/**
 * Checks if a line is a section header
 *
 * Matches:
 * - "### Phase 0.0 - Context Persistence"
 * - "- [ ] **0.0.1 Embedding Service**"  (bold task group header)
 *
 * @param line - Line to check
 * @returns True if line is a section header
 */
export function isSectionHeader(line: string): boolean {
  // Markdown H3 headers
  if (/^###\s/.test(line)) {
    return true;
  }
  // Bold task group headers (parent tasks)
  if (/^\s*-\s*\[[ x]\]\s*\*\*\d+(?:\.\d+)*\s/.test(line)) {
    return true;
  }
  return false;
}

/**
 * Extracts section ID from header line
 *
 * @param line - Header line
 * @returns Section ID
 */
export function extractSectionId(line: string): string {
  // For H3 headers, try to extract phase number
  const phaseMatch = line.match(/Phase\s+(\d+(?:\.\d+)*)/i);
  if (phaseMatch) {
    return `phase-${phaseMatch[1].replace(/\./g, '-')}`;
  }

  // For bold task headers, use the task ID
  const taskId = extractTaskId(line);
  if (taskId) {
    return `task-${taskId.replace(/\./g, '-')}`;
  }

  // Fallback: slugify the header text
  const text = line.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

/**
 * Extracts section name from header line
 *
 * @param line - Header line
 * @returns Clean section name
 */
export function extractSectionName(line: string): string {
  return line
    .replace(/^#+\s*/, '')        // Remove H3 markers
    .replace(/^\s*-\s*\[[ x]\]\s*/, '')  // Remove checkbox
    .replace(/\*\*/g, '')          // Remove bold markers
    .trim();
}

/**
 * Parses TODO markdown content into sections with items
 *
 * Identifies sections by:
 * - H3 headers (### Phase 0.0)
 * - Bold task group headers (- [ ] **0.0.1 Task Group**)
 *
 * @param todoContent - Full TODO markdown content
 * @returns Array of TODO sections with items
 */
export function parseTodoSections(todoContent: string): TodoSection[] {
  const sections: TodoSection[] = [];

  if (!todoContent || todoContent.trim().length === 0) {
    return sections;
  }

  const lines = todoContent.split('\n');
  let currentSection: {
    name: string;
    sectionId: string;
    lines: string[];
    startLine: number;
  } | null = null;

  // Track sections we've seen to handle the structure
  let inTasksSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for the start of tasks (## Tasks header)
    if (/^##\s+Tasks/i.test(line)) {
      inTasksSection = true;
      continue;
    }

    // Only parse within the Tasks section
    if (!inTasksSection) {
      continue;
    }

    // Check for H3 section headers (### Phase X.X)
    if (/^###\s/.test(line)) {
      // Save previous section if exists
      if (currentSection) {
        const content = currentSection.lines.join('\n');
        const items = parseTodoItems(content, currentSection.sectionId);
        const stats = calculateCompletionStats({ items } as TodoSection);

        sections.push({
          name: currentSection.name,
          sectionId: currentSection.sectionId,
          items,
          completionPct: stats.percentage,
        });
      }

      // Start new section
      currentSection = {
        name: extractSectionName(line),
        sectionId: extractSectionId(line),
        lines: [],
        startLine: i,
      };
      continue;
    }

    // Add line to current section
    if (currentSection && line.trim().length > 0) {
      currentSection.lines.push(line);
    }
  }

  // Don't forget the last section
  if (currentSection) {
    const content = currentSection.lines.join('\n');
    const items = parseTodoItems(content, currentSection.sectionId);
    const stats = calculateCompletionStats({ items } as TodoSection);

    sections.push({
      name: currentSection.name,
      sectionId: currentSection.sectionId,
      items,
      completionPct: stats.percentage,
    });
  }

  return sections;
}

/**
 * Calculates completion statistics for a TODO section
 *
 * @param section - TODO section with items
 * @returns Completion stats (total, completed, percentage)
 */
export function calculateCompletionStats(section: Pick<TodoSection, 'items'>): CompletionStats {
  const total = section.items.length;
  const completed = section.items.filter((item) => item.completed).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    completed,
    percentage,
  };
}

/**
 * Calculates overall completion stats across all sections
 *
 * @param sections - Array of TODO sections
 * @returns Overall completion percentage
 */
export function calculateOverallCompletion(sections: TodoSection[]): number {
  let totalItems = 0;
  let completedItems = 0;

  for (const section of sections) {
    totalItems += section.items.length;
    completedItems += section.items.filter((item) => item.completed).length;
  }

  return totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
}

/**
 * Creates a snapshot of the current TODO state
 *
 * @param todoPath - Path to TODO file
 * @param storeFn - Optional storage function (for dependency injection)
 * @returns TODO snapshot with sections and completion stats
 */
export async function snapshotTodo(
  todoPath: string,
  storeFn?: (snapshot: TodoSnapshot) => Promise<void>
): Promise<TodoSnapshot> {
  const content = await readFile(todoPath, 'utf-8');
  const sections = parseTodoSections(content);
  const overallPct = calculateOverallCompletion(sections);

  const snapshot: TodoSnapshot = {
    id: generateSnapshotId(),
    timestamp: new Date().toISOString(),
    sections,
    overallCompletionPct: overallPct,
    embedding: [], // Will be filled during storage
  };

  if (storeFn) {
    await storeFn(snapshot);
  }

  return snapshot;
}

/**
 * Compares two TODO snapshots to detect changes
 *
 * @param before - Earlier snapshot
 * @param after - Later snapshot
 * @returns Diff with completed, added, and removed task IDs
 */
export function diffTodoStates(
  before: TodoSnapshot,
  after: TodoSnapshot
): TodoDiff {
  // Build maps of item IDs to completion status
  const beforeItems = new Map<string, boolean>();
  const afterItems = new Map<string, boolean>();

  for (const section of before.sections) {
    for (const item of section.items) {
      beforeItems.set(item.id, item.completed);
    }
  }

  for (const section of after.sections) {
    for (const item of section.items) {
      afterItems.set(item.id, item.completed);
    }
  }

  const completed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  // Find completed and removed items
  for (const [id, wasCompleted] of beforeItems) {
    if (!afterItems.has(id)) {
      removed.push(id);
    } else {
      const isCompleted = afterItems.get(id)!;
      if (!wasCompleted && isCompleted) {
        completed.push(id);
      }
    }
  }

  // Find added items
  for (const id of afterItems.keys()) {
    if (!beforeItems.has(id)) {
      added.push(id);
    }
  }

  return { completed, added, removed };
}

/**
 * Gets text summary of a snapshot for embedding
 *
 * @param snapshot - TODO snapshot
 * @returns Text summary for embedding
 */
export function getSnapshotSummary(snapshot: TodoSnapshot): string {
  const lines: string[] = [];

  lines.push(`TODO Snapshot - ${snapshot.overallCompletionPct}% complete`);
  lines.push(`Timestamp: ${snapshot.timestamp}`);
  lines.push('');

  for (const section of snapshot.sections) {
    lines.push(`## ${section.name} (${section.completionPct}%)`);

    for (const item of section.items) {
      const status = item.completed ? '[x]' : '[ ]';
      const prefix = item.parentId ? '  ' : '';
      lines.push(`${prefix}- ${status} ${item.id}: ${item.description}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}
