# 🏛️ Handoff Architecture & Blueprint: Full Web UI Redesign

**Project:** Midnight Shorts Studio (`apps/control-web`)  
**Date:** 2026-09-03  
**Author:** Antigravity (Google DeepMind)  
**Target Milestone:** Full Web UI Redesign ("Midnight Pro Studio Edition")  
**Current Baseline Commit:** `1b7e1ab` on `origin/main`

---

## 1. Vision & Architectural Objective

The goal of this upcoming initiative is to elevate the **entire frontend user interface (`apps/control-web`)** from a functional prototype into a **world-class, high-density, professional Non-Linear Editor (NLE) & Creative Studio UI** (inspired by modern web-first creative tools like Linear, DaVinci Resolve, Figma, and Premiere Pro Essential Graphics).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MIDNIGHT PRO STUDIO - 3-PANE LAYOUT                      │
├─────────────────┬───────────────────────────────────┬───────────────────────┤
│ 1. SHOT STRIP   │ 2. LIVE STUDIO CANVAS & TIMELINE  │ 3. MODULAR INSPECTOR  │
│ ├─ Cover Card   │ ┌───────────────────────────────┐ │ ┌───────────────────┐ │
│ ├─ 3D Intro     │ │                               │ │ │ Tabbed Controls   │ │
│ ├─ A-Roll 1     │ │      Live Video Player        │ │ │ ├─ Preset Style   │ │
│ ├─ A-Roll 2     │ │      (Remotion Player)        │ │ │ ├─ Media Assets   │ │
│ ├─ Lower Third  │ │                               │ │ │ ├─ Motion & Timing│ │
│ └─ Outro Sting  │ └───────────────────────────────┘ │ │ └─ Mini Preview   │ │
│                 │ ┌───────────────────────────────┐ │ └───────────────────┘ │
│                 │ │ NLE Multi-Track Timeline Strip│ │                       │
│                 │ └───────────────────────────────┘ │                       │
└─────────────────┴───────────────────────────────────┴───────────────────────┘
```

---

## 2. "Midnight Pro Studio" Design System Foundation

We will introduce a centralized design system token library (`apps/control-web/src/design-tokens.css`) to eliminate fragmented CSS across the app.

### 🎨 Color Palette & Elevation Tokens

| Semantic Token | Value | Visual Purpose |
| :--- | :--- | :--- |
| `--bg-canvas` | `#060A12` | Deepest root background |
| `--bg-surface-1` | `#0B1220` | Primary panel backgrounds |
| `--bg-surface-2` | `#111C30` | Card containers & modal bodies |
| `--bg-surface-3` | `#1E293B` | Interactive hover & input backgrounds |
| `--accent-gold` | `#E5A93C` | Primary branding, active highlights, keyframe diamonds |
| `--accent-cyan` | `#00E5FF` | Secondary badges, telemetry, scanlines, split-points |
| `--accent-blue` | `#3B82F6` | Primary action buttons & timeline selection bounds |
| `--accent-green`| `#10B981` | Validation passes, render successes, toggle active |
| `--accent-rose` | `#F43F5E` | Deletions, warnings, recording indicators |
| `--text-primary`| `#F8FAFC` | Main headings & values |
| `--text-muted`  | `#94A3B8` | Subtitles, labels, timecode markers |
| `--border-subtle`| `rgba(255, 255, 255, 0.08)` | Ultra-clean razor borders |
| `--border-glass` | `rgba(229, 169, 60, 0.25)` | Gold luminous glass perimeter |

### 🔮 Surface Glassmorphism & Micro-Interactions
- **Frosted Glass Cards:** `backdrop-filter: blur(16px); background: rgba(11, 18, 32, 0.82);`
- **Soft Specular Lighting:** Inset highlight shadow `inset 0 1px 0 rgba(255, 255, 255, 0.12)`.
- **Transitions:** Snappy `150ms cubic-bezier(0.16, 1, 0.3, 1)` easing on all hover/focus states.

---

## 3. Page-by-Page Redesign Blueprint

### 🎬 Page 1: Storyboard Editor (`StoryboardEditorPage.tsx`)
1. **Header Toolbar**:
   - Project Title with inline editing and auto-save revision pill (`v1.4 • Saved`).
   - Aspect Ratio Switcher (`9:16` Portrait / `16:9` Landscape / `1:1` Square) with live icon badges.
   - Quick Actions: `▶ Play Storyboard`, `⚡ Open Studio Timeline`, `🚀 Render Output`.
