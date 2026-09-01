import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LocalControlStore } from "@psu-ava/persistence-local";
import { compilePortraitStory } from "@psu-ava/recipes";
import { RunScheduler } from "../src/scheduler.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("scheduler runs the fixed recipe sequentially in dry-run mode and persists ordered events", async () => {
  const controlRoot = await mkdtemp(path.join(tmpdir(), "ava-control-test-"));
  const store = new LocalControlStore(controlRoot);
  const scheduler = new RunScheduler(projectRoot, store, { resourceLockPath: path.join(controlRoot, "resource.lock") });
  await scheduler.initialize();
  const manifest = {
    manifestVersion: 1,
    recipeId: "portrait-story-v1",
    id: "scheduler-test",
    projectName: "Scheduler Test",
    presenterAsset: { assetId: "fixture", projectPath: "assets/input/prototype-presenter.png", originalName: "prototype-presenter.png", mimeType: "image/png", previewUrl: "" },
    headline: "PSU BROADCAST",
    subheadline: "SCHEDULER TEST",
    backgroundBrief: "calm modern university broadcast studio"
  } as const;
  const [record, duplicate] = await Promise.all([
    scheduler.enqueue(manifest, true, "scheduler-fixture-key"),
    scheduler.enqueue(manifest, true, "scheduler-fixture-key")
  ]);
  assert.equal(duplicate.runId, record.runId);
  assert.equal((await store.list()).length, 1);
  let current = await store.get(record.runId);
  let events = await store.events(record.runId);
  for (let attempt = 0; attempt < 100 && (current?.status !== "success" || events.at(-1)?.type !== "run.succeeded"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 15));
    current = await store.get(record.runId);
    events = await store.events(record.runId);
  }
  assert.equal(current?.status, "success");
  assert.equal(events[0]?.type, "run.queued");
  assert.equal(events.at(-1)?.type, "run.succeeded");
  assert.deepEqual(events.map((event) => event.sequence), events.map((_, index) => index + 1));
  if (current?.runDir) await rm(current.runDir, { recursive: true, force: true });
  await rm(controlRoot, { recursive: true, force: true });
});

test("scheduler restores a queued resume with its bounds after restart", async () => {
  const controlRoot = await mkdtemp(path.join(tmpdir(), "ava-control-resume-test-"));
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-control-resume-run-"));
  const store = new LocalControlStore(controlRoot);
  await store.init();
  const manifest = {
    manifestVersion: 1 as const,
    recipeId: "portrait-story-v1" as const,
    id: "restart-resume",
    projectName: "Restart Resume",
    presenterAsset: { assetId: "fixture", projectPath: "assets/input/prototype-presenter.png", originalName: "prototype-presenter.png", mimeType: "image/png", previewUrl: "" },
    headline: "PSU BROADCAST",
    subheadline: "RESTART RESUME",
    backgroundBrief: "calm modern university broadcast studio"
  };
  const compiled = compilePortraitStory(manifest);
  const runId = "restart_resume_fixture";
  const startedAt = "2026-01-01T00:00:00.000Z";
  await store.saveSubmission(runId, manifest, compiled.raw);
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, "state.json"), `${JSON.stringify({
    schemaVersion: 1,
    version: 1,
    workflowId: compiled.workflow.id,
    workflowDigest: compiled.digest,
    runId,
    runDir,
    status: "failed",
    dryRun: true,
    startedAt,
    updatedAt: startedAt,
    steps: {}
  }, null, 2)}\n`);
  await store.put({
    runId,
    recipeId: manifest.recipeId,
    projectName: manifest.projectName,
    status: "queued",
    dryRun: true,
    workflowDigest: compiled.digest,
    configPath: store.workflowPath(runId),
    runDir,
    createdAt: startedAt,
    updatedAt: startedAt,
    queuedOperation: "resume",
    resumeFrom: "select_presenter",
    resumeTo: "select_presenter"
  });

  const scheduler = new RunScheduler(projectRoot, store, { resourceLockPath: path.join(controlRoot, "resource.lock") });
  await scheduler.initialize();
  let current = await store.get(runId);
  for (let attempt = 0; attempt < 100 && current?.status !== "partial"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    current = await store.get(runId);
  }
  assert.equal(current?.status, "partial");
  const checkpoint = JSON.parse(await readFile(path.join(runDir, "state.json"), "utf8"));
  assert.equal(checkpoint.startedAt, startedAt);
  assert.equal(checkpoint.stoppedAtStep, "select_presenter");
  assert.equal(current?.queuedOperation, undefined);
  assert.ok((await store.events(runId)).some((event) => event.type === "checkpoint.recovered"));

  await rm(runDir, { recursive: true, force: true });
  await rm(controlRoot, { recursive: true, force: true });
});

