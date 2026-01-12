# QA Report: Section 12.0 - Normalization Stage (Stage 04)

**Generated**: 2026-01-11
**Reviewer**: qa-reviewer agent
**Status**: ISSUES_FOUND

## Executive Summary

- **Critical Issues**: 1
- **Major Issues**: 3
- **Minor Issues**: 3
- **Total Issues**: 7

The Normalization Stage implementation is generally well-structured with good separation of concerns, comprehensive test coverage, and proper error handling patterns. However, there are several issues that need attention, including a critical disconnect between the main normalize.ts implementation and the dedicated id-generator.ts module.

---

## Issues

### CRITICAL Issues

#### CRIT-1: Stable ID Generator Not Used - Uses Random UUIDs Instead

- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/stages/normalize.ts:85-88`
- **Dimension**: PRD Compliance
- **Description**: The main `normalize.ts` file contains a placeholder `generateCandidateId` function that uses random UUIDs (`randomUUID().slice(0, 12)`), while a fully-implemented stable ID generator exists in `src/stages/normalize/id-generator.ts` that generates deterministic SHA-256 based IDs. The PRD Section 12.3.1 requires "Generate stable IDs based on title + location hash" and Section 14 specifies that candidates should get stable IDs based on content hash for deduplication and triage persistence across runs.

- **Current Code**:
  ```typescript
  // src/stages/normalize.ts lines 85-88
  function generateCandidateId(_candidate: Partial<Candidate>): string {
    // Placeholder: Use random UUID
    // Agent 2 will implement stable hash: hash(title + location)
    return `cand_${randomUUID().slice(0, 12)}`;
  }
  ```

- **Expected Behavior**: The normalization stage should use the stable ID generator from `id-generator.ts` which produces deterministic IDs like `web-a1b2c3d4` based on SHA-256 hash of `title|location`.

- **Recommended Fix**:
  1. Remove the placeholder `generateCandidateId` function from `normalize.ts`
  2. Import and use `generateCandidateId` from `./normalize/id-generator.js`
  3. Update the per-worker normalizers to call the stable ID generator with proper parameters
  4. Call `ensureUniqueIds` after all candidates are collected to handle collisions

---

### MAJOR Issues

#### MAJ-1: Checkpoint Writing Not Invoked by Main Stage

- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/stages/normalize.ts`
- **Dimension**: PRD Compliance
- **Description**: Task 12.4 requires writing checkpoint to `04_candidates_normalized.json`. While the checkpoint module (`checkpoint.ts`) is implemented with `writeNormalizeCheckpoint`, the main `normalizeStage.execute()` function does not call this checkpoint writer. The stage returns a `StageResult` but relies on external code to write the checkpoint.

- **Current Code**:
  ```typescript
  // normalize.ts execute() returns StageResult but doesn't write checkpoint
  return {
    data: candidates,
    metadata,
    timing: { ... },
  };
  // No call to writeNormalizeCheckpoint
  ```

- **Recommended Fix**: Either:
  1. Have the stage call `writeNormalizeCheckpoint()` before returning, OR
  2. Ensure the pipeline executor handles checkpoint writing (verify this is the case)
  3. Document the expected contract clearly

---

#### MAJ-2: Normalizers in normalize.ts Duplicate normalizers.ts with Different Logic

- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/stages/normalize.ts:102-191`
- **Dimension**: Architecture (DRY Violation)
- **Description**: The main `normalize.ts` file contains inline normalizer functions (`normalizePerplexityOutput`, `normalizePlacesOutput`, `normalizeYouTubeOutput`) that duplicate the more sophisticated implementations in `src/stages/normalize/normalizers.ts`. The inline versions have simpler logic (e.g., no score calculation, simpler confidence assignment) creating confusion about which implementation is authoritative.

- **Current Code (normalize.ts)**:
  ```typescript
  function normalizePerplexityOutput(output: WorkerOutput): Candidate[] {
    // ...
    confidence: candidate.confidence || 'provisional', // Simple default
    // ...
  }
  ```

- **Current Code (normalizers.ts)**:
  ```typescript
  function normalizePerplexityOutput(output: WorkerOutput): Candidate[] {
    // ...
    confidence: determinePerplexityConfidence(candidate), // Source-count based
    score: candidate.score ?? 50, // Default score
    // ...
  }
  ```

- **Recommended Fix**:
  1. Remove the inline normalizers from `normalize.ts`
  2. Import and use `getNormalizerForWorker` from `./normalize/normalizers.js`
  3. Use a single source of truth for normalization logic

---

#### MAJ-3: Missing Integration Between checkpoint.ts WorkerStats and Stage Execution

- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/stages/normalize/checkpoint.ts:22-29`
- **Dimension**: Architecture
- **Description**: The `writeNormalizeCheckpoint` function expects a `WorkerStats[]` parameter, but the main stage execution doesn't produce this format. The stage tracks `WorkerNormalizationResult[]` which has different field names (`success` vs implied error), creating an impedance mismatch.

