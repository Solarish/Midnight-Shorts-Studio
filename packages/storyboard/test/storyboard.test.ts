import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { StoryboardSpecV2 } from "@psu-ava/contracts";
import { compileGraphToWorkflow, validateGraphDefinition } from "@psu-ava/node-sdk";
import { buildCoverGenerationPrompt, compileApprovedStoryboard, compileStoryboardToRemotionProps, COVER_VISUAL_DIRECTION, createApprovedStoryboard, createStoryboardExecutionGraph, formatARollAuto, parseStoryboardXmlV2, validateStoryboardMedia, validateStoryboardSpec } from "../src/index.ts";

test("DOCX proposal parser keeps cover rows 3/5 separate from logo row 7", () => {
  const xml = documentXml([
    ["ภาพ", "เสียง"],
    ["สัมภาษณ์", "C7724 00:00-00:40 หนึ่ง 00:40-01:20 สอง"],
    ["สัมภาษณ์", "01:20-02:00 สาม"],
    ["ภาพปกคั่น Ref. YouTube", "02:00-02:40 สี่ 02:40-03:20 ห้า"],
    ["ภาพประกอบ", "03:20-04:00 หก 04:00-04:40 เจ็ด"],
    ["ภาพปกคั่น ความรู้สึกของนักศึกษา", "04:40-05:20 แปด 05:20-06:00 เก้า"],
    ["ภาพประกอบ", "06:00-06:40 สิบ 06:40-07:18 สิบเอ็ด"],
    ["Logo PSU พิชัยมงกุฏ Outro", "ท้ายรายการ"]
  ]);
  const parsed = parseStoryboardXmlV2(xml);
  const aRoll = parsed.proposals.filter((value) => value.item.kind === "a_roll");
  assert.equal(aRoll.length, 11);
  assert.equal(aRoll.reduce((sum, value) => sum + value.item.durationMs, 0), 438_000);
  assert.deepEqual(parsed.proposals.filter((value) => value.item.kind === "cover_card").map((value) => value.rowNumber), [3, 5]);
  assert.deepEqual(parsed.proposals.filter((value) => value.item.kind === "logo_outro").map((value) => value.rowNumber), [7]);
  assert.equal(parsed.proposals.filter((value) => value.item.kind === "cover_card").some((value) => /3d/i.test(String(value.item.params.prompt))), false);
});

