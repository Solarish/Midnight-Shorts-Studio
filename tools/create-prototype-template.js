import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess } from "../src/core/process.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(projectRoot, "adobe/after-effects/create-prototype-template.jsx");
const output = path.resolve(process.argv[2] ?? path.join(projectRoot, "templates/after-effects/prototype-story.aep"));
const runnerDir = path.join(projectRoot, "templates/after-effects/.build");
const runner = path.join(runnerDir, "create-prototype-template-runner.jsx");

await mkdir(path.dirname(output), { recursive: true });
await mkdir(runnerDir, { recursive: true });
await writeFile(runner, [
  `$.global.AVA_TEMPLATE_OUTPUT = ${jsxString(output)};`,
  `$.evalFile(File(${jsxString(source)}));`,
  ""
].join("\n"), "utf8");

const appleScript = `tell application id "com.adobe.AfterEffects.application" to DoScriptFile (POSIX file ${appleScriptString(runner)})`;
await runProcess("osascript", ["-e", appleScript], { timeoutMs: 180_000 });
await waitForFile(output, 180_000);
console.log(output);

function jsxString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function appleScriptString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function waitForFile(filePath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(filePath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`After Effects did not create ${filePath} within ${timeoutMs}ms`);
}
