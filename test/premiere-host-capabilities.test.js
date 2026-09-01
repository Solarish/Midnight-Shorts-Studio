import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../adobe/premiere-uxp/host-capabilities.js", import.meta.url), "utf8");

function loadHost(fs = { async stat() { return { size: 100 }; } }) {
  const sandbox = {
    console,
    setTimeout(callback, delay) { if (delay <= 1_000) callback(); return 1; },
    clearTimeout() {},
    require(name) {
      if (name === "fs") return fs;
      throw new Error(`Unexpected module ${name}`);
    },
    AvaPremiereAssembly: {
      createOpenOptions() { return undefined; },
      async findImportedClip() { return {}; }
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "host-capabilities.js" });
  return sandbox;
}

function freshOutputFs(size) {
  let statCalls = 0;
  const statPaths = [];
  return {
    fs: {
      async stat(value) {
        statCalls += 1;
        statPaths.push(value);
        if (statCalls === 1) throw Object.assign(new Error("missing"), { code: "ENOENT" });
        return { size };
      }
    },
    get statCalls() { return statCalls; },
    get statPaths() { return statPaths; }
  };
}

function immediateExportEvents(onRegistered) {
  return {
    addGlobalEventListener(name, listener) { onRegistered(name, listener); },
    removeGlobalEventListener() {}
  };
}

test("Premiere 25.6 host creates a sequence through the compatible preset API", async () => {
  const sandbox = loadHost();
  const calls = [];
  const sequence = { guid: "sequence-guid" };
  const project = {
    async createSequence(name, preset) { calls.push(["legacy", name, preset]); return sequence; },
    async setActiveSequence(value) { calls.push(["active", value.guid]); return true; }
  };
  const result = await sandbox.AvaPremiereHostInternals.createSequence({}, project, {
    sequenceName: "PORTRAIT",
    sequencePresetPath: "/trusted/portrait-25fps.sqpreset"
  });
  assert.equal(result, sequence);
  assert.deepEqual(calls, [
    ["legacy", "PORTRAIT", "/trusted/portrait-25fps.sqpreset"],
    ["active", "sequence-guid"]
  ]);
});

test("Premiere host casts imported clips to ProjectItem before timeline actions", async () => {
  const sandbox = loadHost();
  const clipItem = { kind: "clip" };
  const projectItem = { kind: "project-item" };
  sandbox.AvaPremiereAssembly.findImportedClip = async () => clipItem;
  const castValues = [];
  const ppro = {
    ProjectItem: {
      cast(value) {
        castValues.push(value);
        return value === clipItem ? projectItem : { kind: "root" };
      }
    }
  };
  const project = {
    async getRootItem() { return { kind: "folder" }; },
    async importFiles() { return true; }
  };
  const clips = await sandbox.AvaPremiereHostInternals.importSources(ppro, project, {
    scenes: [{ source: "/media/still.png" }],
    overlays: [],
    audio: []
  }, () => {});
  assert.deepEqual(castValues, [{ kind: "folder" }, clipItem]);
  assert.equal(clips["/media/still.png"], projectItem);
});

test("Premiere host creates overwrite and trim actions inside locked transactions", async () => {
  const sandbox = loadHost();
  let locked = false;
  let actions = 0;
  const clip = { getId() { return "clip"; } };
  const trackItem = {
    async getProjectItem() { return clip; },
    createSetStartAction() { assert.equal(locked, true); return { kind: "start" }; },
    createSetEndAction() { assert.equal(locked, true); return { kind: "end" }; },
    createSetInPointAction() { assert.equal(locked, true); return { kind: "in" }; },
    createSetOutPointAction() { assert.equal(locked, true); return { kind: "out" }; }
  };
  const sequence = {
    async getVideoTrack() { return { getTrackItems() { return [trackItem]; } }; }
  };
  const project = {
    async lockedAccess(callback) {
      locked = true;
      try { return callback(); }
      finally { locked = false; }
    },
    executeTransaction(callback) {
      callback({ addAction() { actions += 1; } });
      return true;
    }
  };
  const ppro = {
    Constants: { TrackItemType: { CLIP: 1 } },
    TickTime: { createWithSeconds(seconds) { return { seconds }; } },
    SequenceEditor: {
      getEditor() {
        return {
          createOverwriteItemAction() {
            assert.equal(locked, true);
            return { kind: "overwrite" };
          }
        };
      }
    }
  };
  await sandbox.AvaPremiereHostInternals.placeTimeline(ppro, project, sequence, {
    scenes: [{ id: "still", source: "/media/still.png", startMs: 0, sourceInMs: 0, durationMs: 5_000, track: 1, audio: false }],
    transitions: [],
    overlays: [],
    audio: []
  }, { "/media/still.png": clip }, () => {});
  assert.equal(actions, 2);
});

