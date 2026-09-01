import { access, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HEARTBEAT_PATH = "/tmp/psu-ava-premiere-bridge/plugin-heartbeat.json";
const HEARTBEAT_MAX_AGE_MS = 15_000;
export const READINESS_VALID_FOR_MS = 5_000;

export type ReadinessCheck = {
  id: string;
  name: string;
  category: "system" | "after-effects" | "premiere" | "ai";
  ok: boolean;
  blocking: boolean;
  detail?: string;
  remediation: string;
};

export type ReadinessSnapshot = {
  ready: boolean;
  checks: ReadinessCheck[];
  checkedAt: string;
  expiresAt: string;
};

export async function evaluateReadiness(projectRoot: string, options: {
  nowMs?: number;
  heartbeatPath?: string;
  fetchImpl?: typeof fetch;
  resourceLockPath?: string;
  capabilities?: string[];
  services?: { comfyui?: { baseUrl?: string }; jaitts?: { baseUrl?: string } };
  adobe?: { premiere?: { applicationName?: string; requiredVersion?: string } };
  requiredFiles?: Array<{ id: string; name: string; path: string; category: ReadinessCheck["category"]; remediation: string }>;
} = {}) {
  const manifestPath = path.join(projectRoot, "adobe/premiere-uxp/manifest.json");
  const expectedPluginVersion = await readPluginVersion(manifestPath);
  const required = options.capabilities ? new Set(options.capabilities) : undefined;
  const needs = (...values: string[]) => !required || values.some((value) => required.has(value));
  const pending: Array<Promise<ReadinessCheck>> = [checkResourceAvailability(options.resourceLockPath)];
  for (const file of options.requiredFiles ?? []) pending.push(exists(file.id, file.name, file.category, file.path, file.remediation));
  if (needs("after-effects")) pending.push(
    exists("ae-template", "After Effects template", "after-effects", path.join(projectRoot, "templates/after-effects/prototype-story.aep"), "สร้างหรือติดตั้ง AE template package ที่ workflow เลือก"),
    exists("aerender", "aerender", "after-effects", "/Applications/Adobe After Effects 2026/aerender", "ติดตั้ง After Effects 2026 ให้มี aerender ตาม path ที่กำหนด"),
    exists("ae-host", "After Effects host", "after-effects", "/Applications/Adobe After Effects 2026/Adobe After Effects 2026.app", "ติดตั้ง After Effects 2026"),
    checkAeScriptingPermission()
  );
  if (needs("apple-vision")) pending.push(checkCommand("apple-vision", "Apple Vision toolchain", "system", "/usr/bin/xcrun", ["swiftc", "--version"], "ติดตั้ง Xcode Command Line Tools"));
  if (needs("premiere")) {
    const premiereConfig = options.adobe?.premiere ?? { applicationName: "Adobe Premiere Pro (Beta)", requiredVersion: "26.5.0" };
    const premiereInstall = resolvePremiereInstallPaths(premiereConfig.applicationName);
    pending.push(
    premiereConfig.requiredVersion
      ? checkMacApplicationVersion("premiere-host", "Premiere host", premiereInstall.premiere, premiereConfig.requiredVersion, `ติดตั้ง ${premiereInstall.applicationName} ${premiereConfig.requiredVersion}`)
      : exists("premiere-host", "Premiere host", "premiere", premiereInstall.premiere, `ติดตั้ง ${premiereInstall.applicationName}`),
    exists("premiere-plugin", "Premiere UXP plugin", "premiere", manifestPath, "ตรวจว่า repository มี adobe/premiere-uxp/manifest.json"),
    checkJsonSetting("premiere-developer-mode", "Premiere UXP developer mode", "premiere", "/Library/Application Support/Adobe/UXP/Developer/settings.json", (value) => value?.developer === true, "เปิด Developer Mode ใน Premiere แล้ว restart โปรแกรม"),
    checkPremiereHeartbeat({
      heartbeatPath: options.heartbeatPath ?? HEARTBEAT_PATH,
      nowMs: options.nowMs ?? Date.now(),
      expectedPluginVersion,
      requiredCapabilities: [
        ...(required?.has("premiere.timeline-build") ? ["timeline.build"] : []),
        ...(required?.has("premiere.sequence-export") ? ["sequence.export", "staged.receipts"] : [])
      ]
    })
    );
    if (needs("premiere.sequence-export")) pending.push(premiereConfig.requiredVersion
      ? checkMacApplicationVersion("premiere-encoder", "Matching Adobe Media Encoder", premiereInstall.encoder, premiereConfig.requiredVersion, `ติดตั้ง ${premiereInstall.encoderName} ${premiereConfig.requiredVersion} ให้ตรงกับ ${premiereInstall.applicationName}`)
      : exists("premiere-encoder", "Matching Adobe Media Encoder", "premiere", premiereInstall.encoder, `ติดตั้ง ${premiereInstall.encoderName} ให้ตรงรุ่นกับ ${premiereInstall.applicationName}`));
  }
  const comfyuiBaseUrl = options.services?.comfyui?.baseUrl ?? "http://10.135.66.70:8188";
  if (needs("comfyui")) pending.push(checkHttp("comfyui", "ComfyUI", "ai", serviceUrl(comfyuiBaseUrl, "/system_stats"), options.fetchImpl ?? fetch, `ตรวจเครื่อง GPU และเปิด ComfyUI ที่ ${comfyuiBaseUrl}`));
  if (required?.has("ffprobe")) pending.push(checkCommand("ffprobe", "FFprobe media inspection", "system", "ffprobe", ["-version"], "ติดตั้ง FFmpeg ซึ่งรวม ffprobe แล้วเปิด Control Center ใหม่"));
  if (required?.has("ffmpeg")) pending.push(checkCommand("ffmpeg", "FFmpeg media processing", "system", "ffmpeg", ["-version"], "ติดตั้ง FFmpeg แล้วเปิด Control Center ใหม่"));
  const jaittsBaseUrl = options.services?.jaitts?.baseUrl ?? "http://10.135.66.70:7861";
  if (required?.has("jaitts")) pending.push(checkHttp("jaitts", "JaiTTS Studio API", "ai", serviceUrl(jaittsBaseUrl, "/api/voices"), options.fetchImpl ?? fetch, `ตรวจ AI node และเปิด JaiTTS Studio API ที่ ${jaittsBaseUrl}`));
  const checks = await Promise.all(pending);
  return createReadinessSnapshot(checks, options.nowMs ?? Date.now());
}

export function resolvePremiereInstallPaths(applicationName = "Adobe Premiere Pro (Beta)") {
  if (/\(Beta\)/i.test(applicationName)) return {
    applicationName: "Adobe Premiere Pro (Beta)",
    encoderName: "Adobe Media Encoder (Beta)",
    premiere: "/Applications/Adobe Premiere Pro (Beta)/Adobe Premiere Pro (Beta).app",
    encoder: "/Applications/Adobe Media Encoder (Beta)/Adobe Media Encoder (Beta).app"
  };
  const year = applicationName.match(/\b20\d{2}\b/)?.[0] ?? "2025";
  return {
    applicationName: `Adobe Premiere Pro ${year}`,
    encoderName: `Adobe Media Encoder ${year}`,
    premiere: `/Applications/Adobe Premiere Pro ${year}/Adobe Premiere Pro ${year}.app`,
    encoder: `/Applications/Adobe Media Encoder ${year}/Adobe Media Encoder ${year}.app`
  };
}

async function checkMacApplicationVersion(id: string, name: string, target: string, requiredVersion: string, remediation: string): Promise<ReadinessCheck> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", path.join(target, "Contents/Info.plist")], { timeout: 3_000 });
    const actualVersion = stdout.trim();
    return check(id, name, "premiere", actualVersion === requiredVersion, `${actualVersion} (required ${requiredVersion})`, remediation);
  } catch (error: any) {
    return check(id, name, "premiere", false, `${target}: ${error.message}`, remediation);
  }
}

