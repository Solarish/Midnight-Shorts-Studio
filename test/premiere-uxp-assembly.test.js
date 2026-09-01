import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../adobe/premiere-uxp/assembly.js", import.meta.url), "utf8");
const sandbox = {};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: "assembly.js" });
const { assemblePremiereJob, executePremiereJob, executeSequentialExports, findImportedClip, findImportedAEComp, describeAECompCandidates, collectAECompCandidates, validateTimelineSpecDocument } = sandbox.AvaPremiereAssembly;

test("Premiere UXP assembly copies a template before importing and builds a sequence from exact project media", async () => {
  const events = [];
  const outputProject = "/tmp/ava-output.prproj";
  const mediaPath = "/tmp/prototype-master.mov";
  const project = {
    guid: "output-project-guid",
    async saveAs(value) { events.push(`saveAs:${value}`); return true; },
    async getRootItem() { events.push("getRootItem"); return { kind: "folder" }; },
    async importAEComps(value, compositions) {
      events.push(`importAEComps:${value}:${compositions.join(",")}`);
      return true;
    },
    async importFiles(values) { events.push(`importFiles:${values.join(",")}`); return true; },
    async createSequenceFromMedia(name, clips) {
      events.push(`createSequence:${name}:${clips.length}`);
      return { guid: "sequence-guid" };
    },
    async setActiveSequence(sequence) { events.push(`activate:${sequence.guid}`); return true; },
    async save() { events.push("save"); return true; }
  };
  const foreignClip = { async getProject() { return { guid: "another-project" }; } };
  const importedClip = {
    async getProject() { return project; },
    async getMediaFilePath() { return mediaPath; }
  };
  const openOptions = {
    setShowLocateFileDialog(value) { events.push(`locateDialog:${value}`); return this; },
    setShowConvertProjectDialog(value) { events.push(`convertDialog:${value}`); return this; },
    setShowWarningDialog(value) { events.push(`warningDialog:${value}`); return this; },
    setAddToMRUList(value) { events.push(`mru:${value}`); return this; }
  };
  const ppro = {
    OpenProjectOptions() { return openOptions; },
    Project: {
      async open(value, options) {
        events.push(`open:${value}`);
        assert.equal(options, openOptions);
        return project;
      }
    },
    ProjectItem: { cast(value) { return value; } },
    ClipProjectItem: {
      async findItemsMatchingMediaPath(value) {
        assert.equal(value, mediaPath);
        return [foreignClip, importedClip];
      },
      cast(value) { return value; }
    }
  };
  const job = {
    protocolVersion: 1,
    id: "uxp-job",
    generation: "gen-1",
    type: "premiere.assemble",
    templateProject: "/tmp/template.prproj",
    outputProject,
    sequenceName: "AVA_PROTOTYPE",
    media: [mediaPath],
    aeComps: [{ project: "/tmp/design.aep", compositions: ["MASTER"] }],
    createSequence: true,
    save: true
  };

  const outputs = await assemblePremiereJob(ppro, job, (message) => events.push(`log:${message}`));

  assert.deepEqual(JSON.parse(JSON.stringify(outputs)), {
    project: outputProject,
    sequenceName: "AVA_PROTOTYPE",
    sequenceGuid: "sequence-guid",
    importedMedia: [mediaPath]
  });
  assert.ok(events.indexOf(`saveAs:${outputProject}`) < events.indexOf(`importFiles:${mediaPath}`));
  assert.ok(events.includes("locateDialog:false"));
  assert.ok(events.includes("convertDialog:false"));
  assert.ok(events.includes("warningDialog:false"));
  assert.ok(events.includes("mru:false"));
  assert.ok(events.includes("createSequence:AVA_PROTOTYPE:1"));
  assert.ok(events.includes("save"));
});

test("Premiere UXP assembly refuses unsafe active-project automation", async () => {
  await assert.rejects(
    assemblePremiereJob({}, { protocolVersion: 1, id: "unsafe", generation: "gen-1", type: "premiere.assemble" }),
    /outputProject is required/
  );
});

