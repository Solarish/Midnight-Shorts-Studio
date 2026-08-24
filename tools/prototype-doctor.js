#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const configPath = path.resolve(process.argv[2] ?? path.join(projectRoot, "examples/prototype.workflow.json"));
const configDir = path.dirname(configPath);
const checks = [];

function record(kind, label, detail) {
  checks.push({ kind, label, detail });
}

async function exists(value) {
  try {
    await access(value);
    return true;
  } catch (_) {
    return false;
  }
}

function resolveConfigPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(configDir, value);
}

async function appVersion(appPath) {
  try {
    const plist = path.join(appPath, "Contents/Info.plist");
    const { stdout } = await execFileAsync("/usr/bin/plutil", [
      "-extract", "CFBundleShortVersionString", "raw", "-o", "-", plist
    ]);
    return stdout.trim();
  } catch (_) {
    return "unknown";
  }
}

function parseAeScriptingPreferences(source) {
  const values = [];
  let section = "unknown";
  for (const line of source.replace(/\r/g, "\n").split("\n")) {
    const sectionMatch = line.match(/^\["([^"]+)"\]/);
    if (sectionMatch) section = sectionMatch[1];
    const valueMatch = line.match(/"Pref_SCRIPTING_FILE_NETWORK_SECURITY"\s*=\s*"?([01])"?/);
    if (valueMatch) values.push({ section, enabled: valueMatch[1] === "1" });
  }
  return values;
}

async function main() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  record(nodeMajor >= 20 ? "pass" : "fail", "Node.js >= 20", process.versions.node);

  let workflow;
  try {
    workflow = JSON.parse(await readFile(configPath, "utf8"));
    record("pass", "Prototype JSON", configPath);
  } catch (error) {
    record("fail", "Prototype JSON", error.message);
    printAndExit();
    return;
  }

  const selectStep = workflow.steps.find((step) => step.type === "asset.select");
  const aeStep = workflow.steps.find((step) => step.type === "ae.template");
  const premiereStep = workflow.steps.find((step) => step.type === "premiere.assemble");
  const inputAsset = selectStep?.with?.path && resolveConfigPath(selectStep.with.path);
  const aeTemplate = aeStep?.with?.templateProject && resolveConfigPath(aeStep.with.templateProject);
  record(inputAsset && await exists(inputAsset) ? "pass" : "fail", "Prototype input asset", inputAsset || "missing config value");
  record(aeTemplate && await exists(aeTemplate) ? "pass" : "fail", "After Effects template", aeTemplate || "missing config value");

  const aerenderPath = workflow.settings?.adobe?.afterEffects?.aerenderPath;
  record(aerenderPath && await exists(aerenderPath) ? "pass" : "fail", "aerender executable", aerenderPath || "missing config value");
  if (process.platform === "darwin" && aerenderPath) {
    const aeInstallDir = path.dirname(aerenderPath);
    const aeAppName = `${path.basename(aeInstallDir)}.app`;
    const aeApp = path.join(aeInstallDir, aeAppName);
    const aeVersion = await appVersion(aeApp);
    record(await exists(aeApp) ? "pass" : "fail", "After Effects host", `${aeApp} (${aeVersion})`);
    const aePreferenceVersion = aeVersion.split(".").slice(0, 2).join(".");
    const aePreferences = path.join(
      os.homedir(),
      "Library/Preferences/Adobe/After Effects",
      aePreferenceVersion,
      `Adobe After Effects ${aePreferenceVersion} Prefs.txt`
    );
    let scriptingValues = [];
    try {
      scriptingValues = parseAeScriptingPreferences(await readFile(aePreferences, "utf8"));
    } catch (_) {}
    const scriptingReady = scriptingValues.length > 0 && scriptingValues.every((value) => value.enabled);
    const scriptingDetail = scriptingValues.length > 0
      ? scriptingValues.map((value) => `${value.section}=${value.enabled ? 1 : 0}`).join(", ")
      : `Preference not readable: ${aePreferences}`;
    record(
      scriptingReady ? "pass" : "setup",
      "AE script file/network access",
      scriptingReady ? scriptingDetail : `${scriptingDetail}; enable the checkbox in AE and restart`
    );
  }

  const premiere = workflow.settings?.adobe?.premiere ?? {};
  const premiereApp = premiere.applicationName
    ? `/Applications/${premiere.applicationName}/${premiere.applicationName}.app`
    : undefined;
  const premiereExists = premiereApp && await exists(premiereApp);
  record(
    premiereExists ? "pass" : "fail",
    "Premiere host",
    premiereExists ? `${premiereApp} (${await appVersion(premiereApp)})` : premiereApp || "missing config value"
  );
  record(
    premiere.bridgeHost === "127.0.0.1" && Number(premiere.bridgePort) === 47652 ? "pass" : "fail",
    "Premiere loopback bridge",
    `${premiere.bridgeHost}:${premiere.bridgePort}`
  );
  record(
    premiereStep?.with?.outputProject ? "pass" : "fail",
    "Premiere safe output project",
    premiereStep?.with?.outputProject || "with.outputProject is required"
  );

  const pluginManifest = path.join(projectRoot, "adobe/premiere-uxp/manifest.json");
  record(await exists(pluginManifest) ? "pass" : "fail", "Premiere UXP plugin", pluginManifest);

  const udtCandidates = [
    "/Applications/UXP Developer Tools.app",
    "/Applications/UXP Developer Tool.app",
    "/Applications/Adobe UXP Developer Tool.app",
    "/Applications/UXP Developer Tools/UXP Developer Tools.app",
    "/Applications/UXP Developer Tool/UXP Developer Tool.app",
    "/Applications/Adobe UXP Developer Tool/Adobe UXP Developer Tool.app"
  ];
  let udtPath;
  for (const candidate of udtCandidates) {
    if (await exists(candidate)) {
      udtPath = candidate;
      break;
    }
  }
  record(
    udtPath ? "pass" : "setup",
    "UXP Developer Tool 2.2+",
    udtPath || "Install from Adobe Creative Cloud before loading the panel"
  );

  const developerSettings = "/Library/Application Support/Adobe/UXP/Developer/settings.json";
  let developerMode = false;
  try {
    const value = JSON.parse(await readFile(developerSettings, "utf8"));
    developerMode = value.developer === true;
  } catch (_) {}
  record(
    developerMode ? "pass" : "setup",
    "UXP developer mode",
    developerMode ? developerSettings : "Enable Developer Mode in Premiere Plugins settings and restart Premiere"
  );

  record("skip", "Live Adobe/ComfyUI checks", "Skipped intentionally; no host applications or remote services were contacted");
  printAndExit();
}

function printAndExit() {
  for (const check of checks) {
    const marker = { pass: "PASS", fail: "FAIL", setup: "SETUP", skip: "SKIP" }[check.kind];
    process.stdout.write(`${marker.padEnd(5)} ${check.label}: ${check.detail}\n`);
  }
  const failed = checks.filter((check) => check.kind === "fail").length;
  const setup = checks.filter((check) => check.kind === "setup").length;
  process.stdout.write(`\nSummary: ${failed} failure(s), ${setup} interactive setup item(s)\n`);
  process.exitCode = failed > 0 ? 1 : setup > 0 ? 2 : 0;
}

await main();
