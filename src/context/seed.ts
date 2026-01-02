/**
 * Context Data Seeding
 *
 * CLI script for initial population of the vector database with:
 * - PRD sections (for requirements lookup)
 * - TODO state (for progress tracking)
 * - Existing journal entries (for historical context)
 *
 * Run via: npm run seed-context
 *
 * @module context/seed
 * @see PRD Section 0.11
 */

// Load environment variables from .env file
import 'dotenv/config';

import * as fs from 'fs';
import * as path from 'path';
import { CONTEXT_PATHS } from './types.js';

/**
 * Result of a seeding operation
 */
export interface SeedResult {
  success: boolean;
  count: number;
  errors: string[];
}

/**
 * Combined results of all seeding operations
 */
export interface SeedAllResult {
  prd: SeedResult;
  todo: SeedResult;
  journal: SeedResult;
  overallSuccess: boolean;
}

/**
 * Default paths for seeding
 */
export const DEFAULT_SEED_PATHS = {
  PRD: 'docs/phase_0_prd_unified.md',
  TODO: 'todo/tasks-phase0-travel-discovery.md',
  JOURNAL: 'journal.md',
} as const;

/**
 * Ensures the context directories exist
 */
export function ensureContextDirs(): void {
  fs.mkdirSync(CONTEXT_PATHS.CONTEXT_DIR, { recursive: true });
  fs.mkdirSync(CONTEXT_PATHS.LANCEDB_DIR, { recursive: true });
  fs.mkdirSync(CONTEXT_PATHS.EMBEDDINGS_CACHE_DIR, { recursive: true });
}

/**
 * Seeds PRD sections into the vector database
 *
 * Parses the PRD document, generates embeddings for each section,
 * and stores them in the prd_sections collection.
 *
 * @param prdPath - Path to the PRD file (relative to project root)
 * @returns Promise resolving to seed result
 */
export async function seedPrd(prdPath: string = DEFAULT_SEED_PATHS.PRD): Promise<SeedResult> {
  const errors: string[] = [];

  try {
    const absolutePath = path.resolve(process.cwd(), prdPath);

    if (!fs.existsSync(absolutePath)) {
      return {
        success: false,
        count: 0,
        errors: [`PRD file not found: ${absolutePath}`],
      };
    }

    console.log(`Seeding PRD from: ${absolutePath}`);

    // Import indexer dynamically to avoid circular dependencies
    const { indexPrd } = await import('./indexers/prd.js');
    const { storePrdSection } = await import('./storage.js');

    const result = await indexPrd(absolutePath, storePrdSection);

    if (result.errors.length > 0) {
      errors.push(...result.errors);
    }

    console.log(`  Indexed ${result.indexed} PRD sections`);

    return {
      success: errors.length === 0,
      count: result.indexed,
      errors,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Failed to seed PRD: ${errorMsg}`);
    console.error(`  Error: ${errorMsg}`);
    return {
      success: false,
      count: 0,
      errors,
    };
  }
}

/**
 * Seeds the current TODO state into the vector database
 *
 * Creates a snapshot of the TODO file and stores it in the
 * todo_snapshots collection.
 *
 * @param todoPath - Path to the TODO file (relative to project root)
 * @returns Promise resolving to seed result
 */
export async function seedTodo(todoPath: string = DEFAULT_SEED_PATHS.TODO): Promise<SeedResult> {
  const errors: string[] = [];

  try {
    const absolutePath = path.resolve(process.cwd(), todoPath);

    if (!fs.existsSync(absolutePath)) {
      return {
        success: false,
        count: 0,
        errors: [`TODO file not found: ${absolutePath}`],
      };
    }

    console.log(`Seeding TODO from: ${absolutePath}`);

    // Import indexer dynamically
    const { snapshotTodo } = await import('./indexers/todo.js');
    const { storeTodoSnapshot } = await import('./storage.js');

    const snapshot = await snapshotTodo(absolutePath, storeTodoSnapshot);

    console.log(`  Created snapshot with ${snapshot.sections.length} sections`);
    console.log(`  Overall completion: ${snapshot.overallCompletionPct}%`);

    return {
      success: true,
      count: 1,
      errors,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Failed to seed TODO: ${errorMsg}`);
    console.error(`  Error: ${errorMsg}`);
    return {
      success: false,
      count: 0,
      errors,
    };
  }
}

/**
 * Parses journal.md into individual entries
 *
 * Splits the journal file by "## Session:" headers.
 *
 * @param journalContent - Full journal markdown content
 * @returns Array of individual journal entries
 */