test("approved storyboard compiles deterministically with complete provenance", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-storyboard-"));
  const media = await Promise.all(["interview.mov", "title.jpg", "cover.jpg", "logo.png", "broll.mov"].map(async (name) => { const target = path.join(root, name); await writeFile(target, name); return target; }));
  const storyboard: StoryboardSpecV2 = {
    schemaVersion: 2,
    storyboardId: "fixture",
    name: "Fixture documentary",
    revision: 3,
    profile: { width: 1920, height: 1080, frameRate: 25 },
    sourceImport: { importId: "import_fixture", docxPath: path.join(root, "story.docx"), sourceDigest: "abc", importedAt: "2026-08-29T00:00:00.000Z" },
    items: [
      { id: "title_1", kind: "title", durationMs: 4000, audioPolicy: "mute", presetId: "ae-3d-carousel-title-v1", params: { media: [media[1]], composition: "Main", texts: { title: "PSU" } } },
      { id: "interview_1", kind: "a_roll", durationMs: 4000, audioPolicy: "preserve", presetId: "a-roll-segment-v1", params: { sourceKey: "C7724", sourcePath: media[0], sourceInMs: 0, sourceOutMs: 4000, dialogue: "dialogue" }, broll: [{ id: "broll_1", asset: { path: media[4]! }, offsetMs: 0, durationMs: 2000, audioPolicy: "mute" }] },
      { id: "cover_1", kind: "cover_card", durationMs: 4000, audioPolicy: "mute", presetId: "comfy-cover-card-v1", params: { sourceImage: media[2], prompt: "academic portrait", title: "Cover", seed: 1 } },
      { id: "logo_1", kind: "logo_outro", durationMs: 4000, audioPolicy: "mute", presetId: "logo-outro-v1", params: { sourcePath: media[3] } }
    ]
  };
  assert.deepEqual(validateStoryboardSpec(storyboard), []);
  assert.deepEqual(await validateStoryboardMedia(storyboard), []);
  const approved = createApprovedStoryboard(storyboard, 1, "2026-08-29T01:00:00.000Z");
  const first = compileApprovedStoryboard(approved);
  const second = compileApprovedStoryboard(approved);
  assert.deepEqual(first, second);
  assert.equal(first.timeline.durationMs, 16_000);
  assert.equal(first.timeline.items.find((value) => value.kind === "b_roll")?.audioPolicy, "mute");

  // Dynamic Link Title wiring assertions
  const dlNode = first.graph.nodes.find((value) => value.type === "timeline.graphic_overlay");
  assert.ok(dlNode);
  assert.equal(dlNode?.id, "sb_title_1__graphic_overlay");
  assert.deepEqual(dlNode?.config, {
    id: "title_1",
    startMs: 0,
    durationMs: 4000,
    track: 3,
    composition: "Main",
    audioPolicy: "mute",
    storyboardItemId: "title_1",
    editorialKind: "title"
  });
  const carouselToDlEdge = first.graph.edges.find((e) => e.to.nodeId === "sb_title_1__graphic_overlay");
  assert.ok(carouselToDlEdge);
  assert.equal(carouselToDlEdge?.from.nodeId, "sb_title_1__carousel");
  assert.equal(carouselToDlEdge?.from.port, "graphic");
  assert.equal(carouselToDlEdge?.to.port, "graphic");

  const dlToComposeEdge = first.graph.edges.find((e) => e.from.nodeId === "sb_title_1__graphic_overlay");
  assert.ok(dlToComposeEdge);
  assert.equal(dlToComposeEdge?.from.port, "overlay");
  assert.equal(dlToComposeEdge?.to.nodeId, "sb_timeline__compose");
  assert.equal(dlToComposeEdge?.to.port, "overlays");

  // Milestone P5: A-roll wiring & config assertions
  assert.equal(first.graph.nodes.some((node) => node.type === "media.conform"), false);
  const aRollScene = first.graph.nodes.find((node) => node.id === "sb_interview_1__scene");
  assert.ok(aRollScene);
  assert.equal(aRollScene?.type, "timeline.scene");
  assert.deepEqual(aRollScene?.config, {
    startMs: 4000,
    durationMs: 4000,
    sourceInMs: 0,
    track: 1,
    audio: true,
    audioPolicy: "preserve",
    storyboardItemId: "interview_1",
    editorialKind: "a_roll"
  });
  const aRollEdge = first.graph.edges.find((e) => e.to.nodeId === "sb_interview_1__scene" && e.to.port === "source");
  assert.ok(aRollEdge);
  assert.equal(aRollEdge?.from.nodeId, "sb_interview_1__source");
  assert.equal(aRollEdge?.from.port, "path");

  // Milestone P5: B-roll wiring assertions (asset.select.path -> timeline.overlay.asset)
  const brollEdge = first.graph.edges.find((e) => e.to.nodeId === "sb_interview_1__broll_1" && e.to.port === "asset");
  assert.ok(brollEdge);
  assert.equal(brollEdge?.from.nodeId, "sb_interview_1__broll_1_asset");
  assert.equal(brollEdge?.from.port, "path");

  // Milestone P5: Logo outro wiring & config assertions (asset.select.path -> timeline.scene.source)
  const logoScene = first.graph.nodes.find((node) => node.id === "sb_logo_1__scene");
  assert.ok(logoScene);
  assert.equal(logoScene?.type, "timeline.scene");
  assert.deepEqual(logoScene?.config, {
    startMs: 12000,
    durationMs: 4000,
    sourceInMs: 0,
    track: 1,
    audio: false,
    audioPolicy: "mute",
    storyboardItemId: "logo_1",
    editorialKind: "logo_outro"
  });
  const logoEdge = first.graph.edges.find((e) => e.to.nodeId === "sb_logo_1__scene" && e.to.port === "source");
  assert.ok(logoEdge);
  assert.equal(logoEdge?.from.nodeId, "sb_logo_1__source");
  assert.equal(logoEdge?.from.port, "path");

  const logoToComposeEdge = first.graph.edges.find((e) => e.from.nodeId === "sb_logo_1__scene");
  assert.ok(logoToComposeEdge);
  assert.equal(logoToComposeEdge?.from.port, "scene");
  assert.equal(logoToComposeEdge?.to.nodeId, "sb_timeline__compose");
  assert.equal(logoToComposeEdge?.to.port, "scenes");

  // Milestone P6E: Cover card wiring, config & provenance assertions (with Apple Vision cutout)
  const coverSource = first.graph.nodes.find((node) => node.id === "sb_cover_1__source");
  assert.ok(coverSource);
  assert.equal(coverSource?.type, "asset.select");
  assert.deepEqual(coverSource?.config, { path: media[2] });

  const coverCutout = first.graph.nodes.find((node) => node.id === "sb_cover_1__cutout");
  assert.ok(coverCutout);
  assert.equal(coverCutout?.type, "image.removeBackground");
  assert.deepEqual(coverCutout?.config, {
    path: media[2],
    output: "media/storyboard-covers/cover_1/cutout.png"
  });

  const coverGen = first.graph.nodes.find((node) => node.id === "sb_cover_1__generate");
  assert.ok(coverGen);
  assert.equal(coverGen?.type, "comfyui.workflow");
  assert.deepEqual(coverGen?.config, {
    workflowFile: "workflows/generate-cover-zimage.api.json",
    uploads: [{
      patch: "10.inputs.image",
      subfolder: "psu-ava/storyboard-covers/cover_1",
      overwrite: true
    }],
    patches: {
      "6.inputs.text": buildCoverGenerationPrompt("academic portrait"),
      "3.inputs.seed": 1
    },
    width: 1344,
    height: 768,
    downloadDir: "media/storyboard-covers/cover_1"
  });
  assert.equal(coverGen?.config.patches["6.inputs.text"], buildCoverGenerationPrompt("academic portrait"));
  assert.equal(String(coverGen?.config.patches["6.inputs.text"]).includes("academic portrait"), true, "Short user direction must be included in the background template prompt");

  const coverTitle = first.graph.nodes.find((node) => node.id === "sb_cover_1__title_card");
  assert.ok(coverTitle);
  assert.equal(coverTitle?.type, "graphics.cover_title");
  assert.deepEqual(coverTitle?.config, {
    output: "media/storyboard-covers/cover_1/final-titled-cover.png",
    eyebrow: "อาจารย์ตัวอย่างดีเด่น · ประจำปี 2569",
    title: "Cover",
    subtitle: "มหาวิทยาลัยสงขลานครินทร์"
  });

  const coverReview = first.graph.nodes.find((node) => node.id === "sb_cover_1__review");
  assert.ok(coverReview);
  assert.equal(coverReview?.type, "review.media_approval");
  assert.deepEqual(coverReview?.config, {
    storyboardItemId: "cover_1",
    sourceImage: media[2],
    prompt: "academic portrait",
    seed: 1,
    title: "Cover"
  });
  assert.equal(coverReview?.config.prompt, "academic portrait", "Review evidence prompt must remain exactly the raw StoryboardSpec prompt");

  const coverOverlay = first.graph.nodes.find((node) => node.id === "sb_cover_1__placement");
  assert.ok(coverOverlay);
  assert.equal(coverOverlay?.type, "timeline.overlay");
  assert.deepEqual(coverOverlay?.config, {
    startMs: 8000,
    durationMs: 4000,
    track: 2,
    audioPolicy: "mute",
    fit: "cover",
    storyboardItemId: "cover_1",
    editorialKind: "cover_card",
    title: "Cover"
  });

  // Cover edges: source -> cutout -> generate -> title compositor -> review -> placement -> compose
  const sourceToCutoutEdge = first.graph.edges.find((e) => e.from.nodeId === "sb_cover_1__source" && e.to.nodeId === "sb_cover_1__cutout");
  assert.ok(sourceToCutoutEdge);
  assert.equal(sourceToCutoutEdge?.from.port, "path");
  assert.equal(sourceToCutoutEdge?.to.port, "image");

  const cutoutToGenEdge = first.graph.edges.find((e) => e.from.nodeId === "sb_cover_1__cutout" && e.to.nodeId === "sb_cover_1__generate");
  assert.ok(cutoutToGenEdge);
  assert.equal(cutoutToGenEdge?.from.port, "image");
  assert.equal(cutoutToGenEdge?.to.port, "image");

  const genToTitleEdge = first.graph.edges.find((e) => e.from.nodeId === "sb_cover_1__generate" && e.to.nodeId === "sb_cover_1__title_card" && e.to.port === "image");
  assert.ok(genToTitleEdge);
  assert.equal(genToTitleEdge?.from.port, "image");

  const titleToReviewImageEdge = first.graph.edges.find((e) => e.from.nodeId === "sb_cover_1__title_card" && e.to.nodeId === "sb_cover_1__review" && e.to.port === "asset");
  assert.ok(titleToReviewImageEdge);
  assert.equal(titleToReviewImageEdge?.from.port, "image");

  const genToReviewDigestEdge = first.graph.edges.find((e) => e.from.nodeId === "sb_cover_1__generate" && e.to.nodeId === "sb_cover_1__review" && e.to.port === "workflowDigest");
  assert.ok(genToReviewDigestEdge);
  assert.equal(genToReviewDigestEdge?.from.port, "workflowDigest");

  const reviewToOverlayEdge = first.graph.edges.find((e) => e.from.nodeId === "sb_cover_1__review" && e.to.nodeId === "sb_cover_1__placement");
  assert.ok(reviewToOverlayEdge);
  assert.equal(reviewToOverlayEdge?.from.port, "approvedAsset");
  assert.equal(reviewToOverlayEdge?.to.port, "asset");

  const overlayToComposeEdge = first.graph.edges.find((e) => e.from.nodeId === "sb_cover_1__placement");
  assert.ok(overlayToComposeEdge);
  assert.equal(overlayToComposeEdge?.from.port, "overlay");
  assert.equal(overlayToComposeEdge?.to.nodeId, "sb_timeline__compose");
  assert.equal(overlayToComposeEdge?.to.port, "overlays");

  // Milestone P6A: Full fixture graph now validates with ZERO node-sdk diagnostics
  const fullValidation = validateGraphDefinition(first.graph);
  assert.equal(fullValidation.valid, true, `Expected valid graph but received diagnostics: ${JSON.stringify(fullValidation.diagnostics, null, 2)}`);
  assert.deepEqual(fullValidation.diagnostics, []);

  // Timeline summary remains the exact editorial contract after macro expansion.
  assert.equal(first.timeline.items.find((item) => item.itemId === "title_1")?.track, 3);
  assert.equal(first.timeline.items.find((item) => item.itemId === "interview_1")?.track, 1);
  assert.equal(first.timeline.items.find((item) => item.itemId === "cover_1")?.track, 2);
  assert.equal(first.timeline.items.find((item) => item.itemId === "logo_1")?.track, 1);
  assert.equal(first.timeline.items.find((item) => item.itemId === "broll_1")?.track, 2);
  assert.equal(first.timeline.items.find((item) => item.itemId === "title_1")?.audioPolicy, "mute");
  assert.equal(first.timeline.items.find((item) => item.itemId === "interview_1")?.audioPolicy, "preserve");
  assert.equal(first.timeline.items.find((item) => item.itemId === "cover_1")?.audioPolicy, "mute");
  assert.equal(first.timeline.items.find((item) => item.itemId === "logo_1")?.audioPolicy, "mute");
  assert.equal(first.timeline.items.find((item) => item.itemId === "broll_1")?.audioPolicy, "mute");

  assert.ok(first.graph.nodes.every((value) => Boolean(first.provenance[value.id])));

  const immutablePreview = structuredClone(first);
  const execution = createStoryboardExecutionGraph(first, {
    outputProject: "outputs/premiere/fixture.prproj",
    sequenceName: "FIXTURE_MASTER",
    sequencePresetPath: "/Applications/Fixture/1080p25.sqpreset",
    afterEffects: {
      applicationId: "com.adobe.AfterEffectsBeta.application",
      aerenderPath: "/Applications/Adobe After Effects (Beta)/aerender"
    },
    h264: { output: "outputs/exports/fixture-premiere.mp4", normalizedOutput: "outputs/exports/fixture.mp4", presetPath: "/Applications/Fixture/h264.epr" },
    prores: { output: "outputs/exports/fixture.mov", presetPath: "/Applications/Fixture/prores.epr" },
    audioQc: {
      targetLufs: -23,
      toleranceLufs: 2,
      maxTruePeakDbfs: -1,
      silenceThresholdDbfs: -50,
      minSilenceMs: 1000,
      maxUnexpectedSilenceMs: 1500
    }
  });
  assert.deepEqual(first, immutablePreview, "execution materialization must not mutate the immutable compilation");
  assert.equal(execution.settings?.executable, true);
  assert.equal(execution.lineage?.sourceDigest, first.graphDigest);
  const executionValidation = validateGraphDefinition(execution);
  assert.equal(executionValidation.valid, true, JSON.stringify(executionValidation.diagnostics, null, 2));
  const compiledExecution = compileGraphToWorkflow(execution);
  assert.deepEqual(compiledExecution.workflow.steps.slice(-5).map((step) => step.type), [
    "premiere.build", "premiere.export", "media.audio_normalize", "audio.loudness_qc", "qc.timeline"
  ]);
  assert.equal(compiledExecution.workflow.steps.at(-2)?.with.source, "${steps.sb_output__audio_normalize.outputs.media}");
  assert.equal(compiledExecution.workflow.steps.at(-3)?.with.source, "${steps.sb_output__premiere_export.outputs.exports.0.output}");
  assert.equal(compiledExecution.workflow.steps.at(-2)?.with.timelineSpec, "${steps.sb_timeline__compose.outputs.timelineSpec}");
  assert.equal(compiledExecution.workflow.settings.adobe.afterEffects.aerenderPath, "/Applications/Adobe After Effects (Beta)/aerender");
  assert.equal(compiledExecution.workflow.settings.adobe.afterEffects.applicationId, "com.adobe.AfterEffectsBeta.application");
  assert.equal(compiledExecution.workflow.settings.adobe.premiere.requiredVersion, "26.5.0");

  const tampered = structuredClone(first);
  tampered.graph.name = "tampered";
  assert.throws(() => createStoryboardExecutionGraph(tampered, {
    outputProject: "outputs/premiere/fixture.prproj",
    sequenceName: "FIXTURE_MASTER",
    sequencePresetPath: "/Applications/Fixture/1080p25.sqpreset",
    h264: { output: "outputs/exports/fixture-premiere.mp4", normalizedOutput: "outputs/exports/fixture.mp4", presetPath: "/Applications/Fixture/h264.epr" },
    prores: { output: "outputs/exports/fixture.mov", presetPath: "/Applications/Fixture/prores.epr" },
    audioQc: { targetLufs: -23, toleranceLufs: 2, maxTruePeakDbfs: -1, silenceThresholdDbfs: -50, minSilenceMs: 1000, maxUnexpectedSilenceMs: 1500 }
  }), /digest mismatch/);
  await rm(root, { recursive: true, force: true });
});

