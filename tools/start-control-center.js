#!/usr/bin/env node
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const controlPort = Number(process.env.AVA_CONTROL_PORT ?? 47650);
const url = `http://127.0.0.1:${controlPort}`;
const noOpen = process.argv.includes("--no-open");
const noBuild = process.argv.includes("--no-build");

await access(path.join(projectRoot, "node_modules/tsx/package.json")).catch(() => {
  throw new Error("Dependencies are missing. Run 'npm install' once, then try again.");
});

const existing = await health();
if (existing) {
  if (existing.version !== "0.1.0" && existing.version !== "0.2.0") throw new Error(`Port ${controlPort} is occupied by an incompatible Control API (${existing.version ?? "unknown version"})`);
  process.stdout.write(`Control Center is already running at ${url}\n`);
  if (!noOpen) openBrowser();
} else {
  if (!noBuild) {
    process.stdout.write("Building the local Control Center…\n");
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error("npm executable was not provided; start this command with npm run control:center");
    await run(process.execPath, [npmCli, "run", "build"], { cwd: projectRoot });
  }

  process.stdout.write("Starting the Control API…\n");
  const child = spawn(process.execPath, ["--import", "tsx", "apps/control-api/src/server.ts"], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit"
  });
  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    child.kill(signal);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  try {
    await waitForHealth(child, 30_000);
    process.stdout.write(`\nControl Center ready: ${url}\nKeep this Terminal open. Press Ctrl-C once to stop safely.\n\n`);
    if (!noOpen) openBrowser();
    const { code, signal } = await completion(child);
    if (!stopping && code !== 0) throw new Error(`Control API stopped unexpectedly (${signal ?? `exit ${code}`})`);
  } finally {
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
  }
}

async function health() {
  return new Promise((resolve) => {
    const req = http.get(`${url}/api/v1/health`, { timeout: 2000 }, (res) => {
      if (res.statusCode !== 200) return resolve(undefined);
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(undefined); }
      });
    });
    req.on("error", () => resolve(undefined));
    req.on("timeout", () => { req.destroy(); resolve(undefined); });
  });
}

async function waitForHealth(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Control API stopped before it became ready");
    if (await health()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  child.kill("SIGTERM");
  throw new Error(`Control API did not become ready within ${timeoutMs}ms`);
}

function openBrowser() {
  if (process.platform !== "darwin") {
    process.stdout.write(`Open ${url} in a browser.\n`);
    return;
  }
  spawn("/usr/bin/open", [url], { stdio: "ignore", detached: true }).unref();
}

function completion(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`Build failed (${signal ?? `exit ${code}`})`)));
  });
}
