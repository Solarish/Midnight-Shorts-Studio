import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runProcess } from "../core/process.js";

const REQUIRED_PARAMETERS = ["PERSON_NAME", "POSITION_TITLE", "AWARD"];

export async function seedEditableMogrt({ templatePath, outputPath, text, parameterMap }, options = {}) {
  const resolvedTemplate = path.resolve(templatePath);
  const resolvedOutput = path.resolve(outputPath);
  if (path.extname(resolvedTemplate).toLowerCase() !== ".mogrt" || path.extname(resolvedOutput).toLowerCase() !== ".mogrt") {
    throw new Error("Editable MOGRT template and output must end in .mogrt");
  }
  if (resolvedTemplate === resolvedOutput) throw new Error("Seeded MOGRT output must not overwrite its base template");

  const bindings = normalizeBindings(text, parameterMap);
  const templateBytes = await readFile(resolvedTemplate);
  const templateSha256 = sha256(templateBytes);
  const textDigest = sha256(JSON.stringify(sortValue(bindings)));
  const workDir = await mkdtemp(path.join(tmpdir(), "ava-mogrt-seed-"));
  const stagedOutput = path.join(workDir, "seeded.mogrt");
  const extractedDir = path.join(workDir, "archive");

  try {
    const { stdout: namesSource } = await runProcess("unzip", ["-Z1", resolvedTemplate], { timeoutMs: options.timeoutMs ?? 30_000 });
    const archiveEntries = namesSource.split(/\r?\n/).filter(Boolean);
    validateArchiveEntries(archiveEntries);
    if (!archiveEntries.includes("definition.json")) throw new Error("MOGRT archive is missing definition.json");
    if (!archiveEntries.includes("project.aegraphic")) throw new Error("MOGRT archive is missing project.aegraphic");

    await mkdir(extractedDir, { recursive: true });
    await runProcess("unzip", ["-q", resolvedTemplate, "-d", extractedDir], { timeoutMs: options.timeoutMs ?? 30_000 });
    const definitionPath = path.join(extractedDir, "definition.json");
    const definition = JSON.parse(await readFile(definitionPath, "utf8"));
    const instanceDigest = sha256(JSON.stringify({ templateSha256, outputPath: resolvedOutput, bindings: sortValue(bindings) }));
    const seededParameters = seedDefinition(definition, bindings, { instanceDigest });
    await writeFile(definitionPath, `${JSON.stringify(definition)}\n`, "utf8");
    const aegraphicPath = path.join(extractedDir, "project.aegraphic");
    const aegraphicIdentity = await seedAegraphicIdentity(aegraphicPath, instanceDigest, workDir, options);

    await runProcess("zip", ["-X", "-q", "-r", stagedOutput, "."], { cwd: extractedDir, timeoutMs: options.timeoutMs ?? 30_000 });
    const { stdout: verificationSource } = await runProcess("unzip", ["-p", stagedOutput, "definition.json"], { timeoutMs: options.timeoutMs ?? 30_000 });
    const verification = JSON.parse(verificationSource);
    verifyDefinitionValues(verification, bindings);

    await mkdir(path.dirname(resolvedOutput), { recursive: true });
    await rm(resolvedOutput, { force: true });
    await rename(stagedOutput, resolvedOutput);
    const outputBytes = await readFile(resolvedOutput);
    const outputStat = await stat(resolvedOutput);
    if (!outputStat.isFile() || outputBytes.length === 0) throw new Error("Seeded MOGRT output is empty");
    return {
      schemaVersion: 1,
      mode: "preseeded",
      templatePath: resolvedTemplate,
      templateSha256,
      outputPath: resolvedOutput,
      outputSha256: sha256(outputBytes),
      bytes: outputBytes.length,
      text: bindings,
      textDigest,
      aegraphicSha256: aegraphicIdentity.archiveSha256,
      aepSha256: aegraphicIdentity.aepSha256,
      capsuleID: definition.capsuleID,
      capsuleName: definition.capsuleName,
      parameterNames: seededParameters
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function seedAegraphicIdentity(aegraphicPath, instanceDigest, workDir, options) {
  const innerDir = path.join(workDir, "aegraphic");
  const stagedAegraphic = path.join(workDir, "project-seeded.aegraphic");
  const { stdout: namesSource } = await runProcess("unzip", ["-Z1", aegraphicPath], { timeoutMs: options.timeoutMs ?? 30_000 });
  const entries = namesSource.split(/\r?\n/).filter(Boolean);
  validateArchiveEntries(entries);
  const reportEntry = entries.find((entry) => /Report\.txt$/i.test(entry));
  const aepEntry = entries.find((entry) => /\.aep$/i.test(entry));
  if (!reportEntry || !aepEntry) {
    throw new Error("MOGRT project.aegraphic is missing its report or After Effects project");
  }
  await mkdir(innerDir, { recursive: true });
  await runProcess("unzip", ["-q", aegraphicPath, "-d", innerDir], { timeoutMs: options.timeoutMs ?? 30_000 });
  const reportPath = path.join(innerDir, reportEntry);
  const report = await readFile(reportPath, "utf8");
  await writeFile(reportPath, `${report}\rAVA seeded instance: ${instanceDigest}\r`, "utf8");
  const aepPath = path.join(innerDir, aepEntry);
  const aepBytes = await readFile(aepPath);
  const identityMarker = Buffer.from(`\nAVA_MOGRT_INSTANCE:${instanceDigest}\n`, "ascii");
  await writeFile(aepPath, Buffer.concat([aepBytes, identityMarker]));
  const aepSha256 = sha256(await readFile(aepPath));
  await runProcess("zip", ["-X", "-q", "-r", stagedAegraphic, "."], { cwd: innerDir, timeoutMs: options.timeoutMs ?? 30_000 });
  await rm(aegraphicPath, { force: true });
  await rename(stagedAegraphic, aegraphicPath);
  return { archiveSha256: sha256(await readFile(aegraphicPath)), aepSha256 };
}

export function seedDefinition(definition, bindings, { instanceDigest } = {}) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) throw new Error("MOGRT definition must be an object");
  const controls = Array.isArray(definition.clientControls) ? definition.clientControls : [];
  const capParams = definition.sourceInfoLocalized?.en_US?.capsuleparams?.capParams;
  if (!Array.isArray(capParams)) throw new Error("MOGRT definition is missing capsule text parameters");

  if (instanceDigest) {
    const suffix = instanceDigest.slice(0, 12);
    definition.capsuleID = uuidFromDigest(instanceDigest);
    definition.capsuleName = `psu-cover-${suffix}`;
    for (const localized of definition.capsuleNameLocalized?.strDB ?? []) localized.str = definition.capsuleName;
  }

  const seeded = [];
  for (const [parameterName, value] of Object.entries(bindings)) {
    const control = controls.find((entry) => entry?.uiName?.strDB?.some((name) => name?.str === parameterName));
    const capParam = capParams.find((entry) => entry?.capPropUIName === parameterName);
    if (!control || !capParam) throw new Error(`MOGRT definition is missing editable text parameter '${parameterName}'`);
    if (control.type !== 6) throw new Error(`MOGRT parameter '${parameterName}' is not a text control`);
    for (const localized of control.value?.strDB ?? []) localized.str = value;
    capParam.capPropDefault = value;
    capParam.textEditValue = value;
    capParam.fontTextRunLength = [value.length];
    seeded.push(parameterName);
  }
  return seeded.sort();
}

function normalizeBindings(text, parameterMap = {}) {
  if (!text || typeof text !== "object" || Array.isArray(text)) throw new Error("Seeded MOGRT text must be an object");
  const output = {};
  for (const [field, rawValue] of Object.entries(text)) {
    const parameterName = parameterMap[field] ?? field;
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!REQUIRED_PARAMETERS.includes(parameterName)) throw new Error(`Unsupported Cover Card MOGRT parameter '${parameterName}'`);
    if (!value) throw new Error(`Cover Card MOGRT parameter '${parameterName}' must be non-empty`);
    output[parameterName] = value;
  }
  for (const required of REQUIRED_PARAMETERS) if (!output[required]) throw new Error(`Cover Card MOGRT requires '${required}'`);
  return output;
}

function verifyDefinitionValues(definition, bindings) {
  const controls = Array.isArray(definition.clientControls) ? definition.clientControls : [];
  const capParams = definition.sourceInfoLocalized?.en_US?.capsuleparams?.capParams ?? [];
  for (const [parameterName, expected] of Object.entries(bindings)) {
    const control = controls.find((entry) => entry?.uiName?.strDB?.some((name) => name?.str === parameterName));
    const capParam = capParams.find((entry) => entry?.capPropUIName === parameterName);
    const controlValues = (control?.value?.strDB ?? []).map((entry) => entry?.str);
    if (!controlValues.length || controlValues.some((value) => value !== expected) || capParam?.capPropDefault !== expected || capParam?.textEditValue !== expected) {
      throw new Error(`Seeded MOGRT verification failed for '${parameterName}'`);
    }
  }
}

function validateArchiveEntries(entries) {
  for (const entry of entries) {
    if (entry.startsWith("/") || entry.startsWith("\\") || entry.split(/[\\/]/).includes("..")) {
      throw new Error(`Unsafe path in MOGRT archive: ${entry}`);
    }
  }
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)]));
  return value;
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

function uuidFromDigest(digest) {
  const hex = digest.slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20, 32).join("")}`;
}
