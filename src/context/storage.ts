/**
 * Context Storage Operations
 *
 * Provides functions for storing context data (journal entries, TODO snapshots,
 * PRD sections, session summaries) in the LanceDB vector database.
 *
 * @module context/storage
 * @see PRD Section 0.5 - Context Storage
 */

import type { Table } from '@lancedb/lancedb';
import { generateEmbedding } from './embeddings.js';
import {
  getCollection,
  collectionExists,
  connectToDb,
  journalEntryToRow,
  todoSnapshotToRow,
  prdSectionToRow,
  sessionSummaryToRow,
} from './db.js';
import {
  COLLECTION_NAMES,
  type JournalEntry,
  type TodoSnapshot,
  type PrdSection,
  type SessionSummary,
} from './types.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Delete existing record by ID if it exists (for upsert pattern)
 *
 * This enables idempotent store operations - calling store multiple times
 * with the same ID will update the record rather than create duplicates.
 *
 * @param collection - LanceDB table/collection
 * @param id - Record ID to delete
 */
async function deleteExistingById(collection: Table, id: string): Promise<void> {
  try {
    // Escape single quotes in id to prevent SQL injection
    const escapedId = id.replace(/'/g, "''");
    await collection.delete(`id = '${escapedId}'`);
  } catch {
    // Ignore errors - record may not exist, which is fine for upsert
  }
}

/**
 * Input type for journal entry (without embedding - generated internally)
 */
export type JournalEntryInput = Omit<JournalEntry, 'embedding'>;

/**
 * Input type for TODO snapshot (without embedding - generated internally)
 */
export type TodoSnapshotInput = Omit<TodoSnapshot, 'embedding'>;

/**
 * Input type for PRD section (without embedding - generated internally)
 */
export type PrdSectionInput = Omit<PrdSection, 'embedding'>;

/**
 * Input type for session summary (without embedding - generated internally)
 */
export type SessionSummaryInput = Omit<SessionSummary, 'embedding'>;

/**
 * Store a journal entry in the database (upsert)
 *
 * Generates an embedding from the content and summary, then stores
 * the complete entry in the journal_entries collection. If an entry
 * with the same ID already exists, it will be replaced (idempotent).
 *
 * @param entry - Journal entry data (without embedding)
 * @throws Error if embedding generation or storage fails
 */
export async function storeJournalEntry(entry: JournalEntryInput): Promise<void> {
  // Generate embedding from content and summary combined
  const textForEmbedding = `${entry.summary}\n\n${entry.content}`;
  const embedding = await generateEmbedding(textForEmbedding);

  const fullEntry: JournalEntry = {
    ...entry,
    embedding,
  };

  const collection = await getCollection(COLLECTION_NAMES.JOURNAL_ENTRIES);

  // Upsert: delete existing record if present, then add new one
  await deleteExistingById(collection, entry.id);

  const row = journalEntryToRow(fullEntry);
  await collection.add([row]);
}

/**
 * Store a TODO snapshot in the database (upsert)
 *
 * Generates an embedding from the section descriptions and items,
 * including task IDs for better semantic search matching.
 * Format: "${item.id}: ${item.description}" for each incomplete item.
 * If a snapshot with the same ID already exists, it will be replaced (idempotent).
 *
 * @param snapshot - TODO snapshot data (without embedding)
 * @throws Error if embedding generation or storage fails
 */
export async function storeTodoSnapshot(snapshot: TodoSnapshotInput): Promise<void> {
  // Generate embedding from section names and item descriptions with IDs
  const textParts: string[] = [];
  for (const section of snapshot.sections) {
    textParts.push(section.name);
    for (const item of section.items) {
      if (!item.completed) {
        // Include task ID for better search matching (e.g., "14.0.1: Implement ranking")
        textParts.push(`${item.id}: ${item.description}`);
      }
    }
  }
  const textForEmbedding = textParts.join('\n');
  const embedding = await generateEmbedding(textForEmbedding);

  const fullSnapshot: TodoSnapshot = {
    ...snapshot,
    embedding,
  };

  const collection = await getCollection(COLLECTION_NAMES.TODO_SNAPSHOTS);

  // Upsert: delete existing record if present, then add new one
  await deleteExistingById(collection, snapshot.id);

  const row = todoSnapshotToRow(fullSnapshot);
  await collection.add([row]);
}

/**
 * Store a PRD section in the database (upsert)
 *
 * Generates an embedding from the title and content, then stores
 * the complete section in the prd_sections collection. If a section
 * with the same ID already exists, it will be replaced (idempotent).
 *
 * @param section - PRD section data (without embedding)
 * @throws Error if embedding generation or storage fails
 */
export async function storePrdSection(section: PrdSectionInput): Promise<void> {
  // Generate embedding from title and content combined
  const textForEmbedding = `${section.title}\n\n${section.content}`;
  const embedding = await generateEmbedding(textForEmbedding);

  const fullSection: PrdSection = {
    ...section,
    embedding,
  };

  const collection = await getCollection(COLLECTION_NAMES.PRD_SECTIONS);

  // Upsert: delete existing record if present, then add new one
  await deleteExistingById(collection, section.id);

  const row = prdSectionToRow(fullSection);
  await collection.add([row]);
}

/**
 * Store a session summary in the database (upsert)
 *
 * Generates an embedding from the summary and work completed items,
 * then stores the complete summary in the session_summaries collection.
 * If a summary with the same ID already exists, it will be replaced (idempotent).
 *
 * @param summary - Session summary data (without embedding)
 * @throws Error if embedding generation or storage fails
 */
export async function storeSessionSummary(summary: SessionSummaryInput): Promise<void> {
  // Generate embedding from summary and work completed
  const textParts = [
    summary.summary,
    'Work completed:',
    ...summary.workCompleted,
    'Open items:',
    ...summary.openItems,
  ];
  const textForEmbedding = textParts.join('\n');
  const embedding = await generateEmbedding(textForEmbedding);

  const fullSummary: SessionSummary = {
    ...summary,
    embedding,
  };

  const collection = await getCollection(COLLECTION_NAMES.SESSION_SUMMARIES);

  // Upsert: delete existing record if present, then add new one
  await deleteExistingById(collection, summary.id);

  const row = sessionSummaryToRow(fullSummary);
  await collection.add([row]);
}

/**
 * Delete an entry from a collection by ID
 *
 * @param collectionName - Name of the collection
 * @param id - ID of the entry to delete
 * @throws Error if the collection doesn't exist or deletion fails
 */
export async function deleteEntry(collectionName: string, id: string): Promise<void> {
  if (!(await collectionExists(collectionName))) {
    throw new Error(`Collection "${collectionName}" does not exist`);
  }

  const collection = await getCollection(collectionName);
  // Escape single quotes in id to prevent SQL injection
  const escapedId = id.replace(/'/g, "''");
  await collection.delete(`id = '${escapedId}'`);
}

/**
 * Update an entry in a collection
 *
 * This performs a delete and re-insert since LanceDB doesn't support
 * direct updates. If the entry includes content that needs embedding,
 * you should use the specific store* function instead.
 *
 * @param collectionName - Name of the collection
 * @param id - ID of the entry to update
 * @param updates - Partial updates to apply
 * @throws Error if the collection doesn't exist or update fails
 */
export async function updateEntry<T extends { id: string }>(
  collectionName: string,
  id: string,
  updates: Partial<T>
): Promise<void> {
  if (!(await collectionExists(collectionName))) {
    throw new Error(`Collection "${collectionName}" does not exist`);
  }

  const collection = await getCollection(collectionName);

  // Escape single quotes in id to prevent SQL injection
  const escapedId = id.replace(/'/g, "''");

  // Query existing entry
  const results = await collection.query().where(`id = '${escapedId}'`).limit(1).toArray();

  if (results.length === 0) {
    throw new Error(`Entry with id "${id}" not found in collection "${collectionName}"`);
  }

  const existingEntry = results[0] as Record<string, unknown>;

  // Merge updates
  const updatedEntry: Record<string, unknown> = {
    ...existingEntry,
    ...updates,
  };

  // Delete old entry and insert updated one
  await collection.delete(`id = '${escapedId}'`);
  await collection.add([updatedEntry]);
}

/**
 * Store multiple journal entries in batch (upsert)
 *
 * For batch operations, existing entries with matching IDs are deleted
 * before inserting the new batch (idempotent).
 *
 * @param entries - Array of journal entries to store
 * @throws Error if embedding generation or storage fails
 */
export async function storeJournalEntries(entries: JournalEntryInput[]): Promise<void> {
  if (entries.length === 0) return;

  // Generate embeddings for all entries
  const textsForEmbedding = entries.map((entry) => `${entry.summary}\n\n${entry.content}`);

  const embeddings = await Promise.all(textsForEmbedding.map((text) => generateEmbedding(text)));

  const fullEntries: JournalEntry[] = entries.map((entry, index) => ({
    ...entry,
    embedding: embeddings[index],
  }));

  const collection = await getCollection(COLLECTION_NAMES.JOURNAL_ENTRIES);

  // Upsert: delete existing records before batch insert
  await Promise.all(entries.map((entry) => deleteExistingById(collection, entry.id)));

  const rows = fullEntries.map(journalEntryToRow);
  await collection.add(rows);
}

/**
 * Store multiple PRD sections in batch (upsert)
 *
 * For batch operations, existing sections with matching IDs are deleted
 * before inserting the new batch (idempotent).
 *
 * @param sections - Array of PRD sections to store
 * @throws Error if embedding generation or storage fails
 */
export async function storePrdSections(sections: PrdSectionInput[]): Promise<void> {
  if (sections.length === 0) return;

  // Generate embeddings for all sections
  const textsForEmbedding = sections.map((section) => `${section.title}\n\n${section.content}`);

  const embeddings = await Promise.all(textsForEmbedding.map((text) => generateEmbedding(text)));

  const fullSections: PrdSection[] = sections.map((section, index) => ({
    ...section,
    embedding: embeddings[index],
  }));

  const collection = await getCollection(COLLECTION_NAMES.PRD_SECTIONS);

  // Upsert: delete existing records before batch insert
  await Promise.all(sections.map((section) => deleteExistingById(collection, section.id)));

  const rows = fullSections.map(prdSectionToRow);
  await collection.add(rows);
}

/**
 * Clear all entries from a collection
 *
 * @param collectionName - Name of the collection to clear
 */
export async function clearCollection(collectionName: string): Promise<void> {
  if (!(await collectionExists(collectionName))) {
    return; // Nothing to clear
  }

  const db = await connectToDb();
  await db.dropTable(collectionName);
}

/**
 * Get the count of entries in a collection
 *
 * @param collectionName - Name of the collection
 * @returns Number of entries in the collection
 */
export async function getCollectionCount(collectionName: string): Promise<number> {
  if (!(await collectionExists(collectionName))) {
    return 0;
  }

  const collection = await getCollection(collectionName);
  const results = await collection.query().toArray();
  return results.length;
}
