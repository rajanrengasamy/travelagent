/**
 * LanceDB Database Layer
 *
 * Manages LanceDB connections and collections for the context persistence system.
 * Provides connection management, collection initialization, and CRUD operations.
 *
 * @module context/db
 * @see PRD Section 0.3-0.4
 */

import * as lancedb from '@lancedb/lancedb';
import type { Table, Connection } from '@lancedb/lancedb';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  CONTEXT_PATHS,
  COLLECTION_NAMES,
  DEFAULT_EMBEDDING_CONFIG,
  type DbStatus,
  type JournalEntry,
  type TodoSnapshot,
  type PrdSection,
  type SessionSummary,
} from './types.js';

// ============================================================================
// Module State
// ============================================================================

/**
 * Singleton database connection
 */
let dbConnection: Connection | null = null;

/**
 * Table cache for avoiding repeated lookups
 */
const tableCache = new Map<string, Table>();

/**
 * Database path (can be overridden for testing)
 */
let dbPath: string = CONTEXT_PATHS.LANCEDB_DIR;

/**
 * Embedding dimension from config
 */
const EMBEDDING_DIM = DEFAULT_EMBEDDING_CONFIG.dimensions;

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Schema definitions for each collection (exported for documentation/reference)
 * Note: LanceDB infers schema from first record, so we use seed records
 */
export const COLLECTION_SCHEMAS = {
  [COLLECTION_NAMES.JOURNAL_ENTRIES]: {
    id: 'string',
    timestamp: 'string',
    content: 'string',
    summary: 'string',
    topics: 'string', // JSON stringified array
    embedding: `vector(${EMBEDDING_DIM})`,
  },
  [COLLECTION_NAMES.TODO_SNAPSHOTS]: {
    id: 'string',
    timestamp: 'string',
    sections: 'string', // JSON stringified TodoSection[]
    overallCompletionPct: 'float',
    embedding: `vector(${EMBEDDING_DIM})`,
  },
  [COLLECTION_NAMES.PRD_SECTIONS]: {
    id: 'string',
    sectionNumber: 'int',
    title: 'string',
    content: 'string',
    embedding: `vector(${EMBEDDING_DIM})`,
  },
  [COLLECTION_NAMES.SESSION_SUMMARIES]: {
    id: 'string',
    timestamp: 'string',
    summary: 'string',
    workCompleted: 'string', // JSON stringified string[]
    openItems: 'string', // JSON stringified string[]
    embedding: `vector(${EMBEDDING_DIM})`,
  },
} as const;

// ============================================================================
// Type Converters (for LanceDB compatibility)
// ============================================================================

/**
 * Convert JournalEntry to LanceDB row format
 */
export function journalEntryToRow(entry: JournalEntry): Record<string, unknown> {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    content: entry.content,
    summary: entry.summary,
    topics: JSON.stringify(entry.topics),
    embedding: entry.embedding,
  };
}

/**
 * Convert LanceDB row to JournalEntry
 */
export function rowToJournalEntry(row: Record<string, unknown>): JournalEntry {
  return {
    id: row.id as string,
    timestamp: row.timestamp as string,
    content: row.content as string,
    summary: row.summary as string,
    topics: JSON.parse(row.topics as string) as string[],
    embedding: Array.from(row.embedding as Float32Array | number[]),
  };
}

/**
 * Convert TodoSnapshot to LanceDB row format
 */
export function todoSnapshotToRow(snapshot: TodoSnapshot): Record<string, unknown> {
  return {
    id: snapshot.id,
    timestamp: snapshot.timestamp,
    sections: JSON.stringify(snapshot.sections),
    overallCompletionPct: snapshot.overallCompletionPct,
    embedding: snapshot.embedding,
  };
}

/**
 * Convert LanceDB row to TodoSnapshot
 */
export function rowToTodoSnapshot(row: Record<string, unknown>): TodoSnapshot {
  return {
    id: row.id as string,
    timestamp: row.timestamp as string,
    sections: JSON.parse(row.sections as string) as TodoSnapshot['sections'],
    overallCompletionPct: row.overallCompletionPct as number,
    embedding: Array.from(row.embedding as Float32Array | number[]),
  };
}

