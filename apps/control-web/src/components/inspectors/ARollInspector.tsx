import { useState } from "react";
import type { StoryboardItem } from "../../storyboard-types";
import { autoBrollStoryboardItem } from "../../storyboard-api";
import { PathField, SecondsField, formatSeconds, formatTimecode } from "./CommonFields";
import "./inspectors.css";

export const aRollPresetOptions = [
  { value: "a-roll-segment-v1", label: "🎤 Standard Interview / Talking Head · v1" },
  { value: "a-roll-voiceover-v1", label: "🎙️ Voiceover & Full B-roll · v1" },
  { value: "a-roll-pip-v1", label: "🖼️ Picture-in-Picture Presentation · v1" }
];

export const lowerThirdPresetOptions = [
  { value: "lowerthird-glass-beacon-v1", label: "🏆 PSU Royal Gold Glass Beacon · v1 (Signature)" },
  { value: "lowerthird-kinetic-ribbon-v1", label: "🎗️ Editorial Kinetic Ribbon · v1 (Cyan/Gold)" },
  { value: "lowerthird-tech-hud-v1", label: "⚡ Cyber / Modern Tech HUD · v1 (Neon Grid)" },
  { value: "lowerthird-glass-gold-v1", label: "✨ PSU Royal Gold Glass · Classic" },
  { value: "lowerthird-gradient-ribbon-v1", label: "🎀 Cyan & Gold Gradient · Classic" },
  { value: "lowerthird-minimal-navy-v1", label: "🟦 Modern Clean Navy Bar · Legacy" }
];

export interface ARollInspectorProps {
  item: StoryboardItem;
  storyboardId?: string;
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
  storyboardId,
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
  const enableSubtitles = Boolean((item.params as any)?.enableSubtitles ?? false);

  // Lower Third Parameters
  const lowerThird = (item.params as any)?.lowerThird ?? {};
  const enableLowerThird = Boolean(lowerThird.enabled ?? (item.params as any)?.enableLowerThird ?? false);
  const ltPresetId = String(lowerThird.presetId ?? (item.params as any)?.lowerThirdPresetId ?? "lowerthird-glass-beacon-v1");
  const ltName = String(lowerThird.name ?? (item.params as any)?.lowerThirdName ?? speaker ?? "");
  const ltTitle = String(lowerThird.title ?? (item.params as any)?.lowerThirdTitle ?? "");
  const ltDepartment = String(lowerThird.department ?? (item.params as any)?.lowerThirdDepartment ?? "");
  const ltOffsetMs = Number(lowerThird.offsetMs ?? (item.params as any)?.lowerThirdOffsetMs ?? 500);
  const ltDurationMs = Number(lowerThird.durationMs ?? (item.params as any)?.lowerThirdDurationMs ?? 4000);

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
      preset: "none"
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

  const [isAutoBrolling, setIsAutoBrolling] = useState(false);
  const [detectedTags, setDetectedTags] = useState<string[]>([]);
  const [autoRationale, setAutoRationale] = useState<string>("");