test("Premiere UXP assembly rejects generation-less legacy jobs before host mutation", async () => {
  let called = false;
  const ppro = { Project: { async createProject() { called = true; return {}; } } };
  await assert.rejects(
    assemblePremiereJob(ppro, {
      protocolVersion: 1,
      id: "legacy",
      type: "premiere.assemble",
      outputProject: "/tmp/legacy.prproj"
    }),
    /generation is required/
  );
  assert.equal(called, false);
});

test("Premiere UXP assembly traverses project bins when the host omits the documented static finder", async () => {
  const mediaPath = "/tmp/prototype-master.mov";
  const project = { guid: "project-guid", async getRootItem() { return root; } };
  const clip = {
    kind: "clip",
    async getProject() { return project; },
    async getMediaFilePath() { return mediaPath; }
  };
  const root = { kind: "folder", children: [{ kind: "folder", children: [clip] }] };
  const ppro = {
    ClipProjectItem: {
      cast(item) {
        if (item.kind !== "clip") throw new Error("not a clip");
        return item;
      }
    },
    FolderItem: {
      cast(item) {
        if (item.kind !== "folder") throw new Error("not a folder");
        return { async getItems() { return item.children; } };
      }
    }
  };

  assert.equal(await findImportedClip(ppro, project, mediaPath), clip);
});

test("Premiere UXP assembly surfaces a failed host import", async () => {
  const project = {
    guid: "project-guid",
    async getRootItem() { return {}; },
    async importFiles() { return false; }
  };
  const ppro = {
    Project: { async createProject() { return project; } },
    ProjectItem: { cast(value) { return value; } }
  };
  await assert.rejects(
    assemblePremiereJob(ppro, {
      id: "failed-import",
      protocolVersion: 1,
      generation: "gen-1",
      type: "premiere.assemble",
      outputProject: "/tmp/output.prproj",
      media: ["/tmp/missing.mov"],
      save: false
    }),
    /failed to import media files/
  );
});

test("Premiere TimelineSpec helper exports H264 then ProRes sequentially through an injected host capability", async () => {
  const events = [];
  let active = 0;
  const job = {
    protocolVersion: 1,
    id: "timeline-job",
    generation: "generation-1",
    type: "premiere.build",
    outputProject: "/tmp/timeline.prproj",
    sequenceName: "TIMELINE",
    timelineSpec: {
      schemaVersion: 1,
      scenes: [{ id: "scene", source: "/tmp/source.mov", startMs: 0, durationMs: 1_000, track: 1, audio: true, audioPolicy: "preserve" }]
    },
    exports: [
      { format: "h264", output: "/tmp/timeline.mp4" },
      { format: "prores", output: "/tmp/timeline.mov" }
    ]
  };
  const hostCapabilities = {
    async buildTimeline() {
      events.push("build");
      return {
        project: job.outputProject,
        sequenceName: job.sequenceName,
        scenes: [{
          id: "scene",
          source: "/tmp/source.mov",
          startMs: 0,
          sourceInMs: 0,
          durationMs: 1_000,
          videoTrack: 1,
          audioPolicy: "preserve",
          audioTrack: 1,
          audioInserted: true
        }]
      };
    },
    async exportSequence(_ppro, _target, request) {
      active += 1;
      assert.equal(active, 1);
      events.push(`start:${request.format}`);
      await new Promise((resolve) => setTimeout(resolve, 2));
      events.push(`finish:${request.format}`);
      active -= 1;
      return { ok: true, format: request.format, output: request.output, completedAt: "2026-08-26T00:00:00.000Z" };
    }
  };
  const outputs = await executePremiereJob({}, job, () => {}, hostCapabilities);
  assert.deepEqual(events, ["build", "start:h264", "finish:h264", "start:prores", "finish:prores"]);
  assert.deepEqual(JSON.parse(JSON.stringify(outputs.exports)), [
    { ok: true, format: "h264", output: "/tmp/timeline.mp4", completedAt: "2026-08-26T00:00:00.000Z" },
    { ok: true, format: "prores", output: "/tmp/timeline.mov", completedAt: "2026-08-26T00:00:00.000Z" }
  ]);
});

