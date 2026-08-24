import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const EXPECTED_STEPS = [
  "select_presenter",
  "remove_background",
  "generate_background",
  "fixed_design",
  "ae_bind",
  "ae_render",
  "premiere_assembly"
];

export async function verifyPrototype(runDirectory) {
  const runDir = path.resolve(runDirectory);
  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail });
  let state;
  try {
    state = JSON.parse(await readFile(path.join(runDir, "state.json"), "utf8"));
    add("state.readable", true, path.join(runDir, "state.json"));
  } catch (error) {
    add("state.readable", false, error.message);
    return report(runDir, checks);
  }

  add("workflow.id", state.workflowId === "ava_prototype", state.workflowId);
  add("workflow.live", state.dryRun === false, `dryRun=${state.dryRun}`);
  add("workflow.success", state.status === "success", `status=${state.status}`);

  let previousFinishedAt;
  for (const stepId of EXPECTED_STEPS) {
    const step = state.steps?.[stepId];
    add(`step.${stepId}`, step?.status === "success", step?.status ?? "missing");
    if (step?.startedAt && previousFinishedAt) {
      const sequential = Date.parse(step.startedAt) >= Date.parse(previousFinishedAt);
      add(
        `sequential.${stepId}`,
        sequential,
        `${step.startedAt} >= ${previousFinishedAt}`
      );
    }
    if (step?.finishedAt) previousFinishedAt = step.finishedAt;
  }

  await verifyPng(
    "cutout",
    state.steps?.remove_background?.outputs?.path,
    checks,
    { requireAlpha: true }
  );
  await verifyPng(
    "background",
    state.steps?.generate_background?.outputs?.images?.[0]?.localPath,
    checks
  );

  const aeProject = state.steps?.ae_bind?.outputs?.project;
  await verifyFile("after_effects.project", aeProject, checks, 1_024);
  const hostResult = state.steps?.ae_bind?.outputs?.hostResult;
  add(
    "after_effects.host_result",
    hostResult?.ok === true && hostResult?.stage === "complete",
    JSON.stringify(hostResult ?? null)
  );
  const aeLog = state.steps?.ae_bind?.outputs?.diagnosticLog
    ?? path.join(runDir, "ae_bind/ae-milestones.log");
  try {
    const milestones = await readFile(aeLog, "utf8");
    const required = ["runner-started", "template-opened", "text-bound", "footage-bound", "project-saved", "project-closed"];
    const missing = required.filter((value) => !milestones.includes(value));
    add("after_effects.milestones", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : aeLog);
  } catch (error) {
    add("after_effects.milestones", false, error.message);
  }

  const renderPath = state.steps?.ae_render?.outputs?.output;
  await verifyMov(renderPath, checks);

  const premiere = state.steps?.premiere_assembly?.outputs;
  await verifyFile("premiere.project", premiere?.project, checks, 1_024);
  add("premiere.sequence_name", premiere?.sequenceName === "AVA_PROTOTYPE", premiere?.sequenceName ?? "missing");
  add("premiere.sequence_guid", Boolean(premiere?.sequenceGuid), premiere?.sequenceGuid ?? "missing");
  add(
    "premiere.imported_render",
    Array.isArray(premiere?.importedMedia) && premiere.importedMedia.includes(renderPath),
    JSON.stringify(premiere?.importedMedia ?? null)
  );

  return report(runDir, checks);
}

async function verifyPng(id, filePath, checks, options = {}) {
  const add = (suffix, ok, detail) => checks.push({ id: `${id}.${suffix}`, ok: Boolean(ok), detail });
  if (!filePath) {
    add("file", false, "missing path in checkpoint outputs");
    return;
  }
  try {
    const file = await readFile(filePath);
    const pngSignature = "89504e470d0a1a0a";
    const isPng = file.length >= 33 && file.subarray(0, 8).toString("hex") === pngSignature;
    add("file", isPng, `${filePath} (${file.length} bytes)`);
    if (!isPng) return;
    const width = file.readUInt32BE(16);
    const height = file.readUInt32BE(20);
    const colorType = file[25];
    add("dimensions", width > 0 && height > 0, `${width}x${height}`);
    if (options.requireAlpha) {
      add("alpha", colorType === 4 || colorType === 6, `PNG color type ${colorType}`);
    }
  } catch (error) {
    add("file", false, error.message);
  }
}

async function verifyMov(filePath, checks) {
  if (!filePath) {
    checks.push({ id: "render.mov", ok: false, detail: "missing path in checkpoint outputs" });
    return;
  }
  try {
    const file = await readFile(filePath);
    const header = file.subarray(0, Math.min(file.length, 4_096)).toString("latin1");
    const recognizable = file.length > 1_024 && (header.includes("ftyp") || header.includes("moov") || header.includes("mdat"));
    checks.push({ id: "render.mov", ok: recognizable, detail: `${filePath} (${file.length} bytes)` });
  } catch (error) {
    checks.push({ id: "render.mov", ok: false, detail: error.message });
  }
}

async function verifyFile(id, filePath, checks, minimumBytes) {
  if (!filePath) {
    checks.push({ id, ok: false, detail: "missing path in checkpoint outputs" });
    return;
  }
  try {
    const value = await stat(filePath);
    checks.push({ id, ok: value.isFile() && value.size >= minimumBytes, detail: `${filePath} (${value.size} bytes)` });
  } catch (error) {
    checks.push({ id, ok: false, detail: error.message });
  }
}

function report(runDir, checks) {
  const passed = checks.filter((check) => check.ok).length;
  return {
    schemaVersion: 1,
    runDir,
    verifiedAt: new Date().toISOString(),
    ok: checks.length > 0 && passed === checks.length,
    summary: { passed, failed: checks.length - passed, total: checks.length },
    checks
  };
}
