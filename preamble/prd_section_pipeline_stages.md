# PRD Section: Pipeline Stages and Stage Snapshotting

**Purpose:** This section defines the stage-based execution model, storage layout, resume/replay capabilities, and human-readable ID conventions. This is designed to be integrated into the unified Phase 0 PRD.

---

## Overview

The discovery pipeline is divided into explicit **stages**, each producing a JSON checkpoint. This enables:

1. **Debugging** — Inspect intermediate outputs at any stage
2. **Resume** — Restart a run from any stage without re-executing upstream stages
3. **Replay** — Re-run downstream stages with modified config (e.g., test new aggregator prompts)
4. **Seed** — Import stage outputs from a prior session into a new session
5. **Reproducibility** — Track exactly what config produced each output

---

## 12A. Human-Readable ID Conventions

### 12A.1 Session ID Format

```
<YYYYMMDD>-<slug>
```

**Components:**
- `YYYYMMDD` — Date session was created
- `slug` — Sanitized summary derived from user prompt (destination + interests), max 50 characters

**Slug Generation Rules:**
1. Extract high-signal tokens: destination(s), month/season, trip type, 1-2 interests
2. Lowercase all characters
3. Replace spaces and special characters with hyphens
4. Remove stopwords: `the`, `a`, `an`, `trip`, `plan`, `to`, `in`, `for`, `my`, `our`
5. Remove emoji and punctuation
6. Collapse multiple hyphens to single hyphen
7. Trim to max 50 characters at word boundary
8. If empty after processing, use `session`

**Collision Handling:**
- If session ID already exists, append `-2`, `-3`, etc.

**Examples:**

| User Prompt | Session ID |
|-------------|------------|
| "Japan in April, temples and food, family trip" | `20260102-japan-april-temples-food-family` |
| "Somewhere warm in March" | `20260102-warm-march` |
| "10 days: Tokyo → Kyoto → Osaka, cherry blossoms" | `20260102-tokyo-kyoto-osaka-cherry-blossoms` |
| "Italy wine regions tour" | `20260102-italy-wine-regions` |
| "" (empty) | `20260102-session` |

### 12A.2 Run ID Format

```
<YYYYMMDD>-<HHMMSS>[-<mode>]
```

**Components:**
- `YYYYMMDD-HHMMSS` — Timestamp when run started
- `mode` (optional) — Indicates run type for quick identification

**Mode Values:**
- `full` — Complete pipeline from intake
- `from-<stage>` — Resumed from a specific stage
- `aggregate-only` — Only ran aggregator
- `validate-only` — Only ran validation

**Examples:**

| Scenario | Run ID |
|----------|--------|
| Full discovery run | `20260102-143512-full` |
| Resume from top candidates | `20260102-150044-from-top-candidates` |
| Aggregator testing | `20260102-151230-aggregate-only` |

**Collision Handling:**
- If run ID exists (rare, within same second), append `-2`, `-3`, etc.

---

## 12B. Pipeline Stages Definition

### 12B.1 Stage Overview

Each stage is a **checkpoint boundary** in the discovery pipeline. Stages are numbered for execution order and easy sorting.

| Stage | Filename | Description | Produces |
|-------|----------|-------------|----------|
| 01 | `01_intake.json` | Session params snapshot | Normalized session input |
| 02 | `02_router_plan.json` | Router output | WorkerPlan with queries |
| 03 | `03_worker_outputs/` | Raw worker responses | Per-worker JSON files |
| 04 | `04_candidates_normalized.json` | Normalized candidates | Unified Candidate[] |
| 05 | `05_candidates_deduped.json` | After dedupe/clustering | Candidates with clusters |
| 06 | `06_candidates_ranked.json` | After scoring | Candidates with scores |
| 07 | `07_candidates_validated.json` | After social validation | Candidates with validation status |
| 08 | `08_top_candidates.json` | Top N for aggregator | Filtered, ranked candidates |
| 09 | `09_aggregator_output.json` | Aggregator result | Structured narrative |
| 10 | `10_results.json` | Final export | Complete DiscoveryResults |
| — | `results.md` | Human-readable output | Markdown summary |

### 12B.2 Stage Contracts

Each stage file includes standard metadata:

```typescript
interface StageMetadata {
  stageId: string;              // e.g., "01_intake"
  stageNumber: number;          // e.g., 1
  stageName: string;            // e.g., "intake"
  schemaVersion: number;        // Stage-specific schema version
  sessionId: string;
  runId: string;
  createdAt: string;            // ISO8601
  upstreamStage?: string;       // Which stage this consumed (null for 01)
  config?: StageConfig;         // Model/prompt config used
}
```