  const handleAutoBroll = async () => {
    setIsAutoBrolling(true);
    try {
      // 1. Attempt server-side local LLM + candidate pool matching with board-aware cooldown and CSRF protection
      const targetSbId = storyboardId || "current";
      const data = await autoBrollStoryboardItem(targetSbId, item.id, {
        item,
        dialogue: item.params.dialogue
      }).catch(() => null);

      if (data && data.broll && Array.isArray(data.broll) && data.broll.length > 0) {
        onItem({ ...item, broll: data.broll });
        setDetectedTags([...(data.tags?.tags_th ?? []), ...(data.tags?.tags_en ?? [])]);
        setAutoRationale(data.rationale ?? "");
        if (data.broll[0]) onSelectBroll?.(data.broll[0].id);
        return;
      }

      // 2. Resilient Broadcast Duration Pacing fallback (pure client math)
      const dur = item.durationMs;
      if (dur < 8000) {
        setAutoRationale("A-roll สั้นเกินไป (< 8 วิ) ผู้ชมต้องเห็นหน้าผู้พูด ไม่แนะนำให้ตัดภาพ B-roll แทรก");
        return;
      }

      const HEAD_MS = 2520;
      const TAIL_MS = 1520;
      const avail = dur - HEAD_MS - TAIL_MS;
      if (avail < 2000) {
        setAutoRationale("ช่วงเวลาว่างสำหรับแทรก B-roll สั้นเกินไป");
        return;
      }

      const count = dur < 18000 ? 1 : dur < 35000 ? 2 : dur < 60000 ? 3 : Math.min(5, Math.floor(dur / 15000));
      const targetDur = Math.max(2000, Math.min(4500, Math.floor(avail / count)));
      const gap = count > 1 ? Math.max(0, (avail - count * targetDur) / (count - 1)) : 0;

      const samplePool = [
        "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ /Ins/C7736.MP4",
        "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ /Ins/C7742.MP4",
        "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ /Ins/C7740.MP4",
        "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ /Ins/C7748.MP4",
        "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ /Ins/C7731.MP4"
      ];

      const newBrolls = Array.from({ length: count }).map((_, idx) => ({
        id: uniqueId(`${item.id}_broll`, []),
        asset: { path: samplePool[idx % samplePool.length] ?? "" },
        offsetMs: Math.round((HEAD_MS + idx * (targetDur + gap)) / 40) * 40,
        durationMs: Math.round(targetDur / 40) * 40,
        audioPolicy: "mute" as const,
        fit: "cover" as const,
        preset: "none"
      }));

      onItem({ ...item, broll: newBrolls });
      setAutoRationale(`จัด B-roll อัตโนมัติ ${count} คัต ตามจังหวะเวลา ${Math.round(dur / 1000)}s (เว้นช่วงเปิดหน้า 2.5s / ท้าย 1.5s)`);
      if (newBrolls[0]) onSelectBroll?.(newBrolls[0].id);
    } finally {
      setIsAutoBrolling(false);
    }
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

  const updateLowerThird = (patch: Record<string, unknown>) => {
    const nextLt = {
      ...lowerThird,
      enabled: enableLowerThird,
      presetId: ltPresetId,
      name: ltName,
      title: ltTitle,
      department: ltDepartment,
      offsetMs: ltOffsetMs,
      durationMs: ltDurationMs,
      ...patch
    };
    onParams({
      lowerThird: nextLt,
      enableLowerThird: nextLt.enabled,
      lowerThirdPresetId: nextLt.presetId,
      lowerThirdName: nextLt.name,
      lowerThirdTitle: nextLt.title,
      lowerThirdDepartment: nextLt.department,
      lowerThirdOffsetMs: nextLt.offsetMs,
      lowerThirdDurationMs: nextLt.durationMs
    });
  };

  // Pre-calculate B-Roll colors for visual timeline
  const brollColors = ["#3B82F6", "#E5A93C", "#10B981", "#EC4899", "#8B5CF6", "#F59E0B"];

  return (
    <div className="inspector-container">
      {/* 1. Preset Selector Card */}
      <div className="inspector-card accent-amber">
        <details open>
          <summary style={{ color: "#FBBF24" }}>
            <span className="tva-lamp" />
            <span className="tva-telemetry-title">A-ROLL PRESET // โหมดการนำเสนอ</span>
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
                  {aRollPresetOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <small style={{ color: "#94A3B8", fontSize: "11px" }}>
                UI ปรับแต่ง Form Fields และพารามิเตอร์ตามโหมดการเล่าเรื่องของ A-Roll
              </small>
            </div>
          </div>
        </details>
      </div>

      {/* 2. Source Media & Range Card */}
      <div className="inspector-card accent-slate">
        <details open>
          <summary style={{ color: "#CBD5E1" }}>
            <span className="tva-lamp" />
            <span className="tva-telemetry-title">
              {isVoiceover ? "VOICEOVER // แทร็กเสียงบรรยาย" : "PRIMARY FOOTAGE // วิดีโอหลัก (A-Roll)"}
            </span>
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

      {/* 3. Lower Third Card */}
      <div className="inspector-card accent-amber">
        <details open>
          <summary style={{ color: "#FBBF24", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="tva-lamp" />
              <span className="tva-telemetry-title">LOWER THIRD // ป้ายชื่อ &amp; ตำแหน่ง</span>
            </div>
            <span style={{ fontSize: "11px", color: enableLowerThird ? "#10B981" : "#94A3B8", fontWeight: 600 }}>
              {enableLowerThird ? "● Lower Third ON" : "○ Lower Third OFF (Default)"}
            </span>
          </summary>
          <div className="inspector-card-body">
            {/* Lower Third Master Toggle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "#161F30",
                borderRadius: "6px",
                border: "1px solid #2A364F",
                marginBottom: "10px"
              }}
            >
              <div>
                <strong style={{ fontSize: "12px", color: "#F8FAFC", display: "block" }}>
                  แสดง Lower Third บนวิดีโอ (Overlay)
                </strong>
                <small style={{ fontSize: "10px", color: "#94A3B8" }}>
                  กราฟิกป้ายชื่อสำหรับเปิดตัววิทยากร / ผู้ให้สัมภาษณ์
                </small>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "12px", color: enableLowerThird ? "#10B981" : "#94A3B8" }}>
                <input
                  type="checkbox"
                  checked={enableLowerThird}
                  onChange={(e) => updateLowerThird({ enabled: e.target.checked })}
                />
                <strong>{enableLowerThird ? "เปิด (ON)" : "ปิด (OFF)"}</strong>
              </label>
            </div>

            {enableLowerThird && (
              <>
                <div className="inspector-field">
                  <label className="inspector-label">
                    Preset สไตล์กราฟิก (Design Preset)
                    <select
                      className="inspector-select"
                      value={ltPresetId}
                      onChange={(e) => updateLowerThird({ presetId: e.target.value })}
                    >
                      {lowerThirdPresetOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="inspector-field">
                  <label className="inspector-label">
                    ชื่อ-สกุล (Name)
                    <input
                      className="inspector-input"
                      value={ltName}
                      onChange={(e) => updateLowerThird({ name: e.target.value })}
                      placeholder="เช่น ผศ.ดร. นิวัติ แก้วประดับ"
                    />
                  </label>
                </div>

                <div className="inspector-grid-2">
                  <div className="inspector-field">
                    <label className="inspector-label">
                      ตำแหน่งทางวิชาการ / หน้าที่ (Title)
                      <input
                        className="inspector-input"
                        value={ltTitle}
                        onChange={(e) => updateLowerThird({ title: e.target.value })}
                        placeholder="เช่น อธิการบดี"
                      />
                    </label>
                  </div>
                  <div className="inspector-field">
                    <label className="inspector-label">
                      สังกัด / หน่วยงาน (Department)
                      <input
                        className="inspector-input"
                        value={ltDepartment}
                        onChange={(e) => updateLowerThird({ department: e.target.value })}
                        placeholder="เช่น มหาวิทยาลัยสงขลานครินทร์"
                      />
                    </label>
                  </div>
                </div>

                <div className="inspector-grid-2" style={{ marginTop: "4px" }}>
                  <SecondsField
                    compact
                    label="เริ่มแสดงที่ (Offset)"
                    valueMs={ltOffsetMs}
                    minMs={0}
                    onChange={(offsetMs) => updateLowerThird({ offsetMs })}
                  />
                  <SecondsField
                    compact
                    label="แสดงนาน (Duration)"
                    valueMs={ltDurationMs}
                    minMs={1000}
                    onChange={(durationMs) => updateLowerThird({ durationMs })}
                  />
                </div>

                {/* Live Mini Preview of Lower Third */}
                <div style={{ marginTop: "10px" }}>
                  <div style={{ fontSize: "11px", color: "#94A3B8", marginBottom: "4px", fontWeight: 600 }}>
                    Live Design Preview:
                  </div>

                  {/* Preset 1: PSU Royal Gold Glass Beacon */}
                  {(ltPresetId === "lowerthird-glass-beacon-v1" || ltPresetId === "lowerthird-glass-gold-v1") && (
                    <div
                      style={{
                        padding: "12px 16px",
                        background: "rgba(11, 18, 32, 0.95)",
                        border: "1.5px solid rgba(229, 169, 60, 0.45)",
                        borderRadius: "0 12px 12px 0",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.6)"
                      }}
                    >
                      <div
                        style={{
                          width: "4px",
                          height: "36px",
                          background: "linear-gradient(180deg, #F59E0B, #E5A93C)",
                          borderRadius: "2px",
                          boxShadow: "0 0 8px #F59E0B"
                        }}
                      />
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 800, color: "#FFFFFF", letterSpacing: "0.02em" }}>
                          {ltName || "ชื่อวิทยากร / ผู้บรรยาย"}
                        </div>
                        <div style={{ fontSize: "11px", color: "#E5A93C", fontWeight: 600, marginTop: "2px" }}>
                          {ltTitle || "ตำแหน่งทางวิชาการ"} {ltDepartment ? <span style={{ color: "#94A3B8" }}>· {ltDepartment}</span> : ""}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Preset 2: Editorial Kinetic Ribbon */}
                  {(ltPresetId === "lowerthird-kinetic-ribbon-v1" || ltPresetId === "lowerthird-gradient-ribbon-v1") && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <div
                        style={{
                          padding: "6px 14px",
                          background: "#00E5FF",
                          transform: "skewX(-10deg)",
                          display: "inline-block"
                        }}
                      >
                        <div style={{ transform: "skewX(10deg)" }}>
                          <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1px", color: "#000" }}>
                            ◆ PSU BROADCAST OFFICIAL
                          </div>
                          <div style={{ fontSize: "13px", fontWeight: 800, color: "#000" }}>
                            {ltName || "ชื่อวิทยากร / ผู้บรรยาย"}
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          padding: "4px 12px",
                          background: "rgba(15, 23, 42, 0.95)",
                          borderLeft: "3px solid #E5A93C",
                          transform: "skewX(-10deg)",
                          display: "inline-block"
                        }}
                      >
                        <div style={{ transform: "skewX(10deg)", fontSize: "11px", color: "#FFFFFF", fontWeight: 600 }}>
                          {ltTitle || "ตำแหน่งทางวิชาการ"} {ltDepartment ? <span style={{ color: "#00E5FF" }}>· {ltDepartment}</span> : ""}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Preset 3: Cyber / Modern Tech HUD */}
                  {ltPresetId === "lowerthird-tech-hud-v1" && (
                    <div
                      style={{
                        padding: "10px 14px",
                        background: "rgba(9, 14, 26, 0.94)",
                        border: "1px solid rgba(0, 229, 255, 0.6)",
                        borderRadius: "4px",
                        boxShadow: "0 0 14px rgba(0, 229, 255, 0.35)",
                        position: "relative"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", fontFamily: "monospace", color: "#00E5FF", marginBottom: "3px" }}>
                        <span>● SYS://NODE.LIVE</span>
                        <span style={{ color: "#E5A93C" }}>// PSU.AV.01</span>
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 800, color: "#FFFFFF", lineHeight: 1.2 }}>
                        {ltName || "ชื่อวิทยากร / ผู้บรรยาย"}
                      </div>
                      <div style={{ fontSize: "11px", color: "#E5A93C", fontWeight: 600, marginTop: "2px" }}>
                        {ltTitle || "ตำแหน่งทางวิชาการ"} {ltDepartment ? <span style={{ color: "#94A3B8" }}>[ {ltDepartment} ]</span> : ""}
                      </div>
                    </div>
                  )}

                  {/* Preset 4: Minimal Navy Bar */}
                  {ltPresetId === "lowerthird-minimal-navy-v1" && (
                    <div
                      style={{
                        padding: "10px 14px",
                        background: "rgba(11, 18, 32, 0.95)",
                        borderLeft: "5px solid #00E5FF",
                        borderRadius: "0 8px 8px 0",
                        boxShadow: "0 8px 20px rgba(0,0,0,0.5)"
                      }}
                    >
                      <div style={{ fontSize: "13px", fontWeight: 800, color: "#FFFFFF", lineHeight: 1.2 }}>
                        {ltName || "ชื่อวิทยากร / ผู้บรรยาย"}
                      </div>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "#00E5FF", marginTop: "2px" }}>
                        {ltTitle || "ตำแหน่งทางวิชาการ"} {ltDepartment ? `· ${ltDepartment}` : ""}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </details>
      </div>

      {/* 4. Editorial & Speaker Dialogue Card */}
      <div className="inspector-card accent-amber">
        <details>
          <summary style={{ color: "#FBBF24", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="tva-lamp" />
              <span className="tva-telemetry-title">EDITORIAL &amp; DIALOGUE // บทพูด &amp; คำบรรยาย</span>
            </div>
            <span style={{ fontSize: "10px", color: enableSubtitles ? "#10B981" : "#94A3B8", fontWeight: 700 }}>
              {enableSubtitles ? "[●] SUBTITLES ON" : "[○] OFF"}
            </span>
          </summary>
          <div className="inspector-card-body">
            {/* On-screen Text Master Toggle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "#161F30",
                borderRadius: "6px",
                border: "1px solid #2A364F",
                marginBottom: "10px"
              }}
            >
              <div>
                <strong style={{ fontSize: "12px", color: "#F8FAFC", display: "block" }}>
                  แสดงซับไตเติล / ป้ายชื่อบนวิดีโอ (On-screen Text)
                </strong>
                <small style={{ fontSize: "10px", color: "#94A3B8" }}>
                  เมื่อปิด (OFF) วิดีโอจะเล่นเฉพาะภาพและเสียงคลีนๆ โดยไม่มีข้อความซ้อนทับ
                </small>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "12px", color: enableSubtitles ? "#10B981" : "#94A3B8" }}>
                <input
                  type="checkbox"
                  checked={enableSubtitles}
                  onChange={(e) => onParams({ enableSubtitles: e.target.checked })}
                />
                <strong>{enableSubtitles ? "เปิด (ON)" : "ปิด (OFF)"}</strong>
              </label>
            </div>

            <div className="inspector-field">
              <label className="inspector-label">
                ชื่อผู้พูด / วิทยากร (Speaker Name)
                <input
                  aria-label="Speaker Name"
                  className="inspector-input"
                  value={speaker}
                  onChange={(event) => {
                    const nextSpeaker = event.target.value;
                    onParams({
                      speaker: nextSpeaker,
                      lowerThird: {
                        ...lowerThird,
                        name: nextSpeaker
                      }
                    });
                  }}
                  placeholder="เช่น ผศ.ดร. นพ.วิโรจน์ หรือ อาจารย์ประจำภาควิชา"
                />
              </label>
              <small style={{ color: "#94A3B8", fontSize: "11px" }}>
                ซิงค์กับป้าย Lower-Third อัตโนมัติ
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

      {/* 5. J-Cut / L-Cut Split Edit & Audio Transitions Card */}
      <div className="inspector-card accent-amber">
        <details open={jCutMs > 0 || lCutMs > 0}>
          <summary style={{ color: "#FBBF24" }}>
            <span className="tva-lamp" />
            <span className="tva-telemetry-title">SPLIT EDIT // ตัดต่อเสียงล่วงหน้า (J/L Cut)</span>
            {(jCutMs > 0 || lCutMs > 0) && (
              <span className="tva-badge" style={{ marginLeft: "auto" }}>
                ACTIVE (J:{formatSeconds(jCutMs)}s / L:{formatSeconds(lCutMs)}s)
              </span>
            )}
          </summary>
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
                    style={{ accentColor: "#F59E0B" }}
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
                    style={{ accentColor: "#F59E0B" }}
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
                  style={{ accentColor: "#F59E0B" }}
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
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  fontSize: "11px",
                  color: "#E2E8F0"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ color: "#FBBF24", fontWeight: 700, width: "40px" }}>VIDEO:</span>
                  <div style={{ flex: 1, height: "14px", background: "#3B82F6", borderRadius: "4px", textAlign: "center", lineHeight: "14px", fontSize: "9px", color: "#FFF" }}>
                    Visual Frame ({formatSeconds(item.durationMs)}s)
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ color: "#F59E0B", fontWeight: 700, width: "40px" }}>AUDIO:</span>
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

      {/* 6. PiP Controls */}
      {isPip && (
        <div className="inspector-card accent-slate">
          <details open>
            <summary style={{ color: "#CBD5E1" }}>
              <span className="tva-lamp" />
              <span className="tva-telemetry-title">PIP LAYOUT // ภาพซ้อนภาพ</span>
            </summary>
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
                    style={{ accentColor: "#F59E0B" }}
                  />
                </label>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* 7. B-Roll Overlays Card with Sequential Cascade & Auto-Chain */}
      <div className="inspector-card accent-slate">
        <details open>
          <summary style={{ color: "#CBD5E1" }}>
            <span className="tva-lamp" />
            <span className="tva-telemetry-title"><strong>B-roll overlays</strong> // สื่อแทรก ({broll.length} layers)</span>
          </summary>
          <div className="inspector-card-body">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "#94A3B8" }}>ภาพ/คลิปแทรกซ้อนทับบทพูด</span>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="inspector-btn inspector-btn-secondary inspector-btn-sm"
                  style={{ background: "#1E1B4B", borderColor: "#6366F1", color: "#A5B4FC", fontWeight: 600 }}
                  title="คำนวณจำนวนและตำแหน่ง B-roll อัตโนมัติตามจังหวะเวลา A-roll และบริบทเสียง"
                  disabled={isAutoBrolling}
                  onClick={handleAutoBroll}
                >
                  {isAutoBrolling ? "⏳ กำลังวิเคราะห์..." : "✨ Auto B-roll (AI Pacing)"}
                </button>
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

            {/* AI Detected Tags & Cadence Rationale */}
            {(detectedTags.length > 0 || autoRationale) && (
              <div style={{ marginTop: "8px", padding: "6px 10px", background: "#131C31", borderRadius: "6px", border: "1px solid #1E293B" }}>
                {detectedTags.length > 0 && (
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "4px" }}>
                    <span style={{ fontSize: "10px", color: "#818CF8", fontWeight: "bold" }}>Tags:</span>
                    {detectedTags.map((tag) => (
                      <span key={tag} style={{ fontSize: "10px", padding: "1px 6px", background: "#1E1B4B", color: "#C7D2FE", borderRadius: "4px", border: "1px solid #3730A3" }}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
                {autoRationale && (
                  <div style={{ fontSize: "11px", color: "#38BDF8" }}>
                    ℹ️ {autoRationale}
                  </div>
                )}
              </div>
            )}

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

                {((value as any).treatment === "ken_burns_pending" || /\.(jpe?g|png|webp)$/i.test(value.asset.path)) && (
                  <div style={{ fontSize: "10px", color: "#FBBF24", background: "#451A03", padding: "3px 8px", borderRadius: "4px", marginBottom: "6px", border: "1px solid #78350F" }}>
                    🖼️ ภาพนิ่ง (Pin: รอ Motion Engine — Ken Burns / 2.5D Parallax)
                  </div>
                )}

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
                        value={(value as any).preset ?? "none"}
                        onChange={(e) => updateBroll(index, { preset: e.target.value } as any)}
                      >
                        <option value="none">Cut (ตัดตรง / No Animation - ค่าเริ่มต้น)</option>
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
