import { useMemo, useState } from "react";
import type { StoryboardItem } from "../../storyboard-types";
import { type CoverCardStage, coverCardMissingFields } from "@psu-ava/contracts/cover-card";
import { PathField } from "./CommonFields";
import { NodeRunStatusBar } from "./NodeRunStatusBar";
import type { NodeRunState } from "./useNodeRunMonitor";
import { TextLayerStyleEditor } from "../TextLayerStyleEditor";
import { CoverPromptPartsEditor } from "../CoverPromptPartsEditor";
import { CoverCardOutputPreview } from "../CoverCardOutputPreview";
import { DoodleAssetLibrary, SYSTEM_DOODLES } from "../DoodleAssetLibrary";
import { useGlobalCustomDoodles } from "../useGlobalCustomDoodles";
import {
  calculatePathPlacementCount,
  randomizeDoodlePlacements,
  rebalanceDoodlePlacements
} from "../path-geometry";
import type { CoverTextStyles } from "@psu-ava/remotion-studio";
import "./inspectors.css";

export function coverEditorialText(params: Record<string, unknown>) {
  return {
    personName: String(params.personName ?? params.title ?? "").trim(),
    positionTitle: String(params.positionTitle ?? params.subtitle ?? "").trim(),
    award: String(params.award ?? params.eyebrow ?? "").trim()
  };
}

export function migrateLegacyCoverParams(params: Record<string, unknown>) {
  const text = coverEditorialText(params);
  return {
    ...params,
    ...text
  };
}

export function coverRunRequirements(params: Record<string, unknown>, stage: CoverCardStage) {
  const labels: Record<string, string> = {
    sourceImage: "ภาพบุคคลต้นฉบับ",
    prompt: "prompt ภาพพื้นหลัง",
    personName: "ชื่อบุคคล",
    positionTitle: "ตำแหน่ง",
    award: "รางวัล/คำโปรย"
  };
  return coverCardMissingFields(params, stage).map((field) => labels[field]);
}

