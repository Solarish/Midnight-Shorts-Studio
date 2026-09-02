import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { StoryboardSequence, type StoryboardAssemblyProps, type StoryboardItemProps } from "@psu-ava/remotion-studio";
import type { Storyboard, StoryboardItem, StoryboardKind } from "../storyboard-types";
import { RemoteFilePickerModal } from "./RemoteFilePickerModal";
import { CgBlockEditor, normalizeCgBlocksForMasterDuration, type CgBlock } from "./CgBlockEditor";
import { runStoryboardNode } from "../storyboard-api";
import { api, mediaStreamUrl } from "../api";
import { TextLayerStyleEditor } from "./TextLayerStyleEditor";
import "./text-layer-style-editor.css";
import type { CoverTextStyles } from "@psu-ava/remotion-studio";
import { CoverCardOutputPreview } from "./CoverCardOutputPreview";
import "./cover-card-output-preview.css";
import { DoodleAssetLibrary, SYSTEM_DOODLES } from "./DoodleAssetLibrary";
import { CoverPromptPartsEditor } from "./CoverPromptPartsEditor";
import "./cover-prompt-parts.css";
import { ProceduralDoodleCanvas } from "./ProceduralDoodleCanvas";
import { calculatePathPlacementCount, randomizeDoodlePlacements, rebalanceDoodlePlacements } from "./path-geometry";
import { coverCardMissingFields, type CoverCardStage } from "@psu-ava/contracts/cover-card";
import {
  ARollInspector,
  CoverCardInspector,
  LogoOutroInspector,
  NoteInspector,
  TitleCarouselInspector
} from "./inspectors";

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

function coverRunMissing(params: Record<string, unknown>, stage: CoverCardStage) {
  const labels: Record<string, string> = { sourceImage: "ภาพบุคคลต้นฉบับ", prompt: "prompt ภาพพื้นหลัง", personName: "ชื่อบุคคล", positionTitle: "ตำแหน่ง", award: "รางวัล/คำโปรย" };
  return coverCardMissingFields(params, stage).map((field) => labels[field]);
}

const getCgBlocks = (item: StoryboardItem): CgBlock[] => Array.isArray(item.params?.cgBlocks)
  ? item.params.cgBlocks as CgBlock[]
  : [];

const enabledCgDuration = (blocks: CgBlock[]) => blocks
  .filter((block) => block.enabled)
  .reduce((total, block) => total + block.durationMs, 0);