#### Stage 01: Intake

**File:** `01_intake.json`

**Purpose:** Snapshot of session parameters at run start. Ensures reproducibility even if session.json is later modified.

```typescript
interface Stage01Intake {
  _meta: StageMetadata;
  session: {
    sessionId: string;
    title: string;
    destinations: string[];
    dateRange: { start: string; end: string };
    flexibility: Flexibility;
    interests: string[];
    constraints?: Record<string, unknown>;
  };
  runConfig: {
    workers: string[];          // Which workers to invoke
    skipValidation?: boolean;
    maxCandidatesPerWorker?: number;
    timeout?: number;
  };
}
```

#### Stage 02: Router Plan

**File:** `02_router_plan.json`

**Purpose:** Output of Router LLM — enriched intent and worker assignments.

```typescript
interface Stage02RouterPlan {
  _meta: StageMetadata;
  enrichedIntent: EnrichedIntent;
  workerPlans: Array<{
    workerId: string;
    queries: string[];
    maxResults: number;
    timeout: number;
  }>;
  validationPlan: {
    validateTopN: number;
    origins: string[];
  };
  routerTokenUsage?: { input: number; output: number };
}
```

#### Stage 03: Worker Outputs

**Directory:** `03_worker_outputs/`

**Purpose:** Raw responses from each worker, preserved for debugging and replay.

**Files:**
- `perplexity_raw.json` — Raw Perplexity API response
- `places_raw.json` — Raw Google Places API response
- `youtube_raw.json` — Raw YouTube search + transcript data

Each file includes:
```typescript
interface WorkerRawOutput {
  _meta: StageMetadata;
  workerId: string;
  status: 'ok' | 'error' | 'partial';
  durationMs: number;
  apiCalls: number;
  rawResponse: unknown;         // Provider-specific format
  error?: string;
}
```

#### Stage 04: Candidates Normalized

**File:** `04_candidates_normalized.json`

**Purpose:** All candidates converted to unified Candidate schema, before any deduplication.

```typescript
interface Stage04CandidatesNormalized {
  _meta: StageMetadata;
  candidates: Candidate[];      // Full Candidate[] with all fields
  byWorker: {
    [workerId: string]: {
      count: number;
      candidateIds: string[];
    };
  };
  totalCount: number;
  normalizationTokenUsage?: { input: number; output: number };
}
```

#### Stage 05: Candidates Deduped

**File:** `05_candidates_deduped.json`

**Purpose:** After deduplication and clustering. Duplicates are merged, clusters identified.

```typescript
interface Stage05CandidatesDeduped {
  _meta: StageMetadata;
  candidates: Candidate[];              // Deduplicated set
  clusters: Array<{
    clusterId: string;
    representativeId: string;           // Best candidate in cluster
    alternateIds: string[];             // Other candidates in cluster
    mergedSourceRefs: SourceRef[];      // Combined sources
  }>;
  dedupeStats: {
    inputCount: number;
    outputCount: number;
    clustersFormed: number;
    exactMatchesRemoved: number;
    similarityMatchesRemoved: number;
  };
}
```

#### Stage 06: Candidates Ranked

**File:** `06_candidates_ranked.json`

**Purpose:** Candidates with computed scores, sorted by rank.

```typescript
interface Stage06CandidatesRanked {
  _meta: StageMetadata;
  candidates: Array<Candidate & {
    scoring: {
      relevance: number;        // 0-100
      credibility: number;      // 0-100
      recency: number;          // 0-100
      diversity: number;        // 0-100
      overall: number;          // Weighted composite
    };
    rank: number;               // 1-based position
  }>;
  rankingConfig: {
    weights: {
      relevance: number;
      credibility: number;
      recency: number;
      diversity: number;
    };
  };
}
```

#### Stage 07: Candidates Validated

**File:** `07_candidates_validated.json`

**Purpose:** After social validation via Perplexity. YouTube-derived candidates now have validation status.

```typescript
interface Stage07CandidatesValidated {
  _meta: StageMetadata;
  candidates: Candidate[];      // With validation field populated
  validationSummary: {
    totalValidated: number;
    verified: number;
    partiallyVerified: number;
    conflictDetected: number;
    unverified: number;
    skipped: number;            // Not YouTube origin, no validation needed
  };
  validationTokenUsage?: { input: number; output: number };
}
```

