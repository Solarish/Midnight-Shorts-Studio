import { useEffect, useRef, useState } from "react";
import type { DoodlePath } from "@psu-ava/remotion-studio";
import { clampPoint, deletePathPoint, distance, insertPathPoint, movePathPoint, nearestPoint, nearestSegment, type NormalizedPoint } from "./path-geometry";

type EditMode = "inspect" | "draw" | "edit";
type PointerSession = { pointerId: number; pathId: string; pointIndex: number; draft: DoodlePath[] };

type Props = {
  paths: DoodlePath[];
  mode?: EditMode;
  drawing?: boolean;
  showGuide?: boolean;
  selectedPathId?: string;
  selectedPointIndex?: number;
  assetSet?: string[];
  onSelectPath?: (pathId: string) => void;
  onSelectPoint?: (pathId: string, pointIndex: number) => void;
  onChange: (paths: DoodlePath[]) => void;
};

/** Interactive normalized path editor. Drafts stay local until pointer-up. */
export function ProceduralDoodleCanvas({ paths, mode = "inspect", drawing = false, showGuide = true, selectedPathId, selectedPointIndex, assetSet, onSelectPath, onSelectPoint, onChange }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const session = useRef<PointerSession | null>(null);
  const [draft, setDraft] = useState<NormalizedPoint[] | null>(null);
  const [draftPaths, setDraftPaths] = useState<DoodlePath[] | null>(null);
  const activeMode = drawing ? "draw" : mode;
  const pointDistance = distance;
  const toPoint = (event: { currentTarget: HTMLCanvasElement; clientX: number; clientY: number }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return clampPoint({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
  };
  const renderPaths = draftPaths ?? paths;

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
    renderPaths.forEach((path) => {
      const selected = path.id === selectedPathId;
      if (showGuide || (activeMode === "edit" && selected)) {
        ctx.lineWidth = selected ? 3 : 2; ctx.strokeStyle = selected ? "rgba(229,169,60,.98)" : "rgba(96,165,250,.65)";
        ctx.setLineDash(showGuide ? [6, 5] : []); ctx.beginPath();
        path.points.forEach((p, i) => i ? ctx.lineTo(p.x * rect.width, p.y * rect.height) : ctx.moveTo(p.x * rect.width, p.y * rect.height)); ctx.stroke(); ctx.setLineDash([]);
      }
      if (activeMode === "edit" && (showGuide || selected)) path.points.forEach((p, i) => {
        ctx.beginPath(); ctx.arc(p.x * rect.width, p.y * rect.height, path.id === selectedPathId && i === selectedPointIndex ? 8 : 5, 0, Math.PI * 2);
        ctx.fillStyle = path.id === selectedPathId && i === selectedPointIndex ? "#E5A93C" : "#BFDBFE"; ctx.fill(); ctx.strokeStyle = "#0F172A"; ctx.stroke();
      });
    });
    if (draft?.length) { ctx.strokeStyle = "rgba(229,169,60,.95)"; ctx.lineWidth = 3; ctx.beginPath(); draft.forEach((p, i) => i ? ctx.lineTo(p.x * rect.width, p.y * rect.height) : ctx.moveTo(p.x * rect.width, p.y * rect.height)); ctx.stroke(); }
  }, [renderPaths, draft, showGuide, activeMode, selectedPathId, selectedPointIndex]);

  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (draft && draft.length >= 2) {
      const id = `path_${Date.now()}`; const palette = assetSet?.length ? assetSet : ["doodle-01", "doodle-02", "doodle-03", "doodle-04"];
      onChange([...paths, { id, points: draft, doodles: draft.map((_, pointIndex) => ({ id: `${id}_doodle_${pointIndex}`, assetId: palette[pointIndex % palette.length]!, pointIndex })), assetSet: palette, distribution: "along-path", frequency: .65, spacing: .08, size: .5, sizeJitter: .15, rotation: "follow-path", rotationJitter: 18, offsetJitter: .02, opacity: .75, seed: Math.floor(Math.random() * 100000) }]);
      setDraft(null);
    } else if (session.current) onChange(session.current.draft);
    setDraftPaths(null); session.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <canvas ref={ref} aria-label="Draw and edit doodle paths" tabIndex={0} style={{ position: "absolute", inset: 0, display: "block", width: "100%", height: "100%", zIndex: 20, pointerEvents: "auto", touchAction: "none", cursor: activeMode === "draw" ? "crosshair" : activeMode === "edit" ? "move" : "default" }}
    onDoubleClick={(event) => {
      if (activeMode !== "edit") return; const point = toPoint(event); const node = nearestPoint(renderPaths, point);
      if (node) { onSelectPath?.(node.pathId); onSelectPoint?.(node.pathId, node.pointIndex); if (renderPaths.find((path) => path.id === node.pathId)!.points.length > 2) onChange(deletePathPoint(renderPaths, node)); return; }
      const segment = nearestSegment(renderPaths.filter((path) => !selectedPathId || path.id === selectedPathId), point);
      if (segment) { const next = insertPathPoint(renderPaths, segment); onSelectPath?.(segment.pathId); onSelectPoint?.(segment.pathId, segment.segmentIndex + 1); onChange(next); }
    }}
    onPointerDown={(event) => {
      const point = toPoint(event);
      if (activeMode === "draw") { event.currentTarget.setPointerCapture(event.pointerId); setDraft([point]); return; }
      if (activeMode !== "edit") { const hit = nearestPoint(paths, point); if (hit) onSelectPath?.(hit.pathId); return; }
      const hit = nearestPoint(renderPaths.filter((path) => !selectedPathId || path.id === selectedPathId), point);
      if (!hit) return; onSelectPath?.(hit.pathId); onSelectPoint?.(hit.pathId, hit.pointIndex); event.currentTarget.setPointerCapture(event.pointerId);
      session.current = { pointerId: event.pointerId, pathId: hit.pathId, pointIndex: hit.pointIndex, draft: renderPaths }; setDraftPaths(renderPaths);
    }}
    onPointerMove={(event) => {
      if (activeMode === "draw" && draft) { const next = toPoint(event); const last = draft[draft.length - 1]; if (!last || pointDistance(next, last) > .012) setDraft([...draft, next]); return; }
      const current = session.current; if (!current || current.pointerId !== event.pointerId) return;
      const next = movePathPoint(current.draft, current.pathId, current.pointIndex, toPoint(event)); current.draft = next; setDraftPaths(next);
    }}
    onKeyDown={(event) => {
      if (activeMode !== "edit" || event.key !== "Delete" || selectedPathId == null || selectedPointIndex == null) return;
      const path = renderPaths.find((candidate) => candidate.id === selectedPathId);
      if (path && path.points.length > 2) onChange(deletePathPoint(renderPaths, { pathId: selectedPathId, pointIndex: selectedPointIndex, distance: 0 }));
    }}
    onPointerUp={finish}
    onPointerCancel={() => { setDraft(null); setDraftPaths(null); session.current = null; }} />;
}
