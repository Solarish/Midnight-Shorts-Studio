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
import { RemoteFilePickerModal } from "./components/RemoteFilePickerModal";
import { InteractiveTimelineStudioModal } from "./components/InteractiveTimelineStudioModal";
import "./storyboard.css";
import "./storyboard-path.css";
import "./storyboard-node-inspector.css";

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

  const load = useCallback(async () => {
    setMessage("");
    const value = await getStoryboard(storyboardId);
    setStoryboard(value); setSelectedId((current) => current || value.items[0]?.id || ""); setDirty(false); setSaveState("idle");
    const imported = await getStoryboardImport(value.sourceImport.importId); setSourceImport(imported);
    if (value.approvedVersion) setCompilation(await getStoryboardCompilation(value.storyboardId, value.approvedVersion));
  }, [storyboardId]);

  useEffect(() => { void load().catch((cause) => setMessage(cause.message)); }, [load]);

  const commit = useCallback(async (snapshot: Storyboard) => {
    const version = editVersion.current;
    setSaveState("saving");
    try {
      const saved = await patchStoryboard(snapshot);
      setStoryboard((current) => editVersion.current === version ? saved : current ? { ...current, revision: saved.revision, status: "stale" } : saved);
      if (editVersion.current === version) { setDirty(false); setSaveState("saved"); }
      else setSaveState("idle");
      return saved;
    } catch (cause: any) {
      setSaveState(cause.status === 409 ? "conflict" : "error"); setMessage(cause.message); throw cause;
    }
  }, []);

  useEffect(() => {
    if (!dirty || !storyboard || saveState === "saving" || saveState === "conflict") return;
    const timer = window.setTimeout(() => { void commit(storyboard).catch(() => {}); }, 900);
    return () => window.clearTimeout(timer);
  }, [commit, dirty, saveState, storyboard]);

  const mutate = (change: (value: Storyboard) => Storyboard) => {
    setStoryboard((current) => current ? change(current) : current);
    editVersion.current += 1; setDirty(true); setSaveState("idle"); setDiagnostics([]); setMessage("");
  };

  const selected = useMemo(() => storyboard?.items.find((item) => item.id === selectedId), [selectedId, storyboard]);
  const selectedIndex = storyboard?.items.findIndex((item) => item.id === selectedId) ?? -1;

  const replaceItem = (next: StoryboardItem) => mutate((value) => ({ ...value, items: value.items.map((item) => item.id === next.id ? next : item), status: value.status === "approved" ? "stale" : value.status }));
  const updateItem = (patch: Partial<StoryboardItem>) => { if (selected) replaceItem({ ...selected, ...patch }); };
  const updateParams = (patch: Record<string, unknown>) => { if (selected) replaceItem({ ...selected, params: { ...selected.params, ...patch } }); };
  const updatePreset = (presetId: string) => {
    if (!selected) return;
    const params = selected.kind === "cover_card" && presetId === "comfy-cover-card-v2"
      ? migrateLegacyCoverParams(selected.params)
      : selected.params;
    replaceItem({ ...selected, presetId, params });
  };
  const updateDuration = (durationMs: number) => {
    if (!selected) return;
    if (selected.kind === "a_roll") {
      const sourceInMs = Number(selected.params.sourceInMs ?? 0);
      replaceItem({ ...selected, durationMs, params: { ...selected.params, sourceOutMs: sourceInMs + durationMs } });
      return;
    }
    updateItem({ durationMs });
  };

  async function validate() {
    if (!storyboard) return;
    setMessage("");
    try {
      const saved = dirty ? await commit(storyboard) : storyboard;
      const result = await validateStoryboard(saved.storyboardId); setDiagnostics(result.diagnostics); setMessage("Storyboard validation passed");
    } catch (cause: any) {
      const values = cause.details?.diagnostics ?? []; setDiagnostics(values); setMessage(values.length ? "พบรายการที่ต้องแก้ก่อน Approve" : cause.message);
    }
  }

  async function approve() {
    if (!storyboard) return;
    setMessage("");
    try {
      const saved = dirty ? await commit(storyboard) : storyboard;
      const result = await approveAndCompileStoryboard(saved); setCompilation(result.compilation); setDiagnostics(result.diagnostics);
      const refreshed = await getStoryboard(saved.storyboardId); setStoryboard(refreshed); setDirty(false); setShowGraph(true);
      setMessage(`Approved storyboard v${result.approved.version} · graph ${result.compilation.graphDigest.slice(0, 12)}`);
    } catch (cause: any) {
      const values = cause.details?.diagnostics ?? []; setDiagnostics(values); setMessage(values.length ? "Approve ไม่สำเร็จ: ยังมี blocker" : cause.message);
    }
  }

  function reorder(from: number, to: number) {
    if (!storyboard || from === to || to < 0 || to >= storyboard.items.length) return;
    mutate((value) => { const items = [...value.items]; const [moved] = items.splice(from, 1); if (moved) items.splice(to, 0, moved); return { ...value, items, status: value.status === "approved" ? "stale" : value.status }; });
  }

  function changeKind(kind: StoryboardKind) {
    if (!selected) return;
    const defaults = itemDefaults(kind, selected.id);
    replaceItem({ ...defaults, sourceRowNumbers: selected.sourceRowNumbers, params: { ...defaults.params, ...(kind === selected.kind ? selected.params : {}) } });
  }

  function splitSelected() {
    if (!storyboard || !selected || selected.kind !== "a_roll") return;
    const sourceIn = Number(selected.params.sourceInMs); const sourceOut = Number(selected.params.sourceOutMs);
    const split = Math.round(((sourceIn + sourceOut) / 2) / 40) * 40;
    if (split <= sourceIn || split >= sourceOut) return;
    const nextId = uniqueId(`${selected.id}_part`, storyboard.items.map((item) => item.id));
    const left = { ...selected, durationMs: split - sourceIn, params: { ...selected.params, sourceOutMs: split } };
    const right = { ...selected, id: nextId, durationMs: sourceOut - split, params: { ...selected.params, sourceInMs: split }, broll: [] };
    mutate((value) => { const items = [...value.items]; items.splice(selectedIndex, 1, left, right); return { ...value, items, status: value.status === "approved" ? "stale" : value.status }; });
    setSelectedId(nextId);
  }

  function mergePrevious() {
    if (!storyboard || !selected || selectedIndex < 1 || selected.kind !== "a_roll") return;
    const previous = storyboard.items[selectedIndex - 1];
    if (!previous || previous.kind !== "a_roll" || previous.params.sourceKey !== selected.params.sourceKey || Number(previous.params.sourceOutMs) !== Number(selected.params.sourceInMs)) return;
    const merged: StoryboardItem = { ...previous, durationMs: previous.durationMs + selected.durationMs, params: { ...previous.params, sourceOutMs: selected.params.sourceOutMs, dialogue: `${String(previous.params.dialogue ?? "")} ${String(selected.params.dialogue ?? "")}`.trim() }, broll: [...(previous.broll ?? []), ...(selected.broll ?? []).map((item) => ({ ...item, offsetMs: item.offsetMs + previous.durationMs }))] };
    mutate((value) => { const items = [...value.items]; items.splice(selectedIndex - 1, 2, merged); return { ...value, items, status: value.status === "approved" ? "stale" : value.status }; });
    setSelectedId(merged.id);
  }

  function addItem(kind: StoryboardKind) {
    if (!storyboard) return;
    const item = itemDefaults(kind, uniqueId(kind, storyboard.items.map((value) => value.id)));
    mutate((value) => ({ ...value, items: [...value.items, item], status: value.status === "approved" ? "stale" : value.status })); setSelectedId(item.id);
  }

  function addBroll(parent: StoryboardItem) {
    if (parent.kind !== "a_roll") return;
    const broll = parent.broll ?? [];
    const next = { id: uniqueId(`${parent.id}_broll`, broll.map((value) => value.id)), asset: { path: "" }, offsetMs: 0, durationMs: Math.min(4000, parent.durationMs), audioPolicy: "mute" as const, fit: "cover" as const };
    replaceItem({ ...parent, broll: [...broll, next] });
    setSelectedId(parent.id); setSelectedBrollId(next.id);
  }

  function deleteSelected() {
    if (!storyboard || !selected) return;
    const remaining = storyboard.items.filter((item) => item.id !== selected.id);
    mutate((value) => ({ ...value, items: remaining, status: value.status === "approved" ? "stale" : value.status })); setSelectedId(remaining[Math.max(0, selectedIndex - 1)]?.id ?? "");
  }

  if (!storyboard) return <GraphShell><main className="storyboard-loading">{message || "Loading Storyboard…"}</main></GraphShell>;
  const blockerCount = diagnostics.filter((item) => item.severity === "blocker").length;
  const totalMs = storyboard.items.reduce((sum, item) => sum + (item.kind === "note" ? 0 : item.durationMs), 0);
  const canMerge = selected?.kind === "a_roll" && selectedIndex > 0 && storyboard.items[selectedIndex - 1]?.kind === "a_roll" && storyboard.items[selectedIndex - 1]?.params.sourceKey === selected.params.sourceKey && Number(storyboard.items[selectedIndex - 1]?.params.sourceOutMs) === Number(selected.params.sourceInMs);

  const currentAspect: "9:16" | "16:9" | "1:1" =
    storyboard.profile?.width === 1080 && storyboard.profile?.height === 1920
      ? "9:16"
      : storyboard.profile?.width === 1080 && storyboard.profile?.height === 1080
      ? "1:1"
      : "16:9";

  function changeAspect(aspect: "9:16" | "16:9" | "1:1") {
    const profileMap = {
      "9:16": { width: 1080, height: 1920, frameRate: 25 as const },
      "16:9": { width: 1920, height: 1080, frameRate: 25 as const },
      "1:1": { width: 1080, height: 1080, frameRate: 25 as const }
    };
    mutate((value) => ({
      ...value,
      profile: profileMap[aspect],
      status: value.status === "approved" ? "stale" : value.status
    }));
  }

  return <GraphShell><main className="storyboard-page">
    <header className="storyboard-header">
      <div>
        <p className="eyebrow">GUIDED STORYBOARD · SOURCE OF TRUTH</p>
        <input className="storyboard-name" value={storyboard.name} onChange={(event) => mutate((value) => ({ ...value, name: event.target.value }))}/>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#94a3b8" }}>
            <span>ขนาดวิดีโอ:</span>
            <select
              value={currentAspect}
              onChange={(e) => changeAspect(e.target.value as "9:16" | "16:9" | "1:1")}
              style={{
                background: "#1e293b",
                border: "1px solid #3b82f6",
                borderRadius: "6px",
                color: "#60a5fa",
                padding: "4px 8px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              <option value="9:16">📱 แนวตั้ง 9:16 (1080×1920) · TikTok / Shorts</option>
              <option value="16:9">🖥️ แนวนอน 16:9 (1920×1080) · YouTube / Broadcast</option>
              <option value="1:1">⏹️ สี่เหลี่ยม 1:1 (1080×1080) · Post / Feed</option>
            </select>
          </label>
          <span style={{ color: "#475569" }}>|</span>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "12px" }}>
            {storyboard.profile?.width ?? 1920}×{storyboard.profile?.height ?? 1080} · 25fps · {formatMs(totalMs)} · rev {storyboard.revision}
          </p>
        </div>
      </div>
      <div className="storyboard-actions">
        <button
          type="button"
          className="button secondary"
          onClick={() => setShowLivePlayer(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "linear-gradient(135deg, rgba(37, 99, 235, 0.25), rgba(30, 58, 138, 0.4))",
            borderColor: "#3b82f6",
            color: "#60a5fa",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          📺 Timeline Player
        </button>
        <span className={`storyboard-status ${dirty ? "dirty" : storyboard.status}`}>{dirty ? "unsaved" : storyboard.status}</span>
        <button className="button secondary" onClick={() => void validate()}>Validate</button>
        <button className="button primary" onClick={() => void approve()} disabled={saveState === "saving"}>Approve Storyboard &amp; Compile Graph</button>
      </div>
    </header>
    {showLivePlayer && (
      <InteractiveTimelineStudioModal
        storyboard={storyboard}
        initialAspect={currentAspect}
        onMutate={mutate}
        onClose={() => setShowLivePlayer(false)}
      />
    )}
    {(message || saveState === "saving" || saveState === "conflict") && <div className={`storyboard-message ${saveState}`} role="status">{saveState === "saving" ? "Saving…" : message}{saveState === "conflict" && <button className="button secondary" onClick={() => void load()}>Reload server revision</button>}</div>}
    <section className="storyboard-sourcebar"><div><strong>DOCX seed</strong><code>{storyboard.sourceImport.docxPath}</code></div><button className="button secondary" onClick={() => setShowImport((value) => !value)}>{showImport ? "Hide import" : "Compare DOCX import"}</button></section>
    {showImport && sourceImport && <section className="storyboard-import"><h2>Raw DOCX rows and proposals</h2><div className="import-grid">{sourceImport.rawRows.map((row) => <article key={row.rowNumber}><strong>Row {row.rowNumber}</strong><p>{row.picture || "—"}</p><small>{row.sound || "—"}</small></article>)}</div></section>}
    <div className="storyboard-workspace">
      <section className="storyboard-outline">
        <div className="outline-toolbar"><strong>Editorial order</strong><select aria-label="Add storyboard item" defaultValue="" onChange={(event) => { if (event.target.value) addItem(event.target.value as StoryboardKind); event.target.value = ""; }}><option value="">+ Add item</option><option value="title">Title</option><option value="a_roll">A-roll</option><option value="cover_card">Cover card</option><option value="logo_outro">Logo/outro</option><option value="note">Note</option></select></div>
        <div className="storyboard-items">{storyboard.items.map((item, index) => <div className="storyboard-item-group" key={item.id}><article draggable onDragStart={() => setDragIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragIndex !== undefined) reorder(dragIndex, index); setDragIndex(undefined); }} className={`storyboard-item ${selectedId === item.id && !selectedBrollId ? "selected" : ""}`} onClick={() => { setSelectedId(item.id); setSelectedBrollId(""); }}>
          <span className={`kind-dot ${item.kind}`}/><div><strong>{index + 1}. {kindLabel(item.kind)}</strong><small>{item.id} · {item.kind === "note" ? "no timeline" : formatMs(item.durationMs)} · {item.audioPolicy}</small></div><div className="item-move"><button aria-label="Move up" onClick={(event) => { event.stopPropagation(); reorder(index, index - 1); }}>↑</button><button aria-label="Move down" onClick={(event) => { event.stopPropagation(); reorder(index, index + 1); }}>↓</button></div>
        </article>{item.kind === "a_roll" && <div className="outline-broll-children">{(item.broll ?? []).map((broll, brollIndex) => <button type="button" key={broll.id} className={`outline-broll-item ${selectedId === item.id && selectedBrollId === broll.id ? "selected" : ""}`} onClick={() => { setSelectedId(item.id); setSelectedBrollId(broll.id); }}><span>↳</span><span><strong>B-roll {brollIndex + 1}</strong><small>{broll.asset.path.split(/[\\/]/).filter(Boolean).at(-1) || "ยังไม่ได้เลือกไฟล์"} · +{formatSeconds(broll.offsetMs)}s · {formatSeconds(broll.durationMs)}s</small></span><em>V2</em></button>)}<button type="button" className="outline-add-broll" onClick={() => addBroll(item)}>＋ Add B-roll under A-roll</button></div>}</div>)}</div>
      </section>
      <section className="storyboard-inspector">
        {selected ? <>
          <div className="inspector-heading"><div><span className={`kind-pill ${selected.kind}`}>{kindLabel(selected.kind)}</span><h2>{selected.id}</h2></div><button className="button secondary danger" onClick={deleteSelected}>Delete</button></div>
          <section className="inspector-section"><h3>Node setup</h3><div className="field-grid"><label>Kind<select value={selected.kind} onChange={(event) => changeKind(event.target.value as StoryboardKind)}>{["title","a_roll","cover_card","logo_outro","note"].map((value) => <option key={value} value={value}>{kindLabel(value as StoryboardKind)}</option>)}</select></label>{selected.kind !== "note" && <><SecondsField label="Duration" valueMs={selected.durationMs} minMs={40} onChange={updateDuration}/><label>Preset<select aria-label="Preset" value={selected.presetId ?? presetOptions[selected.kind][0]?.value ?? ""} onChange={(event) => updatePreset(event.target.value)}>{presetOptions[selected.kind].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small className="field-help">เลือกเฉพาะ preset ที่รองรับ {kindLabel(selected.kind)}</small></label><label>Audio policy<select value={selected.audioPolicy} disabled><option>{selected.audioPolicy}</option></select><small className="field-help">กำหนดตามชนิดโหนดเพื่อป้องกันเสียงซ้อน</small></label></>}</div></section>
          {selected.kind === "a_roll" && <ARollFields item={selected} selectedBrollId={selectedBrollId} onSelectBroll={setSelectedBrollId} onParams={updateParams} onItem={replaceItem}/>} 
          {selected.kind === "title" && <TitleFields item={selected} onParams={updateParams}/>} 
          {selected.kind === "cover_card" && <CoverFields item={selected} onParams={updateParams}/>} 
          {selected.kind === "logo_outro" && <PathField label="Logo/outro asset path" value={String(selected.params.sourcePath ?? "")} onChange={(sourcePath) => updateParams({ sourcePath })}/>} 
          {selected.kind === "note" && <label>Editorial note<textarea value={String(selected.params.text ?? "")} onChange={(event) => updateParams({ text: event.target.value })}/></label>}
          {selected.kind === "a_roll" && <div className="split-actions"><button className="button secondary" onClick={splitSelected}>Split at midpoint</button><button className="button secondary" onClick={mergePrevious} disabled={!canMerge}>Merge previous contiguous A-roll</button></div>}
        </> : <p>Select an item to edit.</p>}
      </section>
      <aside className="storyboard-diagnostics"><h2>Diagnostics <span>{blockerCount} blockers</span></h2>{diagnostics.length ? diagnostics.map((item, index) => <article key={`${item.code}-${index}`} className={item.severity} onClick={() => item.itemId && setSelectedId(item.itemId)}><strong>{item.code}</strong><p>{item.message}</p>{item.rowNumber && <small>DOCX row {item.rowNumber}</small>}</article>) : <p className="empty-diagnostics">กด Validate เพื่อตรวจ Storyboard revision ปัจจุบัน</p>}</aside>
    </div>
    <section className="compiled-preview"><header><div><h2>Compiled backend graph</h2><p>{compilation ? `Storyboard v${compilation.storyboardVersion} · ${compilation.graph.nodes.length} nodes · digest ${compilation.graphDigest.slice(0, 12)}` : "Approve storyboard เพื่อสร้าง deterministic preview"}</p></div><button className="button secondary" disabled={!compilation} onClick={() => setShowGraph((value) => !value)}>{showGraph ? "Hide graph" : "Open advanced graph"}</button></header>
      {showGraph && compilation && <div className="readonly-graph" aria-label="Read-only compiled graph">{compilation.graph.order.map((nodeId, index) => { const node = compilation.graph.nodes.find((value) => value.id === nodeId); return node ? <article key={node.id}><span>{index + 1}</span><div><strong>{node.type}</strong><small>{node.id}</small><code>source: {compilation.provenance[node.id]}</code></div></article> : null; })}</div>}
    </section>
  </main></GraphShell>;
}