export function DoodlePathAdvancedFields({
  path,
  onChange
}: {
  path: any;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  if (!path) return null;
  return (
    <div className="inspector-grid-2" aria-label="All doodle path properties">
      <div className="inspector-field">
        <label className="inspector-label">
          Distribution
          <select
            className="inspector-select"
            value={String(path.distribution ?? "along-path")}
            onChange={(e) => onChange({ distribution: e.target.value })}
          >
            <option value="along-path">Along path</option>
            <option value="repeated">Repeated</option>
            <option value="start-end">Start / end</option>
          </select>
        </label>
      </div>
      <div className="inspector-field">
        <label className="inspector-label">
          Size jitter
          <input
            className="inspector-input"
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={Number(path.sizeJitter ?? 0)}
            onChange={(e) => onChange({ sizeJitter: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="inspector-field">
        <label className="inspector-label">
          Path color
          <input
            className="inspector-input"
            type="color"
            value={String(path.color ?? "#FFFFFF")}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </label>
      </div>
      <div className="inspector-field">
        <label className="inspector-label">
          Path geometry
          <input className="inspector-input" value="Polyline · double-click segment to add bends" readOnly />
        </label>
      </div>
    </div>
  );
}

export interface CoverCardInspectorProps {
  item: StoryboardItem;
  onParams: (patch: Record<string, unknown>) => void;
  onRun?: (stage: "background" | "doodle" | "person" | "assets") => void;
  nodeRun?: NodeRunState | null;
  nodeRunBusy?: boolean;
  saveState?: string;
  pathEditMode?: "inspect" | "draw" | "edit";
  onSetPathEditMode?: (mode: "inspect" | "draw" | "edit") => void;
  drawingDoodlePath?: boolean;
  onSetDrawingDoodlePath?: (drawing: boolean) => void;
}

export function CoverCardInspector({
  item,
  onParams,
  onRun,
  nodeRun,
  nodeRunBusy,
  saveState,
  pathEditMode = "inspect",
  onSetPathEditMode,
  drawingDoodlePath = false,
  onSetDrawingDoodlePath
}: CoverCardInspectorProps) {
  const sourceImage = String(item.params.sourceImage ?? "");
  const personImage = String(item.params.personImage ?? "");
  const backgroundImage = String(item.params.backgroundImage ?? "");
  const text = coverEditorialText(item.params);
  const hasLegacyText =
    !String(item.params.personName ?? "").trim() ||
    !String(item.params.positionTitle ?? "").trim() ||
    !String(item.params.award ?? "").trim();

  const [selectedDoodlePathIndex, setSelectedDoodlePathIndex] = useState(0);

  const doodlePaths = useMemo(
    () => (Array.isArray(item.params.doodlePaths) ? (item.params.doodlePaths as any[]) : []),
    [item.params.doodlePaths]
  );

  const activeDoodlePathIndex = Math.min(
    Math.max(0, selectedDoodlePathIndex),
    Math.max(0, doodlePaths.length - 1)
  );

  const updateSelectedDoodlePath = (patch: Record<string, unknown>) => {
    onParams({
      doodlePaths: doodlePaths.map((path, idx) =>
        idx === activeDoodlePathIndex ? { ...path, ...patch } : path
      )
    });
  };

  const randomizeSelectedDoodlePath = () => {
    const activeIds = Array.isArray(item.params.doodleAssetSet)
      ? (item.params.doodleAssetSet as string[])
      : SYSTEM_DOODLES;
    onParams({
      doodlePaths: doodlePaths.map((path, idx) =>
        idx === activeDoodlePathIndex ? randomizeDoodlePlacements(path, activeIds) : path
      )
    });
  };

  const { customDoodles, deleteDoodle } = useGlobalCustomDoodles();

  const registeredCustomAssets = useMemo(() => {
    const map = new Map<string, any>();
    // 1. Global centralized doodles
    customDoodles.forEach((d) => {
      if (d && d.image) map.set(d.image, d);
    });
    // 2. Local explicit custom assets
    if (Array.isArray(item.params.customDoodleAssets)) {
      (item.params.customDoodleAssets as any[]).forEach((d) => {
        if (d && d.image) map.set(d.image, d);
      });
    }
    // 3. From output history
    if (Array.isArray(item.params.outputHistory)) {
      item.params.outputHistory.forEach((h: any, idx: number) => {
        if (h.doodleImage && !map.has(h.doodleImage)) {
          map.set(h.doodleImage, {
            id: `history_${h.runId || idx}`,
            word: "custom",
            image: h.doodleImage,
            slot: 25 + map.size + 1,
            createdAt: h.createdAt
          });
        }
      });
    }
    return Array.from(map.values());
  }, [customDoodles, item.params.customDoodleAssets, item.params.outputHistory]);

  const toggleDoodleAsset = (id: string) => {
    const normalizeSystemId = (value: string) =>
      /^doodle-\d+$/.test(value)
        ? `doodle-${String(((Number(value.slice(7)) - 1) % SYSTEM_DOODLES.length) + 1).padStart(2, "0")}`
        : value;
    const rawCurrent = Array.isArray(item.params.doodleAssetSet)
      ? (item.params.doodleAssetSet as string[])
      : SYSTEM_DOODLES;
    const current = [...new Set(rawCurrent.map(normalizeSystemId))];
    const next = current.includes(id) ? current.filter((val) => val !== id) : [...current, id];
    const added = next.filter((val) => !current.includes(val));
    onParams({
      doodleAssetSet: next,
      doodlePaths: doodlePaths.map((path) => ({
        ...path,
        assetSet: next,
        doodles: rebalanceDoodlePlacements(path.doodles, next, added)
      }))
    });
  };

  const assetsMissing = coverRunRequirements(item.params, "assets");
  const personMissing = coverRunRequirements(item.params, "person");
  const bgMissing = coverRunRequirements(item.params, "background");
  const doodleMissing = coverRunRequirements(item.params, "doodle");

  const stageProgress = (stage: string) => {
    if (!nodeRun) return undefined;
    if (nodeRun.stage !== stage && nodeRun.stage !== "assets") return undefined;

    if (nodeRun.stage === stage) {
      if (typeof nodeRun.progress?.percent === "number") return nodeRun.progress.percent;
      if (nodeRun.status === "success") return 100;
      if (nodeRun.status === "running") return 45;
      return 0;
    }

    if (nodeRun.stage === "assets") {
      const stepSuffix =
        stage === "background"
          ? "__generate_bg"
          : stage === "person"
            ? "__cutout"
            : stage === "doodle"
              ? "__doodle_alpha"
              : "";
      if (stepSuffix && nodeRun.steps) {
        const step = nodeRun.steps.find((s) => s.id.endsWith(stepSuffix));
        if (step?.status === "success") return 100;
        if (step?.status === "running") return 45;
        if (step?.status === "failed") return 100;
        return 0;
      }
      if (typeof nodeRun.progress?.percent === "number") return nodeRun.progress.percent;
      if (nodeRun.status === "running") return 35;
    }

    return undefined;
  };

  return (
    <div className="inspector-container">
      {/* ⚡ Top Level Run All Header */}
      <div className="inspector-run-card">
        <div className="inspector-run-card-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="inspector-btn inspector-btn-gold"
              onClick={() => onRun?.("assets")}
              disabled={Boolean(nodeRunBusy) || saveState === "saving" || assetsMissing.length > 0}
            >
              ⚡ {nodeRunBusy ? "Running…" : "Run all"}
            </button>
            <span style={{ fontSize: "12px", color: "#94A3B8" }}>Run all Cover Card assets</span>
          </div>
        </div>
        {assetsMissing.length > 0 && (
          <small style={{ color: "#F59E0B", fontSize: "11px" }}>
            กรอกก่อน Run: {assetsMissing.join(", ")}
          </small>
        )}
        {stageProgress("assets") !== undefined && (
          <div className="node-run-progress" aria-label={`Run all progress ${stageProgress("assets")}%`}>
            <i style={{ width: `${stageProgress("assets")}%` }} />
          </div>
        )}
        {nodeRun && <NodeRunStatusBar nodeRun={nodeRun} />}
      </div>

      {/* Layer 1: Image Person */}
      <div className="inspector-card accent-blue" style={{ order: 1 }}>
        <details open>
          <summary style={{ color: "#60A5FA" }}>🧍 Image Person *</summary>
          <div className="inspector-card-body">
            <PathField
              label="ภาพต้นฉบับบุคคล (Remove Background Input)"
              value={sourceImage}
              filter=".png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff"
              onChange={(value) => onParams({ sourceImage: value })}
            />
            {sourceImage && (
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <img
                  className="inspector-thumb-preview"
                  src={`/api/v1/media/stream?path=${encodeURIComponent(sourceImage)}`}
                  alt="Person input"
                />
                <code className="inspector-code-display" style={{ flex: 1 }}>{sourceImage}</code>
              </div>
            )}

            <div className="inspector-field">
              <label className="inspector-label">ผลลัพธ์บุคคลตัดพื้นหลัง (Person Cutout Output)</label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <code className="inspector-code-display" style={{ flex: 1 }}>
                  {personImage || "ยังไม่มี cutout — กด Remove background"}
                </code>
                {personImage && (
                  <img
                    className="inspector-thumb-preview contain"
                    src={`/api/v1/media/stream?path=${encodeURIComponent(personImage)}`}
                    alt="Selected person"
                  />
                )}
              </div>
            </div>

            <div className="inspector-grid-3">
              <div className="inspector-field">
                <label className="inspector-label">Position X</label>
                <input
                  className="inspector-input"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={Number(item.params.personX ?? 0.72)}
                  onChange={(event) => onParams({ personX: Number(event.target.value) })}
                />
              </div>
              <div className="inspector-field">
                <label className="inspector-label">Position Y</label>
                <input
                  className="inspector-input"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={Number(item.params.personY ?? 0.5)}
                  onChange={(event) => onParams({ personY: Number(event.target.value) })}
                />
              </div>
              <div className="inspector-field">
                <label className="inspector-label">Scale</label>
                <input
                  className="inspector-input"
                  type="number"
                  min="0.1"
                  max="4"
                  step="0.05"
                  value={Number(item.params.personScale ?? 1)}
                  onChange={(event) => onParams({ personScale: Number(event.target.value) })}
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <button
                type="button"
                className="inspector-btn inspector-btn-secondary"
                onClick={() => onRun?.("person")}
                disabled={Boolean(nodeRunBusy) || personMissing.length > 0}
              >
                🧍 Remove background
              </button>
              {stageProgress("person") !== undefined && (
                <div className="node-run-progress" aria-label={`Remove background progress ${stageProgress("person")}%`}>
                  <i style={{ width: `${stageProgress("person")}%` }} />
                </div>
              )}
              {personMissing.length > 0 && (
                <small style={{ color: "#F59E0B", fontSize: "11px" }}>เลือกภาพต้นฉบับบุคคลด้านบนก่อน</small>
              )}
            </div>
          </div>
        </details>
      </div>

      {/* Layer 2: Text */}
      <div className="inspector-card accent-gold" style={{ order: 2 }}>
        <details open>
          <summary style={{ color: "#E5A93C" }}>✍️ Text *</summary>
          <div className="inspector-card-body">
            {hasLegacyText && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "rgba(229,169,60,.12)", borderRadius: "6px" }}>
                <small style={{ color: "#FDE68A", fontSize: "11px" }}>มีข้อความนำเข้าจากตาราง DOCX เดิม</small>
                <button
                  type="button"
                  className="inspector-btn inspector-btn-gold inspector-btn-sm"
                  onClick={() => onParams(migrateLegacyCoverParams(item.params))}
                >
                  เติมจากข้อมูลเดิม
                </button>
              </div>
            )}
            <TextLayerStyleEditor
              value={item.params.textStyles as CoverTextStyles | undefined}
              texts={{
                eyebrow: String(item.params.award ?? item.params.eyebrow ?? ""),
                title: String(item.params.personName ?? item.params.title ?? ""),
                subtitle: String(item.params.positionTitle ?? item.params.subtitle ?? "")
              }}
              onChange={(textStyles) => onParams({ textStyles })}
              onTextChange={(layer, next) =>
                onParams({
                  [layer === "eyebrow" ? "award" : layer === "title" ? "personName" : "positionTitle"]: next
                })
              }
            />
          </div>
        </details>
      </div>

      {/* Layer 3: Doodle */}
      <div className="inspector-card accent-gold" style={{ order: 3 }}>
        <details open>
          <summary style={{ color: "#E5A93C" }}>
            🖍️ Doodle * <small style={{ color: "#64748B", fontWeight: 400 }}>Adobe-free · ComfyUI + Remotion</small>
          </summary>
          <div className="inspector-card-body">
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <button
                type="button"
                className="inspector-btn inspector-btn-secondary"
                onClick={() => onRun?.("doodle")}
                disabled={Boolean(nodeRunBusy) || doodleMissing.length > 0}
              >
                🖍️ Generate / refresh doodle
              </button>
              {stageProgress("doodle") !== undefined && (
                <div className="node-run-progress" aria-label={`Doodle progress ${stageProgress("doodle")}%`}>
                  <i style={{ width: `${stageProgress("doodle")}%` }} />
                </div>
              )}
            </div>

            <label style={{ color: "#94A3B8", fontSize: "12px", display: "flex", alignItems: "center", gap: "7px" }}>
              <input
                type="checkbox"
                checked={item.params.doodleEnabled === true}
                onChange={(e) => onParams({ doodleEnabled: e.target.checked })}
              />
              Doodle overlay
            </label>

            <details open style={{ borderTop: "1px solid rgba(229,169,60,.18)", paddingTop: "8px" }}>
              <summary style={{ color: "#E5A93C", fontSize: "12px", cursor: "pointer", listStyle: "none" }}>
                Doodle &amp; reusable assets
              </summary>
              {item.params.doodleEnabled === true && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className={`inspector-btn inspector-btn-sm ${pathEditMode === "inspect" ? "inspector-btn-primary" : "inspector-btn-secondary"}`}
                      onClick={() => {
                        onSetPathEditMode?.("inspect");
                        onSetDrawingDoodlePath?.(false);
                      }}
                    >
                      Inspect
                    </button>
                    <button
                      type="button"
                      className={`inspector-btn inspector-btn-sm ${pathEditMode === "draw" ? "inspector-btn-primary" : "inspector-btn-secondary"}`}
                      onClick={() => {
                        onSetPathEditMode?.("draw");
                        onSetDrawingDoodlePath?.(true);
                      }}
                    >
                      Draw path
                    </button>
                    <button
                      type="button"
                      className={`inspector-btn inspector-btn-sm ${pathEditMode === "edit" ? "inspector-btn-primary" : "inspector-btn-secondary"}`}
                      onClick={() => {
                        onSetPathEditMode?.("edit");
                        onSetDrawingDoodlePath?.(false);
                      }}
                    >
                      Edit path
                    </button>
                    <button
                      type="button"
                      className="inspector-btn inspector-btn-secondary inspector-btn-sm"
                      onClick={() => onParams({ doodlePaths: [] })}
                    >
                      Clear paths
                    </button>
                    <label style={{ color: "#94A3B8", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}>
                      <input
                        type="checkbox"
                        checked={item.params.doodlePathGuideVisible !== false}
                        onChange={(e) => onParams({ doodlePathGuideVisible: e.target.checked })}
                      />
                      Show path guide
                    </label>
                    <small style={{ color: "#64748B" }}>
                      {doodlePaths.length ? `${doodlePaths.length} paths` : "0 paths"}
                    </small>
                  </div>

                  {doodlePaths.length > 0 && (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "6px", alignItems: "end" }}>
                        <div className="inspector-field">
                          <label className="inspector-label">Edit path</label>
                          <select
                            className="inspector-select"
                            value={activeDoodlePathIndex}
                            onChange={(e) => setSelectedDoodlePathIndex(Number(e.target.value))}
                          >
                            {doodlePaths.map((path, index) => (
                              <option key={path.id ?? index} value={index}>
                                Path {index + 1}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          className="inspector-btn inspector-btn-secondary inspector-btn-sm"
                          onClick={randomizeSelectedDoodlePath}
                        >
                          Randomize placements
                        </button>
                        <button
                          type="button"
                          className="inspector-btn inspector-btn-secondary inspector-btn-sm"
                          onClick={() =>
                            onParams({
                              doodlePaths: doodlePaths.filter((_, index) => index !== activeDoodlePathIndex)
                            })
                          }
                        >
                          Delete path
                        </button>
                      </div>
                      <small style={{ color: "#64748B", fontSize: "11px" }}>
                        points: {(doodlePaths[activeDoodlePathIndex]?.points ?? []).length} · visible:{" "}
                        {calculatePathPlacementCount(doodlePaths[activeDoodlePathIndex])}
                      </small>

                      <div className="inspector-grid-2">
                        <div className="inspector-field">
                          <label className="inspector-label">Frequency</label>
                          <input
                            className="inspector-input"
                            type="number"
                            min="0.1"
                            max="1"
                            step="0.05"
                            value={Number(doodlePaths[activeDoodlePathIndex]?.frequency ?? 0.65)}
                            onChange={(e) => updateSelectedDoodlePath({ frequency: Number(e.target.value) })}
                          />
                        </div>
                        <div className="inspector-field">
                          <label className="inspector-label">Spacing</label>
                          <input
                            className="inspector-input"
                            type="number"
                            min="0.01"
                            max="0.5"
                            step="0.01"
                            value={Number(doodlePaths[activeDoodlePathIndex]?.spacing ?? 0.08)}
                            onChange={(e) => updateSelectedDoodlePath({ spacing: Number(e.target.value) })}
                          />
                        </div>
                        <div className="inspector-field">
                          <label className="inspector-label">Path size</label>
                          <input
                            className="inspector-input"
                            type="number"
                            min="0.1"
                            max="1.5"
                            step="0.05"
                            value={Number(doodlePaths[activeDoodlePathIndex]?.size ?? 0.5)}
                            onChange={(e) => updateSelectedDoodlePath({ size: Number(e.target.value) })}
                          />
                        </div>
                        <div className="inspector-field">
                          <label className="inspector-label">Offset jitter</label>
                          <input
                            className="inspector-input"
                            type="number"
                            min="0"
                            max="0.2"
                            step="0.01"
                            value={Number(doodlePaths[activeDoodlePathIndex]?.offsetJitter ?? 0.02)}
                            onChange={(e) => updateSelectedDoodlePath({ offsetJitter: Number(e.target.value) })}
                          />
                        </div>
                        <div className="inspector-field">
                          <label className="inspector-label">Rotation</label>
                          <select
                            className="inspector-select"
                            value={String(doodlePaths[activeDoodlePathIndex]?.rotation ?? "follow-path")}
                            onChange={(e) => updateSelectedDoodlePath({ rotation: e.target.value })}
                          >
                            <option value="follow-path">Follow path</option>
                            <option value="fixed">Fixed</option>
                            <option value="random">Random</option>
                          </select>
                        </div>
                        <div className="inspector-field">
                          <label className="inspector-label">Rotation jitter</label>
                          <input
                            className="inspector-input"
                            type="number"
                            min="0"
                            max="180"
                            step="1"
                            value={Number(doodlePaths[activeDoodlePathIndex]?.rotationJitter ?? 18)}
                            onChange={(e) => updateSelectedDoodlePath({ rotationJitter: Number(e.target.value) })}
                          />
                        </div>
                        <div className="inspector-field">
                          <label className="inspector-label">Opacity</label>
                          <input
                            className="inspector-input"
                            type="number"
                            min="0"
                            max="1"
                            step="0.05"
                            value={Number(doodlePaths[activeDoodlePathIndex]?.opacity ?? 0.75)}
                            onChange={(e) => updateSelectedDoodlePath({ opacity: Number(e.target.value) })}
                          />
                        </div>
                        <div className="inspector-field">
                          <label className="inspector-label">Seed</label>
                          <input
                            className="inspector-input"
                            type="number"
                            min="0"
                            step="1"
                            value={Number(doodlePaths[activeDoodlePathIndex]?.seed ?? 1)}
                            onChange={(e) => updateSelectedDoodlePath({ seed: Number(e.target.value) })}
                          />
                        </div>
                      </div>

                      <DoodlePathAdvancedFields
                        path={doodlePaths[activeDoodlePathIndex]}
                        onChange={updateSelectedDoodlePath}
                      />
                    </>
                  )}

                  <div className="inspector-field">
                    <label className="inspector-label">
                      Preset
                      <select
                        aria-label="Preset"
                        className="inspector-select"
                        value={String(item.params.doodlePreset ?? "academic")}
                        onChange={(event) => onParams({ doodlePreset: event.target.value })}
                      >
                        <option value="academic">Academic</option>
                        <option value="science">Science</option>
                        <option value="psychic">Psychic</option>
                        <option value="engineering">Engineering</option>
                        <option value="celebration">Celebration</option>
                        <option value="vlog">Vlog stickers</option>
                        <option value="none">Custom Doodle / AI</option>
                      </select>
                    </label>
                  </div>

                  {item.params.doodlePreset === "none" && (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", alignItems: "end" }}>
                        <div className="inspector-field">
                          <label className="inspector-label">
                            Custom doodle word (English, one word)
                            <input
                              className="inspector-input"
                              value={String(item.params.customDoodleWord ?? "")}
                              onChange={(event) =>
                                onParams({
                                  customDoodleWord: event.target.value
                                    .replace(/[^a-zA-Z-]/g, "")
                                    .slice(0, 32)
                                })
                              }
                              placeholder="atom"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          className="inspector-btn inspector-btn-secondary inspector-btn-sm"
                          onClick={() => onRun?.("doodle")}
                          disabled={Boolean(nodeRunBusy) || !String(item.params.customDoodleWord ?? "").trim()}
                        >
                          Generate 512px
                        </button>
                      </div>
                      <small style={{ color: "#64748B", fontSize: "10px" }}>
                        Fixed recipe: black/white, transparent-ready PNG, registered in output history.
                      </small>
                      <DoodleAssetLibrary
                        assets={registeredCustomAssets}
                        activeIds={
                          Array.isArray(item.params.doodleAssetSet)
                            ? (item.params.doodleAssetSet as string[])
                            : SYSTEM_DOODLES
                        }
                        onToggle={toggleDoodleAsset}
                        onDelete={(id) => {
                          void deleteDoodle(id);
                          const explicit = Array.isArray(item.params.customDoodleAssets) ? (item.params.customDoodleAssets as any[]) : [];
                          const nextExplicit = explicit.filter((e) => e.id !== id && e.image !== id);
                          const active = Array.isArray(item.params.doodleAssetSet) ? (item.params.doodleAssetSet as string[]) : [];
                          const nextActive = active.filter((a) => a !== id);
                          onParams({
                            ...(nextExplicit.length !== explicit.length ? { customDoodleAssets: nextExplicit } : {}),
                            ...(nextActive.length !== active.length ? { doodleAssetSet: nextActive } : {})
                          });
                        }}
                      />
                    </>
                  )}

                  {doodlePaths.length === 0 && (
                    <div className="inspector-grid-3">
                      <div className="inspector-field">
                        <label className="inspector-label">Opacity</label>
                        <input
                          className="inspector-input"
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          value={Number(item.params.doodleOpacity ?? 1)}
                          onChange={(event) => onParams({ doodleOpacity: Number(event.target.value) })}
                        />
                      </div>
                      <div className="inspector-field">
                        <label className="inspector-label">Size</label>
                        <input
                          className="inspector-input"
                          type="number"
                          min="0.35"
                          max="1.25"
                          step="0.05"
                          value={Number(item.params.doodleScale ?? 1)}
                          onChange={(event) => onParams({ doodleScale: Number(event.target.value) })}
                        />
                      </div>
                      <div className="inspector-field">
                        <label className="inspector-label">Seed</label>
                        <input
                          className="inspector-input"
                          type="number"
                          min="0"
                          value={Number(item.params.doodleSeed ?? Number(item.params.seed ?? 1) + 1)}
                          onChange={(event) => onParams({ doodleSeed: Number(event.target.value) })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </details>
          </div>
        </details>
      </div>

      {/* Layer 4: Background */}
      <div className="inspector-card accent-cyan" style={{ order: 4 }}>
        <details open>
          <summary style={{ color: "#22D3EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>🖼️ Background *</span>
            <strong className="translation-badge" style={{ fontSize: "11px", padding: "2px 8px", background: "rgba(34,211,238,0.15)", borderRadius: "99px", color: "#22D3EE" }}>English prompt</strong>
          </summary>
          <div className="inspector-card-body">
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <button
                type="button"
                className="inspector-btn inspector-btn-secondary"
                onClick={() => onRun?.("background")}
                disabled={Boolean(nodeRunBusy) || bgMissing.length > 0}
              >
                🖼️ Generate / refresh background
              </button>
              {stageProgress("background") !== undefined && (
                <div className="node-run-progress" aria-label={`Background progress ${stageProgress("background")}%`}>
                  <i style={{ width: `${stageProgress("background")}%` }} />
                </div>
              )}
            </div>

            <PathField
              label="Background image"
              value={backgroundImage}
              filter=".png,.jpg,.jpeg,.webp,.tif,.tiff"
              onChange={(value) => onParams({ backgroundImage: value })}
              placeholder="เลือกภาพพื้นหลังเอง หรือปล่อยว่างเพื่อ Generate ด้วย AI"
            />
            {backgroundImage && (
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <img
                  className="inspector-thumb-preview"
                  src={`/api/v1/media/stream?path=${encodeURIComponent(backgroundImage)}`}
                  alt="Selected background"
                />
                <code className="inspector-code-display" style={{ flex: 1 }}>{backgroundImage}</code>
              </div>
            )}

            <CoverPromptPartsEditor
              value={item.params.promptParts as any}
              customDirection={String(item.params.prompt ?? "")}
              onChange={(promptParts) => onParams({ promptParts })}
              onCustomDirectionChange={(prompt) => onParams({ prompt })}
            />

            <div className="inspector-field">
              <label className="inspector-label">Background seed</label>
              <input
                className="inspector-input"
                type="number"
                min="0"
                value={Number(item.params.seed ?? 1)}
                onChange={(event) => onParams({ seed: Number(event.target.value) })}
              />
            </div>
          </div>
        </details>
      </div>

      {/* Layer 5: Output preview */}
      <div className="inspector-card accent-slate" style={{ order: 5 }}>
        <details open>
          <summary style={{ color: "#CBD5E1" }}>🧾 Output preview</summary>
          <div className="inspector-card-body">
            <CoverCardOutputPreview
              params={item.params}
              onSelectHistory={(entry, key) => onParams({ [key]: entry[key] })}
            />
          </div>
        </details>
      </div>
    </div>
  );
}
