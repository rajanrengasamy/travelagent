---
description: Run a deep QA review on a specific section of the TODO list against the PRD and Codebase.
argument-hint: <section_number | comma-separated sections>
---

You are a **QA Orchestrator** coordinating quality assurance cycles with automatic issue fixing.

## Arguments

The user's QA request: $ARGUMENTS

This could be:
- A single section number (e.g., "10" to QA Section 10)
- **Multiple section numbers** (e.g., "4,5,6" to QA sections in parallel)

## Project Files

- **PRD**: `docs/phase_0_prd_unified.md`
- **TODO**: `todo/tasks-phase0-travel-discovery.md`
- **QA Reports**: `docs/Section{N}-QA-issues.md`
- **Fix Tracker**: `docs/QA-Fix-Tracker.md`

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
npx tsx scripts/retrieve-context.ts "Section $ARGUMENTS QA review"
```

This outputs:
- Recent session summaries
- Current TODO state (structured)
- Relevant PRD sections (semantically matched)

**USE THIS OUTPUT** - do not read raw files.

### Step 0.3: If You Need More Detail

For specific section details, use the section lookup script:

```bash
npx tsx scripts/get-todo-section.ts "$ARGUMENTS"
```

For PRD context, use the QA context script:

```bash
npx tsx scripts/qa-context.ts "$ARGUMENTS"
```

These scripts return structured data for the section and relevant PRD content.

---

## Phase 1: Parse Arguments

Check if `$ARGUMENTS` contains a comma:

**If comma detected** (e.g., "4,5,6"):
1. Split into array of section numbers
2. Proceed to Phase 2 (dependency check)

**If single value**:
- Proceed to Phase 3 (single section QA)

---

## Phase 2: Multi-Section Dependency Analysis

Use Haiku for fast dependency analysis. The agent MUST use VectorDB:

```
Task tool:
subagent_type: "general-purpose"
model: "haiku"
prompt: |
  Analyze if these TODO sections can be QA'd in parallel.

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
    "canParallel": ["4", "5"],
    "mustSequential": ["6"],
    "reason": "Section 6 depends on files from 4, 5"
  }
```

Display results and confirm with user via `AskUserQuestion`.

---

## Phase 3: Execute QA

### For Single Section

Invoke the `qa-section` skill directly:

```
Skill tool:
skill: "qa-section"
args: "$ARGUMENTS"
```

The skill handles:
- Context retrieval from VectorDB (via script execution)
- Completeness check
- QA review (Haiku with thinking)
- Issue fixing (Opus with thinking)
- Re-verification
- Build/test verification

### For Multiple Parallel Sections

Launch skills in a SINGLE message for true parallelism:

```
For sections 4, 5 approved:

Skill tool calls (in ONE message):
- skill: "qa-section", args: "4"
- skill: "qa-section", args: "5"

Each runs in forked context with Opus 4.5.
```

---

## Phase 4: Synthesize Results

After skill(s) complete:

1. Collect summaries from each invocation
2. Present consolidated report:
   ```
   ┌─────────────────────────────────────────────────────┐
   │ QA Results Summary                                  │
   ├─────────────────────────────────────────────────────┤
   │ Section 4: PASS (0 issues remaining)               │
   │   - 3 issues found → 3 fixed → verified            │
   ├─────────────────────────────────────────────────────┤
   │ Section 5: PARTIAL (1 issue remaining)             │
   │   - 5 issues found → 4 fixed → 1 remaining         │
   └─────────────────────────────────────────────────────┘
   ```
3. List queued sections if any were sequential

---

## Phase 5: Journal (MANDATORY)

**You MUST run /journal before completing.**

```
Skill tool:
skill: "journal"
```

---

## Execution Checklist

- [ ] **VectorDB check passed** (ls command showed AVAILABLE)
- [ ] **Retrieval script executed** (npx tsx scripts/retrieve-context.ts)
- [ ] **DID NOT read raw markdown files**
- [ ] Arguments parsed (single vs multi-section)
- [ ] Dependency analysis (if multi-section)
- [ ] qa-section skill(s) invoked
- [ ] Results consolidated
- [ ] Summary provided to user
- [ ] **MANDATORY: /journal invoked**

---

## Common Mistakes to AVOID

1. ❌ Using Read tool on `todo/tasks-phase0-travel-discovery.md`
2. ❌ Using Read tool on `docs/phase_0_prd_unified.md`
3. ❌ Using Read tool on `journal.md`
4. ❌ Skipping the `npx tsx scripts/retrieve-context.ts` step
5. ❌ "Seeing" code examples but not actually running them with Bash

**The retrieval script exists. Run it.**
