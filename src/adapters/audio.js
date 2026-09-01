import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { runProcess } from "../core/process.js";

export async function selectAudioAsset(input, context) {
  if (!input?.path) throw new Error("audio.asset requires with.path");
  const audioPath = resolveInputPath(input.path, context);
  const audio = {
    id: safeId(input.id ?? `audio_${context.step?.id ?? "asset"}`),
    path: audioPath,
    role: enumValue(input.role ?? "music", ["dialogue", "voiceover", "music", "effects"], "audio.asset role"),
    gainDb: finiteNumber(input.gainDb ?? 0, "audio.asset gainDb"),
    startMs: nonNegativeNumber(input.startMs ?? 0, "audio.asset startMs"),
    durationMs: input.durationMs === undefined ? undefined : positiveNumber(input.durationMs, "audio.asset durationMs")
  };
  if (!context.dryRun) await access(audioPath);
  return { audio, dryRun: context.dryRun ? true : undefined };
}

export async function generateJaiTts(input, context) {
  if (!input?.text || typeof input.text !== "string") throw new Error("audio.jaitts requires with.text");
  if (!input.voice || typeof input.voice !== "string") throw new Error("audio.jaitts requires with.voice");
  if (!input.output || typeof input.output !== "string") throw new Error("audio.jaitts requires with.output");
  const service = {
    baseUrl: input.baseUrl ?? context.settings?.services?.jaitts?.baseUrl ?? "http://127.0.0.1:8001",
    apiKeyEnv: context.settings?.services?.jaitts?.apiKeyEnv ?? "JAITTS_API_KEY"
  };
  const output = context.resolveRunPath(input.output);
  const audioBase = {
    id: safeId(input.id ?? `audio_${context.step?.id ?? "jaitts"}`),
    path: output,
    role: enumValue(input.role ?? "voiceover", ["dialogue", "voiceover", "music", "effects"], "audio.jaitts role"),
    startMs: nonNegativeNumber(input.startMs ?? 0, "audio.jaitts startMs"),
    gainDb: finiteNumber(input.gainDb ?? 0, "audio.jaitts gainDb")
  };
  const voicesUrl = serviceUrl(service.baseUrl, "/api/voices");
  const generateUrl = serviceUrl(service.baseUrl, "/api/generate");
  if (context.dryRun) {
    return { audio: { ...audioBase, voice: input.voice, mimeType: "audio/wav" }, voicesUrl, generateUrl, dryRun: true };
  }

  const request = context.fetch ?? globalThis.fetch;
  if (typeof request !== "function") throw new Error("audio.jaitts requires fetch support");
  const headers = { accept: "application/json" };
  const apiKey = process.env[service.apiKeyEnv];
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const requestTimeoutMs = Math.min(30_000, context.timeoutMs);
  const generationBody = compact({ text: input.text, voice: input.voice, language: input.language, speed: input.speed });
  const requestDigest = createHash("sha256").update(JSON.stringify({ baseUrl: service.baseUrl, body: generationBody })).digest("hex");
  const receiptPath = path.join(context.stepDir, "jaitts-generation.json");
  let receipt = await readJsonIfExists(receiptPath);
  if (receipt && receipt.requestDigest !== requestDigest) {
    throw Object.assign(new Error("JaiTTS generation receipt belongs to different inputs"), { code: "JAITTS_RECEIPT_MISMATCH", unsafeToResume: true });
  }
  if (receipt?.state === "submitting" && !receipt.generationId) {
    throw Object.assign(new Error("JaiTTS submission outcome is ambiguous; refusing to create a duplicate generation"), { code: "JAITTS_SUBMISSION_AMBIGUOUS", unsafeToResume: true });
  }
  let jobId = receipt?.generationId;
  if (!jobId) {
    const voices = await requestJson(request, voicesUrl, { headers, timeoutMs: requestTimeoutMs });
    const available = Array.isArray(voices) ? voices : Array.isArray(voices.voices) ? voices.voices : [];
    if (!available.some((voice) => voice === input.voice || voice?.id === input.voice || voice?.name === input.voice)) {
      throw new Error(`JaiTTS voice '${input.voice}' is not available`);
    }
    await writeJsonAtomic(receiptPath, { schemaVersion: 1, state: "submitting", requestDigest, createdAt: new Date().toISOString() });
    const generated = await requestJson(request, generateUrl, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(generationBody),
      timeoutMs: requestTimeoutMs
    });
    jobId = generated?.generation?.id;
    if (typeof jobId !== "string" || !jobId) throw new Error("JaiTTS generate response did not contain generation.id");
    receipt = { schemaVersion: 1, state: "submitted", requestDigest, generationId: jobId, submittedAt: new Date().toISOString() };
    await writeJsonAtomic(receiptPath, receipt);
  }

  const deadline = Date.now() + context.timeoutMs;
  const statusUrl = serviceUrl(service.baseUrl, `/api/generate/${encodeURIComponent(jobId)}/status`);
  const pollIntervalMs = positiveInteger(input.pollIntervalMs ?? context.settings?.pollIntervalMs ?? 1_000, "audio.jaitts pollIntervalMs");
  let completed;
  while (Date.now() < deadline) {
    const status = await requestJson(request, statusUrl, { headers, timeoutMs: Math.min(requestTimeoutMs, Math.max(1_000, deadline - Date.now())) });
    const state = String(status.status ?? status.state ?? "").toLowerCase();
    if (["completed", "complete", "succeeded", "success"].includes(state) && status.output_url) {
      completed = status;
      break;
    }
    if (["failed", "error", "cancelled"].includes(state)) {
      throw new Error(`JaiTTS generation ${jobId} failed: ${status.error ?? status.message ?? state}`);
    }
    await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
  }
  if (!completed) throw new Error(`JaiTTS generation ${jobId} timed out after ${context.timeoutMs}ms`);

  const outputUrl = new URL(completed.output_url, `${service.baseUrl.replace(/\/$/, "")}/`).toString();
  const response = await request(outputUrl, {
    headers,
    signal: AbortSignal.timeout(Math.min(60_000, Math.max(1_000, deadline - Date.now())))
  });
  if (!response.ok) throw new Error(`JaiTTS WAV download failed with HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("JaiTTS WAV download was empty");
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, output);
  return {
    audio: {
      ...audioBase,
      voice: input.voice,
      jobId,
      mimeType: "audio/wav",
      bytes: bytes.length,
      sourceUrl: outputUrl
    }
  };
}

async function readJsonIfExists(filePath) {
  try { return JSON.parse(await readFile(filePath, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return undefined; throw error; }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, filePath);
}

async function hashFileStable(filePath) {
  const before = await stat(filePath);
  if (!before.isFile()) throw new Error(`audio.loudness_qc source path is not a file: ${filePath}`);

  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);

  const after = await stat(filePath);
  const unchanged = before.dev === after.dev
    && before.ino === after.ino
    && before.size === after.size
    && before.mtimeMs === after.mtimeMs;
  if (!unchanged) {
    throw new Error(`audio.loudness_qc source changed while hashing: ${filePath}`);
  }
  return { sha256: hash.digest("hex"), size: after.size };
}

export async function mixAudio(input, context) {
  if (!Array.isArray(input?.inputs) || input.inputs.length === 0) throw new Error("audio.mix requires a non-empty with.inputs array");
  if (!input.output) throw new Error("audio.mix requires with.output");
  const inputs = input.inputs.map((entry, index) => normalizeMixInput(entry, index, context));
  const output = context.resolveRunPath(input.output);
  const audio = {
    id: safeId(input.id ?? `audio_${context.step?.id ?? "mix"}`),
    path: output,
    role: enumValue(input.role ?? "music", ["dialogue", "voiceover", "music", "effects"], "audio.mix role"),
    startMs: nonNegativeNumber(input.startMs ?? 0, "audio.mix startMs"),
    gainDb: finiteNumber(input.gainDb ?? 0, "audio.mix gainDb")
  };
  const executable = input.ffmpegPath ?? context.settings?.media?.ffmpegPath ?? "ffmpeg";
  const plan = buildAudioMixPlan(inputs, {
    targetLufs: input.targetLufs ?? -16,
    ducking: input.ducking === false ? { enabled: false } : input.ducking === true ? { enabled: true } : input.ducking,
    output,
    codec: input.codec ?? "pcm_s16le"
  });
  const args = ["-y"];
  for (const entry of inputs) args.push("-i", entry.path);
  args.push("-filter_complex", plan.filterComplex, "-map", `[${plan.outputLabel}]`, "-c:a", plan.codec, output);
  if (context.dryRun) return { audio: { ...audio, codec: plan.codec, inputs }, inputs, command: executable, args, codec: plan.codec, dryRun: true };
  for (const entry of inputs) await access(entry.path);
  await mkdir(path.dirname(output), { recursive: true });
  await runProcess(executable, args, {
    timeoutMs: context.timeoutMs,
    onStdout: (chunk) => context.log?.(chunk.trimEnd()),
    onStderr: (chunk) => context.log?.(chunk.trimEnd())
  });
  await access(output);
  return { audio: { ...audio, codec: plan.codec, inputs } };
}

export async function normalizeMasterAudio(input, context) {
  if (typeof input?.source !== "string" || !input.source.trim()) throw new Error("media.audio_normalize requires with.source");
  if (typeof input?.output !== "string" || !input.output.trim()) throw new Error("media.audio_normalize requires with.output");
  const sourcePath = resolveInputPath(input.source, context);
  const outputPath = context.resolveRunPath(input.output);
  if (path.resolve(sourcePath) === path.resolve(outputPath)) throw new Error("media.audio_normalize source and output must differ");
  if (path.extname(outputPath).toLowerCase() !== ".mp4") throw new Error("media.audio_normalize output must be an .mp4 file");

  const targetLufs = finiteNumber(input.targetLufs, "media.audio_normalize targetLufs");
  const maxTruePeakDbfs = finiteNumber(input.maxTruePeakDbfs, "media.audio_normalize maxTruePeakDbfs");
  const loudnessRange = positiveNumber(input.loudnessRange ?? 11, "media.audio_normalize loudnessRange");
  const audioBitrate = positiveInteger(input.audioBitrateKbps ?? 320, "media.audio_normalize audioBitrateKbps");
  const executable = input.ffmpegPath ?? context.settings?.media?.ffmpegPath ?? "ffmpeg";
  const filter = `loudnorm=I=${targetLufs}:LRA=${loudnessRange}:TP=${maxTruePeakDbfs}`;
  const args = [
    "-nostdin", "-hide_banner", "-y", "-i", sourcePath,
    "-map", "0:v:0?", "-map", "0:a:0",
    "-c:v", "copy", "-c:a", "aac", "-b:a", `${audioBitrate}k`,
    "-af", filter, "-movflags", "+faststart", outputPath
  ];
  const policy = { targetLufs, maxTruePeakDbfs, loudnessRange, audioBitrateKbps: audioBitrate };
  if (context.dryRun) return { media: outputPath, sourcePath, outputPath, policy, command: executable, args, dryRun: true };

  await access(sourcePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const sourceIdentity = await hashFileStable(sourcePath);
  await runProcess(executable, args, {
    timeoutMs: context.timeoutMs,
    onStdout: (chunk) => context.log?.(chunk.trimEnd()),
    onStderr: (chunk) => context.log?.(chunk.trimEnd())
  });
  const outputIdentity = await hashFileStable(outputPath);
  if (outputIdentity.size <= 0) throw new Error("media.audio_normalize produced an empty output");
  return {
    media: outputPath,
    sourcePath,
    outputPath,
    policy,
    source: { path: sourcePath, sha256: sourceIdentity.sha256, sizeBytes: sourceIdentity.size },
    output: { path: outputPath, sha256: outputIdentity.sha256, sizeBytes: outputIdentity.size }
  };
}

export function buildAudioMixPlan(inputs, options = {}) {
  const targetLufs = finiteNumber(options.targetLufs ?? -16, "audio.mix targetLufs");
  const filters = [];
  const labels = [];
  inputs.forEach((entry, index) => {
    const label = `a${index}`;
    const chain = [
      `loudnorm=I=${targetLufs}:LRA=11:TP=-1.5`,
      `volume=${entry.gainDb}dB`
    ];
    if (entry.startMs > 0) chain.push(`adelay=${entry.startMs}|${entry.startMs}`);
    if (entry.fadeInMs > 0) chain.push(`afade=t=in:st=${entry.startMs / 1000}:d=${entry.fadeInMs / 1000}`);
    if (entry.fadeOutMs > 0) {
      if (!entry.durationMs) throw new Error(`audio.mix input ${index} requires durationMs when fadeOutMs is used`);
      const fadeStart = Math.max(0, (entry.startMs + entry.durationMs - entry.fadeOutMs) / 1000);
      chain.push(`afade=t=out:st=${fadeStart}:d=${entry.fadeOutMs / 1000}`);
    }
    filters.push(`[${index}:a]${chain.join(",")}[${label}]`);
    labels.push(label);
  });

  const ducking = options.ducking;
  if (ducking?.enabled !== false) {
    const voiceIndex = inputs.findIndex((entry) => ["voiceover", "dialogue"].includes(entry.role));
    const musicIndex = inputs.findIndex((entry) => entry.role === "music");
    if (voiceIndex >= 0 && musicIndex >= 0) {
      const ducked = "ducked_music";
      const voiceMix = "duck_voice_mix";
      const voiceSidechain = "duck_voice_sidechain";
      filters.push(`[a${voiceIndex}]asplit=2[${voiceMix}][${voiceSidechain}]`);
      filters.push(`[a${musicIndex}][${voiceSidechain}]sidechaincompress=threshold=${ducking?.threshold ?? 0.05}:ratio=${ducking?.ratio ?? 8}:attack=${ducking?.attackMs ?? 20}:release=${ducking?.releaseMs ?? 300}[${ducked}]`);
      labels[musicIndex] = ducked;
      labels[voiceIndex] = voiceMix;
    }
  }
  const outputLabel = "audio_mix";
  filters.push(`${labels.map((label) => `[${label}]`).join("")}amix=inputs=${labels.length}:duration=longest:normalize=0[${outputLabel}]`);
  return { filterComplex: filters.join(";"), outputLabel, codec: options.codec ?? "pcm_s16le" };
}

async function requestJson(request, url, options) {
  const response = await request(url, {
    method: options.method,
    headers: options.headers,
    body: options.body,
    signal: AbortSignal.timeout(options.timeoutMs)
  });
  if (!response.ok) throw new Error(`JaiTTS request failed with HTTP ${response.status}: ${url}`);
  return response.json();
}

function normalizeMixInput(value, index, context) {
  const candidate = value?.audio ?? value;
  if (!candidate?.path) throw new Error(`audio.mix inputs[${index}].path is required`);
  return {
    path: resolveInputPath(candidate.path, context),
    role: enumValue(candidate.role ?? "music", ["dialogue", "voiceover", "music", "effects"], `audio.mix inputs[${index}].role`),
    gainDb: finiteNumber(candidate.gainDb ?? 0, `audio.mix inputs[${index}].gainDb`),
    startMs: nonNegativeNumber(candidate.startMs ?? 0, `audio.mix inputs[${index}].startMs`),
    durationMs: candidate.durationMs === undefined ? undefined : positiveNumber(candidate.durationMs, `audio.mix inputs[${index}].durationMs`),
    fadeInMs: nonNegativeNumber(candidate.fadeInMs ?? 0, `audio.mix inputs[${index}].fadeInMs`),
    fadeOutMs: nonNegativeNumber(candidate.fadeOutMs ?? 0, `audio.mix inputs[${index}].fadeOutMs`)
  };
}

function resolveInputPath(value, context) {
  if (path.isAbsolute(value)) return value;
  return value.startsWith("outputs/") ? context.resolveRunPath(value) : context.resolvePath(value);
}

function serviceUrl(baseUrl, pathname) {
  return new URL(pathname.replace(/^\//, ""), `${baseUrl.replace(/\/$/, "")}/`).toString();
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function safeId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("audio asset id is invalid");
  return value;
}

function enumValue(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label} must be one of ${allowed.join(", ")}`);
  return value;
}

