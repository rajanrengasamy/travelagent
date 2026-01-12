Reflect on the current session and create a journal entry. This serves as a retrospective capturing what was accomplished, issues encountered, and context needed for future sessions.

> **CRITICAL**: Do NOT use `npx tsx -e "..."` for inline TypeScript execution.
> It fails due to ESM/CJS incompatibility. Always use the storage script.

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

### Step 3: Append to journal.md

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

If **NOT FOUND**: Skip to the end. The entry in journal.md will be indexed later via `npm run seed-context`.

### Step 5: Store in VectorDB

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
- Snapshotting current TODO state

### Step 6: Cleanup

```bash
rm /tmp/journal-entry.json 2>/dev/null
```

## Quick Reference

| Step | Command |
|------|---------|
| Check VectorDB | `ls ~/.travelagent/context/lancedb/` |
| Store entry | `npx tsx scripts/store-journal-entry.ts /tmp/journal-entry.json` |
| Seed VectorDB | `npm run seed-context` |

## File Locations

| File | Location | Purpose |
|------|----------|---------|
| journal.md | Project root | Human-readable backup |
| journal_entries.lance | `~/.travelagent/context/lancedb/` | Full entries with embeddings |
| session_summaries.lance | `~/.travelagent/context/lancedb/` | Condensed for /startagain |
| store-journal-entry.ts | `scripts/` | VectorDB storage script |

## Behavior

- **If journal.md exists**: Append new entry at the end
- **If journal.md doesn't exist**: Create it with header and first entry
- **Tone**: Concise, factual, future-oriented
- **Focus**: Capture enough context for seamless session resumption

## File Header (for new journal.md)

```markdown
# Project Journal

This file maintains session history for continuity across Claude Code sessions.
Use alongside `todo/tasks-phase0-travel-discovery.md` (task list) and `docs/phase_0_prd_unified.md` (PRD) when starting new sessions.

> Note: Entries are also stored in VectorDB for semantic retrieval via `/startagain`.
```

## Fallback Behavior

If VectorDB is unavailable:
1. The journal.md entry is still saved (human-readable backup)
2. Run `npm run seed-context` later to index existing entries
3. The seed script will parse journal.md and populate VectorDB

## Example Session

```bash
# 1. Append entry to journal.md
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

# 2. Check VectorDB
ls ~/.travelagent/context/lancedb/

# 3. Store in VectorDB (if available)
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
