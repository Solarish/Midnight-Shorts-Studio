import { useState } from "react";
import type { CoverTextStyles, TextLayerStyle } from "@psu-ava/remotion-studio";

type LayerKey = keyof CoverTextStyles;
type LayerText = { eyebrow?: string; title?: string; subtitle?: string };
const layers: Array<{ key: LayerKey; label: string; hint: string }> = [
  { key: "eyebrow", label: "Eyebrow / Award", hint: "Small accent line" },
  { key: "title", label: "Title / Person", hint: "Primary headline" },
  { key: "subtitle", label: "Subtitle / Position", hint: "Supporting line" }
];
const defaults: Required<TextLayerStyle> = { fontFamily: "system", positionX: 8, positionY: 50, size: 48, color: "#FFFFFF" };
function read(style: TextLayerStyle | undefined, key: keyof TextLayerStyle) { return style?.[key] ?? defaults[key]; }

export function TextLayerStyleEditor({ value, texts, onChange, onTextChange }: { value?: CoverTextStyles; texts: LayerText; onChange: (value: CoverTextStyles) => void; onTextChange: (layer: LayerKey, text: string) => void }) {
  const [openLayer, setOpenLayer] = useState<LayerKey | null>(null);
  const update = (layer: LayerKey, key: keyof TextLayerStyle, next: string | number) => onChange({ ...value, [layer]: { ...value?.[layer], [key]: next } });
  return <section className="text-layer-style-editor" aria-label="Cover Card text layers">
    <header><div><h3>Text layers</h3><small>Text and style are independent per layer</small></div></header>
    <div className="text-layer-rows">
      {layers.map(({ key, label }) => <div className="text-layer-row" key={key}>
        <input className="text-layer-copy" aria-label={key === "title" ? "Cover person name" : key === "subtitle" ? "Cover position title" : "Cover award"} value={texts[key] ?? ""} placeholder={label} onChange={(event) => onTextChange(key, event.target.value)} />
        <button type="button" className={`text-style-trigger ${openLayer === key ? "active" : ""}`} aria-label={`Edit ${label} style`} title={`Edit ${label} style`} onClick={() => setOpenLayer(openLayer === key ? null : key)}>⚙</button>
        {openLayer === key && <div className="text-style-drawer" role="dialog" aria-label={`${label} style editor`}>
          <div className="text-style-drawer-head"><strong>{label} style</strong><button type="button" aria-label="Close style editor" onClick={() => setOpenLayer(null)}>×</button></div>
          <div className="text-style-controls">
            <label>Font<select aria-label={`${label} font`} value={String(read(value?.[key], "fontFamily"))} onChange={(event) => update(key, "fontFamily", event.target.value)}><option value="system">System Sans</option><option value="psu-stidti">PSU Stidti</option></select></label>
            <label>X (%)<input aria-label={`${label} X`} type="number" min="0" max="100" step="0.5" value={Number(read(value?.[key], "positionX"))} onChange={(event) => update(key, "positionX", Number(event.target.value))}/></label>
            <label>Y (%)<input aria-label={`${label} Y`} type="number" min="0" max="100" step="0.5" value={Number(read(value?.[key], "positionY"))} onChange={(event) => update(key, "positionY", Number(event.target.value))}/></label>
            <label>Size<input aria-label={`${label} size`} type="number" min="8" max="220" step="1" value={Number(read(value?.[key], "size"))} onChange={(event) => update(key, "size", Number(event.target.value))}/></label>
            <label>Color<div className="text-color-control"><input aria-label={`${label} color`} type="color" value={String(read(value?.[key], "color"))} onChange={(event) => update(key, "color", event.target.value)}/><input aria-label={`${label} color hex`} value={String(read(value?.[key], "color"))} onChange={(event) => update(key, "color", event.target.value)}/></div></label>
          </div>
        </div>}
      </div>)}
    </div>
  </section>;
}