#### Stage 08: Top Candidates

**File:** `08_top_candidates.json`

**Purpose:** The subset of candidates passed to the Aggregator. This is the key "resume point" for aggregator testing.

```typescript
interface Stage08TopCandidates {
  _meta: StageMetadata;
  candidates: Candidate[];      // Top N candidates (default 30)
  selectionCriteria: {
    maxCount: number;
    minScore?: number;
    requiredTypes?: CandidateType[];
    diversityEnforced: boolean;
  };
  sessionContext: {
    destinations: string[];
    interests: string[];
    constraints?: Record<string, unknown>;
    dateRange: { start: string; end: string };
  };
}
```

**Usage:** This file is the input for aggregator testing. Running `travel run --from-stage 08` uses this file.

#### Stage 09: Aggregator Output

**File:** `09_aggregator_output.json`

**Purpose:** Structured output from the Aggregator LLM before final formatting.

```typescript
interface Stage09AggregatorOutput {
  _meta: StageMetadata;
  highlights: string[];                   // Key takeaways
  topPicks: Array<{
    candidateId: string;
    rank: number;
    oneLineSummary: string;
    tags: string[];
  }>;
  socialSignals?: {
    candidates: Array<{
      candidateId: string;
      source: string;
      validationStatus: ValidationStatus;
    }>;
    warnings: string[];
  };
  suggestedRefinements: string[];
  narrativeStructure?: {
    sections: Array<{
      title: string;
      candidateIds: string[];
      narrative: string;
    }>;
  };
  aggregatorTokenUsage?: { input: number; output: number };
}
```

#### Stage 10: Results

**File:** `10_results.json`

**Purpose:** Final DiscoveryResults object, complete and export-ready.

```typescript
interface Stage10Results {
  _meta: StageMetadata;
  results: DiscoveryResults;    // Full schema from Data Model section
}
```

**Also produces:** `results.md` — Human-readable markdown (not a stage file, but generated alongside).

---

## 12C. Updated Storage Layout

### 12C.1 Directory Structure

```
~/.travelagent/                           # Default data directory (configurable)
├── config.json                            # Global CLI config
└── sessions/
    └── <session_id>/                      # e.g., 20260102-japan-april-temples-food
        ├── session.json                   # Session definition
        ├── triage.json                    # Triage state (persists across runs)
        └── runs/
            ├── latest -> 20260102-143512-full   # Symlink to latest run
            └── <run_id>/                  # e.g., 20260102-143512-full
                ├── run.json               # Run config snapshot
                ├── manifest.json          # Stage inventory with hashes
                ├── cost.json              # Cost breakdown
                ├── stages/
                │   ├── 01_intake.json
                │   ├── 02_router_plan.json
                │   ├── 03_worker_outputs/
                │   │   ├── perplexity_raw.json
                │   │   ├── places_raw.json
                │   │   └── youtube_raw.json
                │   ├── 04_candidates_normalized.json
                │   ├── 05_candidates_deduped.json
                │   ├── 06_candidates_ranked.json
                │   ├── 07_candidates_validated.json
                │   ├── 08_top_candidates.json
                │   └── 09_aggregator_output.json
                ├── exports/
                │   ├── 10_results.json
                │   └── results.md
                └── logs/
                    └── run.log            # Structured log (JSON lines)
```

### 12C.2 Run Configuration Snapshot

**File:** `run.json`

Captures the exact configuration used for this run, enabling reproducibility.

```typescript
interface RunConfig {
  runId: string;
  sessionId: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'partial';

  // Execution mode
  mode: 'full' | 'from-stage';
  fromStage?: string;                     // If resumed, which stage
  fromStagePath?: string;                 // If imported, source path

  // Model configuration (snapshot)
  models: {
    router: string;                       // e.g., "gemini-3-flash-preview"
    normalizer: string;
    aggregator: string;
    validator: string;
  };
  temperatures: {
    router: number;
    normalizer: number;
    aggregator: number;
  };

  // Prompt versions (hash or version string)
  promptVersions: {
    router: string;
    aggregator: string;
    youtubeExtraction: string;
    validation: string;
  };

  // Limits
  limits: {
    maxCandidatesPerWorker: number;
    maxTopCandidates: number;
    maxValidations: number;
    workerTimeout: number;
    totalTimeout: number;
  };

  // Flags
  flags: {
    skipValidation: boolean;
    skipYoutube: boolean;
    verbose: boolean;
  };

  // Provenance (if seeded from another session)
  seedSource?: {
    sessionId: string;
    runId: string;
    stageFile: string;
    copiedAt: string;
  };
}
```

