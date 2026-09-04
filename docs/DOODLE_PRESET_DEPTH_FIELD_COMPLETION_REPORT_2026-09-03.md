# Doodle Preset Depth Field — Completion Report

**Project:** Midnight Shorts Studio (`@psu-ava/*`)  
**Date:** 2026-09-03  
**Status:** Completed and build-verified  
**Scope:** Cover Card vector doodle presets, deterministic randomization, and preset selection

---

## Executive summary

The Cover Card doodle treatment has been advanced from a fixed corner-sticker layout into a deterministic editorial depth field. The completed implementation preserves repeatability for saved cards while allowing operators to generate materially different arrangements through a single **Randomize preset** control.

The approved visual direction is deliberately restrained:

- one primary hero accent per preset;
- small, stationary doodle clusters that establish foreground, middle, and background depth;
- seeded negative space to preserve text legibility;
- distribution informed by a rule-of-thirds field, without locking assets rigidly to its intersections.

## Delivered capabilities

### Preset catalogue

The vector preset catalogue now supports these broadcast-ready treatments:

| Preset | Intended use |
| --- | --- |
| Academic | Learning, lectures, study tips |
| Science | Health, laboratory, research |
| Wellbeing & Humanities | Mindset, counselling, people stories |
| Engineering | Technology, makers, calculations |
| Celebration | Achievements, awards, events |
| Vlog Stickers | Creator and social content |
| Tourism & Hospitality | Travel, places, service stories |
| Creative Arts | Art, performance, creative process |
| Sustainability | Environment and community impact |
| Campus Community | University life and campus news |

### Seeded depth field

Each stored seed deterministically creates:

1. **Three to five stationary emitters** positioned from the rule-of-thirds field.
2. **Four to six doodles per emitter**, so each result has variable density rather than a uniform wallpaper pattern.
3. A golden-angle scatter distribution around each emitter, with bounded placement for frame safety.
4. Depth-dependent size, opacity, blur, and spread: distant groups are smaller, wider, softer; near groups are denser and clearer.
5. Preset-specific quiet anchors plus two seeded negative-space zones.
6. A protected lower-left text zone that reduces doodle prominence behind headline and subtitle content.

The renderer does not re-randomize per frame. The same saved seed produces the same arrangement during preview, reopening, and final render.

### Operator workflow

- The previous numeric **Seed** entry was replaced by `🎲 Randomize preset` in the Cover Card inspector.
- Pressing the control writes a generated seed to the card parameters.
- The seed is passed from `StoryboardSequence` through `CoverCard` into `DoodleOverlayPreset`.
- The chosen preset continues to be selected automatically from content classification, with explicit coverage for tourism, creative, sustainability, and campus categories.

## Primary implementation files

| File | Change |
| --- | --- |
| `apps/remotion-studio/src/presets/DoodleOverlayPreset.tsx` | Expanded presets and icons; implemented deterministic hash, golden-angle emitter scatter, depth hierarchy, safe zones, and seeded negative space. |
| `apps/remotion-studio/src/components/CoverCard.tsx` | Added `doodleSeed` prop and forwarded it to the preset renderer. |
| `apps/remotion-studio/src/compositions/StoryboardSequence.tsx` | Reads saved `doodleSeed` from card parameters and supplies it to Cover Card rendering. |
| `apps/control-web/src/components/inspectors/CoverCardInspector.tsx` | Replaced manual seed input with `🎲 Randomize preset`; added new preset options. |
| `apps/remotion-studio/src/types.ts` | Expanded the `DoodlePresetId` union. |
| `packages/storyboard/src/cover-formatting.ts` | Added classification mappings for the expanded preset set. |
| `packages/storyboard/test/auto-broll.test.ts` | Added automatic-preset-selection coverage. |

## Final visual guardrails

- Only the first qualifying accent is allowed to become a hero mark.
- Hero width is capped at 18% of the frame.
- Micro texture is capped at 6.2% of the frame.
- The remaining accents are intentionally subordinate, preventing competition with the title.

## Verification performed

Executed in `/Users/louislee/Desktop/Midnight-Shorts-Studio`:

```bash
npm run build --workspace=@psu-ava/remotion-studio
npm run build --workspace=@psu-ava/control-web
```

Both commands completed successfully with exit code 0 on 2026-09-03. The Vite production build reported only its existing bundle-size advisory; no type or build error was reported.

## Scope boundary

No broadcast service, deployment configuration, process, or external production data was changed. This report covers workspace source and production-build verification only.

[Updated by: Codex | Time: 2026-09-03 19:08:33]
