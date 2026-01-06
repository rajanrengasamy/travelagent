# QA Fix Tracker

**Generated:** 2026-01-04
**Section Reviewed:** 2.0 - Schema Definitions & Versioning System

## Issues Summary

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | 0 | 0 | 0 |
| Major | 3 | 3 | 0 |
| Minor | 4 | 3 | 1* |

*MIN-2 was a documentation note requiring no action (implementation was correct).

## Fix Details

| Issue ID | Agent | Status | Files Modified | Notes |
|----------|-------|--------|----------------|-------|
| MAJ-1 | Agent 1 | Fixed | run-config.ts | Added `enhancement` to ModelsConfigSchema, added DEFAULT_MODELS |
| MAJ-2 | Agent 2 | Fixed | run-config.ts | Added `enhancement` to PromptVersionsSchema, added DEFAULT_PROMPT_VERSIONS |
| MAJ-3 | Agent 2 | Fixed | run-config.ts | Added `skipEnhancement` to FlagsConfigSchema and DEFAULT_FLAGS |
| MIN-1 | Agent 3 | Fixed | session.ts | Added JSDoc documentation explaining `.default(1)` design decision |
| MIN-2 | N/A | No Action | N/A | Implementation was already correct (matched Appendix A) |
| MIN-3 | Agent 4 | Fixed | migrations/index.ts | Wrapped errors with file path context, added ES2022 `cause` chaining |
| MIN-4 | Agent 5 | Fixed | enhancement.ts | Removed redundant `.refine()` from clarifyingQuestions |

## Verification Results

| Check | Status |
|-------|--------|
| TypeScript Build (`npm run build`) | PASSED |
| Unit Tests (`npm test`) | PASSED (390 tests) |
| PRD Compliance | FULL (all 25 schemas now compliant) |

## Changes Summary

### run-config.ts

```typescript
// ModelsConfigSchema - Added enhancement field
export const ModelsConfigSchema = z.object({
  enhancement: z.string().min(1),  // NEW
  router: z.string().min(1),
  normalizer: z.string().min(1),
  aggregator: z.string().min(1),
  validator: z.string().min(1),
});

// PromptVersionsSchema - Added enhancement field
export const PromptVersionsSchema = z.object({
  enhancement: z.string().min(1),  // NEW
  router: z.string().min(1),
  aggregator: z.string().min(1),
  youtubeExtraction: z.string().min(1),
  validation: z.string().min(1),
});

// FlagsConfigSchema - Added skipEnhancement flag
export const FlagsConfigSchema = z.object({
  skipEnhancement: z.boolean(),  // NEW
  skipValidation: z.boolean(),
  skipYoutube: z.boolean(),
});

// New DEFAULT_MODELS constant
export const DEFAULT_MODELS: ModelsConfig = {
  enhancement: 'gemini-3-flash-preview',
  router: 'gemini-3-flash-preview',
  normalizer: 'gemini-3-flash-preview',
  aggregator: 'gemini-3-flash-preview',
  validator: 'gemini-3-flash-preview',
};

// Updated DEFAULT_FLAGS
export const DEFAULT_FLAGS: FlagsConfig = {
  skipEnhancement: false,  // NEW
  skipValidation: false,
  skipYoutube: false,
};

// New DEFAULT_PROMPT_VERSIONS constant
export const DEFAULT_PROMPT_VERSIONS: PromptVersions = {
  enhancement: 'v1.0.0',
  router: 'v1.0.0',
  aggregator: 'v1.0.0',
  youtubeExtraction: 'v1.0.0',
  validation: 'v1.0.0',
};
```

### session.ts

Added comprehensive JSDoc documentation explaining the schema versioning design pattern:
- Default is applied during new session creation (input parsing)
- Persisted data loading is handled by migration framework independently
- Pattern is consistent across all versioned schemas in the project

### migrations/index.ts

```typescript
// loadMigrateAndSave - Added error context
} catch (error) {
  try {
    await fs.unlink(tempPath);
  } catch {
    // Ignore cleanup errors
  }
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`Migration failed for ${filePath}: ${message}`, {
    cause: error,
  });
}

// atomicWriteJson - Added error context
} catch (error) {
  try {
    await fs.unlink(tempPath);
  } catch {
    // Ignore cleanup errors
  }
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`Atomic write failed for ${filePath}: ${message}`, {
    cause: error,
  });
}
```

### enhancement.ts

```typescript
// Removed redundant .refine() - was:
clarifyingQuestions: z
  .array(z.string())
  .min(2)
  .max(4)
  .optional()
  .refine(/* redundant check */),

// Now simplified to:
clarifyingQuestions: z.array(z.string()).min(2).max(4).optional(),
```

## Recommendations Completed