- **Current Code (checkpoint.ts)**:
  ```typescript
  export interface WorkerStats {
    workerId: string;
    count: number;
    error?: string;
  }
  ```

- **Current Code (normalize.ts)**:
  ```typescript
  interface WorkerNormalizationResult {
    workerId: string;
    candidates: Candidate[];
    success: boolean;
    error?: string;
    durationMs: number;
  }
  ```

- **Recommended Fix**: Create a conversion function or align the types to ensure the checkpoint writer can receive data from the stage execution result.

---

### MINOR Issues

#### MIN-1: YouTube Confidence Should Be 'needs_verification' per PRD

- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/stages/normalize/normalizers.ts:184`
- **Dimension**: PRD Compliance
- **Description**: The PRD Section FR5.3 states YouTube candidates should have `confidence = 'provisional'` until validated. However, the inline normalizer in `normalize.ts:157` uses `'needs_verification'` while `normalizers.ts:184` uses `'provisional'`. The PRD in Section FR6 implies YouTube-derived candidates should start as needing verification. This inconsistency should be resolved.

- **Current Code (normalize.ts:157)**:
  ```typescript
  confidence: candidate.confidence || 'needs_verification',
  ```

- **Current Code (normalizers.ts:184)**:
  ```typescript
  confidence: 'provisional' as CandidateConfidence,
  ```

- **Recommended Fix**: Standardize on `'provisional'` per PRD FR5.3, which indicates the candidate needs validation but has some initial credibility from the video content.

---

#### MIN-2: Generic Normalizer Uses console.warn Instead of Logger

- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/stages/normalize/normalizers.ts:286-289`
- **Dimension**: Architecture
- **Description**: The generic normalizer for unknown workers uses `console.warn` directly instead of the logger interface. This bypasses the structured logging system used elsewhere in the codebase.

- **Current Code**:
  ```typescript
  console.warn(
    `[normalize] Using generic normalizer for unknown worker: ${workerId}. ` +
      `Consider adding a specialized normalizer.`
  );
  ```

- **Recommended Fix**: Either accept a logger parameter in `getNormalizerForWorker` or log at the call site in the main normalize stage where the logger is available.

---

#### MIN-3: Test File References Wrong PRD Section

- **File**: `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/stages/normalize.test.ts:11`
- **Dimension**: Documentation
- **Description**: The test file comment references "PRD Section 12.0 - Normalization Stage" but the PRD Section 12 is actually "Data Model". The normalization requirements are in PRD Section 14 (FR2 Stage 04) and TODO Section 12.0.

- **Current Code**:
  ```typescript
  * @see PRD Section 12.0 - Normalization Stage
  ```

- **Recommended Fix**: Update to reference the correct PRD sections (FR2 Stage 04, Section 14 for ranking/normalization).

---

## Files Reviewed

- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/stages/normalize.ts` - Main stage implementation
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/stages/normalize/id-generator.ts` - Stable ID generation
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/stages/normalize/normalizers.ts` - Per-worker normalizers
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/stages/normalize/checkpoint.ts` - Checkpoint writing
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/stages/normalize/index.ts` - Module exports
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/stages/index.ts` - Stages exports
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/stages/normalize.test.ts` - Test file
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/schemas/candidate.ts` - Candidate schema
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/schemas/worker.ts` - Worker output schema
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/pipeline/types.ts` - Pipeline types
- `/Users/rajan/Library/CloudStorage/Dropbox/Projects/travelagent/src/pipeline/checkpoint.ts` - Checkpoint infrastructure

---

## Verification Commands

After fixes, run:

```bash
# TypeScript compilation
npm run build

# Run normalization tests
npm test -- --testPathPattern=normalize

# Run all tests to check for regressions
npm test

# Lint check
npm run lint
```

---

## Positive Observations

1. **Comprehensive Test Coverage**: The test file (`normalize.test.ts`) is thorough with 1017 lines covering ID generation, normalizers, stage execution, timeout handling, and integration scenarios.

2. **Good Error Handling**: The timeout wrapper (`withNormalizationTimeout`) properly handles cleanup and graceful degradation.

3. **Type Safety**: Strong TypeScript typing throughout with proper use of `TypedStage<WorkerOutput[], Candidate[]>` interface.

4. **Parallel Processing**: Correctly uses `Promise.allSettled` for parallel worker processing with failure isolation.

5. **Zod Validation**: Candidates are validated against `CandidateSchema` before being returned, catching invalid data early.

6. **Well-Documented Code**: Good JSDoc comments explaining purpose, parameters, and examples for most functions.

---

## Recommendations for Fix Priority

1. **CRIT-1**: Fix immediately - stable IDs are essential for deduplication and triage persistence
2. **MAJ-2**: Fix with CRIT-1 - removes code duplication and uses the correct normalizer implementations
3. **MAJ-1**: Verify if checkpoint writing is handled by pipeline executor, document if so
4. **MAJ-3**: Fix when integrating checkpoint writing with stage execution
5. **MIN-***: Can be addressed as part of cleanup after major issues are resolved
