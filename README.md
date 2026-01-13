# Travel Discovery Orchestrator

An ambitious multi-stage CLI discovery engine for travel planning that orchestrates parallel data sources to generate ranked, validated, and source-attributed travel recommendations.

> **Status:** Phase 0 (CLI-first MVP). Telegram bot integration planned for Phase 1.

## The Vision

Transform vague travel prompts like "I want to explore Japan for 2 weeks" into actionable, ranked recommendations with full provenance — combining web knowledge, official place data, and creator insights from YouTube travel vlogs.

## Features

- **Multi-Source Discovery** — Parallel execution of Perplexity (web), Google Places (POI), and YouTube (creator recommendations)
- **Intelligent Deduplication** — Two-phase: exact matching (hash/place ID) + similarity (Jaccard + haversine distance)
- **Multi-Dimensional Ranking** — Balanced scoring: relevance (35%), credibility (30%), recency (20%), diversity (15%)
- **Social Validation** — Top YouTube candidates verified via Perplexity web search
- **Prompt Enhancement** — 5-dimensional analysis with interactive clarifying questions
- **Stage-Based Pipeline** — Resume from any checkpoint with `--from-stage`
- **Cost Tracking** — Per-provider metering with breakdown display
- **Vector Context Memory** — LanceDB persistence for session continuity

## Architecture

```
User Prompt (natural language)
    ↓
[Stage 00] Enhancement: Clarify & extract structured params
    ↓
[Stage 01] Intake: Snapshot session parameters
    ↓
[Stage 02] Router: Parse intent, generate worker queries
    ↓
[Stage 03] Workers (parallel, 8s timeout each):
    • Perplexity: Web knowledge research
    • Google Places: POI discovery
    • YouTube: Travel vlog transcript mining
    ↓
[Stage 04] Normalize: Convert all outputs → Candidate schema
    ↓
[Stage 05] Dedupe: Hash-based + similarity-based clustering
    ↓
[Stage 06] Rank: Multi-dimensional scoring
    ↓
[Stage 07] Validate: Verify top N YouTube candidates
    ↓
[Stage 08] Top Candidates: Select & diversity-constrain top 30
    ↓
[Stage 09] Aggregator: Generate structured narrative
    ↓
[Stage 10] Results: Export results.json + results.md
```

**Key Design Principles:**
- **Checkpoint Everything** — Every stage writes JSON checkpoint for resume capability
- **Partial Results Guarantee** — If ≥1 worker returns ≥1 candidate, run succeeds
- **Graceful Degradation** — Worker failures don't cascade; missing sources logged
- **Schema Versioning** — Zod validation with lazy migration framework

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 18+ (ESM) |
| Language | TypeScript 5.9 (strict mode) |
| Validation | Zod 4.3 with schema versioning |
| Vector DB | LanceDB (embedded) |
| Embeddings | OpenAI text-embedding-3-small |
| Web Research | Perplexity Sonar API |
| Places | Google Places API |
| Video Search | YouTube Data API v3 |
| Transcripts | youtube-transcript |
| Router/Enhancement | Gemini 3 Flash |
| Aggregator | GPT-5.2 |

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Add: OPENAI_API_KEY, PERPLEXITY_API_KEY, GOOGLE_AI_API_KEY,
#      GOOGLE_PLACES_API_KEY, YOUTUBE_API_KEY

# Run discovery
npm run dev -- "2 weeks in Japan, interested in food and temples"
```

## Usage Examples

```bash
# Basic discovery
travel run "Exploring Vietnam for 10 days"

# Resume from specific stage
travel run <session> --from-stage 08

# Quick draft (skip validation)
travel run "Weekend in Bali" --fast

# List sessions
travel sessions list

# Export results
travel export <session> --format markdown
```

## Output Structure

```
~/.travelagent/sessions/<session_id>/
├── session.json           # Session configuration
├── 00_enhancement.json    # Prompt enhancement results
├── triage.json            # User decisions (must/research/maybe)
└── runs/<run_id>/
    ├── 01_intake.json through 10_results.json
    ├── cost.json          # Per-provider cost breakdown
    ├── manifest.json      # Stage checksums
    └── exports/
        ├── results.json   # Machine-readable output
        └── results.md     # Human-readable report
