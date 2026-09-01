import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runWorkflow } from "../src/core/runner.js";
import { reviewApproval } from "../src/adapters/documentary.js";

test("runner checkpoints operator approval and resumes the same node without repeating predecessors", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-runner-approval-"));
  const proposal = { proposalDigest: "proposal-digest-1", items: [{ segmentId: "interview_01", candidates: [{ assetId: "b1", path: "/media/b1.mov" }], selectedAssetId: "b1" }] };
  const workflow = {
    schemaVersion: 1,
    id: "approval_test",
    variables: {},
    settings: { runRoot: root, stepTimeoutMs: 1000, retryAttempts: 1, pollIntervalMs: 10, services: {}, adobe: {} },
    steps: [
      { id: "propose", type: "propose", enabled: true, with: {} },
      { id: "review", type: "review", enabled: true, with: { proposal: "${steps.propose.outputs.proposal}" } },
      { id: "finish", type: "finish", enabled: true, with: {} }
    ]
  };
  const loaded = { workflow, configDir: root, raw: JSON.stringify(workflow) };
  let proposeCalls = 0;
  let finishCalls = 0;
  const adapters = {
    propose: async () => { proposeCalls += 1; return { proposal }; },
    review: reviewApproval,
    finish: async () => { finishCalls += 1; return { ok: true }; }
  };

  const waiting = await runWorkflow(loaded, adapters);
  assert.equal(waiting.status, "waiting_approval");
  assert.equal(waiting.steps.review.status, "waiting_approval");
  assert.equal(waiting.steps.finish, undefined);
  assert.equal(waiting.approval.proposalDigest, proposal.proposalDigest);

  await writeFile(path.join(waiting.runDir, "review", "approval-decision.json"), JSON.stringify({
    schemaVersion: 1,
    proposalDigest: proposal.proposalDigest,
    approved: true,
    selections: proposal.items
  }));
  const resumed = await runWorkflow(loaded, adapters, { resume: waiting.runDir, from: "review" });
  assert.equal(resumed.status, "success");
  assert.equal(resumed.steps.review.status, "success");
  assert.equal(resumed.steps.finish.status, "success");
  assert.equal(resumed.approval, undefined);
  assert.equal(proposeCalls, 1);
  assert.equal(finishCalls, 1);
});

test("runner executes one step at a time and interpolates prior output", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-runner-"));
  const events = [];
  let active = 0;
  const adapter = async (input) => {
    active += 1;
    assert.equal(active, 1);
    events.push(input.value);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return { value: input.value };
  };
  const workflow = {
    schemaVersion: 1,
    id: "sequential_test",
    variables: {},
    settings: {
      runRoot: root,
      stepTimeoutMs: 1000,
      retryAttempts: 1,
      pollIntervalMs: 10,
      services: {},
      adobe: {}
    },
    steps: [
      { id: "one", type: "test", enabled: true, with: { value: "A" } },
      { id: "two", type: "test", enabled: true, with: { value: "${steps.one.outputs.value}B" } }
    ]
  };
  const loaded = { workflow, configDir: root, raw: JSON.stringify(workflow) };
  const state = await runWorkflow(loaded, { test: adapter });
  assert.equal(state.status, "success");
  assert.deepEqual(events, ["A", "AB"]);
  const checkpoint = JSON.parse(await readFile(path.join(state.runDir, "state.json"), "utf8"));
  assert.equal(checkpoint.steps.two.status, "success");
});

test("runner can stop after a requested step for staged prototype verification", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-runner-to-"));
  const events = [];
  const workflow = {
    schemaVersion: 1,
    id: "staged_test",
    variables: {},
    settings: { runRoot: root, stepTimeoutMs: 1000, retryAttempts: 1, pollIntervalMs: 10, services: {}, adobe: {} },
    steps: [
      { id: "one", type: "test", enabled: true, with: {} },
      { id: "two", type: "test", enabled: true, with: {} },
      { id: "three", type: "test", enabled: true, with: {} }
    ]
  };
  const state = await runWorkflow(
    { workflow, configDir: root, raw: JSON.stringify(workflow) },
    { test: async (_, context) => { events.push(context.step.id); return {}; } },
    { to: "two" }
  );
  assert.equal(state.status, "partial");
  assert.equal(state.stoppedAtStep, "two");
  assert.deepEqual(events, ["one", "two"]);
  assert.equal(state.steps.three, undefined);
});

