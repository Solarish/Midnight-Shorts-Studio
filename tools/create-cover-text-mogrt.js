#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess } from "../src/core/process.js";

const TOOL_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(TOOL_PATH), "..");
const DEFAULT_APP = "/Applications/Adobe After Effects 2026/Adobe After Effects 2026.app";
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "templates", "premiere", "psu-cover-text.mogrt");
const HOST_SCRIPT = path.join(REPO_ROOT, "adobe", "after-effects", "create-cover-text-mogrt.jsx");

export function parseArgs(argv) {
  const value = (name, fallback) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : fallback; };
  return {
    execute: argv.includes("--execute"),
    overwrite: argv.includes("--overwrite"),
    json: argv.includes("--json"),
    appPath: path.resolve(value("--app", DEFAULT_APP)),
    output: path.resolve(value("--output", DEFAULT_OUTPUT)),
    personName: value("--person-name", "ชื่อ นามสกุล"),
    positionTitle: value("--position-title", "ตำแหน่ง / หน่วยงาน"),
    award: value("--award", "รางวัลหรือเกียรติคุณ")
  };
}

export function createPlan(options) {
  if (!options.appPath.endsWith("Adobe After Effects 2026.app") || /beta/i.test(options.appPath)) {
    throw new Error("Cover MOGRT generator requires an explicit Adobe After Effects 2026 stable app path (Beta is refused)");
  }
  if (path.extname(options.output).toLowerCase() !== ".mogrt") throw new Error("--output must end in .mogrt");
  const outputFolder = path.dirname(options.output);
  const templateName = path.basename(options.output, ".mogrt");
  if (!/^[A-Za-z0-9._-]+$/.test(templateName)) throw new Error("MOGRT filename must use only ASCII letters, numbers, dot, underscore, or dash");
  return {
    mode: options.execute ? "execute" : "dry-print",
    appPath: options.appPath,
    appName: path.basename(options.appPath, ".app"),
    launch: { command: "open", args: ["-a", options.appPath] },
    hostScript: HOST_SCRIPT,
    output: options.output,
    outputFolder,
    templateName,
    text: { personName: String(options.personName), positionTitle: String(options.positionTitle), award: String(options.award) },
    project: path.join(outputFolder, ".build", `${templateName}-generator.aep`),
    receipt: path.join(outputFolder, ".build", `${templateName}-receipt.json`),
    runner: path.join(outputFolder, ".build", `${templateName}-runner.jsx`),
    overwrite: options.overwrite
  };
}

export function buildRunner(plan, jobId) {
  return [
    `$.global.AVA_MOGRT_JOB_ID = ${jsxString(jobId)};`,
    `$.global.AVA_MOGRT_OUTPUT_FOLDER = ${jsxString(plan.outputFolder)};`,
    `$.global.AVA_MOGRT_PROJECT = ${jsxString(plan.project)};`,
    `$.global.AVA_MOGRT_RECEIPT = ${jsxString(plan.receipt)};`,
    `$.global.AVA_MOGRT_TEMPLATE_NAME = ${jsxString(plan.templateName)};`,
    `$.global.AVA_MOGRT_PERSON_NAME = ${jsxString(plan.text.personName)};`,
    `$.global.AVA_MOGRT_POSITION_TITLE = ${jsxString(plan.text.positionTitle)};`,
    `$.global.AVA_MOGRT_AWARD = ${jsxString(plan.text.award)};`,
    `$.global.AVA_MOGRT_RESET_AFTER_EXPORT = true;`,
    `$.evalFile(File(${jsxString(plan.hostScript)}));`,
    ""
  ].join("\n");
}

