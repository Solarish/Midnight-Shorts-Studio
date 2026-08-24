import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess } from "../core/process.js";

const HOST_SCRIPT = fileURLToPath(new URL("../../adobe/after-effects/assemble.jsx", import.meta.url));

export async function bindAfterEffectsTemplate(input, context) {
  requireFields(input, ["templateProject", "outputProject"]);
  const templateProject = context.resolvePath(input.templateProject);
  const outputProject = context.resolveRunPath(input.outputProject);
  const hostScript = HOST_SCRIPT;

  if (context.dryRun) {
    return { project: outputProject, composition: input.composition ?? "MASTER", dryRun: true };
  }

  await access(templateProject);
  await access(hostScript);
  await mkdir(path.dirname(outputProject), { recursive: true });
  const resultFile = path.join(context.stepDir, "ae-result.json");
  const logFile = path.join(context.stepDir, "ae-milestones.log");
  const jobFile = path.join(context.stepDir, "ae-job.json");
  const runnerFile = path.join(context.stepDir, "ae-runner.jsx");
  const job = {
    templateProject,
    outputProject,
    composition: input.composition ?? "MASTER",
    text: absoluteFootageMap(input.text ?? {}, context, false),
    footage: absoluteFootageMap(input.footage ?? {}, context, true),
    resultFile,
    logFile
  };
  await writeFile(jobFile, `${JSON.stringify(job, null, 2)}\n`, "utf8");
  const hostSource = await readFile(hostScript, "utf8");
  await writeFile(runnerFile, buildAfterEffectsRunner(job, hostSource), "utf8");

  const deadline = Date.now() + context.timeoutMs;
  let invocationError;
  if (process.platform === "darwin") {
    const appId = context.settings.adobe.afterEffects.applicationId;
    const script = `tell application id ${appleScriptString(appId)} to DoScriptFile (POSIX file ${appleScriptString(runnerFile)})`;
    try {
      await runProcess("osascript", ["-e", script], { timeoutMs: context.timeoutMs });
    } catch (error) {
      invocationError = error;
    }
  } else {
    const executable = context.settings.adobe.afterEffects.executablePath ?? "afterfx.exe";
    try {
      await runProcess(executable, ["-r", runnerFile], { timeoutMs: context.timeoutMs });
    } catch (error) {
      invocationError = error;
    }
  }

  const result = await waitForJsonFile(
    resultFile,
    Math.max(1_000, deadline - Date.now()),
    logFile,
    invocationError
  );
  if (!result.ok) {
    throw new Error([
      result.error ?? "After Effects template binding failed",
      result.stage ? `(stage: ${result.stage})` : undefined
    ].filter(Boolean).join(" "));
  }
  return {
    project: outputProject,
    composition: input.composition ?? "MASTER",
    diagnosticLog: logFile,
    hostResult: result
  };
}

export function buildAfterEffectsRunner(job, hostSource) {
  const payload = JSON.stringify(job)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return [
    `$.global.AVA_JOB = ${payload};`,
    `$.global.AVA_RESULT_FILE = ${jsxString(job.resultFile)};`,
    `$.global.AVA_LOG_FILE = ${jsxString(job.logFile)};`,
    hostSource.trim(),
    ""
  ].join("\n");
}

async function waitForJsonFile(filePath, timeoutMs, logFile, invocationError) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  let milestones = "";
  try {
    milestones = (await readFile(logFile, "utf8")).trim();
  } catch (_) {
    // The log may not exist when AE file access is disabled.
  }
  throw new Error([
    `After Effects did not write a result file within ${timeoutMs}ms.`,
    invocationError ? `Host invocation: ${invocationError.message}` : undefined,
    lastError ? `Result read: ${lastError.message}` : undefined,
    milestones ? `AE milestones:\n${milestones}` : `AE milestone log was not written: ${logFile}`
  ].filter(Boolean).join("\n"));
}

export async function renderAfterEffects(input, context) {
  requireFields(input, ["project", "output"]);
  const project = absoluteInputPath(input.project, context);
  const output = context.resolveRunPath(input.output);
  const executable = context.settings.adobe.afterEffects.aerenderPath;
  const args = ["-project", project];
  if (input.composition) args.push("-comp", input.composition);
  if (input.renderSettingsTemplate) args.push("-RStemplate", input.renderSettingsTemplate);
  if (input.outputModuleTemplate) args.push("-OMtemplate", input.outputModuleTemplate);
  args.push("-output", output);

  if (context.dryRun) return { output, project, command: executable, args, dryRun: true };
  await access(project);
  await mkdir(path.dirname(output), { recursive: true });
  const result = await runProcess(executable, args, {
    timeoutMs: context.timeoutMs,
    onStdout: (chunk) => context.log(chunk.trimEnd()),
    onStderr: (chunk) => context.log(chunk.trimEnd())
  });
  await access(output);
  return { output, project, stdout: result.stdout };
}

function absoluteFootageMap(values, context, paths) {
  if (!paths) return values;
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, absoluteInputPath(value, context)]));
}

function absoluteInputPath(value, context) {
  if (path.isAbsolute(value)) return value;
  const runRelative = context.resolveRunPath(value);
  const configRelative = context.resolvePath(value);
  return value.startsWith("outputs/") ? runRelative : configRelative;
}

function requireFields(input, fields) {
  for (const field of fields) if (!input[field]) throw new Error(`After Effects node requires with.${field}`);
}

function jsxString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function appleScriptString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
