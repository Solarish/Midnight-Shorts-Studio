# Local Control Center

## Runtime boundary

```text
React/Vite UI
    │ REST + SSE
    ▼
Fastify Control API (127.0.0.1:47650)
    │
    ▼
Sequential runner + local durable queue
    │ machine-wide Adobe/GPU lease
    │ one versioned job
    ▼
macOS worker subprocess (capacity 1)
    ├─ Apple Vision
    ├─ ComfyUI / LLM
    ├─ After Effects JSX + aerender
    └─ Premiere UXP bridge (127.0.0.1:47652)
```

The UI never invokes Adobe or AI services directly. The server-side portrait-story compiler maps guided form values into a workflow; the typed graph compiler maps Workflow Studio drafts into the same WorkflowV1 contract. The resulting raw JSON is snapshotted before execution and remains the source of truth.

## Local persistence

Control metadata lives under the ignored `.ava-control/` directory. Graph drafts live under `.ava-control/graphs/<id>/draft.json`, immutable published versions under `versions/`, and immutable compiled snapshots under `.ava-control/workflows/`. Every submission contains the exact workflow, original manifest, ordered `events.ndjson`, and runner log. Existing run directories and `state.json` remain compatible with the CLI and prototype verifier.

Drafts can be incomplete while the editor autosaves them. Validation and publish use the strict graph contract: known executable node types, exact typed ports, runtime-checked config, required inputs, one connected acyclic graph, explicit topological order, at most 50 scenes, at most five minutes, and one of the canonical 25fps profiles. The selected profile is injected into `timeline.compose`; scene timing is 40ms-frame aligned and cannot exceed the declared graph duration. An `If-Match` revision prevents one browser tab from overwriting another. Run compilation is deterministic and a Run-to-node bound is passed to the same sequential runner.

Media and audio fields can import a local PNG/JPEG/WebP, WAV/MP3/M4A/AAC, MP4, or MOV into the workspace. Server-issued UUID filenames prevent path injection, image payloads are decoded, and audio/video payloads must match a supported file signature. The editor stores only the project-relative path in node config.

Only one run executes at once. Additional runs remain durably queued. The CLI and API scheduler also share a persistent machine-wide resource lease, preventing a second process from starting Adobe/GPU work. A queued run can be cancelled. A running run can only request stop after the current step; the system never force-quits AE or Premiere.

The resource lease is intentionally not auto-recovered after a crashed worker, because an in-host AE or Premiere operation can outlive the Node process. Use `npm run resource:status` to inspect it. A stale lease can be removed with `npm run resource:unlock -- --confirm-inspected-adobe` only after the operator verifies that AE, Premiere, `aerender`, and ComfyUI are idle. The separate Control API singleton lock does recover a dead PID automatically and is released on SIGINT/SIGTERM.

## API and security

- Operator API: `http://127.0.0.1:47650/api/v1/`
- Premiere bridge: `http://127.0.0.1:47652`
- Development UI: `http://127.0.0.1:5173`
- Production UI: served by Control API at `http://127.0.0.1:47650`

The API refuses non-loopback binding. Mutating requests require the per-process CSRF token returned by `/api/v1/health`. Uploaded presenter files are decoded, assigned UUID filenames, normalized to NFC metadata, and stored only under `assets/input/ui/`. Artifact access resolves by ID, rejects symlinks, and verifies containment in the run directory.

Live run submission additionally requires an explicit operator confirmation and a fresh server-side readiness pass. Every readiness snapshot has a server-owned five-second expiry. The UI refreshes it every three seconds, when the tab regains focus, and immediately before Live submission. The checks cover the shared resource lease, AE host/template/aerender and scripting permission, Apple Vision toolchain, Premiere host/plugin/developer mode and a five-second panel heartbeat, plus ComfyUI HTTP health. The client cannot override these destinations or bypass this gate.

Visual workflows use capability-scoped readiness. For example, a media-only graph checks the resource lease and FFmpeg/FFprobe as required, while AE, Premiere, ComfyUI, and JaiTTS checks appear only when the graph contains those node capabilities. Premiere TimelineSpec graphs additionally require bridge v0.4.4 capability claims, exact Premiere/Media Encoder 26.5.0 Beta versions, and every selected `.sqpreset`/`.epr` path before queueing Live.

If the final server check fails, no run is queued. The response includes the authoritative failed checks, the UI immediately replaces any cached green state with those results, and Live stays disabled until a fresh pass succeeds. A metadata-only diagnostic is appended to `.ava-control/readiness-rejections.ndjson`; it contains the request/manifest identifiers and failed check details, but no credentials or uploaded media. Recent entries are available from `GET /api/v1/diagnostics/readiness-rejections`.

SSE endpoints replay durable events using `Last-Event-ID`, flush their initial headers immediately, and send heartbeats every 15 seconds. Browser refreshes and SSE reconnects do not stop a run. Shutdown explicitly closes these disposable event streams before releasing the singleton lock.

## Production migration seam

The current worker is deliberately a local single-job subprocess, which is the smallest boundary that preserves the verified Adobe payloads and evidence files. The versioned worker envelope already separates input, settings, workspace paths, result, logs, job ID, and generation.

The production transport can replace subprocess dispatch with a pull worker and lease/heartbeat protocol without changing the UI, recipe manifest, workflow JSON, runner, or concrete Adobe adapters. At that stage, `LocalControlStore` is replaced by PostgreSQL/object storage implementations and the Mac worker materializes artifact IDs into local staging paths.

No Control Center route is deployed publicly in this implementation.
