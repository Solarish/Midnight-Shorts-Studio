import { access, readdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

export interface FsEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  mtime?: string;
  ext?: string;
}

export interface FsBookmark {
  id: string;
  name: string;
  path: string;
  category: "nas" | "project" | "system";
  exists: boolean;
}

export interface FsBrowseResult {
  currentPath: string;
  parentPath: string | null;
  breadcrumbs: Array<{ name: string; path: string }>;
  bookmarks: FsBookmark[];
  entries: FsEntry[];
  exists: boolean;
  accessible: boolean;
  totalEntries: number;
}

export interface DocxSegmentSummary {
  id: string;
  sourceKey: string;
  sourceInMs: number;
  sourceOutMs: number;
  durationMs: number;
  dialogue: string;
  picture: string;
  sound: string;
  rowIndex: number;
}

export interface DocxCardSummary {
  id: string;
  picture: string;
  sound: string;
  rowIndex: number;
}

export interface DocxPreviewResult {
  ok: boolean;
  path: string;
  error?: string;
  segmentCount: number;
  cardCount: number;
  totalDialogueMs: number;
  totalDialogueFormatted: string;
  segments: DocxSegmentSummary[];
  cards: DocxCardSummary[];
}

export async function safeResolvePath(inputPath: string, projectRoot: string = process.cwd()): Promise<string> {
  if (!inputPath) return projectRoot;

  // 1. Direct check
  const candidate1 = path.isAbsolute(inputPath) ? inputPath : path.resolve(projectRoot, inputPath);
  try {
    await access(candidate1);
    return candidate1;
  } catch {}

  // 2. Trailing space variants
  try {
    await access(candidate1 + " ");
    return candidate1 + " ";
  } catch {}

  try {
    await access(candidate1.trim());
    return candidate1.trim();
  } catch {}

  // 3. Segment-by-segment resolver (fuzzy matches trailing spaces in folder names on macOS / NAS)
  if (path.isAbsolute(inputPath)) {
    const segments = inputPath.split("/").filter(Boolean);
    let current = "/";
    let allMatched = true;
    for (const seg of segments) {
      try {
        const subentries = await readdir(current);
        const match = subentries.find((e) => e === seg || e.trim() === seg.trim());
        if (match) {
          current = current === "/" ? `/${match}` : `${current}/${match}`;
        } else {
          allMatched = false;
          current = current === "/" ? `/${seg}` : `${current}/${seg}`;
        }
      } catch {
        allMatched = false;
        current = current === "/" ? `/${seg}` : `${current}/${seg}`;
      }
    }
    if (allMatched) {
      try {
        await access(current);
        return current;
      } catch {}
    }
  }

  return candidate1;
}

export async function getNasBookmarks(projectRoot: string): Promise<FsBookmark[]> {
  const candidateBookmarks: Array<{ id: string; name: string; path: string; category: "nas" | "project" | "system" }> = [
    {
      id: "nas-kewalin",
      name: "📁 NAS: 1.รศ.ดร.ทพญ.เกวลิน (ปี 69)",
      path: "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ ",
      category: "nas"
    },
    {
      id: "nas-teacher69",
      name: "📁 NAS: อาจารย์ตัวอย่าง 69",
      path: "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69",
      category: "nas"
    },
    {
      id: "nas-broadcast-root",
      name: "📁 NAS: ภาควีดีทัศน์",
      path: "/Volumes/ภาควีดีทัศน์",
      category: "nas"
    },
    {
      id: "nas-volumes-root",
      name: "📁 /Volumes (All NAS Mounts)",
      path: "/Volumes",
      category: "nas"
    },
    {
      id: "project-assets-input",
      name: "📁 Local Assets: assets/input",
      path: path.join(projectRoot, "assets/input"),
      category: "project"
    },
    {
      id: "project-root",
      name: "📁 AVA Project Root",
      path: projectRoot,
      category: "project"
    }
  ];

  const results: FsBookmark[] = [];
  for (const item of candidateBookmarks) {
    let resolved = await safeResolvePath(item.path, projectRoot);
    let exists = false;
    try {
      await access(resolved);
      exists = true;
    } catch {
      exists = false;
    }
    results.push({ ...item, path: resolved, exists });
  }
  return results;
}

