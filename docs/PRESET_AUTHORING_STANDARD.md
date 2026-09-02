# 🏛️ Preset Authoring Standard & Gold-Standard Specification

**Standard Version:** 1.0.0  
**Effective Date:** 2026-09-02  
**Governing Architecture:** Preset-Driven Auto UI & Broadcast Remotion Engine  
**Archetype Reference:** `3d-carousel-title-v1` (Intro 3D Photo Carousel Showcase)  
**Author:** Antigravity (Google DeepMind)

---

## 1. Architectural Philosophy & Overview

In **Midnight Shorts Studio**, a Storyboard Node (`cover_card`, `title`, `a_roll`, `logo_outro`, `lower_third`) is not a rigid single-purpose template. Instead, each node acts as a **Polymorphic Container** whose visual expression, parameters, and Inspector UI dynamically transform based on its **`presetId`**.

### Core Tenets

1. **Preset-Driven Auto UI**: Switching a preset in the UI must immediately morph the Inspector into the exact controls needed for that visual style, hiding irrelevant fields and surfacing specialized controls.
2. **Zero-Breakage Default Fallback**: Every node must declare a canonical default preset. If an unknown or legacy preset ID is encountered, it must gracefully fallback to the default without crashing.
3. **Strict Real Data & Immutability**: All preset parameters must be typed, stored in `item.params`, and update via immutable state setters (`onItem` / `onParams`).
4. **Broadcast Motion Standards**: All animations must be computed via Remotion's frame-accurate `spring()` and `interpolate()` at 25fps, respecting safe-areas across `9:16`, `16:9`, and `1:1`.

---

## 2. Preset Naming Convention & Registry

All preset IDs throughout the monorepo must strictly adhere to the standardized naming formula:

$$\mathbf{presetId} = \langle\text{node\_kind}\rangle\text{-}\langle\text{style\_slug}\rangle\text{-v}\langle\text{version}\rangle$$

### Registry Table of Canonical Presets

| Node Kind | Preset ID | Description | Default Status |
| :--- | :--- | :--- | :---: |
| **`title`** | `3d-carousel-title-v1` | **Intro 3D Photo Carousel Showcase** *(Golden Archetype)* | ⭐ **Default** |
| `title` | `title-classic-flat-v1` | Cinematic Hero Image & 3-Tier Typography | Alternative |
| `title` | `title-minimal-badge-v1` | Modern Minimal Eyebrow & Headline Badge | Alternative |
| **`a_roll`** | `a-roll-segment-v1` | Standard Talking Head Footage + Live Preview | ⭐ **Default** |
| `a_roll` | `a-roll-voiceover-v1` | Voiceover Audio Track + Fullscreen B-Roll | Alternative |
| `a_roll` | `a-roll-pip-v1` | Picture-in-Picture Avatar on Presentation | Alternative |
| **`logo_outro`**| `logo-outro-v1` | PSU Golden Radial Pulse & Emblem Glow | ⭐ **Default** |
| `logo_outro`| `logo-outro-video-v1` | Fullscreen Sting Video with Smooth Fades | Alternative |
| **`lower_third`**| `lowerthird-glass-gold-v1` | PSU Royal Gold & Midnight Glassmorphism | ⭐ **Default** |
| `lower_third`| `lowerthird-minimal-navy-v1` | Modern Clean Navy Solid Bar | Alternative |
| `lower_third`| `lowerthird-gradient-ribbon-v1`| Cyan & Gold Gradient Ribbon | Alternative |

---

## 3. The Golden Archetype Case Study: `3d-carousel-title-v1`

The Intro 3D Photo Carousel preset serves as the canonical reference implementation of this architecture.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            3D Carousel Archetype Flow                       │
│                                                                             │
│   Inspector UI (Control Web)              Remotion Engine (Studio)          │
│  ┌──────────────────────────────┐        ┌──────────────────────────────┐   │
│  │ Preset: 3d-carousel-title-v1 │        │ <TitleCard presetId=...>     │   │
│  │ ├─ 3D Camera Controls:       │───────>│ ├─ useCurrentFrame() (25fps) │   │
│  │ │  • Rotation Speed: 1.2x    │        │ ├─ 3D CSS Perspective Space  │   │
│  │ │  • Camera Tilt: 15°        │        │ │  • transform: rotateY(...) │   │
│  │ │  • Floor Reflection: ON    │        │ │  • translateZ(320px)       │   │
│  │ └─ Multi-Photo Gallery       │        │ └─ Dynamic Floor Reflection  │   │
│  └──────────────────────────────┘        └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Archetype Characteristics

1. **Dedicated Specialized Controls**: When `presetId === "3d-carousel-title-v1"`, the Inspector exposes 3D Camera Controls (`rotationSpeed`, `cameraTilt`, `enableReflection`), which are hidden in 2D presets.
2. **True 3D Spatial Calculation**: Uses CSS 3D transforms (`perspective(1200px)`, `rotateY`, `translateZ`) driven frame-by-frame by Remotion.
3. **Asset Tolerance & Resiliency**: Gracefully handles anywhere from 1 to 10 photos, automatically calculating polygon angles ($\theta = 360^\circ / N$).

---

## 4. The 4-Layer Implementation Protocol for Agents

