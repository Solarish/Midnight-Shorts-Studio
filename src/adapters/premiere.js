import http from "node:http";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess } from "../core/process.js";
import { validateTimelineSpec } from "./timeline.js";

const DEFAULT_MAILBOX_DIR = path.join(tmpdir(), "psu-ava-premiere-bridge");
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function assemblePremiere(input, context) {
  if (!input.outputProject) throw new Error("Premiere node requires with.outputProject for safe automation");
  const config = context.settings.adobe.premiere;
  const host = config.bridgeHost ?? "127.0.0.1";
  const port = Number(config.bridgePort ?? 47652);
  const mailboxDir = config.bridgeMailbox ?? DEFAULT_MAILBOX_DIR;
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error("Premiere bridge must bind to loopback only");
  }

  const job = await createPremiereJob(input, context);

  return executePremiereBridge(job, context, { host, port, mailboxDir, launch: config.launch, applicationName: config.applicationName });
}

export async function buildPremiere(input, context) {
  if (!input?.outputProject) throw new Error("premiere.build requires with.outputProject");
  if (!input.timelineSpec) throw new Error("premiere.build requires with.timelineSpec");
  const config = context.settings.adobe.premiere;
  const connection = premiereConnection(config);
  const timelineSpec = await validateTimelineSpec(input.timelineSpec);
  const sequencePresetPath = resolveSequencePreset(input.sequencePresetPath, timelineSpec, config, context);
  const job = await createFencedPremiereJob({
    type: "premiere.build",
    outputProject: optionalPath(input.outputProject, context, "run"),
    templateProject: optionalPath(input.templateProject, context, "config"),
    sequenceName: input.sequenceName ?? timelineSpec.name,
    sequencePresetPath,
    timelineSpec,
    exports: normalizeExports(input.exports ?? [], context, config, { allowEmpty: true }),
    exportTimeoutMs: input.exportTimeoutMs,
    save: input.save ?? true
  }, context);
  return executePremiereBridge(job, context, connection);
}

export async function exportPremiere(input, context) {
  if (!input?.project) throw new Error("premiere.export requires with.project");
  const config = context.settings.adobe.premiere;
  const connection = premiereConnection(config);
  const sequenceGuid = input.sequenceGuid ?? (typeof input.project === "object" ? input.project.sequenceGuid : undefined);
  const sequenceName = (typeof input.project === "object" && input.project.sequenceName) ? input.project.sequenceName : (input.sequenceName ?? (sequenceGuid ? undefined : "DOCUMENTARY_MASTER"));
  const job = await createFencedPremiereJob({
    type: "premiere.export",
    project: optionalPath(input.project, context, "config"),
    sequenceName,
    sequenceGuid,
    exports: normalizeExports(input.exports, context, config),
    exportTimeoutMs: input.exportTimeoutMs
  }, context);
  return executePremiereBridge(job, context, connection);
}

