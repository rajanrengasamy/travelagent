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

## Phase 3: Execute Development

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
- TODO updates

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
2. Present consolidated report:
   - Files created/modified per section
   - Tests passing/failing
   - Any issues encountered
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
- [ ] develop-section skill(s) invoked
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
