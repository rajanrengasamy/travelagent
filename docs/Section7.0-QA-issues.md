# QA Report: Section 7.0 - Router Implementation (Stage 02)

**Generated**: 2026-01-08
**Reviewer**: qa-reviewer agent
**Status**: ISSUES_FOUND

## Executive Summary

- **Critical Issues**: 0
- **Major Issues**: 2
- **Minor Issues**: 4
- **Total Issues**: 6

The Router implementation is solid overall with proper PRD compliance for the core workflow. The 5-second timeout, fallback mechanism, and WorkerPlan structure all match PRD FR3 requirements. However, there are architectural concerns about unused code and some minor edge case handling improvements needed.

---

## Issues

### CRITICAL Issues

None.

---

### MAJOR Issues

#### MAJ-1: Unused planner.ts Functions - Dead Code

- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/router/planner.ts`
- **Dimension**: Architecture & Code Quality
- **Description**: The `planner.ts` module exports three functions (`selectWorkers`, `allocateBudgets`, `createValidationPlan`) that are never used in the actual router implementation. The `router.ts` relies entirely on the LLM response for worker selection and budget allocation, bypassing the planner logic. This creates dead code and potential confusion about the intended architecture.

  Looking at `router.ts`:
  - It calls `buildRouterPrompt` -> `callGoogleAIJson` -> validates with `WorkerPlanSchema`
  - It never imports or calls `selectWorkers`, `allocateBudgets`, or `createValidationPlan`

  The planner module implements sophisticated logic (interest-based worker selection, budget allocation with multipliers, validation plan creation) that is entirely bypassed.

- **Current Code**:
  ```typescript
  // router.ts only uses:
  import { buildRouterPrompt } from './prompts.js';
  import { getDefaultWorkerPlan } from './defaults.js';

  // Never imports from planner.ts despite the module existing
  ```

- **Recommended Fix**: Either:
  1. **Option A**: Remove `planner.ts` if LLM-based routing is the intended design (and update TODO tasks accordingly)
  2. **Option B**: Integrate `planner.ts` functions into the default fallback or as a hybrid approach where LLM failures use the planner logic instead of simple defaults
  3. **Option C**: Use `planner.ts` for pre-filtering available workers before LLM call, or for post-processing/validation of LLM responses

---

#### MAJ-2: Index Exports Inconsistent with Actual Usage

- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/router/index.ts`
- **Dimension**: Architecture & Code Quality
- **Description**: The index exports `selectWorkers`, `allocateBudgets`, and `createValidationPlan` from `planner.ts` as public API, but these are never used internally. This exposes unused functionality as public API, which could mislead consumers about the intended usage pattern.

- **Current Code**:
  ```typescript
  // index.ts line 21
  export { selectWorkers, allocateBudgets, createValidationPlan, type WorkerBudget } from './planner.js';
  ```

- **Recommended Fix**: Either remove these exports if they are dead code, or document clearly that these are alternative/fallback utilities. The public API should reflect actual usage patterns.

---

### MINOR Issues

#### MIN-1: Missing Null Check for Empty Destinations Array

- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/router/defaults.ts` (line 142)
- **Dimension**: Error Handling & Edge Cases
- **Description**: The function `getDefaultWorkerPlan` accesses `session.destinations[0]` without checking if the array is empty. While the Session schema requires at least one destination, defensive coding would handle this edge case.

- **Current Code**:
  ```typescript
  // Line 142
  const primaryDestination = session.destinations[0];
  ```

- **Recommended Fix**:
  ```typescript
  const primaryDestination = session.destinations[0] ?? 'destination';
  ```

---

#### MIN-2: Console.error Used Instead of Proper Logging

- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/router/router.ts` (lines 65, 69)
- **Dimension**: Architecture & Code Quality
- **Description**: The router uses `console.error` for logging instead of a structured logging system. This is inconsistent with best practices for a production pipeline and makes it harder to control log levels or integrate with monitoring systems.

- **Current Code**:
  ```typescript
  // Line 65
  console.error('Router response validation failed:', result.error.format());
  // Line 69
  console.error('Router LLM call failed:', error instanceof Error ? error.message : error);
  ```