test("Premiere host inserts a MOGRT on V4 and commits editable text parameter actions", async () => {
  const sandbox = loadHost();
  const committed = [];
  const values = [];
  const names = ["PERSON_NAME", "POSITION_TITLE", "AWARD"];
  const params = names.map((name) => ({
    displayName: name,
    createKeyframe(value) { values.push([name, value]); return { name, value }; },
    createSetValueAction(keyframe) { return { kind: "param", keyframe }; }
  }));
  const graphicItem = {
    createSetEndAction(time) { return { kind: "end", time }; },
    async getComponentChain() {
      return {
        async getComponentCount() { return 1; },
        async getComponentAtIndex() { return { async getParamCount() { return 3; }, async getParam(index) { return params[index]; } }; }
      };
    }
  };
  const project = {
    async lockedAccess(callback) { return callback(); },
    executeTransaction(callback) { callback({ addAction(action) { committed.push(action); } }); return true; }
  };
  const ppro = {
    TickTime: { createWithSeconds(seconds) { return { seconds }; } },
    SequenceEditor: {
      async getInstalledMogrtPath() { return "/installed"; },
      getEditor() { return { async insertMogrtFromPath(path, time, videoTrack, audioTrack) {
        assert.equal(path, "/templates/cover.mogrt");
        assert.deepEqual(time, { seconds: 2 });
        if (videoTrack === 3 && audioTrack === 0) return [graphicItem];
        throw new Error("Invalid parameter.");
      } }; }
    }
  };
  const result = await sandbox.AvaPremiereHostInternals.placeTimeline(ppro, project, {}, {
    width: 1920, height: 1080, scenes: [], transitions: [], overlays: [], dynamicLinks: [], audio: [],
    graphics: [{ id: "cover_text", mogrtPath: "/templates/cover.mogrt", startMs: 2000, durationMs: 4000, track: 4, text: { personName: "สมชาย", positionTitle: "ศาสตราจารย์", award: "รางวัลดีเด่น" }, parameterMap: { personName: "PERSON_NAME", positionTitle: "POSITION_TITLE", award: "AWARD" } }]
  }, {}, {}, () => {});
  assert.deepEqual(values, [["PERSON_NAME", "สมชาย"], ["POSITION_TITLE", "ศาสตราจารย์"], ["AWARD", "รางวัลดีเด่น"]]);
  assert.deepEqual(committed.map((entry) => entry.kind), ["end", "param", "param", "param"]);
  assert.equal(Array.from(result.graphics[0].boundParameters).join("|"), names.join("|"));
  assert.equal(result.graphics[0].editable, true);
});

