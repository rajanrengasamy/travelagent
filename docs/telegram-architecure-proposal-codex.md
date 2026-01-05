# Telegram-First Architecture Proposal — Codex Review (with “Mac-as-Server” Considerations)

Reviewed doc: `docs/telegram-architecture-proposal.md` (Draft, 2026-01-05)

## Executive Assessment (Updated)

The proposal’s core idea—**keep the discovery pipeline intact** and add (1) Telegram ingestion, (2) multimodal understanding, and (3) shareable HTML output—is directionally strong.

Adding a **Mac as the primary server** changes the architectural center of gravity:
- You no longer need to contort the system around serverless limits for “heavy” work (media processing, long-running pipeline).
- You do inherit self-hosting concerns: uptime, NAT/HTTPS, secrets, backups, remote access, and a larger security surface.

The biggest risk in the current proposal remains: **trying to do everything synchronously in the Telegram request path**. With a self-hosted Mac, the right move is to adopt an **asynchronous job model** and let the Mac be the durable worker + state store. Then decide whether the Mac also serves public web endpoints or you use a managed host for shareable results.

## Where the Mac Fits (Placement Options)

Telegram requires either:
- An **HTTPS webhook endpoint** reachable from the public internet, or
- **Long polling** (`getUpdates`) from your server (no inbound connectivity required).

That single constraint defines where your Mac can sit.

### Option A — Mac Runs the Bot via Long Polling + Does All Processing (Recommended MVP)

- Mac runs the Telegram bot using **long polling** (no public inbound endpoint).
- Mac runs multimodal processing + the discovery pipeline.
- Mac stores sessions/artifacts locally (optionally backed up/synced).
- Shareable results are produced by **uploading HTML/JSON to a managed host** (blob/storage/static), returning a URL.

**Pros:** simplest networking; smallest public attack surface; fastest to iterate.  
**Cons:** you still need a public host for “shareable URLs” unless local-only sharing is OK.

### Option B — Managed Webhook Front Door + Mac Worker (Recommended if you want webhooks but keep Mac private)

- A managed service (Vercel/Fly/Cloud Run) receives Telegram webhooks and returns quickly.
- It persists a job record (queue/KV/DB).
- The Mac pulls jobs, processes them, and posts results back to Telegram.

**Pros:** clean public boundary; easier to secure inbound; webhook reliability.  
**Cons:** introduces a cloud dependency and “queue correctness” work (leases, retries, idempotency).

### Option C — Mac Exposes a Public HTTPS Webhook + Hosts Results (Fully self-hosted)

- Use port forwarding + DNS + TLS, or a tunnel (Cloudflare Tunnel / Tailscale Funnel).

**Pros:** fully self-hosted (end-to-end).  
**Cons:** highest ops + security burden; home NAT/ISP variability; DoS/abuse concerns.

## Connectivity & Exposure (Concrete Guidance)

### Long Polling vs Webhooks

- **Long polling** is the most “Mac-friendly” default because it avoids inbound networking. It does require that *exactly one* bot instance consumes updates (or you must coordinate offset handling).
- **Webhooks** are better if you want low-latency push semantics and a clean integration with other hosted components, but they require a stable, public HTTPS endpoint.

If you choose webhooks, bake in:
- Verification via Telegram’s secret token header (`X-Telegram-Bot-Api-Secret-Token`) and strict allowlisting.
- Fast acks: enqueue and return; do not process in the request.

### Serving Shareable Results

Decide if “shareable URL” means:
- **Public internet link** (friends can open it) → easiest is blob/static hosting.
- **Private link** (only you/allowed devices) → a tunnel with access control is viable.

Recommended patterns:
- **Public results without hosting:** upload `session.html` (and/or `session.json`) to blob storage and send that URL.
- **Self-hosted results:** run a tiny static server on the Mac and expose it via a tunnel; keep it read-only.

## Recommended Architecture (Mac-First, Job-Based)

For reliable UX, implement a **job pipeline**:

1. **Ingest** (Telegram update → job + session stub)
2. **Process** (media → extract → synthesize)
3. **Run** (discovery pipeline stages 00–10)
4. **Publish** (HTML/JSON artifacts)
5. **Notify** (Telegram message with top results + link)

### High-Level Flow

