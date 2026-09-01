import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ReadinessDiagnostics } from "../src/readiness-diagnostics.ts";
import { createReadinessSnapshot } from "../src/readiness.ts";

test("live readiness rejections remain diagnosable without creating a run", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-readiness-diagnostics-"));
  const diagnostics = new ReadinessDiagnostics(path.join(root, "rejections.ndjson"));
  const readiness = createReadinessSnapshot([{
    id: "premiere-heartbeat",
    name: "Premiere bridge heartbeat",
    category: "premiere",
    ok: false,
    blocking: true,
    detail: "heartbeat age 8s (maximum 5s)",
    remediation: "Reload the bridge"
  }], Date.parse("2026-08-26T02:00:00.000Z"));

  await diagnostics.record({ requestId: "req-1", manifestId: "story-1", projectName: "Trial", preflightDigest: "digest", readiness, at: "2026-08-26T02:00:01.000Z" });
  await diagnostics.record({ requestId: "req-2", manifestId: "story-2", projectName: "Trial 2", preflightDigest: "digest-2", readiness, at: "2026-08-26T02:00:02.000Z" });

  const latest = await diagnostics.list(1);
  assert.equal(latest.length, 1);
  assert.equal(latest[0].requestId, "req-2");
  assert.deepEqual(latest[0].failedChecks, [{ id: "premiere-heartbeat", name: "Premiere bridge heartbeat", detail: "heartbeat age 8s (maximum 5s)" }]);

  await rm(root, { recursive: true, force: true });
});
