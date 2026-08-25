import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runWorkflow } from "../src/core/runner.js";

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
