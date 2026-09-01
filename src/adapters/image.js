import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess } from "../core/process.js";

const CUTOUT_SOURCE = fileURLToPath(new URL("../../tools/person-cutout.swift", import.meta.url));
const COVER_TITLE_SOURCE = fileURLToPath(new URL("../../tools/cover-title-compositor.swift", import.meta.url));
const LUMA_ALPHA_SOURCE = fileURLToPath(new URL("../../tools/luma-to-alpha.swift", import.meta.url));

export async function removeBackground(input, context) {
  if (!input.path) throw new Error("image.removeBackground requires with.path");
  const source = path.isAbsolute(input.path) ? input.path : context.resolvePath(input.path);
  const output = context.resolveRunPath(input.output ?? "media/person-cutout.png");

  if (context.dryRun) return { path: output, source, engine: "apple-vision", dryRun: true };
  if (process.platform !== "darwin") throw new Error("Apple Vision background removal requires macOS");

  await access(source);
  await mkdir(path.dirname(output), { recursive: true });
  const toolDir = path.join(context.runDir, ".tools");
  const executable = path.join(toolDir, "person-cutout");
  await mkdir(toolDir, { recursive: true });
  try {
    await access(executable);
  } catch {
    context.log("Compiling Apple Vision person cutout helper…");
    await runProcess("xcrun", [
      "swiftc", "-O",
      "-framework", "Vision",
      "-framework", "CoreImage",
      CUTOUT_SOURCE,
      "-o", executable
    ], { timeoutMs: Math.min(context.timeoutMs, 180_000) });
  }

  await runProcess(executable, [source, output], { timeoutMs: context.timeoutMs });
  await access(output);
  return { path: output, source, engine: "apple-vision" };
}

export async function resizeImage(input, context) {
  if (!input.path) throw new Error("image.resize requires with.path");
  const source = path.isAbsolute(input.path) ? input.path : context.resolvePath(input.path);
  const output = context.resolveRunPath(input.output ?? "media/resized-image.png");

  if (context.dryRun) return { path: output, source, dryRun: true };

  await access(source);
  await mkdir(path.dirname(output), { recursive: true });

  const maxDimension = input.maxDimension ? Number(input.maxDimension) : undefined;
  const width = input.width ? Number(input.width) : undefined;
  const height = input.height ? Number(input.height) : undefined;

  if (process.platform === "darwin") {
    const args = [];
    if (maxDimension) {
      args.push("-Z", String(maxDimension));
    } else if (width && height) {
      args.push("--resampleHeightWidth", String(height), String(width));
    } else if (width) {
      args.push("--resampleWidth", String(width));
    } else if (height) {
      args.push("--resampleHeight", String(height));
    } else {
      args.push("-Z", "1080");
    }
    args.push(source, "--out", output);
    await runProcess("sips", args, { timeoutMs: context.timeoutMs });
  } else {
    const vf = maxDimension
      ? `scale='min(${maxDimension},iw)':-1`
      : width && height
        ? `scale=${width}:${height}`
        : width
          ? `scale=${width}:-1`
          : height
            ? `scale=-1:${height}`
            : `scale='min(1080,iw)':-1`;
    await runProcess("ffmpeg", ["-y", "-i", source, "-vf", vf, output], { timeoutMs: context.timeoutMs });
  }

  await access(output);
  return { path: output, source };
}