function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
}

function nonNegativeNumber(value, label) {
  const number = finiteNumber(value, label);
  if (number < 0) throw new Error(`${label} must be non-negative`);
  return number;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (number <= 0) throw new Error(`${label} must be greater than zero`);
  return number;
}

function positiveInteger(value, label) {
  const number = positiveNumber(value, label);
  if (!Number.isInteger(number)) throw new Error(`${label} must be an integer`);
  return number;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseLoudnormOutput(stderr) {
  if (typeof stderr !== "string") throw new Error("FFmpeg output is not a string");
  const match = stderr.match(/\{\s*"input_i"\s*:[^}]+\}/s);
  if (!match) {
    throw new Error("FFmpeg output did not contain loudnorm JSON summary");
  }
  let data;
  try {
    data = JSON.parse(match[0]);
  } catch (err) {
    throw new Error(`Failed to parse loudnorm JSON: ${err.message}`);
  }
  const integratedLufs = parseFloat(data.input_i);
  const truePeakDbfs = parseFloat(data.input_tp);
  const loudnessRange = parseFloat(data.input_lra);
  const threshold = parseFloat(data.input_thresh);
  const targetOffset = parseFloat(data.target_offset);

  if (!Number.isFinite(integratedLufs) || !Number.isFinite(truePeakDbfs)) {
    throw new Error(`Invalid loudnorm measurements: input_i=${data.input_i}, input_tp=${data.input_tp}`);
  }
  return {
    integratedLufs,
    truePeakDbfs,
    loudnessRange: Number.isFinite(loudnessRange) ? loudnessRange : undefined,
    threshold: Number.isFinite(threshold) ? threshold : undefined,
    targetOffset: Number.isFinite(targetOffset) ? targetOffset : undefined,
    raw: data
  };
}