test("Premiere host inserts a pre-seeded MOGRT on V4 without calling the unsupported string keyframe API", async () => {
  const sandbox = loadHost();
  const committed = [];
  const names = ["PERSON_NAME", "POSITION_TITLE", "AWARD"];
  const params = names.map((name) => ({ displayName: name, createKeyframe() { throw new Error(`must not bind ${name}`); } }));
  const graphicItem = {
    createSetEndAction() { return { kind: "end" }; },
    async getComponentChain() { return { async getComponentCount() { return 1; }, async getComponentAtIndex() { return { async getParamCount() { return params.length; }, async getParam(index) { return params[index]; } }; } }; }
  };
  const project = { async lockedAccess(callback) { return callback(); }, executeTransaction(callback) { callback({ addAction(action) { committed.push(action); } }); return true; } };
  const ppro = {
    TickTime: { createWithSeconds(seconds) { return { seconds }; } },
    SequenceEditor: { getEditor() { return { async insertMogrtFromPath() { return [graphicItem]; } }; } }
  };
  const text = { personName: "สมชาย", positionTitle: "ศาสตราจารย์", award: "รางวัลดีเด่น" };
  const seedReceipt = {
    mode: "preseeded",
    outputPath: "/templates/cover-seeded.mogrt",
    outputSha256: "a".repeat(64),
    text: { PERSON_NAME: text.personName, POSITION_TITLE: text.positionTitle, AWARD: text.award },
    parameterNames: names
  };
  const result = await sandbox.AvaPremiereHostInternals.placeTimeline(ppro, project, {}, {
    width: 1920, height: 1080, scenes: [], transitions: [], overlays: [], dynamicLinks: [], audio: [],
    graphics: [{ id: "cover_text", mogrtPath: seedReceipt.outputPath, startMs: 0, durationMs: 4000, track: 4, text, parameterMap: { personName: "PERSON_NAME", positionTitle: "POSITION_TITLE", award: "AWARD" }, bindingMode: "preseeded", seedReceipt }]
  }, {}, {}, () => {});
  assert.deepEqual(committed.map((entry) => entry.kind), ["end"]);
  assert.deepEqual(Array.from(result.graphics[0].boundParameters), []);
  assert.deepEqual(Array.from(result.graphics[0].seededParameters), names);
  assert.equal(result.graphics[0].bindingMode, "preseeded");
  assert.equal(result.graphics[0].editable, true);
});

test("Premiere host applies normalized Position plus Scale and Opacity for explicit V3 controls", async () => {
  const sandbox = loadHost();
  const values = [];
  const clip = { getId() { return "person"; } };
  const names = ["Position", "Scale", "Opacity"];
  const params = names.map((name) => ({ displayName: name, createKeyframe(value) { values.push([name, value]); return value; }, createSetValueAction(value) { return { kind: name, value }; } }));
  const item = {
    async getProjectItem() { return clip; },
    createSetEndAction() { return { kind: "end" }; },
    async getComponentChain() { return { async getComponentCount() { return 1; }, async getComponentAtIndex() { return { async getParamCount() { return 3; }, async getParam(index) { return params[index]; } }; } }; }
  };
  const project = { async lockedAccess(callback) { return callback(); }, executeTransaction(callback) { callback({ addAction() {} }); return true; } };
  function PointF() { this.x = 0; this.y = 0; }
  const ppro = {
    PointF,
    Constants: { TrackItemType: { CLIP: 1 } },
    TickTime: { createWithSeconds(seconds) { return { seconds }; } },
    SequenceEditor: { getEditor() { return { createOverwriteItemAction() { return { kind: "overwrite" }; } }; } }
  };
  const sequence = { async getVideoTrack() { return { getTrackItems() { return [item]; } }; } };
  const result = await sandbox.AvaPremiereHostInternals.placeTimeline(ppro, project, sequence, {
    width: 1920, height: 1080, scenes: [], transitions: [], dynamicLinks: [], audio: [],
    overlays: [{ id: "person_v3", asset: "/person.png", startMs: 0, durationMs: 4000, track: 3, position: { x: 0.72, y: 0.5 }, scale: 1.25, opacity: 0.8, transformExplicit: true }]
  }, { "/person.png": clip }, {}, () => {});
  assert.equal(values[0][0], "Position");
  assert.deepEqual({ x: values[0][1].x, y: values[0][1].y }, { x: 0.72, y: 0.5 });
  assert.deepEqual(values.slice(1), [["Scale", 125], ["Opacity", 80]]);
  assert.equal(Array.from(result.overlays[0].boundTransformParameters).join("|"), names.join("|"));
});