async function executePremiereBridge(job, context, connection) {
  const { host, port, mailboxDir, launch, applicationName } = connection;

  if (context.dryRun) {
    let predicted;
    if (job.type === "premiere.export") {
      predicted = { project: job.project, sequenceName: job.sequenceName, exports: job.exports.map((request) => ({ ...request, ok: true, dryRun: true })) };
    } else {
      const scenes = (job.timelineSpec?.scenes || []).map((scene) => ({
        id: scene.id,
        source: scene.source,
        startMs: scene.startMs,
        sourceInMs: scene.sourceInMs || 0,
        durationMs: scene.durationMs,
        videoTrack: scene.track,
        audioPolicy: scene.audioPolicy,
        audioTrack: scene.audioPolicy === "preserve" ? scene.track : -1,
        audioInserted: scene.audioPolicy === "preserve",
        ...(scene.storyboardItemId !== undefined ? { storyboardItemId: scene.storyboardItemId } : {}),
        ...(scene.editorialKind !== undefined ? { editorialKind: scene.editorialKind } : {}),
        ...(scene.parentStoryboardItemId !== undefined ? { parentStoryboardItemId: scene.parentStoryboardItemId } : {})
      }));
      const overlays = (job.timelineSpec?.overlays || []).map((overlay) => ({
        id: overlay.id,
        asset: overlay.asset,
        startMs: overlay.startMs,
        durationMs: overlay.durationMs,
        videoTrack: overlay.track,
        audioPolicy: "mute",
        audioTrack: -1,
        audioInserted: false,
        ...(overlay.storyboardItemId !== undefined ? { storyboardItemId: overlay.storyboardItemId } : {}),
        ...(overlay.editorialKind !== undefined ? { editorialKind: overlay.editorialKind } : {}),
        ...(overlay.parentStoryboardItemId !== undefined ? { parentStoryboardItemId: overlay.parentStoryboardItemId } : {})
      }));
      const dynamicLinks = (job.timelineSpec?.dynamicLinks || []).map((link) => ({
        id: link.id,
        project: link.project,
        composition: link.composition,
        startMs: link.startMs,
        durationMs: link.durationMs,
        videoTrack: link.track,
        audioPolicy: "mute",
        audioTrack: -1,
        audioInserted: false,
        ...(link.storyboardItemId !== undefined ? { storyboardItemId: link.storyboardItemId } : {}),
        ...(link.editorialKind !== undefined ? { editorialKind: link.editorialKind } : {}),
        ...(link.parentStoryboardItemId !== undefined ? { parentStoryboardItemId: link.parentStoryboardItemId } : {})
      }));
      const graphics = (job.timelineSpec?.graphics || []).map((graphic) => ({
        id: graphic.id,
        mogrtPath: graphic.mogrtPath,
        startMs: graphic.startMs,
        durationMs: graphic.durationMs,
        videoTrack: graphic.track,
        text: graphic.text,
        bindingMode: graphic.bindingMode ?? "runtime",
        boundParameters: graphic.bindingMode === "preseeded" ? [] : Object.values(graphic.parameterMap ?? {}),
        seededParameters: graphic.bindingMode === "preseeded" ? Object.values(graphic.parameterMap ?? {}) : [],
        ...(graphic.seedReceipt ? { seedReceipt: graphic.seedReceipt } : {}),
        editable: true,
        audioPolicy: "mute",
        audioTrack: -1,
        audioInserted: false,
        ...(graphic.storyboardItemId !== undefined ? { storyboardItemId: graphic.storyboardItemId } : {}),
        ...(graphic.editorialKind !== undefined ? { editorialKind: graphic.editorialKind } : {})
      }));
      const audio = (job.timelineSpec?.audio || []).map((a, idx) => ({
        id: a.id,
        path: a.path,
        startMs: a.startMs,
        ...(a.durationMs !== undefined ? { durationMs: a.durationMs } : {}),
        audioTrack: idx + 1,
        audioInserted: true
      }));
      predicted = {
        project: job.outputProject,
        sequenceName: job.sequenceName,
        sequenceGuid: `dry-run-${job.id}`,
        scenes,
        overlays,
        graphics,
        dynamicLinks,
        audio
      };
    }
    return { jobId: job.id, generation: job.generation, bridge: `http://${host}:${port}`, job, ...predicted, dryRun: true };
  }

  if (job.outputProject) await mkdir(path.dirname(job.outputProject), { recursive: true });
  for (const request of job.exports ?? []) await mkdir(path.dirname(request.output), { recursive: true });

  const broker = await createBroker(host, port, job, { mailboxDir });
  try {
    if (launch && process.platform === "darwin") {
      await runProcess("open", ["-a", applicationName], { timeoutMs: 30_000 });
    }
    context.log(`Premiere bridge waiting at ${broker.url} or ${broker.mailboxDir}`);
    const result = await broker.waitForResult(context.timeoutMs);
    if (!result.ok) throw new Error(result.error ?? "Premiere UXP job failed");
    const outputs = await finalizePremiereOutputs(result.outputs);
    return {
      jobId: job.id,
      generation: job.generation,
      ...outputs,
      __avaCompletion: {
        kind: "premiere.receipts.v1",
        jobId: job.id,
        generation: job.generation
      }
    };
  } finally {
    await broker.close();
  }
}

async function finalizePremiereOutputs(outputs) {
  if (!outputs || !Array.isArray(outputs.exports)) return outputs;
  const exports = [];
  for (const receipt of outputs.exports) {
    if (!receipt?.output) throw new Error("Premiere export receipt is missing its output path");
    let prevSize = -1;
    let info = await stat(receipt.output);
    for (let i = 0; i < 15; i++) {
      if (info.size > 0 && info.size === prevSize) break;
      prevSize = info.size;
      await new Promise((r) => setTimeout(r, 500));
      info = await stat(receipt.output);
    }
    if (!info.isFile() || info.size < 1) throw new Error(`Premiere export output is missing or empty: ${receipt.output}`);
    const media = await validatePremiereExport(receipt);
    exports.push({ ...receipt, bytes: info.size, sha256: await sha256File(receipt.output), media });
  }
  return { ...outputs, exports };
}

