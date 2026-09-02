# CG Block Editor refinement

Every screen must read as the same product if placed side by side.

## Design Read

Commit to technical / utilitarian. This is a timeline editing control, not a marketing card. The current six-column row hides the important relationship: sequence, block kind and duration. Make those primary and move secondary motion tuning into an explicit details region.

## Flow: Edit CG sequence

**Goal:** An editor can inspect and tune a multi-shot CG sequence without horizontal overflow or losing its order.

```text
[CG block list]
  -> select/add a block
  -> edit identity and timing in the shot header
  -> optionally open Motion controls
  -> reorder, disable, or delete
  -> autosave storyboard revision
```

## Flow: Set master title duration

The Node setup Duration is the one master value for a 3D Photo Carousel title. Set it once and the sequence is normalized immediately before the ordinary storyboard autosave.

- Target block count = nearest whole number to `masterDurationMs / 3200`, with a minimum of one and a maximum of twenty. Thus the current 25,300 ms title uses eight blocks.
- If the target count is smaller, remove blocks from the end of the ordered sequence.
- If it is larger, append enabled blocks from the carousel manifest in its standard editorial order.
- Split the exact master duration evenly across enabled blocks. Allocate any millisecond remainder from the first block forward, so block durations always sum exactly to the master duration.
- Existing block timing edits still set the master Duration to their enabled total. No second timing source exists.

## Per-block rendering contract

The reference is a sequence of authored shots, not one global carousel. Every block therefore owns a render override with this backward-compatible shape:

```ts
type CgBlock = {
  // existing identity, duration, enabled, mediaOrder, visibleCount, motion
  content?: { text?: string; subtitle?: string; showText?: boolean };
  appearance?: {
    backgroundColor?: string; textColor?: string; cardScale?: number;
    textPositionX?: number; textPositionY?: number;
    fontFamily?: string; fontSizePx?: number;
  };
};
```

- `content.text` overrides reference copy for that block. An empty override falls back to the reference copy: `CAROUSEL`, `EFFECT`, the global `Text` message, or `thank you`.
- `content.subtitle` overrides global Subtitle only for its block.
- `content.showText` is the per-block text-visibility switch. When omitted, each
  layout retains its current reference default; `false` hides both the text and
  subtitle layer without disabling the media shot.
- `appearance.backgroundColor`, `textColor`, and `cardScale` override the exact block only. Existing visual reference defaults remain when omitted.
- `appearance.textPositionX` and `textPositionY` are percentage offsets from the
  layout's reference text anchor, in the inclusive range `-100..100`. They move
  the copy layer only, never the image group.
- `appearance.fontFamily` selects a packaged, render-safe family. `PSU Stidti`
  uses the supplied official WOFF2 font; `System Sans` remains the reference
  fallback. `fontSizePx` is a block-local size in composition pixels and is
  clamped to the range `16..220`.
- `mediaOrder` is edited as a human-facing one-based comma list in the UI and stored as the existing zero-based indices. `visibleCount` remains the count cap.
- `motion` already provides stagger and blur. Keep `enter` and `exit` as advanced values for future motion variants rather than expose controls that renderer cannot yet vary.

## Global title contract

- `Text` is the preset-wide fallback message used by a text-hold block without `content.text`.
- `Title` is independent editorial metadata/fallback for non-carousel title rendering. It must never be copied from, or overwrite, `Text`.
- `Subtitle` and `Eyebrow` remain independent global metadata. A block subtitle has priority only in that block.

States:

- populated: numbered shot rail, one compact card per block
- empty: explanatory text plus Add block selector; no blank bordered card
- disabled: 55% opacity and `Disabled` state tag; inputs remain readable but are disabled except Enable/Delete
- add: inserted after current final block; focused block remains visible
- validation: values retain native numeric constraints; duration must be at least 40ms; photos shown only for media layouts
- save/network: existing storyboard save status remains the source of truth; the editor must not claim a separate save completed

## Component: CgBlockEditor

### Structure