- **Recommended Fix**: Introduce a logger utility (similar to the pattern in other pipeline stages) that can be configured for different log levels:
  ```typescript
  import { logger } from '../utils/logger.js';
  logger.warn('Router response validation failed', { error: result.error.format() });
  ```

---

#### MIN-3: Hardcoded Worker Capabilities Not Aligned with Registry

- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/router/prompts.ts` (lines 16-23)
- **Dimension**: Architecture & Code Quality
- **Description**: The `WORKER_CAPABILITIES` constant hardcodes worker descriptions that should ideally be sourced from a centralized worker registry. This creates duplication and potential drift if worker capabilities change.

- **Current Code**:
  ```typescript
  const WORKER_CAPABILITIES: Record<string, string> = {
    perplexity: 'Web knowledge worker - searches travel blogs...',
    places: 'Google Places API worker...',
    youtube: 'YouTube worker...',
  };
  ```

- **Recommended Fix**: When Section 8.0 (Worker Framework) is implemented, refactor to source capabilities from the worker registry:
  ```typescript
  // Future: import { getWorkerCapabilities } from '../workers/registry.js';
  ```

---

#### MIN-4: Query Generation Does Not Validate Empty Interest/Destination Edge Cases

- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/router/queries.ts` (line 222)
- **Dimension**: Error Handling & Edge Cases
- **Description**: While `buildQueryContext` handles empty destinations with `session.destinations[0] ?? ''`, passing an empty string to query generators could produce malformed queries like `" travel vlog"` or `"best  in"`.

- **Current Code**:
  ```typescript
  const destination = session.destinations[0] ?? '';
  ```

- **Recommended Fix**: Either throw an error or use a meaningful fallback:
  ```typescript
  const destination = session.destinations[0];
  if (!destination) {
    throw new Error('Cannot generate queries without destinations');
  }
  ```

---

## Files Reviewed

1. `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/router/prompts.ts` (168 lines)
2. `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/router/intent.ts` (626 lines)
3. `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/router/queries.ts` (564 lines)
4. `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/router/planner.ts` (299 lines)
5. `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/router/defaults.ts` (182 lines)
6. `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/router/router.ts` (73 lines)
7. `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/router/index.ts` (28 lines)
8. `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/router/router.test.ts` (659 lines)
9. `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/schemas/worker.ts` (supporting schema)
10. `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/enhancement/llm-client.ts` (supporting LLM client)
11. `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/config/models.ts` (supporting model config)

---

## PRD Compliance Summary

| Requirement | Status | Notes |
|-------------|--------|-------|
| RouterInput takes session and availableWorkers | PASS | `runRouter(session, availableWorkers)` signature matches PRD |
| 5-second timeout on LLM calls | PASS | `ROUTER_TIMEOUT_MS = 5000` correctly configured |
| Fall back to default plan on failure | PASS | Both LLM errors and validation errors trigger fallback |
| WorkerPlan structure matches PRD FR3 | PASS | Schema has enrichedIntent, workers, validationPlan |
| enrichedIntent includes inferredTags | PASS | Both LLM response and defaults include inferredTags |
| Generate worker-specific query formats | PARTIAL | Implemented but not used; LLM generates queries |
| Include constraint keywords in queries | PARTIAL | Implemented in queries.ts but bypassed by LLM approach |

---

## Verification Commands

After fixes, run:

```bash
# TypeScript compilation
npm run build

# Run router tests
npm test -- --testPathPattern=router

# Lint check
npm run lint
```

---

## Recommendations

1. **Clarify Architecture Intent**: The main decision needed is whether `planner.ts` should be integrated or removed. The current state has well-implemented planning logic that is never used.

2. **Add Integration Test**: Create an integration test that verifies the full router flow with a real (mocked) LLM response, not just unit tests of individual functions.

3. **Consider Hybrid Approach**: Use `selectWorkers` from planner.ts to pre-filter available workers before sending to LLM, reducing prompt size and improving consistency.

4. **Document Fallback Behavior**: Add JSDoc or README documentation explaining when fallback is triggered and what the default plan contains.
