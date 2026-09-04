import React, { useState, useEffect, useRef } from "react";
import type { Storyboard } from "../storyboard-types";
import {
  getStoryboardRenderDefaults,
  triggerStoryboardRender,
  getStoryboardRenderJob,
  type RenderJobStatus,
  type RenderDefaultsResult
} from "../api";
import { RemoteFilePickerModal } from "./RemoteFilePickerModal";

export interface RenderProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  storyboard: Storyboard;
  bgmTrack?: any;
  initialFormat?: "16:9" | "9:16";
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatDuration(ms?: number): string {
  if (!ms) return "0s";
  const sec = (ms / 1000).toFixed(1);
  return `${sec} วินาที`;
}

export const RenderProgressModal: React.FC<RenderProgressModalProps> = ({
  isOpen,
  onClose,
  storyboard,
  bgmTrack,
  initialFormat = "16:9"
}) => {
  const [stage, setStage] = useState<"config" | "rendering" | "completed" | "failed">("config");
  const [format, setFormat] = useState<"16:9" | "9:16">(initialFormat);
  const [quality, setQuality] = useState<"master" | "draft">("master");
  const [outputDir, setOutputDir] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [defaults, setDefaults] = useState<RenderDefaultsResult | null>(null);
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [job, setJob] = useState<RenderJobStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(false);

  const pollTimerRef = useRef<number | null>(null);

  // Load destination defaults on open
  useEffect(() => {
    if (!isOpen || !storyboard?.storyboardId) return;

    setStage("config");
    setJob(null);
    setErrorMsg("");
    setCopied(false);
    setLoadingDefaults(true);

    getStoryboardRenderDefaults(storyboard.storyboardId)
      .then((res) => {
        setDefaults(res);
        setOutputDir(res.defaultDirectory);
        setFileName(res.defaultFileName);
      })
      .catch((err) => {
        console.error("Failed to fetch render defaults:", err);
      })
      .finally(() => {
        setLoadingDefaults(false);
      });

    return () => {
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
      }
    };
  }, [isOpen, storyboard?.storyboardId]);

  // Polling loop for active render job
  useEffect(() => {
    if (stage !== "rendering" || !job?.jobId || !storyboard?.storyboardId) return;

    let isMounted = true;
    const poll = async () => {
      try {
        const status = await getStoryboardRenderJob(storyboard.storyboardId, job.jobId);
        if (!isMounted) return;

        setJob(status);

        if (status.status === "completed") {
          setStage("completed");
        } else if (status.status === "failed") {
          setStage("failed");
          setErrorMsg(status.error || "การ Render ล้มเหลว กรุณาตรวจสอบ Asset หรือลองใหม่อีกครั้ง");
        } else {
          pollTimerRef.current = window.setTimeout(poll, 800);
        }
      } catch (err: any) {
        if (!isMounted) return;
        pollTimerRef.current = window.setTimeout(poll, 1500);
      }
    };

    pollTimerRef.current = window.setTimeout(poll, 600);

    return () => {
      isMounted = false;
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
      }
    };
  }, [stage, job?.jobId, storyboard?.storyboardId]);

  if (!isOpen) return null;

  const totalDurationMs = (storyboard.items || []).reduce((acc, it) => acc + (Number(it.durationMs) || 0), 0);
  const isUsingDocxDefault = defaults?.isDocxSource && outputDir === defaults.defaultDirectory;

  const handleStartRender = async () => {
    setStage("rendering");
    setErrorMsg("");
    try {
      const res = await triggerStoryboardRender(storyboard.storyboardId, {
        version: storyboard.approvedVersion || storyboard.revision || 1,
        format,
        quality,
        outputDirectory: outputDir.trim(),
        fileName: fileName.trim(),
        bgmTrack
      });

      setJob({
        jobId: res.jobId,
        storyboardId: storyboard.storyboardId,
        status: "rendering",
        progress: 0,
        renderedFrames: 0,
        totalFrames: Math.max(25, Math.round((totalDurationMs / 1000) * 25)),
        fps: 25,
        startedAt: new Date().toISOString(),
        outputDirectory: res.outputDirectory,
        fileName: res.fileName
      });
    } catch (err: any) {
      setStage("failed");
      setErrorMsg(err?.message || "ไม่สามารถเริ่มการ Render ได้");
    }
  };

  const handleCopyPath = () => {
    if (job?.outputPath) {
      navigator.clipboard.writeText(job.outputPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(3, 7, 18, 0.88)",
        backdropFilter: "blur(8px)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "760px",
          backgroundColor: "#0B132B",
          border: "1px solid rgba(229, 169, 60, 0.4)",
          borderRadius: "16px",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.85), 0 0 32px rgba(229, 169, 60, 0.15)",
          color: "#F8FAFC",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh"
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(90deg, rgba(229, 169, 60, 0.12) 0%, rgba(11, 19, 43, 0.5) 100%)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "22px" }}>🚀</span>
            <div>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#E5A93C", letterSpacing: "0.5px" }}>
                REMOTION MASTER VIDEO RENDER ENGINE
              </h2>
              <p style={{ margin: 0, fontSize: "11px", color: "#94A3B8" }}>
                PSU Broadcast Automated Video Assembly · 1080p Broadcast Delivery
              </p>
            </div>
          </div>
          {stage !== "rendering" && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#94A3B8",
                fontSize: "18px",
                cursor: "pointer",
                padding: "4px 8px"
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
          {/* STAGE 1: CONFIGURATION */}
          {stage === "config" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Summary Pill Card */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "10px",
                  padding: "12px 16px",
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "12px"
                }}
              >
                <div>
                  <span style={{ fontSize: "10px", color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>Storyboard</span>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#F8FAFC", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {storyboard.name}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: "10px", color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>Version</span>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#34D399" }}>
                    v{storyboard.approvedVersion || storyboard.revision || 1} {storyboard.approvedVersion ? "(Approved ✓)" : "(Draft)"}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: "10px", color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>Total Scenes</span>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#60A5FA" }}>
                    {storyboard.items?.length || 0} ช็อต
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: "10px", color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>ความยาวรวม</span>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#FBBF24" }}>
                    {formatDuration(totalDurationMs)}
                  </div>
                </div>
              </div>

              {/* Destination Folder Section */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#E2E8F0" }}>
                    📂 โฟลเดอร์ปลายทาง (Destination Directory):
                  </label>
                  {isUsingDocxDefault && (
                    <span
                      style={{
                        fontSize: "10px",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: "rgba(16, 185, 129, 0.2)",
                        color: "#34D399",
                        border: "1px solid rgba(16, 185, 129, 0.4)",
                        fontWeight: 700
                      }}
                    >
                      ✓ DOCX /Export (สร้างให้อัตโนมัติหากยังไม่มี)
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={outputDir}
                    onChange={(e) => setOutputDir(e.target.value)}
                    placeholder="/Volumes/ภาควีดีทัศน์/.../Export หรือ outputs/rendered"
                    style={{
                      flex: 1,
                      backgroundColor: "#060A12",
                      border: "1px solid #334155",
                      borderRadius: "8px",
                      color: "#F8FAFC",
                      padding: "8px 12px",
                      fontSize: "12px",
                      fontFamily: "monospace"
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setIsFolderPickerOpen(true)}
                    style={{
                      backgroundColor: "rgba(59, 130, 246, 0.2)",
                      border: "1px solid rgba(59, 130, 246, 0.5)",
                      color: "#93C5FD",
                      borderRadius: "8px",
                      padding: "0 14px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      whiteSpace: "nowrap"
                    }}
                  >
                    📁 เลือกโฟลเดอร์...
                  </button>
                </div>

                {defaults?.isDocxSource && !isUsingDocxDefault && (
                  <button
                    type="button"
                    onClick={() => setOutputDir(defaults.defaultDirectory)}
                    style={{
                      alignSelf: "flex-start",
                      background: "transparent",
                      border: "none",
                      color: "#38BDF8",
                      fontSize: "11px",
                      cursor: "pointer",
                      textDecoration: "underline",
                      padding: 0
                    }}
                  >
                    ↺ คืนค่าไปยังโฟลเดอร์ DOCX /Export: {defaults.defaultDirectory}
                  </button>
                )}
              </div>

              {/* File Name Section */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#E2E8F0" }}>
                  📝 ชื่อไฟล์วิดีโอ (Output Filename):
                </label>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="master_video.mp4"
                  style={{
                    backgroundColor: "#060A12",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    color: "#F8FAFC",
                    padding: "8px 12px",
                    fontSize: "12px",
                    fontFamily: "monospace"
                  }}
                />
              </div>

              {/* Format & Quality Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#E2E8F0" }}>
                    📐 Aspect Ratio (สัดส่วนภาพ):
                  </label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as any)}
                    style={{
                      backgroundColor: "#060A12",
                      border: "1px solid #334155",
                      borderRadius: "8px",
                      color: "#F8FAFC",
                      padding: "8px 12px",
                      fontSize: "12px"
                    }}
                  >
                    <option value="16:9">🖥️ 16:9 Broadcast Master (1920×1080)</option>
                    <option value="9:16">📱 9:16 Vertical Shorts (1080×1920)</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#E2E8F0" }}>
                    ⚙️ Quality Profile:
                  </label>
                  <select
                    value={quality}
                    onChange={(e) => setQuality(e.target.value as any)}
                    style={{
                      backgroundColor: "#060A12",
                      border: "1px solid #334155",
                      borderRadius: "8px",
                      color: "#F8FAFC",
                      padding: "8px 12px",
                      fontSize: "12px"
                    }}
                  >
                    <option value="master">🏆 Broadcast Master (CRF 18 · คุณภาพสูงสุด)</option>
                    <option value="draft">⚡ Fast Draft (CRF 26 · ประมวลผลเร็ว)</option>
                  </select>
                </div>
              </div>

              {/* Audio & Ducking Notice */}
              {bgmTrack?.path && (
                <div
                  style={{
                    background: "rgba(234, 179, 8, 0.1)",
                    border: "1px solid rgba(234, 179, 8, 0.3)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    fontSize: "11px",
                    color: "#FDE047",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}
                >
                  <span>🎵</span>
                  <span>
                    รวมแทร็กเพลง <strong>{bgmTrack.path.split("/").pop()}</strong> พร้อมระบบ <strong>Auto-Ducking (-14dB)</strong> ตอนมีเสียงพูด
                  </span>
                </div>
              )}
            </div>
          )}

          {/* STAGE 2: RENDERING PROGRESS */}
          {stage === "rendering" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 0", gap: "20px" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "42px", fontWeight: 900, color: "#E5A93C", fontFamily: "monospace" }}>
                  {job?.progress ?? 0}%
                </div>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#94A3B8" }}>
                  กำลังเรนเดอร์เฟรม Remotion ด้วย Headless Chrome & FFmpeg...
                </p>
              </div>

              {/* Progress Bar */}
              <div
                style={{
                  width: "100%",
                  height: "14px",
                  backgroundColor: "#060A12",
                  borderRadius: "7px",
                  overflow: "hidden",
                  border: "1px solid rgba(229, 169, 60, 0.3)",
                  position: "relative"
                }}
              >
                <div
                  style={{
                    width: `${job?.progress ?? 0}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #E5A93C 0%, #F59E0B 50%, #10B981 100%)",
                    boxShadow: "0 0 16px rgba(229, 169, 60, 0.8)",
                    transition: "width 0.3s ease-out"
                  }}
                />
              </div>

              {/* Telemetry Grid */}
              <div
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "12px",
                  background: "rgba(15, 23, 42, 0.6)",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.06)"
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: "10px", color: "#64748B", textTransform: "uppercase" }}>Frames Rendered</span>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "#60A5FA", fontFamily: "monospace" }}>
                    {job?.renderedFrames ?? 0} / {job?.totalFrames ?? "?"}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: "10px", color: "#64748B", textTransform: "uppercase" }}>Frame Rate</span>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "#34D399", fontFamily: "monospace" }}>
                    {job?.fps ?? 25} FPS
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: "10px", color: "#64748B", textTransform: "uppercase" }}>Estimated Time</span>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "#FBBF24", fontFamily: "monospace" }}>
                    {job?.etaSeconds !== undefined ? `~${job.etaSeconds} วินาที` : "กำลังคำนวณ..."}
                  </div>
                </div>
              </div>

              {/* Output Path Indicator */}
              <div style={{ width: "100%", fontSize: "11px", color: "#94A3B8", textAlign: "center", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" }}>
                📍 กำลังบันทึกไปที่: {outputDir}/{fileName}
              </div>
            </div>
          )}

          {/* STAGE 3: COMPLETED */}
          {stage === "completed" && job && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Success Banner */}
              <div
                style={{
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid rgba(16, 185, 129, 0.4)",
                  borderRadius: "10px",
                  padding: "10px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "18px" }}>🎉</span>
                  <strong style={{ color: "#34D399", fontSize: "13px" }}>
                    เรนเดอร์ Master Video สำเร็จสมบูรณ์ (100% Verified)
                  </strong>
                </div>
                <span style={{ fontSize: "11px", color: "#A7F3D0" }}>
                  ใช้เวลาเรนเดอร์ {((job.renderTimeMs ?? 0) / 1000).toFixed(1)} วินาที
                </span>
              </div>

              {/* HTML5 Native Video Player */}
              {job.fileUrl && (
                <div
                  style={{
                    width: "100%",
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: "1px solid rgba(229, 169, 60, 0.4)",
                    backgroundColor: "#000",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.8)"
                  }}
                >
                  <video
                    src={job.fileUrl}
                    controls
                    autoPlay={false}
                    style={{
                      width: "100%",
                      maxHeight: "360px",
                      display: "block"
                    }}
                  />
                </div>
              )}

              {/* Telemetry Pill Grid */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "10px",
                  padding: "10px 16px",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "10px",
                  fontSize: "12px"
                }}
              >
                <div>
                  <span style={{ fontSize: "10px", color: "#64748B" }}>ขนาดไฟล์</span>
                  <div style={{ fontWeight: 700, color: "#38BDF8" }}>{formatBytes(job.sizeBytes)}</div>
                </div>
                <div>
                  <span style={{ fontSize: "10px", color: "#64748B" }}>ความยาววิดีโอ</span>
                  <div style={{ fontWeight: 700, color: "#FBBF24" }}>{formatDuration(job.durationMs)}</div>
                </div>
                <div>
                  <span style={{ fontSize: "10px", color: "#64748B" }}>จำนวนเฟรม</span>
                  <div style={{ fontWeight: 700, color: "#A7F3D0" }}>{job.totalFrames} เฟรม (25fps)</div>
                </div>
              </div>

              {/* Path Display & Copy Button */}
              {job.outputPath && (
                <div
                  style={{
                    background: "#060A12",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px"
                  }}
                >
                  <span style={{ fontSize: "11px", fontFamily: "monospace", color: "#CBD5E1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    📁 {job.outputPath}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyPath}
                    style={{
                      background: copied ? "rgba(16, 185, 129, 0.3)" : "rgba(255, 255, 255, 0.1)",
                      border: `1px solid ${copied ? "#10B981" : "rgba(255, 255, 255, 0.2)"}`,
                      color: copied ? "#34D399" : "#F8FAFC",
                      borderRadius: "6px",
                      padding: "4px 10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: "pointer",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {copied ? "✓ คัดลอกแล้ว" : "📋 คัดลอก Path"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STAGE 4: FAILED */}
          {stage === "failed" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "10px 0" }}>
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  borderRadius: "10px",
                  padding: "16px",
                  color: "#FCA5A5"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 800, marginBottom: "8px" }}>
                  <span>⚠️</span> การ Render ไม่สำเร็จ
                </div>
                <div style={{ fontSize: "12px", fontFamily: "monospace", background: "rgba(0,0,0,0.4)", padding: "10px", borderRadius: "6px", overflowX: "auto" }}>
                  {errorMsg || "Unknown render error"}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "10px",
            background: "rgba(6, 10, 18, 0.7)"
          }}
        >
          {stage === "config" && (
            <>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  color: "#94A3B8",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleStartRender}
                disabled={!outputDir.trim() || !fileName.trim() || loadingDefaults}
                style={{
                  background: "linear-gradient(135deg, #E5A93C 0%, #D97706 100%)",
                  border: "none",
                  color: "#0B132B",
                  padding: "8px 20px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(229, 169, 60, 0.4)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <span>🚀</span> เริ่ม Render Master Video
              </button>
            </>
          )}

          {stage === "rendering" && (
            <span style={{ fontSize: "12px", color: "#E5A93C", fontWeight: 700 }}>
              ⏳ กำลังประมวลผลวิดีโอ กรุณารอสักครู่...
            </span>
          )}

          {stage === "completed" && (
            <>
              {job?.fileUrl && (
                <a
                  href={job.fileUrl}
                  download={job.fileName || "master_video.mp4"}
                  style={{
                    background: "rgba(59, 130, 246, 0.2)",
                    border: "1px solid #3B82F6",
                    color: "#93C5FD",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <span>⬇</span> ดาวน์โหลด MP4
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                  border: "none",
                  color: "#FFFFFF",
                  padding: "8px 20px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 800,
                  cursor: "pointer"
                }}
              >
                ✕ ปิดหน้าต่าง
              </button>
            </>
          )}

          {stage === "failed" && (
            <>
              <button
                type="button"
                onClick={() => setStage("config")}
                style={{
                  background: "rgba(239, 68, 68, 0.2)",
                  border: "1px solid #EF4444",
                  color: "#FCA5A5",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                ↺ ลองใหม่อีกครั้ง
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  color: "#94A3B8",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                ปิด
              </button>
            </>
          )}
        </div>
      </div>

      {/* Directory Browse Modal */}
      {isFolderPickerOpen && (
        <RemoteFilePickerModal
          isOpen={isFolderPickerOpen}
          mode="folder"
          initialPath={outputDir || ""}
          title="เลือกโฟลเดอร์ปลายทางสำหรับบันทึก Master Video (Local / NAS)"
          onSelect={(selectedFolder) => {
            setOutputDir(selectedFolder);
            setIsFolderPickerOpen(false);
          }}
          onClose={() => setIsFolderPickerOpen(false)}
        />
      )}
    </div>
  );
};
