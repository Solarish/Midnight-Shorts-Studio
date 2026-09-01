#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess } from "../src/core/process.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPath = "/Applications/Adobe After Effects 2026/Adobe After Effects 2026.app";
const hostScript = path.join(repoRoot, "adobe", "after-effects", "create-cover-text-mogrt.jsx");
const baseTemplate = path.join(repoRoot, "templates", "premiere", "psu-cover-text.mogrt");
const poolDir = path.join(repoRoot, "templates", "premiere", "pool");
const prefsPath = "/Users/louislee/Library/Preferences/Adobe/After Effects/26.0/Adobe After Effects 26.0 Prefs.txt";
const count = Number(process.argv.find((value) => /^--count=/.test(value))?.split("=")[1] ?? 8);
if (!Number.isInteger(count) || count < 2 || count > 32) throw new Error("--count must be an integer from 2 to 32");

await access(appPath);
await access(baseTemplate);
await mkdir(path.join(poolDir, ".build"), { recursive: true });
await runProcess("osascript", ["-e", 'tell application "Adobe After Effects 2026" to quit saving no'], { timeoutMs: 30_000 }).catch(() => {});
await new Promise((resolve) => setTimeout(resolve, 1000));
try {
  await runProcess("pgrep", ["-x", "After Effects"], { timeoutMs: 5000 });
  throw new Error("After Effects is still running; close it before generating the isolated Cover MOGRT pool");
} catch (error) {
  if (/still running/.test(error.message)) throw error;
}
const originalPrefs = await readFile(prefsPath);
const prefsSource = originalPrefs.toString("latin1");
const disabledSecurity = '"Pref_SCRIPTING_FILE_NETWORK_SECURITY" = "0"';
const enabledSecurity = '"Pref_SCRIPTING_FILE_NETWORK_SECURITY" = "1"';
if (!prefsSource.includes(disabledSecurity) && !prefsSource.includes(enabledSecurity)) {
  throw new Error("Cannot locate the After Effects scripting security preference");
}
await writeFile(prefsPath, Buffer.from(prefsSource.replace(disabledSecurity, enabledSecurity), "latin1"));

const receipts = [];
try {
  for (let index = 1; index <= count; index += 1) {
    const slot = String(index).padStart(2, "0");
    const templateName = `psu-cover-text-slot-${slot}`;
    const project = path.join(poolDir, ".build", `${templateName}-generator.aep`);
    const receiptPath = path.join(poolDir, ".build", `${templateName}-project-receipt.json`);
    const runner = path.join(poolDir, ".build", `${templateName}-project-runner.jsx`);
    const output = path.join(poolDir, `${templateName}.mogrt`);
    const jobId = `ava-cover-pool-${slot}-${sha256(project).slice(0, 16)}`;
    await rm(project, { force: true });
    await rm(receiptPath, { force: true });
    await rm(output, { force: true });
    await writeFile(runner, buildRunner({ jobId, project, receiptPath, templateName }), { encoding: "utf8", mode: 0o600 });
    await runProcess("open", ["-a", appPath], { timeoutMs: 30_000 });
    await waitReady(180_000);
    const appleScript = `with timeout of 180 seconds\ntell application "Adobe After Effects 2026" to DoScriptFile (POSIX file ${appleScriptString(runner)})\nend timeout`;
    await runProcess("osascript", ["-e", appleScript], { timeoutMs: 210_000 }).catch(async (error) => {
      try { await stat(project); } catch { throw error; }
    });
    const projectReceipt = JSON.parse(await readFile(receiptPath, "utf8"));
    if (!projectReceipt.ok || path.resolve(projectReceipt.output) !== output) throw new Error(`AE MOGRT export slot ${slot} failed: ${projectReceipt.error ?? "invalid receipt"}`);
    const outputStat = await stat(output);
    if (!outputStat.isFile() || outputStat.size < 1) throw new Error(`AE MOGRT slot ${slot} is missing or empty`);
    const identity = await inspectSlot(output);
    receipts.push({ slot: index, ...projectReceipt, outputSha256: sha256(await readFile(output)), ...identity });
  }
} finally {
  await runProcess("osascript", ["-e", 'tell application "Adobe After Effects 2026" to quit saving no'], { timeoutMs: 30_000 }).catch(() => {});
  await writeFile(prefsPath, originalPrefs);
}

if (new Set(receipts.map((entry) => entry.aepSha256)).size !== receipts.length) throw new Error("Generated pool contains duplicate AE project identities");
process.stdout.write(`${JSON.stringify({ ok: true, count: receipts.length, poolDir, receipts }, null, 2)}\n`);

