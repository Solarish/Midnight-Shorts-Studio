import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifyGraphWorkflow } from "../src/core/workflow-verifier.js";

test("graph verifier accepts canonical timeline, audio, project and sequential exports", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-graph-evidence-"));
  const wav = path.join(runDir, "mix.wav");
  const project = path.join(runDir, "output.prproj");
  const h264 = path.join(runDir, "output.mp4");
  const prores = path.join(runDir, "output.mov");
  await writeFile(wav, Buffer.alloc(64, 1));
  await writeFile(project, Buffer.alloc(64, 2));
  await writeFile(h264, Buffer.alloc(2_048, 3));
  await writeFile(prores, Buffer.alloc(2_048, 4));
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  const workflow = { id: "graph", steps: [
    { id: "mix", type: "audio.mix" },
    { id: "timeline", type: "timeline.compose" },
    { id: "build", type: "premiere.build" },
    { id: "export", type: "premiere.export" }
  ] };
  const times = [0, 2, 4, 6].map((value) => ({ startedAt: new Date(1_000 + value).toISOString(), finishedAt: new Date(1_001 + value).toISOString() }));
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({ workflowId: "graph", dryRun: false, status: "success", steps: {
    mix: { status: "success", ...times[0], outputs: { audio: { id: "mix", path: wav, role: "music", startMs: 0, gainDb: 0 } } },
    timeline: { status: "success", ...times[1], outputs: { timelineSpec: { schemaVersion: 1, name: "MAIN", width: 1080, height: 1920, frameRate: 25, durationMs: 1000, scenes: [{ id: "scene", source: "/tmp/a.mov", startMs: 0, durationMs: 1000, track: 1, audio: true, audioPolicy: "preserve" }], audio: [{ id: "mix", path: wav, startMs: 0 }] } } },
    build: { status: "success", ...times[2], outputs: { project, sequenceName: "MAIN", sequenceGuid: "guid", scenes: [{ id: "scene", source: "/tmp/a.mov", startMs: 0, sourceInMs: 0, durationMs: 1000, videoTrack: 1, audioPolicy: "preserve", audioTrack: 1, audioInserted: true }], audio: [{ id: "mix", path: wav, startMs: 0, audioTrack: 1, audioInserted: true }] } },
    export: { status: "success", ...times[3], outputs: { exports: [
      { format: "h264", output: h264, sha256: digest(Buffer.alloc(2_048, 3)), startedAt: new Date(2000).toISOString(), finishedAt: new Date(3000).toISOString() },
      { format: "prores", output: prores, sha256: digest(Buffer.alloc(2_048, 4)), startedAt: new Date(3000).toISOString(), finishedAt: new Date(4000).toISOString() }
    ] } }
  }}));
  const probeMedia = async (filePath) => ({ format: { duration: "1" }, streams: [
    { codec_type: "video", codec_name: filePath.endsWith(".mp4") ? "h264" : "prores_ks", width: 1080, height: 1920, avg_frame_rate: "25/1", duration: "1" },
    { codec_type: "audio", codec_name: "aac" }
  ] });
  const result = await verifyGraphWorkflow(runDir, workflow, { probeMedia });
  assert.equal(result.ok, true, result.checks.filter((check) => !check.ok).map((check) => `${check.id}: ${check.detail}`).join("\n"));
});

test("graph verifier rejects missing export evidence", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-graph-evidence-missing-"));
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({ workflowId: "graph", dryRun: false, status: "success", steps: { export: { status: "success", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), outputs: { exports: [] } } } }));
  const result = await verifyGraphWorkflow(runDir, { id: "graph", steps: [{ id: "export", type: "premiere.export" }] }, { probeMedia: async () => ({}) });
  assert.equal(result.ok, false);
  assert.equal(result.checks.some((check) => check.id.endsWith("h264.receipt") && !check.ok), true);
});

test("graph verifier accepts a workflow that explicitly requests only H264", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-graph-evidence-h264-only-"));
  const h264 = path.join(runDir, "output.mp4");
  const payload = Buffer.alloc(2_048, 5);
  await writeFile(h264, payload);
  const now = new Date().toISOString();
  const workflow = { id: "graph", steps: [
    { id: "export", type: "premiere.export", with: { exports: [{ format: "h264", output: "output.mp4" }] } }
  ] };
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "graph",
    dryRun: false,
    status: "success",
    steps: {
      export: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: { exports: [{ format: "h264", output: h264, sha256: createHash("sha256").update(payload).digest("hex"), startedAt: now, finishedAt: now }] }
      }
    }
  }));

  const result = await verifyGraphWorkflow(runDir, workflow, {
    probeMedia: async () => ({
      format: { duration: "1" },
      streams: [{ codec_type: "video", codec_name: "h264", width: 1920, height: 1080, avg_frame_rate: "25/1", duration: "1" }]
    })
  });

  assert.equal(result.ok, true, result.checks.filter((check) => !check.ok).map((check) => `${check.id}: ${check.detail}`).join("\n"));
  assert.equal(result.checks.some((check) => check.id.endsWith("prores.receipt")), false);
  assert.equal(result.checks.find((check) => check.id.endsWith("sequential_exports"))?.ok, true);
});

test("graph verifier rejects a carousel master whose ffprobe duration and fps miss the declared output spec", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-carousel-evidence-mismatch-"));
  const project = path.join(runDir, "carousel.aep");
  const render = path.join(runDir, "carousel.mov");
  await writeFile(project, Buffer.alloc(2_048, 1));
  await writeFile(render, Buffer.alloc(2_048, 2));
  const workflow = { id: "carousel", steps: [
    { id: "effect", type: "effect.3d_carousel", with: { timing: { durationSeconds: 15, frameRate: 25 } } },
    { id: "render", type: "ae.render" },
    { id: "timeline", type: "timeline.compose" }
  ] };
  const now = new Date().toISOString();
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "carousel",
    dryRun: false,
    status: "success",
    steps: {
      effect: { status: "success", startedAt: now, finishedAt: now, outputs: { project, hostResult: { ok: true, stage: "complete" } } },
      render: { status: "success", startedAt: now, finishedAt: now, outputs: { project, output: render } },
      timeline: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: { schemaVersion: 1, name: "MAIN", frameRate: 25, durationMs: 15000, scenes: [{ id: "scene", source: render, durationMs: 15000 }] } } }
    }
  }));

  const result = await verifyGraphWorkflow(runDir, workflow, {
    probeMedia: async () => ({
      format: { duration: "25.033333" },
      streams: [{ codec_type: "video", codec_name: "qtrle", width: 3840, height: 2160, avg_frame_rate: "30/1" }]
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.checks.some((check) => check.id === "output.render.frame_rate" && !check.ok), true);
  assert.equal(result.checks.some((check) => check.id === "output.render.duration" && !check.ok), true);
});

test("graph verifier accepts a bounded run when every declared step completed", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-bounded-evidence-"));
  const asset = path.join(runDir, "photo.jpg");
  await writeFile(asset, Buffer.alloc(32, 1));
  const now = new Date().toISOString();
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "bounded",
    dryRun: false,
    status: "partial",
    stoppedAtStep: "photos",
    steps: {
      photos: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: { mediaList: [asset], count: 1 }
      }
    }
  }));

  const result = await verifyGraphWorkflow(runDir, {
    id: "bounded",
    steps: [{ id: "photos", type: "asset.multi_select" }]
  });

  assert.equal(result.ok, true, result.checks.filter((check) => !check.ok).map((check) => `${check.id}: ${check.detail}`).join("\n"));
});

test("graph verifier accepts valid timeline.dynamic_link, dynamicLinks on timeline.compose and premiere.build receipts", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-dl-evidence-"));
  const aep = path.join(runDir, "carousel.aep");
  const prproj = path.join(runDir, "output.prproj");
  const diag = path.join(runDir, "diagnostic.log");
  await writeFile(aep, Buffer.alloc(2_048, 1));
  await writeFile(prproj, Buffer.alloc(64, 2));
  await writeFile(diag, "runner-started\ntemplate-opened\ntext-bound\nfootage-bound\nproject-saved\nproject-closed");

  const workflow = {
    id: "dl_workflow",
    steps: [
      { id: "carousel", type: "effect.3d_carousel", with: { timing: { durationSeconds: 4, frameRate: 25 } } },
      { id: "dl", type: "timeline.dynamic_link", with: { id: "title_dl", project: aep, composition: "Main", startMs: 0, durationMs: 4000, track: 3, audioPolicy: "mute" } },
      { id: "timeline", type: "timeline.compose", with: { dynamicLinks: ["${steps.dl.outputs.dynamicLink}"] } },
      { id: "build", type: "premiere.build" }
    ]
  };
  const now = new Date().toISOString();
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "dl_workflow",
    dryRun: false,
    status: "success",
    steps: {
      carousel: { status: "success", startedAt: now, finishedAt: now, outputs: { project: aep, diagnosticLog: diag, hostResult: { ok: true, stage: "complete" } } },
      dl: { status: "success", startedAt: now, finishedAt: now, outputs: { dynamicLink: { id: "title_dl", project: aep, composition: "Main", startMs: 0, durationMs: 4000, track: 3, audioPolicy: "mute" } } },
      timeline: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: { schemaVersion: 1, name: "MAIN", width: 1920, height: 1080, frameRate: 25, durationMs: 4000, scenes: [{ id: "scene_1", source: "/tmp/a.mov", startMs: 0, durationMs: 4000, track: 1, audio: true, audioPolicy: "preserve" }], dynamicLinks: [{ id: "title_dl", project: aep, composition: "Main", startMs: 0, durationMs: 4000, track: 3, audioPolicy: "mute" }] } } },
      build: { status: "success", startedAt: now, finishedAt: now, outputs: { project: prproj, sequenceName: "MAIN", sequenceGuid: "guid", scenes: [{ id: "scene_1", source: "/tmp/a.mov", startMs: 0, sourceInMs: 0, durationMs: 4000, videoTrack: 1, audioPolicy: "preserve", audioTrack: 1, audioInserted: true }], dynamicLinks: [{ id: "title_dl", project: aep, composition: "Main", startMs: 0, durationMs: 4000, videoTrack: 3, audioPolicy: "mute", audioTrack: -1, audioInserted: false }] } }
    }
  }));

  const result = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(result.ok, true, result.checks.filter((check) => !check.ok).map((check) => `${check.id}: ${check.detail}`).join("\n"));
  assert.equal(result.checks.find((check) => check.id === "workflow.no_flat_title")?.ok, true);
  assert.equal(result.checks.find((check) => check.id === "output.dl.dynamic_link")?.ok, true);
  assert.equal(result.checks.find((check) => check.id === "output.dl.mute_policy")?.ok, true);
  assert.equal(result.checks.find((check) => check.id === "output.dl.project")?.ok, true);
  assert.equal(result.checks.find((check) => check.id === "output.timeline.dynamic_links")?.ok, true);
  assert.equal(result.checks.find((check) => check.id === "output.build.dynamic_link.title_dl.receipt")?.ok, true);
});

