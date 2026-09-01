import { describe, expect, test } from "vitest";
import { compatiblePortTypes, computedTimeline, connectionCompatibility, defaultConfig, serializeEdges, wouldCreateCycle } from "./graph-model";

describe("visual workflow graph model", () => {
  test("rejects connections that would introduce a cycle", () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const edges = [{ source: "a", target: "b" }, { source: "b", target: "c" }];
    expect(wouldCreateCycle(nodes, edges, "c", "a")).toBe(true);
    expect(wouldCreateCycle(nodes, edges, "a", "c")).toBe(false);
  });

  test("computes a stable read-only topological timeline", () => {
    const result = computedTimeline({
      nodes: [
        { id: "render", type: "render", position: { x: 300, y: 0 }, config: {} },
        { id: "source", type: "source", position: { x: 0, y: 0 }, config: {} },
        { id: "bind", type: "bind", position: { x: 150, y: 0 }, config: {} }
      ],
      edges: [
        { id: "one", source: "source", target: "bind" },
        { id: "two", source: "bind", target: "render" }
      ]
    });
    expect(result.cyclic).toBe(false);
    expect(result.nodes.map((node) => node.id)).toEqual(["source", "bind", "render"]);
  });

  test("creates inspector defaults from descriptor config schema", () => {
    expect(defaultConfig({
      type: "demo",
      label: "Demo",
      description: "Demo node",
      lifecycleStage: "assets",
      category: "Test",
      inputs: [],
      outputs: [],
      configSchema: { type: "object", properties: { title: { type: "string", default: "Hello" }, enabled: { type: "boolean" }, retries: { type: "integer", default: 2 } } }
    })).toEqual({ title: "Hello", enabled: false, retries: 2 });
  });

  test("accepts only compatible labeled ports", () => {
    const descriptors = new Map([
      ["source", { type: "source", label: "Source", description: "Source", lifecycleStage: "assets" as const, category: "media", inputs: [], outputs: [{ id: "video", type: "video" as const }], configSchema: {} }],
      ["target", { type: "target", label: "Target", description: "Target", lifecycleStage: "timeline" as const, category: "media", inputs: [{ id: "media", type: "media" as const }], outputs: [], configSchema: {} }],
      ["text", { type: "text", label: "Text", description: "Text", lifecycleStage: "process" as const, category: "media", inputs: [{ id: "text", type: "text" as const }], outputs: [], configSchema: {} }]
    ]);
    const nodes = [{ id: "a", nodeType: "source" }, { id: "b", nodeType: "target" }, { id: "c", nodeType: "text" }];
    expect(connectionCompatibility(descriptors, nodes, { source: "a", target: "b", sourceHandle: "video", targetHandle: "media" })).toMatchObject({ valid: true, sourcePort: "video", targetPort: "media" });
    expect(connectionCompatibility(descriptors, nodes, { source: "a", target: "c", sourceHandle: "video", targetHandle: "text" })).toMatchObject({ valid: false, reason: "Cannot connect video to text." });
    expect(compatiblePortTypes("audio", "media")).toBe(true);
  });

  test("serializes the exact ReactFlow handle ids as workflow ports", () => {
    expect(serializeEdges([{ id: "edge", source: "a", target: "b", sourceHandle: "rendered-video", targetHandle: "source-media" }])).toEqual([
      { id: "edge", source: "a", target: "b", sourcePort: "rendered-video", targetPort: "source-media" }
    ]);
  });
});