1. **MAJ-1, MAJ-2, MAJ-3 fixed** - RunConfig now fully compliant with PRD Section 11.5
2. **Error context improved** - Migration framework now provides file path context in error messages
3. **Code simplified** - Removed redundant validation logic
4. **Documentation added** - Schema versioning design decision is now documented

## Next Steps

1. Consider adding integration tests for schema migration (version upgrades)
2. Consider creating SCHEMA_CHANGES.md to document schema evolution strategy
3. Section 2.0 is now complete and fully PRD-compliant

---

# Section 3.0 - Storage Layer Implementation

**Generated:** 2026-01-06
**Section Reviewed:** 3.0 (Storage Layer Implementation)

## Issues Summary (Section 3.0)

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | 0 | 0 | 0 |
| Major | 3 | 3 | 0 |
| Minor | 5 | 4 | 1* |

*MIN-5 (Documentation) was already addressed in the QA report - no action needed.

## Fix Details (Section 3.0)

| Issue ID | Agent | Status | Files Modified | Notes |
|----------|-------|--------|----------------|-------|
| MAJ-1 | Agent 1 | Fixed | `paths.ts`, `paths.test.ts` | Path traversal validation - 19 new tests |
| MAJ-2 | Agent 3 | Fixed | `stages.ts`, `stages.test.ts` | Optional schema validation for loadStageFile - 3 new tests |
| MAJ-3 | Agent 2 | Fixed | `runs.ts`, `runs.test.ts` | Symlink target validation - 2 new tests |
| MIN-1 | Agent 4 | Fixed | `stages.ts`, `stages.test.ts` | stageId format validation - 4 new tests |
| MIN-2 | Agent 5 | Fixed | `sessions.ts`, `runs.ts`, `stages.ts` + tests | Consistent error messages with file paths |
| MIN-3 | Agent 5 | Fixed | `migrations/index.ts` | Documentation for orphaned temp files |
| MIN-4 | Agent 5 | Fixed | `sessions.ts` | console.warn for failed session loads |
| MIN-5 | N/A | N/A | N/A | Already addressed - no action needed |

## Detailed Changes (Section 3.0)

### MAJ-1: Path Traversal Validation (Security)

Added `validateIdSecurity()` helper function in `paths.ts` that:
- Rejects IDs containing `..` (parent directory traversal)
- Rejects IDs containing `/` or `\` (path separators)
- Applied to `getSessionDir()`, `getRunDir()`, `getStageFilePath()`, and `getLatestRunSymlink()`
- 19 new tests verify path traversal prevention

### MAJ-2: Schema Validation for loadStageFile (PRD Compliance)

Updated `loadStageFile<T>()` with optional schema parameter:
```typescript
loadStageFile<T>(sessionId, runId, stageId, schema?: ZodSchema<T>): Promise<T>
```
- When schema provided: validates parsed JSON with `schema.parse()`
- Without schema: maintains backward compatibility (`data as T`)
- 3 new tests verify schema validation behavior

### MAJ-3: Symlink Target Validation (Error Handling)

Added validation in `updateLatestSymlink()`:
- Verifies target run directory exists with `fs.stat()`
- Verifies target is a directory (not a file)
- Throws descriptive error if target missing or invalid
- 2 new tests verify edge case handling

### MIN-1: stageId Format Validation (Type Safety)

Added validation in `saveStageFile()`:
```typescript
if (!STAGE_ID_PATTERN.test(stageId)) {
  throw new Error(`Invalid stageId format: ${stageId}...`);
}
```
- Uses existing `STAGE_ID_PATTERN` regex
- 4 new tests verify format validation

### MIN-2: Consistent Error Messages (Architecture)

Standardized error messages to include file paths:
- `Session not found: ${sessionId} (path: ${filePath})`
- `Run not found: ${runId} in session ${sessionId} (path: ${filePath})`
- `Stage file not found: ${stageId} in run ${runId} (path: ${filePath})`

### MIN-3: Temp File Documentation (Error Handling)

Added JSDoc note to `atomicWriteJson()` about potential orphaned temp files after process crashes.

### MIN-4: Session Load Warning (Error Handling)

Added `console.warn()` in `listSessions()` to log warnings when individual sessions fail to load, aiding debugging without breaking the listing.

## Verification Results (Section 3.0)

| Check | Status |
|-------|--------|
| TypeScript Build (`npm run build`) | PASSED |
| All Tests (`npm test`) | PASSED (541 tests) |

## Test Coverage Added

- **paths.test.ts**: +19 new tests (path traversal prevention)
- **runs.test.ts**: +2 new tests, -1 old test (symlink validation)
- **stages.test.ts**: +7 new tests (schema validation + stageId validation)
- **sessions.test.ts**: Tests updated for new error format