export async function browseDirectory(
  targetPath?: string,
  filter?: string,
  projectRoot: string = process.cwd()
): Promise<FsBrowseResult> {
  const bookmarks = await getNasBookmarks(projectRoot);

  let candidate = targetPath ?? "";
  if (!candidate) {
    const firstActive = bookmarks.find((b) => b.exists && b.category === "nas") || bookmarks.find((b) => b.exists) || { path: projectRoot };
    candidate = firstActive.path;
  }

  const resolvedPath = await safeResolvePath(candidate, projectRoot);

  let exists = false;
  let accessible = false;
  let isDir = false;

  try {
    const fileStat = await stat(resolvedPath);
    exists = true;
    accessible = true;
    isDir = fileStat.isDirectory();
  } catch {
    exists = false;
    accessible = false;
  }

  const breadcrumbs = buildBreadcrumbs(resolvedPath);
  const parentPath = resolvedPath === "/" || resolvedPath === path.parse(resolvedPath).root
    ? null
    : path.dirname(resolvedPath);

  if (!exists || !isDir) {
    return {
      currentPath: resolvedPath,
      parentPath,
      breadcrumbs,
      bookmarks,
      entries: [],
      exists,
      accessible,
      totalEntries: 0
    };
  }

  const entries: FsEntry[] = [];
  try {
    const dirEntries = await readdir(resolvedPath, { withFileTypes: true });
    const allowedExts = filter
      ? filter.split(",").map((ext) => ext.trim().toLowerCase()).filter(Boolean)
      : [];

    for (const entry of dirEntries) {
      if (entry.name.startsWith(".") && entry.name !== ".ava-cache") {
        continue;
      }

      const fullEntryPath = path.join(resolvedPath, entry.name);
      const isDirectory = entry.isDirectory();
      const ext = path.extname(entry.name).toLowerCase();

      if (!isDirectory && allowedExts.length > 0) {
        const matches = allowedExts.some((allowed) => {
          if (allowed.startsWith(".")) return ext === allowed;
          return ext === `.${allowed}` || entry.name.toLowerCase().includes(allowed);
        });
        if (!matches) continue;
      }

      let size: number | undefined;
      let mtime: string | undefined;
      try {
        const entryStat = await stat(fullEntryPath);
        size = entryStat.size;
        mtime = entryStat.mtime.toISOString();
      } catch {
        // Ignore stat errors for symlinks or permission-denied entries
      }

      entries.push({
        name: entry.name,
        path: fullEntryPath,
        isDirectory,
        size,
        mtime,
        ext: isDirectory ? undefined : ext
      });
    }

    // Sort: directories first (locale-aware), then files
    entries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, "th", { numeric: true, sensitivity: "base" });
    });
  } catch {
    accessible = false;
  }

  return {
    currentPath: resolvedPath,
    parentPath,
    breadcrumbs,
    bookmarks,
    entries,
    exists,
    accessible,
    totalEntries: entries.length
  };
}

export async function validateFsPath(
  targetPath: string,
  projectRoot: string = process.cwd()
): Promise<{
  exists: boolean;
  path: string;
  normalizedPath: string;
  isDirectory: boolean;
  isFile: boolean;
  sizeBytes?: number;
  mtime?: string;
  ext?: string;
}> {
  const normalizedPath = await safeResolvePath(targetPath, projectRoot);

  try {
    const fileStat = await stat(normalizedPath);
    return {
      exists: true,
      path: targetPath,
      normalizedPath,
      isDirectory: fileStat.isDirectory(),
      isFile: fileStat.isFile(),
      sizeBytes: fileStat.size,
      mtime: fileStat.mtime.toISOString(),
      ext: path.extname(normalizedPath).toLowerCase()
    };
  } catch {
    return {
      exists: false,
      path: targetPath,
      normalizedPath,
      isDirectory: false,
      isFile: false
    };
  }
}

