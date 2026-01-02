## Relevant Files

### Core Configuration
- `src/config/index.ts` - Global configuration, environment variables, model settings
- `src/config/models.ts` - Model configuration per task (enhancement, router, aggregator, etc.)
- `src/config/costs.ts` - Token cost constants per provider
- `.env.example` - Example environment variables file
- `tsconfig.json` - TypeScript configuration with strict mode
- `package.json` - Project dependencies and scripts

### Schemas
- `src/schemas/versions.ts` - Schema version registry
- `src/schemas/common.ts` - Shared types (Flexibility, SourceRef, etc.)
- `src/schemas/session.ts` - Session schema with Zod validation
- `src/schemas/candidate.ts` - Candidate schema with all type variants
- `src/schemas/triage.ts` - Triage status and entry schemas
- `src/schemas/discovery-results.ts` - DiscoveryResults schema
- `src/schemas/cost.ts` - CostBreakdown schema
- `src/schemas/stage.ts` - StageMetadata schema
- `src/schemas/run-config.ts` - RunConfig schema
- `src/schemas/manifest.ts` - RunManifest schema
- `src/schemas/enhancement.ts` - EnhancementResult and PromptAnalysis schemas
- `src/schemas/worker.ts` - WorkerPlan, WorkerOutput schemas
- `src/schemas/index.ts` - Schema exports
- `src/schemas/migrations/index.ts` - Migration framework

### Storage Layer
- `src/storage/index.ts` - Storage layer exports
- `src/storage/paths.ts` - Path resolution utilities
- `src/storage/atomic.ts` - Atomic write implementation
- `src/storage/sessions.ts` - Session CRUD operations
- `src/storage/runs.ts` - Run storage operations
- `src/storage/stages.ts` - Stage file storage
- `src/storage/triage.ts` - Triage persistence
- `src/storage/config.ts` - Global config storage

### Pipeline Infrastructure
- `src/pipeline/index.ts` - Pipeline exports
- `src/pipeline/types.ts` - Stage interface definitions
- `src/pipeline/executor.ts` - Stage executor framework
- `src/pipeline/checkpoint.ts` - Checkpoint writing with metadata
- `src/pipeline/resume.ts` - Resume-from-stage logic
- `src/pipeline/manifest.ts` - Manifest generation with SHA-256
- `src/pipeline/dependencies.ts` - Stage dependency map

### Session Management
- `src/sessions/index.ts` - Session management exports
- `src/sessions/id-generator.ts` - Session ID and slug generation
- `src/sessions/create.ts` - Session creation logic
- `src/sessions/list.ts` - Session listing
- `src/sessions/view.ts` - Session viewing
- `src/sessions/archive.ts` - Session archiving

### Prompt Enhancement (Stage 00)
- `src/enhancement/index.ts` - Enhancement exports
- `src/enhancement/enhancer.ts` - Main enhancement logic
- `src/enhancement/analyzer.ts` - 5-dimension prompt analysis
- `src/enhancement/questions.ts` - Clarifying question generation
- `src/enhancement/refinement.ts` - Refinement suggestion generation
- `src/enhancement/extractor.ts` - Parameter extraction
- `src/enhancement/prompts.ts` - Enhancement prompt templates

### Router (Stage 02)
- `src/router/index.ts` - Router exports
- `src/router/router.ts` - Main router logic
- `src/router/intent.ts` - Intent enrichment
- `src/router/queries.ts` - Query variant generation
- `src/router/planner.ts` - Worker selection and budget allocation
- `src/router/prompts.ts` - Router prompt templates
- `src/router/defaults.ts` - Default WorkerPlan fallback

### Worker Framework
- `src/workers/index.ts` - Worker exports
- `src/workers/types.ts` - Worker interface definitions
- `src/workers/registry.ts` - Worker registry
- `src/workers/executor.ts` - Worker execution with Promise.allSettled
- `src/workers/concurrency.ts` - Concurrency limiting

### Perplexity Worker
- `src/workers/perplexity/index.ts` - Perplexity worker exports
- `src/workers/perplexity/client.ts` - Perplexity API client
- `src/workers/perplexity/worker.ts` - Worker implementation
- `src/workers/perplexity/parser.ts` - Response parsing and candidate extraction

### Google Places Worker
- `src/workers/places/index.ts` - Places worker exports
- `src/workers/places/client.ts` - Google Places API client
- `src/workers/places/worker.ts` - Worker implementation
- `src/workers/places/mapper.ts` - Place to Candidate mapping

### YouTube Worker
- `src/workers/youtube/index.ts` - YouTube worker exports
- `src/workers/youtube/client.ts` - YouTube Data API client
- `src/workers/youtube/worker.ts` - Worker implementation
- `src/workers/youtube/transcript.ts` - Transcript fetching
- `src/workers/youtube/extractor.ts` - LLM-based candidate extraction
- `src/workers/youtube/filters.ts` - Quality filtering
- `src/workers/youtube/prompts.ts` - Extraction prompt templates

### Processing Stages
- `src/stages/intake.ts` - Stage 01: Intake
- `src/stages/router.ts` - Stage 02: Router execution
- `src/stages/workers.ts` - Stage 03: Worker execution
- `src/stages/normalize.ts` - Stage 04: Normalization
- `src/stages/dedupe.ts` - Stage 05: Deduplication & Clustering
- `src/stages/rank.ts` - Stage 06: Ranking
- `src/stages/validate.ts` - Stage 07: Social Validation
- `src/stages/top-candidates.ts` - Stage 08: Top Candidates Selection
- `src/stages/aggregate.ts` - Stage 09: Aggregator
- `src/stages/results.ts` - Stage 10: Results Generation

### Deduplication & Clustering
- `src/dedupe/index.ts` - Dedupe exports
- `src/dedupe/normalize.ts` - Content normalization
- `src/dedupe/hash.ts` - Candidate hash generation
- `src/dedupe/similarity.ts` - Jaccard and location similarity
- `src/dedupe/cluster.ts` - Cluster formation and merging

### Ranking
- `src/ranking/index.ts` - Ranking exports
- `src/ranking/scorer.ts` - Multi-dimensional scoring
- `src/ranking/relevance.ts` - LLM relevance scoring
- `src/ranking/credibility.ts` - Origin-based credibility
- `src/ranking/diversity.ts` - Diversity constraints

### Validation
- `src/validation/index.ts` - Validation exports
- `src/validation/validator.ts` - Social validation via Perplexity
- `src/validation/prompts.ts` - Validation prompt templates

### Aggregator
- `src/aggregator/index.ts` - Aggregator exports
- `src/aggregator/aggregator.ts` - Main aggregator logic
- `src/aggregator/prompts.ts` - Aggregator prompt templates
- `src/aggregator/narrative.ts` - Narrative generation

### Results Generation
- `src/results/index.ts` - Results exports
- `src/results/json-builder.ts` - results.json generation
- `src/results/markdown-builder.ts` - results.md generation
- `src/results/templates.ts` - Markdown templates

### Cost Tracking
- `src/cost/index.ts` - Cost tracking exports
- `src/cost/tracker.ts` - Token usage accumulator
- `src/cost/calculator.ts` - Cost calculation per provider
- `src/cost/display.ts` - CLI cost display formatting

### Triage System
- `src/triage/index.ts` - Triage exports
- `src/triage/manager.ts` - Triage state management
- `src/triage/matcher.ts` - Candidate matching across runs

### Export
- `src/export/index.ts` - Export exports
- `src/export/bundler.ts` - Export bundle creation
- `src/export/zip.ts` - ZIP archive creation

### Error Recovery
- `src/errors/index.ts` - Error handling exports
- `src/errors/classifier.ts` - Error classification
- `src/errors/retry.ts` - Exponential backoff with jitter
- `src/errors/circuit-breaker.ts` - Circuit breaker implementation

### CLI
- `src/cli/index.ts` - CLI entry point
- `src/cli/base-command.ts` - Base command class
- `src/cli/commands/sessions/create.ts` - sessions:create command
- `src/cli/commands/sessions/list.ts` - sessions:list command
- `src/cli/commands/sessions/view.ts` - sessions:view command
- `src/cli/commands/sessions/archive.ts` - sessions:archive command
- `src/cli/commands/run.ts` - run command
- `src/cli/commands/stages/list.ts` - stages:list command
- `src/cli/commands/stages/view.ts` - stages:view command
- `src/cli/commands/stages/diff.ts` - stages:diff command
- `src/cli/commands/stages/export.ts` - stages:export command
- `src/cli/commands/triage/set.ts` - triage:set command
- `src/cli/commands/triage/list.ts` - triage:list command
- `src/cli/commands/triage/clear.ts` - triage:clear command
- `src/cli/commands/export.ts` - export command
- `src/cli/commands/schema/status.ts` - schema:status command
- `src/cli/commands/schema/migrate.ts` - schema:migrate command
- `src/cli/commands/schema/validate.ts` - schema:validate command
- `src/cli/commands/eval/run.ts` - eval:run command
- `src/cli/formatters/run-summary.ts` - Run summary output formatting
- `src/cli/formatters/progress.ts` - Progress display

### Evaluation Harness
- `src/eval/index.ts` - Evaluation exports
- `src/eval/runner.ts` - Evaluation runner
- `src/eval/sessions.ts` - Test session definitions
- `src/eval/quality.ts` - Quality check functions
- `src/eval/metrics.ts` - Success metric tracking

### Tests
- `src/**/*.test.ts` - Unit tests alongside source files
- `tests/integration/full-run.test.ts` - End-to-end discovery run test
- `tests/integration/resume.test.ts` - Resume functionality tests
- `tests/integration/workers.test.ts` - Worker integration tests
- `tests/integration/error-recovery.test.ts` - Error recovery tests

### Notes

