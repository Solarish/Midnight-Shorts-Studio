import { useState } from "react";
import type { StoryboardItem } from "../../storyboard-types";
import { PathField } from "./CommonFields";
import { RemoteFilePickerModal } from "../RemoteFilePickerModal";
import "./inspectors.css";

export const DEFAULT_PSU_LOGO = "/Volumes/ภาควีดีทัศน์/Logo 88 2561/Prince_of_Songkla_University_Emblem.png";

export interface LogoOutroInspectorProps {
  item: StoryboardItem;
  onParams: (patch: Record<string, unknown>) => void;
  onItem?: (item: StoryboardItem) => void;
}

export const outroPresetOptions = [
  { value: "logo-outro-v1", label: "🌟 PSU Golden Light Streak Ident · v1" },
  { value: "logo-outro-particle-burst-v1", label: "✨ Celestial Particle Burst Ident · v1" },
  { value: "logo-outro-video-v1", label: "🎥 Fullscreen Video Sting · v1" },
  { value: "logo-outro-minimal-v1", label: "🏛️ Modern Minimal Emblem · v1" }
];

export function LogoOutroInspector({ item, onParams, onItem }: LogoOutroInspectorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const presetId = String(item.presetId ?? (item.params as any)?.presetId ?? "logo-outro-v1");

  const sourcePath = String(item.params.sourcePath ?? "");
  const title = String(item.params.title ?? item.params.note ?? "PSU BROADCAST");
  const subtitle = String(item.params.subtitle ?? "Prince of Songkla University");
  const eyebrow = String(item.params.eyebrow ?? "มหาวิทยาลัยสงขลานครินทร์");
  const logoScale = Number(item.params.logoScale ?? 1.0);
  const glowIntensity = Number(item.params.glowIntensity ?? 1.0);
  const videoFit = String(item.params.videoFit ?? "cover");
  const fadeInMs = Number(item.params.fadeInMs ?? 480);
  const fadeOutMs = Number(item.params.fadeOutMs ?? 480);

  const changePreset = (nextPreset: string) => {
    const nextSource = nextPreset === "logo-outro-video-v1" ? (sourcePath.endsWith(".png") ? "" : sourcePath) : (sourcePath || DEFAULT_PSU_LOGO);
    if (onItem) {
      onItem({
        ...item,
        presetId: nextPreset,
        params: {
          ...item.params,
          presetId: nextPreset,
          sourcePath: nextSource
        }
      });
    }
    onParams({
      presetId: nextPreset,
      sourcePath: nextSource
    });
  };

  return (
    <div className="inspector-container">
      {/* 1. Preset Selector Card */}
      <div className="inspector-card accent-gold">
        <details open>
          <summary style={{ color: "#E5A93C" }}>🎬 Outro Presentation Preset</summary>
          <div className="inspector-card-body">
            <div className="inspector-field">
              <label className="inspector-label">
                Preset Style
                <select
                  aria-label="Preset Style"
                  className="inspector-select"
                  value={presetId}
                  onChange={(e) => changePreset(e.target.value)}
                >
                  {outroPresetOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <small style={{ color: "#94A3B8", fontSize: "11px" }}>
                UI จะปรับแต่งฟิลด์อัตโนมัติตาม Preset ที่เลือก (Broadcast Grade 5-Dimension Motion Standards)
              </small>
            </div>
          </div>
        </details>
      </div>

      {/* 2. AUTO UI: Mode A - PSU Golden Light Streak Ident (logo-outro-v1) */}
      {presetId === "logo-outro-v1" && (
        <>
          {/* Logo Asset Card */}
          <div className="inspector-card accent-slate">
            <details open>
              <summary style={{ color: "#CBD5E1", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>🖼️ PSU Logo Media</span>
                <button
                  type="button"
                  className="inspector-btn inspector-btn-gold inspector-btn-sm"
                  onClick={() => onParams({ sourcePath: DEFAULT_PSU_LOGO })}
                >
                  🎯 Use Default PSU Logo
                </button>
              </summary>
              <div className="inspector-card-body">
                <PathField
                  label="Logo asset path (Image)"
                  value={sourcePath || DEFAULT_PSU_LOGO}
                  filter=".png,.svg,.webp,.jpg,.jpeg"
                  onChange={(val) => onParams({ sourcePath: val })}
                />
                <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "8px" }}>
                  <img
                    src={`/api/v1/media/stream?path=${encodeURIComponent(sourcePath || DEFAULT_PSU_LOGO)}`}
                    alt="Logo Preview"
                    style={{ width: "48px", height: "48px", objectFit: "contain", borderRadius: "8px", background: "#0B1220", border: "1px solid rgba(229,169,60,0.3)", padding: "4px" }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <small style={{ color: "#64748B", fontSize: "11px" }}>
                    {sourcePath ? "Custom Logo Active" : "Default PSU Emblem Active (/Volumes/ภาควีดีทัศน์/...)"}
                  </small>
                </div>
              </div>
            </details>
          </div>

          {/* Typography Card */}
          <div className="inspector-card accent-gold">
            <details open>
              <summary style={{ color: "#E5A93C" }}>✍️ Outro Typography (3-Tier Inverted Mask)</summary>
              <div className="inspector-card-body">
                <div className="inspector-field">
                  <label className="inspector-label">
                    ป้ายบน (Eyebrow Badge)
                    <input
                      aria-label="Eyebrow"
                      className="inspector-input"
                      value={eyebrow}
                      placeholder="มหาวิทยาลัยสงขลานครินทร์"
                      onChange={(e) => onParams({ eyebrow: e.target.value })}
                    />
                  </label>
                </div>
                <div className="inspector-field">
                  <label className="inspector-label">
                    หัวข้อหลัก (Main Title / Note) *
                    <input
                      aria-label="Title"
                      className="inspector-input"
                      value={title}
                      placeholder="PSU BROADCAST"
                      onChange={(e) => onParams({ title: e.target.value, note: e.target.value })}
                    />
                  </label>
                </div>
                <div className="inspector-field">
                  <label className="inspector-label">
                    ข้อความรอง (Subtitle / Department)
                    <input
                      aria-label="Subtitle"
                      className="inspector-input"
                      value={subtitle}
                      placeholder="Prince of Songkla University"
                      onChange={(e) => onParams({ subtitle: e.target.value })}
                    />
                  </label>
                </div>
              </div>
            </details>
          </div>

          {/* Glow & Scale Controls */}
          <div className="inspector-card accent-cyan">
            <details open>
              <summary style={{ color: "#22D3EE" }}>🎨 Laser Streak, Glow &amp; Scale</summary>
              <div className="inspector-card-body">
                <div className="inspector-grid-2">
                  <div className="inspector-field">
                    <label className="inspector-label">
                      Logo Scale ({logoScale}x)
                      <input
                        className="inspector-input"
                        type="range"
                        min="0.5"
                        max="1.8"
                        step="0.05"
                        value={logoScale}
                        onChange={(e) => onParams({ logoScale: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <div className="inspector-field">
                    <label className="inspector-label">
                      Glow Intensity ({glowIntensity}x)
                      <input
                        className="inspector-input"
                        type="range"
                        min="0.2"
                        max="2.5"
                        step="0.1"
                        value={glowIntensity}
                        onChange={(e) => onParams({ glowIntensity: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </>
      )}

      {/* 3. AUTO UI: Mode B - Celestial Particle Burst Ident (logo-outro-particle-burst-v1) */}
      {presetId === "logo-outro-particle-burst-v1" && (
        <>
          {/* Logo Asset Card */}
          <div className="inspector-card accent-slate">
            <details open>
              <summary style={{ color: "#CBD5E1", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>🖼️ Celestial Emblem Media</span>
                <button
                  type="button"
                  className="inspector-btn inspector-btn-gold inspector-btn-sm"
                  onClick={() => onParams({ sourcePath: DEFAULT_PSU_LOGO })}
                >
                  🎯 Use Default PSU Logo
                </button>
              </summary>
              <div className="inspector-card-body">
                <PathField
                  label="Emblem Path"
                  value={sourcePath || DEFAULT_PSU_LOGO}
                  filter=".png,.svg,.webp,.jpg,.jpeg"
                  onChange={(val) => onParams({ sourcePath: val })}
                />
                <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "8px" }}>
                  <img
                    src={`/api/v1/media/stream?path=${encodeURIComponent(sourcePath || DEFAULT_PSU_LOGO)}`}
                    alt="Logo Preview"
                    style={{ width: "48px", height: "48px", objectFit: "contain", borderRadius: "8px", background: "#0B1220", border: "1px solid rgba(0,229,255,0.3)", padding: "4px" }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <small style={{ color: "#64748B", fontSize: "11px" }}>
                    {sourcePath ? "Custom Emblem Active" : "Default PSU Emblem Active (/Volumes/ภาควีดีทัศน์/...)"}
                  </small>
                </div>
              </div>
            </details>
          </div>

          {/* Executive Typography Card */}
          <div className="inspector-card accent-gold">
            <details open>
              <summary style={{ color: "#E5A93C" }}>✍️ Executive Typography &amp; Tagline</summary>
              <div className="inspector-card-body">
                <div className="inspector-field">
                  <label className="inspector-label">
                    ป้ายบน (Eyebrow Tag)
                    <input
                      aria-label="Eyebrow"
                      className="inspector-input"
                      value={eyebrow}
                      placeholder="มหาวิทยาลัยสงขลานครินทร์"
                      onChange={(e) => onParams({ eyebrow: e.target.value })}
                    />
                  </label>
                </div>
                <div className="inspector-field">
                  <label className="inspector-label">
                    หัวข้อหลัก (Executive Title) *
                    <input
                      aria-label="Title"
                      className="inspector-input"
                      value={title}
                      placeholder="PSU BROADCAST"
                      onChange={(e) => onParams({ title: e.target.value, note: e.target.value })}
                    />
                  </label>
                </div>
                <div className="inspector-field">
                  <label className="inspector-label">
                    ข้อความรอง (Subtitle / Department)
                    <input
                      aria-label="Subtitle"
                      className="inspector-input"
                      value={subtitle}
                      placeholder="Prince of Songkla University"
                      onChange={(e) => onParams({ subtitle: e.target.value })}
                    />
                  </label>
                </div>
              </div>
            </details>
          </div>

          {/* Particle Burst Controls */}
          <div className="inspector-card accent-cyan">
            <details open>
              <summary style={{ color: "#22D3EE" }}>✨ Particle Cloud &amp; Scale</summary>
              <div className="inspector-card-body">
                <div className="inspector-grid-2">
                  <div className="inspector-field">
                    <label className="inspector-label">
                      Emblem Scale ({logoScale}x)
                      <input
                        className="inspector-input"
                        type="range"
                        min="0.5"
                        max="1.8"
                        step="0.05"
                        value={logoScale}
                        onChange={(e) => onParams({ logoScale: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <div className="inspector-field">
                    <label className="inspector-label">
                      Burst Glow ({glowIntensity}x)
                      <input
                        className="inspector-input"
                        type="range"
                        min="0.2"
                        max="2.5"
                        step="0.1"
                        value={glowIntensity}
                        onChange={(e) => onParams({ glowIntensity: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </>
      )}

      {/* 4. AUTO UI: Mode C - Fullscreen Video Sting (logo-outro-video-v1) */}
      {presetId === "logo-outro-video-v1" && (
        <>
          <div className="inspector-card accent-blue">
            <details open>
              <summary style={{ color: "#60A5FA", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>🎬 Outro Video File (.mov/.mp4)</span>
                <button
                  type="button"
                  className="inspector-btn inspector-btn-gold inspector-btn-sm"
                  onClick={() => setPickerOpen(true)}
                >
                  Open Finder…
                </button>
              </summary>
              <div className="inspector-card-body">
                <PathField
                  label="Video File Path"
                  value={sourcePath}
                  filter=".mov,.mp4,.mxf,.webm"
                  onChange={(val) => onParams({ sourcePath: val })}
                />
                {pickerOpen && (
                  <RemoteFilePickerModal
                    isOpen={pickerOpen}
                    title="Select Outro Video Asset"
                    filter=".mov,.mp4,.mxf,.webm"
                    initialPath={sourcePath}
                    onSelect={(selected) => {
                      onParams({ sourcePath: selected });
                      setPickerOpen(false);
                    }}
                    onClose={() => setPickerOpen(false)}
                  />
                )}
              </div>
            </details>
          </div>

          <div className="inspector-card accent-slate">
            <details open>
              <summary style={{ color: "#CBD5E1" }}>📐 Video Playback &amp; Transitions</summary>
              <div className="inspector-card-body">
                <div className="inspector-field">
                  <label className="inspector-label">
                    Video Fit Mode
                    <select
                      className="inspector-select"
                      value={videoFit}
                      onChange={(e) => onParams({ videoFit: e.target.value })}
                    >
                      <option value="cover">Cover (เต็มจอ ครอปส่วนเกิน)</option>
                      <option value="contain">Contain (พอดีสัดส่วน)</option>
                    </select>
                  </label>
                </div>
                <div className="inspector-grid-2">
                  <div className="inspector-field">
                    <label className="inspector-label">
                      Fade In (ms)
                      <input
                        className="inspector-input"
                        type="number"
                        min="0"
                        max="2000"
                        step="100"
                        value={fadeInMs}
                        onChange={(e) => onParams({ fadeInMs: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <div className="inspector-field">
                    <label className="inspector-label">
                      Fade Out (ms)
                      <input
                        className="inspector-input"
                        type="number"
                        min="0"
                        max="2000"
                        step="100"
                        value={fadeOutMs}
                        onChange={(e) => onParams({ fadeOutMs: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </details>
          </div>

          {/* Optional Overlay End-Card Fields */}
          <div className="inspector-card accent-gold">
            <details>
              <summary style={{ color: "#E5A93C" }}>🏷️ Optional End-Card Text Overlay</summary>
              <div className="inspector-card-body">
                <div className="inspector-field">
                  <label className="inspector-label">
                    Eyebrow (ป้ายบน)
                    <input
                      className="inspector-input"
                      value={eyebrow}
                      placeholder="ปล่อยว่างหากไม่ต้องการแสดง"
                      onChange={(e) => onParams({ eyebrow: e.target.value })}
                    />
                  </label>
                </div>
                <div className="inspector-field">
                  <label className="inspector-label">
                    Main Title
                    <input
                      className="inspector-input"
                      value={title}
                      placeholder="เช่น PSU BROADCAST"
                      onChange={(e) => onParams({ title: e.target.value, note: e.target.value })}
                    />
                  </label>
                </div>
                <div className="inspector-field">
                  <label className="inspector-label">
                    Subtitle
                    <input
                      className="inspector-input"
                      value={subtitle}
                      placeholder="เช่น Prince of Songkla University"
                      onChange={(e) => onParams({ subtitle: e.target.value })}
                    />
                  </label>
                </div>
              </div>
            </details>
          </div>
        </>
      )}

      {/* 5. AUTO UI: Mode D - Modern Minimal Emblem (logo-outro-minimal-v1) */}
      {presetId === "logo-outro-minimal-v1" && (
        <>
          <div className="inspector-card accent-slate">
            <details open>
              <summary style={{ color: "#CBD5E1", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>🏛️ Minimal Emblem Media</span>
                <button
                  type="button"
                  className="inspector-btn inspector-btn-gold inspector-btn-sm"
                  onClick={() => onParams({ sourcePath: DEFAULT_PSU_LOGO })}
                >
                  🎯 Use Default PSU Logo
                </button>
              </summary>
              <div className="inspector-card-body">
                <PathField
                  label="Emblem Path"
                  value={sourcePath || DEFAULT_PSU_LOGO}
                  filter=".png,.svg,.webp,.jpg,.jpeg"
                  onChange={(val) => onParams({ sourcePath: val })}
                />
                <div className="inspector-field" style={{ marginTop: "8px" }}>
                  <label className="inspector-label">
                    Logo Scale ({logoScale}x)
                    <input
                      className="inspector-input"
                      type="range"
                      min="0.5"
                      max="1.8"
                      step="0.05"
                      value={logoScale}
                      onChange={(e) => onParams({ logoScale: Number(e.target.value) })}
                    />
                  </label>
                </div>
              </div>
            </details>
          </div>

          <div className="inspector-card accent-gold">
            <details open>
              <summary style={{ color: "#E5A93C" }}>✍️ Department Typography</summary>
              <div className="inspector-card-body">
                <div className="inspector-field">
                  <label className="inspector-label">
                    Main Title *
                    <input
                      className="inspector-input"
                      value={title}
                      placeholder="PSU BROADCAST"
                      onChange={(e) => onParams({ title: e.target.value, note: e.target.value })}
                    />
                  </label>
                </div>
                <div className="inspector-field">
                  <label className="inspector-label">
                    Department / Tagline
                    <input
                      className="inspector-input"
                      value={subtitle}
                      placeholder="Prince of Songkla University"
                      onChange={(e) => onParams({ subtitle: e.target.value })}
                    />
                  </label>
                </div>
              </div>
            </details>
          </div>
        </>
      )}

      {/* 6. Broadcast Audio Contract Badge */}
      <div className="inspector-card accent-slate" style={{ opacity: 0.85 }}>
        <details>
          <summary style={{ color: "#94A3B8" }}>🔇 Broadcast Audio Policy (Mute)</summary>
          <div className="inspector-card-body">
            <small style={{ color: "#64748B", fontSize: "11px" }}>
              ตามมาตรฐาน Broadcast Master Timeline: ฉาก Outro กำหนดให้เป็น Mute Window โดยอัตโนมัติเพื่อป้องกันเสียงซ้อนทับกับดนตรีบรรเลงหลัก
            </small>
          </div>
        </details>
      </div>
    </div>
  );
}