2. **Left Column — Visual Shot Strip**:
   - Vertical thumbnail card list representing the sequence (`Cover` $\rightarrow$ `Intro` $\rightarrow$ `A-Rolls` $\rightarrow$ `Outro`).
   - Drag-and-drop reordering with fluid insertion line indicators.
   - Badge overlays showing duration (`3.5s`), B-Roll count (`2 B-Rolls`), and Lower Third indicators.
3. **Center Column — Live Remotion Player**:
   - Crisp canvas display with overlay safe-zone guides (9:16 mobile UI overlays).
   - Timecode scrubber bar with play/pause, step-forward (+1 frame), step-back (-1 frame).
4. **Right Column — Tabbed Node Inspector**:
   - Replaces long scrolling pages with structured, clean tabs:
     - **Tab 1: 🎨 Preset & Art Style** (Preset selector, 3D camera controls, layout geometry).
     - **Tab 2: 📁 Media & Assets** (Video path, image gallery, B-roll stack, Finder pickers).
     - **Tab 3: ⏱️ Timing & Split Edits** (25fps Range sliders, J-Cut/L-Cut, Split/Merge buttons).
     - **Tab 4: 🏷️ Graphics & Lower Thirds** (Speaker badges, Subtitle toggle, Lower Third cards).

---

### ⏱️ Page 2: Interactive Timeline Studio (`InteractiveTimelineStudioModal.tsx`)
1. **NLE-Grade Multi-Track Ruler & Scrubber**:
   - Timecode header with frame-accurate ticks (00:00:00:00).
   - Dynamic zoom slider ($1\text{s}$ to $60\text{s}$ viewport scale).
2. **Track Lane Architecture**:
   - **Track 1 (V1 — Main Sequence):** Storyboard blocks with color-coded node headers.
   - **Track 2 (V2 — B-Roll Overlays):** Nested cutaway strips with in/out duration drag handles.
   - **Track 3 (G1 — Graphic & Lower Thirds):** Gold-accented overlay strips showing exact lower third durations.
   - **Track 4 (A1 — Primary Audio):** Waveform visualization with J-Cut / L-Cut audio extensions.
3. **Magnetic Snapping & Trim Physics**:
   - Real-time magnetic snapping to clip heads, tails, and playhead cursor.

---

### 🕸️ Page 3: Workflow Graph Editor (`WorkflowGraphEditorPage.tsx`)
1. **Node Graph Canvas**:
   - Modern infinite grid canvas with smooth pan, pinch-to-zoom, and mini-map navigator.
   - Glowing Bezier curves with animated energy pulses along active execution paths.
2. **Node Cards**:
   - Status indicators (Draft / Validated / Running / Approved / Error).
   - One-click inline node execution buttons (`⚡ Run Node`).

---

### 📦 Page 4: Workflow Catalog & Runs Dashboard (`WorkflowCatalogPage.tsx`, `RunsListPage.tsx`)
1. **Catalog Showcase**:
   - Modern recipe cards with dynamic tag chips (e.g. `Remotion Engine`, `ComfyUI AI`, `Documentary`).
   - Hover video preview and one-click "Instantiate Recipe" modal.
2. **Runs Dashboard**:
   - Real-time step execution progress bars with live log streaming drawer.

---

## 4. Execution Phases & Milestones

```
Phase 1: Design Tokens & CSS Unification
 └─ Create `design-tokens.css`, refactor `inspectors.css`, `storyboard.css`, and `styles.css`.

Phase 2: Storyboard Editor 3-Pane Layout
 └─ Overhaul `StoryboardEditorPage.tsx` with Shot Strip, Live Player, and Tabbed Inspector.

Phase 3: Interactive Timeline Studio Overhaul
 └─ Polish `InteractiveTimelineStudioModal.tsx` with multi-track lanes & trim handles.

Phase 4: Workflow Graph & Catalog Modernization
 └─ Enhance `WorkflowGraphEditorPage.tsx` and `WorkflowCatalogPage.tsx`.

Phase 5: Full E2E Verification & Responsive Audit
 └─ Run complete Vitest suite (15 test files / 65+ tests) and build validation.
```

---

## 5. Verification & Acceptance Criteria for Next Agent

Before marking the UI redesign as complete, the implementing agent must verify:
- [ ] All 15 existing Vitest test files pass with 0 failures (`npx vitest run`).
- [ ] No regression in preset parameter state synchronization (`presetId`, `lowerThird`, `jCutMs`, `lCutMs`).
- [ ] Complete responsive behavior verified across desktop 1080p/4K and laptop 13"/15" screens.
- [ ] Clean production build across all 10 monorepo workspaces (`npm test && npm run build --workspaces`).

---

[Updated by: Antigravity | Time: 2026-09-03 08:47:30]