1. Header: `CG Blocks`, a one-line sequence total, and Add block control. The header wraps at narrow width.
2. Ordered list: use `ol` semantics. Each `li` is a shot card with a left shot rail containing order plus accessible move buttons. Whole-shot visibility is a 20px icon-only control in the rail, visually subordinate to ordering and never a row-sized button.
3. Card header: block-type select, duration field, enabled checkbox, and a compact `×` delete icon. This is the only always-visible control group.
4. Detail region: `details/summary` or an accessible disclosure labelled `Motion & media`. It contains Photos, Stagger, and Blur in a two-column responsive grid. Text/outro/fade hide Photos.
5. The disclosure has four compact field groups: Copy (visibility, text/subtitle, X/Y anchor), Look (background/text colors, font, font size and card scale), Media (one-based image order/count), and Motion (stagger/blur). Hide groups that cannot affect the selected layout.

### Responsive behavior

| width | behavior |
| --- | --- |
| >= 1280 | inspector cards use a two-column header; controls never force parent overflow |
| 768-1279 | header actions wrap below title; tuning grid remains two columns |
| < 768 | all card header controls stack; move buttons form a horizontal group; full-width touch targets >= 40px within desktop tool use |

No child sets a fixed grid width larger than its inspector. Controls must have `min-width: 0`; cards must not create a horizontal scrollbar.

### Accessibility

- `ol`/`li` announce block order.
- move buttons receive `aria-label="Move <name> earlier/later"`.
- delete receives `aria-label="Delete <name> block"`.
- disclosure uses native `details`/`summary` or correct `aria-expanded`.
- visible `:focus-visible` ring uses locked accent.
- numeric fields retain their accessible labels.

### Acceptance criteria

- No horizontal clipping at the current 480px inspector width shown in the screenshot.
- Sequence, type, duration and enabled state are visible without expanding a block.
- Photos, Stagger and Blur are available but not visually equal to sequence/timing.
- Existing block data and callbacks are preserved exactly.
- Changing the top-level 3D Title Duration normalizes the CG block count and makes their enabled duration total equal the requested value exactly.
- Obsolete rotation speed, camera tilt and reflection controls are not shown because the reference renderer does not consume them.
- A block content/look/media edit changes the real Remotion output for that block only; no control is present merely as UI decoration.
- Global Text and Title retain distinct values through edit, persistence and render fallback.
- One block consumes no more than a compact card plus optional expanded details; no nested-card appearance.
- Keyboard operation supports reorder, type selection, enable, delete and disclosure.
- A text-capable block can set X/Y, font family and font size; each value changes its real Remotion copy layer only.
- `PSU Stidti` is loaded from a repository-managed WOFF2 asset, never directly from the mounted `/Volumes` path at render time.
- The Interactive Storyboard Timeline Editor uses the same `CgBlockEditor` and
  master-duration normalization contract as the node inspector. It may retain
  its timeline-specific transport controls, but must not provide a parallel CG
  block editor or a separate duration calculation.

## Build handoff

Target: engineering worker for the Vite React UI. Implement exactly this spec with the locked CSS tokens and existing component vocabulary. Do not redesign data semantics or change the renderer. Own only `apps/control-web/src/components/CgBlockEditor.tsx`, its focused tests if needed, and styles required for this component. Do not re-implement a different design system.

## Pre-flight

- Identity lock: pass. Existing dark broadcast tokens retained; one accent and radius scale.
- Anti-slop: pass. No gradients, glow, generic bento/cards, or decorative data.
- State coverage: pass. Empty, disabled, validation and save ownership stated.
- Accessibility: pass. List semantics, labels, focus, disclosure and keyboard actions specified.
- Cognitive load: pass. Four primary controls maximum; secondary tuning disclosed.
- Scores: distinctiveness 3, hierarchy 4, consistency 4, accessibility 4, state coverage 3, copy 4, restraint 4, motion 3. Total 28/32. No score is <= 2.

### Typography & placement addendum pre-flight

- Identity lock: pass. `PSU Stidti` is a real institutional type asset used only as an authored render choice; editor UI type remains locked.
- Anti-slop: pass. No decorative font picker, gradients or new card treatment; typography and position are operational controls.
- State/accessibility: pass. The icon retains an accessible label; number fields retain labels and bounds; unavailable font falls back to System Sans.
- Revised hierarchy: the whole-shot eye shrinks to the rail's 20px utility action because it is secondary to sequence and timing.
- Scores: distinctiveness 3, hierarchy 4, consistency 4, accessibility 4, state coverage 3, copy 4, restraint 4, motion 3. Total 28/32. No score is <= 2.
