import { useEffect, useRef, useState } from "react";
import "./CgBlockEditor.css";

export type CgBlock = {
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

export type CgBlockManifest = { type: string; label: string; defaultDurationMs: number; defaultVisibleCount?: number; description: string };

export const carouselBlockManifest: CgBlockManifest[] = [
  { type: "photo-stack", label: "Photo Stack", description: "ภาพซ้อนเป็นกลุ่ม เปิด preset", defaultDurationMs: 5000, defaultVisibleCount: 4 },
  { type: "photo-collage", label: "Photo Collage", description: "ภาพกระจายพร้อมข้อความ overlay", defaultDurationMs: 3800, defaultVisibleCount: 4 },
  { type: "text-hold", label: "Text Hold", description: "ถือข้อความหลักโดยไม่มีภาพ", defaultDurationMs: 4500 },
  { type: "hero-strip", label: "Hero Strip", description: "ภาพหลักขนาดใหญ่ในแถบแนวนอน", defaultDurationMs: 3000, defaultVisibleCount: 4 },
  { type: "portrait-row", label: "Portrait Row", description: "ภาพบุคคลเป็นแถว", defaultDurationMs: 2500, defaultVisibleCount: 3 },
  { type: "image-sweep", label: "Image Sweep", description: "ภาพวิ่งเข้า/ออกพร้อม motion blur", defaultDurationMs: 3500, defaultVisibleCount: 3 },
  { type: "outro", label: "Outro", description: "ข้อความปิดท้าย", defaultDurationMs: 2000 },
  { type: "fade-to-black", label: "Fade to Black", description: "เฟดจบเป็นสีดำ", defaultDurationMs: 1000 }
];

const formatDuration = (durationMs: number) => `${(durationMs / 1000).toFixed(durationMs % 1000 === 0 ? 0 : 2)}s`;

const enabledDuration = (blocks: CgBlock[]) => blocks.filter((block) => block.enabled).reduce((total, block) => total + block.durationMs, 0);

const nextBlockId = (blocks: CgBlock[], type: string) => {
  let suffix = 1;
  let id = `${type}_${suffix}`;
  const existingIds = new Set(blocks.map((block) => block.id));
  while (existingIds.has(id)) id = `${type}_${++suffix}`;
  return id;
};

const mediaOrderDisplay = (mediaOrder?: number[]) => mediaOrder?.map((index) => index + 1).join(", ") ?? "";
const parseMediaOrder = (value: string) => value.split(",")
  .map((entry) => Number(entry.trim()))
  .filter((index) => Number.isInteger(index) && index > 0)
  .map((index) => index - 1);

/** Makes the title duration the single timing source while preserving existing block data. */
export function normalizeCgBlocksForMasterDuration(blocks: CgBlock[], masterDurationMs: number, manifest = carouselBlockManifest): CgBlock[] {
  const masterDuration = Math.max(40, Math.round(masterDurationMs));
  const targetCount = Math.min(20, Math.max(1, Math.round(masterDuration / 3200)));
  const normalized = blocks.map((block) => ({ ...block, motion: block.motion ? { ...block.motion } : block.motion }));

  // Removing from the sequence tail also clears trailing disabled blocks as needed.
  while (normalized.filter((block) => block.enabled).length > targetCount) normalized.pop();

  let manifestIndex = normalized.length % manifest.length;
  while (normalized.filter((block) => block.enabled).length < targetCount) {
    const definition = manifest[manifestIndex % manifest.length];
    if (!definition) break;
    normalized.push({
      id: nextBlockId(normalized, definition.type),
      type: definition.type,
      durationMs: definition.defaultDurationMs,
      enabled: true,
      visibleCount: definition.defaultVisibleCount,
      motion: { enter: "auto", exit: "auto", staggerMs: 110, blurPx: 8 }
    });
    manifestIndex += 1;
  }

  const enabled = normalized.filter((block) => block.enabled);
  const baseDuration = Math.floor(masterDuration / enabled.length);
  const remainder = masterDuration % enabled.length;
  let enabledIndex = 0;
  return normalized.map((block) => block.enabled
    ? { ...block, durationMs: baseDuration + (enabledIndex++ < remainder ? 1 : 0) }
    : block);
}

export function CgBlockEditor({ blocks, onChange, manifest = carouselBlockManifest }: { blocks: CgBlock[]; onChange: (blocks: CgBlock[]) => void; manifest?: CgBlockManifest[] }) {
  const addedBlockId = useRef<string | null>(null);
  const [mediaOrderDrafts, setMediaOrderDrafts] = useState<Record<string, string>>({});
  const update = (index: number, patch: Partial<CgBlock>) => onChange(blocks.map((block, current) => current === index ? { ...block, ...patch } : block));
  const add = (definition: CgBlockManifest) => {
    const id = `${definition.type}_${crypto.randomUUID().slice(0, 8)}`;
    addedBlockId.current = id;
    onChange([...blocks, { id, type: definition.type, durationMs: definition.defaultDurationMs, enabled: true, visibleCount: definition.defaultVisibleCount, motion: { enter: "auto", exit: "auto", staggerMs: 110, blurPx: 8 } }]);
  };
  const move = (index: number, delta: number) => { const next = index + delta; if (next < 0 || next >= blocks.length) return; const copy = [...blocks]; [copy[index], copy[next]] = [copy[next]!, copy[index]!]; onChange(copy); };
  const sequenceTotal = enabledDuration(blocks);

  useEffect(() => {
    if (!addedBlockId.current) return;
    const target = document.getElementById(`cg-block-${addedBlockId.current}`);
    if (!target) return;
    target.focus();
    target.scrollIntoView?.({ block: "nearest" });
    addedBlockId.current = null;
  }, [blocks]);

  return <section className="cg-block-editor" aria-label="CG block sequence">
    <header className="cg-block-editor__header">
      <div className="cg-block-editor__title">
        <h3>CG Blocks</h3>
        <p><span className="cg-block-editor__count">{blocks.length} {blocks.length === 1 ? "block" : "blocks"}</span> · <span className="cg-block-editor__total">{formatDuration(sequenceTotal)} total</span></p>
      </div>
      <label className="cg-block-editor__add">
        <span className="sr-only">Add block</span>
        <select aria-label="Add CG block" defaultValue="" onChange={(event) => { const definition = manifest.find((block) => block.type === event.target.value); if (definition) add(definition); event.target.value = ""; }}>
          <option value="">Add block</option>
          {manifest.map((block) => <option key={block.type} value={block.type}>{block.label}</option>)}
        </select>
      </label>
    </header>
    {blocks.length === 0 ? <p className="cg-block-editor__empty">No CG blocks yet. Add a block to build this sequence.</p> : <ol className="cg-block-editor__list">
      {blocks.map((block, index) => {
        const definition = manifest.find((entry) => entry.type === block.type);
        const name = definition?.label ?? block.type;
        const isMediaBlock = !["text-hold", "outro", "fade-to-black"].includes(block.type);
        const hasPhotos = Boolean(definition?.defaultVisibleCount);
        const hasCopy = block.type !== "fade-to-black";
        const disabled = !block.enabled;
        return <li key={block.id} id={`cg-block-${block.id}`} className={`cg-shot-card cg-shot-card--${block.type}`} tabIndex={-1} aria-disabled={disabled}>
          <div className="cg-shot-card__rail">
            <button type="button" className="cg-shot-card__visibility" data-visible={block.enabled} aria-pressed={block.enabled} aria-label={`${block.enabled ? "Hide" : "Show"} ${name} block`} title={`${block.enabled ? "Hide" : "Show"} ${name} block`} onClick={() => update(index, { enabled: !block.enabled })}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
                <circle cx="12" cy="12" r="2.6" />
                {!block.enabled && <path d="m4 4 16 16" />}
              </svg>
            </button>
            <span className="cg-shot-card__order" aria-label={`Shot ${index + 1}`}>{index + 1}</span>
            <div className="cg-shot-card__move">
              <button type="button" aria-label={`Move ${name} earlier`} title={`Move ${name} earlier`} onClick={() => move(index, -1)} disabled={index === 0}>↑</button>
              <button type="button" aria-label={`Move ${name} later`} title={`Move ${name} later`} onClick={() => move(index, 1)} disabled={index === blocks.length - 1}>↓</button>
            </div>
          </div>
          <div className="cg-shot-card__content">
            <div className="cg-shot-card__header">
              <div className="cg-shot-card__primary-fields">
                <label title={definition?.description}>
                  <span>Block type</span>
                  <select value={block.type} disabled={disabled} onChange={(event) => { const nextDefinition = manifest.find((entry) => entry.type === event.target.value); update(index, { type: event.target.value, visibleCount: block.visibleCount ?? nextDefinition?.defaultVisibleCount }); }}>
                    {manifest.map((entry) => <option key={entry.type} value={entry.type}>{entry.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Duration</span>
                  <input aria-label={`${block.id} duration`} type="number" min="40" step="40" value={block.durationMs} disabled={disabled} onChange={(event) => update(index, { durationMs: Math.max(40, Number(event.target.value) || 40) })}/>
                </label>
              </div>
              <div className="cg-shot-card__actions">
                <button type="button" className="cg-shot-card__delete" title={`Delete ${name} block`} aria-label={`Delete ${name} block`} onClick={() => onChange(blocks.filter((_, current) => current !== index))}>×</button>
              </div>
            </div>
            {(hasCopy || isMediaBlock || block.type !== "fade-to-black") && <details className="cg-shot-card__details">
              <summary>Motion &amp; media</summary>
              <div className="cg-shot-card__detail-groups">
                {hasCopy && <fieldset className="cg-shot-card__field-group"><legend>Copy</legend><div className="cg-shot-card__details-grid">
                  <label className="cg-text-visibility"><input aria-label={`${block.id} show text`} type="checkbox" checked={block.content?.showText ?? true} disabled={disabled} onChange={(event) => update(index, { content: { ...block.content, showText: event.target.checked } })}/><span>Show text</span></label>
                  <label><span>Block text</span><input aria-label={`${block.id} block text`} value={block.content?.text ?? ""} disabled={disabled} onChange={(event) => update(index, { content: { ...block.content, text: event.target.value } })}/></label>
                  <label><span>Block subtitle</span><input aria-label={`${block.id} block subtitle`} value={block.content?.subtitle ?? ""} disabled={disabled} onChange={(event) => update(index, { content: { ...block.content, subtitle: event.target.value } })}/></label>
                </div></fieldset>}
                {block.type !== "fade-to-black" && <fieldset className="cg-shot-card__field-group"><legend>Look</legend><div className="cg-shot-card__details-grid">
                  <label><span>Background color</span><input aria-label={`${block.id} background color`} type="color" value={block.appearance?.backgroundColor ?? "#fbfbf8"} disabled={disabled} onChange={(event) => update(index, { appearance: { ...block.appearance, backgroundColor: event.target.value } })}/></label>
                  {hasCopy && <>
                    <label><span>Text color</span><input aria-label={`${block.id} text color`} type="color" value={block.appearance?.textColor ?? "#a6beaf"} disabled={disabled} onChange={(event) => update(index, { appearance: { ...block.appearance, textColor: event.target.value } })}/></label>
                    <label><span>Font</span><select aria-label={`${block.id} font`} value={block.appearance?.fontFamily ?? "system"} disabled={disabled} onChange={(event) => update(index, { appearance: { ...block.appearance, fontFamily: event.target.value as "system" | "psu-stidti" } })}><option value="system">System Sans</option><option value="psu-stidti">PSU Stidti</option></select></label>
                    <label><span>Text size</span><input aria-label={`${block.id} text size`} type="number" min="16" max="220" step="1" value={block.appearance?.fontSizePx ?? (block.type === "outro" ? 42 : block.type === "photo-stack" || block.type === "photo-collage" ? 108 : 70)} disabled={disabled} onChange={(event) => update(index, { appearance: { ...block.appearance, fontSizePx: Math.min(220, Math.max(16, Number(event.target.value) || 16)) } })}/></label>
                    <label><span>Text X (%)</span><input aria-label={`${block.id} text position x`} type="number" min="-100" max="100" step="1" value={block.appearance?.textPositionX ?? 0} disabled={disabled} onChange={(event) => update(index, { appearance: { ...block.appearance, textPositionX: Math.min(100, Math.max(-100, Number(event.target.value) || 0)) } })}/></label>
                    <label><span>Text Y (%)</span><input aria-label={`${block.id} text position y`} type="number" min="-100" max="100" step="1" value={block.appearance?.textPositionY ?? 0} disabled={disabled} onChange={(event) => update(index, { appearance: { ...block.appearance, textPositionY: Math.min(100, Math.max(-100, Number(event.target.value) || 0)) } })}/></label>
                  </>}
                  {isMediaBlock && <label><span>Card scale</span><input aria-label={`${block.id} card scale`} type="number" min="0.1" max="4" step="0.05" value={block.appearance?.cardScale ?? 1} disabled={disabled} onChange={(event) => update(index, { appearance: { ...block.appearance, cardScale: Math.max(0.1, Number(event.target.value) || 0.1) } })}/></label>}
                </div></fieldset>}
                {isMediaBlock && <fieldset className="cg-shot-card__field-group"><legend>Media</legend><div className="cg-shot-card__details-grid">
                  <label><span>Image order</span><input aria-label={`${block.id} image order`} type="text" inputMode="text" placeholder="1, 2, 3" value={mediaOrderDrafts[block.id] ?? mediaOrderDisplay(block.mediaOrder)} disabled={disabled} onChange={(event) => { const raw = event.target.value; setMediaOrderDrafts((drafts) => ({ ...drafts, [block.id]: raw })); onChange(blocks.map((current, currentIndex) => currentIndex === index ? { ...current, mediaOrder: parseMediaOrder(raw) } : current)); }} onBlur={() => setMediaOrderDrafts((drafts) => ({ ...drafts, [block.id]: mediaOrderDisplay(block.mediaOrder) }))}/><small>Use commas to set one-based order</small></label>
                  {hasPhotos && <label><span>Photos</span><input aria-label={`${block.id} visible photos`} type="number" min="1" max="20" value={block.visibleCount ?? 0} disabled={disabled} onChange={(event) => update(index, { visibleCount: Math.max(1, Number(event.target.value) || 1) })}/></label>}
                </div></fieldset>}
                {isMediaBlock && <fieldset className="cg-shot-card__field-group"><legend>Motion</legend><div className="cg-shot-card__details-grid">
                  <label><span>Stagger</span><input aria-label={`${block.id} stagger`} type="number" min="0" step="10" value={block.motion?.staggerMs ?? 115} disabled={disabled} onChange={(event) => update(index, { motion: { ...block.motion, staggerMs: Math.max(0, Number(event.target.value) || 0) } })}/></label>
                  <label><span>Blur</span><input aria-label={`${block.id} blur`} type="number" min="0" max="40" step="1" value={block.motion?.blurPx ?? 8} disabled={disabled} onChange={(event) => update(index, { motion: { ...block.motion, blurPx: Math.max(0, Number(event.target.value) || 0) } })}/></label>
                </div></fieldset>}
              </div>
            </details>}
          </div>
        </li>;
      })}
    </ol>}
  </section>;
}
