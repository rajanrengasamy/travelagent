---
description: Run a deep QA review on a specific section of the TODO list against the PRD and Codebase.
argument-hint: <section_number>
---

You are a **QA Orchestrator** for the Travel Discovery Orchestrator CLI project. You will coordinate a complete QA cycle: review the section, identify issues, and fix them automatically.

## Arguments

- Section Number: $ARGUMENTS

## Project Files

- **PRD**: `docs/phase_0_prd_unified.md`
- **TODO**: `todo/tasks-phase0-travel-discovery.md`
- **QA Reports**: `docs/Section{N}-QA-issues.md`
- **Fix Tracker**: `docs/QA-Fix-Tracker.md`
- **VectorDB**: `~/.travelagent/context/lancedb/` (LanceDB collections)

---

## Phase 0: VectorDB Context Retrieval (REQUIRED)

**IMPORTANT**: Before reading any markdown files, you MUST first attempt to retrieve context from the vector database to ensure you have the most up-to-date indexed information.

### Step 0.1: Check VectorDB Availability

Run this bash command to check if VectorDB is available:

```bash
ls ~/.travelagent/context/lancedb/ 2>/dev/null || echo "VectorDB not available"
```

### Step 0.2: If VectorDB Available - Use Retrieval API

If VectorDB exists, use the retrieval functions to get context. Run `npx tsx` with this code:

```typescript
// IMPORTANT: Load .env first for API keys
import 'dotenv/config';

import {
  queryPrdSections,
  getCurrentTodoState,
  queryJournalEntries
} from './src/context/retrieval.js';

// 1. Get PRD sections relevant to Section $ARGUMENTS
const sectionQuery = "Section $ARGUMENTS implementation requirements";
const relevantPrd = await queryPrdSections(sectionQuery, 5);
console.log("=== RELEVANT PRD SECTIONS ===");
for (const section of relevantPrd) {
  console.log(`\n### ${section.id}: ${section.title}`);
  console.log(section.content.substring(0, 2000));
}

// 2. Get current TODO state from vector DB
const todoState = await getCurrentTodoState();
if (todoState) {
  console.log("\n=== TODO STATE (from VectorDB) ===");
  console.log(`Overall Progress: ${todoState.overallCompletionPct}%`);
  for (const section of todoState.sections) {
    if (section.name.includes('$ARGUMENTS') || section.name.includes('Section $ARGUMENTS')) {
      console.log(`\n### ${section.name} (${section.completionPct}%)`);
      for (const item of section.items) {
        const checkbox = item.completed ? '[x]' : '[ ]';
        console.log(`- ${checkbox} ${item.id} ${item.description}`);
      }
    }
  }
}

// 3. Get historical context about this section
const historicalContext = await queryJournalEntries("Section $ARGUMENTS implementation", 3);
if (historicalContext.length > 0) {
  console.log("\n=== HISTORICAL CONTEXT ===");
  for (const entry of historicalContext) {
    console.log(`\n### Journal Entry: ${entry.timestamp}`);
    console.log(entry.summary);
  }
}
```

### Step 0.3: Staleness Check

**IMPORTANT**: Even if VectorDB is available, check if it's stale by comparing timestamps:

```bash
# Get TODO file modification time
TODO_MTIME=$(stat -f %m todo/tasks-phase0-travel-discovery.md 2>/dev/null || stat -c %Y todo/tasks-phase0-travel-discovery.md 2>/dev/null)
PRD_MTIME=$(stat -f %m docs/phase_0_prd_unified.md 2>/dev/null || stat -c %Y docs/phase_0_prd_unified.md 2>/dev/null)
JOURNAL_MTIME=$(stat -f %m journal.md 2>/dev/null || stat -c %Y journal.md 2>/dev/null)
echo "File mtimes - TODO: $TODO_MTIME, PRD: $PRD_MTIME, Journal: $JOURNAL_MTIME"

