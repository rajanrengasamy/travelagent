/**
 * Context Retrieval Operations
 *
 * Provides functions for querying and retrieving context data from the
 * LanceDB vector database using vector similarity search.
 *
 * @module context/retrieval
 * @see PRD Section 0.5 - Context Retrieval
 */

import { generateEmbedding } from './embeddings.js';
import {
  getCollection,
  collectionExists,
  rowToJournalEntry,
  rowToTodoSnapshot,
  rowToPrdSection,
  rowToSessionSummary,
} from './db.js';
import {
  COLLECTION_NAMES,
  type JournalEntry,
  type TodoSnapshot,
  type TodoSection,
  type PrdSection,
  type SessionSummary,
  type ContextBundle,
  type QueryOptions,
  type SearchResult,
} from './types.js';

/**
 * Default query options
 */
const DEFAULT_QUERY_OPTIONS: Required<QueryOptions> = {
  limit: 10,
  minSimilarity: 0.0,
  filter: {},
};

/**
 * Interface for LanceDB search result rows with distance metadata
 */
interface LanceSearchResult extends Record<string, unknown> {
  _distance?: number;
}

/**
 * Interface for LanceDB rows with timestamp field (for sorting)
 */
interface TimestampedRow extends Record<string, unknown> {
  timestamp: string;
}

/**
 * Perform a vector similarity search on a collection
 *
 * @param collectionName - Name of the collection to search
 * @param query - Text query to search for
 * @param limit - Maximum number of results to return
 * @param rowConverter - Function to convert LanceDB rows to typed objects
 * @returns Array of search results with items and similarity scores
 */
async function vectorSearch<T>(
  collectionName: string,
  query: string,
  limit: number,
  rowConverter: (row: Record<string, unknown>) => T
): Promise<SearchResult<T>[]> {
  // Check if collection exists
  if (!(await collectionExists(collectionName))) {
    return [];
  }

  try {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);

    const collection = await getCollection(collectionName);

    // Perform vector search
    const results = (await collection
      .search(queryEmbedding)
      .limit(limit)
      .toArray()) as LanceSearchResult[];

    // Map results to SearchResult format
    return results.map((result) => {
      // LanceDB returns _distance, convert to similarity (1 - distance for L2)
      const distance = result._distance ?? 0;
      const similarity = 1 / (1 + distance); // Convert distance to similarity

      // Remove internal fields and convert to typed object
      const row = { ...result };
      delete row._distance;
      const item = rowConverter(row);

      return {
        item,
        similarity,
      };
    });
  } catch (error) {
    // Log error but return empty results for graceful degradation
    console.error(`Vector search failed for collection ${collectionName}:`, error);
    return [];
  }
}

/**
 * Query journal entries by semantic similarity
 *
 * @param query - Text query to search for
 * @param limit - Maximum number of results (default: 10)
 * @returns Array of matching journal entries sorted by relevance
 */
export async function queryJournalEntries(
  query: string,
  limit: number = 10
): Promise<JournalEntry[]> {
  const results = await vectorSearch<JournalEntry>(
    COLLECTION_NAMES.JOURNAL_ENTRIES,
    query,
    limit,
    rowToJournalEntry
  );

  return results.map((r) => r.item);
}

/**
 * Get the most recent session summaries
 *
 * @param count - Number of recent sessions to return
 * @returns Array of session summaries sorted by timestamp descending
 */
export async function getRecentSessions(count: number): Promise<SessionSummary[]> {
  // Check if collection exists
  if (!(await collectionExists(COLLECTION_NAMES.SESSION_SUMMARIES))) {
    return [];
  }

  try {
    const collection = await getCollection(COLLECTION_NAMES.SESSION_SUMMARIES);

    // Get all entries (LanceDB doesn't have native sorting, so we fetch and sort)
    const results = (await collection.query().toArray()) as TimestampedRow[];

    // Sort by timestamp descending and limit
    const sortedResults = results
      .sort((a, b) => {
        return b.timestamp.localeCompare(a.timestamp);
      })
      .slice(0, count);

    return sortedResults.map((row) => rowToSessionSummary(row as Record<string, unknown>));
  } catch (error) {
    console.error('Failed to get recent sessions:', error);
    return [];
  }
}

/**
 * Get the current (most recent) TODO state snapshot
 *
 * @returns The most recent TODO snapshot, or null if none exists
 */