test("graph verifier rejects invalid timeline.dynamic_link output contract or non-mute audioPolicy", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-dl-invalid-"));
  const aep = path.join(runDir, "carousel.aep");
  await writeFile(aep, Buffer.alloc(2_048, 1));
  const workflow = {
    id: "dl_invalid",
    steps: [
      { id: "dl", type: "timeline.dynamic_link" }
    ]
  };
  const now = new Date().toISOString();
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "dl_invalid",
    dryRun: false,
    status: "success",
    steps: {
      dl: { status: "success", startedAt: now, finishedAt: now, outputs: { dynamicLink: { id: "title_dl", project: aep, composition: "Main", startMs: 15, durationMs: 4000, track: 3, audioPolicy: "preserve" } } }
    }
  }));

  const result = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(result.ok, false);
  assert.equal(result.checks.some((check) => check.id === "output.dl.dynamic_link" && !check.ok), true);
  assert.equal(result.checks.some((check) => check.id === "output.dl.mute_policy" && !check.ok), true);
});

test("graph verifier rejects premiere.build when dynamic link receipt has audio inserted or mismatched track", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-dl-audio-reject-"));
  const prproj = path.join(runDir, "output.prproj");
  await writeFile(prproj, Buffer.alloc(64, 1));
  const workflow = {
    id: "dl_audio_reject",
    steps: [
      { id: "build", type: "premiere.build", with: { timelineSpec: { dynamicLinks: [{ id: "title_dl", project: "/abs/path/carousel.aep", composition: "Main", startMs: 0, durationMs: 4000, track: 3, audioPolicy: "mute" }] } } }
    ]
  };
  const now = new Date().toISOString();
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "dl_audio_reject",
    dryRun: false,
    status: "success",
    steps: {
      build: { status: "success", startedAt: now, finishedAt: now, outputs: { project: prproj, sequenceName: "MAIN", sequenceGuid: "guid", dynamicLinks: [{ id: "title_dl", project: "/abs/path/carousel.aep", composition: "Main", startMs: 0, durationMs: 4000, videoTrack: 3, audioTrack: 1, audioInserted: true }] } }
    }
  }));

  const result = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(result.ok, false);
  assert.equal(result.checks.some((check) => check.id === "output.build.dynamic_link.title_dl.receipt" && !check.ok), true);
});

test("graph verifier no-flat-title check fails if carousel AEP was rendered by ae.render and used in timeline", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-dl-flat-fail-"));
  const aep = path.join(runDir, "carousel.aep");
  const mov = path.join(runDir, "carousel.mov");
  const prproj = path.join(runDir, "output.prproj");
  const diag = path.join(runDir, "diagnostic.log");
  await writeFile(aep, Buffer.alloc(2_048, 1));
  await writeFile(mov, Buffer.alloc(2_048, 2));
  await writeFile(prproj, Buffer.alloc(64, 3));
  await writeFile(diag, "runner-started\ntemplate-opened\ntext-bound\nfootage-bound\nproject-saved\nproject-closed");

  const workflow = {
    id: "flat_title_workflow",
    steps: [
      { id: "carousel", type: "effect.3d_carousel" },
      { id: "render", type: "ae.render", with: { project: "${steps.carousel.outputs.project}", output: mov } },
      { id: "dl", type: "timeline.dynamic_link", with: { id: "title_dl", project: aep, composition: "Main", startMs: 0, durationMs: 4000, track: 3, audioPolicy: "mute" } },
      { id: "scene", type: "timeline.scene", with: { source: mov, startMs: 0, durationMs: 4000 } },
      { id: "timeline", type: "timeline.compose", with: { scenes: ["${steps.scene.outputs.scene}"], dynamicLinks: ["${steps.dl.outputs.dynamicLink}"] } },
      { id: "build", type: "premiere.build" }
    ]
  };
  const now = new Date().toISOString();
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "flat_title_workflow",
    dryRun: false,
    status: "success",
    steps: {
      carousel: { status: "success", startedAt: now, finishedAt: now, outputs: { project: aep, diagnosticLog: diag, hostResult: { ok: true, stage: "complete" } } },
      render: { status: "success", startedAt: now, finishedAt: now, outputs: { project: aep, output: mov } },
      dl: { status: "success", startedAt: now, finishedAt: now, outputs: { dynamicLink: { id: "title_dl", project: aep, composition: "Main", startMs: 0, durationMs: 4000, track: 3, audioPolicy: "mute" } } },
      scene: { status: "success", startedAt: now, finishedAt: now, outputs: { scene: { id: "scene", source: mov, startMs: 0, durationMs: 4000 } } },
      timeline: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: { schemaVersion: 1, name: "MAIN", width: 1920, height: 1080, frameRate: 25, durationMs: 4000, scenes: [{ id: "scene", source: mov, startMs: 0, durationMs: 4000 }], dynamicLinks: [{ id: "title_dl", project: aep, composition: "Main", startMs: 0, durationMs: 4000, track: 3, audioPolicy: "mute" }] } } },
      build: { status: "success", startedAt: now, finishedAt: now, outputs: { project: prproj, sequenceName: "MAIN", sequenceGuid: "guid", dynamicLinks: [{ id: "title_dl", project: aep, composition: "Main", startMs: 0, durationMs: 4000, videoTrack: 3, audioTrack: -1, audioInserted: false }] } }
    }
  }));

  const probeMedia = async () => ({
    format: { duration: "4" },
    streams: [{ codec_type: "video", codec_name: "prores_ks", width: 1920, height: 1080, avg_frame_rate: "25/1", duration: "4" }]
  });

  const result = await verifyGraphWorkflow(runDir, workflow, { probeMedia });
  assert.equal(result.ok, false);
  assert.equal(result.checks.some((check) => check.id === "workflow.no_flat_title" && !check.ok), true);
});

test("graph verifier no-flat-title check passes when unrelated AE render exists", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-dl-unrelated-ae-"));
  const carouselAep = path.join(runDir, "carousel.aep");
  const outroAep = path.join(runDir, "outro.aep");
  const outroMov = path.join(runDir, "outro.mov");
  const prproj = path.join(runDir, "output.prproj");
  const diag = path.join(runDir, "diagnostic.log");
  await writeFile(carouselAep, Buffer.alloc(2_048, 1));
  await writeFile(outroAep, Buffer.alloc(2_048, 2));
  await writeFile(outroMov, Buffer.alloc(2_048, 3));
  await writeFile(prproj, Buffer.alloc(64, 4));
  await writeFile(diag, "runner-started\ntemplate-opened\ntext-bound\nfootage-bound\nproject-saved\nproject-closed");

  const workflow = {
    id: "unrelated_ae_workflow",
    steps: [
      { id: "carousel", type: "effect.3d_carousel" },
      { id: "render_outro", type: "ae.render", with: { project: outroAep, output: outroMov } },
      { id: "dl", type: "timeline.dynamic_link", with: { id: "title_dl", project: carouselAep, composition: "Main", startMs: 0, durationMs: 4000, track: 3, audioPolicy: "mute" } },
      { id: "scene_outro", type: "timeline.scene", with: { source: outroMov, startMs: 4000, durationMs: 2000, track: 1, audio: true, audioPolicy: "preserve" } },
      { id: "timeline", type: "timeline.compose", with: { dynamicLinks: ["${steps.dl.outputs.dynamicLink}"] } },
      { id: "build", type: "premiere.build" }
    ]
  };
  const now = new Date().toISOString();
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "unrelated_ae_workflow",
    dryRun: false,
    status: "success",
    steps: {
      carousel: { status: "success", startedAt: now, finishedAt: now, outputs: { project: carouselAep, diagnosticLog: diag, hostResult: { ok: true, stage: "complete" } } },
      render_outro: { status: "success", startedAt: now, finishedAt: now, outputs: { project: outroAep, output: outroMov } },
      dl: { status: "success", startedAt: now, finishedAt: now, outputs: { dynamicLink: { id: "title_dl", project: carouselAep, composition: "Main", startMs: 0, durationMs: 4000, track: 3, audioPolicy: "mute" } } },
      scene_outro: { status: "success", startedAt: now, finishedAt: now, outputs: { scene: { id: "scene_outro", source: outroMov, startMs: 4000, durationMs: 2000, track: 1, audio: true, audioPolicy: "preserve" } } },
      timeline: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: { schemaVersion: 1, name: "MAIN", width: 1920, height: 1080, frameRate: 25, durationMs: 6000, scenes: [{ id: "scene_outro", source: outroMov, startMs: 4000, durationMs: 2000, track: 1, audio: true, audioPolicy: "preserve" }], dynamicLinks: [{ id: "title_dl", project: carouselAep, composition: "Main", startMs: 0, durationMs: 4000, track: 3, audioPolicy: "mute" }] } } },
      build: { status: "success", startedAt: now, finishedAt: now, outputs: { project: prproj, sequenceName: "MAIN", sequenceGuid: "guid", scenes: [{ id: "scene_outro", source: outroMov, startMs: 4000, sourceInMs: 0, durationMs: 2000, videoTrack: 1, audioPolicy: "preserve", audioTrack: 1, audioInserted: true }], dynamicLinks: [{ id: "title_dl", project: carouselAep, composition: "Main", startMs: 0, durationMs: 4000, videoTrack: 3, audioPolicy: "mute", audioTrack: -1, audioInserted: false }] } }
    }
  }));

  const probeMedia = async () => ({
    format: { duration: "2" },
    streams: [{ codec_type: "video", codec_name: "prores_ks", width: 1920, height: 1080, avg_frame_rate: "25/1", duration: "2" }]
  });

  const result = await verifyGraphWorkflow(runDir, workflow, { probeMedia });
  assert.equal(result.ok, true, result.checks.filter((check) => !check.ok).map((check) => `${check.id}: ${check.detail}`).join("\n"));
  assert.equal(result.checks.find((check) => check.id === "workflow.no_flat_title")?.ok, true);
});

