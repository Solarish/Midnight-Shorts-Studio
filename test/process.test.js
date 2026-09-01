import test from "node:test";
import assert from "node:assert/strict";
import { runProcess } from "../src/core/process.js";

test("runProcess escalates a timed-out process that ignores SIGTERM", { skip: process.platform === "win32" }, async () => {
  const startedAt = Date.now();
  await assert.rejects(
    runProcess(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], {
      timeoutMs: 100,
      killGraceMs: 100
    }),
    /timed out after 100ms/
  );
  assert.ok(Date.now() - startedAt < 2_000, "timeout must wait for confirmed exit but remain bounded");
});
