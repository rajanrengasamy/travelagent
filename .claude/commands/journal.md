Reflect on the current session and create a journal entry. This serves as a retrospective capturing what was accomplished, issues encountered, and context needed for future sessions.

## Instructions

1. **Review the session** - Analyze what was discussed and accomplished in this conversation
2. **Read existing context** - Check journal.md (if exists), task.md, and prd.md for continuity
3. **Generate entry** - Create a journal entry following the structure below
4. **Store in VectorDB** - If context persistence is available, store the entry for RAG retrieval
5. **Append to journal.md** - Also append to the markdown file as backup

## Journal Entry Structure

Use this format for the new entry:
```
---

## Session: [DATE] [TIME AEST]

### Summary
[2-3 sentence overview of what was accomplished]

### Work Completed
- [Specific task/change completed]
- [Files modified/created]

### Issues & Resolutions
| Issue | Resolution | Status |
|:------|:-----------|:-------|
| [Problem encountered] | [How it was solved] | Resolved / Open |

### Key Decisions
- [Decision made and rationale]

### Learnings
- [Technical insight or pattern discovered]

### Open Items / Blockers
- [ ] [Item needing attention next session]

### Context for Next Session
[Brief narrative of where things stand and recommended next steps]

---
```

## Vector Storage Integration (Phase 0.0)

After generating the journal entry, perform these additional steps if `src/context/` infrastructure exists:

### Step 1: Check VectorDB Availability

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Check if LanceDB is available
const dbPath = path.join(os.homedir(), '.travelagent', 'context', 'lancedb');
const vectorDbAvailable = fs.existsSync(dbPath);

if (!vectorDbAvailable) {
  console.warn('VectorDB unavailable, falling back to file-based storage only');
}
```

### Step 2: Generate Embeddings

If VectorDB is available, generate embeddings for the journal entry:

```typescript
import { generateEmbedding } from '../src/context/embeddings.js';

// Generate embedding for the full journal entry
const contentEmbedding = await generateEmbedding(journalEntry.content);

// Generate embedding for the summary (for session_summaries)
const summaryEmbedding = await generateEmbedding(journalEntry.summary);
```

### Step 3: Store in journal_entries Collection

```typescript
import { storeJournalEntry } from '../src/context/storage.js';

await storeJournalEntry({
  id: `journal-${Date.now()}`,
  timestamp: new Date().toISOString(),
  content: fullJournalEntry,
  summary: summarySection,
  topics: extractTopics(journalEntry), // e.g., ["vector-db", "rag", "context-persistence"]
  embedding: contentEmbedding
});
```

### Step 4: Create Condensed session_summaries Entry

Store a condensed version for efficient retrieval during /startagain:

```typescript
import { storeSessionSummary } from '../src/context/storage.js';
import { createCondensedSummary } from '../src/context/journal-generator.js';

const condensed = createCondensedSummary(journalEntry);

await storeSessionSummary({
  id: `session-${Date.now()}`,
  timestamp: new Date().toISOString(),
  summary: condensed,
  workCompleted: workCompletedItems,
  openItems: openItems,
  embedding: summaryEmbedding
});
```

### Step 5: Snapshot Current TODO State

Capture the current TODO state for future comparison:

```typescript
import { snapshotTodo } from '../src/context/indexers/todo.js';

await snapshotTodo('todo/tasks-phase0-travel-discovery.md');
```

## Auto-Journal Trigger Detection

This command may be auto-triggered when thresholds are met:

```typescript
import { shouldTriggerJournal, type SessionStats } from '../src/context/auto-journal.js';

const stats: SessionStats = {
  todosCompleted: 5,           // Trigger threshold: 3+
  significantActionsCount: 12, // Trigger threshold: 10+
  durationMinutes: 30,         // Minimum: 15 minutes
  sessionStartTime: sessionStart
};

