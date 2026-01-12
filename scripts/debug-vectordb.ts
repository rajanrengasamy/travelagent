#!/usr/bin/env npx tsx
/**
 * Debug VectorDB contents and retrieval
 */

import 'dotenv/config';
import { getCollection, collectionExists } from '../src/context/db.js';
import { COLLECTION_NAMES } from '../src/context/types.js';

async function main() {
  console.log('=== VectorDB Debug ===\n');

  // Check PRD sections collection
  const prdExists = await collectionExists(COLLECTION_NAMES.PRD_SECTIONS);
  console.log(`PRD sections collection exists: ${prdExists}`);

  if (prdExists) {
    const collection = await getCollection(COLLECTION_NAMES.PRD_SECTIONS);
    const allRows = await collection.query().toArray();

    console.log(`\nTotal PRD sections indexed: ${allRows.length}\n`);
    console.log('### All PRD Section Titles:');

    for (const row of allRows) {
      const r = row as Record<string, unknown>;
      console.log(`- [${r.sectionNumber}] ${r.title}`);
    }

    // Check if Section 14 exists
    const section14 = allRows.find((r: any) =>
      r.title?.includes('Ranking') ||
      r.title?.includes('Dedupe') ||
      r.sectionNumber === '14'
    );

    console.log('\n### Section 14 (Dedupe) found:', section14 ? 'YES' : 'NO');
    if (section14) {
      const s = section14 as Record<string, unknown>;
      console.log(`  Title: ${s.title}`);
      console.log(`  Section Number: ${s.sectionNumber}`);
      console.log(`  Content length: ${(s.content as string)?.length || 0} chars`);
    }
  }

  // Check session summaries
  const sessionsExist = await collectionExists(COLLECTION_NAMES.SESSION_SUMMARIES);
  if (sessionsExist) {
    const collection = await getCollection(COLLECTION_NAMES.SESSION_SUMMARIES);
    const allRows = await collection.query().toArray();
    console.log(`\nSession summaries: ${allRows.length}`);
  }

  // Check TODO snapshots
  const todoExists = await collectionExists(COLLECTION_NAMES.TODO_SNAPSHOTS);
  if (todoExists) {
    const collection = await getCollection(COLLECTION_NAMES.TODO_SNAPSHOTS);
    const allRows = await collection.query().toArray();
    console.log(`TODO snapshots: ${allRows.length}`);
  }

  // Check journal entries
  const journalExists = await collectionExists(COLLECTION_NAMES.JOURNAL_ENTRIES);
  if (journalExists) {
    const collection = await getCollection(COLLECTION_NAMES.JOURNAL_ENTRIES);
    const allRows = await collection.query().toArray();
    console.log(`Journal entries: ${allRows.length}`);
  }
}

main().catch(console.error);