```
Telegram Update (text/photo/video/link)
  │
  ├─ Option A: Mac long-polls Telegram API
  └─ Option B/C: Public webhook receives update
          │
          ▼
   Ingest + Persist
 (dedupe + auth + job record)
          │
          ▼
   Async Worker (Mac)
  download → analyze → synthesize → pipeline → publish → notify
```

This matches the repo’s existing “stages with checkpointing” approach and makes failures recoverable without redoing expensive steps.

## What’s Strong (Still True)

- **Separation of concerns:** ingestion → multimodal → synthesis → existing pipeline.
- **Phased delivery:** Telegram + HTML first, web app later.
- **Schema-first approach:** consistent with existing Zod usage.

## Critical Gaps / Ambiguities (Updated for Mac-as-Server)

### 1) Sync vs Async is still the highest-risk decision

Even on a Mac, synchronous processing makes UX brittle: Telegram updates can pile up, media downloads can stall, and multimodal model calls vary in latency.

**Recommendation:**
- Ingest path does the minimum: allowlist/rate-limit, persist, enqueue, acknowledge.
- Heavy work runs in a background worker with a persisted state machine.

**Minimum job states:** `queued → downloading_media → analyzing → synthesizing → running_pipeline → publishing → notifying → done | failed`.

### 2) Storage Strategy Must Be Explicit (Local truth + optional public publishing)

With a Mac server, you can store “truth” locally, but you still need to decide where *shareable* artifacts live.

**Decisions the PRD must force:**
- Where raw media is stored (local disk? blob? both?)
- Whether you keep media after extraction (retention policy)
- Where sessions live (filesystem vs SQLite/Postgres/KV)
- Whether results must be publicly accessible; if yes, how (blob vs tunnel vs hosted web app)

**Pragmatic MVP recommendation:**
- Store session JSON + stage outputs locally (great for debugging and replay).
- Publish HTML as a blob/object for sharing (avoid per-session “deploys”).
- Keep stage outputs resumable under a stable session ID.

### 3) Telegram Media Reality (forwarded videos are not guaranteed files)

The proposal assumes “forwarded TikTok/Instagram video” yields a downloadable file. Often it’s a link, or Telegram provides a payload you can’t retrieve as expected.

**PRD should specify supported input types explicitly:**
- Video uploaded directly to Telegram chat (supported)
- Telegram “video” vs “document” payloads (supported)
- Link-only messages (supported, but handled differently)
- Albums/multiple media per update (scope now or defer)

**UX fallback:** If the bot can’t retrieve media, it should ask for a re-upload “as a file” or proceed with link-only processing if you support it.

### 4) Publishing HTML: “Deploy per session” is the wrong primitive

With a Mac server, the simplest publish options are:
- Upload HTML to blob storage and return the URL, or
- Host a small read-only web server on the Mac behind a tunnel and serve `sessions/{id}.html`, or
- Serve a dynamic page that renders from stored JSON (avoids rewriting HTML to support “must-visit list” edits).

Avoid per-session deployment workflows; they are slow and operationally noisy.

### 5) Conversation Management Needs a Narrow MVP

On a self-hosted system, complexity is the enemy. Avoid making “LLM-driven conversation manager” a dependency for correctness in V1.

**Recommendation:** command-first MVP:
- `/new` start session
- `/status` job/session status
- `/refine` rerun with constraints (timeframe, budget, vibe, region)
- `/save` must-visit list mutations (explicit)
- `/help` supported input types + limits

Then add “free-form follow-ups” once primitives are stable and logs show what users actually ask.

### 6) Security & Abuse becomes more important when you self-host

If the Mac is reachable (Option C) or if you publish artifacts publicly:
- Strict allowlist for all bot actions (including callback handlers).
- Rate limiting and quotas (video processing is the cost driver).
- Sanitization: never render untrusted text into HTML without escaping; use CSP; avoid inline scripts where possible.
- Secrets hygiene: bot token, model keys, publish tokens must not leak into logs or artifacts.
- Admin controls: allowlist management, ban/unban, delete session/media, rotate keys.

### 7) The “Mac server” operational model must be designed, not assumed

Treat the Mac like production infrastructure, even if it’s “personal”:
- Sleep/reboot: ensure the service survives both (auto-restart + job recovery).
- Supervision: launchd or a process manager; health checks; log rotation.
- Disk: enforce size and retention limits; background cleanup.
- Backups: local + offsite (encrypted) for session state you care about.