```

## Data Sources

| Source | Purpose | Output |
|--------|---------|--------|
| **Perplexity** | Web knowledge, grounded citations | Destinations, activities, tips |
| **Google Places** | Official POI discovery | Restaurants, attractions, ratings |
| **YouTube** | Creator recommendations from transcripts | Hidden gems, local insights |

## Ranking System

Candidates are scored across 4 dimensions:

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Relevance | 35% | Match to destination + interests |
| Credibility | 30% | Origin-based (Places: 90, Web: 60-80, YouTube: 30-50) |
| Recency | 20% | Publication date heuristic |
| Diversity | 15% | Penalty for same-type clustering |

**Verification Boost:** Validated YouTube candidates receive +35 (verified) or +15 (partial) boost.

## Prompt Enhancement

The system analyzes prompts across 5 travel-specific dimensions:

1. **Destination Specificity** (30%) — How specific is the location?
2. **Temporal Clarity** (25%) — Are dates/duration defined?
3. **Interest Articulation** (20%) — What activities are desired?
4. **Constraint Definition** (15%) — Budget, mobility, dietary needs?
5. **Trip Type** (10%) — Solo, family, adventure, relaxation?

If ambiguous, the system asks 2-4 clarifying questions before proceeding.

## Cost Tracking

Every API call is metered with per-provider breakdown:

```
Cost Breakdown:
  Perplexity:         $0.0450
  Gemini (Router):    $0.0012
  GPT-5.2 (Agg):      $0.1200
  ─────────────────────────────
  Total:              $0.1662
```

## Triage State

Mark candidates for planning:

| Status | Description |
|--------|-------------|
| `must` | Definitely want to visit |
| `research` | Need more information |
| `maybe` | Consider if time permits |

Triage decisions persist across discovery reruns.

## Project Structure

```
src/
├── pipeline/       # 11-stage execution framework
├── workers/        # Pluggable data source workers
│   ├── perplexity/ # Web knowledge
│   ├── places/     # Google Places
│   └── youtube/    # Video transcripts
├── stages/         # Stage implementations
├── enhancement/    # Prompt clarification
├── router/         # Query generation
├── aggregator/     # Narrative generation
├── schemas/        # Zod schemas + migrations
├── storage/        # Filesystem persistence
├── sessions/       # Session management
├── context/        # LanceDB vector persistence
├── cost/           # Per-provider metering
└── cli/            # Command definitions
```

## Phase 1: Telegram Bot (Planned)

```
Telegram → Vercel (webhook) → Job Queue → Mac Studio (worker) → Results
                ↓
           Vercel Blob (static HTML)
```

- Async processing with immediate acknowledgment
- Static HTML results served from CDN
- Mac Studio handles long-running discovery pipeline

## API Keys Required

| Key | Purpose | Required |
|-----|---------|----------|
| `OPENAI_API_KEY` | Embeddings & aggregator | Yes |
| `PERPLEXITY_API_KEY` | Web knowledge worker | Yes |
| `GOOGLE_AI_API_KEY` | Gemini (router, enhancement) | Yes |
| `GOOGLE_PLACES_API_KEY` | Places worker | Yes |
| `YOUTUBE_API_KEY` | YouTube search | Yes |

## Documentation

- **PRD:** `docs/phase_0_prd_unified.md` — Comprehensive requirements (118KB)
- **Telegram Spec:** `docs/telegram-architecture-v2.md` — Bot architecture
- **QA Tracking:** `docs/QA-Fix-Tracker.md` — Issue tracking

## Roadmap

- **Phase 0 (Current):** CLI-first discovery orchestrator
- **Phase 1:** Telegram bot with async job processing
- **Phase 2:** Multimodal input (images, screenshots)
- **Phase 3:** Booking integrations

## License

Private project.
