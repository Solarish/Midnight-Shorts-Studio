#!/usr/bin/env node

import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const TOOL_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(TOOL_PATH), "..");
const DEFAULT_PLUGIN_PATH = path.join(REPO_ROOT, "adobe", "premiere-uxp");
const DEFAULT_HEARTBEAT = "/tmp/psu-ava-premiere-bridge/plugin-heartbeat.json";
const DEFAULT_SESSION_FILE = path.join(REPO_ROOT, ".ava-control", "adobe", "premiere", "uxp-session.json");

export function createProxyMessage(clientId, requestId, message) {
  return { command: "proxy", clientId, message, requestId };
}

export function selectPremiereClient(clients) {
  return clients.find((entry) => entry?.app?.appId === "premierepro");
}

export function loadMessage(pluginPath) {
  return {
    command: "Plugin",
    action: "load",
    params: { provider: { type: "disk", path: pluginPath } },
    breakOnStart: false
  };
}

export function reloadMessage(pluginSessionId) {
  return { command: "Plugin", action: "reload", pluginSessionId };
}

async function readJson(filePath) {
  try { return JSON.parse(await readFile(filePath, "utf8")); }
  catch { return undefined; }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

async function waitForFreshHeartbeat(filePath, previousAt, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const heartbeat = await readJson(filePath);
    if (heartbeat?.connected === true && heartbeat.at && heartbeat.at !== previousAt) return heartbeat;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`PSU AVA Bridge heartbeat did not refresh within ${timeoutMs}ms: ${filePath}`);
}

export async function reloadPremiereUxp(options = {}) {
  const port = Number(options.port ?? process.env.AVA_UXP_DEVTOOLS_PORT ?? 14001);
  const timeoutMs = Number(options.timeoutMs ?? 15_000);
  const pluginPath = path.resolve(options.pluginPath ?? DEFAULT_PLUGIN_PATH);
  const heartbeatPath = options.heartbeatPath ?? DEFAULT_HEARTBEAT;
  const sessionFile = options.sessionFile ?? DEFAULT_SESSION_FILE;
  const previousHeartbeat = await readJson(heartbeatPath);
  await stat(path.join(pluginPath, "manifest.json"));

  const savedSession = options.forceLoad ? undefined : await readJson(sessionFile);
  const ws = new WebSocket(`ws://127.0.0.1:${port}/socket/cli`);
  const clients = [];
  const callbacks = new Map();
  let nextRequestId = 0;

  const sendToPremiere = (clientId, message) => new Promise((resolve, reject) => {
    const requestId = ++nextRequestId;
    callbacks.set(requestId, { resolve, reject });
    ws.send(JSON.stringify(createProxyMessage(clientId, requestId, message)));
  });

  const connectionReady = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Adobe UXP Developer Tools did not become ready on port ${port}`)), timeoutMs);
    ws.onerror = (event) => {
      clearTimeout(timer);
      reject(new Error(`Cannot connect to Adobe UXP Developer Tools on 127.0.0.1:${port}: ${event.message || "WebSocket error"}`));
    };
    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(String(event.data)); }
      catch { return; }
      if (data.command === "didAddRuntimeClient") clients.push(data);
      if (data.command === "didCompleteConnection") {
        clearTimeout(timer);
        resolve();
        return;
      }
      if (data.command === "reply" && data.requestId) {
        const callback = callbacks.get(data.requestId);
        if (!callback) return;
        callbacks.delete(data.requestId);
        if (data.error || data.success === false) callback.reject(new Error(data.error || "Adobe UXP command failed"));
        else callback.resolve(data);
      }
    };
  });

  try {
    await connectionReady;
    const premiere = selectPremiereClient(clients);
    if (!premiere) throw new Error("Premiere Pro is not connected to Adobe UXP Developer Tools");

    let result;
    let action = "reload";
    if (savedSession?.pluginSessionId) {
      try {
        result = await sendToPremiere(premiere.id, reloadMessage(savedSession.pluginSessionId));
      } catch {
        action = "load";
        result = await sendToPremiere(premiere.id, loadMessage(pluginPath));
      }
    } else {
      action = "load";
      result = await sendToPremiere(premiere.id, loadMessage(pluginPath));
    }

    const pluginSessionId = result.pluginSessionId ?? savedSession?.pluginSessionId;
    if (!pluginSessionId) throw new Error(`Adobe UXP ${action} succeeded without a pluginSessionId`);
    await writeJsonAtomic(sessionFile, {
      schemaVersion: 1,
      pluginId: "th.ac.psu.ava.bridge",
      pluginPath,
      pluginSessionId,
      appId: premiere.app.appId,
      appVersion: premiere.app.appVersion,
      updatedAt: new Date().toISOString()
    });
    const heartbeat = await waitForFreshHeartbeat(heartbeatPath, previousHeartbeat?.at, timeoutMs);
    return { ok: true, action, pluginSessionId, heartbeat, sessionFile };
  } finally {
    for (const callback of callbacks.values()) callback.reject(new Error("Adobe UXP connection closed"));
    callbacks.clear();
    ws.close();
  }
}

async function main() {
  const forceLoad = process.argv.includes("--force-load");
  const json = process.argv.includes("--json");
  const result = await reloadPremiereUxp({ forceLoad });
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(`PSU AVA Bridge ${result.action} complete; heartbeat ${result.heartbeat.at}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === TOOL_PATH) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
