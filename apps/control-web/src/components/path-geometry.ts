import type { DoodlePath, DoodlePoint } from "@psu-ava/remotion-studio";

export type NormalizedPoint = { x: number; y: number };
export type PathHit = { pathId: string; pointIndex: number; distance: number };
export type SegmentHit = { pathId: string; segmentIndex: number; point: NormalizedPoint; distance: number };

export const clampPoint = (point: NormalizedPoint): NormalizedPoint => ({
  x: Math.max(0, Math.min(1, point.x)),
  y: Math.max(0, Math.min(1, point.y))
});

export const distance = (a: NormalizedPoint, b: NormalizedPoint) => Math.hypot(a.x - b.x, a.y - b.y);

export function nearestPoint(paths: DoodlePath[], target: NormalizedPoint, threshold = 0.035): PathHit | undefined {
  let hit: PathHit | undefined;
  paths.forEach((path) => path.points.forEach((point, pointIndex) => {
    const next = distance(target, point);
    if (next <= threshold && (!hit || next < hit.distance)) hit = { pathId: path.id, pointIndex, distance: next };
  }));
  return hit;
}

export function nearestSegment(paths: DoodlePath[], target: NormalizedPoint, threshold = 0.035): SegmentHit | undefined {
  let hit: SegmentHit | undefined;
  paths.forEach((path) => path.points.slice(0, -1).forEach((a, segmentIndex) => {
    const b = path.points[segmentIndex + 1]!;
    const dx = b.x - a.x; const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.y - a.y) * dy) / lengthSquared)) : 0;
    const projected = { x: a.x + dx * t, y: a.y + dy * t };
    const next = distance(target, projected);
    if (next <= threshold && (!hit || next < hit.distance)) hit = { pathId: path.id, segmentIndex, point: projected, distance: next };
  }));
  return hit;
}

export function insertPathPoint(paths: DoodlePath[], hit: SegmentHit): DoodlePath[] {
  return paths.map((path) => path.id !== hit.pathId ? path : {
    ...path,
    points: [...path.points.slice(0, hit.segmentIndex + 1), hit.point, ...path.points.slice(hit.segmentIndex + 1)],
    doodles: path.doodles?.map((doodle) => ({ ...doodle, pointIndex: doodle.pointIndex > hit.segmentIndex ? doodle.pointIndex + 1 : doodle.pointIndex }))
  });
}

export function deletePathPoint(paths: DoodlePath[], hit: PathHit): DoodlePath[] {
  return paths.map((path) => {
    if (path.id !== hit.pathId || path.points.length <= 2) return path;
    return {
      ...path,
      points: path.points.filter((_, index) => index !== hit.pointIndex),
      doodles: path.doodles?.filter((doodle) => doodle.pointIndex !== hit.pointIndex)
        .map((doodle) => ({ ...doodle, pointIndex: doodle.pointIndex > hit.pointIndex ? doodle.pointIndex - 1 : doodle.pointIndex }))
    };
  });
}

export function movePathPoint(paths: DoodlePath[], pathId: string, pointIndex: number, point: DoodlePoint): DoodlePath[] {
  return paths.map((path) => path.id !== pathId ? path : {
    ...path,
    points: path.points.map((current, index) => index === pointIndex ? { ...current, ...clampPoint(point) } : current)
  });
}

/** The renderer's deterministic visibility calculation, exposed for the UI. */
export function calculatePathPlacementCount(path: Pick<DoodlePath, "points" | "doodles" | "distribution" | "frequency" | "spacing" | "seed" | "assetSet">): number {
  const spacing = Math.max(.01, Number(path.spacing ?? .08));
  const frequency = Math.max(0, Math.min(1, Number(path.frequency ?? 1)));
  const selected: number[] = [];
  let distanceAlongPath = 0;
  let nextDistance = 0;
  path.points.forEach((point, pointIndex) => {
    if (pointIndex > 0) {
      const previous = path.points[pointIndex - 1]!;
      distanceAlongPath += distance(point, previous);
    }
    if (pointIndex === 0 || distanceAlongPath >= nextDistance) {
      selected.push(pointIndex);
      nextDistance = distanceAlongPath + spacing;
    }
  });
  const candidates = path.distribution === "repeated" ? path.points.map((_, index) => index) : selected;
  const visible = new Set(candidates.filter((pointIndex) => (((Number(path.seed ?? 1) * (pointIndex + 11) * 17) % 100) / 100) <= frequency));
  if (path.distribution === "start-end") {
    visible.clear();
    [path.points.length ? 0 : -1, path.points.length - 1].forEach((pointIndex) => pointIndex >= 0 && visible.add(pointIndex));
  }
  return path.doodles?.length
    ? path.doodles.filter((doodle) => visible.has(doodle.pointIndex) && (path.assetSet === undefined || path.assetSet.includes(doodle.assetId))).length
    : [...visible].length;
}

export function randomizeDoodlePlacements(path: DoodlePath, activeIds: string[], seed = Math.floor(Math.random() * 100000)): DoodlePath {
  const active = [...new Set(activeIds)];
  if (!active.length || path.points.length === 0) return { ...path, seed, doodles: [] };
  const spacing = Math.max(.01, Number(path.spacing ?? .08));
  const frequency = Math.max(0, Math.min(1, Number(path.frequency ?? 1)));
  const selected: number[] = [];
  let distanceAlongPath = 0;
  let nextDistance = 0;
  path.points.forEach((point, pointIndex) => {
    if (pointIndex > 0) distanceAlongPath += distance(point, path.points[pointIndex - 1]!);
    if (pointIndex === 0 || distanceAlongPath >= nextDistance) { selected.push(pointIndex); nextDistance = distanceAlongPath + spacing; }
  });
  const candidates = path.distribution === "repeated" ? path.points.map((_, index) => index) : selected;
  let visible = candidates.filter((pointIndex) => (((seed * (pointIndex + 11) * 17) % 100) / 100) <= frequency);
  if (path.distribution === "start-end") visible = [...new Set([0, path.points.length - 1])];
  return {
    ...path,
    seed,
    doodles: visible.map((pointIndex, index) => ({ id: `${path.id}_doodle_${index}`, assetId: active[(seed + index * 31) % active.length]!, pointIndex }))
  };
}

/**
 * Keeps the path's placement count/point indices intact while reconciling its
 * asset palette. A palette change must never turn all placements into the
 * last toggled asset: active assets are preserved, and every active asset is
 * guaranteed a slot when the path has enough placements.
 */
export function rebalanceDoodlePlacements<T extends { assetId: string }>(doodles: T[] | undefined, activeIds: string[], _addedIds: string[] = []): T[] | undefined {
  if (!doodles?.length || !activeIds.length) return doodles;
  const active = [...new Set(activeIds)];
  const result = doodles.map((doodle) => active.includes(doodle.assetId) ? doodle : { ...doodle, assetId: active[0]! });
  const present = new Set(result.map((doodle) => doodle.assetId));
  const missing = active.filter((assetId) => !present.has(assetId));

  // Prefer slots that were disabled, then replace the earliest repeated
  // assets. This is deterministic and keeps existing visible placements.
  const slots = result.map((doodle, index) => ({ index, disabled: !activeIds.includes(doodles[index]!.assetId) }))
    .sort((a, b) => Number(b.disabled) - Number(a.disabled) || a.index - b.index)
    .map(({ index }) => index);
  missing.forEach((assetId, index) => {
    const slot = slots[index % slots.length]!;
    result[slot] = { ...result[slot]!, assetId };
  });
  return result;
}