- Unit tests should typically be placed alongside the code files they are testing (e.g., `router.ts` and `router.test.ts` in the same directory).
- Use `npx jest [optional/path/to/test/file]` to run tests. Running without a path executes all tests found by the Jest configuration.
- This project uses TypeScript with strict mode enabled.
- All schemas use Zod for runtime validation.
- Storage uses local filesystem with atomic writes (temp file + rename pattern).
- Environment variables are required for API keys: `PERPLEXITY_API_KEY`, `GOOGLE_PLACES_API_KEY`, `YOUTUBE_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.

Example:
- `- [ ] 1.1 Read file` → `- [x] 1.1 Read file` (after completing)

Update the file after completing each sub-task, not just after completing an entire parent task.

---

## Tasks

### Phase 0.0 — Context Persistence Infrastructure

> **Prerequisite:** This infrastructure must be implemented first to enable efficient development of subsequent phases.

- [ ] **0.0.0 Context Persistence Setup**
  - [ ] 0.0.1 Install LanceDB dependencies: `npm install @lancedb/lancedb vectordb openai`
  - [ ] 0.0.2 Create `src/context/` directory structure for context persistence code
  - [ ] 0.0.3 Create `~/.travelagent/context/lancedb/` directory for database files
  - [ ] 0.0.4 Verify OPENAI_API_KEY is available for embeddings

- [x] **0.0.1 Embedding Service**
  - [x] 0.0.1.1 Create `src/context/embeddings.ts` with OpenAI embedding client
  - [x] 0.0.1.2 Implement `generateEmbedding(text: string): Promise<number[]>` using text-embedding-3-small
  - [x] 0.0.1.3 Implement `generateEmbeddings(texts: string[]): Promise<number[][]>` for batch processing
  - [x] 0.0.1.4 Add embedding cache to reduce API calls for repeated content
  - [x] 0.0.1.5 Add error handling and retry logic for API failures
  - [x] 0.0.1.6 Write unit tests for embedding service

- [x] **0.0.2 LanceDB Collections**
  - [x] 0.0.2.1 Create `src/context/db.ts` with LanceDB connection management
  - [x] 0.0.2.2 Define schema for `journal_entries` collection (id, timestamp, content, summary, topics, embedding)
  - [x] 0.0.2.3 Define schema for `todo_snapshots` collection (id, timestamp, section, items, completion_pct, embedding)
  - [x] 0.0.2.4 Define schema for `prd_sections` collection (id, section_number, title, content, embedding)
  - [x] 0.0.2.5 Define schema for `session_summaries` collection (id, timestamp, summary, work_completed, open_items, embedding)
  - [x] 0.0.2.6 Implement `initializeCollections()` to create tables if not exist
  - [x] 0.0.2.7 Implement `getCollection(name: string)` to retrieve table reference
  - [x] 0.0.2.8 Write unit tests for collection management

- [x] **0.0.3 Context Storage Operations**
  - [x] 0.0.3.1 Create `src/context/storage.ts` with storage operations
  - [x] 0.0.3.2 Implement `storeJournalEntry(entry: JournalEntry): Promise<void>`
  - [x] 0.0.3.3 Implement `storeTodoSnapshot(snapshot: TodoSnapshot): Promise<void>`
  - [x] 0.0.3.4 Implement `storePrdSection(section: PrdSection): Promise<void>`
  - [x] 0.0.3.5 Implement `storeSessionSummary(summary: SessionSummary): Promise<void>`
  - [x] 0.0.3.6 Write unit tests for storage operations

- [x] **0.0.4 Context Retrieval Operations**
  - [x] 0.0.4.1 Create `src/context/retrieval.ts` with retrieval operations
  - [x] 0.0.4.2 Implement `queryJournalEntries(query: string, limit?: number): Promise<JournalEntry[]>`
  - [x] 0.0.4.3 Implement `getRecentSessions(count: number): Promise<SessionSummary[]>`
  - [x] 0.0.4.4 Implement `getCurrentTodoState(): Promise<TodoSnapshot>`
  - [x] 0.0.4.5 Implement `queryPrdSections(query: string): Promise<PrdSection[]>`
  - [x] 0.0.4.6 Implement `getRelevantContext(query: string): Promise<ContextBundle>` combining all sources
  - [x] 0.0.4.7 Write unit tests for retrieval operations

- [x] **0.0.5 PRD Indexing**
  - [x] 0.0.5.1 Create `src/context/indexers/prd.ts` for PRD parsing and indexing
  - [x] 0.0.5.2 Implement `parsePrdSections(prdContent: string): PrdSection[]` to split by ## headers
  - [x] 0.0.5.3 Implement `indexPrd(prdPath: string): Promise<void>` to embed and store all sections
  - [x] 0.0.5.4 Implement `reindexPrd()` to update when PRD changes (detect via file hash)
  - [x] 0.0.5.5 Write unit tests for PRD indexing

- [x] **0.0.6 TODO Indexing**
  - [x] 0.0.6.1 Create `src/context/indexers/todo.ts` for TODO parsing and indexing
  - [x] 0.0.6.2 Implement `parseTodoSections(todoContent: string): TodoSection[]` to extract task groups
  - [x] 0.0.6.3 Implement `calculateCompletionStats(section: TodoSection): CompletionStats`
  - [x] 0.0.6.4 Implement `snapshotTodo(todoPath: string): Promise<void>` to store current state
  - [x] 0.0.6.5 Write unit tests for TODO indexing

- [x] **0.0.7 Auto-Journal Trigger**
  - [x] 0.0.7.1 Create `src/context/auto-journal.ts` with trigger detection logic
  - [x] 0.0.7.2 Define `AutoJournalConfig` interface with thresholds
  - [x] 0.0.7.3 Implement `shouldTriggerJournal(sessionStats: SessionStats): boolean`
  - [x] 0.0.7.4 Implement `trackTodoCompletion(before: TodoState, after: TodoState): number` to count completed items
  - [x] 0.0.7.5 Implement `trackSignificantActions(actions: Action[]): number` to count meaningful changes
  - [x] 0.0.7.6 Write unit tests for auto-journal trigger

- [x] **0.0.8 Journal Generation**
  - [x] 0.0.8.1 Create `src/context/journal-generator.ts` for session summary generation
  - [x] 0.0.8.2 Implement `generateSessionSummary(conversationContext: string): Promise<JournalEntry>`
  - [x] 0.0.8.3 Implement `extractWorkCompleted(context: string): string[]` to identify completed work
  - [x] 0.0.8.4 Implement `extractOpenItems(context: string): string[]` to identify remaining work
  - [x] 0.0.8.5 Implement `extractKeyDecisions(context: string): string[]` to capture decisions made
  - [x] 0.0.8.6 Write unit tests for journal generation

- [x] **0.0.9 Update /journal Command**
  - [x] 0.0.9.1 Modify `.claude/commands/journal.md` to invoke context storage
  - [x] 0.0.9.2 Add instructions to generate embeddings for journal entry
  - [x] 0.0.9.3 Add instructions to store in `journal_entries` collection
  - [x] 0.0.9.4 Add instructions to create condensed `session_summaries` entry
  - [x] 0.0.9.5 Add instructions to snapshot current TODO state
  - [x] 0.0.9.6 Add fallback behavior if LanceDB is unavailable (write to journal.md only)

- [x] **0.0.10 Update /startagain Command**
  - [x] 0.0.10.1 Modify `.claude/commands/startagain.md` to use RAG retrieval
  - [x] 0.0.10.2 Add instructions to query recent session summaries (last 2-3)
  - [x] 0.0.10.3 Add instructions to retrieve current TODO snapshot
  - [x] 0.0.10.4 Add instructions to query relevant PRD sections based on TODO focus
  - [x] 0.0.10.5 Add instructions to present condensed context bundle
  - [x] 0.0.10.6 Add fallback behavior if LanceDB is unavailable (read files directly)

- [x] **0.0.11 Initial Data Seeding**
  - [x] 0.0.11.1 Create `src/context/seed.ts` for initial data population
  - [x] 0.0.11.2 Implement `seedPrd()` to index the full PRD on first run
  - [x] 0.0.11.3 Implement `seedTodo()` to snapshot the initial TODO state
  - [x] 0.0.11.4 Implement `seedExistingJournal()` to index any existing journal.md entries
  - [x] 0.0.11.5 Create CLI command or script: `npm run seed-context`
  - [x] 0.0.11.6 Write integration test for seeding process

- [x] **0.0.12 Context Persistence Tests**
  - [x] 0.0.12.1 Create `tests/context/integration.test.ts` for end-to-end context flow
  - [x] 0.0.12.2 Test: Store journal entry → Retrieve by semantic query
  - [x] 0.0.12.3 Test: Index PRD → Query specific section → Get relevant content
  - [x] 0.0.12.4 Test: Snapshot TODO → Retrieve completion stats
  - [x] 0.0.12.5 Test: Full `/startagain` flow with mock data
  - [x] 0.0.12.6 Test: Fallback to file-based when LanceDB unavailable

---

### Phase 0 — Travel Discovery Orchestrator

---

- [ ] **1.0 Project Foundation & Configuration**
  - [ ] 1.1 Initialize Node.js project with `npm init` and set `"type": "module"` for ES modules
  - [ ] 1.2 Install TypeScript and configure `tsconfig.json` with strict mode, ES2022 target, and Node16 module resolution
  - [ ] 1.3 Install core dependencies: `zod` (schema validation), `dotenv` (env vars), `chalk` (CLI colors), `ora` (spinners)
  - [ ] 1.4 Install dev dependencies: `typescript`, `@types/node`, `jest`, `ts-jest`, `@types/jest`, `eslint`, `prettier`
  - [ ] 1.5 Configure ESLint with TypeScript support and Prettier integration
  - [ ] 1.6 Create directory structure: `src/`, `src/config/`, `src/schemas/`, `src/storage/`, `src/pipeline/`, `src/workers/`, `src/stages/`, `src/cli/`, `tests/`
  - [ ] 1.7 Create `.env.example` with all required environment variables documented
  - [ ] 1.8 Create `src/config/index.ts` with environment variable loading and validation
  - [ ] 1.9 Create `src/config/models.ts` with model configuration per task (see PRD Section 9.1)
  - [ ] 1.10 Create `src/config/costs.ts` with token cost constants per provider (see PRD Section 9.3)
  - [ ] 1.11 Set up Jest configuration in `jest.config.js` for TypeScript
  - [ ] 1.12 Add npm scripts: `build`, `test`, `lint`, `format`, `dev`
  - [ ] 1.13 Create `.gitignore` with node_modules, dist, .env, and data directory exclusions

---

- [ ] **2.0 Schema Definitions & Versioning System**
  - [ ] 2.1 Create `src/schemas/versions.ts` with SCHEMA_VERSIONS constant for all schema types (see PRD Section 12.2)
  - [ ] 2.2 Create `src/schemas/common.ts` with shared types:
    - [ ] 2.2.1 Define `Flexibility` type (none | plusMinusDays | monthOnly)
    - [ ] 2.2.2 Define `SourceRef` type (url, publisher, retrievedAt, snippet)
    - [ ] 2.2.3 Define `ValidationStatus` type (verified | partially_verified | conflict_detected | unverified | not_applicable)
    - [ ] 2.2.4 Define `CandidateType` type (place | activity | neighborhood | daytrip | experience | food)
    - [ ] 2.2.5 Define `CandidateOrigin` type (web | places | youtube)
    - [ ] 2.2.6 Define `CandidateConfidence` type (needs_verification | provisional | verified | high)
  - [ ] 2.3 Create `src/schemas/session.ts` with Session Zod schema (see PRD Section 12.3)
  - [ ] 2.4 Create `src/schemas/candidate.ts` with Candidate Zod schema including metadata (see PRD Section 12.4)
  - [ ] 2.5 Create `src/schemas/triage.ts` with TriageStatus, TriageEntry, and TriageState schemas (see PRD Section 12.5)
  - [ ] 2.6 Create `src/schemas/discovery-results.ts` with DiscoveryResults, WorkerSummary, ClusterInfo, DegradationLevel schemas (see PRD Section 12.6)
  - [ ] 2.7 Create `src/schemas/cost.ts` with CostBreakdown schema (see PRD Section 12.7)
  - [ ] 2.8 Create `src/schemas/stage.ts` with StageMetadata schema (see PRD Section 11.3)
  - [ ] 2.9 Create `src/schemas/run-config.ts` with RunConfig schema (see PRD Section 11.5)
  - [ ] 2.10 Create `src/schemas/manifest.ts` with RunManifest schema (see PRD Section 11.6)
  - [ ] 2.11 Create `src/schemas/enhancement.ts` with EnhancementResult and PromptAnalysis schemas (see PRD Section FR0.9)
  - [ ] 2.12 Create `src/schemas/worker.ts` with WorkerPlan, WorkerOutput, and EnrichedIntent schemas (see PRD Section FR3)
  - [ ] 2.13 Create `src/schemas/index.ts` exporting all schemas
  - [ ] 2.14 Create `src/schemas/migrations/index.ts` with lazy migration framework:
    - [ ] 2.14.1 Implement `migrateSchema<T>(data: unknown, schemaType: string): T` function
    - [ ] 2.14.2 Implement version checking and migration chain execution
    - [ ] 2.14.3 Implement atomic write-back after migration
  - [ ] 2.15 Write unit tests for all schemas validating correct and incorrect data

---

- [ ] **3.0 Storage Layer Implementation**
  - [ ] 3.1 Create `src/storage/paths.ts` with path resolution utilities:
    - [ ] 3.1.1 Implement `getDataDir()` using `TRAVELAGENT_DATA_DIR` env var or default `~/.travelagent/`
    - [ ] 3.1.2 Implement `getSessionDir(sessionId: string)` returning session directory path
    - [ ] 3.1.3 Implement `getRunDir(sessionId: string, runId: string)` returning run directory path
    - [ ] 3.1.4 Implement `getStageFilePath(sessionId: string, runId: string, stageId: string)` returning stage file path
    - [ ] 3.1.5 Implement `getLatestRunSymlink(sessionId: string)` returning latest symlink path
  - [ ] 3.2 Create `src/storage/atomic.ts` with atomic write implementation:
    - [ ] 3.2.1 Implement `atomicWriteJson(filePath: string, data: unknown)` using temp file + rename pattern
    - [ ] 3.2.2 Ensure parent directories are created if they don't exist
    - [ ] 3.2.3 Write JSON with 2-space indentation (pretty-printed)
  - [ ] 3.3 Create `src/storage/sessions.ts` with session CRUD operations:
    - [ ] 3.3.1 Implement `saveSession(session: Session)` writing to session.json
    - [ ] 3.3.2 Implement `loadSession(sessionId: string): Session` with schema validation
    - [ ] 3.3.3 Implement `listSessions(): Session[]` scanning sessions directory
    - [ ] 3.3.4 Implement `archiveSession(sessionId: string)` setting archivedAt timestamp
    - [ ] 3.3.5 Implement `sessionExists(sessionId: string): boolean`
  - [ ] 3.4 Create `src/storage/runs.ts` with run storage operations:
    - [ ] 3.4.1 Implement `createRunDir(sessionId: string, runId: string)` creating run directory structure
    - [ ] 3.4.2 Implement `saveRunConfig(sessionId: string, runConfig: RunConfig)`
    - [ ] 3.4.3 Implement `loadRunConfig(sessionId: string, runId: string): RunConfig`
    - [ ] 3.4.4 Implement `listRuns(sessionId: string): string[]` returning run IDs
    - [ ] 3.4.5 Implement `getLatestRunId(sessionId: string): string | null` reading symlink
    - [ ] 3.4.6 Implement `updateLatestSymlink(sessionId: string, runId: string)` updating symlink
  - [ ] 3.5 Create `src/storage/stages.ts` with stage file storage:
    - [ ] 3.5.1 Implement `saveStageFile(sessionId: string, runId: string, stageId: string, data: unknown)`
    - [ ] 3.5.2 Implement `loadStageFile<T>(sessionId: string, runId: string, stageId: string): T` with validation
    - [ ] 3.5.3 Implement `stageFileExists(sessionId: string, runId: string, stageId: string): boolean`
    - [ ] 3.5.4 Implement `listStageFiles(sessionId: string, runId: string): string[]`
  - [ ] 3.6 Create `src/storage/triage.ts` with triage persistence:
    - [ ] 3.6.1 Implement `saveTriage(sessionId: string, triage: TriageState)`
    - [ ] 3.6.2 Implement `loadTriage(sessionId: string): TriageState | null`
    - [ ] 3.6.3 Implement `updateTriageEntry(sessionId: string, entry: TriageEntry)`
  - [ ] 3.7 Create `src/storage/config.ts` with global config storage:
    - [ ] 3.7.1 Implement `saveGlobalConfig(config: GlobalConfig)`
    - [ ] 3.7.2 Implement `loadGlobalConfig(): GlobalConfig`
  - [ ] 3.8 Create `src/storage/index.ts` exporting all storage functions
  - [ ] 3.9 Write unit tests for storage layer with mock filesystem

---

- [ ] **4.0 Pipeline Stage Infrastructure**
  - [ ] 4.1 Create `src/pipeline/types.ts` with stage interface definitions:
    - [ ] 4.1.1 Define `Stage` interface with `id`, `name`, `number`, `execute()` method
    - [ ] 4.1.2 Define `StageContext` with session, runId, config, costTracker references
    - [ ] 4.1.3 Define `StageResult<T>` with data, metadata, timing information
  - [ ] 4.2 Create `src/pipeline/dependencies.ts` with stage dependency map:
    - [ ] 4.2.1 Define STAGE_DEPENDENCIES constant mapping each stage to its upstream stage
    - [ ] 4.2.2 Implement `getUpstreamStages(stageNumber: number): number[]` returning all upstream stages
    - [ ] 4.2.3 Implement `getDownstreamStages(stageNumber: number): number[]` returning all downstream stages
  - [ ] 4.3 Create `src/pipeline/checkpoint.ts` with checkpoint writing:
    - [ ] 4.3.1 Implement `writeCheckpoint(context: StageContext, stageId: string, data: unknown)` with metadata injection
    - [ ] 4.3.2 Ensure StageMetadata is added to every checkpoint (stageId, stageNumber, stageName, schemaVersion, sessionId, runId, createdAt, upstreamStage, config)
    - [ ] 4.3.3 Implement atomic write with temp file pattern
  - [ ] 4.4 Create `src/pipeline/manifest.ts` with manifest generation:
    - [ ] 4.4.1 Implement `calculateFileHash(filePath: string): string` using SHA-256
    - [ ] 4.4.2 Implement `generateManifest(sessionId: string, runId: string, stages: StageInfo[]): RunManifest`
    - [ ] 4.4.3 Implement `saveManifest(sessionId: string, runId: string, manifest: RunManifest)`
    - [ ] 4.4.4 Include stagesExecuted, stagesSkipped, finalStage, success in manifest
  - [ ] 4.5 Create `src/pipeline/resume.ts` with resume-from-stage logic:
    - [ ] 4.5.1 Implement `loadStageForResume<T>(sessionId: string, sourceRunId: string, stageNumber: number): T`
    - [ ] 4.5.2 Implement `validateStageFile(data: unknown, stageNumber: number): boolean`
    - [ ] 4.5.3 Implement `getStagesToSkip(fromStage: number): number[]` using dependency map
    - [ ] 4.5.4 Implement `getStagesToExecute(fromStage: number): number[]`
  - [ ] 4.6 Create `src/pipeline/executor.ts` with stage executor framework:
    - [ ] 4.6.1 Implement `PipelineExecutor` class with stage registration
    - [ ] 4.6.2 Implement `execute(context: StageContext, options: ExecuteOptions)` running full pipeline
    - [ ] 4.6.3 Implement `executeFromStage(context: StageContext, fromStage: number, sourceRunId: string)`
    - [ ] 4.6.4 Handle stage failures with error logging and graceful degradation
    - [ ] 4.6.5 Track timing per stage and total pipeline duration
  - [ ] 4.7 Create `src/pipeline/index.ts` exporting pipeline utilities
  - [ ] 4.8 Write unit tests for pipeline infrastructure

---

- [ ] **5.0 Session Management Core**
  - [ ] 5.1 Create `src/sessions/id-generator.ts` with ID generation:
    - [ ] 5.1.1 Implement `generateSessionId(prompt: string, destinations: string[], interests: string[]): string` following `YYYYMMDD-<slug>` format
    - [ ] 5.1.2 Implement `generateSlug(tokens: string[]): string` with rules from PRD Section 11.1:
      - Extract high-signal tokens (destination, month/season, trip type, 1-2 interests)
      - Lowercase all characters
      - Replace spaces and special characters with hyphens
      - Remove stopwords: `the`, `a`, `an`, `trip`, `plan`, `to`, `in`, `for`, `my`, `our`
      - Remove emoji and punctuation
      - Collapse multiple hyphens to single hyphen
      - Trim to max 50 characters at word boundary
    - [ ] 5.1.3 Implement `handleCollision(baseId: string): string` appending `-2`, `-3`, etc. if ID exists
    - [ ] 5.1.4 Implement `generateRunId(mode: string): string` following `YYYYMMDD-HHMMSS[-mode]` format
  - [ ] 5.2 Create `src/sessions/create.ts` with session creation:
    - [ ] 5.2.1 Implement `createSession(params: CreateSessionParams): Session` generating ID and saving
    - [ ] 5.2.2 Validate required fields (destinations, dateRange, flexibility, interests)
    - [ ] 5.2.3 Handle optional constraints
    - [ ] 5.2.4 Set createdAt timestamp
  - [ ] 5.3 Create `src/sessions/list.ts` with session listing:
    - [ ] 5.3.1 Implement `listSessions(options?: ListOptions): SessionSummary[]` returning session summaries
    - [ ] 5.3.2 Support filtering by archived status
    - [ ] 5.3.3 Sort by createdAt descending
  - [ ] 5.4 Create `src/sessions/view.ts` with session viewing:
    - [ ] 5.4.1 Implement `viewSession(sessionId: string): SessionDetails` loading full session with run history
    - [ ] 5.4.2 Include enhancement result if available
    - [ ] 5.4.3 Include latest run summary
  - [ ] 5.5 Create `src/sessions/archive.ts` with session archiving:
    - [ ] 5.5.1 Implement `archiveSession(sessionId: string)` setting archivedAt timestamp
    - [ ] 5.5.2 Implement `unarchiveSession(sessionId: string)` clearing archivedAt
  - [ ] 5.6 Create `src/sessions/index.ts` exporting all session functions
  - [ ] 5.7 Write unit tests for session management

---

- [ ] **6.0 Prompt Enhancement (Stage 00)**
  - [ ] 6.1 Create `src/enhancement/prompts.ts` with enhancement prompt templates:
    - [ ] 6.1.1 Create `ANALYSIS_PROMPT` for 5-dimension evaluation (see PRD Section FR0.2)
    - [ ] 6.1.2 Create `CLARIFYING_QUESTIONS_PROMPT` for generating 2-4 questions
    - [ ] 6.1.3 Create `REFINEMENT_PROMPT` for generating refined prompt with extracted params
  - [ ] 6.2 Create `src/enhancement/analyzer.ts` with prompt analysis:
    - [ ] 6.2.1 Implement `analyzePrompt(prompt: string): PromptAnalysis` calling LLM
    - [ ] 6.2.2 Evaluate across 5 dimensions: Destination Specificity (30%), Temporal Clarity (25%), Interest Articulation (20%), Constraint Definition (15%), Trip Type (10%)
    - [ ] 6.2.3 Determine `isClear` based on decision logic (at least 3 dimensions inferable, destination OR temporal context present)
    - [ ] 6.2.4 Calculate `confidence` score (0.0-1.0)
  - [ ] 6.3 Create `src/enhancement/questions.ts` with question generation:
    - [ ] 6.3.1 Implement `generateClarifyingQuestions(analysis: PromptAnalysis): string[]` returning 2-4 questions
    - [ ] 6.3.2 Prioritize questions for missing critical dimensions (destination, timing)
    - [ ] 6.3.3 Skip questions for dimensions already clear
  - [ ] 6.4 Create `src/enhancement/refinement.ts` with refinement suggestion:
    - [ ] 6.4.1 Implement `generateRefinement(prompt: string, analysis: PromptAnalysis): RefinementSuggestion`
    - [ ] 6.4.2 Include refined prompt text
    - [ ] 6.4.3 Include extracted parameters (destinations, dateRange, flexibility, interests, constraints, inferredTags)
  - [ ] 6.5 Create `src/enhancement/extractor.ts` with parameter extraction:
    - [ ] 6.5.1 Implement `extractSessionParams(refinedPrompt: string): Partial<SessionParams>`
    - [ ] 6.5.2 Parse destinations from text
    - [ ] 6.5.3 Parse dates and flexibility
    - [ ] 6.5.4 Parse interests and constraints
  - [ ] 6.6 Create `src/enhancement/enhancer.ts` with main enhancement logic:
    - [ ] 6.6.1 Implement `enhancePrompt(prompt: string, options: EnhanceOptions): Promise<EnhancementResult>`
    - [ ] 6.6.2 Implement iteration loop (max 3 iterations, configurable)
    - [ ] 6.6.3 Handle user actions: Accept, Reject, Feedback
    - [ ] 6.6.4 Implement 15-second timeout per LLM call
    - [ ] 6.6.5 Implement 60-second total timeout
    - [ ] 6.6.6 Implement graceful degradation (proceed with original on failure)
    - [ ] 6.6.7 Track processing time and model used
  - [ ] 6.7 Create `src/enhancement/index.ts` exporting enhancement functions
  - [ ] 6.8 Write unit tests for enhancement logic with mocked LLM responses

---

- [ ] **7.0 Router Implementation (Stage 02)**
  - [ ] 7.1 Create `src/router/prompts.ts` with router prompt templates:
    - [ ] 7.1.1 Create `ROUTER_PROMPT` for generating WorkerPlan
    - [ ] 7.1.2 Include session context, available workers, and output format instructions
  - [ ] 7.2 Create `src/router/intent.ts` with intent enrichment:
    - [ ] 7.2.1 Implement `enrichIntent(session: Session): EnrichedIntent`
    - [ ] 7.2.2 Add inferredTags based on destinations, dates, and interests
    - [ ] 7.2.3 Expand constraints with implied requirements
  - [ ] 7.3 Create `src/router/queries.ts` with query generation:
    - [ ] 7.3.1 Implement `generateQueryVariants(session: Session, workerId: string): string[]`
    - [ ] 7.3.2 Create worker-specific query formats
    - [ ] 7.3.3 Include constraint keywords in queries
  - [ ] 7.4 Create `src/router/planner.ts` with worker planning:
    - [ ] 7.4.1 Implement `selectWorkers(session: Session, availableWorkers: string[]): string[]`
    - [ ] 7.4.2 Implement `allocateBudgets(workers: string[]): WorkerBudget[]` with per-worker limits
  - [ ] 7.5 Create `src/router/defaults.ts` with default fallback:
    - [ ] 7.5.1 Implement `getDefaultWorkerPlan(session: Session): WorkerPlan` for router failures
    - [ ] 7.5.2 Include all workers with standard queries and default timeouts
  - [ ] 7.6 Create `src/router/router.ts` with main router logic:
    - [ ] 7.6.1 Implement `runRouter(session: Session, availableWorkers: string[]): Promise<WorkerPlan>`
    - [ ] 7.6.2 Call LLM with router prompt
    - [ ] 7.6.3 Parse and validate WorkerPlan response
    - [ ] 7.6.4 Implement 5-second timeout
    - [ ] 7.6.5 Fall back to default plan on failure
  - [ ] 7.7 Create `src/router/index.ts` exporting router functions
  - [ ] 7.8 Write unit tests for router with mocked LLM

---

- [ ] **8.0 Worker Framework & Interface**
  - [ ] 8.1 Create `src/workers/types.ts` with worker interface definitions:
    - [ ] 8.1.1 Define `Worker` interface with `id`, `provider`, `plan()`, `execute()` methods
    - [ ] 8.1.2 Define `WorkerContext` with session, enrichedIntent, costTracker, circuitBreaker
    - [ ] 8.1.3 Define `WorkerOutput` with workerId, status, candidates, rawData, error, durationMs, tokenUsage
  - [ ] 8.2 Create `src/workers/registry.ts` with worker registry:
    - [ ] 8.2.1 Implement `WorkerRegistry` class with `register()` and `get()` methods
    - [ ] 8.2.2 Implement `getAvailableWorkers(): string[]`
    - [ ] 8.2.3 Initialize with default workers (perplexity, places, youtube)
  - [ ] 8.3 Create `src/workers/concurrency.ts` with concurrency control:
    - [ ] 8.3.1 Implement `ConcurrencyLimiter` class with configurable limit (default 3)
    - [ ] 8.3.2 Implement `acquire()` and `release()` methods
    - [ ] 8.3.3 Implement queue for pending requests
  - [ ] 8.4 Create `src/workers/executor.ts` with worker execution:
    - [ ] 8.4.1 Implement `executeWorkers(plan: WorkerPlan, context: WorkerContext): Promise<WorkerOutput[]>`
    - [ ] 8.4.2 Use `Promise.allSettled` for parallel execution
    - [ ] 8.4.3 Apply per-worker timeouts from plan
    - [ ] 8.4.4 Respect concurrency limit (3 simultaneous API calls)
    - [ ] 8.4.5 Handle individual worker failures without stopping others
    - [ ] 8.4.6 Save raw outputs to `03_worker_outputs/` directory
  - [ ] 8.5 Create `src/workers/index.ts` exporting worker utilities
  - [ ] 8.6 Write unit tests for worker framework

---

- [ ] **9.0 Perplexity Web Knowledge Worker**
  - [ ] 9.1 Create `src/workers/perplexity/client.ts` with API client:
    - [ ] 9.1.1 Implement `PerplexityClient` class with API key from env
    - [ ] 9.1.2 Implement `chat(messages: Message[], options: ChatOptions): Promise<ChatResponse>`
    - [ ] 9.1.3 Use `sonar-pro` model
    - [ ] 9.1.4 Handle rate limiting and errors
    - [ ] 9.1.5 Track token usage (input and output)
  - [ ] 9.2 Create `src/workers/perplexity/parser.ts` with response parsing:
    - [ ] 9.2.1 Implement `parsePerplexityResponse(response: ChatResponse): Candidate[]`
    - [ ] 9.2.2 Extract discrete candidates from Perplexity text
    - [ ] 9.2.3 Extract citations as SourceRefs
    - [ ] 9.2.4 Set `origin: 'web'` and appropriate confidence level
  - [ ] 9.3 Create `src/workers/perplexity/worker.ts` with worker implementation:
    - [ ] 9.3.1 Implement `PerplexityWorker` class extending Worker interface
    - [ ] 9.3.2 Implement `plan(session, enrichedIntent)` generating search queries
    - [ ] 9.3.3 Implement `execute(plan, context)` calling API and parsing results
    - [ ] 9.3.4 Handle errors and return partial results
  - [ ] 9.4 Create `src/workers/perplexity/index.ts` exporting worker
  - [ ] 9.5 Write unit tests with mocked API responses

---

- [ ] **10.0 Google Places Worker**
  - [ ] 10.1 Create `src/workers/places/client.ts` with API client:
    - [ ] 10.1.1 Implement `PlacesClient` class with API key from env
    - [ ] 10.1.2 Implement `textSearch(query: string, options: SearchOptions): Promise<Place[]>`
    - [ ] 10.1.3 Implement `getPlaceDetails(placeId: string): Promise<PlaceDetails>`
    - [ ] 10.1.4 Handle API errors and quotas
    - [ ] 10.1.5 Track API call counts for cost calculation
  - [ ] 10.2 Create `src/workers/places/mapper.ts` with Place to Candidate mapping:
    - [ ] 10.2.1 Implement `mapPlaceToCandidate(place: PlaceDetails): Candidate`
    - [ ] 10.2.2 Generate Google Maps URL as SourceRef: `https://maps.google.com/?cid=<place_id>`
    - [ ] 10.2.3 Map ratings, price level, address to metadata
    - [ ] 10.2.4 Set `origin: 'places'` and `confidence: 'verified'`
  - [ ] 10.3 Create `src/workers/places/worker.ts` with worker implementation:
    - [ ] 10.3.1 Implement `PlacesWorker` class extending Worker interface
    - [ ] 10.3.2 Implement `plan(session, enrichedIntent)` generating location-based queries
    - [ ] 10.3.3 Implement `execute(plan, context)` calling API and mapping results
    - [ ] 10.3.4 Fetch place details for top results
  - [ ] 10.4 Create `src/workers/places/index.ts` exporting worker
  - [ ] 10.5 Write unit tests with mocked API responses

