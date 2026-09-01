import { createHash } from "node:crypto";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

export interface ArtifactInfo {
  artifactId: string;
  name: string;
  relativePath: string;
  size: number;
  mediaType: string;
  kind: "image" | "video" | "adobe" | "json" | "log" | "other";
}

export async function listArtifacts(runDir: string): Promise<ArtifactInfo[]> {
  const root = await realpath(runDir);
  const files = await walk(root);
  const result: ArtifactInfo[] = [];
  for (const file of files) {
    const relativePath = path.relative(root, file);
    if (relativePath.startsWith(".tools/") || relativePath.endsWith(".tmp")) continue;
    const info = await stat(file);
    const extension = path.extname(file).toLowerCase();
    const { mediaType, kind } = classify(extension);
    result.push({
      artifactId: createHash("sha256").update(relativePath).digest("hex").slice(0, 20),
      name: path.basename(file),
      relativePath,
      size: info.size,
      mediaType,
      kind
    });
  }
  return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export async function resolveArtifact(runDir: string, artifactId: string) {
  const root = await realpath(runDir);
  const artifact = (await listArtifacts(root)).find((entry) => entry.artifactId === artifactId);
  if (!artifact) throw Object.assign(new Error("Artifact not found"), { statusCode: 404 });
  const target = await realpath(path.join(root, artifact.relativePath));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw Object.assign(new Error("Artifact escaped the run root"), { statusCode: 403 });
  return { artifact, target };
}

async function walk(directory: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    const details = await lstat(target);
    if (details.isSymbolicLink()) continue;
    if (details.isDirectory()) output.push(...await walk(target));
    else if (details.isFile()) output.push(target);
  }
  return output;
}

function classify(extension: string): { mediaType: string; kind: ArtifactInfo["kind"] } {
  const table: Record<string, [string, ArtifactInfo["kind"]]> = {
    ".png": ["image/png", "image"], ".jpg": ["image/jpeg", "image"], ".jpeg": ["image/jpeg", "image"], ".webp": ["image/webp", "image"],
    ".mp4": ["video/mp4", "video"], ".mov": ["video/quicktime", "video"],
    ".aep": ["application/octet-stream", "adobe"], ".prproj": ["application/octet-stream", "adobe"],
    ".json": ["application/json", "json"], ".log": ["text/plain", "log"], ".txt": ["text/plain", "log"]
  };
  const [mediaType, kind] = table[extension] ?? ["application/octet-stream", "other"];
  return { mediaType, kind };
}
