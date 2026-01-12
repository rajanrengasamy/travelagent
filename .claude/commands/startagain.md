Begin a new session by loading project context using RAG-based retrieval from the vector database.

> **CRITICAL**: Do NOT use `npx tsx -e "..."` for inline TypeScript execution.
> It fails due to ESM/CJS incompatibility. Always use the retrieval script.

## Overview

This command uses semantic search to retrieve only the most relevant context for the current session, dramatically reducing context window usage while maintaining continuity.

**Context Window Optimization:**
- Traditional approach: ~4000 lines (full PRD + TODO + journal)
- RAG approach: ~500-800 lines (relevant sections only)
- **Savings: ~75-80% context reduction**

## Instructions

### Step 1: Check VectorDB Availability

Check if VectorDB exists:

```bash
ls ~/.travelagent/context/lancedb/
```

If the directory exists with collections (journal_entries.lance, prd_sections.lance, etc.), proceed to Step 2.

If VectorDB **does not exist**, skip to Fallback Behavior below.

### Step 2: Run VectorDB Retrieval Script

Always use the retrieval script:

```bash
npx tsx scripts/retrieve-context.ts
```

This script:
- Loads environment variables (dotenv/config)
- Queries session_summaries for recent sessions
- Gets current TODO state from todo_snapshots
- Retrieves relevant PRD sections
- Returns formatted context bundle

**Output includes:**
- Recent Sessions (last 3)
- Current TODO State with completion percentages
- Relevant PRD sections based on current focus

### Step 3: Present Context Summary

Based on the script output, present a formatted summary:

```
# Session Start - Travel Discovery Orchestrator

## Quick Recap
- Last session: [summary from script output]
- Current phase: [from TODO state]
- Next task: [first incomplete task]

## What Was Left Off
[work completed from last session]

## Open Items from Last Session
[open items array from session summary]

## Current Progress
[TODO state with completion %]

---

What would you like to focus on this session?
```

### Step 4: Ask for Session Focus

Present options based on current progress:

```
What would you like to focus on this session?
1. Continue with [next incomplete section] - Recommended
2. [Alternative focus area]
3. Something else (describe)
```

## Fallback Behavior

**ONLY use fallback if VectorDB directory does NOT exist.**

If `~/.travelagent/context/lancedb/` is missing:

1. Inform the user:
```
VectorDB not initialized. Run `npm run seed-context` to enable semantic search.

Falling back to file-based loading...
```

2. Read files with optimization:
   - **Journal**: Last 150 lines of `journal.md` only
   - **TODO**: First 300 lines of `todo/tasks-phase0-travel-discovery.md`
   - **PRD**: Skip (too large for context)

3. Recommend seeding:
```
To enable VectorDB retrieval, run:
npm run seed-context
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
| `scripts/retrieve-context.ts` | VectorDB retrieval script |

## VectorDB Collections

| Collection | Query For |
|------------|-----------|
| `session_summaries` | Recent session recaps |
| `journal_entries` | Historical context by topic |
| `todo_snapshots` | Current progress state |
| `prd_sections` | Requirements by topic |

## Seeding (First Run)

If VectorDB is empty or doesn't exist:

```bash
npm run seed-context
```

This indexes:
- PRD sections (semantic search for requirements)
- Current TODO state (progress tracking)
- Existing journal entries (historical context)