/**
 * Convert PrdSection to LanceDB row format
 */
export function prdSectionToRow(section: PrdSection): Record<string, unknown> {
  return {
    id: section.id,
    sectionNumber: section.sectionNumber,
    title: section.title,
    content: section.content,
    embedding: section.embedding,
  };
}

/**
 * Convert LanceDB row to PrdSection
 */
export function rowToPrdSection(row: Record<string, unknown>): PrdSection {
  return {
    id: row.id as string,
    sectionNumber: row.sectionNumber as number,
    title: row.title as string,
    content: row.content as string,
    embedding: Array.from(row.embedding as Float32Array | number[]),
  };
}

/**
 * Convert SessionSummary to LanceDB row format
 */
export function sessionSummaryToRow(summary: SessionSummary): Record<string, unknown> {
  return {
    id: summary.id,
    timestamp: summary.timestamp,
    summary: summary.summary,
    workCompleted: JSON.stringify(summary.workCompleted),
    openItems: JSON.stringify(summary.openItems),
    embedding: summary.embedding,
  };
}

/**
 * Convert LanceDB row to SessionSummary
 */
export function rowToSessionSummary(row: Record<string, unknown>): SessionSummary {
  return {
    id: row.id as string,
    timestamp: row.timestamp as string,
    summary: row.summary as string,
    workCompleted: JSON.parse(row.workCompleted as string) as string[],
    openItems: JSON.parse(row.openItems as string) as string[],
    embedding: Array.from(row.embedding as Float32Array | number[]),
  };
}

// ============================================================================
// Path Management (for testing)
// ============================================================================

/**
 * Set custom database path (primarily for testing)
 */
export function setDbPath(path: string): void {
  dbPath = path;
}

/**
 * Get current database path
 */
export function getDbPath(): string {
  return dbPath;
}

/**
 * Reset database path to default
 */
export function resetDbPath(): void {
  dbPath = CONTEXT_PATHS.LANCEDB_DIR;
}

// ============================================================================
// Connection Management
// ============================================================================

/**
 * Connect to the LanceDB database
 *
 * Creates the database directory if it doesn't exist.
 * Uses lazy connection pattern - only connects on first call.
 *
 * @returns Promise<Connection> - Active database connection
 * @throws Error if connection fails
 */
export async function connectToDb(): Promise<Connection> {
  // Return existing connection if available and open
  if (dbConnection?.isOpen()) {
    return dbConnection;
  }

  // Ensure directory exists
  if (!existsSync(dbPath)) {
    await mkdir(dbPath, { recursive: true });
  }

  try {
    dbConnection = await lancedb.connect(dbPath);
    return dbConnection;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to connect to LanceDB at ${dbPath}: ${message}`);
  }
}

/**
 * Close the database connection
 *
 * Safe to call multiple times. After closing, subsequent operations
 * will require a new connection via connectToDb().
 */
export function closeDb(): void {
  tableCache.clear();
  if (dbConnection !== null) {
    try {
      dbConnection.close();
    } catch {
      // Ignore errors during close
    }
    dbConnection = null;
  }
}

/**
 * Get the current database connection without creating a new one
 *
 * @returns Connection | null - Active connection or null if not connected
 */
export function getDbConnection(): Connection | null {
  if (dbConnection?.isOpen()) {
    return dbConnection;
  }
  return null;
}

/**
 * Get or create database connection (alias for connectToDb for backward compatibility)
 * @deprecated Use connectToDb() instead
 */
export async function getDatabase(): Promise<Connection> {
  return connectToDb();
}

// ============================================================================
// Collection Management
// ============================================================================

/**
 * Check if a collection (table) exists in the database
 *
 * @param name - Collection name to check
 * @returns Promise<boolean> - True if collection exists
 */
export async function collectionExists(name: string): Promise<boolean> {
  const conn = await connectToDb();
  const tableNames = await conn.tableNames();
  return tableNames.includes(name);
}

/**
 * Get a collection (table) by name
 *
 * @param name - The collection name from COLLECTION_NAMES
 * @returns The LanceDB table for the collection
 * @throws Error if collection doesn't exist
 */
export async function getCollection(name: string): Promise<Table> {
  // Check cache first
  const cached = tableCache.get(name);
  if (cached?.isOpen()) {
    return cached;
  }

  const conn = await connectToDb();
  const tableNames = await conn.tableNames();

  if (!tableNames.includes(name)) {
    throw new Error(`Collection '${name}' does not exist. Call initializeCollections() first.`);
  }

  const table = await conn.openTable(name);
  tableCache.set(name, table);
  return table;
}

/**
 * Initialize all collections with empty tables if they don't exist
 *
 * Creates tables for all collections defined in COLLECTION_NAMES.
 * Uses seed records to establish schema, then deletes them.
 *
 * @throws Error if initialization fails
 */
export async function initializeCollections(): Promise<void> {
  const conn = await connectToDb();
  const existingTables = await conn.tableNames();

  for (const collectionName of Object.values(COLLECTION_NAMES)) {
    if (!existingTables.includes(collectionName)) {
      try {
        // Create with a seed record to establish schema
        const seedRecord = createSeedRecord(collectionName);
        await conn.createTable(collectionName, [seedRecord]);

        // Delete the seed record immediately
        const table = await conn.openTable(collectionName);
        await table.delete(`id = '${String(seedRecord.id)}'`);

        tableCache.set(collectionName, table);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to create collection ${collectionName}: ${message}`);
      }
    }
  }
}