function ARollFields({ item, selectedBrollId, onSelectBroll, onParams, onItem }: { item: StoryboardItem; selectedBrollId: string; onSelectBroll: (value: string) => void; onParams: (value: Record<string, unknown>) => void; onItem: (value: StoryboardItem) => void }) {
  const broll = item.broll ?? [];
  const updateBroll = (index: number, patch: Partial<(typeof broll)[number]>) => onItem({ ...item, broll: broll.map((value, itemIndex) => itemIndex === index ? { ...value, ...patch } : value) });
  const updateRange = (patch: Record<string, number>) => {
    const params = { ...item.params, ...patch };
    const sourceInMs = Number(params.sourceInMs ?? 0);
    const sourceOutMs = Number(params.sourceOutMs ?? 0);
    onItem({ ...item, params, durationMs: Math.max(40, sourceOutMs - sourceInMs) });
  };
  return <>
    <section className="inspector-section"><h3>Source media</h3><PathField label="Source media" value={String(item.params.sourcePath ?? "")} filter=".mov,.mp4,.mxf,.avi,.mkv" onChange={(sourcePath) => onParams({ sourcePath })}/><label>Source key<input value={String(item.params.sourceKey ?? "")} onChange={(event) => onParams({ sourceKey: event.target.value })}/><small className="field-help">รหัสคลิปที่ใช้เชื่อม segment และคำสั่ง merge</small></label></section>
    <section className="inspector-section"><h3>Source range</h3><div className="field-grid"><SecondsField label="Source in" valueMs={Number(item.params.sourceInMs ?? 0)} minMs={0} onChange={(sourceInMs) => updateRange({ sourceInMs })}/><SecondsField label="Source out" valueMs={Number(item.params.sourceOutMs ?? 0)} minMs={40} onChange={(sourceOutMs) => updateRange({ sourceOutMs })}/></div><div className="timing-summary"><span>Timeline duration</span><strong>{formatSeconds(item.durationMs)} s</strong><code>{formatTimecode(item.durationMs)}</code></div></section>
    <section className="inspector-section"><h3>Editorial</h3><label>Dialogue note<textarea value={String(item.params.dialogue ?? "")} onChange={(event) => onParams({ dialogue: event.target.value })}/></label></section>
    <div className="broll-editor"><header><strong>B-roll overlays</strong><button className="button secondary" onClick={() => { const next = { id: uniqueId(`${item.id}_broll`, broll.map((value) => value.id)), asset: { path: "" }, offsetMs: 0, durationMs: Math.min(4000, item.durationMs), audioPolicy: "mute" as const, fit: "cover" as const }; onItem({ ...item, broll: [...broll, next] }); onSelectBroll(next.id); }}>+ Add B-roll</button></header>{broll.map((value, index) => <article className={selectedBrollId === value.id ? "selected" : ""} onClick={() => onSelectBroll(value.id)} key={value.id}><PathField compact label="B-roll path" value={value.asset.path} filter=".mov,.mp4,.mxf,.avi,.mkv" onChange={(mediaPath) => updateBroll(index, { asset: { ...value.asset, path: mediaPath } })}/><SecondsField compact label="B-roll offset" valueMs={value.offsetMs} minMs={0} onChange={(offsetMs) => updateBroll(index, { offsetMs })}/><SecondsField compact label="B-roll duration" valueMs={value.durationMs} minMs={40} onChange={(durationMs) => updateBroll(index, { durationMs })}/><span>mute</span><button aria-label={`Remove ${value.id}`} onClick={() => onItem({ ...item, broll: broll.filter((_, itemIndex) => itemIndex !== index) })}>×</button></article>)}</div>
  </>;
}