---

- [ ] **11.0 YouTube Social Signals Worker**
  - [ ] 11.1 Create `src/workers/youtube/client.ts` with YouTube Data API client:
    - [ ] 11.1.1 Implement `YouTubeClient` class with API key from env
    - [ ] 11.1.2 Implement `search(query: string, options: SearchOptions): Promise<VideoSearchResult[]>` (100 units/call)
    - [ ] 11.1.3 Implement `getVideoDetails(videoIds: string[]): Promise<VideoDetails[]>` (1 unit/call)
    - [ ] 11.1.4 Track quota usage
    - [ ] 11.1.5 Handle quota exceeded (403) errors
  - [ ] 11.2 Create `src/workers/youtube/transcript.ts` with transcript fetching:
    - [ ] 11.2.1 Install `youtube-transcript` npm package
    - [ ] 11.2.2 Implement `fetchTranscript(videoId: string): Promise<string | null>`
    - [ ] 11.2.3 Handle videos without transcripts gracefully
    - [ ] 11.2.4 Combine transcript segments into full text
  - [ ] 11.3 Create `src/workers/youtube/filters.ts` with quality filtering:
    - [ ] 11.3.1 Implement `filterVideos(videos: VideoDetails[]): VideoDetails[]`
    - [ ] 11.3.2 Apply filters from PRD Section 15.6:
      - View count > 10,000
      - Publish date < 2 years
      - Duration 4-20 minutes
      - Has captions: true
      - Channel subscribers > 1,000
  - [ ] 11.4 Create `src/workers/youtube/prompts.ts` with extraction prompts:
    - [ ] 11.4.1 Create `EXTRACTION_PROMPT` template for candidate extraction from transcripts (see PRD Section 15.7)
  - [ ] 11.5 Create `src/workers/youtube/extractor.ts` with LLM extraction:
    - [ ] 11.5.1 Implement `extractCandidatesFromTranscript(transcript: string, destination: string): Promise<YouTubeCandidate[]>`
    - [ ] 11.5.2 Call Gemini 3 Flash for extraction
    - [ ] 11.5.3 Parse JSON response into candidates
    - [ ] 11.5.4 Set `origin: 'youtube'` and `confidence: 'provisional'`
    - [ ] 11.5.5 Include video metadata (videoId, channelName, viewCount, publishedAt, timestampSeconds)
  - [ ] 11.6 Create `src/workers/youtube/worker.ts` with worker implementation:
    - [ ] 11.6.1 Implement `YouTubeWorker` class extending Worker interface
    - [ ] 11.6.2 Implement `plan(session, enrichedIntent)` generating 5 search queries (see PRD Section 15.5)
    - [ ] 11.6.3 Implement `execute(plan, context)`:
      - Search for videos
      - Fetch video details
      - Filter by quality
      - Fetch transcripts
      - Extract candidates via LLM
    - [ ] 11.6.4 Handle quota exceeded by disabling worker for run
  - [ ] 11.7 Create `src/workers/youtube/index.ts` exporting worker
  - [ ] 11.8 Write unit tests with mocked API and transcript responses

