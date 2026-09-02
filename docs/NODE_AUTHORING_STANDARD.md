# Node authoring standard

This standard applies to every storyboard node and preset. Its purpose is to
ensure that a control is real: one change in the editor updates the persisted
storyboard and the same data is consumed by preview and render.

## The single-contract rule

Every node has one typed parameter contract. Define it first in the shared
storyboard/Remotion-facing type, then use that exact shape through this path:

```text
node catalog -> storyboard item.params -> Control Web inspector
          -> Timeline Editor inspector -> Remotion props -> renderer
```

Do not create a timeline-only property, a preview-only default, or an editor
control that the renderer does not read. Legacy input may be migrated at the
boundary, but all new writes must use the canonical property.

## Required node design

1. Declare the node's stable identifier, defaults, and parameter schema.
2. State which parameters are global, block-local, and derived.
3. Give every duration a single source of truth. If a node owns timed child
   blocks, document the two-way rule between master duration and child totals.
4. Render directly from the contract. Omitted optional values must preserve a
   deliberate backward-compatible default.
5. Reuse the same inspector component and update helpers in the Storyboard
   Editor and Interactive Timeline Editor. A timeline may add transport and
   timeline controls, never a second schema or calculation.
6. Remove obsolete controls when the renderer stops consuming them; do not
   leave a decorative parameter in the UI.

## CG sequence contract

For a multi-shot CG node use `params.cgBlocks[]`. A block owns its sequence,
duration, visibility, media choice, motion, copy and appearance:

```ts
type CgBlock = {
  id: string;
  type: string;
  durationMs: number;
  enabled: boolean;
  mediaOrder?: number[];
  visibleCount?: number;
  motion?: { enter?: string; exit?: string; staggerMs?: number; blurPx?: number };
  content?: { text?: string; subtitle?: string; showText?: boolean };
  appearance?: {
    backgroundColor?: string;
    textColor?: string;
    cardScale?: number;
    textPositionX?: number;
    textPositionY?: number;
    fontFamily?: "system" | "psu-stidti";
    fontSizePx?: number;
  };
};
```

- `enabled` hides the whole shot and excludes it from the master duration.
- `content.showText` hides only the text/subtitle layer; the media, timing and
  motion still render.
- Text placement is block-local: `textPositionX/Y` are clamped percentage
  offsets from the preset anchor. Typography is block-local too: `fontFamily`
  selects a packaged font and `fontSizePx` is clamped to the renderer's safe
  range. Never load a render font directly from a workstation or NAS path.
- `undefined` means use the renderer's documented reference default; `false`
  must be honored exactly.
- Human-facing image order is one-based, stored values are zero-based.
- Editing a child duration recalculates master duration. Editing master
  duration normalizes the child count/order and splits its exact total across
  enabled blocks.

## UI and accessibility rules

- Use a shared inspector component for a node's parameters; do not copy its
  fields into another editing surface.
- Keep sequence, type, duration and whole-shot visibility visible; disclose
  secondary tuning such as look, copy, media and motion.
- Each destructive action has an accessible label and a compact, unambiguous
  icon. Whole-shot visibility and text visibility must be separate controls.
- Control labels describe the result, not the implementation. Show only
  values the renderer consumes.

## New-node workflow

Use this order for every new node or preset:

1. **Observe:** identify the real reference, shots, media, timing, typography,
   and required input fields. Record what is intentionally not supported.
2. **Contract:** define the stable node id, typed params, defaults, optional
   legacy aliases, and derived values. Decide whether the node is one shot or
   a block sequence before writing UI.
3. **Renderer:** implement deterministic output from the contract. Add real
   media/font assets and make omitted values backward-compatible.
4. **Inspector:** build the node inspector from the contract. For block
   sequences, reuse `CgBlockEditor`; for the Timeline Editor, reuse the same
   inspector and duration helpers. Do not copy a form by hand.
5. **Persistence:** prove edits survive the actual API/storyboard save and
   rehydrate into the editor. Validate ranges at the boundary and in the
   renderer.
6. **Evidence:** run a real storyboard with real media, inspect the output at
   block boundaries, and record the artifact path and duration in the
   checkpoint. A passing unit test alone is not render evidence.

### Parameter classification

| Class | Examples | Rule |
| --- | --- | --- |
| Global | title, fallback text, theme | applies to the preset unless overridden |
| Block-local | text, showText, font, X/Y, image order | affects only one authored shot |
| Derived | master duration, target block count, offsets | calculate in one shared helper, never persist competing values |

### Extension rule

New presets should register a manifest and renderer adapter against this model.
If a new parameter cannot be expressed as global, block-local or derived, stop
and document the exception before adding UI. This keeps future nodes compatible
with the desktop editor and prevents another parallel timeline implementation.

## Reusable node architecture: shared contract + schema-driven inspector

แนวคิดนี้เรียกว่า **Schema-driven, reusable node architecture** โดยใช้
**shared contract** เป็น **single source of truth** ระหว่าง persisted params,
inspector, timeline และ renderer ไม่สร้างฟอร์มเฉพาะหน้าแยกกันอีก

