# Midnight Shorts Studio — Adobe-Free Migration Checkpoint

Updated: 2026-09-01 (Asia/Bangkok) — drift-corrected after session completion

## Prompt parts standard — 2026-09-02

Cover Card background generation accepts reusable `promptParts` grouped by
place, time, color, lighting, composition, style, and detail. Both Storyboard
Editor and Interactive Timeline use the same editor and rendered positive
prompt. Provider-specific words and negative prompt clauses are removed from
the template; the ComfyUI workflow keeps only an empty conditioning socket for
sampler compatibility. The preferred 16:9 latent is 1344x768 while delivery
remains 1920x1080.

## Session objective

Continue development of Midnight Shorts Studio as a fully Adobe-independent video assembly system. The intended production path is Storyboard + Remotion + FFmpeg, with ComfyUI used only for generative visual assets when a workflow requests it.

This checkpoint was created after a read-only repository and report review. It has since been drift-corrected to reflect source-code modifications made during the 2026-09-01 session. Runtime verification (build + test + git push) was performed and confirmed against HEAD `0b7794d`.

## Current direction

Adobe After Effects, Premiere Pro, MOGRT, ExtendScript, UXP, and Adobe host resource leases are no longer part of the intended production path.

The target data flow is:

```text
Storyboard Editor
    -> approved storyboard / cutlist
    -> A-roll + B-roll + CG + subtitle + audio timeline
    -> Remotion input props
    -> browser preview / Remotion render
    -> final MP4 master
```

ComfyUI remains an optional adapter for generating backgrounds, doodles, or other source plates. Text, layout, animation, compositing, and final timeline assembly should remain deterministic and data-bound in React/Remotion unless an explicit workflow node says otherwise.

## Work confirmed in the repository

1. The main Adobe decoupling began at commit `af1bdeb` and was extended through a chain of commits ending at HEAD `0b7794d` (2026-09-01). The session commits include:
   - `af1bdeb` — initial Adobe adapter removal and Remotion adapter bootstrap;
   - subsequent commits through `0b7794d` adding: Storyboard-to-Remotion live sync, multi-aspect ratio, media resolver, single-port in-page player, interactive multi-track timeline editor, and 5-phase 3D Carousel CG.
2. `packages/storyboard` compiles approved storyboard data into a deterministic timeline and Remotion props.
3. The Control Center contains a Storyboard Editor and an embedded native Remotion player.
4. The current storyboard path includes A-roll, B-roll, title/cover graphics, subtitles, and audio timeline concepts.
5. Implemented motion presets include Bounce, Pop, Spring, Zoom Punch, Backdrop Blur, and a parametric 3D Photo Carousel.
6. Recent commits added:
   - live Storyboard-to-Remotion synchronization;
   - multi-aspect selection;
   - media path resolution and proxy support;
   - an interactive multi-track timeline editor;
   - real-photo binding and five-phase choreography for the 3D carousel.
7. Existing render evidence includes:
   - `outputs/live-test-vertical.mp4`;
   - `outputs/live-test-horizontal.mp4`;
   - longer documentary and storyboard renders under `outputs/rendered/`.
8. The verified build and test baseline at HEAD `0b7794d`: **98/98 tests pass** across 8 Vitest workspaces. The older "182 passing tests" figure is Adobe-era and should not be used as evidence for the current HEAD.

## Important repository inconsistencies

The new runtime direction is Adobe-free, but repository documentation and catalog metadata are not yet fully migrated.

- ~~`AGENTS.md` still declares an Adobe compatibility baseline and sequential Adobe adapter constraints.~~ **RESOLVED (2026-09-01):** `AGENTS.md` was updated this session to remove Adobe constraints; Core Principle 5 (Strict Real Data & Zero-Deception) was added.
- `README.md` still documents AE, Premiere, UXP, Adobe readiness, resource leases, and Adobe node types.
- `docs/architecture.md`, `docs/CONTROL_CENTER.md`, `docs/FIRST_USER_TRIAL.md`, `docs/ACCEPTANCE_REPORT.md`, and `PROTOTYPE_CHECKPOINT.md` describe the earlier Adobe system.
- `docs/PSU_AVA_COMPLETE_MANUAL_AND_SYSTEM_REPORT.html` is an Adobe-era 64-node manual and is not the source of truth for the new runtime.
- The node catalog, examples, tests, templates, presets, tools, and output artifacts still contain legacy Adobe references.
- `templates/after-effects/`, `templates/premiere/`, Adobe export presets, `.prproj`, `.mogrt`, and old XML artifacts remain in the repository.

