# QA Report: Section 9.0 - Perplexity Web Knowledge Worker

**Generated**: 2026-01-10
**Reviewer**: qa-reviewer agent
**Status**: ISSUES_FOUND

## Executive Summary

- **Critical Issues**: 0
- **Major Issues**: 2
- **Minor Issues**: 4
- **Total Issues**: 6

Section 9.0 implements the Perplexity Web Knowledge Worker per PRD FR5.1. The implementation is generally well-structured with good documentation, proper token tracking, and comprehensive test coverage. However, there are some issues that should be addressed for production readiness.

---

## Issues

### MAJOR Issues

#### MAJ-1: System Prompt Not Used in API Calls
- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/workers/perplexity/worker.ts:219-224`
- **Dimension**: PRD Compliance
- **Description**: The `PERPLEXITY_SYSTEM_PROMPT` and `VALIDATION_SYSTEM_PROMPT` defined in `prompts.ts` are exported but never used in the actual worker execution. The worker only sends user messages without a system prompt. Per PRD Section 7.2 and best practices for LLM prompting, a system prompt should establish the context and behavior for consistent, high-quality responses.
- **Current Code**:
  ```typescript
  // worker.ts lines 219-224
  const prompt = buildSearchPrompt(query, context.enrichedIntent);
  const messages: Message[] = [{ role: 'user', content: prompt }];

  const response = await this.client.chat(messages, {
    timeoutMs: perQueryTimeout,
  });
  ```
- **Recommended Fix**: Add the system prompt to establish the travel expert context:
  ```typescript
  import { PERPLEXITY_SYSTEM_PROMPT } from './prompts.js';

  // In execute():
  const prompt = buildSearchPrompt(query, context.enrichedIntent);
  const messages: Message[] = [
    { role: 'system', content: PERPLEXITY_SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ];
  ```

---

#### MAJ-2: No Retry Logic in Worker Execution
- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/workers/perplexity/worker.ts:217-248`
- **Dimension**: Error Handling
- **Description**: The worker catches errors but does not implement retry logic with exponential backoff as specified in PRD Section 17.3.2. The PRD specifies: "Perplexity: 3 retries, 1000ms base, 8000ms max, +/-500ms jitter". While the client correctly identifies retryable errors via `isRetryable`, the worker does not actually retry failed requests.
- **Current Code**:
  ```typescript
  // worker.ts lines 244-248
  } catch (error) {
    // Log error but continue with other queries
    lastError = error instanceof Error ? error.message : String(error);
    // Continue to next query
  }
  ```
- **Recommended Fix**: Implement retry wrapper or use the error recovery module (Task 26.0) when available:
  ```typescript
  import { withRetry, RetryConfig } from '../../errors/retry.js';

  const PERPLEXITY_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    jitterMs: 500,
  };

  // In execute(), wrap API call:
  const response = await withRetry(
    () => this.client.chat(messages, { timeoutMs: perQueryTimeout }),
    PERPLEXITY_RETRY_CONFIG
  );
  ```
  Note: This depends on Task 26.0 (Error Recovery) which is not yet implemented. Document this dependency or implement inline retry.

---

### MINOR Issues

#### MIN-1: Candidate Metadata Always Empty Object
- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/workers/perplexity/parser.ts:94`
- **Dimension**: Architecture
- **Description**: The parser always sets `metadata: {}` for all candidates. While technically valid per the schema (metadata is optional), this creates inconsistent data. For web-derived candidates, metadata could include useful information like the Perplexity response model, or be explicitly undefined.
- **Current Code**:
  ```typescript
  metadata: {},
  ```
- **Recommended Fix**: Either remove the metadata field entirely (let it be undefined) or populate with relevant data:
  ```typescript
  // Option 1: Remove (cleaner)
  // Delete the line: metadata: {},

  // Option 2: Add useful metadata
  metadata: {
    perplexityModel: response.model,
  },
  ```

---

#### MIN-2: Missing Circuit Breaker Integration
- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/workers/perplexity/worker.ts:199-294`
- **Dimension**: Error Handling
- **Description**: The `WorkerContext` includes a `circuitBreaker` field, but the worker never checks if the circuit is open before making API calls, nor does it record successes/failures. This could lead to wasted time on a failing Perplexity API.
- **Current Code**:
  ```typescript
  // WorkerContext has circuitBreaker but it's never used in execute()
  async execute(assignment: WorkerAssignment, context: WorkerContext): Promise<WorkerOutput> {
    // No circuit breaker check or recording
  }
  ```
- **Recommended Fix**: Integrate circuit breaker checks:
  ```typescript
  async execute(assignment: WorkerAssignment, context: WorkerContext): Promise<WorkerOutput> {
    const startTime = Date.now();

    // Check circuit breaker before execution
    if (context.circuitBreaker.isOpen(this.provider)) {
      return {
        workerId: this.id,
        status: 'skipped',
        candidates: [],
        error: 'Circuit breaker open - provider temporarily disabled',
        durationMs: Date.now() - startTime,
      };
    }

    // ... existing logic ...

    // After successful query:
    context.circuitBreaker.recordSuccess(this.provider);

    // On failure:
    context.circuitBreaker.recordFailure(this.provider);
  }
  ```

---

#### MIN-3: Test Coverage Gap for Worker Integration
- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/workers/perplexity/perplexity.test.ts`
- **Dimension**: Architecture
- **Description**: While unit tests are comprehensive for client, parser, and prompts, there are no tests for the `PerplexityWorker` class itself (`plan()` and `execute()` methods). The test file has fixtures like `createMockContext()` prepared but no actual worker execution tests.
- **Current Code**:
  ```typescript
  // perplexity.test.ts - createMockContext exists but worker tests are missing
  // The comment on line 138-140 notes:
  /**
   * Create a mock worker context for testing
   * Note: Will be used when PerplexityWorker is implemented
   */
  ```
- **Recommended Fix**: Add worker tests covering:
  - `plan()` method generates correct queries
  - `execute()` handles successful responses
  - `execute()` handles partial failures
  - `execute()` handles complete failures
  - Deduplication works correctly
  - Cost tracker is called appropriately

---

#### MIN-4: Inconsistent Prompt Format Request
- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/workers/perplexity/prompts.ts:89-94`
- **Dimension**: Architecture
- **Description**: The `buildSearchPrompt` function requests a specific output format with fields like `**Name:**`, `**Type:**`, etc., but the parser does not specifically handle this format. The parser uses general regex patterns that work with numbered lists and bold names but do not specifically expect the prompted format. This disconnect could lead to suboptimal parsing.
- **Current Code**:
  ```typescript
  // prompts.ts requests:
  Format each recommendation clearly with these fields:
  **Name:** [place name]
  **Type:** [one of: restaurant, attraction, activity, neighborhood, day trip, experience]
  **Description:** [2-3 sentences]
  **Location:** [neighborhood or area]
  **Why recommended:** [relevance to interests]

  // But parser.ts looks for:
  const numberedBoldPattern = /^\s*\d+\.\s*\*\*([^*]+)\*\*\s*[-:–]\s*(.+?)$/gm;
  ```
- **Recommended Fix**: Either:
  1. Align the prompt format with what the parser expects (numbered lists with bold names)
  2. Add a parser pattern that matches the requested format
  3. Use structured output (JSON mode) if Perplexity supports it

---

## Files Reviewed

- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/workers/perplexity/client.ts` (369 lines)
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/workers/perplexity/parser.ts` (519 lines)
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/workers/perplexity/worker.ts` (324 lines)
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/workers/perplexity/prompts.ts` (251 lines)
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/workers/perplexity/index.ts` (72 lines)
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/workers/perplexity/perplexity.test.ts` (1042 lines)
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/workers/types.ts` (281 lines)
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/schemas/worker.ts` (197 lines)
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/schemas/candidate.ts` (102 lines)
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/schemas/common.ts` (160 lines)
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/config/index.ts` (127 lines)

---

## PRD Compliance Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| FR5.1: Uses Perplexity Sonar API | PASS | Uses `sonar-pro` model correctly |
| FR5.1: API endpoint `POST /chat/completions` | PASS | Correct URL in client.ts |
| FR5.1: Generates grounded answers with citations | PASS | Citations extracted from API response |
| FR5.1: Extracts discrete Candidates | PASS | Parser extracts recommendations as Candidates |
| FR5.1: Output with `origin = 'web'` | PASS | All candidates set with `origin: 'web'` |
| FR5.1: Track token usage (input/output) | PASS | Token tracking in client and worker |
| FR5.1: Handle rate limiting | PARTIAL | Error identified but no retry logic |
| FR5.1: Handle errors | PARTIAL | Errors caught but no circuit breaker integration |
| Section 17.3.2: Retry with backoff | FAIL | No retry implementation |
| Section 17.3.3: Circuit breaker | FAIL | Not integrated despite context availability |

---

## Verification Commands

After fixes, run:
```bash
# TypeScript compilation
npm run build

# Run Perplexity worker tests
npx jest src/workers/perplexity/perplexity.test.ts

# Run all worker tests
npx jest src/workers --testPathPattern="\.test\.ts$"

# Type check without emit
npx tsc --noEmit
```

---

## Positive Observations

1. **Excellent Documentation**: All files have comprehensive JSDoc comments explaining purpose, behavior, and PRD references.

2. **Strong Type Safety**: Proper TypeScript types throughout, Zod schemas for validation, no use of `any` type.

3. **Comprehensive Test Coverage**: The test file covers client, parser, and prompts thoroughly with 1000+ lines of tests.

4. **Good Error Categorization**: The client correctly distinguishes between retryable and non-retryable errors.

5. **Clean Architecture**: Clear separation between client (API layer), parser (transformation), worker (orchestration), and prompts (templates).

6. **Proper Token Tracking**: Token usage is tracked and propagated to cost tracker correctly.

7. **Defensive Coding**: Handles empty responses, missing citations, malformed data gracefully.