test("layered cover v2 compiles exact Remotion layers and omits or includes doodle deterministically", () => {
  const cover = {
    id: "cover_v2", kind: "cover_card" as const, durationMs: 4000, audioPolicy: "mute" as const, presetId: "comfy-cover-card-v2",
    params: { sourceImage: "/media/person.jpg", prompt: "Elegant empty university documentary background with navy and warm gold lighting, no people, no text", personName: "สมชาย", positionTitle: "ศาสตราจารย์", award: "รางวัลดีเด่น", seed: 7, doodleEnabled: false, personX: 0.72, personY: 0.5, personScale: 1.1 }
  };
  const storyboard: StoryboardSpecV2 = {
    schemaVersion: 2, storyboardId: "cover-v2", name: "Cover v2", revision: 1,
    profile: { width: 1920, height: 1080, frameRate: 25 },
    sourceImport: { importId: "cover_import", docxPath: "/story.docx", sourceDigest: "digest", importedAt: "2026-08-31T00:00:00.000Z" },
    items: [{ id: "scene", kind: "a_roll", durationMs: 4000, audioPolicy: "preserve", presetId: "a-roll-segment-v1", params: { sourceKey: "A", sourcePath: "/media/a.mov", sourceInMs: 0, sourceOutMs: 4000 } }, cover]
  };
  assert.deepEqual(validateStoryboardSpec(storyboard), []);
  const off = compileApprovedStoryboard(createApprovedStoryboard(storyboard, 1, "2026-08-31T00:00:00.000Z"));
  assert.equal(off.graph.nodes.some((node) => node.id === "sb_cover_v2__doodle_v2"), false);
  const track = (role: string) => Number(off.graph.nodes.find((node) => node.id === `sb_cover_v2__${role}`)?.config.track);
  assert.deepEqual([track("background_v1"), track("person_v3"), track("text_v4")], [1, 3, 4]);
  assert.ok(off.graph.edges.some((edge) => edge.from.nodeId === "sb_cover_v2__source" && edge.to.nodeId === "sb_cover_v2__cutout" && edge.to.port === "image"));
  assert.equal(off.graph.edges.some((edge) => edge.from.nodeId === "sb_cover_v2__cutout" && edge.to.nodeId === "sb_cover_v2__generate_bg" && edge.to.port === "image"), false);
  assert.ok(off.graph.edges.some((edge) => edge.from.nodeId === "sb_cover_v2__cutout" && edge.to.nodeId === "sb_cover_v2__person_v3" && edge.to.port === "asset"));
  const textEdge = off.graph.edges.find((edge) => edge.from.nodeId === "sb_cover_v2__text_v4");
  assert.equal(textEdge?.from.port, "overlay");
  assert.equal(textEdge?.to.nodeId, "sb_timeline__compose");
  assert.equal(textEdge?.to.port, "overlays");
  assert.equal(off.graph.nodes.some((node) => node.type === "llm.chat"), false);
  const graphic = off.graph.nodes.find((node) => node.id === "sb_cover_v2__text_v4");
  assert.equal(graphic?.type, "timeline.graphic_overlay");
  assert.equal((graphic?.config.graphic as Record<string, unknown>)?.renderer, "remotion");
  assert.equal((graphic?.config.graphic as Record<string, unknown>)?.presetId, "cover-card-v2");

  const executable = compileGraphToWorkflow(off.graph).workflow;
  const comfyStep = executable.steps.find((step) => step.id === "sb_cover_v2__generate_bg");
  assert.equal(comfyStep?.with.promptPatch, "6.inputs.text");
  assert.equal(comfyStep?.with.patches["6.inputs.text"], buildCoverGenerationPrompt("Elegant empty university documentary background with navy and warm gold lighting, no people, no text"));

  const withDoodle: StoryboardSpecV2 = structuredClone(storyboard);
  (withDoodle.items[1]!.params as Record<string, unknown>).doodleEnabled = true;
  (withDoodle.items[1]!.params as Record<string, unknown>).doodlePrompt = "ลายเส้นวิทยาศาสตร์";
  const on = compileApprovedStoryboard(createApprovedStoryboard(withDoodle, 2, "2026-08-31T00:00:00.000Z"));
  assert.equal(Number(on.graph.nodes.find((node) => node.id === "sb_cover_v2__doodle_v2")?.config.track), 2);
  assert.equal(on.graph.nodes.find((node) => node.id === "sb_cover_v2__doodle_alpha")?.type, "image.luma_to_alpha");
  assert.equal(on.graph.edges.find((edge) => edge.from.nodeId === "sb_cover_v2__doodle_v2")?.to.port, "overlays");
  assert.deepEqual(on, compileApprovedStoryboard(createApprovedStoryboard(withDoodle, 2, "2026-08-31T00:00:00.000Z")));
});

