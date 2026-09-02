import { useState } from "react";
import type { StoryboardItem } from "../../storyboard-types";
import { PathField, SecondsField, formatSeconds, formatTimecode } from "./CommonFields";
import "./inspectors.css";

export const aRollPresetOptions = [
  { value: "a-roll-segment-v1", label: "🎤 Standard Interview / Talking Head · v1" },
  { value: "a-roll-voiceover-v1", label: "🎙️ Voiceover & Full B-roll · v1" },
  { value: "a-roll-pip-v1", label: "🖼️ Picture-in-Picture Presentation · v1" }
];

export interface ARollInspectorProps {
  item: StoryboardItem;
  selectedBrollId?: string;
  onSelectBroll?: (id: string) => void;
  onParams: (patch: Record<string, unknown>) => void;
  onItem: (item: StoryboardItem) => void;
  canMerge?: boolean;
  onSplit?: () => void;
  onMerge?: () => void;
}

function uniqueId(prefix: string, existing: string[]) {
  let counter = existing.length + 1;
  while (existing.includes(`${prefix}_${counter}`)) counter++;
  return `${prefix}_${counter}`;
}

export function ARollInspector({
  item,
  selectedBrollId,
  onSelectBroll,
  onParams,
  onItem,
  canMerge = false,
  onSplit,
  onMerge
}: ARollInspectorProps) {
  const rawPreset = String(item.presetId ?? (item.params as any)?.presetId ?? "a-roll-segment-v1");
  const isVoiceover = rawPreset === "a-roll-voiceover-v1" || rawPreset.includes("voiceover");
  const isPip = rawPreset === "a-roll-pip-v1" || rawPreset.includes("pip");
  const isInterview = !isVoiceover && !isPip;
  const currentPresetValue = isVoiceover ? "a-roll-voiceover-v1" : isPip ? "a-roll-pip-v1" : "a-roll-segment-v1";

  const broll = item.broll ?? [];
  const sourcePath = String(item.params.sourcePath ?? "");
  const sourceKey = String(item.params.sourceKey ?? "");
  const speaker = String(item.params.speaker ?? "");
  const dialogue = String(item.params.dialogue ?? "");

  // J-Cut & L-Cut Split Edit Parameters
  const jCutMs = Number((item.params as any)?.jCutMs ?? 0);
  const lCutMs = Number((item.params as any)?.lCutMs ?? 0);
  const audioFadeMs = Number((item.params as any)?.audioFadeMs ?? 80);

  // PiP Parameters
  const pipPosition = String((item.params as any)?.pipPosition ?? "bottom-right");
  const pipShape = String((item.params as any)?.pipShape ?? "circle");
  const pipScale = Number((item.params as any)?.pipScale ?? 0.32);

  const updateBroll = (index: number, patch: Partial<(typeof broll)[number]>) =>
    onItem({
      ...item,
      broll: broll.map((val, itemIndex) => (itemIndex === index ? { ...val, ...patch } : val))
    });

  const handleAddBroll = () => {
    const last = broll[broll.length - 1];
    // Auto-cascade: Place next B-roll immediately after previous B-roll
    const nextOffset = last ? Math.min(item.durationMs, last.offsetMs + last.durationMs) : 0;
    const remainingMs = Math.max(0, item.durationMs - nextOffset);
    const nextDuration = remainingMs >= 1000 ? Math.min(3000, remainingMs) : Math.min(3000, item.durationMs);

    const next = {
      id: uniqueId(`${item.id}_broll`, broll.map((val) => val.id)),
      asset: { path: "" },
      offsetMs: nextOffset,
      durationMs: nextDuration,
      audioPolicy: "mute" as const,
      fit: "cover" as const,
      preset: "Pop"
    };
    onItem({ ...item, broll: [...broll, next] });
    onSelectBroll?.(next.id);
  };

  const handleAutoChainBroll = () => {
    let cursor = 0;
    const updated = broll.map((b) => {
      const offsetMs = cursor;
      cursor = Math.min(item.durationMs, cursor + b.durationMs);
      return { ...b, offsetMs };
    });
    onItem({ ...item, broll: updated });
  };

  const handleDistributeEvenly = () => {
    if (!broll.length) return;
    const segmentDuration = Math.max(40, Math.floor(item.durationMs / broll.length));
    const updated = broll.map((b, idx) => ({
      ...b,
      offsetMs: idx * segmentDuration,
      durationMs: segmentDuration
    }));
    onItem({ ...item, broll: updated });
  };

  const updateRange = (patch: Record<string, number>) => {
    const params = { ...item.params, ...patch };
    const sourceInMs = Number(params.sourceInMs ?? 0);
    const sourceOutMs = Number(params.sourceOutMs ?? 0);
    onItem({
      ...item,
      params,
      durationMs: Math.max(40, sourceOutMs - sourceInMs)
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

  // Pre-calculate B-Roll colors for visual timeline
  const brollColors = ["#3B82F6", "#E5A93C", "#10B981", "#EC4899", "#8B5CF6", "#F59E0B"];

  return (
    <div className="inspector-container">
      {/* 1. Preset Selector Card */}
      <div className="inspector-card accent-blue">
        <details open>
          <summary style={{ color: "#60A5FA" }}>🎬 A-Roll Presentation Preset</summary>
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
                  {aRollPresetOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <small style={{ color: "#94A3B8", fontSize: "11px" }}>
                UI จะปรับแต่ง Form Fields และพารามิเตอร์ตามโหมดการเล่าเรื่องของ A-Roll
              </small>
            </div>
          </div>
        </details>
      </div>

      {/* 2. Source Media & Range Card */}
      <div className="inspector-card accent-blue">
        <details open>
          <summary style={{ color: "#60A5FA" }}>
            {isVoiceover ? "🎙️ Voiceover Audio Track" : "📁 Primary Video Footage (A-Roll)"}
          </summary>
          <div className="inspector-card-body">
            <PathField
              label={isVoiceover ? "Audio file / Footage" : "Source media"}
              value={sourcePath}
              filter={isVoiceover ? ".wav,.mp3,.m4a,.aac,.mov,.mp4,.mxf" : ".mov,.mp4,.mxf,.avi,.mkv"}
              onChange={(newSourcePath) => onParams({ sourcePath: newSourcePath })}
            />

            {sourcePath && !isVoiceover && (
              <div style={{ marginTop: "6px", marginBottom: "8px" }}>
                <img
                  src={`/api/v1/media/stream?path=${encodeURIComponent(sourcePath)}`}
                  alt="A-Roll Preview"
                  style={{ width: "100%", height: "90px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155" }}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              </div>
            )}

            <div className="inspector-field">
              <label className="inspector-label">
                Source key
                <input
                  className="inspector-input"
                  value={sourceKey}
                  onChange={(event) => onParams({ sourceKey: event.target.value })}
                  placeholder="e.g. C7724"
                />
              </label>
              <small style={{ color: "#64748B", fontSize: "10px" }}>
                รหัสคลิปที่ใช้เชื่อม segment และคำสั่ง merge
              </small>
            </div>

            {/* Timing & Range Controls */}
            <div className="inspector-grid-2" style={{ marginTop: "8px" }}>
              <SecondsField
                label="Source in"
                valueMs={Number(item.params.sourceInMs ?? 0)}
                minMs={0}
                onChange={(sourceInMs) => updateRange({ sourceInMs })}
              />
              <SecondsField
                label="Source out"
                valueMs={Number(item.params.sourceOutMs ?? 0)}
                minMs={40}
                onChange={(sourceOutMs) => updateRange({ sourceOutMs })}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                background: "#1E293B",
                borderRadius: "8px",
                border: "1px solid #334155",
                marginTop: "8px"
              }}
            >
              <span style={{ fontSize: "12px", color: "#94A3B8" }}>Duration (s)</span>
              <strong style={{ color: "#F8FAFC", fontSize: "14px" }}>
                {formatSeconds(item.durationMs)} s
              </strong>
              <code style={{ color: "#60A5FA", fontSize: "12px" }}>
                {formatTimecode(item.durationMs)}
              </code>
            </div>

            {/* Split & Merge Quick Action Buttons */}
            {(onSplit || (onMerge && canMerge)) && (
              <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                {onSplit && (
                  <button
                    type="button"
                    className="inspector-btn inspector-btn-secondary"
                    style={{ flex: 1, fontSize: "11px" }}
                    onClick={onSplit}
                  >
                    ✂️ ตัดแบ่ง (Split Segment)
                  </button>
                )}
                {onMerge && canMerge && (
                  <button
                    type="button"
                    className="inspector-btn inspector-btn-gold"
                    style={{ flex: 1, fontSize: "11px" }}
                    onClick={onMerge}
                  >
                    🔗 รวมคลิปก่อนหน้า (Merge)
                  </button>
                )}
              </div>
            )}
          </div>
        </details>
      </div>

      {/* 3. Editorial & Speaker Dialogue Card */}
      <div className="inspector-card accent-gold">
        <details open>
          <summary style={{ color: "#E5A93C" }}>✍️ Editorial, Speaker &amp; Dialogue</summary>
          <div className="inspector-card-body">
            <div className="inspector-field">
              <label className="inspector-label">
                ชื่อผู้พูด / วิทยากร (Speaker Name Badge)
                <input
                  aria-label="Speaker Name"
                  className="inspector-input"
                  value={speaker}
                  onChange={(event) => onParams({ speaker: event.target.value })}
                  placeholder="เช่น ผศ.ดร. นพ.วิโรจน์ หรือ อาจารย์ประจำภาควิชา"
                />
              </label>
              <small style={{ color: "#94A3B8", fontSize: "11px" }}>
                ป้ายชื่อหรูหราจะแสดงด้านบนซับไตเติลคาราโอเกะใน Remotion Studio อัตโนมัติ
              </small>
            </div>

            <div className="inspector-field">
              <label className="inspector-label">
                บทพูด / คำบรรยาย (Dialogue / Subtitles)
                <textarea
                  className="inspector-textarea"
                  value={dialogue}
                  onChange={(event) => onParams({ dialogue: event.target.value })}
                  placeholder="บทพูดหรือคำบรรยายของช่วงเวลานี้ สำหรับ Dynamic Thai Subtitles"
                  rows={3}
                />
              </label>
            </div>
          </div>
        </details>
      </div>

      {/* 4. 🎧 J-Cut / L-Cut Split Edit & Audio Transitions Card */}
      <div className="inspector-card accent-cyan">
        <details open>
          <summary style={{ color: "#22D3EE" }}>🎧 Split Edit &amp; Audio Transitions (J-Cut / L-Cut)</summary>
          <div className="inspector-card-body">
            <div className="inspector-grid-2">
              <div className="inspector-field">
                <label className="inspector-label">
                  J-Cut: เสียงนำภาพ ({formatSeconds(jCutMs)} s)
                  <input
                    type="range"
                    className="inspector-input"
                    min="0"
                    max="2000"
                    step="40"
                    value={jCutMs}
                    onChange={(e) => onParams({ jCutMs: Number(e.target.value) })}
                  />
                </label>
                <small style={{ color: "#94A3B8", fontSize: "10px" }}>
                  เสียงพูดเริ่มก่อนภาพปรากฏ (Audio Lead-in)
                </small>
              </div>

              <div className="inspector-field">
                <label className="inspector-label">
                  L-Cut: เสียงตามภาพ ({formatSeconds(lCutMs)} s)
                  <input
                    type="range"
                    className="inspector-input"
                    min="0"
                    max="2000"
                    step="40"
                    value={lCutMs}
                    onChange={(e) => onParams({ lCutMs: Number(e.target.value) })}
                  />
                </label>
                <small style={{ color: "#94A3B8", fontSize: "10px" }}>
                  เสียงพูดยังเล่นต่อหลังภาพตัด (Audio Hang-over)
                </small>
              </div>
            </div>

            <div className="inspector-field" style={{ marginTop: "8px" }}>
              <label className="inspector-label">
                Audio Crossfade Click-Prevention ({audioFadeMs} ms)
                <input
                  type="range"
                  className="inspector-input"
                  min="0"
                  max="400"
                  step="20"
                  value={audioFadeMs}
                  onChange={(e) => onParams({ audioFadeMs: Number(e.target.value) })}
                />
              </label>
              <small style={{ color: "#64748B", fontSize: "10px" }}>
                ป้องกันเสียงเปรี๊ยะ/คลิกที่จุดตัดเฟรม
              </small>
            </div>

            {/* Split Edit Visual Diagram */}
            {(jCutMs > 0 || lCutMs > 0) && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "10px",
                  background: "rgba(15, 23, 42, 0.8)",
                  borderRadius: "8px",
                  border: "1px solid rgba(34, 211, 238, 0.3)",
                  fontSize: "11px",
                  color: "#E2E8F0"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ color: "#60A5FA", fontWeight: 700, width: "40px" }}>VIDEO:</span>
                  <div style={{ flex: 1, height: "14px", background: "#3B82F6", borderRadius: "4px", textAlign: "center", lineHeight: "14px", fontSize: "9px", color: "#FFF" }}>
                    Visual Frame ({formatSeconds(item.durationMs)}s)
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ color: "#22D3EE", fontWeight: 700, width: "40px" }}>AUDIO:</span>
                  <div
                    style={{
                      flex: 1,
                      height: "14px",
                      background: "linear-gradient(90deg, #F59E0B 0%, #22D3EE 15%, #22D3EE 85%, #EC4899 100%)",
                      borderRadius: "4px",
                      textAlign: "center",
                      lineHeight: "14px",
                      fontSize: "9px",
                      color: "#0F172A",
                      fontWeight: 700
                    }}
                  >
                    {jCutMs > 0 ? `J-Cut -${formatSeconds(jCutMs)}s | ` : ""}
                    Audio Stream
                    {lCutMs > 0 ? ` | L-Cut +${formatSeconds(lCutMs)}s` : ""}
                  </div>
                </div>
              </div>
            )}
          </div>
        </details>
      </div>

      {/* 5. PiP Controls (for a-roll-pip-v1) */}
      {isPip && (
        <div className="inspector-card accent-slate">
          <details open>
            <summary style={{ color: "#CBD5E1" }}>🖼️ Picture-in-Picture (PiP Layout)</summary>
            <div className="inspector-card-body">
              <div className="inspector-grid-2">
                <div className="inspector-field">
                  <label className="inspector-label">
                    ตำแหน่ง PiP (Position)
                    <select
                      className="inspector-select"
                      value={pipPosition}
                      onChange={(e) => onParams({ pipPosition: e.target.value })}
                    >
                      <option value="bottom-right">ล่างขวา (Bottom Right)</option>
                      <option value="bottom-left">ล่างซ้าย (Bottom Left)</option>
                      <option value="top-right">บนขวา (Top Right)</option>
                      <option value="top-left">บนซ้าย (Top Left)</option>
                    </select>
                  </label>
                </div>
                <div className="inspector-field">
                  <label className="inspector-label">
                    รูปทรงกรอบ (Shape)
                    <select
                      className="inspector-select"
                      value={pipShape}
                      onChange={(e) => onParams({ pipShape: e.target.value })}
                    >
                      <option value="circle">วงกลม (Circle Avatar)</option>
                      <option value="rounded-rect">สี่เหลี่ยมมน (Rounded Rect)</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="inspector-field" style={{ marginTop: "8px" }}>
                <label className="inspector-label">
                  ขนาด PiP Scale ({Math.round(pipScale * 100)}%)
                  <input
                    type="range"
                    className="inspector-input"
                    min="0.15"
                    max="0.5"
                    step="0.01"
                    value={pipScale}
                    onChange={(e) => onParams({ pipScale: Number(e.target.value) })}
                  />
                </label>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* 6. B-Roll Overlays Card with Sequential Cascade & Auto-Chain */}
      <div className="inspector-card accent-blue">
        <details open>
          <summary style={{ color: "#60A5FA" }}>
            <span>🎬</span> <strong>B-roll overlays</strong> <small style={{ color: "#94A3B8" }}>({broll.length} layers)</small>
          </summary>
          <div className="inspector-card-body">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "#94A3B8" }}>ภาพ/คลิปแทรกซ้อนทับบทพูด</span>
              <div style={{ display: "flex", gap: "6px" }}>
                {broll.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="inspector-btn inspector-btn-secondary inspector-btn-sm"
                      title="จัดเรียงให้ B-roll ทุกตัวเล่นต่อกันอัตโนมัติ ไม่ทับซ้อนกัน"
                      onClick={handleAutoChainBroll}
                    >
                      ⚡ เรียงต่อกัน (Chain)
                    </button>
                    <button
                      type="button"
                      className="inspector-btn inspector-btn-secondary inspector-btn-sm"
                      title="แบ่งความยาว B-roll ทุกตัวให้เท่าๆ กันตลอดช่วงเวลา A-roll"
                      onClick={handleDistributeEvenly}
                    >
                      ⚖️ กระจายเวลาเท่ากัน
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="inspector-btn inspector-btn-primary inspector-btn-sm"
                  onClick={handleAddBroll}
                >
                  ＋ Add B-roll under A-roll
                </button>
              </div>
            </div>

            {/* Visual B-Roll Timeline Map Strip */}
            {broll.length > 0 && (
              <div style={{ marginTop: "10px", marginBottom: "8px", padding: "8px", background: "#0F172A", borderRadius: "8px", border: "1px solid #334155" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#94A3B8", marginBottom: "4px" }}>
                  <span>0.0s (A-roll In)</span>
                  <span>Timeline Coverage ({formatSeconds(item.durationMs)}s)</span>
                  <span>{formatSeconds(item.durationMs)}s (A-roll Out)</span>
                </div>
                <div style={{ position: "relative", width: "100%", height: "20px", background: "#1E293B", borderRadius: "4px", overflow: "hidden" }}>
                  {broll.map((b, idx) => {
                    const leftPercent = item.durationMs > 0 ? (b.offsetMs / item.durationMs) * 100 : 0;
                    const widthPercent = item.durationMs > 0 ? (b.durationMs / item.durationMs) * 100 : 0;
                    const color = brollColors[idx % brollColors.length];
                    const isSelected = selectedBrollId === b.id;

                    return (
                      <div
                        key={b.id}
                        title={`#${idx + 1} (${b.id}): ${formatSeconds(b.offsetMs)}s - ${formatSeconds(b.offsetMs + b.durationMs)}s`}
                        style={{
                          position: "absolute",
                          left: `${Math.max(0, Math.min(100, leftPercent))}%`,
                          width: `${Math.max(2, Math.min(100 - leftPercent, widthPercent))}%`,
                          height: "100%",
                          background: color,
                          border: isSelected ? "2px solid #FFFFFF" : "1px solid rgba(0,0,0,0.3)",
                          borderRadius: "2px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "9px",
                          fontWeight: 700,
                          color: "#FFF",
                          cursor: "pointer",
                          zIndex: isSelected ? 10 : 1,
                          overflow: "hidden",
                          whiteSpace: "nowrap"
                        }}
                        onClick={() => onSelectBroll?.(b.id)}
                      >
                        #{idx + 1} ({formatSeconds(b.durationMs)}s)
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {broll.map((value, index) => (
              <div
                key={value.id}
                className="inspector-broll-item"
                style={{
                  borderColor: selectedBrollId === value.id ? "#3B82F6" : "#334155"
                }}
                onClick={() => onSelectBroll?.(value.id)}
              >
                <div className="inspector-broll-header">
                  <span style={{ color: brollColors[index % brollColors.length], fontWeight: 700, fontSize: "12px" }}>
                    #{index + 1} ({value.id}) · {formatSeconds(value.offsetMs)}s - {formatSeconds(value.offsetMs + value.durationMs)}s
                  </span>
                  <button
                    type="button"
                    className="inspector-btn inspector-btn-secondary inspector-btn-sm"
                    aria-label={`Remove ${value.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onItem({
                        ...item,
                        broll: broll.filter((_, itemIndex) => itemIndex !== index)
                      });
                    }}
                  >
                    × ลบ
                  </button>
                </div>

                <PathField
                  compact
                  label="B-roll path"
                  value={value.asset.path}
                  filter=".mov,.mp4,.mxf,.avi,.mkv,.png,.jpg,.jpeg"
                  onChange={(mediaPath) =>
                    updateBroll(index, { asset: { ...value.asset, path: mediaPath } })
                  }
                />

                <div className="inspector-grid-2">
                  <SecondsField
                    compact
                    label="B-roll offset"
                    valueMs={value.offsetMs}
                    minMs={0}
                    onChange={(offsetMs) => updateBroll(index, { offsetMs })}
                  />
                  <SecondsField
                    compact
                    label="B-roll duration"
                    valueMs={value.durationMs}
                    minMs={40}
                    onChange={(durationMs) => updateBroll(index, { durationMs })}
                  />
                </div>

                <div className="inspector-grid-2" style={{ marginTop: "6px" }}>
                  <div className="inspector-field">
                    <label className="inspector-label" style={{ fontSize: "11px" }}>
                      Motion Transition
                      <select
                        className="inspector-select"
                        style={{ fontSize: "11px", padding: "4px 8px" }}
                        value={(value as any).preset ?? "Pop"}
                        onChange={(e) => updateBroll(index, { preset: e.target.value } as any)}
                      >
                        <option value="Pop">Pop (Punch In)</option>
                        <option value="Spring">Spring (Smooth Damped)</option>
                        <option value="ZoomPunch">ZoomPunch</option>
                        <option value="Bounce">Bounce</option>
                      </select>
                    </label>
                  </div>
                  <div className="inspector-field">
                    <label className="inspector-label" style={{ fontSize: "11px" }}>
                      Media Fit
                      <select
                        className="inspector-select"
                        style={{ fontSize: "11px", padding: "4px 8px" }}
                        value={value.fit ?? "cover"}
                        onChange={(e) => updateBroll(index, { fit: e.target.value as "cover" | "contain" })}
                      >
                        <option value="cover">Cover (เต็มจอ)</option>
                        <option value="contain">Contain (คงสัดส่วน)</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