export async function lumaToAlpha(input, context) {
  if (!input?.path) throw new Error("image.luma_to_alpha requires with.path");
  const source = path.isAbsolute(input.path) ? input.path : context.resolvePath(input.path);
  const output = context.resolveRunPath(input.output ?? "media/doodle-alpha.png");
  if (path.resolve(source) === path.resolve(output)) throw new Error("image.luma_to_alpha source and output must differ");
  if (context.dryRun) return { path: output, image: output, source, engine: "core-image-luminance-alpha", dryRun: true };
  if (process.platform !== "darwin") throw new Error("image.luma_to_alpha requires macOS Core Image");
  await access(source);
  await mkdir(path.dirname(output), { recursive: true });
  const toolDir = path.join(context.runDir, ".tools");
  const executable = path.join(toolDir, "luma-to-alpha");
  await mkdir(toolDir, { recursive: true });
  try { await access(executable); }
  catch {
    context.log?.("Compiling lossless-edge doodle alpha helper…");
    await runProcess("xcrun", ["swiftc", "-O", "-framework", "CoreImage", "-framework", "CoreGraphics", LUMA_ALPHA_SOURCE, "-o", executable], {
      timeoutMs: Math.min(context.timeoutMs, 180_000)
    });
  }
  await runProcess(executable, [source, output], { timeoutMs: context.timeoutMs });
  const [sourceIdentity, outputIdentity] = await Promise.all([fileIdentity(source), fileIdentity(output)]);
  return { path: output, image: output, source, engine: "core-image-luminance-alpha", sourceIdentity, outputIdentity };
}

export async function composeCoverTitle(input, context) {
  const rawImage = input?.image ?? input?.path;
  if (typeof rawImage !== "string" || !rawImage.trim()) throw new Error("graphics.cover_title requires with.image");
  if (typeof input?.title !== "string" || !input.title.trim()) throw new Error("graphics.cover_title requires a non-empty with.title");
  if (typeof input?.output !== "string" || !input.output.trim()) throw new Error("graphics.cover_title requires with.output");
  const source = path.isAbsolute(rawImage) ? rawImage : context.resolvePath(rawImage);
  const output = context.resolveRunPath(input.output);
  if (path.resolve(source) === path.resolve(output)) throw new Error("graphics.cover_title source and output must differ");
  const text = {
    eyebrow: cleanText(input.eyebrow ?? "อาจารย์ตัวอย่างดีเด่น · ประจำปี 2569", "graphics.cover_title eyebrow", 120),
    title: cleanText(input.title, "graphics.cover_title title", 240),
    subtitle: cleanText(input.subtitle ?? "มหาวิทยาลัยสงขลานครินทร์", "graphics.cover_title subtitle", 240)
  };
  if (context.dryRun) return { image: output, path: output, source, text, engine: "appkit-coretext", dryRun: true };
  if (process.platform !== "darwin") throw new Error("graphics.cover_title requires macOS AppKit/CoreText");

  await access(source);
  await mkdir(path.dirname(output), { recursive: true });
  const toolDir = path.join(context.runDir, ".tools");
  const executable = path.join(toolDir, "cover-title-compositor");
  await mkdir(toolDir, { recursive: true });
  try { await access(executable); }
  catch {
    context.log?.("Compiling deterministic cover title compositor…");
    await runProcess("xcrun", ["swiftc", "-O", "-framework", "AppKit", COVER_TITLE_SOURCE, "-o", executable], {
      timeoutMs: Math.min(context.timeoutMs, 180_000)
    });
  }
  const configPath = path.join(context.stepDir, "cover-title.json");
  await mkdir(context.stepDir, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(text, null, 2)}\n`, { mode: 0o600 });
  await runProcess(executable, [source, output, configPath], { timeoutMs: context.timeoutMs });
  const [sourceIdentity, outputIdentity] = await Promise.all([fileIdentity(source), fileIdentity(output)]);
  return {
    image: output,
    path: output,
    source,
    text,
    engine: "appkit-coretext",
    sourceIdentity,
    outputIdentity,
    configPath
  };
}

function cleanText(value, label, maxLength) {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const clean = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length > maxLength) throw new Error(`${label} exceeds ${maxLength} characters`);
  return clean;
}

async function fileIdentity(filePath) {
  const before = await stat(filePath);
  if (!before.isFile() || before.size <= 0) throw new Error(`Image is missing or empty: ${filePath}`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  const after = await stat(filePath);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new Error(`Image changed while hashing: ${filePath}`);
  }
  return { path: filePath, sha256: hash.digest("hex"), sizeBytes: after.size };
}