Therefore, “Adobe decoupling complete” currently means that the main adapter/render implementation was replaced. It does not yet mean that every document, node definition, example, test fixture, or historical artifact has been migrated or archived.

## Working tree safety

At drift-correction time, `git status` shows:

```text
 M apps/remotion-studio/remotion.config.ts   ← still unstaged (hardware accel: "if-possible")
?? docs/CHECKPOINT_ADOBE_FREE_MIGRATION_2026-09-01.md
```

All other session work (timeline editor, 3D Carousel preset, single-port player, CG replication) is committed and pushed to `main` (`HEAD: 0b7794d`). The `remotion.config.ts` unstaged change is pre-existing user work — do not revert or overwrite without confirming its purpose.

## Recommended next-session sequence

1. ~~Follow ContextForge and repository `AGENTS.md` context gates before modifying files.~~ **DONE (2026-09-01)**
2. ~~Inspect `git status` and preserve the existing `remotion.config.ts` change.~~ **DONE — remotion.config.ts remains unstaged as intended.**
3. ~~Establish an authoritative Adobe-free architecture document and update `AGENTS.md` first so future agents do not follow obsolete Adobe constraints.~~ **DONE — `AGENTS.md` updated; Core Principle 5 added.**
4. Inventory Adobe references and classify each as:
   - active runtime dependency;
   - compatibility/migration code;
   - historical evidence;
   - safe archival/deletion candidate.
5. Define the canonical Adobe-free node catalog. At minimum confirm contracts for:
   - storyboard/cutlist compilation;
   - A-roll selection and editorial ordering;
   - B-roll pool, semantic matching, placement, and approval;
   - Cover Card and text layers;
   - subtitle generation/rendering;
   - audio mix;
   - Remotion preview and final render;
   - QC and export.
6. Verify that Control Center readiness is capability-scoped to Remotion/FFmpeg/ComfyUI/JaiTTS and no longer blocks on Adobe.
7. Run the current verification baseline:

```bash
npm run build
npm test
npm run validate
npm run dry-run
node scripts/test-render-video.js
```

8. ~~Record fresh test counts.~~ **DONE — 98/98 tests pass at `HEAD: 0b7794d`.** Still pending: end-to-end render duration, audio presence, and output hashes at the new HEAD.
9. Perform a supervised end-to-end trial from Storyboard Editor to final MP4 without launching any Adobe application.
10. After acceptance, update the Center Report and append the required audit stamp, then call ContextForge `refresh_index`.

## Product behavior to preserve

- One JSON workflow remains the source of truth.
- Steps inside one workflow execute sequentially and checkpoint after each node.
- Failed runs remain resumable and must not lose completed outputs.
- Fixed text and templates remain data-bound; an LLM cannot rewrite them unless an explicit LLM node exists.
- Credentials remain in environment variables, never workflow JSON.
- Local services bind to loopback unless deployment is explicitly designed and approved.
- A-roll is the narrative/audio backbone. B-roll is placed above it to illustrate the spoken context without destroying dialogue continuity.
- Cover Card background generation is separate from editable text and layout. The final composition belongs to Remotion, not ComfyUI.
- Thai prompts intended for models that do not reliably understand Thai should be translated/compiled to English before submission while preserving the original Thai brief as metadata.

## Confidence and open questions

Repository understanding at handoff: approximately 85–90%.

Well understood:

- target Adobe-free architecture;
- Storyboard-to-Remotion data flow;
- current Control Center preview direction;
- A-roll/B-roll relationship;
- Cover Card separation of generated imagery and deterministic text/layout;
- recent 3D carousel work.

Still requiring direct runtime verification:

- whether every published workflow compiles to the Remotion path;
- whether legacy Adobe catalog entries are reachable from the current UI;
- ~~current test count and build health at HEAD~~ — **RESOLVED: 98/98 tests pass, build clean at `0b7794d`.**
- real parallel-render behavior versus sequential workflow execution;
- full-duration audio/subtitle synchronization;
- end-to-end artifact quality for the latest interactive timeline edits.

## Primary references

- `README.md`
- `AGENTS.md`
- `packages/storyboard/src/index.ts`
- `apps/remotion-studio/src/`
- `apps/control-web/src/StoryboardEditorPage.tsx`
- `apps/control-web/src/components/InteractiveTimelineStudioModal.tsx`
- `apps/control-api/src/node-catalog.ts`
- `docs/HANDOFF_NODE_USABILITY_ROADMAP.md`
- `/Users/louislee/Desktop/Center_Reports/midnight_shorts_studio.md`