test("graph verifier accepts valid two-cover evidence with comfy cache, approval and timeline overlay", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-cover-verifier-ok-"));
  const src1 = path.join(runDir, "src1.png");
  const src2 = path.join(runDir, "src2.png");
  const gen1 = path.join(runDir, "gen1.png");
  const gen2 = path.join(runDir, "gen2.png");

  await writeFile(src1, Buffer.from("source-1-bytes"));
  await writeFile(src2, Buffer.from("source-2-bytes"));
  await writeFile(gen1, Buffer.from("generated-1-bytes-for-cover-card-test"));
  await writeFile(gen2, Buffer.from("generated-2-bytes-for-cover-card-test"));

  const hash = (b) => createHash("sha256").update(b).digest("hex");
  const src1Hash = hash("source-1-bytes");
  const src2Hash = hash("source-2-bytes");
  const gen1Hash = hash("generated-1-bytes-for-cover-card-test");
  const gen2Hash = hash("generated-2-bytes-for-cover-card-test");
  const wfHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const c1Hash = "1111111111111111111111111111111111111111111111111111111111111111";
  const c2Hash = "2222222222222222222222222222222222222222222222222222222222222222";
  const p1Hash = "3333333333333333333333333333333333333333333333333333333333333333";
  const p2Hash = "4444444444444444444444444444444444444444444444444444444444444444";

  const workflow = {
    id: "two_cover_workflow",
    steps: [
      { id: "gen_c1", type: "comfyui.workflow", with: { workflowFile: "workflows/generate-cover-zimage.api.json" } },
      { id: "rev_c1", type: "review.media_approval", with: { asset: "${steps.gen_c1.outputs.image}", workflowDigest: "${steps.gen_c1.outputs.workflowDigest}", storyboardItemId: "cover_3", sourceImage: src1, prompt: "portrait 1", seed: 1 } },
      { id: "ov_c1", type: "timeline.overlay", with: { asset: "${steps.rev_c1.outputs.approvedAsset}", startMs: 37000, durationMs: 6000, track: 2, audioPolicy: "mute" } },
      { id: "gen_c2", type: "comfyui.workflow", with: { workflowFile: "workflows/generate-cover-zimage.api.json" } },
      { id: "rev_c2", type: "review.media_approval", with: { asset: "${steps.gen_c2.outputs.image}", workflowDigest: "${steps.gen_c2.outputs.workflowDigest}", storyboardItemId: "cover_5", sourceImage: src2, prompt: "portrait 2", seed: 2 } },
      { id: "ov_c2", type: "timeline.overlay", with: { asset: "${steps.rev_c2.outputs.approvedAsset}", startMs: 377000, durationMs: 6000, track: 2, audioPolicy: "mute" } },
      { id: "compose", type: "timeline.compose" }
    ]
  };

  const now = new Date().toISOString();
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "two_cover_workflow",
    dryRun: false,
    status: "success",
    steps: {
      gen_c1: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: {
          workflowDigest: wfHash,
          cacheDigest: c1Hash,
          cacheHit: true,
          images: [{ filename: "gen1.png", localPath: gen1, sha256: gen1Hash }]
        }
      },
      rev_c1: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: {
          approvedAsset: gen1,
          approval: {
            approved: true,
            kind: "cover_card",
            storyboardItemId: "cover_3",
            sourceImage: src1,
            sourceDigest: src1Hash,
            prompt: "portrait 1",
            seed: 1,
            workflowDigest: wfHash,
            outputDigest: gen1Hash,
            proposalDigest: p1Hash,
            asset: gen1
          }
        }
      },
      ov_c1: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: {
          overlay: {
            id: "ov_c1",
            asset: gen1,
            startMs: 37000,
            durationMs: 6000,
            track: 2,
            audioPolicy: "mute"
          }
        }
      },
      gen_c2: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: {
          workflowDigest: wfHash,
          cacheDigest: c2Hash,
          cacheHit: false,
          images: [{ filename: "gen2.png", localPath: gen2, sha256: gen2Hash }]
        }
      },
      rev_c2: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: {
          approvedAsset: gen2,
          approval: {
            approved: true,
            kind: "cover_card",
            storyboardItemId: "cover_5",
            sourceImage: src2,
            sourceDigest: src2Hash,
            prompt: "portrait 2",
            seed: 2,
            workflowDigest: wfHash,
            outputDigest: gen2Hash,
            proposalDigest: p2Hash,
            asset: gen2
          }
        }
      },
      ov_c2: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: {
          overlay: {
            id: "ov_c2",
            asset: gen2,
            startMs: 377000,
            durationMs: 6000,
            track: 2,
            audioPolicy: "mute"
          }
        }
      },
      compose: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: {
          timelineSpec: {
            schemaVersion: 1,
            name: "MAIN",
            width: 1920,
            height: 1080,
            frameRate: 25,
            durationMs: 400000,
            scenes: [{ id: "scene_1", source: gen1, startMs: 0, durationMs: 400000, track: 1, audio: true, audioPolicy: "preserve" }],
            overlays: [
              { id: "ov_c1", asset: gen1, startMs: 37000, durationMs: 6000, track: 2, audioPolicy: "mute" },
              { id: "ov_c2", asset: gen2, startMs: 377000, durationMs: 6000, track: 2, audioPolicy: "mute" }
            ]
          }
        }
      }
    }
  }));

  const result = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(result.ok, true, result.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`).join("\n"));
});

test("graph verifier accepts layered cover v2 background on V1 with people V3 and editable MOGRT V4", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-layered-cover-v2-verifier-"));
  const source = path.join(runDir, "source.png");
  const generated = path.join(runDir, "background.png");
  const person = path.join(runDir, "person.png");
  await writeFile(source, Buffer.from("layered-source"));
  await writeFile(generated, Buffer.from("layered-background-output-with-enough-image-bytes"));
  await writeFile(person, Buffer.from("layered-person-cutout"));
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const sourceSha = hash("layered-source");
  const generatedSha = hash("layered-background-output-with-enough-image-bytes");
  const workflowSha = hash("layered-workflow");
  const workflow = { id: "layered_cover_v2", steps: [
    { id: "gen", type: "comfyui.workflow", with: { workflowFile: "workflows/generate-cover-background-zimage.api.json" } },
    { id: "review", type: "review.media_approval", with: { asset: "${steps.gen.outputs.image}", workflowDigest: "${steps.gen.outputs.workflowDigest}", storyboardItemId: "cover_v2", sourceImage: source, prompt: "ฉากมหาวิทยาลัย", seed: 7, title: "สมชาย", layerContract: "premiere-cover-v2" } },
    { id: "background_v1", type: "timeline.overlay", with: { asset: "${steps.review.outputs.approvedAsset}", startMs: 0, durationMs: 6000, track: 1, audioPolicy: "mute", storyboardItemId: "cover_v2", editorialKind: "cover_card" } },
    { id: "person_v3", type: "timeline.overlay", with: { asset: person, startMs: 0, durationMs: 6000, track: 3, audioPolicy: "mute", storyboardItemId: "cover_v2", editorialKind: "cover_card" } },
    { id: "text_v4", type: "timeline.graphic_mogrt", with: { id: "cover_v2_text", mogrtPath: "/templates/cover.mogrt", startMs: 0, durationMs: 6000, track: 4, text: { personName: "สมชาย", positionTitle: "ศาสตราจารย์", award: "รางวัลดีเด่น" }, storyboardItemId: "cover_v2", editorialKind: "cover_card" } },
    { id: "compose", type: "timeline.compose" }
  ] };
  const now = new Date().toISOString();
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: workflow.id, runId: "run", dryRun: false, status: "success",
    steps: {
      gen: { status: "success", startedAt: now, finishedAt: now, outputs: { image: generated, workflowDigest: workflowSha, cacheDigest: hash("cache"), cacheHit: false, images: [{ filename: "background.png", localPath: generated, sha256: generatedSha }] } },
      review: { status: "success", startedAt: now, finishedAt: now, outputs: { approvedAsset: generated, approval: { approved: true, kind: "cover_card", storyboardItemId: "cover_v2", sourceImage: source, sourceDigest: sourceSha, prompt: "ฉากมหาวิทยาลัย", seed: 7, workflowDigest: workflowSha, outputDigest: generatedSha, proposalDigest: hash("proposal"), asset: generated, title: "สมชาย" } } },
      background_v1: { status: "success", startedAt: now, finishedAt: now, outputs: { overlay: { id: "background_v1", asset: generated, startMs: 0, durationMs: 6000, track: 1, audioPolicy: "mute", storyboardItemId: "cover_v2", editorialKind: "cover_card" } } },
      person_v3: { status: "success", startedAt: now, finishedAt: now, outputs: { overlay: { id: "person_v3", asset: person, startMs: 0, durationMs: 6000, track: 3, audioPolicy: "mute", storyboardItemId: "cover_v2", editorialKind: "cover_card" } } },
      text_v4: { status: "success", startedAt: now, finishedAt: now, outputs: { graphic: { id: "cover_v2_text", mogrtPath: "/templates/cover.mogrt", startMs: 0, durationMs: 6000, track: 4, text: { personName: "สมชาย" } } } },
      compose: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: { schemaVersion: 1, name: "MAIN", width: 1920, height: 1080, frameRate: 25, durationMs: 6000, scenes: [{ id: "scene", source, startMs: 0, durationMs: 6000, track: 1, audio: true, audioPolicy: "preserve" }], overlays: [{ id: "background_v1", asset: generated, startMs: 0, durationMs: 6000, track: 1, audioPolicy: "mute" }, { id: "person_v3", asset: person, startMs: 0, durationMs: 6000, track: 3, audioPolicy: "mute" }], graphics: [{ id: "cover_v2_text", mogrtPath: "/templates/cover.mogrt", startMs: 0, durationMs: 6000, track: 4, text: { personName: "สมชาย" } }] } } }
    }
  }));

  const result = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(result.ok, true, result.checks.filter((check) => !check.ok).map((check) => `${check.id}: ${check.detail}`).join("\n"));
  const timing = result.checks.find((check) => check.id === "workflow.cover.review.overlay_timing_spec");
  assert.equal(timing?.ok, true);
  assert.match(timing?.detail ?? "", /expectedTrack=1/);
});

test("graph verifier accepts a titled cover only when compositor evidence binds generator, title, approval, and overlay", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-titled-cover-verifier-"));
  const source = path.join(runDir, "source.png");
  const generated = path.join(runDir, "generated.png");
  const titled = path.join(runDir, "titled.png");
  await writeFile(source, Buffer.from("portrait-source-bytes"));
  await writeFile(generated, Buffer.from("generated-background-and-subject"));
  await writeFile(titled, Buffer.from("generated-background-subject-and-thai-title"));
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const generatedSha = hash("generated-background-and-subject");
  const titledSha = hash("generated-background-subject-and-thai-title");
  const sourceSha = hash("portrait-source-bytes");
  const workflowSha = hash("workflow");
  const title = "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์";
  const eyebrow = "อาจารย์ตัวอย่างดีเด่น · ประจำปี 2569";
  const subtitle = "คณะทันตแพทยศาสตร์ · มหาวิทยาลัยสงขลานครินทร์";
  const workflow = { id: "titled_cover", steps: [
    { id: "gen", type: "comfyui.workflow", with: { workflowFile: "workflows/generate-cover-zimage.api.json" } },
    { id: "title", type: "graphics.cover_title", with: { image: "${steps.gen.outputs.image}", output: "titled.png", eyebrow, title, subtitle } },
    { id: "review", type: "review.media_approval", with: { asset: "${steps.title.outputs.image}", workflowDigest: "${steps.gen.outputs.workflowDigest}", storyboardItemId: "cover_3", sourceImage: source, prompt: "portrait", seed: 3, title } },
    { id: "overlay", type: "timeline.overlay", with: { asset: "${steps.review.outputs.approvedAsset}", startMs: 0, durationMs: 6000, track: 2, audioPolicy: "mute" } },
    { id: "compose", type: "timeline.compose" }
  ] };
  const now = new Date().toISOString();
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: workflow.id,
    runId: "run",
    dryRun: false,
    status: "success",
    steps: {
      gen: { status: "success", startedAt: now, finishedAt: now, outputs: { image: generated, workflowDigest: workflowSha, cacheDigest: hash("cache"), cacheHit: false, images: [{ filename: "generated.png", localPath: generated, sha256: generatedSha }] } },
      title: { status: "success", startedAt: now, finishedAt: now, outputs: { image: titled, path: titled, source: generated, text: { eyebrow, title, subtitle }, engine: "appkit-coretext", sourceIdentity: { path: generated, sha256: generatedSha, sizeBytes: Buffer.byteLength("generated-background-and-subject") }, outputIdentity: { path: titled, sha256: titledSha, sizeBytes: Buffer.byteLength("generated-background-subject-and-thai-title") } } },
      review: { status: "success", startedAt: now, finishedAt: now, outputs: { approvedAsset: titled, approval: { approved: true, kind: "cover_card", storyboardItemId: "cover_3", sourceImage: source, sourceDigest: sourceSha, prompt: "portrait", seed: 3, workflowDigest: workflowSha, outputDigest: titledSha, proposalDigest: hash("proposal"), asset: titled, title } } },
      overlay: { status: "success", startedAt: now, finishedAt: now, outputs: { overlay: { id: "overlay", asset: titled, startMs: 0, durationMs: 6000, track: 2, audioPolicy: "mute" } } },
      compose: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: { schemaVersion: 1, name: "MAIN", frameRate: 25, durationMs: 6000, scenes: [{ id: "scene", source, startMs: 0, durationMs: 6000, track: 1, audio: true, audioPolicy: "preserve" }], overlays: [{ id: "overlay", asset: titled, startMs: 0, durationMs: 6000, track: 2, audioPolicy: "mute" }] } } }
    }
  }));

  const result = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(result.ok, true, result.checks.filter((check) => !check.ok).map((check) => `${check.id}: ${check.detail}`).join("\n"));

  const invalid = structuredClone(workflow);
  invalid.steps.splice(1, 1);
  invalid.steps[1].with.asset = "${steps.gen.outputs.image}";
  const invalidResult = await verifyGraphWorkflow(runDir, invalid);
  assert.equal(invalidResult.ok, false);
  assert.equal(invalidResult.checks.some((check) => check.id === "workflow.cover.review.generator_linkage" && !check.ok), true);
});

test("graph verifier rejects review.media_approval on planned approval, digest mismatch, or duplicate output", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-cover-verifier-fail-"));
  const src1 = path.join(runDir, "src1.png");
  const gen1 = path.join(runDir, "gen1.png");
  await writeFile(src1, Buffer.from("source-bytes"));
  await writeFile(gen1, Buffer.from("gen-bytes"));

  const hash = (b) => createHash("sha256").update(b).digest("hex");
  const src1Hash = hash("source-bytes");
  const gen1Hash = hash("gen-bytes");
  const wfHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const workflow = {
    id: "cover_fail_workflow",
    steps: [
      { id: "gen_c1", type: "comfyui.workflow", with: { workflowFile: "workflows/generate-cover-zimage.api.json" } },
      { id: "rev_c1", type: "review.media_approval", with: { asset: "${steps.gen_c1.outputs.image}", workflowDigest: "${steps.gen_c1.outputs.workflowDigest}", storyboardItemId: "cover_1", sourceImage: src1, prompt: "p", seed: 1 } },
      { id: "ov_c1", type: "timeline.overlay", with: { asset: "${steps.rev_c1.outputs.approvedAsset}" } },
      { id: "compose", type: "timeline.compose" }
    ]
  };

  const now = new Date().toISOString();

  // 1. Planned approval (planned: true)
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "cover_fail_workflow",
    dryRun: false,
    status: "success",
    steps: {
      gen_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { workflowDigest: wfHash, cacheDigest: wfHash, cacheHit: true, images: [{ filename: "gen1.png", localPath: gen1, sha256: gen1Hash }] } },
      rev_c1: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: {
          approvedAsset: gen1,
          approval: {
            planned: true,
            approved: false,
            kind: "cover_card",
            storyboardItemId: "cover_1",
            sourceImage: src1,
            sourceDigest: src1Hash,
            prompt: "p",
            seed: 1,
            workflowDigest: wfHash,
            outputDigest: gen1Hash,
            proposalDigest: "1234567890123456789012345678901234567890123456789012345678901234",
            asset: gen1
          }
        }
      },
      ov_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { overlay: { id: "ov_c1", durationMs: 4000 } } },
      compose: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: { schemaVersion: 1, overlays: [{ asset: gen1 }] } } }
    }
  }));

  const res1 = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(res1.ok, false);
  assert.equal(res1.checks.some((c) => c.id === "output.rev_c1.approved_flag" && !c.ok), true);

  // 2. Digest mismatch (corrupted file bytes vs declared digest)
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "cover_fail_workflow",
    dryRun: false,
    status: "success",
    steps: {
      gen_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { workflowDigest: wfHash, cacheDigest: wfHash, cacheHit: true, images: [{ filename: "gen1.png", localPath: gen1, sha256: gen1Hash }] } },
      rev_c1: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: {
          approvedAsset: gen1,
          approval: {
            approved: true,
            kind: "cover_card",
            storyboardItemId: "cover_1",
            sourceImage: src1,
            sourceDigest: "bad0000000000000000000000000000000000000000000000000000000000000",
            prompt: "p",
            seed: 1,
            workflowDigest: wfHash,
            outputDigest: gen1Hash,
            proposalDigest: "1234567890123456789012345678901234567890123456789012345678901234",
            asset: gen1
          }
        }
      },
      ov_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { overlay: { id: "ov_c1", durationMs: 4000 } } },
      compose: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: { schemaVersion: 1, overlays: [{ asset: gen1 }] } } }
    }
  }));

  const res2 = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(res2.ok, false);
  assert.equal(res2.checks.some((c) => c.id === "output.rev_c1.source_digest_match" && !c.ok), true);
});

test("graph verifier rejects approval asset substituted to a different existing image", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-cover-sub-"));
  const src = path.join(runDir, "src.png");
  const gen = path.join(runDir, "gen.png");
  const sub = path.join(runDir, "sub.png");
  await writeFile(src, Buffer.from("src-bytes"));
  await writeFile(gen, Buffer.from("gen-bytes"));
  await writeFile(sub, Buffer.from("substituted-bytes-image"));

  const hash = (b) => createHash("sha256").update(b).digest("hex");
  const wfHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const now = new Date().toISOString();

  const workflow = {
    id: "sub_workflow",
    steps: [
      { id: "gen_c1", type: "comfyui.workflow", with: { workflowFile: "workflows/generate-cover-zimage.api.json" } },
      { id: "rev_c1", type: "review.media_approval", with: { asset: "${steps.gen_c1.outputs.image}", workflowDigest: "${steps.gen_c1.outputs.workflowDigest}", storyboardItemId: "c1", sourceImage: src, prompt: "p", seed: 1 } },
      { id: "ov_c1", type: "timeline.overlay", with: { asset: "${steps.rev_c1.outputs.approvedAsset}" } },
      { id: "compose", type: "timeline.compose" }
    ]
  };

  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "sub_workflow",
    dryRun: false,
    status: "success",
    steps: {
      gen_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { workflowDigest: wfHash, cacheDigest: wfHash, cacheHit: true, images: [{ filename: "gen.png", localPath: gen, sha256: hash("gen-bytes") }] } },
      rev_c1: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: {
          approvedAsset: sub, // Substituted asset not in generator images!
          approval: {
            approved: true,
            kind: "cover_card",
            storyboardItemId: "c1",
            sourceImage: src,
            sourceDigest: hash("src-bytes"),
            prompt: "p",
            seed: 1,
            workflowDigest: wfHash,
            outputDigest: hash("substituted-bytes-image"),
            proposalDigest: "1111111111111111111111111111111111111111111111111111111111111111",
            asset: sub
          }
        }
      },
      ov_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { overlay: { id: "ov_c1", durationMs: 4000 } } },
      compose: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: { schemaVersion: 1, overlays: [{ asset: sub }] } } }
    }
  }));

  const res = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(res.ok, false);
  assert.equal(res.checks.some((c) => c.id === "workflow.cover.rev_c1.approved_asset_from_generator" && !c.ok), true);
});

test("graph verifier rejects approval workflowDigest mismatch, missing generator sha256, wrong linkage, and malformed ordering", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-cover-neg-"));
  const src1 = path.join(runDir, "src1.png");
  const src2 = path.join(runDir, "src2.png");
  const gen1 = path.join(runDir, "gen1.png");
  const gen2 = path.join(runDir, "gen2.png");
  await writeFile(src1, Buffer.from("src1-bytes"));
  await writeFile(src2, Buffer.from("src2-bytes"));
  await writeFile(gen1, Buffer.from("gen1-bytes"));
  await writeFile(gen2, Buffer.from("gen2-bytes"));

  const hash = (b) => createHash("sha256").update(b).digest("hex");
  const wfHash1 = "1111111111111111111111111111111111111111111111111111111111111111";
  const wfHash2 = "2222222222222222222222222222222222222222222222222222222222222222";
  const now = new Date().toISOString();

  // 1. WorkflowDigest mismatch between approval and generator
  const wf1 = {
    id: "wf_digest_mismatch",
    steps: [
      { id: "gen_c1", type: "comfyui.workflow", with: { workflowFile: "workflows/generate-cover-zimage.api.json" } },
      { id: "rev_c1", type: "review.media_approval", with: { asset: "${steps.gen_c1.outputs.image}", workflowDigest: "${steps.gen_c1.outputs.workflowDigest}", storyboardItemId: "c1", sourceImage: src1, prompt: "p", seed: 1 } },
      { id: "ov_c1", type: "timeline.overlay", with: { asset: "${steps.rev_c1.outputs.approvedAsset}" } },
      { id: "compose", type: "timeline.compose" }
    ]
  };
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "wf_digest_mismatch",
    status: "success",
    steps: {
      gen_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { workflowDigest: wfHash1, cacheDigest: wfHash1, cacheHit: true, images: [{ filename: "gen1.png", localPath: gen1, sha256: hash("gen1-bytes") }] } },
      rev_c1: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: {
          approvedAsset: gen1,
          approval: {
            approved: true,
            kind: "cover_card",
            storyboardItemId: "c1",
            sourceImage: src1,
            sourceDigest: hash("src1-bytes"),
            prompt: "p",
            seed: 1,
            workflowDigest: wfHash2, // Mismatch with generator!
            outputDigest: hash("gen1-bytes"),
            proposalDigest: "3333333333333333333333333333333333333333333333333333333333333333",
            asset: gen1
          }
        }
      },
      ov_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { overlay: { id: "ov_c1", durationMs: 4000 } } },
      compose: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: { schemaVersion: 1, overlays: [{ asset: gen1 }] } } }
    }
  }));
  const res1 = await verifyGraphWorkflow(runDir, wf1);
  assert.equal(res1.ok, false);
  assert.equal(res1.checks.some((c) => c.id === "workflow.cover.rev_c1.generator_workflow_digest_match" && !c.ok), true);

  // 2. Cover generator image missing sha256
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "wf_digest_mismatch",
    status: "success",
    steps: {
      gen_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { workflowDigest: wfHash1, cacheDigest: wfHash1, cacheHit: true, images: [{ filename: "gen1.png", localPath: gen1 }] } }, // missing sha256!
      rev_c1: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: {
          approvedAsset: gen1,
          approval: {
            approved: true,
            kind: "cover_card",
            storyboardItemId: "c1",
            sourceImage: src1,
            sourceDigest: hash("src1-bytes"),
            prompt: "p",
            seed: 1,
            workflowDigest: wfHash1,
            outputDigest: hash("gen1-bytes"),
            proposalDigest: "3333333333333333333333333333333333333333333333333333333333333333",
            asset: gen1
          }
        }
      },
      ov_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { overlay: { id: "ov_c1", durationMs: 4000 } } },
      compose: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: { schemaVersion: 1, overlays: [{ asset: gen1 }] } } }
    }
  }));
  const res2 = await verifyGraphWorkflow(runDir, wf1);
  assert.equal(res2.ok, false);
  assert.equal(res2.checks.some((c) => c.id === "output.gen_c1.image_0.sha256" && !c.ok), true);

  // 3. Review step linked to wrong / non-existent generator
  const wf3 = {
    id: "wf_wrong_gen",
    steps: [
      { id: "gen_c1", type: "comfyui.workflow", with: { workflowFile: "workflows/generate-cover-zimage.api.json" } },
      { id: "rev_c1", type: "review.media_approval", with: { asset: "${steps.non_existent_gen.outputs.image}", workflowDigest: "${steps.non_existent_gen.outputs.workflowDigest}", storyboardItemId: "c1", sourceImage: src1, prompt: "p", seed: 1 } },
      { id: "ov_c1", type: "timeline.overlay", with: { asset: "${steps.rev_c1.outputs.approvedAsset}" } },
      { id: "compose", type: "timeline.compose" }
    ]
  };
  const res3 = await verifyGraphWorkflow(runDir, wf3);
  assert.equal(res3.ok, false);
  assert.equal(res3.checks.some((c) => c.id === "workflow.cover.rev_c1.generator_linkage" && !c.ok), true);

  // 4. Malformed cover branch ordering (gen2 before overlay1)
  const wf4 = {
    id: "wf_bad_order",
    steps: [
      { id: "gen_c1", type: "comfyui.workflow", with: { workflowFile: "workflows/generate-cover-zimage.api.json" } },
      { id: "rev_c1", type: "review.media_approval", with: { asset: "${steps.gen_c1.outputs.image}", workflowDigest: "${steps.gen_c1.outputs.workflowDigest}", storyboardItemId: "cover_1", sourceImage: src1, prompt: "p1", seed: 1 } },
      { id: "gen_c2", type: "comfyui.workflow", with: { workflowFile: "workflows/generate-cover-zimage.api.json" } }, // Interleaved before ov_c1!
      { id: "ov_c1", type: "timeline.overlay", with: { asset: "${steps.rev_c1.outputs.approvedAsset}" } },
      { id: "rev_c2", type: "review.media_approval", with: { asset: "${steps.gen_c2.outputs.image}", workflowDigest: "${steps.gen_c2.outputs.workflowDigest}", storyboardItemId: "cover_2", sourceImage: src2, prompt: "p2", seed: 2 } },
      { id: "ov_c2", type: "timeline.overlay", with: { asset: "${steps.rev_c2.outputs.approvedAsset}" } },
      { id: "compose", type: "timeline.compose" }
    ]
  };
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "wf_bad_order",
    status: "success",
    steps: {
      gen_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { workflowDigest: wfHash1, cacheDigest: wfHash1, cacheHit: true, images: [{ filename: "gen1.png", localPath: gen1, sha256: hash("gen1-bytes") }] } },
      rev_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { approvedAsset: gen1, approval: { approved: true, kind: "cover_card", storyboardItemId: "cover_1", sourceImage: src1, sourceDigest: hash("src1-bytes"), prompt: "p1", seed: 1, workflowDigest: wfHash1, outputDigest: hash("gen1-bytes"), proposalDigest: "1111111111111111111111111111111111111111111111111111111111111111", asset: gen1 } } },
      gen_c2: { status: "success", startedAt: now, finishedAt: now, outputs: { workflowDigest: wfHash2, cacheDigest: wfHash2, cacheHit: true, images: [{ filename: "gen2.png", localPath: gen2, sha256: hash("gen2-bytes") }] } },
      ov_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { overlay: { id: "ov_c1", durationMs: 4000 } } },
      rev_c2: { status: "success", startedAt: now, finishedAt: now, outputs: { approvedAsset: gen2, approval: { approved: true, kind: "cover_card", storyboardItemId: "cover_2", sourceImage: src2, sourceDigest: hash("src2-bytes"), prompt: "p2", seed: 2, workflowDigest: wfHash2, outputDigest: hash("gen2-bytes"), proposalDigest: "2222222222222222222222222222222222222222222222222222222222222222", asset: gen2 } } },
      ov_c2: { status: "success", startedAt: now, finishedAt: now, outputs: { overlay: { id: "ov_c2", durationMs: 4000 } } },
      compose: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: { schemaVersion: 1, overlays: [{ asset: gen1 }, { asset: gen2 }] } } }
    }
  }));
  const res4 = await verifyGraphWorkflow(runDir, wf4);
  assert.equal(res4.ok, false);
  assert.equal(res4.checks.some((c) => c.id === "workflow.cover.sequential_branches" && !c.ok), true);

  // 5. Conflicting generator expressions (asset references gen_c1, workflowDigest references gen_c2)
  const wf5 = {
    id: "wf_conflicting_gen_refs",
    steps: [
      { id: "gen_c1", type: "comfyui.workflow", with: { workflowFile: "workflows/generate-cover-zimage.api.json" } },
      { id: "gen_c2", type: "comfyui.workflow", with: { workflowFile: "workflows/generate-cover-zimage.api.json" } },
      { id: "rev_c1", type: "review.media_approval", with: { asset: "${steps.gen_c1.outputs.image}", workflowDigest: "${steps.gen_c2.outputs.workflowDigest}", storyboardItemId: "c1", sourceImage: src1, prompt: "p", seed: 1 } },
      { id: "ov_c1", type: "timeline.overlay", with: { asset: "${steps.rev_c1.outputs.approvedAsset}" } },
      { id: "compose", type: "timeline.compose" }
    ]
  };
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "wf_conflicting_gen_refs",
    status: "success",
    steps: {
      gen_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { workflowDigest: wfHash1, cacheDigest: wfHash1, cacheHit: true, images: [{ filename: "gen1.png", localPath: gen1, sha256: hash("gen1-bytes") }] } },
      gen_c2: { status: "success", startedAt: now, finishedAt: now, outputs: { workflowDigest: wfHash2, cacheDigest: wfHash2, cacheHit: true, images: [{ filename: "gen2.png", localPath: gen2, sha256: hash("gen2-bytes") }] } },
      rev_c1: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: {
          approvedAsset: gen1,
          approval: {
            approved: true,
            kind: "cover_card",
            storyboardItemId: "c1",
            sourceImage: src1,
            sourceDigest: hash("src1-bytes"),
            prompt: "p",
            seed: 1,
            workflowDigest: wfHash1,
            outputDigest: hash("gen1-bytes"),
            proposalDigest: "1111111111111111111111111111111111111111111111111111111111111111",
            asset: gen1
          }
        }
      },
      ov_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { overlay: { id: "ov_c1", durationMs: 4000 } } },
      compose: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: { schemaVersion: 1, overlays: [{ asset: gen1 }] } } }
    }
  }));
  const res5 = await verifyGraphWorkflow(runDir, wf5);
  assert.equal(res5.ok, false);
  assert.equal(res5.checks.some((c) => c.id === "workflow.cover.rev_c1.generator_linkage" && !c.ok), true);

  // 6. Wrong startMs / durationMs / track / audioPolicy in overlay
  const wf6 = {
    id: "wf_bad_overlay_spec",
    steps: [
      { id: "gen_c1", type: "comfyui.workflow", with: { workflowFile: "workflows/generate-cover-zimage.api.json" } },
      { id: "rev_c1", type: "review.media_approval", with: { asset: "${steps.gen_c1.outputs.image}", workflowDigest: "${steps.gen_c1.outputs.workflowDigest}", storyboardItemId: "cover_3", sourceImage: src1, prompt: "p", seed: 1 } },
      { id: "ov_c1", type: "timeline.overlay", with: { asset: "${steps.rev_c1.outputs.approvedAsset}", startMs: 30000, durationMs: 4000, track: 1, audioPolicy: "mix" } },
      { id: "compose", type: "timeline.compose" }
    ]
  };
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "wf_bad_overlay_spec",
    status: "success",
    steps: {
      gen_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { workflowDigest: wfHash1, cacheDigest: wfHash1, cacheHit: true, images: [{ filename: "gen1.png", localPath: gen1, sha256: hash("gen1-bytes") }] } },
      rev_c1: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: {
          approvedAsset: gen1,
          approval: {
            approved: true,
            kind: "cover_card",
            storyboardItemId: "cover_3",
            sourceImage: src1,
            sourceDigest: hash("src1-bytes"),
            prompt: "p",
            seed: 1,
            workflowDigest: wfHash1,
            outputDigest: hash("gen1-bytes"),
            proposalDigest: "1111111111111111111111111111111111111111111111111111111111111111",
            asset: gen1
          }
        }
      },
      ov_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { overlay: { id: "ov_c1", asset: gen1, startMs: 30000, durationMs: 4000, track: 1, audioPolicy: "mix" } } },
      compose: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: { schemaVersion: 1, overlays: [{ asset: gen1, startMs: 30000, durationMs: 4000, track: 1 }] } } }
    }
  }));
  const res6 = await verifyGraphWorkflow(runDir, wf6);
  assert.equal(res6.ok, false);
  assert.equal(res6.checks.some((c) => c.id === "workflow.cover.rev_c1.overlay_audio_policy" && !c.ok), true);
  assert.equal(res6.checks.some((c) => c.id === "workflow.cover.rev_c1.overlay_timing_spec" && !c.ok), true);

  // 7. Duplicate overlay consumer for same review step
  const wf7 = {
    id: "wf_dup_overlay_consumer",
    steps: [
      { id: "gen_c1", type: "comfyui.workflow", with: { workflowFile: "workflows/generate-cover-zimage.api.json" } },
      { id: "rev_c1", type: "review.media_approval", with: { asset: "${steps.gen_c1.outputs.image}", workflowDigest: "${steps.gen_c1.outputs.workflowDigest}", storyboardItemId: "cover_3", sourceImage: src1, prompt: "p", seed: 1 } },
      { id: "ov_c1_a", type: "timeline.overlay", with: { asset: "${steps.rev_c1.outputs.approvedAsset}", startMs: 37000, durationMs: 6000, track: 2, audioPolicy: "mute" } },
      { id: "ov_c1_b", type: "timeline.overlay", with: { asset: "${steps.rev_c1.outputs.approvedAsset}", startMs: 37000, durationMs: 6000, track: 2, audioPolicy: "mute" } },
      { id: "compose", type: "timeline.compose" }
    ]
  };
  const res7 = await verifyGraphWorkflow(runDir, wf7);
  assert.equal(res7.ok, false);
  assert.equal(res7.checks.some((c) => c.id === "workflow.cover.rev_c1.overlay_linkage" && !c.ok), true);

  // 8. Mismatched final timeline overlay in timelineSpec
  const wf8 = {
    id: "wf_mismatched_timeline_overlay",
    steps: [
      { id: "gen_c1", type: "comfyui.workflow", with: { workflowFile: "workflows/generate-cover-zimage.api.json" } },
      { id: "rev_c1", type: "review.media_approval", with: { asset: "${steps.gen_c1.outputs.image}", workflowDigest: "${steps.gen_c1.outputs.workflowDigest}", storyboardItemId: "cover_3", sourceImage: src1, prompt: "p", seed: 1 } },
      { id: "ov_c1", type: "timeline.overlay", with: { asset: "${steps.rev_c1.outputs.approvedAsset}", startMs: 37000, durationMs: 6000, track: 2, audioPolicy: "mute" } },
      { id: "compose", type: "timeline.compose" }
    ]
  };
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "wf_mismatched_timeline_overlay",
    status: "success",
    steps: {
      gen_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { workflowDigest: wfHash1, cacheDigest: wfHash1, cacheHit: true, images: [{ filename: "gen1.png", localPath: gen1, sha256: hash("gen1-bytes") }] } },
      rev_c1: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: {
          approvedAsset: gen1,
          approval: {
            approved: true,
            kind: "cover_card",
            storyboardItemId: "cover_3",
            sourceImage: src1,
            sourceDigest: hash("src1-bytes"),
            prompt: "p",
            seed: 1,
            workflowDigest: wfHash1,
            outputDigest: hash("gen1-bytes"),
            proposalDigest: "1111111111111111111111111111111111111111111111111111111111111111",
            asset: gen1
          }
        }
      },
      ov_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { overlay: { id: "ov_c1", asset: gen1, startMs: 37000, durationMs: 6000, track: 2, audioPolicy: "mute" } } },
      compose: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: { schemaVersion: 1, overlays: [
        { asset: gen1, startMs: 37000, durationMs: 6000, track: 2 },
        { asset: gen1, startMs: 99999, durationMs: 6000, track: 2 }
      ] } } } // one exact placement plus one duplicate with mismatched startMs must fail
    }
  }));
  const res8 = await verifyGraphWorkflow(runDir, wf8);
  assert.equal(res8.ok, false);
  assert.equal(res8.checks.some((c) => c.id === "workflow.cover.rev_c1.timeline_overlay" && !c.ok), true);

  // 9. Approval evidence mismatch with reviewStep.with (e.g. storyboardItemId substituted)
  const wf9 = {
    id: "wf_review_with_mismatch",
    steps: [
      { id: "gen_c1", type: "comfyui.workflow", with: { workflowFile: "workflows/generate-cover-zimage.api.json" } },
      { id: "rev_c1", type: "review.media_approval", with: { asset: "${steps.gen_c1.outputs.image}", workflowDigest: "${steps.gen_c1.outputs.workflowDigest}", storyboardItemId: "cover_3", sourceImage: src1, prompt: "expected prompt", seed: 100 } },
      { id: "ov_c1", type: "timeline.overlay", with: { asset: "${steps.rev_c1.outputs.approvedAsset}", startMs: 37000, durationMs: 6000, track: 2, audioPolicy: "mute" } },
      { id: "compose", type: "timeline.compose" }
    ]
  };
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "wf_review_with_mismatch",
    status: "success",
    steps: {
      gen_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { workflowDigest: wfHash1, cacheDigest: wfHash1, cacheHit: true, images: [{ filename: "gen1.png", localPath: gen1, sha256: hash("gen1-bytes") }] } },
      rev_c1: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: {
          approvedAsset: gen1,
          approval: {
            approved: true,
            kind: "cover_card",
            storyboardItemId: "cover_WRONG", // Mismatched storyboardItemId!
            sourceImage: src1,
            sourceDigest: hash("src1-bytes"),
            prompt: "expected prompt",
            seed: 100,
            workflowDigest: wfHash1,
            outputDigest: hash("gen1-bytes"),
            proposalDigest: "1111111111111111111111111111111111111111111111111111111111111111",
            asset: gen1
          }
        }
      },
      ov_c1: { status: "success", startedAt: now, finishedAt: now, outputs: { overlay: { id: "ov_c1", asset: gen1, startMs: 37000, durationMs: 6000, track: 2, audioPolicy: "mute" } } },
      compose: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: { schemaVersion: 1, overlays: [{ asset: gen1, startMs: 37000, durationMs: 6000, track: 2 }] } } }
    }
  }));
  const res9 = await verifyGraphWorkflow(runDir, wf9);
  assert.equal(res9.ok, false);
  assert.equal(res9.checks.some((c) => c.id === "output.rev_c1.storyboard_item_id_match" && !c.ok), true);
});

test("workflow verifier enforces storyboard provenance, audio policies, receipt provenance, and gap interstitial union", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-audio-continuity-"));
  const now = new Date().toISOString();
  const prproj = path.join(runDir, "proj.prproj");
  await writeFile(prproj, Buffer.alloc(64, 1));

  // 1. Positive: A-roll -> Title [2000,4000] + Cover [4000,6000] -> A-roll [6000,8000] -> Logo [8000,10000]
  const wfValid = {
    id: "wf_audio_valid",
    steps: [
      { id: "compose", type: "timeline.compose" },
      { id: "build", type: "premiere.build" }
    ]
  };

  const validTimeline = {
    schemaVersion: 1,
    name: "MAIN",
    width: 1920,
    height: 1080,
    frameRate: 25,
    durationMs: 10_000,
    scenes: [
      { id: "scene_1", source: "/media/a1.mov", startMs: 0, durationMs: 2_000, track: 1, audio: true, audioPolicy: "preserve", storyboardItemId: "item_a1", editorialKind: "a_roll" },
      { id: "scene_2", source: "/media/a2.mov", startMs: 6_000, durationMs: 2_000, track: 1, audio: true, audioPolicy: "preserve", storyboardItemId: "item_a2", editorialKind: "a_roll" },
      { id: "scene_3", source: "/media/logo.mov", startMs: 8_000, durationMs: 2_000, track: 1, audio: false, audioPolicy: "mute", storyboardItemId: "item_logo", editorialKind: "logo_outro" }
    ],
    dynamicLinks: [
      { id: "dl_title", project: "/media/title.aep", composition: "Main", startMs: 2_000, durationMs: 2_000, track: 3, audioPolicy: "mute", storyboardItemId: "item_title", editorialKind: "title" }
    ],
    overlays: [
      { id: "ov_cover", asset: "/media/cover.png", startMs: 4_000, durationMs: 2_000, track: 2, audioPolicy: "mute", storyboardItemId: "item_cover", editorialKind: "cover_card" }
    ]
  };

  const validReceipts = {
    project: prproj,
    sequenceName: "MAIN",
    sequenceGuid: "guid-valid",
    scenes: [
      { id: "scene_1", source: "/media/a1.mov", startMs: 0, sourceInMs: 0, durationMs: 2_000, videoTrack: 1, audioPolicy: "preserve", audioTrack: 1, audioInserted: true, storyboardItemId: "item_a1", editorialKind: "a_roll" },
      { id: "scene_2", source: "/media/a2.mov", startMs: 6_000, sourceInMs: 0, durationMs: 2_000, videoTrack: 1, audioPolicy: "preserve", audioTrack: 1, audioInserted: true, storyboardItemId: "item_a2", editorialKind: "a_roll" },
      { id: "scene_3", source: "/media/logo.mov", startMs: 8_000, sourceInMs: 0, durationMs: 2_000, videoTrack: 1, audioPolicy: "mute", audioTrack: -1, audioInserted: false, storyboardItemId: "item_logo", editorialKind: "logo_outro" }
    ],
    dynamicLinks: [
      { id: "dl_title", project: "/media/title.aep", composition: "Main", startMs: 2_000, durationMs: 2_000, videoTrack: 3, audioPolicy: "mute", audioTrack: -1, audioInserted: false, storyboardItemId: "item_title", editorialKind: "title" }
    ],
    overlays: [
      { id: "ov_cover", asset: "/media/cover.png", startMs: 4_000, durationMs: 2_000, videoTrack: 2, audioPolicy: "mute", audioTrack: -1, audioInserted: false, storyboardItemId: "item_cover", editorialKind: "cover_card" }
    ]
  };

  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "wf_audio_valid",
    dryRun: false,
    status: "success",
    steps: {
      compose: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: validTimeline } },
      build: { status: "success", startedAt: now, finishedAt: now, outputs: validReceipts }
    }
  }));

  const resValid = await verifyGraphWorkflow(runDir, wfValid);
  assert.equal(resValid.ok, true, resValid.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`).join("\n"));
  assert.equal(resValid.checks.find((c) => c.id === "workflow.audio.a_roll_continuity")?.ok, true);

  // 2. Negative: Missing provenance on one scene when others have it
  const invalidProvenanceTimeline = {
    ...validTimeline,
    scenes: [
      validTimeline.scenes[0],
      { id: "scene_2", source: "/media/a2.mov", startMs: 6_000, durationMs: 2_000, track: 1, audio: true, audioPolicy: "preserve" }, // missing provenance
      validTimeline.scenes[2]
    ]
  };
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "wf_audio_valid",
    dryRun: false,
    status: "success",
    steps: {
      compose: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: invalidProvenanceTimeline } }
    }
  }));
  const resProv = await verifyGraphWorkflow(runDir, wfValid);
  assert.equal(resProv.ok, false);
  assert.equal(resProv.checks.some((c) => c.id === "workflow.audio.scene.scene_2.provenance" && !c.ok), true);

  // 3. Negative: B-roll spanning a dialogue gap does NOT excuse it
  const brollGapTimeline = {
    schemaVersion: 1,
    name: "MAIN",
    width: 1920,
    height: 1080,
    frameRate: 25,
    durationMs: 10_000,
    scenes: [
      { id: "scene_1", source: "/media/a1.mov", startMs: 0, durationMs: 2_000, track: 1, audio: true, audioPolicy: "preserve", storyboardItemId: "item_a1", editorialKind: "a_roll" },
      { id: "scene_2", source: "/media/a2.mov", startMs: 6_000, durationMs: 2_000, track: 1, audio: true, audioPolicy: "preserve", storyboardItemId: "item_a2", editorialKind: "a_roll" }
    ],
    overlays: [
      // B-roll spanning the [2000, 6000] gap
      { id: "ov_broll", asset: "/media/broll.mp4", startMs: 2_000, durationMs: 4_000, track: 2, audioPolicy: "mute", storyboardItemId: "item_broll", editorialKind: "b_roll" }
    ]
  };
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "wf_audio_valid",
    dryRun: false,
    status: "success",
    steps: {
      compose: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: brollGapTimeline } }
    }
  }));
  const resBrollGap = await verifyGraphWorkflow(runDir, wfValid);
  assert.equal(resBrollGap.ok, false);
  assert.equal(resBrollGap.checks.some((c) => c.id === "workflow.audio.a_roll_continuity" && !c.ok), true);

  // 4. Negative: Receipt provenance mismatch fails
  const mismatchedReceipts = {
    ...validReceipts,
    scenes: [
      { ...validReceipts.scenes[0], storyboardItemId: "WRONG_ID" },
      validReceipts.scenes[1],
      validReceipts.scenes[2]
    ]
  };
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "wf_audio_valid",
    dryRun: false,
    status: "success",
    steps: {
      compose: { status: "success", startedAt: now, finishedAt: now, outputs: { timelineSpec: validTimeline } },
      build: { status: "success", startedAt: now, finishedAt: now, outputs: mismatchedReceipts }
    }
  }));
  const resReceiptMismatch = await verifyGraphWorkflow(runDir, wfValid);
  assert.equal(resReceiptMismatch.ok, false);
  assert.equal(resReceiptMismatch.checks.some((c) => c.id === "output.build.scene.scene_1.receipt" && !c.ok), true);
  assert.equal(resReceiptMismatch.checks.some((c) => c.id === "workflow.audio.receipt.scene.scene_1" && !c.ok), true);
});

