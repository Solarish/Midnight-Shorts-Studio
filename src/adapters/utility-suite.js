import { access, mkdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { runProcess } from "../core/process.js";

// 1. Logic: switch_branch
export async function switchBranch(input, context) {
  const expr = input.expression !== undefined ? String(input.expression) : "";
  const cases = input.cases && typeof input.cases === "object" ? input.cases : {};
  const matchMode = input.matchMode || "exact";

  let matchedKey = null;
  let result = undefined;

  if (matchMode === "exact") {
    if (Object.prototype.hasOwnProperty.call(cases, expr)) {
      matchedKey = expr;
      result = cases[expr];
    }
  } else if (matchMode === "case_insensitive") {
    const target = expr.toLowerCase();
    const found = Object.keys(cases).find((k) => k.toLowerCase() === target);
    if (found !== undefined) {
      matchedKey = found;
      result = cases[found];
    }
  } else if (matchMode === "regex") {
    for (const [pattern, val] of Object.entries(cases)) {
      try {
        if (new RegExp(pattern).test(expr)) {
          matchedKey = pattern;
          result = val;
          break;
        }
      } catch {
        // ignore invalid regex
      }
    }
  }

  const isDefault = matchedKey === null;
  if (isDefault) {
    result = input.default !== undefined ? input.default : null;
  }

  return {
    matchedKey: matchedKey ?? "default",
    isDefault,
    result
  };
}

// 2. Logic: coalesce_fallback
export async function coalesceFallback(input, context) {
  const candidates = Array.isArray(input.candidates) ? input.candidates : [input.candidates];
  const treatEmptyStringAsNull = input.treatEmptyStringAsNull ?? true;
  const treatEmptyArrayAsNull = input.treatEmptyArrayAsNull ?? true;

  let selectedValue = null;
  let selectedSourceIndex = -1;

  for (let i = 0; i < candidates.length; i++) {
    const val = candidates[i];
    if (val === null || val === undefined) continue;
    if (treatEmptyStringAsNull && typeof val === "string" && val.trim() === "") continue;
    if (treatEmptyArrayAsNull && Array.isArray(val) && val.length === 0) continue;
    if (typeof val === "object" && Object.keys(val).length === 0 && !Array.isArray(val)) continue;

    selectedValue = val;
    selectedSourceIndex = i;
    break;
  }

  const isFallback = selectedSourceIndex === -1;
  if (isFallback) {
    selectedValue = input.fallback !== undefined ? input.fallback : null;
  }

  return {
    value: selectedValue,
    selectedSourceIndex,
    isFallback
  };
}

// 3. Text: string_formatter
export async function formatString(input, context) {
  if (!input.template) throw new Error("util.string_formatter requires with.template");
  let template = String(input.template);
  const vars = input.variables && typeof input.variables === "object" ? input.variables : {};

  let output = template.replace(/\{([^{}]+)\}/g, (match, key) => {
    const trimmed = key.trim();
    return Object.prototype.hasOwnProperty.call(vars, trimmed) ? String(vars[trimmed]) : match;
  });

  const transform = input.caseTransform || "none";
  if (transform === "upper") output = output.toUpperCase();
  else if (transform === "lower") output = output.toLowerCase();
  else if (transform === "title") {
    output = output.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  } else if (transform === "kebab") {
    output = output.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  } else if (transform === "snake") {
    output = output.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  if (input.pad && typeof input.pad.length === "number") {
    const padChar = input.pad.char || "0";
    const padDir = input.pad.direction || "start";
    output = padDir === "start" ? output.padStart(input.pad.length, padChar) : output.padEnd(input.pad.length, padChar);
  }

  const slug = output
    .toLowerCase()
    .replace(/[^\w\d-_.]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return {
    formattedText: output,
    slug
  };
}

// 4. Text: json_query_extract
export async function jsonQueryExtract(input, context) {
  let source = input.source;
  if (typeof source === "string") {
    try { source = JSON.parse(source); } catch { source = {}; }
  }
  const query = input.query || "";
  const defaultValue = input.defaultValue !== undefined ? input.defaultValue : null;

  function resolvePath(obj, pathExpr) {
    if (!pathExpr || pathExpr === "." || pathExpr === "$") return obj;
    const parts = pathExpr.replace(/\[(\w+)\]/g, ".$1").replace(/^\./, "").split(".");
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== "object") return undefined;
      current = current[part];
    }
    return current;
  }

  let extracted = resolvePath(source, query);
  const exists = extracted !== undefined && extracted !== null;
  if (!exists) extracted = defaultValue;

  let count = 1;
  if (Array.isArray(extracted)) {
    if (input.filterProperty && input.filterValue !== undefined) {
      extracted = extracted.filter((item) => item && item[input.filterProperty] === input.filterValue);
    }
    if (input.flatten) {
      extracted = extracted.flat(Infinity);
    }
    count = extracted.length;
  }

  return {
    result: extracted,
    count,
    exists
  };
}

// 5. Media: media_transcode
export async function mediaTranscode(input, context) {
  if (!input.source) throw new Error("util.media_transcode requires with.source");
  const sourcePath = resolveInput(input.source, context);
  const ext = path.extname(sourcePath) || ".mp4";
  const outputPath = input.outputPath ? resolveOutput(input.outputPath, context) : context.resolveRunPath(`transcoded_${path.basename(sourcePath, ext)}.mp4`);

  const preset = input.preset || "h264_1080p_broadcast";
  const fps = input.fps || 25;

  let ffmpegArgs = ["-y", "-i", sourcePath];

  if (preset === "h264_proxy_720p") {
    ffmpegArgs.push("-vf", "scale=-2:720", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-c:a", "aac", "-b:a", "128k", "-r", String(fps));
  } else if (preset === "h264_1080p_broadcast") {
    ffmpegArgs.push("-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-c:a", "aac", "-b:a", "320k", "-r", String(fps));
  } else if (preset === "prores_422") {
    ffmpegArgs.push("-c:v", "prores_ks", "-profile:v", "2", "-c:a", "pcm_s24le", "-r", String(fps));
  } else if (preset === "prores_4444_alpha") {
    ffmpegArgs.push("-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", "-c:a", "pcm_s24le", "-r", String(fps));
  }

  ffmpegArgs.push(outputPath);

  if (context.dryRun) {
    return {
      media: outputPath,
      video: outputPath,
      fileSizeBytes: 10485760,
      durationSeconds: 10.0,
      dryRun: true
    };
  }

  await access(sourcePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await runProcess("ffmpeg", ffmpegArgs, { timeoutMs: context.timeoutMs || 300000 });
  const fileStat = await stat(outputPath);

  return {
    media: outputPath,
    video: outputPath,
    fileSizeBytes: fileStat.size
  };
}

// 6. Audio: audio_extract
export async function audioExtract(input, context) {
  if (!input.source) throw new Error("util.audio_extract requires with.source");
  const sourcePath = resolveInput(input.source, context);
  const format = input.format || "wav";
  const sampleRate = input.sampleRate || 48000;
  const channels = input.channels || 2;
  const outputPath = input.outputPath ? resolveOutput(input.outputPath, context) : context.resolveRunPath(`extracted_${path.basename(sourcePath, path.extname(sourcePath))}.${format}`);

  let audioCodec = "pcm_s16le";
  if (format === "mp3") audioCodec = "libmp3lame";
  else if (format === "aac") audioCodec = "aac";
  else if (format === "flac") audioCodec = "flac";

  const streamIdx = input.audioStreamIndex !== undefined ? input.audioStreamIndex : 0;
  const ffmpegArgs = [
    "-y", "-i", sourcePath,
    "-map", `0:a:${streamIdx}`,
    "-c:a", audioCodec,
    "-ar", String(sampleRate),
    "-ac", String(channels)
  ];

  if (typeof input.normalizeLufs === "number") {
    ffmpegArgs.push("-af", `loudnorm=I=${input.normalizeLufs}:TP=-1.5:LRA=11`);
  }

  ffmpegArgs.push(outputPath);

  if (context.dryRun) {
    return {
      audio: outputPath,
      durationSeconds: 10.0,
      sampleRate,
      channels,
      dryRun: true
    };
  }

  await access(sourcePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await runProcess("ffmpeg", ffmpegArgs, { timeoutMs: context.timeoutMs || 120000 });

  return {
    audio: outputPath,
    sampleRate,
    channels
  };
}

// 7. Media: lossless_trim
export async function losslessTrim(input, context) {
  if (!input.source) throw new Error("util.lossless_trim requires with.source");
  const sourcePath = resolveInput(input.source, context);
  const ext = path.extname(sourcePath) || ".mp4";
  const outputPath = input.outputPath ? resolveOutput(input.outputPath, context) : context.resolveRunPath(`trimmed_${path.basename(sourcePath, ext)}${ext}`);

  const startMs = Number(input.startMs || 0);
  const durationMs = input.durationMs ? Number(input.durationMs) : undefined;
  const endMs = input.endMs ? Number(input.endMs) : undefined;
  const exact = input.exactReencode ?? false;

  const startSec = (startMs / 1000).toFixed(3);
  const ffmpegArgs = ["-y"];

  if (!exact) {
    ffmpegArgs.push("-ss", startSec, "-i", sourcePath);
    if (durationMs) ffmpegArgs.push("-t", (durationMs / 1000).toFixed(3));
    else if (endMs) ffmpegArgs.push("-to", ((endMs - startMs) / 1000).toFixed(3));
    ffmpegArgs.push("-c", "copy");
  } else {
    ffmpegArgs.push("-i", sourcePath, "-ss", startSec);
    if (durationMs) ffmpegArgs.push("-t", (durationMs / 1000).toFixed(3));
    else if (endMs) ffmpegArgs.push("-to", (endMs / 1000).toFixed(3));
    ffmpegArgs.push("-c:v", "libx264", "-crf", "18", "-c:a", "aac");
  }

  ffmpegArgs.push(outputPath);

  if (context.dryRun) {
    return {
      media: outputPath,
      durationMs: durationMs || (endMs ? endMs - startMs : 5000),
      durationSeconds: (durationMs || 5000) / 1000,
      dryRun: true
    };
  }

  await access(sourcePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await runProcess("ffmpeg", ffmpegArgs, { timeoutMs: context.timeoutMs || 120000 });

  return {
    media: outputPath,
    durationMs: durationMs || (endMs ? endMs - startMs : undefined),
    durationSeconds: durationMs ? durationMs / 1000 : undefined
  };
}

// 8. Timing: timecode_math
export async function timecodeMath(input, context) {
  const fps = Number(input.fps || 25);
  let totalFrames = 0;

  if (input.timecode) {
    const parts = String(input.timecode).split(/[:;]/).map(Number);
    if (parts.length === 4) {
      const [hh, mm, ss, ff] = parts;
      totalFrames = (hh * 3600 + mm * 60 + ss) * fps + ff;
    }
  } else if (input.frames !== undefined) {
    totalFrames = Number(input.frames);
  } else if (input.durationMs !== undefined) {
    totalFrames = Math.round((Number(input.durationMs) / 1000) * fps);
  }

  if (Array.isArray(input.operations)) {
    for (const op of input.operations) {
      let valFrames = 0;
      if (typeof op.value === "string" && op.value.includes(":")) {
        const p = op.value.split(/[:;]/).map(Number);
        valFrames = (p[0] * 3600 + p[1] * 60 + p[2]) * fps + (p[3] || 0);
      } else {
        valFrames = Number(op.value);
      }

      if (op.op === "add") totalFrames += valFrames;
      else if (op.op === "subtract") totalFrames -= valFrames;
      else if (op.op === "multiply") totalFrames *= valFrames;
      else if (op.op === "divide" && valFrames !== 0) totalFrames = Math.floor(totalFrames / valFrames);
    }
  }

  if (totalFrames < 0) totalFrames = 0;

  const totalSeconds = Math.floor(totalFrames / fps);
  const ff = Math.floor(totalFrames % fps);
  const ss = totalSeconds % 60;
  const mm = Math.floor((totalSeconds / 60) % 60);
  const hh = Math.floor(totalSeconds / 3600);

  const formattedTimecode = [
    String(hh).padStart(2, "0"),
    String(mm).padStart(2, "0"),
    String(ss).padStart(2, "0"),
    String(ff).padStart(2, "0")
  ].join(":");

  return {
    timecode: formattedTimecode,
    frames: totalFrames,
    durationMs: Math.round((totalFrames / fps) * 1000),
    seconds: totalFrames / fps
  };
}

// 9. Timing: duration_pad
export async function durationPad(input, context) {
  if (!input.source) throw new Error("util.duration_pad requires with.source");
  if (!input.targetDurationMs) throw new Error("util.duration_pad requires with.targetDurationMs");
  const sourcePath = resolveInput(input.source, context);
  const targetDurationMs = Number(input.targetDurationMs);
  const padMode = input.padMode || "freeze_last_frame";
  const outputPath = input.outputPath ? resolveOutput(input.outputPath, context) : context.resolveRunPath(`padded_${path.basename(sourcePath)}`);

  if (context.dryRun) {
    return {
      media: outputPath,
      originalDurationMs: targetDurationMs - 1000,
      paddedDurationMs: targetDurationMs,
      addedPadMs: 1000,
      dryRun: true
    };
  }

  await access(sourcePath);
  await mkdir(path.dirname(outputPath), { recursive: true });

  const targetSec = (targetDurationMs / 1000).toFixed(3);
  let ffmpegArgs = ["-y", "-i", sourcePath];

  if (padMode === "freeze_last_frame") {
    ffmpegArgs.push("-filter_complex", `[0:v]tpad=stop_mode=clone:stop_duration=${targetSec}[v];[0:a]apad[a]`, "-map", "[v]", "-map", "[a]", "-t", targetSec);
  } else {
    ffmpegArgs.push("-filter_complex", `[0:v]tpad=stop_mode=add:stop_duration=${targetSec}:color=black[v];[0:a]apad[a]`, "-map", "[v]", "-map", "[a]", "-t", targetSec);
  }

  ffmpegArgs.push("-c:v", "libx264", "-c:a", "aac", outputPath);
  await runProcess("ffmpeg", ffmpegArgs, { timeoutMs: context.timeoutMs || 180000 });

  return {
    media: outputPath,
    paddedDurationMs: targetDurationMs
  };
}

// 10. QC: data_inspector_qc
export async function dataInspectorQc(input, context) {
  const data = input.targetData;
  const assertions = Array.isArray(input.assertions) ? input.assertions : [];
  const name = input.inspectionName || "Pipeline QC Check";
  const haltOnFailure = input.haltOnFailure ?? true;

  const violations = [];

  for (const a of assertions) {
    const parts = a.path.split(".");
    let curr = data;
    for (const p of parts) {
      if (curr === null || curr === undefined) { curr = undefined; break; }
      curr = curr[p];
    }

    if (a.rule === "required" && (curr === undefined || curr === null || curr === "")) {
      violations.push({ path: a.path, rule: "required", message: `Field '${a.path}' is missing or empty`, severity: a.severity || "error" });
    } else if (a.rule === "type" && curr !== undefined && typeof curr !== a.expected) {
      violations.push({ path: a.path, rule: "type", message: `Field '${a.path}' expected type '${a.expected}', got '${typeof curr}'`, severity: a.severity || "error" });
    } else if (a.rule === "minimum" && typeof curr === "number" && curr < a.expected) {
      violations.push({ path: a.path, rule: "minimum", message: `Field '${a.path}' value ${curr} is less than minimum ${a.expected}`, severity: a.severity || "error" });
    } else if (a.rule === "regex" && typeof curr === "string" && !new RegExp(a.expected).test(curr)) {
      violations.push({ path: a.path, rule: "regex", message: `Field '${a.path}' does not match pattern ${a.expected}`, severity: a.severity || "error" });
    }
  }

  const errorViolations = violations.filter((v) => v.severity === "error");
  const passed = errorViolations.length === 0;

  if (!passed && haltOnFailure && !context.dryRun) {
    throw new Error(`Data QC Assertion Failed [${name}]: ${errorViolations.map((v) => v.message).join("; ")}`);
  }

  return {
    inspectionName: name,
    passed,
    violationsCount: violations.length,
    violations,
    report: { checkedAt: new Date().toISOString(), passed, violations }
  };
}

// 11. QC: file_integrity_guard
export async function fileIntegrityGuard(input, context) {
  if (!input.filePath) throw new Error("util.file_integrity_guard requires with.filePath");
  const targetPath = resolveInput(input.filePath, context);

  if (context.dryRun) {
    return {
      valid: true,
      fileSizeBytes: 1048576,
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
      dryRun: true
    };
  }

  await access(targetPath);
  const fileStat = await stat(targetPath);

  const minBytes = input.minSizeBytes || 1024;
  if (fileStat.size < minBytes) {
    throw new Error(`Integrity Failure: '${targetPath}' size (${fileStat.size} bytes) is below threshold (${minBytes} bytes). Possible zero-byte render!`);
  }

  if (input.maxSizeBytes && fileStat.size > input.maxSizeBytes) {
    throw new Error(`Integrity Failure: '${targetPath}' size (${fileStat.size} bytes) exceeds limit (${input.maxSizeBytes} bytes).`);
  }

  let hash = undefined;
  if (input.expectedSha256) {
    const buffer = await readFile(targetPath);
    hash = createHash("sha256").update(buffer).digest("hex");
    if (hash.toLowerCase() !== input.expectedSha256.toLowerCase()) {
      throw new Error(`Integrity Failure: '${targetPath}' SHA-256 hash mismatch! Expected ${input.expectedSha256}, got ${hash}`);
    }
  }

  return {
    valid: true,
    fileSizeBytes: fileStat.size,
    sha256: hash
  };
}

function resolveInput(p, context) {
  if (!p || typeof p !== "string") throw new Error("Path must be a string");
  if (path.isAbsolute(p)) return p;
  return p.startsWith("outputs/") ? context.resolveRunPath(p) : context.resolvePath(p);
}

function resolveOutput(p, context) {
  if (!p || typeof p !== "string") throw new Error("Path must be a string");
  if (path.isAbsolute(p)) return p;
  return context.resolveRunPath(p);
}