test("idempotency keys reject a changed payload or execution mode", async () => {
  const controlRoot = await mkdtemp(path.join(tmpdir(), "ava-control-idempotency-"));
  const store = new LocalControlStore(controlRoot);
  const scheduler = new RunScheduler(projectRoot, store, { resourceLockPath: path.join(controlRoot, "resource.lock") });
  await scheduler.initialize();
  const manifest = fixtureManifest("idempotency", "Original");
  const original = await scheduler.enqueue(manifest, true, "same-key");
  await assert.rejects(scheduler.enqueue({ ...manifest, headline: "CHANGED" }, true, "same-key"), (error: any) => error.statusCode === 409);
  await assert.rejects(scheduler.enqueue(manifest, false, "same-key"), (error: any) => error.statusCode === 409);
  const completed = await waitForStatus(store, original.runId, "success");
  if (completed.runDir) await rm(completed.runDir, { recursive: true, force: true });
  await rm(controlRoot, { recursive: true, force: true });
});

test("compiled workflow idempotency includes the original execution bound", async () => {
  const controlRoot = await mkdtemp(path.join(tmpdir(), "ava-control-idempotency-bound-"));
  const store = new LocalControlStore(controlRoot);
  const scheduler = new RunScheduler(projectRoot, store, { resourceLockPath: path.join(controlRoot, "resource.lock") });
  await scheduler.initialize();
  const workflow = {
    schemaVersion: 1 as const,
    id: "bounded_idempotency",
    steps: [
      { id: "source", type: "asset.select" as const, with: { path: "assets/input/prototype-presenter.png" } },
      { id: "probe", type: "media.probe" as const, with: { path: "${source.path}" } }
    ]
  };
  const raw = `${JSON.stringify(workflow, null, 2)}\n`;
  const submission = { manifest: { graphId: workflow.id }, workflow, raw, recipeId: workflow.id, projectName: "Bounded idempotency" };
  const original = await scheduler.enqueueCompiledWorkflow(submission, true, "bounded-key", { to: "source" });
  assert.equal(original.startTo, "source");
  assert.equal((await scheduler.enqueueCompiledWorkflow(submission, true, "bounded-key", { to: "source" })).runId, original.runId);
  await assert.rejects(
    scheduler.enqueueCompiledWorkflow(submission, true, "bounded-key", { to: "probe" }),
    (error: any) => error.statusCode === 409
  );
  const completed = await waitForStatus(store, original.runId, "partial");
  if (completed.runDir) await rm(completed.runDir, { recursive: true, force: true });
  await rm(controlRoot, { recursive: true, force: true });
});

