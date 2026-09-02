import assert from "node:assert/strict";
import test from "node:test";
import { nodeLifecycleStages } from "@psu-ava/contracts";
import { createGraphDefinition, compileGraphToWorkflow, nodeDescriptors, validateGraphDefinition } from "../src/index.ts";

test("all canonical nodes expose Thai role descriptions and lifecycle stages", () => {
  assert.equal(nodeDescriptors.length, 86);
  const allowed = new Set(nodeLifecycleStages);
  for (const descriptor of nodeDescriptors) {
    assert.equal(typeof descriptor.description, "string", `${descriptor.type} description`);
    assert.match(descriptor.description ?? "", /[\u0E00-\u0E7F]/, `${descriptor.type} Thai description`);
    assert.equal(allowed.has(descriptor.lifecycleStage!), true, `${descriptor.type} lifecycleStage`);
  }
  assert.equal(nodeDescriptors.find((item) => item.type === "asset.select")?.lifecycleStage, "assets");
  assert.equal(nodeDescriptors.find((item) => item.type === "timeline.compose")?.lifecycleStage, "timeline");
  assert.equal(nodeDescriptors.find((item) => item.type === "remotion.render")?.lifecycleStage, "export");
  assert.equal(nodeDescriptors.find((item) => item.type === "media.audio_normalize")?.lifecycleStage, "export");
  assert.equal(nodeDescriptors.find((item) => item.type === "review.media_approval")?.lifecycleStage, "process");
  assert.equal(nodeDescriptors.find((item) => item.type === "graphics.cover_title")?.lifecycleStage, "process");
});

function executableGraph() {
  return createGraphDefinition({
    graphId: "first_graph",
    name: "First graph",
    nodes: [
      { id: "asset", type: "asset.select", position: { x: 0, y: 0 }, config: { path: "assets/input/photo.png" } },
      { id: "probe", type: "media.probe", position: { x: 100, y: 0 }, config: {} },
      { id: "scene", type: "timeline.scene", position: { x: 200, y: 0 }, config: { durationMs: 5000, audio: true, audioPolicy: "preserve" } },
      { id: "compose", type: "timeline.compose", position: { x: 300, y: 0 }, config: { name: "MAIN" } },
      { id: "premiere", type: "premiere.build", position: { x: 400, y: 0 }, config: { outputProject: "outputs/premiere/final.prproj" } }
    ],
    edges: [
      { id: "e1", from: { nodeId: "asset", port: "path" }, to: { nodeId: "probe", port: "path" } },
      { id: "e2", from: { nodeId: "probe", port: "media" }, to: { nodeId: "scene", port: "source" } },
      { id: "e3", from: { nodeId: "scene", port: "scene" }, to: { nodeId: "compose", port: "scenes" } },
      { id: "e4", from: { nodeId: "compose", port: "timeline" }, to: { nodeId: "premiere", port: "timeline" } }
    ],
    order: ["asset", "probe", "scene", "compose", "premiere"]
  });
}

test("typed DAG compiles deterministically into sequential adapter steps", () => {
  const graph = executableGraph();
  const validation = validateGraphDefinition(graph);
  assert.equal(validation.valid, true, validation.diagnostics.map((item) => item.message).join("\n"));
  const first = compileGraphToWorkflow(graph);
  const second = compileGraphToWorkflow(graph);
  assert.equal(first.digest, second.digest);
  assert.deepEqual(first.workflow.steps.map((step) => step.type), [
    "asset.select", "media.probe", "timeline.scene", "timeline.compose", "premiere.build"
  ]);
  assert.equal(first.workflow.steps[2]?.with?.source, "${steps.probe.outputs.path}");
  assert.deepEqual(first.workflow.steps[3]?.with?.scenes, ["${steps.scene.outputs.scene}"]);
  assert.equal(first.workflow.steps[3]?.with?.width, 1080);
  assert.equal(first.workflow.steps[3]?.with?.height, 1920);
  assert.equal(first.workflow.steps[3]?.with?.frameRate, 25);
  assert.deepEqual((first.workflow.settings as any)?.graph, {
    profile: { id: "portrait", width: 1080, height: 1920, frameRate: 25 },
    durationFrames: 125,
    durationMs: 5000
  });
});

