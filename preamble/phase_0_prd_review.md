# PRD Review: Travel Discovery Orchestrator (Phase 0)

**Reviewed:** 2026-01-02
**Reviewer:** Claude (Senior Software Architect / AI Engineering Workflow Reviewer)
**Source Document:** `phase_0_prd_travel_discovery_orchestrator_cli_first.md`

---

## A) Executive Summary

1. **Strong foundation**: Clear problem statement, well-defined scope boundaries, and a pragmatic "prove orchestration first" approach before building UI.

2. ~~**Critical gap: Secrets management**~~: *Resolved* — `.env` file implemented with keys for Perplexity, Google AI, OpenAI, Anthropic, and OpenRouter.

3. ~~**Critical gap: Cost controls are aspirational**~~: *Design resolved, implementation pending* — Reference impl in `linkedinquotes` with `CostTracker` class, per-provider pricing, and `CostBreakdown` schema. **Confirmed requirement:** Display costs after each run.

4. ~~**Instagram worker is likely unimplementable**~~: *Resolved* — Instagram replaced with **YouTube Social Signals Worker**. YouTube Data API v3 provides search (100 units/call) + video metadata (1 unit/call) with 10,000 free units/day. Transcripts extracted via `youtube-transcript` npm package (no auth required for public videos).

5. ~~**Model map uses non-existent models**~~: *Resolved* — GPT-5.2 and Gemini 3 Flash/Pro are confirmed available via their respective APIs.

6. ~~**Ranking and clustering are black boxes**~~: *Design resolved* — Reference impl in `linkedinquotes` with 4-dimension scoring (relevance 35%, credibility 30%, recency 20%, diversity 15%) + verification boosts. Adaptation proposed.

7. **Observability is underspecified**: No tracing correlation, no cost-per-run tracking, no alerting strategy. This will hurt debugging in production.

8. ~~**Eval harness lacks grading criteria**~~: *Design resolved* — Foundational eval harness with automated checks (schema validity, candidate count, source coverage, type diversity, must-have keywords) is part of Phase 0 MVP. Extended features (regression detection, model comparison) deferred to Phase 1.

9. **Retry and timeout logic needs specifics**: "Exponential backoff" and "8 second timeout" are mentioned, but no jitter, max retries, circuit breaker, or per-provider differentiation.

10. **Good: TypeScript types and storage layout are concrete**—these are implementation-ready.

---

## B) Top Issues (Prioritized)

| Rank | Issue | Impact | Effort to Fix | Notes |
|------|-------|--------|---------------|-------|
| ~~1~~ | ~~**No secrets/API key management**~~ | ~~High~~ | ~~Low~~ | *Resolved* — `.env` file with required API keys |
| ~~2~~ | ~~**Fictional model names**~~ | ~~High~~ | ~~Low~~ | *Resolved* — GPT-5.2 and Gemini 3 models confirmed available |
| ~~3~~ | ~~**Instagram API viability**~~ | ~~High~~ | ~~Medium~~ | *Resolved* — Replaced with YouTube Data API v3 + `youtube-transcript` npm |
| ~~4~~ | ~~**No cost tracking implementation**~~ | ~~High~~ | Low | *Design resolved* — Adapt from `linkedinquotes`; implementation pending |
| ~~5~~ | ~~**Ranking formula unspecified**~~ | ~~Medium~~ | Low | *Design resolved* — Adapt 4-dimension scoring from `linkedinquotes` |
| ~~6~~ | ~~**Dedupe/clustering algorithm undefined**~~ | ~~Medium~~ | Low | *Design resolved* — Two-phase dedupe from `linkedinquotes` (hash + Jaccard 0.85) |
| ~~7~~ | ~~**Error recovery underspecified**~~ | ~~Medium~~ | ~~Low~~ | *Design resolved* — Error classification, retry with backoff+jitter, circuit breaker, graceful degradation; see Section 16.3 |
| ~~8~~ | ~~**Eval harness has no scoring rubric**~~ | ~~Medium~~ | ~~Medium~~ | *Design resolved* — Foundational checks in Phase 0 MVP |
| ~~9~~ | ~~**No schema versioning**~~ | ~~Medium~~ | ~~Low~~ | *Design resolved* — Embedded version field + lazy migration with write-back; see Section 11 |
| ~~10~~ | ~~**Vision worker prompt engineering undefined**~~ | ~~Medium~~ | ~~Low~~ | *Deferred to Phase 2+* — Vision/multimodal input out of scope for Phase 0 |

---

## C) Section-by-Section Comments

### Section 9.1: Model Map

> **Router:** Gemini 3 Flash
> ~~**Vision:** GPT-5.2~~ *(Deferred to Phase 2+)*
> **Aggregator:** GPT-5.2

**Status:** ✅ *Resolved* — These models are confirmed available:
- `gemini-3-flash-preview` — Google's balanced model for speed and intelligence
- `gpt-5.2` — OpenAI's flagship model (variants: Instant, Thinking, Pro)

**Note:** Ensure API keys are provisioned for preview/beta access where applicable. Model IDs should use the exact API identifiers:
- Router: `gemini-3-flash-preview`
- ~~Vision: `gpt-5.2`~~ *(Deferred to Phase 2+)*
- Aggregator: `gpt-5.2` or `gpt-5.2-pro` for complex reasoning

---

### Section 14: ~~Instagram~~ → YouTube Social Signals

> ~~Uses hashtag-based discovery via official APIs when available.~~

**Status:**
- ✅ **Design resolved** — Instagram replaced with YouTube
- ⏳ **Implementation pending**

