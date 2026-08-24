import { access } from "node:fs/promises";

export async function selectAsset(input, context) {
  if (!input.path) throw new Error("asset.select requires with.path");
  const absolutePath = context.resolvePath(input.path);
  if (!context.dryRun) await access(absolutePath);
  return { path: absolutePath };
}

export async function templatePayload(input) {
  return structuredClone(input);
}