### 12C.3 Manifest File

**File:** `manifest.json`

Inventory of all stage files with hashes for integrity verification.

```typescript
interface RunManifest {
  runId: string;
  sessionId: string;
  createdAt: string;

  stages: Array<{
    stageId: string;                      // e.g., "01_intake"
    filename: string;                     // Relative path
    createdAt: string;
    sha256: string;                       // Content hash
    sizeBytes: number;
    upstreamStage?: string;               // Dependency
  }>;

  // Execution trace
  stagesExecuted: string[];               // In order of execution
  stagesSkipped: string[];                // If resumed
  stagesFromSeed: string[];               // If seeded from another run

  // Final status
  finalStage: string;                     // Last stage completed
  success: boolean;
}
```

---

## 12D. Resume and Replay Capabilities

### 12D.1 Resume from Stage (Same Session)

Resume a run from a previously completed stage, skipping upstream stages.

**Use Case:** Testing aggregator prompt changes without re-running workers.

**CLI:**
```bash
# Resume from top_candidates stage of latest run
travel run <session_id> --from-stage 08

# Resume from a specific run's stage
travel run <session_id> --from-stage 08 --run <run_id>

# Resume with modified aggregator config
travel run <session_id> --from-stage 08 --aggregator-model gpt-5.2-pro
```

**Behavior:**
1. Load the specified stage file (e.g., `08_top_candidates.json`)
2. Validate stage file schema
3. Skip stages 01-07
4. Execute stages 08-10 with current config
5. Create new run with `mode: 'from-stage'`
6. Record `fromStage` in `run.json`

**Stage Dependency Rules:**

| Resume From | Executes | Skips |
|-------------|----------|-------|
| `02` (router_plan) | 03-10 | 01 |
| `04` (candidates_normalized) | 05-10 | 01-03 |
| `06` (candidates_ranked) | 07-10 | 01-05 |
| `08` (top_candidates) | 09-10 | 01-07 |
| `09` (aggregator_output) | 10 | 01-08 |

### 12D.2 Seed from Another Session

Create a new session using stage output from a prior session as starting point.

**Use Case:** Testing different aggregator approaches on the same candidate set.

**CLI:**
```bash
# Create new session seeded from another session's top_candidates
travel sessions:create --seed-from <session_id>/<run_id>/08_top_candidates.json

# Shorthand: seed from latest run of a session
travel sessions:create --seed-from <session_id>/08

# Seed and immediately run
travel sessions:create --seed-from <session_id>/08 --run
```

**Behavior:**
1. Create new session with new session_id
2. Copy the seed stage file into new session's first run
3. Record provenance in `run.json` (`seedSource` field)
4. Start execution from the seeded stage

### 12D.3 Import Stage File

Import an external stage file (e.g., manually curated candidates).

**CLI:**
```bash
# Import a top_candidates file
travel run <session_id> --import-stage ./my_curated_candidates.json --as 08

# Validate and import
travel run <session_id> --import-stage ./candidates.json --as 08 --validate
```

**Validation:** When importing, validate against the expected stage schema.

### 12D.4 Replay with Modified Config

Re-run downstream stages with different configuration.

**CLI:**
```bash
# Replay aggregator with different model
travel run <session_id> --from-stage 08 --aggregator-model gpt-5.2-pro

# Replay ranking with different weights
travel run <session_id> --from-stage 05 --ranking-weights "relevance:0.4,credibility:0.3,recency:0.2,diversity:0.1"

# Replay with verbose logging
travel run <session_id> --from-stage 08 --verbose
```

---

## 12E. CLI Commands for Stage Management

### 12E.1 Stage Inspection

```bash
# List all stages in a run
travel stages:list <session_id> [--run <run_id>]

# Output:
# ✓ 01_intake.json              (1.2 KB, 2026-01-02 14:35:12)
# ✓ 02_router_plan.json         (3.4 KB, 2026-01-02 14:35:14)
# ✓ 03_worker_outputs/          (45.2 KB, 2026-01-02 14:35:22)
# ✓ 04_candidates_normalized    (28.1 KB, 2026-01-02 14:35:24)
# ...

# View a specific stage file
travel stages:view <session_id> --stage 08 [--run <run_id>]

# Compare stages between runs
travel stages:diff <session_id> --stage 08 --runs <run_id_1> <run_id_2>

# Export a stage file
travel stages:export <session_id> --stage 08 --output ./my_candidates.json
```