export function parseSilencedetectOutput(stderr, totalDurationMs) {
  if (typeof stderr !== "string") throw new Error("FFmpeg output is not a string");
  if (!Number.isFinite(totalDurationMs) || totalDurationMs <= 0) {
    throw new Error("totalDurationMs must be a positive finite number");
  }
  const lines = stderr.split("\n");
  const intervals = [];
  let currentStartMs = null;

  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (startMatch) {
      currentStartMs = Math.max(0, Math.round(parseFloat(startMatch[1]) * 1000));
      continue;
    }
    const endMatch = line.match(/silence_end:\s*(-?[\d.]+)/);
    if (endMatch) {
      const endSec = parseFloat(endMatch[1]);
      const endMs = Math.min(totalDurationMs, Math.max(0, Math.round(endSec * 1000)));
      const startMs = currentStartMs !== null ? currentStartMs : 0;
      if (endMs > startMs) {
        intervals.push({ startMs, endMs, durationMs: endMs - startMs });
      }
      currentStartMs = null;
    }
  }
  if (currentStartMs !== null && totalDurationMs > currentStartMs) {
    intervals.push({
      startMs: currentStartMs,
      endMs: totalDurationMs,
      durationMs: totalDurationMs - currentStartMs
    });
  }
  return mergeIntervals(intervals);
}