test("Premiere host avoids native TrackItemTrimEndAction for clips with an explicit source range", async () => {
  const sandbox = loadHost();
  const committedKinds = [];
  const clip = {
    getId() { return "clip"; },
    createSetInOutPointsAction(inPoint, outPoint) {
      assert.deepEqual(inPoint, { seconds: 184 });
      assert.deepEqual(outPoint, { seconds: 194 });
      return { kind: "source-range" };
    },
    createClearInOutPointsAction() { return { kind: "clear-source-range" }; }
  };
  const trackItem = {
    async getProjectItem() { return clip; },
    async getStartTime() { return { seconds: 10 }; },
    async getEndTime() { return { seconds: 20 }; },
    createSetEndAction() { return { kind: "end" }; },
    createSetInPointAction() { return { kind: "in" }; },
    createSetOutPointAction() { return { kind: "out" }; }
  };
  const sequence = { async getVideoTrack() { return { getTrackItems() { return [trackItem]; } }; } };
  const project = {
    async lockedAccess(callback) { return callback(); },
    executeTransaction(callback) {
      callback({ addAction(action) { committedKinds.push(action.kind); } });
      return true;
    }
  };
  const ppro = {
    Constants: { TrackItemType: { CLIP: 1 } },
    TickTime: { createWithSeconds(seconds) { return { seconds }; } },
    ClipProjectItem: { castOrThrow(value) { return value; } },
    SequenceEditor: { getEditor() { return { createOverwriteItemAction() { return { kind: "overwrite" }; } }; } }
  };

  await sandbox.AvaPremiereHostInternals.placeTimeline(ppro, project, sequence, {
    scenes: [{ id: "interview", source: "/media/interview.mov", startMs: 10_000, sourceInMs: 184_000, durationMs: 10_000, track: 1, audio: true, audioPolicy: "preserve" }],
    transitions: [], overlays: [], dynamicLinks: [], audio: []
  }, { "/media/interview.mov": clip }, {}, () => {});

  assert.deepEqual(committedKinds, ["source-range", "overwrite", "clear-source-range"]);
  assert.equal(committedKinds.includes("end"), false);
  assert.equal(committedKinds.includes("in"), false);
  assert.equal(committedKinds.includes("out"), false);
});

test("Premiere host exports immediately and waits for a stable file receipt", async () => {
  const output = freshOutputFs(1234);
  const sandbox = loadHost(output.fs);
  const calls = [];
  let exportComplete;
  const sequence = { guid: "sequence-guid" };
  const ppro = {
    Constants: { ExportType: { IMMEDIATELY: "immediate" }, OperationCompleteEvent: { EXPORT_MEDIA_COMPLETE: "export-complete" } },
    EventManager: immediateExportEvents((name, listener) => { assert.equal(name, "export-complete"); exportComplete = listener; }),
    EncoderManager: {
      async getExportFileExtension() { return "mp4"; },
      getManager() {
        return { async exportSequence(...args) { calls.push(args); exportComplete({ state: "success" }); return true; } };
      }
    }
  };
  const receipt = await sandbox.AvaPremiereHostInternals.exportSequence(ppro, { _project: {}, _sequence: sequence }, {
    format: "h264",
    output: "/tmp/final.mp4",
    presetPath: "/trusted/h264.epr"
  }, { exportTimeoutMs: 10_000 }, () => {});
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [sequence, "immediate", "/tmp/final.mp4", "/trusted/h264.epr", true]);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.bytes, 1234);
  assert.ok(output.statCalls >= 4);
  assert.ok(output.statPaths.every((value) => value.startsWith("file:///")));
});

test("Premiere host accepts a stable output when the native export promise never settles", async () => {
  const output = freshOutputFs(4321);
  const sandbox = loadHost(output.fs);
  let exportComplete;
  const sequence = { guid: "sequence-guid" };
  const ppro = {
    Constants: { ExportType: { IMMEDIATELY: "immediate" }, OperationCompleteEvent: { EXPORT_MEDIA_COMPLETE: "export-complete", OPERATION_STATE_SUCCESS: "success" } },
    EventManager: immediateExportEvents((name, listener) => { exportComplete = listener; }),
    EncoderManager: {
      async getExportFileExtension() { return "mov"; },
      getManager() {
        return { exportSequence() { exportComplete({ state: "success" }); return new Promise(() => {}); } };
      }
    }
  };
  const receipt = await sandbox.AvaPremiereHostInternals.exportSequence(ppro, { _project: {}, _sequence: sequence }, {
    format: "prores",
    output: "/tmp/final.mov",
    presetPath: "/trusted/prores.epr"
  }, { exportTimeoutMs: 10_000 }, () => {});
  assert.equal(receipt.ok, true);
  assert.equal(receipt.bytes, 4321);
  assert.ok(output.statCalls >= 4);
});