### Canonical pattern

โหนดควรแบ่ง property เป็นชั้นที่ reuse ได้ และตั้งชื่อที่สื่อความหมายเดียวกัน
ทุกโหนด เช่น `textStyles`, `media`, `motion`, `layout` โดยแต่ละ layer ต้อง
เป็นอิสระต่อกันเมื่อผู้ใช้แก้ไข:

```ts
type TextLayerStyle = {
  fontFamily?: "system" | "psu-stidti";
  positionX?: number; // 0–100% of canvas
  positionY?: number; // 0–100% of canvas
  size?: number;      // renderer pixels
  color?: string;     // #RRGGBB
};

type TextStyles = {
  eyebrow?: TextLayerStyle;
  title?: TextLayerStyle;
  subtitle?: TextLayerStyle;
};
```

Cover Card ใช้ `params.textStyles` เป็นตัวอย่างมาตรฐาน โหนดใหม่ที่มีข้อความ
ควร reuse `TextLayerStyle` และใช้ key ที่สอดคล้องกัน ไม่สร้าง `titleFont`,
`headlineX`, `captionColor` ซ้ำหลายชุด เว้นแต่มี semantics ต่างกันจริง

### กฎการต่อยอดโหนด

1. นิยาม contract และ default ใน shared type ก่อนสร้าง UI
2. ทำ normalizer/clamp ที่ boundary และ renderer เพื่อรองรับข้อมูลเก่าและค่า
   หลุดช่วงอย่างปลอดภัย
3. สร้าง inspector component ที่รับ `{ value, onChange }` และนำกลับมาใช้ได้
  กับ Main Editor, Interactive Timeline และโหนดในอนาคต
4. แยก global, layer-local และ derived properties ให้ชัดเจน; ห้ามให้ title
   เปลี่ยน style ของ subtitle โดยบังเอิญ
5. Persist key เดียวกันผ่าน API แล้วทดสอบ rehydrate กลับเข้า UI และ renderer
6. เพิ่ม test อย่างน้อย default, override ราย layer, legacy/missing field และ
   boundary values พร้อม real render เมื่อ property เปลี่ยนผลภาพ

### ชื่อเรียกทางสถาปัตยกรรม

ใช้คำเหล่านี้ใน issue, code review และเอกสาร:

- **Shared contract** — รูปแบบข้อมูลกลางที่ทุกชั้นยึดร่วมกัน
- **Schema-driven inspector** — UI สร้างจาก schema/property definition
- **Reusable editor component** — form/editor ที่นำไปเสียบกับหลายโหนด
- **Single source of truth** — ค่าที่ persist และ renderer ใช้ชุดเดียวกัน
- **Composable node** — โหนดประกอบจาก capability ย่อย เช่น text/media/motion

## Definition of done

Before presenting a node change, verify all of the following:

- [ ] Catalog/defaults, persisted params, both inspectors and Remotion share
  the same property names and semantics.
- [ ] The Interactive Timeline Editor uses the current inspector component or
  a shared adapter; it does not recalculate the node differently.
- [ ] Default, explicit override, disabled, empty and legacy data states are
  tested.
- [ ] At least one real storyboard/real-media preview or render proves the
  changed parameter affects output.
- [ ] Unit tests, relevant package builds and `git diff --check` pass.
- [ ] Any migration and remaining compatibility path are recorded in the
  checkpoint document.

## Current reference implementation

`3d-carousel-title-v1` is the reference multi-shot node. `CgBlockEditor` is
the shared editing surface; `ReferenceShowcasePreset` is its renderer. Future
sequence presets should extend this contract or introduce a new documented
block manifest, rather than fork inspector state.

## AI generation and Adobe-free rule

- Production graph configs must not embed `mockResponse`, placeholder output
  paths, or MOGRT/template paths. A dry-run fallback may exist inside an
  adapter for deterministic tests, but it must be clearly adapter-local and
  must never be presented as live render evidence.
- Prompt-producing nodes must expose a real edge to the consumer input. For
  ComfyUI, keep the chain explicit: source prompt -> translation (when model
  language requires it) -> `comfyui.workflow` prompt input -> ComfyUI `/prompt`.
  The workflow JSON may contain a safe fallback prompt for graph completeness,
  but the live edge must override it.
- New Cover Card and title graphics use `timeline.graphic_overlay` and a
  Remotion composition. Adobe/MOGRT nodes are compatibility-only and must not
  be added to new presets or selected as a default.

### Reusable positive prompt parts (2026-09-02)

Generative visual nodes use `params.promptParts` (`place`, `time`, `color`,
`lighting`, `composition`, `style`, `detail`) as a schema-driven positive
prompt contract. Editors use the shared `CoverPromptPartsEditor`; raw prompt
text is only an optional custom direction. Templates remain provider-neutral:
do not embed product names or negative phrasing such as `no`, `without`, or
`avoid`. Keep an empty conditioning socket only when a sampler requires it.