export async function executePlan(plan) {
  if (process.platform !== "darwin") throw new Error("Cover MOGRT generation requires macOS");
  await access(plan.appPath);
  await access(plan.hostScript);
  if (!plan.overwrite) {
    try { await access(plan.output); throw new Error(`Output already exists; pass --overwrite explicitly: ${plan.output}`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    try { await access(plan.project); throw new Error(`Generator project already exists; pass --overwrite explicitly: ${plan.project}`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  await mkdir(path.dirname(plan.runner), { recursive: true });
  if (plan.overwrite) {
    // Explicitly scoped generated artifacts only. Removing them first prevents
    // a stale file from being mistaken for a successful new AE export.
    await rm(plan.output, { force: true });
    await rm(plan.project, { force: true });
  }
  const hostDigest = createHash("sha256").update(await readFile(plan.hostScript)).digest("hex");
  const jobDigest = createHash("sha256").update(JSON.stringify({ hostDigest, output: plan.output, text: plan.text })).digest("hex");
  const jobId = `ava-cover-mogrt-${jobDigest.slice(0, 24)}`;
  await rm(plan.receipt, { force: true });
  await writeFile(plan.runner, buildRunner(plan, jobId), { encoding: "utf8", mode: 0o600 });

  // Reuse a running stable instance instead of spawning ambiguous duplicate
  // instances. The host-side pristine-project guard safely refuses attachment
  // when the operator already has work open.
  await runProcess(plan.launch.command, plan.launch.args, { timeoutMs: 30_000 });
  await waitForAfterEffectsReady(plan.appName, 180_000);
  // AE can answer a version AppleEvent slightly before its project subsystem
  // accepts DoScriptFile. A short settle avoids attaching the script to the
  // splash-screen startup transaction.
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  const appleScript = `with timeout of 600 seconds\ntell application ${appleScriptString(plan.appName)} to DoScriptFile (POSIX file ${appleScriptString(plan.runner)})\nend timeout`;
  await runProcess("osascript", ["-e", appleScript], { timeoutMs: 630_000 });
  const receipt = await waitForReceipt(plan.receipt, jobId, 180_000);
  if (!receipt.ok) throw new Error(`After Effects MOGRT generator refused at ${receipt.stage}: ${receipt.error}`);
  if (path.resolve(receipt.output) !== path.resolve(plan.output)) throw new Error(`MOGRT receipt output mismatch: ${receipt.output}`);
  const outputStat = await stat(plan.output);
  if (!outputStat.isFile() || outputStat.size < 1 || receipt.bytes !== outputStat.size) throw new Error("MOGRT output/receipt size verification failed");
  const { stdout: definitionSource } = await runProcess("unzip", ["-p", plan.output, "definition.json"], { timeoutMs: 30_000 });
  const definition = JSON.parse(definitionSource);
  const parameterNames = definition.clientControls?.map((control) => control.uiName?.strDB?.[0]?.str).sort() ?? [];
  const expectedParameters = ["AWARD", "PERSON_NAME", "POSITION_TITLE"];
  if (JSON.stringify(parameterNames) !== JSON.stringify(expectedParameters)) {
    throw new Error(`MOGRT Essential Graphics contract mismatch: ${parameterNames.join(", ")}`);
  }
  return { ...receipt, verified: true, definitionVerified: true };
}

async function waitForAfterEffectsReady(appName, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await runProcess("osascript", ["-e", `tell application ${appleScriptString(appName)} to get version`], { timeoutMs: 10_000 });
      if (String(result.stdout || "").trim()) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`After Effects did not become AppleScript-ready within ${timeoutMs}ms`);
}

async function waitForReceipt(receiptPath, jobId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
      if (receipt.protocolVersion === 1 && receipt.jobId === jobId && typeof receipt.ok === "boolean") return receipt;
    } catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`After Effects did not write a matching MOGRT receipt within ${timeoutMs}ms: ${receiptPath}`);
}

function jsxString(value) { return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }
function appleScriptString(value) { return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = createPlan(options);
  if (!options.execute) {
    console.log(JSON.stringify({ ...plan, note: "Dry print only. Nothing launched. Re-run with --execute after closing operator Adobe sessions." }, null, 2));
    return;
  }
  const result = await executePlan(plan);
  console.log(options.json ? JSON.stringify(result, null, 2) : result.output);
}

if (process.argv[1] && path.resolve(process.argv[1]) === TOOL_PATH) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
