import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkPremiereHeartbeat, createReadinessSnapshot, evaluateReadiness, READINESS_VALID_FOR_MS, resolvePremiereInstallPaths } from "../src/readiness.ts";

test("Premiere readiness resolves a matching stable or beta Media Encoder installation", () => {
  assert.equal(resolvePremiereInstallPaths().premiere, "/Applications/Adobe Premiere Pro (Beta)/Adobe Premiere Pro (Beta).app");
  assert.deepEqual(resolvePremiereInstallPaths("Adobe Premiere Pro 2025"), {
    applicationName: "Adobe Premiere Pro 2025",
    encoderName: "Adobe Media Encoder 2025",
    premiere: "/Applications/Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app",
    encoder: "/Applications/Adobe Media Encoder 2025/Adobe Media Encoder 2025.app"
  });
  assert.equal(resolvePremiereInstallPaths("Adobe Premiere Pro (Beta)").encoder, "/Applications/Adobe Media Encoder (Beta)/Adobe Media Encoder (Beta).app");
});

test("readiness snapshots carry a bounded server-owned freshness window", () => {
  const checkedAtMs = Date.parse("2026-08-26T02:00:00.000Z");
  const snapshot = createReadinessSnapshot([{
    id: "dependency",
    name: "Dependency",
    category: "system",
    ok: true,
    blocking: true,
    remediation: "Start dependency"
  }], checkedAtMs);
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.checkedAt, "2026-08-26T02:00:00.000Z");
  assert.equal(Date.parse(snapshot.expiresAt) - Date.parse(snapshot.checkedAt), READINESS_VALID_FOR_MS);
});

test("Premiere readiness accepts only a fresh compatible connected heartbeat", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-heartbeat-"));
  const heartbeatPath = path.join(root, "heartbeat.json");
  const nowMs = Date.now();
  const evaluate = () => checkPremiereHeartbeat({ heartbeatPath, nowMs, expectedPluginVersion: "0.2.0" });

  await writeFile(heartbeatPath, JSON.stringify({ protocolVersion: 1, pluginVersion: "0.2.0", connected: true, at: new Date(nowMs).toISOString() }));
  assert.equal((await evaluate()).ok, true);
  const capabilityCheck = () => checkPremiereHeartbeat({ heartbeatPath, nowMs, expectedPluginVersion: "0.2.0", requiredCapabilities: ["timeline.build", "sequence.export"] });
  assert.match((await capabilityCheck()).detail ?? "", /missing capability timeline\.build/);
  await writeFile(heartbeatPath, JSON.stringify({ protocolVersion: 1, pluginVersion: "0.2.0", connected: true, capabilities: ["timeline.build", "sequence.export"], at: new Date(nowMs).toISOString() }));
  assert.equal((await capabilityCheck()).ok, true);

  await writeFile(heartbeatPath, JSON.stringify({ protocolVersion: 0, pluginVersion: "0.2.0", connected: true, at: new Date(nowMs).toISOString() }));
  assert.match((await evaluate()).detail ?? "", /protocol 0/);

  await writeFile(heartbeatPath, JSON.stringify({ protocolVersion: 1, pluginVersion: "0.1.0", connected: true, at: new Date(nowMs).toISOString() }));
  assert.match((await evaluate()).detail ?? "", /expected 0\.2\.0/);

  await writeFile(heartbeatPath, JSON.stringify({ protocolVersion: 1, pluginVersion: "0.2.0", connected: false, at: new Date(nowMs).toISOString() }));
  assert.match((await evaluate()).detail ?? "", /disconnected/);

  await writeFile(heartbeatPath, JSON.stringify({ protocolVersion: 1, pluginVersion: "0.2.0", connected: true, at: new Date(nowMs - 20_000).toISOString() }));
  assert.match((await evaluate()).detail ?? "", /maximum 15s/);

  await rm(root, { recursive: true, force: true });
});

test("capability readiness probes the exact JaiTTS runtime URL", async () => {
  const calls: string[] = [];
  const snapshot = await evaluateReadiness(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../.."), {
    capabilities: ["jaitts"],
    resourceLockPath: path.join(tmpdir(), `ava-readiness-${Date.now()}.lock`),
    services: { jaitts: { baseUrl: "http://jaitts.example:9000/base" } },
    fetchImpl: (async (input: any) => { calls.push(String(input)); return new Response("{}", { status: 200 }); }) as typeof fetch
  });
  assert.deepEqual(calls, ["http://jaitts.example:9000/base/api/voices"]);
  assert.equal(snapshot.checks.some((check) => check.id === "jaitts" && check.ok), true);
});

test("workflow-specific preset readiness fails with the exact missing path", async () => {
  const missing = path.join(tmpdir(), `missing-ava-${Date.now()}.epr`);
  const snapshot = await evaluateReadiness(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../.."), {
    capabilities: [],
    resourceLockPath: path.join(tmpdir(), `ava-readiness-${Date.now()}.lock`),
    requiredFiles: [{ id: "workflow-export-preset", name: "Export preset", path: missing, category: "premiere", remediation: "Choose preset" }]
  });
  const check = snapshot.checks.find((value) => value.id === "workflow-export-preset");
  assert.equal(check?.ok, false);
  assert.equal(check?.detail, missing);
});
