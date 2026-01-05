# Telegram-First Architecture Proposal

> **Status:** Proposal (Draft)
> **Created:** 2026-01-05
> **Author:** Claude (Opus 4.5) + Rajan
> **Context:** Session discussion on pivoting from CLI-only to Telegram-first interface

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [System Architecture Diagram](#system-architecture-diagram)
4. [Data Flow Diagrams](#data-flow-diagrams)
5. [Telegram Conversation Flow](#telegram-conversation-flow)
6. [Component Architecture](#component-architecture)
7. [Data Models (New Schemas)](#data-models-new-schemas)
8. [Gemini Video Analysis](#gemini-video-analysis)
9. [HTML Output Template](#html-output-template)
10. [Deployment Architecture](#deployment-architecture)
11. [Proposed PRD Sections](#proposed-prd-sections)
12. [Implementation Phases](#implementation-phases)
13. [Key Decisions Needed](#key-decisions-needed)
14. [Task List Impact](#task-list-impact)

---

## Executive Summary

### The Pivot

| Before | After |
|--------|-------|
| CLI tool | Telegram Bot |
| JSON/Markdown output | Static HTML on Vercel |
| Text-only input | Multimodal (text + video + image) |
| Local files | Shareable URLs |

### What Changes

The **core discovery pipeline (Tasks 1-18) remains unchanged**. We're adding:

1. A **Telegram ingestion layer** (multimodal input)
2. A **Gemini-powered media processor** (video/image understanding)
3. An **HTML generator** (replacing/augmenting markdown output)
4. **Vercel static hosting** (shareable results)

### Why Telegram?

- **No app store approval** - Instant deployment, works on all devices
- **Natural for travel content** - Users already share videos/photos in chat
- **Multimodal input** - "Show me more places like this video" is more natural than typing
- **Low barrier** - No installation, just message the bot

### Interfaces

This application will have **two interfaces**:

1. **Telegram** (Phase 1) - Primary interaction for prompts, video/image input, conversation
2. **Web** (Future Phase 2) - Dashboard for browsing sessions, advanced filtering

---

## Architecture Overview

```
User Input (Telegram)
    │
    │ text / video / image
    ▼
┌─────────────────────────────┐
│   Telegram Bot Service      │
│   • Webhook receiver        │
│   • Message routing         │
│   • Session management      │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│   Multimodal Processor      │
│   • Gemini Flash 3.0        │
│   • Video → transcript      │
│   • Image → description     │
│   • Prompt synthesis        │
└─────────────┬───────────────┘
              │
              │ unified prompt
              ▼
┌─────────────────────────────┐
│   Discovery Pipeline        │
│   (existing Stages 00-10)   │
│   • Enhancement             │
│   • Router                  │
│   • Workers                 │
│   • Normalize/Dedupe/Rank   │
│   • Validate/Aggregate      │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│   Output Generation         │
│   • HTML Generator          │
│   • Vercel Deploy           │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│   Static HTML on Vercel     │
│   travel.app/sessions/xxx   │
└─────────────────────────────┘
              │
              │ URL sent back
              ▼
┌─────────────────────────────┐
│   Telegram Response         │
│   • Session ID              │
│   • Top 3 results           │
│   • Vercel URL link         │
└─────────────────────────────┘
```

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐                              ┌──────────────────────┐   │
│   │   Telegram   │                              │    Vercel Static     │   │
│   │   Mobile/    │                              │    HTML Pages        │   │
│   │   Desktop    │                              │                      │   │
│   └──────┬───────┘                              └──────────▲───────────┘   │
│          │                                                 │               │
│          │ text, video, image                              │ view results  │
│          │ voice-to-text                                   │               │
│          ▼                                                 │               │
└──────────┼─────────────────────────────────────────────────┼───────────────┘
           │                                                 │
           │                                                 │
┌──────────┼─────────────────────────────────────────────────┼───────────────┐
│          │              TELEGRAM BOT SERVICE               │               │
├──────────┼─────────────────────────────────────────────────┼───────────────┤
│          ▼                                                 │               │
│   ┌──────────────┐     ┌──────────────┐     ┌─────────────┴────────┐      │
│   │   Webhook    │────▶│   Message    │────▶│   Response           │      │
│   │   Receiver   │     │   Router     │     │   Sender             │      │
│   └──────────────┘     └──────┬───────┘     └──────────────────────┘      │
│                               │                                            │
│                               │ dispatch by type                           │
│                               ▼                                            │
│                        ┌──────────────┐                                    │
│                        │   Session    │                                    │
│                        │   Manager    │                                    │
│                        └──────┬───────┘                                    │
│                               │                                            │
└───────────────────────────────┼────────────────────────────────────────────┘
                                │
                                │
┌───────────────────────────────┼────────────────────────────────────────────┐
│                               │    MULTIMODAL PROCESSOR                    │
├───────────────────────────────┼────────────────────────────────────────────┤
│                               ▼                                            │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐              │
│   │    Text      │     │    Video     │     │    Image     │              │
│   │   Handler    │     │   Handler    │     │   Handler    │              │
│   └──────┬───────┘     └──────┬───────┘     └──────┬───────┘              │
│          │                    │                    │                       │
│          │                    ▼                    │                       │
│          │             ┌──────────────┐            │                       │
│          │             │ Gemini Flash │            │                       │
│          │             │    3.0       │◀───────────┘                       │
│          │             │              │                                    │
│          │             │ • Transcript │                                    │
│          │             │ • Scene desc │                                    │
│          │             │ • Locations  │                                    │
│          │             │ • Places     │                                    │
│          │             └──────┬───────┘                                    │
│          │                    │                                            │
│          ▼                    ▼                                            │
│        ┌────────────────────────────────────┐                              │
│        │         Prompt Synthesizer         │                              │
│        │   (merge text + extracted info)    │                              │
│        └──────────────────┬─────────────────┘                              │
│                           │                                                │
└───────────────────────────┼────────────────────────────────────────────────┘
                            │
                            │ unified prompt
                            ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                     DISCOVERY PIPELINE (existing)                          │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐     │
│  │ Stage   │──▶│ Stage   │──▶│ Stage   │──▶│ Stage   │──▶│ Stage   │     │
│  │   00    │   │   02    │   │   03    │   │   04    │   │   05    │     │
│  │Enhance  │   │ Router  │   │ Workers │   │Normalize│   │ Dedupe  │     │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘     │
│                                                                            │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐                    │
│  │ Stage   │──▶│ Stage   │──▶│ Stage   │──▶│ Stage   │                    │
│  │   06    │   │   07    │   │   08    │   │   09    │                    │
│  │  Rank   │   │Validate │   │  Top N  │   │Aggregate│                    │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘                    │
│                                                 │                          │
│                                                 ▼                          │
│                                          ┌───────────┐                     │
│                                          │  Stage 10 │                     │
│                                          │  Results  │                     │
│                                          └─────┬─────┘                     │
│                                                │                           │
└────────────────────────────────────────────────┼───────────────────────────┘
                                                 │
                                                 │
┌────────────────────────────────────────────────┼───────────────────────────┐
│                      OUTPUT GENERATION         │                           │
├────────────────────────────────────────────────┼───────────────────────────┤
│                                                ▼                           │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐              │
│   │    JSON      │     │     HTML     │     │   Vercel     │              │
│   │   Builder    │     │   Generator  │────▶│   Deploy     │              │
│   │  (existing)  │     │    (new)     │     │    API       │              │
│   └──────────────┘     └──────────────┘     └──────┬───────┘              │
│                                                    │                       │
│                                                    │ returns URL           │
│                                                    ▼                       │
│                                    https://travel.yourdomain.app/          │
│                                         sessions/{session-id}.html         │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### Input Scenarios

#### Scenario A: Text Only

```
User: "Planning a trip to Japan in April, interested in cherry blossoms
       and hidden temples"
                    │
                    ▼
            ┌───────────────┐
            │ Direct to     │
            │ Enhancement   │
            └───────────────┘
```

#### Scenario B: Video (TikTok/Instagram)

```
User: [forwards TikTok video of Bali rice terraces]
                    │
                    ▼
            ┌───────────────┐
            │ Download      │
            │ Video File    │
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │ Gemini Flash  │
            │ 3.0 Analysis  │
            │               │
            │ Extracts:     │
            │ • Location:   │
            │   Tegallalang │
            │   Rice Terrace│
            │   Ubud, Bali  │
            │ • Activities: │
            │   Rice terrace│
            │   walk, photo │
            │   spots       │
            │ • Vibe: Serene│
            │   nature,     │
            │   instagrammable│
            │ • Transcript: │
            │   "This place │
            │   is magical..│
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │ Synthesized   │
            │ Prompt:       │
            │               │
            │ "Discover     │
            │ places like   │
            │ Tegallalang   │
            │ Rice Terraces │
            │ in Bali -     │
            │ scenic nature,│
            │ photo spots,  │
            │ serene vibes" │
            └───────────────┘
```

#### Scenario C: Image + Text

```
User: [photo of a beach sunset]
      "I want more places like this in Southeast Asia"
                    │
                    ▼
            ┌───────────────┐
            │ Gemini Flash  │
            │ Image Analysis│
            │               │
            │ Extracts:     │
            │ • Beach sunset│
            │ • Tropical    │
            │ • Relaxed vibe│
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │ Merge with    │
            │ user text     │
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │ Synthesized:  │
            │ "Beach sunset │
            │ destinations  │
            │ in Southeast  │
            │ Asia with     │
            │ tropical,     │
            │ relaxed vibes"│
            └───────────────┘
```

#### Scenario D: Multiple Videos + Text

```
User: [Video 1: Street food in Bangkok]
      [Video 2: Night market in Taipei]
      "I love this vibe, where else can I find this in Asia?"
                    │
                    ▼
            ┌───────────────┐
            │ Process each  │
            │ video with    │
            │ Gemini        │
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │ Extract       │
            │ common themes:│
            │ • Night       │
            │   markets     │
            │ • Street food │
            │ • Bustling    │
            │   atmosphere  │
            │ • Asia        │
            └───────┬───────┘
                    │
                    ▼
            ┌───────────────┐
            │ Synthesized:  │
            │ "Night markets│
            │ and street    │
            │ food scenes   │
            │ in Asia -     │
            │ bustling,     │
            │ authentic     │
            │ local         │
            │ experiences"  │
            └───────────────┘
```

---

## Telegram Conversation Flow

```
User                                          Bot
─────                                         ─────

[sends TikTok video of Santorini]
"Planning Greece trip in October"
                                              │
                                              ▼
                                    ┌─────────────────────┐
                                    │ 🔍 Processing your  │
                                    │ video...            │
                                    └─────────────────────┘
                                              │
                                    ┌─────────────────────┐
                                    │ 📍 Detected:        │
                                    │ Santorini, Greece   │
                                    │                     │
                                    │ 🎯 I found:         │
                                    │ • Sunset views      │
                                    │ • White-washed      │
                                    │   architecture      │
                                    │ • Romantic vibe     │
                                    │                     │
                                    │ Starting discovery  │
                                    │ for: "Greece in     │
                                    │ October - Santorini │
                                    │ style experiences"  │
                                    │                     │
                                    │ Session: 20261005-  │
                                    │ greece-october-     │
                                    │ santorini           │
                                    └─────────────────────┘
                                              │
                                              │ [pipeline runs ~45s]
                                              │
                                              ▼
                                    ┌─────────────────────┐
                                    │ ✅ Discovery        │
                                    │ complete!           │
                                    │                     │
                                    │ Found 28 places     │
                                    │ across 4 islands    │
                                    │                     │
                                    │ 🔗 View results:    │
                                    │ travel.app/sessions/│
                                    │ 20261005-greece-... │
                                    │                     │
                                    │ 🏆 Top 3:           │
                                    │ 1. Oia Sunset Point │
                                    │ 2. Naxos Old Town   │
                                    │ 3. Milos Beaches    │
                                    │                     │
                                    │ Reply to ask        │
                                    │ questions or        │
                                    │ refine results!     │
                                    └─────────────────────┘

"Tell me more about Milos"
                                              │
                                              ▼
                                    ┌─────────────────────┐
                                    │ 🏝️ Milos Highlights:│
                                    │                     │
                                    │ • Sarakiniko Beach  │
                                    │   (lunar landscape) │
                                    │ • Kleftiko (boat    │
                                    │   access caves)     │
                                    │ • Plaka village     │
                                    │   sunset            │
                                    │                     │
                                    │ Less crowded than   │
                                    │ Santorini, great    │
                                    │ for Oct weather.    │
                                    │                     │
                                    │ Sources: [links]    │
                                    └─────────────────────┘

"Add this to my must-visit list"
                                              │
                                              ▼
                                    ┌─────────────────────┐
                                    │ ✅ Added Milos to   │
                                    │ your must-visit     │
                                    │ list (3 items now)  │
                                    │                     │
                                    │ Updated results:    │
                                    │ travel.app/sessions/│
                                    │ 20261005-greece-... │
                                    └─────────────────────┘
```

---

## Component Architecture

### New Directory Structure

```
src/
├── telegram/                    # NEW: Telegram Bot Service
│   ├── index.ts                 # Bot initialization
│   ├── bot.ts                   # Telegram bot instance
│   ├── webhook.ts               # Webhook handler (for serverless)
│   ├── handlers/
│   │   ├── text.ts              # Text message handler
│   │   ├── video.ts             # Video message handler
│   │   ├── photo.ts             # Photo message handler
│   │   ├── document.ts          # Document handler (video files)
│   │   └── callback.ts          # Inline button callbacks
│   ├── middleware/
│   │   ├── auth.ts              # User authentication/allowlist
│   │   ├── rate-limit.ts        # Rate limiting
│   │   └── session.ts           # Session context middleware
│   └── responses/
│       ├── templates.ts         # Message templates
│       └── keyboards.ts         # Inline keyboards
│
├── multimodal/                  # NEW: Multimodal Processing
│   ├── index.ts
│   ├── processor.ts             # Main processor orchestrator
│   ├── video/
│   │   ├── downloader.ts        # Download video from Telegram
│   │   ├── analyzer.ts          # Gemini video analysis
│   │   └── extractor.ts         # Extract travel info from analysis
│   ├── image/
│   │   ├── analyzer.ts          # Gemini image analysis
│   │   └── extractor.ts         # Extract travel info
│   ├── synthesizer.ts           # Merge multimodal inputs into prompt
│   └── prompts/
│       ├── video-analysis.ts    # Prompts for video understanding
│       └── image-analysis.ts    # Prompts for image understanding
│
├── output/                      # NEW: Output Generation
│   ├── index.ts
│   ├── html/
│   │   ├── generator.ts         # HTML page generator
│   │   ├── templates/
│   │   │   ├── base.html        # Base template
│   │   │   ├── components/      # Reusable components
│   │   │   └── styles.css       # Inline styles
│   │   └── builder.ts           # Build final HTML
│   └── vercel/
│       ├── deployer.ts          # Vercel deployment API
│       └── config.ts            # Vercel project config
│
├── sessions/                    # MODIFIED: Add Telegram context
│   ├── ...existing...
│   └── telegram-context.ts      # Link session to Telegram chat
│
└── conversation/                # NEW: Conversation Management
    ├── index.ts
    ├── context.ts               # Conversation context tracking
    ├── intents.ts               # Intent recognition
    └── responses.ts             # Response generation
```

---

## Data Models (New Schemas)

### Telegram Schemas

```typescript
// src/schemas/telegram.ts - NEW

import { z } from 'zod';

export const TelegramUserSchema = z.object({
  telegramId: z.number(),
  username: z.string().optional(),
  firstName: z.string(),
  lastName: z.string().optional(),
  allowlisted: z.boolean().default(false),
});

export const TelegramChatContextSchema = z.object({
  chatId: z.number(),
  userId: z.number(),
  sessionId: z.string().optional(),        // Link to discovery session
  conversationState: z.enum([
    'idle',
    'awaiting_input',
    'processing',
    'discovery_running',
    'results_ready',
    'discussing'
  ]),
  lastMessageAt: z.string().datetime(),
});
```

### Multimodal Input Schemas

```typescript
// src/schemas/multimodal.ts - NEW

export const MediaInputSchema = z.object({
  type: z.enum(['text', 'video', 'image']),
  content: z.string(),                      // Text content or file path
  telegramFileId: z.string().optional(),    // Telegram's file reference
  mimeType: z.string().optional(),
  processingResult: z.object({
    extractedText: z.string().optional(),
    locations: z.array(z.string()).optional(),
    activities: z.array(z.string()).optional(),
    vibes: z.array(z.string()).optional(),
    transcript: z.string().optional(),
  }).optional(),
});

export const SynthesizedPromptSchema = z.object({
  originalInputs: z.array(MediaInputSchema),
  synthesizedText: z.string(),
  confidence: z.number().min(0).max(1),
  extractedParams: z.object({
    destinations: z.array(z.string()).optional(),
    activities: z.array(z.string()).optional(),
    vibes: z.array(z.string()).optional(),
    timeframe: z.string().optional(),
  }),
});
```

### Session Schema Modifications

```typescript
// src/schemas/session.ts - MODIFIED

export const SessionSchema = z.object({
  // ...existing fields...

  // NEW: Telegram context
  telegramContext: z.object({
    chatId: z.number(),
    userId: z.number(),
    initiatedAt: z.string().datetime(),
    originalInputs: z.array(MediaInputSchema),
  }).optional(),

  // NEW: Output URLs
  outputs: z.object({
    htmlUrl: z.string().url().optional(),     // Vercel URL
    jsonPath: z.string().optional(),           // Local path
  }).optional(),
});
```

---

## Gemini Video Analysis

### Video Analysis Prompt

```typescript
// src/multimodal/prompts/video-analysis.ts

export const VIDEO_ANALYSIS_PROMPT = `
You are analyzing a travel-related video shared by a user planning a trip.

Analyze this video and extract:

1. **Locations Identified**
   - Specific place names (restaurants, attractions, beaches, etc.)
   - City/region/country
   - Coordinates if identifiable from landmarks

2. **Activities Shown**
   - What activities are people doing?
   - What experiences does this video showcase?

3. **Vibe/Atmosphere**
   - Describe the mood (romantic, adventurous, relaxing, bustling, etc.)
   - Time of day, season if apparent
   - Crowd level

4. **Travel-Relevant Details**
   - Any prices, tips, or practical info mentioned
   - Best time to visit hints
   - Any warnings or things to note

5. **Transcript** (if spoken audio)
   - Transcribe any narration or speech
   - Note the language

Output as JSON:
{
  "locations": [
    {
      "name": "Place Name",
      "type": "beach|restaurant|attraction|neighborhood|etc",
      "city": "City",
      "country": "Country",
      "confidence": 0.0-1.0
    }
  ],
  "activities": ["activity1", "activity2"],
  "vibes": ["vibe1", "vibe2"],
  "practicalInfo": {
    "bestTime": "string or null",
    "priceRange": "string or null",
    "tips": ["tip1", "tip2"]
  },
  "transcript": "Full transcript if audio present",
  "summary": "One paragraph summary of what this video shows"
}
`;
```

### Model Configuration

| Use Case | Model | Notes |
|----------|-------|-------|
| Video Analysis | Gemini Flash 3.0 | Multimodal, fast, cost-effective |
| Image Analysis | Gemini Flash 3.0 | Same model for consistency |
| Prompt Synthesis | Gemini Flash 3.0 | Merge extracted info into prompt |

---

## HTML Output Template

### Template Structure

```html
<!-- src/output/html/templates/base.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{sessionTitle}} | Travel Discovery</title>
  <style>
    /* Self-contained CSS - no external dependencies */
    :root {
      --primary: #2563eb;
      --secondary: #64748b;
      --success: #22c55e;
      --warning: #f59e0b;
      --background: #f8fafc;
      --card: #ffffff;
      --text: #1e293b;
    }
    /* ... full styles inline ... */
  </style>
</head>
<body>
  <header>
    <h1>{{sessionTitle}}</h1>
    <p class="meta">
      Discovered on {{createdAt}} • {{candidateCount}} places found
    </p>
  </header>

  <section class="summary">
    <h2>Trip Summary</h2>
    {{narrativeSummary}}
  </section>

  <section class="filters">
    <!-- Client-side filtering (vanilla JS) -->
    <button data-filter="all" class="active">All</button>
    <button data-filter="must">Must Visit ({{mustCount}})</button>
    <button data-filter="place">Places</button>
    <button data-filter="food">Food</button>
    <button data-filter="activity">Activities</button>
  </section>

  <section class="candidates">
    {{#each candidates}}
    <article class="card" data-type="{{type}}" data-triage="{{triageStatus}}">
      <div class="card-header">
        <h3>{{name}}</h3>
        <span class="badge {{origin}}">{{origin}}</span>
        {{#if validation.status}}
        <span class="validation {{validation.status}}">{{validation.status}}</span>
        {{/if}}
      </div>
      <p class="location">📍 {{location}}</p>
      <p class="description">{{description}}</p>
      <div class="sources">
        {{#each sources}}
        <a href="{{url}}" target="_blank">{{publisher}}</a>
        {{/each}}
      </div>
      <div class="actions">
        <button onclick="setTriage('{{id}}', 'must')">Must Visit</button>
        <button onclick="setTriage('{{id}}', 'maybe')">Maybe</button>
        <button onclick="setTriage('{{id}}', 'skip')">Skip</button>
      </div>
    </article>
    {{/each}}
  </section>

  <section class="cost-breakdown">
    <h2>Discovery Cost</h2>
    <table>
      <tr><td>Perplexity</td><td>${{costs.perplexity}}</td></tr>
      <tr><td>Google Places</td><td>${{costs.places}}</td></tr>
      <tr><td>Gemini</td><td>${{costs.gemini}}</td></tr>
      <tr><td><strong>Total</strong></td><td><strong>${{costs.total}}</strong></td></tr>
    </table>
  </section>

  <footer>
    <p>Session ID: {{sessionId}}</p>
    <p>Generated by Travel Discovery Orchestrator</p>
  </footer>

  <script>
    // Minimal vanilla JS for filtering and triage
    // All self-contained, no external dependencies
  </script>
</body>
</html>
```

### Output Characteristics

- **Self-contained** - No external CSS/JS dependencies
- **Mobile-first** - Responsive design for phone viewing
- **Static** - No server required, works from file:// or CDN
- **Shareable** - Each session gets a unique URL

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DEPLOYMENT TOPOLOGY                               │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                              VERCEL                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────┐    ┌─────────────────────────────────┐   │
│   │   Serverless Function   │    │      Static Files (Blob)        │   │
│   │                         │    │                                 │   │
│   │   /api/telegram         │    │   /sessions/{id}.html           │   │
│   │   (webhook endpoint)    │    │   /sessions/{id}.json           │   │
│   │                         │    │                                 │   │
│   │   Handles:              │    │   Generated per discovery       │   │
│   │   • Message routing     │    │   session, deployed via         │   │
│   │   • Pipeline trigger    │    │   Vercel Blob API               │   │
│   │   • Response sending    │    │                                 │   │
│   └────────────┬────────────┘    └─────────────────────────────────┘   │
│                │                                                        │
└────────────────┼────────────────────────────────────────────────────────┘
                 │
                 │ For long-running pipeline...
                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         BACKGROUND WORKER                                │
│                    (Vercel Functions / Modal / etc)                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Option A: Vercel Functions (with streaming/background)                │
│   - 60s timeout on Pro plan                                             │
│   - May need to split pipeline into chunks                              │
│                                                                         │
│   Option B: Modal.com (Python/serverless GPUs)                          │
│   - Better for video processing                                         │
│   - Longer timeouts                                                     │
│                                                                         │
│   Option C: Railway / Fly.io (always-on)                                │
│   - Traditional server                                                   │
│   - No timeout constraints                                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### External Services

| Service | Purpose |
|---------|---------|
| Telegram Bot API | Receive/send messages |
| Gemini Flash 3.0 | Video/image analysis |
| Perplexity API | Web knowledge worker |
| Google Places API | Places worker |
| YouTube Data API | YouTube worker |
| OpenAI API | Embeddings |
| Vercel Blob | Static file hosting |

---

## Proposed PRD Sections

### New Sections to Add

| Section | Title | Content |
|---------|-------|---------|
| **Section 20** | Telegram Interface | Bot setup, message types, conversation flow, allowlisting |
| **Section 21** | Multimodal Input Processing | Video analysis, image analysis, prompt synthesis |
| **Section 22** | HTML Output Generation | Template structure, static file generation, Vercel deployment |
| **Section 23** | Deployment Architecture | Vercel setup, webhook configuration, background processing |
| **Section 24** | Conversation Management | Context tracking, follow-up handling, triage via chat |

### Sections to Modify

| Section | Modification |
|---------|--------------|
| **Section 1** (Overview) | Add Telegram as primary interface alongside web (future) |
| **Section 3** (User Personas) | Add mobile-first Telegram user persona |
| **Section 5** (Architecture) | Add Telegram and multimodal layers to diagram |
| **Section 9** (Models) | Add Gemini Flash 3.0 for video/image processing |
| **Section 11** (Data Flow) | Update to show multimodal input → synthesis → pipeline |
| **Section 12** (Schemas) | Add TelegramContext, MediaInput, SynthesizedPrompt |

---

## Implementation Phases

```
Phase 0 (Current)     Phase 1 (Telegram)      Phase 2 (Web)
─────────────────     ──────────────────      ─────────────

CLI Interface         Telegram Bot            Web Dashboard
     │                     │                       │
     ▼                     ▼                       ▼
┌─────────┐          ┌─────────┐             ┌─────────┐
│  Text   │          │  Text   │             │  Text   │
│  Input  │          │ + Video │             │ + Video │
│  Only   │          │ + Image │             │ + Image │
└────┬────┘          └────┬────┘             │ + URL   │
     │                    │                  │ import  │
     │                    │                  └────┬────┘
     │                    │                       │
     ▼                    ▼                       ▼
┌─────────────────────────────────────────────────────┐
│           SHARED DISCOVERY PIPELINE                  │
│        (Stages 00-10 remain unchanged)              │
└─────────────────────────────────────────────────────┘
     │                    │                       │
     ▼                    ▼                       ▼
┌─────────┐          ┌─────────┐             ┌─────────┐
│  JSON   │          │  HTML   │             │  React  │
│  + MD   │          │  Static │             │  SPA    │
│ (local) │          │(Vercel) │             │(Vercel) │
└─────────┘          └─────────┘             └─────────┘
```

### Phase 0: Core Pipeline (Current - Tasks 1-18)

- CLI interface
- Text-only input
- JSON + Markdown output
- Local file storage

### Phase 1: Telegram Interface (New Tasks TBD)

- Telegram Bot integration
- Multimodal input (video, image, text)
- HTML output generation
- Vercel static deployment
- Conversation context management

### Phase 2: Web Interface (Future)

- React SPA dashboard
- Session browser
- Advanced filtering
- URL/bookmark import
- Real-time collaboration

---

## Key Decisions Needed

Before implementing Phase 1, decisions required:

### 1. Deployment Platform for Bot

| Option | Pros | Cons |
|--------|------|------|
| **Vercel Functions** | Same platform as static hosting | 60s timeout (Pro), may need chunking |
| **Railway/Fly.io** | Always-on, no timeout | Separate service to manage |
| **Modal.com** | Great for video processing | Python-focused, adds complexity |

**Recommendation:** Start with Vercel Functions, move to Railway if timeout issues arise.

### 2. Video Processing Approach

| Option | Pros | Cons |
|--------|------|------|
| Download full video → Gemini | Most accurate | Storage, bandwidth costs |
| Stream URL to Gemini | No storage needed | May not work with Telegram URLs |
| Extract key frames only | Faster, cheaper | Loses audio/narration |

**Recommendation:** Download full video (TikTok/Instagram videos are typically < 60s).

### 3. Session Storage

| Option | Pros | Cons |
|--------|------|------|
| Local filesystem (Dropbox sync) | Works with current setup | Not scalable |
| Vercel KV/Postgres | Integrated with deployment | Adds dependency |
| Supabase | Full-featured, generous free tier | Another service to manage |

**Recommendation:** Start with Vercel KV for simplicity.

### 4. Allowlisting Strategy

| Option | Pros | Cons |
|--------|------|------|
| Hardcoded user IDs | Simple | Requires redeploy to change |
| Environment variable list | Easy to update | Limited scaling |
| Database-backed with invite | Full control | More complex |

**Recommendation:** Environment variable list initially, migrate to database later.

### 5. HTML Interactivity Level

| Option | Pros | Cons |
|--------|------|------|
| Pure static (triage via Telegram) | Simplest | Less convenient |
| Local storage + sync later | Works offline | Complexity |
| Full interactive (API backend) | Best UX | Requires API |

**Recommendation:** Pure static initially, triage via Telegram commands.

---

## Task List Impact

### Unchanged Tasks (1-18)

The core discovery pipeline remains exactly as defined:

- Task 1.0: Project Foundation ✅
- Task 2.0: Schema Definitions ✅
- Tasks 3.0-18.0: Storage, Pipeline, Sessions, Workers, Stages, Results

### Modified Tasks

| Task | Modification |
|------|--------------|
| **18.0 Results Generation** | Add HTML output alongside JSON/MD |

### New Tasks (Phase 1)

| Task | Description |
|------|-------------|
| **29.0** | Telegram Bot Setup (bot creation, webhook, handlers) |
| **30.0** | Multimodal Processor (Gemini video/image analysis) |
| **31.0** | Prompt Synthesizer (merge multimodal inputs) |
| **32.0** | HTML Generator (templates, builder) |
| **33.0** | Vercel Deployment (Blob API, static hosting) |
| **34.0** | Conversation Manager (context, follow-ups, triage) |
| **35.0** | Integration Testing (Telegram end-to-end) |

---

## Summary

This proposal maintains the integrity of the existing discovery pipeline while adding a modern, mobile-first interface through Telegram. The key insight is that **the core value is in the pipeline** - the interface is just a way to invoke it and display results.

The phased approach allows us to:

1. **Complete Phase 0** (Tasks 1-18) - Get the pipeline working end-to-end
2. **Add Phase 1** (Telegram) - Make it accessible and multimodal
3. **Add Phase 2** (Web) - Provide a full dashboard experience

The static HTML output on Vercel is a clever middle ground - it provides shareable, viewable results without needing a full web application backend.

---

## Next Steps

1. **Complete current Task 3.0** (Storage Layer) through Task 18.0
2. **Finalize decisions** on deployment platform, storage, and interactivity
3. **Draft detailed PRD sections** for Telegram/multimodal
4. **Create Task 29.0-35.0** in todo list
5. **Begin Phase 1 implementation**