---

- [ ] **12.0 Normalization Stage (Stage 04)**
  - [ ] 12.1 Create `src/stages/normalize.ts` with normalization logic:
    - [ ] 12.1.1 Implement `normalizeStage(workerOutputs: WorkerOutput[], context: StageContext): Promise<Candidate[]>`
    - [ ] 12.1.2 Process each worker's output in parallel
    - [ ] 12.1.3 Apply 10-second timeout per worker's normalization
    - [ ] 12.1.4 Skip failed normalizations with error logging
    - [ ] 12.1.5 Merge all candidates into single array
    - [ ] 12.1.6 Assign unique `candidateId` to each candidate
  - [ ] 12.2 Implement per-worker normalization:
    - [ ] 12.2.1 `normalizePerplexityOutput(output: WorkerOutput): Candidate[]`
    - [ ] 12.2.2 `normalizePlacesOutput(output: WorkerOutput): Candidate[]`
    - [ ] 12.2.3 `normalizeYouTubeOutput(output: WorkerOutput): Candidate[]`
  - [ ] 12.3 Implement candidate ID generation:
    - [ ] 12.3.1 Generate stable IDs based on title + location hash
    - [ ] 12.3.2 Handle ID collisions
  - [ ] 12.4 Write checkpoint to `04_candidates_normalized.json`
  - [ ] 12.5 Write unit tests for normalization