export async function validatePremiereExport(receipt, runner = runProcess) {
  const result = await runner("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    receipt.output
  ], { timeoutMs: 60_000 });
  let probe;
  try { probe = JSON.parse(result.stdout); }
  catch (error) { throw new Error(`Premiere export ffprobe returned invalid JSON for ${receipt.output}: ${error.message}`); }
  const duration = Number(probe?.format?.duration);
  const video = (probe?.streams || []).find((stream) => stream.codec_type === "video");
  if (!Number.isFinite(duration) || duration <= 0 || !video) {
    throw new Error(`Premiere export is not a finalized playable media file: ${receipt.output}`);
  }
  if (receipt.format === "h264" && video.codec_name !== "h264") {
    throw new Error(`Premiere H264 export has unexpected video codec ${video.codec_name || "unknown"}: ${receipt.output}`);
  }
  if (receipt.format === "prores" && video.codec_name !== "prores") {
    throw new Error(`Premiere ProRes export has unexpected video codec ${video.codec_name || "unknown"}: ${receipt.output}`);
  }
  return {
    duration,
    videoCodec: video.codec_name,
    width: Number(video.width || 0),
    height: Number(video.height || 0),
    audioCodec: (probe.streams || []).find((stream) => stream.codec_type === "audio")?.codec_name
  };
}

function premiereConnection(config) {
  const host = config.bridgeHost ?? "127.0.0.1";
  const port = Number(config.bridgePort ?? 47652);
  const mailboxDir = config.bridgeMailbox ?? DEFAULT_MAILBOX_DIR;
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error("Premiere bridge must bind to loopback only");
  }
  return { host, port, mailboxDir, launch: config.launch, applicationName: config.applicationName };
}

export async function createPremiereJob(input, context) {
  if (!input.outputProject) throw new Error("Premiere node requires with.outputProject for safe automation");
  const jobBody = {
    type: "premiere.assemble",
    templateProject: optionalPath(input.templateProject, context, "config"),
    outputProject: optionalPath(input.outputProject, context, "run"),
    sequenceName: input.sequenceName ?? "AUTO_ASSEMBLY",
    media: (input.media ?? []).map((value) => optionalPath(value, context, "config")),
    aeComps: (input.aeComps ?? []).map((entry) => ({
      project: optionalPath(entry.project, context, "config"),
      compositions: entry.compositions ?? []
    })),
    createSequence: input.createSequence ?? true,
    save: input.save ?? true
  };
  const contentIdentity = context.dryRun ? [] : await hashPremiereInputs(jobBody);
  const idempotencyDigest = createHash("sha256").update(JSON.stringify({
    runDir: context.runDir,
    stepId: context.step.id,
    job: jobBody,
    contentIdentity
  })).digest("hex");
  const job = {
    protocolVersion: 1,
    id: `ava-${idempotencyDigest.slice(0, 32)}`,
    generation: idempotencyDigest.slice(32),
    ...jobBody,
    contentIdentity
  };
  return job;
}

export async function createFencedPremiereJob(jobBody, context) {
  const contentIdentity = context.dryRun ? [] : await hashPremiereInputs(jobBody);
  const idempotencyDigest = createHash("sha256").update(JSON.stringify({
    runDir: context.runDir,
    stepId: context.step.id,
    job: jobBody,
    contentIdentity
  })).digest("hex");
  return {
    protocolVersion: 1,
    id: `ava-${idempotencyDigest.slice(0, 32)}`,
    generation: idempotencyDigest.slice(32),
    ...jobBody,
    contentIdentity
  };
}

