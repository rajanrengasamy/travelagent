# Project Journal

This file maintains session history for continuity across Claude Code sessions.
Use alongside `todo/tasks-phase0-travel-discovery.md` (task list) and `docs/phase_0_prd_unified.md` (PRD) when starting new sessions.

> Note: Entries are also stored in VectorDB for semantic retrieval via `/startagain`.

---

## Session: 2026-01-02 21:41 AEST

### Summary
Completed Phase 0.0 Context Persistence Infrastructure by fixing test mocks, creating integration tests, running initial seeding, and initializing the git repository with push to GitHub.

### Work Completed
- Fixed ESM module mocking in `prd.test.ts` and `todo.test.ts` (changed `jest.mock()` to `jest.unstable_mockModule()`)
- Fixed mock lifecycle issue in `retrieval.test.ts` and `storage.test.ts` (changed `resetAllMocks` to `clearAllMocks`)
- Created comprehensive integration tests in `tests/context/integration.test.ts` (15 tests)
- Fixed seeding script: added `dotenv/config` import and database initialization
- Ran initial seeding: 36 PRD sections, 1 TODO snapshot indexed
- Initialized git repository with proper `.gitignore`
- Pushed to GitHub: https://github.com/rajanrengasamy/travelagent

### Issues & Resolutions
| Issue | Resolution | Status |
|:------|:-----------|:-------|
| `jest.mock('fs/promises')` not working with ESM | Used `jest.unstable_mockModule()` with dynamic imports | Resolved |
| Mock implementations destroyed between tests | Changed `jest.resetAllMocks()` to `jest.clearAllMocks()` | Resolved |
| Seeding failed - missing OPENAI_API_KEY | Added `import 'dotenv/config'` to seed.ts | Resolved |
| Seeding failed - collections not initialized | Added `connectToDb()` and `initializeCollections()` to seedAll() | Resolved |
| Git SSH authentication failed | Switched to HTTPS remote URL | Resolved |

### Key Decisions
- Use `jest.unstable_mockModule()` pattern for all ESM module mocking in this project
- Use `jest.clearAllMocks()` instead of `resetAllMocks()` when mock implementations are defined at module level
- Work directly on `main` branch instead of feature branch (removed Task 0.0)

### Learnings
- ESM requires dynamic imports (`await import()`) after mocking for the mocks to take effect
- `jest.resetAllMocks()` removes both call history AND mock implementations, while `clearAllMocks()` only clears call history
- LanceDB vector database must be connected and collections initialized before any storage operations

### Open Items / Blockers
- [ ] Phase 0 Task 1.0: Project Foundation & Configuration (next major task)
- [ ] Consider adding SSH key setup for future git operations

### Context for Next Session
Phase 0.0 Context Persistence Infrastructure is complete with 281 tests passing. The VectorDB is seeded with PRD sections and TODO state. Next steps are Task 1.0 (Project Foundation & Configuration), though many foundational items are already in place from the context persistence work. Review task list to identify which 1.x subtasks are already complete.

---
