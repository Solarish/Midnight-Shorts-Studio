import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { adapters } from "../src/adapters/index.js";
import { probeMedia, parseFrameRate } from "../src/adapters/media.js";
import { buildAudioMixPlan, deriveExpectedMuteWindows, generateJaiTts, mergeIntervals, mixAudio, normalizeMasterAudio, parseLoudnormOutput, parseSilencedetectOutput, qcAudioLoudness, selectAudioAsset, subtractIntervals } from "../src/adapters/audio.js";
import { composeTimeline, createTimelineDynamicLink, createTimelineGraphicMogrt, createTimelineOverlay, createTimelineScene, createTimelineTransition } from "../src/adapters/timeline.js";
import { buildPremiere, exportPremiere, hashPremiereInputs, validatePremiereExport } from "../src/adapters/premiere.js";
import { runProcess } from "../src/core/process.js";

function context(root, overrides = {}) {
  return {
    configDir: root,
    runDir: root,
    stepDir: path.join(root, "step"),
    step: { id: "test_step", type: "test" },
    settings: { pollIntervalMs: 1, services: {}, adobe: { premiere: { bridgeHost: "127.0.0.1", bridgePort: 47652, launch: false } } },
    timeoutMs: 2_000,
    dryRun: false,
    resolvePath: (value) => path.resolve(root, value),
    resolveRunPath: (value) => path.resolve(root, value),
    log() {},
    ...overrides
  };
}

