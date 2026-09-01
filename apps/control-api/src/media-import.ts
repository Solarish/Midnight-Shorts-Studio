import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import path from "node:path";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
export const MEDIA_MAX_DURATION_SECONDS = 5 * 60;
export const MEDIA_MAX_BYTES = 2 * 1024 * 1024 * 1024;

const extensions: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "audio/wav": ".wav",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov"
};

export const supportedMediaTypes = Object.freeze(Object.keys(extensions));

export async function persistUploadedMedia(part: any, assetRoot: string, options: {
  maxBytes?: number;
  maxDurationSeconds?: number;
  probe?: (filePath: string) => Promise<any>;
} = {}) {
  if (!part?.file || !extensions[part.mimetype]) throw mediaError(415, "Unsupported media type");
  const maxBytes = options.maxBytes ?? MEDIA_MAX_BYTES;
  const maxDuration = options.maxDurationSeconds ?? MEDIA_MAX_DURATION_SECONDS;
  const assetId = randomUUID();
  const temporary = path.join(assetRoot, `.upload-${assetId}.tmp`);
  let target: string | undefined;
  try {
    await pipeline(part.file, createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
    if (part.file.truncated) throw mediaError(413, `Media exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit`);
    const file = await stat(temporary);
    if (!file.isFile() || file.size === 0) throw mediaError(422, "Uploaded media is empty");
    if (file.size > maxBytes) throw mediaError(413, `Media exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit`);
    if (!await matchesMediaSignature(temporary, part.mimetype)) throw mediaError(415, "Media content does not match its declared type");

    let dimensions: { width?: number; height?: number } = {};
    let durationSeconds: number | undefined;
    if (part.mimetype.startsWith("image/")) {
      const metadata = await sharp(temporary).metadata();
      const actual = metadata.format === "png" ? "image/png" : metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "webp" ? "image/webp" : undefined;
      if (actual !== part.mimetype || !metadata.width || !metadata.height) throw mediaError(415, "Image content does not match its declared type");
      if (metadata.width > 12_000 || metadata.height > 12_000 || metadata.width * metadata.height > 50_000_000) throw mediaError(413, "Image dimensions exceed the 50 megapixel safety limit");
      dimensions = { width: metadata.width, height: metadata.height };
    } else {
      const probe = await (options.probe ?? probeMedia)(temporary);
      const streams = Array.isArray(probe.streams) ? probe.streams : [];
      const expectedStream = part.mimetype.startsWith("audio/") ? streams.some((value: any) => value.codec_type === "audio") : streams.some((value: any) => value.codec_type === "video");
      if (!expectedStream) throw mediaError(415, `Uploaded ${part.mimetype.startsWith("audio/") ? "audio" : "video"} stream could not be verified`);
      durationSeconds = mediaDuration(probe);
      if (!Number.isFinite(durationSeconds) || durationSeconds! <= 0) throw mediaError(422, "Media duration could not be verified");
      if (durationSeconds! > maxDuration + 0.001) throw mediaError(413, `Media duration exceeds ${maxDuration} seconds`);
    }

    const filename = `${assetId}${extensions[part.mimetype]}`;
    target = path.join(assetRoot, filename);
    await rename(temporary, target);
    const record = {
      assetId,
      projectPath: path.posix.join("assets/input/ui", filename),
      originalName: String(part.filename ?? "media").normalize("NFC").slice(0, 255),
      mimeType: part.mimetype,
      bytes: file.size,
      ...dimensions,
      ...(durationSeconds === undefined ? {} : { durationSeconds }),
      previewUrl: `/api/v1/assets/${assetId}/content`
    };
    await writeFile(path.join(assetRoot, `${assetId}.json`), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    return record;
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    if (target) await rm(target, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function matchesMediaSignature(filePath: string, mimeType: string) {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < 3) return false;
    if (mimeType === "image/png") return header.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
    if (mimeType === "image/jpeg") return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    if (mimeType === "image/webp") return header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP";
    if (mimeType === "audio/wav") return header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WAVE";
    if (mimeType === "audio/mpeg") return header.subarray(0, 3).toString("ascii") === "ID3" || (header[0] === 0xff && (header[1]! & 0xe0) === 0xe0);
    if (mimeType === "audio/aac") return header[0] === 0xff && (header[1]! & 0xf6) === 0xf0;
    if (["audio/mp4", "audio/x-m4a", "video/mp4", "video/quicktime"].includes(mimeType)) return header.subarray(4, 8).toString("ascii") === "ftyp";
    return false;
  } finally {
    await handle.close();
  }
}

async function probeMedia(filePath: string) {
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout);
}

function mediaDuration(value: any) {
  const candidates = [value?.format?.duration, ...(value?.streams ?? []).map((stream: any) => stream.duration)].map(Number).filter((item) => Number.isFinite(item));
  return candidates.length ? Math.max(...candidates) : undefined;
}

function mediaError(statusCode: number, message: string) { return Object.assign(new Error(message), { statusCode }); }