test("Premiere host returns a long-stable output when Beta omits the completion event", async () => {
  const output = freshOutputFs(2468);
  const sandbox = loadHost(output.fs);
  const ppro = {
    Constants: { ExportType: { IMMEDIATELY: "immediate" }, OperationCompleteEvent: { EXPORT_MEDIA_COMPLETE: "export-complete" } },
    EventManager: immediateExportEvents(() => {}),
    EncoderManager: {
      async getExportFileExtension() { return "mp4"; },
      getManager() { return { exportSequence() { return new Promise(() => {}); } }; }
    }
  };
  const receipt = await sandbox.AvaPremiereHostInternals.exportSequence(ppro, { _project: {}, _sequence: {} }, {
    format: "h264",
    output: "/tmp/fallback.mp4",
    presetPath: "/trusted/h264.epr"
  }, { exportTimeoutMs: 20_000, exportStableSamples: 2 }, () => {});
  assert.equal(receipt.ok, true);
  assert.equal(receipt.bytes, 2468);
});

test("Premiere host rejects a failed export completion state", async () => {
  const output = freshOutputFs(2468);
  const sandbox = loadHost(output.fs);
  let exportComplete;
  const ppro = {
    Constants: {
      ExportType: { IMMEDIATELY: "immediate" },
      OperationCompleteEvent: {
        EXPORT_MEDIA_COMPLETE: "export-complete",
        OPERATION_STATE_SUCCESS: 1,
        OPERATION_STATE_FAILED: 2
      }
    },
    EventManager: immediateExportEvents((name, listener) => { exportComplete = listener; }),
    EncoderManager: {
      async getExportFileExtension() { return "mp4"; },
      getManager() {
        return { exportSequence() { exportComplete({ state: 2 }); return true; } };
      }
    }
  };
  await assert.rejects(sandbox.AvaPremiereHostInternals.exportSequence(ppro, { _project: {}, _sequence: {} }, {
    format: "h264",
    output: "/tmp/failed.mp4",
    presetPath: "/trusted/h264.epr"
  }, { exportTimeoutMs: 10_000 }, () => {}), /operation state 2/);
});

test("Premiere host rejects an export preset whose container does not match the requested format", async () => {
  const sandbox = loadHost();
  let exported = false;
  const ppro = {
    Constants: { ExportType: { IMMEDIATELY: "immediate" } },
    EncoderManager: {
      async getExportFileExtension() { return "mov"; },
      getManager() { return { async exportSequence() { exported = true; return true; } }; }
    }
  };
  await assert.rejects(sandbox.AvaPremiereHostInternals.exportSequence(ppro, { _project: {}, _sequence: {} }, {
    format: "h264",
    output: "/tmp/final.mp4",
    presetPath: "/trusted/not-h264.epr"
  }, {}, () => {}), /preset extension does not match h264/);
  assert.equal(exported, false);
});

test("Premiere host normalizes opaque native export failures with the failing phase", async () => {
  const output = freshOutputFs(100);
  const sandbox = loadHost(output.fs);
  const ppro = {
    Constants: { ExportType: { IMMEDIATELY: "immediate" }, OperationCompleteEvent: { EXPORT_MEDIA_COMPLETE: "export-complete" } },
    EventManager: immediateExportEvents(() => {}),
    EncoderManager: {
      async getExportFileExtension() { return "mp4"; },
      getManager() { return { async exportSequence() { throw { code: "NATIVE_EXPORT_FAILED" }; } }; }
    }
  };
  await assert.rejects(sandbox.AvaPremiereHostInternals.exportSequence(ppro, { _project: {}, _sequence: {} }, {
    format: "h264",
    output: "/tmp/final.mp4",
    presetPath: "/trusted/h264.epr"
  }, {}, () => {}), /Premiere exportSequence failed for h264: code=NATIVE_EXPORT_FAILED/);
});