test("workflow settings deep-merge an explicit After Effects host without dropping Premiere pinning", () => {
  const graph = executableGraph();
  graph.settings = {
    adobe: { afterEffects: {
      applicationId: "com.adobe.AfterEffectsBeta.application",
      aerenderPath: "/Applications/Adobe After Effects (Beta)/aerender"
    } }
  };
  const compiled = compileGraphToWorkflow(graph);
  assert.equal(compiled.workflow.settings.adobe.afterEffects.aerenderPath, "/Applications/Adobe After Effects (Beta)/aerender");
  assert.equal(compiled.workflow.settings.adobe.afterEffects.applicationId, "com.adobe.AfterEffectsBeta.application");
  assert.equal(compiled.workflow.settings.adobe.premiere.requiredVersion, "26.5.0");
});

test("validation rejects invalid config, profile conflicts and scene duration beyond the declared graph", () => {
  const graph = executableGraph();
  graph.durationFrames = 25;
  graph.nodes.find((node) => node.id === "compose")!.config.width = 1920;
  const result = validateGraphDefinition(graph);
  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((item) => item.code === "timeline_duration"));
  assert.ok(result.diagnostics.some((item) => item.path.endsWith("/config/width") && item.message.includes("portrait")));

  graph.durationFrames = 125;
  graph.nodes.find((node) => node.id === "scene")!.config.durationMs = 1001;
  assert.ok(validateGraphDefinition(graph).diagnostics.some((item) => item.message.includes("40ms")));

  // Missing audio
  const noAudioGraph = executableGraph();
  delete noAudioGraph.nodes.find((node) => node.id === "scene")!.config.audio;
  assert.ok(validateGraphDefinition(noAudioGraph).diagnostics.some((item) => item.path.includes("audio") && item.message.includes("boolean")));

  // Invalid editorialKind
  const badKindGraph = executableGraph();
  noAudioGraph.nodes.find((node) => node.id === "scene")!.config.editorialKind = "invalid_kind";
  assert.ok(validateGraphDefinition(noAudioGraph).diagnostics.some((item) => item.path.includes("editorialKind")));
});

test("validation rejects a directed cycle", () => {
  const graph = executableGraph();
  graph.edges.push({ id: "cycle", from: { nodeId: "premiere", port: "project" }, to: { nodeId: "probe", port: "path" } });
  assert.equal(validateGraphDefinition(graph).diagnostics.some((item) => item.code === "cycle"), true);
});

test("graph validation and compiler accept minimal typed dynamic link graph", () => {
  const graph = createGraphDefinition({
    graphId: "dynamic_link_graph",
    name: "Dynamic Link Graph",
    profile: "landscape",
    durationFrames: 250,
    nodes: [
      { id: "assets", type: "asset.multi_select", position: { x: 0, y: 0 }, config: { paths: ["assets/photo1.jpg", "assets/photo2.jpg"] } },
      { id: "carousel", type: "effect.3d_carousel", position: { x: 100, y: 0 }, config: { composition: "Main" } },
      { id: "dynamic_link", type: "timeline.dynamic_link", position: { x: 200, y: 0 }, config: { id: "title_dl", composition: "Main", startMs: 0, durationMs: 4000, track: 3, audioPolicy: "mute" } },
      { id: "scene_asset", type: "asset.select", position: { x: 100, y: 100 }, config: { path: "assets/aroll.mov" } },
      { id: "scene", type: "timeline.scene", position: { x: 200, y: 100 }, config: { durationMs: 4000, startMs: 0, track: 1, audio: true, audioPolicy: "preserve" } },
      { id: "compose", type: "timeline.compose", position: { x: 300, y: 0 }, config: { name: "MAIN" } }
    ],
    edges: [
      { id: "e1", from: { nodeId: "assets", port: "mediaList" }, to: { nodeId: "carousel", port: "media" } },
      { id: "e2", from: { nodeId: "carousel", port: "project" }, to: { nodeId: "dynamic_link", port: "project" } },
      { id: "e3", from: { nodeId: "dynamic_link", port: "dynamicLink" }, to: { nodeId: "compose", port: "dynamicLinks" } },
      { id: "e4", from: { nodeId: "scene_asset", port: "path" }, to: { nodeId: "scene", port: "source" } },
      { id: "e5", from: { nodeId: "scene", port: "scene" }, to: { nodeId: "compose", port: "scenes" } }
    ],
    order: ["assets", "carousel", "dynamic_link", "scene_asset", "scene", "compose"]
  });

  const validation = validateGraphDefinition(graph);
  assert.equal(validation.valid, true, validation.diagnostics.map((item) => `${item.path}: ${item.message}`).join("\n"));

  const compiled = compileGraphToWorkflow(graph);
  const dlStep = compiled.workflow.steps.find((step) => step.id === "dynamic_link");
  assert.ok(dlStep);
  assert.equal(dlStep?.type, "timeline.dynamic_link");
  assert.equal(dlStep?.with?.project, "${steps.carousel.outputs.project}");
  assert.equal(dlStep?.with?.id, "title_dl");
  assert.equal(dlStep?.with?.composition, "Main");
  assert.equal(dlStep?.with?.audioPolicy, "mute");

  const composeStep = compiled.workflow.steps.find((step) => step.id === "compose");
  assert.ok(composeStep);
  assert.deepEqual(composeStep?.with?.dynamicLinks, ["${steps.dynamic_link.outputs.dynamicLink}"]);
  assert.deepEqual(composeStep?.with?.scenes, ["${steps.scene.outputs.scene}"]);
});