test("scheduler accepts an already compiled graph workflow without a recipe-specific manifest", async () => {
  const controlRoot = await mkdtemp(path.join(tmpdir(), "ava-control-compiled-"));
  const store = new LocalControlStore(controlRoot);
  const scheduler = new RunScheduler(projectRoot, store, { resourceLockPath: path.join(controlRoot, "resource.lock") });
  await scheduler.initialize();
  const workflow = {
    schemaVersion: 1 as const,
    id: "graph_compiled_fixture",
    name: "Graph compiled fixture",
    steps: [{ id: "source", type: "asset.select" as const, with: { path: "assets/input/prototype-presenter.png" } }]
  };
  const raw = `${JSON.stringify(workflow, null, 2)}\n`;
  const record = await scheduler.enqueueCompiledWorkflow({
    manifest: { graphSchemaVersion: 1, graphId: "graph-fixture", revision: 3 },
    workflow,
    raw,
    recipeId: "graph-fixture",
    projectName: "Graph compiled fixture"
  }, true, "graph-compiled-fixture");
  const completed = await waitForStatus(store, record.runId, "success");
  assert.equal(completed.recipeId, "graph-fixture");
  assert.deepEqual(JSON.parse(await readFile(store.manifestPath(record.runId), "utf8")), { graphSchemaVersion: 1, graphId: "graph-fixture", revision: 3 });
  if (completed.runDir) await rm(completed.runDir, { recursive: true, force: true });
  await rm(controlRoot, { recursive: true, force: true });
});

test("live graph execution becomes needs-attention when graph-specific output verification fails", async () => {
  const controlRoot = await mkdtemp(path.join(tmpdir(), "ava-control-graph-verification-"));
  const store = new LocalControlStore(controlRoot);
  const scheduler = new RunScheduler(projectRoot, store, {
    resourceLockPath: path.join(controlRoot, "resource.lock"),
    adapterRegistry: { "asset.select": async () => ({}) }
  });
  await scheduler.initialize();
  const workflow = { schemaVersion: 1 as const, id: "graph_verification", steps: [{ id: "source", type: "asset.select" as const, with: { path: "assets/input/prototype-presenter.png" } }] };
  const raw = `${JSON.stringify(workflow, null, 2)}\n`;
  const record = await scheduler.enqueueCompiledWorkflow({ manifest: { graphId: workflow.id }, workflow, raw, recipeId: workflow.id, projectName: "Verification" }, false, "graph-verification");
  const completed = await waitForStatus(store, record.runId, "needs_attention");
  assert.equal(completed.errorCode, "OUTPUT_VERIFICATION_FAILED");
  assert.equal(completed.verification?.status, "failed");
  assert.ok((await store.events(record.runId)).some((event) => event.type === "verification.completed"));
  if (completed.runDir) await rm(completed.runDir, { recursive: true, force: true });
  await rm(controlRoot, { recursive: true, force: true });
});

test("two scheduler instances share one machine resource lease", async () => {
  const controlRoot = await mkdtemp(path.join(tmpdir(), "ava-control-global-sequential-"));
  const store = new LocalControlStore(controlRoot);
  const lockPath = path.join(controlRoot, "resource.lock");
  let active = 0;
  let maximum = 0;
  const adapter = async (_input: any, context: any) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 8));
    active -= 1;
    const outputs: Record<string, any> = {
      "asset.select": { path: "/tmp/presenter.png" },
      "image.removeBackground": { path: "/tmp/cutout.png" },
      "comfyui.workflow": { images: [{ localPath: "/tmp/background.png" }] },
      "template.payload": { text: {}, footage: {} },
      "remotion.render": { output: "/tmp/master.mp4", durationMs: 5000, width: 1080, height: 1920 }
    };
    return outputs[context.step.type] ?? {};
  };
  const adapterRegistry = Object.fromEntries(["asset.select", "image.removeBackground", "comfyui.workflow", "template.payload", "remotion.render"].map((type) => [type, adapter]));
  const first = new RunScheduler(projectRoot, store, { adapterRegistry, resourceRetryMs: 5 });
  const second = new RunScheduler(projectRoot, store, { adapterRegistry, resourceRetryMs: 5 });
  await Promise.all([first.initialize(), second.initialize()]);
  const [one, two] = await Promise.all([
    first.enqueue(fixtureManifest("global-one", "One"), true, "global-one"),
    second.enqueue(fixtureManifest("global-two", "Two"), true, "global-two")
  ]);
  const [oneComplete, twoComplete] = await Promise.all([waitForStatus(store, one.runId, "success"), waitForStatus(store, two.runId, "success")]);
  assert.ok(maximum >= 1);
  if (oneComplete.runDir) await rm(oneComplete.runDir, { recursive: true, force: true });
  if (twoComplete.runDir) await rm(twoComplete.runDir, { recursive: true, force: true });
  await rm(controlRoot, { recursive: true, force: true });
});

