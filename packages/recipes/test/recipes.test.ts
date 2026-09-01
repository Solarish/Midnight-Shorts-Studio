import assert from "node:assert/strict";
import test from "node:test";
import { validateGraphDefinition } from "@psu-ava/node-sdk";
import { compilePortraitStory, instantiateStarterWorkflowPackage, starterWorkflowPackages, validatePortraitStoryManifest } from "../src/index.ts";

const manifest = {
  manifestVersion: 1 as const,
  recipeId: "portrait-story-v1" as const,
  id: "demo-01",
  projectName: "Demo",
  presenterAsset: { assetId: "asset-1", projectPath: "assets/input/ui/demo.png", originalName: "demo.png", mimeType: "image/png", previewUrl: "/api/v1/assets/asset-1" },
  headline: "PSU BROADCAST",
  subheadline: "เรื่องเล่าจากมหาวิทยาลัย",
  backgroundBrief: "ห้องส่งข่าวร่วมสมัยบรรยากาศสงบ"
};

test("portrait story manifest compiles the fixed Remotion-powered workflow", () => {
  const result = compilePortraitStory(manifest);
  assert.equal(result.workflow.steps.length, 5);
  assert.equal(result.workflow.steps[0]?.type, "asset.select");
  assert.equal(result.workflow.steps[4]?.type, "remotion.render");
  assert.match(result.raw, /no people, no words, no logos/);
  assert.equal(result.digest.length, 64);
});

test("portrait story manifest rejects an absent presenter", () => {
  const errors = validatePortraitStoryManifest({ ...manifest, presenterAsset: undefined });
  assert.ok(errors.some((error) => error.field === "presenterAsset"));
});

test("portrait story manifest rejects a missing id before compilation", () => {
  const errors = validatePortraitStoryManifest({ ...manifest, id: undefined });
  assert.ok(errors.some((error) => error.field === "id"));
});

test("registered starter packages instantiate isolated production graphs", () => {
  assert.equal(starterWorkflowPackages.length, 9);
  assert.equal(starterWorkflowPackages[0]?.packageId, "ai-background-replacement-v1");
  assert.equal(starterWorkflowPackages[1]?.packageId, "ae-multilayer-transition-v1");
  assert.equal(starterWorkflowPackages[2]?.packageId, "multi-footage-assembly-v1");
  assert.equal(starterWorkflowPackages[3]?.packageId, "3d-photo-carousel-intro-v1");
  assert.equal(starterWorkflowPackages[3]?.version, 2);
  assert.equal(starterWorkflowPackages[4]?.packageId, "documentary-assembly-v1");

  const graph1 = instantiateStarterWorkflowPackage("ai-background-replacement-v1", { graphId: "starter_test1" });
  assert.equal(graph1.graphId, "starter_test1");
  assert.equal(graph1.profile.frameRate, 25);
  assert.ok(graph1.nodes.some((node) => node.type === "comfyui.workflow"));
  assert.ok(graph1.nodes.some((node) => node.type === "image.removeBackground"));
  assert.ok(graph1.nodes.some((node) => node.type === "image.resize"));
  assert.equal(graph1.nodes.find((node) => node.id === "overlay_presenter")?.config.audioPolicy, "mute");
  assert.equal(graph1.nodes.find((node) => node.id === "scene_background")?.config.audio, false);
  assert.equal(graph1.nodes.find((node) => node.id === "scene_background")?.config.audioPolicy, "mute");
  const validation1 = validateGraphDefinition(graph1);
  assert.equal(validation1.valid, true, validation1.diagnostics.map((d) => d.message).join("\n"));

  const graph2 = instantiateStarterWorkflowPackage("ae-multilayer-transition-v1", { graphId: "starter_test2" });
  assert.equal(graph2.graphId, "starter_test2");
  assert.ok(graph2.nodes.some((node) => node.type === "ae.template"));
  assert.ok(graph2.nodes.some((node) => node.type === "timeline.transition"));

  const graph3 = instantiateStarterWorkflowPackage("multi-footage-assembly-v1", { graphId: "starter_test3" });
  assert.equal(graph3.graphId, "starter_test3");
  assert.equal(graph3.nodes.filter((node) => node.type === "asset.select").length, 3);
  assert.equal(graph3.nodes.filter((node) => node.type === "timeline.scene").length, 3);
  assert.equal(graph3.nodes.filter((node) => node.type === "timeline.transition").length, 2);

  const graph4 = instantiateStarterWorkflowPackage("3d-photo-carousel-intro-v1", { graphId: "starter_test4" });
  assert.equal(graph4.graphId, "starter_test4");
  assert.equal(graph4.nodes.length, 6);
  assert.ok(graph4.nodes.some((node) => node.type === "effect.3d_carousel"));
  assert.ok(graph4.nodes.some((node) => node.type === "asset.multi_select"));
  assert.ok(graph4.nodes.some((node) => node.type === "premiere.build"));
  assert.ok(!graph4.nodes.some((node) => node.type === "ae.template"));
  assert.equal((graph4.nodes.find((node) => node.type === "effect.3d_carousel")?.config.timing as any)?.frameRate, 25);
  assert.equal(graph4.nodes.find((node) => node.type === "ae.render")?.config.output, "media/carousel-intro.mov");

  const graph5 = instantiateStarterWorkflowPackage("documentary-assembly-v1", { graphId: "starter_test5" });
  assert.equal(graph5.graphId, "starter_test5");
  assert.equal(graph5.nodes.length, 22);
  assert.equal(graph5.durationFrames, 11200);
  assert.ok(graph5.nodes.some((node) => node.type === "storyboard.docx_import"));
  assert.ok(graph5.nodes.some((node) => node.type === "media.catalog"));
  assert.ok(graph5.nodes.some((node) => node.type === "comfyui.workflow"));
  assert.ok(graph5.nodes.some((node) => node.type === "preview.media"));
  assert.ok(graph5.nodes.some((node) => node.type === "ae.channel_id_bumper"));
  assert.ok(graph5.nodes.some((node) => node.type === "edit.cutlist"));
  assert.ok(graph5.nodes.some((node) => node.type === "editor.broll_match"));
  assert.ok(graph5.nodes.some((node) => node.type === "ar.floating_slides_3d"));
  assert.ok(graph5.nodes.some((node) => node.type === "review.approval"));
  assert.ok(graph5.nodes.some((node) => node.type === "media.conform"));
  assert.ok(graph5.nodes.some((node) => node.type === "effect.cinematic_title"));
  assert.ok(graph5.nodes.some((node) => node.type === "timeline.broll_stack"));
  assert.ok(graph5.nodes.some((node) => node.type === "audio.dialogue_mix"));
  assert.ok(graph5.nodes.some((node) => node.type === "timeline.compose"));
  assert.ok(graph5.nodes.some((node) => node.type === "premiere.build"));
  assert.ok(graph5.nodes.some((node) => node.type === "premiere.export"));
  assert.ok(graph5.nodes.some((node) => node.type === "qc.timeline"));
});
