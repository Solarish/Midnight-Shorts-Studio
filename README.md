# 🎬 Midnight Shorts Studio

A cloud-ready, decoupled automated video assembly engine supporting both **Vertical (9:16 - TikTok/Reels/Shorts)** and **Horizontal (16:9 - YouTube/Broadcast)** formats with parametric presets and web-based dynamic rendering.

Originally evolved from PSU AVA, this studio decouples heavy Adobe dependencies (After Effects & Premiere Pro) in favor of lightweight, containerized Web-to-Video technologies (Remotion / CSS / Canvas / FFmpeg) for high-throughput, multi-tenant automated video production.

## Core Features & Multi-Aspect Ratio Support

- **Multi-Format Assembly:** Native support for Vertical (1080x1920 @ 9:16), Horizontal (1920x1080 @ 16:9), and Square (1:1) with automatic safe-zone alignments.
- **Parametric Preset Animations:** Reusable CSS/Web motion graphics presets (Bounce, Pop, Spring, Zoom-punch, Backdrop blur).
- **Dynamic Word-by-Word Thai Subtitles:** Word-level karaoke captioning synchronized with Whisper/JaiTTS audio timecodes.
- **High-Throughput Parallel Rendering:** Independent worker architecture with zero desktop GUI/Adobe license locks.
- **AI Synthesis Integration:** Native connectivity with ComfyUI (10.135.66.70), JaiTTS Studio voice synthesis, and Ollama LLMs.

## Quick start

```bash
node ./src/cli.js validate ./examples/assembly.workflow.json
node ./src/cli.js run ./examples/assembly.workflow.json --dry-run
node ./src/cli.js run ./examples/assembly.workflow.json
node ./src/cli.js run ./examples/prototype.workflow.json --to generate_background
```

## Local Control Center

Install dependencies and start the API plus development UI:

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. A production build is served by the loopback API at `http://127.0.0.1:47650`:

```bash
npm run build
npm start
```

For an operator trial, use the foreground launcher. It builds the UI, starts the loopback API, opens the browser, and shuts down safely with Ctrl-C:

```bash
npm run control:center
```

The UI supports a built-in first-user preset, presenter upload, fixed text, a background brief, dry/live submission, a seven-step timeline, automatic 30-check output verification, safe checkpoint recovery, stop-after-current-step, history, artifact previews, and Finder reveal. It does not expose service URLs, credentials, Adobe destinations, node ordering, or editable workflow JSON.

Open `http://127.0.0.1:47650/workflows` for Workflow Studio. It supports draft autosave with optimistic revisions, typed DAG connections, generated node inspectors, portrait/landscape/square profiles at 25fps, validation, immutable publish versions, cloning, a read-only execution timeline, full Dry/Live runs, and Run to selected node. A starter `AVA Starter - Media Probe` workflow is installed locally for a safe first dry run.

A live submission is gated twice: every server-side readiness check must pass and the operator must confirm that other Adobe work is saved and the AE/Premiere sessions are dedicated to automation. Readiness is refreshed automatically and again immediately before submission; if a dependency changes, the page shows the exact failed check and does not queue a run. Dry runs remain available while a live dependency is offline.

See [`docs/CONTROL_CENTER.md`](./docs/CONTROL_CENTER.md) for architecture and API details.

Create the included AE prototype template once:

```bash
npm run prototype:template
```

Check local Adobe host readiness without launching AE, Premiere, or ComfyUI:

```bash
npm run prototype:doctor
```

After a live run, verify and save the complete prototype evidence bundle:

```bash
npm run prototype:verify -- ./prototype-runs/<run-id> --write
```

The browser-driven live acceptance path is opt-in because it controls real Adobe and ComfyUI hosts. Run it only with clean dedicated AE/Premiere sessions and an 11/11 readiness result:

```bash
npm run test:live-acceptance
```

The CLI and Control Center share one machine-wide Adobe/GPU lease, so separate processes cannot run AE, Premiere, or ComfyUI work concurrently. Inspect the lease with:

```bash
npm run resource:status
```