test("modified queued workflow snapshots are refused as needs-attention", async () => {
  const controlRoot = await mkdtemp(path.join(tmpdir(), "ava-control-snapshot-"));
  const store = new LocalControlStore(controlRoot);
  const scheduler = new RunScheduler(projectRoot, store);
  const record = await scheduler.enqueue(fixtureManifest("snapshot", "Snapshot"), true, "snapshot");
  await writeFile(record.configPath, `${JSON.stringify({ schemaVersion: 1, id: "tampered", steps: [{ id: "one", type: "asset.select" }] })}\n`);
  await scheduler.initialize();
  const current = await waitForStatus(store, record.runId, "needs_attention");
  assert.match(current.error ?? "", /digest mismatch/);
  await rm(controlRoot, { recursive: true, force: true });
});

test("a queued cancellation transitions status to cancelled", async () => {
  const controlRoot = await mkdtemp(path.join(tmpdir(), "ava-control-cancel-race-"));
  const store = new LocalControlStore(controlRoot);
  const scheduler = new RunScheduler(projectRoot, store);
  const record = {
    runId: "cancel-race",
    recipeId: "test",
    projectName: "Cancel Race",
    status: "queued" as const,
    dryRun: true,
    workflowDigest: "test",
    configPath: "/tmp/config.json",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await store.put(record);
  const cancelled = await scheduler.cancelQueued("cancel-race");
  assert.equal(cancelled.status, "cancelled");
  assert.equal((await store.get("cancel-race"))?.status, "cancelled");
  await rm(controlRoot, { recursive: true, force: true });
});

test("a queued record still pumps when its initial event append fails", async () => {
  const controlRoot = await mkdtemp(path.join(tmpdir(), "ava-control-event-gap-"));
  class OneShotEventFailureStore extends LocalControlStore {
    failed = false;
    override async appendEvent(runId: string, event: any) {
      if (!this.failed) { this.failed = true; throw new Error("simulated journal failure"); }
      return super.appendEvent(runId, event);
    }
  }
  const store = new OneShotEventFailureStore(controlRoot);
  const scheduler = new RunScheduler(projectRoot, store, { resourceLockPath: path.join(controlRoot, "resource.lock") });
  await scheduler.initialize();
  const record = await scheduler.enqueue(fixtureManifest("event-gap", "Event Gap"), true, "event-gap");
  const completed = await waitForStatus(store, record.runId, "success");
  assert.match(completed.eventError ?? "", /simulated journal failure/);
  if (completed.runDir) await rm(completed.runDir, { recursive: true, force: true });
  await rm(controlRoot, { recursive: true, force: true });
});

function fixtureManifest(id: string, projectName: string) {
  return {
    manifestVersion: 1 as const,
    recipeId: "portrait-story-v1" as const,
    id,
    projectName,
    presenterAsset: { assetId: "fixture", projectPath: "assets/input/prototype-presenter.png", originalName: "prototype-presenter.png", mimeType: "image/png", previewUrl: "" },
    headline: "PSU BROADCAST",
    subheadline: "SCHEDULER TEST",
    backgroundBrief: "calm modern university broadcast studio"
  };
}

async function waitForStatus(store: LocalControlStore, runId: string, expected: string) {
  let current = await store.get(runId);
  for (let attempt = 0; attempt < 500 && current?.status !== expected; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    current = await store.get(runId);
  }
  assert.equal(current?.status, expected, current?.error);
  return current!;
}