test("Premiere TimelineSpec build-only job returns its target without requiring exports", async () => {
  const calls = [];
  const job = {
    protocolVersion: 1,
    id: "build-only-job",
    generation: "build-only-generation",
    type: "premiere.build",
    outputProject: "/tmp/build-only.prproj",
    sequenceName: "BUILD_ONLY",
    timelineSpec: {
      schemaVersion: 1,
      scenes: [{ id: "scene", source: "/tmp/still.png", startMs: 0, durationMs: 5_000, track: 1, audio: false, audioPolicy: "mute" }]
    }
  };
  const outputs = await executePremiereJob({}, job, () => {}, {
    async buildTimeline() {
      calls.push("build");
      return {
        project: job.outputProject,
        sequenceName: job.sequenceName,
        sequenceGuid: "guid",
        scenes: [{
          id: "scene",
          source: "/tmp/still.png",
          startMs: 0,
          sourceInMs: 0,
          durationMs: 5_000,
          videoTrack: 1,
          audioPolicy: "mute",
          audioTrack: -1,
          audioInserted: false
        }]
      };
    },
    async exportSequence() { calls.push("export"); throw new Error("must not export"); }
  });
  assert.deepEqual(calls, ["build"]);
  assert.equal(outputs.project, job.outputProject);
  assert.equal(outputs.sequenceName, job.sequenceName);
  assert.equal(outputs.sequenceGuid, "guid");
  assert.deepEqual(JSON.parse(JSON.stringify(outputs.exports)), []);
});

test("Premiere TimelineSpec resumes after completed build and H264 receipts without repeating side effects", async () => {
  const calls = [];
  const job = {
    protocolVersion: 1,
    id: "resume-job",
    generation: "resume-generation",
    type: "premiere.build",
    outputProject: "/tmp/resume.prproj",
    sequenceName: "RESUME",
    timelineSpec: {
      schemaVersion: 1,
      scenes: [{ id: "scene", source: "/tmp/source.mov", startMs: 0, durationMs: 1_000, track: 1, audio: true, audioPolicy: "preserve" }]
    },
    exports: [
      { format: "h264", output: "/tmp/resume.mp4" },
      { format: "prores", output: "/tmp/resume.mov" }
    ]
  };
  const h264Receipt = { ok: true, format: "h264", output: "/tmp/resume.mp4", completedAt: "2026-08-26T00:00:00.000Z" };
  const capabilities = {
    async recoverBuild() {
      calls.push("recover-build");
      return {
        project: job.outputProject,
        sequenceName: job.sequenceName,
        scenes: [{
          id: "scene",
          source: "/tmp/source.mov",
          startMs: 0,
          sourceInMs: 0,
          durationMs: 1_000,
          videoTrack: 1,
          audioPolicy: "preserve",
          audioTrack: 1,
          audioInserted: true
        }]
      };
    },
    async buildTimeline() { calls.push("build"); throw new Error("must not rebuild"); },
    async recoverExport(_job, request) {
      calls.push(`recover:${request.format}`);
      return request.format === "h264" ? h264Receipt : undefined;
    },
    async startExport(_job, request) { calls.push(`start:${request.format}`); },
    async exportSequence(_ppro, _target, request) {
      calls.push(`export:${request.format}`);
      return { ok: true, format: request.format, output: request.output, completedAt: "2026-08-26T00:00:01.000Z" };
    },
    async completeExport(_job, request) { calls.push(`complete:${request.format}`); }
  };

  const outputs = await executePremiereJob({}, job, () => {}, capabilities);
  assert.deepEqual(calls, ["recover-build", "recover:h264", "recover:prores", "start:prores", "export:prores", "complete:prores"]);
  assert.equal(outputs.exports.length, 2);
  assert.equal(outputs.exports[0].format, "h264");
  assert.equal(outputs.exports[1].format, "prores");
});