The resource lease deliberately survives an unexpected process exit because the Adobe host operation may still be running. Only after checking AE, Premiere, `aerender`, and ComfyUI may an operator remove a stale lease:

```bash
npm run resource:unlock -- --confirm-inspected-adobe
```

Never use the unlock command merely to bypass a busy run.

Resume a failed run:

```bash
node ./src/cli.js run ./examples/assembly.workflow.json --resume ./.pipeline-runs/<run-id>
```

Start at a specific step while still preserving prior checkpoint outputs:

```bash
node ./src/cli.js run ./examples/assembly.workflow.json --resume ./.pipeline-runs/<run-id> --from ae_bind
```

## Node types

| Type | Purpose |
|---|---|
| `asset.select` | Resolve and verify a source image/video path |
| `image.removeBackground` | Remove a person background locally with Apple Vision |
| `graphics.cover_title` | Compose the final Thai eyebrow, title, subtitle, and PSU Broadcast lockup onto a cover before review |
| `template.payload` | Produce fixed text/asset bindings without generation |
| `llm.chat` | Optional structured LLM assistance |
| `comfyui.workflow` | Upload inputs, patch an API workflow, submit, poll, and download outputs |
| `ae.template` | Bind footage and fixed text into an AE template project |
| `ae.render` | Render one AE composition with `aerender` |
| `premiere.assemble` | Send an assembly job to the local Premiere UXP bridge |
| `media.probe` | Inspect media with ffprobe |
| `timeline.scene` | Define a trimmed/positioned scene in a declarative timeline |
| `timeline.transition` | Define cut or cross-dissolve transitions |
| `timeline.overlay` | Define image or fixed-text overlays |
| `timeline.compose` | Compose ordered scenes, transitions, overlays, and audio |
| `audio.asset` | Add uploaded/local dialogue, music, or effects |
| `audio.jaitts` | Generate Thai voice audio through JaiTTS |
| `audio.mix` | Apply gain, fades, loudness, delay, and ducking with FFmpeg |
| `media.audio_normalize` | Normalize the exported master to the declared broadcast loudness and true-peak policy |
| `premiere.build` | Send a TimelineSpec build job to Premiere |
| `premiere.export` | Request sequential H.264 and ProRes exports |

Values can reference earlier outputs. An exact reference preserves its original type:

```json
"path": "${steps.remove_background.outputs.images.0.localPath}"
```

## Project layout

```text
src/                       CLI, runner, and adapters
schema/                    JSON Schema for the single workflow config
examples/                  Dry-run-safe example workflow
workflows/                 Exported ComfyUI API workflows go here
templates/                 AE/PR template placeholders and binding maps
adobe/after-effects/       ExtendScript host script
adobe/premiere-uxp/        Premiere bridge panel
test/                      Node tests
```

## Important host behavior

`aerender` normally launches a render instance and closes it when finished, which fits the sequential resource policy. AE template binding and the Premiere UXP bridge operate inside their host applications. The pipeline does not force-quit either host because that could destroy unsaved work.

The AE binding script refuses to run if AE already contains project items. Start with a clean/dedicated AE session so automation cannot replace a user's open project.

Premiere UXP commands and panels run inside Premiere, not as a truly headless CLI. Install UXP Developer Tool 2.2+, enable Premiere Developer Mode, load `adobe/premiere-uxp/manifest.json`, open **Window → UXP Plugins → PSU AVA Bridge**, and connect it before a `premiere.assemble` node begins. The live readiness gate requires the panel heartbeat to be less than five seconds old. The bridge requires an explicit output project and never falls back to modifying the active project.

`premiere.build` and `premiere.export` now have a preset-driven Premiere Beta 26.5 UXP host implementation. Build creates a separate project/sequence for inspection; export then runs H264 followed by ProRes with one durable receipt per stage. The host requires an explicit 25fps `.sqpreset` and trusted H264/ProRes `.epr` files, and the outer verifier confirms hashes, codecs, profile, duration, audio, and sequential timestamps. Bridge v0.4.4 must be loaded before Live; readiness blocks older heartbeats, a host/encoder version mismatch, or missing capabilities before mutation.