function TitleFields({ item, onParams }: { item: StoryboardItem; onParams: (value: Record<string, unknown>) => void }) {
  const texts = typeof item.params.texts === "object" && item.params.texts ? item.params.texts as Record<string, unknown> : {};
  const media = Array.isArray(item.params.media) ? item.params.media.map(String) : [];
  return <><CarouselMediaField value={media} onChange={(next) => onParams({ media: next })}/><div className="field-grid"><label>Composition<input value={String(item.params.composition ?? "Main")} onChange={(event) => onParams({ composition: event.target.value })}/></label><label>Title text<input value={String(texts.title ?? "")} onChange={(event) => onParams({ texts: { ...texts, title: event.target.value } })}/></label></div></>;
}

function CarouselMediaField({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };
  const add = (paths: string[]) => onChange([...new Set([...value, ...paths])]);
  return <section className="inspector-section carousel-media-field">
    <header><div><h3>Carousel media</h3><small>{value.length} selected · ลำดับบนลงล่างคือลำดับใน carousel</small></div><button type="button" className="button secondary" onClick={() => setOpen(true)}>Open Finder…</button></header>
    {value.length ? <ol>{value.map((mediaPath, index) => <li key={mediaPath}><span className="media-order">{index + 1}</span><span className="media-name" title={mediaPath}><strong>{mediaPath.split(/[\\/]/).filter(Boolean).at(-1)}</strong><small>{mediaPath}</small></span><button type="button" aria-label={`Move ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`Move ${index + 1} down`} disabled={index === value.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" className="remove-media" aria-label={`Remove ${mediaPath}`} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>×</button></li>)}</ol> : <button type="button" className="carousel-empty" onClick={() => setOpen(true)}>ยังไม่มีภาพ · เลือกหลายไฟล์จาก Finder</button>}
    <RemoteFilePickerModal isOpen={open} onClose={() => setOpen(false)} onSelect={() => {}} onSelectMultiple={add} initialPath={directoryForPath(value[0] ?? "")} mode="file" multiple filter=".png,.jpg,.jpeg,.webp,.tif,.tiff" title="เลือกภาพสำหรับ 3D Carousel"/>
  </section>;
}

function CoverFields({ item, onParams }: { item: StoryboardItem; onParams: (value: Record<string, unknown>) => void }) {
  const sourceImage = String(item.params.sourceImage ?? "");
  const doodleEnabled = item.params.doodleEnabled === true;
  const text = coverEditorialText(item.params);
  const hasLegacyText = !String(item.params.personName ?? "").trim() || !String(item.params.positionTitle ?? "").trim() || !String(item.params.award ?? "").trim();
  return <>
    <section className="inspector-section cover-editorial-inputs"><header><div><h3>ข้อความบน Cover Card</h3><small>กรอกครบทั้ง 3 ช่อง · ระบบสร้าง MOGRT ต่อการ์ดและยังแก้ข้อความใน Premiere ได้</small></div>{hasLegacyText && <button type="button" className="button secondary" onClick={() => onParams(text)}>เติมจากข้อมูลเดิม</button>}</header><div className="field-grid"><label>ชื่อบุคคล *<input aria-label="Cover person name" required value={text.personName} onChange={(event) => onParams({ personName: event.target.value })}/></label><label>ตำแหน่ง / หน่วยงาน *<input aria-label="Cover position title" required value={text.positionTitle} onChange={(event) => onParams({ positionTitle: event.target.value })}/></label></div><label>รางวัล / เกียรติคุณ *<textarea aria-label="Cover award" required value={text.award} onChange={(event) => onParams({ award: event.target.value })}/></label><div className="cover-track-contract"><span>V1 Background</span><span>V2 Doodle</span><span>V3 People</span><span>V4 Editable text</span></div></section>
    <PathField label="People source image" value={sourceImage} filter=".png,.jpg,.jpeg,.webp,.tif,.tiff" onChange={(value) => onParams({ sourceImage: value })}/>
    {sourceImage && <img className="cover-preview" src={`/api/v1/media/stream?path=${encodeURIComponent(sourceImage)}`} alt="Selected cover"/>}
    <section className="inspector-section"><header><div><h3>V1 · Background</h3><small>TH → EN translation gate · ComfyUI/Z-Image รับภาษาอังกฤษเท่านั้น</small></div><strong className="translation-badge">English output</strong></header>
      <label>แนวทางภาพพื้นหลัง (กรอกภาษาไทยได้)<textarea aria-label="Cover background direction" value={String(item.params.prompt ?? "")} onChange={(event) => onParams({ prompt: event.target.value })}/><small className="field-help">ข้อความนี้เก็บเป็นต้นฉบับใน storyboard; prompt ที่ส่งเข้า workflow node 6 จะเป็นผลแปลภาษาอังกฤษ</small></label>
      <label>Seed<input type="number" min="0" value={Number(item.params.seed ?? 1)} onChange={(event) => onParams({ seed: Number(event.target.value) })}/></label>
    </section>
    <section className="inspector-section"><header><div><h3>V2 · Doodle</h3><small>White-on-black → luminance alpha; เก็บขอบ anti-alias</small></div><label><input type="checkbox" checked={doodleEnabled} onChange={(event) => onParams({ doodleEnabled: event.target.checked })}/> On</label></header>
      {doodleEnabled && <><label>Doodle prompt<textarea value={String(item.params.doodlePrompt ?? "")} onChange={(event) => onParams({ doodlePrompt: event.target.value })}/></label><div className="field-grid"><label>Opacity<input type="number" min="0" max="1" step="0.05" value={Number(item.params.doodleOpacity ?? 1)} onChange={(event) => onParams({ doodleOpacity: Number(event.target.value) })}/></label><label>Seed<input type="number" min="0" value={Number(item.params.doodleSeed ?? Number(item.params.seed ?? 1) + 1)} onChange={(event) => onParams({ doodleSeed: Number(event.target.value) })}/></label></div></>}
    </section>
    <section className="inspector-section"><header><div><h3>V3 · People PNG</h3><small>Apple Vision cutout; ตำแหน่งเป็นสัดส่วน canvas 0–1</small></div></header><div className="field-grid"><label>X<input type="number" min="0" max="1" step="0.01" value={Number(item.params.personX ?? 0.72)} onChange={(event) => onParams({ personX: Number(event.target.value) })}/></label><label>Y<input type="number" min="0" max="1" step="0.01" value={Number(item.params.personY ?? 0.5)} onChange={(event) => onParams({ personY: Number(event.target.value) })}/></label><label>Scale<input type="number" min="0.1" max="4" step="0.05" value={Number(item.params.personScale ?? 1)} onChange={(event) => onParams({ personScale: Number(event.target.value) })}/></label></div></section>
    <section className="inspector-section"><header><div><h3>V4 · Editable Premiere text</h3><small>Base template จะถูก seed ด้วยข้อความด้านบนก่อน insert; ไม่ใช้ placeholder และไม่ flatten</small></div></header><PathField label="Premiere text MOGRT" value={String(item.params.mogrtPath ?? "")} filter=".mogrt" onChange={(value) => onParams({ mogrtPath: value })}/></section>
  </>;
}

function PathField({ label, value, onChange, compact = false, filter }: { label: string; value: string; onChange: (value: string) => void; compact?: boolean; filter?: string }) {
  const [open, setOpen] = useState(false);
  const fileName = value.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  return (
    <div className={`path-field ${compact ? "compact" : ""}`} style={{ marginBottom: compact ? 0 : "10px" }}>
      <label style={{ display: "block", color: "#94a3b8", fontSize: "12px" }}>
        {label}
        <span style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "4px" }}>
          <input
            aria-label={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="ยังไม่ได้เลือกไฟล์ (กดปุ่มเพื่อเลือกจาก NAS)"
            style={{
              flex: 1,
              padding: "7px 10px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#f8fafc",
              fontSize: "12px"
            }}
          />
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              padding: "7px 12px",
              background: "linear-gradient(135deg, #0284c7, #0369a1)",
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
          >
            🔍 เลือกจาก NAS
          </button>
        </span>
        {value && !compact && (
          <small className="path-selection" style={{ color: "#38bdf8", marginTop: "4px", display: "block", fontSize: "11px" }}>
            ✓ เลือกแล้ว: <strong style={{ color: "#f8fafc" }}>{fileName}</strong>
          </small>
        )}
      </label>
      <RemoteFilePickerModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onSelect={(selected) => {
          onChange(selected);
          setOpen(false);
        }}
        initialPath={directoryForPath(value)}
        mode="file"
        filter={filter}
        title={`เลือก ${label} จาก NAS`}
      />
    </div>
  );
}

function SecondsField({ label, valueMs, onChange, minMs = 0, compact = false }: { label: string; valueMs: number; onChange: (valueMs: number) => void; minMs?: number; compact?: boolean }) {
  return <label className={`seconds-field ${compact ? "compact" : ""}`}>{label}<span><input aria-label={`${label} (s)`} type="number" inputMode="decimal" step="0.04" min={formatSeconds(minMs)} value={formatSeconds(valueMs)} onChange={(event) => { const seconds = Number(event.target.value); if (Number.isFinite(seconds)) onChange(Math.max(minMs, snapToFrameMs(seconds * 1000))); }}/><b>s</b></span>{!compact && <small className="field-help">25fps · step 0.04 s</small>}</label>;
}

const presetOptions: Record<Exclude<StoryboardKind, "note">, Array<{ value: string; label: string }>> & { note: never[] } = {
  a_roll: [{ value: "a-roll-segment-v1", label: "A-roll Segment · v1" }],
  title: [{ value: "ae-3d-carousel-title-v1", label: "AE 3D Carousel Title · v1" }],
  cover_card: [{ value: "comfy-cover-card-v2", label: "Layered Cover Card · v2" }, { value: "comfy-cover-card-v1", label: "Legacy Flattened Cover · v1" }],
  logo_outro: [{ value: "logo-outro-v1", label: "Logo / Outro · v1" }],
  note: []
};

function itemDefaults(kind: StoryboardKind, id: string): StoryboardItem {
  if (kind === "a_roll") return { id, kind, durationMs: 4000, audioPolicy: "preserve", presetId: "a-roll-segment-v1", params: { sourceKey: "", sourcePath: "", sourceInMs: 0, sourceOutMs: 4000, dialogue: "" }, broll: [] };
  if (kind === "title") return { id, kind, durationMs: 10000, audioPolicy: "mute", presetId: "ae-3d-carousel-title-v1", params: { composition: "Main", media: [], texts: {} } };
  if (kind === "cover_card") return { id, kind, durationMs: 6000, audioPolicy: "mute", presetId: "comfy-cover-card-v2", params: { sourceImage: "", prompt: "", personName: "", positionTitle: "", award: "", seed: 1, doodleEnabled: false, doodlePrompt: "", doodleOpacity: 1, personX: 0.72, personY: 0.5, personScale: 1, mogrtPath: "/Users/louislee/Desktop/Adobe_Plugin/templates/premiere/psu-cover-text.mogrt" } };
  if (kind === "logo_outro") return { id, kind, durationMs: 4000, audioPolicy: "mute", presetId: "logo-outro-v1", params: { sourcePath: "" } };
  return { id, kind: "note", durationMs: 0, audioPolicy: "mute", params: { text: "" } };
}

function coverEditorialText(params: Record<string, unknown>) {
  return {
    personName: String(params.personName ?? params.title ?? "").trim(),
    positionTitle: String(params.positionTitle ?? params.subtitle ?? "").trim(),
    award: String(params.award ?? params.eyebrow ?? "").trim()
  };
}

function migrateLegacyCoverParams(params: Record<string, unknown>) {
  const text = coverEditorialText(params);
  return {
    ...params,
    ...text,
    doodleEnabled: params.doodleEnabled === true,
    doodlePrompt: String(params.doodlePrompt ?? ""),
    doodleOpacity: Number(params.doodleOpacity ?? 1),
    personX: Number(params.personX ?? 0.72),
    personY: Number(params.personY ?? 0.5),
    personScale: Number(params.personScale ?? 1),
    mogrtPath: String(params.mogrtPath ?? "/Users/louislee/Desktop/Adobe_Plugin/templates/premiere/psu-cover-text.mogrt")
  };
}

function uniqueId(prefix: string, existing: string[]) { let index = 1; let value = prefix.replace(/[^A-Za-z0-9_-]/g, "_"); while (existing.includes(value)) value = `${prefix}_${++index}`; return value; }
function kindLabel(kind: StoryboardKind) { return ({ title: "3D Title", a_roll: "A-roll", cover_card: "Cover card", logo_outro: "Logo / Outro", note: "Note" })[kind]; }
function formatMs(value: number) { const seconds = Math.floor(value / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function formatSeconds(valueMs: number) { return Number((valueMs / 1000).toFixed(2)); }
function snapToFrameMs(valueMs: number) { return Math.round(valueMs / 40) * 40; }
function formatTimecode(valueMs: number) { const totalFrames = Math.round(valueMs / 40); return `${String(Math.floor(totalFrames / 1500)).padStart(2, "0")}:${String(Math.floor((totalFrames % 1500) / 25)).padStart(2, "0")}:${String(totalFrames % 25).padStart(2, "0")}`; }
function directoryForPath(value: string) { const normalized = value.trim(); if (!normalized) return undefined; const slash = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\")); return slash > 0 ? normalized.slice(0, slash) : undefined; }
