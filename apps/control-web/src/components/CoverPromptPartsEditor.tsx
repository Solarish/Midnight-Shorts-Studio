import type { CoverPromptParts } from "@psu-ava/remotion-studio";
import { useState } from "react";

export const COVER_PROMPT_DEFAULTS: Required<CoverPromptParts> = {
  place: "professional university broadcast studio environment",
  time: "quiet daytime interior with warm natural ambient light",
  color: "deep navy, warm gold and subtle teal color palette",
  lighting: "controlled cinematic lighting with soft warm practical highlights",
  composition: "wide architectural perspective with clean negative space on the left for title overlay and visual detail on the right",
  style: "realistic editorial documentary photography",
  detail: "sharp focus across the full scene, crisp fine details, high resolution"
};

export function renderCoverPrompt(parts?: CoverPromptParts, customDirection = "") {
  const merged = { ...COVER_PROMPT_DEFAULTS, ...(parts ?? {}) };
  const direction = customDirection.split(/[.;,]/).map((part) => part.trim()).filter((part) => part && !/\b(psu|z[- ]?image|no|without|not|never|avoid)\b/i.test(part)).join(", ");
  return Object.values(merged).concat(direction ? [direction] : []).filter(Boolean).join(". ") + ".";
}

const fields: Array<{ key: keyof CoverPromptParts; label: string }> = [
  { key: "place", label: "Place" }, { key: "time", label: "Time" }, { key: "color", label: "Color palette" },
  { key: "lighting", label: "Lighting" }, { key: "composition", label: "Composition" }, { key: "style", label: "Style" }, { key: "detail", label: "Detail" }
];
const PRESETS: Record<keyof CoverPromptParts, string[]> = {
  place: ["broadcast studio", "documentary interior", "university lobby", "lecture hall", "dental science lab"],
  time: ["early morning", "daytime", "late afternoon", "blue hour", "evening interior"],
  color: ["navy and gold", "teal and charcoal", "warm neutral", "cool blue", "monochrome"],
  lighting: ["soft natural light", "warm practical lights", "cinematic side light", "diffused studio light", "dramatic rim light"],
  composition: ["wide establishing view", "centered architectural view", "left title-safe area", "right visual focus", "layered depth"],
  style: ["editorial documentary", "cinematic photography", "clean commercial", "architectural photography", "premium broadcast"],
  detail: ["crisp fine details", "sharp full-scene focus", "high resolution", "clean surfaces", "rich material texture"]
};

export function CoverPromptPartsEditor({ value, customDirection, onChange, onCustomDirectionChange }: { value?: CoverPromptParts; customDirection?: string; onChange: (value: CoverPromptParts) => void; onCustomDirectionChange: (value: string) => void }) {
  const merged = { ...COVER_PROMPT_DEFAULTS, ...(value ?? {}) };
  const [customFields, setCustomFields] = useState<Set<keyof CoverPromptParts>>(new Set());
  return <section className="cover-prompt-parts" aria-label="Cover Card prompt template">
    <header><div><h3>Background template</h3><small>Positive prompt parts · English only · reusable schema · รับ prompt ภาษาอังกฤษโดยตรง</small></div><code>prompt.parts.v1</code></header>
    <div className="cover-prompt-grid">{fields.map(({ key, label }) => <div className="cover-prompt-field" key={key}><label>{label}</label><div className="cover-prompt-presets">{PRESETS[key].map((preset, index) => <button type="button" className={merged[key] === preset ? "selected" : ""} key={preset} onClick={() => onChange({ ...merged, [key]: preset })}>{index + 1}</button>)}<button type="button" className={customFields.has(key) ? "selected custom" : "custom"} onClick={() => setCustomFields((current) => new Set(current).add(key))}>custom</button></div>{customFields.has(key) && <input aria-label={`Cover prompt ${key}`} value={merged[key] ?? ""} onChange={(event) => onChange({ ...merged, [key]: event.target.value })} placeholder={`Custom ${label.toLowerCase()}`}/>}</div>)}</div>
    <label className="cover-prompt-custom">Custom direction<input aria-label="Cover background direction" value={customDirection ?? ""} onChange={(event) => onCustomDirectionChange(event.target.value)} placeholder="Optional scene-specific direction"/></label>
    <details><summary>Rendered positive prompt</summary><pre>{renderCoverPrompt(merged, customDirection)}</pre></details>
  </section>;
}