### 12E.2 Run Management with Stages

```bash
# Full run (default)
travel run <session_id>

# Run from specific stage
travel run <session_id> --from-stage <stage_number>

# Run only aggregator (shorthand)
travel run <session_id> --aggregate-only

# Run only specific workers
travel run <session_id> --workers perplexity,places

# Dry run (show what would execute)
travel run <session_id> --from-stage 08 --dry-run
```

### 12E.3 Session Creation with Seed

```bash
# Create session with seed
travel sessions:create \
  --destination "Japan" \
  --interests "food,temples" \
  --seed-from <session_id>/08

# Create session from exported candidates
travel sessions:create \
  --destination "Japan" \
  --seed-file ./curated_candidates.json
```

---

## 12F. Functional Requirement Updates

### FR9: Stage Snapshotting and Resume

**FR9.1: Stage Persistence**
- Every pipeline stage MUST produce a JSON checkpoint file
- Stage files MUST include standard metadata (`_meta` block)
- Stage files MUST be written atomically (temp file + rename)
- Failed stages MUST NOT produce partial stage files

**FR9.2: Resume Capability**
- User MUST be able to resume from any completed stage
- Resume MUST skip all upstream stages
- Resume MUST use the exact stage file content (no re-fetching)
- Resume MUST create a new run with `mode: 'from-stage'`

**FR9.3: Seed Capability**
- User MUST be able to seed a new session from a prior stage file
- Seed MUST copy the stage file (not reference)
- Seed MUST record provenance in run.json

**FR9.4: Manifest Integrity**
- Every run MUST produce a manifest.json
- Manifest MUST include SHA-256 hash of each stage file
- Manifest MUST record execution order and skipped stages

**FR9.5: Human-Readable IDs**
- Session IDs MUST follow format: `YYYYMMDD-<slug>`
- Run IDs MUST follow format: `YYYYMMDD-HHMMSS[-mode]`
- Slug MUST be derived from session destination and interests
- ID collisions MUST be handled with numeric suffix

---

## 12G. Implementation Notes

### 12G.1 Stage File Writing

```typescript
async function writeStageFile<T extends { _meta: StageMetadata }>(
  runDir: string,
  stageId: string,
  data: T
): Promise<void> {
  const stagesDir = path.join(runDir, 'stages');
  await fs.mkdir(stagesDir, { recursive: true });

  const filename = `${stageId}.json`;
  const filepath = path.join(stagesDir, filename);
  const tempPath = `${filepath}.tmp.${Date.now()}`;

  // Ensure metadata is complete
  data._meta = {
    ...data._meta,
    stageId,
    createdAt: new Date().toISOString(),
  };

  // Atomic write
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempPath, content, 'utf-8');
  await fs.rename(tempPath, filepath);

  // Update manifest
  await updateManifest(runDir, stageId, filepath, content);
}
```

### 12G.2 Slug Generation

```typescript
function generateSessionSlug(session: { destinations: string[]; interests: string[] }): string {
  const stopwords = new Set(['the', 'a', 'an', 'trip', 'plan', 'to', 'in', 'for', 'my', 'our', 'and', 'or']);

  const tokens = [
    ...session.destinations,
    ...session.interests,
  ]
    .join(' ')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')           // Remove punctuation
    .split(/\s+/)
    .filter(t => t.length > 0 && !stopwords.has(t))
    .slice(0, 6);                        // Max 6 tokens

  let slug = tokens.join('-');

  // Collapse multiple hyphens
  slug = slug.replace(/-+/g, '-');

  // Trim to max length at word boundary
  if (slug.length > 50) {
    slug = slug.substring(0, 50).replace(/-[^-]*$/, '');
  }

  return slug || 'session';
}

function generateSessionId(session: Session): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const slug = generateSessionSlug(session);
  return `${date}-${slug}`;
}
```

### 12G.3 Resume Orchestration