/**
 * Create a seed record for initializing a collection's schema
 */
function createSeedRecord(collectionName: string): Record<string, unknown> {
  const zeroVector = new Array(EMBEDDING_DIM).fill(0);
  const seedId = '__seed__';

  switch (collectionName) {
    case COLLECTION_NAMES.JOURNAL_ENTRIES:
      return {
        id: seedId,
        timestamp: new Date().toISOString(),
        content: '',
        summary: '',
        topics: '[]', // JSON stringified
        embedding: zeroVector,
      };
    case COLLECTION_NAMES.TODO_SNAPSHOTS:
      return {
        id: seedId,
        timestamp: new Date().toISOString(),
        sections: '[]', // JSON stringified
        overallCompletionPct: 0.0,
        embedding: zeroVector,
      };
    case COLLECTION_NAMES.PRD_SECTIONS:
      return {
        id: seedId,
        sectionNumber: 0,
        title: '',
        content: '',
        embedding: zeroVector,
      };
    case COLLECTION_NAMES.SESSION_SUMMARIES:
      return {
        id: seedId,
        timestamp: new Date().toISOString(),
        summary: '',
        workCompleted: '[]', // JSON stringified
        openItems: '[]', // JSON stringified
        embedding: zeroVector,
      };
    default:
      throw new Error(`Unknown collection: ${collectionName}`);
  }
}

/**
 * Drop a collection (table) from the database
 *
 * Use with caution - this permanently deletes the collection and all its data.
 *
 * @param name - Collection name to drop
 * @throws Error if drop fails
 */
export async function dropCollection(name: string): Promise<void> {
  const conn = await connectToDb();
  const tableNames = await conn.tableNames();

  if (!tableNames.includes(name)) {
    // Collection doesn't exist, nothing to do
    return;
  }

  try {
    await conn.dropTable(name);
    tableCache.delete(name);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to drop collection ${name}: ${message}`);
  }
}

/**
 * Drop all collections (for testing/reset purposes)
 */
export async function dropAllCollections(): Promise<void> {
  const conn = await connectToDb();
  const tableNames = await conn.tableNames();

  for (const tableName of tableNames) {
    await dropCollection(tableName);
  }
}

/**
 * Close the database connection and clear caches
 * @deprecated Use closeDb() instead
 */
export function closeDatabase(): void {
  closeDb();
}

/**
 * Get database status information
 *
 * @returns Promise<DbStatus> - Database status object
 */
export async function getDbStatus(): Promise<DbStatus> {
  try {
    const conn = await connectToDb();
    const tableNames = await conn.tableNames();

    return {
      connected: true,
      path: dbPath,
      collections: tableNames,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      connected: false,
      path: dbPath,
      collections: [],
      error: message,
    };
  }
}

/**
 * Get database status information
 * @deprecated Use getDbStatus() instead
 */
export async function getDatabaseStatus(): Promise<DbStatus> {
  return getDbStatus();
}
