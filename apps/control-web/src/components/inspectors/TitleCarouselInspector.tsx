import { useState } from "react";
import type { StoryboardItem } from "../../storyboard-types";
import { type CgBlock, CgBlockEditor } from "../CgBlockEditor";
import { RemoteFilePickerModal } from "../RemoteFilePickerModal";
import { directoryForPath, PathField } from "./CommonFields";
import "./inspectors.css";

export const introPresetOptions = [
  { value: "3d-carousel-title-v1", label: "🎡 3D Photo Carousel Showcase · v1 (Gold Standard)" },
  { value: "title-parallax-cinema-v1", label: "🎥 Cinematic Parallax Multi-Layer · v1" },
  { value: "title-split-dynamic-v1", label: "⚡ High-Energy Dynamic Split Screen · v1" },
  { value: "title-classic-flat-v1", label: "🎬 Classic Cinematic Title · v1" },
  { value: "title-minimal-badge-v1", label: "🏛️ Modern Minimal Title · v1" }
];

export function getCgBlocksFromParams(params: Record<string, unknown>): CgBlock[] {
  if (Array.isArray(params.cgBlocks)) return params.cgBlocks as CgBlock[];
  const legacySequence = Array.isArray(params.layoutSequence) ? params.layoutSequence : [];
  return legacySequence.map((shot: any, index) => {
    const layout = String(shot.layout ?? "photo-stack");
    return {
      id: `legacy_${index + 1}`,
      type:
        index === legacySequence.length - 1 && layout === "image-sweep" && Number(shot.durationMs) <= 1200
          ? "fade-to-black"
          : layout
              .replace("layered-stack", "photo-stack")
              .replace("scattered-collage", "photo-collage")
              .replace("portrait-row", "portrait-row"),
      durationMs: Number(shot.durationMs ?? 1000),
      enabled: true,
      mediaOrder: shot.mediaOrder,
      visibleCount: shot.visibleCount
    };
  });
}

