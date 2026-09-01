import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nodeLifecycleStages, validateWorkflowDocument } from "../src/index.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("node lifecycle stage contract is stable", () => {
  assert.deepEqual(nodeLifecycleStages, ["assets", "process", "timeline", "build", "export"]);
});

test("canonical workflow validator accepts a documented workflow", async () => {
  const result = await validateWorkflowDocument({
    schemaVersion: 1,
    id: "fixture",
    steps: [{ id: "one", type: "asset.select" }]
  }, projectRoot);
  assert.equal(result.valid, true);
});

test("canonical workflow validator accepts timeline.dynamic_link step", async () => {
  const result = await validateWorkflowDocument({
    schemaVersion: 1,
    id: "fixture",
    steps: [{ id: "dynamic_link_step", type: "timeline.dynamic_link" }]
  }, projectRoot);
  assert.equal(result.valid, true);
});

test("canonical workflow validator rejects an unknown step type", async () => {
  const result = await validateWorkflowDocument({
    schemaVersion: 1,
    id: "fixture",
    steps: [{ id: "one", type: "unknown.step" }]
  }, projectRoot);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path.includes("type")));
});