function serviceUrl(baseUrl: string, pathname: string) {
  return new URL(pathname.replace(/^\//, ""), `${baseUrl.replace(/\/$/, "")}/`).toString();
}

export function createReadinessSnapshot(checks: ReadinessCheck[], checkedAtMs: number): ReadinessSnapshot {
  return {
    ready: checks.every((check) => !check.blocking || check.ok),
    checks,
    checkedAt: new Date(checkedAtMs).toISOString(),
    expiresAt: new Date(checkedAtMs + READINESS_VALID_FOR_MS).toISOString()
  };
}

async function checkResourceAvailability(_lockPath?: string): Promise<ReadinessCheck> {
  return check("parallel-runtime", "Parallel Remotion & Video Engine Runtime", "system", true, undefined, "");
}

async function exists(id: string, name: string, category: ReadinessCheck["category"], target: string, remediation: string): Promise<ReadinessCheck> {
  try { await access(target); return check(id, name, category, true, undefined, remediation); }
  catch { return check(id, name, category, false, target, remediation); }
}

async function checkHttp(id: string, name: string, category: ReadinessCheck["category"], url: string, fetchImpl: typeof fetch, remediation: string): Promise<ReadinessCheck> {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(2_000) });
    return check(id, name, category, response.ok, response.ok ? undefined : `HTTP ${response.status}`, remediation);
  } catch (error: any) {
    return check(id, name, category, false, error.message, remediation);
  }
}

