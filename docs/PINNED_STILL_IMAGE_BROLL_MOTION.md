# 📌 PINNED TASK: Still Image B-Roll Motion Engine (Ken Burns & 2.5D AI Parallax)

**Status:** PINNED / ROADMAP ARCHITECTURE  
**Milestone:** Post-Launch Studio Enhancement  
**Target:** Transform static B-roll photographs (`.jpg`, `.png`) into broadcast-grade dynamic motion graphics instead of flat, boring 5-second slide presentations.

---

## 🧐 Problem Definition
Placing a static still photograph as a 5-second cutaway over an interview feels like a generic slideshow. In premium broadcast documentary editing:
1. Photos must have **kinetic motion** (directional drift, breathing zoom).
2. Focal subjects (people, historical artefacts) should feel separated from their environments (**2.5D Parallax**).
3. Old or low-resolution archival photos require **archival framing** (textured matting, subtle drop shadows, film grain, and title ribbons).

---

## 📐 Architecture & Treatment Specification

### 1. Dynamic Ken Burns Engine (`treatment: "ken_burns"`)
* **Rule-of-Thirds Drift:** Compute start framing ($1.00\times$) and end framing ($1.08\times$) with subtle panning centered around subject facial/object centroids.
* **Easing Curves:** Slow in, slow out ($S$-curve easing) to match dialogue rhythm without jarring stops.
* **Render Pipeline:** Implemented in Remotion using `interpolate` with spring physics.

### 2. 2.5D AI Parallax Separation (`treatment: "ai_parallax_25d"`)
* **Layer Separation:**
  * Foreground: AI Background Removal (BiRefNet / RMBG node on Debian `10.135.66.70`) to extract the subject cutout with clean alpha.
  * Background: Inpaint empty background hole with Fast Inpainting / Lama node.
* **3D Camera Orbit:** In Remotion / AE, place Foreground at $Z = 0$ and Background at $Z = -200$. Apply subtle camera roll ($0.5^\circ$) and lateral pan ($40\text{px}$) to create realistic optical parallax depth.

### 3. Archival Photo Canvas (`treatment: "archival_frame"`)
* **Photographic Border:** 24px off-white polaroid / archival card border with subtle 4K paper texture.
* **Lighting & Shadow:** 40% opacity soft ambient drop-shadow over a blurred, color-matched dark background.
* **Context Ribbon:** Animated lower-third caption ribbon indicating photo date, archive source, or subject title.

---

## 🛠️ Data Contract Reference

When an image asset is matched by Auto B-Roll:
```typescript
interface StoryboardImageBrollItem {
  id: string;
  kind: "broll";
  asset: {
    path: string; // e.g. "/Volumes/NAS/.../DSC02129.JPG"
    kind: "image";
  };
  offsetMs: number;
  durationMs: number;
  treatment: "ken_burns" | "ai_parallax_25d" | "archival_frame";
  params: {
    panDirection?: "zoom_in" | "zoom_out" | "pan_left" | "pan_right";
    focalPoint?: { x: number; y: number }; // Normalized 0-1
    caption?: string;
  };
}
```

---

## 🎯 Verification Criteria for Implementation
1. Zero static freeze frames — every image cutaway has continuous sub-pixel motion.
2. Safe title and action margins are preserved.
3. Rendering performance within 25fps Remotion bounds.