test("runner reports success when the requested bound is the final step", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-runner-final-bound-"));
  const workflow = {
    schemaVersion: 1,
    id: "final_bound_test",
    variables: {},
    settings: { runRoot: root, stepTimeoutMs: 1000, retryAttempts: 1, pollIntervalMs: 10, services: {}, adobe: {} },
    steps: [
      { id: "one", type: "test", enabled: true, with: {} },
      { id: "two", type: "test", enabled: true, with: {} }
    ]
  };

  const state = await runWorkflow(
    { workflow, configDir: root, raw: JSON.stringify(workflow) },
    { test: async () => ({}) },
    { to: "two" }
  );

  assert.equal(state.status, "success");
  assert.equal(state.stoppedAtStep, undefined);
});

test("runner clears stale failure evidence after a successful resume", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-runner-resume-"));
  const workflow = {
    schemaVersion: 1,
    id: "resume_test",
    variables: {},
    settings: { runRoot: root, stepTimeoutMs: 1000, retryAttempts: 1, pollIntervalMs: 10, services: {}, adobe: {} },
    steps: [{ id: "one", type: "test", enabled: true, with: {} }]
  };
  const loaded = { workflow, configDir: root, raw: JSON.stringify(workflow) };

  await assert.rejects(
    runWorkflow(loaded, { test: async () => { throw new Error("first attempt failed"); } }),
    /first attempt failed/
  );
  const [runName] = await readdir(root);
  const state = await runWorkflow(
    loaded,
    { test: async () => ({ recovered: true }) },
    { resume: path.join(root, runName), from: "one" }
  );

  assert.equal(state.status, "success");
  assert.equal(state.error, undefined);
  assert.equal(state.steps.one.lastError, undefined);
  assert.equal(state.steps.one.outputs.recovered, true);
});

test("runner emits structured events only after their checkpoint and stops safely after a completed step", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-runner-stop-"));
  const workflow = {
    schemaVersion: 1,
    id: "stop_test",
    variables: {},
    settings: { runRoot: root, stepTimeoutMs: 1000, retryAttempts: 1, pollIntervalMs: 10, services: {}, adobe: {} },
    steps: [
      { id: "one", type: "test", enabled: true, with: {} },
      { id: "two", type: "test", enabled: true, with: {} }
    ]
  };
  const events = [];
  const state = await runWorkflow(
    { workflow, configDir: root, raw: JSON.stringify(workflow) },
    { test: async () => ({ ok: true }) },
    {
      shouldStopAfterStep: async () => true,
      emit: async (event, checkpoint) => {
        const stored = JSON.parse(await readFile(path.join(checkpoint.runDir, "state.json"), "utf8"));
        assert.equal(stored.version, event.stateVersion);
        events.push(event.type);
      }
    }
  );
  assert.equal(state.status, "partial");
  assert.equal(state.stoppedAtStep, "one");
  assert.equal(state.steps.two, undefined);
  assert.deepEqual(events, ["run.started", "step.started", "step.attempted", "step.succeeded", "run.partial"]);
});

test("runner refuses to change dry-run mode while resuming", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-runner-mode-"));
  const workflow = {
    schemaVersion: 1,
    id: "mode_test",
    variables: {},
    settings: { runRoot: root, stepTimeoutMs: 1000, retryAttempts: 1, pollIntervalMs: 10, services: {}, adobe: {} },
    steps: [{ id: "one", type: "test", enabled: true, with: {} }]
  };
  const loaded = { workflow, configDir: root, raw: JSON.stringify(workflow) };
  const first = await runWorkflow(loaded, { test: async () => ({}) }, { dryRun: true, to: "one" });
  await assert.rejects(
    runWorkflow(loaded, { test: async () => ({}) }, { resume: first.runDir, dryRun: false }),
    /dry-run mode cannot change/
  );
});

test("runner refuses --from on a fresh run without predecessor checkpoints", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-runner-from-"));
  const workflow = {
    schemaVersion: 1,
    id: "from_test",
    variables: {},
    settings: { runRoot: root, stepTimeoutMs: 1000, retryAttempts: 1, pollIntervalMs: 10, services: {}, adobe: {} },
    steps: [{ id: "one", type: "test", enabled: true, with: {} }]
  };
  await assert.rejects(
    runWorkflow({ workflow, configDir: root, raw: JSON.stringify(workflow) }, { test: async () => ({}) }, { from: "one" }),
    /--from requires --resume/
  );
});

