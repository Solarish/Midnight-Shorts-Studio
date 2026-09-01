import { describe, expect, it } from "vitest";
import {
  LIFECYCLE_STAGES,
  analyzeWorkflowLifecycle,
  type LifecycleDescriptorLike,
  type LifecycleEdgeLike,
  type LifecycleNodeLike
} from "./lifecycle-model";

const descriptors: LifecycleDescriptorLike[] = [
  { type: "asset", lifecycleStage: "assets", inputs: [{ id: "path", required: true, configKey: "uploads.0.file" }] },
  { type: "process", lifecycleStage: "process", inputs: [{ id: "source", required: true, configKey: "source" }] },
  { type: "timeline", lifecycleStage: "timeline", inputs: [{ id: "scenes", required: true, configKey: "scenes" }] },
  { type: "build", lifecycleStage: "build", inputs: [{ id: "timeline", required: true, configKey: "timeline" }] },
  { type: "export", lifecycleStage: "export", inputs: [{ id: "project", required: true, configKey: "project" }] }
];

const node = (id: string, type: string, config: Record<string, unknown> = {}): LifecycleNodeLike => ({ id, type, config });
const edge = (id: string, source: string, target: string, targetPort: string): LifecycleEdgeLike => ({
  id, source, target, sourcePort: "output", targetPort
});
const status = (result: ReturnType<typeof analyzeWorkflowLifecycle>, stage: string) => result.stages.find((value) => value.stage === stage)?.status;

describe("analyzeWorkflowLifecycle", () => {
  it("classifies an empty workflow and identifies assets as the next required stage", () => {
    const result = analyzeWorkflowLifecycle({ nodes: [], edges: [], descriptors });
    expect(result.complete).toBe(false);
    expect(result.nextRequiredStage).toBe("assets");
    expect(result.stages.map((value) => value.status)).toEqual(["empty", "optional", "empty", "empty", "empty"]);
  });

  it("does not mistake configured but disconnected required stages for a complete workflow", () => {
    const nodes = [
      node("asset", "asset", { uploads: [{ file: "photo.png" }] }),
      node("timeline", "timeline", { scenes: ["scene"] }),
      node("build", "build", { timeline: { id: "main" } }),
      node("export", "export", { project: "main.prproj" })
    ];
    const result = analyzeWorkflowLifecycle({ nodes, edges: [], descriptors });
    expect(result.structural.disconnected).toBe(true);
    expect(result.structural.requiredPathComplete).toBe(false);
    expect(result.complete).toBe(false);
    expect(result.stages.filter((value) => value.required).every((value) => value.status === "needs-attention")).toBe(true);
  });

  it("treats process as optional when a full required-stage path omits it", () => {
    const nodes = [node("asset", "asset", { uploads: [{ file: "photo.png" }] }), node("timeline", "timeline"), node("build", "build"), node("export", "export")];
    const edges = [edge("a-t", "asset", "timeline", "scenes"), edge("t-b", "timeline", "build", "timeline"), edge("b-e", "build", "export", "project")];
    const result = analyzeWorkflowLifecycle({ nodes, edges, descriptors });
    expect(result.complete).toBe(true);
    expect(status(result, "process")).toBe("optional");
    expect(result.nextRequiredStage).toBeUndefined();
  });

  it("accepts a valid full graph including the optional process phase", () => {
    const nodes = [node("asset", "asset", { uploads: [{ file: "photo.png" }] }), node("process", "process"), node("timeline", "timeline"), node("build", "build"), node("export", "export")];
    const edges = [
      edge("a-p", "asset", "process", "source"),
      edge("p-t", "process", "timeline", "scenes"),
      edge("t-b", "timeline", "build", "timeline"),
      edge("b-e", "build", "export", "project")
    ];
    const result = analyzeWorkflowLifecycle({ nodes, edges, descriptors });
    expect(result.complete).toBe(true);
    expect(result.stages.map((value) => value.stage)).toEqual(LIFECYCLE_STAGES);
    expect(result.stages.every((value) => value.status === "ready")).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("requires an incoming edge to match the required target port", () => {
    const nodes = [node("asset", "asset", { uploads: [{ file: "photo.png" }] }), node("timeline", "timeline"), node("build", "build"), node("export", "export")];
    const edges = [edge("a-t", "asset", "timeline", "wrong-port"), edge("t-b", "timeline", "build", "timeline"), edge("b-e", "build", "export", "project")];
    const result = analyzeWorkflowLifecycle({ nodes, edges, descriptors });
    expect(result.complete).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "missing-required-input", nodeId: "timeline" }));
    expect(status(result, "timeline")).toBe("needs-attention");
  });

  it("detects a directed cycle", () => {
    const nodes = [node("asset", "asset", { uploads: [{ file: "photo.png" }] }), node("timeline", "timeline"), node("build", "build"), node("export", "export")];
    const edges = [
      edge("a-t", "asset", "timeline", "scenes"),
      edge("t-b", "timeline", "build", "timeline"),
      edge("b-e", "build", "export", "project"),
      edge("e-t", "export", "timeline", "scenes")
    ];
    const result = analyzeWorkflowLifecycle({ nodes, edges, descriptors });
    expect(result.structural.hasCycle).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.issues.some((value) => value.code === "cycle")).toBe(true);
  });

  it("detects a weakly disconnected extra node", () => {
    const nodes = [
      node("asset", "asset", { uploads: [{ file: "photo.png" }] }),
      node("process", "process", { source: "photo.png" }),
      node("timeline", "timeline"),
      node("build", "build"),
      node("export", "export")
    ];
    const edges = [edge("a-t", "asset", "timeline", "scenes"), edge("t-b", "timeline", "build", "timeline"), edge("b-e", "build", "export", "project")];
    const result = analyzeWorkflowLifecycle({ nodes, edges, descriptors });
    expect(result.structural.disconnected).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.issues.some((value) => value.code === "disconnected-graph")).toBe(true);
  });

  it("detects backward lifecycle connections without requiring a cycle", () => {
    const nodes = [
      node("asset", "asset", { uploads: [{ file: "photo.png" }] }),
      node("timeline", "timeline", { scenes: ["configured"] }),
      node("build", "build", { timeline: { configured: true } }),
      node("export", "export")
    ];
    const edges = [edge("a-b", "asset", "build", "timeline"), edge("b-t", "build", "timeline", "scenes"), edge("t-e", "timeline", "export", "project")];
    const result = analyzeWorkflowLifecycle({ nodes, edges, descriptors });
    expect(result.structural.hasCycle).toBe(false);
    expect(result.structural.monotonicOrder).toBe(false);
    expect(result.complete).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "phase-order", edgeId: "b-t" }));
  });

  it("marks a stage invalid when current validation errors locate one of its nodes", () => {
    const result = analyzeWorkflowLifecycle({
      nodes: [node("asset", "asset", { uploads: [{ file: "photo.png" }] })],
      edges: [],
      descriptors,
      validationErrors: [{ nodeId: "asset", path: "/nodes/0/config", message: "Asset configuration is invalid" }]
    });
    expect(status(result, "assets")).toBe("invalid");
    expect(result.complete).toBe(false);
  });
});