function DoodlePathAdvancedFields({ path, onChange }: { path: any; onChange: (patch: Record<string, unknown>) => void }) {
  if (!path) return null;
  return <div className="field-grid" aria-label="All doodle path properties">
    <label>Distribution<select value={String(path.distribution ?? "along-path")} onChange={(e) => onChange({ distribution: e.target.value })}><option value="along-path">Along path</option><option value="repeated">Repeated</option><option value="start-end">Start / end</option></select></label>
    <label>Size jitter<input type="number" min="0" max="1" step="0.01" value={Number(path.sizeJitter ?? 0)} onChange={(e) => onChange({ sizeJitter: Number(e.target.value) })} /></label>
    <label>Path color<input type="color" value={String(path.color ?? "#FFFFFF")} onChange={(e) => onChange({ color: e.target.value })} /></label>
    <label>Path geometry<input value="Polyline · double-click segment to add bends" readOnly /></label>
  </div>;
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
  const [filePickerField, setFilePickerField] = useState<{ open: boolean; target: "sourcePath" | "sourceImage" | "backgroundImage" | "personImage" | "broll"; brollId?: string }>({ open: false, target: "sourcePath" });
  const [nodeRun, setNodeRun] = useState<{ runId: string; itemId: string; stage: "background" | "doodle" | "person" | "assets"; status: string; dryRun: boolean; health?: "starting" | "active" | "stalled" | "connection_lost" | "terminal"; lastHeartbeatAt?: string; systemStatus?: { reachable: boolean; checkedAt?: string; data?: { cpu?: { load?: string }; memory?: { percentage?: string } }; error?: string }; comfyStatus?: { reachable: boolean; checkedAt?: string; queue?: { running?: unknown[]; pending?: unknown[] }; error?: string }; error?: string; progress?: { completed: number; total: number; percent: number }; steps?: Array<{ id: string; label?: string; status: string }> }>();
  const [nodeRunBusy, setNodeRunBusy] = useState(false);
  const [nodeRunError, setNodeRunError] = useState<string>();
  const [drawingDoodlePath, setDrawingDoodlePath] = useState(false);
  const [pathEditMode, setPathEditMode] = useState<"inspect" | "draw" | "edit">("inspect");
  const [selectedDoodlePath, setSelectedDoodlePath] = useState(0);
  const [selectedDoodlePathId, setSelectedDoodlePathId] = useState<string>();
  const [selectedDoodlePointIndex, setSelectedDoodlePointIndex] = useState<number>();

  const playerRef = useRef<PlayerRef>(null);
  const timelineRulerRef = useRef<HTMLDivElement>(null);
  const nodeRunProgressAt = useRef(0);

  useEffect(() => {
    if (!nodeRun?.runId) return;
    let active = true;
    nodeRunProgressAt.current = Date.now();
    const poll = async () => {
      try {
        const current = await api<any>(`/api/v1/runs/${encodeURIComponent(nodeRun.runId)}`);
        let systemStatus: any;
        try { systemStatus = await api<any>("/api/v1/system/status"); } catch (error) { systemStatus = { reachable: false, error: error instanceof Error ? error.message : "Debian system status unavailable" }; }
        let comfyStatus: any;
        try { comfyStatus = await api<any>("/api/v1/comfyui/status"); } catch (error) { comfyStatus = { reachable: false, error: error instanceof Error ? error.message : "ComfyUI status unavailable" }; }
        if (!active) return;
        const terminal = ["success", "failed", "partial", "cancelled", "needs_attention"].includes(current.status);
        const health = terminal ? "terminal" : "active";
        setNodeRun((previous) => previous ? { ...previous, status: current.status, dryRun: current.dryRun, progress: current.progress, steps: current.steps, health, lastHeartbeatAt: current.updatedAt ?? new Date().toISOString(), systemStatus, comfyStatus, error: current.error } : previous);
        if (current.steps) {
          const outputFor = (suffix: string) => {
            const step = current.steps.find((value: any) => value.id.endsWith(suffix));
            const output = step?.outputs ?? {};
            return step?.status === "success" ? output.images?.[0]?.localPath ?? output.image ?? output.path : undefined;
          };
          const generated = nodeRun.stage === "background" ? { backgroundImage: outputFor("__generate_bg") } : nodeRun.stage === "person" ? { personImage: outputFor("__cutout") } : nodeRun.stage === "doodle" ? { doodleImage: outputFor("__doodle_alpha") } : { backgroundImage: outputFor("__generate_bg"), personImage: outputFor("__cutout"), doodleImage: outputFor("__doodle_alpha") };
          const changed = Object.fromEntries(Object.entries(generated).filter(([, value]) => typeof value === "string" && value));
          if (Object.keys(changed).length) onMutate((previous) => ({ ...previous, items: previous.items.map((item) => {
            if (item.id !== nodeRun.itemId) return item;
            const createdAt = new Date().toISOString();
            const customWord = String(item.params.customDoodleWord ?? "").trim().split(/\s+/)[0] ?? "";
            const existingDoodleAssets = Array.isArray(item.params.customDoodleAssets) ? item.params.customDoodleAssets as Array<{ slot?: number }> : [];
            const usedSlots = new Set(existingDoodleAssets.map((asset, index) => Number(asset.slot ?? index + 1)));
            const nextSlot = Array.from({ length: 25 }, (_, index) => index + 1).find((slot) => !usedSlots.has(slot)) ?? 25;
            const customDoodleAssets = customWord && changed.doodleImage
              ? [{ id: `custom_${nodeRun.runId}`, word: customWord, image: changed.doodleImage, slot: nextSlot, createdAt }, ...(Array.isArray(item.params.customDoodleAssets) ? item.params.customDoodleAssets : [])].slice(0, 25)
              : item.params.customDoodleAssets;
            const customRegistry = customWord && changed.doodleImage ? { id: `custom_${nodeRun.runId}`, key: customWord, imagePath: changed.doodleImage, label: customWord, kind: "custom", enabled: true, createdAt } : undefined;
            const doodleAssets = customRegistry ? [customRegistry, ...(Array.isArray(item.params.doodleAssets) ? item.params.doodleAssets : [])].slice(0, 100) : item.params.doodleAssets;
            return { ...item, params: { ...item.params, ...changed, ...(customDoodleAssets ? { customDoodleAssets } : {}), ...(doodleAssets ? { doodleAssets } : {}), outputHistory: [{ runId: nodeRun.runId, createdAt, ...changed }, ...(Array.isArray(item.params.outputHistory) ? item.params.outputHistory : [])].slice(0, 12) } };
          }) }));
        }
        if (terminal) return;
        window.setTimeout(() => void poll(), 1200);
      } catch (error) { if (active) { setNodeRun((previous) => previous ? { ...previous, health: "connection_lost", error: error instanceof Error ? error.message : "ไม่สามารถอ่านสถานะ run ได้" } : previous); window.setTimeout(() => void poll(), 1800); } }
    };
    void poll();
    return () => { active = false; };
  }, [nodeRun?.runId]);

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

  const selectedDoodlePaths = selectedScene?.item.kind === "cover_card" && Array.isArray(selectedScene.item.params.doodlePaths)
    ? selectedScene.item.params.doodlePaths as any[] : [];
  const activeDoodlePathId = selectedDoodlePathId ?? selectedDoodlePaths[selectedDoodlePath]?.id;
  const activeDoodlePathIndex = Math.max(0, selectedDoodlePaths.findIndex((path) => path.id === activeDoodlePathId));
  useEffect(() => {
    if (!selectedDoodlePaths.length) { setSelectedDoodlePath(0); setSelectedDoodlePathId(undefined); setSelectedDoodlePointIndex(undefined); return; }
    const nextIndex = selectedDoodlePathId ? selectedDoodlePaths.findIndex((path) => path.id === selectedDoodlePathId) : selectedDoodlePath;
    if (nextIndex < 0 || nextIndex >= selectedDoodlePaths.length) {
      setSelectedDoodlePath(0); setSelectedDoodlePathId(selectedDoodlePaths[0]?.id); setSelectedDoodlePointIndex(undefined);
    } else if (!selectedDoodlePathId) setSelectedDoodlePathId(selectedDoodlePaths[nextIndex]?.id);
  }, [selectedScene?.item.id, selectedDoodlePaths.length, selectedDoodlePathId]);

  const runSelectedGenAiNode = useCallback(async (stage: "background" | "doodle" | "person" | "assets" = "assets") => {
    if (!selectedScene || selectedScene.item.kind !== "cover_card") return;
    const missing = coverRunMissing(selectedScene.item.params, stage);
    if (missing.length) {
      setNodeRunError(`กรอกข้อมูลก่อน Run: ${missing.join(", ")}`);
      return;
    }
    setNodeRunBusy(true);
    setNodeRunError(undefined);
    try {
      const runItem = { ...selectedScene.item, params: { ...selectedScene.item.params, randomSeed: true, ...(stage === "background" || stage === "assets" ? { backgroundImage: "" } : {}) } };
      const result = await runStoryboardNode(storyboard.storyboardId, selectedScene.item.id, "live", runItem, stage);
      setNodeRun({ ...result, itemId: selectedScene.item.id, stage, health: "starting", progress: { completed: 0, total: 5, percent: 0 } }); setSelectedItemId(selectedScene.item.id);
    } catch (error) {
      setNodeRunError(error instanceof Error ? error.message : "ไม่สามารถเริ่มงานได้");
    } finally {
      setNodeRunBusy(false);
    }
  }, [selectedScene, storyboard.storyboardId]);

  const runCustomDoodle = useCallback(async () => {
    if (!selectedScene || selectedScene.item.kind !== "cover_card") return;
    const word = String(selectedScene.item.params.customDoodleWord ?? "").trim().split(/\s+/)[0] ?? "";
    if (!word) return;
    setNodeRunBusy(true);
    setNodeRunError(undefined);
    try {
      const runItem = { ...selectedScene.item, params: { ...selectedScene.item.params, customDoodleWord: word, doodleEnabled: true, doodlePreset: "none", randomSeed: true } };
      const result = await runStoryboardNode(storyboard.storyboardId, selectedScene.item.id, "live", runItem, "doodle");
      setNodeRun({ ...result, itemId: selectedScene.item.id, stage: "doodle", health: "starting", progress: { completed: 0, total: 5, percent: 0 } });
    } catch (error) {
      setNodeRunError(error instanceof Error ? error.message : "ไม่สามารถเริ่มงานได้");
    } finally {
      setNodeRunBusy(false);
    }
  }, [selectedScene, storyboard.storyboardId]);

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
      items: prev.items.map((it) => {
        if (it.id !== selectedScene.item.id) return it;
        if (it.kind !== "title") return { ...it, durationMs: newDuration };
        return {
          ...it,
          durationMs: newDuration,
          params: { ...it.params, cgBlocks: normalizeCgBlocksForMasterDuration(getCgBlocks(it), newDuration) }
        };
      })
    }));
  };

  const updateSelectedSceneParams = (key: string, value: any) => {
    if (!selectedScene) return;
    setNodeRunError(undefined);
    onMutate((prev) => ({
      ...prev,
      items: prev.items.map((it) => it.id === selectedScene.item.id ? {
        ...it,
        params: { ...it.params, [key]: value }
      } : it)
    }));
  };

  const toggleDoodleAsset = (id: string) => {
    if (!selectedScene || selectedScene.item.kind !== "cover_card") return;
    onMutate((previous) => ({ ...previous, items: previous.items.map((item) => {
      if (item.id !== selectedScene.item.id) return item;
      const normalizeSystemId = (value: string) => /^doodle-\d+$/.test(value) ? `doodle-${String(((Number(value.slice(7)) - 1) % SYSTEM_DOODLES.length) + 1).padStart(2, "0")}` : value;
      const rawCurrent = Array.isArray(item.params.doodleAssetSet) ? item.params.doodleAssetSet as string[] : SYSTEM_DOODLES;
      const current = [...new Set(rawCurrent.map(normalizeSystemId))];
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      const paths = Array.isArray(item.params.doodlePaths) ? item.params.doodlePaths as any[] : [];
      const added = next.filter((value) => !current.includes(value));
      return { ...item, params: { ...item.params, doodleAssetSet: next, doodlePaths: paths.map((path) => ({ ...path, assetSet: next, doodles: rebalanceDoodlePlacements(path.doodles, next, added) })) } };
    }) }));
  };

  const updateSelectedDoodlePath = (patch: Record<string, unknown>) => {
    if (!selectedScene || selectedScene.item.kind !== "cover_card") return;
    onMutate((previous) => ({ ...previous, items: previous.items.map((item) => item.id === selectedScene.item.id ? { ...item, params: { ...item.params, doodlePaths: (Array.isArray(item.params.doodlePaths) ? item.params.doodlePaths : []).map((path: any, index) => index === activeDoodlePathIndex ? { ...path, ...patch } : path) } } : item) }));
  };

  const randomizeSelectedDoodlePath = () => {
    if (!selectedScene || selectedScene.item.kind !== "cover_card") return;
    const activeIds = Array.isArray(selectedScene.item.params.doodleAssetSet) ? selectedScene.item.params.doodleAssetSet as string[] : SYSTEM_DOODLES;
    onMutate((previous) => ({ ...previous, items: previous.items.map((item) => item.id !== selectedScene.item.id ? item : {
      ...item,
      params: { ...item.params, doodlePaths: (Array.isArray(item.params.doodlePaths) ? item.params.doodlePaths : []).map((path: any, index) => index === activeDoodlePathIndex ? randomizeDoodlePlacements(path, activeIds) : path) }
    }) }));
  };
  const stageProgress = (stage: "background" | "doodle" | "person" | "assets") => nodeRun?.stage === stage ? nodeRun.progress?.percent ?? 0 : undefined;

  const updateSelectedTitleBlocks = (blocks: CgBlock[]) => {
    if (!selectedScene || selectedScene.item.kind !== "title") return;
    const durationMs = Math.max(40, enabledCgDuration(blocks));
    onMutate((prev) => ({
      ...prev,
      items: prev.items.map((it) => it.id === selectedScene.item.id
        ? { ...it, durationMs, params: { ...it.params, cgBlocks: blocks } }
        : it)
    }));
  };

  const updateSelectedTitleText = (key: "text" | "title", value: string) => {
    if (!selectedScene || selectedScene.item.kind !== "title") return;
    onMutate((prev) => ({
      ...prev,
      items: prev.items.map((it) => it.id === selectedScene.item.id
        ? { ...it, params: { ...it.params, [key]: value, texts: { ...(it.params.texts as Record<string, unknown> | undefined), [key]: value } } }
        : it)
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
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.6)",
          position: "sticky",
          top: 0,
          zIndex: 100,
          flexWrap: "wrap",
          gap: "8px"
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
              width: "100%",
              height: "auto",
              aspectRatio: aspect === "9:16" ? "9 / 16" : aspect === "1:1" ? "1 / 1" : "16 / 9",
              maxWidth: "100%",
              maxHeight: "calc(100% - 32px)",
              borderRadius: "14px",
              overflow: "hidden",
              border: "2px solid rgba(229, 169, 60, 0.45)",
              boxShadow: "0 16px 48px rgba(0, 0, 0, 0.95)",
              backgroundColor: "#0B1220",
              flex: "0 1 auto",
              position: "relative"
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
            {selectedScene?.item.kind === "cover_card" && <ProceduralDoodleCanvas paths={Array.isArray(selectedScene.item.params.doodlePaths) ? selectedScene.item.params.doodlePaths as any : []} mode={pathEditMode} drawing={drawingDoodlePath} selectedPathId={activeDoodlePathId} selectedPointIndex={selectedDoodlePointIndex} showGuide={selectedScene.item.params.doodlePathGuideVisible !== false} assetSet={Array.isArray(selectedScene.item.params.doodleAssetSet) ? selectedScene.item.params.doodleAssetSet as string[] : SYSTEM_DOODLES} onSelectPath={(id) => { setSelectedDoodlePathId(id); setSelectedDoodlePath(selectedDoodlePaths.findIndex((path) => path.id === id)); setPathEditMode("edit"); }} onSelectPoint={(id, index) => { setSelectedDoodlePathId(id); setSelectedDoodlePointIndex(index); }} onChange={(paths) => onMutate((previous) => ({ ...previous, items: previous.items.map((item) => item.id === selectedScene.item.id ? { ...item, params: { ...item.params, doodlePaths: paths, doodleEnabled: true, doodlePreset: "none" } } : item) }))} />}
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

              {selectedScene.item.kind === "a_roll" && (
                <ARollInspector
                  item={selectedScene.item}
                  selectedBrollId={selectedBrollId}
                  onSelectBroll={setSelectedBrollId}
                  onParams={(patch) =>
                    onMutate((prev) => ({
                      ...prev,
                      items: prev.items.map((it) =>
                        it.id === selectedScene.item.id ? { ...it, params: { ...it.params, ...patch } } : it
                      )
                    }))
                  }
                  onItem={(updatedItem) =>
                    onMutate((prev) => ({
                      ...prev,
                      items: prev.items.map((it) => (it.id === updatedItem.id ? updatedItem : it))
                    }))
                  }
                />
              )}

              {selectedScene.item.kind === "title" && (
                <TitleCarouselInspector
                  item={selectedScene.item}
                  onParams={(patch) =>
                    onMutate((prev) => ({
                      ...prev,
                      items: prev.items.map((it) =>
                        it.id === selectedScene.item.id ? { ...it, params: { ...it.params, ...patch } } : it
                      )
                    }))
                  }
                  onItem={(updatedItem) =>
                    onMutate((prev) => ({
                      ...prev,
                      items: prev.items.map((it) => (it.id === updatedItem.id ? updatedItem : it))
                    }))
                  }
                />
              )}

              {selectedScene.item.kind === "cover_card" && (
                <CoverCardInspector
                  item={selectedScene.item}
                  onParams={(patch) =>
                    onMutate((prev) => ({
                      ...prev,
                      items: prev.items.map((it) =>
                        it.id === selectedScene.item.id ? { ...it, params: { ...it.params, ...patch } } : it
                      )
                    }))
                  }
                  onRun={runSelectedGenAiNode}
                  nodeRun={nodeRun as any}
                  nodeRunBusy={nodeRunBusy}
                  pathEditMode={pathEditMode}
                  onSetPathEditMode={setPathEditMode}
                  drawingDoodlePath={drawingDoodlePath}
                  onSetDrawingDoodlePath={setDrawingDoodlePath}
                />
              )}

              {selectedScene.item.kind === "logo_outro" && (
                <LogoOutroInspector
                  item={selectedScene.item}
                  onParams={(patch) =>
                    onMutate((prev) => ({
                      ...prev,
                      items: prev.items.map((it) =>
                        it.id === selectedScene.item.id ? { ...it, params: { ...it.params, ...patch } } : it
                      )
                    }))
                  }
                  onItem={(updated) =>
                    onMutate((prev) => ({
                      ...prev,
                      items: prev.items.map((it) => (it.id === updated.id ? updated : it))
                    }))
                  }
                />
              )}

              {selectedScene.item.kind === "note" && (
                <NoteInspector
                  item={selectedScene.item}
                  onParams={(patch) =>
                    onMutate((prev) => ({
                      ...prev,
                      items: prev.items.map((it) =>
                        it.id === selectedScene.item.id ? { ...it, params: { ...it.params, ...patch } } : it
                      )
                    }))
                  }
                />
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
          filter={filePickerField.target === "sourcePath" || filePickerField.target === "broll" ? "video" : ".jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff"}
          onSelect={(selectedPath) => {
            if (filePickerField.target === "sourcePath") {
              updateSelectedSceneParams("sourcePath", selectedPath);
            } else if (filePickerField.target === "sourceImage") {
              updateSelectedSceneParams("sourceImage", selectedPath);
            } else if (filePickerField.target === "backgroundImage") {
              updateSelectedSceneParams("backgroundImage", selectedPath);
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
