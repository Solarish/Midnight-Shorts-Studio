import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { GraphShell } from "./WorkflowCatalogPage";
import {
  approveAndCompileStoryboard,
  autoBrollStoryboardAll,
  autoGenerateAssets,
  autoLowerThirdStoryboardAll,
  fullAutoStoryboard,
  getStoryboard,
  getStoryboardCompilation,
  getStoryboardImport,
  patchStoryboard,
  resyncStoryboardDocx,
  validateStoryboard
} from "./storyboard-api";
import type { Storyboard, StoryboardCompilation, StoryboardDiagnostic, StoryboardImport, StoryboardItem, StoryboardKind } from "./storyboard-types";
import { InteractiveTimelineStudioModal } from "./components/InteractiveTimelineStudioModal";
import { RemoteFilePickerModal } from "./components/RemoteFilePickerModal";
import { RenderProgressModal } from "./components/RenderProgressModal";
import {
  ARollInspector,
  CoverCardInspector,
  LogoOutroInspector,
  NoteInspector,
  TitleCarouselInspector,
  BgmInspector,
  BGM_PRESETS,
  SecondsField,
  useNodeRunMonitor,
  snapToFrameMs,
  formatSeconds
} from "./components/inspectors";
import "./storyboard.css";
import "./storyboard-path.css";
import "./storyboard-node-inspector.css";
import "./components/text-layer-style-editor.css";
import "./components/cover-card-output-preview.css";
import "./components/cover-prompt-parts.css";