test("Premiere sequential export stops before a side effect when a stage receipt is ambiguous", async () => {
  let exports = 0;
  await assert.rejects(
    executeSequentialExports(async () => {
      exports += 1;
      return { ok: true, format: "h264", output: "/tmp/ambiguous.mp4" };
    }, [{ format: "h264", output: "/tmp/ambiguous.mp4" }], {
      async recoverExport() { throw new Error("ambiguous started receipt"); }
    }),
    /ambiguous started receipt/
  );
  assert.equal(exports, 0);
});

test("Premiere validates an export before writing its started-stage receipt", async () => {
  const events = [];
  await assert.rejects(executeSequentialExports(async () => {
    events.push("export");
  }, [{ format: "h264", output: "/tmp/invalid.mp4" }], {
    async startExport() { events.push("started"); }
  }, async () => {
    events.push("prepare");
    throw new Error("preset container mismatch");
  }), /preset container mismatch/);
  assert.deepEqual(events, ["prepare"]);
});

test("Premiere TimelineSpec jobs fail safely when no verified host capability is installed", async () => {
  await assert.rejects(
    executePremiereJob({}, {
      protocolVersion: 1,
      id: "deferred",
      generation: "generation",
      type: "premiere.build",
      outputProject: "/tmp/deferred.prproj",
      timelineSpec: { schemaVersion: 1, scenes: [{ id: "scene", source: "/tmp/source.mov", durationMs: 1_000 }] },
      exports: [{ format: "h264", output: "/tmp/deferred.mp4" }]
    }),
    /host capability is not installed/
  );
});

test("Premiere UXP assembly validates TimelineSpec dynamicLinks and rejects unsafe categories", () => {
  const validSpec = {
    schemaVersion: 1,
    durationMs: 5_000,
    scenes: [{ id: "scene1", source: "/tmp/source.mov", startMs: 0, durationMs: 5_000, track: 1, audio: true, audioPolicy: "preserve" }],
    dynamicLinks: [{
      id: "dl1",
      project: "/tmp/title.aep",
      composition: "Main",
      startMs: 0,
      durationMs: 2_000,
      track: 3,
      audioPolicy: "mute"
    }]
  };
  assert.equal(validateTimelineSpecDocument(validSpec), validSpec);

  // Missing scene audio
  assert.throws(() => validateTimelineSpecDocument({
    schemaVersion: 1,
    durationMs: 5_000,
    scenes: [{ id: "scene1", source: "/tmp/source.mov", startMs: 0, durationMs: 5_000, track: 1, audioPolicy: "preserve" }]
  }), /scene audio must be a boolean/);

  // Mismatch scene audio
  assert.throws(() => validateTimelineSpecDocument({
    schemaVersion: 1,
    durationMs: 5_000,
    scenes: [{ id: "scene1", source: "/tmp/source.mov", startMs: 0, durationMs: 5_000, track: 1, audio: false, audioPolicy: "preserve" }]
  }), /scene audio must match audioPolicy/);

  // Missing explicit durationMs when dynamicLinks present
  assert.throws(() => validateTimelineSpecDocument({
    schemaVersion: 1,
    scenes: [{ id: "scene1", source: "/tmp/source.mov", startMs: 0, durationMs: 5_000, track: 1, audio: true, audioPolicy: "preserve" }],
    dynamicLinks: validSpec.dynamicLinks
  }), /explicit positive frame-aligned/);

  // Off-frame durationMs
  assert.throws(() => validateTimelineSpecDocument({
    ...validSpec,
    durationMs: 5_001
  }), /explicit positive frame-aligned/);

  // Unsafe id
  assert.throws(() => validateTimelineSpecDocument({
    ...validSpec,
    dynamicLinks: [{ ...validSpec.dynamicLinks[0], id: "invalid id!" }]
  }), /id is invalid/);

  // Relative AEP path
  assert.throws(() => validateTimelineSpecDocument({
    ...validSpec,
    dynamicLinks: [{ ...validSpec.dynamicLinks[0], project: "relative.aep" }]
  }), /must be an absolute path/);

  // Empty composition
  assert.throws(() => validateTimelineSpecDocument({
    ...validSpec,
    dynamicLinks: [{ ...validSpec.dynamicLinks[0], composition: "  " }]
  }), /must be a non-empty string/);

  // Off-frame startMs
  assert.throws(() => validateTimelineSpecDocument({
    ...validSpec,
    dynamicLinks: [{ ...validSpec.dynamicLinks[0], startMs: 25 }]
  }), /frame-aligned at 25fps/);

  // Off-frame durationMs
  assert.throws(() => validateTimelineSpecDocument({
    ...validSpec,
    dynamicLinks: [{ ...validSpec.dynamicLinks[0], durationMs: 999 }]
  }), /frame-aligned at 25fps/);

  // Invalid track
  assert.throws(() => validateTimelineSpecDocument({
    ...validSpec,
    dynamicLinks: [{ ...validSpec.dynamicLinks[0], track: 0 }]
  }), /must be a positive integer/);

  // AudioPolicy other than mute
  assert.throws(() => validateTimelineSpecDocument({
    ...validSpec,
    dynamicLinks: [{ ...validSpec.dynamicLinks[0], audioPolicy: "unmute" }]
  }), /must equal 'mute'/);

  // Duplicate ID
  assert.throws(() => validateTimelineSpecDocument({
    ...validSpec,
    dynamicLinks: [validSpec.dynamicLinks[0], validSpec.dynamicLinks[0]]
  }), /duplicated/);

  // Out of bounds
  assert.throws(() => validateTimelineSpecDocument({
    ...validSpec,
    dynamicLinks: [{ ...validSpec.dynamicLinks[0], startMs: 4_000, durationMs: 2_000 }]
  }), /exceeds timeline bounds/);

  // Same-track collision
  assert.throws(() => validateTimelineSpecDocument({
    ...validSpec,
    dynamicLinks: [
      { ...validSpec.dynamicLinks[0], id: "dl_a", startMs: 0, durationMs: 2_000, track: 3 },
      { ...validSpec.dynamicLinks[0], id: "dl_b", startMs: 1_000, durationMs: 2_000, track: 3 }
    ]
  }), /collide on track 3/);
});

