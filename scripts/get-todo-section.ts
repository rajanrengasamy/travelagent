#!/usr/bin/env npx tsx
/**
 * Get details for a specific TODO section
 *
 * Usage: npx tsx scripts/get-todo-section.ts <section-pattern>
 *
 * Examples:
 *   npx tsx scripts/get-todo-section.ts 14
 *   npx tsx scripts/get-todo-section.ts "Ranking"
 *   npx tsx scripts/get-todo-section.ts "Phase 0.0"
 */

import 'dotenv/config';
import { getCurrentTodoState } from '../src/context/retrieval.js';

async function main() {
  const pattern = process.argv[2];

  if (!pattern) {
    console.error('Usage: npx tsx scripts/get-todo-section.ts <section-pattern>');
    console.error('');
    console.error('Examples:');
    console.error('  npx tsx scripts/get-todo-section.ts 14');
    console.error('  npx tsx scripts/get-todo-section.ts "Ranking"');
    process.exit(1);
  }

  try {
    const todo = await getCurrentTodoState();

    if (!todo) {
      console.error('ERROR: Could not retrieve TODO state');
      process.exit(1);
    }

    // Find section matching pattern (case-insensitive)
    const patternLower = pattern.toLowerCase();
    const section = todo.sections.find(s =>
      s.sectionId.toLowerCase().includes(patternLower) ||
      s.name.toLowerCase().includes(patternLower)
    );

    if (section) {
      console.log(JSON.stringify(section, null, 2));
    } else {
      console.error(`Section not found matching: "${pattern}"`);
      console.error('');
      console.error('Available sections:');
      for (const s of todo.sections) {
        console.error(`  ${s.sectionId}: ${s.name} (${s.completionPct}%)`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('ERROR:', (error as Error).message);
    process.exit(1);
  }
}

main();