**Stakeholder Decision (2026-01-02):** Instagram is unimplementable (Graph API doesn't support public hashtag search). Replace with **YouTube Social Signals Worker**.

---

#### Why YouTube is Better Than Instagram

| Aspect | Instagram | YouTube |
|--------|-----------|---------|
| Public search API | ❌ No (requires business account + approval) | ✅ Yes (`search.list`) |
| Transcript access | ❌ N/A | ✅ Yes (via `youtube-transcript` npm) |
| Travel content depth | Shallow (captions, hashtags) | Deep (vlogs, guides, reviews with full transcripts) |
| Free tier | N/A | 10,000 units/day |
| Auth for public content | OAuth required | API key only |

---

#### YouTube API Architecture

**Two-Part Approach:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    YouTube Social Signals Worker                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. YouTube Data API v3 (official, API key)                     │
│     ├── search.list → Find videos by query (100 units/call)     │
│     └── videos.list → Get metadata (1 unit/call)                │
│                                                                  │
│  2. youtube-transcript npm (unofficial, no auth)                │
│     └── Fetch transcript/captions for any public video          │
│                                                                  │
│  3. LLM (Gemini 3 Flash)                                        │
│     └── Extract travel candidates from transcript text          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

#### API Key Configuration

| API | Key Source | Env Variable | Notes |
|-----|------------|--------------|-------|
| Gemini | Google AI Studio | `GOOGLE_AI_API_KEY` | Restricted to Generative Language API |
| YouTube Data API v3 | Google Cloud Console | `YOUTUBE_API_KEY` | Separate key, restricted to YouTube API |

**Setup Steps:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select existing project (same as Gemini) or create new
3. Navigate to **APIs & Services → Library**
4. Search for "YouTube Data API v3" and click **Enable**
5. Go to **APIs & Services → Credentials**
6. Click **Create Credentials → API Key**
7. Restrict key to "YouTube Data API v3" only
8. Add to `.env` as `YOUTUBE_API_KEY`

---

#### Quota & Cost (Free Tier)

| Operation | Quota Cost | Example Usage |
|-----------|------------|---------------|
| `search.list` | 100 units | Find travel vlogs for "Tokyo food" |
| `videos.list` | 1 unit | Get video metadata (views, duration, date) |
| `youtube-transcript` | 0 units | Free (unofficial library) |
| **Daily free quota** | **10,000 units** | ~100 searches OR ~10,000 video details |

**Typical Discovery Run:**
- 5 search queries × 100 units = 500 units
- 50 video details × 1 unit = 50 units
- **Total: 550 units/run** → ~18 runs/day on free tier

---

#### Transcript Access: Critical Detail

**Official API Limitation:**
- `captions.list` (API key) → Lists available caption tracks only
- `captions.download` (OAuth 2.0) → Only works for videos YOU own

**Solution:** Use [`youtube-transcript`](https://www.npmjs.com/package/youtube-transcript) npm package:
```typescript
import { YoutubeTranscript } from 'youtube-transcript';

const transcript = await YoutubeTranscript.fetchTranscript(videoId);
// Returns: [{ text: "...", duration: 5.2, offset: 0 }, ...]
```

**Caveats:**
- Uses unofficial YouTube endpoint (could break if YouTube changes)
- Actively maintained package with 66+ dependents
- Works with auto-generated captions
- No authentication required

---

#### Implementation Flow

```typescript
async function youtubeWorker(session: Session, plan: WorkerPlan): Promise<WorkerOutput> {
  // 1. Generate search queries from session
  const queries = generateSearchQueries(session.destinations, session.interests);
  // e.g., ["Tokyo food travel vlog", "best restaurants Tokyo 2025", "Tokyo hidden gems"]

  // 2. Search YouTube for each query
  const searchResults = await Promise.all(
    queries.map(q => youtube.search.list({
      q,
      type: 'video',
      maxResults: 10,
      relevanceLanguage: 'en',
      publishedAfter: '2024-01-01T00:00:00Z', // Recent content only
      videoDuration: 'medium', // 4-20 min (skip shorts and super-long)
    }))
  );

  // 3. Get video details for top results
  const videoIds = extractUniqueVideoIds(searchResults).slice(0, 20);
  const videoDetails = await youtube.videos.list({
    id: videoIds.join(','),
    part: 'snippet,statistics,contentDetails',
  });

  // 4. Filter by quality signals
  const qualityVideos = videoDetails.filter(v =>
    v.statistics.viewCount > 10000 &&
    v.snippet.channelTitle !== 'Unknown'
  );

  // 5. Fetch transcripts
  const transcripts = await Promise.allSettled(
    qualityVideos.map(v => YoutubeTranscript.fetchTranscript(v.id))
  );

  // 6. Extract candidates via LLM
  const candidates = await extractCandidatesFromTranscripts(transcripts, session);

  return {
    workerId: 'youtube',
    candidates,
    rawData: { searchResults, videoDetails, transcripts },
  };
}
```

---

#### Candidate Extraction from Transcripts

**Prompt Strategy:**
```
Given this transcript from a travel video about {destination}:

{transcript_text}

Extract all specific places, restaurants, activities, and experiences mentioned.
For each, provide:
- name (exact name mentioned)
- type (restaurant, attraction, activity, neighborhood, etc.)
- context (what the creator said about it)
- timestamp (approximate time in video)

Only extract items with specific names, not generic references like "a nice restaurant."
```

**Output Schema:**
```typescript
interface YouTubeCandidate {
  candidateId: string;
  title: string;           // Place/activity name
  type: CandidateType;
  summary: string;         // Context from transcript
  locationText?: string;   // If mentioned
  tags: string[];          // Inferred from context
  origin: 'youtube';
  sourceRefs: [{
    url: string;           // https://youtube.com/watch?v={videoId}&t={timestamp}
    publisher: string;     // Channel name
    retrievedAt: string;
    snippet: string;       // Relevant transcript excerpt
  }];
  confidence: 'provisional';  // All YouTube candidates start provisional
  metadata: {
    videoId: string;
    channelName: string;
    viewCount: number;
    publishedAt: string;
    timestampSeconds?: number;
  };
}
```

---

#### Quality Signals for YouTube Content

| Signal | Threshold | Rationale |
|--------|-----------|-----------|
| View count | > 10,000 | Filter out low-quality content |
| Video age | < 2 years | Ensure recency |
| Duration | 4-20 min | Skip shorts and podcasts |
| Has captions | Required | Can't extract without transcript |
| Channel subscribers | > 1,000 | Baseline credibility |

---

#### Error Handling

| Scenario | Action |
|----------|--------|
| Quota exceeded (403) | Disable YouTube worker for run, log warning |
| Video has no transcript | Skip video, continue with others |
| Transcript fetch fails | Skip video, log error |
| Search returns 0 results | Return empty, don't fail run |
| Rate limit (429) | Retry with exponential backoff (max 3 attempts) |

---

#### Validation via Perplexity

YouTube-derived candidates follow the same validation flow as the original Instagram design:
- All start with `confidence: 'provisional'`
- Top N validated via Perplexity (verify place exists, correct location, not closed)
- Promoted to `verified` or marked `conflict_detected`

---

### Section 9.3: Cost and Latency Control

> Per-run token budgets per task type

**Status:**
- ✅ **Design resolved** — Reference implementation available in `linkedinquotes` project
- ⏳ **Implementation pending** — Needs adaptation for Travel Orchestrator

**Reference Implementation:** `linkedinquotes/src/utils/cost.ts`

The existing implementation provides:

1. **TokenUsage Interface** — Per-provider input/output token tracking:
   ```typescript
   interface TokenUsage {
     perplexity?: { inputTokens: number; outputTokens: number };
     gemini?: { inputTokens: number; outputTokens: number };
     openai?: { inputTokens: number; outputTokens: number };
     // ... extensible for additional providers
   }
   ```

2. **Per-Million Token Pricing** — Configurable per provider:
   ```typescript
   TOKEN_COSTS = {
     perplexity: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
     gemini: { inputPerMillion: 0.5, outputPerMillion: 3.0 },
     openai: { inputPerMillion: 10.0, outputPerMillion: 30.0 },
   }
   ```

3. **CostBreakdown Schema** — Zod-validated cost summary:
   ```typescript
   CostBreakdown = { perplexity, gemini, openai, nanoBanana, total }
   ```

4. **CostTracker Class** — Stateful accumulator with methods:
   - `addPerplexity()`, `addGemini()`, `addOpenAI()` — Record usage
   - `getCost()` — Returns CostBreakdown
   - `reset()` — Clear for new run

5. **Pre-flight Estimation** — `--print-cost-estimate` CLI flag shows costs before execution

**Adaptation for Travel Orchestrator:**
- Add providers: `anthropic`, `places` (API calls, not tokens)
- Map to tasks: Router, Workers, Aggregator, Validation *(Vision deferred to Phase 2+)*
- Store in `runs/<run_id>/cost.json`

---

### ✅ Confirmed Requirement: Display Costs After Run

**Stakeholder Decision (2026-01-02):** Costs MUST be displayed in CLI output after each discovery run.

**Required Output Format:**
```
═══════════════════════════════════════════════════════
  Discovery Run Complete
═══════════════════════════════════════════════════════
  Candidates found:     42
  Duration:             12.3s
───────────────────────────────────────────────────────
  Cost Breakdown:
    Perplexity:         $0.0450
    Gemini (Router):    $0.0012
    GPT-5.2 (Aggregator): $0.1200
    ─────────────────────────────
    Total:              $0.1662
═══════════════════════════════════════════════════════
```

**Implementation Notes:**
- Display only providers with cost > $0
- Round to 4 decimal places (show 2 if ≥ $0.01)
- Also persist to `runs/<run_id>/cost.json` for historical tracking

---

### Section 13.2: Ranking

> Score is computed using: relevance to destination and interests, source credibility weighting, validation boost, diversity bonus, redundancy penalty

**Status:**
- ✅ **Design resolved** — Reference implementation available in `linkedinquotes` project
- ⏳ **Implementation pending** — Needs adaptation for Travel Orchestrator

**Reference Implementation:** `linkedinquotes/src/schemas/scoredItem.ts` + `linkedinquotes/src/scoring/gemini.ts`

---

#### Reference: Multi-Dimensional Scoring System

The `linkedinquotes` project uses a 4-dimension scoring approach with fixed weights:

```typescript
// From scoredItem.ts
export const SCORING_WEIGHTS = {
  relevance: 0.35,           // 35% - Match to user intent
  authenticity: 0.30,        // 30% - Content quality/credibility
  recency: 0.20,             // 20% - How current
  engagementPotential: 0.15, // 15% - Community validation
} as const;

// Overall = Σ(score × weight), range 0-100
export function calculateOverallScore(scores): number {
  return Math.round(
    scores.relevance * 0.35 +
    scores.authenticity * 0.30 +
    scores.recency * 0.20 +
    scores.engagementPotential * 0.15
  );
}
```

**Verification Boost System** (applied to authenticity):
```typescript
export const VERIFICATION_BOOSTS = {
  UNVERIFIED: 0,              // No boost
  SOURCE_CONFIRMED: 25,       // +25 (1 source)
  MULTISOURCE_CONFIRMED: 50,  // +50 (2+ sources)
  PRIMARY_SOURCE: 75,         // +75 (official source)
};
// Capped at 100: Math.min(100, baseScore + boost)
```

---

#### Adaptation for Travel Discovery

**Proposed Dimensions:**

| Dimension | Weight | Travel Meaning | Scoring Method |
|-----------|--------|----------------|----------------|
| relevance | 0.35 | Match to destination + interests | LLM-assigned (Aggregator) |
| credibility | 0.30 | Source trustworthiness | Origin-based + verification boost |
| recency | 0.20 | How current the info is | Date-based heuristic |
| diversity | 0.15 | Novelty vs. similar candidates | Cluster position penalty |

**Credibility by Origin:**
```typescript
const ORIGIN_CREDIBILITY = {
  places: 90,           // Google Places = official
  web_multi: 80,        // 2+ web sources
  web_single: 60,       // 1 web source
  youtube_verified: 50, // Verified YouTube-derived
  youtube_provisional: 30, // Unverified YouTube-derived
};
```

**Verification Boost (adapted):**
```typescript
const TRAVEL_VERIFICATION_BOOSTS = {
  unverified: 0,
  partially_verified: 15,    // Some claims confirmed
  verified: 35,              // All claims confirmed
  official_source: 50,       // Tourism board, venue website
};
```

**Diversity Penalty:**
```typescript
// First of type in top N: no penalty
// Each same-type predecessor: -10 points
// Example: 3rd restaurant in results = -20 diversity penalty
```

**Redundancy Handling:**
- If candidate is in same cluster as higher-ranked candidate → exclude from final results
- Cluster representative = highest overall score in cluster

---

**Formula:**
```
overallScore = (relevance × 0.35) + (credibility × 0.30) + (recency × 0.20) + (diversity × 0.15)

Where:
- credibility = ORIGIN_CREDIBILITY[origin] + VERIFICATION_BOOST[validation]
- diversity = 100 - (sameTypePredecessorCount × 10)
- All scores capped at 100, floored at 0
```

---

### Section 13.1: Dedupe

> Cluster by normalized title similarity, location text similarity, optional embeddings

**Status:**
- ✅ **Design resolved** — Reference implementation available in `linkedinquotes` project
- ⏳ **Implementation pending** — Needs adaptation for Travel Orchestrator

**Reference Implementation:** `linkedinquotes/src/processing/dedup.ts` + `linkedinquotes/src/processing/normalize.ts`

---

#### Reference: Two-Phase Deduplication Strategy

The `linkedinquotes` project uses a sophisticated two-phase approach:

**Phase 1: Hash-Based (Exact Matches)**
```typescript
// SHA-256 hash of normalized content (first 16 hex chars)
function generateContentHash(content: string): string {
  const normalized = normalizeContent(content);
  return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}
// When duplicate hash found: keep earliest by retrievedAt timestamp
```

**Phase 2: Similarity-Based (Near-Duplicates)**
```typescript
// Jaccard Index = |intersection| / |union| on word tokens
function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeContent(a).split(' '));
  const tokensB = new Set(normalizeContent(b).split(' '));
  const intersection = [...tokensA].filter(x => tokensB.has(x));
  const union = new Set([...tokensA, ...tokensB]);
  return intersection.length / union.size;
}

// Default threshold: 0.85 (85% word overlap required)
const SIMILARITY_THRESHOLD = 0.85;
```

**Normalization Pipeline:**
```typescript
function normalizeContent(content: string): string {
  return content
    .toLowerCase()                          // Case-insensitive
    .replace(/https?:\/\/\S+/g, '')        // Remove URLs
    .replace(/[\u{1F600}-\u{1F6FF}]/gu, '') // Remove emoji
    .replace(/[^\w\s]/g, '')               // Remove punctuation
    .replace(/\s+/g, ' ')                  // Collapse whitespace
    .trim();
}
```

---

#### Adaptation for Travel Discovery

**Proposed Two-Phase Strategy:**

**Phase 1: ID-Based (Exact Matches)**
```typescript
// If Google place_id matches → immediate merge
// If normalized (title + city) hash matches → merge
function generateCandidateHash(candidate): string {
  const seed = `${candidate.placeId ?? ''}|${normalizeContent(candidate.title)}|${candidate.city}`;
  return createHash('sha256').update(seed).digest('hex').substring(0, 16);
}
```

**Phase 2: Multi-Signal Similarity**
```typescript
// Combine title similarity + location proximity
function candidateSimilarity(a, b): number {
  const titleSim = jaccardSimilarity(a.title, b.title);
  const locationSim = calculateLocationSimilarity(a, b);

  // Weighted: 60% title, 40% location
  return (titleSim * 0.6) + (locationSim * 0.4);
}

function calculateLocationSimilarity(a, b): number {
  // If both have coordinates: use haversine distance
  if (a.coords && b.coords) {
    const distanceM = haversineDistance(a.coords, b.coords);
    if (distanceM < 50) return 1.0;   // <50m = same place
    if (distanceM < 200) return 0.8;  // <200m = likely same
    if (distanceM < 500) return 0.5;  // <500m = possibly same
    return 0.0;
  }
  // Fallback: normalized city/address string match
  return jaccardSimilarity(a.location, b.location);
}

// Threshold: 0.80 (slightly lower than linkedinquotes due to multi-signal)
const CANDIDATE_SIMILARITY_THRESHOLD = 0.80;
```

**Merge Strategy:**
- Keep candidate with highest `overallScore` as cluster representative
- Preserve up to 3 alternates with different `origin` values
- Merge `sourceRefs` arrays from all cluster members

---

**Thresholds Summary:**

| Check | Threshold | Action |
|-------|-----------|--------|
| place_id exact match | — | Immediate merge |
| Content hash match | — | Immediate merge |
| Combined similarity ≥ 0.80 | 80% | Cluster together |
| Geo distance < 50m | — | locationSim = 1.0 |
| Geo distance < 200m | — | locationSim = 0.8 |
| Geo distance < 500m | — | locationSim = 0.5 |

---

### Section 11: Schema Versioning and Migration Strategy

> results.json will evolve; need migration strategy

**Status:**
- ✅ **Design resolved** — Comprehensive schema versioning strategy defined below
- ⏳ **Implementation pending** — Part of Slice A (Foundations)

---

#### 11.1 Schemas Requiring Versioning

| Schema | File Location | Evolution Risk | Notes |
|--------|---------------|----------------|-------|
| Session | `sessions/<id>/session.json` | Medium | Fields may be added (e.g., new constraint types) |
| Triage | `sessions/<id>/triage.json` | Low | Simple structure, unlikely to change much |
| DiscoveryResults | `sessions/<id>/runs/<run_id>/results.json` | **High** | Most complex, likely to evolve significantly |
| Cost | `sessions/<id>/runs/<run_id>/cost.json` | Medium | New providers, new cost dimensions |
| WorkerOutput | `sessions/<id>/runs/<run_id>/raw/<worker>.json` | Low | Per-worker, raw data, consumers tolerate variance |

**Decision:** Version `Session`, `Triage`, `DiscoveryResults`, and `Cost` schemas. Raw worker outputs are ephemeral and don't require formal versioning.

---

#### 11.2 Versioning Approach: Embedded Version Field

Each versioned JSON file includes a `schemaVersion` field at the root level:

```json
{
  "schemaVersion": 1,
  "sessionId": "abc-123",
  "title": "Japan in April"
}
```

**Why embedded version (vs. manifest file):**
- Self-contained: each file knows its own version
- No external manifest to maintain or risk getting out of sync
- Simple to implement and reason about
- Works well with local filesystem storage

**Version numbering:**
- Simple integers: `1`, `2`, `3`, etc.
- No semver (overkill for internal schemas)
- Each schema type has independent version numbers

---

#### 11.3 Migration Strategy: Lazy Migration with Write-Back

**Primary approach: Lazy migration on read**

```typescript
// When reading any versioned file:
// 1. Parse JSON
// 2. Check schemaVersion (default to 1 if missing)
// 3. If version < CURRENT_VERSION, run migration chain
// 4. Validate against current schema
// 5. Write back migrated file (atomic write)
// 6. Return typed object
```

**Why lazy migration:**
- No startup cost (CLI remains fast)
- Handles partially upgraded data gracefully
- Files are migrated on first access after upgrade
- Automatic write-back ensures migration happens once

**Atomic write-back:**
```typescript
// Write to temp file, then rename (atomic on POSIX)
const tempPath = `${filePath}.tmp.${Date.now()}`;
await fs.writeFile(tempPath, JSON.stringify(migrated, null, 2));
await fs.rename(tempPath, filePath);
```

---

#### 11.4 Version Registry and Current Versions

```typescript
// src/schemas/versions.ts
export const SCHEMA_VERSIONS = {
  session: 1,
  triage: 1,
  discoveryResults: 1,
  cost: 1,
} as const;

export type SchemaName = keyof typeof SCHEMA_VERSIONS;
export type SchemaVersion<T extends SchemaName> = typeof SCHEMA_VERSIONS[T];
```

**Single source of truth:** All current versions defined in one file. Bump version here when schema changes.

---

#### 11.5 Migration Registry Pattern

Each schema has a migration registry mapping version transitions to migration functions:

```typescript
// src/migrations/discoveryResults.ts
type MigrationFn = (data: unknown) => unknown;

const MIGRATIONS: Record<number, MigrationFn> = {
  // Version 1 → 2: Add 'origin' field with default
  1: (data: any) => ({
    ...data,
    schemaVersion: 2,
    candidates: data.candidates.map((c: any) => ({
      ...c,
      origin: c.origin ?? 'web',
    })),
  }),

  // Version 2 → 3: Rename 'score' to 'overallScore'
  2: (data: any) => ({
    ...data,
    schemaVersion: 3,
    candidates: data.candidates.map((c: any) => ({
      ...c,
      overallScore: c.score ?? c.overallScore,
      score: undefined,
    })),
  }),
};

const CURRENT_VERSION = 3;

export function migrateDiscoveryResults(data: unknown): DiscoveryResults {
  let current = data as any;
  const startVersion = current.schemaVersion ?? 1;

  // Run migration chain
  for (let v = startVersion; v < CURRENT_VERSION; v++) {
    const migrateFn = MIGRATIONS[v];
    if (migrateFn) {
      current = migrateFn(current);
    }
  }

  current.schemaVersion = CURRENT_VERSION;
  return DiscoveryResultsSchema.parse(current);
}
```

**Migration chain:** If file is v1 and current is v3, runs: v1→v2→v3 sequentially.

---

#### 11.6 Handling Missing schemaVersion

Files created before versioning was implemented won't have `schemaVersion`:

```typescript
const startVersion = data.schemaVersion ?? 1;
```

**Rule:** If `schemaVersion` is missing, treat as version 1.

---

#### 11.7 Schema Evolution Guidelines

**Safe changes (no version bump required):**
- Adding optional fields with sensible defaults
- Adding new enum values (if consumers ignore unknown values)
- Widening types in a backwards-compatible way

**Breaking changes (require version bump + migration):**
- Adding required fields (migration must provide default)
- Removing fields (migration should handle gracefully)
- Renaming fields (migration must copy old → new)
- Changing field types
- Restructuring nested objects

**Developer guidelines:**

1. **Always add new fields as optional first**
2. **Never remove fields without a migration**
3. **Document every schema version change** in `SCHEMA_CHANGELOG.md`
4. **Test migrations with real data samples** — keep fixture files for each version
5. **Migrations must be pure and idempotent** — safe to run multiple times

---

#### 11.8 Error Handling

```typescript
type MigrationResult<T> =
  | { success: true; data: T; migrated: boolean; fromVersion: number }
  | { success: false; error: string; filePath: string; fromVersion: number };

async function readAndMigrate<T>(
  filePath: string,
  migrateFn: (data: unknown) => T,
  currentVersion: number
): Promise<MigrationResult<T>> {
  try {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    const fromVersion = raw.schemaVersion ?? 1;
    const migrated = migrateFn(raw);
    const didMigrate = fromVersion < currentVersion;

    if (didMigrate) {
      await atomicWrite(filePath, migrated);
    }

    return { success: true, data: migrated, migrated: didMigrate, fromVersion };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      filePath,
      fromVersion: 0,
    };
  }
}
```

**Rules:** Never corrupt original file, log detailed errors, graceful degradation if one file fails.

---

#### 11.9 CLI Commands for Schema Management

```bash
# Check schema versions of all stored data
travel schema:status

# Migrate all data to current versions
travel schema:migrate

# Dry-run migration
travel schema:migrate --dry-run

# Validate all data against current schemas
travel schema:validate
```

---

#### 11.10 Zod Schema Integration

```typescript
// src/schemas/session.ts
import { z } from 'zod';

const SessionBase = z.object({
  sessionId: z.string().uuid(),
  title: z.string().min(1),
  destinations: z.array(z.string()).min(1),
  dateRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  interests: z.array(z.string()),
  createdAt: z.string().datetime(),
});

export const SessionSchemaV1 = SessionBase.extend({
  schemaVersion: z.literal(1),
});

// For reading (accepts any version, will be migrated)
export const SessionSchemaLoose = z.object({
  schemaVersion: z.number().optional(),
}).passthrough();

export const SessionSchema = SessionSchemaV1;
export type Session = z.infer<typeof SessionSchema>;
```

---

#### 11.11 Testing Migrations

```typescript
describe('DiscoveryResults migrations', () => {
  it('migrates v1 to current version', () => {
    const v1Data = require('./fixtures/discoveryResults.v1.json');
    const migrated = migrateDiscoveryResults(v1Data);
    expect(migrated.schemaVersion).toBe(CURRENT_VERSION);
  });

  it('handles missing schemaVersion (treats as v1)', () => {
    const legacyData = { sessionId: '...', candidates: [] };
    const migrated = migrateDiscoveryResults(legacyData);
    expect(migrated.schemaVersion).toBe(CURRENT_VERSION);
  });

  it('is idempotent', () => {
    const v1Data = require('./fixtures/discoveryResults.v1.json');
    const once = migrateDiscoveryResults(v1Data);
    const twice = migrateDiscoveryResults(once);
    expect(once).toEqual(twice);
  });
});
```

---

#### 11.12 Implementation Checklist

| Task | Slice | Priority |
|------|-------|----------|
| Add `schemaVersion` to all schemas in PRD types | A | Required |
| Create `src/schemas/versions.ts` | A | Required |
| Implement migration registry pattern | A | Required |
| Add `readSession()`, `readResults()` with migration | A | Required |
| Implement atomic write-back | A | Required |
| Add `travel schema:status` command | A | Nice-to-have |
| Add `travel schema:migrate` command | A | Nice-to-have |
| Create test fixtures for v1 schemas | A | Required |

---

### Section 16.3: Error Recovery and Reliability

> Retries with exponential backoff for transient failures

**Status:**
- ✅ **Design resolved** — Comprehensive error recovery strategy defined below
- ⏳ **Implementation pending** — Part of Slice A (Foundations)

---

#### 16.3.1 Error Classification

Not all errors are equal. Classification determines recovery strategy:

| Category | Examples | Action |
|----------|----------|--------|
| **Transient** | 429 (rate limit), 502/503/504 (server), network timeout | Retry with backoff |
| **Permanent** | 400 (bad request), 401 (auth), 403 (forbidden), 404 (not found) | Fail immediately, no retry |
| **Quota** | 403 with quota message, YouTube daily limit | Disable provider for run |
| **Partial** | Some items in batch failed | Continue with successful items |

```typescript
// src/errors/classification.ts
type ErrorCategory = 'transient' | 'permanent' | 'quota' | 'partial';

function classifyError(error: unknown, provider: string): ErrorCategory {
  if (error instanceof Error) {
    const status = (error as any).status ?? (error as any).statusCode;

    // Quota exhaustion
    if (status === 403 && error.message.includes('quota')) return 'quota';
    if (status === 429 && provider === 'youtube') return 'quota'; // YouTube daily limit

    // Transient (retryable)
    if ([429, 500, 502, 503, 504].includes(status)) return 'transient';
    if (error.message.includes('ECONNRESET')) return 'transient';
    if (error.message.includes('ETIMEDOUT')) return 'transient';

    // Permanent (don't retry)
    if ([400, 401, 403, 404, 422].includes(status)) return 'permanent';
  }

  return 'transient'; // Default to retry for unknown errors
}
```

---

#### 16.3.2 Retry Strategy: Exponential Backoff with Jitter

**Formula:**
```
delay = min(maxDelay, baseDelay * 2^attempt) + random(-jitter, +jitter)
```

**Per-Provider Configuration:**

| Provider | Max Retries | Base Delay | Max Delay | Jitter | Retryable Codes |
|----------|-------------|------------|-----------|--------|-----------------|
| Perplexity | 3 | 1000ms | 8000ms | ±500ms | 429, 500, 502, 503, 504 |
| Google Places | 2 | 500ms | 4000ms | ±200ms | 429, 500, 503 |
| OpenAI | 3 | 1000ms | 16000ms | ±1000ms | 429, 500, 529 |
| Anthropic | 3 | 1000ms | 16000ms | ±1000ms | 429, 500, 529 |
| Gemini | 3 | 1000ms | 8000ms | ±500ms | 429, 500, 503 |
| YouTube Data API | 2 | 1000ms | 4000ms | ±500ms | 429, 500, 503 |
| youtube-transcript | 2 | 500ms | 2000ms | ±200ms | Network errors |

```typescript
// src/utils/retry.ts
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
  retryableCodes: number[];
}

const RETRY_CONFIGS: Record<string, RetryConfig> = {
  perplexity: { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 8000, jitterMs: 500, retryableCodes: [429, 500, 502, 503, 504] },
  places: { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 4000, jitterMs: 200, retryableCodes: [429, 500, 503] },
  openai: { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 16000, jitterMs: 1000, retryableCodes: [429, 500, 529] },
  anthropic: { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 16000, jitterMs: 1000, retryableCodes: [429, 500, 529] },
  gemini: { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 8000, jitterMs: 500, retryableCodes: [429, 500, 503] },
  youtube: { maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 4000, jitterMs: 500, retryableCodes: [429, 500, 503] },
  'youtube-transcript': { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 2000, jitterMs: 200, retryableCodes: [] },
};

function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = Math.min(
    config.maxDelayMs,
    config.baseDelayMs * Math.pow(2, attempt)
  );
  const jitter = (Math.random() * 2 - 1) * config.jitterMs;
  return Math.max(0, exponentialDelay + jitter);
}

async function withRetry<T>(
  fn: () => Promise<T>,
  provider: string,
  context: string
): Promise<T> {
  const config = RETRY_CONFIGS[provider] ?? RETRY_CONFIGS.perplexity;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const category = classifyError(error, provider);

      if (category === 'permanent' || category === 'quota') {
        throw error; // Don't retry
      }

      if (attempt < config.maxRetries) {
        const delay = calculateDelay(attempt, config);
        console.log(`[${provider}] ${context} failed (attempt ${attempt + 1}), retrying in ${delay}ms`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
```

---

#### 16.3.3 Circuit Breaker Pattern

Prevent cascading failures by disabling providers that are consistently failing:

**Configuration:**
- **Failure threshold:** 5 consecutive failures
- **Time window:** 60 seconds
- **Recovery:** Manual reset at end of run (no auto-recovery during run)

```typescript
// src/utils/circuitBreaker.ts
interface CircuitState {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
}

class CircuitBreaker {
  private states: Map<string, CircuitState> = new Map();
  private readonly failureThreshold = 5;
  private readonly windowMs = 60_000;

  recordSuccess(provider: string): void {
    this.states.set(provider, { failures: 0, lastFailureTime: 0, isOpen: false });
  }

  recordFailure(provider: string): void {
    const state = this.states.get(provider) ?? { failures: 0, lastFailureTime: 0, isOpen: false };
    const now = Date.now();

    // Reset if outside window
    if (now - state.lastFailureTime > this.windowMs) {
      state.failures = 0;
    }

    state.failures++;
    state.lastFailureTime = now;

    if (state.failures >= this.failureThreshold) {
      state.isOpen = true;
      console.warn(`[CircuitBreaker] ${provider} disabled after ${state.failures} consecutive failures`);
    }

    this.states.set(provider, state);
  }

  isOpen(provider: string): boolean {
    return this.states.get(provider)?.isOpen ?? false;
  }

  getStatus(): Record<string, { failures: number; isOpen: boolean }> {
    const status: Record<string, { failures: number; isOpen: boolean }> = {};
    for (const [provider, state] of this.states) {
      status[provider] = { failures: state.failures, isOpen: state.isOpen };
    }
    return status;
  }
}

// Singleton for run duration
export const circuitBreaker = new CircuitBreaker();
```

**Integration with workers:**
```typescript
async function executeWorker(worker: Worker, context: WorkerContext): Promise<WorkerOutput> {
  if (circuitBreaker.isOpen(worker.provider)) {
    return {
      workerId: worker.id,
      status: 'skipped',
      reason: 'circuit_breaker_open',
      candidates: [],
    };
  }

  try {
    const result = await withRetry(() => worker.execute(context), worker.provider, worker.id);
    circuitBreaker.recordSuccess(worker.provider);
    return result;
  } catch (error) {
    circuitBreaker.recordFailure(worker.provider);
    throw error;
  }
}
```

---

#### 16.3.4 Timeout Handling

**Per-Operation Timeouts:**

| Operation | Timeout | Action on Timeout |
|-----------|---------|-------------------|
| Router (LLM) | 5s | Use default WorkerPlan |
| Worker (each) | 8s | Mark worker failed, continue |
| Transcript fetch | 5s | Skip video, continue |
| Validation (per item) | 3s | Mark as `unverified` |
| Aggregator (LLM) | 20s | Output raw candidates (degraded) |
| **Total run** | 60s | Return partial results |

```typescript
// src/utils/timeout.ts
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

class TimeoutError extends Error {
  readonly isTimeout = true;
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}
```

**Run-level timeout with partial results:**
```typescript
async function executeDiscoveryRun(session: Session): Promise<DiscoveryResults> {
  const runTimeout = 60_000;
  const startTime = Date.now();

  const results: Partial<DiscoveryResults> = {
    runId: generateRunId(),
    sessionId: session.sessionId,
    candidates: [],
    workerSummary: [],
  };

  try {
    // Router with timeout
    const workerPlan = await withTimeout(
      router.plan(session),
      5000,
      'Router'
    ).catch(() => getDefaultWorkerPlan(session));

    // Workers with individual timeouts
    const workerResults = await Promise.allSettled(
      workerPlan.workers.map(w =>
        withTimeout(executeWorker(w, { session, plan: workerPlan }), 8000, w.id)
      )
    );

    // Collect results (partial is OK)
    for (const result of workerResults) {
      if (result.status === 'fulfilled') {
        results.candidates!.push(...result.value.candidates);
        results.workerSummary!.push({ workerId: result.value.workerId, status: 'ok' });
      } else {
        results.workerSummary!.push({
          workerId: 'unknown',
          status: 'error',
          errorMessage: result.reason.message
        });
      }
    }

    // Check total run timeout
    if (Date.now() - startTime > runTimeout) {
      console.warn('Run timeout reached, returning partial results');
      return finalizeResults(results, 'timeout');
    }

    // Aggregation with timeout
    const aggregated = await withTimeout(
      aggregator.process(results.candidates!),
      20000,
      'Aggregator'
    ).catch(() => ({ candidates: results.candidates!, clusters: [] }));

    return finalizeResults({ ...results, ...aggregated }, 'complete');

  } catch (error) {
    return finalizeResults(results, 'error');
  }
}
```

---

#### 16.3.5 Graceful Degradation

**Partial Results Guarantee:** A run succeeds if at least one worker returns ≥1 candidate.

| Scenario | Degradation | User Impact |
|----------|-------------|-------------|
| Router fails | Use default WorkerPlan | Slightly less targeted queries |
| 1 worker fails | Continue with others | Fewer candidates from that source |
| All workers fail | Return empty with errors | Run marked as failed |
| Aggregator fails | Return raw candidates | No ranking/deduping |
| Validation fails | Mark as `unverified` | Lower confidence display |

**Degradation levels:**
```typescript
type DegradationLevel =
  | 'none'           // Everything succeeded
  | 'partial_workers' // Some workers failed
  | 'no_aggregation'  // Aggregator failed, raw results
  | 'timeout'         // Run timed out
  | 'failed';         // Zero candidates

interface DiscoveryResults {
  // ... existing fields
  degradation: {
    level: DegradationLevel;
    failedWorkers: string[];
    warnings: string[];
  };
}
```

**CLI output for degraded runs:**
```
═══════════════════════════════════════════════════════
  Discovery Run Complete (Partial)
═══════════════════════════════════════════════════════
  Candidates found:     28
  Duration:             14.2s
───────────────────────────────────────────────────────
  ⚠️  Warnings:
    • YouTube worker failed (quota exceeded)
    • 3 candidates could not be validated
───────────────────────────────────────────────────────
  Cost Breakdown:
    Perplexity:         $0.0450
    Gemini (Router):    $0.0012
    GPT-5.2 (Aggregator): $0.0980
    ─────────────────────────────
    Total:              $0.1442
═══════════════════════════════════════════════════════
```

---

#### 16.3.6 Error Logging and Reporting

**Structured error log format:**
```typescript
interface ErrorLogEntry {
  timestamp: string;       // ISO8601
  runId: string;
  sessionId: string;
  provider: string;
  operation: string;
  errorType: 'transient' | 'permanent' | 'quota' | 'timeout';
  statusCode?: number;
  message: string;
  attempt: number;
  maxAttempts: number;
  willRetry: boolean;
  stack?: string;          // Only in debug mode
}
```

**Error summary in run output:**
```json
{
  "runId": "abc-123",
  "errors": [
    {
      "provider": "youtube",
      "operation": "search",
      "errorType": "quota",
      "message": "Daily quota exceeded",
      "recoveryAction": "worker_disabled"
    },
    {
      "provider": "perplexity",
      "operation": "validate",
      "errorType": "transient",
      "message": "502 Bad Gateway",
      "recoveryAction": "retried_success",
      "attempts": 2
    }
  ],
  "circuitBreakerStatus": {
    "youtube": { "failures": 1, "isOpen": true },
    "perplexity": { "failures": 0, "isOpen": false }
  }
}
```

---

#### 16.3.7 Implementation Checklist

| Task | Slice | Priority |
|------|-------|----------|
| Create `src/errors/classification.ts` | A | Required |
| Create `src/utils/retry.ts` with `withRetry()` | A | Required |
| Create `src/utils/circuitBreaker.ts` | A | Required |
| Create `src/utils/timeout.ts` with `withTimeout()` | A | Required |
| Add per-provider retry configs | A | Required |
| Implement graceful degradation in run orchestrator | B | Required |
| Add error summary to run output | B | Required |
| Add `--verbose` flag for detailed error logs | B | Nice-to-have |
| Add circuit breaker status to `travel status` command | B | Nice-to-have |

---

#### 16.3.8 Testing Error Recovery

```typescript
// tests/utils/retry.test.ts
describe('withRetry', () => {
  it('retries transient errors up to maxRetries', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) throw new Error('503 Service Unavailable');
      return 'success';
    };

    const result = await withRetry(fn, 'perplexity', 'test');
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('does not retry permanent errors', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      const error = new Error('Bad Request');
      (error as any).status = 400;
      throw error;
    };

    await expect(withRetry(fn, 'perplexity', 'test')).rejects.toThrow('Bad Request');
    expect(attempts).toBe(1);
  });

  it('respects circuit breaker', async () => {
    circuitBreaker.recordFailure('test-provider');
    circuitBreaker.recordFailure('test-provider');
    circuitBreaker.recordFailure('test-provider');
    circuitBreaker.recordFailure('test-provider');
    circuitBreaker.recordFailure('test-provider');

    expect(circuitBreaker.isOpen('test-provider')).toBe(true);
  });
});
```

---

### Section 17: Evaluation Harness

> User gives a positive rating on the top 10 results in at least 80 percent of runs

**Status:**
- ✅ **Design resolved** — Foundational eval harness is part of Phase 0 MVP
- ⏳ **Extended features** — Regression detection, model comparison deferred to Phase 1

**Stakeholder Decision (2026-01-02):** The eval harness is split across phases:

### Phase 0 MVP: Foundational Eval Harness

Automated checks that run after every discovery:

```
travel eval:run --session tokyo_food

✅ Schema valid (100%)
✅ Candidate count ≥ 10 (25 found)
✅ Source coverage ≥ 90% (92% have sources)
✅ Type diversity ≥ 3 types (restaurant, market, experience)
✅ Must-have keyword "ramen" found
✅ All workers completed

RESULT: PASS
```

| Check | Criteria | Action |
|-------|----------|--------|
| Schema validity | 100% valid JSON | Fail if invalid |
| Candidate count | ≥ 10 | Warn if < 10, Fail if 0 |
| Source coverage | ≥ 90% have SourceRef | Warn |
| Type diversity | ≥ 3 types in top 10 | Warn |
| Must-have keywords | Per test case in `expected_signals.json` | Warn if missing |
| Worker health | No complete failures | Warn |

**Test Case Format:**
```json
// eval/sessions/tokyo_food/expected_signals.json
{
  "minCandidates": 15,
  "requiredTypes": ["restaurant", "market", "experience"],
  "mustHaveKeywords": ["ramen", "sushi", "izakaya"],
  "requiredOrigins": ["places", "web"],
  "maxCostUSD": 0.50
}
```

### Phase 1 Extensions (Deferred)

- Regression detection (similarity to previous runs)
- Golden candidate comparison (`golden_candidates.json`)
- Model A/B testing framework
- Cost budget enforcement with blocking
- Duration thresholds
- Weekly manual eval protocol

---

### ~~Missing: API Key Management~~ ✅ Resolved

**Status:** Implemented via `.env` file.

**Current configuration:**

| Variable | Status | Description |
|----------|--------|-------------|
| PERPLEXITY_API_KEY | ✅ Set | Perplexity Sonar API key |
| GOOGLE_AI_API_KEY | ✅ Set | Google AI/Gemini API key |
| OPENAI_API_KEY | ✅ Set | OpenAI GPT models |
| ANTHROPIC_API_KEY | ✅ Set | Anthropic Claude models |
| OPENROUTER_API_KEY | ✅ Set | OpenRouter fallback |
| YOUTUBE_API_KEY | ⏳ Needed | YouTube Data API v3 (see setup below) |
| SCRAPECREATORS_API_KEY | ✅ Set | Social scraping (optional) |

**YouTube API Key Setup:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Use existing project or create new one
3. Navigate to **APIs & Services → Library**
4. Search "YouTube Data API v3" → Click **Enable**
5. Go to **APIs & Services → Credentials** → **Create Credentials → API Key**
6. Click the new key → **Restrict key** → Select "YouTube Data API v3"
7. Add to `.env` as `YOUTUBE_API_KEY=...`

**Note:** `YOUTUBE_API_KEY` is separate from `GOOGLE_AI_API_KEY`. Both use Google Cloud infrastructure but should be restricted to their respective APIs for security.

**Recommendations for production:**
- Add `.env` to `.gitignore` (if not already)
- Create `.env.example` with placeholder values for documentation
- Consider adding `GOOGLE_PLACES_API_KEY` if using Places API directly

---

## D) Missing Sections / Missing Decisions

### Missing Sections
1. ~~**Secrets management**~~ ✅ Resolved
2. ~~**Schema versioning and migration strategy**~~ ✅ Resolved — See Section 11 (embedded version field, lazy migration, Zod integration)
3. **Prompt templates** (Router prompt, Aggregator prompt) *(Vision deferred to Phase 2+)*
4. ~~**Token estimation and budget enforcement**~~ ✅ Reference impl in `linkedinquotes/src/utils/cost.ts`
5. **Tracing correlation** (how to debug a run across workers?)
6. ~~**Cost-per-run tracking and reporting**~~ ✅ Reference impl in `linkedinquotes` (CostBreakdown, CostTracker)
7. **CLI configuration file format** (or is everything flags?)
8. ~~**Image size/format limits** for Vision worker~~ *(Deferred to Phase 2+)*
9. **Concurrency model** (how many workers in parallel? Per-provider limits?)
10. **Graceful shutdown** (what if user Ctrl+C mid-run?)

### Missing Decisions
1. ~~Which **real** LLM models to use?~~ ✅ Resolved (GPT-5.2, Gemini 3 Flash/Pro)
2. ~~What is the **fallback** if Instagram API is unavailable long-term?~~ ✅ Resolved — Instagram replaced with YouTube
3. What **embedding model** for optional similarity (if used)?
4. Should **results persist** across CLI invocations or be ephemeral?
5. Is there a **max candidates** cap per run?
6. ~~What **file size limit** for attachments?~~ *(Deferred to Phase 2+ with Vision)*
7. How are **duplicate sessions** handled (same params)?
8. Should **triage state** merge or overwrite on re-run?

---

## E) Concrete Rewrites

### Rewrite 1: Section 9.1 Model Map (Complete)

```markdown
## 9.1 Model Configuration

Phase 0 uses a task-based model map. Models can be overridden via environment variables.

| Task | Default Model | Env Override | Notes |
|------|---------------|--------------|-------|
| Router | gemini-3-flash-preview | ROUTER_MODEL | Fast, balanced speed and intelligence |
| ~~Vision Context~~ | ~~gpt-5.2~~ | ~~VISION_MODEL~~ | *Deferred to Phase 2+* |
| Worker Normalization | gemini-3-flash-preview | NORMALIZER_MODEL | Batch processing, cost-effective |
| Aggregator | gpt-5.2 | AGGREGATOR_MODEL | Strong reasoning, agentic tool-calling |
| Long Context Merge | gemini-3-pro-preview | LONG_CONTEXT_MODEL | Large context window |
| Social Validation | perplexity/sonar-pro | (not configurable) | Grounded web search |

All models must support structured output (JSON mode or tool use).
Temperature: 0.3 for Router/Normalization, 0.5 for Aggregator.
```

---

### Rewrite 2: Section 14 YouTube Social Signals (Complete Spec)

```markdown
## 14. Social Signals via YouTube (Phase 0)

### 14.1 Overview

YouTube replaces Instagram as the social signals source. Travel vlogs, guides, and reviews provide rich content that can be mined for candidate recommendations via transcript analysis.

### 14.2 YouTube Worker Architecture

```
Session (destination, interests)
    ↓
Generate Search Queries
    ↓
YouTube Data API v3 (search.list) ──→ Video IDs
    ↓
YouTube Data API v3 (videos.list) ──→ Metadata (views, duration, date)
    ↓
Filter by Quality Signals
    ↓
youtube-transcript npm ──→ Transcript Text
    ↓
LLM (Gemini 3 Flash) ──→ Extract Candidates
    ↓
Normalize to Candidate Schema (origin = youtube)
```

### 14.3 API Configuration

| Component | Auth | Env Variable | Free Tier |
|-----------|------|--------------|-----------|
| YouTube Data API v3 | API Key | `YOUTUBE_API_KEY` | 10,000 units/day |
| youtube-transcript npm | None | — | Unlimited |

**Note:** `YOUTUBE_API_KEY` is separate from `GOOGLE_AI_API_KEY` (Gemini). Both can exist in the same Google Cloud project, but keys should be restricted to their respective APIs.

### 14.4 Search Query Generation

From session parameters, generate 3-5 search queries:

```typescript
function generateSearchQueries(session: Session): string[] {
  const { destinations, interests } = session;
  const dest = destinations[0]; // Primary destination

  return [
    `${dest} travel vlog ${new Date().getFullYear()}`,
    `best ${interests[0]} ${dest}`,
    `${dest} hidden gems locals`,
    `${dest} travel guide what to do`,
    `${dest} food tour where to eat`,
  ].slice(0, 5);
}
```

### 14.5 Quality Filters

Before fetching transcripts, filter videos by:

| Signal | Threshold | Rationale |
|--------|-----------|-----------|
| View count | > 10,000 | Baseline popularity |
| Publish date | < 2 years | Recency |
| Duration | 4-20 minutes | Skip shorts and podcasts |
| Has captions | true | Required for extraction |

### 14.6 Candidate Extraction

Pass transcript to LLM with structured output:

```typescript
const extractionPrompt = `
Extract travel recommendations from this video transcript about ${destination}.

For each specific place, restaurant, activity, or experience mentioned:
- name: Exact name as mentioned
- type: restaurant | attraction | activity | neighborhood | experience | food
- context: What the creator said about it (1-2 sentences)
- sentiment: positive | neutral | mixed
- timestamp: Approximate time in video (if discernible)

Only include items with specific names. Skip generic references.
Return as JSON array.
`;
```

### 14.7 Candidate Schema

```typescript
interface YouTubeCandidate extends Candidate {
  origin: 'youtube';
  confidence: 'provisional';
  sourceRefs: [{
    url: `https://youtube.com/watch?v=${videoId}&t=${timestampSeconds}`;
    publisher: channelName;
    retrievedAt: ISO8601;
    snippet: transcriptExcerpt;
  }];
  metadata: {
    videoId: string;
    channelName: string;
    viewCount: number;
    publishedAt: string;
    timestampSeconds?: number;
  };
}
```

### 14.8 Validation

All YouTube candidates:
- Start with `confidence: 'provisional'`
- Top 10 validated via Perplexity (place exists, correct location, not permanently closed)
- Promoted to `verified` or marked `conflict_detected` / `unverified`

### 14.9 Error Handling

| Scenario | Action |
|----------|--------|
| Quota exceeded | Disable worker for run, log warning |
| No transcript available | Skip video, continue |
| Transcript fetch fails | Skip video, log error |
| Zero search results | Return empty, don't fail |
| Rate limit (429) | Exponential backoff, max 2 retries |

### 14.10 Cost Tracking

YouTube worker costs tracked as:
- `youtube_api`: Count of API calls (search + videos.list)
- `youtube_llm`: Token usage for transcript extraction (Gemini)

Typical run: ~550 API units + ~5,000 LLM tokens
```

---

### Rewrite 3: New Section - Observability

```markdown
## 16.5 Observability

### Structured Logging

All log entries include:
```json
{
  "timestamp": "ISO8601",
  "level": "info|warn|error",
  "run_id": "uuid",
  "session_id": "uuid",
  "worker_id": "string",
  "event": "string",
  "duration_ms": "number",
  "tokens_used": { "input": 0, "output": 0 },
  "error_code": "string|null"
}
```

Log destination: stdout (JSON lines format). Users can pipe to file or log aggregator.

### Cost Tracking

Each run produces a cost summary:
```json
{
  "run_id": "...",
  "total_llm_tokens": { "input": 45000, "output": 8000 },
  "estimated_cost_usd": 0.20,
  "by_task": {
    "router": { "tokens": 3000, "cost": 0.01 },
    "workers": { "tokens": 30000, "cost": 0.12 },
    "aggregator": { "tokens": 18000, "cost": 0.07 }
  },
  "api_calls": {
    "perplexity": 3,
    "google_places": 12,
    "youtube": 55
  }
}
```

Cost summary is appended to `runs/<run_id>/cost.json` and displayed in CLI output.

### Tracing

Each run generates a trace file `runs/<run_id>/trace.json`:
- Ordered list of events with timestamps
- Parent-child relationships (run → worker → LLM call)
- Enables post-hoc debugging without live tracing infrastructure

### Alerts (Phase 0: Manual)

CLI warns at end of run if:
- Any worker failed completely
- Cost exceeded 2× expected budget
- Run duration exceeded 60 seconds
- Zero candidates produced
```

---

### Rewrite 4: Section 17 Eval Harness (Phase 0 MVP + Phase 1)

```markdown
## 17. Evaluation Harness

### 17.1 Evaluation Dataset

30 curated session prompts stored in `eval/sessions/`:

| Category | Count | Example |
|----------|-------|---------|
| A: Vague/Exploratory | 8 | "Somewhere warm in March" |
| B: Specific Destination | 10 | "Japan in April, temples and food" |
| C: Constrained | 7 | "Family-friendly, wheelchair accessible" |
| D: Multi-city | 5 | "10 days: Tokyo → Kyoto → Osaka" |

Each session includes:
- `input.json`: Session parameters
- `expected_signals.json`: Must-have candidate types, origins, keywords

### 17.2 Phase 0 MVP: Foundational Automated Checks

Run via `travel eval:run`:

| Check | Criteria | Action |
|-------|----------|--------|
| Schema validity | 100% valid JSON | Fail if invalid |
| Candidate count | ≥ 10 | Warn if < 10, Fail if 0 |
| Source coverage | ≥ 90% have SourceRef | Warn |
| Type diversity | ≥ 3 types in top 10 | Warn |
| Must-have keywords | Per `expected_signals.json` | Warn if missing |
| Worker health | No complete failures | Warn |

**Example `expected_signals.json`:**
```json
{
  "minCandidates": 15,
  "requiredTypes": ["restaurant", "market", "experience"],
  "mustHaveKeywords": ["ramen", "sushi", "izakaya"],
  "requiredOrigins": ["places", "web"],
  "maxCostUSD": 0.50
}
```

**Example Output:**
```
travel eval:run --session tokyo_food

✅ Schema valid (100%)
✅ Candidate count ≥ 10 (25 found)
✅ Source coverage ≥ 90% (92% have sources)
✅ Type diversity ≥ 3 types (restaurant, market, experience)
✅ Must-have keyword "ramen" found
✅ All workers completed

RESULT: PASS
```

### 17.3 Phase 0 MVP: Running Evals

```bash
# Full automated suite
travel eval:run

# Single session
travel eval:run --session japan_april

# With cost tracking
travel eval:run --track-cost
```

### 17.4 Phase 1 Extensions (Deferred)

**Regression Checks** — For sessions with `golden_candidates.json`:
- Jaccard similarity of top-10 candidate titles ≥ 0.5
- All must-have keywords appear in at least one candidate
- Alert if similarity drops > 20% from previous run

**Model Comparison Framework:**
- Run same 30 prompts against different model configs
- Compare: schema validity, candidate count, source coverage, cost/run, duration
- Generate comparison report for model selection decisions

**Manual Evaluation Protocol (Weekly):**
- Sample 5 runs
- Rate top 10 candidates: Relevant (2) / Partial (1) / Irrelevant (0)
- Compute score: (sum / 20) × 100%
- Target: ≥ 80% average across sample
- Results logged to `eval/reports/<date>.md`

**Additional Phase 1 Commands:**
```bash
# Generate report with regression analysis
travel eval:report --last 10

# Model comparison
travel eval:compare --models "gpt-5.2,gemini-3-pro"
```
```

---

### Rewrite 5: FR2 Discovery Run (Error Handling Detail)

```markdown
### FR2: Discovery Run Orchestration

A discovery run executes as follows:

1. **Initialization**
   - Generate `run_id` (UUIDv4)
   - Create `runs/<run_id>/` directory
   - Load session
   - Initialize cost tracker (zero tokens)

2. ~~**Vision Processing** (if attachments present)~~ *(Deferred to Phase 2+)*

3. **Routing**
   - Generate WorkerPlan via Router model
   - Timeout: 5 seconds
   - On failure: Use default WorkerPlan (all workers, standard queries)

4. **Worker Execution**
   - Execute all planned workers via `Promise.allSettled`
   - Per-worker timeout: 8 seconds (configurable per worker)
   - Concurrency limit: 3 simultaneous external API calls
   - Store raw output to `raw/<worker>.json` regardless of success/failure

5. **Normalization**
   - Convert each worker's raw output to Candidate[]
   - Timeout: 10 seconds per worker's output
   - On failure: Skip that worker's candidates, log error

6. **Social Validation** (if social candidates present)
   - Validate top N social candidates via Perplexity
   - N = min(10, social_candidate_count)
   - Timeout: 3 seconds per validation
   - On failure: Mark as `unverified`, continue

7. **Aggregation**
   - Dedupe, cluster, rank all candidates
   - Generate `results.json` and `results.md`
   - Timeout: 20 seconds
   - On failure: Output raw candidates without ranking (degraded mode)

8. **Finalization**
   - Write cost summary to `cost.json`
   - Write trace to `trace.json`
   - Update session's last_run_id
   - Return summary to CLI

**Partial Results Guarantee**: If at least one worker returns ≥1 candidate, the run succeeds with partial results. Empty runs (0 candidates) are marked as failures.
```

---

## F) Revised PRD Outline

```markdown
# Phase 0 PRD: Travel Discovery Orchestrator (CLI-first)

## 1. Executive Summary
- One paragraph: what, why, success criteria

## 2. Problem Statement
- User pain points
- Why CLI-first validates the core hypothesis

## 3. Goals & Success Metrics
- 4-5 measurable goals with specific thresholds
- Table format: Goal | Metric | Target | Measurement Method

## 4. Personas & User Journeys
- 2-3 personas with JTBD
- 3 user journeys with step-by-step flows

## 5. Scope
- In-scope (bulleted)
- Out-of-scope (bulleted)
- Assumptions (explicit list)
- Dependencies (external services, APIs)

## 6. Architecture
- System diagram (Mermaid)
- Component descriptions (1-2 sentences each)
- Data flow narrative

## 7. Functional Requirements
- FR1: Session Management (CRUD operations)
- FR2: Discovery Run Orchestration (detailed flow with error handling)
- FR3: Router (input/output contract, prompt template reference)
- ~~FR4: Vision Context Worker (input/output, limits)~~ *(Deferred to Phase 2+)*
- FR5: Workers (per-worker spec: API, output schema, error handling)
- FR6: Social Validation (algorithm, thresholds)
- FR7: Aggregator (dedupe algorithm, ranking formula, output generation)
- FR8: Triage (state machine, persistence rules)
- FR9: Export (bundle contents, format)

## 8. Data Model
- Entity schemas with TypeScript types
- Storage layout with example paths
- Schema versioning strategy

## 9. Model & API Configuration
- Model map table (real model IDs)
- Per-task token budgets
- Retry configuration table
- Secrets/environment variables

## 10. Ranking & Quality
- Dedupe algorithm (pseudocode)
- Ranking formula (with weights)
- Diversity constraints (implementation)

## 11. CLI Specification
- Command reference (all commands with flags)
- Configuration file format (if any)
- Example session transcript

## 12. Non-Functional Requirements
- Performance targets (table)
- Cost controls (enforcement mechanism)
- Reliability (retry, circuit breaker)
- Security (secrets, PII)
- Observability (logging, tracing, cost tracking)

## 13. Evaluation Harness
- Dataset specification
- Automated checks (CI)
- Manual eval protocol
- Regression detection

## 14. Risks & Mitigations
- Table: Risk | Impact | Likelihood | Mitigation

## 15. Delivery Slices
- Slice A-E with concrete deliverables per slice
- Acceptance criteria per slice

## 16. Open Questions
- Resolved questions (with decisions)
- Unresolved questions (with owners)

## Appendices
- A: TypeScript Types (complete)
- B: results.md Template
- C: Prompt Templates (Router, Aggregator) *(Vision deferred to Phase 2+)*
- D: Example results.json
- E: Eval Dataset Sample
```

---

## G) Questions to Ask Stakeholders

### Scope & Priority
1. ~~Is Instagram support truly required for Phase 0, or can it be deferred given API limitations?~~ ✅ *Resolved — Instagram replaced with YouTube*
2. What is the maximum acceptable cost per discovery run? ($0.25? $0.50? $1.00?)
3. Should Phase 0 support offline mode (cached results only)?
4. ~~Is multimodal input (images) required for Phase 0, or is it a nice-to-have?~~ ✅ *Resolved — Deferred to Phase 2+*

### Technical Decisions
5. Which LLM provider is preferred for primary workloads: OpenAI, Anthropic, or Google?
6. Should we use embeddings for dedupe, or is fuzzy string matching sufficient for Phase 0?
7. What is the maximum number of candidates to return per run? (20? 50? 100?)
8. Should session data be encrypted at rest on the local filesystem?

### Data & Quality
9. Do you have existing travel data or curated lists to seed the eval dataset?
10. What constitutes a "good" candidate? Can we get 5-10 examples of ideal outputs?
11. How should we handle candidates for permanently closed venues?
12. Should we filter out candidates with low ratings (e.g., < 3.5 stars on Google)?

### User Experience
13. Is the CLI interactive (prompts for input) or purely flag-based?
14. Should discovery runs show real-time progress, or just final results?
15. How should triage conflicts be handled if the same candidate appears in a re-run with different data?
16. What should the CLI do if a run exceeds 60 seconds? Timeout and show partial, or wait?

### Operations & Rollout
17. Who is the target user for Phase 0? Just you, or a small set of testers?
18. Do we need usage analytics in Phase 0, or is that Phase 1?
19. What is the plan if Perplexity or Google Places has an extended outage?
20. Should we support multiple concurrent discovery runs, or is one-at-a-time sufficient?

---

## Summary

This PRD has a solid conceptual foundation but needs implementation-level detail in several areas before engineering can begin. The highest priorities are:

1. ~~**Immediate**: Add secrets management section~~ — *Done* (`.env` implemented, model names confirmed valid)
2. ~~**Before Slice B**: Define dedupe thresholds~~ — *Done* (~~ranking algorithm~~, ~~cost enforcement~~, ~~dedupe~~ — all have reference impls)
3. ~~**Eval harness scoring**~~ — *Done* — Foundational eval harness (schema validity, candidate count, source coverage, type diversity, must-have keywords) is part of Phase 0 MVP. Extended features (regression, model comparison) deferred to Phase 1.
4. ~~**Before Slice D**: Resolve Instagram API viability or provide alternative~~ — *Done* — Instagram replaced with YouTube Social Signals Worker (YouTube Data API v3 + `youtube-transcript` npm)
5. **Throughout**: Add prompt templates as appendices (Router, Aggregator, YouTube extraction), tracing strategy (~~cost tracking~~ — reference impl available)
6. ~~**Vision/multimodal input**~~ — *Deferred to Phase 2+*
7. ~~**Schema versioning**~~ — *Done* — Embedded version field + lazy migration with write-back; see Section 11
8. ~~**Error recovery**~~ — *Done* — Error classification, exponential backoff with jitter, circuit breaker, graceful degradation; see Section 16.3

The revised outline above transforms this from a "what we want" document into a "how to build it" specification.
