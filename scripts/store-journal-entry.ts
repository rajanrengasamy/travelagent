#!/usr/bin/env npx tsx
/**
 * Store a journal entry in VectorDB
 *
 * Usage: npx tsx scripts/store-journal-entry.ts <json-file-path>
 *
 * The JSON file should contain:
 * {
 *   "summary": "Brief summary of the session",
 *   "content": "Full journal entry content",
 *   "topics": ["topic1", "topic2"],
 *   "workCompleted": ["item1", "item2"],
 *   "openItems": ["item1", "item2"]
 * }
 *
 * Example:
 *   cat > /tmp/journal.json << 'EOF'
 *   {
 *     "summary": "Fixed authentication bug",
 *     "content": "Detailed description...",
 *     "topics": ["auth", "bugfix"],
 *     "workCompleted": ["Fixed login flow"],
 *     "openItems": ["Add tests"]
 *   }
 *   EOF
 *   npx tsx scripts/store-journal-entry.ts /tmp/journal.json
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Check VectorDB availability first
const dbPath = path.join(os.homedir(), '.travelagent', 'context', 'lancedb');
if (!fs.existsSync(dbPath)) {
  console.error('ERROR: VectorDB not found at', dbPath);
  console.error('Run `npm run seed-context` to initialize VectorDB');
  process.exit(1);
}

// Import after checking (to avoid errors if VectorDB not set up)
import { acquireLock, releaseLock } from '../src/context/lock.js';
import { generateEmbedding } from '../src/context/embeddings.js';
import { storeJournalEntry, storeSessionSummary } from '../src/context/storage.js';
import { snapshotTodo } from '../src/context/indexers/todo.js';

interface JournalData {
  summary: string;
  content: string;
  topics: string[];
  workCompleted: string[];
  openItems: string[];
}

async function main() {
  const jsonFilePath = process.argv[2];

  if (!jsonFilePath) {
    console.error('Usage: npx tsx scripts/store-journal-entry.ts <json-file-path>');
    console.error('');
    console.error('Example:');
    console.error('  npx tsx scripts/store-journal-entry.ts /tmp/journal.json');
    process.exit(1);
  }

  // Read and parse JSON file
  if (!fs.existsSync(jsonFilePath)) {
    console.error(`ERROR: JSON file not found: ${jsonFilePath}`);
    process.exit(1);
  }

  let data: JournalData;
  try {
    const jsonContent = fs.readFileSync(jsonFilePath, 'utf-8');
    data = JSON.parse(jsonContent);
  } catch (error) {
    console.error('ERROR: Failed to parse JSON file:', (error as Error).message);
    process.exit(1);
  }

  // Validate required fields
  if (!data.summary || !data.content) {
    console.error('ERROR: JSON must contain "summary" and "content" fields');
    process.exit(1);
  }

  // Set defaults for optional fields
  data.topics = data.topics || [];
  data.workCompleted = data.workCompleted || [];
  data.openItems = data.openItems || [];

  console.log('=== Storing Journal Entry in VectorDB ===\n');
  console.log(`Summary: ${data.summary.substring(0, 100)}...`);
  console.log(`Topics: ${data.topics.join(', ') || '(none)'}`);
  console.log(`Work completed: ${data.workCompleted.length} items`);
  console.log(`Open items: ${data.openItems.length} items`);
  console.log('');

  // Acquire lock
  console.log('[1/5] Acquiring VectorDB lock...');
  const lockAcquired = await acquireLock('journal', {
    maxRetries: 30,
    retryIntervalMs: 1000,
    sessionId: `journal-${Date.now()}`
  });

  if (!lockAcquired) {
    console.error('ERROR: Could not acquire VectorDB lock after 30 attempts');
    console.error('Another session may be writing. Try again later.');
    process.exit(1);
  }
  console.log('✓ Lock acquired');

  try {
    const timestamp = new Date().toISOString();
    const journalId = `journal-${Date.now()}`;
    const sessionId = `session-${Date.now()}`;

    // Generate embeddings
    console.log('[2/5] Generating embeddings...');
    const contentEmbedding = await generateEmbedding(data.content);
    const summaryEmbedding = await generateEmbedding(data.summary);
    console.log('✓ Embeddings generated');

    // Store journal entry
    console.log('[3/5] Storing journal entry...');
    await storeJournalEntry({
      id: journalId,
      timestamp,
      content: data.content,
      summary: data.summary,
      topics: data.topics,
      embedding: contentEmbedding
    });
    console.log('✓ Journal entry stored');

    // Store session summary
    console.log('[4/5] Storing session summary...');
    await storeSessionSummary({
      id: sessionId,
      timestamp,
      summary: data.summary,
      workCompleted: data.workCompleted,
      openItems: data.openItems,
      embedding: summaryEmbedding
    });
    console.log('✓ Session summary stored');

    // Snapshot TODO
    console.log('[5/5] Snapshotting TODO state...');
    const todoPath = './todo/tasks-phase0-travel-discovery.md';
    if (fs.existsSync(todoPath)) {
      await snapshotTodo(todoPath);
      console.log('✓ TODO state snapshotted');
    } else {
      console.log('⚠ TODO file not found, skipping snapshot');
    }

    console.log('\n=== Journal Entry Stored Successfully ===');
    console.log(`Journal ID: ${journalId}`);
    console.log(`Session ID: ${sessionId}`);

  } catch (error) {
    console.error('\nERROR during storage:', (error as Error).message);
    process.exit(1);
  } finally {
    // Always release lock
    await releaseLock();
    console.log('✓ VectorDB lock released');
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