## Concrete Reference Architecture (Mac-First MVP)

### Components

1. **Bot Runner (Mac)**
   - Long polling or webhook (choose one first).
   - Normalizes Telegram updates into an internal `InboundEvent`.
   - Writes a session stub and enqueues a job.

2. **Job Store / Queue (Minimal viable)**
   - MVP can be a durable table/collection with `status`, `attempts`, `leaseUntil`, `lastError`, `createdAt`, `updatedAt`.
   - Correctness requires leases/visibility timeouts to prevent duplicate processing.

3. **Worker (Mac)**
   - Pulls jobs, acquires lease, runs processing + pipeline, publishes, notifies Telegram, marks done.
   - Stores intermediate outputs for replay/debug (raw model outputs, extracted entities, prompts used).

4. **Publisher (Pluggable)**
   - `LocalPublisher`: writes HTML to disk for local viewing.
   - `BlobPublisher`: uploads HTML/JSON and returns a stable public URL.
   - `TunnelPublisher`: writes to a directory served by a local web server behind a tunnel.

### Failure Modes (Define UX and Recovery)

At minimum, define these behaviors:
- **Media too large / unsupported:** immediate Telegram reply with limits and next steps (“send as file”, “shorter clip”, “link only”).
- **Model/provider failure:** retry with backoff up to N attempts; then mark failed and provide a user-facing “try again” action.
- **Partial progress:** `/status` returns job state; on restart the worker resumes from the last completed stage/checkpoint.
- **Duplicate updates:** dedupe and respond with the existing session link rather than reprocessing.

### Idempotency (Non-negotiable)

Telegram can redeliver updates; users resend content; your bot can restart mid-job.

**Recommended keys:**
- Inbound de-dupe: `update_id` + `(chatId, messageId)`.
- Media de-dupe: `file_unique_id` across re-sends.
- Job de-dupe: stable `jobId` derived from `(chatId, messageId)`; “already done” short-circuits.

## PRD Additions Specific to the Mac

These need explicit answers before building to avoid re-architecture:

1. **Connectivity choice**
   - Long polling vs webhook (and if webhook: tunnel vs port-forwarding + DNS + TLS).
2. **Publishing choice**
   - Are public URLs required? If yes: blob host vs tunnel-hosted static site vs hosted web app.
3. **Retention**
   - Keep raw media? For how long? Is deletion user-triggered (`/delete`)?
4. **Reliability expectations**
   - Is “best effort for personal use” OK, or must it behave like a production service?
5. **Security posture**
   - Private chats only for MVP?
   - Group chats allowed?
   - Admin-only bot?

## Mac Operations Checklist (What “Server” Implies)

If you want this to behave like a server, the PRD (or ops doc) should include:
- **Always-on settings:** prevent sleep; handle automatic login/launch on boot.
- **Process supervision:** automatic restarts; structured logs; log rotation.
- **Secrets management:** store tokens/keys in environment + Keychain (avoid committing `.env`); rotate periodically.
- **Backups:** Time Machine plus an offsite encrypted backup for session state you care about.
- **Disk & retention controls:** caps for media storage; scheduled cleanup; alerting when disk is low.
- **Remote admin access:** a secure channel (VPN/tunnel) for troubleshooting without exposing services broadly.

## Risk Register (Mac-Adjusted)

- **Inconsistent uptime** (sleep/reboot/network loss) → auto-restart + job leases + `/status` + retries.
- **Disk exhaustion from media** → hard caps, retention policy, cleanup tasks.
- **Public exposure risk** (webhook/results) → tunnel + allowlist + rate limiting + minimal endpoints.
- **Cost blowups** (multimodal) → quotas, caching, explicit confirmation for expensive jobs.
- **State corruption / duplicate work** → idempotency keys + state machine + atomic writes/checkpoints.

## Bottom Line Recommendation (Updated)

If the Mac is your server, design for its strengths:
- Make the Mac the **durable worker and primary state store**.
- Use a **job-based architecture** from day one.
- Prefer **long polling** for MVP unless you explicitly want to operate a public inbound endpoint.
- Publish results via **blob/object hosting** (or a tunnel) rather than “deploy per session.”

If you want, I can translate this into a revised “Phase 1 Tasks 29–35” plan that includes Mac-specific operational work (supervision, cleanup, backups, and secure publishing).
