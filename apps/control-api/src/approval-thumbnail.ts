import path from "node:path";
import { realpath, stat } from "node:fs/promises";

export interface ResolveApprovalThumbnailOptions {
  projectRoot: string;
  runDir: string;
  approvalKind?: string;
  thumbnailPath: string;
}

export interface ResolvedThumbnail {
  target: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
}

const SUPPORTED_EXTENSIONS: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

export async function resolveApprovalThumbnailPath({
  projectRoot,
  runDir,
  approvalKind,
  thumbnailPath
}: ResolveApprovalThumbnailOptions): Promise<ResolvedThumbnail> {
  if (typeof thumbnailPath !== "string" || !thumbnailPath.trim()) {
    throw Object.assign(new Error("Thumbnail path is missing or empty"), { statusCode: 404 });
  }

  const ext = path.extname(thumbnailPath).toLowerCase();
  const contentType = SUPPORTED_EXTENSIONS[ext];
  if (!contentType) {
    throw Object.assign(new Error(`Unsupported thumbnail image extension '${ext}'`), { statusCode: 403 });
  }

  let target: string;
  try {
    target = await realpath(thumbnailPath);
  } catch {
    throw Object.assign(new Error("Thumbnail file not found"), { statusCode: 404 });
  }

  const fileStat = await stat(target);
  if (!fileStat.isFile() || fileStat.size === 0) {
    throw Object.assign(new Error("Thumbnail target is not a valid regular file"), { statusCode: 404 });
  }

  if (approvalKind === "cover_card") {
    const allowedRoots: string[] = [];
    try {
      allowedRoots.push(await realpath(runDir));
    } catch (_) {}
    try {
      allowedRoots.push(await realpath(path.join(projectRoot, ".ava-cache", "comfyui")));
    } catch (_) {}

    const isInside = allowedRoots.some((root) => {
      const rel = path.relative(root, target);
      return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    });

    if (!isInside) {
      throw Object.assign(new Error("Cover thumbnail is outside allowed run or cache directories"), { statusCode: 403 });
    }
  } else {
    let brollRoot: string;
    try {
      brollRoot = await realpath(path.join(projectRoot, ".ava-cache", "broll-thumbs"));
    } catch {
      throw Object.assign(new Error("B-roll thumbnail cache directory not found"), { statusCode: 403 });
    }

    const rel = path.relative(brollRoot, target);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw Object.assign(new Error("Thumbnail is outside the approved B-roll cache"), { statusCode: 403 });
    }
  }

  return { target, contentType };
}
