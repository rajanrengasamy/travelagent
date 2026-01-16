Reflect on the current session and create a journal entry. This serves as a retrospective capturing what was accomplished, issues encountered, and context needed for future sessions.

> **CRITICAL**: Do NOT use `npx tsx -e "..."` for inline TypeScript execution.
> It fails due to ESM/CJS incompatibility. Always use the storage script.

## Data Flow: Markdown → VectorDB

**Markdown files are the SOURCE OF TRUTH. VectorDB syncs from them.**

```
┌─────────────────────────────────────────────────────────────┐
│               SOURCE OF TRUTH: Markdown Files                │
├─────────────────────────────────────────────────────────────┤
│  journal.md (append first)                                   │
│  todo/tasks-phase0-travel-discovery.md                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼ (sync via scripts)
┌─────────────────────────────────────────────────────────────┐
│               DERIVED INDEX: VectorDB                        │
├─────────────────────────────────────────────────────────────┤
│  ~/.travelagent/context/lancedb/                            │
│    ├── journal_entries.lance                                │
│    ├── session_summaries.lance                              │
│    └── todo_snapshots.lance                                 │
└─────────────────────────────────────────────────────────────┘
```

## Instructions

### Step 1: Review the Session

Analyze what was discussed and accomplished in this conversation:
- What tasks were completed?
- What files were modified/created?
- What issues were encountered and how were they resolved?
- What decisions were made?
- What's left to do?

### Step 2: Generate the Journal Entry

Create a journal entry following this structure:

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

### Step 3: Append to journal.md (SOURCE OF TRUTH - DO THIS FIRST)

**The markdown file is the source of truth. Write here first.**

Use bash heredoc to append the entry:

```bash
cat >> journal.md << 'EOF'

---

## Session: 2026-01-12 10:00 AEST

### Summary
[Your summary here]

### Work Completed
- [Items here]

[... rest of entry ...]

---
EOF
echo "Journal entry appended to journal.md"
```

### Step 4: Check VectorDB Availability

```bash
ls ~/.travelagent/context/lancedb/ 2>/dev/null && echo "VectorDB: AVAILABLE" || echo "VectorDB: NOT FOUND"
```

If **NOT FOUND**: Stop here. The entry in journal.md is saved. Run `npm run seed-context` later to index.

### Step 5: Sync to VectorDB

If VectorDB is available, create a JSON file and run the storage script:

```bash
cat > /tmp/journal-entry.json << 'EOF'
{
  "summary": "Brief 1-2 sentence summary of the session",
  "content": "Full description of what was accomplished, issues resolved, etc.",
  "topics": ["topic1", "topic2", "topic3"],
  "workCompleted": [
    "First completed item",
    "Second completed item"
  ],
  "openItems": [
    "First open item",
    "Second open item"
  ]
}
EOF

npx tsx scripts/store-journal-entry.ts /tmp/journal-entry.json
```

The script handles:
- VectorDB lock acquisition (prevents conflicts with parallel sessions)
- Embedding generation via OpenAI
- Storing journal entry in `journal_entries` collection
- Storing session summary in `session_summaries` collection
- **Snapshotting current TODO state** (reads from markdown file)

### Step 6: Cleanup

```bash
rm /tmp/journal-entry.json 2>/dev/null
```

## Execution Order (IMPORTANT)

```
1. journal.md      ← WRITE FIRST (source of truth)
2. VectorDB check  ← Check availability
3. VectorDB sync   ← Sync from markdown (if available)
4. Cleanup         ← Remove temp files
```

## Quick Reference

| Step | Command |
|------|---------|
| Append to markdown | `cat >> journal.md << 'EOF' ... EOF` |
| Check VectorDB | `ls ~/.travelagent/context/lancedb/` |
| Sync to VectorDB | `npx tsx scripts/store-journal-entry.ts /tmp/journal-entry.json` |
| Full re-index | `npm run seed-context` |

## File Locations

| File | Location | Purpose |
|------|----------|---------|
| journal.md | Project root | **SOURCE OF TRUTH** - Human-readable journal |
| journal_entries.lance | `~/.travelagent/context/lancedb/` | Derived index with embeddings |
| session_summaries.lance | `~/.travelagent/context/lancedb/` | Condensed for /startagain |
| store-journal-entry.ts | `scripts/` | VectorDB sync script |

## Behavior

- **If journal.md exists**: Append new entry at the end
- **If journal.md doesn't exist**: Create it with header and first entry
- **If VectorDB unavailable**: Journal is still saved in markdown (can sync later)
- **Tone**: Concise, factual, future-oriented
- **Focus**: Capture enough context for seamless session resumption

## File Header (for new journal.md)

```markdown
# Project Journal

This file maintains session history for continuity across Claude Code sessions.
Use alongside `todo/tasks-phase0-travel-discovery.md` (task list) and `docs/phase_0_prd_unified.md` (PRD) when starting new sessions.

> Note: Entries are also indexed in VectorDB for semantic retrieval via `/startagain`.
```

## Fallback Behavior

If VectorDB is unavailable:
1. The journal.md entry is still saved (source of truth preserved)
2. Run `npm run seed-context` later to index all entries
3. The seed script parses journal.md and populates VectorDB

**Markdown is always the source of truth. VectorDB is a derived index.**

## Example Session

```bash
# 1. FIRST: Append entry to journal.md (source of truth)
cat >> journal.md << 'EOF'

---

## Session: 2026-01-12 10:00 AEST

### Summary
Fixed authentication bug in login flow. Added rate limiting to API endpoints.

### Work Completed
- Fixed JWT token validation in `src/auth/validate.ts`
- Added rate limiter middleware in `src/middleware/rate-limit.ts`
- Updated tests (15 new, all passing)

### Issues & Resolutions
| Issue | Resolution | Status |
|:------|:-----------|:-------|
| Token expiry not checked | Added expiry validation | Resolved |

### Key Decisions
- Using sliding window for rate limiting (not fixed window)

### Learnings
- JWT `exp` claim is in seconds, not milliseconds

### Open Items / Blockers
- [ ] Add rate limit headers to responses

### Context for Next Session
Auth is working. Rate limiting in place. Next: add response headers.

---
EOF
echo "Journal entry appended to journal.md"

# 2. Check VectorDB availability
ls ~/.travelagent/context/lancedb/

# 3. Sync to VectorDB (if available)
cat > /tmp/journal-entry.json << 'EOF'
{
  "summary": "Fixed authentication bug in login flow. Added rate limiting to API endpoints.",
  "content": "Fixed JWT token validation in src/auth/validate.ts. Added rate limiter middleware. Token expiry validation was missing - now checks exp claim properly.",
  "topics": ["auth", "jwt", "rate-limiting", "security"],
  "workCompleted": [
    "Fixed JWT token validation",
    "Added rate limiter middleware",
    "Updated tests (15 new)"
  ],
  "openItems": [
    "Add rate limit headers to responses"
  ]
}
EOF

npx tsx scripts/store-journal-entry.ts /tmp/journal-entry.json

# 4. Cleanup
rm /tmp/journal-entry.json
```