function buildRunner({ jobId, project, receiptPath, templateName }) {
  const value = (input) => `"${String(input).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return [
    `$.global.AVA_MOGRT_JOB_ID = ${value(jobId)};`,
    `$.global.AVA_MOGRT_OUTPUT_FOLDER = ${value(poolDir)};`,
    `$.global.AVA_MOGRT_PROJECT = ${value(project)};`,
    `$.global.AVA_MOGRT_RECEIPT = ${value(receiptPath)};`,
    `$.global.AVA_MOGRT_TEMPLATE_NAME = ${value(templateName)};`,
    `$.global.AVA_MOGRT_PERSON_NAME = ${value("ชื่อ นามสกุล")};`,
    `$.global.AVA_MOGRT_POSITION_TITLE = ${value("ตำแหน่ง / หน่วยงาน")};`,
    `$.global.AVA_MOGRT_AWARD = ${value("รางวัลหรือเกียรติคุณ")};`,
    `$.global.AVA_MOGRT_DEDICATED = true;`,
    `$.global.AVA_MOGRT_RESET_AFTER_EXPORT = true;`,
    `$.global.AVA_MOGRT_QUIT_AFTER_PROJECT = true;`,
    `$.evalFile(File(${value(hostScript)}));`,
    ""
  ].join("\n");
}

async function inspectSlot(output) {
  const workDir = await mkdtemp(path.join(tmpdir(), "ava-cover-pool-inspect-"));
  try {
    await runProcess("unzip", ["-q", output, "definition.json", "project.aegraphic", "-d", workDir], { timeoutMs: 30_000 });
    const definition = JSON.parse(await readFile(path.join(workDir, "definition.json"), "utf8"));
    const innerDir = path.join(workDir, "inner");
    await mkdir(innerDir, { recursive: true });
    const innerArchive = path.join(workDir, "project.aegraphic");
    await runProcess("unzip", ["-q", innerArchive, "-d", innerDir], { timeoutMs: 30_000 });
    const { stdout: names } = await runProcess("unzip", ["-Z1", innerArchive], { timeoutMs: 30_000 });
    const aepEntry = names.split(/\r?\n/).find((entry) => /\.aep$/i.test(entry));
    if (!aepEntry || aepEntry.includes("..") || path.isAbsolute(aepEntry)) throw new Error("Exported MOGRT has no safe embedded AEP path");
    return { aepSha256: sha256(await readFile(path.join(innerDir, aepEntry))), capsuleID: definition.capsuleID };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function packageSlot({ baseTemplate: template, project, output, templateName }) {
  const workDir = await mkdtemp(path.join(tmpdir(), "ava-cover-pool-"));
  const outerDir = path.join(workDir, "outer");
  const innerDir = path.join(workDir, "inner");
  try {
    await mkdir(outerDir, { recursive: true });
    await mkdir(innerDir, { recursive: true });
    await runProcess("unzip", ["-q", template, "-d", outerDir], { timeoutMs: 30_000 });
    const innerArchive = path.join(outerDir, "project.aegraphic");
    await runProcess("unzip", ["-q", innerArchive, "-d", innerDir], { timeoutMs: 30_000 });
    const { stdout: innerNames } = await runProcess("unzip", ["-Z1", innerArchive], { timeoutMs: 30_000 });
    const aepEntry = innerNames.split(/\r?\n/).find((entry) => /\.aep$/i.test(entry));
    if (!aepEntry || aepEntry.includes("..") || path.isAbsolute(aepEntry)) throw new Error("Base MOGRT has no safe embedded AEP path");
    await copyFile(project, path.join(innerDir, aepEntry));
    const aepSha256 = sha256(await readFile(project));
    const definitionPath = path.join(outerDir, "definition.json");
    const definition = JSON.parse(await readFile(definitionPath, "utf8"));
    const digest = sha256(`${templateName}:${aepSha256}`);
    definition.capsuleID = uuidFromDigest(digest);
    definition.capsuleName = templateName;
    for (const localized of definition.capsuleNameLocalized?.strDB ?? []) localized.str = templateName;
    await writeFile(definitionPath, `${JSON.stringify(definition)}\n`, "utf8");
    const stagedInner = path.join(workDir, "project.aegraphic");
    await runProcess("zip", ["-X", "-q", "-r", stagedInner, "."], { cwd: innerDir, timeoutMs: 30_000 });
    await rm(innerArchive, { force: true });
    await rename(stagedInner, innerArchive);
    const stagedOuter = path.join(workDir, "slot.mogrt");
    await runProcess("zip", ["-X", "-q", "-r", stagedOuter, "."], { cwd: outerDir, timeoutMs: 30_000 });
    await rm(output, { force: true });
    await rename(stagedOuter, output);
    const info = await stat(output);
    return { output, bytes: info.size, outputSha256: sha256(await readFile(output)), aepSha256, capsuleID: definition.capsuleID };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function waitReceipt(receiptPath, jobId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = JSON.parse(await readFile(receiptPath, "utf8"));
      if (value.jobId === jobId) return value;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Missing AE project receipt: ${receiptPath}`);
}

async function waitReady(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await runProcess("osascript", ["-e", 'tell application "Adobe After Effects 2026" to get version'], { timeoutMs: 10_000 });
      if (result.stdout.trim()) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("After Effects did not become ready for MOGRT pool generation");
}

function appleScriptString(value) { return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function uuidFromDigest(digest) {
  const hex = digest.slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20, 32).join("")}`;
}
