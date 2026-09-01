import { access, readdir } from "node:fs/promises";
import path from "node:path";

export async function selectAsset(input, context) {
  if (!input.path) throw new Error("asset.select requires with.path");
  const absolutePath = context.resolvePath(input.path);
  if (!context.dryRun) await access(absolutePath);
  return { path: absolutePath };
}

export async function selectMultiAsset(input, context) {
  const paths = Array.isArray(input.paths) ? input.paths : (input.paths || input.path ? [input.paths || input.path] : []);
  if (paths.length === 0) throw new Error("asset.multi_select requires non-empty with.paths");
  const resolved = paths.map((p) => (path.isAbsolute(p) ? p : context.resolvePath(p)));
  if (!context.dryRun) {
    for (const p of resolved) await access(p);
  }
  return { mediaList: resolved, path: resolved, count: resolved.length };
}

export async function batchFolderAssets(input, context) {
  if (!input.folderPath) throw new Error("asset.batch_folder requires with.folderPath");
  const folder = path.isAbsolute(input.folderPath) ? input.folderPath : context.resolvePath(input.folderPath);
  if (context.dryRun) {
    return { mediaList: [folder], path: [folder], count: 1, dryRun: true };
  }
  await access(folder);
  const filterExts = input.filter
    ? input.filter.split(",").map((ext) => ext.trim().toLowerCase().replace(/^\*/, ""))
    : [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov"];
  
  const entries = await readdir(folder);
  const matched = entries
    .filter((file) => filterExts.some((ext) => file.toLowerCase().endsWith(ext)))
    .sort()
    .map((file) => path.join(folder, file));
  
  return { mediaList: matched, path: matched, count: matched.length };
}

export async function templatePayload(input) {
  return structuredClone(input);
}


