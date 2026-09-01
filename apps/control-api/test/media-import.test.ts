import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import path from "node:path";
import { persistUploadedMedia } from "../src/media-import.ts";

const execFileAsync = promisify(execFile);

test("streaming media import verifies a real WAV without buffering it in the API", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-media-import-"));
  const source = path.join(root, "source.wav");
  await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "0.1", source], { timeout: 30_000 });
  const file: any = createReadStream(source);
  file.truncated = false;
  const result = await persistUploadedMedia({ file, mimetype: "audio/wav", filename: "เสียง.wav" }, root);
  assert.equal(result.mimeType, "audio/wav");
  assert.ok(result.durationSeconds > 0 && result.durationSeconds <= 0.11);
  assert.match(result.projectPath, /^assets\/input\/ui\/[0-9a-f-]+\.wav$/);
  await rm(root, { recursive: true, force: true });
});

test("media import rejects duration beyond the configured limit", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-media-duration-"));
  const source = path.join(root, "source.wav");
  await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono", "-t", "0.05", source], { timeout: 30_000 });
  const file: any = createReadStream(source);
  file.truncated = false;
  await assert.rejects(persistUploadedMedia({ file, mimetype: "audio/wav", filename: "long.wav" }, root, {
    maxDurationSeconds: 300,
    probe: async () => ({ format: { duration: "301" }, streams: [{ codec_type: "audio", duration: "301" }] })
  }), (error: any) => error.statusCode === 413 && /duration/.test(error.message));
  await rm(root, { recursive: true, force: true });
});
