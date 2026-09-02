import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { GraphShell } from "./WorkflowCatalogPage";
import {
  approveAndCompileStoryboard,
  getStoryboard,
  getStoryboardCompilation,
  getStoryboardImport,
  patchStoryboard,
  validateStoryboard
} from "./storyboard-api";
import type { Storyboard, StoryboardCompilation, StoryboardDiagnostic, StoryboardImport, StoryboardItem, StoryboardKind } from "./storyboard-types";
import { InteractiveTimelineStudioModal } from "./components/InteractiveTimelineStudioModal";
import {
  ARollInspector,
  CoverCardInspector,
  LogoOutroInspector,
  NoteInspector,
  TitleCarouselInspector,
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

  const blockerCount = diagnostics.filter((item) => item.severity === "blocker").length;

  return (
    <GraphShell>
      <main className="storyboard-editor">
        <header className="storyboard-header">
          <div>
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
            <h1>{storyboard?.name || "Storyboard Editor"}</h1>
            <p className="storyboard-meta">
              DOCX: <code>{storyboard?.sourceImport.docxPath}</code> · Revision {storyboard?.revision ?? 0} ·{" "}
              {storyboard?.items.length ?? 0} items · Status <strong>{storyboard?.status}</strong>
              {storyboard?.approvedVersion ? ` · Approved v${storyboard.approvedVersion}` : ""}
              {compilation ? ` · graph ${compilation.graphDigest.slice(0, 12)}` : ""}
            </p>
          </div>
          <div className="storyboard-header-actions">
            <button
              className="button secondary"
              style={{
                background: "linear-gradient(135deg, rgba(229,169,60,.18), rgba(0,229,255,.14))",
                borderColor: "rgba(229,169,60,.45)",
                color: "#F8FAFC"
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
          </div>
        </header>

        {showLivePlayer && storyboard && (
          <InteractiveTimelineStudioModal
            storyboard={storyboard}
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
              </>
            ) : (
              <p>Select an item to edit.</p>
            )}
          </section>

          <aside className="storyboard-diagnostics">
            <h2>
              Diagnostics <span>{blockerCount} blockers</span>
            </h2>
            {diagnostics.length ? (
              diagnostics.map((item, index) => (
                <article
                  key={`${item.code}-${index}`}
                  className={item.severity}
                  onClick={() => item.itemId && setSelectedId(item.itemId)}
                >
                  <strong>{item.code}</strong>
                  <p>{item.message}</p>
                  {item.rowNumber && <small>DOCX row {item.rowNumber}</small>}
                </article>
              ))
            ) : (
              <p className="empty-diagnostics">กด Validate เพื่อตรวจ Storyboard revision ปัจจุบัน</p>
            )}
          </aside>
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
  a_roll: [{ value: "a-roll-segment-v1", label: "A-roll Segment · v1" }],
  title: [
    { value: "3d-carousel-title-v1", label: "🎡 3D Photo Carousel Showcase · v1" },
    { value: "title-classic-flat-v1", label: "🎬 Classic Cinematic Title · v1" },
    { value: "title-minimal-badge-v1", label: "🏛️ Modern Minimal Title · v1" }
  ],
  cover_card: [
    { value: "comfy-cover-card-v2", label: "Layered Cover Card · v2" },
    { value: "comfy-cover-card-v1", label: "Legacy Flattened Cover · v1" }
  ],
  logo_outro: [
    { value: "logo-outro-v1", label: "🌟 PSU Golden Pulse Glow · v1" },
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
