import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSubprocessAdapterRegistry } from "../src/index.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("dry-run stays inline and never launches a worker", async () => {
  let called = 0;
  const registry = createSubprocessAdapterRegistry("/does/not/matter", {
    "test.adapter": async () => { called += 1; return { dryRun: true }; }
  });
  const result = await registry["test.adapter"]!({}, { dryRun: true });
  assert.equal(called, 1);
  assert.deepEqual(result, { dryRun: true });
});

test("live adapter job crosses the one-shot worker subprocess boundary", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-worker-test-"));
  const stepDir = path.join(runDir, "fixed_design");
  const registry = createSubprocessAdapterRegistry(projectRoot, {
    "template.payload": async () => { throw new Error("inline adapter must not run"); }
  });
  const result = await registry["template.payload"]!({ text: { TITLE: "WORKER" }, footage: {} }, {
    configDir: projectRoot,
    settings: {},
    runDir,
    stepDir,
    step: { id: "fixed_design", type: "template.payload", with: {} },
    dryRun: false,
    timeoutMs: 10_000,
    log: () => {}
  });
  assert.deepEqual(result, { text: { TITLE: "WORKER" }, footage: {} });
  await rm(runDir, { recursive: true, force: true });
});

test("live worker preserves approval-required details across the subprocess protocol", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-worker-approval-"));
  const stepDir = path.join(runDir, "review");
  const registry = createSubprocessAdapterRegistry(projectRoot, {
    "review.approval": async () => { throw new Error("inline adapter must not run"); }
  });
  await assert.rejects(
    registry["review.approval"]!({ proposal: { proposalDigest: "digest-1", items: [{ segmentId: "one" }] } }, {
      configDir: projectRoot,
      settings: {},
      runDir,
      stepDir,
      step: { id: "review", type: "review.approval", with: {} },
      dryRun: false,
      timeoutMs: 10_000,
      log: () => {}
    }),
    (error: any) => error.code === "APPROVAL_REQUIRED" && error.details?.proposalDigest === "digest-1" && error.details?.stepId === "review"
  );
  await rm(runDir, { recursive: true, force: true });
});