export function parseJournalEntries(journalContent: string): { date: string; content: string }[] {
  const entries: { date: string; content: string }[] = [];

  // Split by session headers
  const parts = journalContent.split(/(?=## Session:)/);

  for (const part of parts) {
    const trimmed = part.trim();

    // Skip non-session content (header, preamble, etc.)
    if (!trimmed.startsWith('## Session:')) {
      continue;
    }

    // Extract date from session header
    const dateMatch = trimmed.match(/## Session:\s*(.+)/);
    const date = dateMatch ? dateMatch[1].trim() : new Date().toISOString();

    entries.push({
      date,
      content: trimmed,
    });
  }

  return entries;
}

/**
 * Seeds existing journal entries into the vector database
 *
 * Parses journal.md, extracts individual entries, generates
 * embeddings, and stores them in the journal_entries collection.
 *
 * @param journalPath - Path to the journal file (relative to project root)
 * @returns Promise resolving to seed result
 */
export async function seedExistingJournal(
  journalPath: string = DEFAULT_SEED_PATHS.JOURNAL
): Promise<SeedResult> {
  const errors: string[] = [];

  try {
    const absolutePath = path.resolve(process.cwd(), journalPath);

    if (!fs.existsSync(absolutePath)) {
      console.log(`Journal file not found: ${absolutePath} (skipping)`);
      return {
        success: true, // Not an error if journal doesn't exist yet
        count: 0,
        errors: [],
      };
    }

    console.log(`Seeding journal from: ${absolutePath}`);

    const journalContent = fs.readFileSync(absolutePath, 'utf-8');
    const entries = parseJournalEntries(journalContent);

    if (entries.length === 0) {
      console.log('  No journal entries found');
      return {
        success: true,
        count: 0,
        errors: [],
      };
    }

    // Import required modules dynamically
    const { storeJournalEntry, storeSessionSummary } = await import('./storage.js');
    const { extractTopics, createCondensedSummary, extractWorkCompleted, extractOpenItems } = await import('./journal-generator.js');

    let indexed = 0;

    for (const entry of entries) {
      try {
        // Extract metadata
        const topics = extractTopics(entry.content);
        const workCompleted = extractWorkCompleted(entry.content);
        const openItems = extractOpenItems(entry.content);

        // Create a summary from the first paragraph after the header
        const lines = entry.content.split('\n');
        const summaryLine = lines.find(l => l.startsWith('### Summary'));
        const summaryIdx = summaryLine ? lines.indexOf(summaryLine) : -1;
        const summary = summaryIdx >= 0 && summaryIdx + 1 < lines.length
          ? lines.slice(summaryIdx + 1, summaryIdx + 4).join(' ').trim()
          : entry.content.substring(0, 200);

        // Store journal entry (embeddings are generated by storage functions)
        const timestamp = new Date(entry.date).toISOString() || new Date().toISOString();
        await storeJournalEntry({
          id: `journal-seed-${indexed}`,
          timestamp,
          content: entry.content,
          summary,
          topics,
        });

        // Also create a session summary
        await storeSessionSummary({
          id: `session-seed-${indexed}`,
          timestamp,
          summary: createCondensedSummary({
            content: entry.content,
            summary,
            workCompleted,
            openItems,
            keyDecisions: [],
            topics,
          }),
          workCompleted,
          openItems,
        });

        indexed++;
        console.log(`  Indexed entry: ${entry.date}`);
      } catch (entryError) {
        const errorMsg = entryError instanceof Error ? entryError.message : 'Unknown error';
        errors.push(`Failed to index entry "${entry.date}": ${errorMsg}`);
        console.error(`  Error indexing entry: ${errorMsg}`);
      }
    }

    console.log(`  Indexed ${indexed} journal entries`);

    return {
      success: errors.length === 0,
      count: indexed,
      errors,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Failed to seed journal: ${errorMsg}`);
    console.error(`  Error: ${errorMsg}`);
    return {
      success: false,
      count: 0,
      errors,
    };
  }
}

/**
 * Seeds all context data sources
 *
 * Runs seeding for PRD, TODO, and journal in sequence.
 *
 * @param paths - Optional custom paths for each source
 * @returns Promise resolving to combined results
 */
export async function seedAll(paths?: {
  prd?: string;
  todo?: string;
  journal?: string;
}): Promise<SeedAllResult> {
  console.log('=== Context Database Seeding ===\n');

  // Ensure directories exist
  ensureContextDirs();
  console.log(`Data directory: ${CONTEXT_PATHS.DATA_DIR}`);
  console.log(`LanceDB directory: ${CONTEXT_PATHS.LANCEDB_DIR}\n`);

  // Connect to database and initialize collections
  console.log('Initializing database...');
  const { connectToDb, initializeCollections } = await import('./db.js');
  await connectToDb();
  await initializeCollections();
  console.log('Database initialized.\n');

  // Seed PRD
  console.log('[1/3] Seeding PRD...');
  const prdResult = await seedPrd(paths?.prd);

  // Seed TODO
  console.log('\n[2/3] Seeding TODO...');
  const todoResult = await seedTodo(paths?.todo);

  // Seed Journal
  console.log('\n[3/3] Seeding Journal...');
  const journalResult = await seedExistingJournal(paths?.journal);

  const overallSuccess = prdResult.success && todoResult.success && journalResult.success;

  console.log('\n=== Seeding Complete ===');
  console.log(`PRD:     ${prdResult.success ? 'OK' : 'FAILED'} (${prdResult.count} sections)`);
  console.log(`TODO:    ${todoResult.success ? 'OK' : 'FAILED'} (${todoResult.count} snapshots)`);
  console.log(`Journal: ${journalResult.success ? 'OK' : 'FAILED'} (${journalResult.count} entries)`);

  if (!overallSuccess) {
    console.log('\nErrors encountered:');
    [...prdResult.errors, ...todoResult.errors, ...journalResult.errors].forEach(e => {
      console.log(`  - ${e}`);
    });
  }

  return {
    prd: prdResult,
    todo: todoResult,
    journal: journalResult,
    overallSuccess,
  };
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  try {
    // Check for required environment variable
    if (!process.env.OPENAI_API_KEY) {
      console.error('Error: OPENAI_API_KEY environment variable is required for embeddings');
      console.log('Set it with: export OPENAI_API_KEY=your-key');
      process.exit(1);
    }

    const results = await seedAll();

    if (!results.overallSuccess) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Unexpected error during seeding:', error);
    process.exit(1);
  }
}

// Run if executed directly
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') || '');
if (isMainModule || process.argv[1]?.endsWith('seed.ts')) {
  main().catch(console.error);
}