test("graph validation and compiler accept review.media_approval in cover pipeline and fail closed on bad config", () => {
  const descriptor = nodeDescriptors.find((d) => d.type === "review.media_approval");
  assert.ok(descriptor);
  assert.equal(descriptor.category, "existing");
  assert.equal(descriptor.lifecycleStage, "process");
  assert.equal(descriptor.sideEffect, true);
  assert.deepEqual(descriptor.inputs.map((p) => p.id), ["asset", "workflowDigest"]);
  assert.deepEqual(descriptor.outputs.map((p) => p.id), ["approvedAsset", "approval"]);

  // Valid cover graph
  const validGraph = createGraphDefinition({
    graphId: "cover_graph",
    name: "Cover Graph",
    profile: "landscape",
    durationFrames: 250,
    nodes: [
      { id: "source_asset", type: "asset.select", position: { x: 0, y: 0 }, config: { path: "assets/source.jpg" } },
      { id: "generate", type: "comfyui.workflow", position: { x: 100, y: 0 }, config: { workflowFile: "workflows/generate-cover-zimage.api.json" } },
      { id: "review", type: "review.media_approval", position: { x: 200, y: 0 }, config: { storyboardItemId: "cover_1", sourceImage: "/abs/source.jpg", prompt: "A portrait", seed: 42, title: "Cover Title" } },
      { id: "overlay", type: "timeline.overlay", position: { x: 300, y: 0 }, config: { startMs: 0, durationMs: 4000, track: 2, audioPolicy: "mute" } },
      { id: "scene_asset", type: "asset.select", position: { x: 100, y: 100 }, config: { path: "assets/scene.mov" } },
      { id: "scene", type: "timeline.scene", position: { x: 200, y: 100 }, config: { durationMs: 4000, startMs: 0, track: 1, audio: true, audioPolicy: "preserve" } },
      { id: "compose", type: "timeline.compose", position: { x: 400, y: 0 }, config: { name: "MAIN" } }
    ],
    edges: [
      { id: "e1", from: { nodeId: "source_asset", port: "path" }, to: { nodeId: "generate", port: "image" } },
      { id: "e2", from: { nodeId: "generate", port: "image" }, to: { nodeId: "review", port: "asset" } },
      { id: "e3", from: { nodeId: "generate", port: "workflowDigest" }, to: { nodeId: "review", port: "workflowDigest" } },
      { id: "e4", from: { nodeId: "review", port: "approvedAsset" }, to: { nodeId: "overlay", port: "asset" } },
      { id: "e5", from: { nodeId: "overlay", port: "overlay" }, to: { nodeId: "compose", port: "overlays" } },
      { id: "e6", from: { nodeId: "scene_asset", port: "path" }, to: { nodeId: "scene", port: "source" } },
      { id: "e7", from: { nodeId: "scene", port: "scene" }, to: { nodeId: "compose", port: "scenes" } }
    ],
    order: ["source_asset", "generate", "review", "overlay", "scene_asset", "scene", "compose"]
  });

  const validResult = validateGraphDefinition(validGraph);
  assert.equal(validResult.valid, true, validResult.diagnostics.map((d) => `${d.path}: ${d.message}`).join("\n"));

  const compiled = compileGraphToWorkflow(validGraph);
  const reviewStep = compiled.workflow.steps.find((s) => s.id === "review");
  assert.ok(reviewStep);
  assert.equal(reviewStep?.type, "review.media_approval");
  assert.equal(reviewStep?.with?.asset, "${steps.generate.outputs.images.0.localPath}");
  assert.equal(reviewStep?.with?.workflowDigest, "${steps.generate.outputs.workflowDigest}");
  assert.equal(reviewStep?.with?.storyboardItemId, "cover_1");
  assert.equal(reviewStep?.with?.seed, 42);

  const overlayStep = compiled.workflow.steps.find((s) => s.id === "overlay");
  assert.ok(overlayStep);
  assert.equal(overlayStep?.with?.asset, "${steps.review.outputs.approvedAsset}");

  // Fail closed validation on bad review config
  const badGraph = structuredClone(validGraph);
  const badReviewNode = badGraph.nodes.find((n) => n.id === "review")!;
  badReviewNode.config = { storyboardItemId: "invalid id with spaces!", sourceImage: "relative/source.jpg", prompt: "   ", seed: Number.MAX_SAFE_INTEGER + 1 };
  const badResult = validateGraphDefinition(badGraph);
  assert.equal(badResult.valid, false);
  const codes = badResult.diagnostics.map((d) => d.path);
  assert.ok(codes.some((p) => p.includes("storyboardItemId")));
  assert.ok(codes.some((p) => p.includes("sourceImage")));
  assert.ok(codes.some((p) => p.includes("prompt")));
  assert.ok(codes.some((p) => p.includes("seed")));
});