export default function StoryboardEditorPage() {
  const { storyboardId = "" } = useParams();
  const [storyboard, setStoryboard] = useState<Storyboard>();
  const [showLivePlayer, setShowLivePlayer] = useState(false);
  const [showRenderModal, setShowRenderModal] = useState(false);
  const [sourceImport, setSourceImport] = useState<StoryboardImport>();
  const [compilation, setCompilation] = useState<StoryboardCompilation>();
  const [selectedId, setSelectedId] = useState("");
  const [selectedBrollId, setSelectedBrollId] = useState("");
  const [diagnostics, setDiagnostics] = useState<StoryboardDiagnostic[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "conflict" | "error">("idle");
  const [message, setMessage] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [dragIndex, setDragIndex] = useState<number>();
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("16:9");
  const [showSafeZones, setShowSafeZones] = useState(true);
  const [showDiagnosticsDetail, setShowDiagnosticsDetail] = useState(false);
  const [activeInspectorTab, setActiveInspectorTab] = useState<"style" | "media" | "timing" | "graphics">("style");
  const [isAutoBrollingAll, setIsAutoBrollingAll] = useState(false);
  const [isAutoLowerThirdRunning, setIsAutoLowerThirdRunning] = useState(false);
  const [bgmPresetId, setBgmPresetId] = useState<string>("news-pulse");
  const [customBgmPath, setCustomBgmPath] = useState<string>("");
  const [bgmVolume, setBgmVolume] = useState<number>(0.6);
  const [bgmDuckVolume, setBgmDuckVolume] = useState<number>(0.12);
  const [autoDucking, setAutoDucking] = useState<boolean>(true);
  const [isBgmPickerOpen, setIsBgmPickerOpen] = useState<boolean>(false);
  const [isAuditionPlaying, setIsAuditionPlaying] = useState<boolean>(false);
  const audioAuditionRef = useRef<HTMLAudioElement | null>(null);

  const selectedBgmTrack = useMemo(() => {
    const preset = BGM_PRESETS.find((p) => p.id === bgmPresetId);
    const resolvedPath = bgmPresetId === "custom" ? customBgmPath : preset?.path;
    if (!resolvedPath || bgmPresetId === "none") return undefined;
    return {
      path: resolvedPath,
      volume: bgmVolume,
      duckVolume: bgmDuckVolume,
      autoDucking,
      role: "music" as const
    };
  }, [bgmPresetId, customBgmPath, bgmVolume, bgmDuckVolume, autoDucking]);

  const effectiveAuditionPath = bgmPresetId === "custom" ? customBgmPath : BGM_PRESETS.find((p) => p.id === bgmPresetId)?.path || "";

  const toggleAudition = useCallback(() => {
    if (!audioAuditionRef.current || !effectiveAuditionPath) return;
    if (isAuditionPlaying) {
      audioAuditionRef.current.pause();
      setIsAuditionPlaying(false);
    } else {
      audioAuditionRef.current.currentTime = 0;
      audioAuditionRef.current.volume = bgmVolume;
      audioAuditionRef.current.play().then(() => {
        setIsAuditionPlaying(true);
      }).catch(() => {
        setIsAuditionPlaying(false);
      });
    }
  }, [effectiveAuditionPath, isAuditionPlaying, bgmVolume]);

  const editVersion = useRef(0);

  const selected = useMemo(
    () => storyboard?.items.find((item) => item.id === selectedId),
    [storyboard, selectedId]
  );

  const updateParams = useCallback(
    (patch: Record<string, unknown>) => {
      if (!selected) return;
      setStoryboard((current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((item) =>
            item.id === selected.id ? { ...item, params: { ...item.params, ...patch } } : item
          )
        };
      });
      setDirty(true);
      editVersion.current++;
    },
    [selected]
  );

  const { nodeRun, nodeRunBusy, triggerRun } = useNodeRunMonitor({
    storyboardId,
    item: selected ?? null,
    onUpdateParams: updateParams,
    onError: setMessage
  });

  const load = useCallback(async () => {
    setMessage("");
    const value = await getStoryboard(storyboardId);
    setStoryboard(value);
    setSelectedId((current) => current || value.items[0]?.id || "");
    setDirty(false);
    setSaveState("idle");
    const imported = await getStoryboardImport(value.sourceImport.importId);
    setSourceImport(imported);
    if (value.approvedVersion) {
      setCompilation(await getStoryboardCompilation(value.storyboardId, value.approvedVersion));
    }
  }, [storyboardId]);

  useEffect(() => {
    void load().catch((cause) => setMessage(cause.message));
  }, [load]);

  const commit = useCallback(
    async (snapshot: Storyboard) => {
      const version = editVersion.current;
      setSaveState("saving");
      try {
        const saved = await patchStoryboard(snapshot);
        setStoryboard((current) =>
          editVersion.current === version
            ? saved
            : current
              ? { ...current, revision: saved.revision, status: "stale" }
              : saved
        );
        if (editVersion.current === version) {
          setDirty(false);
          setSaveState("saved");
        } else {
          setSaveState("idle");
        }
        return saved;
      } catch (cause: any) {
        setSaveState(cause.status === 409 ? "conflict" : "error");
        setMessage(cause.message);
        throw cause;
      }
    },
    []
  );

  useEffect(() => {
    if (!dirty || !storyboard) return;
    const handle = window.setTimeout(() => {
      void commit(storyboard).catch(() => {});
    }, 600);
    return () => window.clearTimeout(handle);
  }, [storyboard, dirty, commit]);

  const replaceItem = (item: StoryboardItem) => {
    if (!storyboard) return;
    setStoryboard({
      ...storyboard,
      items: storyboard.items.map((current) => (current.id === item.id ? item : current))
    });
    setDirty(true);
    editVersion.current++;
  };

  const updatePreset = (presetId: string) => {
    if (!selected) return;
    replaceItem({
      ...selected,
      presetId,
      params: {
        ...selected.params,
        presetId
      }
    });
  };

  const updateDuration = (durationMs: number) => {
    if (!selected) return;
    if (selected.kind === "a_roll") {
      const sourceInMs = Number(selected.params.sourceInMs ?? 0);
      const sourceOutMs = sourceInMs + durationMs;
      replaceItem({
        ...selected,
        durationMs,
        params: { ...selected.params, sourceInMs, sourceOutMs }
      });
      return;
    }
    replaceItem({ ...selected, durationMs });
  };

  const addItem = (kind: StoryboardKind) => {
    if (!storyboard) return;
    const prefix = kind === "a_roll" ? "interview" : kind === "title" ? "title" : kind === "cover_card" ? "cover" : kind;
    const id = uniqueId(prefix, storyboard.items.map((item) => item.id));
    const nextItem = itemDefaults(kind, id);
    setStoryboard({ ...storyboard, items: [...storyboard.items, nextItem] });
    setSelectedId(id);
    setDirty(true);
    editVersion.current++;
  };

  const addBroll = (parent: StoryboardItem) => {
    if (!storyboard || parent.kind !== "a_roll") return;
    const brollList = parent.broll ?? [];
    const id = uniqueId(`${parent.id}_broll`, brollList.map((item) => item.id));
    const nextBroll = {
      id,
      asset: { path: "" },
      offsetMs: 0,
      durationMs: Math.min(4000, parent.durationMs),
      audioPolicy: "mute" as const,
      fit: "cover" as const
    };
    replaceItem({ ...parent, broll: [...brollList, nextBroll] });
    setSelectedId(parent.id);
    setSelectedBrollId(id);
  };

  const deleteSelected = () => {
    if (!storyboard || !selected) return;
    const remaining = storyboard.items.filter((item) => item.id !== selected.id);
    setStoryboard({ ...storyboard, items: remaining });
    setSelectedId(remaining[0]?.id || "");
    setDirty(true);
    editVersion.current++;
  };

  const changeKind = (kind: StoryboardKind) => {
    if (!selected) return;
    const next = itemDefaults(kind, selected.id);
    replaceItem({ ...next, id: selected.id });
  };

  const reorder = (from: number, to: number) => {
    if (!storyboard || to < 0 || to >= storyboard.items.length) return;
    const items = [...storyboard.items];
    const [moved] = items.splice(from, 1);
    if (!moved) return;
    items.splice(to, 0, moved);
    setStoryboard({ ...storyboard, items });
    setDirty(true);
    editVersion.current++;
  };

  const splitSelected = () => {
    if (!storyboard || !selected || selected.kind !== "a_roll") return;
    const index = storyboard.items.findIndex((item) => item.id === selected.id);
    if (index === -1) return;
    const half = snapToFrameMs(selected.durationMs / 2);
    if (half < 40) return;
    const sourceInMs = Number(selected.params.sourceInMs ?? 0);
    const sourceOutMs = Number(selected.params.sourceOutMs ?? selected.durationMs);
    const midSourceMs = sourceInMs + half;
    const first: StoryboardItem = {
      ...selected,
      durationMs: half,
      params: { ...selected.params, sourceInMs, sourceOutMs: midSourceMs },
      broll: (selected.broll ?? []).filter((b) => b.offsetMs < half).map((b) => ({ ...b, durationMs: Math.min(b.durationMs, Math.max(40, half - b.offsetMs)) }))
    };
    const nextId = uniqueId(selected.id, storyboard.items.map((item) => item.id));
    const second: StoryboardItem = {
      ...selected,
      id: nextId,
      durationMs: Math.max(40, sourceOutMs - midSourceMs),
      params: { ...selected.params, sourceInMs: midSourceMs, sourceOutMs },
      broll: (selected.broll ?? []).filter((b) => b.offsetMs >= half).map((b) => ({ ...b, id: uniqueId(`${nextId}_broll`, []), offsetMs: b.offsetMs - half }))
    };
    const items = [...storyboard.items];
    items.splice(index, 1, first, second);
    setStoryboard({ ...storyboard, items });
    setSelectedId(second.id);
    setDirty(true);
    editVersion.current++;
  };

  const selectedIndex = useMemo(
    () => (storyboard ? storyboard.items.findIndex((item) => item.id === selectedId) : -1),
    [storyboard, selectedId]
  );

  const previousItem = selectedIndex > 0 ? storyboard?.items[selectedIndex - 1] : undefined;
  const canMerge = Boolean(
    selected &&
      previousItem &&
      selected.kind === "a_roll" &&
      previousItem.kind === "a_roll" &&
      String(selected.params.sourceKey ?? "") &&
      selected.params.sourceKey === previousItem.params.sourceKey &&
      Number(previousItem.params.sourceOutMs ?? 0) === Number(selected.params.sourceInMs ?? 0)
  );

  const mergePrevious = () => {
    if (!storyboard || !selected || !previousItem || !canMerge) return;
    const merged: StoryboardItem = {
      ...previousItem,
      durationMs: previousItem.durationMs + selected.durationMs,
      params: {
        ...previousItem.params,
        sourceOutMs: selected.params.sourceOutMs,
        dialogue: [previousItem.params.dialogue, selected.params.dialogue].filter(Boolean).join(" ")
      },
      broll: [
        ...(previousItem.broll ?? []),
        ...(selected.broll ?? []).map((b) => ({ ...b, offsetMs: b.offsetMs + previousItem.durationMs }))
      ]
    };
    const items = storyboard.items
      .filter((item) => item.id !== selected.id)
      .map((item) => (item.id === previousItem.id ? merged : item));
    setStoryboard({ ...storyboard, items });
    setSelectedId(merged.id);
    setDirty(true);
    editVersion.current++;
  };

  const validate = async () => {
    if (!storyboard) return;
    if (dirty) await commit(storyboard);
    setMessage("");
    try {
      const result = await validateStoryboard(storyboard.storyboardId);
      setDiagnostics(result.diagnostics);
      if (result.valid) setMessage("Storyboard ถูกต้องและพร้อมใช้งาน");
    } catch (cause: any) {
      setMessage(cause.message);
    }
  };

  const approveAndCompile = async () => {
    if (!storyboard) return;
    if (dirty) await commit(storyboard);
    setMessage("");
    try {
      const result = await approveAndCompileStoryboard(storyboard);
      setCompilation(result.compilation);
      setShowGraph(true);
      setDiagnostics(result.diagnostics);
      await load();
      setMessage(`อนุมัติ Storyboard v${result.approved.version} สำเร็จ`);
    } catch (cause: any) {
      setMessage(cause.message);
    }
  };

  const handleAutoBrollAll = async () => {
    if (!storyboard) return;
    setIsAutoBrollingAll(true);
    setMessage("⏳ กำลังวิเคราะห์บทพูดและจัด B-roll ทั้งกระดานด้วย AI...");
    try {
      const data = await autoBrollStoryboardAll(storyboard.storyboardId);
      if (data.storyboard) {
        setStoryboard(data.storyboard);
        setDirty(false);
        editVersion.current++;
        const stats = data.stats;
        setMessage(
          `✅ จัด B-roll ทั้งกระดานสำเร็จ! ใส่ทั้งหมด ${stats.totalBrollsAssigned} จุด จากฟุตเทจไม่ซ้ำกัน ${stats.uniqueClipsUsed} คลิป (${stats.notes?.join(" · ") || "จังหวะคัตชนคัต & เว้นช่วงพูดเป็นธรรมชาติ"})`
        );
      }
    } catch (err: any) {
      setMessage(`❌ Auto B-roll ทั้งกระดานล้มเหลว: ${err.message}`);
    } finally {
      setIsAutoBrollingAll(false);
    }
  };

  const [isFullAutoRunning, setIsFullAutoRunning] = useState(false);

  const handleFullAutoAll = async () => {
    if (!storyboard) return;
    setIsFullAutoRunning(true);
    setMessage("⏳ กำลังจัดเต็มระบบ Full Auto 100% (Title 3D Carousel + Cover Card PSU Stidti + Lower-Third + Auto B-Roll ทั้งกระดาน)...");
    try {
      const data = await fullAutoStoryboard(storyboard.storyboardId);
      if (data.storyboard) {
        setStoryboard(data.storyboard);
        setDirty(false);
        editVersion.current++;
        const stats = data.stats;
        setMessage(
          `✅ Full Auto สำเร็จ 100%! จัด B-roll ${stats.totalBrollsAssigned} จุด (${stats.uniqueClipsUsed} คลิปไม่ซ้ำ), ตั้งค่า Lower-Third (${(stats as any).lowerThirdsConfigured || 0} ฉาก A-Roll), Cover Card (${stats.coverCardsFormatted} ฉากด้วยฟอนต์ ${stats.fontUsed}) และ Title Card (3D Carousel) เรียบร้อยแล้ว!`
        );
      }
    } catch (err: any) {
      setMessage(`❌ Full Auto ล้มเหลว: ${err.message}`);
    } finally {
      setIsFullAutoRunning(false);
    }
  };

  const handleAutoLowerThirdAll = async () => {
    if (!storyboard) return;
    setIsAutoLowerThirdRunning(true);
    setMessage("⏳ กำลังตั้งค่า Lower-Third (PSU Royal Gold Glass Beacon) ให้ทุกช็อต A-Roll อัตโนมัติ...");
    try {
      const data = await autoLowerThirdStoryboardAll(storyboard.storyboardId);
      if (data.storyboard) {
        setStoryboard(data.storyboard);
        setDirty(false);
        editVersion.current++;
        setMessage(
          `✅ ตั้งค่า Lower-Third สำเร็จ! ใส่ชื่อและตำแหน่งวิทยากรให้ ${data.stats.lowerThirdsConfigured} ฉาก A-Roll เรียบร้อยแล้ว!`
        );
      }
    } catch (err: any) {
      setMessage(`❌ Auto Lower-Third ล้มเหลว: ${err.message}`);
    } finally {
      setIsAutoLowerThirdRunning(false);
    }
  };

  const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);

  const handleAutoGenerateAssets = async () => {
    if (!storyboard) return;
    setIsGeneratingAssets(true);
    setMessage("⏳ กำลังสังเคราะห์แอสเซต AI อัตโนมัติ (Apple Vision ตัดพื้นหลังบุคคล 0.5 วิ + ComfyUI Z-Image เจนภาพพื้นหลังสตูดิโอ)...");
    try {
      const data = await autoGenerateAssets(storyboard.storyboardId);
      if (data.storyboard) {
        setStoryboard(data.storyboard);
        setDirty(false);
        editVersion.current++;
        setMessage(
          `✅ สังเคราะห์แอสเซต AI สำเร็จ! ตัดพื้นหลังบุคคล ${data.stats.cutoutsGenerated} ภาพ และเจนภาพพื้นหลัง ComfyUI ${data.stats.backgroundsGenerated} ภาพ บันทึกลงกระดานเรียบร้อย!`
        );
      }
    } catch (err: any) {
      setMessage(`❌ สังเคราะห์แอสเซต AI ล้มเหลว: ${err.message}`);
    } finally {
      setIsGeneratingAssets(false);
    }
  };

  const [isResyncing, setIsResyncing] = useState(false);

  const handleResyncDocx = async () => {
    if (!storyboard) return;
    if (!window.confirm("คุณต้องการโหลดซิงค์บทจากไฟล์ DOCX ต้นฉบับซ้ำหรือไม่?\nระบบจะอัปเดตบทพูดและช่วงเวลาใหม่ แต่คง B-Roll และการตั้งค่าที่ตัดแต่งไว้ทั้งหมด!")) return;
    setIsResyncing(true);
    setMessage("⏳ กำลังโหลดและซิงค์บทใหม่จากไฟล์ DOCX บน NAS...");
    try {
      const updated = await resyncStoryboardDocx(storyboard.storyboardId);
      setStoryboard(updated);
      setDirty(false);
      editVersion.current++;
      setMessage(`✅ โหลดซิงค์ DOCX สำเร็จ! อัปเดตเป็น Revision ${updated.revision} เรียบร้อยแล้ว`);
    } catch (err: any) {
      setMessage(`❌ ซิงค์ DOCX ล้มเหลว: ${err.message}`);
    } finally {
      setIsResyncing(false);
    }
  };

  const blockerCount = diagnostics.filter((item) => item.severity === "blocker").length;

  return (
    <GraphShell>
      <main className="storyboard-editor">
        {/* 5-Step Golden Path Stepper */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "8px 24px",
            background: "rgba(15, 23, 42, 0.8)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            fontSize: "12px",
            color: "#94A3B8",
            flexWrap: "wrap"
          }}
        >
          <span style={{ color: "#34D399", fontWeight: 600 }}>1. นำเข้า DOCX ✓</span>
          <span>➜</span>
          <span style={{ color: storyboard?.items?.length ? "#34D399" : "#94A3B8", fontWeight: 600 }}>
            2. วางโครงเรื่อง ({storyboard?.items?.length ?? 0} ฉาก) {storyboard?.items?.length ? "✓" : ""}
          </span>
          <span>➜</span>
          <span
            style={{
              color: storyboard?.status === "draft" ? "#60A5FA" : "#34D399",
              fontWeight: 700,
              background: storyboard?.status === "draft" ? "rgba(59, 130, 246, 0.2)" : "transparent",
              padding: "2px 8px",
              borderRadius: "4px"
            }}
          >
            3. ปรับแต่ง & Auto B-Roll {storyboard?.status === "draft" ? "(ขั้นตอนปัจจุบัน)" : "✓"}
          </span>
          <span>➜</span>
          <span
            style={{
              color: storyboard?.status === "approved" ? "#34D399" : "#94A3B8",
              fontWeight: storyboard?.status === "approved" ? 700 : 400
            }}
          >
            4. ตรวจและอนุมัติ {storyboard?.status === "approved" ? `(v${storyboard.approvedVersion} ✓)` : ""}
          </span>
          <span>➜</span>
          <span style={{ color: compilation ? "#A78BFA" : "#64748B", fontWeight: compilation ? 600 : 400 }}>
            5. เรนเดอร์ Master Video {compilation ? "✓" : ""}
          </span>
        </div>

        <header className="storyboard-header">
          <div className="storyboard-title-group">
            <div className="storyboard-title-info">
              <div className="storyboard-breadcrumbs">
                <a href="/storyboards">Storyboards</a>
                <span>/</span>
                <span>{storyboard?.name || storyboardId}</span>
                {saveState !== "idle" && (
                  <span className={`save-badge ${saveState}`}>
                    {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState}
                  </span>
                )}
              </div>
              <h1 style={{ margin: "2px 0" }}>{storyboard?.name || "Storyboard Editor"}</h1>
              <p className="storyboard-meta" style={{ margin: 0 }}>
                DOCX: <code>{storyboard?.sourceImport.docxPath}</code> · Revision {storyboard?.revision ?? 0} ·{" "}
                {storyboard?.items.length ?? 0} items · Status <strong>{storyboard?.status}</strong>
                {storyboard?.approvedVersion ? ` · Approved v${storyboard.approvedVersion}` : ""}
                {compilation ? ` · graph ${compilation.graphDigest.slice(0, 12)}` : ""}
              </p>
            </div>
            <div className="aspect-switcher" role="group" aria-label="Aspect Ratio Switcher">
              <button
                type="button"
                className="aspect-btn active"
                title="16:9 Broadcast Master (Active Production Standard)"
                style={{
                  fontWeight: 700,
                  borderColor: "var(--nle-accent-gold)",
                  color: "var(--nle-accent-gold)"
                }}
              >
                🖥️ 16:9 Master
              </button>
              <button
                type="button"
                className="aspect-btn disabled"
                disabled
                title="แนวตั้ง 9:16 Auto-Compositing อยู่ระหว่างการพัฒนา (เปิดใช้งาน 16:9 เท่านั้น)"
                style={{ opacity: 0.35, cursor: "not-allowed" }}
              >
                📱 9:16 (เร็วๆ นี้)
              </button>
              <button
                type="button"
                className="aspect-btn disabled"
                disabled
                title="จัตุรัส 1:1 Auto-Compositing อยู่ระหว่างการพัฒนา (เปิดใช้งาน 16:9 เท่านั้น)"
                style={{ opacity: 0.35, cursor: "not-allowed" }}
              >
                ⏹️ 1:1 (เร็วๆ นี้)
              </button>
            </div>
          </div>
          <div className="storyboard-header-actions">
            <button
              className="button secondary"
              style={{
                borderColor: "rgba(0, 229, 255, 0.5)",
                color: "var(--accent-cyan)",
                background: "rgba(0, 229, 255, 0.12)",
                boxShadow: "0 0 14px rgba(0, 229, 255, 0.25)",
                fontWeight: 700
              }}
              onClick={() => setShowLivePlayer(true)}
            >
              🎬 Interactive Timeline Studio
            </button>
            <button className="button secondary" onClick={() => setShowImport(true)}>
              Compare DOCX import
            </button>
            <button className="button secondary" onClick={validate}>
              Validate
            </button>
            <button
              className="button primary"
              onClick={approveAndCompile}
              disabled={saveState === "saving" || blockerCount > 0}
            >
              Approve Storyboard &amp; Compile Graph
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => setShowRenderModal(true)}
              style={{
                background: "linear-gradient(135deg, #E5A93C 0%, #D97706 100%)",
                color: "#0B132B",
                border: "none",
                fontWeight: 800,
                boxShadow: "0 2px 10px rgba(229, 169, 60, 0.4)",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
              title="เปิดหน้าต่างสั่ง Render Master Video (MP4 1080p @ 25fps) ลงโฟลเดอร์ปลายทาง"
            >
              <span>🚀</span> Render Master Video
            </button>
          </div>
        </header>

        {/* Action Ribbon: AI Automation Hub & Soundtrack Controller */}
        <div
          className="storyboard-action-ribbon"
          style={{
            margin: "0 24px 16px 24px",
            padding: "10px 16px",
            background: "rgba(15, 23, 42, 0.8)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "10px",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "14px",
            backdropFilter: "blur(12px)"
          }}
        >
          {/* Left: Automation Hub */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#94A3B8", letterSpacing: "0.5px", textTransform: "uppercase" }}>
              ⚡ AI Automation:
            </span>
            <button
              className="button primary"
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                borderColor: "rgba(229, 169, 60, 0.8)",
                color: "#FFFFFF",
                background: "linear-gradient(135deg, #D97706 0%, #B45309 100%)",
                boxShadow: "0 0 12px rgba(217, 119, 6, 0.3)",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "5px"
              }}
              onClick={handleFullAutoAll}
              disabled={isFullAutoRunning || isAutoBrollingAll || isAutoLowerThirdRunning || isResyncing}
              title="จัดเต็มระบบ 100% ในคลิกเดียว: ตั้งค่า Title 3D, Cover Card PSU Stidti, Lower-Third ทุก A-Roll และคำนวณ Auto B-Roll ทั้งกระดาน"
            >
              {isFullAutoRunning ? "⏳ กำลังจัดเต็มระบบ..." : "🚀 Full Auto 100% (One-Click)"}
            </button>
            <button
              className="button secondary"
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                borderColor: "rgba(129, 140, 248, 0.7)",
                color: "#E0E7FF",
                background: "rgba(99, 102, 241, 0.22)",
                boxShadow: "0 0 10px rgba(99, 102, 241, 0.2)",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "5px"
              }}
              onClick={handleAutoBrollAll}
              disabled={isAutoBrollingAll || isFullAutoRunning}
              title="วิเคราะห์บทพูดและจัด B-roll ทุกช็อต A-roll อัตโนมัติด้วย AI พร้อมเกลี่ยฟุตเทจไม่ซ้ำกันทั้งกระดาน"
            >
              {isAutoBrollingAll ? "⏳ กำลังจัด B-roll..." : "✨ Auto B-Roll All (ทั้งกระดาน)"}
            </button>
            <button
              className="button secondary"
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                borderColor: "rgba(34, 211, 238, 0.5)",
                color: "#A5F3FC",
                background: "rgba(6, 182, 212, 0.16)",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "5px"
              }}
              onClick={handleAutoLowerThirdAll}
              disabled={isAutoLowerThirdRunning || isFullAutoRunning}
              title="ดึงชื่อและตำแหน่งวิทยากรจาก DOCX มาตั้งค่า Lower-Third (PSU Royal Gold Glass Beacon) ทุกฉาก A-Roll อัตโนมัติ"
            >
              {isAutoLowerThirdRunning ? "⏳ กำลังตั้งค่า..." : "🏷️ Auto Lower-Third All"}
            </button>
            <button
              className="button secondary"
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                borderColor: "rgba(16, 185, 129, 0.5)",
                color: "#A7F3D0",
                background: "rgba(16, 185, 129, 0.14)",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "5px"
              }}
              onClick={handleAutoGenerateAssets}
              disabled={isGeneratingAssets || isFullAutoRunning || isAutoBrollingAll || isResyncing}
              title="สั่งตัดพื้นหลังบุคคลด้วย Apple Vision (0.5 วินาที) และเจนภาพพื้นหลังสตูดิโอด้วย ComfyUI เข้า Storyboard โดยอัตโนมัติ"
            >
              {isGeneratingAssets ? "⏳ กำลังเจนแอสเซต..." : "🎨 Auto Cover Assets"}
            </button>
            <button
              className="button secondary"
              style={{
                padding: "6px 10px",
                fontSize: "12px",
                borderColor: "rgba(148, 163, 184, 0.3)",
                color: "#94A3B8",
                background: "rgba(30, 41, 59, 0.4)"
              }}
              onClick={handleResyncDocx}
              disabled={isResyncing}
              title="โหลดไฟล์ DOCX ต้นฉบับจาก NAS ใหม่อีกครั้ง เพื่อซิงค์บทพูดล่าสุดโดยคง B-roll และการตัดต่อเดิมไว้"
            >
              {isResyncing ? "⏳..." : "🔄 ซิงค์ DOCX"}
            </button>
          </div>

          {/* Right: BGM & Soundtrack Controller */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(11, 18, 32, 0.7)", padding: "4px 10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#FBBF24" }}>🎵 BGM:</span>
            <select
              value={bgmPresetId}
              onChange={(e) => {
                setBgmPresetId(e.target.value);
                const preset = BGM_PRESETS.find((p) => p.id === e.target.value);
                if (preset?.path) {
                  setCustomBgmPath(preset.path);
                }
              }}
              style={{
                background: "#090D16",
                border: "1px solid #334155",
                color: "#F8FAFC",
                fontSize: "11px",
                padding: "4px 8px",
                borderRadius: "6px",
                outline: "none"
              }}
            >
              {BGM_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
              {bgmPresetId === "custom" && (
                <option value="custom">📁 Custom: {customBgmPath ? customBgmPath.split("/").pop() : "ไฟล์เฉพาะกิจ"}</option>
              )}
            </select>

            {effectiveAuditionPath && bgmPresetId !== "none" && (
              <button
                type="button"
                onClick={toggleAudition}
                style={{
                  background: isAuditionPlaying ? "rgba(239, 68, 68, 0.3)" : "rgba(139, 92, 246, 0.2)",
                  border: `1px solid ${isAuditionPlaying ? "#EF4444" : "#8B5CF6"}`,
                  borderRadius: "4px",
                  color: isAuditionPlaying ? "#FCA5A5" : "#C4B5FD",
                  padding: "3px 8px",
                  fontSize: "10px",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
                title="กดเพื่อลองฟังเสียงเพลงตัวอย่าง (Audition)"
              >
                {isAuditionPlaying ? "⏸️ หยุด" : "▶️ พรีวิว"}
              </button>
            )}

            {effectiveAuditionPath && (
              <audio
                ref={audioAuditionRef}
                src={`/api/v1/media/stream?path=${encodeURIComponent(effectiveAuditionPath)}`}
                onEnded={() => setIsAuditionPlaying(false)}
                onError={() => setIsAuditionPlaying(false)}
              />
            )}

            {bgmPresetId !== "none" && (
              <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#CBD5E1", cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={autoDucking}
                  onChange={(e) => setAutoDucking(e.target.checked)}
                />
                <span>Auto-Ducking</span>
                {autoDucking && (
                  <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "4px", background: "rgba(34, 211, 238, 0.2)", color: "#22D3EE", fontWeight: 600 }}>
                    -14dB ในเสียงพูด
                  </span>
                )}
              </label>
            )}
          </div>
        </div>

        {isBgmPickerOpen && (
          <RemoteFilePickerModal
            isOpen={isBgmPickerOpen}
            initialPath=""
            mode="file"
            filter=".mp3,.wav,.m4a,.aac,.flac,.ogg"
            title="เลือกไฟล์เพลงประกอบ BGM จาก NAS หรือเครื่อง"
            onSelect={(selectedPath) => {
              setCustomBgmPath(selectedPath);
              setBgmPresetId("custom");
              setIsBgmPickerOpen(false);
            }}
            onClose={() => setIsBgmPickerOpen(false)}
          />
        )}

        {showLivePlayer && storyboard && (
          <InteractiveTimelineStudioModal
            storyboard={storyboard}
            bgmTrack={selectedBgmTrack}
            onMutate={(updater) => {
              setStoryboard((prev) => {
                if (!prev) return prev;
                const next = updater(prev);
                setDirty(true);
                editVersion.current++;
                return next;
              });
            }}
            onClose={() => setShowLivePlayer(false)}
          />
        )}

        {showRenderModal && storyboard && (
          <RenderProgressModal
            isOpen={showRenderModal}
            onClose={() => setShowRenderModal(false)}
            storyboard={storyboard}
            bgmTrack={selectedBgmTrack}
            initialFormat={aspectRatio === "9:16" ? "9:16" : "16:9"}
          />
        )}

        {message && <aside className="storyboard-banner">{message}</aside>}

        {showImport && sourceImport && (
          <section className="docx-compare-drawer">
            <header>
              <div>
                <h2>DOCX Source Comparison</h2>
                <small>
                  {sourceImport.docxPath} · {sourceImport.rawRows.length} raw rows ·{" "}
                  {sourceImport.proposals.length} auto-proposed
                </small>
              </div>
              <button className="button secondary" onClick={() => setShowImport(false)}>
                Close
              </button>
            </header>
            <div className="raw-row-grid">
              {sourceImport.rawRows.map((row) => (
                <article key={row.rowIndex}>
                  <header>
                    <strong>Row {row.rowNumber}</strong>
                    <small>{row.cells[0]}</small>
                  </header>
                  <p>
                    <strong>Picture:</strong> {row.picture || "—"}
                  </p>
                  <p>
                    <strong>Sound:</strong> {row.sound || "—"}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        <div className="storyboard-workspace">
          <section className="storyboard-outline">
            <header>
              <h2>Editorial sequence</h2>
              <div className="outline-add">
                <button onClick={() => addItem("a_roll")}>+ A-roll</button>
                <button onClick={() => addItem("title")}>+ 3D Title</button>
                <button onClick={() => addItem("cover_card")}>+ Cover card</button>
                <button onClick={() => addItem("logo_outro")}>+ Logo</button>
                <button onClick={() => addItem("note")}>+ Note</button>
              </div>
            </header>
            <div className="outline-list">
              {storyboard?.items.map((item, index) => (
                <div key={item.id} className="outline-item-group">
                  <article
                    className={`outline-item ${selectedId === item.id && !selectedBrollId ? "selected" : ""}`}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== undefined) reorder(dragIndex, index);
                      setDragIndex(undefined);
                    }}
                    onClick={() => {
                      setSelectedId(item.id);
                      setSelectedBrollId("");
                    }}
                  >
                    <span className={`kind-dot ${item.kind}`} />
                    <div>
                      <strong>
                        {index + 1}. {kindLabel(item.kind)}
                      </strong>
                      <small>
                        {item.id} · {item.kind === "note" ? "no timeline" : formatMs(item.durationMs)} ·{" "}
                        {item.audioPolicy}
                      </small>
                    </div>
                    <div className="item-move">
                      <button
                        aria-label="Move up"
                        onClick={(event) => {
                          event.stopPropagation();
                          reorder(index, index - 1);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        aria-label="Move down"
                        onClick={(event) => {
                          event.stopPropagation();
                          reorder(index, index + 1);
                        }}
                      >
                        ↓
                      </button>
                    </div>
                  </article>
                  {item.kind === "a_roll" && (
                    <div className="outline-broll-children">
                      {(item.broll ?? []).map((broll, brollIndex) => (
                        <button
                          type="button"
                          key={broll.id}
                          className={`outline-broll-item ${
                            selectedId === item.id && selectedBrollId === broll.id ? "selected" : ""
                          }`}
                          onClick={() => {
                            setSelectedId(item.id);
                            setSelectedBrollId(broll.id);
                          }}
                        >
                          <span>↳</span>
                          <span>
                            <strong>B-roll {brollIndex + 1}</strong>
                            <small>
                              {broll.asset.path.split(/[\\/]/).filter(Boolean).at(-1) || "ยังไม่ได้เลือกไฟล์"} ·
                              +{formatSeconds(broll.offsetMs)}s · {formatSeconds(broll.durationMs)}s
                            </small>
                          </span>
                          <em>V2</em>
                        </button>
                      ))}
                      <button
                        type="button"
                        className="outline-add-broll"
                        onClick={() => addBroll(item)}
                      >
                        ＋ Add B-roll under A-roll
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* PANE 2: LIVE STUDIO CANVAS & TIMELINE */}
          <section className="studio-canvas-pane">
            <div className="canvas-header">
              <h2><span>🎬</span> Studio Canvas Monitor</h2>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  className="aspect-btn"
                  onClick={() => setShowSafeZones((v) => !v)}
                  style={{
                    border: "1px solid var(--border-subtle)",
                    background: showSafeZones ? "rgba(0, 229, 255, 0.15)" : "transparent",
                    color: showSafeZones ? "var(--accent-cyan)" : "var(--text-muted)"
                  }}
                >
                  🎯 Safe Zones {showSafeZones ? "ON" : "OFF"}
                </button>
                <button
                  type="button"
                  className="aspect-btn active"
                  onClick={() => setShowLivePlayer(true)}
                  style={{
                    border: "1px solid rgba(229, 169, 60, 0.4)",
                    background: "rgba(229, 169, 60, 0.12)",
                    color: "var(--accent-gold)"
                  }}
                >
                  ⚡ Open Detailed Studio
                </button>
              </div>
            </div>

            <div className="canvas-viewport-container">
              <div
                className="canvas-viewport"
                style={{
                  width: "480px",
                  height: "270px",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  background: "radial-gradient(circle at center, #111C30 0%, #060A12 100%)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.5)"
                }}
              >
                {showSafeZones && (
                  <div className="safe-zone-overlay" style={{ inset: "5%", border: "1px dashed rgba(229, 169, 60, 0.4)" }}>
                    <div className="safe-zone-box" style={{ inset: "5%", border: "1px solid rgba(0, 229, 255, 0.3)" }}>
                      <span className="safe-zone-label" style={{ color: "#E5A93C", fontSize: "10px" }}>16:9 Broadcast Safe Area</span>
                    </div>
                  </div>
                )}

                {selected ? (
                  <div style={{ textAlign: "center", padding: "16px", zIndex: 1 }}>
                    <span className={`kind-pill ${selected.kind}`} style={{ marginBottom: "10px" }}>
                      {kindLabel(selected.kind)}
                    </span>
                    <div style={{ fontSize: "14px", fontWeight: 800, color: "#F8FAFC", marginTop: "8px" }}>
                      {selected.params.title ? String(selected.params.title) : selected.id}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--accent-cyan)", fontFamily: "monospace", marginTop: "4px" }}>
                      ⏱ {formatSeconds(selected.durationMs)}s ({selected.audioPolicy})
                    </div>
                    {selected.presetId && (
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "6px" }}>
                        Preset: {selected.presetId}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: "var(--text-dim)", fontSize: "12px" }}>No Scene Selected</div>
                )}
              </div>
            </div>

            {/* Quick Scrub Controls & Sequence Blocks */}
            <div className="studio-scrub-strip">
              <div className="scrub-controls">
                <div className="timecode-display">
                  00:00:00:00 · {storyboard?.items.length ?? 0} Clips
                </div>
                <div className="scrub-buttons">
                  <button
                    type="button"
                    className="scrub-btn"
                    title="Step back 1 frame (-40ms)"
                    onClick={() => {
                      if (!selected) return;
                      updateDuration(Math.max(40, selected.durationMs - 40));
                    }}
                  >
                    -1 Frame
                  </button>
                  <button
                    type="button"
                    className="scrub-btn"
                    title="Step forward 1 frame (+40ms)"
                    onClick={() => {
                      if (!selected) return;
                      updateDuration(selected.durationMs + 40);
                    }}
                  >
                    +1 Frame
                  </button>
                </div>
              </div>

              <div className="canvas-mini-timeline" title="Click a clip to inspect">
                {storyboard?.items.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`mini-timeline-block ${item.kind} ${selectedId === item.id ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedId(item.id);
                      setSelectedBrollId("");
                    }}
                    title={`${idx + 1}. ${item.id} (${formatSeconds(item.durationMs)}s)`}
                  >
                    {idx + 1}. {item.id}
                  </div>
                ))}
              </div>
            </div>

            {/* Sleek Collapsible Diagnostics Drawer */}
            <aside
              className={`diagnostics-drawer ${blockerCount > 0 ? "has-blockers" : ""}`}
              onClick={() => setShowDiagnosticsDetail((v) => !v)}
              role="button"
              tabIndex={0}
              aria-label="Toggle diagnostics details"
            >
              <header>
                <span>{blockerCount > 0 ? "⚠️ Diagnostics" : "✓ Diagnostics"}</span>
                <span>
                  {blockerCount > 0 ? `${blockerCount} blockers` : "All checks passed"}{" "}
                  <strong style={{ fontSize: "9px", marginLeft: "4px" }}>
                    {showDiagnosticsDetail ? "▲" : "▼"}
                  </strong>
                </span>
              </header>
              {(showDiagnosticsDetail || blockerCount > 0) && (
                <div className="diagnostics-list">
                  {diagnostics.length ? (
                    diagnostics.map((item, index) => (
                      <article
                        key={`${item.code}-${index}`}
                        className={item.severity}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.itemId) setSelectedId(item.itemId);
                        }}
                      >
                        <strong>{item.code}</strong> {item.message}
                        {item.rowNumber && <small> (DOCX row {item.rowNumber})</small>}
                      </article>
                    ))
                  ) : (
                    <p className="empty-diagnostics" style={{ margin: 0, fontSize: "10px" }}>
                      กด Validate เพื่อตรวจ Storyboard revision ปัจจุบัน
                    </p>
                  )}
                </div>
              )}
            </aside>
          </section>

          {/* PANE 3: MODULAR TABBED INSPECTOR */}
          <section className="storyboard-inspector">
            {selected ? (
              <>
                <div className="inspector-heading">
                  <div>
                    <span className={`kind-pill ${selected.kind}`}>{kindLabel(selected.kind)}</span>
                    <h2>{selected.id}</h2>
                  </div>
                  <div className="inspector-heading-actions">
                    <button className="button secondary danger" onClick={deleteSelected}>
                      Delete
                    </button>
                  </div>
                </div>

                {/* Inspector Tabs */}
                <div className="inspector-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeInspectorTab === "style"}
                    className={`inspector-tab-btn ${activeInspectorTab === "style" ? "active" : ""}`}
                    onClick={() => setActiveInspectorTab("style")}
                  >
                    🎨 Style
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeInspectorTab === "media"}
                    className={`inspector-tab-btn ${activeInspectorTab === "media" ? "active" : ""}`}
                    onClick={() => setActiveInspectorTab("media")}
                  >
                    📁 Media
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeInspectorTab === "timing"}
                    className={`inspector-tab-btn ${activeInspectorTab === "timing" ? "active" : ""}`}
                    onClick={() => setActiveInspectorTab("timing")}
                  >
                    ⏱️ Timing
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeInspectorTab === "graphics"}
                    className={`inspector-tab-btn ${activeInspectorTab === "graphics" ? "active" : ""}`}
                    onClick={() => setActiveInspectorTab("graphics")}
                  >
                    🏷️ Graphics
                  </button>
                </div>

                <div className="inspector-scroll-body nle-scroll">
                  <section className="inspector-section">
                    <h3>Node setup</h3>
                    <div className="field-grid">
                      <label>
                        Kind
                        <select
                          value={selected.kind}
                          onChange={(event) => changeKind(event.target.value as StoryboardKind)}
                        >
                          {["title", "a_roll", "cover_card", "logo_outro", "note"].map((value) => (
                            <option key={value} value={value}>
                              {kindLabel(value as StoryboardKind)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {selected.kind !== "note" && (
                        <>
                          <SecondsField
                            label="Duration"
                            valueMs={selected.durationMs}
                            minMs={40}
                            onChange={updateDuration}
                          />
                          <label>
                            Preset
                            <select
                              aria-label="Preset"
                              value={selected.presetId ?? presetOptions[selected.kind][0]?.value ?? ""}
                              onChange={(event) => updatePreset(event.target.value)}
                            >
                              {presetOptions[selected.kind].map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <small className="field-help">
                              เลือกเฉพาะ preset ที่รองรับ {kindLabel(selected.kind)}
                            </small>
                          </label>
                          <label>
                            Audio policy
                            <select value={selected.audioPolicy} disabled>
                              <option>{selected.audioPolicy}</option>
                            </select>
                            <small className="field-help">กำหนดตามชนิดโหนดเพื่อป้องกันเสียงซ้อน</small>
                          </label>
                        </>
                      )}
                    </div>
                  </section>

                  {selected.kind === "a_roll" && (
                    <ARollInspector
                      item={selected}
                      storyboardId={storyboardId}
                      selectedBrollId={selectedBrollId}
                      onSelectBroll={setSelectedBrollId}
                      onParams={updateParams}
                      onItem={replaceItem}
                      canMerge={canMerge}
                      onSplit={splitSelected}
                      onMerge={mergePrevious}
                    />
                  )}
                  {selected.kind === "title" && (
                    <TitleCarouselInspector
                      item={selected}
                      onParams={updateParams}
                      onItem={replaceItem}
                    />
                  )}
                  {selected.kind === "cover_card" && (
                    <CoverCardInspector
                      item={selected}
                      onParams={updateParams}
                      onRun={triggerRun}
                      nodeRun={nodeRun}
                      nodeRunBusy={nodeRunBusy}
                      saveState={saveState}
                    />
                  )}
                  {selected.kind === "logo_outro" && (
                    <LogoOutroInspector item={selected} onParams={updateParams} onItem={replaceItem} />
                  )}
                  {selected.kind === "note" && (
                    <NoteInspector item={selected} onParams={updateParams} />
                  )}
                </div>
              </>
            ) : (
              <p>Select an item to edit.</p>
            )}
          </section>
        </div>

        <section className="compiled-preview">
          <header>
            <div>
              <h2>Compiled backend graph</h2>
              <p>
                {compilation
                  ? `Storyboard v${compilation.storyboardVersion} · ${compilation.graph.nodes.length} nodes · digest ${compilation.graphDigest.slice(0, 12)}`
                  : "Approve storyboard เพื่อสร้าง deterministic preview"}
              </p>
            </div>
            <button
              className="button secondary"
              disabled={!compilation}
              onClick={() => setShowGraph((value) => !value)}
            >
              {showGraph ? "Hide graph" : "Open advanced graph"}
            </button>
          </header>
          {showGraph && compilation && (
            <div className="readonly-graph" aria-label="Read-only compiled graph">
              {compilation.graph.order.map((nodeId, index) => {
                const node = compilation.graph.nodes.find((value) => value.id === nodeId);
                return node ? (
                  <article key={node.id}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{node.type}</strong>
                      <small>{node.id}</small>
                      <code>source: {compilation.provenance[node.id]}</code>
                    </div>
                  </article>
                ) : null;
              })}
            </div>
          )}
        </section>
      </main>
    </GraphShell>
  );
}

const presetOptions: Record<Exclude<StoryboardKind, "note">, Array<{ value: string; label: string }>> & {
  note: never[];
} = {
  a_roll: [
    { value: "a-roll-segment-v1", label: "🎤 Standard Interview / Talking Head · v1" },
    { value: "a-roll-voiceover-v1", label: "🎙️ Voiceover & Full B-roll · v1" },
    { value: "a-roll-pip-v1", label: "🖼️ Picture-in-Picture Presentation · v1" }
  ],
  title: [
    { value: "3d-carousel-title-v1", label: "🎡 3D Photo Carousel Showcase · v1 (Gold Standard)" },
    { value: "title-parallax-cinema-v1", label: "🎥 Cinematic Parallax Multi-Layer · v1" },
    { value: "title-split-dynamic-v1", label: "⚡ High-Energy Dynamic Split Screen · v1" },
    { value: "title-classic-flat-v1", label: "🎬 Classic Cinematic Title · v1" },
    { value: "title-minimal-badge-v1", label: "🏛️ Modern Minimal Title · v1" }
  ],
  cover_card: [
    { value: "comfy-cover-card-v2", label: "Layered Cover Card · v2" },
    { value: "comfy-cover-card-v1", label: "Legacy Flattened Cover · v1" }
  ],
  logo_outro: [
    { value: "logo-outro-v1", label: "🌟 PSU Golden Light Streak Ident · v1" },
    { value: "logo-outro-particle-burst-v1", label: "✨ Celestial Particle Burst Ident · v1" },
    { value: "logo-outro-video-v1", label: "🎥 Fullscreen Video Sting · v1" },
    { value: "logo-outro-minimal-v1", label: "🏛️ Modern Minimal Emblem · v1" }
  ],
  note: []
};

function itemDefaults(kind: StoryboardKind, id: string): StoryboardItem {
  if (kind === "a_roll")
    return {
      id,
      kind,
      durationMs: 4000,
      audioPolicy: "preserve",
      presetId: "a-roll-segment-v1",
      params: { sourceKey: "", sourcePath: "", sourceInMs: 0, sourceOutMs: 4000, dialogue: "" },
      broll: []
    };
  if (kind === "title")
    return {
      id,
      kind,
      durationMs: 25300,
      audioPolicy: "mute",
      presetId: "3d-carousel-title-v1",
      params: { composition: "Main", media: [], text: "", texts: {} }
    };
  if (kind === "cover_card")
    return {
      id,
      kind,
      durationMs: 6000,
      audioPolicy: "mute",
      presetId: "comfy-cover-card-v2",
      params: {
        sourceImage: "",
        prompt: "",
        personName: "",
        positionTitle: "",
        award: "",
        seed: 1,
        randomSeed: true,
        doodleEnabled: false,
        doodlePrompt: "",
        doodleOpacity: 1,
        doodleScale: 1,
        personX: 0.72,
        personY: 0.5,
        personScale: 1,
        textStyles: {
          eyebrow: { fontFamily: "system", positionX: 8, positionY: 68, size: 22, color: "#E5A93C" },
          title: { fontFamily: "system", positionX: 8, positionY: 77, size: 56, color: "#FFFFFF" },
          subtitle: { fontFamily: "system", positionX: 8, positionY: 88, size: 25, color: "#00E5FF" }
        }
      }
    };
  if (kind === "logo_outro")
    return {
      id,
      kind,
      durationMs: 4000,
      audioPolicy: "mute",
      presetId: "logo-outro-v1",
      params: {
        sourcePath: "/Volumes/ภาควีดีทัศน์/Logo 88 2561/Prince_of_Songkla_University_Emblem.png",
        title: "PSU BROADCAST",
        note: "PSU BROADCAST",
        subtitle: "Prince of Songkla University",
        eyebrow: "มหาวิทยาลัยสงขลานครินทร์",
        logoScale: 1.0,
        glowIntensity: 1.0
      }
    };
  return { id, kind: "note", durationMs: 0, audioPolicy: "mute", params: { text: "" } };
}

function uniqueId(prefix: string, existing: string[]) {
  let index = 1;
  let value = prefix.replace(/[^A-Za-z0-9_-]/g, "_");
  while (existing.includes(value)) value = `${prefix}_${++index}`;
  return value;
}

function kindLabel(kind: StoryboardKind) {
  return ({
    title: "3D Title",
    a_roll: "A-roll",
    cover_card: "Cover card",
    logo_outro: "Logo / Outro",
    note: "Note"
  })[kind];
}

function formatMs(value: number) {
  const seconds = Math.floor(value / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