test("cover v2 accepts prompt parts and never uploads person input as background reference", () => {
  const cover = {
    id: "cover_contract", kind: "cover_card" as const, durationMs: 4000, audioPolicy: "mute" as const, presetId: "comfy-cover-card-v2",
    params: { sourceImage: "/media/person.jpg", promptParts: { place: "laboratory", style: "documentary" }, personName: "สมชาย", positionTitle: "ศาสตราจารย์", award: "รางวัลดีเด่น", seed: 7 }
  };
  const storyboard = {
    schemaVersion: 2, storyboardId: "cover-contract", name: "Cover contract", revision: 1,
    profile: { width: 1920, height: 1080, frameRate: 25 },
    sourceImport: { importId: "cover_import", docxPath: "/story.docx", sourceDigest: "digest", importedAt: "2026-08-31T00:00:00.000Z" },
    items: [{ id: "scene", kind: "a_roll", durationMs: 4000, audioPolicy: "preserve", presetId: "a-roll-segment-v1", params: { sourceKey: "A", sourcePath: "/media/a.mov", sourceInMs: 0, sourceOutMs: 4000 } }, cover]
  } as StoryboardSpecV2;
  assert.deepEqual(validateStoryboardSpec(storyboard), []);
  const compiled = compileGraphToWorkflow(compileApprovedStoryboard(createApprovedStoryboard(storyboard, 1)).graph).workflow;
  const background = compiled.steps.find((step) => step.id === "sb_cover_contract__generate_bg");
  assert.equal(background?.with.uploads, undefined);
});