export async function getCurrentTodoState(): Promise<TodoSnapshot | null> {
  // Check if collection exists
  if (!(await collectionExists(COLLECTION_NAMES.TODO_SNAPSHOTS))) {
    return null;
  }

  try {
    const collection = await getCollection(COLLECTION_NAMES.TODO_SNAPSHOTS);

    // Get all entries and find the most recent
    const results = (await collection.query().toArray()) as TimestampedRow[];

    if (results.length === 0) {
      return null;
    }

    // Sort by timestamp descending and get the first
    const mostRecent = results.sort((a, b) => {
      return b.timestamp.localeCompare(a.timestamp);
    })[0];

    return rowToTodoSnapshot(mostRecent as Record<string, unknown>);
  } catch (error) {
    console.error('Failed to get current TODO state:', error);
    return null;
  }
}

/**
 * Query PRD sections by semantic similarity
 *
 * @param query - Text query to search for
 * @param limit - Maximum number of results (default: 3)
 * @returns Array of matching PRD sections sorted by relevance
 */
export async function queryPrdSections(query: string, limit: number = 3): Promise<PrdSection[]> {
  const results = await vectorSearch<PrdSection>(
    COLLECTION_NAMES.PRD_SECTIONS,
    query,
    limit,
    rowToPrdSection
  );

  return results.map((r) => r.item);
}

/**
 * Get relevant context for a session startup
 *
 * Combines multiple context sources to provide a comprehensive context bundle:
 * - Last 2-3 session summaries (chronological context)
 * - Current TODO state (work in progress)
 * - Top 3 relevant PRD sections (based on query)
 * - Top 5 relevant journal entries (based on query)
 *
 * @param query - Query string for relevance filtering (e.g., current focus area)
 * @returns A context bundle combining all relevant sources
 */
