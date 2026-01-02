---
description: Develop features using 5 parallel dev agents
argument-hint: <section_number | feature description>
---

You are a **Development Lead** coordinating 5 dev agents to implement features in parallel.

## Arguments

The user's development request: $ARGUMENTS

This could be:
- A section number (e.g., "10" to implement Section 10 from tasks-phase0-travel-discovery.md)
- A feature description (e.g., "add retry logic to all API calls")
- A specific task (e.g., "implement the YouTube worker")

## Phase 1: Understand the Request

1. **If a section number is provided:**
   - Read `todo/tasks-phase0-travel-discovery.md` and extract all tasks from that section
   - Read `docs/phase_0_prd_unified.md` for relevant requirements
   - Identify existing files that relate to this section

2. **If a feature/task description is provided:**
   - Read `docs/phase_0_prd_unified.md` to understand how it fits the product
   - Read `todo/tasks-phase0-travel-discovery.md` to see if it's already documented
   - Search the codebase for related existing code

3. **Create a development brief:**
   - What needs to be built
   - Which files need to be created/modified
   - Dependencies on existing code
   - Key requirements and constraints

## Phase 2: Plan the Work

Break down the development work into 5 parallel workstreams. Consider:

- **Natural boundaries**: Different files, modules, or concerns
- **Dependencies**: Tasks that can run independently vs. those that need sequencing
- **Complexity balance**: Distribute work roughly evenly

Example workstream division for this project:
- **Agent 1**: Schemas and type definitions (`src/schemas/`)
- **Agent 2**: Storage layer and infrastructure (`src/storage/`, `src/pipeline/`)
- **Agent 3**: Core stage/pipeline logic (`src/stages/`)
- **Agent 4**: Worker implementations (`src/workers/`)
- **Agent 5**: CLI commands, tests, and integration (`src/cli/`, `tests/`)

Adjust based on what's actually being built.

## Phase 3: Spawn Development Agents

Use the **Task tool** to spawn **5 dev agents in parallel** (in a single message with 5 Task tool calls).

**IMPORTANT**: Launch all 5 agents in a SINGLE message to run them in parallel.

### Agent Template

For each agent, customize this template:

```
subagent_type: "dev"
prompt: |
  You are a senior developer implementing features for the Travel Discovery Orchestrator CLI project.

  ## Project Context

  This is a TypeScript CLI tool with an 11-stage pipeline:
  Enhancement (00) → Intake (01) → Router (02) → Workers (03) → Normalize (04) → Dedupe (05) → Rank (06) → Validate (07) → Top Candidates (08) → Aggregate (09) → Results (10)

  Workers: Perplexity (web knowledge), Google Places, YouTube (social signals)

  Key references:
  - PRD: docs/phase_0_prd_unified.md
  - TODO: todo/tasks-phase0-travel-discovery.md
  - Existing patterns: [mention relevant existing files]

  ## Your Assignment

  [Specific tasks for this agent - be detailed and specific]

  ## Files to Create/Modify

  [List exact files this agent is responsible for]

  ## Implementation Guidelines

  1. Follow existing code patterns in the project
  2. Use TypeScript with strict types (no `any`)
  3. Use Zod schemas for runtime validation
  4. Use atomic writes via `src/storage/atomic.ts` for file persistence
  5. Wrap external API calls with `withRetry()` from `src/errors/retry.ts`
  6. Track token/API usage via `CostTracker` for cost visibility
  7. Add JSDoc comments for exported functions
  8. Handle errors gracefully with descriptive messages
  9. Keep functions focused and under 50 lines when possible
  10. Stage checkpoints use format `XX_stage_name.json` with metadata

  ## Coordination Notes

  [Any info about what other agents are building that this agent needs to know]

  ## Verification

  After implementing:
  1. Run `npx tsc --noEmit` to verify types
  2. Ensure code follows project conventions
  3. Test manually if applicable

  ## Report Back

  Provide:
  - Files created/modified
  - Summary of implementation
  - Any decisions made
  - Any concerns or TODOs for follow-up
```

## Phase 4: Consolidate Results

After all 5 agents complete:

1. **Collect all reports** from each agent
2. **Verify integration**:
   - Check that files don't conflict
   - Verify imports/exports work together
   - Run `npx tsc --noEmit` for full type check
3. **Run tests**: `npm test`
4. **Update TODO** (if implementing a section):
   - Mark completed tasks as [x] in `todo/tasks-phase0-travel-discovery.md`
5. **Create summary** for the user:
   - What was built
   - Files created/modified
   - Any issues encountered
   - Suggested next steps

## Phase 5: Journal Entry

After completing Phase 4, run the `/journal` command to document:
- Features implemented
- Key implementation decisions
- Any open items or follow-up needed
- Context for the next session

## Execution Checklist

- [ ] Development request understood
- [ ] PRD and TODO reviewed for context
- [ ] Work broken into 5 parallel workstreams
- [ ] All 5 agents launched in parallel (single message)
- [ ] All agent results collected
- [ ] Type check passed (`npx tsc --noEmit`)
- [ ] Tests passed (`npm test`)
- [ ] TODO updated (if applicable)
- [ ] Summary provided to user
- [ ] Journal entry created via /journal

## Tips for Effective Parallelization

1. **Schemas first**: If new types are needed, have one agent create them so others can import
2. **Clear file ownership**: Each agent should own specific files to avoid conflicts
3. **Interface contracts**: Define function signatures upfront so agents can code to interfaces
4. **Minimize dependencies**: Structure work so agents don't block each other
5. **Stage boundaries**: Align agent work with pipeline stage boundaries when possible