test("canonical documentary without cover_card compiles to graph with zero diagnostics", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-storyboard-clean-"));
  const media = await Promise.all(["interview.mov", "title.jpg", "logo.png", "broll.mov"].map(async (name) => {
    const target = path.join(root, name);
    await writeFile(target, name);
    return target;
  }));
  const storyboard: StoryboardSpecV2 = {
    schemaVersion: 2,
    storyboardId: "clean_doc",
    name: "Clean Documentary",
    revision: 1,
    profile: { width: 1920, height: 1080, frameRate: 25 },
    sourceImport: {
      importId: "import_clean",
      docxPath: path.join(root, "clean.docx"),
      sourceDigest: "clean_digest",
      importedAt: "2026-08-29T00:00:00.000Z"
    },
    items: [
      {
        id: "title_1",
        kind: "title",
        durationMs: 4000,
        audioPolicy: "mute",
        presetId: "ae-3d-carousel-title-v1",
        params: { media: [media[1]], composition: "Main", texts: { title: "Title" } }
      },
      {
        id: "interview_1",
        kind: "a_roll",
        durationMs: 4000,
        audioPolicy: "preserve",
        presetId: "a-roll-segment-v1",
        params: {
          sourceKey: "C7724",
          sourcePath: media[0],
          sourceInMs: 2000,
          sourceOutMs: 6000,
          dialogue: "Dialogue"
        },
        broll: [
          { id: "broll_1", asset: { path: media[3]! }, offsetMs: 1000, durationMs: 2000, audioPolicy: "mute" }
        ]
      },
      {
        id: "logo_1",
        kind: "logo_outro",
        durationMs: 4000,
        audioPolicy: "mute",
        presetId: "logo-outro-v1",
        params: { sourcePath: media[2] }
      }
    ]
  };
  assert.deepEqual(validateStoryboardSpec(storyboard), []);
  assert.deepEqual(await validateStoryboardMedia(storyboard), []);
  const approved = createApprovedStoryboard(storyboard, 1, "2026-08-29T01:00:00.000Z");
  const compilation = compileApprovedStoryboard(approved);

  // Validate with node-sdk
  const validation = validateGraphDefinition(compilation.graph);
  assert.equal(validation.valid, true, `Expected valid graph but received diagnostics: ${JSON.stringify(validation.diagnostics, null, 2)}`);
  assert.deepEqual(validation.diagnostics, []);

  // Assert node and edge counts and structure
  assert.equal(compilation.graph.nodes.some((n) => n.type === "media.conform"), false);
  const aRollScene = compilation.graph.nodes.find((n) => n.id === "sb_interview_1__scene");
  assert.ok(aRollScene);
  assert.deepEqual(aRollScene?.config, {
    startMs: 4000,
    durationMs: 4000,
    sourceInMs: 2000,
    track: 1,
    audio: true,
    audioPolicy: "preserve",
    storyboardItemId: "interview_1",
    editorialKind: "a_roll"
  });
  const logoScene = compilation.graph.nodes.find((n) => n.id === "sb_logo_1__scene");
  assert.ok(logoScene);
  assert.deepEqual(logoScene?.config, {
    startMs: 8000,
    durationMs: 4000,
    sourceInMs: 0,
    track: 1,
    audio: false,
    audioPolicy: "mute",
    storyboardItemId: "logo_1",
    editorialKind: "logo_outro"
  });

  await rm(root, { recursive: true, force: true });
});

