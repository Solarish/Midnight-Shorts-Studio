import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../adobe/premiere-uxp/index.js", import.meta.url), "utf8");

function loadPanel({ job, postStatus = 200, mkdirError, receiptFiles = {}, timelineHost = false, assemblyError }) {
  let setup;
  let scheduled;
  let assemblyCalls = 0;
  const writes = [];
  const fs = {
    async mkdir() {
      if (mkdirError) throw mkdirError;
    },
    async readFile(filePath) {
      if (filePath.endsWith("job.json")) return JSON.stringify(job);
      const receipt = receiptFiles[filePath.split("/").at(-1)];
      if (receipt) return JSON.stringify(receipt);
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
    async writeFile(filePath, content) { writes.push({ filePath, content }); }
  };
  const sandbox = {
    console: { log() {} },
    document: { getElementById() { return null; } },
    clearTimeout() {},
    clearInterval() {},
    setTimeout(callback) { scheduled = callback; return 1; },
    setInterval() { return 2; },
    fetch: async (url, options) => {
      if (!options?.method) return { ok: true, status: 200, async json() { return job; } };
      return { ok: postStatus >= 200 && postStatus < 300, status: postStatus, async json() { return { accepted: postStatus === 200 }; } };
    },
    require(name) {
      if (name === "uxp") return { entrypoints: { setup(value) { setup = value; } } };
      if (name === "premierepro") return {};
      if (name === "fs") return fs;
      throw new Error(`Unexpected module ${name}`);
    },
    AvaPremiereAssembly: {
      async assemblePremiereJob() { assemblyCalls += 1; return { project: "/tmp/output.prproj" }; },
      async executePremiereJob() {
        assemblyCalls += 1;
        if (assemblyError !== undefined) throw assemblyError;
        return { project: job.outputProject, sequenceName: job.sequenceName, sequenceGuid: "guid", exports: [] };
      }
    },
    ...(timelineHost ? { AvaPremiereHostCapabilities: { async buildTimeline() {}, async exportSequence() {} } } : {})
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "premiere-uxp/index.js" });
  setup.plugin.create();
  return {
    async pollOnce() { const callback = scheduled; await callback(); },
    get assemblyCalls() { return assemblyCalls; },
    writes
  };
}

test("Premiere heartbeat tolerates an existing mailbox directory", async () => {
  const panel = loadPanel({
    job: { protocolVersion: 1, id: "legacy", type: "premiere.assemble" },
    mkdirError: Object.assign(new Error("file already exists"), { code: "EEXIST" })
  });
  await panel.pollOnce();
  const heartbeat = panel.writes.find((entry) => entry.filePath.endsWith("/plugin-heartbeat.json"));
  assert.ok(heartbeat);
  assert.equal(JSON.parse(heartbeat.content).pluginVersion, "0.4.4");
  assert.deepEqual(JSON.parse(heartbeat.content).capabilities, ["timeline.build", "sequence.export", "staged.receipts"]);
});

test("Premiere panel rejects generation-less jobs before host mutation", async () => {
  const panel = loadPanel({ job: { protocolVersion: 1, id: "legacy", type: "premiere.assemble" } });
  await panel.pollOnce();
  assert.equal(panel.assemblyCalls, 0);
  assert.equal(panel.writes.some((entry) => /started-|completed-|result\.json$/.test(entry.filePath)), false);
});

test("Premiere panel does not downgrade an HTTP 409 into a mailbox result", async () => {
  const panel = loadPanel({
    job: { protocolVersion: 1, id: "current", generation: "gen-1", type: "premiere.assemble", outputProject: "/tmp/output.prproj" },
    postStatus: 409
  });
  await panel.pollOnce();
  assert.equal(panel.assemblyCalls, 1);
  assert.ok(panel.writes.some((entry) => entry.filePath.includes("started-current.json")));
  assert.ok(panel.writes.some((entry) => entry.filePath.includes("completed-current.json")));
  assert.equal(panel.writes.some((entry) => entry.filePath.endsWith("/result.json")), false);
});

test("Premiere panel defers unverified TimelineSpec host APIs without mutation receipts", async () => {
  const panel = loadPanel({
    job: {
      protocolVersion: 1,
      id: "timeline-deferred",
      generation: "gen-2",
      type: "premiere.build",
      outputProject: "/tmp/deferred.prproj",
      timelineSpec: { schemaVersion: 1, scenes: [{ id: "scene", source: "/tmp/source.mov", durationMs: 1_000 }] },
      exports: [{ format: "h264", output: "/tmp/deferred.mp4" }]
    }
  });
  await panel.pollOnce();
  assert.equal(panel.assemblyCalls, 0);
  assert.equal(panel.writes.some((entry) => /started-|completed-/.test(entry.filePath)), false);
});

test("Premiere panel retries a failed staged wrapper so stage receipts can recover safely", async () => {
  const job = {
    protocolVersion: 1,
    id: "staged-retry",
    generation: "gen-3",
    type: "premiere.build",
    outputProject: "/tmp/staged.prproj",
    sequenceName: "STAGED",
    timelineSpec: { schemaVersion: 1, scenes: [{ id: "scene", source: "/tmp/still.png", durationMs: 5_000 }] },
    exports: []
  };
  const panel = loadPanel({
    job,
    timelineHost: true,
    receiptFiles: {
      "completed-staged-retry.json": { protocolVersion: 1, jobId: job.id, generation: job.generation, ok: false, error: "wrapper failed after build" },
      "started-staged-retry.json": { protocolVersion: 1, jobId: job.id, generation: job.generation, stage: "host-mutation-pending" }
    }
  });
  await panel.pollOnce();
  assert.equal(panel.assemblyCalls, 1);
  const completion = panel.writes.find((entry) => entry.filePath.endsWith("completed-staged-retry.json"));
  assert.equal(JSON.parse(completion.content).ok, true);
});

test("Premiere panel serializes opaque host failures as protocol-safe error strings", async () => {
  const job = { protocolVersion: 1, id: "opaque-failure", generation: "gen-4", type: "premiere.export", project: "/tmp/project.prproj", exports: [] };
  const panel = loadPanel({ job, timelineHost: true, assemblyError: { code: "OPAQUE_NATIVE" } });
  await panel.pollOnce();
  const completion = panel.writes.find((entry) => entry.filePath.endsWith("completed-opaque-failure.json"));
  const result = JSON.parse(completion.content);
  assert.equal(result.ok, false);
  assert.equal(result.error, "code=OPAQUE_NATIVE");
});
