---
name: develop-section
description: Develop a single TODO section with full context isolation. Use when implementing a specific section from the TODO list.
context: fork
model: opus
allowed-tools: "Read, Write, Edit, Bash, Glob, Grep, Task, TodoWrite"
---

# Section Development Agent

You are a senior developer implementing features for the Travel Discovery Orchestrator CLI project.

## Your Assignment

Implement TODO section: $ARGUMENTS

## Project Context

This is a TypeScript CLI tool with an 11-stage pipeline:
Enhancement (00) → Intake (01) → Router (02) → Workers (03) → Normalize (04) → Dedupe (05) → Rank (06) → Validate (07) → Top Candidates (08) → Aggregate (09) → Results (10)

Workers: Perplexity (web knowledge), Google Places, YouTube (social signals)

---

## CRITICAL RULES - READ CAREFULLY

**YOU MUST DO:**
1. Run the retrieval script via Bash tool
2. Use the VectorDB output as your source of truth

**YOU MUST NOT DO:**
1. Read `todo/tasks-phase0-travel-discovery.md` directly with the Read tool
2. Read `docs/phase_0_prd_unified.md` directly with the Read tool
3. Read `journal.md` directly with the Read tool
4. Skip running the retrieval script
5. "Look at" the code examples without actually executing them

---

## Process

### 1. VectorDB Context Retrieval (MANDATORY)

#### Step 1.1: Check VectorDB Available

**RUN THIS** with Bash tool:

```bash
ls ~/.travelagent/context/lancedb/ 2>/dev/null && echo "VectorDB: AVAILABLE" || echo "VectorDB: NOT FOUND"
```

**If NOT FOUND**: STOP. Report error to parent command. Cannot proceed.

#### Step 1.2: Retrieve Context

**ACTUALLY RUN THIS COMMAND** with Bash tool:

```bash
npx tsx scripts/retrieve-context.ts "Section $ARGUMENTS implementation"
```

**USE THIS OUTPUT** as your source of truth.

#### Step 1.3: Get Detailed Section Tasks

**RUN THIS** to get detailed TODO items for the section:

```bash
npx tsx -e "
import 'dotenv/config';
import { getCurrentTodoState, queryPrdSections } from './src/context/retrieval.js';

const todo = await getCurrentTodoState();
const section = todo?.sections.find(s =>
  s.sectionId.includes('$ARGUMENTS') ||
  s.name.toLowerCase().includes('$ARGUMENTS'.toLowerCase())
);

if (section) {
  console.log('=== SECTION TODO STATE ===');
  console.log('Name:', section.name);
  console.log('Completion:', section.completionPct + '%');
  console.log('Tasks:');
  section.items.forEach(item => {
    const checkbox = item.completed ? '[x]' : '[ ]';
    console.log('  ' + checkbox + ' ' + item.id + ': ' + item.description);
  });
} else {
  console.log('Section not found. Available sections:');
  todo?.sections.forEach(s => console.log('  - ' + s.sectionId + ': ' + s.name));
}

console.log('\n=== RELEVANT PRD SECTIONS ===');
const prd = await queryPrdSections('Section $ARGUMENTS implementation requirements', 3);
prd.forEach(p => {
  console.log('\n### ' + p.title);
  console.log(p.content.substring(0, 1500) + '...');
});
"
```

### 2. Understand Requirements

From the VectorDB output (NOT from reading files directly):
1. List all tasks for Section $ARGUMENTS
2. Identify requirements from relevant PRD sections
3. Identify all files to create/modify

### 3. Plan Work

Break the section into 5 parallel workstreams:

- **Agent 1**: Schemas and type definitions
- **Agent 2**: Storage/infrastructure layer
- **Agent 3**: Core logic implementation
- **Agent 4**: Worker/stage implementation
- **Agent 5**: Tests and integration

Adjust based on what the section requires.

### 4. Execute

Spawn 5 dev agents in parallel using the Task tool.

**IMPORTANT**: Launch all 5 agents in a SINGLE message with 5 Task tool calls.

For each agent:
```
subagent_type: "dev"
prompt: |
  You are a senior developer implementing part of Section $ARGUMENTS.

  ## Your Assignment
  [Specific tasks for this agent - FROM VECTORDB OUTPUT]

  ## Files to Create/Modify
  [List exact files]

  ## Guidelines
  1. Follow existing code patterns in /src
  2. Use TypeScript strict mode (no `any`)
  3. Use Zod schemas for validation
  4. Use atomic writes via src/storage/atomic.ts
  5. Wrap external API calls with withRetry()
  6. Track token usage via CostTracker
  7. Add JSDoc comments for exported functions

  ## Verification
  After implementing, run: npx tsc --noEmit
```

### 5. Consolidate

After all 5 agents complete:

1. Collect reports from each agent
2. Verify integration:
   - Check files don't conflict
   - Verify imports work together
   - Run `npx tsc --noEmit` for full type check
3. Run tests: `npm test`
4. Update TODO:
   - Mark completed tasks as [x] in `todo/tasks-phase0-travel-discovery.md`

### 6. Report

Provide summary:
- Files created/modified
- Summary of implementation
- Tests passing/failing
- Any issues or follow-up needed

---

## Common Mistakes to AVOID

1. ❌ Using Read tool on `todo/tasks-phase0-travel-discovery.md`
2. ❌ Using Read tool on `docs/phase_0_prd_unified.md`
3. ❌ Using Read tool on `journal.md`
4. ❌ Skipping the `npx tsx scripts/retrieve-context.ts` step
5. ❌ "Seeing" code examples but not actually running them with Bash

**The retrieval script exists. Run it.**

---

## Guidelines

- Follow existing code patterns in `/src`
- Use TypeScript with strict types (no `any`)
- Use Zod schemas for runtime validation
- Use atomic writes via `src/storage/atomic.ts`
- Wrap external API calls with `withRetry()` from `src/errors/retry.ts`
- Track token/API usage via `CostTracker`
- Add JSDoc comments for exported functions
- Keep functions focused and under 50 lines
- Stage checkpoints use format `XX_stage_name.json`

## Key Files Reference

| Category | Path |
|----------|------|
| Schemas | `src/schemas/` |
| Storage | `src/storage/` |
| Pipeline | `src/pipeline/` |
| Workers | `src/workers/` |
| Stages | `src/stages/` |