When creating or extending a preset, any implementing Agent **must** update all 4 layers in sequence:

### Layer 1: Remotion Studio Component (`apps/remotion-studio/src/components/`)
- Define the rendering logic inside the component (e.g. `TitleCard.tsx`, `LowerThird.tsx`, `LogoOutro.tsx`).
- Support responsive aspect ratios (`9:16`, `16:9`, `1:1`).
- Animate elements using Remotion `spring()` and `interpolate()`.
- Guard against missing or broken media using fallback placeholders.

```tsx
// Pattern: Multi-Preset Dispatcher in Remotion
export const MyComponent: React.FC<MyComponentProps> = ({ presetId, ...props }) => {
  if (presetId === "my-preset-alt-v1") {
    return <AltPresetView {...props} />;
  }
  // Default to Gold Standard Preset
  return <DefaultPresetView {...props} />;
};
```

### Layer 2: Control Web Inspector Auto UI (`apps/control-web/src/components/inspectors/`)
- Define the Preset Options array (`myPresetOptions = [...]`).
- Add the Preset Selector Card at the top of the Inspector.
- Implement conditional card rendering:
  ```tsx
  const is3D = currentPreset === "3d-carousel-title-v1";
  const isVoiceover = currentPreset === "a-roll-voiceover-v1";
  
  // Render specialized cards conditionally
  {is3D && <ThreeDCameraControlCard ... />}
  ```
- Keep states synchronized: Always update both `item.presetId` and `item.params.presetId` via `onItem({ ...item, presetId, params: { ...item.params, presetId } })`.

### Layer 3: Registry Synchronization (`StoryboardEditorPage.tsx` & `types.ts`)
- Register the new preset in `presetOptions.<kind>` in `StoryboardEditorPage.tsx`.
- Register the type in `apps/remotion-studio/src/types.ts` and `apps/control-web/src/storyboard-types.ts`.

### Layer 4: Storyboard Validator (`packages/storyboard/src/index.ts`)
- Update schema validators to ensure new parameters pass preflight checks without blocking publishing.

---

## 5. Open Design System & Theme-Agnostic Aesthetics

The preset engine is **Theme-Agnostic** and deliberately unconstrained by any single visual motif. Presets have full creative freedom to explore diverse visual genres, art directions, and brand palettes.

### Core Visual Principles

1. **Dynamic Theme Inheritance with Creative Freedom**:
   - Presets should read optional theme tokens (`theme?.primaryColor`, `theme?.fontFamily`, `theme?.cardBackground`) when applicable, allowing user-customized palette overrides.
   - Presets can also define their own bold, standalone art styles (e.g. *Cyberpunk Neon, Nordic Minimal, Luxury Editorial, Retro 90s VHS, Warm Cinematic, Neo-Brutalism, Pop Vlog*).

2. **Aesthetic Preset Families (Examples)**:
   - 🌟 **Cinematic / Documentary**: Warm organic gradients, film grain, letterboxing, clean serif/sans typography.
   - ⚡ **Modern Minimal / Nordic**: High contrast, razor-sharp geometric lines, monochromatic cards with single accent pop.
   - 🔮 **Glassmorphism / Tech**: Frosted glass blur (`backdrop-filter`), luminous neon glow lines, semi-transparent depth.
   - 🎨 **Bold Pop / Creative Vlog**: Vibrant pastel blocks, playful bouncy physics, dynamic stickers/doodles.
   - 🏛️ **Corporate / Institutional**: Solid navy/gold elegance, structured badges, understated subtle glints.

### Motion Physics & Video Rules
- **Framerate Agility**: Standardized on **25 fps** ($1\text{ frame} = 40\text{ms}$) for broadcast-grade synchronization.
- **Physics-Driven Motion**: Use `spring()` curves with custom `damping`, `mass`, and `stiffness` tailored to the preset's mood (e.g., snappier for Pop, heavily damped for Cinematic).
- **Graceful Lifecycle**: Always handle both Entrance (in-spring) and Exit (fade-out or slide-out in the final 10–15 frames) cleanly so presets don't abruptly pop off screen.
- **Multi-Ratio Responsiveness**: Ensure layouts gracefully reflow across `9:16` (Vertical Shorts/Reels/TikTok), `16:9` (Broadcast/YouTube), and `1:1`.

---

## 6. Agent Implementation & Verification Checklist

Before submitting or approving any new preset, the agent must verify the following:

- [ ] **Naming:** `presetId` follows `<kind>-<slug>-v<version>` format.
- [ ] **Default Safe:** Preserves existing presets; does not break default fallback.
- [ ] **Synchronized State:** `item.presetId` and `item.params.presetId` are updated simultaneously (no bouncing bugs).
- [ ] **Auto UI:** Inspector only displays fields relevant to the selected preset.
- [ ] **Remotion 25fps:** Animations use frame-accurate `spring()` / `interpolate()`.
- [ ] **Vitest:** `apps/control-web` test suite passes 100% (`npx vitest run`).
- [ ] **Monorepo Build:** Monorepo builds cleanly with exit code 0 (`npm test && npm run build --workspaces`).
- [ ] **Audit Stamp:** Document appended with standardized audit stamp.

---

[Updated by: Antigravity | Time: 2026-09-02 23:33:00]