test("Premiere host imports AE compositions and resolves ProjectItem for Dynamic Links", async () => {
  const sandbox = loadHost();
  const importCalls = [];
  const compItem = { name: "Main", async getMediaFilePath() { return "/media/title.aep"; } };
  const rootItem = { kind: "folder" };
  sandbox.AvaPremiereAssembly.findImportedAEComp = async () => compItem;
  const ppro = {
    ProjectItem: { cast(val) { return val; } }
  };
  const project = {
    async getRootItem() { return rootItem; },
    async importAEComps(proj, comps, root) {
      importCalls.push([proj, comps, root]);
      return true;
    }
  };

  const timelineSpec = {
    scenes: [],
    overlays: [],
    audio: [],
    dynamicLinks: [{
      id: "dl1",
      project: "/media/title.aep",
      composition: "Main",
      startMs: 0,
      durationMs: 2_000,
      track: 3,
      audioPolicy: "mute"
    }]
  };

  const comps = await sandbox.AvaPremiereHostInternals.importDynamicLinks(ppro, project, timelineSpec, () => {});
  assert.deepEqual(JSON.parse(JSON.stringify(importCalls)), [
    ["/media/title.aep", ["Main"], { kind: "folder" }]
  ]);
  assert.equal(comps.dl1, compItem);

  // Premiere Beta can reject a named comp import even when the AEP is valid.
  // Fall back to the official all-comps API, then require exact comp resolution.
  const fallbackCalls = [];
  const fallbackProject = {
    async getRootItem() { return rootItem; },
    async importAEComps() { fallbackCalls.push("named"); return false; },
    async importAllAEComps(proj, root) {
      fallbackCalls.push(["all", proj, root]);
      return true;
    }
  };
  const fallbackComps = await sandbox.AvaPremiereHostInternals.importDynamicLinks(ppro, fallbackProject, timelineSpec, () => {});
  assert.deepEqual(JSON.parse(JSON.stringify(fallbackCalls)), [
    "named",
    ["all", "/media/title.aep", { kind: "folder" }]
  ]);
  assert.equal(fallbackComps.dl1, compItem);

  // Fails closed on false import result
  const failingProject = {
    async getRootItem() { return rootItem; },
    async importAEComps() { return false; }
  };
  await assert.rejects(
    sandbox.AvaPremiereHostInternals.importDynamicLinks(ppro, failingProject, timelineSpec, () => {}),
    /failed to import After Effects composition/
  );

  // Fails closed on null import result
  await assert.rejects(
    sandbox.AvaPremiereHostInternals.importDynamicLinks(ppro, { async getRootItem() { return rootItem; }, async importAEComps() { return null; } }, timelineSpec, () => {}),
    /failed to import After Effects composition/
  );

  // Fails closed on undefined import result
  await assert.rejects(
    sandbox.AvaPremiereHostInternals.importDynamicLinks(ppro, { async getRootItem() { return rootItem; }, async importAEComps() { return undefined; } }, timelineSpec, () => {}),
    /failed to import After Effects composition/
  );

  // Fails closed on empty array import result (empty collection)
  await assert.rejects(
    sandbox.AvaPremiereHostInternals.importDynamicLinks(ppro, { async getRootItem() { return rootItem; }, async importAEComps() { return []; } }, timelineSpec, () => {}),
    /failed to import After Effects composition/
  );

  // Fails closed on an empty array-like host collection
  await assert.rejects(
    sandbox.AvaPremiereHostInternals.importDynamicLinks(ppro, { async getRootItem() { return rootItem; }, async importAEComps() { return { length: 0 }; } }, timelineSpec, () => {}),
    /failed to import After Effects composition/
  );
});

