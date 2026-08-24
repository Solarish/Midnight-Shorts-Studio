import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess } from "../core/process.js";

const CUTOUT_SOURCE = fileURLToPath(new URL("../../tools/person-cutout.swift", import.meta.url));

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

