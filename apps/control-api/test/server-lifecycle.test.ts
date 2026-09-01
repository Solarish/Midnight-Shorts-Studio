import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("../src/server.ts", import.meta.url));

test("Control API releases its singleton lock on SIGTERM", { timeout: 15_000 }, async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "ava-control-lifecycle-"));
  const lockPath = path.join(projectRoot, ".ava-control/control-api.lock");
  const recordsDir = path.join(projectRoot, ".ava-control/records");
  await mkdir(recordsDir, { recursive: true });
  await writeFile(path.join(recordsDir, "sse-test.json"), JSON.stringify({
    runId: "sse-test",
    recipeId: "portrait-story-v1",
    projectName: "SSE lifecycle",
    status: "success",
    dryRun: true,
    workflowDigest: "test",
    configPath: path.join(projectRoot, "missing-workflow.json"),
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z"
  }));
  await writeFile(path.join(recordsDir, "live-partial.json"), JSON.stringify({
    runId: "live-partial",
    recipeId: "graph-live",
    projectName: "Live resume guard",
    status: "partial",
    dryRun: false,
    workflowDigest: "test",
    configPath: path.join(projectRoot, "missing-workflow.json"),
    runDir: path.join(projectRoot, ".pipeline-runs/live-partial"),
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z"
  }));
  const child = spawn(process.execPath, ["--import", "tsx", serverPath], {
    env: {
      ...process.env,
      AVA_PROJECT_ROOT: projectRoot,
      AVA_CONTROL_HOST: "127.0.0.1",
      AVA_CONTROL_PORT: "0",
      AVA_LOG_LEVEL: "info"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });

  try {
    await waitUntil(() => output.includes("Server listening at"), 8_000, () => output);
    const origin = output.match(/Server listening at (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
    assert.ok(origin, output);
    await access(lockPath);
    const health = await fetch(`${origin}/api/v1/health`).then((response) => response.json()) as any;
    const resume = await fetch(`${origin}/api/v1/runs/live-partial/actions/resume`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ava-csrf": health.csrfToken },
      body: "{}"
    });
    assert.equal(resume.status, 409);
    assert.equal((await resume.json() as any).code, "OPERATOR_CONFIRMATION_REQUIRED");
    const streamController = new AbortController();
    const stream = await fetch(`${origin}/api/v1/runs/sse-test/events`, { signal: streamController.signal });
    assert.equal(stream.status, 200);
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    child.kill("SIGTERM");
    const completion = await Promise.race([
      exited,
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error(`Control API did not exit after SIGTERM:\n${output}`)), 5_000))
    ]);
    streamController.abort();
    assert.deepEqual(completion, { code: 0, signal: null }, output);
    await assert.rejects(access(lockPath), (error: any) => error.code === "ENOENT");
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await rm(projectRoot, { recursive: true, force: true });
  }
});

async function waitUntil(predicate: () => boolean, timeoutMs: number, diagnostics: () => string) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for Control API startup:\n${diagnostics()}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
