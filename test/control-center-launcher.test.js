import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("foreground Control Center launcher becomes healthy and releases its lock on SIGTERM", { timeout: 20_000 }, async () => {
  const runtimeRoot = await mkdtemp(path.join(tmpdir(), "ava-launcher-"));
  const port = await availablePort();
  const child = spawn(process.execPath, ["tools/start-control-center.js", "--no-open", "--no-build"], {
    cwd: projectRoot,
    env: { ...process.env, AVA_PROJECT_ROOT: runtimeRoot, AVA_CONTROL_PORT: String(port), AVA_LOG_LEVEL: "silent" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const exitPromise = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  let completion;
  try {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && !output.includes("Control Center ready")) {
      http.get(`http://127.0.0.1:${port}/api/v1/health`, () => {}).on("error", () => {});
      if (child.exitCode !== null) assert.fail(`launcher exited early:\n${output}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.match(output, /Control Center ready/);
    child.kill("SIGTERM");
    completion = await exitPromise;
    assert.deepEqual(completion, { code: 0, signal: null }, output);
    await assert.rejects(access(path.join(runtimeRoot, ".ava-control/control-api.lock")), (error) => error.code === "ENOENT");
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await Promise.race([exitPromise, new Promise((resolve) => setTimeout(resolve, 3_000))]);
    }
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}