---

- [ ] **13.0 Deduplication & Clustering (Stage 05)**
  - [ ] 13.1 Create `src/dedupe/normalize.ts` with content normalization:
    - [ ] 13.1.1 Implement `normalizeContent(content: string): string` (see PRD Section 14.1)
      - Lowercase all characters
      - Remove URLs
      - Remove emoji
      - Remove punctuation
      - Collapse whitespace
      - Trim
  - [ ] 13.2 Create `src/dedupe/hash.ts` with hash generation:
    - [ ] 13.2.1 Implement `generateCandidateHash(candidate: Candidate): string`
    - [ ] 13.2.2 Use `${placeId}|${normalizedTitle}|${city}` as seed
    - [ ] 13.2.3 Generate SHA-256 hash truncated to 16 characters
  - [ ] 13.3 Create `src/dedupe/similarity.ts` with similarity functions:
    - [ ] 13.3.1 Implement `jaccardSimilarity(a: string, b: string): number`
    - [ ] 13.3.2 Implement `haversineDistance(coordA: Coords, coordB: Coords): number`
    - [ ] 13.3.3 Implement `calculateLocationSimilarity(a: Candidate, b: Candidate): number`
      - If both have coordinates: use haversine (<50m = 1.0, <200m = 0.8, <500m = 0.5)
      - Fallback: normalized location string match
    - [ ] 13.3.4 Implement `candidateSimilarity(a: Candidate, b: Candidate): number`
      - 60% title similarity + 40% location similarity
  - [ ] 13.4 Create `src/dedupe/cluster.ts` with clustering:
    - [ ] 13.4.1 Implement Phase 1: ID-based exact matching (placeId or hash)
    - [ ] 13.4.2 Implement Phase 2: similarity-based clustering (threshold 0.80)
    - [ ] 13.4.3 Implement `formClusters(candidates: Candidate[]): ClusterInfo[]`
    - [ ] 13.4.4 Implement merge strategy:
      - Keep candidate with highest score as representative
      - Preserve up to 3 alternates with different origins
      - Merge sourceRefs from all cluster members
  - [ ] 13.5 Create `src/stages/dedupe.ts` with stage implementation:
    - [ ] 13.5.1 Implement `dedupeStage(candidates: Candidate[], context: StageContext): Promise<DedupeResult>`
    - [ ] 13.5.2 Write checkpoint to `05_candidates_deduped.json`
  - [ ] 13.6 Create `src/dedupe/index.ts` exporting dedupe functions
  - [ ] 13.7 Write unit tests for deduplication and clustering