## Handoff status

Session completed (2026-09-01). Adobe decoupling, single-port Remotion player, interactive timeline editor, and 5-phase 3D Carousel CG are all committed and pushed to `main` (`HEAD: 0b7794d`). Next session should begin with end-to-end render verification (step 9 above) and legacy Adobe reference cleanup (step 4).

## Follow-up handoff — 3D Photo Carousel Showcase (2026-09-01)

Reference video: `/Users/louislee/Downloads/preview_540p_crf22_higher_quality.mp4` (960x540, 30fps, 25.354s). It is an editorial multi-shot showcase, not a continuous rotating carousel:

```text
layered-stack -> scattered-collage -> text-hold -> hero-strip
-> portrait-grid -> image-sweep -> text-hold -> image-sweep
```

Implemented in the working tree:

- neutral preset id `3d-carousel-title-v1`;
- standard `text` input through Storyboard UI -> Remotion props -> Showcase preset;
- Storyboard graph path `effect.3d_carousel -> timeline.graphic_overlay`;
- white editorial canvas, sage-green typography, rounded cards, and no fabricated default media paths;
- per-shot `{ layout, durationMs, mediaOrder? }` sequence input;
- shot-local timing, staggered per-card enter/exit, directional image sweep, and layout-specific transforms;
- editable `layoutSequence` JSON in the Storyboard UI;
- `remotion.config.ts` hardware acceleration set to `if-possible`;
- runtime storyboard `kewalin_documentary_2569` is revision `39`; `title_intro` is `25300ms` with preset `3d-carousel-title-v1`.

Verification:

- Remotion Studio build passes;
- Control Web tests: 37/37 pass;
- Storyboard tests: 5/5 pass;
- configured six-image title media files exist on the local NAS mount.

### Block-driven CG update (2026-09-01, follow-up)

The raw `layoutSequence` input has now been superseded in the Storyboard inspector by a visual `CG Blocks` editor. It supports adding, deleting, reordering, enabling and disabling blocks, plus per-block duration, visible photo count, stagger and motion-blur controls. The renderer now consumes `cgBlocks` directly; it does not treat the editor as a mock configuration layer.

The active real storyboard was migrated through the local Control API to revision `40`. `title_intro` retains its 25,300 ms duration and uses this only source of sequencing:

```text
photo-stack (5000) -> photo-collage (3800) -> text-hold (4500)
-> hero-strip (3000) -> portrait-row (2500) -> image-sweep (3500)
-> outro (2000) -> fade-to-black (1000)
```

Evidence after migration: `node scripts/render-carousel-inspection.js` produced the real-media output at `outputs/inspection/3d-photo-carousel-reference-check.mp4` (25.386667 s, 4,105,858 bytes). Its contact-sheet inspection confirms the eight configured block types in order and a black final frame. Remotion Studio build passes; Control Web is 37/37 and Storyboard package is 5/5.

Next agent: add focused tests for block timing sums, media-order bounds and deterministic slots. If further visual matching is requested, tune only against the real reference and current NAS media; do not replace real media with sample assets.

### CG Block Editor responsive repair (2026-09-01)

The first visual block editor used a fixed seven-column inline grid and overflowed the narrow Storyboard inspector. It is now a responsive ordered shot rail: type, duration and enabled state stay visible; media/motion controls are progressively disclosed only for image blocks. Text hold, outro and fade blocks do not expose media or motion values that do not affect the renderer. The implementation lives in `apps/control-web/src/components/CgBlockEditor.tsx` and `CgBlockEditor.css`; Control Web tests remain 37/37 and its production build passes.

### Per-block authored overrides and two-way timing (2026-09-01)

The Showcase renderer now reads block-level `content` (`text`, `subtitle`) and `appearance` (`backgroundColor`, `textColor`, `cardScale`) values. The block inspector writes those exact values, supports human-facing one-based media order, and retains per-block visible count, stagger and blur. Empty overrides preserve the sampled reference defaults; no parameter is shown only as a UI mock.

`Text` and `Title` were incorrectly coupled by a temporary UI callback. They are now independent: `Text` is the global fallback for a text-hold shot; `Title` is independent editorial/non-carousel fallback metadata. The master title Duration and enabled block durations are bidirectional: editing a block updates master total; editing master duration picks a 3.2s target block count, removes/adds trailing/manifest blocks as needed, and divides the exact requested duration among enabled blocks. Control Web is 42/42 tests; Control Web and Remotion Studio builds pass.

