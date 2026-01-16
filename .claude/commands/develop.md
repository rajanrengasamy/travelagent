---
description: Develop features using 5 parallel dev agents
argument-hint: <section_number | comma-separated sections | feature description>
---

You are a **Development Lead** coordinating dev agents to implement features in parallel.

## Arguments

The user's development request: $ARGUMENTS

This could be:
- A single section number (e.g., "10" to implement Section 10)
- **Multiple section numbers** (e.g., "10,11" to develop sections in parallel)
- A feature description (e.g., "add retry logic to all API calls")

---

## Phase 0: VectorDB Context Retrieval (MANDATORY)

> **CRITICAL**: Do NOT use `npx tsx -e "..."` for inline TypeScript execution.
> It fails due to ESM/CJS incompatibility. Always use the provided scripts.

### CRITICAL RULES - READ CAREFULLY

**YOU MUST DO:**
1. Run the retrieval script via Bash tool
2. Use the VectorDB output as your source of truth

**YOU MUST NOT DO:**
1. Read `todo/tasks-phase0-travel-discovery.md` directly with the Read tool
2. Read `docs/phase_0_prd_unified.md` directly with the Read tool
3. Read `journal.md` directly with the Read tool
4. Skip running the retrieval script
5. Use `npx tsx -e` for inline TypeScript (it will fail)

### Step 0.1: Check VectorDB Available

Run this with the Bash tool:

```bash
ls ~/.travelagent/context/lancedb/ 2>/dev/null && echo "VectorDB: AVAILABLE" || echo "VectorDB: NOT FOUND"
```

**If NOT FOUND**: STOP. Tell the user to run `npm run seed-context` first. Do not proceed.

### Step 0.2: Retrieve Context from VectorDB

**ACTUALLY RUN THIS COMMAND** with the Bash tool:

```bash
npx tsx scripts/retrieve-context.ts "Section $ARGUMENTS development"
```

This outputs:
- Recent session summaries
- Current TODO state (structured)
- Relevant PRD sections (semantically matched)

**USE THIS OUTPUT** - do not read raw files.

### Step 0.3: If You Need More Detail

For specific section tasks, use the section lookup script:

```bash
npx tsx scripts/get-todo-section.ts "$ARGUMENTS"
```

This returns the full section data including all items and completion status.

---

## Phase 1: Parse Arguments

Check if `$ARGUMENTS` contains a comma:

**If comma detected** (e.g., "10,11,12"):
1. Split into array of section numbers
2. Proceed to Phase 2 (dependency check)

**If single value**:
- If numeric: Single section - proceed to Phase 3
- If text: Feature description - proceed to Phase 3 with feature mode

---

## Phase 2: Multi-Section Dependency Analysis

Use Haiku for fast dependency analysis. The agent MUST use VectorDB:

```
Task tool:
subagent_type: "general-purpose"
model: "haiku"
prompt: |
  Analyze if these TODO sections can be developed in parallel.

  Sections: [insert section numbers]

  ## REQUIRED: Run this Bash command to get TODO state

  ```bash
  npx tsx scripts/retrieve-context.ts "sections [numbers]"
  ```

  DO NOT read markdown files directly.
  USE the VectorDB output.

  Known patterns:
  - Worker sections (9, 10, 11) are independent
  - Processing stages (12-18) are sequential

  Return JSON:
  {
    "canParallel": ["10", "11"],
    "mustSequential": ["12"],
    "reason": "Section 12 imports from workers"
  }
```

Display results and confirm with user via `AskUserQuestion`.

---

## Phase 3: Execute Development (5 Parallel Agents)

### For Single Section or Feature

Invoke the `develop-section` skill directly:

```
Skill tool:
skill: "develop-section"
args: "$ARGUMENTS"
```

The skill handles:
- Context retrieval from VectorDB (via script execution)
- Spawning 5 parallel dev agents
- Consolidation and verification
- Build and test validation

### For Multiple Parallel Sections

Launch skills in a SINGLE message for true parallelism:

```
For sections 10, 11 approved:

Skill tool calls (in ONE message):
- skill: "develop-section", args: "10"
- skill: "develop-section", args: "11"

Each runs in forked context with Opus 4.5.
```

---

## Phase 4: Synthesize Results

After skill(s) complete:

1. Collect summaries from each invocation
2. Verify integration:
   - Check files don't conflict
   - Verify imports work together
3. Run final verification:
   ```bash
   npm run build && npm test 2>&1 | tail -20
   ```
4. Present consolidated report:
   - Files created/modified per section
   - Tests passing/failing
   - Any issues encountered

---

## Phase 5: Update TODO Markdown File (MANDATORY - SOURCE OF TRUTH)

**After successful implementation, update the TODO markdown file:**

The markdown file is the **source of truth**. VectorDB syncs from it.

1. Read the section to find the line numbers:
   ```bash
   grep -n "\[ \] $ARGUMENTS\." todo/tasks-phase0-travel-discovery.md | head -20
   ```
2. Mark completed items as `[x]` using Edit tool

Example edit pattern:
```
Edit tool:
file_path: "todo/tasks-phase0-travel-discovery.md"
old_string: "- [ ] 20.1 Create `src/triage/manager.ts`"
new_string: "- [x] 20.1 Create `src/triage/manager.ts`"
```

**Update ALL completed items** - do not leave incomplete markers for finished work.

---

## Phase 6: Append Journal to Markdown (MANDATORY - SOURCE OF TRUTH)

**The markdown journal is the source of truth. Append the entry first.**

