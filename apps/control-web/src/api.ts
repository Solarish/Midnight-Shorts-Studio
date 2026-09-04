export type Readiness = { ready: boolean; checkedAt: string; expiresAt: string; checks: Array<{ id: string; name: string; category: "system" | "after-effects" | "premiere" | "ai"; ok: boolean; blocking: boolean; detail?: string; remediation: string }> };
export type Asset = { assetId: string; projectPath: string; originalName: string; mimeType: string; width: number; height: number; previewUrl: string };
export type Manifest = { manifestVersion: 1; recipeId: "portrait-story-v1"; id: string; projectName: string; presenterAsset?: Asset; headline: string; subheadline: string; backgroundBrief: string };
export type RunStep = { id: string; label: string; type: string; status: string; attempts: number; startedAt?: string; finishedAt?: string; error?: string; outputs?: Record<string, unknown> };
export type TrialPreset = { presetId: string; presenterAsset: Asset; form: { projectName: string; headline: string; subheadline: string; backgroundBrief: string } };
export type Verification = { status: "passed" | "failed" | "error"; passed: number; failed: number; total: number; verifiedAt: string; error?: string };
export type RunProgress = { completed: number; total: number; percent: number };
export type Run = { runId: string; projectName: string; recipeId: string; status: string; dryRun: boolean; workflowDigest: string; createdAt: string; updatedAt: string; startedAt?: string; finishedAt?: string; error?: string; errorCode?: string; unsafeToResume?: boolean; artifactError?: string; eventError?: string; dataError?: string; verification?: Verification; resumable: boolean; approval?: any; stoppedAtStep?: string; progress: RunProgress; steps: RunStep[] };
export type Artifact = { artifactId: string; name: string; relativePath: string; size: number; mediaType: string; kind: string };

let csrfToken = "";

export async function getHealth(): Promise<{ ok: boolean; readiness: Readiness }> {
  const response = await fetch("/api/v1/health");
  const value = await response.json();
  csrfToken = value.csrfToken;
  return value;
}

export async function getReadiness(): Promise<Readiness> {
  return api<Readiness>("/api/v1/readiness");
}

export function isReadinessFresh(readiness: Readiness | undefined, nowMs = Date.now()) {
  const expiresAt = Date.parse(readiness?.expiresAt ?? "");
  return readiness?.ready === true && Number.isFinite(expiresAt) && expiresAt > nowMs;
}

export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  if (!csrfToken && options.method && options.method !== "GET") await getHealth();
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
  if (options.method && options.method !== "GET") headers.set("x-ava-csrf", csrfToken);
  const response = await fetch(url, { ...options, headers });
  const value = await response.json().catch(() => ({}));

  if (response.status === 403 && typeof value.error === "string" && value.error.toLowerCase().includes("csrf")) {
    await getHealth();
    headers.set("x-ava-csrf", csrfToken);
    const retryResponse = await fetch(url, { ...options, headers });
    const retryValue = await retryResponse.json().catch(() => ({}));
    if (!retryResponse.ok) {
      throw Object.assign(new Error(retryValue.error ?? `Request failed with HTTP ${retryResponse.status}`), {
        status: retryResponse.status,
        details: retryValue
      });
    }
    return retryValue;
  }

  if (!response.ok) throw Object.assign(new Error(value.error ?? `Request failed with HTTP ${response.status}`), { status: response.status, details: value });
  return value;
}

