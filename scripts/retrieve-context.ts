#!/usr/bin/env npx tsx
/**
 * Retrieve context from VectorDB for /startagain command
 *
 * Usage: npx tsx scripts/retrieve-context.ts [query]
 */

import 'dotenv/config';
import { getRelevantContext, getRecentSessions, getCurrentTodoState } from '../src/context/retrieval.js';

async function main() {
  const query = process.argv[2] || 'current development focus';

  console.log('=== VectorDB Context Retrieval ===\n');
  console.log(`Query: "${query}"\n`);

  try {
    // Get recent sessions
    console.log('## Recent Sessions\n');
    const sessions = await getRecentSessions(3);
    if (sessions.length === 0) {
      console.log('(no sessions found)\n');
    } else {
      for (const session of sessions) {
        const date = new Date(session.timestamp).toLocaleDateString();
        console.log(`### Session (${date})`);
        console.log(`**Summary:** ${session.summary.substring(0, 200)}...`);
        if (session.workCompleted.length > 0) {
          console.log(`**Completed:** ${session.workCompleted.slice(0, 3).join(', ')}`);
        }
        if (session.openItems.length > 0) {
          console.log(`**Open:** ${session.openItems.slice(0, 2).join(', ')}`);
        }
        console.log('');
      }
    }

    // Get TODO state
    console.log('## Current TODO State\n');
    const todoState = await getCurrentTodoState();
    if (!todoState) {
      console.log('(no TODO state found)\n');
    } else {
      console.log(`Overall completion: ${todoState.overallCompletionPct}%\n`);
      for (const section of todoState.sections.slice(0, 5)) {
        console.log(`### ${section.name} (${section.completionPct}%)`);
        const items = section.items.slice(0, 3);
        for (const item of items) {
          const checkbox = item.completed ? '[x]' : '[ ]';
          console.log(`- ${checkbox} ${item.id} ${item.description}`);
        }
        if (section.items.length > 3) {
          console.log(`  ... and ${section.items.length - 3} more items`);
        }
        console.log('');
      }
    }

    // Get full context bundle
    console.log('## Full Context Bundle\n');
    const bundle = await getRelevantContext(query);
    console.log(`Generated at: ${bundle.generatedAt}`);
    console.log(`Sessions: ${bundle.recentSessions.length}`);
    console.log(`PRD sections: ${bundle.relevantPrdSections.length}`);
    console.log(`Journal entries: ${bundle.relevantJournalEntries.length}`);
    console.log(`TODO state: ${bundle.todoState ? 'present' : 'null'}`);

    if (bundle.relevantPrdSections.length > 0) {
      console.log('\n### Relevant PRD Sections:');
      for (const section of bundle.relevantPrdSections) {
        console.log(`- ${section.title}`);
      }
    }

  } catch (error) {
    console.error('ERROR:', error);
    process.exit(1);
  }
}

main();
