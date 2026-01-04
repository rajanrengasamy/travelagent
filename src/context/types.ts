/**
 * Context Persistence Types
 *
 * Shared interfaces for the RAG-based context persistence system.
 * These types are used across embeddings, storage, retrieval, and indexing.
 */

/**
 * Configuration for auto-journal triggering
 * @see PRD Section 0.8
 */
export interface AutoJournalConfig {
  /** Trigger when N todos are marked complete */
  todoCompletionThreshold: number;
  /** Trigger after N significant tool calls */
  significantActionThreshold: number;
  /** Types of actions considered "significant" */
  significantActions: string[];
  /** Minimum session duration before auto-journal (minutes) */
  minSessionDuration: number;
}

/**
 * Default auto-journal configuration
 */
export const DEFAULT_AUTO_JOURNAL_CONFIG: AutoJournalConfig = {
  todoCompletionThreshold: 3,
  significantActionThreshold: 10,
  significantActions: ['Edit', 'Write', 'Bash:git commit', 'TodoWrite:completed'],
  minSessionDuration: 15,
};

/**
 * Journal entry stored in the journal_entries collection
 * @see PRD Section 0.4
 */
export interface JournalEntry {
  /** Unique identifier for the entry */
  id: string;
  /** ISO8601 timestamp when entry was created */
  timestamp: string;
  /** Full journal entry content (markdown) */
  content: string;
  /** Brief summary of the session (2-3 sentences) */
  summary: string;
  /** Topics covered in this session (for filtering) */
  topics: string[];
  /** Vector embedding for semantic search */
  embedding: number[];
}

/**
 * Individual TODO item
 */
export interface TodoItem {
  /** Task ID (e.g., "0.0.1.1") */
  id: string;
  /** Task description */
  description: string;
  /** Whether the task is completed */
  completed: boolean;
  /** Parent task ID if this is a sub-task */
  parentId?: string;
}

/**
 * TODO section (group of related tasks)
 */
export interface TodoSection {
  /** Section name (e.g., "Phase 0.0 — Context Persistence Infrastructure") */
  name: string;
  /** Section number/ID */
  sectionId: string;
  /** Items in this section */
  items: TodoItem[];
  /** Completion percentage (0-100) */
  completionPct: number;
}

/**
 * Snapshot of TODO state stored in todo_snapshots collection
 * @see PRD Section 0.4
 */
export interface TodoSnapshot {
  /** Unique identifier for the snapshot */
  id: string;
  /** ISO8601 timestamp when snapshot was taken */
  timestamp: string;
  /** All sections in the TODO */
  sections: TodoSection[];
  /** Overall completion percentage */
  overallCompletionPct: number;
  /** Vector embedding for semantic search */
  embedding: number[];
}

/**
 * PRD section stored in prd_sections collection
 * @see PRD Section 0.4
 */
export interface PrdSection {
  /** Unique identifier for the section */
  id: string;
  /** Section number (e.g., 0, 1, 2) */
  sectionNumber: number;
  /** Section title */
  title: string;
  /** Full section content (markdown) */
  content: string;
  /** Vector embedding for semantic search */
  embedding: number[];
}

/**
 * Condensed session summary stored in session_summaries collection
 * @see PRD Section 0.4
 */
export interface SessionSummary {
  /** Unique identifier for the summary */
  id: string;
  /** ISO8601 timestamp when session occurred */
  timestamp: string;
  /** Brief summary of the session (200-300 tokens) */
  summary: string;
  /** List of work completed in this session */
  workCompleted: string[];
  /** Open items remaining after this session */
  openItems: string[];
  /** Vector embedding for semantic search */
  embedding: number[];
}

/**
 * Combined context bundle returned by getRelevantContext
 */
