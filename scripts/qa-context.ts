#!/usr/bin/env npx tsx
/**
 * Retrieve QA context from VectorDB with proper filtering
 *
 * Usage: npx tsx scripts/qa-context.ts <section-number> [query]
 */

import 'dotenv/config';
import { getCollection, collectionExists } from '../src/context/db.js';
import { generateEmbedding } from '../src/context/embeddings.js';
import { COLLECTION_NAMES } from '../src/context/types.js';
import { getRecentSessions, getCurrentTodoState } from '../src/context/retrieval.js';
import { getPrdSectionsForTodo, getMappingForTodo } from '../src/context/section-mapping.js';

async function queryPrdSectionsFiltered(query: string, targetSections: number[], limit: number = 3) {
  if (!(await collectionExists(COLLECTION_NAMES.PRD_SECTIONS))) {
    return [];
  }

  try {
    const queryEmbedding = await generateEmbedding(query);
    const collection = await getCollection(COLLECTION_NAMES.PRD_SECTIONS);

    // Get all rows and filter manually (LanceDB WHERE clause is limited)
    const allResults = await collection
      .search(queryEmbedding)
      .limit(50) // Get more to filter from
      .toArray();

    // Filter to valid sections and dedupe by title
    const seen = new Set<string>();
    const filtered = allResults.filter((r: any) => {
      const sectionNum = parseInt(r.sectionNumber, 10);
      const isTargetSection = targetSections.length === 0 || targetSections.includes(sectionNum);
      const isValidSection = sectionNum >= 0;
      const title = r.title as string;

      if (!isValidSection || !isTargetSection) return false;
      if (seen.has(title)) return false;

      seen.add(title);
      return true;
    });

    return filtered.slice(0, limit).map((r: any) => ({
      id: r.id,
      sectionNumber: r.sectionNumber,
      title: r.title,
      content: r.content,
    }));
  } catch (error) {
    console.error('PRD query failed:', error);
    return [];
  }
}

async function main() {
  const sectionArg = process.argv[2];
  const queryArg = process.argv[3];

  if (!sectionArg) {
    console.log('Usage: npx tsx scripts/qa-context.ts <section-number> [query]');
    console.log('Example: npx tsx scripts/qa-context.ts 13 "deduplication clustering"');
    process.exit(1);
  }

  const sectionNumber = parseInt(sectionArg, 10);

  // Use the section mapping registry for TODO -> PRD lookup
  const targetPrdSections = getPrdSectionsForTodo(sectionArg);
  const mapping = getMappingForTodo(sectionArg);
  const query = queryArg || `Section ${sectionNumber} implementation requirements stage pipeline`;

  console.log(`=== QA Context for Section ${sectionNumber} ===\n`);
  if (mapping) {
    console.log(`TODO: ${mapping.todoSection} - ${mapping.todoTitle}`);
    if (mapping.stage) {
      console.log(`Stage: ${mapping.stage}`);
    }
  }
  console.log(`Query: "${query}"`);
  console.log(`Target PRD sections: ${targetPrdSections.length > 0 ? targetPrdSections.join(', ') : 'all'}\n`);

  // Get recent sessions
  console.log('## Recent Sessions\n');
  const sessions = await getRecentSessions(2);
  for (const session of sessions) {
    const date = new Date(session.timestamp).toLocaleDateString();
    console.log(`### ${date}`);
    console.log(`Summary: ${session.summary.substring(0, 150)}...`);
    if (session.workCompleted.length > 0) {
      console.log(`Completed: ${session.workCompleted.slice(0, 2).join(', ')}`);
    }
    console.log('');
  }

  // Get TODO state for this section
  console.log('## TODO State\n');
  const todoState = await getCurrentTodoState();
  if (todoState) {
    console.log(`Overall: ${todoState.overallCompletionPct}% complete\n`);

    // Find matching section
    const matchingSection = todoState.sections.find(s =>
      s.name.includes(`${sectionNumber}.0`) || s.name.includes(`${sectionNumber} `)
    );

    if (matchingSection) {
      console.log(`### ${matchingSection.name} (${matchingSection.completionPct}%)`);
      for (const item of matchingSection.items.slice(0, 10)) {
        const checkbox = item.completed ? '[x]' : '[ ]';
        console.log(`- ${checkbox} ${item.id} ${item.description.substring(0, 60)}...`);
      }
      console.log('');
    }
  }

  // Get relevant PRD sections with filtering
  console.log('## Relevant PRD Sections\n');
  const prdSections = await queryPrdSectionsFiltered(query, targetPrdSections, 3);

  if (prdSections.length === 0) {
    console.log('(no PRD sections found - trying broader search)');
    const broadSections = await queryPrdSectionsFiltered(query, [], 3);
    for (const section of broadSections) {
      console.log(`### [${section.sectionNumber}] ${section.title}`);
      console.log(section.content.substring(0, 800) + '...\n');
    }
  } else {
    for (const section of prdSections) {
      console.log(`### [${section.sectionNumber}] ${section.title}`);
      console.log(section.content.substring(0, 1500) + '...\n');
    }
  }

  console.log('---');
  console.log('VectorDB retrieval complete.');
}

main().catch(console.error);
