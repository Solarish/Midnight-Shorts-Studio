import React, { useState, useEffect, useRef, useMemo } from "react";
import type { Storyboard, StoryboardItem } from "../storyboard-types";

interface InlineTimelinePlayerModalProps {
  storyboard: Storyboard;
  onClose: () => void;
  initialAspect?: "9:16" | "16:9" | "1:1";
}

function formatTimecode(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

export const InlineTimelinePlayerModal: React.FC<InlineTimelinePlayerModalProps> = ({
  storyboard,
  onClose,
  initialAspect = "16:9"
}) => {
  const [aspect, setAspect] = useState<"9:16" | "16:9" | "1:1">(initialAspect);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [volume, setVolume] = useState(1);
  const [remotionPort, setRemotionPort] = useState(() => {
    return localStorage.getItem("remotion_studio_port") || "47661";
  });
  const [showPortSettings, setShowPortSettings] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playTimerRef = useRef<number | null>(null);

  // Calculate timeline schedule
  const schedule = useMemo(() => {
    let offset = 0;
    return storyboard.items.map((item, idx) => {
      const duration = item.kind === "note" ? 0 : (item.durationMs || 4000);
      const start = offset;
      const end = offset + duration;
      offset = end;
      return {
        index: idx,
        item,
        startMs: start,
        endMs: end,
        durationMs: duration
      };
    });
  }, [storyboard.items]);

  const totalDurationMs = useMemo(() => {
    if (schedule.length === 0) return 0;
    const last = schedule[schedule.length - 1];
    return last ? last.endMs : 0;
  }, [schedule]);

  // Current active scene
  const activeScene = useMemo(() => {
    return schedule.find((s) => currentMs >= s.startMs && currentMs < s.endMs) || schedule[0];
  }, [schedule, currentMs]);

  // Active A-roll video source
  const arollVideoSrc = useMemo(() => {
    if (!activeScene || activeScene.item.kind !== "a_roll") return undefined;
    const sourcePath = activeScene.item.params?.sourcePath as string | undefined;
    if (!sourcePath) return undefined;
    return `/api/v1/media/stream?path=${encodeURIComponent(sourcePath)}`;
  }, [activeScene]);

  // Handle playback timer
  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      if (videoRef.current) videoRef.current.pause();
      return;
    }

    const intervalMs = 40; // 25fps clock
    const timer = window.setInterval(() => {
      setCurrentMs((prev) => {
        const next = prev + intervalMs;
        if (next >= totalDurationMs) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
    }, intervalMs);

    playTimerRef.current = timer;
    if (videoRef.current && arollVideoSrc) {
      videoRef.current.play().catch(() => {});
    }

    return () => clearInterval(timer);
  }, [isPlaying, totalDurationMs, arollVideoSrc]);

  // Sync video time within current A-roll scene
  useEffect(() => {
    if (!videoRef.current || !activeScene || activeScene.item.kind !== "a_roll") return;
    const sceneElapsedSec = (currentMs - activeScene.startMs) / 1000;
    const sourceInSec = Number(activeScene.item.params?.sourceInMs || 0) / 1000;
    const targetVideoTime = sourceInSec + sceneElapsedSec;

    if (Math.abs(videoRef.current.currentTime - targetVideoTime) > 0.4) {
      videoRef.current.currentTime = Math.max(0, targetVideoTime);
    }
  }, [currentMs, activeScene]);

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const targetMs = Number(e.target.value);
    setCurrentMs(targetMs);
  }

  function handleJumpScene(targetIndex: number) {
    if (targetIndex >= 0 && targetIndex < schedule.length) {
      const target = schedule[targetIndex];
      if (target) setCurrentMs(target.startMs);
    }
  }

  const currentHost = typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
  const remotionUrl = `http://${currentHost}:${remotionPort}`;

  // Aspect ratio styling for preview player
  const playerWidth = aspect === "9:16" ? 360 : aspect === "1:1" ? 540 : 720;
  const playerHeight = aspect === "9:16" ? 640 : aspect === "1:1" ? 540 : 405;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(3, 7, 18, 0.88)",
        backdropFilter: "blur(12px)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Prompt', sans-serif"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1080px",
          maxHeight: "92vh",
          backgroundColor: "#0B1220",
          borderRadius: "20px",
          border: "1px solid rgba(59, 130, 246, 0.3)",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(37, 99, 235, 0.15)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 24px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            backgroundColor: "rgba(15, 23, 42, 0.6)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "20px" }}>🎬</span>
            <div>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#F8FAFC" }}>
                Live Storyboard Timeline Player (Embedded)
              </h2>
              <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#94A3B8" }}>
                {storyboard.name} · {schedule.length} Scenes · {formatTimecode(totalDurationMs)} Total
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Aspect Selector */}
            <div style={{ display: "flex", background: "#1E293B", borderRadius: "8px", padding: "2px" }}>
              {(["9:16", "16:9", "1:1"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAspect(mode)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    backgroundColor: aspect === mode ? "#3B82F6" : "transparent",
                    color: aspect === mode ? "#FFFFFF" : "#94A3B8"
                  }}
                >
                  {mode === "9:16" ? "📱 9:16" : mode === "16:9" ? "🖥️ 16:9" : "⏹️ 1:1"}
                </button>
              ))}
            </div>

            {/* Remotion Studio Tab Link */}
            <a
              href={remotionUrl}
              target="_blank"
              rel="noreferrer"
              title={`Open Remotion Studio at ${remotionUrl}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "8px",
                backgroundColor: "rgba(59, 130, 246, 0.15)",
                border: "1px solid rgba(59, 130, 246, 0.4)",
                color: "#60A5FA",
                fontSize: "12px",
                fontWeight: 600,
                textDecoration: "none"
              }}
            >
              🚀 Remotion Studio ({remotionPort})
            </a>

            <button
              type="button"
              onClick={() => setShowPortSettings((v) => !v)}
              title="Configure Remotion Studio Port"
              style={{
                background: "transparent",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "8px",
                color: "#94A3B8",
                padding: "6px 10px",
                cursor: "pointer"
              }}
            >
              ⚙️
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: "#1E293B",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                color: "#F8FAFC",
                padding: "6px 12px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              ✕ ปิด
            </button>
          </div>
        </div>

        {/* Port settings dropdown if toggled */}
        {showPortSettings && (
          <div
            style={{
              padding: "10px 24px",
              backgroundColor: "#1E293B",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontSize: "12px",
              color: "#CBD5E1"
            }}
          >
            <span>ตั้งค่าพอร์ต Remotion Studio (Default: 47661):</span>
            <input
              type="number"
              value={remotionPort}
              onChange={(e) => {
                setRemotionPort(e.target.value);
                localStorage.setItem("remotion_studio_port", e.target.value);
              }}
              style={{
                width: "80px",
                padding: "4px 8px",
                background: "#0F172A",
                border: "1px solid #3B82F6",
                borderRadius: "4px",
                color: "#FFFFFF",
                fontSize: "12px"
              }}
            />
            <span style={{ color: "#64748B" }}>
              Target URL: <code>http://{currentHost}:{remotionPort}</code>
            </span>
          </div>
        )}

        {/* Main Stage Preview */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            backgroundColor: "#050811",
            minHeight: "360px",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              width: `${playerWidth}px`,
              height: `${playerHeight}px`,
              backgroundColor: "#0B1220",
              borderRadius: "16px",
              overflow: "hidden",
              position: "relative",
              border: "2px solid rgba(229, 169, 60, 0.3)",
              boxShadow: "0 16px 48px rgba(0, 0, 0, 0.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            {/* 1. Cover Card Scene Rendering */}
            {activeScene?.item.kind === "cover_card" && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "radial-gradient(circle at center, #1E293B 0%, #0B1220 100%)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: aspect === "9:16" ? "center" : "flex-end",
                  padding: aspect === "9:16" ? "0 8%" : "0 8% 8% 8%",
                  color: "#FFFFFF",
                  textAlign: aspect === "9:16" ? "center" : "left"
                }}
              >
                <div style={{ color: "#E5A93C", fontSize: "14px", fontWeight: 700, marginBottom: "8px", textTransform: "uppercase" }}>
                  {(activeScene.item.params?.eyebrow as string) || "✦ อาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙ ✦"}
                </div>
                <div style={{ fontSize: aspect === "9:16" ? "24px" : "28px", fontWeight: 800, lineHeight: 1.3, marginBottom: "10px" }}>
                  {(activeScene.item.params?.title as string) || (activeScene.item.params?.personName as string) || "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์"}
                </div>
                <div style={{ color: "#00E5FF", fontSize: "14px", fontWeight: 500 }}>
                  {(activeScene.item.params?.subtitle as string) || (activeScene.item.params?.positionTitle as string) || "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์"}
                </div>
              </div>
            )}

            {/* 2. Title Card Scene Rendering */}
            {activeScene?.item.kind === "title" && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "radial-gradient(circle at center, #0F172A 0%, #030712 100%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "24px",
                  textAlign: "center"
                }}
              >
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>👑</div>
                <div style={{ fontSize: "24px", fontWeight: 900, color: "#E5A93C", marginBottom: "8px" }}>
                  {(activeScene.item.params?.title as string) || "PSU BROADCAST"}
                </div>
                <div style={{ fontSize: "14px", color: "#00E5FF", fontWeight: 600 }}>
                  {(activeScene.item.params?.subtitle as string) || "3D Carousel Showcase"}
                </div>
              </div>
            )}

            {/* 3. Outro Logo Scene Rendering */}
            {activeScene?.item.kind === "logo_outro" && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: "#070B14",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <div
                  style={{
                    width: "80px",
                    height: "80px",
                    borderRadius: "40px",
                    border: "3px solid #E5A93C",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#E5A93C",
                    fontSize: "24px",
                    fontWeight: 900,
                    marginBottom: "16px"
                  }}
                >
                  PSU
                </div>
                <div style={{ color: "#FFFFFF", fontSize: "20px", fontWeight: 800 }}>PSU BROADCAST</div>
                <div style={{ color: "#00E5FF", fontSize: "12px", marginTop: "4px" }}>PRINCE OF SONGKLA UNIVERSITY</div>
              </div>
            )}

            {/* 4. A-Roll Video Stream Player */}
            {activeScene?.item.kind === "a_roll" && (
              <div style={{ position: "absolute", inset: 0, backgroundColor: "#000000" }}>
                {arollVideoSrc ? (
                  <video
                    ref={videoRef}
                    src={arollVideoSrc}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover"
                    }}
                    muted={volume === 0}
                    playsInline
                  />
                ) : (
                  <div
                    style={{
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#94A3B8"
                    }}
                  >
                    <span style={{ fontSize: "28px", marginBottom: "8px" }}>🎥</span>
                    <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#E5A93C" }}>
                      {(activeScene.item.params?.speaker as string) || "A-Roll Interview"}
                    </p>
                  </div>
                )}

                {/* Subtitles Overlay */}
                {Boolean(activeScene.item.params?.dialogue) && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: aspect === "9:16" ? "18%" : "10%",
                      left: "6%",
                      right: "6%",
                      padding: "10px 16px",
                      borderRadius: "12px",
                      backgroundColor: "rgba(11, 18, 32, 0.85)",
                      border: "1px solid rgba(229, 169, 60, 0.3)",
                      backdropFilter: "blur(8px)",
                      color: "#FFFFFF",
                      fontSize: aspect === "9:16" ? "14px" : "15px",
                      fontWeight: 600,
                      textAlign: "center",
                      lineHeight: 1.4
                    }}
                  >
                    {activeScene.item.params?.dialogue as string}
                  </div>
                )}
              </div>
            )}

            {/* Watermark badge */}
            <div
              style={{
                position: "absolute",
                top: "12px",
                left: "12px",
                padding: "4px 8px",
                borderRadius: "6px",
                backgroundColor: "rgba(0, 0, 0, 0.6)",
                backdropFilter: "blur(6px)",
                color: "#E5A93C",
                fontSize: "11px",
                fontWeight: 700,
                zIndex: 40
              }}
            >
              Scene {activeScene ? activeScene.index + 1 : 1}: [{activeScene?.item.kind.toUpperCase()}]
            </div>
          </div>
        </div>

        {/* Timeline Track Scrubber & Control Panel */}
        <div style={{ padding: "16px 24px", backgroundColor: "#0F172A", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
          {/* Multi-Track Scene Blocks */}
          <div
            style={{
              display: "flex",
              height: "28px",
              borderRadius: "8px",
              overflow: "hidden",
              backgroundColor: "#1E293B",
              marginBottom: "8px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              position: "relative"
            }}
          >
            {schedule.map((s) => {
              const widthPct = totalDurationMs > 0 ? (s.durationMs / totalDurationMs) * 100 : 0;
              const isActive = activeScene?.index === s.index;

              const bgMap = {
                cover_card: "linear-gradient(135deg, #F59E0B, #D97706)",
                title: "linear-gradient(135deg, #3B82F6, #1D4ED8)",
                a_roll: "linear-gradient(135deg, #10B981, #047857)",
                logo_outro: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
                note: "linear-gradient(135deg, #64748B, #475569)"
              };

              return (
                <div
                  key={s.item.id}
                  onClick={() => handleJumpScene(s.index)}
                  title={`Scene ${s.index + 1}: [${s.item.kind}] ${formatTimecode(s.startMs)} - ${formatTimecode(s.endMs)}`}
                  style={{
                    width: `${widthPct}%`,
                    height: "100%",
                    background: bgMap[s.item.kind as keyof typeof bgMap] || bgMap.a_roll,
                    opacity: isActive ? 1 : 0.65,
                    borderRight: "1px solid rgba(0, 0, 0, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "10px",
                    fontWeight: 700,
                    color: "#FFFFFF",
                    cursor: "pointer",
                    transition: "opacity 0.15s ease",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    padding: "0 2px"
                  }}
                >
                  {widthPct > 4 ? `S${s.index + 1}` : ""}
                </div>
              );
            })}

            {/* Playhead Marker */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${totalDurationMs > 0 ? (currentMs / totalDurationMs) * 100 : 0}%`,
                width: "3px",
                backgroundColor: "#EF4444",
                boxShadow: "0 0 8px #EF4444",
                pointerEvents: "none"
              }}
            />
          </div>

          {/* Range Slider */}
          <input
            type="range"
            min={0}
            max={totalDurationMs}
            value={currentMs}
            onChange={handleSeek}
            style={{
              width: "100%",
              height: "6px",
              accentColor: "#3B82F6",
              cursor: "pointer",
              marginBottom: "12px"
            }}
          />

          {/* Playback Controls & Timecode */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={() => handleJumpScene((activeScene?.index || 0) - 1)}
                style={{
                  background: "#1E293B",
                  border: "none",
                  borderRadius: "6px",
                  color: "#94A3B8",
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontSize: "12px"
                }}
              >
                ⏮ ก่อนหน้า
              </button>

              <button
                type="button"
                onClick={() => setIsPlaying((v) => !v)}
                style={{
                  background: isPlaying ? "#EF4444" : "#3B82F6",
                  border: "none",
                  borderRadius: "8px",
                  color: "#FFFFFF",
                  padding: "8px 20px",
                  fontWeight: 700,
                  fontSize: "14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                {isPlaying ? "⏸ พัก" : "▶ เล่น"}
              </button>

              <button
                type="button"
                onClick={() => handleJumpScene((activeScene?.index || 0) + 1)}
                style={{
                  background: "#1E293B",
                  border: "none",
                  borderRadius: "6px",
                  color: "#94A3B8",
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontSize: "12px"
                }}
              >
                ถัดไป ⏭
              </button>

              <button
                type="button"
                onClick={() => setVolume((v) => (v === 0 ? 1 : 0))}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "6px",
                  color: "#94A3B8",
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontSize: "12px"
                }}
              >
                {volume === 0 ? "🔇 Mute" : "🔊 Sound"}
              </button>
            </div>

            {/* Timecode & Active Scene Info */}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "#F8FAFC", fontFamily: "monospace" }}>
                {formatTimecode(currentMs)} <span style={{ color: "#64748B" }}>/ {formatTimecode(totalDurationMs)}</span>
              </div>
              <div style={{ fontSize: "12px", color: "#E5A93C", fontWeight: 600 }}>
                {activeScene ? `Scene ${activeScene.index + 1}: ${activeScene.item.params?.title || activeScene.item.params?.speaker || activeScene.item.id}` : ""}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