```typescript
async function executeRun(
  sessionId: string,
  options: {
    fromStage?: number;
    runId?: string;        // Source run for resume
    importFile?: string;   // External file to import
  }
): Promise<RunResult> {
  const startStage = options.fromStage ?? 1;

  // Load stage file if resuming
  let stageData: unknown = null;
  if (startStage > 1) {
    const sourceRunId = options.runId ?? await getLatestRunId(sessionId);
    stageData = await loadStageFile(sessionId, sourceRunId, startStage - 1);
  }

  // Create new run
  const runId = generateRunId(startStage === 1 ? 'full' : `from-${STAGE_NAMES[startStage]}`);
  const runDir = await initializeRunDirectory(sessionId, runId);

  // Record run config
  await writeRunConfig(runDir, {
    mode: startStage === 1 ? 'full' : 'from-stage',
    fromStage: startStage > 1 ? STAGE_NAMES[startStage - 1] : undefined,
    // ... other config
  });

  // Execute stages
  for (let stage = startStage; stage <= 10; stage++) {
    const input = stage === startStage && stageData ? stageData : previousStageOutput;
    const output = await executeStage(stage, input, runDir);
    await writeStageFile(runDir, STAGE_NAMES[stage], output);
    previousStageOutput = output;
  }

  // Finalize
  await finalizeManifest(runDir);
  return buildRunResult(runDir);
}
```

---

## 12H. Example Workflows

### Workflow 1: Full Discovery Run

```bash
$ travel sessions:create --destination "Japan" --dates "2026-04-01" "2026-04-14" \
    --interests "food,temples"
Created session: 20260102-japan-food-temples

$ travel run 20260102-japan-food-temples
Running full discovery pipeline...
  ✓ 01_intake
  ✓ 02_router_plan
  ✓ 03_worker_outputs (perplexity, places, youtube)
  ✓ 04_candidates_normalized (47 candidates)
  ✓ 05_candidates_deduped (32 unique)
  ✓ 06_candidates_ranked
  ✓ 07_candidates_validated (8/9 verified)
  ✓ 08_top_candidates (30 selected)
  ✓ 09_aggregator_output
  ✓ 10_results

Run complete: 20260102-143512-full
Output: ~/.travelagent/sessions/20260102-japan-food-temples/runs/20260102-143512-full/exports/results.md
```

### Workflow 2: Iterate on Aggregator

```bash
# First, check what stages are available
$ travel stages:list 20260102-japan-food-temples
Using run: 20260102-143512-full
  ✓ 01_intake.json
  ✓ 02_router_plan.json
  ✓ 03_worker_outputs/
  ✓ 04_candidates_normalized.json
  ✓ 05_candidates_deduped.json
  ✓ 06_candidates_ranked.json
  ✓ 07_candidates_validated.json
  ✓ 08_top_candidates.json
  ✓ 09_aggregator_output.json
  ✓ 10_results.json

# Resume from top_candidates with modified aggregator
$ travel run 20260102-japan-food-temples --from-stage 08 --aggregator-model gpt-5.2-pro
Resuming from stage 08_top_candidates...
  ⊘ Skipped: 01_intake through 07_candidates_validated
  ✓ 08_top_candidates (loaded from previous run)
  ✓ 09_aggregator_output
  ✓ 10_results

Run complete: 20260102-150044-from-top-candidates
```

### Workflow 3: Seed New Session

```bash
# Create new session using candidates from previous session
$ travel sessions:create --destination "Kyoto" --interests "zen,gardens" \
    --seed-from 20260102-japan-food-temples/08
Created session: 20260102-kyoto-zen-gardens
Seeded with 30 candidates from 20260102-japan-food-temples

$ travel run 20260102-kyoto-zen-gardens
Running from seeded stage 08...
  ⊘ Skipped: 01_intake through 07 (seeded)
  ✓ 08_top_candidates (seeded from 20260102-japan-food-temples)
  ✓ 09_aggregator_output
  ✓ 10_results

Run complete: 20260102-152030-from-top-candidates
```

### Workflow 4: Debug with Stage Inspection

```bash
# Something looks wrong with ranking - inspect the stage
$ travel stages:view 20260102-japan-food-temples --stage 06 | head -50

# Compare ranking between two runs
$ travel stages:diff 20260102-japan-food-temples --stage 06 \
    --runs 20260102-143512-full 20260102-150044-from-top-candidates

# Export for manual analysis
$ travel stages:export 20260102-japan-food-temples --stage 06 --output ./debug_ranking.json
```

---

## Integration with Existing PRD Sections

This section should be integrated as follows:

1. **Section 12 (Storage Layout)** — Replace or heavily expand with 12C.1 directory structure
2. **Section 8 (Functional Requirements)** — Add FR9 (Stage Snapshotting and Resume)
3. **Section 15 (CLI Specification)** — Add stage management commands from 12E
4. **Section 11 (Data Model)** — Add stage-specific types from 12B.2
5. **Appendix A (TypeScript Types)** — Add StageMetadata, RunConfig, RunManifest types

---

*End of Pipeline Stages and Stage Snapshotting Section*