Do not use existing files under `outputs/rendered/` as Showcase evidence; those renders predate isolated Showcase validation. Preserve the unstaged user change in `apps/remotion-studio/remotion.config.ts`.

### Shared Timeline inspector and text visibility (2026-09-01)

The Interactive Storyboard Timeline Editor was not a separate render data
source: its preview already received the current storyboard params. Its title
inspector and duration updater were nevertheless implemented independently,
so they could drift from the node editor. It now embeds the same
`CgBlockEditor` and invokes the same master-duration normalization helper.
The obsolete rotation-speed and camera-tilt controls were removed because the
reference renderer does not consume them.

Each text-capable CG block now has `content.showText`. It is independent from
the left-rail eye: the eye enables/disables the whole shot, while `showText`
only hides the copy/subtitle layer and keeps the image/motion/timing intact.
Omitted values keep legacy reference behavior. The implementation is real end
to end: Control Web persists `cgBlocks`, Timeline preview passes them to
Remotion, and `ReferenceShowcasePreset` consumes the flag.

Verification after this update: Control Web tests **43/43**, Storyboard tests
**5/5**, Control Web production build and Remotion Studio type build pass;
`git diff --check` passes. The Vite development page remains
`http://127.0.0.1:5173/storyboards/kewalin_documentary_2569/edit` (refresh the
open tab to load the changed component).

Node-authoring standard for future presets: `docs/NODE_AUTHORING_STANDARD.md`.

### CG text typography and placement (2026-09-01)

The CG block editor now keeps whole-shot visibility as a small 20px eye utility
in the shot rail, leaving sequence and timing as the primary controls. Text
capable blocks expose render-bound typography and placement values:
`textPositionX`, `textPositionY` (`-100..100` percent offsets),
`fontFamily` (`system` or `psu-stidti`), and `fontSizePx` (`16..220`). These
apply to the block text layer only and preserve the legacy defaults when absent.

The supplied official PSU Stidti regular and bold WOFF2 files were copied into
`apps/remotion-studio/public/fonts/`, and the renderer loads them through
Remotion `staticFile`. It never depends on the mounted `/Volumes` path during
preview or render. The same typography controls are available from the node
inspector and the Interactive Timeline because both use `CgBlockEditor`.

Verification: Control Web **43/43** tests, Storyboard **5/5** tests, both
production/type builds and `git diff --check` pass. Vite may display its
existing large-bundle warning only.

### Compact CG controls and comma-safe image order (2026-09-01)

The CG inspector was tightened for the desktop workspace: all standard fields
use a 32px control height, the whole-shot eye is a 20px icon, and text
visibility is an inline compact checkbox rather than a full-height form row.
Image order now keeps the raw input while typing and canonicalizes only on
blur, so comma-separated input such as `3,` is not erased by a controlled
parse/re-render cycle.

Control Web **43/43**, Storyboard **5/5**, both builds and `git diff --check`
remain passing.

### Cover Card Adobe-free migration and live ComfyUI prompt binding (2026-09-01)

Cover Card v2 no longer requires a MOGRT path or Adobe graphic node. Its text
layer is declared as `timeline.graphic_overlay` with
`graphic.renderer = remotion` and `presetId = cover-card-v2`; the active
storyboard was also cleaned of stale `mogrtPath` values. The v2 layer contract
is now `remotion-cover-v2`, while v1 remains an explicitly legacy compatibility
path and is not the current default.

The ComfyUI prompt is not a production mockup. Cover Card now requires an
English prompt and sends it directly to `6.inputs.text` in
`generate-cover-background-zimage.api.json` -> real
ComfyUI adapter POST `/prompt` at the configured ComfyUI host -> output
download and review asset. No Cover Card compiler node contains `llm.chat` or
`mockResponse`. The adapter's dry-run fallback is test infrastructure only; it
is not used when the workflow runs live.

Verification: Storyboard **5/5**, Node SDK **8/8**, Control Web **43/43**;
Control Web production build and Remotion Studio type build pass. The broader
storyboard export graph still contains legacy Premiere build/export nodes for
other delivery workflows; this checkpoint therefore claims Adobe removal for
the active Cover Card generation/compositing path, not a completed removal of
all legacy export adapters from the repository.

### Per-node GenAI execution (2026-09-01)