test("findImportedAEComp walks folder tree, resolves non-clip items, and fails closed on ambiguity", async () => {
  const project = { guid: "project-guid" };
  const nestedComp = { name: "MainComp" };
  const folder = {
    kind: "folder",
    async getItems() { return [nestedComp]; }
  };
  const rootItem = {
    kind: "folder",
    async getItems() { return [folder]; }
  };
  project.getRootItem = async () => rootItem;

  const ppro = {
    FolderItem: {
      cast(item) {
        if (item && item.kind === "folder") return item;
        throw new Error("not a folder");
      }
    },
    ProjectItem: { cast(item) { return item; } }
  };

  // Traversal resolves nested comp without getMediaFilePath
  const resolved = await findImportedAEComp(ppro, project, "/media/proj.aep", "MainComp");
  assert.equal(resolved, nestedComp);
  assert.deepEqual(JSON.parse(JSON.stringify(await describeAECompCandidates(ppro, project))), [
    { name: "MainComp", mediaPath: "" }
  ]);

  // Premiere exposes folder children as a native ProjectItemCollection,
  // which is array-like but does not pass Array.isArray().
  const nativeComp = { name: "NativeComp" };
  const nativeFolder = {
    kind: "folder",
    async getItems() { return { 0: nativeComp, length: 1 }; }
  };
  project.getRootItem = async () => nativeFolder;
  const resolvedNative = await findImportedAEComp(ppro, project, "/media/proj.aep", "NativeComp");
  assert.equal(resolvedNative, nativeComp);

  // Premiere can index a Dynamic Link ClipProjectItem by AEP path before the
  // item appears in FolderItem.getItems(). Resolve through that authoritative
  // host index and still require the exact output project and comp name.
  const indexedComp = {
    name: "IndexedComp",
    async getProject() { return project; },
    async getMediaFilePath() { return "/media/proj.aep"; }
  };
  ppro.ClipProjectItem = {
    async findItemsMatchingMediaPath(value) {
      assert.equal(value, "/media/proj.aep");
      return { 0: indexedComp, length: 1 };
    }
  };
  const emptyRoot = { kind: "folder", async getItems() { return []; } };
  project.getRootItem = async () => emptyRoot;
  const resolvedIndexed = await findImportedAEComp(ppro, project, "/media/proj.aep", "IndexedComp");
  assert.equal(resolvedIndexed, indexedComp);

  delete ppro.ClipProjectItem;

  const betaNamedComp = { name: "MainComp/proj.aep" };
  const betaRoot = { kind: "folder", async getItems() { return [betaNamedComp]; } };
  project.getRootItem = async () => betaRoot;
  const resolvedBetaNamed = await findImportedAEComp(ppro, project, "/media/proj.aep", "MainComp");
  assert.equal(resolvedBetaNamed, betaNamedComp);

  project.getRootItem = async () => rootItem;

  // 0 matches returns null
  const missing = await findImportedAEComp(ppro, project, "/media/proj.aep", "NonExistentComp");
  assert.equal(missing, null);

  // Duplicate composition names throw Ambiguous error (fail closed)
  const duplicateFolder = {
    kind: "folder",
    async getItems() { return [{ name: "Duplicate" }, { name: "Duplicate" }]; }
  };
  project.getRootItem = async () => duplicateFolder;

  await assert.rejects(
    findImportedAEComp(ppro, project, "/media/proj.aep", "Duplicate"),
    /Ambiguous After Effects composition: multiple items match composition name 'Duplicate'/
  );

  // Duplicate path matches throw Ambiguous error (fail closed)
  const duplicateExactFolder = {
    kind: "folder",
    async getItems() {
      return [
        { name: "Exact", async getMediaFilePath() { return "/media/proj.aep"; } },
        { name: "Exact", async getMediaFilePath() { return "/media/proj.aep"; } }
      ];
    }
  };
  project.getRootItem = async () => duplicateExactFolder;

  await assert.rejects(
    findImportedAEComp(ppro, project, "/media/proj.aep", "Exact"),
    /Ambiguous After Effects composition: multiple items match composition name 'Exact' and path/
  );
});