# Get VectorDB collection modification times
ls -la ~/.travelagent/context/lancedb/*/*.lance 2>/dev/null | head -5
```

If the markdown files have been modified more recently than the VectorDB collections, warn:
```
⚠️ VectorDB may be STALE - source files modified after last index
Run `npm run seed-context` to re-index the latest content before proceeding.
```

### Step 0.4: Fallback to File Reading

If VectorDB is NOT available or the retrieval fails, then proceed to read the markdown files directly in Phase 1. When using fallback, warn the user:

```
⚠️ VectorDB not available - reading files directly (may be stale)
Run `npm run seed-context` to index the latest context.
```

---

## Phase 1: Context Gathering

**Note**: If Phase 0 successfully retrieved context from VectorDB, use that data instead of reading files again. Only read files if VectorDB was unavailable.

1. Read `todo/tasks-phase0-travel-discovery.md` and extract all tasks from **Section $ARGUMENTS**
2. Read `docs/phase_0_prd_unified.md` to understand the product requirements for this section
3. Identify all source files associated with Section $ARGUMENTS (use Glob/Grep to find them)
4. Create a summary of:
   - What the section is supposed to implement
   - Which files contain the implementation
   - Key requirements from the PRD

---

## Phase 2: Spawn QA Reviewer Agent

Use the **Task tool** to spawn the **qa-reviewer agent**:

```
subagent_type: "qa-reviewer"
prompt: |
  Review Section $ARGUMENTS of the Travel Discovery Orchestrator CLI project.

  ## Section to Review
  Section Number: $ARGUMENTS

  ## Files to Review
  [List the files you identified in Phase 1]

  ## Section Summary
  [Summary of what this section should implement based on PRD/TODO]

  ## Instructions
  1. Read the PRD: docs/phase_0_prd_unified.md
  2. Read the TODO: todo/tasks-phase0-travel-discovery.md
  3. Read ALL source files for Section $ARGUMENTS
  4. Perform 5-dimension QA review (PRD Compliance, Error Handling, Type Safety, Architecture, Security)
  5. Create docs/Section$ARGUMENTS-QA-issues.md with your findings
  6. Report back with status and summary
```

---

## Phase 3: Parse QA Report

After the qa-reviewer agent completes:

1. Read `docs/Section$ARGUMENTS-QA-issues.md`
2. If the report shows **Status: PASS**, skip to Phase 6
3. If issues found, extract all issues categorizing by severity:
   - **CRITICAL**: Must fix immediately
   - **MAJOR**: Should fix
   - **MINOR**: Nice to have
4. Create a consolidated list with:
   - Issue ID (CRIT-1, MAJ-1, MIN-1, etc.)
   - File location
   - Description
   - Recommended fix

---

## Phase 4: Distribute Issues to Fix Agents

If issues were found, divide them among 5 agents:

- **Agent 1**: Critical issues (first half) + architectural issues
- **Agent 2**: Critical issues (second half) + security-related issues
- **Agent 3**: Major issues (first third) - focus on error handling
- **Agent 4**: Major issues (second third) - focus on type safety
- **Agent 5**: Major issues (final third) + all minor issues

If there are few issues, some agents may get fewer tasks. That's fine.

---

## Phase 5: Spawn Fix Agents

Use the **Task tool** to spawn **5 dev agents in parallel** (in a single message with 5 Task tool calls).

**IMPORTANT**: Launch all 5 agents in a SINGLE message to run them in parallel.

### Agent Template

For each agent, use this structure:

```
subagent_type: "dev"
prompt: |
  You are a senior developer fixing QA issues for the Travel Discovery Orchestrator CLI project.

  ## Your Assigned Issues

  [List the specific issues assigned to this agent with full details from the QA report]

  ## For Each Issue

  1. Read the file(s) mentioned in the issue
  2. Understand the current implementation
  3. Implement the recommended fix (or devise an appropriate fix)
  4. Ensure the fix doesn't break existing functionality
  5. Run type checking: `npm run build`
  6. Run tests if applicable: `npm test`

  ## Guidelines

  - Follow existing code patterns and conventions
  - Add JSDoc comments for new functions
  - Use Zod schemas for validation where appropriate
  - Ensure all TypeScript types are correct
  - Don't over-engineer - make minimal changes to fix the issue

  ## Report Back

  For each issue you fix, report:
  - Issue ID
  - Files modified
  - Summary of changes
  - Any concerns or follow-up needed
```

---

## Phase 6: Consolidate Results

After all agents complete:

1. Collect all fix reports from each agent
2. Create or update `docs/QA-Fix-Tracker.md`:

```markdown
# QA Fix Tracker

**Generated:** [DATE]
**Section Reviewed:** $ARGUMENTS

## Issues Summary

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | X | Y | Z |
| Major | X | Y | Z |
| Minor | X | Y | Z |

## Fix Details

| Issue ID | Agent | Status | Files Modified | Notes |
|----------|-------|--------|----------------|-------|
| CRIT-1 | Agent 1 | Fixed | file.ts | ... |
...
```

3. Run final verification:
   - `npm run build` (TypeScript compilation)
   - `npm test` (run tests)

4. Create summary for user:
   - Total issues found
   - Total issues fixed
   - Any issues that couldn't be fixed
   - Build/test status

---

## Phase 7: Journal Entry

After completing Phase 6, run the `/journal` command to create a session entry documenting:
- The section reviewed
- Issues found and fixed
- Any issues remaining open
- Key decisions made during fixes
- Context for the next session

---

## Execution Checklist

- [ ] Context gathered (section tasks identified, files listed)
- [ ] qa-reviewer agent spawned and completed
- [ ] QA report parsed (or "PASS" confirmed)
- [ ] Issues distributed among 5 agents (if applicable)
- [ ] All 5 agents launched in parallel (single message, if applicable)
- [ ] All agent results collected
- [ ] Fix tracker updated with results
- [ ] Type check passed
- [ ] Tests passed (or noted as not applicable)
- [ ] Summary provided to user
- [ ] Journal entry created via /journal