---

- [ ] **14.0 Ranking Stage with Diversity (Stage 06)**
  - [ ] 14.1 Create `src/ranking/credibility.ts` with credibility scoring:
    - [ ] 14.1.1 Define `ORIGIN_CREDIBILITY` constants (see PRD Section 14.2)
      - places: 90
      - web_multi: 80
      - web_single: 60
      - youtube_verified: 50
      - youtube_provisional: 30
    - [ ] 14.1.2 Define `VERIFICATION_BOOSTS` constants
      - unverified: 0
      - partially_verified: 15
      - verified: 35
      - high: 50
    - [ ] 14.1.3 Implement `calculateCredibility(candidate: Candidate): number`
  - [ ] 14.2 Create `src/ranking/relevance.ts` with relevance scoring:
    - [ ] 14.2.1 Implement `calculateRelevance(candidate: Candidate, enrichedIntent: EnrichedIntent): number`
    - [ ] 14.2.2 Use LLM for relevance assessment if needed
  - [ ] 14.3 Create `src/ranking/diversity.ts` with diversity scoring:
    - [ ] 14.3.1 Implement `calculateDiversity(candidate: Candidate, predecessors: Candidate[]): number`
    - [ ] 14.3.2 Apply -10 points per same-type predecessor
    - [ ] 14.3.3 Implement `enforceDiversityConstraints(candidates: Candidate[]): Candidate[]`
      - No more than 4 of same type in top 20
      - Balance geography if multiple destinations
  - [ ] 14.4 Create `src/ranking/scorer.ts` with overall scoring:
    - [ ] 14.4.1 Implement `calculateOverallScore(candidate: Candidate, context: RankingContext): number`
    - [ ] 14.4.2 Apply weights: relevance (0.35), credibility (0.30), recency (0.20), diversity (0.15)
    - [ ] 14.4.3 Cap all scores at 100, floor at 0
  - [ ] 14.5 Create `src/stages/rank.ts` with stage implementation:
    - [ ] 14.5.1 Implement `rankStage(candidates: Candidate[], context: StageContext): Promise<Candidate[]>`
    - [ ] 14.5.2 Score all candidates
    - [ ] 14.5.3 Sort by overall score descending
    - [ ] 14.5.4 Write checkpoint to `06_candidates_ranked.json`
  - [ ] 14.6 Create `src/ranking/index.ts` exporting ranking functions
  - [ ] 14.7 Write unit tests for ranking

---

- [ ] **15.0 Social Validation Stage (Stage 07)**
  - [ ] 15.1 Create `src/validation/prompts.ts` with validation prompts:
    - [ ] 15.1.1 Create `VALIDATION_PROMPT` template for Perplexity validation
    - [ ] 15.1.2 Include place name, claimed location, and verification request
  - [ ] 15.2 Create `src/validation/validator.ts` with validation logic:
    - [ ] 15.2.1 Implement `validateCandidate(candidate: Candidate): Promise<ValidationResult>`
    - [ ] 15.2.2 Call Perplexity to verify:
      - Place existence
      - Correct location
      - No obvious closure or mismatch
    - [ ] 15.2.3 Implement 3-second timeout per validation
    - [ ] 15.2.4 Handle timeout/error as `unverified`
    - [ ] 15.2.5 Parse validation response into status:
      - `verified` - All claims confirmed
      - `partially_verified` - Some claims confirmed
      - `conflict_detected` - Information contradicts sources
      - `unverified` - Could not validate
  - [ ] 15.3 Create `src/stages/validate.ts` with stage implementation:
    - [ ] 15.3.1 Implement `validateStage(candidates: Candidate[], context: StageContext): Promise<Candidate[]>`
    - [ ] 15.3.2 Identify YouTube-derived candidates
    - [ ] 15.3.3 Select top N for validation: `min(10, youtube_count)`
    - [ ] 15.3.4 Run validations in parallel with concurrency limit
    - [ ] 15.3.5 Update candidate validation field with status, notes, sources
    - [ ] 15.3.6 Skip if no YouTube candidates present
    - [ ] 15.3.7 Write checkpoint to `07_candidates_validated.json`
  - [ ] 15.4 Create `src/validation/index.ts` exporting validation functions
  - [ ] 15.5 Write unit tests for validation

---

- [ ] **16.0 Top Candidates Selection (Stage 08)**
  - [ ] 16.1 Create `src/stages/top-candidates.ts` with selection logic:
    - [ ] 16.1.1 Implement `topCandidatesStage(candidates: Candidate[], context: StageContext): Promise<Candidate[]>`
    - [ ] 16.1.2 Select top N candidates (default 30, configurable)
    - [ ] 16.1.3 Enforce diversity constraints during selection
    - [ ] 16.1.4 This is the **key resume point** for aggregator testing
    - [ ] 16.1.5 Write checkpoint to `08_top_candidates.json`
  - [ ] 16.2 Write unit tests for top candidates selection

---

- [ ] **17.0 Aggregator Stage (Stage 09)**
  - [ ] 17.1 Create `src/aggregator/prompts.ts` with aggregator prompts:
    - [ ] 17.1.1 Create `AGGREGATOR_PROMPT` template for narrative generation
    - [ ] 17.1.2 Include candidate data, session context, and output format instructions
  - [ ] 17.2 Create `src/aggregator/narrative.ts` with narrative generation:
    - [ ] 17.2.1 Implement `generateNarrative(candidates: Candidate[], session: Session): Promise<NarrativeOutput>`
    - [ ] 17.2.2 Structure output with sections, highlights, and recommendations
  - [ ] 17.3 Create `src/aggregator/aggregator.ts` with main logic:
    - [ ] 17.3.1 Implement `runAggregator(candidates: Candidate[], context: StageContext): Promise<AggregatorOutput>`
    - [ ] 17.3.2 Call GPT-5.2 with aggregator prompt
    - [ ] 17.3.3 Implement 20-second timeout
    - [ ] 17.3.4 Implement degraded mode: return raw candidates without narrative on failure
    - [ ] 17.3.5 Track token usage
  - [ ] 17.4 Create `src/stages/aggregate.ts` with stage implementation:
    - [ ] 17.4.1 Implement `aggregateStage(candidates: Candidate[], context: StageContext): Promise<AggregatorOutput>`
    - [ ] 17.4.2 Write checkpoint to `09_aggregator_output.json`
  - [ ] 17.5 Create `src/aggregator/index.ts` exporting aggregator functions
  - [ ] 17.6 Write unit tests for aggregator with mocked LLM

---

- [ ] **18.0 Results Generation (Stage 10)**
  - [ ] 18.1 Create `src/results/templates.ts` with markdown templates:
    - [ ] 18.1.1 Create `RESULTS_MD_TEMPLATE` based on PRD Appendix B
    - [ ] 18.1.2 Include sections for: Summary, Top Picks, By Category, Sources, Validation Notes
  - [ ] 18.2 Create `src/results/json-builder.ts` with JSON generation:
    - [ ] 18.2.1 Implement `buildResultsJson(aggregatorOutput: AggregatorOutput, context: StageContext): DiscoveryResults`
    - [ ] 18.2.2 Include all candidates, clusters, workerSummary, degradation info
    - [ ] 18.2.3 Set schemaVersion
  - [ ] 18.3 Create `src/results/markdown-builder.ts` with markdown generation:
    - [ ] 18.3.1 Implement `buildResultsMd(results: DiscoveryResults, session: Session): string`
    - [ ] 18.3.2 Format candidates with titles, summaries, sources
    - [ ] 18.3.3 Include validation status indicators
    - [ ] 18.3.4 Mark conflicts and unverified items clearly
  - [ ] 18.4 Create `src/stages/results.ts` with stage implementation:
    - [ ] 18.4.1 Implement `resultsStage(aggregatorOutput: AggregatorOutput, context: StageContext): Promise<void>`
    - [ ] 18.4.2 Generate `results.json` and save to `exports/10_results.json`
    - [ ] 18.4.3 Generate `results.md` and save to `exports/results.md`
    - [ ] 18.4.4 Write `cost.json` with cost breakdown
    - [ ] 18.4.5 Update session's `lastRunId`
  - [ ] 18.5 Create `src/results/index.ts` exporting results functions
  - [ ] 18.6 Write unit tests for results generation

---

- [ ] **19.0 Cost Tracking System**
  - [ ] 19.1 Create `src/cost/tracker.ts` with usage accumulator:
    - [ ] 19.1.1 Implement `CostTracker` class
    - [ ] 19.1.2 Implement `addTokenUsage(provider: string, input: number, output: number)`
    - [ ] 19.1.3 Implement `addApiCalls(provider: string, calls: number)`
    - [ ] 19.1.4 Implement `addQuotaUnits(provider: string, units: number)` for YouTube
    - [ ] 19.1.5 Track usage per stage for detailed breakdown
  - [ ] 19.2 Create `src/cost/calculator.ts` with cost calculation:
    - [ ] 19.2.1 Implement `calculateCosts(tracker: CostTracker): CostBreakdown`
    - [ ] 19.2.2 Apply token costs per provider from config
    - [ ] 19.2.3 Apply API call costs for Places
    - [ ] 19.2.4 Calculate total cost
  - [ ] 19.3 Create `src/cost/display.ts` with CLI display:
    - [ ] 19.3.1 Implement `formatCostBreakdown(breakdown: CostBreakdown): string`
    - [ ] 19.3.2 Format as per PRD Section 9.3 CLI Cost Display
    - [ ] 19.3.3 Show per-provider breakdown and total
  - [ ] 19.4 Create `src/cost/index.ts` exporting cost functions
  - [ ] 19.5 Write unit tests for cost tracking

