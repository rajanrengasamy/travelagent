---
description: Run a deep QA review on a specific section of the TODO list against the PRD and codebase (Codex workflow).
argument-hint: <section_number>
---

You are a **QA Orchestrator** for the Travel Discovery Orchestrator CLI project. Run a complete QA cycle for the requested section using a **single-agent Codex workflow**.

**Usage:** `@qa.md 2.0` runs QA for Section 2.0 in the task list.

## Arguments

- Section Number: $ARGUMENTS

## Project Files

- **PRD**: `docs/phase_0_prd_unified.md`
- **TODO**: `todo/tasks-phase0-travel-discovery.md`
- **QA Reports**: `docs/Section{N}-QA-issues.CODEX.md`
- **Fix Tracker**: `docs/QA-Fix-Tracker.md`

---

## Phase 1: Context Gathering

1. Read `todo/tasks-phase0-travel-discovery.md` and extract all tasks from **Section $ARGUMENTS**
2. Read `docs/phase_0_prd_unified.md` to understand the product requirements for this section
3. Identify all source files associated with Section $ARGUMENTS (use `rg` to find them)
4. Create a summary of:
   - What the section is supposed to implement
   - Which files contain the implementation
   - Key requirements from the PRD

---

## Phase 2: QA Review (Single-Agent)

Perform a 5-dimension QA review against the PRD and TODO:

1. **PRD Compliance**
2. **Error Handling**
3. **Type Safety**
4. **Architecture**
5. **Security**

Create `docs/Section$ARGUMENTS-QA-issues.CODEX.md` with your findings using this format:

```markdown
# Section $ARGUMENTS QA Issues

**Status:** PASS | FAIL

## Summary
- [Brief summary of what was reviewed]

## Issues
### CRITICAL
- [Issue ID] File: path:line - Description - Recommended Fix

### MAJOR
- [Issue ID] File: path:line - Description - Recommended Fix

### MINOR
- [Issue ID] File: path:line - Description - Recommended Fix
```

If no issues are found, set **Status: PASS** and leave issue lists empty.

---

## Phase 3: Parse and Prioritize

1. Read `docs/Section$ARGUMENTS-QA-issues.CODEX.md`
2. If **Status: PASS**, skip to Phase 5
3. If issues found, create a consolidated list by severity:
   - **CRITICAL**: Must fix immediately
   - **MAJOR**: Should fix
   - **MINOR**: Nice to have
4. For each issue, include:
   - Issue ID (CRIT-1, MAJ-1, MIN-1, etc.)
   - File location
   - Description
   - Recommended fix

---

## Phase 4: Fix Issues (Single-Agent)

1. Fix issues in severity order (CRITICAL, then MAJOR, then MINOR)
2. For each fix:
   - Read the file(s) mentioned in the issue
   - Implement the recommended fix (or a better alternative)
   - Keep changes minimal and aligned with existing patterns
   - Add JSDoc comments for new functions
   - Use Zod schemas for validation where appropriate
3. Run checks after fixing (as applicable):
   - `npm run build`
   - `npm test`

---

## Phase 5: Consolidate Results

Update or create `docs/QA-Fix-Tracker.md`:

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

| Issue ID | Status | Files Modified | Notes |
|----------|--------|----------------|-------|
| CRIT-1 | Fixed | file.ts | ... |
```

---

## Phase 6: Final Verification

Run final verification:
- `npm run build`
- `npm test`

Report build/test status in the user-facing summary.

---

## Execution Checklist

- [ ] Context gathered (section tasks identified, files listed)
- [ ] QA review completed and report created
- [ ] QA report parsed (or "PASS" confirmed)
- [ ] Issues fixed (if applicable)
- [ ] Fix tracker updated with results
- [ ] Type check passed
- [ ] Tests passed (or noted as not applicable)
- [ ] Summary provided to user