test("Premiere host places Dynamic Links video-only (audioTrack: -1) and returns exact durable receipts", async () => {
  const sandbox = loadHost();
  let locked = false;
  const overwriteCalls = [];
  const compItem = { getId() { return "comp_item_id"; } };
  const trackItem = {
    async getProjectItem() { return compItem; },
    createSetEndAction() { assert.equal(locked, true); return { kind: "end" }; }
  };
  const sequence = {
    async getVideoTrack() {
      return { getTrackItems() { return [trackItem]; } };
    }
  };
  const project = {
    async lockedAccess(callback) {
      locked = true;
      try { return callback(); }
      finally { locked = false; }
    },
    executeTransaction(callback) {
      callback({ addAction() {} });
      return true;
    }
  };
  const ppro = {
    Constants: { TrackItemType: { CLIP: 1 } },
    TickTime: { createWithSeconds(seconds) { return { seconds }; } },
    SequenceEditor: {
      getEditor() {
        return {
          createOverwriteItemAction(item, start, videoTrack, audioTrack) {
            assert.equal(locked, true);
            overwriteCalls.push({ item, start, videoTrack, audioTrack });
            return { kind: "overwrite" };
          }
        };
      }
    }
  };

  const timelineSpec = {
    scenes: [],
    transitions: [],
    overlays: [],
    audio: [],
    dynamicLinks: [{
      id: "dl_intro",
      project: "/media/intro.aep",
      composition: "IntroComp",
      startMs: 400,
      durationMs: 2_400,
      track: 3,
      audioPolicy: "mute"
    }]
  };

  const receipts = await sandbox.AvaPremiereHostInternals.placeTimeline(
    ppro,
    project,
    sequence,
    timelineSpec,
    {},
    { dl_intro: compItem },
    () => {}
  );

  assert.deepEqual(overwriteCalls.map((c) => ({ start: c.start, videoTrack: c.videoTrack, audioTrack: c.audioTrack })), [{
    start: { seconds: 0.4 },
    videoTrack: 2,
    audioTrack: -1
  }]);

  assert.deepEqual(JSON.parse(JSON.stringify(receipts)), {
    scenes: [],
    overlays: [],
    dynamicLinks: [{
      id: "dl_intro",
      project: "/media/intro.aep",
      composition: "IntroComp",
      startMs: 400,
      durationMs: 2_400,
      videoTrack: 3,
      audioPolicy: "mute",
      audioTrack: -1,
      audioInserted: false
    }],
    audio: []
  });
});