test("graph verifier binds master normalization receipts to resolved inputs and disk identities", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-audio-normalize-verifier-"));
  const sourcePath = path.join(runDir, "premiere.mp4");
  const outputPath = path.join(runDir, "broadcast.mp4");
  const sourceBytes = Buffer.alloc(2048, 3);
  const outputBytes = Buffer.alloc(2048, 4);
  await writeFile(sourcePath, sourceBytes);
  await writeFile(outputPath, outputBytes);
  const sha = (value) => createHash("sha256").update(value).digest("hex");
  const now = new Date().toISOString();
  const policy = { targetLufs: -23, maxTruePeakDbfs: -1, loudnessRange: 11, audioBitrateKbps: 320 };
  const outputs = {
    media: outputPath,
    sourcePath,
    outputPath,
    policy,
    source: { path: sourcePath, sha256: sha(sourceBytes), sizeBytes: sourceBytes.length },
    output: { path: outputPath, sha256: sha(outputBytes), sizeBytes: outputBytes.length }
  };
  const workflow = { id: "normalize_wf", steps: [{
    id: "normalize",
    type: "media.audio_normalize",
    with: { source: sourcePath, output: outputPath, targetLufs: -23, maxTruePeakDbfs: -1, loudnessRange: 11, audioBitrateKbps: 320 }
  }] };
  const writeState = async (value) => writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "normalize_wf",
    runId: "normalize_run",
    dryRun: false,
    status: "success",
    steps: { normalize: { status: "success", startedAt: now, finishedAt: now, outputs: value } }
  }));

  await writeState(outputs);
  const valid = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(valid.ok, true, valid.checks.filter((check) => !check.ok).map((check) => `${check.id}: ${check.detail}`).join("\n"));

  await writeState({ ...outputs, output: { ...outputs.output, sha256: sha(Buffer.from("forged")) } });
  const forged = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(forged.ok, false);
  assert.equal(forged.checks.some((check) => check.id === "output.normalize.output_sha256" && !check.ok), true);
});