export function mergeIntervals(intervals) {
  if (!Array.isArray(intervals) || intervals.length === 0) return [];
  const sorted = [...intervals]
    .map((item) => ({
      startMs: Math.max(0, Math.round(item.startMs)),
      endMs: Math.max(0, Math.round(item.endMs)),
      durationMs: Math.max(0, Math.round(item.endMs - item.startMs))
    }))
    .filter((item) => item.durationMs > 0)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  if (sorted.length === 0) return [];
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr.startMs <= prev.endMs) {
      prev.endMs = Math.max(prev.endMs, curr.endMs);
      prev.durationMs = prev.endMs - prev.startMs;
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

export function subtractIntervals(interval, excludeIntervals) {
  let pieces = [{ startMs: interval.startMs, endMs: interval.endMs, durationMs: interval.durationMs }];
  for (const ex of excludeIntervals) {
    const nextPieces = [];
    for (const p of pieces) {
      if (ex.endMs <= p.startMs || ex.startMs >= p.endMs) {
        nextPieces.push(p);
      } else {
        if (p.startMs < ex.startMs) {
          nextPieces.push({
            startMs: p.startMs,
            endMs: ex.startMs,
            durationMs: ex.startMs - p.startMs
          });
        }
        if (p.endMs > ex.endMs) {
          nextPieces.push({
            startMs: ex.endMs,
            endMs: p.endMs,
            durationMs: p.endMs - ex.endMs
          });
        }
      }
    }
    pieces = nextPieces;
  }
  return pieces.filter((p) => p.durationMs > 0);
}

export function deriveExpectedMuteWindows(timelineSpec) {
  if (!timelineSpec || typeof timelineSpec !== "object") return [];
  const scenes = Array.isArray(timelineSpec.scenes) ? timelineSpec.scenes : [];
  const overlays = Array.isArray(timelineSpec.overlays) ? timelineSpec.overlays : [];
  const dynamicLinks = Array.isArray(timelineSpec.dynamicLinks) ? timelineSpec.dynamicLinks : [];
  const allVisuals = [...scenes, ...overlays, ...dynamicLinks];
  if (allVisuals.length === 0) return [];

  const hasAnyProvenance = allVisuals.some(
    (item) => item.storyboardItemId !== undefined || item.editorialKind !== undefined
  );
  if (!hasAnyProvenance) return [];

  const allowedKinds = new Set(["a_roll", "b_roll", "cover_card", "title", "logo_outro"]);
  for (const item of allVisuals) {
    const validStoryboardId = typeof item.storyboardItemId === "string"
      && /^[A-Za-z0-9_-]+$/.test(item.storyboardItemId);
    const validKind = typeof item.editorialKind === "string" && allowedKinds.has(item.editorialKind);
    if (!validStoryboardId || !validKind) {
      throw new Error("TimelineSpec has partial storyboard provenance or invalid provenance; every visual item must provide a valid storyboardItemId and editorialKind");
    }
  }

  const rawIntervals = [];

  for (const item of allVisuals) {
    const startMs = Number(item.startMs);
    const durationMs = Number(item.durationMs);
    if (!Number.isFinite(startMs) || startMs < 0 || !Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error(`TimelineSpec item '${item.id ?? item.storyboardItemId}' has invalid timing for audio QC`);
    }

    if (["title", "cover_card", "logo_outro"].includes(item.editorialKind)) {
      rawIntervals.push({ startMs, endMs: startMs + durationMs, durationMs });
    }
  }

  return mergeIntervals(rawIntervals);
}

export async function qcAudioLoudness(input, context) {
  const rawSource = input?.source ?? input?.media ?? input?.path;
  if (!rawSource || typeof rawSource !== "string") {
    throw new Error("audio.loudness_qc requires with.source");
  }
  const sourcePath = resolveInputPath(rawSource, context);

  const targetLufs = finiteNumber(input.targetLufs, "audio.loudness_qc targetLufs");
  const toleranceLufs = positiveNumber(input.toleranceLufs, "audio.loudness_qc toleranceLufs");
  const maxTruePeakDbfs = finiteNumber(input.maxTruePeakDbfs, "audio.loudness_qc maxTruePeakDbfs");
  const silenceThresholdDbfs = finiteNumber(input.silenceThresholdDbfs, "audio.loudness_qc silenceThresholdDbfs");
  const minSilenceMs = positiveNumber(input.minSilenceMs, "audio.loudness_qc minSilenceMs");
  const maxUnexpectedSilenceMs = nonNegativeNumber(input.maxUnexpectedSilenceMs, "audio.loudness_qc maxUnexpectedSilenceMs");

  if (context.dryRun) {
    return {
      report: {
        measured: false,
        passed: false,
        source: {
          path: sourcePath
        },
        policy: {
          targetLufs,
          toleranceLufs,
          maxTruePeakDbfs,
          silenceThresholdDbfs,
          minSilenceMs,
          maxUnexpectedSilenceMs
        }
      },
      dryRun: true
    };
  }

  await access(sourcePath);
  const sourceIdentity = await hashFileStable(sourcePath);
  const sourceSha256 = sourceIdentity.sha256;
  const sourceSize = sourceIdentity.size;

  const ffprobeExec = input.ffprobePath ?? context.settings?.media?.ffprobePath ?? "ffprobe";
  const probeResult = await runProcess(ffprobeExec, [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    sourcePath
  ], { timeoutMs: context.timeoutMs });

  let probeDoc;
  try {
    probeDoc = JSON.parse(probeResult.stdout);
  } catch (err) {
    throw new Error(`ffprobe returned invalid JSON: ${err.message}`);
  }
  const streams = Array.isArray(probeDoc.streams) ? probeDoc.streams : [];
  const audioStream = streams.find((s) => s.codec_type === "audio");
  if (!audioStream) {
    throw new Error(`No audio stream found in source: ${sourcePath}`);
  }

  const rawDuration = parseFloat(audioStream.duration ?? probeDoc.format?.duration);
  if (!Number.isFinite(rawDuration) || rawDuration <= 0) {
    throw new Error(`Invalid audio duration for source: ${sourcePath}`);
  }
  const durationMs = Math.round(rawDuration * 1000);

  const ffmpegExec = input.ffmpegPath ?? context.settings?.media?.ffmpegPath ?? "ffmpeg";
  const loudnormProcess = await runProcess(ffmpegExec, [
    "-nostdin",
    "-hide_banner",
    "-i", sourcePath,
    "-af", "loudnorm=print_format=json",
    "-f", "null",
    "-"
  ], { timeoutMs: context.timeoutMs });
  const loudnorm = parseLoudnormOutput(loudnormProcess.stderr + "\n" + loudnormProcess.stdout);

  const minSilenceSec = (minSilenceMs / 1000).toFixed(3);
  const silencedetectProcess = await runProcess(ffmpegExec, [
    "-nostdin",
    "-hide_banner",
    "-i", sourcePath,
    "-af", `silencedetect=noise=${silenceThresholdDbfs}dB:d=${minSilenceSec}`,
    "-f", "null",
    "-"
  ], { timeoutMs: context.timeoutMs });
  const detectedSilenceIntervals = parseSilencedetectOutput(
    silencedetectProcess.stderr + "\n" + silencedetectProcess.stdout,
    durationMs
  );

  const expectedMuteWindows = deriveExpectedMuteWindows(input.timelineSpec ?? input.timeline);
  const unexpectedSilenceIntervals = [];
  for (const det of detectedSilenceIntervals) {
    const unexp = subtractIntervals(det, expectedMuteWindows);
    unexpectedSilenceIntervals.push(...unexp);
  }

  const diffLufs = Math.abs(loudnorm.integratedLufs - targetLufs);
  const checkLoudness = diffLufs <= toleranceLufs;
  const checkTruePeak = loudnorm.truePeakDbfs <= maxTruePeakDbfs;
  const checkSilence = unexpectedSilenceIntervals.every((interval) => interval.durationMs <= maxUnexpectedSilenceMs);
  const checkAudioStream = Boolean(audioStream && Number.isFinite(loudnorm.integratedLufs) && Number.isFinite(loudnorm.truePeakDbfs));
  const passed = Boolean(checkLoudness && checkTruePeak && checkSilence && checkAudioStream);

  const receipt = {
    schemaVersion: 1,
    source: {
      path: sourcePath,
      sha256: sourceSha256,
      size: sourceSize
    },
    policy: {
      targetLufs,
      toleranceLufs,
      maxTruePeakDbfs,
      silenceThresholdDbfs,
      minSilenceMs,
      maxUnexpectedSilenceMs
    },
    metadata: {
      durationSeconds: rawDuration,
      durationMs,
      audioStream: {
        codec: audioStream.codec_name,
        sampleRate: audioStream.sample_rate ? Number(audioStream.sample_rate) : undefined,
        channels: audioStream.channels ? Number(audioStream.channels) : undefined,
        channelLayout: audioStream.channel_layout
      }
    },
    measurements: {
      integratedLufs: loudnorm.integratedLufs,
      truePeakDbfs: loudnorm.truePeakDbfs,
      loudnessRange: loudnorm.loudnessRange,
      threshold: loudnorm.threshold,
      targetOffset: loudnorm.targetOffset
    },
    silence: {
      detectedIntervals: detectedSilenceIntervals,
      expectedMuteWindows,
      unexpectedIntervals: unexpectedSilenceIntervals
    },
    checks: {
      loudness: {
        passed: checkLoudness,
        targetLufs,
        toleranceLufs,
        actualLufs: loudnorm.integratedLufs,
        diffLufs
      },
      truePeak: {
        passed: checkTruePeak,
        maxTruePeakDbfs,
        actualTruePeakDbfs: loudnorm.truePeakDbfs
      },
      silence: {
        passed: checkSilence,
        maxUnexpectedSilenceMs,
        unexpectedIntervals: unexpectedSilenceIntervals
      },
      audioStream: {
        passed: checkAudioStream
      }
    },
    passed,
    measured: true,
    measuredAt: new Date().toISOString()
  };

  const stepDir = context.stepDir ?? path.dirname(sourcePath);
  await mkdir(stepDir, { recursive: true });
  const receiptPath = path.join(stepDir, "loudness-qc-receipt.json");
  await writeJsonAtomic(receiptPath, receipt);

  if (!passed) {
    const failureReasons = [];
    if (!checkLoudness) failureReasons.push(`loudness |${loudnorm.integratedLufs} - (${targetLufs})| = ${diffLufs.toFixed(2)} LU > tolerance ${toleranceLufs} LU`);
    if (!checkTruePeak) failureReasons.push(`true-peak ${loudnorm.truePeakDbfs} dBFS > max ${maxTruePeakDbfs} dBFS`);
    if (!checkSilence) failureReasons.push(`unexpected silence exceeded max ${maxUnexpectedSilenceMs}ms (${unexpectedSilenceIntervals.map((i) => `${i.durationMs}ms @ [${i.startMs}, ${i.endMs}]`).join(", ")})`);
    if (!checkAudioStream) failureReasons.push("invalid audio stream measurement");

    const err = new Error(`Audio loudness QC failed: ${failureReasons.join("; ")}`);
    err.code = "AUDIO_QC_FAILED";
    err.details = {
      receiptPath,
      receipt
    };
    throw err;
  }

  return {
    report: receipt,
    receiptPath
  };
}
