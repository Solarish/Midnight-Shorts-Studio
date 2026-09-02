import { describe, expect, it } from "vitest";
import type { DoodlePath } from "@psu-ava/remotion-studio";
import { calculatePathPlacementCount, deletePathPoint, insertPathPoint, movePathPoint, nearestPoint, nearestSegment, randomizeDoodlePlacements, rebalanceDoodlePlacements } from "./path-geometry";

const path: DoodlePath = { id: "p1", points: [{ x: 0, y: 0 }, { x: .5, y: 0 }, { x: 1, y: 0 }], doodles: [
  { id: "d0", assetId: "a", pointIndex: 0 }, { id: "d1", assetId: "b", pointIndex: 1 }, { id: "d2", assetId: "c", pointIndex: 2 }
] };

describe("doodle path geometry", () => {
  it("finds nodes and segments in normalized coordinates", () => {
    expect(nearestPoint([path], { x: .5, y: .01 })?.pointIndex).toBe(1);
    expect(nearestSegment([path], { x: .25, y: .02 })?.segmentIndex).toBe(0);
  });
  it("inserts a point and shifts later placements", () => {
    const next = insertPathPoint([path], { pathId: "p1", segmentIndex: 0, point: { x: .25, y: 0 }, distance: 0 });
    expect(next[0]!.points).toHaveLength(4);
    expect(next[0]!.doodles?.map((doodle) => doodle.pointIndex)).toEqual([0, 2, 3]);
  });
  it("deletes a point and reindexes placements", () => {
    const next = deletePathPoint([path], { pathId: "p1", pointIndex: 1, distance: 0 });
    expect(next[0]!.points).toHaveLength(2);
    expect(next[0]!.doodles?.map((doodle) => doodle.pointIndex)).toEqual([0, 1]);
  });
  it("keeps two-point paths and clamps moved nodes", () => {
    const two = deletePathPoint([path], { pathId: "p1", pointIndex: 1, distance: 0 });
    expect(deletePathPoint(two, { pathId: "p1", pointIndex: 0, distance: 0 })[0]!.points).toHaveLength(2);
    expect(movePathPoint([path], "p1", 1, { x: 4, y: -2 })[0]!.points[1]).toEqual({ x: 1, y: 0 });
  });
  it("replaces disabled placements and distributes a newly enabled asset without collapsing the palette", () => {
    const placements = [{ id: "a", assetId: "old" }, { id: "b", assetId: "doodle-01" }, { id: "c", assetId: "doodle-02" }];
    const next = rebalanceDoodlePlacements(placements, ["doodle-01", "doodle-02", "new"], ["new"]);
    expect(next?.map((item) => item.assetId)).toEqual(["new", "doodle-01", "doodle-02"]);
  });
  it("keeps the calculated placement count and represents every active asset", () => {
    const placements = Array.from({ length: 21 }, (_, index) => ({ id: String(index), assetId: "duck" }));
    const next = rebalanceDoodlePlacements(placements, ["doodle-13", "doodle-17", "doodle-22", "dental", "duck"]);
    expect(next).toHaveLength(21);
    expect(new Set(next?.map((item) => item.assetId))).toEqual(new Set(["doodle-13", "doodle-17", "doodle-22", "dental", "duck"]));
  });
  it("is idempotent when toggling the same palette again", () => {
    const placements = [{ id: "a", assetId: "a" }, { id: "b", assetId: "b" }, { id: "c", assetId: "a" }];
    const once = rebalanceDoodlePlacements(placements, ["a", "b", "c"]);
    expect(rebalanceDoodlePlacements(once, ["a", "b", "c"])).toEqual(once);
  });
  it("calculates visible count from path geometry and active asset set", () => {
    const configured = { ...path, distribution: "start-end" as const, assetSet: ["a", "b", "c"] };
    expect(calculatePathPlacementCount(configured)).toBe(2);
    expect(calculatePathPlacementCount({ ...configured, assetSet: ["a"] })).toBe(1);
  });
  it("rebuilds placements from path properties when randomized", () => {
    const next = randomizeDoodlePlacements({ ...path, distribution: "start-end", frequency: 1 }, ["a", "b"], 42);
    expect(next.doodles?.map((doodle) => doodle.pointIndex)).toEqual([0, 2]);
    expect(new Set(next.doodles?.map((doodle) => doodle.assetId))).toEqual(new Set(["a", "b"]));
  });
});