export async function getRelevantContext(query: string): Promise<ContextBundle> {
  // Fetch all context sources in parallel for efficiency
  const [recentSessions, todoState, relevantPrdSections, relevantJournalEntries] =
    await Promise.all([
      getRecentSessions(3),
      getCurrentTodoState(),
      queryPrdSections(query, 3),
      queryJournalEntries(query, 5),
    ]);

  return {
    recentSessions,
    todoState,
    relevantPrdSections,
    relevantJournalEntries,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Query journal entries with advanced options
 *
 * @param query - Text query to search for
 * @param options - Query options including limit, similarity threshold, and filters
 * @returns Array of search results with similarity scores
 */
export async function queryJournalEntriesWithOptions(
  query: string,
  options: QueryOptions = {}
): Promise<SearchResult<JournalEntry>[]> {
  const opts = { ...DEFAULT_QUERY_OPTIONS, ...options };

  const results = await vectorSearch<JournalEntry>(
    COLLECTION_NAMES.JOURNAL_ENTRIES,
    query,
    opts.limit,
    rowToJournalEntry
  );

  // Apply similarity threshold filter
  return results.filter((r) => r.similarity >= opts.minSimilarity);
}

/**
 * Query PRD sections with advanced options
 *
 * @param query - Text query to search for
 * @param options - Query options including limit and similarity threshold
 * @returns Array of search results with similarity scores
 */
export async function queryPrdSectionsWithOptions(
  query: string,
  options: QueryOptions = {}
): Promise<SearchResult<PrdSection>[]> {
  const opts = { ...DEFAULT_QUERY_OPTIONS, ...options };

  const results = await vectorSearch<PrdSection>(
    COLLECTION_NAMES.PRD_SECTIONS,
    query,
    opts.limit,
    rowToPrdSection
  );

  // Apply similarity threshold filter
  return results.filter((r) => r.similarity >= opts.minSimilarity);
}

/**
 * Query session summaries by semantic similarity
 *
 * @param query - Text query to search for
 * @param limit - Maximum number of results (default: 5)
 * @returns Array of matching session summaries sorted by relevance
 */
export async function querySessionSummaries(
  query: string,
  limit: number = 5
): Promise<SessionSummary[]> {
  const results = await vectorSearch<SessionSummary>(
    COLLECTION_NAMES.SESSION_SUMMARIES,
    query,
    limit,
    rowToSessionSummary
  );

  return results.map((r) => r.item);
}

/**
 * Get a specific journal entry by ID
 *
 * @param id - The ID of the journal entry to retrieve
 * @returns The journal entry, or null if not found
 */
export async function getJournalEntryById(id: string): Promise<JournalEntry | null> {
  if (!(await collectionExists(COLLECTION_NAMES.JOURNAL_ENTRIES))) {
    return null;
  }

  try {
    const collection = await getCollection(COLLECTION_NAMES.JOURNAL_ENTRIES);
    // Escape single quotes in id to prevent SQL injection
    const escapedId = id.replace(/'/g, "''");
    const results = await collection.query().where(`id = '${escapedId}'`).limit(1).toArray();

    if (results.length === 0) {
      return null;
    }

    return rowToJournalEntry(results[0] as Record<string, unknown>);
  } catch (error) {
    console.error(`Failed to get journal entry ${id}:`, error);
    return null;
  }
}

/**
 * Get a specific PRD section by ID
 *
 * @param id - The ID of the PRD section to retrieve
 * @returns The PRD section, or null if not found
 */
export async function getPrdSectionById(id: string): Promise<PrdSection | null> {
  if (!(await collectionExists(COLLECTION_NAMES.PRD_SECTIONS))) {
    return null;
  }

  try {
    const collection = await getCollection(COLLECTION_NAMES.PRD_SECTIONS);
    // Escape single quotes in id to prevent SQL injection
    const escapedId = id.replace(/'/g, "''");
    const results = await collection.query().where(`id = '${escapedId}'`).limit(1).toArray();

    if (results.length === 0) {
      return null;
    }

    return rowToPrdSection(results[0] as Record<string, unknown>);
  } catch (error) {
    console.error(`Failed to get PRD section ${id}:`, error);
    return null;
  }
}

/**
 * Get a specific session summary by ID
 *
 * @param id - The ID of the session summary to retrieve
 * @returns The session summary, or null if not found
 */
export async function getSessionSummaryById(id: string): Promise<SessionSummary | null> {
  if (!(await collectionExists(COLLECTION_NAMES.SESSION_SUMMARIES))) {
    return null;
  }

  try {
    const collection = await getCollection(COLLECTION_NAMES.SESSION_SUMMARIES);
    // Escape single quotes in id to prevent SQL injection
    const escapedId = id.replace(/'/g, "''");
    const results = await collection.query().where(`id = '${escapedId}'`).limit(1).toArray();

    if (results.length === 0) {
      return null;
    }

    return rowToSessionSummary(results[0] as Record<string, unknown>);
  } catch (error) {
    console.error(`Failed to get session summary ${id}:`, error);
    return null;
  }
}

/**
 * Get all TODO snapshots (for history/debugging)
 *
 * @param limit - Maximum number of snapshots to return
 * @returns Array of TODO snapshots sorted by timestamp descending
 */
export async function getTodoSnapshots(limit: number = 10): Promise<TodoSnapshot[]> {
  if (!(await collectionExists(COLLECTION_NAMES.TODO_SNAPSHOTS))) {
    return [];
  }

  try {
    const collection = await getCollection(COLLECTION_NAMES.TODO_SNAPSHOTS);
    const results = (await collection.query().toArray()) as TimestampedRow[];

    // Sort by timestamp descending and limit
    const sortedResults = results
      .sort((a, b) => {
        return b.timestamp.localeCompare(a.timestamp);
      })
      .slice(0, limit);

    return sortedResults.map((row) => rowToTodoSnapshot(row as Record<string, unknown>));
  } catch (error) {
    console.error('Failed to get TODO snapshots:', error);
    return [];
  }
}

/**
 * Get a specific TODO section by pattern match
 *
 * Searches the most recent TODO snapshot for a section matching the pattern.
 * Pattern matching is case-insensitive and checks section name and sectionId.
 *
 * @param pattern - Pattern to match (e.g., "14.0", "Ranking", "Phase 14")
 * @returns The matched section with all its items, or null if not found
 *
 * @example
 * // Find by section number
 * const section = await getTodoSectionByPattern("14.0");
 *
 * @example
 * // Find by keyword
 * const section = await getTodoSectionByPattern("Ranking");
 */
export async function getTodoSectionByPattern(
  pattern: string
): Promise<TodoSection | null> {
  const todoState = await getCurrentTodoState();

  if (!todoState) {
    return null;
  }

  const lowerPattern = pattern.toLowerCase();

  // Search for matching section
  for (const section of todoState.sections) {
    // Check section name (e.g., "Phase 14.0 - Ranking Stage")
    if (section.name.toLowerCase().includes(lowerPattern)) {
      return section;
    }

    // Check sectionId (e.g., "phase-14-0")
    if (section.sectionId.toLowerCase().includes(lowerPattern.replace(/\./g, '-'))) {
      return section;
    }

    // Check for numeric pattern match (e.g., "14" matches "Phase 14.0")
    if (/^\d+(\.\d+)?$/.test(pattern)) {
      const phasePattern = new RegExp(`phase\\s+${pattern.replace('.', '\\.')}`, 'i');
      if (phasePattern.test(section.name)) {
        return section;
      }
    }
  }

  return null;
}
