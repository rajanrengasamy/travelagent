Begin a new session by loading project context using RAG-based retrieval from the vector database.

## Overview

This command uses semantic search to retrieve only the most relevant context for the current session, dramatically reducing context window usage while maintaining continuity.

**Context Window Optimization:**
- Traditional approach: ~4000 lines (full PRD + TODO + journal)
- RAG approach: ~500-800 lines (relevant sections only)
- **Savings: ~75-80% context reduction**

## Instructions

### Step 1: Check VectorDB Availability

First, check if the context persistence infrastructure is available:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Check for LanceDB at ~/.travelagent/context/lancedb/
const dbPath = path.join(os.homedir(), '.travelagent', 'context', 'lancedb');
const vectorDbAvailable = fs.existsSync(dbPath);

if (!vectorDbAvailable) {
  console.warn('VectorDB not available, using fallback mode');
}
```

If VectorDB is **not available**, fall back to file-based loading (see Fallback Behavior below).

### Step 2: Retrieve Recent Session Context

Query the `session_summaries` collection for the last 2-3 sessions:

```typescript
import { getRecentSessions } from '../src/context/retrieval.js';

const recentSessions = await getRecentSessions(3);
// Returns: [{id, timestamp, summary, workCompleted, openItems}, ...]
```

Display a condensed summary:
```
## Recent Sessions

### Last Session (2026-01-02)
**Summary:** Implemented Phase 0.0 context persistence infrastructure...
**Completed:** Added PRD section, updated TODO, modified commands
**Open Items:** Need to implement embeddings service, test retrieval

### Previous Session (2026-01-01)
**Summary:** Set up project foundation...
```

### Step 3: Retrieve Current TODO State

Get the latest TODO snapshot:

```typescript
import { getCurrentTodoState } from '../src/context/retrieval.js';

const todoState = await getCurrentTodoState();
// Returns: {id, timestamp, sections, overallCompletionPct}
```

Display focused progress:
```
## Current Progress

### Phase 0.0 - Context Persistence (25% complete)
- [x] 0.0.0 Context Persistence Setup
- [x] 0.0.1 Embedding Service
- [ ] 0.0.2 LanceDB Collections
...

### Phase 0 - Travel Discovery (0% complete)
- [ ] 1.0 Project Foundation
...

**Next up:** Task 0.0.2 - LanceDB Collections
```

### Step 4: Query Relevant PRD Sections

Based on the current TODO focus, retrieve relevant PRD sections:

```typescript
import { queryPrdSections } from '../src/context/retrieval.js';

// Determine focus from first incomplete task
const currentFocus = todoState?.sections.find(s => s.completionPct < 100);
const query = currentFocus ? `${currentFocus.name} implementation requirements` : 'project overview';

const relevantPrd = await queryPrdSections(query, 3);
// Returns top 3 most relevant sections
```

Display relevant sections:
```
## Relevant PRD Context

### Section 0: Development Infrastructure
[Condensed content about context persistence...]

### Section 0.7: Implementation Requirements
[Dependencies, environment variables, embedding config...]
```

### Step 5: Query Historical Context (Optional)

If the user mentions a specific topic, query journal entries:

```typescript
import { queryJournalEntries } from '../src/context/retrieval.js';

// If user provides a topic query
const historicalContext = await queryJournalEntries(userQuery, 5);
```

### Step 6: Present Context Bundle

Combine all retrieved context into a comprehensive summary:

```typescript
import { getRelevantContext, type ContextBundle } from '../src/context/retrieval.js';

// Get the full context bundle
const bundle: ContextBundle = await getRelevantContext('current task focus');
```

Present the bundle:
```
# Session Start - Travel Discovery Orchestrator

## Quick Recap
- Last session: Defined Phase 0.0 context persistence infrastructure
- Current phase: Phase 0.0 - Context Persistence (25% complete)
- Next task: 0.0.2 LanceDB Collections

## What Was Left Off
- Created PRD Section 0 for context persistence
- Added 12 task groups to TODO for Phase 0.0
- Updated /journal and /startagain commands

## Open Items from Last Session
- [ ] Install LanceDB dependencies
- [ ] Create src/context/ directory structure
- [ ] Implement embedding service

## Relevant Requirements (PRD Section 0)
- LanceDB for embedded vector storage
- OpenAI text-embedding-3-small for embeddings
- Auto-journal on TODO completion threshold