test("audio policies and off-frame timing are blocking", () => {
  const value = {
    schemaVersion: 2,
    storyboardId: "invalid",
    name: "Invalid",
    revision: 1,
    profile: { width: 1920, height: 1080, frameRate: 25 },
    sourceImport: { importId: "import_invalid", docxPath: "/tmp/a.docx", sourceDigest: "x", importedAt: "now" },
    items: [{ id: "cover", kind: "cover_card", durationMs: 6010, audioPolicy: "preserve", presetId: "comfy-cover-card-v1", params: { sourceImage: "", prompt: "" } }]
  } as StoryboardSpecV2;
  const codes = validateStoryboardSpec(value).map((item) => item.code);
  assert.ok(codes.includes("off_frame_duration"));
  assert.ok(codes.includes("invalid_audio_policy"));
  assert.ok(codes.includes("missing_media"));
});

test("validates and compiles cinematic title presets (parallax and split dynamic)", () => {
  const validParallax: StoryboardSpecV2 = {
    schemaVersion: 2,
    storyboardId: "parallax_doc",
    name: "Parallax Documentary",
    revision: 1,
    profile: { width: 1920, height: 1080, frameRate: 25 },
    sourceImport: { importId: "imp_1", docxPath: "/tmp/story.docx", sourceDigest: "d1", importedAt: "2026-09-02T00:00:00.000Z" },
    items: [
      {
        id: "title_parallax",
        kind: "title",
        durationMs: 8000,
        audioPolicy: "mute",
        presetId: "title-parallax-cinema-v1",
        params: {
          media: ["/tmp/hero.jpg", "/tmp/bg.jpg"],
          title: "Cinematic Parallax",
          subtitle: "Prince of Songkla University"
        }
      }
    ]
  };

  const diagnostics = validateStoryboardSpec(validParallax);
  assert.deepEqual(diagnostics, []);

  const remotionProps = compileStoryboardToRemotionProps(validParallax, { aspectRatio: "16:9" });
  assert.equal(remotionProps.items[0]?.presetId, "title-parallax-cinema-v1");
  assert.equal(remotionProps.items[0]?.params?.title, "Cinematic Parallax");
  assert.equal(remotionProps.durationInFrames, 200);

  // Missing media blocker check for split dynamic
  const invalidSplit: StoryboardSpecV2 = {
    ...validParallax,
    items: [
      {
        id: "title_split",
        kind: "title",
        durationMs: 6000,
        audioPolicy: "mute",
        presetId: "title-split-dynamic-v1",
        params: {
          media: [],
          title: "High Energy Split"
        }
      }
    ]
  };

  const splitDiagnostics = validateStoryboardSpec(invalidSplit);
  assert.ok(splitDiagnostics.some((d) => d.code === "missing_media" && d.itemId === "title_split"));
});