export function CarouselMediaField({
  value,
  onChange,
  title = "🎡 Carousel Media",
  description = "ลำดับบนลงล่างคือลำดับที่ปรากฏบน 3D Cylindrical Carousel"
}: {
  value: string[];
  onChange: (value: string[]) => void;
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };
  const add = (paths: string[]) => onChange([...new Set([...value, ...paths])]);

  return (
    <div className="inspector-card accent-amber carousel-media-field">
      <details open>
        <summary style={{ color: "#FBBF24", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="tva-lamp" />
            <span className="tva-telemetry-title">{title} ({value.length} files)</span>
          </div>
          <button
            type="button"
            className="inspector-btn inspector-btn-gold inspector-btn-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(true);
            }}
          >
            Open Finder…
          </button>
        </summary>
        <div className="inspector-card-body">
          <small style={{ color: "#94A3B8", fontSize: "11px" }}>
            {description}
          </small>
          {value.length ? (
            <ol>
              {value.map((mediaPath, index) => (
                <li key={mediaPath} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className="media-order">{index + 1}</span>
                  <img
                    src={`/api/v1/media/stream?path=${encodeURIComponent(mediaPath)}`}
                    alt="thumb"
                    style={{
                      width: "36px",
                      height: "24px",
                      objectFit: "cover",
                      borderRadius: "4px",
                      border: "1px solid rgba(245, 158, 11, 0.4)",
                      background: "#090D16",
                      flexShrink: 0
                    }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <span className="media-name" title={mediaPath} style={{ flex: 1 }}>
                    <strong>{mediaPath.split(/[\\/]/).filter(Boolean).at(-1)}</strong>
                    <small>{mediaPath}</small>
                  </span>
                  <button
                    type="button"
                    className="inspector-btn inspector-btn-secondary inspector-btn-sm"
                    aria-label={`Move ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="inspector-btn inspector-btn-secondary inspector-btn-sm"
                    aria-label={`Move ${index + 1} down`}
                    disabled={index === value.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="inspector-btn inspector-btn-secondary inspector-btn-sm"
                    aria-label={`Remove ${mediaPath}`}
                    onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <button
              type="button"
              className="inspector-btn inspector-btn-secondary"
              style={{ width: "100%", padding: "16px", borderStyle: "dashed" }}
              onClick={() => setOpen(true)}
            >
              + เพิ่มรูปภาพ / วิดีโอสำหรับ Carousel
            </button>
          )}
        </div>
      </details>
      <RemoteFilePickerModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onSelect={() => {}}
        onSelectMultiple={add}
        initialPath={directoryForPath(value[0] ?? "")}
        mode="file"
        multiple
        filter=".png,.jpg,.jpeg,.webp,.tif,.tiff"
        title="เลือกภาพสำหรับ Showcase"
      />
    </div>
  );
}

export interface TitleCarouselInspectorProps {
  item: StoryboardItem;
  onParams: (patch: Record<string, unknown>) => void;
  onItem?: (item: StoryboardItem) => void;
}

export function TitleCarouselInspector({
  item,
  onParams,
  onItem
}: TitleCarouselInspectorProps) {
  const rawPreset = String(item.presetId ?? (item.params as any)?.presetId ?? "3d-carousel-title-v1");
  const isParallax = rawPreset === "title-parallax-cinema-v1" || rawPreset.includes("parallax");
  const isSplit = rawPreset === "title-split-dynamic-v1" || rawPreset.includes("split");
  const isClassicFlat = rawPreset === "title-classic-flat-v1" || rawPreset.includes("flat") || rawPreset.includes("classic");
  const isMinimal = rawPreset === "title-minimal-badge-v1" || rawPreset.includes("minimal");
  const is3DCarousel = !isParallax && !isSplit && !isClassicFlat && !isMinimal;
  const currentPresetValue = isParallax
    ? "title-parallax-cinema-v1"
    : isSplit
    ? "title-split-dynamic-v1"
    : isClassicFlat
    ? "title-classic-flat-v1"
    : isMinimal
    ? "title-minimal-badge-v1"
    : "3d-carousel-title-v1";

  const texts =
    typeof item.params.texts === "object" && item.params.texts
      ? (item.params.texts as Record<string, unknown>)
      : {};
  const media = Array.isArray(item.params.media) ? item.params.media.map(String) : [];
  const text = String(item.params.text ?? texts.text ?? texts["Text 3"] ?? "");
  const title = String(item.params.title ?? texts.title ?? "");
  const subtitle = String(item.params.subtitle ?? texts.subtitle ?? texts["Text 4"] ?? "");
  const eyebrow = String(item.params.eyebrow ?? texts.eyebrow ?? texts["Text 5"] ?? "");
  const cgBlocks = getCgBlocksFromParams(item.params);
  const heroImage = media[0] ?? "";
  const rotationSpeed = Number((item.params as any)?.rotationSpeed ?? 1.0);
  const cameraTilt = Number((item.params as any)?.cameraTilt ?? 8);
  const enableReflection = Boolean((item.params as any)?.enableReflection ?? true);
  const splitAngle = Number((item.params as any)?.splitAngle ?? -6);
  const motionPreset = String(item.params.motionPreset ?? "ZoomPunch");

  const updateText = (key: string, value: string) => {
    onParams({
      [key]: value,
      texts: {
        ...texts,
        [key]: value
      }
    });
  };

  const changePreset = (nextPreset: string) => {
    if (onItem) {
      onItem({
        ...item,
        presetId: nextPreset,
        params: {
          ...item.params,
          presetId: nextPreset
        }
      });
    }
    onParams({
      presetId: nextPreset
    });
  };

  return (
    <div className="inspector-container">
      {/* 1. Preset Selector Card */}
      <div className="inspector-card accent-amber">
        <details open>
          <summary style={{ color: "#FBBF24" }}>
            <span className="tva-lamp" />
            <span className="tva-telemetry-title">INTRO PRESET // โหมดการนำเสนอ</span>
          </summary>
          <div className="inspector-card-body">
            <div className="inspector-field">
              <label className="inspector-label">
                Preset Style
                <select
                  aria-label="Preset Style"
                  className="inspector-select"
                  value={currentPresetValue}
                  onChange={(e) => changePreset(e.target.value)}
                >
                  {introPresetOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <small style={{ color: "#94A3B8", fontSize: "11px" }}>
                UI จะปรับแต่งฟิลด์อัตโนมัติตาม Preset ของ Intro ที่เลือก
              </small>
            </div>
          </div>
        </details>
      </div>

      {/* 2. AUTO UI: Mode A - 3D Photo Carousel Showcase (Default) */}
      {is3DCarousel && (
        <>
          {/* Typography Card */}
          <div className="inspector-card accent-amber">
            <details open>
              <summary style={{ color: "#FBBF24" }}>
                <span className="tva-lamp" />
                <span className="tva-telemetry-title">3D SHOWCASE TYPOGRAPHY // ข้อความและไตเติล</span>
              </summary>
              <div className="inspector-card-body">
                <div className="inspector-grid-2">
                  <div className="inspector-field">
                    <label className="inspector-label">
                      ข้อความมาตรฐาน (Text) *
                      <input
                        aria-label="Text"
                        className="inspector-input"
                        value={text}
                        placeholder="ข้อความหลักของ Showcase"
                        onChange={(event) => updateText("text", event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="inspector-field">
                    <label className="inspector-label">
                      หัวข้อหลัก (Title) *
                      <input
                        aria-label="Title"
                        className="inspector-input"
                        value={title}
                        placeholder="อาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙"
                        onChange={(event) => updateText("title", event.target.value)}
                      />
                    </label>
                  </div>
                </div>

                <div className="inspector-field">
                  <label className="inspector-label">
                    สังกัด / คำขยาย (Subtitle)
                    <input
                      aria-label="Subtitle"
                      className="inspector-input"
                      value={subtitle}
                      placeholder="คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์"
                      onChange={(event) => updateText("subtitle", event.target.value)}
                    />
                  </label>
                </div>

                <div className="inspector-field">
                  <label className="inspector-label">
                    ป้ายหัวเรื่อง (Eyebrow Badge)
                    <input
                      aria-label="Eyebrow"
                      className="inspector-input"
                      value={eyebrow}
                      placeholder="PSU BROADCAST SPECIAL REPORT"
                      onChange={(event) => updateText("eyebrow", event.target.value)}
                    />
                  </label>
                </div>
              </div>
            </details>
          </div>

          {/* 3D Camera Controls Card */}
          <div className="inspector-card accent-cyan">
            <details open>
              <summary style={{ color: "#22D3EE" }}>🎥 3D Camera &amp; Showcase Physics</summary>
              <div className="inspector-card-body">
                <div className="inspector-grid-2">
                  <div className="inspector-field">
                    <label className="inspector-label">
                      ความเร็วหมุนรอบ ({rotationSpeed}x)
                      <input
                        className="inspector-input"
                        type="range"
                        min="0.2"
                        max="3.0"
                        step="0.1"
                        value={rotationSpeed}
                        onChange={(e) => onParams({ rotationSpeed: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <div className="inspector-field">
                    <label className="inspector-label">
                      มุมเอียงกล้อง ({cameraTilt}°)
                      <input
                        className="inspector-input"
                        type="range"
                        min="-25"
                        max="25"
                        step="1"
                        value={cameraTilt}
                        onChange={(e) => onParams({ cameraTilt: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                </div>

                <div className="inspector-grid-2" style={{ marginTop: "8px" }}>
                  <div className="inspector-field">
                    <label className="inspector-label">
                      Motion Preset
                      <select
                        className="inspector-select"
                        value={motionPreset}
                        onChange={(e) => onParams({ motionPreset: e.target.value })}
                      >
                        <option value="ZoomPunch">ZoomPunch (Dynamic Entrance)</option>
                        <option value="Pop">Pop (Elastic Spring)</option>
                        <option value="Bounce">Bounce (Playful)</option>
                        <option value="Spring">Spring (Smooth Damped)</option>
                      </select>
                    </label>
                  </div>
                  <div className="inspector-field" style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "20px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "11px", color: "#E2E8F0" }}>
                      <input
                        type="checkbox"
                        checked={enableReflection}
                        onChange={(e) => onParams({ enableReflection: e.target.checked })}
                      />
                      เปิดเงาสะท้อนพื้น (Floor Reflection)
                    </label>
                  </div>
                </div>
              </div>
            </details>
          </div>

          {/* CG Block Sequencer Card */}
          <div className="inspector-card accent-slate">
            <details open>
              <summary style={{ color: "#CBD5E1" }}>🎞️ CG Layout Sequencer ({cgBlocks.length} shots)</summary>
              <div className="inspector-card-body">
                <CgBlockEditor
                  blocks={cgBlocks}
                  onChange={(nextBlocks) => {
                    onItem?.({
                      ...item,
                      params: {
                        ...item.params,
                        cgBlocks: nextBlocks
                      }
                    });
                  }}
                />
              </div>
            </details>
          </div>

          {/* 3D Carousel Media Ordered List Card */}
          <CarouselMediaField
            value={media}
            onChange={(nextMedia) => onParams({ media: nextMedia })}
          />
        </>
      )}

      {/* 2. AUTO UI: Mode B - Cinematic Multi-Layer Parallax */}
      {isParallax && (
        <>
          <div className="inspector-card accent-gold">
            <details open>
              <summary style={{ color: "#E5A93C" }}>
                🎥 Cinematic Parallax Typography
              </summary>
              <div className="inspector-card-body">
                <div className="inspector-grid-2">
                  <div className="inspector-field">
                    <label className="inspector-label">
                      ข้อความมาตรฐาน (Text)
                      <input
                        aria-label="Text"
                        className="inspector-input"
                        value={text}
                        placeholder="ข้อความสำรอง / Text"
                        onChange={(e) => updateText("text", e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="inspector-field">
                    <label className="inspector-label">
                      หัวข้อหลัก (Main Title) *
                      <input
                        aria-label="Title"
                        className="inspector-input"
                        value={title || text}
                        placeholder="PSU BROADCAST SPECIAL"
                        onChange={(e) => {
                          updateText("title", e.target.value);
                          if (!text) updateText("text", e.target.value);
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="inspector-field">
                  <label className="inspector-label">
                    ข้อความรอง (Subtitle / Faculty)
                    <input
                      aria-label="Subtitle"
                      className="inspector-input"
                      value={subtitle}
                      placeholder="PRINCE OF SONGKLA UNIVERSITY"
                      onChange={(e) => updateText("subtitle", e.target.value)}
                    />
                  </label>
                </div>

                <div className="inspector-field">
                  <label className="inspector-label">
                    ป้ายหัวเรื่อง (Eyebrow Badge)
                    <input
                      aria-label="Eyebrow"
                      className="inspector-input"
                      value={eyebrow}
                      placeholder="SPECIAL REPORT"
                      onChange={(e) => updateText("eyebrow", e.target.value)}
                    />
                  </label>
                </div>
              </div>
            </details>
          </div>

          <CarouselMediaField
            value={media}
            onChange={(nextMedia) => onParams({ media: nextMedia })}
            title="🖼️ Parallax Hero & Atmospheric Media"
            description="ภาพแรกคือ Hero Image ตรงกลาง (3D Z-Depth), ภาพที่สองคือ Background Atmosphere"
          />
        </>
      )}

      {/* 3. AUTO UI: Mode C - High-Energy Dynamic Split Screen */}
      {isSplit && (
        <>
          <div className="inspector-card accent-cyan">
            <details open>
              <summary style={{ color: "#00E5FF" }}>
                ⚡ High-Energy Split Typography
              </summary>
              <div className="inspector-card-body">
                <div className="inspector-grid-2">
                  <div className="inspector-field">
                    <label className="inspector-label">
                      ข้อความมาตรฐาน (Text)
                      <input
                        aria-label="Text"
                        className="inspector-input"
                        value={text}
                        placeholder="ข้อความสำรอง / Text"
                        onChange={(e) => updateText("text", e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="inspector-field">
                    <label className="inspector-label">
                      หัวข้อหลัก (Main Title) *
                      <input
                        aria-label="Title"
                        className="inspector-input"
                        value={title || text}
                        placeholder="PSU BROADCAST LIVE"
                        onChange={(e) => {
                          updateText("title", e.target.value);
                          if (!text) updateText("text", e.target.value);
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="inspector-field">
                  <label className="inspector-label">
                    ข้อความรอง (Subtitle Telemetry)
                    <input
                      aria-label="Subtitle"
                      className="inspector-input"
                      value={subtitle}
                      placeholder="SPECIAL INVESTIGATION"
                      onChange={(e) => updateText("subtitle", e.target.value)}
                    />
                  </label>
                </div>

                <div className="inspector-field">
                  <label className="inspector-label">
                    ป้ายหัวเรื่อง (Eyebrow Badge)
                    <input
                      aria-label="Eyebrow"
                      className="inspector-input"
                      value={eyebrow}
                      placeholder="EXCLUSIVE"
                      onChange={(e) => updateText("eyebrow", e.target.value)}
                    />
                  </label>
                </div>
              </div>
            </details>
          </div>

          <div className="inspector-card accent-gold">
            <details open>
              <summary style={{ color: "#E5A93C" }}>📐 Split Screen Geometry</summary>
              <div className="inspector-card-body">
                <div className="inspector-field">
                  <label className="inspector-label">
                    มุมเอียงเส้นแบ่ง Split ({splitAngle}°)
                    <input
                      className="inspector-input"
                      type="range"
                      min="-15"
                      max="15"
                      step="1"
                      value={splitAngle}
                      onChange={(e) => onParams({ splitAngle: Number(e.target.value) })}
                    />
                  </label>
                </div>
              </div>
            </details>
          </div>

          <CarouselMediaField
            value={media}
            onChange={(nextMedia) => onParams({ media: nextMedia })}
            title="⚡ Split Screen Panels Media (2-4 Files)"
            description="ลำดับภาพตามลำดับช่อง Split Screen (ช่อง 1, 2, 3, 4)"
          />
        </>
      )}

      {/* 4. AUTO UI: Mode D - Classic Cinematic Title */}
      {isClassicFlat && (
        <>
          <div className="inspector-card accent-gold">
            <details open>
              <summary style={{ color: "#E5A93C" }}>✍️ Cinematic Title Typography</summary>
              <div className="inspector-card-body">
                <div className="inspector-field">
                  <label className="inspector-label">
                    ป้ายบน (Eyebrow Badge)
                    <input
                      className="inspector-input"
                      value={eyebrow}
                      placeholder="PSU SPECIAL REPORT"
                      onChange={(e) => updateText("eyebrow", e.target.value)}
                    />
                  </label>
                </div>
                <div className="inspector-field">
                  <label className="inspector-label">
                    หัวข้อหลัก (Main Title) *
                    <input
                      className="inspector-input"
                      value={title || text}
                      placeholder="อาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙"
                      onChange={(e) => {
                        updateText("title", e.target.value);
                        updateText("text", e.target.value);
                      }}
                    />
                  </label>
                </div>
                <div className="inspector-field">
                  <label className="inspector-label">
                    ข้อความรอง (Subtitle / Department)
                    <input
                      className="inspector-input"
                      value={subtitle}
                      placeholder="มหาวิทยาลัยสงขลานครินทร์"
                      onChange={(e) => updateText("subtitle", e.target.value)}
                    />
                  </label>
                </div>
              </div>
            </details>
          </div>

          <div className="inspector-card accent-slate">
            <details open>
              <summary style={{ color: "#CBD5E1" }}>🖼️ Hero Background Image</summary>
              <div className="inspector-card-body">
                <PathField
                  label="Background Hero Image"
                  value={heroImage}
                  filter=".png,.jpg,.jpeg,.webp,.tif,.tiff"
                  onChange={(val) => onParams({ media: val ? [val] : [] })}
                />
                {heroImage && (
                  <div style={{ marginTop: "8px" }}>
                    <img
                      src={`/api/v1/media/stream?path=${encodeURIComponent(heroImage)}`}
                      alt="Hero Preview"
                      style={{ width: "100%", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155" }}
                    />
                  </div>
                )}
              </div>
            </details>
          </div>

          <div className="inspector-card accent-cyan">
            <details open>
              <summary style={{ color: "#22D3EE" }}>🎬 Motion &amp; Animation</summary>
              <div className="inspector-card-body">
                <div className="inspector-field">
                  <label className="inspector-label">
                    Motion Preset
                    <select
                      className="inspector-select"
                      value={motionPreset}
                      onChange={(e) => onParams({ motionPreset: e.target.value })}
                    >
                      <option value="ZoomPunch">ZoomPunch (Slow Push In)</option>
                      <option value="Pop">Pop (Spring Pop)</option>
                      <option value="Spring">Spring (Smooth Damped)</option>
                    </select>
                  </label>
                </div>
              </div>
            </details>
          </div>
        </>
      )}

      {/* 4. AUTO UI: Mode C - Modern Minimal Title */}
      {isMinimal && (
        <div className="inspector-card accent-gold">
          <details open>
            <summary style={{ color: "#E5A93C" }}>🏛️ Modern Minimal Title</summary>
            <div className="inspector-card-body">
              <div className="inspector-field">
                <label className="inspector-label">
                  ป้ายหัวเรื่อง (Eyebrow Tag)
                  <input
                    className="inspector-input"
                    value={eyebrow}
                    placeholder="PSU BROADCAST"
                    onChange={(e) => updateText("eyebrow", e.target.value)}
                  />
                </label>
              </div>
              <div className="inspector-field">
                <label className="inspector-label">
                  หัวข้อหลัก (Title) *
                  <input
                    className="inspector-input"
                    value={title || text}
                    placeholder="ชื่อรายการ / สารคดีสั้น"
                    onChange={(e) => {
                      updateText("title", e.target.value);
                      updateText("text", e.target.value);
                    }}
                  />
                </label>
              </div>
              <div className="inspector-field">
                <label className="inspector-label">
                  ข้อความรอง (Subtitle)
                  <input
                    className="inspector-input"
                    value={subtitle}
                    placeholder="Prince of Songkla University"
                    onChange={(e) => updateText("subtitle", e.target.value)}
                  />
                </label>
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