async function checkCommand(id: string, name: string, category: ReadinessCheck["category"], command: string, args: string[], remediation: string): Promise<ReadinessCheck> {
  try {
    const { stdout } = await execFileAsync(command, args, { timeout: 3_000 });
    return check(id, name, category, true, stdout.trim().split("\n")[0], remediation);
  } catch (error: any) {
    return check(id, name, category, false, error.message, remediation);
  }
}

async function checkJsonSetting(id: string, name: string, category: ReadinessCheck["category"], target: string, predicate: (value: any) => boolean, remediation: string): Promise<ReadinessCheck> {
  try {
    const value = JSON.parse(await readFile(target, "utf8"));
    return check(id, name, category, predicate(value), predicate(value) ? undefined : target, remediation);
  } catch (error: any) {
    return check(id, name, category, false, error.message, remediation);
  }
}

export async function checkPremiereHeartbeat({ heartbeatPath, nowMs, expectedPluginVersion, requiredCapabilities = [] }: { heartbeatPath: string; nowMs: number; expectedPluginVersion?: string; requiredCapabilities?: string[] }): Promise<ReadinessCheck> {
  const remediation = `เปิด Premiere และ reload PSU AVA Bridge ${expectedPluginVersion ?? "รุ่นปัจจุบัน"} แล้วให้ panel อยู่สถานะ Connected`;
  try {
    const [info, heartbeat] = await Promise.all([
      stat(heartbeatPath),
      readFile(heartbeatPath, "utf8").then((value) => JSON.parse(value))
    ]);
    const reportedAt = Date.parse(heartbeat.at);
    const ageMs = Math.max(nowMs - info.mtimeMs, Number.isFinite(reportedAt) ? nowMs - reportedAt : Number.POSITIVE_INFINITY);
    const reasons = [
      heartbeat.protocolVersion === 1 ? undefined : `protocol ${heartbeat.protocolVersion ?? "missing"} (expected 1)`,
      expectedPluginVersion && heartbeat.pluginVersion !== expectedPluginVersion ? `plugin ${heartbeat.pluginVersion ?? "missing"} (expected ${expectedPluginVersion})` : undefined,
      heartbeat.connected === true ? undefined : "bridge reports disconnected",
      ...requiredCapabilities.filter((capability) => !Array.isArray(heartbeat.capabilities) || !heartbeat.capabilities.includes(capability)).map((capability) => `missing capability ${capability}`),
      ageMs <= HEARTBEAT_MAX_AGE_MS && ageMs >= -1_000 ? undefined : `heartbeat age ${Math.round(ageMs / 1000)}s (maximum 15s)`
    ].filter(Boolean);
    return check("premiere-heartbeat", "Premiere bridge heartbeat", "premiere", reasons.length === 0, reasons.join("; ") || undefined, remediation);
  } catch (error: any) {
    return check("premiere-heartbeat", "Premiere bridge heartbeat", "premiere", false, `Heartbeat unavailable: ${error.message}`, remediation);
  }
}

async function checkAeScriptingPermission(): Promise<ReadinessCheck> {
  const appPath = "/Applications/Adobe After Effects 2026/Adobe After Effects 2026.app";
  try {
    const { stdout } = await execFileAsync("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", path.join(appPath, "Contents/Info.plist")], { timeout: 3_000 });
    const version = stdout.trim().split(".").slice(0, 2).join(".");
    const preferencePath = path.join(homedir(), "Library/Preferences/Adobe/After Effects", version, `Adobe After Effects ${version} Prefs.txt`);
    const source = await readFile(preferencePath, "utf8");
    const values = [...source.matchAll(/"Pref_SCRIPTING_FILE_NETWORK_SECURITY"\s*=\s*"?([01])"?/g)].map((match) => match[1]);
    const ok = values.length > 0 && values.every((value) => value === "1");
    return check("ae-scripting", "AE script file/network access", "after-effects", ok, ok ? undefined : `Preference not enabled for AE ${version}`, `เปิด Allow Scripts to Write Files and Access Network ใน AE ${version} แล้ว restart`);
  } catch (error: any) {
    return check("ae-scripting", "AE script file/network access", "after-effects", false, error.message, "เปิด AE preferences, อนุญาต scripting file/network access แล้ว restart");
  }
}

async function readPluginVersion(manifestPath: string) {
  try { return JSON.parse(await readFile(manifestPath, "utf8")).version as string | undefined; }
  catch { return undefined; }
}

function check(id: string, name: string, category: ReadinessCheck["category"], ok: boolean, detail: string | undefined, remediation: string): ReadinessCheck {
  return { id, name, category, ok, blocking: true, detail, remediation };
}