test("Premiere host placeTimeline emits durable receipts for scenes, overlays, dynamic links, and audio", async () => {
  const sandbox = loadHost();
  let locked = false;
  const overwriteCalls = [];
  const compItem = { getId() { return "comp_item_id"; } };
  const clipA = {
    getId() { return "clip_a_id"; },
    createSetInOutPointsAction() { return { kind: "source-range" }; },
    createClearInOutPointsAction() { return { kind: "clear-source-range" }; }
  };
  const clipB = { getId() { return "clip_b_id"; } };
  const overlayClip = { getId() { return "overlay_clip_id"; } };
  const audioClip = { getId() { return "audio_clip_id"; } };

  let currentProjectItem = null;
  const trackItem = {
    async getProjectItem() { return currentProjectItem; },
    async getStartTime() {
      const call = overwriteCalls.findLast((entry) => entry.item === currentProjectItem);
      return call ? call.start : { seconds: 0 };
    },
    async getEndTime() {
      if (currentProjectItem === clipA) return { seconds: 4 };
      return { seconds: 0 };
    },
    createSetEndAction() { return { kind: "end" }; },
    createSetInPointAction() { return { kind: "in" }; },
    createSetOutPointAction() { return { kind: "out" }; }
  };
  const sequence = {
    async getVideoTrack() { return { getTrackItems() { return [trackItem]; } }; },
    async getAudioTrack() { return { getTrackItems() { return [trackItem]; } }; }
  };
  const project = {
    async lockedAccess(callback) {
      locked = true;
      try { return callback(); }
      finally { locked = false; }
    },
    executeTransaction(callback) {
      callback({ addAction() {} });
      return true;
    }
  };
  const ppro = {
    Constants: { TrackItemType: { CLIP: 1 } },
    TickTime: { createWithSeconds(seconds) { return { seconds }; } },
    ClipProjectItem: { cast(value) { return value; } },
    SequenceEditor: {
      getEditor() {
        return {
          createOverwriteItemAction(item, start, videoTrack, audioTrack) {
            currentProjectItem = item;
            overwriteCalls.push({ item, start, videoTrack, audioTrack });
            return { kind: "overwrite" };
          }
        };
      }
    }
  };

  const timelineSpec = {
    scenes: [
      { id: "scene_aroll", source: "/media/interview.mov", startMs: 0, sourceInMs: 1_000, durationMs: 4_000, track: 1, audio: true, audioPolicy: "preserve", storyboardItemId: "item_1", editorialKind: "a_roll" },
      { id: "scene_logo", source: "/media/logo.mov", startMs: 10_000, sourceInMs: 0, durationMs: 2_000, track: 1, audio: false, audioPolicy: "mute", storyboardItemId: "item_2", editorialKind: "logo_outro" }
    ],
    overlays: [
      { id: "overlay_cover", asset: "/media/cover.png", startMs: 4_000, durationMs: 3_000, track: 2, audioPolicy: "mute", storyboardItemId: "item_3", editorialKind: "cover_card" }
    ],
    dynamicLinks: [
      { id: "dl_title", project: "/media/title.aep", composition: "Main", startMs: 0, durationMs: 2_000, track: 3, audioPolicy: "mute", storyboardItemId: "item_4", editorialKind: "title" }
    ],
    audio: [
      { id: "audio_bed", path: "/media/music.wav", startMs: 0, durationMs: 12_000 }
    ]
  };

  const clips = {
    "/media/interview.mov": clipA,
    "/media/logo.mov": clipB,
    "/media/cover.png": overlayClip,
    "/media/music.wav": audioClip
  };

  const receipts = await sandbox.AvaPremiereHostInternals.placeTimeline(
    ppro,
    project,
    sequence,
    timelineSpec,
    clips,
    { dl_title: compItem },
    () => {}
  );

  const cleanReceipts = JSON.parse(JSON.stringify(receipts));

  assert.deepEqual(cleanReceipts.scenes, [
    {
      id: "scene_aroll",
      source: "/media/interview.mov",
      startMs: 0,
      sourceInMs: 1_000,
      durationMs: 4_000,
      videoTrack: 1,
      audioPolicy: "preserve",
      audioTrack: 1,
      audioInserted: true,
      storyboardItemId: "item_1",
      editorialKind: "a_roll"
    },
    {
      id: "scene_logo",
      source: "/media/logo.mov",
      startMs: 10_000,
      sourceInMs: 0,
      durationMs: 2_000,
      videoTrack: 1,
      audioPolicy: "mute",
      audioTrack: -1,
      audioInserted: false,
      storyboardItemId: "item_2",
      editorialKind: "logo_outro"
    }
  ]);

  assert.deepEqual(cleanReceipts.overlays, [
    {
      id: "overlay_cover",
      asset: "/media/cover.png",
      startMs: 4_000,
      durationMs: 3_000,
      videoTrack: 2,
      audioPolicy: "mute",
      audioTrack: -1,
      audioInserted: false,
      storyboardItemId: "item_3",
      editorialKind: "cover_card"
    }
  ]);

  assert.deepEqual(cleanReceipts.dynamicLinks, [
    {
      id: "dl_title",
      project: "/media/title.aep",
      composition: "Main",
      startMs: 0,
      durationMs: 2_000,
      videoTrack: 3,
      audioPolicy: "mute",
      audioTrack: -1,
      audioInserted: false,
      storyboardItemId: "item_4",
      editorialKind: "title"
    }
  ]);

  assert.deepEqual(cleanReceipts.audio, [
    {
      id: "audio_bed",
      path: "/media/music.wav",
      startMs: 0,
      durationMs: 12_000,
      audioTrack: 1,
      audioInserted: true
    }
  ]);
});