test("media and timeline adapters expose stable declarative contracts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-media-timeline-"));
  try {
    const dryContext = context(root, { dryRun: true });
    const probe = await probeMedia({ path: "clip.mov" }, dryContext);
    assert.equal(probe.command, "ffprobe");
    assert.equal(probe.args.at(-1), path.join(root, "clip.mov"));
    assert.equal(parseFrameRate("30000/1001"), 30000 / 1001);

    const { scene } = await createTimelineScene({ source: "/tmp/clip.mov", durationMs: 2_000, audio: true, audioPolicy: "preserve" }, dryContext);
    const { timelineSpec } = await composeTimeline({
      name: "STORY",
      width: 1080,
      height: 1920,
      frameRate: 25,
      scenes: [scene],
      overlays: [{ id: "title", text: "PSU", startMs: 0, durationMs: 1_000, track: 2, audioPolicy: "mute" }]
    });
    assert.equal(timelineSpec.schemaVersion, 1);
    assert.equal(timelineSpec.durationMs, 2_000);
    assert.equal(timelineSpec.scenes[0].source, "/tmp/clip.mov");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("timeline graphic MOGRT remains editable and validates absolute path, text, frame alignment and bounds", async () => {
  const dryContext = context("/tmp", { dryRun: true });
  const { graphic } = await createTimelineGraphicMogrt({ id: "cover_text", mogrtPath: "/templates/cover.mogrt", startMs: 0, durationMs: 1000, track: 4, text: { personName: "สมชาย" }, parameterMap: { personName: "PERSON_NAME" } }, dryContext);
  const timelineSpec = (await composeTimeline({ scenes: [{ id: "scene", source: "/tmp/a.mov", startMs: 0, sourceInMs: 0, durationMs: 2000, track: 1, audio: true, audioPolicy: "preserve" }], graphics: [graphic] })).timelineSpec;
  assert.equal(timelineSpec.graphics[0].track, 4);
  assert.equal(timelineSpec.graphics[0].text.personName, "สมชาย");
  await assert.rejects(createTimelineGraphicMogrt({ id: "bad", mogrtPath: "", durationMs: 1000, text: {} }, dryContext), /Media path|editable text/);
  await assert.rejects(composeTimeline({ scenes: timelineSpec.scenes, graphics: [{ ...graphic, durationMs: 2040 }] }), /exceeds timeline bounds/);
  await assert.rejects(composeTimeline({ scenes: timelineSpec.scenes, graphics: [{ ...graphic, startMs: 10 }] }), /align to 40ms/);
});

test("timeline graphic materializes a pre-seeded editable MOGRT before composition", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-timeline-seeded-mogrt-"));
  try {
    const liveContext = context(root);
    const text = { personName: "สมชาย", positionTitle: "ศาสตราจารย์", award: "รางวัลดีเด่น" };
    const { graphic } = await createTimelineGraphicMogrt({
      id: "cover_text",
      mogrtPath: path.resolve("templates/premiere/psu-cover-text.mogrt"),
      seededOutput: "media/cover/cover-text.mogrt",
      bindingMode: "preseeded",
      startMs: 0,
      durationMs: 1000,
      track: 4,
      text,
      parameterMap: { personName: "PERSON_NAME", positionTitle: "POSITION_TITLE", award: "AWARD" }
    }, liveContext);
    assert.equal(graphic.bindingMode, "preseeded");
    assert.equal(graphic.seedReceipt.mode, "preseeded");
    assert.equal(graphic.seedReceipt.outputSha256.length, 64);
    assert.equal(graphic.mogrtPath, path.join(root, "media/cover/cover-text.mogrt"));
    const timelineSpec = (await composeTimeline({ scenes: [{ id: "scene", source: "/tmp/a.mov", durationMs: 2000, audio: true, audioPolicy: "preserve" }], graphics: [graphic] })).timelineSpec;
    assert.equal(timelineSpec.graphics[0].seedReceipt.outputPath, graphic.mogrtPath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("timeline auto-places omitted starts with adjacent transition overlap on 25fps frames", async () => {
  const dryContext = context("/tmp", { dryRun: true });
  const scenes = [];
  for (const [id, durationMs] of [["one", 1_000], ["two", 2_000], ["three", 1_000]]) {
    scenes.push((await createTimelineScene({ id, source: `/tmp/${id}.mov`, durationMs, audio: true, audioPolicy: "preserve" }, dryContext)).scene);
  }
  assert.equal(scenes.every((scene) => scene.startMs === undefined), true, "scene adapter must preserve omitted startMs");
  const transitions = [
    (await createTimelineTransition({ id: "one_two", type: "cross-dissolve", durationMs: 240, fromScene: "one", toScene: "two" }, dryContext)).transition,
    (await createTimelineTransition({ id: "two_three", type: "cross-dissolve", durationMs: 240, fromScene: "two", toScene: "three" }, dryContext)).transition
  ];
  const { timelineSpec } = await composeTimeline({ scenes, transitions, frameRate: 25 });
  assert.deepEqual(timelineSpec.scenes.map((scene) => scene.startMs), [0, 760, 2_520]);
  assert.equal(timelineSpec.durationMs, 3_520);
});

test("timeline preserves explicit starts and rejects off-frame, invalid overlap, collision, and bounds", async () => {
  const base = [
    { id: "one", source: "/tmp/one.mov", startMs: 0, sourceInMs: 0, durationMs: 1_000, track: 1, audio: true, audioPolicy: "preserve" },
    { id: "two", source: "/tmp/two.mov", startMs: 1_200, sourceInMs: 0, durationMs: 800, track: 1, audio: true, audioPolicy: "preserve" }
  ];
  const explicit = (await composeTimeline({ scenes: base })).timelineSpec;
  assert.deepEqual(explicit.scenes.map((scene) => scene.startMs), [0, 1_200]);

  await assert.rejects(composeTimeline({ scenes: [{ ...base[0], durationMs: 1_001 }] }), /align to 40ms frames/);
  await assert.rejects(composeTimeline({
    scenes: [base[0], { ...base[1], startMs: 800 }]
  }), /collide on track 1/);
  await assert.rejects(composeTimeline({
    scenes: [base[0], { ...base[1], startMs: 800 }],
    transitions: [{ id: "bad_overlap", type: "cross-dissolve", durationMs: 160, fromScene: "one", toScene: "two" }]
  }), /requires exactly 160ms overlap/);
  await assert.rejects(composeTimeline({
    scenes: [...base, { id: "three", source: "/tmp/three.mov", startMs: 2_000, sourceInMs: 0, durationMs: 400, track: 1, audio: true, audioPolicy: "preserve" }],
    transitions: [{ id: "non_adjacent", type: "cross-dissolve", durationMs: 80, fromScene: "one", toScene: "three" }]
  }), /must reference adjacent scenes/);
  await assert.rejects(composeTimeline({
    scenes: base,
    overlays: [{ id: "late", text: "late", startMs: 1_800, durationMs: 400, track: 2, audioPolicy: "mute" }]
  }), /exceeds timeline bounds/);
  await assert.rejects(composeTimeline({
    scenes: base,
    overlays: [
      { id: "a", text: "a", startMs: 0, durationMs: 400, track: 2, audioPolicy: "mute" },
      { id: "b", text: "b", startMs: 200, durationMs: 400, track: 2, audioPolicy: "mute" }
    ]
  }), /collide on track 2/);
});

test("audio adapters return canonical wrappers that compose directly into a timeline", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-audio-compose-"));
  try {
    const dryContext = context(root, { dryRun: true });
    const music = await selectAudioAsset({
      id: "music-bed",
      path: "/tmp/music.wav",
      role: "music",
      startMs: 0,
      gainDb: -12,
      durationMs: 2_000
    }, { ...dryContext, step: { id: "music" } });
    const voice = await generateJaiTts({
      id: "voiceover",
      text: "สวัสดี",
      voice: "th-TH",
      output: "outputs/voice.wav"
    }, { ...dryContext, step: { id: "voice" } });

    assert.deepEqual(
      {
        id: music.audio.id,
        path: music.audio.path,
        role: music.audio.role,
        startMs: music.audio.startMs,
        gainDb: music.audio.gainDb
      },
      { id: "music-bed", path: "/tmp/music.wav", role: "music", startMs: 0, gainDb: -12 }
    );
    assert.equal(voice.audio.role, "voiceover");

    const mixed = await mixAudio({
      id: "program-mix",
      inputs: [music, voice],
      output: "outputs/program.wav"
    }, { ...dryContext, step: { id: "mix" } });

    assert.equal(mixed.audio.id, "program-mix");
    assert.equal(mixed.audio.role, "music");
    assert.equal(mixed.audio.startMs, 0);
    assert.equal(mixed.audio.gainDb, 0);
    assert.match(mixed.args.join(" "), /sidechaincompress/);

    const composed = await composeTimeline({
      scenes: [{ id: "scene", source: "/tmp/source.mov", durationMs: 2_000, audio: true, audioPolicy: "preserve" }],
      audio: [mixed]
    });
    assert.deepEqual(composed.timelineSpec.audio, [{
      id: "program-mix",
      path: mixed.audio.path,
      role: "music",
      startMs: 0,
      gainDb: 0
    }]);

    await assert.rejects(composeTimeline({
      scenes: [{ id: "scene", source: "/tmp/source.mov", durationMs: 2_000, audio: true, audioPolicy: "preserve" }],
      audio: [{ audio: { id: "off-frame", path: "/tmp/off.wav", role: "music", startMs: 20 } }]
    }), /align to 40ms frames/);
    await assert.rejects(composeTimeline({
      scenes: [{ id: "scene", source: "/tmp/source.mov", durationMs: 2_000, audio: true, audioPolicy: "preserve" }],
      audio: [{ audio: { id: "late", path: "/tmp/late.wav", role: "music", startMs: 2_040 } }]
    }), /exceeds timeline bounds/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("audio mix dry-run builds loudness, fade, and voice-over ducking filters", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-audio-mix-"));
  try {
    const input = {
      inputs: [
        { path: "/tmp/music.wav", role: "music", durationMs: 10_000, fadeOutMs: 500 },
        { path: "/tmp/voice.wav", role: "voiceover", startMs: 250, fadeInMs: 100 }
      ],
      output: "outputs/mix.wav",
      ducking: { ratio: 6 }
    };
    const result = await mixAudio(input, context(root, { dryRun: true }));
    assert.equal(result.command, "ffmpeg");
    assert.match(result.args.join(" "), /loudnorm/);
    assert.match(result.args.join(" "), /asplit=2/);
    assert.match(result.args.join(" "), /sidechaincompress/);
    assert.match(result.args.join(" "), /ratio=6/);
    const plan = buildAudioMixPlan(result.inputs, { targetLufs: -14, ducking: {} });
    assert.match(plan.filterComplex, /I=-14/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("master audio normalization dry-run copies video and normalizes only the audio stream", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-master-normalize-"));
  try {
    const result = await normalizeMasterAudio({
      source: "outputs/premiere-master.mp4",
      output: "outputs/broadcast-master.mp4",
      targetLufs: -23,
      maxTruePeakDbfs: -1
    }, context(root, { dryRun: true }));
    assert.equal(result.media, path.join(root, "outputs/broadcast-master.mp4"));
    assert.match(result.args.join(" "), /-c:v copy/);
    assert.match(result.args.join(" "), /loudnorm=I=-23:LRA=11:TP=-1/);
    assert.match(result.args.join(" "), /-c:a aac/);
    await assert.rejects(normalizeMasterAudio({
      source: "outputs/same.mp4",
      output: "outputs/same.mp4",
      targetLufs: -23,
      maxTruePeakDbfs: -1
    }, context(root, { dryRun: true })), /must differ/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("master audio normalization live output passes the declared loudness policy", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-master-normalize-live-"));
  try {
    const source = path.join(root, "source.mp4");
    await runProcess("ffmpeg", [
      "-nostdin", "-hide_banner", "-y",
      "-f", "lavfi", "-i", "color=c=navy:s=320x180:r=25:d=2",
      "-f", "lavfi", "-i", "sine=frequency=1000:duration=2",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source
    ], { timeoutMs: 10_000 });
    const runContext = context(root, { timeoutMs: 10_000 });
    const normalized = await normalizeMasterAudio({
      source,
      output: "outputs/broadcast-master.mp4",
      targetLufs: -23,
      maxTruePeakDbfs: -1
    }, runContext);
    assert.equal(normalized.output.path, path.join(root, "outputs/broadcast-master.mp4"));
    assert.match(normalized.output.sha256, /^[a-f0-9]{64}$/);
    const qc = await qcAudioLoudness({
      source: normalized.media,
      targetLufs: -23,
      toleranceLufs: 1.5,
      maxTruePeakDbfs: -1,
      silenceThresholdDbfs: -50,
      minSilenceMs: 500,
      maxUnexpectedSilenceMs: 0
    }, runContext);
    assert.equal(qc.report.passed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("JaiTTS uses generation.id, exact status endpoint, and relative output_url", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-jaitts-"));
  const calls = [];
  const wav = Buffer.from("RIFF-test-wave");
  const responses = [
    { json: { voices: [{ id: "th-female" }] } },
    { json: { generation: { id: "gen-123" } } },
    { json: { status: "processing" } },
    { json: { status: "completed", output_url: "/audio/gen-123.wav" } },
    { bytes: wav }
  ];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? "GET" });
    const next = responses.shift();
    return {
      ok: true,
      status: 200,
      async json() { return next.json; },
      async arrayBuffer() { return next.bytes.buffer.slice(next.bytes.byteOffset, next.bytes.byteOffset + next.bytes.byteLength); }
    };
  };
  try {
    const result = await generateJaiTts({
      text: "สวัสดี",
      voice: "th-female",
      output: "outputs/voice.wav",
      baseUrl: "http://jaitts.local:9000",
      pollIntervalMs: 1
    }, context(root, { fetch: fakeFetch }));
    assert.deepEqual(calls.map((call) => call.url), [
      "http://jaitts.local:9000/api/voices",
      "http://jaitts.local:9000/api/generate",
      "http://jaitts.local:9000/api/generate/gen-123/status",
      "http://jaitts.local:9000/api/generate/gen-123/status",
      "http://jaitts.local:9000/audio/gen-123.wav"
    ]);
    assert.equal(result.audio.jobId, "gen-123");
    assert.equal(result.audio.role, "voiceover");
    assert.deepEqual(await readFile(result.audio.path), wav);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("JaiTTS refuses to duplicate an ambiguous generation submission", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-jaitts-ambiguous-"));
  const stepDir = path.join(root, "step");
  await mkdir(stepDir, { recursive: true });
  const body = { text: "สวัสดี", voice: "th-female" };
  const { createHash } = await import("node:crypto");
  const requestDigest = createHash("sha256").update(JSON.stringify({ baseUrl: "http://jaitts.local:9000", body })).digest("hex");
  await writeFile(path.join(stepDir, "jaitts-generation.json"), JSON.stringify({ schemaVersion: 1, state: "submitting", requestDigest }));
  let fetchCalls = 0;
  try {
    await assert.rejects(generateJaiTts({ ...body, output: "outputs/voice.wav", baseUrl: "http://jaitts.local:9000" }, context(root, { fetch: async () => { fetchCalls += 1; throw new Error("must not fetch"); } })), (error) => error.code === "JAITTS_SUBMISSION_AMBIGUOUS" && error.unsafeToResume === true);
    assert.equal(fetchCalls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Premiere build dry-run emits a fenced build-only TimelineSpec job for inspection", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-premiere-build-"));
  try {
    const timelineSpec = (await composeTimeline({
      scenes: [{ id: "scene", source: "/tmp/source.mov", startMs: 0, sourceInMs: 0, durationMs: 1_000, track: 1, audio: true, audioPolicy: "preserve" }]
    })).timelineSpec;
    const result = await buildPremiere({ outputProject: "outputs/final.prproj", sequencePresetPath: "/tmp/ava-25fps.sqpreset", timelineSpec }, context(root, { dryRun: true }));
    assert.equal(result.job.protocolVersion, 1);
    assert.equal(result.job.type, "premiere.build");
    assert.deepEqual(result.job.exports, []);
    assert.equal(result.job.sequencePresetPath, "/tmp/ava-25fps.sqpreset");
    assert.match(result.project, /final\.prproj$/);
    assert.match(result.sequenceGuid, /^dry-run-/);

    const exported = await exportPremiere({ project: "/tmp/final.prproj" }, context(root, {
      dryRun: true,
      settings: { adobe: { premiere: { bridgeHost: "127.0.0.1", bridgePort: 47652, launch: false, exportPresets: { h264: "/tmp/h264.epr", prores: "/tmp/prores.epr" } } } }
    }));
    assert.deepEqual(exported.job.exports.map((entry) => entry.format), ["h264", "prores"]);
    assert.equal(exported.job.exports[0].presetPath, "/tmp/h264.epr");
    assert.deepEqual(exported.exports.map((entry) => entry.format), ["h264", "prores"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Premiere export finalization validates playable codec metadata with ffprobe", async () => {
  const calls = [];
  const media = await validatePremiereExport({ format: "h264", output: "/tmp/final.mp4" }, async (...args) => {
    calls.push(args);
    return { stdout: JSON.stringify({
      format: { duration: "464.000000" },
      streams: [
        { codec_type: "video", codec_name: "h264", width: 1920, height: 1080 },
        { codec_type: "audio", codec_name: "aac" }
      ]
    }) };
  });
  assert.equal(calls[0][0], "ffprobe");
  assert.equal(media.duration, 464);
  assert.equal(media.videoCodec, "h264");
  assert.equal(media.audioCodec, "aac");

  await assert.rejects(validatePremiereExport({ format: "prores", output: "/tmp/partial.mov" }, async () => ({
    stdout: JSON.stringify({ format: {}, streams: [] })
  })), /not a finalized playable media file/);
});

test("timeline validates and retains Dynamic Link and rejects each unsafe category", async () => {
  const dryContext = context("/tmp", { dryRun: true });
  const scenes = [{ id: "scene", source: "/tmp/source.mov", startMs: 0, durationMs: 5_000, track: 1, audio: true, audioPolicy: "preserve" }];
  const dl = await createTimelineDynamicLink({
    id: "dl_intro",
    project: "/tmp/intro.aep",
    composition: "Main",
    startMs: 0,
    durationMs: 2_000,
    track: 3,
    audioPolicy: "mute"
  }, dryContext);

  const { timelineSpec } = await composeTimeline({
    scenes,
    dynamicLinks: [dl.dynamicLink]
  });

  assert.deepEqual(timelineSpec.dynamicLinks, [{
    id: "dl_intro",
    project: "/tmp/intro.aep",
    composition: "Main",
    startMs: 0,
    durationMs: 2_000,
    track: 3,
    audioPolicy: "mute"
  }]);

  // Unsafe id
  await assert.rejects(composeTimeline({
    scenes,
    dynamicLinks: [{ ...dl.dynamicLink, id: "bad id!" }]
  }), /invalid/);

  // Relative AEP path
  await assert.rejects(composeTimeline({
    scenes,
    dynamicLinks: [{ ...dl.dynamicLink, project: "relative/path.aep" }]
  }), /absolute path/);

  // Empty composition
  await assert.rejects(composeTimeline({
    scenes,
    dynamicLinks: [{ ...dl.dynamicLink, composition: "   " }]
  }), /non-empty string/);

  // Off-frame startMs
  await assert.rejects(composeTimeline({
    scenes,
    dynamicLinks: [{ ...dl.dynamicLink, startMs: 15 }]
  }), /align to 40ms frames/);

  // Off-frame durationMs
  await assert.rejects(composeTimeline({
    scenes,
    dynamicLinks: [{ ...dl.dynamicLink, durationMs: 1001 }]
  }), /align to 40ms frames/);

  // Invalid track
  await assert.rejects(composeTimeline({
    scenes,
    dynamicLinks: [{ ...dl.dynamicLink, track: 0 }]
  }), /greater than zero/);

  // audioPolicy other than mute
  await assert.rejects(composeTimeline({
    scenes,
    dynamicLinks: [{ ...dl.dynamicLink, audioPolicy: "unmute" }]
  }), /must equal 'mute'/);

  // Duplicate dynamicLink id
  await assert.rejects(composeTimeline({
    scenes,
    dynamicLinks: [dl.dynamicLink, dl.dynamicLink]
  }), /duplicates/);

  // Out of bounds
  await assert.rejects(composeTimeline({
    scenes,
    dynamicLinks: [{ ...dl.dynamicLink, startMs: 4_000, durationMs: 2_000 }]
  }), /exceeds timeline bounds/);

  // Same-track collision
  await assert.rejects(composeTimeline({
    scenes,
    dynamicLinks: [
      { ...dl.dynamicLink, id: "dl1", startMs: 0, durationMs: 2_000, track: 3 },
      { ...dl.dynamicLink, id: "dl2", startMs: 1_000, durationMs: 2_000, track: 3 }
    ]
  }), /collide on track 3/);
});

test("createTimelineDynamicLink strictly requires all fields without defaulting or path resolution", async () => {
  const dryContext = context("/tmp", { dryRun: true });
  const valid = {
    id: "dl_intro",
    project: "/tmp/intro.aep",
    composition: "Main",
    startMs: 0,
    durationMs: 2_000,
    track: 3,
    audioPolicy: "mute"
  };

  const created = await createTimelineDynamicLink(valid, dryContext);
  assert.deepEqual(created.dynamicLink, valid);

  // Missing id
  await assert.rejects(createTimelineDynamicLink({ ...valid, id: undefined }, dryContext), /requires with.id/);

  // Missing project
  await assert.rejects(createTimelineDynamicLink({ ...valid, project: undefined }, dryContext), /requires with.project/);

  // Relative project path
  await assert.rejects(createTimelineDynamicLink({ ...valid, project: "relative.aep" }, dryContext), /must be an absolute path/);

  // Missing composition
  await assert.rejects(createTimelineDynamicLink({ ...valid, composition: undefined }, dryContext), /requires with.composition/);

  // Missing startMs
  await assert.rejects(createTimelineDynamicLink({ ...valid, startMs: undefined }, dryContext), /requires with.startMs/);

  // Missing durationMs
  await assert.rejects(createTimelineDynamicLink({ ...valid, durationMs: undefined }, dryContext), /requires with.durationMs/);

  // Missing track
  await assert.rejects(createTimelineDynamicLink({ ...valid, track: undefined }, dryContext), /requires with.track/);

  // Missing audioPolicy
  await assert.rejects(createTimelineDynamicLink({ ...valid, audioPolicy: undefined }, dryContext), /requires with.audioPolicy/);

  // Non-mute audioPolicy
  await assert.rejects(createTimelineDynamicLink({ ...valid, audioPolicy: "unmute" }, dryContext), /must equal 'mute'/);
});

test("Premiere build dry-run retains Dynamic Link and hashes AEP project in content identity", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-premiere-build-dl-"));
  try {
    const timelineSpec = (await composeTimeline({
      scenes: [{ id: "scene", source: "/tmp/source.mov", startMs: 0, durationMs: 5_000, track: 1, audio: true, audioPolicy: "preserve" }],
      dynamicLinks: [{
        id: "dl_title",
        project: "/tmp/title.aep",
        composition: "Main",
        startMs: 0,
        durationMs: 3_000,
        track: 3,
        audioPolicy: "mute"
      }]
    })).timelineSpec;

    const result = await buildPremiere({
      outputProject: "outputs/final.prproj",
      sequencePresetPath: "/tmp/ava-25fps.sqpreset",
      timelineSpec
    }, context(root, { dryRun: true }));

    assert.equal(result.job.type, "premiere.build");
    assert.deepEqual(result.job.timelineSpec.dynamicLinks, timelineSpec.dynamicLinks);

    const hashes = await hashPremiereInputs(result.job);
    const hashedPaths = hashes.map((entry) => entry.path);
    assert.ok(hashedPaths.includes("/tmp/title.aep"), "AEP project must be included in content identity hashing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("timeline.scene and timeline.overlay require explicit audioPolicy and literal boolean audio", async () => {
  const dryContext = context("/tmp", { dryRun: true });

  // Missing audio on scene
  await assert.rejects(createTimelineScene({ source: "/tmp/clip.mov", durationMs: 2_000, audioPolicy: "preserve" }, dryContext), /requires with.audio to be a boolean/);

  // Non-boolean audio on scene
  await assert.rejects(createTimelineScene({ source: "/tmp/clip.mov", durationMs: 2_000, audio: "true", audioPolicy: "preserve" }, dryContext), /requires with.audio to be a boolean/);

  // Missing audioPolicy on scene
  await assert.rejects(createTimelineScene({ source: "/tmp/clip.mov", durationMs: 2_000, audio: true }, dryContext), /requires with.audioPolicy/);

  // Invalid audioPolicy on scene
  await assert.rejects(createTimelineScene({ source: "/tmp/clip.mov", durationMs: 2_000, audio: true, audioPolicy: "auto" }, dryContext), /timeline.scene audioPolicy/);

  // Mismatch: audio=false with audioPolicy='preserve'
  await assert.rejects(createTimelineScene({ source: "/tmp/clip.mov", durationMs: 2_000, audio: false, audioPolicy: "preserve" }, dryContext), /audio must be true when audioPolicy is 'preserve'/);

  // Mismatch: audio=true with audioPolicy='mute'
  await assert.rejects(createTimelineScene({ source: "/tmp/clip.mov", durationMs: 2_000, audio: true, audioPolicy: "mute" }, dryContext), /audio must be false when audioPolicy is 'mute'/);

  // Missing audio in composeTimeline / validateScene
  await assert.rejects(composeTimeline({
    scenes: [{ id: "scene", source: "/tmp/source.mov", durationMs: 2_000, audioPolicy: "preserve" }]
  }), /audio must be a boolean/);

  // Missing audioPolicy on overlay
  await assert.rejects(createTimelineOverlay({ asset: "/tmp/card.png", durationMs: 2_000 }, dryContext), /requires with.audioPolicy/);

  // Invalid audioPolicy on overlay (not mute)
  await assert.rejects(createTimelineOverlay({ asset: "/tmp/card.png", durationMs: 2_000, audioPolicy: "preserve" }, dryContext), /must equal 'mute'/);
});

test("adapter registry includes media, timeline, audio, and Premiere build/export capabilities", () => {
  for (const type of [
    "media.probe", "timeline.scene", "timeline.transition", "timeline.overlay", "timeline.dynamic_link", "timeline.compose",
    "audio.asset", "audio.jaitts", "audio.mix", "audio.loudness_qc", "premiere.build", "premiere.export"
  ]) assert.equal(typeof adapters[type], "function", type);
});

test("audio loudness QC parser extracts valid loudnorm metrics and fails closed on invalid output", () => {
  const validStderr = `
[Parsed_loudnorm_0 @ 0x12345] 
{
	"input_i" : "-23.45",
	"input_tp" : "-1.23",
	"input_lra" : "6.78",
	"input_thresh" : "-33.45",
	"output_i" : "-24.00",
	"output_tp" : "-2.00",
	"output_lra" : "6.00",
	"output_thresh" : "-34.00",
	"normalization_type" : "dynamic",
	"target_offset" : "0.55"
}
[out#0/null @ 0x67890] audio: 100KiB
`;
  const parsed = parseLoudnormOutput(validStderr);
  assert.equal(parsed.integratedLufs, -23.45);
  assert.equal(parsed.truePeakDbfs, -1.23);
  assert.equal(parsed.loudnessRange, 6.78);
  assert.equal(parsed.threshold, -33.45);
  assert.equal(parsed.targetOffset, 0.55);

  assert.throws(() => parseLoudnormOutput("No JSON here"), /did not contain loudnorm JSON summary/);
  assert.throws(() => parseLoudnormOutput('{"input_i": "NaN", "input_tp": "-1.0"}'), /Invalid loudnorm measurements/);
  assert.throws(() => parseLoudnormOutput('{"input_i": "-inf", "input_tp": "-1.0"}'), /Invalid loudnorm measurements/);
});

test("audio silence detect parser extracts intervals and closes trailing open interval at total duration", () => {
  const stderr = `
[Parsed_silencedetect_0 @ 0x1] silence_start: 0.500
[Parsed_silencedetect_0 @ 0x1] silence_end: 1.250 | silence_duration: 0.750
[Parsed_silencedetect_0 @ 0x1] silence_start: 3.000
`;
  const intervals = parseSilencedetectOutput(stderr, 5000);
  assert.deepEqual(intervals, [
    { startMs: 500, endMs: 1250, durationMs: 750 },
    { startMs: 3000, endMs: 5000, durationMs: 2000 }
  ]);
});

test("interval math: mergeIntervals and subtractIntervals correctly partition mute windows", () => {
  const unmerged = [
    { startMs: 100, endMs: 300 },
    { startMs: 200, endMs: 500 },
    { startMs: 700, endMs: 800 },
    { startMs: 800, endMs: 900 }
  ];
  assert.deepEqual(mergeIntervals(unmerged), [
    { startMs: 100, endMs: 500, durationMs: 400 },
    { startMs: 700, endMs: 900, durationMs: 200 }
  ]);

  // Subtraction: no overlap
  assert.deepEqual(
    subtractIntervals({ startMs: 1000, endMs: 2000, durationMs: 1000 }, [{ startMs: 3000, endMs: 4000 }]),
    [{ startMs: 1000, endMs: 2000, durationMs: 1000 }]
  );

  // Subtraction: full coverage
  assert.deepEqual(
    subtractIntervals({ startMs: 1000, endMs: 2000, durationMs: 1000 }, [{ startMs: 500, endMs: 2500 }]),
    []
  );

  // Subtraction: split middle
  assert.deepEqual(
    subtractIntervals({ startMs: 0, endMs: 5000, durationMs: 5000 }, [{ startMs: 1000, endMs: 3000 }]),
    [
      { startMs: 0, endMs: 1000, durationMs: 1000 },
      { startMs: 3000, endMs: 5000, durationMs: 2000 }
    ]
  );
});

test("deriveExpectedMuteWindows derives only from title, cover_card, logo_outro with storyboard provenance", () => {
  const timelineSpec = {
    schemaVersion: 1,
    scenes: [
      { id: "s1", startMs: 0, durationMs: 5000, track: 1, audio: true, audioPolicy: "preserve", editorialKind: "a_roll", storyboardItemId: "item_1" },
      { id: "s2", startMs: 10000, durationMs: 2000, track: 1, audio: false, audioPolicy: "mute", editorialKind: "logo_outro", storyboardItemId: "item_3" }
    ],
    overlays: [
      { id: "o1", startMs: 5000, durationMs: 3000, track: 2, audioPolicy: "mute", editorialKind: "cover_card", storyboardItemId: "item_2" },
      { id: "o2", startMs: 1000, durationMs: 2000, track: 2, audioPolicy: "mute", editorialKind: "b_roll", storyboardItemId: "item_broll" }
    ]
  };

  const muteWindows = deriveExpectedMuteWindows(timelineSpec);
  // cover_card [5000, 8000] and logo_outro [10000, 12000]. b_roll [1000, 3000] is NOT a mute window.
  assert.deepEqual(muteWindows, [
    { startMs: 5000, endMs: 8000, durationMs: 3000 },
    { startMs: 10000, endMs: 12000, durationMs: 2000 }
  ]);

  // Partial storyboard provenance fails closed
  const partialSpec = {
    schemaVersion: 1,
    scenes: [
      { id: "s1", startMs: 0, durationMs: 5000, track: 1, audio: true, audioPolicy: "preserve", editorialKind: "a_roll", storyboardItemId: "item_1" },
      { id: "s2", startMs: 5000, durationMs: 2000, track: 1, audio: false, audioPolicy: "mute" } // Missing provenance
    ]
  };
  assert.throws(() => deriveExpectedMuteWindows(partialSpec), /partial storyboard provenance/);

  const missingStoryboardId = {
    schemaVersion: 1,
    scenes: [
      { id: "s1", startMs: 0, durationMs: 1000, track: 1, audio: false, audioPolicy: "mute", editorialKind: "logo_outro" }
    ]
  };
  assert.throws(() => deriveExpectedMuteWindows(missingStoryboardId), /partial storyboard provenance or invalid provenance/);

  const genericMuteSpec = {
    schemaVersion: 1,
    scenes: [
      { id: "s1", startMs: 0, durationMs: 1000, track: 1, audio: false, audioPolicy: "mute" }
    ]
  };
  assert.deepEqual(deriveExpectedMuteWindows(genericMuteSpec), [], "generic mute items are not editorial silence evidence");
});

test("audio.loudness_qc live adapter measures synthetic WAV, writes atomic receipt and enforces policy", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-audio-loudness-qc-"));
  const testDir = path.join(root, "test-media");
  await mkdir(testDir, { recursive: true });
  const stepDir = path.join(root, "step");
  await mkdir(stepDir, { recursive: true });

  const wavPath = path.join(testDir, "tone.wav");
  // Generate 2-second 1kHz sine wave
  await runProcess("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", "sine=frequency=1000:duration=2",
    "-c:a", "pcm_s16le",
    wavPath
  ]);

  const runContext = context(root);

  // 1. Broad passing policy
  const passResult = await qcAudioLoudness({
    source: wavPath,
    targetLufs: -21.0,
    toleranceLufs: 5.0,
    maxTruePeakDbfs: 0.0,
    silenceThresholdDbfs: -50.0,
    minSilenceMs: 500,
    maxUnexpectedSilenceMs: 200
  }, runContext);

  assert.equal(passResult.report.measured, true);
  assert.equal(passResult.report.passed, true);
  assert.equal(typeof passResult.report.measurements.integratedLufs, "number");
  assert.equal(Number.isFinite(passResult.report.measurements.integratedLufs), true);
  assert.ok(passResult.receiptPath);
  const diskReceipt = JSON.parse(await readFile(passResult.receiptPath, "utf8"));
  assert.equal(diskReceipt.schemaVersion, 1);
  assert.equal(diskReceipt.passed, true);
  assert.equal(diskReceipt.source.path, wavPath);

  // 2. Failing loudness tolerance throws AUDIO_QC_FAILED and writes receipt before throwing
  await assert.rejects(
    qcAudioLoudness({
      source: wavPath,
      targetLufs: -50.0, // Far away
      toleranceLufs: 1.0,
      maxTruePeakDbfs: 0.0,
      silenceThresholdDbfs: -50.0,
      minSilenceMs: 500,
      maxUnexpectedSilenceMs: 200
    }, runContext),
    (err) => {
      assert.equal(err.code, "AUDIO_QC_FAILED");
      assert.ok(err.details?.receiptPath);
      assert.equal(err.details.receipt.passed, false);
      assert.equal(err.details.receipt.checks.loudness.passed, false);
      return true;
    }
  );

  // 3. Failing true peak limit
  await assert.rejects(
    qcAudioLoudness({
      source: wavPath,
      targetLufs: -21.0,
      toleranceLufs: 5.0,
      maxTruePeakDbfs: -50.0, // Stricter than actual true peak
      silenceThresholdDbfs: -50.0,
      minSilenceMs: 500,
      maxUnexpectedSilenceMs: 200
    }, runContext),
    (err) => err.code === "AUDIO_QC_FAILED" && err.details.receipt.checks.truePeak.passed === false
  );

  // 4. Generate audio with 1-second silence in middle (3s total: 0-1s tone, 1-2s silence, 2-3s tone)
  const silenceWavPath = path.join(testDir, "silence.wav");
  await runProcess("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", "sine=frequency=1000:duration=3,volume=enable='between(t,1.0,2.0)':volume=0",
    "-c:a", "pcm_s16le",
    silenceWavPath
  ]);

  // Without timelineSpec: unexpected silence duration ~1000ms > maxUnexpectedSilenceMs 200ms -> fails
  await assert.rejects(
    qcAudioLoudness({
      source: silenceWavPath,
      targetLufs: -24.0,
      toleranceLufs: 10.0,
      maxTruePeakDbfs: 0.0,
      silenceThresholdDbfs: -50.0,
      minSilenceMs: 300,
      maxUnexpectedSilenceMs: 200
    }, runContext),
    (err) => err.code === "AUDIO_QC_FAILED" && err.details.receipt.checks.silence.passed === false
  );

  // With timelineSpec having cover_card covering [1000, 2000]: passes!
  const coveredSpec = {
    schemaVersion: 1,
    scenes: [
      { id: "s1", startMs: 0, durationMs: 1000, track: 1, audio: true, audioPolicy: "preserve", editorialKind: "a_roll", storyboardItemId: "item_1" },
      { id: "s2", startMs: 2000, durationMs: 1000, track: 1, audio: true, audioPolicy: "preserve", editorialKind: "a_roll", storyboardItemId: "item_2" }
    ],
    overlays: [
      { id: "o1", startMs: 1000, durationMs: 1000, track: 2, audioPolicy: "mute", editorialKind: "cover_card", storyboardItemId: "item_cover" }
    ]
  };
  const coveredResult = await qcAudioLoudness({
    source: silenceWavPath,
    timelineSpec: coveredSpec,
    targetLufs: -24.0,
    toleranceLufs: 10.0,
    maxTruePeakDbfs: 0.0,
    silenceThresholdDbfs: -50.0,
    minSilenceMs: 300,
    maxUnexpectedSilenceMs: 200
  }, runContext);
  assert.equal(coveredResult.report.passed, true);
  assert.equal(coveredResult.report.checks.silence.passed, true);

  // With timelineSpec having b_roll covering [1000, 2000]: B-roll is NOT a mute window, fails!
  const brollSpec = {
    schemaVersion: 1,
    scenes: [
      { id: "s1", startMs: 0, durationMs: 3000, track: 1, audio: true, audioPolicy: "preserve", editorialKind: "a_roll", storyboardItemId: "item_1" }
    ],
    overlays: [
      { id: "o1", startMs: 1000, durationMs: 1000, track: 2, audioPolicy: "mute", editorialKind: "b_roll", storyboardItemId: "item_broll" }
    ]
  };
  await assert.rejects(
    qcAudioLoudness({
      source: silenceWavPath,
      timelineSpec: brollSpec,
      targetLufs: -24.0,
      toleranceLufs: 10.0,
      maxTruePeakDbfs: 0.0,
      silenceThresholdDbfs: -50.0,
      minSilenceMs: 300,
      maxUnexpectedSilenceMs: 200
    }, runContext),
    (err) => err.code === "AUDIO_QC_FAILED" && err.details.receipt.checks.silence.passed === false
  );

  // 5. Dry run returns planned report with measured: false, passed: false
  const dryResult = await qcAudioLoudness({
    source: wavPath,
    targetLufs: -23.0,
    toleranceLufs: 1.0,
    maxTruePeakDbfs: -1.0,
    silenceThresholdDbfs: -50.0,
    minSilenceMs: 1000,
    maxUnexpectedSilenceMs: 500
  }, context(root, { dryRun: true }));
  assert.equal(dryResult.report.measured, false);
  assert.equal(dryResult.report.passed, false);
  assert.equal(dryResult.dryRun, true);

  await rm(root, { recursive: true, force: true });
});