test("audio.loudness_qc requires all finite policy parameters without defaults", () => {
  const descriptor = nodeDescriptors.find((d) => d.type === "audio.loudness_qc");
  assert.ok(descriptor);
  assert.equal(descriptor.lifecycleStage, "export");
  assert.equal(descriptor.category, "audio");

  const validGraph = createGraphDefinition({
    graphId: "loudness_qc_graph",
    name: "Loudness QC Graph",
    nodes: [
      {
        id: "qc",
        type: "audio.loudness_qc",
        position: { x: 0, y: 0 },
        config: {
          source: "/tmp/master.wav",
          targetLufs: -23.0,
          toleranceLufs: 1.0,
          maxTruePeakDbfs: -1.0,
          silenceThresholdDbfs: -50.0,
          minSilenceMs: 1000,
          maxUnexpectedSilenceMs: 500
        }
      }
    ],
    edges: [],
    order: ["qc"]
  });

  const validRes = validateGraphDefinition(validGraph);
  assert.equal(validRes.valid, true, validRes.diagnostics.map((d) => d.message).join("\n"));

  // Incomplete / invalid policy configs
  const invalidConfigs = [
    { targetLufs: NaN, toleranceLufs: 1.0, maxTruePeakDbfs: -1.0, silenceThresholdDbfs: -50.0, minSilenceMs: 1000, maxUnexpectedSilenceMs: 500 },
    { targetLufs: -23.0, toleranceLufs: 0, maxTruePeakDbfs: -1.0, silenceThresholdDbfs: -50.0, minSilenceMs: 1000, maxUnexpectedSilenceMs: 500 },
    { targetLufs: -23.0, toleranceLufs: 1.0, maxTruePeakDbfs: Infinity, silenceThresholdDbfs: -50.0, minSilenceMs: 1000, maxUnexpectedSilenceMs: 500 },
    { targetLufs: -23.0, toleranceLufs: 1.0, maxTruePeakDbfs: -1.0, silenceThresholdDbfs: -50.0, minSilenceMs: 0, maxUnexpectedSilenceMs: 500 },
    { targetLufs: -23.0, toleranceLufs: 1.0, maxTruePeakDbfs: -1.0, silenceThresholdDbfs: -50.0, minSilenceMs: 1000, maxUnexpectedSilenceMs: -1 }
  ];

  for (const cfg of invalidConfigs) {
    const invalidGraph = structuredClone(validGraph);
    invalidGraph.nodes[0]!.config = cfg as any;
    const res = validateGraphDefinition(invalidGraph);
    assert.equal(res.valid, false, `Expected invalid for config ${JSON.stringify(cfg)}`);
  }
});
