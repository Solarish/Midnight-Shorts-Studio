import React, { useState, useMemo } from "react";
import { Player } from "@remotion/player";
import { StoryboardSequence, type StoryboardAssemblyProps, type StoryboardItemProps } from "@psu-ava/remotion-studio";
import type { Storyboard } from "../storyboard-types";

interface InlineTimelinePlayerModalProps {
  storyboard: Storyboard;
  onClose: () => void;
  initialAspect?: "9:16" | "16:9" | "1:1";
}

function formatTimecode(frames: number, fps = 25): string {
  const totalSeconds = Math.max(0, Math.floor(frames / fps));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const frameRem = frames % fps;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frameRem).padStart(2, "0")}`;
}

export const InlineTimelinePlayerModal: React.FC<InlineTimelinePlayerModalProps> = ({
  storyboard,
  onClose,
  initialAspect = "16:9"
}) => {
  const [aspect, setAspect] = useState<"9:16" | "16:9" | "1:1">(initialAspect);

  // Convert active storyboard to Remotion Assembly Props
  const remotionProps: StoryboardAssemblyProps & { aspectRatio: "9:16" | "16:9" | "1:1" } = useMemo(() => {
    const items: StoryboardItemProps[] = (storyboard.items || []).map((item, idx) => {
      const p = item.params || {};
      return {
        id: item.id || `item_${idx + 1}`,
        kind: item.kind,
        durationMs: Number(item.durationMs) || 4000,
        presetId: item.presetId,
        audioPolicy: item.audioPolicy,
        params: {
          ...p,
          title: (p.title || p.personName || (p.texts as any)?.title) as string | undefined,
          subtitle: (p.subtitle || p.positionTitle || (p.texts as any)?.subtitle) as string | undefined,
          eyebrow: (p.eyebrow || p.award || (p.texts as any)?.eyebrow) as string | undefined,
          speaker: (p.speaker || p.personName) as string | undefined,
          dialogue: (p.dialogue || p.soundNote || p.text) as string | undefined,
          sourcePath: p.sourcePath as string | undefined,
          sourceInMs: p.sourceInMs as number | undefined,
          sourceOutMs: p.sourceOutMs as number | undefined,
          motionPreset: (p.motionPreset || (item.kind === "cover_card" ? "Spring" : "ZoomPunch")) as any
        },
        broll: (item.broll || []).map((b, bIdx) => ({
          id: b.id || `broll_${idx}_${bIdx}`,
          assetPath: b.asset?.path,
          offsetMs: b.offsetMs ?? 0,
          durationMs: b.durationMs ?? 3000,
          preset: (b as any).preset || "none",
          fit: b.fit || "cover",
          audioPolicy: b.audioPolicy || "mute",
          title: b.note,
          description: b.note
        }))
      };
    });

    const totalMs = items.reduce((sum, it) => sum + (it.durationMs || 0), 0);
    const durationInFrames = Math.max(1, Math.round((totalMs / 1000) * 25));

    return {
      storyboardId: storyboard.storyboardId,
      title: storyboard.name,
      fps: 25,
      durationInFrames,
      aspectRatio: aspect,
      theme: {
        primaryColor: "#E5A93C",
        secondaryColor: "#0B1220",
        accentColor: "#00E5FF",
        textColor: "#FFFFFF",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Prompt', 'Kanit', sans-serif"
      },
      items
    };
  }, [storyboard, aspect]);

  const totalFrames = remotionProps.durationInFrames || 250;
  const compWidth = aspect === "9:16" ? 1080 : aspect === "1:1" ? 1080 : 1920;
  const compHeight = aspect === "9:16" ? 1920 : aspect === "1:1" ? 1080 : 1080;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(3, 7, 18, 0.92)",
        backdropFilter: "blur(16px)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Prompt', sans-serif"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1160px",
          maxHeight: "94vh",
          backgroundColor: "#0B1220",
          borderRadius: "20px",
          border: "1px solid rgba(59, 130, 246, 0.35)",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.9), 0 0 50px rgba(37, 99, 235, 0.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 24px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            backgroundColor: "rgba(15, 23, 42, 0.8)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "22px" }}>🎬</span>
            <div>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#F8FAFC" }}>
                Native Remotion Studio Player (Single Port)
              </h2>
              <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#94A3B8" }}>
                {storyboard.name} · {remotionProps.items?.length || 0} Scenes · {formatTimecode(totalFrames)} ({Math.round(totalFrames / 25)}s)
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Aspect Ratio Mode Switcher */}
            <div style={{ display: "flex", background: "#1E293B", borderRadius: "8px", padding: "2px" }}>
              {(["16:9", "9:16", "1:1"] as const).map((mode) => {
                const isLocked = mode !== "16:9";
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={isLocked}
                    onClick={() => !isLocked && setAspect(mode)}
                    title={isLocked ? "Auto-Compositing สำหรับขนาดนี้อยู่ระหว่างพัฒนา (เปิดใช้งาน 16:9 เท่านั้น)" : "16:9 Broadcast Master"}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "none",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: isLocked ? "not-allowed" : "pointer",
                      opacity: isLocked ? 0.35 : 1,
                      backgroundColor: aspect === mode ? "#3B82F6" : "transparent",
                      color: aspect === mode ? "#FFFFFF" : "#94A3B8",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {mode === "16:9" ? "🖥️ 16:9 Master" : mode === "9:16" ? "📱 9:16 (เร็วๆ นี้)" : "⏹️ 1:1 (เร็วๆ นี้)"}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: "#1E293B",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "8px",
                color: "#F8FAFC",
                padding: "6px 14px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              ✕ ปิด
            </button>
          </div>
        </div>

        {/* Real Native Remotion Player */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            backgroundColor: "#050811",
            minHeight: "480px",
            maxHeight: "75vh",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              width: aspect === "9:16" ? "360px" : aspect === "1:1" ? "520px" : "800px",
              height: aspect === "9:16" ? "640px" : aspect === "1:1" ? "520px" : "450px",
              maxWidth: "100%",
              maxHeight: "100%",
              borderRadius: "16px",
              overflow: "hidden",
              border: "2px solid rgba(229, 169, 60, 0.4)",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.95)",
              backgroundColor: "#0B1220"
            }}
          >
            <Player
              component={StoryboardSequence}
              inputProps={remotionProps}
              durationInFrames={totalFrames}
              fps={25}
              compositionWidth={compWidth}
              compositionHeight={compHeight}
              style={{
                width: "100%",
                height: "100%"
              }}
              controls
              autoPlay={false}
              loop
            />
          </div>
        </div>

        {/* Footer info */}
        <div
          style={{
            padding: "12px 24px",
            backgroundColor: "#0F172A",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "12px",
            color: "#94A3B8"
          }}
        >
          <div>
            ⚡ <strong>Remotion Engine</strong> รันสดบน Native Browser (สตรีมมิ่งวิดีโอ A-Roll, B-Roll, Subtitle, Cover Card อัตโนมัติในพอร์ตเดียว)
          </div>
          <div style={{ color: "#E5A93C", fontWeight: 600 }}>
            {compWidth}×{compHeight} @ 25fps
          </div>
        </div>
      </div>
    </div>
  );
};