Cover Card now exposes `Run node` in the Storyboard inspector. The API creates
an isolated, unsaved compilation containing only the selected storyboard item,
validates it, evaluates AI readiness, and queues the run with a bound stop
point at that node's ComfyUI workflow. `auto` runs live when readiness passes;
otherwise it is explicitly reported as `dry-run-fallback`. The editor displays
the run mode/status and links to the existing Run Monitor for generated
artifacts. This action never queues the complete storyboard.

Verification: Control API build, Control Web build, Control Web **43/43**,
Storyboard **5/5**, Node SDK **8/8**, and `git diff --check` pass. The initial
implementation was not live-tested; the subsequent 4-layer proof below is the
authoritative live evidence.

### Cover Card live 4-layer proof and Debian target (2026-09-01)

The previous node-run 500 was traced to three concrete runtime issues: the
workflow schema omitted `timeline.graphic_overlay`, isolated node graphs were
being rejected by an unconnected compose requirement, and long run IDs could
exceed the monitor router parameter limit. The node-run graph now contains only
the selected GenAI dependency, snapshots use a unique short run id, and the
editor receives a monitor-safe URL.

Prompt authoring is now template-based and English-only. A short user direction
is appended to an invariant background template that requires an empty
photographic environment, negative title space, no people and no rendered text.
Doodle uses a separate invariant template requiring pure white line art on pure
black; the existing luminance-to-alpha adapter converts it to transparent RGBA
without thresholding.

Live evidence from Debian ComfyUI (`10.135.66.70:8188`, Linux, ComfyUI 0.20.1,
CUDA): background generation returned a real PNG (1920×1080, 1,274,448 bytes),
and doodle generation returned a real PNG (1920×1080, 1,623,474 bytes). The
doodle was converted to real RGBA alpha (`doodle-alpha.png`, 1920×1080), and
Apple Vision produced the real person cutout (`person-cutout.png`, 2832×4240,
RGBA). Remotion then rendered all four layers into:
`prototype-runs/run_mtiu68w5_07dedd0b-567/cover-card-4-layer-proof.mp4`
(1920×1080, 5,852,271 bytes). A mid-frame inspection confirms the four layers
are composited together; this is real render evidence, not a mockup.

### Cover Card full asset preparation and Timeline proof (2026-09-01)

The Cover Card `Run node` action now supports an `assets` stage that executes
the real source -> Apple Vision cutout -> ComfyUI background and doodle -> Core
Image alpha path as one connected workflow. Generated paths are bound back to
the active storyboard params as `backgroundImage`, `personImage` and
`doodleImage`, which are consumed by the Storyboard Timeline Editor preview
and Remotion render. The stale `mogrtPath` on `cover_3` was removed.

Live run `run_mtiwq3x2_86f80ac0-042` completed **5/5** steps with verification
**34/34**. The active storyboard is revision **119**. The background prompt
now requires sharp architectural focus with no bokeh or blur. The doodle
prompt requires thin high-contrast strokes, and `tools/luma-to-alpha.swift`
applies Core Image edge extraction before creating white RGBA alpha so filled
AI matte shapes do not cover the composition.

The current Timeline-bound Remotion proof is
`apps/remotion-studio/outputs/cover-card-proof/cover_3-current-v2.mp4`
(1920×1080, 150 frames). Its inspected final frame shows generated background,
person cutout, thin doodle overlay and readable Thai text together. The
corrected alpha implementation was live-verified by
`run_mtix0l5w_4f34b451-c23` with **24/24** checks passed.

### Reusable Cover Card text contract (2026-09-02)

Cover Card text styling is now represented by the reusable `params.textStyles`
contract. `eyebrow`, `title` and `subtitle` each own independent
`fontFamily`, `positionX`, `positionY`, `size` and `color` properties. The
Remotion renderer consumes these values directly with safe defaults, while the
Control Web and Interactive Timeline Editor share the same compact
`TextLayerStyleEditor` component.

This establishes the standard named **Schema-driven, reusable node
architecture**: a shared contract is the single source of truth for persisted
params, inspector controls, timeline editing and rendering. Future nodes should
reuse the text layer contract and editor rather than introduce node-specific
font/position/size/color keys.

Verification: Control Web **43/43**, Storyboard **5/5**, Control Web/Remotion/
Storyboard builds and `git diff --check` pass. This change is contract/UI/render
integration; the existing real Cover Card render evidence remains the live
acceptance artifact for generated media.
