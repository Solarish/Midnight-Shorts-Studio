import { useState } from "react";
import type { StoryboardItem } from "../../storyboard-types";
import { type CgBlock, CgBlockEditor } from "../CgBlockEditor";
import { RemoteFilePickerModal } from "../RemoteFilePickerModal";
import { directoryForPath } from "./CommonFields";
import "./inspectors.css";

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
  onChange
}: {
  value: string[];
  onChange: (value: string[]) => void;
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
    <div className="inspector-card accent-gold carousel-media-field">
      <details open>
        <summary style={{ color: "#E5A93C", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>🎡 Carousel Media ({value.length} files)</span>
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
            ลำดับบนลงล่างคือลำดับที่ปรากฏบน 3D Cylindrical Carousel
          </small>
          {value.length ? (
            <ol>
              {value.map((mediaPath, index) => (
                <li key={mediaPath}>
                  <span className="media-order">{index + 1}</span>
                  <span className="media-name" title={mediaPath}>
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
              ยังไม่มีภาพ · กดที่นี่เพื่อเลือกหลายไฟล์จาก Finder
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
        title="เลือกภาพสำหรับ 3D Carousel"
      />
    </div>
  );
}

export interface TitleCarouselInspectorProps {
  item: StoryboardItem;
  onParams: (patch: Record<string, unknown>) => void;
  onItem: (item: StoryboardItem) => void;
}

export function TitleCarouselInspector({
  item,
  onParams,
  onItem
}: TitleCarouselInspectorProps) {
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

  const updateText = (key: string, value: string) => {
    onParams({
      [key]: value,
      texts: {
        ...texts,
        [key]: value
      }
    });
  };

  return (
    <div className="inspector-container">
      {/* 3D Showcase Text Card */}
      <div className="inspector-card accent-gold">
        <details open>
          <summary style={{ color: "#E5A93C" }}>
            🎡 3D Photo Carousel Showcase (Titles &amp; Texts)
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
                  className="inspector-input"
                  value={eyebrow}
                  placeholder="PSU BROADCAST SPECIAL REPORT"
                  onChange={(event) => updateText("eyebrow", event.target.value)}
                />
              </label>
            </div>

            <CgBlockEditor
              blocks={cgBlocks}
              onChange={(nextBlocks) => {
                onItem({
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
    </div>
  );
}