export type FsEntry = { name: string; path: string; isDirectory: boolean; size?: number; mtime?: string; ext?: string };
export type FsBookmark = { id: string; name: string; path: string; category: "nas" | "project" | "system"; exists: boolean };
export type FsBrowseResult = { currentPath: string; parentPath: string | null; breadcrumbs: Array<{ name: string; path: string }>; bookmarks: FsBookmark[]; entries: FsEntry[]; exists: boolean; accessible: boolean; totalEntries: number };
export type FsValidateResult = { exists: boolean; path: string; normalizedPath: string; isDirectory: boolean; isFile: boolean; sizeBytes?: number; mtime?: string; ext?: string };
export type DocxSegmentSummary = { id: string; sourceKey: string; sourceInMs: number; sourceOutMs: number; durationMs: number; dialogue: string; picture: string; sound: string; rowIndex: number };
export type DocxCardSummary = { id: string; picture: string; sound: string; rowIndex: number };
export type DocxPreviewResult = {
  ok: boolean;
  path: string;
  error?: string;
  segmentCount: number;
  cardCount: number;
  totalDialogueMs: number;
  totalDialogueFormatted: string;
  brollPoolDirs?: string[];
  photoDirs?: string[];
  brollCount?: number;
  photoCount?: number;
  brollSamples?: string[];
  photoSamples?: string[];
  segments: DocxSegmentSummary[];
  cards: DocxCardSummary[];
};

export async function uploadAsset(file: File) {
  const body = new FormData();
  body.append("file", file);
  return api<Asset>("/api/v1/assets/import", { method: "POST", body });
}

export async function getNasBookmarks(): Promise<FsBookmark[]> {
  return api<FsBookmark[]>("/api/v1/fs/bookmarks");
}

export async function browseDirectory(targetPath?: string, filter?: string): Promise<FsBrowseResult> {
  const params = new URLSearchParams();
  if (targetPath) params.set("path", targetPath);
  if (filter) params.set("filter", filter);
  const qs = params.toString();
  return api<FsBrowseResult>(`/api/v1/fs/browse${qs ? `?${qs}` : ""}`);
}

export function mediaStreamUrl(filePath: string | undefined | null): string | undefined {
  if (!filePath?.trim()) return undefined;
  return `/api/v1/media/stream?path=${encodeURIComponent(filePath)}`;
}

export async function validateFsPath(targetPath: string): Promise<FsValidateResult> {
  return api<FsValidateResult>("/api/v1/fs/validate-path", {
    method: "POST",
    body: JSON.stringify({ path: targetPath })
  });
}

export async function previewDocx(targetPath: string): Promise<DocxPreviewResult> {
  return api<DocxPreviewResult>("/api/v1/fs/preview-docx", {
    method: "POST",
    body: JSON.stringify({ path: targetPath })
  });
}

export interface RenderDefaultsResult {
  defaultDirectory: string;
  defaultFileName: string;
  isDocxSource: boolean;
  docxPath: string | null;
}

export interface RenderJobStatus {
  jobId: string;
  storyboardId: string;
  version?: number;
  status: "queued" | "rendering" | "completed" | "failed";
  progress: number;
  renderedFrames: number;
  totalFrames: number;
  fps: number;
  etaSeconds?: number;
  startedAt: string;
  completedAt?: string;
  outputDirectory: string;
  fileName: string;
  outputPath?: string;
  fileUrl?: string;
  sizeBytes?: number;
  durationMs?: number;
  renderTimeMs?: number;
  error?: string;
}

export interface TriggerRenderOptions {
  version?: number;
  format?: "16:9" | "9:16";
  quality?: "master" | "draft";
  fps?: number;
  outputDirectory?: string;
  fileName?: string;
  bgmTrack?: any;
}

export async function getStoryboardRenderDefaults(storyboardId: string): Promise<RenderDefaultsResult> {
  return api<RenderDefaultsResult>(`/api/v1/storyboards/${encodeURIComponent(storyboardId)}/render-defaults`);
}

export async function triggerStoryboardRender(storyboardId: string, options: TriggerRenderOptions = {}): Promise<{ jobId: string; status: string; monitorUrl: string; outputDirectory: string; fileName: string }> {
  return api(`/api/v1/storyboards/${encodeURIComponent(storyboardId)}/render`, {
    method: "POST",
    body: JSON.stringify(options)
  });
}

export async function getStoryboardRenderJob(storyboardId: string, jobId: string): Promise<RenderJobStatus> {
  return api<RenderJobStatus>(`/api/v1/storyboards/${encodeURIComponent(storyboardId)}/render-jobs/${encodeURIComponent(jobId)}`);
}

