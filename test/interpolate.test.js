import test from "node:test";
import assert from "node:assert/strict";
import { interpolate } from "../src/core/interpolate.js";

test("exact references preserve object and array types", () => {
  const context = { steps: { first: { outputs: { value: { title: "PSU" }, list: [1, 2] } } } };
  assert.deepEqual(interpolate("${steps.first.outputs.value}", context), { title: "PSU" });
  assert.deepEqual(interpolate("${steps.first.outputs.list}", context), [1, 2]);
});

test("embedded references become strings", () => {
  const context = { workflow: { variables: { title: "PSU" } } };
  assert.equal(interpolate("Title: ${workflow.variables.title}", context), "Title: PSU");
});

test("missing references fail clearly", () => {
  assert.throws(() => interpolate("${steps.missing.outputs.path}", { steps: {} }), /Cannot resolve reference/);
});

