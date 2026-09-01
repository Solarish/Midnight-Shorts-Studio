import { access } from "node:fs/promises";
import path from "node:path";
import { runProcess } from "../core/process.js";

export async function probeMedia(input, context) {
  if (!input?.path) throw new Error("media.probe requires with.path");
  const mediaPath = resolveInputPath(input.path, context);
  const executable = input.ffprobePath ?? context.settings?.media?.ffprobePath ?? "ffprobe";
  const args = ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", mediaPath];
  if (context.dryRun) return { path: mediaPath, command: executable, args, dryRun: true };
  await access(mediaPath);
  const result = await runProcess(executable, args, { timeoutMs: context.timeoutMs });
  let document;
  try { document = JSON.parse(result.stdout); }
  catch (error) { throw new Error(`ffprobe returned invalid JSON: ${error.message}`); }
  const streams = Array.isArray(document.streams) ? document.streams : [];
  const videoStream = streams.find((stream) => stream.codec_type === "video");
  const audioStream = streams.find((stream) => stream.codec_type === "audio");
  return {
    path: mediaPath,
    format: document.format ?? {},
    streams,
    durationSeconds: optionalNumber(document.format?.duration),
    video: videoStream ? {
      codec: videoStream.codec_name,
      width: videoStream.width,
      height: videoStream.height,
      frameRate: parseFrameRate(videoStream.avg_frame_rate ?? videoStream.r_frame_rate),
      durationSeconds: optionalNumber(videoStream.duration)
    } : undefined,
    audio: audioStream ? {
      codec: audioStream.codec_name,
      sampleRate: optionalNumber(audioStream.sample_rate),
      channels: audioStream.channels,
      channelLayout: audioStream.channel_layout,
      durationSeconds: optionalNumber(audioStream.duration)
    } : undefined
  };
}

export function parseFrameRate(value) {
  if (typeof value !== "string" || !value) return undefined;
  const [numerator, denominator = "1"] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return undefined;
  return numerator / denominator;
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function resolveInputPath(value, context) {
  if (typeof value !== "string" || !value) throw new Error("media.probe path must be a non-empty string");
  if (path.isAbsolute(value)) return value;
  return value.startsWith("outputs/") ? context.resolveRunPath(value) : context.resolvePath(value);
}
