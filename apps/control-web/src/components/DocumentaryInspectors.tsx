import { useState, useEffect } from "react";
import type { JsonValue } from "../graph-types";
import { previewDocx, type DocxPreviewResult } from "../api";
import { RemoteFilePickerModal } from "./RemoteFilePickerModal";

export interface DocumentaryInspectorProps {
  nodeType: string;
  config: Record<string, JsonValue>;
  onChange: (key: string, value: JsonValue) => void;
}

export function DocumentaryInspector({ nodeType, config, onChange }: DocumentaryInspectorProps) {
  const [pickerState, setPickerState] = useState<{
    open: boolean;
    configKey: string;
    mode: "file" | "folder";
    filter?: string;
    title?: string;
    initialPath?: string;
  }>({
    open: false,
    configKey: "path",
    mode: "file"
  });

  const [docxPreview, setDocxPreview] = useState<DocxPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [showSegments, setShowSegments] = useState<boolean>(false);

  const docxPath = String(config.path ?? "").trim();

  useEffect(() => {
    if (nodeType === "storyboard.docx_import" && docxPath) {
      let active = true;
      setPreviewLoading(true);
      previewDocx(docxPath)
        .then((result) => {
          if (active) {
            setDocxPreview(result);
            setPreviewLoading(false);
          }
        })
        .catch((err) => {
          if (active) {
            setDocxPreview({
              ok: false,
              path: docxPath,
              error: err?.message || "ไม่สามารถเชื่อมต่อเพื่อตรวจสอบไฟล์ได้",
              segmentCount: 0,
              cardCount: 0,
              totalDialogueMs: 0,
              totalDialogueFormatted: "00:00",
              segments: [],
              cards: []
            });
            setPreviewLoading(false);
          }
        });
      return () => {
        active = false;
      };
    } else {
      setDocxPreview(null);
    }
  }, [nodeType, docxPath]);

  const openPicker = (
    configKey: string,
    mode: "file" | "folder",
    filter?: string,
    title?: string
  ) => {
    setPickerState({
      open: true,
      configKey,
      mode,
      filter,
      title,
      initialPath: String(config[configKey] ?? "")
    });
  };

  const handlePickerSelect = (selectedPath: string) => {
    onChange(pickerState.configKey, selectedPath);
  };

  if (nodeType === "storyboard.docx_import") {
    return (
      <div className="custom-inspector-section" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div className="inspector-field">
          <label htmlFor="docx-path" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>ไฟล์สตอรี่บอร์ด DOCX (Path)</span>
            <span style={{ fontSize: "11px", color: "#38bdf8", fontWeight: 500 }}>
              {previewLoading ? "⏳ กำลังตรวจ..." : docxPreview?.ok ? "🟢 พร้อมประมวลผล" : docxPath ? "🔴 ไม่พบไฟล์" : "⚪ ยังไม่ได้เลือก"}
            </span>
          </label>
          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <input
              id="docx-path"
              type="text"
              value={String(config.path ?? "")}
              onChange={(e) => onChange("path", e.target.value)}
              placeholder="/Volumes/ภาควีดีทัศน์/.../SB-เกวลิน.docx"
              style={{
                flex: 1,
                padding: "8px 10px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#f8fafc",
                fontSize: "13px"
              }}
            />
            <button
              type="button"
              onClick={() => openPicker("path", "file", ".docx", "เลือกไฟล์สตอรี่บอร์ด DOCX จาก NAS")}
              style={{
                padding: "8px 12px",
                background: "#0284c7",
                border: "none",
                borderRadius: "6px",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
              title="เปิด Remote File Explorer เพื่อเลือกไฟล์บน Server/NAS"
            >
              🔍 เลือกจาก NAS
            </button>
          </div>
          <small style={{ color: "#94a3b8", display: "block", marginTop: "4px", fontSize: "11px" }}>
            ระบบจะดึงตารางบทสัมภาษณ์พร้อม Timecode และ Title Cards จากไฟล์ Word อัตโนมัติ
          </small>
        </div>

        {/* Live DOCX Preview Card */}
        {docxPath && (
          <div
            style={{
              background: "#090d16",
              border: docxPreview?.ok ? "1px solid #0284c7" : "1px solid #475569",
              borderRadius: "8px",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "16px" }}>{docxPreview?.ok ? "📄" : "⚠️"}</span>
                <strong style={{ fontSize: "13px", color: docxPreview?.ok ? "#38bdf8" : "#fca5a5" }}>
                  {docxPreview?.ok ? "สรุปข้อมูลตารางสตอรี่บอร์ด (Live Summary)" : "สถานะไฟล์"}
                </strong>
              </div>
              {docxPreview?.ok && (
                <button
                  type="button"
                  onClick={() => setShowSegments(!showSegments)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#38bdf8",
                    fontSize: "11px",
                    cursor: "pointer",
                    textDecoration: "underline"
                  }}
                >
                  {showSegments ? "ซ่อนรายละเอียด" : "ดูตารางบทสัมภาษณ์"}
                </button>
              )}
            </div>

            {previewLoading && (
              <div style={{ fontSize: "12px", color: "#94a3b8" }}>⏳ กำลังแกะข้อมูลตารางจากไฟล์ Word...</div>
            )}

            {!previewLoading && docxPreview && (
              <>
                {docxPreview.ok ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "#cbd5e1" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      <div style={{ background: "#1e293b", padding: "6px 8px", borderRadius: "4px" }}>
                        <span style={{ color: "#94a3b8", display: "block", fontSize: "10px" }}>ช่วงสัมภาษณ์ (Segments)</span>
                        <strong style={{ color: "#38bdf8", fontSize: "14px" }}>{docxPreview.segmentCount} ช่วง</strong>
                      </div>
                      <div style={{ background: "#1e293b", padding: "6px 8px", borderRadius: "4px" }}>
                        <span style={{ color: "#94a3b8", display: "block", fontSize: "10px" }}>เวลารวมบทสัมภาษณ์</span>
                        <strong style={{ color: "#10b981", fontSize: "14px" }}>{docxPreview.totalDialogueFormatted}</strong>
                      </div>
                    </div>

                    {docxPreview.cardCount > 0 && (
                      <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                        พบ Title / Transition Cards: <span style={{ color: "#facc15" }}>{docxPreview.cardCount} รายการ</span>
                      </div>
                    )}

                    {showSegments && (
                      <div
                        style={{
                          marginTop: "6px",
                          maxHeight: "180px",
                          overflowY: "auto",
                          border: "1px solid #1e293b",
                          borderRadius: "4px",
                          padding: "4px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          background: "#0f172a"
                        }}
                      >
                        {docxPreview.segments.map((seg, idx) => (
                          <div
                            key={seg.id}
                            style={{
                              padding: "4px 6px",
                              borderRadius: "4px",
                              background: idx % 2 === 0 ? "rgba(255, 255, 255, 0.02)" : "transparent",
                              fontSize: "11px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "2px"
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", color: "#38bdf8" }}>
                              <strong>{seg.id} ({seg.sourceKey})</strong>
                              <span>
                                {Math.floor(seg.sourceInMs / 60000)}:{(Math.floor((seg.sourceInMs % 60000) / 1000)).toString().padStart(2, "0")} - {Math.floor(seg.sourceOutMs / 60000)}:{(Math.floor((seg.sourceOutMs % 60000) / 1000)).toString().padStart(2, "0")}
                              </span>
                            </div>
                            <div style={{ color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {seg.dialogue || seg.sound || "(ไม่มีข้อความ)"}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: "12px", color: "#fca5a5" }}>
                    {docxPreview.error}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <RemoteFilePickerModal
          isOpen={pickerState.open}
          onClose={() => setPickerState((prev) => ({ ...prev, open: false }))}
          onSelect={handlePickerSelect}
          initialPath={pickerState.initialPath}
          mode={pickerState.mode}
          filter={pickerState.filter}
          title={pickerState.title}
        />
      </div>
    );
  }

  if (nodeType === "media.catalog") {
    return (
      <div className="custom-inspector-section" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div className="inspector-field">
          <label htmlFor="catalog-root">โฟลเดอร์โครงการหลัก (Root Folder)</label>
          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <input
              id="catalog-root"
              type="text"
              value={String(config.root ?? "")}
              onChange={(e) => onChange("root", e.target.value)}
              placeholder="/Volumes/.../1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์"
              style={{
                flex: 1,
                padding: "8px 10px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#f8fafc",
                fontSize: "13px"
              }}
            />
            <button
              type="button"
              onClick={() => openPicker("root", "folder", undefined, "เลือกโฟลเดอร์โครงการหลักบน NAS")}
              style={{
                padding: "8px 12px",
                background: "#0284c7",
                border: "none",
                borderRadius: "6px",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              🔍 เลือกจาก NAS
            </button>
          </div>
          <small style={{ color: "#94a3b8", display: "block", marginTop: "4px", fontSize: "11px" }}>
            โฟลเดอร์หลักที่มีฟุตเทจบทสัมภาษณ์ (A-Roll เช่น C7723, C7724)
          </small>
        </div>

        <div className="inspector-field">
          <label htmlFor="catalog-broll">โฟลเดอร์ B-Roll เฉพาะ (B-Roll Folder - แนะนำ)</label>
          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <input
              id="catalog-broll"
              type="text"
              value={String(config.brollFolder ?? "")}
              onChange={(e) => onChange("brollFolder", e.target.value)}
              placeholder="/Volumes/.../Ins"
              style={{
                flex: 1,
                padding: "8px 10px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#f8fafc",
                fontSize: "13px"
              }}
            />
            <button
              type="button"
              onClick={() => openPicker("brollFolder", "folder", undefined, "เลือกโฟลเดอร์ B-Roll (Ins) บน NAS")}
              style={{
                padding: "8px 12px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#cbd5e1",
                fontSize: "12px",
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              📁 เลือกโฟลเดอร์
            </button>
          </div>
          <small style={{ color: "#94a3b8", display: "block", marginTop: "4px", fontSize: "11px" }}>
            ระบุโฟลเดอร์คลิปวิดีโอแทรก (Ins) สำหรับนำไปสกัด 1-Frame Thumbnail และจับคู่บริบทคำพูด
          </small>
        </div>

        <div className="inspector-field">
          <label htmlFor="catalog-cover">โฟลเดอร์ภาพนิ่งปก (Cover Photos Folder)</label>
          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <input
              id="catalog-cover"
              type="text"
              value={String(config.coverFolder ?? "")}
              onChange={(e) => onChange("coverFolder", e.target.value)}
              placeholder="/Volumes/.../ภาพนิ่ง"
              style={{
                flex: 1,
                padding: "8px 10px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#f8fafc",
                fontSize: "13px"
              }}
            />
            <button
              type="button"
              onClick={() => openPicker("coverFolder", "folder", undefined, "เลือกโฟลเดอร์ภาพนิ่งบน NAS")}
              style={{
                padding: "8px 12px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#cbd5e1",
                fontSize: "12px",
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              📁 เลือกโฟลเดอร์
            </button>
          </div>
          <small style={{ color: "#94a3b8", display: "block", marginTop: "4px", fontSize: "11px" }}>
            ระบบจะเลือก 1 ภาพเพื่อนำไปสร้างภาพปก / AE Title Graphic ไม่นำไปปนกับ B-Roll
          </small>
        </div>

        <div className="inspector-field">
          <label htmlFor="catalog-ae">ไฟล์ After Effects Template (AE Project .aep)</label>
          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <input
              id="catalog-ae"
              type="text"
              value={String(config.aeTemplatePath ?? "")}
              onChange={(e) => onChange("aeTemplatePath", e.target.value)}
              placeholder="/Volumes/.../Assets/title-template.aep"
              style={{
                flex: 1,
                padding: "8px 10px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#f8fafc",
                fontSize: "13px"
              }}
            />
            <button
              type="button"
              onClick={() => openPicker("aeTemplatePath", "file", ".aep", "เลือกไฟล์ After Effects Template บน NAS")}
              style={{
                padding: "8px 12px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#cbd5e1",
                fontSize: "12px",
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              ⚡ เลือก .aep
            </button>
          </div>
          <small style={{ color: "#94a3b8", display: "block", marginTop: "4px", fontSize: "11px" }}>
            ลิงก์ Dynamic Link เข้า Premiere Pro โดยตรง (ไม่ Render ไฟล์ตาย — ดับเบิ้ลคลิกแก้มือใน PR ได้)
          </small>
        </div>

        <RemoteFilePickerModal
          isOpen={pickerState.open}
          onClose={() => setPickerState((prev) => ({ ...prev, open: false }))}
          onSelect={handlePickerSelect}
          initialPath={pickerState.initialPath}
          mode={pickerState.mode}
          filter={pickerState.filter}
          title={pickerState.title}
        />
      </div>
    );
  }

  if (nodeType === "edit.cutlist") {
    return (
      <div className="custom-inspector-section" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div className="inspector-field">
          <label htmlFor="cutlist-intro">ความยาวไตเติลก่อนเริ่มบทสัมภาษณ์ (Intro Duration ms)</label>
          <input
            id="cutlist-intro"
            type="number"
            step="40"
            min="0"
            value={Number(config.introDurationMs ?? 5000)}
            onChange={(e) => onChange("introDurationMs", Number(e.target.value))}
            style={{
              padding: "8px 10px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#f8fafc",
              fontSize: "13px"
            }}
          />
          <small style={{ color: "#94a3b8", display: "block", marginTop: "4px", fontSize: "11px" }}>
            กำหนดเป็นมิลลิวินาที (หารด้วย 40ms ลงตัวตามมาตรฐาน 25fps เช่น 5000ms = 5 วินาที)
          </small>
        </div>
      </div>
    );
  }

  if (nodeType === "editor.broll_match") {
    return (
      <div className="custom-inspector-section" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div className="inspector-field">
          <label htmlFor="broll-max">จำนวน B-Roll Candidates สูงสุดต่อ Segment</label>
          <select
            id="broll-max"
            value={Number(config.maxPerSegment ?? 2)}
            onChange={(e) => onChange("maxPerSegment", Number(e.target.value))}
            style={{
              padding: "8px 10px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#f8fafc",
              fontSize: "13px"
            }}
          >
            <option value={1}>1 รูป/คลิป ต่อช่วง</option>
            <option value={2}>2 ตัวเลือก ต่อช่วง (แนะนำ)</option>
            <option value={3}>3 ตัวเลือก ต่อช่วง</option>
          </select>
        </div>
      </div>
    );
  }

  if (nodeType === "review.approval") {
    return (
      <div className="custom-inspector-section" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div className="inspector-field">
          <label htmlFor="approval-prompt">ข้อความแนะนำสำหรับผู้ตรวจอนุมัติ (Operator Prompt)</label>
          <input
            id="approval-prompt"
            type="text"
            value={String(config.prompt ?? "ตรวจและอนุมัติ B-roll สำหรับแต่ละช่วงบทสัมภาษณ์")}
            onChange={(e) => onChange("prompt", e.target.value)}
            style={{
              padding: "8px 10px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#f8fafc",
              fontSize: "13px"
            }}
          />
        </div>
      </div>
    );
  }

  if (nodeType === "media.conform") {
    return (
      <div className="custom-inspector-section" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div className="inspector-field">
          <label htmlFor="conform-profile">ProRes Conform Profile</label>
          <select
            id="conform-profile"
            value={String(config.profile ?? "1080p25")}
            onChange={(e) => onChange("profile", e.target.value)}
            style={{
              padding: "8px 10px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#f8fafc",
              fontSize: "13px"
            }}
          >
            <option value="1080p25">Apple ProRes 422 1080p @ 25fps</option>
          </select>
        </div>
        <div className="inspector-field">
          <label htmlFor="conform-cache">โฟลเดอร์เก็บแคชไฟล์ Conform (Cache Root)</label>
          <input
            id="conform-cache"
            type="text"
            value={String(config.cacheRoot ?? ".ava-cache/conform")}
            onChange={(e) => onChange("cacheRoot", e.target.value)}
            style={{
              padding: "8px 10px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#f8fafc",
              fontSize: "13px"
            }}
          />
        </div>
      </div>
    );
  }

  if (nodeType === "timeline.broll_stack") {
    return (
      <div className="custom-inspector-section" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div className="inspector-field">
          <label htmlFor="broll-folder">โฟลเดอร์ B-Roll บน NAS (/Ins หรือโฟลเดอร์มีเดีย)</label>
          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <input
              id="broll-folder"
              type="text"
              value={String(config.brollFolder ?? config.folder ?? "")}
              onChange={(e) => onChange("brollFolder", e.target.value)}
              placeholder="/Volumes/.../Ins"
              style={{
                flex: 1,
                padding: "8px 10px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#f8fafc",
                fontSize: "13px"
              }}
            />
            <button
              type="button"
              onClick={() => openPicker("brollFolder", "folder", undefined, "เลือกโฟลเดอร์ B-Roll บน NAS")}
              style={{
                padding: "8px 12px",
                background: "#0284c7",
                border: "none",
                borderRadius: "6px",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              📁 เลือกโฟลเดอร์ NAS
            </button>
          </div>
          <small style={{ color: "#94a3b8", display: "block", marginTop: "4px", fontSize: "11px" }}>
            ระบบจะสแกนไฟล์วิดีโอและรูปภาพทั้งหมดในโฟลเดอร์นี้เพื่อนำมาซ้อนเป็น B-roll อัตโนมัติ
          </small>
        </div>

        <div className="inspector-field">
          <label htmlFor="broll-preset">Motion Graphics Animation Preset สำหรับ B-Roll</label>
          <select
            id="broll-preset"
            value={String(config.motionPreset ?? "Spring")}
            onChange={(e) => onChange("motionPreset", e.target.value)}
            style={{
              padding: "8px 10px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#f8fafc",
              fontSize: "13px"
            }}
          >
            <option value="Spring">Spring (เด้งนุ่มนวล - สไตล์ Modern Shorts)</option>
            <option value="Bounce">Bounce (กระโดดดึงดูดสายตา - สไตล์ TikTok/Reels)</option>
            <option value="Pop">Pop (ขยายโผล่ทันที - สไตล์ Fast Pace)</option>
            <option value="ZoomPunch">Zoom Punch (ซูมกระแทกจังหวะสำคัญ)</option>
            <option value="BackdropBlur">Backdrop Blur (เบลอพื้นหลังเน้นฟุตเทจ)</option>
          </select>
        </div>

        <div className="inspector-field">
          <label htmlFor="broll-duration">ความยาวสูงสุดของแต่ละคลิป B-Roll (ms)</label>
          <input
            id="broll-duration"
            type="number"
            step="500"
            min="1000"
            value={Number(config.maxDurationMs ?? 5000)}
            onChange={(e) => onChange("maxDurationMs", Number(e.target.value))}
            style={{
              padding: "8px 10px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#f8fafc",
              fontSize: "13px"
            }}
          />
          <small style={{ color: "#94a3b8", display: "block", marginTop: "4px", fontSize: "11px" }}>
            ค่ามาตรฐาน 5,000 ms (5.0 วินาที) เหมาะสมกับจังหวะการตัดต่อสารคดีและคลิปสั้น
          </small>
        </div>

        <RemoteFilePickerModal
          isOpen={pickerState.open}
          onClose={() => setPickerState((prev) => ({ ...prev, open: false }))}
          onSelect={handlePickerSelect}
          initialPath={pickerState.initialPath}
          mode={pickerState.mode}
          filter={pickerState.filter}
          title={pickerState.title}
        />
      </div>
    );
  }

  if (nodeType === "premiere.export") {
    return (
      <div className="custom-inspector-section" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div className="inspector-field">
          <label htmlFor="export-output">พาธไฟล์วิดีโอส่งออก (Output MP4 Path)</label>
          <input
            id="export-output"
            type="text"
            value={String(config.output ?? "exports/documentary-master.mp4")}
            onChange={(e) => onChange("output", e.target.value)}
            style={{
              padding: "8px 10px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#f8fafc",
              fontSize: "13px"
            }}
          />
          <small style={{ color: "#94a3b8", display: "block", marginTop: "4px", fontSize: "11px" }}>
            ไฟล์ MP4 จะถูกบันทึกและแสดงใน Artifact Gallery ให้เปิดพรีวิวดูบนเว็บเบราว์เซอร์ได้ทันที
          </small>
        </div>
        <div className="inspector-field">
          <label htmlFor="export-preset">รูปแบบการเข้ารหัส (Export Preset)</label>
          <select
            id="export-preset"
            value={String(config.preset ?? "Match Source - Adaptive High Bitrate")}
            onChange={(e) => onChange("preset", e.target.value)}
            style={{
              padding: "8px 10px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#f8fafc",
              fontSize: "13px"
            }}
          >
            <option value="Match Source - Adaptive High Bitrate">H.264 Match Source - Adaptive High Bitrate (แนะนำสำหรับพรีวิว)</option>
            <option value="Apple ProRes 422">Apple ProRes 422 (มาสเตอร์ออกอากาศ)</option>
          </select>
        </div>
      </div>
    );
  }

  if (nodeType === "preview.media" || nodeType === "preview.video" || nodeType === "preview.image") {
    const rawSource = String(config.source ?? config.path ?? config.previewUrl ?? "");
    const title = String(config.title ?? (nodeType === "preview.video" ? "Video Player Preview" : nodeType === "preview.image" ? "Image Preview" : "ComfyUI Media Preview"));
    const isVideo = nodeType === "preview.video" || rawSource.endsWith(".mp4") || rawSource.endsWith(".mov") || rawSource.includes("mp4");

    return (
      <div className="custom-inspector-section" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ padding: "10px 12px", background: "#0f172a", borderRadius: "8px", border: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              📺 ComfyUI Live Viewport
            </span>
            <span style={{ fontSize: "10px", padding: "2px 6px", background: "#065f46", color: "#6ee7b7", borderRadius: "4px", fontWeight: 600 }}>
              ACTIVE
            </span>
          </div>

          {/* Interactive Player Frame */}
          <div style={{ width: "100%", minHeight: "160px", background: "#020617", borderRadius: "6px", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1px solid #334155" }}>
            {rawSource ? (
              isVideo ? (
                <video
                  src={`/api/v1/media/stream?path=${encodeURIComponent(rawSource)}`}
                  controls
                  style={{ width: "100%", maxHeight: "240px", objectFit: "contain", background: "#000" }}
                >
                  เบราว์เซอร์ไม่รองรับการเล่นวิดีโอ
                </video>
              ) : (
                <img
                  src={`/api/v1/media/stream?path=${encodeURIComponent(rawSource)}`}
                  alt="Live Preview"
                  style={{ width: "100%", maxHeight: "240px", objectFit: "contain", background: "#000" }}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              )
            ) : (
              <div style={{ padding: "24px 16px", textAlign: "center", color: "#64748b" }}>
                <div style={{ fontSize: "28px", marginBottom: "6px" }}>{isVideo ? "🎬" : "🖼️"}</div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#94a3b8" }}>รอรับสัญญาณมีเดียจากโหนดก่อนหน้า</div>
                <div style={{ fontSize: "11px", marginTop: "4px" }}>ผลลัพธ์จะแสดงสดที่นี่อัตโนมัติเมื่อรันถึงขั้นตอนนี้</div>
              </div>
            )}
          </div>
        </div>

        <div className="inspector-field">
          <label htmlFor="preview-title">ชื่อหน้าจอพรีวิว (Title / Label)</label>
          <input
            id="preview-title"
            type="text"
            value={title}
            onChange={(e) => onChange("title", e.target.value)}
            style={{
              padding: "8px 10px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#f8fafc",
              fontSize: "13px"
            }}
          />
        </div>

        <div className="inspector-field">
          <label htmlFor="preview-source">แหล่งข้อมูล / ไฟล์มีเดีย (Source Path / Reference)</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              id="preview-source"
              type="text"
              value={rawSource}
              onChange={(e) => onChange("source", e.target.value)}
              placeholder="${steps.export_premiere.outputs} หรือ ระบุพาธไฟล์..."
              style={{
                flex: 1,
                padding: "8px 10px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#f8fafc",
                fontSize: "12px",
                fontFamily: "monospace"
              }}
            />
            <button
              type="button"
              onClick={() => openPicker("source", "file", isVideo ? ".mp4,.mov,.mxf" : ".png,.jpg,.jpeg,.webp", "เลือกไฟล์มีเดียสำหรับพรีวิว")}
              style={{
                padding: "0 12px",
                background: "#334155",
                border: "1px solid #475569",
                borderRadius: "6px",
                color: "#e2e8f0",
                fontSize: "12px",
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              📁 เลือกไฟล์
            </button>
          </div>
          <small style={{ color: "#94a3b8", display: "block", marginTop: "4px", fontSize: "11px" }}>
            รับสายเชื่อมต่อจากโหนด Render / Export หรือระบุพาธตรงสำหรับตรวจดูภาพและเสียงได้ทันที
          </small>
        </div>
      </div>
    );
  }

  return null;
}
