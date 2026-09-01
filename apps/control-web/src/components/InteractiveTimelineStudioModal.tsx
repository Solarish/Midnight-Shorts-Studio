import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { StoryboardSequence, type StoryboardAssemblyProps, type StoryboardItemProps } from "@psu-ava/remotion-studio";
import type { Storyboard, StoryboardItem, StoryboardKind } from "../storyboard-types";
import { RemoteFilePickerModal } from "./RemoteFilePickerModal";

interface InteractiveTimelineStudioModalProps {
  storyboard: Storyboard;
  onMutate: (updater: (prev: Storyboard) => Storyboard) => void;
  onClose: () => void;
  initialAspect?: "9:16" | "16:9" | "1:1";
}

function formatTimecode(frames: number, fps = 25): string {
  const totalSeconds = Math.max(0, Math.floor(frames / fps));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const frameRem = frames % fps;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(frameRem).padStart(2, "0")}`;
}

function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

export const InteractiveTimelineStudioModal: React.FC<InteractiveTimelineStudioModalProps> = ({
  storyboard,
  onMutate,
  onClose,
  initialAspect = "16:9"
}) => {
  const [aspect, setAspect] = useState<"9:16" | "16:9" | "1:1">(initialAspect);
  const [selectedItemId, setSelectedItemId] = useState<string>(() => storyboard.items[0]?.id || "");
  const [selectedBrollId, setSelectedBrollId] = useState<string>("");
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1 = normal, 2 = zoomed in, 0.5 = compact
  const [filePickerField, setFilePickerField] = useState<{ open: boolean; target: "sourcePath" | "sourceImage" | "broll"; brollId?: string }>({ open: false, target: "sourcePath" });

  const playerRef = useRef<PlayerRef>(null);
  const timelineRulerRef = useRef<HTMLDivElement>(null);

  // Sync player time to currentFrame state
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onFrameUpdate = (e: { detail: { frame: number } }) => {
      setCurrentFrame(e.detail.frame);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    player.addEventListener("frameupdate", onFrameUpdate);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);

    return () => {
      player.removeEventListener("frameupdate", onFrameUpdate);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
    };
  }, []);

  // Compute timeline track schedule
  const schedule = useMemo(() => {
    let offsetMs = 0;
    return (storyboard.items || []).map((item, idx) => {
      const durationMs = item.kind === "note" ? 0 : (item.durationMs || 4000);
      const startMs = offsetMs;
      const endMs = offsetMs + durationMs;
      offsetMs = endMs;

      const startFrame = Math.round((startMs / 1000) * 25);
      const durationFrames = Math.max(1, Math.round((durationMs / 1000) * 25));
      const endFrame = startFrame + durationFrames;

      return {
        index: idx,
        item,
        startMs,
        endMs,
        durationMs,
        startFrame,
        durationFrames,
        endFrame
      };
    });
  }, [storyboard.items]);

  const totalDurationMs = useMemo(() => {
    if (schedule.length === 0) return 0;
    const last = schedule[schedule.length - 1];
    return last ? last.endMs : 0;
  }, [schedule]);

  const totalDurationFrames = useMemo(() => {
    if (schedule.length === 0) return 250;
    const last = schedule[schedule.length - 1];
    return last ? last.endFrame : 250;
  }, [schedule]);

  // Selected active item
  const selectedScene = useMemo(() => {
    return schedule.find((s) => s.item.id === selectedItemId) || schedule[0];
  }, [schedule, selectedItemId]);

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
          preset: "Spring",
          fit: b.fit || "cover",
          audioPolicy: b.audioPolicy || "mute",
          title: b.note,
          description: b.note
        }))
      };
    });

    return {
      storyboardId: storyboard.storyboardId,
      title: storyboard.name,
      fps: 25,
      durationInFrames: totalDurationFrames,
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
  }, [storyboard, aspect, totalDurationFrames]);

  // Jump player to a specific frame
  const seekToFrame = useCallback((frame: number) => {
    const target = Math.max(0, Math.min(totalDurationFrames - 1, frame));
    setCurrentFrame(target);
    if (playerRef.current) {
      playerRef.current.seekTo(target);
    }
  }, [totalDurationFrames]);

  // Jump to specific scene start
  const jumpToScene = useCallback((sceneIndex: number) => {
    if (sceneIndex >= 0 && sceneIndex < schedule.length) {
      const targetScene = schedule[sceneIndex];
      if (targetScene) {
        setSelectedItemId(targetScene.item.id);
        setSelectedBrollId("");
        seekToFrame(targetScene.startFrame);
      }
    }
  }, [schedule, seekToFrame]);

  // Handle clicking on Timeline ruler or tracks
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRulerRef.current) return;
    const rect = timelineRulerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const targetFrame = Math.round(pct * totalDurationFrames);
    seekToFrame(targetFrame);
  };

  // Scene editing helpers
  const updateSelectedSceneDuration = (deltaMs: number) => {
    if (!selectedScene) return;
    const newDuration = Math.max(1000, (selectedScene.item.durationMs || 4000) + deltaMs);
    onMutate((prev) => ({
      ...prev,
      items: prev.items.map((it) => it.id === selectedScene.item.id ? { ...it, durationMs: newDuration } : it)
    }));
  };

  const updateSelectedSceneParams = (key: string, value: any) => {
    if (!selectedScene) return;
    onMutate((prev) => ({
      ...prev,
      items: prev.items.map((it) => it.id === selectedScene.item.id ? {
        ...it,
        params: { ...it.params, [key]: value }
      } : it)
    }));
  };

  const compWidth = aspect === "9:16" ? 1080 : aspect === "1:1" ? 1080 : 1920;
  const compHeight = aspect === "9:16" ? 1920 : aspect === "1:1" ? 1080 : 1080;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(3, 7, 18, 0.96)",
        backdropFilter: "blur(20px)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Prompt', 'Kanit', sans-serif",
        color: "#F8FAFC"
      }}
    >
      {/* 1. Studio Top Navigation & Global Controls */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 24px",
          backgroundColor: "#0B1220",
          borderBottom: "1px solid rgba(59, 130, 246, 0.3)",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.6)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "24px" }}>🎞️</span>
            <div>
              <h1 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#F8FAFC" }}>
                Interactive Storyboard Timeline Editor
              </h1>
              <p style={{ margin: 0, fontSize: "12px", color: "#94A3B8" }}>
                {storyboard.name} · {schedule.length} Scenes · {formatTimecode(totalDurationFrames)} Total
              </p>
            </div>
          </div>
        </div>

        {/* Center Aspect Ratio Switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 600 }}>Format:</span>
          <div style={{ display: "flex", background: "#1E293B", borderRadius: "8px", padding: "3px" }}>
            {(["9:16", "16:9", "1:1"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setAspect(mode)}
                style={{
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  backgroundColor: aspect === mode ? "#3B82F6" : "transparent",
                  color: aspect === mode ? "#FFFFFF" : "#94A3B8",
                  transition: "all 0.15s ease"
                }}
              >
                {mode === "9:16" ? "📱 9:16 (Shorts)" : mode === "16:9" ? "🖥️ 16:9 (Broadcast)" : "⏹️ 1:1 (Square)"}
              </button>
            ))}
          </div>
        </div>

        {/* Right Close button */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#1E293B",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "8px",
              color: "#F8FAFC",
              padding: "6px 16px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            ✕ บันทึก &amp; กลับสู่หน้าหลัก
          </button>
        </div>
      </header>

      {/* 2. Middle Workstage: Live Player (Left) + Scene Inspector (Right) */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden", backgroundColor: "#060A12" }}>
        {/* Left: Native Remotion Preview Screen */}
        <div
          style={{
            flex: "1 1 55%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            backgroundColor: "#050811",
            borderRight: "1px solid rgba(255, 255, 255, 0.08)",
            position: "relative"
          }}
        >
          {/* Aspect bounded frame */}
          <div
            style={{
              width: aspect === "9:16" ? "280px" : aspect === "1:1" ? "420px" : "640px",
              height: aspect === "9:16" ? "498px" : aspect === "1:1" ? "420px" : "360px",
              maxWidth: "100%",
              maxHeight: "100%",
              borderRadius: "14px",
              overflow: "hidden",
              border: "2px solid rgba(229, 169, 60, 0.45)",
              boxShadow: "0 16px 48px rgba(0, 0, 0, 0.95)",
              backgroundColor: "#0B1220"
            }}
          >
            <Player
              ref={playerRef}
              component={StoryboardSequence}
              inputProps={remotionProps}
              durationInFrames={totalDurationFrames}
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

          {/* Quick HUD badge */}
          <div
            style={{
              marginTop: "10px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontSize: "12px",
              color: "#94A3B8"
            }}
          >
            <span>Timecode: <strong style={{ color: "#F8FAFC", fontFamily: "monospace" }}>{formatTimecode(currentFrame)}</strong></span>
            <span>·</span>
            <span>Frame: <strong style={{ color: "#60A5FA" }}>{currentFrame} / {totalDurationFrames}</strong></span>
            <span>·</span>
            <span>Scene: <strong style={{ color: "#E5A93C" }}>{selectedScene ? selectedScene.index + 1 : 1} of {schedule.length}</strong></span>
          </div>
        </div>

        {/* Right: Live Selected Scene Inspector & Fast Editor */}
        <div
          style={{
            flex: "1 1 45%",
            padding: "20px 24px",
            overflowY: "auto",
            backgroundColor: "#0B1220",
            display: "flex",
            flexDirection: "column",
            gap: "16px"
          }}
        >
          {selectedScene ? (
            <>
              {/* Scene Header Card */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  backgroundColor: "#1E293B",
                  border: "1px solid rgba(59, 130, 246, 0.3)"
                }}
              >
                <div>
                  <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#60A5FA", fontWeight: 700, letterSpacing: "0.05em" }}>
                    Scene {selectedScene.index + 1} of {schedule.length}
                  </span>
                  <h3 style={{ margin: "2px 0 0 0", fontSize: "16px", fontWeight: 800, color: "#FFFFFF" }}>
                    [{selectedScene.item.kind.toUpperCase()}] {selectedScene.item.id}
                  </h3>
                </div>

                {/* Duration Editor buttons */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    type="button"
                    onClick={() => updateSelectedSceneDuration(-1000)}
                    style={{ background: "#334155", border: "none", borderRadius: "6px", color: "#F8FAFC", padding: "4px 8px", cursor: "pointer", fontWeight: 700 }}
                  >
                    -1s
                  </button>
                  <span style={{ padding: "4px 10px", background: "#0F172A", borderRadius: "6px", fontSize: "13px", fontWeight: 700, color: "#E5A93C", border: "1px solid rgba(229,169,60,0.3)" }}>
                    {formatSeconds(selectedScene.item.durationMs || 4000)}s
                  </span>
                  <button
                    type="button"
                    onClick={() => updateSelectedSceneDuration(1000)}
                    style={{ background: "#334155", border: "none", borderRadius: "6px", color: "#F8FAFC", padding: "4px 8px", cursor: "pointer", fontWeight: 700 }}
                  >
                    +1s
                  </button>
                </div>
              </div>

              {/* A-Roll Editing Fields */}
              {selectedScene.item.kind === "a_roll" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                      📁 วิดีโอหลัก (A-Roll Footage):
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        value={(selectedScene.item.params.sourcePath as string) || ""}
                        onChange={(e) => updateSelectedSceneParams("sourcePath", e.target.value)}
                        placeholder="/Volumes/.../C7724.MP4"
                        style={{ flex: 1, padding: "8px 12px", background: "#1E293B", border: "1px solid #334155", borderRadius: "8px", color: "#FFFFFF", fontSize: "12px" }}
                      />
                      <button
                        type="button"
                        onClick={() => setFilePickerField({ open: true, target: "sourcePath" })}
                        style={{ padding: "8px 14px", background: "linear-gradient(135deg, #2563EB, #1D4ED8)", border: "none", borderRadius: "8px", color: "#FFFFFF", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                      >
                        🔍 เลือกจาก NAS
                      </button>
                    </div>
                  </div>

                  {/* Speaker & Dialogue Subtitles */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        ผู้พูด (Speaker):
                      </label>
                      <input
                        type="text"
                        value={(selectedScene.item.params.speaker as string) || ""}
                        onChange={(e) => updateSelectedSceneParams("speaker", e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", background: "#1E293B", border: "1px solid #334155", borderRadius: "8px", color: "#FFFFFF", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        บทพูด / คำบรรยาย (Dialogue Subtitle):
                      </label>
                      <input
                        type="text"
                        value={(selectedScene.item.params.dialogue as string) || ""}
                        onChange={(e) => updateSelectedSceneParams("dialogue", e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", background: "#1E293B", border: "1px solid #334155", borderRadius: "8px", color: "#FFFFFF", fontSize: "12px" }}
                      />
                    </div>
                  </div>

                  {/* Nested B-roll List on this A-Roll */}
                  <div style={{ marginTop: "8px", padding: "12px", background: "#0F172A", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <strong style={{ fontSize: "13px", color: "#60A5FA" }}>🎬 B-Roll Overlays ({selectedScene.item.broll?.length || 0})</strong>
                      <button
                        type="button"
                        onClick={() => {
                          const newBrollId = `broll_${Date.now()}`;
                          onMutate((prev) => ({
                            ...prev,
                            items: prev.items.map((it) => it.id === selectedScene.item.id ? {
                              ...it,
                              broll: [...(it.broll || []), {
                                id: newBrollId,
                                asset: { path: "" },
                                offsetMs: 1000,
                                durationMs: 3000,
                                audioPolicy: "mute",
                                fit: "cover",
                                note: "B-Roll Cut"
                              }]
                            } : it)
                          }));
                        }}
                        style={{ padding: "4px 10px", background: "#1E293B", border: "1px solid #3B82F6", borderRadius: "6px", color: "#60A5FA", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                      >
                        ＋ เพิ่ม B-Roll
                      </button>
                    </div>

                    {(selectedScene.item.broll || []).map((b, bIdx) => (
                      <div
                        key={b.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 10px",
                          backgroundColor: "#1E293B",
                          borderRadius: "8px",
                          marginBottom: "6px",
                          fontSize: "12px"
                        }}
                      >
                        <span style={{ color: "#E5A93C", fontWeight: 700 }}>#{bIdx + 1}</span>
                        <input
                          type="text"
                          value={b.asset.path}
                          onChange={(e) => {
                            const val = e.target.value;
                            onMutate((prev) => ({
                              ...prev,
                              items: prev.items.map((it) => it.id === selectedScene.item.id ? {
                                ...it,
                                broll: (it.broll || []).map((br) => br.id === b.id ? { ...br, asset: { ...br.asset, path: val } } : br)
                              } : it)
                            }));
                          }}
                          placeholder="เลือกไฟล์ B-Roll จาก NAS..."
                          style={{ flex: 1, padding: "4px 8px", background: "#0F172A", border: "1px solid #334155", borderRadius: "6px", color: "#FFFFFF", fontSize: "11px" }}
                        />
                        <button
                          type="button"
                          onClick={() => setFilePickerField({ open: true, target: "broll", brollId: b.id })}
                          style={{ padding: "4px 8px", background: "#3B82F6", border: "none", borderRadius: "6px", color: "#FFFFFF", fontSize: "11px", cursor: "pointer" }}
                        >
                          NAS
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cover Card Fields */}
              {selectedScene.item.kind === "cover_card" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                      ภาพพื้นหลัง / ภาพบุคคล (Source Image):
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        value={(selectedScene.item.params.sourceImage as string) || ""}
                        onChange={(e) => updateSelectedSceneParams("sourceImage", e.target.value)}
                        placeholder="/Volumes/.../DSC02129.JPG"
                        style={{ flex: 1, padding: "8px 12px", background: "#1E293B", border: "1px solid #334155", borderRadius: "8px", color: "#FFFFFF", fontSize: "12px" }}
                      />
                      <button
                        type="button"
                        onClick={() => setFilePickerField({ open: true, target: "sourceImage" })}
                        style={{ padding: "8px 14px", background: "linear-gradient(135deg, #2563EB, #1D4ED8)", border: "none", borderRadius: "8px", color: "#FFFFFF", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                      >
                        🔍 เลือกจาก NAS
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                      หัวข้อหลัก (Title / Person Name):
                    </label>
                    <input
                      type="text"
                      value={(selectedScene.item.params.title as string) || (selectedScene.item.params.personName as string) || ""}
                      onChange={(e) => updateSelectedSceneParams("title", e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", background: "#1E293B", border: "1px solid #334155", borderRadius: "8px", color: "#FFFFFF", fontSize: "12px" }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                      ตำแหน่ง / สังกัด (Subtitle / Position):
                    </label>
                    <input
                      type="text"
                      value={(selectedScene.item.params.subtitle as string) || (selectedScene.item.params.positionTitle as string) || ""}
                      onChange={(e) => updateSelectedSceneParams("subtitle", e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", background: "#1E293B", border: "1px solid #334155", borderRadius: "8px", color: "#FFFFFF", fontSize: "12px" }}
                    />
                  </div>
                </div>
              )}

              {/* Title 3D Carousel Showcase Fields */}
              {selectedScene.item.kind === "title" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ padding: "10px 14px", backgroundColor: "#1E293B", borderRadius: "8px", border: "1px solid #E5A93C55" }}>
                    <strong style={{ fontSize: "13px", color: "#E5A93C", display: "block" }}>🎡 3D Photo Carousel Showcase</strong>
                    <small style={{ color: "#94A3B8", fontSize: "11px" }}>วงแหวนภาพ 3 มิติ พร้อมข้อความเกียรติยศสีทอง</small>
                  </div>

                  <div>
                    <label style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                      หัวข้อหลัก (Main Title):
                    </label>
                    <input
                      type="text"
                      value={(selectedScene.item.params.title as string) || ""}
                      placeholder="อาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙"
                      onChange={(e) => updateSelectedSceneParams("title", e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", background: "#1E293B", border: "1px solid #334155", borderRadius: "8px", color: "#FFFFFF", fontSize: "12px" }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                      สังกัด / หน่วยงาน (Subtitle):
                    </label>
                    <input
                      type="text"
                      value={(selectedScene.item.params.subtitle as string) || ""}
                      placeholder="คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์"
                      onChange={(e) => updateSelectedSceneParams("subtitle", e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", background: "#1E293B", border: "1px solid #334155", borderRadius: "8px", color: "#FFFFFF", fontSize: "12px" }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                      ป้ายหัวเรื่อง (Eyebrow Badge):
                    </label>
                    <input
                      type="text"
                      value={(selectedScene.item.params.eyebrow as string) || ""}
                      placeholder="PSU BROADCAST SPECIAL REPORT"
                      onChange={(e) => updateSelectedSceneParams("eyebrow", e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", background: "#1E293B", border: "1px solid #334155", borderRadius: "8px", color: "#FFFFFF", fontSize: "12px" }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        ความเร็วการหมุน: {Number(selectedScene.item.params.rotationSpeed ?? 1.0).toFixed(1)}x
                      </label>
                      <input
                        type="range"
                        min="0.2"
                        max="3.0"
                        step="0.1"
                        value={Number(selectedScene.item.params.rotationSpeed ?? 1.0)}
                        onChange={(e) => updateSelectedSceneParams("rotationSpeed", Number(e.target.value))}
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        มุมเอียงกล้อง (Tilt): {Number(selectedScene.item.params.cameraTilt ?? 8)}°
                      </label>
                      <input
                        type="range"
                        min="-20"
                        max="20"
                        step="1"
                        value={Number(selectedScene.item.params.cameraTilt ?? 8)}
                        onChange={(e) => updateSelectedSceneParams("cameraTilt", Number(e.target.value))}
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: "center", color: "#64748B", marginTop: "40px" }}>
              คลิกเลือกฉากบนไทม์ไลน์ด้านล่างเพื่อเริ่มปรับแต่ง
            </div>
          )}
        </div>
      </div>

      {/* 3. Bottom Multi-Track Interactive Timeline Editor */}
      <div
        style={{
          height: "260px",
          backgroundColor: "#0B1220",
          borderTop: "2px solid rgba(59, 130, 246, 0.4)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        {/* Timeline Toolbar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 16px",
            backgroundColor: "#0F172A",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            fontSize: "12px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={() => jumpToScene((selectedScene?.index || 0) - 1)}
              style={{ background: "#1E293B", border: "none", borderRadius: "6px", color: "#94A3B8", padding: "4px 10px", cursor: "pointer" }}
            >
              ⏮ ก่อนหน้า
            </button>
            <button
              type="button"
              onClick={() => {
                if (playerRef.current) {
                  if (isPlaying) playerRef.current.pause();
                  else playerRef.current.play();
                }
              }}
              style={{ background: isPlaying ? "#EF4444" : "#3B82F6", border: "none", borderRadius: "6px", color: "#FFFFFF", padding: "4px 16px", fontWeight: 700, cursor: "pointer" }}
            >
              {isPlaying ? "⏸ Pause" : "▶ Play"}
            </button>
            <button
              type="button"
              onClick={() => jumpToScene((selectedScene?.index || 0) + 1)}
              style={{ background: "#1E293B", border: "none", borderRadius: "6px", color: "#94A3B8", padding: "4px 10px", cursor: "pointer" }}
            >
              ถัดไป ⏭
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ color: "#94A3B8" }}>ซูมไทม์ไลน์:</span>
            <button type="button" onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))} style={{ background: "#1E293B", border: "none", borderRadius: "4px", color: "#F8FAFC", padding: "2px 8px", cursor: "pointer" }}>-</button>
            <span style={{ color: "#60A5FA", fontWeight: 700 }}>{zoomLevel}x</span>
            <button type="button" onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))} style={{ background: "#1E293B", border: "none", borderRadius: "4px", color: "#F8FAFC", padding: "2px 8px", cursor: "pointer" }}>+</button>
          </div>
        </div>

        {/* Multi-Track Canvas & Scrubber */}
        <div
          ref={timelineRulerRef}
          onClick={handleTimelineClick}
          style={{
            flex: 1,
            position: "relative",
            overflowX: "auto",
            overflowY: "hidden",
            backgroundColor: "#070B14",
            padding: "8px 0",
            cursor: "pointer"
          }}
        >
          <div style={{ width: `${100 * zoomLevel}%`, height: "100%", position: "relative", minWidth: "100%" }}>
            {/* Timecode Grid Ruler */}
            <div style={{ height: "20px", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", display: "flex", position: "relative", marginBottom: "6px" }}>
              {Array.from({ length: Math.ceil(totalDurationFrames / 250) + 1 }).map((_, rIdx) => {
                const markFrame = rIdx * 250; // Every 10 seconds
                const pct = (markFrame / totalDurationFrames) * 100;
                return (
                  <div key={markFrame} style={{ position: "absolute", left: `${pct}%`, top: 0, fontSize: "10px", color: "#64748B", fontFamily: "monospace", paddingLeft: "4px", borderLeft: "1px solid rgba(255,255,255,0.15)" }}>
                    {formatTimecode(markFrame)}
                  </div>
                );
              })}
            </div>

            {/* TRACK V2: B-Roll Stack Overlays */}
            <div style={{ height: "30px", marginBottom: "4px", position: "relative", display: "flex", backgroundColor: "rgba(30, 41, 59, 0.4)", borderRadius: "4px" }}>
              <div style={{ position: "absolute", left: "6px", top: "6px", fontSize: "10px", fontWeight: 800, color: "#60A5FA", pointerEvents: "none", zIndex: 10 }}>V2 B-ROLL</div>
              {schedule.map((s) => {
                const sPctWidth = (s.durationFrames / totalDurationFrames) * 100;
                const sPctLeft = (s.startFrame / totalDurationFrames) * 100;

                return (s.item.broll || []).map((b, bIdx) => {
                  const bOffsetFrames = Math.round(((b.offsetMs || 0) / 1000) * 25);
                  const bDurFrames = Math.round(((b.durationMs || 3000) / 1000) * 25);
                  const bLeft = sPctLeft + (bOffsetFrames / totalDurationFrames) * 100;
                  const bWidth = (bDurFrames / totalDurationFrames) * 100;

                  return (
                    <div
                      key={b.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedItemId(s.item.id);
                        setSelectedBrollId(b.id);
                        seekToFrame(s.startFrame + bOffsetFrames);
                      }}
                      style={{
                        position: "absolute",
                        left: `${bLeft}%`,
                        width: `${Math.max(1, bWidth)}%`,
                        height: "100%",
                        background: "linear-gradient(135deg, #3B82F6, #1D4ED8)",
                        border: "1px solid #60A5FA",
                        borderRadius: "4px",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 6px",
                        fontSize: "10px",
                        fontWeight: 700,
                        color: "#FFFFFF",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      🎬 B-Roll {bIdx + 1}
                    </div>
                  );
                });
              })}
            </div>

            {/* TRACK V1: Main Sequential Storyboard Scenes (A-Roll, Cover, Title, Outro) */}
            <div style={{ height: "54px", marginBottom: "4px", position: "relative", display: "flex", backgroundColor: "rgba(15, 23, 42, 0.6)", borderRadius: "6px" }}>
              <div style={{ position: "absolute", left: "6px", top: "6px", fontSize: "10px", fontWeight: 800, color: "#E5A93C", pointerEvents: "none", zIndex: 10 }}>V1 MAIN</div>
              {schedule.map((s) => {
                const widthPct = (s.durationFrames / totalDurationFrames) * 100;
                const isSelected = selectedScene?.item.id === s.item.id;

                const bgColors: Record<string, string> = {
                  cover_card: "linear-gradient(135deg, #D97706, #B45309)",
                  title: "linear-gradient(135deg, #2563EB, #1E40AF)",
                  a_roll: "linear-gradient(135deg, #059669, #047857)",
                  logo_outro: "linear-gradient(135deg, #7C3AED, #5B21B6)",
                  note: "linear-gradient(135deg, #475569, #334155)"
                };

                return (
                  <div
                    key={s.item.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedItemId(s.item.id);
                      setSelectedBrollId("");
                      seekToFrame(s.startFrame);
                    }}
                    style={{
                      width: `${widthPct}%`,
                      height: "100%",
                      background: bgColors[s.item.kind] || bgColors.a_roll,
                      borderRight: "2px solid rgba(0, 0, 0, 0.5)",
                      borderTop: isSelected ? "3px solid #F59E0B" : "1px solid rgba(255,255,255,0.1)",
                      borderBottom: isSelected ? "3px solid #F59E0B" : "1px solid rgba(0,0,0,0.3)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      padding: "0 8px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#FFFFFF",
                      overflow: "hidden",
                      boxShadow: isSelected ? "inset 0 0 16px rgba(245, 158, 11, 0.4)" : "none",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      #{s.index + 1} {String(s.item.params?.title || s.item.params?.speaker || s.item.id)}
                    </div>
                    <small style={{ fontSize: "9px", color: "rgba(255, 255, 255, 0.75)" }}>
                      {formatSeconds(s.durationMs)}s · [{s.item.kind}]
                    </small>
                  </div>
                );
              })}
            </div>

            {/* TRACK T1: Dynamic Subtitles Dialogue */}
            <div style={{ height: "26px", position: "relative", display: "flex", backgroundColor: "rgba(30, 41, 59, 0.3)", borderRadius: "4px" }}>
              <div style={{ position: "absolute", left: "6px", top: "4px", fontSize: "10px", fontWeight: 800, color: "#10B981", pointerEvents: "none", zIndex: 10 }}>T1 SUB</div>
              {schedule.map((s) => {
                const widthPct = (s.durationFrames / totalDurationFrames) * 100;
                const hasDialogue = Boolean(s.item.params?.dialogue);

                return (
                  <div
                    key={`sub_${s.item.id}`}
                    style={{
                      width: `${widthPct}%`,
                      height: "100%",
                      backgroundColor: hasDialogue ? "rgba(16, 185, 129, 0.25)" : "transparent",
                      borderRight: "1px solid rgba(255, 255, 255, 0.05)",
                      borderLeft: hasDialogue ? "2px solid #10B981" : "none",
                      padding: "0 6px",
                      fontSize: "10px",
                      color: "#A7F3D0",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center"
                    }}
                  >
                    {hasDialogue ? String(s.item.params.dialogue) : ""}
                  </div>
                );
              })}
            </div>

            {/* Red Playhead Cursor Line */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${totalDurationFrames > 0 ? (currentFrame / totalDurationFrames) * 100 : 0}%`,
                width: "2px",
                backgroundColor: "#EF4444",
                boxShadow: "0 0 10px #EF4444",
                pointerEvents: "none",
                zIndex: 99
              }}
            >
              {/* Top Playhead Needle Head */}
              <div
                style={{
                  position: "absolute",
                  top: "-4px",
                  left: "-5px",
                  width: "12px",
                  height: "12px",
                  backgroundColor: "#EF4444",
                  clipPath: "polygon(0% 0%, 100% 0%, 50% 100%)"
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* NAS File Picker Modal if open */}
      {filePickerField.open && (
        <RemoteFilePickerModal
          isOpen={filePickerField.open}
          initialPath=""
          mode="file"
          filter={filePickerField.target === "sourceImage" ? "image" : "video"}
          onSelect={(selectedPath) => {
            if (filePickerField.target === "sourcePath") {
              updateSelectedSceneParams("sourcePath", selectedPath);
            } else if (filePickerField.target === "sourceImage") {
              updateSelectedSceneParams("sourceImage", selectedPath);
            } else if (filePickerField.target === "broll" && filePickerField.brollId && selectedScene) {
              onMutate((prev) => ({
                ...prev,
                items: prev.items.map((it) => it.id === selectedScene.item.id ? {
                  ...it,
                  broll: (it.broll || []).map((br) => br.id === filePickerField.brollId ? { ...br, asset: { ...br.asset, path: selectedPath } } : br)
                } : it)
              }));
            }
            setFilePickerField({ open: false, target: "sourcePath" });
          }}
          onClose={() => setFilePickerField({ open: false, target: "sourcePath" })}
        />
      )}
    </div>
  );
};