---

- [ ] **20.0 Triage System**
  - [ ] 20.1 Create `src/triage/manager.ts` with triage state management:
    - [ ] 20.1.1 Implement `setTriageStatus(sessionId: string, candidateId: string, status: TriageStatus, notes?: string)`
    - [ ] 20.1.2 Implement `getTriageStatus(sessionId: string, candidateId: string): TriageEntry | null`
    - [ ] 20.1.3 Implement `listTriagedCandidates(sessionId: string): TriageEntry[]`
    - [ ] 20.1.4 Implement `clearTriage(sessionId: string)`
    - [ ] 20.1.5 Update `updatedAt` timestamp on changes
  - [ ] 20.2 Create `src/triage/matcher.ts` with candidate matching:
    - [ ] 20.2.1 Implement `matchCandidateAcrossRuns(candidateId: string, titleHash: string): string | null`
    - [ ] 20.2.2 First try matching by `candidateId`
    - [ ] 20.2.3 Fallback to title + location hash matching
  - [ ] 20.3 Implement triage persistence rules:
    - [ ] 20.3.1 Triage persists across discovery reruns
    - [ ] 20.3.2 New candidates from re-runs start with no triage status
    - [ ] 20.3.3 Removed candidates retain triage history for recovery
  - [ ] 20.4 Create `src/triage/index.ts` exporting triage functions
  - [ ] 20.5 Write unit tests for triage system

---

- [ ] **21.0 Export Functionality**
  - [ ] 21.1 Create `src/export/bundler.ts` with bundle creation:
    - [ ] 21.1.1 Implement `createExportBundle(sessionId: string, options: ExportOptions): Promise<string>`
    - [ ] 21.1.2 Always include: `results.json`, `results.md`, `triage.json`, `session.json`, `cost.json`
    - [ ] 21.1.3 Optionally include `stages/` with `--include-stages` flag
    - [ ] 21.1.4 Optionally include `raw/` (worker outputs) with `--include-raw` flag
    - [ ] 21.1.5 Create export directory with session ID and timestamp
  - [ ] 21.2 Create `src/export/zip.ts` with ZIP archive:
    - [ ] 21.2.1 Install `archiver` npm package
    - [ ] 21.2.2 Implement `createZipArchive(bundlePath: string, outputPath: string): Promise<string>`
    - [ ] 21.2.3 Support `--zip` flag for ZIP output
  - [ ] 21.3 Create `src/export/index.ts` exporting export functions
  - [ ] 21.4 Write unit tests for export functionality

---

- [ ] **22.0 CLI Framework Setup**
  - [ ] 22.1 Choose and install CLI framework:
    - [ ] 22.1.1 Install `oclif` and its dependencies
    - [ ] 22.1.2 Alternative: Use `commander` if oclif is too heavy
  - [ ] 22.2 Set up CLI project structure:
    - [ ] 22.2.1 Create `src/cli/index.ts` as entry point
    - [ ] 22.2.2 Create `src/cli/commands/` directory
    - [ ] 22.2.3 Configure bin entry in `package.json` as `travel`
  - [ ] 22.3 Create `src/cli/base-command.ts`:
    - [ ] 22.3.1 Implement base command class with common flags
    - [ ] 22.3.2 Add `--verbose` flag for debug output
    - [ ] 22.3.3 Add `--quiet` flag for minimal output
    - [ ] 22.3.4 Set up error handling and graceful exit
  - [ ] 22.4 Create `src/cli/formatters/progress.ts`:
    - [ ] 22.4.1 Implement progress spinner using `ora`
    - [ ] 22.4.2 Implement stage progress display (checkmarks, etc.)
  - [ ] 22.5 Create `src/cli/formatters/run-summary.ts`:
    - [ ] 22.5.1 Implement run summary formatting (see PRD Section 16.3)
    - [ ] 22.5.2 Implement degraded run output formatting (see PRD Section 16.5)
    - [ ] 22.5.3 Implement resume run output formatting (see PRD Section 16.4)
  - [ ] 22.6 Set up help system and command discovery
  - [ ] 22.7 Write basic CLI smoke tests

---

- [ ] **23.0 CLI Session Commands**
  - [ ] 23.1 Create `src/cli/commands/sessions/create.ts`:
    - [ ] 23.1.1 Implement `sessions:create` command
    - [ ] 23.1.2 Add `--prompt` flag for natural language input (triggers enhancement)
    - [ ] 23.1.3 Add `--skip-enhancement` flag to bypass enhancement
    - [ ] 23.1.4 Add `--enhancement-model` flag to choose model (gemini, gpt, claude)
    - [ ] 23.1.5 Add `--auto-enhance` flag to auto-accept first suggestion
    - [ ] 23.1.6 Add `--destination` flag for direct parameter mode
    - [ ] 23.1.7 Add `--dates` flag (start and end dates)
    - [ ] 23.1.8 Add `--flexibility` flag (none, plusMinus:N, monthOnly)
    - [ ] 23.1.9 Add `--interests` flag (comma-separated)
    - [ ] 23.1.10 Add `--constraint` flag (repeatable)
    - [ ] 23.1.11 Add `--seed-from` flag for seeding from prior session/stage
    - [ ] 23.1.12 Add `--seed-file` flag for seeding from external file
    - [ ] 23.1.13 Implement interactive enhancement flow with user prompts
    - [ ] 23.1.14 Display created session ID on success
  - [ ] 23.2 Create `src/cli/commands/sessions/list.ts`:
    - [ ] 23.2.1 Implement `sessions:list` command
    - [ ] 23.2.2 Display sessions in table format with ID, title, created date, last run
    - [ ] 23.2.3 Add `--archived` flag to show archived sessions
  - [ ] 23.3 Create `src/cli/commands/sessions/view.ts`:
    - [ ] 23.3.1 Implement `sessions:view <session_id>` command
    - [ ] 23.3.2 Display full session details including parameters
    - [ ] 23.3.3 Display enhancement result if available
    - [ ] 23.3.4 Display run history
  - [ ] 23.4 Create `src/cli/commands/sessions/archive.ts`:
    - [ ] 23.4.1 Implement `sessions:archive <session_id>` command
    - [ ] 23.4.2 Soft-delete by setting archivedAt
    - [ ] 23.4.3 Display confirmation message
  - [ ] 23.5 Write tests for session commands

---

- [ ] **24.0 CLI Run Commands**
  - [ ] 24.1 Create `src/cli/commands/run.ts`:
    - [ ] 24.1.1 Implement `run <session_id>` command
    - [ ] 24.1.2 Add `--from-stage <NN>` flag for resuming from specific stage
    - [ ] 24.1.3 Add `--source-run <run_id>` flag to specify source run for resume
    - [ ] 24.1.4 Add `--aggregate-only` flag (shorthand for `--from-stage 08`)
    - [ ] 24.1.5 Add `--workers <list>` flag to select specific workers (comma-separated)
    - [ ] 24.1.6 Add `--skip-validation` flag to skip social validation stage
    - [ ] 24.1.7 Add `--skip-youtube` flag to skip YouTube worker
    - [ ] 24.1.8 Add `--dry-run` flag to show what would execute without running
    - [ ] 24.1.9 Implement full pipeline execution with progress display
    - [ ] 24.1.10 Display stage completion with checkmarks
    - [ ] 24.1.11 Display run summary on completion (see PRD Section 16.3)
    - [ ] 24.1.12 Display cost breakdown
    - [ ] 24.1.13 Display output file path
    - [ ] 24.1.14 Handle resume mode with appropriate output (see PRD Section 16.4)
    - [ ] 24.1.15 Handle partial/degraded runs with warnings (see PRD Section 16.5)
  - [ ] 24.2 Write tests for run command

---

- [ ] **25.0 CLI Auxiliary Commands (stages, triage, export, schema, eval)**
  - [ ] 25.1 Create `src/cli/commands/stages/list.ts`:
    - [ ] 25.1.1 Implement `stages:list <session_id>` command
    - [ ] 25.1.2 Add `--run <run_id>` flag to specify run (default: latest)
    - [ ] 25.1.3 Display all stage files with checkmarks for completed
  - [ ] 25.2 Create `src/cli/commands/stages/view.ts`:
    - [ ] 25.2.1 Implement `stages:view <session_id> --stage <NN>` command
    - [ ] 25.2.2 Pretty-print stage file content
    - [ ] 25.2.3 Add `--run <run_id>` flag
  - [ ] 25.3 Create `src/cli/commands/stages/diff.ts`:
    - [ ] 25.3.1 Implement `stages:diff <session_id> --stage <NN> --runs <id1> <id2>` command
    - [ ] 25.3.2 Display diff between stage files from two runs
  - [ ] 25.4 Create `src/cli/commands/stages/export.ts`:
    - [ ] 25.4.1 Implement `stages:export <session_id> --stage <NN> --output <path>` command
    - [ ] 25.4.2 Copy stage file to specified output path
  - [ ] 25.5 Create `src/cli/commands/triage/set.ts`:
    - [ ] 25.5.1 Implement `triage:set <candidate_id> --status <must|research|maybe>` command
    - [ ] 25.5.2 Add `--notes` flag for optional notes
    - [ ] 25.5.3 Display confirmation
  - [ ] 25.6 Create `src/cli/commands/triage/list.ts`:
    - [ ] 25.6.1 Implement `triage:list <session_id>` command
    - [ ] 25.6.2 Display triaged candidates grouped by status
  - [ ] 25.7 Create `src/cli/commands/triage/clear.ts`:
    - [ ] 25.7.1 Implement `triage:clear <session_id>` command
    - [ ] 25.7.2 Add confirmation prompt
  - [ ] 25.8 Create `src/cli/commands/export.ts`:
    - [ ] 25.8.1 Implement `export <session_id>` command
    - [ ] 25.8.2 Add `--zip` flag for ZIP archive output
    - [ ] 25.8.3 Add `--include-stages` flag
    - [ ] 25.8.4 Add `--include-raw` flag
    - [ ] 25.8.5 Add `--output <path>` flag for custom output location
    - [ ] 25.8.6 Display export path on completion
  - [ ] 25.9 Create `src/cli/commands/schema/status.ts`:
    - [ ] 25.9.1 Implement `schema:status` command
    - [ ] 25.9.2 Display current schema versions and any files needing migration
  - [ ] 25.10 Create `src/cli/commands/schema/migrate.ts`:
    - [ ] 25.10.1 Implement `schema:migrate` command
    - [ ] 25.10.2 Add `--dry-run` flag to preview migrations
    - [ ] 25.10.3 Migrate all data files to current schema versions
  - [ ] 25.11 Create `src/cli/commands/schema/validate.ts`:
    - [ ] 25.11.1 Implement `schema:validate` command
    - [ ] 25.11.2 Validate all data files against schemas
    - [ ] 25.11.3 Report any validation errors
  - [ ] 25.12 Create `src/cli/commands/eval/run.ts`:
    - [ ] 25.12.1 Implement `eval:run` command
    - [ ] 25.12.2 Add `--session <name>` flag for single session evaluation
    - [ ] 25.12.3 Add `--track-cost` flag to include cost tracking
    - [ ] 25.12.4 Display evaluation results and metrics
  - [ ] 25.13 Write tests for auxiliary commands

