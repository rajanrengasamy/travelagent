# Telegram Architecture Proposal v2

> **Status:** Architecture Specification
> **Version:** 2.0
> **Created:** 2026-01-05
> **Authors:** Rajan, Claude (Opus 4.5)
> **Based On:** telegram-architecture-proposal.md, telegram-architecture-proposal-codex.md

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Principles](#2-architecture-principles)
3. [System Architecture](#3-system-architecture)
4. [Component Deep Dive](#4-component-deep-dive)
5. [Data Flow & Job Pipeline](#5-data-flow--job-pipeline)
6. [Data Models](#6-data-models)
7. [Telegram Bot Design](#7-telegram-bot-design)
8. [Mac Studio Operations](#8-mac-studio-operations)
9. [Security Model](#9-security-model)
10. [Failure Modes & Recovery](#10-failure-modes--recovery)
11. [Publishing Strategy](#11-publishing-strategy)
12. [Implementation Tasks](#12-implementation-tasks)
13. [Decision Log](#13-decision-log)
14. [Risk Register](#14-risk-register)

---

## 1. Executive Summary

### 1.1 The Architecture

This proposal defines a **hybrid architecture** that leverages:

| Component | Role | Why |
|-----------|------|-----|
| **Vercel** | Public webhook endpoint + static hosting | Clean security boundary, global CDN, free tier |
| **Mac Studio** | Durable job worker + state store | Sustained compute, no timeout limits, local storage |
| **Job Queue** | Async coordination | Decouples ingestion from processing, enables recovery |

### 1.2 Key Clarification: Mac Studio Role

The Mac Studio is an **orchestrator**, NOT an inference server. It:
- **DOES**: Run the worker process, call cloud APIs, store session data, generate HTML
- **DOES NOT**: Host LLMs, run model inference locally, serve public endpoints

All AI inference happens via cloud APIs:
| Task | API Used |
|------|----------|
| Video/Image analysis | Gemini Flash 3.0 (Google AI) |
| Web knowledge | Perplexity API |
| Prompt enhancement | Gemini / GPT / Claude (configurable) |
| Aggregation | GPT-5.2 / Claude (configurable) |
| Embeddings | OpenAI text-embedding-3-small |

### 1.3 Key Architectural Decision

**Option B from Codex review: Managed Webhook Front Door + Mac Worker**

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│    Telegram     │      │     Vercel      │      │   Mac Studio    │
│   (User Input)  │─────▶│   (Webhook +    │─────▶│   (Worker +     │
│                 │      │    Job Queue)   │◀─────│    Pipeline)    │
└─────────────────┘      └────────┬────────┘      └─────────────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  Vercel Blob    │
                         │  (Static HTML)  │
                         └─────────────────┘
```

### 1.4 Why This Architecture

| Concern | Solution |
|---------|----------|
| Telegram requires HTTPS endpoint | Vercel Functions (managed, free) |
| Video processing needs sustained compute | Mac Studio (no timeout limits) |
| Pipeline can take 45-90 seconds | Async job queue (not request-blocking) |
| Shareable results | Vercel Blob (static HTML, global CDN) |
| State durability | Mac Studio local storage + optional backup |
| Security surface | Minimal public endpoints, Mac is private |

### 1.5 What Changes from v1

| v1 (Original Proposal) | v2 (This Document) |
|------------------------|---------------------|
| Synchronous webhook processing | Async job-based pipeline |
| Vercel Functions run pipeline | Vercel only receives webhooks |
| Unclear storage strategy | Mac Studio is source of truth |
| "Deploy per session" HTML | Blob upload + CDN serving |
| LLM-driven conversation | Command-first MVP |

---

## 2. Architecture Principles

### 2.1 Core Principles

1. **Async by Default**
   Never block the Telegram webhook response with expensive work. Acknowledge fast, process in background.

2. **Mac as Durable Worker**
   The Mac Studio is the computational workhorse. It pulls jobs, runs the pipeline, and owns persistent state.

3. **Minimal Public Surface**
   Only expose what must be public: webhook endpoint + static HTML results. Everything else is private.

4. **Idempotency Everywhere**
   Telegram can redeliver, users can resend, workers can restart. Design for duplicate-safe operations.

5. **Graceful Degradation**
   Partial results are better than no results. If a worker fails, continue with what succeeded.

6. **Checkpoint Everything**
   Every stage writes checkpoints. Resume from any failure point without redoing expensive work.

### 2.2 Non-Principles (What We're NOT Optimizing For)

- **Sub-second latency** - Travel discovery is a considered task; 30-60s is acceptable
- **Massive scale** - This is a personal/small-group tool; optimize for reliability, not throughput
- **Zero cost** - Willing to pay modest API costs for good UX

---

## 3. System Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 USER LAYER                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌───────────────────┐                           ┌───────────────────────┐    │
│   │     Telegram      │                           │    Static HTML        │    │
│   │   (Mobile/Web)    │                           │   (View Results)      │    │
│   │                   │                           │                       │    │
│   │   Send: text,     │                           │   travel.example.com/ │    │
│   │   video, photo    │                           │   s/{session-id}      │    │
│   └─────────┬─────────┘                           └───────────▲───────────┘    │
│             │                                                 │                 │
└─────────────┼─────────────────────────────────────────────────┼─────────────────┘
              │                                                 │
              │ Telegram Bot API                                │ HTTPS
              ▼                                                 │
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              VERCEL (Public Edge)                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐   │
│   │  /api/telegram    │     │   Vercel KV       │     │   Vercel Blob     │   │
│   │  (Webhook)        │────▶│   (Job Queue)     │     │   (Static HTML)   │   │
│   │                   │     │                   │     │                   │   │
│   │  • Verify secret  │     │  • Job records    │     │  • session.html   │   │
│   │  • Rate limit     │     │  • Status updates │     │  • session.json   │   │
│   │  • Enqueue job    │     │  • Lease mgmt     │     │  • Global CDN     │   │
│   │  • Return 200 OK  │     │                   │     │                   │   │
│   └───────────────────┘     └─────────┬─────────┘     └───────────▲───────┘   │
│                                       │                           │            │
└───────────────────────────────────────┼───────────────────────────┼────────────┘
                                        │                           │
                                        │ Poll for jobs             │ Upload HTML
                                        ▼                           │
┌───────────────────────────────────────────────────────────────────┼────────────┐
│                           MAC STUDIO (Private Worker)             │            │
├───────────────────────────────────────────────────────────────────┼────────────┤
│                                                                   │            │
│   ┌───────────────────┐     ┌───────────────────┐                │            │
│   │   Job Poller      │     │   Job Processor   │────────────────┘            │
│   │                   │────▶│                   │                              │
│   │  • Poll Vercel KV │     │  • Download media │     ┌───────────────────┐   │
│   │  • Acquire lease  │     │  • Gemini analyze │     │   Local Storage   │   │
│   │  • Update status  │     │  • Run pipeline   │     │                   │   │
│   └───────────────────┘     │  • Generate HTML  │     │  ~/.travelagent/  │   │
│                             │  • Upload to Blob │     │    sessions/      │   │
│                             │  • Notify user    │     │    media/         │   │
│                             └─────────┬─────────┘     │    jobs/          │   │
│                                       │               └───────────────────┘   │
│                                       ▼                                        │
│                             ┌───────────────────┐                              │
│                             │ Discovery Pipeline │                              │
│                             │ (Stages 00-10)    │                              │
│                             │                   │                              │
│                             │ Enhancement →     │                              │
│                             │ Router →          │                              │
│                             │ Workers →         │                              │
│                             │ Normalize →       │                              │
│                             │ Dedupe →          │                              │
│                             │ Rank →            │                              │
│                             │ Validate →        │                              │
│                             │ Aggregate →       │                              │
│                             │ Results           │                              │
│                             └───────────────────┘                              │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Responsibilities

| Component | Responsibilities | Does NOT Do |
|-----------|------------------|-------------|
| **Vercel Webhook** | Receive Telegram updates, validate, enqueue job, respond 200 | Run pipeline, download media, call LLMs |
| **Vercel KV** | Store job queue, job status, lease management | Store sessions, media, results |
| **Vercel Blob** | Host static HTML/JSON results | Store raw data, handle writes from users |
| **Mac Studio** | Run pipeline, process media, store sessions, upload results | Expose public endpoints |
| **Telegram API** | Deliver messages, send notifications | - |

### 3.3 Network Topology

```
Internet ─────────────────────────────────────────────────────────────────────────
    │
    │ HTTPS (inbound webhooks, outbound API calls)
    │
    ├─────▶ Vercel (api.vercel.com, blob.vercel-storage.com)
    │           │
    │           │ HTTPS (Vercel KV API)
    │           │
    ├───────────┼─────▶ Telegram Bot API (api.telegram.org)
    │           │
    │           │ HTTPS (Gemini, Perplexity, Places, YouTube APIs)
    │           │
    ▼           ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           MAC STUDIO                                             │
│                                                                                 │
│   • Outbound HTTPS only (no inbound required)                                   │
│   • Behind NAT/firewall (no port forwarding needed)                             │
│   • Polls Vercel KV for jobs                                                    │
│   • Uploads results to Vercel Blob                                              │
│   • Sends notifications via Telegram Bot API                                    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Key insight:** The Mac Studio requires **no inbound connectivity**. It only makes outbound HTTPS requests. This dramatically simplifies networking and security.

> **No Port Forwarding Required!**
>
> Unlike Option C (self-hosted webhook), this architecture does NOT require:
> - Opening ports on your router
> - Configuring NAT/port forwarding
> - Setting up dynamic DNS
> - Managing SSL certificates for your home IP
> - Dealing with ISP restrictions on inbound connections
>
> The Mac simply polls Vercel KV every few seconds asking "any new jobs?" - just like checking email. All traffic is outbound over standard HTTPS (port 443), which works through any home network.

---

## 4. Component Deep Dive

### 4.1 Vercel Webhook Handler

```typescript
// api/telegram.ts (Vercel Serverless Function)

export default async function handler(req: Request) {
  // 1. Verify Telegram secret token
  const secret = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Parse update
  const update = await req.json();

  // 3. Rate limit check (by user ID)
  const userId = update.message?.from?.id;
  if (await isRateLimited(userId)) {
    await sendTelegramMessage(update.message.chat.id,
      '⏳ Too many requests. Please wait a moment.');
    return new Response('OK', { status: 200 });
  }

  // 4. Allowlist check
  if (!await isAllowlisted(userId)) {
    await sendTelegramMessage(update.message.chat.id,
      '🔒 This bot is invite-only. Contact the admin for access.');
    return new Response('OK', { status: 200 });
  }

  // 5. Dedupe check (by update_id + message_id)
  const dedupeKey = `${update.update_id}:${update.message?.message_id}`;
  if (await isDuplicate(dedupeKey)) {
    return new Response('OK', { status: 200 }); // Already processed
  }

  // 6. Create job record
  const job = {
    id: generateJobId(update),
    status: 'queued',
    chatId: update.message.chat.id,
    userId: userId,
    messageType: getMessageType(update),
    payload: update,
    createdAt: new Date().toISOString(),
    attempts: 0,
    leaseUntil: null,
  };

  await enqueueJob(job);

  // 7. Acknowledge to user
  await sendTelegramMessage(update.message.chat.id,
    '📥 Got it! Processing your request...');

  // 8. Return 200 immediately (do NOT wait for processing)
  return new Response('OK', { status: 200 });
}
```

**Critical:** The webhook handler must return within ~5 seconds. All heavy work happens on the Mac.

### 4.2 Job Queue (Vercel KV)

```typescript
// Job record structure in Vercel KV

interface Job {
  id: string;                    // Derived from chatId + messageId
  status: JobStatus;             // queued | processing | completed | failed
  chatId: number;                // Telegram chat ID
  userId: number;                // Telegram user ID
  messageType: MessageType;      // text | video | photo | document
  payload: TelegramUpdate;       // Full Telegram update object
  sessionId?: string;            // Assigned when processing starts
  createdAt: string;             // ISO timestamp
  startedAt?: string;            // When processing began
  completedAt?: string;          // When processing finished
  attempts: number;              // Retry count
  leaseUntil: string | null;     // Lease expiry (ISO timestamp)
  lastError?: string;            // Last error message
  result?: {                     // Result on completion
    htmlUrl: string;
    candidateCount: number;
  };
}

type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
type MessageType = 'text' | 'video' | 'photo' | 'document' | 'command';
```

**Lease-based processing:**
- Worker acquires a lease (e.g., 5 minutes) before processing
- If worker crashes, lease expires and job becomes available again
- Prevents duplicate processing without explicit locking

### 4.3 Mac Studio Worker

```typescript
// src/telegram/worker/poller.ts

class JobPoller {
  private pollInterval = 5000; // 5 seconds
  private leaseTimeout = 300;  // 5 minutes
  private running = false;

  async start() {
    this.running = true;
    while (this.running) {
      try {
        const job = await this.acquireJob();
        if (job) {
          await this.processJob(job);
        }
      } catch (error) {
        console.error('Poller error:', error);
      }
      await sleep(this.pollInterval);
    }
  }

  async acquireJob(): Promise<Job | null> {
    // Atomically: find queued job, set status=processing, set lease
    const job = await vercelKV.acquireNextJob(this.leaseTimeout);
    return job;
  }

  async processJob(job: Job) {
    const processor = new JobProcessor(job);
    try {
      // Update status
      await vercelKV.updateJobStatus(job.id, 'processing');

      // Send "processing" notification
      await sendTelegramMessage(job.chatId,
        '🔄 Starting discovery pipeline...');

      // Run the full pipeline
      const result = await processor.run();

      // Mark complete
      await vercelKV.updateJobStatus(job.id, 'completed', { result });

      // Send completion notification
      await sendTelegramMessage(job.chatId,
        `✅ Discovery complete!\n\n` +
        `Found ${result.candidateCount} places.\n\n` +
        `🔗 View results: ${result.htmlUrl}\n\n` +
        `Top 3:\n${result.topThree.map((c, i) =>
          `${i+1}. ${c.name}`).join('\n')}`
      );

    } catch (error) {
      await this.handleError(job, error);
    }
  }

  async handleError(job: Job, error: Error) {
    job.attempts++;
    job.lastError = error.message;

    if (job.attempts >= 3) {
      await vercelKV.updateJobStatus(job.id, 'failed', {
        lastError: error.message
      });
      await sendTelegramMessage(job.chatId,
        `❌ Discovery failed after ${job.attempts} attempts.\n\n` +
        `Error: ${error.message}\n\n` +
        `Use /retry to try again.`
      );
    } else {
      // Re-queue for retry
      await vercelKV.updateJobStatus(job.id, 'queued', {
        attempts: job.attempts,
        lastError: error.message,
        leaseUntil: null,
      });
    }
  }
}
```

### 4.4 Job Processor

```typescript
// src/telegram/worker/processor.ts

class JobProcessor {
  constructor(private job: Job) {}

  async run(): Promise<ProcessingResult> {
    // 1. Create or resume session
    const session = await this.createSession();

    // 2. Download media if present
    const mediaFiles = await this.downloadMedia();

    // 3. Analyze media with Gemini
    const analysis = await this.analyzeMedia(mediaFiles);

    // 4. Synthesize prompt
    const synthesizedPrompt = await this.synthesizePrompt(analysis);

    // 5. Update session with synthesized params
    await this.updateSessionParams(session, synthesizedPrompt);

    // 6. Run discovery pipeline
    const pipelineResult = await this.runPipeline(session);

    // 7. Generate HTML
    const htmlContent = await this.generateHtml(session, pipelineResult);

    // 8. Upload to Vercel Blob
    const htmlUrl = await this.uploadToBlob(session.id, htmlContent);

    // 9. Update session with output URL
    await this.updateSessionOutput(session, htmlUrl);

    // 10. Cleanup media files (optional, based on retention policy)
    await this.cleanupMedia(mediaFiles);

    return {
      sessionId: session.id,
      htmlUrl,
      candidateCount: pipelineResult.candidates.length,
      topThree: pipelineResult.candidates.slice(0, 3),
    };
  }

  private async downloadMedia(): Promise<MediaFile[]> {
    const message = this.job.payload.message;
    const files: MediaFile[] = [];

    if (message.video) {
      files.push(await this.downloadTelegramFile(message.video.file_id, 'video'));
    }
    if (message.photo) {
      // Get highest resolution photo
      const photo = message.photo[message.photo.length - 1];
      files.push(await this.downloadTelegramFile(photo.file_id, 'photo'));
    }
    if (message.document && isVideoDocument(message.document)) {
      files.push(await this.downloadTelegramFile(message.document.file_id, 'video'));
    }

    return files;
  }

  private async analyzeMedia(files: MediaFile[]): Promise<MediaAnalysis[]> {
    return Promise.all(files.map(file =>
      file.type === 'video'
        ? analyzeVideo(file.path)
        : analyzeImage(file.path)
    ));
  }

  private async runPipeline(session: Session): Promise<PipelineResult> {
    const executor = new PipelineExecutor();
    return executor.execute({
      session,
      runId: generateRunId('telegram'),
      config: getRunConfig(),
    });
  }
}
```

---

## 5. Data Flow & Job Pipeline

### 5.1 Job State Machine

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
┌─────────┐    ┌─────────┐    ┌────────────┐    ┌───────┴──────┐
│ QUEUED  │───▶│PROCESS- │───▶│ COMPLETED  │    │   FAILED     │
│         │    │  ING    │    │            │    │              │
└─────────┘    └────┬────┘    └────────────┘    └──────────────┘
                    │                                     ▲
                    │         (attempts < 3)              │
                    └─────────────────────────────────────┘
                              (error, retry)
```

### 5.2 Detailed Processing Flow

```
User sends video + text to Telegram Bot
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ VERCEL WEBHOOK (< 5 seconds)                                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   1. Verify X-Telegram-Bot-Api-Secret-Token header                             │
│   2. Parse update JSON                                                          │
│   3. Check rate limit (user: 10 requests/minute)                               │
│   4. Check allowlist (reject if not allowed)                                   │
│   5. Generate job ID: sha256(chatId + messageId)                               │
│   6. Check dedupe (skip if job exists with same ID)                            │
│   7. Write job to Vercel KV: { status: 'queued', ... }                        │
│   8. Send Telegram "Processing..." acknowledgment                               │
│   9. Return 200 OK                                                              │
│                                                                                 │
└───────────────────────────────────────────────────────────┬─────────────────────┘
                                                            │
                                                            │ (async, ~5s polling)
                                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ MAC STUDIO WORKER                                                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ACQUIRE (atomic)                                                              │
│   ─────────────────                                                             │
│   1. Poll Vercel KV for job with status='queued'                               │
│   2. Atomically set status='processing', leaseUntil=now+5min                   │
│   3. If no job, sleep 5s and retry                                             │
│                                                                                 │
│   DOWNLOAD MEDIA (~5-30s)                                                       │
│   ─────────────────────────                                                     │
│   4. Extract file_id from Telegram payload                                     │
│   5. Call Telegram getFile API                                                  │
│   6. Download file from file_path URL                                           │
│   7. Save to ~/.travelagent/media/{jobId}/                                     │
│   8. Update job status: "downloading_media"                                    │
│                                                                                 │
│   ANALYZE MEDIA (~10-30s)                                                       │
│   ───────────────────────                                                       │
│   9. Send video/image to Gemini Flash 3.0                                      │
│   10. Parse response: locations, activities, vibes, transcript                 │
│   11. Save analysis to ~/.travelagent/media/{jobId}/analysis.json             │
│   12. Update job status: "analyzing"                                           │
│                                                                                 │
│   SYNTHESIZE PROMPT (~2-5s)                                                     │
│   ─────────────────────────                                                     │
│   13. Merge: user text + extracted locations + activities + vibes              │
│   14. Generate synthesized prompt                                               │
│   15. Create session with SessionSchema                                         │
│   16. Update job status: "synthesizing"                                        │
│                                                                                 │
│   RUN PIPELINE (~30-60s)                                                        │
│   ──────────────────────                                                        │
│   17. Execute Stage 00 (Enhancement) - may skip if prompt is clear             │
│   18. Execute Stage 02 (Router)                                                 │
│   19. Execute Stage 03 (Workers) - Perplexity, Places, YouTube                 │
│   20. Execute Stage 04 (Normalize)                                              │
│   21. Execute Stage 05 (Dedupe)                                                 │
│   22. Execute Stage 06 (Rank)                                                   │
│   23. Execute Stage 07 (Validate) - optional, YouTube candidates               │
│   24. Execute Stage 08 (Top Candidates)                                         │
│   25. Execute Stage 09 (Aggregate)                                              │
│   26. Execute Stage 10 (Results)                                                │
│   27. Checkpoint after each stage to ~/.travelagent/sessions/{id}/runs/...    │
│   28. Update job status: "running_pipeline"                                    │
│                                                                                 │
│   PUBLISH (~5-10s)                                                              │
│   ─────────────                                                                 │
│   29. Generate self-contained HTML                                              │
│   30. Upload HTML to Vercel Blob                                                │
│   31. Get public URL: https://blob.vercel-storage.com/sessions/{id}.html      │
│   32. Upload JSON (optional backup) to Vercel Blob                             │
│   33. Update job status: "publishing"                                          │
│                                                                                 │
│   NOTIFY (~1s)                                                                  │
│   ──────────                                                                    │
│   34. Format completion message with top 3 candidates                          │
│   35. Send Telegram message with URL                                            │
│   36. Update job status: "completed"                                           │
│   37. Clear lease, set completedAt                                             │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Job Status Updates

The Mac worker updates job status at key checkpoints. This enables:
- User can check status via `/status` command
- Admin can monitor progress
- Resume from checkpoint on failure

```typescript
type JobStatus =
  | 'queued'              // Waiting for worker
  | 'downloading_media'   // Fetching from Telegram
  | 'analyzing'           // Gemini processing
  | 'synthesizing'        // Merging inputs
  | 'running_pipeline'    // Discovery stages 00-10
  | 'publishing'          // Uploading to Blob
  | 'notifying'           // Sending Telegram message
  | 'completed'           // Done successfully
  | 'failed';             // Exhausted retries
```

---

## 6. Data Models

### 6.1 Job Schema

```typescript
// src/schemas/job.ts

import { z } from 'zod';

export const JobStatusSchema = z.enum([
  'queued',
  'downloading_media',
  'analyzing',
  'synthesizing',
  'running_pipeline',
  'publishing',
  'notifying',
  'completed',
  'failed',
]);

export const JobSchema = z.object({
  id: z.string(),                           // sha256(chatId:messageId)
  status: JobStatusSchema,
  chatId: z.number(),
  userId: z.number(),
  messageType: z.enum(['text', 'video', 'photo', 'document', 'command']),
  payload: z.record(z.unknown()),           // Raw Telegram update
  sessionId: z.string().optional(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  attempts: z.number().default(0),
  leaseUntil: z.string().datetime().nullable(),
  lastError: z.string().optional(),
  currentStage: z.string().optional(),      // e.g., "Stage 05: Dedupe"
  result: z.object({
    htmlUrl: z.string().url(),
    jsonUrl: z.string().url().optional(),
    candidateCount: z.number(),
    topThree: z.array(z.object({
      name: z.string(),
      type: z.string(),
      location: z.string(),
    })),
  }).optional(),
});

export type Job = z.infer<typeof JobSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
```

### 6.2 Media Analysis Schema

```typescript
// src/schemas/media-analysis.ts

export const LocationExtractionSchema = z.object({
  name: z.string(),
  type: z.enum(['place', 'restaurant', 'attraction', 'beach', 'neighborhood', 'city', 'country']),
  city: z.string().optional(),
  country: z.string().optional(),
  coordinates: z.object({
    lat: z.number(),
    lng: z.number(),
  }).optional(),
  confidence: z.number().min(0).max(1),
});

export const MediaAnalysisSchema = z.object({
  mediaType: z.enum(['video', 'image']),
  sourceFile: z.string(),                   // Local path
  analyzedAt: z.string().datetime(),
  modelUsed: z.string(),                    // e.g., "gemini-2.0-flash"

  locations: z.array(LocationExtractionSchema),
  activities: z.array(z.string()),
  vibes: z.array(z.string()),

  practicalInfo: z.object({
    bestTime: z.string().nullable(),
    priceRange: z.string().nullable(),
    tips: z.array(z.string()),
  }).optional(),

  transcript: z.string().optional(),        // For videos with audio
  summary: z.string(),                       // One-paragraph summary

  processingTimeMs: z.number(),
  tokenUsage: z.object({
    input: z.number(),
    output: z.number(),
  }).optional(),
});

export type MediaAnalysis = z.infer<typeof MediaAnalysisSchema>;
```

### 6.3 Synthesized Prompt Schema

```typescript
// src/schemas/synthesized-prompt.ts

export const SynthesizedPromptSchema = z.object({
  originalText: z.string().optional(),      // User's text message
  mediaAnalyses: z.array(MediaAnalysisSchema),

  synthesizedText: z.string(),              // Final merged prompt

  extractedParams: z.object({
    destinations: z.array(z.string()),
    activities: z.array(z.string()),
    vibes: z.array(z.string()),
    timeframe: z.string().optional(),
    constraints: z.array(z.string()),
  }),

  confidence: z.number().min(0).max(1),
  synthesizedAt: z.string().datetime(),
});

export type SynthesizedPrompt = z.infer<typeof SynthesizedPromptSchema>;
```

### 6.4 Session Schema Extension

```typescript
// src/schemas/session.ts - Extensions for Telegram context

export const TelegramContextSchema = z.object({
  chatId: z.number(),
  userId: z.number(),
  username: z.string().optional(),
  firstName: z.string(),
  lastName: z.string().optional(),
  jobId: z.string(),                        // Reference to job record
  initiatedAt: z.string().datetime(),
  mediaInputs: z.array(z.object({
    type: z.enum(['video', 'photo']),
    fileId: z.string(),
    localPath: z.string(),
    analysisPath: z.string(),
  })),
});

// Add to existing SessionSchema
export const SessionSchema = SessionSchema.extend({
  telegramContext: TelegramContextSchema.optional(),
  outputs: z.object({
    htmlUrl: z.string().url().optional(),
    jsonUrl: z.string().url().optional(),
    localHtmlPath: z.string().optional(),
    localJsonPath: z.string().optional(),
  }).optional(),
});
```

---

## 7. Telegram Bot Design

### 7.1 Supported Input Types

| Input Type | Handling | Notes |
|------------|----------|-------|
| **Text message** | Direct to prompt synthesis | Standard flow |
| **Video (uploaded)** | Download + Gemini analysis | Max 50MB, 5 min duration |
| **Video (document)** | Download + Gemini analysis | For videos sent "as file" |
| **Photo** | Download + Gemini analysis | Max 20MB |
| **Link (TikTok/Instagram)** | Extract URL, attempt fetch | May fail, fallback to URL-only |
| **Voice message** | Transcribe (Whisper) + text flow | Future enhancement |
| **Album (multiple media)** | Process each, merge | Max 10 items |

### 7.2 Commands (MVP)

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Welcome message, usage instructions | - |
| `/help` | Show supported inputs and commands | - |
| `/status` | Check status of current job | `/status` |
| `/new` | Start a new discovery session | `/new` (then send content) |
| `/cancel` | Cancel current processing job | `/cancel` |
| `/retry` | Retry failed job | `/retry` |
| `/history` | List recent sessions (last 5) | `/history` |
| `/view <id>` | Get URL for a specific session | `/view 20261005-greece` |

### 7.3 Conversation Flow (Command-First MVP)

```
USER                                    BOT
────                                    ───

/start
                                        👋 Welcome to Travel Discovery!

                                        Send me:
                                        • A text description of your trip
                                        • A travel video (TikTok, Instagram)
                                        • A photo of a place you love

                                        I'll find similar destinations and
                                        create a shareable travel guide.

                                        Type /help for all commands.

[forwards TikTok video]
"I want to find more places
like this in Southeast Asia"
                                        📥 Got it! Processing your video...

                                        [after ~10s]
                                        🔍 Analyzing video...

                                        Detected:
                                        📍 Phi Phi Islands, Thailand
                                        🏖️ Beach, snorkeling
                                        ✨ Tropical, adventurous

                                        Starting discovery...

                                        [after ~45s]
                                        ✅ Discovery complete!

                                        Found 32 places in Southeast Asia

                                        🏆 Top 3:
                                        1. El Nido, Philippines
                                        2. Koh Rong, Cambodia
                                        3. Langkawi, Malaysia

                                        🔗 Full results:
                                        travel.example.com/s/20261005-sea-beaches

                                        Reply with questions or /new to start fresh!

"Tell me more about El Nido"
                                        🏝️ El Nido, Philippines

                                        Known for:
                                        • Limestone cliffs
                                        • Secret lagoons
                                        • Island hopping tours

                                        Best time: Nov-May (dry season)
                                        Budget: $50-150/day

                                        Sources: [Perplexity, Google Places]

                                        View full details in your results ↗️
```

### 7.4 Error Messages

| Situation | Message |
|-----------|---------|
| Rate limited | ⏳ Too many requests. Please wait a moment before sending more. |
| Not allowlisted | 🔒 This bot is invite-only. Contact @admin for access. |
| Video too large | 📹 Video too large (max 50MB). Try a shorter clip or compress it. |
| Unsupported format | ❓ I can't process this file type. Send a video, photo, or text. |
| Processing failed | ❌ Something went wrong. Use /retry to try again. |
| Timeout | ⏰ Processing is taking longer than expected. Use /status to check progress. |

---

## 8. Mac Studio Operations

### 8.1 Service Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           MAC STUDIO SERVICES                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                        LAUNCHD (System Supervisor)                       │  │
│   │                                                                         │  │
│   │   Manages:                                                              │  │
│   │   • com.travelagent.worker.plist                                       │  │
│   │   • com.travelagent.cleanup.plist (cron-style)                         │  │
│   │                                                                         │  │
│   │   Ensures:                                                              │  │
│   │   • Auto-start on boot                                                 │  │
│   │   • Auto-restart on crash                                              │  │
│   │   • Log rotation                                                        │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│   ┌───────────────────────┐   ┌───────────────────────┐   ┌─────────────────┐ │
│   │   Job Poller          │   │   Cleanup Service     │   │   Health Check  │ │
│   │   (Primary Worker)    │   │   (Scheduled)         │   │   (Heartbeat)   │ │
│   │                       │   │                       │   │                 │ │
│   │   • Poll Vercel KV    │   │   • Delete old media  │   │   • Log status  │ │
│   │   • Process jobs      │   │   • Archive sessions  │   │   • Check disk  │ │
│   │   • Run pipeline      │   │   • Rotate logs       │   │   • Alert on    │ │
│   │   • Upload results    │   │   • Backup state      │   │     issues      │ │
│   └───────────────────────┘   └───────────────────────┘   └─────────────────┘ │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Directory Structure

```
~/.travelagent/
├── config/
│   ├── .env                    # API keys (gitignored)
│   └── settings.json           # Runtime configuration
│
├── sessions/                   # Discovery sessions (source of truth)
│   ├── 20261005-greece-october-santorini/
│   │   ├── session.json
│   │   ├── triage.json
│   │   └── runs/
│   │       └── 20261005-143022-telegram/
│   │           ├── config.json
│   │           ├── 00_enhancement.json
│   │           ├── 02_router.json
│   │           ├── 03_worker_outputs/
│   │           ├── 04_candidates_normalized.json
│   │           ├── 05_candidates_deduped.json
│   │           ├── 06_candidates_ranked.json
│   │           ├── 07_candidates_validated.json
│   │           ├── 08_top_candidates.json
│   │           ├── 09_aggregator_output.json
│   │           ├── 10_results.json
│   │           ├── manifest.json
│   │           └── cost.json
│   └── ...
│
├── media/                      # Downloaded media files
│   ├── {jobId}/
│   │   ├── video.mp4
│   │   ├── analysis.json
│   │   └── thumbnail.jpg
│   └── ...
│
├── jobs/                       # Local job state (backup)
│   ├── active/
│   │   └── {jobId}.json
│   ├── completed/
│   │   └── {jobId}.json
│   └── failed/
│       └── {jobId}.json
│
├── logs/
│   ├── worker.log
│   ├── worker.log.1           # Rotated logs
│   └── error.log
│
├── exports/                    # Generated HTML (local copies)
│   └── {sessionId}.html
│
└── context/                    # LanceDB (existing)
    └── lancedb/
```

### 8.3 Launchd Configuration

```xml
<!-- ~/Library/LaunchAgents/com.travelagent.worker.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.travelagent.worker</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/rajan/Projects/travelagent/dist/telegram/worker/index.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/Users/rajan/Projects/travelagent</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/rajan/.travelagent/logs/worker.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/rajan/.travelagent/logs/error.log</string>

    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
```

### 8.4 Operational Checklist

| Concern | Solution |
|---------|----------|
| **Network setup** | None required! Outbound HTTPS only - works on any home WiFi |
| **Auto-start on boot** | launchd RunAtLoad=true |
| **Auto-restart on crash** | launchd KeepAlive=true |
| **Prevent sleep during jobs** | caffeinate -i during processing |
| **Log rotation** | newsyslog or logrotate config |
| **Disk monitoring** | df check in health service, alert at 80% |
| **Secrets management** | ~/.travelagent/config/.env (chmod 600) |
| **Backup** | Time Machine + optional offsite (rsync to cloud) |
| **Remote access** | Tailscale for emergency SSH (optional, outbound-only) |

### 8.5 Retention Policy

| Data Type | Retention | Cleanup |
|-----------|-----------|---------|
| Media files | 7 days after job completion | Scheduled cleanup job |
| Session data | Indefinite (or until archived) | Manual archive command |
| Local HTML copies | 30 days | Scheduled cleanup job |
| Logs | 7 days, max 100MB | Log rotation |
| Failed job records | 30 days | Scheduled cleanup job |

---

## 9. Security Model

### 9.1 Authentication & Authorization

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SECURITY LAYERS                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   Layer 1: Webhook Verification                                                 │
│   ─────────────────────────────                                                 │
│   • X-Telegram-Bot-Api-Secret-Token header validation                          │
│   • Reject all requests without valid token                                     │
│                                                                                 │
│   Layer 2: User Allowlist                                                       │
│   ───────────────────────                                                       │
│   • Telegram user IDs stored in Vercel KV                                      │
│   • Admin can add/remove via /admin commands                                   │
│   • Reject messages from non-allowlisted users                                 │
│                                                                                 │
│   Layer 3: Rate Limiting                                                        │
│   ──────────────────────                                                        │
│   • Per-user: 10 requests/minute, 50 requests/hour                             │
│   • Per-chat: 20 requests/minute                                               │
│   • Global: 100 requests/minute (circuit breaker)                              │
│                                                                                 │
│   Layer 4: Input Validation                                                     │
│   ────────────────────────                                                      │
│   • File size limits (video: 50MB, image: 20MB)                                │
│   • File type validation (allowlist of MIME types)                             │
│   • Text length limits (max 4000 characters)                                   │
│                                                                                 │
│   Layer 5: Output Sanitization                                                  │
│   ──────────────────────────                                                    │
│   • HTML escaping for all user-provided content                                │
│   • CSP headers on served HTML                                                 │
│   • No inline scripts in generated HTML                                        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Allowlist Management

```typescript
// Allowlist stored in Vercel KV

interface AllowlistEntry {
  telegramUserId: number;
  username?: string;
  addedBy: string;            // Admin who added
  addedAt: string;            // ISO timestamp
  tier: 'standard' | 'admin';
  limits?: {
    maxJobsPerDay?: number;
    maxMediaSize?: number;
  };
}

// Admin commands (only for tier='admin' users)
// /admin:add <user_id> - Add user to allowlist
// /admin:remove <user_id> - Remove user
// /admin:list - Show all allowlisted users
// /admin:stats - Show usage statistics
```

### 9.3 Secrets Management

| Secret | Storage | Access |
|--------|---------|--------|
| TELEGRAM_BOT_TOKEN | Vercel env vars | Webhook function only |
| TELEGRAM_WEBHOOK_SECRET | Vercel env vars | Webhook function only |
| VERCEL_KV_* | Vercel auto-injected | Webhook + Mac worker |
| VERCEL_BLOB_* | Vercel auto-injected | Mac worker |
| GEMINI_API_KEY | Mac ~/.travelagent/config/.env | Mac worker |
| PERPLEXITY_API_KEY | Mac ~/.travelagent/config/.env | Mac worker |
| GOOGLE_PLACES_API_KEY | Mac ~/.travelagent/config/.env | Mac worker |
| YOUTUBE_API_KEY | Mac ~/.travelagent/config/.env | Mac worker |
| OPENAI_API_KEY | Mac ~/.travelagent/config/.env | Mac worker |

### 9.4 Content Security Policy (Generated HTML)

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' https: data:;
  font-src 'self';
  connect-src 'none';
  frame-src 'none';
  object-src 'none';
">
```

---

## 10. Failure Modes & Recovery

### 10.1 Failure Matrix

| Failure Mode | Detection | Recovery | User Impact |
|--------------|-----------|----------|-------------|
| **Webhook down** | Telegram stops delivering | Vercel auto-heals | Delayed processing |
| **Vercel KV unavailable** | API errors | Retry with backoff | Job not queued |
| **Mac offline** | No job pickup | Jobs queue up, process when online | Delayed results |
| **Mac worker crash** | Launchd detects | Auto-restart, resume from checkpoint | May restart job |
| **Media download fails** | HTTP error | Retry 3x, then fail job | User notified |
| **Gemini API error** | API error | Retry with backoff | Delayed analysis |
| **Pipeline stage fails** | Stage throws | Retry from checkpoint | Partial results possible |
| **Blob upload fails** | API error | Retry 3x, fallback to local | No shareable URL |
| **Disk full** | df check | Alert admin, pause new jobs | Manual intervention |

### 10.2 Retry Strategy

```typescript
const RETRY_CONFIG = {
  // Telegram file download
  telegram: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    jitter: 500,
  },

  // Gemini API
  gemini: {
    maxRetries: 3,
    baseDelay: 2000,
    maxDelay: 30000,
    jitter: 1000,
  },

  // Vercel Blob upload
  blob: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 8000,
    jitter: 500,
  },

  // Job-level retries (entire job)
  job: {
    maxRetries: 3,
    // No exponential backoff - immediate re-queue
  },
};
```

### 10.3 Graceful Degradation

| Component Failure | Degraded Behavior |
|-------------------|-------------------|
| Gemini fails | Fall back to text-only prompt (if user provided text) |
| YouTube worker fails | Continue with Perplexity + Places results |
| Places worker fails | Continue with Perplexity + YouTube results |
| All workers fail | Return error, suggest retry |
| Aggregator fails | Return raw ranked candidates without narrative |
| Blob upload fails | Save locally, provide /download command |

### 10.4 Idempotency Keys

| Operation | Key Format | Purpose |
|-----------|------------|---------|
| Job creation | `sha256(chatId:messageId)` | Prevent duplicate jobs |
| Media download | `file_unique_id` | Prevent re-download |
| Pipeline run | `sessionId:runId` | Prevent duplicate runs |
| Blob upload | `sessionId:sha256(content)` | Prevent duplicate uploads |
| Telegram notification | `jobId:completed` | Prevent duplicate messages |

---

## 11. Publishing Strategy

### 11.1 Static HTML Generation

```typescript
// src/output/html-generator.ts

async function generateSessionHtml(
  session: Session,
  results: DiscoveryResults,
  options: GenerateOptions
): Promise<string> {
  // Use template engine (e.g., Handlebars, EJS)
  const template = await loadTemplate('session.html');

  const html = template({
    sessionId: session.id,
    title: generateTitle(session),
    createdAt: formatDate(session.createdAt),

    // Trip context
    destinations: session.destinations,
    dateRange: formatDateRange(session.dateRange),
    interests: session.interests,

    // Results
    summary: results.narrative?.summary,
    candidateCount: results.candidates.length,
    candidates: results.candidates.map(formatCandidate),

    // Metadata
    workerSummary: results.workerSummary,
    costs: formatCosts(results.costs),

    // Triage state (if any)
    triage: session.triage,
  });

  // Minify for production
  return minifyHtml(html);
}
```

### 11.2 Vercel Blob Upload

```typescript
// src/output/blob-publisher.ts

import { put } from '@vercel/blob';

async function publishToBlob(
  sessionId: string,
  htmlContent: string
): Promise<string> {
  const filename = `sessions/${sessionId}.html`;

  const blob = await put(filename, htmlContent, {
    access: 'public',
    contentType: 'text/html; charset=utf-8',
    addRandomSuffix: false, // Stable URLs
    cacheControlMaxAge: 3600, // 1 hour cache
  });

  return blob.url;
}
```

### 11.3 URL Structure

```
https://[blob-store-id].public.blob.vercel-storage.com/
  sessions/
    20261005-greece-october-santorini.html
    20261005-greece-october-santorini.json  (optional backup)
```

### 11.4 HTML Features

- **Self-contained** - All CSS inline, no external dependencies
- **Mobile-first** - Responsive design, touch-friendly
- **Filtering** - Client-side JavaScript for type/status filtering
- **Dark mode** - Respects prefers-color-scheme
- **Print-friendly** - Clean print stylesheet
- **Accessible** - Semantic HTML, ARIA labels

---

## 12. Implementation Tasks

### 12.1 Phase 1 Tasks (Telegram MVP)

| Task | Description | Estimate |
|------|-------------|----------|
| **29.0** | **Vercel Webhook Setup** | |
| 29.1 | Create Vercel project with API route | |
| 29.2 | Implement webhook handler with verification | |
| 29.3 | Set up Vercel KV for job queue | |
| 29.4 | Implement allowlist check | |
| 29.5 | Implement rate limiting | |
| 29.6 | Add deduplication logic | |
| 29.7 | Write tests for webhook handler | |
| **30.0** | **Mac Worker Infrastructure** | |
| 30.1 | Create job poller with lease acquisition | |
| 30.2 | Implement job processor orchestrator | |
| 30.3 | Create launchd plist for auto-start | |
| 30.4 | Implement health check and heartbeat | |
| 30.5 | Set up log rotation | |
| 30.6 | Write integration tests for poller | |
| **31.0** | **Media Processing** | |
| 31.1 | Implement Telegram file downloader | |
| 31.2 | Create Gemini video analyzer | |
| 31.3 | Create Gemini image analyzer | |
| 31.4 | Implement prompt synthesizer | |
| 31.5 | Add media analysis caching | |
| 31.6 | Write tests for media processing | |
| **32.0** | **HTML Output Generation** | |
| 32.1 | Create HTML template structure | |
| 32.2 | Implement template engine integration | |
| 32.3 | Add client-side filtering JavaScript | |
| 32.4 | Implement cost breakdown display | |
| 32.5 | Add responsive/mobile styles | |
| 32.6 | Write tests for HTML generation | |
| **33.0** | **Vercel Blob Publishing** | |
| 33.1 | Set up Vercel Blob storage | |
| 33.2 | Implement blob upload function | |
| 33.3 | Add local fallback for upload failures | |
| 33.4 | Implement cleanup for old blobs | |
| 33.5 | Write tests for publishing | |
| **34.0** | **Telegram Bot Commands** | |
| 34.1 | Implement /start and /help | |
| 34.2 | Implement /status command | |
| 34.3 | Implement /cancel command | |
| 34.4 | Implement /retry command | |
| 34.5 | Implement /history command | |
| 34.6 | Add admin commands (add/remove user) | |
| 34.7 | Write tests for commands | |
| **35.0** | **Operational Setup** | |
| 35.1 | Configure Mac for always-on operation | |
| 35.2 | Set up secrets in .env | |
| 35.3 | Configure Tailscale for remote access | |
| 35.4 | Set up disk monitoring alerts | |
| 35.5 | Create backup script | |
| 35.6 | Write operational runbook | |
| **36.0** | **End-to-End Testing** | |
| 36.1 | Test full flow: text input → results | |
| 36.2 | Test full flow: video input → results | |
| 36.3 | Test failure recovery scenarios | |
| 36.4 | Test rate limiting and allowlist | |
| 36.5 | Load test with concurrent jobs | |

### 12.2 Dependency Graph

```
29.0 (Vercel Webhook) ────────┐
                              │
30.0 (Mac Worker) ────────────┼───▶ 36.0 (E2E Testing)
                              │
31.0 (Media Processing) ──────┤
                              │
32.0 (HTML Output) ───────────┤
                              │
33.0 (Blob Publishing) ───────┤
                              │
34.0 (Bot Commands) ──────────┤
                              │
35.0 (Ops Setup) ─────────────┘
```

**Critical path:** 29.0 → 30.0 → 31.0 → 32.0 → 33.0 → 36.0

---

## 13. Decision Log

| # | Decision | Rationale | Alternatives Considered |
|---|----------|-----------|------------------------|
| 1 | **Vercel as webhook host** | Managed HTTPS, free tier, global edge | Self-hosted (more ops), Cloudflare Workers (similar) |
| 2 | **Mac Studio as worker** | Sustained compute, no timeouts, local storage | Vercel Functions (60s limit), Modal (Python-focused) |
| 3 | **Async job queue** | Decouples ingestion from processing, enables recovery | Sync processing (brittle), WebSockets (complex) |
| 4 | **Vercel KV for jobs** | Integrated with Vercel, simple API | Redis (self-hosted), DynamoDB (overkill) |
| 5 | **Vercel Blob for HTML** | CDN, free tier, simple API | S3 (more setup), self-hosted (more ops) |
| 6 | **Command-first bot UX** | Predictable, debuggable, MVP-appropriate | LLM-driven conversation (complex, error-prone) |
| 7 | **Mac polls (not pushed)** | **No port forwarding/NAT config required** - works on any home WiFi | Webhooks to Mac (requires tunnel/port forwarding, router config) |
| 8 | **Local storage as source of truth** | Debuggable, resumable, no cloud lock-in | Cloud-only (harder to debug), Hybrid (complex) |

---

## 14. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Mac offline/sleeping** | Medium | High | Disable sleep, UPS, monitoring alerts |
| **Vercel KV rate limits** | Low | Medium | Monitor usage, upgrade plan if needed |
| **Gemini API instability** | Medium | Medium | Retry with backoff, graceful degradation |
| **Video processing costs** | Medium | Medium | Quota limits, user-level caps |
| **Disk exhaustion** | Low | High | Retention policy, monitoring, alerts |
| **Telegram webhook spam** | Low | Medium | Rate limiting, allowlist |
| **State corruption** | Low | High | Atomic writes, checksums, backups |
| **API key leakage** | Low | Critical | Env vars, chmod 600, never log |

---

## Appendix A: Environment Variables

### Vercel (Production)

```bash
# Telegram
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_WEBHOOK_SECRET=xxx

# Vercel (auto-injected)
KV_REST_API_URL=xxx
KV_REST_API_TOKEN=xxx
BLOB_READ_WRITE_TOKEN=xxx
```

### Mac Studio (~/.travelagent/config/.env)

```bash
# Vercel Access (for KV and Blob)
VERCEL_KV_URL=xxx
VERCEL_KV_TOKEN=xxx
VERCEL_BLOB_TOKEN=xxx

# AI APIs
GEMINI_API_KEY=xxx
PERPLEXITY_API_KEY=xxx
OPENAI_API_KEY=xxx

# Google APIs
GOOGLE_PLACES_API_KEY=xxx
YOUTUBE_API_KEY=xxx

# Telegram (for sending messages)
TELEGRAM_BOT_TOKEN=xxx
```

---

## Appendix B: Monitoring & Alerting

### Key Metrics to Track

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Job queue depth | Vercel KV | > 10 jobs queued |
| Job processing time | Mac worker logs | > 120 seconds |
| Job failure rate | Vercel KV | > 10% in 1 hour |
| Worker heartbeat | Mac health check | Missing for > 5 minutes |
| Disk usage | Mac df | > 80% |
| API error rate | Mac worker logs | > 5% in 15 minutes |

### Alerting Channels

- **Email** - For non-urgent alerts (high disk, job backlog)
- **Telegram to admin** - For urgent alerts (worker down, job failures)

---

## Summary

This v2 architecture addresses the key concerns from the Codex review:

1. **Async job model** - Webhook returns immediately, processing is background
2. **Mac as durable worker** - Handles sustained compute, owns state
3. **Minimal public surface** - Only webhook + static HTML exposed
4. **Idempotency everywhere** - Handles duplicates, restarts, retries
5. **Graceful degradation** - Partial results better than failures
6. **Command-first UX** - Predictable, debuggable MVP

The architecture separates concerns cleanly:
- **Vercel**: Public edge (webhooks, static hosting)
- **Mac Studio**: Private compute (processing, storage)
- **Job queue**: Reliable coordination

This enables a robust, recoverable system that can handle the realities of network issues, API failures, and user behavior while providing a good user experience through Telegram.