test("Premiere UXP executePremiereJob semantically validates Dynamic Link receipts and fails closed", async () => {
  const job = {
    protocolVersion: 1,
    id: "dl-job",
    generation: "dl-generation",
    type: "premiere.build",
    outputProject: "/tmp/dl-job.prproj",
    sequenceName: "DL_SEQUENCE",
    timelineSpec: {
      schemaVersion: 1,
      durationMs: 5_000,
      scenes: [{ id: "scene1", source: "/tmp/scene.mov", startMs: 0, durationMs: 5_000, track: 1, audio: true, audioPolicy: "preserve" }],
      dynamicLinks: [{
        id: "dl_comp",
        project: "/tmp/comp.aep",
        composition: "Comp1",
        startMs: 0,
        durationMs: 2_000,
        track: 3,
        audioPolicy: "mute"
      }]
    }
  };

  const sceneReceipt = {
    id: "scene1",
    source: "/tmp/scene.mov",
    startMs: 0,
    sourceInMs: 0,
    durationMs: 5_000,
    videoTrack: 1,
    audioPolicy: "preserve",
    audioTrack: 1,
    audioInserted: true
  };

  const validReceipt = {
    id: "dl_comp",
    project: "/tmp/comp.aep",
    composition: "Comp1",
    startMs: 0,
    durationMs: 2_000,
    videoTrack: 3,
    audioPolicy: "mute",
    audioTrack: -1,
    audioInserted: false
  };

  const successfulCapabilities = {
    async buildTimeline() {
      return {
        project: job.outputProject,
        sequenceName: job.sequenceName,
        sequenceGuid: "guid-dl",
        scenes: [sceneReceipt],
        dynamicLinks: [validReceipt]
      };
    }
  };

  const outputs = await executePremiereJob({}, job, () => {}, successfulCapabilities);
  assert.equal(outputs.project, job.outputProject);
  assert.equal(outputs.sequenceName, job.sequenceName);
  assert.deepEqual(outputs.dynamicLinks, [validReceipt]);

  // Fails closed if receipts empty / missing
  await assert.rejects(
    executePremiereJob({}, job, () => {}, {
      async buildTimeline() { return { project: job.outputProject, sequenceName: job.sequenceName, scenes: [sceneReceipt], dynamicLinks: [] }; }
    }),
    /dynamicLinks receipt count mismatch/
  );

  // Fails closed on duplicate receipts
  await assert.rejects(
    executePremiereJob({}, {
      ...job,
      timelineSpec: { ...job.timelineSpec, dynamicLinks: [job.timelineSpec.dynamicLinks[0], { ...job.timelineSpec.dynamicLinks[0], id: "dl2", startMs: 2000 }] }
    }, () => {}, {
      async buildTimeline() { return { project: job.outputProject, sequenceName: job.sequenceName, scenes: [sceneReceipt], dynamicLinks: [validReceipt, validReceipt] }; }
    }),
    /Duplicate dynamic link receipt/
  );

  // Fails closed on substituted receipt id
  await assert.rejects(
    executePremiereJob({}, job, () => {}, {
      async buildTimeline() { return { project: job.outputProject, sequenceName: job.sequenceName, scenes: [sceneReceipt], dynamicLinks: [{ ...validReceipt, id: "substituted" }] }; }
    }),
    /Missing dynamic link receipt for requested id 'dl_comp'/
  );

  // Fails closed on altered videoTrack (e.g. 2 instead of 3)
  await assert.rejects(
    executePremiereJob({}, job, () => {}, {
      async buildTimeline() { return { project: job.outputProject, sequenceName: job.sequenceName, scenes: [sceneReceipt], dynamicLinks: [{ ...validReceipt, videoTrack: 2 }] }; }
    }),
    /videoTrack mismatch/
  );

  // Fails closed on audioInserted: true
  await assert.rejects(
    executePremiereJob({}, job, () => {}, {
      async buildTimeline() { return { project: job.outputProject, sequenceName: job.sequenceName, scenes: [sceneReceipt], dynamicLinks: [{ ...validReceipt, audioInserted: true }] }; }
    }),
    /audioInserted must be false/
  );

  // Fails closed on audioTrack !== -1
  await assert.rejects(
    executePremiereJob({}, job, () => {}, {
      async buildTimeline() { return { project: job.outputProject, sequenceName: job.sequenceName, scenes: [sceneReceipt], dynamicLinks: [{ ...validReceipt, audioTrack: 0 }] }; }
    }),
    /audioTrack must equal -1/
  );

  // Fails closed on startMs mismatch
  await assert.rejects(
    executePremiereJob({}, job, () => {}, {
      async buildTimeline() { return { project: job.outputProject, sequenceName: job.sequenceName, scenes: [sceneReceipt], dynamicLinks: [{ ...validReceipt, startMs: 400 }] }; }
    }),
    /startMs mismatch/
  );
});