export async function hashPremiereInputs(job) {
  const values = [
    job.templateProject,
    job.project,
    job.sequencePresetPath,
    ...(job.media ?? []),
    ...(job.aeComps ?? []).map((entry) => entry.project),
    ...(job.timelineSpec?.scenes ?? []).map((entry) => entry.source),
    ...(job.timelineSpec?.overlays ?? []).map((entry) => entry.asset),
    ...(job.timelineSpec?.graphics ?? []).map((entry) => entry.mogrtPath),
    ...(job.timelineSpec?.dynamicLinks ?? []).map((entry) => entry.project),
    ...(job.timelineSpec?.audio ?? []).map((entry) => entry.path),
    ...(job.exports ?? []).map((entry) => entry.presetPath)
  ].filter(Boolean);
  const unique = [...new Set(values)].sort();
  return Promise.all(unique.map(async (filePath) => ({
    path: filePath,
    sha256: existsSync(filePath) ? await sha256File(filePath) : createHash("sha256").update(filePath).digest("hex")
  })));
}

function normalizeExports(values, context, config = {}, options = {}) {
  const requested = values ?? [
    { format: "h264", output: "outputs/premiere/master-h264.mp4" },
    { format: "prores", output: "outputs/premiere/master-prores.mov" }
  ];
  if (!Array.isArray(requested) || (requested.length === 0 && !options.allowEmpty)) throw new Error("Premiere exports must be a non-empty array");
  const seen = new Set();
  return requested.map((entry, index) => {
    const format = String(entry.format ?? "").toLowerCase();
    if (!["h264", "prores"].includes(format)) throw new Error(`Premiere exports[${index}].format must be h264 or prores`);
    if (!entry.output) throw new Error(`Premiere exports[${index}].output is required`);
    if (seen.has(format)) throw new Error(`Premiere exports duplicate format '${format}'`);
    seen.add(format);
    const preset = entry.presetPath ?? config.exportPresets?.[format] ?? `presets/${format}.epr`;
    return {
      format,
      output: optionalPath(entry.output, context, "run"),
      presetPath: optionalPath(preset, context, "config")
    };
  });
}

import { existsSync } from "node:fs";

const FALLBACK_PRESET_CANDIDATES = [
  path.join(REPO_ROOT, "presets", "sequence", "psu-ava-hd-1080p-25-8v4a.sqpreset"),
  "/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app/Contents/Settings/SequencePresets/Legacy/DNxHD/1080p 25/DNX HQ 1080p 25.sqpreset",
  "/Applications/Adobe Premiere Pro (Beta)/Adobe Premiere Pro (Beta).app/Contents/Settings/SequencePresets/Legacy/DNxHD/1080p 25/DNX HQ 1080p 25.sqpreset",
  "/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app/Contents/Settings/SequencePresets/HD 1080p/HD 1080p 25 fps.sqpreset",
  "/Applications/Adobe Premiere Pro (Beta)/Adobe Premiere Pro (Beta).app/Contents/Settings/SequencePresets/HD 1080p/HD 1080p 25 fps.sqpreset",
  "/Applications/Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app/Contents/Settings/SequencePresets/Legacy/DNxHD/1080p 25/DNX HQ 1080p 25.sqpreset"
];

