import assert from "node:assert/strict";
import test from "node:test";
import { validateWorkflow } from "../src/core/config.js";
import { adapters } from "../src/adapters/index.js";

test("runtime validation uses the canonical schema and rejects unknown adapter types", () => {
  const errors = validateWorkflow({ schemaVersion: 1, id: "fixture", steps: [{ id: "one", type: "unknown.step" }] });
  assert.ok(errors.some((error) => error.includes("must be equal to one of the allowed values")));
});

test("runtime validation retains semantic duplicate-step detection", () => {
  const errors = validateWorkflow({ schemaVersion: 1, id: "fixture", steps: [{ id: "one", type: "asset.select" }, { id: "one", type: "asset.select" }] });
  assert.ok(errors.some((error) => error.includes("duplicates 'one'")));
});

test("every registered adapter type is accepted by the canonical workflow schema", () => {
  for (const type of Object.keys(adapters)) {
    const errors = validateWorkflow({ schemaVersion: 1, id: "fixture", steps: [{ id: "one", type }] });
    assert.deepEqual(errors, [], `${type}: ${errors.join("; ")}`);
  }
});