test("graph verifier validates audio.loudness_qc live receipts and rejects invalid or dry-run states", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-audio-loudness-qc-verifier-"));
  const wavPath = path.join(runDir, "master.wav");
  const wavBytes = Buffer.alloc(1024, 7);
  await writeFile(wavPath, wavBytes);
  const wavSha256 = createHash("sha256").update(wavBytes).digest("hex");
  const wavSize = wavBytes.length;

  const receiptPath = path.join(runDir, "loudness-qc-receipt.json");
  const now = new Date().toISOString();

  const policy = {
    targetLufs: -23.0,
    toleranceLufs: 1.0,
    maxTruePeakDbfs: -1.0,
    silenceThresholdDbfs: -50.0,
    minSilenceMs: 1000,
    maxUnexpectedSilenceMs: 500
  };

  const validReport = {
    schemaVersion: 1,
    source: {
      path: wavPath,
      sha256: wavSha256,
      size: wavSize
    },
    policy,
    metadata: {
      durationSeconds: 10.0,
      durationMs: 10000,
      audioStream: { codec: "pcm_s16le", sampleRate: 48000, channels: 2 }
    },
    measurements: {
      integratedLufs: -23.2,
      truePeakDbfs: -1.5,
      loudnessRange: 6.0,
      threshold: -33.2,
      targetOffset: 0.2
    },
    silence: {
      detectedIntervals: [],
      expectedMuteWindows: [],
      unexpectedIntervals: []
    },
    checks: {
      loudness: { passed: true, targetLufs: -23.0, toleranceLufs: 1.0, actualLufs: -23.2, diffLufs: 0.2 },
      truePeak: { passed: true, maxTruePeakDbfs: -1.0, actualTruePeakDbfs: -1.5 },
      silence: { passed: true, maxUnexpectedSilenceMs: 500, unexpectedIntervals: [] },
      audioStream: { passed: true }
    },
    passed: true,
    measured: true,
    measuredAt: now
  };

  await writeFile(receiptPath, JSON.stringify(validReport, null, 2));

  const workflow = {
    id: "audio_qc_wf",
    steps: [
      {
        id: "qc",
        type: "audio.loudness_qc",
        with: {
          source: wavPath,
          ...policy
        }
      }
    ]
  };

  // 1. Positive: Valid report and receipt passes verification
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "audio_qc_wf",
    dryRun: false,
    status: "success",
    steps: {
      qc: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: {
          report: validReport,
          receiptPath
        }
      }
    }
  }));

  const resValid = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(resValid.ok, true, resValid.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`).join("\n"));

  // 2. Negative: Tampered source file sha256 fails verification
  await writeFile(wavPath, Buffer.alloc(1024, 9)); // Change bytes
  const resTamperedSource = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(resTamperedSource.ok, false);
  assert.equal(resTamperedSource.checks.some((c) => c.id === "output.qc.source_sha_match" && !c.ok), true);
  await writeFile(wavPath, wavBytes); // Restore

  // 3. Negative: Policy mismatch between step.with and report fails
  const policyMismatchWorkflow = {
    id: "audio_qc_wf",
    steps: [
      {
        id: "qc",
        type: "audio.loudness_qc",
        with: {
          source: wavPath,
          ...policy,
          targetLufs: -16.0 // Differs from report targetLufs -23.0
        }
      }
    ]
  };
  const resPolicyMismatch = await verifyGraphWorkflow(runDir, policyMismatchWorkflow);
  assert.equal(resPolicyMismatch.ok, false);
  assert.equal(resPolicyMismatch.checks.some((c) => c.id === "output.qc.policy_target_lufs" && !c.ok), true);

  // 4. Negative: Fake passed: true with failing check
  const fakePassedReport = structuredClone(validReport);
  fakePassedReport.checks.loudness.passed = false;
  await writeFile(receiptPath, JSON.stringify(fakePassedReport, null, 2));
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "audio_qc_wf",
    dryRun: false,
    status: "success",
    steps: {
      qc: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: { report: fakePassedReport, receiptPath }
      }
    }
  }));
  const resFakePassed = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(resFakePassed.ok, false);
  assert.equal(resFakePassed.checks.some((c) => c.id === "output.qc.check_loudness" && !c.ok), true);

  // 4b. A fully forged pass outside policy must fail even when disk receipt matches state.
  const forgedMetrics = structuredClone(validReport);
  forgedMetrics.measurements.integratedLufs = -40.0;
  forgedMetrics.checks.loudness = { passed: true, targetLufs: -23.0, toleranceLufs: 1.0, actualLufs: -40.0, diffLufs: 0.0 };
  await writeFile(receiptPath, JSON.stringify(forgedMetrics, null, 2));
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "audio_qc_wf",
    dryRun: false,
    status: "success",
    steps: { qc: { status: "success", startedAt: now, finishedAt: now, outputs: { report: forgedMetrics, receiptPath } } }
  }));
  const resForgedMetrics = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(resForgedMetrics.ok, false);
  assert.equal(resForgedMetrics.checks.some((c) => c.id === "output.qc.check_loudness" && !c.ok), true);

  // 4c. Disk receipt must match the checkpoint report in full, not only pass + source hash.
  await writeFile(receiptPath, JSON.stringify({ ...validReport, measuredAt: new Date(Date.parse(now) + 1000).toISOString() }, null, 2));
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "audio_qc_wf",
    dryRun: false,
    status: "success",
    steps: { qc: { status: "success", startedAt: now, finishedAt: now, outputs: { report: validReport, receiptPath } } }
  }));
  const resReceiptTampered = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(resReceiptTampered.ok, false);
  assert.equal(resReceiptTampered.checks.some((c) => c.id === "output.qc.receipt_match" && !c.ok), true);

  // 5. Negative: NaN measurement fails
  const nanReport = structuredClone(validReport);
  nanReport.measurements.integratedLufs = NaN;
  await writeFile(receiptPath, JSON.stringify(nanReport, null, 2));
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "audio_qc_wf",
    dryRun: false,
    status: "success",
    steps: {
      qc: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: { report: nanReport, receiptPath }
      }
    }
  }));
  const resNan = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(resNan.ok, false);
  assert.equal(resNan.checks.some((c) => c.id === "output.qc.measurements_finite" && !c.ok), true);

  // 6. Negative: Dry-run unmeasured report fails live verification
  const dryRunReport = {
    measured: false,
    passed: false,
    source: { path: wavPath },
    policy
  };
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "audio_qc_wf",
    dryRun: false,
    status: "success",
    steps: {
      qc: {
        status: "success",
        startedAt: now,
        finishedAt: now,
        outputs: { report: dryRunReport, receiptPath: null }
      }
    }
  }));
  const resDryRun = await verifyGraphWorkflow(runDir, workflow);
  assert.equal(resDryRun.ok, false);
  assert.equal(resDryRun.checks.some((c) => c.id === "output.qc.measured" && !c.ok), true);
  assert.equal(resDryRun.checks.some((c) => c.id === "output.qc.passed" && !c.ok), true);
});