function resolveSequencePreset(value, timelineSpec, config, context) {
  const profile = timelineSpec.width === 1080 && timelineSpec.height === 1920
    ? "portrait"
    : timelineSpec.width === 1920 && timelineSpec.height === 1080
      ? "landscape"
      : timelineSpec.width === 1080 && timelineSpec.height === 1080
        ? "square"
        : undefined;
  let selected = value ?? (profile ? config.sequencePresets?.[profile] : undefined);
  if (!selected && profile === "landscape") {
    for (const candidate of FALLBACK_PRESET_CANDIDATES) {
      if (existsSync(candidate)) {
        selected = candidate;
        break;
      }
    }
  }
  if (!selected) throw new Error(`premiere.build requires sequencePresetPath for ${timelineSpec.width}x${timelineSpec.height} at 25fps`);
  return optionalPath(selected, context, "config");
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function optionalPath(value, context, preference) {
  if (!value) return undefined;
  if (path.isAbsolute(value)) return value;
  if (preference === "run" || value.startsWith("outputs/")) return context.resolveRunPath(value);
  return context.resolvePath(value);
}

export async function createBroker(host, port, job, options = {}) {
  if (job?.protocolVersion !== 1 || !job?.id || !job?.generation) {
    throw new Error("Premiere bridge requires a protocol v1 job with id and generation");
  }
  const mailboxDir = options.mailboxDir;
  const jobPath = mailboxDir ? path.join(mailboxDir, "job.json") : undefined;
  const resultPath = mailboxDir ? path.join(mailboxDir, "result.json") : undefined;
  let resolveResult;
  let rejectResult;
  let settled = false;
  let accepted = false;
  let mailboxTimer;
  const resultPromise = new Promise((resolvePromise, rejectPromise) => {
    resolveResult = resolvePromise;
    rejectResult = rejectPromise;
  });

  const settleResult = (result) => {
    if (settled) return;
    settled = true;
    accepted = true;
    resolveResult(result);
  };

  const matchesJob = (result) => result.jobId === job.id && (!job.generation || result.generation === job.generation);

  if (mailboxDir) {
    await mkdir(mailboxDir, { recursive: true });
    await rm(jobPath, { force: true });
    await rm(resultPath, { force: true });
  }

  const server = http.createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(403).end();
      return;
    }
    if (request.method === "GET" && request.url === "/health") {
      json(response, 200, { ok: true, pendingJobId: job.id });
      return;
    }
    if (request.method === "GET" && request.url === "/job") {
      json(response, 200, job);
      return;
    }
    if (request.method === "POST" && request.url === "/result") {
      try {
        const result = JSON.parse(await readBody(request));
        if (!matchesJob(result)) {
          json(response, 409, { error: "jobId or generation mismatch" });
          return;
        }
        const protocolError = validateBridgeResult(result);
        if (protocolError) {
          json(response, 400, { error: protocolError });
          return;
        }
        settleResult(result);
        json(response, 200, { accepted: true });
      } catch (error) {
        json(response, 400, { error: error.message });
      }
      return;
    }
    json(response, 404, { error: "not found" });
  });

  try {
    await new Promise((resolvePromise, rejectPromise) => {
      server.once("error", rejectPromise);
      server.listen(port, host, resolvePromise);
    });
    if (jobPath) await writeJsonAtomic(jobPath, job);
  } catch (error) {
    if (server.listening) await new Promise((resolvePromise) => server.close(() => resolvePromise()));
    if (jobPath) await rm(jobPath, { force: true });
    if (resultPath) await rm(resultPath, { force: true });
    throw error;
  }
  const address = server.address();
  const activePort = typeof address === "object" && address ? address.port : port;

  return {
    url: `http://${host}:${activePort}`,
    mailboxDir,
    waitForResult(timeoutMs) {
      if (resultPath) {
        mailboxTimer = setInterval(async () => {
          try {
            const result = JSON.parse(await readFile(resultPath, "utf8"));
            if (matchesJob(result)) {
              const protocolError = validateBridgeResult(result);
              if (protocolError) {
                if (!settled) {
                  settled = true;
                  rejectResult(new Error(`Invalid Premiere mailbox result: ${protocolError}`));
                }
              } else settleResult(result);
            }
          } catch (error) {
            if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) rejectResult(error);
          }
        }, 250);
      }
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        rejectResult(new Error(
          `Premiere bridge timed out after ${timeoutMs}ms. Open the PSU AVA Bridge panel and click Connect.`
        ));
      }, timeoutMs);
      return resultPromise.finally(() => {
        clearTimeout(timer);
        clearInterval(mailboxTimer);
      });
    },
    async close() {
      clearInterval(mailboxTimer);
      await new Promise((resolvePromise, rejectPromise) => {
        server.close((error) => error ? rejectPromise(error) : resolvePromise());
      });
      if (accepted) {
        if (jobPath) await rm(jobPath, { force: true });
        if (resultPath) await rm(resultPath, { force: true });
      }
    }
  };
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

function readBody(request) {
  return new Promise((resolvePromise, rejectPromise) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) request.destroy(new Error("request body too large"));
    });
    request.on("end", () => resolvePromise(body));
    request.on("error", rejectPromise);
  });
}

function json(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store, max-age=0"
  });
  response.end(JSON.stringify(value));
}

function validateBridgeResult(result) {
  if (result?.protocolVersion !== 1) return "protocolVersion must equal 1";
  if (typeof result.ok !== "boolean") return "ok must be boolean";
  if (result.ok && (!result.outputs || typeof result.outputs !== "object" || Array.isArray(result.outputs))) {
    return "successful result must contain an outputs object";
  }
  if (!result.ok && typeof result.error !== "string") return "failed result must contain an error string";
  return undefined;
}