test("runner never retries a successful adapter when success event persistence fails", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-runner-event-failure-"));
  const workflow = {
    schemaVersion: 1,
    id: "event_failure_test",
    variables: {},
    settings: { runRoot: root, stepTimeoutMs: 1000, retryAttempts: 3, pollIntervalMs: 10, services: {}, adobe: {} },
    steps: [{ id: "one", type: "test", enabled: true, with: {} }]
  };
  let adapterCalls = 0;
  await assert.rejects(
    runWorkflow(
      { workflow, configDir: root, raw: JSON.stringify(workflow) },
      { test: async () => { adapterCalls += 1; return { committed: true }; } },
      { emit: async (event) => { if (event.type === "step.succeeded") throw new Error("event store unavailable"); } }
    ),
    (error) => error.code === "CHECKPOINT_AFTER_ADAPTER_SUCCESS" && /event store unavailable/.test(error.message)
  );
  assert.equal(adapterCalls, 1);
  const [runName] = await readdir(root);
  const checkpoint = JSON.parse(await readFile(path.join(root, runName, "state.json"), "utf8"));
  assert.equal(checkpoint.steps.one.status, "success");
  assert.deepEqual(checkpoint.steps.one.outputs, { committed: true });
});

test("runner checkpoints pre-adapter failures as a failed step", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-runner-setup-failure-"));
  const workflow = {
    schemaVersion: 1,
    id: "setup_failure_test",
    variables: {},
    settings: { runRoot: root, stepTimeoutMs: 1000, retryAttempts: 1, pollIntervalMs: 10, services: {}, adobe: {} },
    steps: [{ id: "one", type: "missing", enabled: true, with: {} }]
  };
  await assert.rejects(
    runWorkflow({ workflow, configDir: root, raw: JSON.stringify(workflow) }, {}),
    /No adapter registered/
  );
  const [runName] = await readdir(root);
  const checkpoint = JSON.parse(await readFile(path.join(root, runName, "state.json"), "utf8"));
  assert.equal(checkpoint.status, "failed");
  assert.equal(checkpoint.steps.one.status, "failed");
  assert.equal(checkpoint.steps.one.attempts, 0);
});

test("runner rejects resume bounds in reverse workflow order", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-runner-bounds-"));
  const workflow = {
    schemaVersion: 1,
    id: "bounds_test",
    variables: {},
    settings: { runRoot: root, stepTimeoutMs: 1000, retryAttempts: 1, pollIntervalMs: 10, services: {}, adobe: {} },
    steps: [
      { id: "one", type: "test", enabled: true, with: {} },
      { id: "two", type: "test", enabled: true, with: {} }
    ]
  };
  const loaded = { workflow, configDir: root, raw: JSON.stringify(workflow) };
  const first = await runWorkflow(loaded, { test: async () => ({}) }, { to: "one" });
  await assert.rejects(
    runWorkflow(loaded, { test: async () => ({}) }, { resume: first.runDir, from: "two", to: "one" }),
    /occurs after/
  );
});

test("runner retries a pending post-checkpoint commit without rerunning the adapter", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-runner-commit-"));
  const workflow = {
    schemaVersion: 1,
    id: "commit_test",
    variables: {},
    settings: { runRoot: root, stepTimeoutMs: 1000, retryAttempts: 1, pollIntervalMs: 10, services: {}, adobe: {} },
    steps: [{ id: "one", type: "test", enabled: true, with: {} }]
  };
  const loaded = { workflow, configDir: root, raw: JSON.stringify(workflow) };
  let adapterCalls = 0;
  let commitCalls = 0;
  const adapters = { test: async () => {
    adapterCalls += 1;
    return { value: "durable", __avaCompletion: { kind: "test.receipt", id: "one" } };
  } };
  const commitAdapterCompletion = async () => {
    commitCalls += 1;
    if (commitCalls === 1) throw new Error("receipt store busy");
  };
  await assert.rejects(
    runWorkflow(loaded, adapters, { commitAdapterCompletion }),
    (error) => error.code === "ADAPTER_COMMIT_PENDING"
  );
  const [runName] = await readdir(root);
  const runDir = path.join(root, runName);
  let checkpoint = JSON.parse(await readFile(path.join(runDir, "state.json"), "utf8"));
  assert.equal(checkpoint.status, "needs_attention");
  assert.equal(checkpoint.steps.one.status, "success");
  assert.equal(checkpoint.steps.one.completion.status, "pending");
  assert.deepEqual(checkpoint.steps.one.outputs, { value: "durable" });

  const resumed = await runWorkflow(loaded, adapters, { resume: runDir, commitAdapterCompletion });
  assert.equal(resumed.status, "success");
  assert.equal(resumed.steps.one.completion.status, "committed");
  assert.equal(adapterCalls, 1);
  assert.equal(commitCalls, 2);
});
