import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { previewDocx, getNasBookmarks, type DocxPreviewResult, type FsBookmark } from "../api";
import { createStoryboardFromDocx, DEFAULT_DOCUMENTARY_DOCX } from "../storyboard-api";
import { RemoteFilePickerModal } from "./RemoteFilePickerModal";

export interface CreateStoryboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (storyboardId: string) => void;
}

export const CreateStoryboardModal: React.FC<CreateStoryboardModalProps> = ({
  isOpen,
  onClose,
  onCreated
}) => {
  const navigate = useNavigate();
  const [docxPath, setDocxPath] = useState<string>(DEFAULT_DOCUMENTARY_DOCX);
  const [storyboardName, setStoryboardName] = useState<string>("สารคดี อาจารย์ตัวอย่าง 69");
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [bookmarks, setBookmarks] = useState<FsBookmark[]>([]);
  const [preview, setPreview] = useState<DocxPreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [brollPoolDirs, setBrollPoolDirs] = useState<string[]>([]);
  const [photoDirs, setPhotoDirs] = useState<string[]>([]);
  const [folderPickerTarget, setFolderPickerTarget] = useState<"broll" | "photo" | null>(null);

  useEffect(() => {
    if (isOpen) {
      getNasBookmarks().then(setBookmarks).catch(() => {});
      if (docxPath) {
        void runPreview(docxPath);
      }
    }
  }, [isOpen]);

  const runPreview = async (path: string) => {
    if (!path.trim()) {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    setError("");
    try {
      const res = await previewDocx(path);
      setPreview(res);
      if (res.ok) {
        setBrollPoolDirs(res.brollPoolDirs ?? []);
        setPhotoDirs(res.photoDirs ?? []);
        // Auto-suggest storyboard name if using default or empty
        const filename = path.split("/").pop()?.replace(/\.[^/.]+$/, "") || "";
        const cleanName = filename.replace(/^SB-/, "สารคดี ").trim();
        if (cleanName && (!storyboardName || storyboardName === "สารคดี อาจารย์ตัวอย่าง 69")) {
          setStoryboardName(cleanName);
        }
      }
    } catch (err: any) {
      setError(err?.message || "ไม่สามารถอ่านโครงสร้าง DOCX ได้");
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSelectPath = (path: string) => {
    setDocxPath(path);
    void runPreview(path);
  };

  const handleCreate = async () => {
    if (!docxPath.trim()) return;
    setCreating(true);
    setError("");
    try {
      const storyboard = await createStoryboardFromDocx(
        docxPath.trim(),
        storyboardName.trim() || "สารคดีเรื่องใหม่"
      );
      onClose();
      if (onCreated) {
        onCreated(storyboard.storyboardId);
      } else {
        navigate(`/storyboards/${storyboard.storyboardId}/edit`);
      }
    } catch (err: any) {
      setError(err?.message || "สร้าง Storyboard ล้มเหลว");
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(3, 7, 18, 0.85)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: "20px"
        }}
      >
        <div
          style={{
            backgroundColor: "#0F172A",
            border: "1px solid #334155",
            borderRadius: "16px",
            width: "100%",
            maxWidth: "720px",
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(59, 130, 246, 0.15)",
            overflow: "hidden"
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid #1E293B",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "linear-gradient(180deg, #1E293B 0%, #0F172A 100%)"
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "20px" }}>🎬</span>
                <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#F8FAFC", margin: 0 }}>
                  เลือกไฟล์ DOCX เพื่อสร้าง Storyboard ใหม่
                </h2>
              </div>
              <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#94A3B8" }}>
                ระบบจะอ่านบทสัมภาษณ์ ตารางภาพและเสียง (Sound/Picture) พร้อมสร้างไทม์ไลน์ 16:9 Broadcast ให้โดยอัตโนมัติ
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#94A3B8",
                fontSize: "20px",
                cursor: "pointer",
                padding: "4px 8px",
                borderRadius: "6px"
              }}
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: "24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Step 1: DOCX Path */}
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#E2E8F0", marginBottom: "8px" }}>
                1. ไฟล์บทสัมภาษณ์ (.docx) จากสตูดิโอ / NAS
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  value={docxPath}
                  onChange={(e) => {
                    setDocxPath(e.target.value);
                    void runPreview(e.target.value);
                  }}
                  placeholder="/Volumes/ภาควีดีทัศน์/.../Storyboard.docx"
                  style={{
                    flex: 1,
                    background: "#090D16",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    color: "#F8FAFC",
                    fontSize: "13px",
                    fontFamily: "monospace"
                  }}
                />
                <button
                  type="button"
                  onClick={() => setIsPickerOpen(true)}
                  style={{
                    background: "#1E293B",
                    border: "1px solid #475569",
                    color: "#38BDF8",
                    padding: "0 16px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  📁 เปิดเลือกจาก NAS
                </button>
              </div>

              {/* Bookmarks quick links */}
              {bookmarks.length > 0 && (
                <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", color: "#64748B" }}>Bookmarks:</span>
                  {bookmarks.slice(0, 3).map((bm) => (
                    <button
                      key={bm.id}
                      type="button"
                      onClick={() => {
                        // If it's a folder, open picker there; if it's the specific documentary, point to its docx
                        if (bm.id === "nas-kewalin") {
                          handleSelectPath(DEFAULT_DOCUMENTARY_DOCX);
                        } else {
                          setIsPickerOpen(true);
                        }
                      }}
                      style={{
                        background: "#1E293B",
                        border: "1px solid #334155",
                        color: "#94A3B8",
                        padding: "3px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        cursor: "pointer"
                      }}
                    >
                      {bm.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Live DOCX Preview */}
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#E2E8F0", marginBottom: "8px" }}>
                2. ตรวจสอบโครงสร้างไฟล์ (DOCX Preflight)
              </label>
              {loadingPreview ? (
                <div style={{ padding: "16px", background: "#090D16", borderRadius: "8px", border: "1px solid #1E293B", textAlign: "center", color: "#38BDF8", fontSize: "13px" }}>
                  ⏳ กำลังอ่านตารางและถอดรหัสบทพูดจาก DOCX...
                </div>
              ) : preview?.ok ? (
                <div style={{ background: "#090D16", borderRadius: "10px", border: "1px solid #1E3A8A", padding: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#4ADE80", fontSize: "13px", fontWeight: 700, marginBottom: "12px" }}>
                    <span>✅ โครงสร้างสมบูรณ์ พร้อมแปลงเป็น Storyboard</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "12px" }}>
                    <div style={{ background: "#0F172A", padding: "10px", borderRadius: "6px", textAlign: "center", border: "1px solid #1E293B" }}>
                      <div style={{ fontSize: "11px", color: "#94A3B8" }}>ฉากทั้งหมด</div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#F8FAFC", marginTop: "2px" }}>{preview.segmentCount}</div>
                    </div>
                    <div style={{ background: "#0F172A", padding: "10px", borderRadius: "6px", textAlign: "center", border: "1px solid #1E293B" }}>
                      <div style={{ fontSize: "11px", color: "#94A3B8" }}>ท่อนสัมภาษณ์ A-Roll</div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#38BDF8", marginTop: "2px" }}>{preview.segments.length}</div>
                    </div>
                    <div style={{ background: "#0F172A", padding: "10px", borderRadius: "6px", textAlign: "center", border: "1px solid #1E293B" }}>
                      <div style={{ fontSize: "11px", color: "#94A3B8" }}>ความยาวบทพูดรวม</div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#FBBF24", marginTop: "2px" }}>{preview.totalDialogueFormatted}</div>
                    </div>
                    <div style={{ background: "#0F172A", padding: "10px", borderRadius: "6px", textAlign: "center", border: "1px solid #1E293B" }}>
                      <div style={{ fontSize: "11px", color: "#94A3B8" }}>การ์ดข้อความ</div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#C084FC", marginTop: "2px" }}>{preview.cardCount}</div>
                    </div>
                  </div>
                  {preview.segments[0] && (
                    <div style={{ fontSize: "12px", color: "#94A3B8", background: "#0F172A", padding: "8px 12px", borderRadius: "6px", border: "1px solid #1E293B" }}>
                      <strong style={{ color: "#E2E8F0" }}>ตัวอย่างบทพูดเปิดฉาก:</strong> "{preview.segments[0].dialogue.slice(0, 120)}..."
                    </div>
                  )}

                  {/* Dynamic Media Context: Multipath B-Roll & Photos */}
                  <div style={{ marginTop: "12px", background: "#0F172A", padding: "12px", borderRadius: "8px", border: "1px solid #1E293B" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "#38BDF8", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>🎥 แหล่งฟุตเทจ B-Roll ({preview.brollCount ?? 0} ไฟล์)</span>
                        <span style={{ fontSize: "10px", background: "rgba(56, 189, 248, 0.15)", color: "#38BDF8", padding: "1px 6px", borderRadius: "4px" }}>
                          Auto Context
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFolderPickerTarget("broll")}
                        style={{
                          background: "#0284C7",
                          color: "#fff",
                          border: "none",
                          borderRadius: "4px",
                          padding: "3px 8px",
                          fontSize: "11px",
                          cursor: "pointer",
                          fontWeight: 600
                        }}
                      >
                        ➕ เพิ่มโฟลเดอร์ B-Roll
                      </button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
                      {brollPoolDirs.length === 0 ? (
                        <span style={{ fontSize: "11px", color: "#64748B" }}>ไม่พบโฟลเดอร์ Ins/B-roll อัตโนมัติ (สามารถกดเพิ่มโฟลเดอร์เองได้)</span>
                      ) : (
                        brollPoolDirs.map((dir, idx) => (
                          <div key={idx} style={{ background: "#1E293B", border: "1px solid #334155", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px", color: "#E2E8F0" }}>
                            <span>📁 {dir.split("/").slice(-2).join("/")}</span>
                            <button
                              type="button"
                              onClick={() => setBrollPoolDirs(brollPoolDirs.filter((_, i) => i !== idx))}
                              style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: "12px", padding: 0 }}
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "#F472B6", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>📸 ภาพนิ่งบุคคลสำหรับ Cover Card ({preview.photoCount ?? 0} รูป)</span>
                        <span style={{ fontSize: "10px", background: "rgba(244, 114, 182, 0.15)", color: "#F472B6", padding: "1px 6px", borderRadius: "4px" }}>
                          Auto Bind
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFolderPickerTarget("photo")}
                        style={{
                          background: "#DB2777",
                          color: "#fff",
                          border: "none",
                          borderRadius: "4px",
                          padding: "3px 8px",
                          fontSize: "11px",
                          cursor: "pointer",
                          fontWeight: 600
                        }}
                      >
                        ➕ เพิ่มโฟลเดอร์ภาพนิ่ง
                      </button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {photoDirs.length === 0 ? (
                        <span style={{ fontSize: "11px", color: "#64748B" }}>ไม่พบโฟลเดอร์ภาพนิ่งอัตโนมัติ (สามารถกดเพิ่มโฟลเดอร์เองได้)</span>
                      ) : (
                        photoDirs.map((dir, idx) => (
                          <div key={idx} style={{ background: "#1E293B", border: "1px solid #334155", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px", color: "#E2E8F0" }}>
                            <span>📸 {dir.split("/").slice(-2).join("/")}</span>
                            <button
                              type="button"
                              onClick={() => setPhotoDirs(photoDirs.filter((_, i) => i !== idx))}
                              style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: "12px", padding: 0 }}
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : preview?.error ? (
                <div style={{ padding: "14px", background: "rgba(239, 68, 68, 0.1)", borderRadius: "8px", border: "1px solid #EF4444", color: "#FCA5A5", fontSize: "13px" }}>
                  ⚠️ {preview.error}
                </div>
              ) : (
                <div style={{ padding: "14px", background: "#090D16", borderRadius: "8px", border: "1px solid #1E293B", color: "#64748B", fontSize: "13px", textAlign: "center" }}>
                  กรุณาเลือกไฟล์ .docx เพื่อเริ่มการตรวจสอบโครงสร้าง
                </div>
              )}
            </div>

            {/* Step 3: Storyboard Name */}
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#E2E8F0", marginBottom: "8px" }}>
                3. ตั้งชื่อโปรเจกต์ Storyboard
              </label>
              <input
                type="text"
                value={storyboardName}
                onChange={(e) => setStoryboardName(e.target.value)}
                placeholder="เช่น สารคดี อาจารย์ตัวอย่าง 69"
                style={{
                  width: "100%",
                  background: "#090D16",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  color: "#F8FAFC",
                  fontSize: "14px",
                  boxSizing: "border-box"
                }}
              />
            </div>

            {error && (
              <div style={{ padding: "10px 14px", background: "rgba(239, 68, 68, 0.15)", borderRadius: "6px", border: "1px solid #EF4444", color: "#F87171", fontSize: "13px" }}>
                ❌ {error}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid #1E293B",
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
              background: "#0F172A"
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 18px",
                borderRadius: "8px",
                background: "transparent",
                border: "1px solid #475569",
                color: "#E2E8F0",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !preview?.ok}
              style={{
                padding: "8px 20px",
                borderRadius: "8px",
                background: preview?.ok ? "linear-gradient(135deg, #2563EB, #1D4ED8)" : "#334155",
                border: "none",
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: 700,
                cursor: preview?.ok && !creating ? "pointer" : "not-allowed",
                opacity: preview?.ok && !creating ? 1 : 0.6,
                boxShadow: preview?.ok ? "0 4px 14px rgba(37, 99, 235, 0.4)" : "none",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              {creating ? "⏳ กำลังสร้าง Storyboard..." : "🚀 นำเข้า DOCX และสร้าง Storyboard"}
            </button>
          </div>
        </div>
      </div>

      {/* Embedded File Picker Modal */}
      {isPickerOpen && (
        <RemoteFilePickerModal
          isOpen={isPickerOpen}
          onClose={() => setIsPickerOpen(false)}
          onSelect={(selectedPath) => {
            setIsPickerOpen(false);
            handleSelectPath(selectedPath);
          }}
          filter=".docx"
          title="เลือกไฟล์ DOCX Storyboard จาก NAS หรือสตูดิโอ"
          initialPath="/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69"
        />
      )}

      {/* Embedded Folder Picker Modal for Multipath B-Roll & Photos */}
      {folderPickerTarget && (
        <RemoteFilePickerModal
          isOpen={true}
          mode="folder"
          title={folderPickerTarget === "broll" ? "เลือกโฟลเดอร์ฟุตเทจ B-Roll เพิ่มเติมบน NAS" : "เลือกโฟลเดอร์ภาพนิ่งเพิ่มเติมบน NAS"}
          initialPath={docxPath ? docxPath.substring(0, docxPath.lastIndexOf("/")) : "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69"}
          onClose={() => setFolderPickerTarget(null)}
          onSelect={(selectedPath) => {
            if (folderPickerTarget === "broll") {
              if (!brollPoolDirs.includes(selectedPath)) {
                setBrollPoolDirs([...brollPoolDirs, selectedPath]);
              }
            } else {
              if (!photoDirs.includes(selectedPath)) {
                setPhotoDirs([...photoDirs, selectedPath]);
              }
            }
            setFolderPickerTarget(null);
          }}
        />
      )}
    </>
  );
};