---

- [ ] **26.0 Error Recovery & Resilience**
  - [ ] 26.1 Create `src/errors/classifier.ts` with error classification:
    - [ ] 26.1.1 Implement `classifyError(error: unknown, provider: string): ErrorCategory`
    - [ ] 26.1.2 Define categories: `transient`, `permanent`, `quota`, `partial`
    - [ ] 26.1.3 Map HTTP status codes to categories (see PRD Section 17.3.1)
    - [ ] 26.1.4 Handle provider-specific error patterns
  - [ ] 26.2 Create `src/errors/retry.ts` with exponential backoff:
    - [ ] 26.2.1 Implement `withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T>`
    - [ ] 26.2.2 Apply formula: `delay = min(maxDelay, baseDelay × 2^attempt) + random(-jitter, +jitter)`
    - [ ] 26.2.3 Configure per-provider settings (see PRD Section 17.3.2):
      - Perplexity: 3 retries, 1000ms base, 8000ms max, ±500ms jitter
      - Google Places: 2 retries, 500ms base, 4000ms max, ±200ms jitter
      - OpenAI: 3 retries, 1000ms base, 16000ms max, ±1000ms jitter
      - Gemini: 3 retries, 1000ms base, 8000ms max, ±500ms jitter
      - YouTube Data API: 2 retries, 1000ms base, 4000ms max, ±500ms jitter
      - youtube-transcript: 2 retries, 500ms base, 2000ms max, ±200ms jitter
    - [ ] 26.2.4 Only retry transient errors
  - [ ] 26.3 Create `src/errors/circuit-breaker.ts` with circuit breaker:
    - [ ] 26.3.1 Implement `CircuitBreaker` class
    - [ ] 26.3.2 Track consecutive failures per provider
    - [ ] 26.3.3 Open circuit after 5 consecutive failures within 60 seconds
    - [ ] 26.3.4 Implement `recordSuccess(provider: string)`
    - [ ] 26.3.5 Implement `recordFailure(provider: string)`
    - [ ] 26.3.6 Implement `isOpen(provider: string): boolean`
    - [ ] 26.3.7 Implement `getStatus(): Record<string, CircuitStatus>`
    - [ ] 26.3.8 Reset at end of run (manual reset)
  - [ ] 26.4 Integrate error handling into workers and stages:
    - [ ] 26.4.1 Wrap all external API calls with retry logic
    - [ ] 26.4.2 Check circuit breaker before API calls
    - [ ] 26.4.3 Implement graceful degradation (partial results guarantee)
  - [ ] 26.5 Create `src/errors/index.ts` exporting error utilities
  - [ ] 26.6 Write unit tests for error recovery

---

- [ ] **27.0 Evaluation Harness**
  - [ ] 27.1 Create `src/eval/sessions.ts` with test session definitions:
    - [ ] 27.1.1 Define test sessions covering different scenarios:
      - Vague prompt (Explorer persona)
      - Clear prompt (Curator persona)
      - Constrained trip (accessibility, family-friendly)
      - Social-heavy (YouTube content expected)
    - [ ] 27.1.2 Include expected outcomes for comparison
  - [ ] 27.2 Create `src/eval/quality.ts` with quality check functions:
    - [ ] 27.2.1 Implement `checkSourceCoverage(results: DiscoveryResults): QualityResult`
      - Verify 100% of candidates have SourceRef or `needs_verification` flag
    - [ ] 27.2.2 Implement `checkSchemaValidity(results: DiscoveryResults): QualityResult`
      - Validate against Zod schemas
    - [ ] 27.2.3 Implement `checkPartialResults(results: DiscoveryResults): QualityResult`
      - Verify pipeline completes with partial results if worker fails
  - [ ] 27.3 Create `src/eval/metrics.ts` with success metric tracking:
    - [ ] 27.3.1 Track metrics from PRD Section 4.2:
      - Enhancement: Vague prompts produce valid session params
      - Utility: Positive rating on top 10 results (manual)
      - Trust: 100% candidates with SourceRef or marked
      - Repeatability: Valid JSON output on every run
      - Resilience: Pipeline completes with partial results
      - Cost Visibility: Cost breakdown displayed
      - Performance: Run completes < 60 seconds
      - Debuggability: All stages produce valid JSON checkpoints
  - [ ] 27.4 Create `src/eval/runner.ts` with evaluation runner:
    - [ ] 27.4.1 Implement `runEvaluation(options: EvalOptions): Promise<EvalReport>`
    - [ ] 27.4.2 Run all test sessions
    - [ ] 27.4.3 Collect quality metrics
    - [ ] 27.4.4 Optionally track costs with `--track-cost`
    - [ ] 27.4.5 Generate evaluation report
  - [ ] 27.5 Create `src/eval/index.ts` exporting evaluation functions
  - [ ] 27.6 Write tests for evaluation harness

---

- [ ] **28.0 Integration Testing & Documentation**
  - [ ] 28.1 Create `tests/integration/full-run.test.ts`:
    - [ ] 28.1.1 Test complete discovery run from session creation to results
    - [ ] 28.1.2 Verify all stage files are created
    - [ ] 28.1.3 Verify results.json and results.md are valid
    - [ ] 28.1.4 Verify cost.json is generated
    - [ ] 28.1.5 Use mocked external APIs for deterministic results
  - [ ] 28.2 Create `tests/integration/resume.test.ts`:
    - [ ] 28.2.1 Test resume from stage 08
    - [ ] 28.2.2 Verify upstream stages are skipped
    - [ ] 28.2.3 Verify downstream stages execute correctly
    - [ ] 28.2.4 Verify new run is created with `from-08` mode
  - [ ] 28.3 Create `tests/integration/workers.test.ts`:
    - [ ] 28.3.1 Test each worker with mocked API responses
    - [ ] 28.3.2 Test worker failure handling
    - [ ] 28.3.3 Test concurrency limiting
  - [ ] 28.4 Create `tests/integration/error-recovery.test.ts`:
    - [ ] 28.4.1 Test retry logic with simulated transient failures
    - [ ] 28.4.2 Test circuit breaker opening and closing
    - [ ] 28.4.3 Test graceful degradation with partial results
  - [ ] 28.5 Create `tests/integration/enhancement.test.ts`:
    - [ ] 28.5.1 Test vague prompt enhancement flow
    - [ ] 28.5.2 Test clear prompt direct refinement
    - [ ] 28.5.3 Test skip enhancement flag
  - [ ] 28.6 Update `README.md` with:
    - [ ] 28.6.1 Project overview and Phase 0 scope
    - [ ] 28.6.2 Installation instructions
    - [ ] 28.6.3 Environment variable setup
    - [ ] 28.6.4 CLI command reference
    - [ ] 28.6.5 Example usage workflows
    - [ ] 28.6.6 Development setup instructions
  - [ ] 28.7 Create `docs/architecture.md` with:
    - [ ] 28.7.1 System architecture overview
    - [ ] 28.7.2 Pipeline stage descriptions
    - [ ] 28.7.3 Data flow diagrams
  - [ ] 28.8 Run full test suite and fix any failing tests
  - [ ] 28.9 Run linter and fix any issues
  - [ ] 28.10 Verify all acceptance criteria from PRD Section 19

---

## Summary

This task list covers the complete Phase 0 implementation of the Travel Discovery Orchestrator CLI as specified in the PRD. The tasks are organized to build foundational components first, then layer on increasingly complex functionality.

**Key Implementation Order:**
1. Tasks 0-4: Foundation (project setup, schemas, storage, pipeline infrastructure)
2. Tasks 5-6: Session management and prompt enhancement
3. Tasks 7-11: Router and all workers
4. Tasks 12-18: Processing stages (normalize, dedupe, rank, validate, aggregate, results)
5. Tasks 19-21: Supporting systems (cost, triage, export)
6. Tasks 22-25: CLI implementation
7. Tasks 26-28: Error handling, evaluation, and polish

**Critical Dependencies:**
- Schemas (Task 2) must be complete before storage (Task 3)
- Storage (Task 3) must be complete before sessions (Task 5)
- Pipeline infrastructure (Task 4) must be complete before any stages
- Worker framework (Task 8) must be complete before individual workers (Tasks 9-11)
- All workers and processing stages must be complete before CLI run command (Task 24)