test("formatARollAuto injects PSU Royal Gold Glass Beacon lower-third from speaker or presenter", () => {
  const rawARoll = {
    id: "interview_01",
    kind: "a_roll",
    durationMs: 8000,
    audioPolicy: "preserve",
    params: {
      sourceKey: "C7724",
      sourcePath: "/Volumes/footage/C7724.mp4",
      speaker: "รศ.ดร.ทันตแพทย์หญิง เกวลิน ธรรมสิทธิ์บูรณ์",
      dialogue: "ยินดีต้อนรับทุกท่านสู่คณะทันตแพทยศาสตร์"
    }
  };

  const projectContext = {
    projectDir: "/Volumes/kewalin",
    docxPath: "/Volumes/kewalin/story.docx",
    brollPoolDirs: [],
    photoDirs: [],
    candidateBrolls: [],
    portraitImages: [],
    presenter: {
      name: "รศ.ดร.ทันตแพทย์หญิง เกวลิน ธรรมสิทธิ์บูรณ์",
      position: "รองผู้อำนวยการฝ่ายวิชาการและวิจัย",
      department: "คณะทันตแพทยศาสตร์ ม.อ."
    }
  };

  const formatted = formatARollAuto(rawARoll, projectContext);
  assert.equal(formatted.params.lowerThird.enabled, true);
  assert.equal(formatted.params.lowerThird.presetId, "lowerthird-glass-beacon-v1");
  assert.equal(formatted.params.lowerThird.name, "รศ.ดร.ทันตแพทย์หญิง เกวลิน ธรรมสิทธิ์บูรณ์");
  assert.equal(formatted.params.lowerThird.title, "รองผู้อำนวยการฝ่ายวิชาการและวิจัย");
  assert.equal(formatted.params.lowerThird.department, "คณะทันตแพทยศาสตร์ ม.อ.");
  assert.equal(formatted.params.lowerThird.offsetMs, 500);
});

function documentXml(rows: string[][]) {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<w:document><w:body><w:tbl>${rows.map((cells) => `<w:tr>${cells.map((value) => `<w:tc><w:p><w:r><w:t>${escape(value)}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`).join("")}</w:tbl></w:body></w:document>`;
}
