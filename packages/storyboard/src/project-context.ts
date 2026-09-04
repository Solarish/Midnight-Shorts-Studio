import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";

export type ProjectMediaCandidate = {
  path: string;
  name: string;
  stem: string;
  kind: "video" | "image";
};

export type ProjectContext = {
  projectDir: string;
  docxPath: string;
  brollPoolDirs: string[];
  photoDirs: string[];
  candidateBrolls: ProjectMediaCandidate[];
  portraitImages: Array<{ path: string; name: string }>;
};

const BROLL_DIR_CANDIDATES = [
  "Ins",
  "Insจาก อ.",
  "Insจากอาจารย์",
  "B-roll",
  "Broll",
  "B-Roll",
  "Insert",
  "Footage",
  "Video"
];

const PHOTO_DIR_CANDIDATES = [
  "ภาพนิ่ง",
  "Photos",
  "Photo",
  "Still",
  "Stills",
  "Portrait",
  "Portraits"
];

const VIDEO_EXT = /\.(mp4|mov|mxf|avi|m4v)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|tiff?)$/i;

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const s = await stat(dirPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export async function resolveBrollPoolDirs(projectDir: string, overrides: string[] = []): Promise<string[]> {
  const resolved = new Set<string>();

  // Add explicit manual overrides first if valid
  for (const o of overrides) {
    if (o && (await dirExists(o))) resolved.add(path.resolve(o));
  }

  // Scan projectDir for standard convention folders
  for (const sub of BROLL_DIR_CANDIDATES) {
    const candidate = path.join(projectDir, sub);
    if (await dirExists(candidate)) {
      resolved.add(candidate);
    }
  }

  // If no convention subfolder exists, fallback to projectDir itself
  if (resolved.size === 0 && (await dirExists(projectDir))) {
    resolved.add(projectDir);
  }

  return Array.from(resolved);
}

export async function resolvePhotoDirs(projectDir: string, overrides: string[] = []): Promise<string[]> {
  const resolved = new Set<string>();

  for (const o of overrides) {
    if (o && (await dirExists(o))) resolved.add(path.resolve(o));
  }

  for (const sub of PHOTO_DIR_CANDIDATES) {
    const candidate = path.join(projectDir, sub);
    if (await dirExists(candidate)) {
      resolved.add(candidate);
    }
  }

  if (resolved.size === 0 && (await dirExists(projectDir))) {
    resolved.add(projectDir);
  }

  return Array.from(resolved);
}

export async function findCandidateBrolls(brollDirs: string[]): Promise<ProjectMediaCandidate[]> {
  const candidates: ProjectMediaCandidate[] = [];
  const seenPaths = new Set<string>();

  for (const dir of brollDirs) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (entry.name.startsWith(".")) continue;

        const isVideo = VIDEO_EXT.test(entry.name);
        const isImage = IMAGE_EXT.test(entry.name);

        if (isVideo || isImage) {
          const fullPath = path.join(dir, entry.name);
          if (!seenPaths.has(fullPath)) {
            seenPaths.add(fullPath);
            candidates.push({
              path: fullPath,
              name: entry.name,
              stem: entry.name.replace(/\.[^/.]+$/, ""),
              kind: isVideo ? "video" : "image"
            });
          }
        }
      }
    } catch {}
  }

  return candidates;
}

export async function findPortraitImages(photoDirs: string[]): Promise<Array<{ path: string; name: string }>> {
  const photos: Array<{ path: string; name: string }> = [];
  const seenPaths = new Set<string>();

  for (const dir of photoDirs) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (entry.name.startsWith(".")) continue;

        if (IMAGE_EXT.test(entry.name)) {
          const fullPath = path.join(dir, entry.name);
          if (!seenPaths.has(fullPath)) {
            seenPaths.add(fullPath);
            photos.push({
              path: fullPath,
              name: entry.name
            });
          }
        }
      }
    } catch {}
  }

  // Sort photos predictably (e.g. by filename)
  return photos.sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveProjectContext(
  docxPath: string,
  manualOverrides?: { brollDirs?: string[]; photoDirs?: string[] }
): Promise<ProjectContext> {
  const projectDir = path.dirname(path.resolve(docxPath));

  const brollPoolDirs = await resolveBrollPoolDirs(projectDir, manualOverrides?.brollDirs);
  const photoDirs = await resolvePhotoDirs(projectDir, manualOverrides?.photoDirs);

  const [candidateBrolls, portraitImages] = await Promise.all([
    findCandidateBrolls(brollPoolDirs),
    findPortraitImages(photoDirs)
  ]);

  return {
    projectDir,
    docxPath,
    brollPoolDirs,
    photoDirs,
    candidateBrolls,
    portraitImages
  };
}