---

What would you like to focus on this session?
```

### Step 7: Ask for Session Focus

After presenting context, ask what to work on:
```
What would you like to focus on this session?
1. Continue with Phase 0.0 (Context Persistence) - Recommended
2. Skip to Phase 0 (Travel Discovery)
3. Something else (describe)
```

## Complete RAG Workflow Example

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function startSession() {
  const dbPath = path.join(os.homedir(), '.travelagent', 'context', 'lancedb');

  if (!fs.existsSync(dbPath)) {
    console.log('VectorDB not available, using fallback mode...');
    return await startSessionFallback();
  }

  try {
    const {
      getRecentSessions,
      getCurrentTodoState,
      queryPrdSections,
      getRelevantContext
    } = await import('../src/context/retrieval.js');

    // Get recent sessions
    console.log('## Recent Sessions\n');
    const sessions = await getRecentSessions(3);
    for (const session of sessions) {
      const date = new Date(session.timestamp).toLocaleDateString();
      console.log(`### Session (${date})`);
      console.log(`**Summary:** ${session.summary}`);
      if (session.workCompleted.length > 0) {
        console.log(`**Completed:** ${session.workCompleted.slice(0, 3).join(', ')}`);
      }
      if (session.openItems.length > 0) {
        console.log(`**Open:** ${session.openItems.slice(0, 2).join(', ')}`);
      }
      console.log('');
    }

    // Get TODO state
    console.log('## Current Progress\n');
    const todoState = await getCurrentTodoState();
    if (todoState) {
      console.log(`Overall: ${todoState.overallCompletionPct}% complete\n`);
      for (const section of todoState.sections.slice(0, 3)) {
        console.log(`### ${section.name} (${section.completionPct}%)`);
        for (const item of section.items.slice(0, 5)) {
          const checkbox = item.completed ? '[x]' : '[ ]';
          console.log(`- ${checkbox} ${item.id} ${item.description}`);
        }
        console.log('');
      }
    }

    // Get relevant PRD sections
    console.log('## Relevant Requirements\n');
    const currentFocus = todoState?.sections.find(s => s.completionPct < 100);
    const query = currentFocus?.name || 'project setup';
    const prdSections = await queryPrdSections(query, 2);
    for (const section of prdSections) {
      console.log(`### ${section.title}`);
      // Show first 500 chars of content
      console.log(section.content.substring(0, 500) + '...\n');
    }

    console.log('---\n');
    console.log('What would you like to focus on this session?');

  } catch (error) {
    console.error('Error loading context:', error.message);
    console.log('Falling back to file-based loading...');
    return await startSessionFallback();
  }
}

async function startSessionFallback() {
  // Fallback implementation - see below
}
```

## Fallback Behavior

If VectorDB is unavailable, use file-based loading with optimization:

```
## Fallback Mode (VectorDB unavailable)

Reading files directly with context optimization...
```

### Fallback File Reading

1. **PRD**: Read `docs/phase_0_prd_unified.md`
   - If >2000 lines, read only Table of Contents + Section 0 + first incomplete section

2. **TODO**: Read `todo/tasks-phase0-travel-discovery.md`
   - Read full file (needed for task tracking)

3. **Journal**: Read **only the last 150 lines** of `journal.md`
   - First check file length, then use offset parameter
   - Captures last 2-3 session entries

```typescript
import * as fs from 'fs';
import * as path from 'path';