export async function previewDocxStoryboard(
  targetPath: string,
  projectRoot: string = process.cwd(),
  timeoutMs: number = 15000
): Promise<DocxPreviewResult> {
  const resolved = await safeResolvePath(targetPath, projectRoot);

  try {
    await access(resolved);
  } catch {
    return {
      ok: false,
      path: resolved,
      error: `ไม่พบไฟล์ DOCX ที่พาธ: ${resolved}`,
      segmentCount: 0,
      cardCount: 0,
      totalDialogueMs: 0,
      totalDialogueFormatted: "00:00",
      segments: [],
      cards: []
    };
  }

  try {
    const xml = await capture("unzip", ["-p", resolved, "word/document.xml"], timeoutMs);
    const rows = [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((match) =>
      [...match[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((cell) => xmlText(cell[0]))
    );

    const segments: DocxSegmentSummary[] = [];
    const cards: DocxCardSummary[] = [];
    let carriedSource = "";

    for (const [rowIndex, cells] of rows.entries()) {
      const picture = cells[0] ?? "";
      const sound = cells[1] ?? "";
      let combined = `${picture} ${sound}`.replace(/\u00a0/g, " ");

      // Normalize clip IDs like "C 7724" -> "C7724"
      combined = combined.replace(/\bC\s*(\d{4})\b/gi, "C$1");
      // Normalize timecodes like "05. 24" or "00.25" -> "00:25"
      combined = combined.replace(/(\d{1,2})\s*[.:]\s*(\d{2})/g, "$1:$2");
      const clipMatch = combined.match(/\bC\s*(\d{4})\b/i);
      if (clipMatch) carriedSource = clipMatch[0].replace(/\s+/g, "").toUpperCase();

      const pattern = /(?:(C\d{4})\s*)?(\d{1,2}):(\d{2})\s*(?:[-–—]|\s+)\s*(\d{1,2}):(\d{2})/gi;
      const matches = [...combined.matchAll(pattern)];

      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        if (!match) continue;
        const [fullMatch = "", clipId, inMin = "0", inSecStr = "0", outMin = "0", outSecStr = "0"] = match;
        if (clipId) carriedSource = clipId.toUpperCase();
        const inSec = Number(inMin) * 60 + Number(inSecStr);
        const outSec = Number(outMin) * 60 + Number(outSecStr);

        if (carriedSource && outSec > inSec) {
          const matchIndex = match.index ?? 0;
          const startIndex = matchIndex + fullMatch.length;
          const nextMatch = i + 1 < matches.length ? matches[i + 1] : undefined;
          const endIndex = nextMatch && nextMatch.index !== undefined ? nextMatch.index : combined.length;
          const dialogue = combined.slice(startIndex, endIndex).trim();

          segments.push({
            id: `interview_${String(segments.length + 1).padStart(2, "0")}`,
            sourceKey: carriedSource,
            sourceInMs: inSec * 1000,
            sourceOutMs: outSec * 1000,
            durationMs: (outSec - inSec) * 1000,
            dialogue,
            picture,
            sound,
            rowIndex
          });
        }
      }

      if (matches.length === 0 && (picture || sound)) {
        const joined = `${picture} ${sound}`.trim();
        if (/logo|พิชัยมงกุฏ|ความรู้สึก|youtube|envato|ปก/i.test(joined)) {
          cards.push({ id: `card_${cards.length + 1}`, picture, sound, rowIndex });
        }
      }
    }

    const totalDialogueMs = segments.reduce((sum, item) => sum + item.durationMs, 0);
    const totalSeconds = Math.floor(totalDialogueMs / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")} นาที`;

    return {
      ok: true,
      path: resolved,
      segmentCount: segments.length,
      cardCount: cards.length,
      totalDialogueMs,
      totalDialogueFormatted: formatted,
      segments,
      cards
    };
  } catch (error: any) {
    return {
      ok: false,
      path: resolved,
      error: `ไม่สามารถเปิดหรือแกะตารางจากไฟล์ DOCX: ${error?.message ?? error}`,
      segmentCount: 0,
      cardCount: 0,
      totalDialogueMs: 0,
      totalDialogueFormatted: "00:00",
      segments: [],
      cards: []
    };
  }
}

function buildBreadcrumbs(fullPath: string): Array<{ name: string; path: string }> {
  const parts = fullPath.split("/").filter(Boolean);
  const breadcrumbs: Array<{ name: string; path: string }> = [
    { name: "Root (/)", path: "/" }
  ];

  let accumulated = "";
  for (const part of parts) {
    accumulated = accumulated === "/" ? `/${part}` : `${accumulated}/${part}`;
    breadcrumbs.push({ name: part, path: accumulated });
  }
  return breadcrumbs;
}

function xmlText(value: string) {
  return value
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function capture(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} timed out`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(stdout) : reject(new Error(`${command} exited ${code}: ${stderr.trim()}`));
    });
  });
}