if (shouldTriggerJournal(stats)) {
  // Auto-generate a more concise entry
}
```

When auto-triggered, generate a more concise entry focused on:
- What changed (files, tasks)
- Key decisions made
- Blockers encountered

## Fallback Behavior

If VectorDB is unavailable (LanceDB not installed, API key missing, or errors):

1. **Log a warning**: "VectorDB unavailable, falling back to file-based storage"
2. **Proceed with markdown-only storage** to `journal.md`
3. **The entry will be indexed** when VectorDB becomes available via `npm run seed-context`

```typescript
try {
  // Attempt VectorDB storage
  await storeJournalEntry(entry);
  await storeSessionSummary(summary);
  await snapshotTodo(todoPath);
  console.log('Journal entry stored in VectorDB');
} catch (error) {
  console.warn('VectorDB storage failed, using file-based fallback:', error.message);
  // Continue with markdown file append only
}
```

## File Locations

| File | Location | Purpose |
|------|----------|---------|
| journal.md | Project root | Human-readable backup |
| journal_entries.lance | `~/.travelagent/context/lancedb/` | Full journal entries with embeddings |
| session_summaries.lance | `~/.travelagent/context/lancedb/` | Condensed summaries for quick retrieval |
| todo_snapshots.lance | `~/.travelagent/context/lancedb/` | TODO state snapshots |

## Behavior

- **If journal.md exists**: Append new entry at the end
- **If journal.md doesn't exist**: Create it with a header and first entry
- **Tone**: Concise, factual, future-oriented
- **Focus**: Capture enough context that a fresh session can resume seamlessly

## File Header (for new journal.md)
```
# Project Journal

This file maintains session history for continuity across Claude Code sessions.
Use alongside `todo/tasks-phase0-travel-discovery.md` (task list) and `docs/phase_0_prd_unified.md` (PRD) when starting new sessions.

> Note: Entries are also stored in VectorDB for semantic retrieval via `/startagain`.
```

## Complete Workflow Example

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  generateSessionSummary,
  formatJournalEntry,
  createCondensedSummary,
  extractTopics
} from '../src/context/journal-generator.js';

async function createJournalEntry(conversationContext: string) {
  // 1. Generate the journal entry
  const entry = await generateSessionSummary(conversationContext);
  const formattedEntry = formatJournalEntry(entry);

  // 2. Append to journal.md (always do this)
  const journalPath = path.join(process.cwd(), 'journal.md');
  if (!fs.existsSync(journalPath)) {
    // Create new file with header
    const header = `# Project Journal\n\nThis file maintains session history....\n\n`;
    fs.writeFileSync(journalPath, header + formattedEntry);
  } else {
    // Append to existing
    fs.appendFileSync(journalPath, '\n' + formattedEntry);
  }
  console.log('Journal entry appended to journal.md');

  // 3. Attempt VectorDB storage
  const dbPath = path.join(os.homedir(), '.travelagent', 'context', 'lancedb');
  if (fs.existsSync(dbPath)) {
    try {
      const { generateEmbedding } = await import('../src/context/embeddings.js');
      const { storeJournalEntry, storeSessionSummary } = await import('../src/context/storage.js');
      const { snapshotTodo } = await import('../src/context/indexers/todo.js');

      // Generate embeddings
      const contentEmbedding = await generateEmbedding(entry.content);
      const summaryEmbedding = await generateEmbedding(entry.summary);

      // Store journal entry
      await storeJournalEntry({
        id: `journal-${Date.now()}`,
        timestamp: new Date().toISOString(),
        content: entry.content,
        summary: entry.summary,
        topics: entry.topics,
        embedding: contentEmbedding
      });

      // Store session summary
      await storeSessionSummary({
        id: `session-${Date.now()}`,
        timestamp: new Date().toISOString(),
        summary: createCondensedSummary(entry),
        workCompleted: entry.workCompleted,
        openItems: entry.openItems,
        embedding: summaryEmbedding
      });

      // Snapshot TODO
      await snapshotTodo('todo/tasks-phase0-travel-discovery.md');

      console.log('Journal entry stored in VectorDB');
    } catch (error) {
      console.warn('VectorDB storage failed:', error.message);
    }
  } else {
    console.warn('VectorDB not available, using file-based storage only');
    console.log('Run `npm run seed-context` to index existing entries later');
  }
}
```