async function startSessionFallback() {
  const projectRoot = process.cwd();

  console.log('## Fallback Mode - Reading Files Directly\n');

  // 1. Read TODO (full file - needed for tracking)
  const todoPath = path.join(projectRoot, 'todo/tasks-phase0-travel-discovery.md');
  if (fs.existsSync(todoPath)) {
    console.log('### Current Tasks');
    const todoContent = fs.readFileSync(todoPath, 'utf-8');
    // Extract first incomplete section for display
    const lines = todoContent.split('\n');
    let inSection = false;
    let sectionCount = 0;
    for (const line of lines) {
      if (line.startsWith('### ')) {
        sectionCount++;
        if (sectionCount > 2) break; // Only show first 2 sections
        inSection = true;
        console.log(line);
      } else if (inSection && line.startsWith('- ')) {
        console.log(line);
      }
    }
    console.log('');
  }

  // 2. Read journal.md (last 150 lines only)
  const journalPath = path.join(projectRoot, 'journal.md');
  if (fs.existsSync(journalPath)) {
    console.log('### Recent Journal Entries');
    const journalContent = fs.readFileSync(journalPath, 'utf-8');
    const lines = journalContent.split('\n');
    const lastLines = lines.slice(-150);
    // Find the last 2 session headers
    let sessionCount = 0;
    for (let i = lastLines.length - 1; i >= 0; i--) {
      if (lastLines[i].startsWith('## Session:')) {
        sessionCount++;
        if (sessionCount >= 2) {
          // Output from here to end
          console.log(lastLines.slice(i).join('\n'));
          break;
        }
      }
    }
    console.log('');
  }

  // 3. Read PRD (optimized - TOC + Section 0 only)
  const prdPath = path.join(projectRoot, 'docs/phase_0_prd_unified.md');
  if (fs.existsSync(prdPath)) {
    console.log('### PRD Overview');
    const prdContent = fs.readFileSync(prdPath, 'utf-8');
    const lines = prdContent.split('\n');

    // Extract TOC (first 100 lines usually contains it)
    const tocEnd = lines.findIndex((l, i) => i > 10 && l.startsWith('## '));
    if (tocEnd > 0) {
      console.log(lines.slice(0, Math.min(tocEnd, 50)).join('\n'));
    }

    // Find and display Section 0 only
    const section0Start = lines.findIndex(l => l.match(/^## 0\.?\s/));
    const section1Start = lines.findIndex((l, i) => i > section0Start && l.match(/^## 1\.?\s/));
    if (section0Start > 0) {
      const section0 = lines.slice(section0Start, section1Start > 0 ? section1Start : section0Start + 100);
      console.log('\n' + section0.slice(0, 50).join('\n') + '...');
    }
    console.log('');
  }

  console.log('---\n');
  console.log('Note: VectorDB not available. Run `npm run seed-context` to enable semantic search.');
  console.log('\nWhat would you like to focus on this session?');
}
```

## Project Overview

This is a TypeScript CLI tool for travel discovery orchestration:
- **Phase 0.0**: Context persistence infrastructure (current)
- **Phase 0**: Travel discovery pipeline (main application)

Pipeline: **Prompt Enhancement -> Router -> Workers -> Normalize -> Dedupe -> Rank -> Validate -> Aggregate -> Results**

## Key Files

| File | Purpose |
|------|---------|
| `docs/phase_0_prd_unified.md` | Product requirements (all phases) |
| `todo/tasks-phase0-travel-discovery.md` | Master task list |
| `journal.md` | Session history (markdown backup) |
| `~/.travelagent/context/lancedb/` | VectorDB storage |

## VectorDB Collections

| Collection | Query For |
|------------|-----------|
| `session_summaries` | Recent session recaps |
| `journal_entries` | Historical context by topic |
| `todo_snapshots` | Current progress state |
| `prd_sections` | Requirements by topic |

## Example RAG Queries

```typescript
import {
  queryJournalEntries,
  queryPrdSections,
  getCurrentTodoState
} from '../src/context/retrieval.js';

// "What did we decide about the embedding model?"
const decisions = await queryJournalEntries("embedding model decision", 3);

// "What are the requirements for the router?"
const requirements = await queryPrdSections("router implementation requirements", 2);

// "Show me current progress"
const progress = await getCurrentTodoState();
```

## Seeding (First Run)

If VectorDB is empty or doesn't exist, suggest running the seeding script:

```
VectorDB is empty or not initialized.

Run `npm run seed-context` to index:
- PRD sections (semantic search for requirements)
- Current TODO state (progress tracking)
- Existing journal entries (historical context)

This enables efficient RAG-based context retrieval for future sessions.
```

## Error Handling

Handle various error conditions gracefully:

```typescript
async function safeStartSession() {
  try {
    await startSession();
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('Required files not found. Ensure project is set up correctly.');
    } else if (error.message?.includes('OPENAI_API_KEY')) {
      console.error('OPENAI_API_KEY not set. Required for embeddings.');
      console.log('Falling back to file-based mode...');
      await startSessionFallback();
    } else {
      console.error('Unexpected error:', error.message);
      console.log('Falling back to file-based mode...');
      await startSessionFallback();
    }
  }
}
```
