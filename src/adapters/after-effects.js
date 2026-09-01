import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
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
    const dryRunDir = context.stepDir ?? path.dirname(outputProject);
    const job = createAfterEffectsJobPayload(input, context, {
      templateProject,
      outputProject,
      resultFile: path.join(dryRunDir, "ae-result.json"),
      logFile: path.join(dryRunDir, "ae-milestones.log")
    });
    return { project: outputProject, composition: input.composition ?? "MASTER", job, dryRun: true };
  }

  await access(templateProject);
  await access(hostScript);
  await mkdir(path.dirname(outputProject), { recursive: true });
  const resultFile = path.join(context.stepDir, "ae-result.json");
  const logFile = path.join(context.stepDir, "ae-milestones.log");
  const jobFile = path.join(context.stepDir, "ae-job.json");
  const runnerFile = path.join(context.stepDir, "ae-runner.jsx");
  const jobPayload = createAfterEffectsJobPayload(input, context, {
    templateProject,
    outputProject,
    resultFile,
    logFile
  });
  const digest = createHash("sha256").update(JSON.stringify(jobPayload)).digest("hex");
  const job = {
    protocolVersion: 1,
    id: `ava-ae-${digest.slice(0, 32)}`,
    generation: digest.slice(32),
    ...jobPayload
  };
  const startedFile = path.join(context.stepDir, "ae-started.json");
  const previousResult = await readReceipt(resultFile);
  const previousStarted = await readReceipt(startedFile);
  if (matchesAeJob(previousResult, job)) {
    if (previousResult.ok) {
      try { await access(outputProject); }
      catch { throw ambiguousAeError("AE recorded success but its output project is missing"); }
      context.log(`Recovered completed After Effects binding ${job.id} without reopening the host`);
      return {
        project: outputProject,
        composition: input.composition ?? "MASTER",
        diagnosticLog: logFile,
        hostResult: previousResult,
        recovered: true
      };
    }
    // A terminal host failure is safe to retry; remove it so the polling loop
    // cannot consume the stale failure before the next host invocation.
    await rm(resultFile, { force: true });
  } else if (previousStarted && !matchesAeJob(previousResult, previousStarted)) {
    throw ambiguousAeError(`After Effects job ${previousStarted.id ?? "unknown"} started without a matching terminal result`);
  } else {
    await rm(resultFile, { force: true });
  }
  await writeJsonAtomic(startedFile, {
    protocolVersion: 1,
    jobId: job.id,
    generation: job.generation,
    stage: "host-mutation-pending",
    startedAt: new Date().toISOString()
  });
  await writeJsonAtomic(jobFile, job);
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
  if (!matchesAeJob(result, job)) throw ambiguousAeError("After Effects returned a mismatched job id or generation");
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

export function createAfterEffectsJobPayload(input, context, paths) {
  const timing = normalizePlainObject(input.timing, "timing");
  const styling = normalizePlainObject(input.styling, "styling");
  if (input.mediaFit !== undefined && !["cover", "contain", "center"].includes(input.mediaFit)) {
    throw new Error("After Effects mediaFit must be cover, contain, or center");
  }
  if (timing?.durationSeconds !== undefined && (!Number.isFinite(timing.durationSeconds) || timing.durationSeconds <= 0)) {
    throw new Error("After Effects timing.durationSeconds must be a positive number");
  }
  if (timing?.secondsPerPhoto !== undefined && (!Number.isFinite(timing.secondsPerPhoto) || timing.secondsPerPhoto <= 0)) {
    throw new Error("After Effects timing.secondsPerPhoto must be a positive number");
  }
  if (timing?.frameRate !== undefined && (!Number.isFinite(timing.frameRate) || timing.frameRate <= 0 || timing.frameRate > 120)) {
    throw new Error("After Effects timing.frameRate must be between 0 and 120");
  }
  return {
    templateProject: paths.templateProject,
    outputProject: paths.outputProject,
    composition: input.composition ?? "MASTER",
    text: absoluteFootageMap(input.text ?? {}, context, false),
    footage: absoluteFootageMap(input.footage ?? {}, context, true),
    ...(input.mediaFit === undefined ? {} : { mediaFit: input.mediaFit }),
    ...(timing ? { timing } : {}),
    ...(styling ? { styling } : {}),
    resultFile: paths.resultFile,
    logFile: paths.logFile
  };
}

async function readReceipt(filePath) {
  try { return JSON.parse(await readFile(filePath, "utf8")); }
  catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw ambiguousAeError(`Could not read After Effects recovery receipt ${filePath}: ${error?.message ?? error}`);
  }
}

function matchesAeJob(result, job) {
  return Boolean(result && job && result.jobId === (job.jobId ?? job.id) && result.generation === job.generation);
}

function ambiguousAeError(message) {
  return Object.assign(new Error(`${message}. Inspect the AE project and receipts before retrying.`), {
    code: "ADOBE_HOST_AMBIGUOUS",
    unsafeToResume: true
  });
}

async function writeJsonAtomic(target, value) {
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, target);
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
  let finalOutput = output;
  try {
    await access(output);
  } catch (err) {
    const parsed = path.parse(output);
    const altExts = [".mp4", ".mov", ".m4v", ".avi"].filter((ext) => ext !== parsed.ext);
    let found = false;
    for (const alt of altExts) {
      const candidate = path.join(parsed.dir, `${parsed.name}${alt}`);
      try {
        await access(candidate);
        finalOutput = candidate;
        found = true;
        break;
      } catch {}
    }
    if (!found) throw err;
  }
  return { output: finalOutput, project, stdout: result.stdout };
}

function absoluteFootageMap(values, context, paths) {
  if (!values) return {};
  if (typeof values === "string") {
    if (!paths) return { TITLE: values };
    const abs = absoluteInputPath(values, context);
    const map = { PORTRAIT: abs };
    for (let i = 1; i <= 21; i++) {
      map[`Media ${i}`] = abs;
    }
    return map;
  }
  if (Array.isArray(values)) {
    const map = {};
    const count = Math.max(values.length, 21);
    for (let i = 0; i < count; i++) {
      const slotName = `Media ${i + 1}`;
      const src = values[i % values.length];
      map[slotName] = paths ? absoluteInputPath(src, context) : src;
    }
    return map;
  }
  if (typeof values !== "object") return {};
  if (!paths) return values;

  const entries = Object.entries(values);
  const mediaEntries = entries.filter(([k]) => /^Media\s*\d+$/i.test(k));
  if (mediaEntries.length > 0 && mediaEntries.length < 21) {
    const list = mediaEntries.map(([, v]) => v);
    const expanded = {};
    for (let i = 0; i < 21; i++) {
      const slotName = `Media ${i + 1}`;
      const src = list[i % list.length];
      expanded[slotName] = absoluteInputPath(src, context);
    }
    for (const [k, v] of entries) {
      if (!/^Media\s*\d+$/i.test(k)) {
        expanded[k] = typeof v === "string" ? absoluteInputPath(v, context) : v;
      }
    }
    return expanded;
  }

  return Object.fromEntries(
    entries.map(([key, value]) => [key, typeof value === "string" ? absoluteInputPath(value, context) : value])
  );
}

function absoluteInputPath(value, context) {
  if (path.isAbsolute(value)) return value;
  const runRelative = context.resolveRunPath(value);
  const configRelative = context.resolvePath(value);
  return value.startsWith("outputs/") ? runRelative : configRelative;
}

function normalizePlainObject(value, field) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`After Effects ${field} must be an object`);
  }
  return structuredClone(value);
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