```bash
cat >> journal.md << 'EOF'

---

## Session: [DATE] [TIME AEST]

### Summary
Implemented Section $ARGUMENTS - [brief description of what was built]

### Work Completed
- Created [file1.ts] - [description]
- Created [file2.ts] - [description]
- Added [X] unit tests - all passing
- Build passes, [total] tests pass

### Issues & Resolutions
| Issue | Resolution | Status |
|:------|:-----------|:-------|
| [Problem encountered] | [How it was solved] | Resolved |

### Key Decisions
- [Decision made and rationale]

### Learnings
- [Technical insight discovered]

### Open Items / Blockers
- [ ] [Any follow-up needed]

### Context for Next Session
[Where things stand, recommended next steps]

---
EOF
echo "Journal entry appended to journal.md"
```

---

## Phase 7: Sync to VectorDB (MANDATORY)

**After updating markdown files, sync to VectorDB for semantic search.**

The VectorDB reads from the updated markdown files, ensuring consistency.

### Step 7.1: Check VectorDB Available

```bash
ls ~/.travelagent/context/lancedb/ 2>/dev/null && echo "VectorDB: AVAILABLE" || echo "VectorDB: NOT FOUND"
```

**If NOT FOUND**: Skip to completion. Run `npm run seed-context` later.

### Step 7.2: Create Journal JSON for VectorDB

```bash
cat > /tmp/journal-entry.json << 'EOF'
{
  "summary": "Implemented Section $ARGUMENTS - [brief description]",
  "content": "[Detailed description of what was implemented, files created, issues resolved]",
  "topics": ["section-$ARGUMENTS", "implementation", "other-relevant-topics"],
  "workCompleted": [
    "Created [file1]",
    "Created [file2]",
    "Added [X] unit tests",
    "All tests passing"
  ],
  "openItems": [
    "Any follow-up items if applicable"
  ]
}
EOF
```

### Step 7.3: Store in VectorDB

```bash
npx tsx scripts/store-journal-entry.ts /tmp/journal-entry.json
```

This stores:
- Journal entry with embeddings
- Session summary for `/startagain`
- **TODO state snapshot** (from the now-updated markdown file)

### Step 7.4: Cleanup

```bash
rm /tmp/journal-entry.json 2>/dev/null
```

---

## Execution Checklist

- [ ] **Phase 0**: VectorDB check passed
- [ ] **Phase 0**: Retrieval script executed
- [ ] **Phase 0**: DID NOT read raw markdown files (during retrieval)
- [ ] **Phase 1**: Arguments parsed
- [ ] **Phase 2**: Dependency analysis (if multi-section)
- [ ] **Phase 3**: develop-section skill(s) invoked (5 agents)
- [ ] **Phase 4**: Results consolidated, build/tests verified
- [ ] **Phase 5**: TODO markdown updated with [x] markers (SOURCE OF TRUTH)
- [ ] **Phase 6**: Journal appended to journal.md (SOURCE OF TRUTH)
- [ ] **Phase 7**: VectorDB synced (journal + TODO snapshot)

---

## Data Flow: Markdown → VectorDB

```
┌─────────────────────────────────────────────────────────────┐
│               SOURCE OF TRUTH: Markdown Files                │
├─────────────────────────────────────────────────────────────┤
│  todo/tasks-phase0-travel-discovery.md                      │
│  journal.md                                                  │
│  docs/phase_0_prd_unified.md                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼ (sync via scripts)
┌─────────────────────────────────────────────────────────────┐
│               DERIVED INDEX: VectorDB                        │
├─────────────────────────────────────────────────────────────┤
│  ~/.travelagent/context/lancedb/                            │
│    ├── todo_snapshots.lance (from markdown)                 │
│    ├── journal_entries.lance (from markdown)                │
│    ├── session_summaries.lance (derived)                    │
│    └── prd_sections.lance (from markdown)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Execution Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    /develop $ARGUMENTS                       │
├─────────────────────────────────────────────────────────────┤
│ Phase 0: VectorDB Context Retrieval                         │
│    └─→ Scripts: retrieve-context.ts, get-todo-section.ts    │
├─────────────────────────────────────────────────────────────┤
│ Phase 1-2: Parse Args & Dependency Analysis                 │
├─────────────────────────────────────────────────────────────┤
│ Phase 3: Execute (5 Parallel Dev Agents)                    │
│    └─→ Skill: develop-section                               │
├─────────────────────────────────────────────────────────────┤
│ Phase 4: Consolidate & Verify (build + tests)               │
├─────────────────────────────────────────────────────────────┤
│ Phase 5: Update TODO Markdown (SOURCE OF TRUTH)             │
│    └─→ Mark completed items as [x]                          │
├─────────────────────────────────────────────────────────────┤
│ Phase 6: Append Journal to Markdown (SOURCE OF TRUTH)       │
│    └─→ cat >> journal.md                                    │
├─────────────────────────────────────────────────────────────┤
│ Phase 7: Sync to VectorDB                                   │
│    └─→ store-journal-entry.ts                               │
│    └─→ (snapshots TODO from updated markdown)               │
└─────────────────────────────────────────────────────────────┘
```

---

## Common Mistakes to AVOID

1. ❌ Using Read tool on markdown files during Phase 0 retrieval
2. ❌ Skipping the `npx tsx scripts/retrieve-context.ts` step
3. ❌ Forgetting to update TODO markdown after implementation
4. ❌ Storing to VectorDB BEFORE updating markdown files
5. ❌ Skipping the VectorDB sync step (Phase 7)
6. ❌ Not marking all completed items as [x] in TODO

**Remember: Markdown is source of truth. VectorDB syncs from it.**