export interface ContextBundle {
  /** Recent session summaries (last 2-3) */
  recentSessions: SessionSummary[];
  /** Current TODO state snapshot */
  todoState: TodoSnapshot | null;
  /** Relevant PRD sections based on query */
  relevantPrdSections: PrdSection[];
  /** Relevant journal entries based on query */
  relevantJournalEntries: JournalEntry[];
  /** Timestamp when this bundle was generated */
  generatedAt: string;
}

/**
 * Statistics about a session for auto-journal triggering
 */
export interface SessionStats {
  /** Number of TODOs completed in this session */
  todosCompleted: number;
  /** Number of significant actions performed */
  significantActionsCount: number;
  /** Session duration in minutes */
  durationMinutes: number;
  /** Start time of the session */
  sessionStartTime: string;
}

/**
 * TODO state comparison for tracking changes
 */
export interface TodoState {
  /** Map of task ID to completion status */
  items: Map<string, boolean>;
  /** Snapshot timestamp */
  timestamp: string;
}

/**
 * Action tracked for auto-journal
 */
export interface Action {
  /** Action type (e.g., 'Edit', 'Write', 'Bash') */
  type: string;
  /** Optional subtype (e.g., 'git commit' for Bash) */
  subtype?: string;
  /** Timestamp of the action */
  timestamp: string;
}

/**
 * Completion statistics for a TODO section
 */
export interface CompletionStats {
  /** Total number of items */
  total: number;
  /** Number of completed items */
  completed: number;
  /** Completion percentage (0-100) */
  percentage: number;
}

/**
 * Result of generating a journal entry
 */
export interface GeneratedJournalEntry {
  /** The full journal entry content */
  content: string;
  /** Extracted summary */
  summary: string;
  /** Work completed items */
  workCompleted: string[];
  /** Open items */
  openItems: string[];
  /** Key decisions made */
  keyDecisions: string[];
  /** Extracted topics */
  topics: string[];
}

/**
 * Configuration for embedding generation
 */
export interface EmbeddingConfig {
  /** Model to use (default: text-embedding-3-small) */
  model: string;
  /** Dimensions for the embedding (default: 1536) */
  dimensions: number;
  /** Maximum tokens per embedding request */
  maxTokens: number;
}

/**
 * Default embedding configuration
 */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  model: 'text-embedding-3-small',
  dimensions: 1536,
  maxTokens: 8191,
};

/**
 * LanceDB collection names
 */
export const COLLECTION_NAMES = {
  JOURNAL_ENTRIES: 'journal_entries',
  TODO_SNAPSHOTS: 'todo_snapshots',
  PRD_SECTIONS: 'prd_sections',
  SESSION_SUMMARIES: 'session_summaries',
} as const;

/**
 * Query options for retrieval operations
 */
export interface QueryOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Minimum similarity threshold (0-1) */
  minSimilarity?: number;
  /** Filter by specific field values */
  filter?: Record<string, unknown>;
}

/**
 * Result from a vector similarity search
 */
export interface SearchResult<T> {
  /** The matched item */
  item: T;
  /** Similarity score (0-1, higher is more similar) */
  similarity: number;
}

/**
 * Database connection status
 */
export interface DbStatus {
  /** Whether the database is connected */
  connected: boolean;
  /** Path to the database */
  path: string;
  /** Collections available */
  collections: string[];
  /** Any error message */
  error?: string;
}

/**
 * Paths used by the context persistence system
 */
export const CONTEXT_PATHS = {
  /** Root data directory */
  DATA_DIR: process.env.TRAVELAGENT_DATA_DIR ?? `${process.env.HOME}/.travelagent`,
  /** Context storage directory */
  get CONTEXT_DIR() {
    return `${this.DATA_DIR}/context`;
  },
  /** LanceDB database directory */
  get LANCEDB_DIR() {
    return `${this.CONTEXT_DIR}/lancedb`;
  },
  /** Embeddings cache directory */
  get EMBEDDINGS_CACHE_DIR() {
    return `${this.CONTEXT_DIR}/embeddings_cache`;
  },
} as const;