test("Premiere UXP executePremiereJob validates scenes, overlays, and audio receipts fail-closed", async () => {
  const job = {
    protocolVersion: 1,
    id: "full-job",
    generation: "full-generation",
    type: "premiere.build",
    outputProject: "/tmp/full.prproj",
    sequenceName: "FULL_SEQ",
    timelineSpec: {
      schemaVersion: 1,
      durationMs: 10_000,
      scenes: [
        { id: "s_aroll", source: "/media/a.mov", startMs: 0, sourceInMs: 0, durationMs: 4_000, track: 1, audio: true, audioPolicy: "preserve", storyboardItemId: "sb_a", editorialKind: "a_roll" },
        { id: "s_logo", source: "/media/logo.mov", startMs: 8_000, sourceInMs: 0, durationMs: 2_000, track: 1, audio: false, audioPolicy: "mute", storyboardItemId: "sb_l", editorialKind: "logo_outro" }
      ],
      overlays: [
        { id: "o_cover", asset: "/media/cover.png", startMs: 4_000, durationMs: 4_000, track: 2, audioPolicy: "mute", storyboardItemId: "sb_c", editorialKind: "cover_card" }
      ],
      audio: [
        { id: "a_music", path: "/media/bed.wav", startMs: 0, durationMs: 10_000 }
      ]
    }
  };

  const validScenes = [
    { id: "s_aroll", source: "/media/a.mov", startMs: 0, sourceInMs: 0, durationMs: 4_000, videoTrack: 1, audioPolicy: "preserve", audioTrack: 1, audioInserted: true, storyboardItemId: "sb_a", editorialKind: "a_roll" },
    { id: "s_logo", source: "/media/logo.mov", startMs: 8_000, sourceInMs: 0, durationMs: 2_000, videoTrack: 1, audioPolicy: "mute", audioTrack: -1, audioInserted: false, storyboardItemId: "sb_l", editorialKind: "logo_outro" }
  ];
  const validOverlays = [
    { id: "o_cover", asset: "/media/cover.png", startMs: 4_000, durationMs: 4_000, videoTrack: 2, audioPolicy: "mute", audioTrack: -1, audioInserted: false, storyboardItemId: "sb_c", editorialKind: "cover_card" }
  ];
  const validAudio = [
    { id: "a_music", path: "/media/bed.wav", startMs: 0, durationMs: 10_000, audioTrack: 1, audioInserted: true }
  ];

  // Success
  const outputs = await executePremiereJob({}, job, () => {}, {
    async buildTimeline() {
      return { project: job.outputProject, sequenceName: job.sequenceName, scenes: validScenes, overlays: validOverlays, audio: validAudio };
    }
  });
  assert.equal(outputs.scenes.length, 2);
  assert.equal(outputs.overlays.length, 1);
  assert.equal(outputs.audio.length, 1);

  // Muted scene claiming audioTrack: 1 fails closed
  await assert.rejects(
    executePremiereJob({}, job, () => {}, {
      async buildTimeline() {
        return {
          project: job.outputProject,
          scenes: [validScenes[0], { ...validScenes[1], audioTrack: 1, audioInserted: false }],
          overlays: validOverlays,
          audio: validAudio
        };
      }
    }),
    /Scene receipt audioTrack must be -1 for mute/
  );

  // Muted scene claiming audioInserted: true fails closed
  await assert.rejects(
    executePremiereJob({}, job, () => {}, {
      async buildTimeline() {
        return {
          project: job.outputProject,
          scenes: [validScenes[0], { ...validScenes[1], audioTrack: -1, audioInserted: true }],
          overlays: validOverlays,
          audio: validAudio
        };
      }
    }),
    /Scene receipt audioInserted must be false for mute/
  );

  // Preserve scene claiming wrong audioTrack fails closed
  await assert.rejects(
    executePremiereJob({}, job, () => {}, {
      async buildTimeline() {
        return {
          project: job.outputProject,
          scenes: [{ ...validScenes[0], audioTrack: -1, audioInserted: true }, validScenes[1]],
          overlays: validOverlays,
          audio: validAudio
        };
      }
    }),
    /Scene receipt audioTrack mismatch for 's_aroll'/
  );

  // Preserve scene missing audioInserted fails closed
  await assert.rejects(
    executePremiereJob({}, job, () => {}, {
      async buildTimeline() {
        return {
          project: job.outputProject,
          scenes: [{ ...validScenes[0], audioTrack: 1, audioInserted: false }, validScenes[1]],
          overlays: validOverlays,
          audio: validAudio
        };
      }
    }),
    /Scene receipt audioInserted must be true for preserve/
  );

  // Overlay claiming audioInserted fails closed
  await assert.rejects(
    executePremiereJob({}, job, () => {}, {
      async buildTimeline() {
        return {
          project: job.outputProject,
          scenes: validScenes,
          overlays: [{ ...validOverlays[0], audioInserted: true }],
          audio: validAudio
        };
      }
    }),
    /Overlay receipt audioInserted must be false/
  );

  // Altered storyboardItemId fails closed
  await assert.rejects(
    executePremiereJob({}, job, () => {}, {
      async buildTimeline() {
        return {
          project: job.outputProject,
          scenes: [{ ...validScenes[0], storyboardItemId: "altered" }, validScenes[1]],
          overlays: validOverlays,
          audio: validAudio
        };
      }
    }),
    /Scene receipt storyboardItemId mismatch/
  );
});
