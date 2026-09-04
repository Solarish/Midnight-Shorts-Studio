import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import sharp from "sharp";
import type { PortraitStoryManifestV1 } from "@psu-ava/contracts";
import { validateWorkflowDocument } from "@psu-ava/contracts";
import { loadWorkflowText, workflowDigest } from "@psu-ava/core";
import { compilePortraitStory, instantiateStarterWorkflowPackage, portraitStoryRecipe, starterWorkflowPackages, validatePortraitStoryManifest } from "@psu-ava/recipes";
import { atomicWrite, LocalControlStore, LocalGraphStore, LocalStoryboardStore, LocalWorkflowSnapshotStore } from "@psu-ava/persistence-local";
import { compileGraphToWorkflow, nodeDescriptorRegistry } from "@psu-ava/node-sdk";
import { RunScheduler } from "./scheduler.js";
import { listArtifacts, resolveArtifact } from "./artifacts.js";
import { evaluateReadiness } from "./readiness.js";
import { ReadinessDiagnostics } from "./readiness-diagnostics.js";
import { listUiNodeDescriptors } from "./node-catalog.js";
import { VisualWorkflowService } from "./visual-workflows.js";
import { MEDIA_MAX_BYTES, persistUploadedMedia, supportedMediaTypes } from "./media-import.js";
import { browseDirectory, getNasBookmarks, previewDocxStoryboard, validateFsPath } from "./filesystem-service.js";
import { StoryboardService } from "./storyboards.js";
import { resolveApprovalThumbnailPath } from "./approval-thumbnail.js";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(process.env.AVA_PROJECT_ROOT ?? path.join(sourceDir, "../../.."));
const host = process.env.AVA_CONTROL_HOST ?? "127.0.0.1";
const port = Number(process.env.AVA_CONTROL_PORT ?? 47650);
if (!isLoopback(host)) throw new Error("AVA Control API refuses non-loopback binding");

const controlRoot = path.join(projectRoot, ".ava-control");
const assetRoot = path.join(projectRoot, "assets/input/ui");
const store = new LocalControlStore(controlRoot);
const graphStore = new LocalGraphStore(controlRoot);
const storyboardStore = new LocalStoryboardStore(controlRoot);
const workflowSnapshots = new LocalWorkflowSnapshotStore(controlRoot);
const visualWorkflows = new VisualWorkflowService(graphStore);
const storyboards = new StoryboardService(storyboardStore, projectRoot);
const scheduler = new RunScheduler(projectRoot, store);
const readinessDiagnostics = new ReadinessDiagnostics(path.join(controlRoot, "readiness-rejections.ndjson"));
const csrfToken = randomUUID();
const app = Fastify({
  forceCloseConnections: true,
  logger: { level: process.env.AVA_LOG_LEVEL ?? "info", redact: ["req.headers.authorization", "req.headers.cookie"] }
});
const activeEventStreams = new Set<() => void>();

const instanceLease = { release: async () => true };
await Promise.all([store.init(), graphStore.init(), storyboardStore.init(), workflowSnapshots.init(), mkdir(assetRoot, { recursive: true })]);
await scheduler.initialize();
await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
      cb(null, true);
      return;
    }
    cb(new Error("Not allowed by CORS"), false);
  },
  credentials: true,
  allowedHeaders: ["content-type", "x-ava-csrf", "last-event-id", "idempotency-key", "if-match"]
});
await app.register(multipart, { limits: { files: 1, fileSize: MEDIA_MAX_BYTES } });

app.addHook("onRequest", async (request, reply) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && request.url.startsWith("/api/v1/") && request.headers["x-ava-csrf"] !== csrfToken) {
    return reply.code(403).send({ error: "Missing or invalid CSRF token" });
  }
});

app.get("/api/v1/health", async () => ({ ok: true, version: "0.2.0", buildTimestamp: "2026-08-27 16:15:00", csrfToken, bind: `${host}:${port}` }));
app.get("/api/v1/system/status", async (_request, reply) => {
  const target = process.env.AVA_SYSTEM_STATUS_URL ?? "http://10.135.66.70:3001/admin/api/system";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(target, { signal: controller.signal, headers: { accept: "application/json" } });
    const body = await response.json().catch(() => undefined);
    if (!response.ok) return reply.code(502).send({ reachable: false, checkedAt: new Date().toISOString(), source: target, error: `System status HTTP ${response.status}` });
    return { reachable: true, checkedAt: new Date().toISOString(), source: target, data: body?.data ?? body };
  } catch (error) {
    return reply.code(502).send({ reachable: false, checkedAt: new Date().toISOString(), source: target, error: error instanceof Error ? error.message : "System status unavailable" });
  } finally {
    clearTimeout(timer);
  }
});
app.get("/api/v1/comfyui/status", async (_request, reply) => {
  const base = process.env.AVA_COMFYUI_URL ?? "http://10.135.66.70:8188";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const [statsResponse, queueResponse] = await Promise.all([
      fetch(`${base}/system_stats`, { signal: controller.signal }),
      fetch(`${base}/queue`, { signal: controller.signal })
    ]);
    if (!statsResponse.ok || !queueResponse.ok) return reply.code(502).send({ reachable: false, checkedAt: new Date().toISOString(), source: base, error: "ComfyUI status endpoint failed" });
    const stats = await statsResponse.json();
    const queue = await queueResponse.json();
    return { reachable: true, checkedAt: new Date().toISOString(), source: base, stats: stats.system ?? stats, devices: stats.devices ?? [], queue: { running: queue.queue_running ?? [], pending: queue.queue_pending ?? [] } };
  } catch (error) {
    return reply.code(502).send({ reachable: false, checkedAt: new Date().toISOString(), source: base, error: error instanceof Error ? error.message : "ComfyUI status unavailable" });
  } finally {
    clearTimeout(timer);
  }
});
app.get("/api/v1/readiness", async () => readiness());
app.get("/api/v1/diagnostics/readiness-rejections", async (request) => readinessDiagnostics.list(Number((request.query as any)?.limit ?? 20)));
app.get("/api/v1/recipes", async () => [portraitStoryRecipe]);
app.get("/api/v1/recipes/portrait-story-v1", async () => portraitStoryRecipe);
app.get("/api/v1/node-types", async () => listUiNodeDescriptors());
app.get("/api/v1/comfyui/workflows", async () => {
  const workflowsDir = path.resolve(process.cwd(), "workflows");
  try {
    const files = await readdir(workflowsDir);
    const results = [];
    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(workflowsDir, file);
        try {
          const content = JSON.parse(await readFile(filePath, "utf8"));
          const nodeCount = Object.keys(content).length;
          const latentNode = Object.values(content).find((n: any) => n?.class_type === "EmptyLatentImage") as any;
          results.push({
            id: file,
            path: `workflows/${file}`,
            name: file.replace(/\.api\.json$/, "").replace(/\.json$/, "").replace(/-/g, " "),
            nodeCount,
            defaultWidth: latentNode?.inputs?.width ?? 768,
            defaultHeight: latentNode?.inputs?.height ?? 1344
          });
        } catch {}
      }
    }
    return results;
  } catch {
    return [];
  }
});
app.get("/api/v1/fs/bookmarks", async () => getNasBookmarks(projectRoot));

const customDoodlesPath = path.join(controlRoot, "custom-doodles.json");

async function discoverGeneratedDoodles(root: string): Promise<Array<{ runId: string; image: string; word?: string; createdAt?: string }>> {
  const results: Array<{ runId: string; image: string; word?: string; createdAt?: string }> = [];
  const prototypeRunsDir = path.join(root, "prototype-runs");
  try {
    const entries = await readdir(prototypeRunsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory() && ent.name.startsWith("run_")) {
        const runId = ent.name;
        const candidate1 = path.join(prototypeRunsDir, runId, "media/doodle-alpha.png");
        try {
          await stat(candidate1);
          results.push({ runId, image: candidate1, word: "custom" });
          continue;
        } catch {}
        const coversDir = path.join(prototypeRunsDir, runId, "media/storyboard-covers");
        try {
          const coverEntries = await readdir(coversDir, { withFileTypes: true });
          for (const c of coverEntries) {
            if (c.isDirectory()) {
              const alphaPath = path.join(coversDir, c.name, "doodle-alpha.png");
              try {
                await stat(alphaPath);
                results.push({ runId: `${runId}_${c.name}`, image: alphaPath, word: c.name.replace(/^cover_/, "") });
              } catch {}
            }
          }
        } catch {}
      }
    }
  } catch {}
  return results;
}

app.get("/api/v1/doodles/custom", async () => {
  let existing: Array<{ id: string; word: string; image: string; slot?: number; createdAt?: string; category?: string }> = [];
  try {
    const content = await readFile(customDoodlesPath, "utf8");
    existing = JSON.parse(content);
  } catch {
    existing = [];
  }

  try {
    const discovered = await discoverGeneratedDoodles(projectRoot);
    const knownImages = new Set(existing.map((e) => e.image));
    let added = false;
    for (const d of discovered) {
      if (!knownImages.has(d.image)) {
        existing.push({
          id: `custom_${d.runId}`,
          word: d.word || "custom",
          image: d.image,
          slot: 25 + existing.length + 1,
          createdAt: d.createdAt || new Date().toISOString(),
          category: "custom"
        });
        knownImages.add(d.image);
        added = true;
      }
    }
    if (added) {
      await writeFile(customDoodlesPath, JSON.stringify(existing, null, 2), "utf8");
    }
  } catch {}

  return existing;
});

app.post("/api/v1/doodles/custom", async (request, reply) => {
  const body = (request.body ?? {}) as any;
  if (!body.image) {
    return reply.code(400).send({ error: "Missing doodle image path" });
  }
  let existing: any[] = [];
  try {
    const content = await readFile(customDoodlesPath, "utf8");
    existing = JSON.parse(content);
  } catch {
    existing = [];
  }
  const matchIndex = existing.findIndex((e) => e.image === body.image || e.id === body.id);
  const entry = {
    id: body.id || `custom_${Date.now()}`,
    word: body.word || "custom",
    image: body.image,
    slot: body.slot ?? (25 + existing.length + 1),
    createdAt: body.createdAt || new Date().toISOString(),
    category: body.category || "custom"
  };
  if (matchIndex >= 0) {
    existing[matchIndex] = { ...existing[matchIndex], ...entry };
  } else {
    existing.unshift(entry);
  }
  await writeFile(customDoodlesPath, JSON.stringify(existing, null, 2), "utf8");
  return reply.code(200).send(existing);
});

app.delete("/api/v1/doodles/custom/:id", async (request, reply) => {
  const { id } = (request.params ?? {}) as { id: string };
  let existing: any[] = [];
  try {
    const content = await readFile(customDoodlesPath, "utf8");
    existing = JSON.parse(content);
  } catch {
    existing = [];
  }
  const filtered = existing.filter((e) => e.id !== id && e.image !== id);
  await writeFile(customDoodlesPath, JSON.stringify(filtered, null, 2), "utf8");
  return reply.code(200).send(filtered);
});

app.delete("/api/v1/doodles/custom", async (request, reply) => {
  const body = (request.body ?? {}) as any;
  const target = body.id || body.image;
  let existing: any[] = [];
  try {
    const content = await readFile(customDoodlesPath, "utf8");
    existing = JSON.parse(content);
  } catch {
    existing = [];
  }
  const filtered = target ? existing.filter((e) => e.id !== target && e.image !== target) : [];
  await writeFile(customDoodlesPath, JSON.stringify(filtered, null, 2), "utf8");
  return reply.code(200).send(filtered);
});
app.get("/api/v1/fs/browse", async (request) => {
  const query = (request.query ?? {}) as any;
  return browseDirectory(query.path, query.filter, projectRoot);
});
app.post("/api/v1/fs/validate-path", async (request) => {
  const body = (request.body ?? {}) as any;
  return validateFsPath(body.path ?? "", projectRoot);
});
app.post("/api/v1/fs/preview-docx", async (request) => {
  const body = (request.body ?? {}) as any;
  return previewDocxStoryboard(body.path ?? "", projectRoot);
});
app.post("/api/v1/storyboard-imports/docx", async (request, reply) => reply.code(201).send(await storyboards.importDocx((request.body ?? {}) as any)));
app.get("/api/v1/storyboard-imports/:importId", async (request) => storyboards.getImport((request.params as any).importId));
app.get("/api/v1/storyboards", async () => storyboards.list());
app.post("/api/v1/storyboards", async (request, reply) => reply.code(201).send(await storyboards.create((request.body ?? {}) as any)));
app.get("/api/v1/storyboards/:storyboardId", async (request) => storyboards.get((request.params as any).storyboardId));
app.delete("/api/v1/storyboards/:storyboardId", async (request) => storyboards.delete((request.params as any).storyboardId));
app.post("/api/v1/storyboards/:storyboardId/clone", async (request, reply) => reply.code(201).send(await storyboards.clone((request.params as any).storyboardId, request.body as any)));
app.post("/api/v1/storyboards/:storyboardId/resync-docx", async (request) => storyboards.resyncDocx((request.params as any).storyboardId));
app.patch("/api/v1/storyboards/:storyboardId", async (request) => storyboards.update(
  (request.params as any).storyboardId,
  request.body as any,
  typeof request.headers["if-match"] === "string" ? request.headers["if-match"] : undefined
));
app.post("/api/v1/storyboards/:storyboardId/validate", async (request, reply) => {
  const result = await storyboards.validate((request.params as any).storyboardId);
  return result.valid ? result : reply.code(422).send(result);
});
app.post("/api/v1/storyboards/:storyboardId/approve-and-compile", async (request) => storyboards.approveAndCompile(
  (request.params as any).storyboardId,
  (request.body as any)?.expectedRevision ?? request.headers["if-match"]
));
app.get("/api/v1/storyboards/:storyboardId/versions/:version", async (request) => storyboards.getVersion((request.params as any).storyboardId, Number((request.params as any).version)));
app.get("/api/v1/storyboards/:storyboardId/versions/:version/compiled", async (request) => storyboards.getCompilation((request.params as any).storyboardId, Number((request.params as any).version)));
app.post("/api/v1/storyboards/:storyboardId/versions/:version/execution-graph", async (request) => storyboards.createExecutionGraph(
  (request.params as any).storyboardId,
  Number((request.params as any).version),
  request.body as any
));

app.post("/api/v1/storyboards/:storyboardId/items/:itemId/auto-broll", async (request) => {
  let { storyboardId, itemId } = request.params as any;
  if (storyboardId === "current") {
    const list = await storyboards.list();
    if (list.length > 0) storyboardId = list[0]!.storyboardId;
  }
  const body = (request.body as any) ?? {};
  return storyboards.generateAutoBroll(storyboardId, itemId, body);
});

app.post("/api/v1/storyboards/:storyboardId/auto-broll-all", async (request) => {
  let { storyboardId } = request.params as any;
  if (storyboardId === "current") {
    const list = await storyboards.list();
    if (list.length > 0) storyboardId = list[0]!.storyboardId;
  }
  const body = (request.body as any) ?? {};
  return storyboards.generateAutoBrollBatch(storyboardId, body);
});

app.post("/api/v1/storyboards/:storyboardId/full-auto", async (request) => {
  let { storyboardId } = request.params as any;
  if (storyboardId === "current") {
    const list = await storyboards.list();
    if (list.length > 0) storyboardId = list[0]!.storyboardId;
  }
  const body = (request.body as any) ?? {};
  return storyboards.fullAutoStoryboard(storyboardId, body);
});

app.post("/api/v1/storyboards/:storyboardId/auto-lowerthird", async (request) => {
  let { storyboardId } = request.params as any;
  if (storyboardId === "current") {
    const list = await storyboards.list();
    if (list.length > 0) storyboardId = list[0]!.storyboardId;
  }
  return storyboards.autoLowerThirdBatch(storyboardId);
});

app.post("/api/v1/storyboards/:storyboardId/auto-generate-assets", async (request) => {
  let { storyboardId } = request.params as any;
  if (storyboardId === "current") {
    const list = await storyboards.list();
    if (list.length > 0) storyboardId = list[0]!.storyboardId;
  }
  return storyboards.autoGenerateAssets(storyboardId);
});

interface StoryboardRenderJob {
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

const storyboardRenderJobs = new Map<string, StoryboardRenderJob>();

function resolveStoryboardExportDefaults(storyboard: any, rootDir: string) {
  const docxPath = storyboard.sourceImport?.docxPath;
  let defaultDir = "";
  let isDocxSource = false;

  if (typeof docxPath === "string" && docxPath.trim()) {
    try {
      const parentDir = path.dirname(docxPath.trim());
      defaultDir = path.join(parentDir, "Export");
      isDocxSource = true;
    } catch {
      defaultDir = path.join(rootDir, "outputs/rendered");
    }
  } else {
    defaultDir = path.join(rootDir, "outputs/rendered");
  }

  const rawName = (storyboard.name || "storyboard").trim();
  const safeName = rawName.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_");
  const versionSuffix = storyboard.approvedVersion ? `_v${storyboard.approvedVersion}` : `_v${storyboard.revision || 1}`;
  const defaultFileName = `${safeName}${versionSuffix}_master.mp4`;

  return {
    defaultDirectory: defaultDir,
    defaultFileName,
    isDocxSource,
    docxPath: docxPath || null
  };
}

async function runRemotionRenderJob(job: StoryboardRenderJob, storyboard: any, options: any) {
  const adapterPath = path.resolve(projectRoot, "src/adapters/remotion.js");
  const { renderRemotion } = await import(pathToFileURL(adapterPath).href);

  // Auto-create destination directory if it doesn't exist yet (including <DOCX>/Export on NAS/Local)
  await mkdir(job.outputDirectory, { recursive: true });
  const fullOutputPath = path.join(job.outputDirectory, job.fileName);
  job.outputPath = fullOutputPath;

  const fps = Number(options.fps) || 25;
  const items = storyboard.items || [];
  const totalDurationMs = items.reduce((acc: number, it: any) => acc + (Number(it.durationMs) || 0), 0);
  const totalFrames = Math.max(25, Math.round((totalDurationMs / 1000) * fps));
  job.totalFrames = totalFrames;
  job.fps = fps;

  const compositionId = options.format === "9:16" ? "VerticalComposition" : "HorizontalComposition";
  const crf = options.quality === "draft" ? 26 : 18;

  job.status = "rendering";
  const startTime = Date.now();

  try {
    const result = await renderRemotion({
      compositionId,
      output: fullOutputPath,
      props: {
        storyboardId: storyboard.storyboardId,
        items,
        audioTracks: options.bgmTrack ? [options.bgmTrack] : undefined,
        fps,
        durationInFrames: totalFrames
      },
      crf,
      fps,
      concurrency: options.concurrency,
      onProgress: (progressInfo: any) => {
        const { progress, renderedFrames } = progressInfo;
        job.progress = Math.min(100, Math.round((progress ?? 0) * 100));
        job.renderedFrames = renderedFrames ?? Math.round((job.progress / 100) * totalFrames);
        const elapsedSec = (Date.now() - startTime) / 1000;
        if (job.progress > 5) {
          const totalEstimatedSec = elapsedSec / (job.progress / 100);
          job.etaSeconds = Math.max(0, Math.round(totalEstimatedSec - elapsedSec));
        }
      }
    }, {
      log: (msg: string) => app.log.info(msg)
    });

    job.status = "completed";
    job.progress = 100;
    job.renderedFrames = totalFrames;
    job.completedAt = new Date().toISOString();
    job.outputPath = result.output;
    job.sizeBytes = result.sizeBytes;
    job.durationMs = result.durationMs;
    job.renderTimeMs = result.renderTimeMs;
    job.fileUrl = `/api/v1/media/stream?path=${encodeURIComponent(result.output)}`;
  } catch (err: any) {
    job.status = "failed";
    job.error = err.message || "Remotion rendering failed";
    job.completedAt = new Date().toISOString();
    app.log.error(err, `[Remotion] Job ${job.jobId} failed`);
  }
}

app.get("/api/v1/storyboards/:storyboardId/render-defaults", async (request) => {
  const { storyboardId } = request.params as any;
  const storyboard = await storyboards.get(storyboardId);
  return resolveStoryboardExportDefaults(storyboard, projectRoot);
});

app.post("/api/v1/storyboards/:storyboardId/render", async (request, reply) => {
  const { storyboardId } = request.params as any;
  const body = (request.body as any) ?? {};
  const version = typeof body.version === "number" ? body.version : undefined;

  let storyboard: any;
  if (version) {
    storyboard = await storyboards.getVersion(storyboardId, version);
  } else {
    storyboard = await storyboards.get(storyboardId);
  }

  const exportDefaults = resolveStoryboardExportDefaults(storyboard, projectRoot);
  const targetDir = typeof body.outputDirectory === "string" && body.outputDirectory.trim()
    ? body.outputDirectory.trim()
    : exportDefaults.defaultDirectory;
  const targetFileName = typeof body.fileName === "string" && body.fileName.trim()
    ? body.fileName.trim()
    : exportDefaults.defaultFileName;

  const jobId = `render_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
  const job: StoryboardRenderJob = {
    jobId,
    storyboardId,
    version: version || storyboard.approvedVersion || storyboard.revision || 1,
    status: "queued",
    progress: 0,
    renderedFrames: 0,
    totalFrames: 0,
    fps: Number(body.fps) || 25,
    startedAt: new Date().toISOString(),
    outputDirectory: targetDir,
    fileName: targetFileName
  };

  storyboardRenderJobs.set(jobId, job);

  // Execute in background
  void runRemotionRenderJob(job, storyboard, {
    format: body.format || "16:9",
    quality: body.quality || "master",
    fps: body.fps || 25,
    bgmTrack: body.bgmTrack
  });

  return reply.code(202).send({
    jobId,
    status: "queued",
    monitorUrl: `/api/v1/storyboards/${storyboardId}/render-jobs/${jobId}`,
    outputDirectory: targetDir,
    fileName: targetFileName
  });
});

app.get("/api/v1/storyboards/:storyboardId/render-jobs/:jobId", async (request, reply) => {
  const { jobId } = request.params as any;
  const job = storyboardRenderJobs.get(jobId);
  if (!job) return reply.code(404).send({ error: "Render job not found" });
  return job;
});

app.post("/api/v1/system/gpu/free", async (_request, reply) => {
  const comfyBase = process.env.AVA_COMFYUI_URL ?? "http://10.135.66.70:8188";
  try {
    const res = await fetch(`${comfyBase}/free`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unload_models: true, free_memory: true })
    });
    return { ok: true, status: res.status, message: "ComfyUI VRAM cache purged" };
  } catch (err: any) {
    return reply.code(502).send({ ok: false, error: err.message });
  }
});

app.post("/api/v1/storyboards/:storyboardId/items/:itemId/run", async (request, reply) => {
  const { storyboardId, itemId } = request.params as any;
  const body = (request.body as any) ?? {};
  const stage = body.stage === "doodle" ? "doodle" : body.stage === "person" ? "person" : body.stage === "assets" ? "assets" : "background";
  const compilation = await storyboards.createNodeCompilation(storyboardId, itemId, body.item, stage);
  compilation.graph.graphId = `${compilation.graph.graphId}__run_${randomUUID().slice(0, 8)}`;
  const workflow = compileGraphToWorkflow(compilation.graph);
  await workflowSnapshots.save(compilation.graph.graphId, 1, workflow);
  const requestedMode = body.mode ?? "live";
  if (!["auto", "dry-run", "live"].includes(requestedMode)) return reply.code(422).send({ error: "mode must be 'auto', 'dry-run', or 'live'" });
  const comfyNode = compilation.graph.nodes.find((node) => node.type === "comfyui.workflow");
  const targetNode = stage === "assets"
    ? undefined
    : stage === "person"
      ? compilation.graph.nodes.find((node) => node.id.endsWith("__cutout"))?.id
      : stage === "doodle"
        ? compilation.graph.nodes.find((node) => node.id.endsWith("__doodle_alpha"))?.id
        : comfyNode?.id;
  if (!comfyNode && stage !== "person") return reply.code(422).send({ error: "This storyboard node has no GenAI execution step" });
  if (stage === "person" && !targetNode) return reply.code(422).send({ error: "This storyboard node has no person cutout step" });
  const runtime = loadWorkflowText(workflow.raw, { configPath: path.join(projectRoot, `${compilation.graph.graphId}.workflow.json`), configDir: projectRoot });
  const capabilities = workflowCapabilities(runtime.workflow);
  const readinessResult = await evaluateReadiness(projectRoot, { capabilities, services: runtime.workflow.settings.services, adobe: runtime.workflow.settings.adobe, requiredFiles: workflowReadinessFiles(runtime.workflow) });
  const dryRun = requestedMode === "dry-run" || (requestedMode === "auto" && !readinessResult.ready);
  if (requestedMode === "live" && !readinessResult.ready) return reply.code(409).send({ code: "READINESS_FAILED", error: "AI service readiness checks failed; live node run was not queued", readiness: readinessResult });
  const idempotencyKey = request.headers["idempotency-key"];
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim()) return reply.code(400).send({ error: "Idempotency-Key header is required" });
  const record = await scheduler.enqueueCompiledWorkflow({
    manifest: { schemaVersion: 1, graphId: compilation.graph.graphId, graphRevision: 1, workflowDigest: workflow.digest },
    workflow: workflow.workflow,
    raw: workflow.raw,
    digest: workflow.digest,
    recipeId: compilation.graph.graphId,
    projectName: compilation.graph.name
  }, dryRun, idempotencyKey, targetNode ? { to: targetNode } : {});
  return reply.code(202).send({ runId: record.runId, status: record.status, workflowDigest: record.workflowDigest, executionMode: dryRun ? (requestedMode === "dry-run" ? "dry-run" : "dry-run-fallback") : "live", dryRun, readiness: readinessResult, monitorUrl: `/runs/${record.runId}` });
});
app.get("/api/v1/workflow-packages", async () => starterWorkflowPackages);
app.post("/api/v1/workflow-packages/:packageId/instantiate", async (request, reply) => {
  const body = (request.body ?? {}) as any;
  const graphId = `starter_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
  const graph = instantiateStarterWorkflowPackage((request.params as any).packageId, { graphId, name: typeof body.name === "string" ? body.name : undefined });
  return reply.code(201).send(await visualWorkflows.createFromPackage(graph));
});

app.get("/api/v1/workflows", async () => visualWorkflows.list());
app.post("/api/v1/workflows", async (request, reply) => reply.code(201).send(await visualWorkflows.create(request.body as any)));
app.get("/api/v1/workflows/:graphId", async (request) => visualWorkflows.get((request.params as any).graphId));
app.patch("/api/v1/workflows/:graphId", async (request) => visualWorkflows.update(
  (request.params as any).graphId,
  request.body as any,
  typeof request.headers["if-match"] === "string" ? request.headers["if-match"] : undefined
));
app.post("/api/v1/workflows/:graphId/validate", async (request, reply) => {
  const result = await visualWorkflows.validate((request.params as any).graphId);
  return result.valid ? result : reply.code(422).send(result);
});
app.post("/api/v1/workflows/:graphId/publish", async (request) => visualWorkflows.publish((request.params as any).graphId));
app.post("/api/v1/workflows/:graphId/clone", async (request, reply) => reply.code(201).send(await visualWorkflows.clone((request.params as any).graphId)));
app.delete("/api/v1/workflows/:graphId", async (request, reply) => reply.send(await visualWorkflows.delete((request.params as any).graphId)));
app.post("/api/v1/workflows/:graphId/runs", async (request, reply) => {
  const graphId = (request.params as any).graphId;
  const draft = await visualWorkflows.requireDraft(graphId);
  const body = (request.body as any) ?? {};
  const requestedMode = body.mode ?? "auto";
  if (!["auto", "dry-run", "live"].includes(requestedMode)) {
    return reply.code(422).send({ error: "mode must be 'auto', 'dry-run', or 'live'" });
  }
  const graph = draft;
  if (body.toNodeId !== undefined && !graph.nodes.some((node) => node.id === body.toNodeId)) {
    return reply.code(422).send({ error: "toNodeId does not exist in this workflow" });
  }
  const compiled = compileGraphToWorkflow(graph);
  await workflowSnapshots.save(graph.graphId, graph.revision, compiled);
  const capabilities = [...new Set(graph.nodes.flatMap((node) => nodeDescriptorRegistry.get(node.type)?.capabilities ?? []))];

  let dryRun = requestedMode === "dry-run";
  let executionMode = requestedMode;
  let readinessResult: any = undefined;

  if (requestedMode === "live" || requestedMode === "auto") {
    const runtime = loadWorkflowText(compiled.raw, { configPath: path.join(projectRoot, `${graph.graphId}.workflow.json`), configDir: projectRoot });
    const currentReadiness = await evaluateReadiness(projectRoot, { capabilities, services: runtime.workflow.settings.services, adobe: runtime.workflow.settings.adobe, requiredFiles: workflowReadinessFiles(runtime.workflow) });
    readinessResult = currentReadiness;

    if (requestedMode === "live") {
      if (!currentReadiness.ready) {
        return reply.code(409).send({ code: "READINESS_FAILED", error: "System readiness checks failed; live run was not queued", readiness: currentReadiness });
      }
      dryRun = false;
    } else {
      // auto mode: if readiness is ready, run live; otherwise graceful fallback to dry-run
      if (currentReadiness.ready) {
        dryRun = false;
        executionMode = "live";
      } else {
        dryRun = true;
        executionMode = "dry-run-fallback";
      }
    }
  }

  const idempotencyKey = request.headers["idempotency-key"];
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim()) return reply.code(400).send({ error: "Idempotency-Key header is required" });
  const record = await scheduler.enqueueCompiledWorkflow({
    manifest: { schemaVersion: 1, graphId: graph.graphId, graphRevision: graph.revision, workflowDigest: compiled.digest },
    workflow: compiled.workflow,
    raw: compiled.raw,
    digest: compiled.digest,
    recipeId: graph.graphId,
    projectName: graph.name
  }, dryRun, idempotencyKey, { to: body.toNodeId });

  return reply.code(202).send({
    runId: record.runId,
    status: record.status,
    workflowDigest: record.workflowDigest,
    executionMode,
    dryRun,
    readiness: readinessResult,
    monitorUrl: `/runs/${record.runId}`
  });
});

app.post("/api/v1/trial-presets/portrait-story-v1", async () => {
  const sourcePath = path.join(projectRoot, "assets/input/prototype-presenter.png");
  const buffer = await readFile(sourcePath);
  const assetId = deterministicAssetId(buffer, "portrait-story-first-user-v1");
  const presenterAsset = await persistPresenterAsset(buffer, "image/png", "prototype-presenter.png", assetId, true);
  return {
    presetId: "portrait-story-first-user-v1",
    presenterAsset,
    form: {
      projectName: "PSU First User Trial",
      headline: "PSU BROADCAST",
      subheadline: "FIRST USER TRIAL",
      backgroundBrief: "ห้องส่งข่าวมหาวิทยาลัยร่วมสมัย บรรยากาศสุขุม อบอุ่น และเป็นมืออาชีพ"
    }
  };
});

app.post("/api/v1/recipes/portrait-story-v1/validate", async (request) => {
  const manifest = (request.body as any)?.manifest ?? request.body;
  const errors = validatePortraitStoryManifest(manifest);
  return { valid: errors.length === 0, errors, compiledSummary: { format: portraitStoryRecipe.format, durationSeconds: 5, steps: 7 } };
});

app.post("/api/v1/workflows/compile", async (request, reply) => {
  const manifest = await resolvePresenterManifest((request.body as any)?.manifest);
  const errors = validatePortraitStoryManifest(manifest);
  if (errors.length) return reply.code(422).send({ valid: false, errors });
  const compiled = compilePortraitStory(manifest);
  const validation = await validateWorkflowDocument(compiled.workflow, projectRoot);
  if (!validation.valid) return reply.code(422).send(validation);
  return {
    valid: true,
    workflowDigest: compiled.digest,
    compiledSummary: {
      format: portraitStoryRecipe.format,
      durationSeconds: portraitStoryRecipe.durationSeconds,
      steps: portraitStoryRecipe.steps
    }
  };
});

app.post("/api/v1/workflows/validate", async (request, reply) => {
  const value = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  const result = await validateWorkflowDocument(value, projectRoot);
  return result.valid ? result : reply.code(422).send(result);
});

app.post("/api/v1/assets/import", async (request, reply) => {
  const part = await request.file({ limits: { files: 1, fileSize: 25 * 1024 * 1024 } });
  if (!part) return reply.code(400).send({ error: "Presenter image is required" });
  if (!["image/png", "image/jpeg", "image/webp"].includes(part.mimetype)) return reply.code(415).send({ error: "Only PNG, JPEG and WebP are supported" });
  const buffer = await part.toBuffer();
  try {
    return reply.code(201).send(await persistPresenterAsset(buffer, part.mimetype, part.filename, randomUUID(), false));
  } catch (error: any) {
    return reply.code(error.statusCode ?? 422).send({ error: error.message });
  }
});

app.post("/api/v1/media/import", async (request, reply) => {
  const part = await request.file({ limits: { files: 1, fileSize: MEDIA_MAX_BYTES } });
  if (!part) return reply.code(400).send({ error: "Media file is required" });
  if (!supportedMediaTypes.includes(part.mimetype)) return reply.code(415).send({ error: "Supported formats: PNG, JPEG, WebP, WAV, MP3, M4A, AAC, MP4 and MOV" });
  try {
    return reply.code(201).send(await persistUploadedMedia(part, assetRoot));
  } catch (error: any) {
    return reply.code(error.statusCode ?? 422).send({ error: error.message });
  }
});

app.get("/api/v1/assets/:assetId/content", async (request, reply) => {
  const { assetId } = request.params as any;
  const { record, canonicalTarget } = await resolveAsset(assetId, 404);
  return reply.type(record.mimeType).send(await readFile(canonicalTarget));
});

app.post("/api/v1/runs", async (request, reply) => {
  const body = request.body as any;
  if (body?.mode !== "dry-run" && body?.mode !== "live") {
    return reply.code(422).send({ error: "mode must be exactly 'dry-run' or 'live'" });
  }
  const manifest = await resolvePresenterManifest(body?.manifest);
  const errors = validatePortraitStoryManifest(manifest);
  if (errors.length) return reply.code(422).send({ valid: false, errors });
  if (body.mode === "live") {
    const compiled = compilePortraitStory(manifest);
    if (typeof body.preflightDigest !== "string" || !body.preflightDigest) {
      return reply.code(409).send({ code: "PREFLIGHT_REQUIRED", error: "Validate Recipe before starting a Live run" });
    }
    if (body.preflightDigest !== compiled.digest) {
      return reply.code(409).send({ code: "PREFLIGHT_STALE", error: "Recipe changed after validation; validate it again before Live" });
    }
    if (body.operatorConfirmedAdobeReady !== true) {
      return reply.code(409).send({ code: "OPERATOR_CONFIRMATION_REQUIRED", error: "Confirm that AE/Premiere are dedicated and saved before starting a live run" });
    }
    const currentReadiness = await readiness();
    if (!currentReadiness.ready) {
      try {
        const rejection = await readinessDiagnostics.record({
          requestId: String(request.id),
          manifestId: manifest.id,
          projectName: manifest.projectName,
          preflightDigest: body.preflightDigest,
          readiness: currentReadiness
        });
        request.log.warn({ failedCheckIds: rejection.failedChecks.map((check) => check.id) }, "Live run rejected by current readiness");
      } catch (error) {
        request.log.error(error, "Could not persist live readiness rejection diagnostic");
      }
      return reply.code(409).send({ code: "READINESS_FAILED", error: "System readiness checks failed; live run was not queued", readiness: currentReadiness });
    }
  }
  const idempotencyKey = request.headers["idempotency-key"];
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
    return reply.code(400).send({ error: "Idempotency-Key header is required" });
  }
  const record = await scheduler.enqueue(manifest, body.mode === "dry-run", idempotencyKey);
  return reply.code(202).send({ runId: record.runId, status: record.status, workflowDigest: record.workflowDigest, monitorUrl: `/runs/${record.runId}` });
});

app.get("/api/v1/runs", async () => Promise.all((await store.list()).map(async (record) => {
  try { return await toRunDto(record); }
  catch (error: any) { return toRunDtoFallback(record, error); }
})));
app.get("/api/v1/runs/:runId", async (request, reply) => {
  const runId = (request.params as any).runId;
  const record = await store.get(runId) ?? (await store.list()).find((value) => value.runId === runId);
  return record ? toRunDto(record) : reply.code(404).send({ error: "Run not found" });
});

app.post("/api/v1/runs/:runId/actions/resume", async (request, reply) => {
  const body = request.body as any;
  const runId = (request.params as any).runId;
  const current = await store.get(runId);
  if (!current) return reply.code(404).send({ error: "Run not found" });
  if (!current.dryRun) {
    if (body?.operatorConfirmedAdobeReady !== true) {
      return reply.code(409).send({ code: "OPERATOR_CONFIRMATION_REQUIRED", error: "Confirm that required Adobe hosts are ready and unsaved work is protected before resuming Live" });
    }
    const raw = await readFile(current.configPath, "utf8");
    if (workflowDigest(raw) !== current.workflowDigest) {
      return reply.code(409).send({ code: "WORKFLOW_SNAPSHOT_MISMATCH", error: "Workflow snapshot changed; Live resume was not queued" });
    }
    const runtime = loadWorkflowText(raw, { configPath: current.configPath, configDir: projectRoot });
    const currentReadiness = await evaluateReadiness(projectRoot, {
      capabilities: workflowCapabilities(runtime.workflow),
      services: runtime.workflow.settings.services,
      requiredFiles: workflowReadinessFiles(runtime.workflow)
    });
    if (!currentReadiness.ready) {
      return reply.code(409).send({ code: "READINESS_FAILED", error: "System readiness checks failed; Live resume was not queued", readiness: currentReadiness });
    }
  }
  const record = await scheduler.resume(runId, body?.from, body?.to);
  return reply.code(202).send(await toRunDto(record));
});
app.post("/api/v1/runs/:runId/approvals/:stepId", async (request, reply) => {
  const { runId, stepId } = request.params as any;
  if (!/^[A-Za-z0-9_-]+$/.test(stepId)) return reply.code(400).send({ error: "Unsafe step id" });
  const body = (request.body ?? {}) as any;
  const current = await store.get(runId);
  if (!current || !current.runDir) return reply.code(404).send({ error: "Run not found" });
  if (current.status !== "waiting_approval") return reply.code(409).send({ error: "Run is not waiting for approval" });
  const state = JSON.parse(await readFile(path.join(current.runDir, "state.json"), "utf8"));
  const requestValue = state?.steps?.[stepId]?.outputs?.approvalRequest;
  if (!requestValue || state?.approval?.stepId !== stepId) return reply.code(409).send({ error: "Approval request does not match the waiting step" });
  if (typeof body.proposalDigest !== "string" || body.proposalDigest !== requestValue.proposalDigest) {
    return reply.code(409).send({ code: "APPROVAL_STALE", error: "Proposal changed; reload before approving" });
  }
  if (typeof body.approved !== "boolean") return reply.code(422).send({ error: "approved must be a boolean" });
  const decision = {
    schemaVersion: 1,
    runId,
    stepId,
    proposalDigest: body.proposalDigest,
    approved: body.approved,
    selections: Array.isArray(body.selections) ? body.selections : requestValue.items,
    note: typeof body.note === "string" ? body.note.slice(0, 1000) : "",
    decidedAt: new Date().toISOString()
  };
  await atomicWrite(path.join(current.runDir, stepId, "approval-decision.json"), `${JSON.stringify(decision, null, 2)}\n`);
  await scheduler.publish(runId, { type: "approval.recorded", stateVersion: Number(state.version ?? 0), stepId, data: { approved: decision.approved, proposalDigest: decision.proposalDigest } });
  const record = await scheduler.resume(runId, stepId);
  return reply.code(202).send(await toRunDto(record));
});
app.get("/api/v1/runs/:runId/approvals/:stepId/candidates/:assetId/thumbnail", async (request, reply) => {
  const { runId, stepId, assetId } = request.params as any;
  if (![runId, stepId, assetId].every((value) => typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value))) {
    return reply.code(400).send({ error: "Unsafe approval thumbnail identifier" });
  }
  const current = await store.get(runId);
  if (!current?.runDir) return reply.code(404).send({ error: "Run not found" });
  const state = JSON.parse(await readFile(path.join(current.runDir, "state.json"), "utf8"));
  const approval = state?.steps?.[stepId]?.outputs?.approvalRequest;
  const candidate = approval?.items?.flatMap((item: any) => item.candidates ?? []).find((item: any) => item.assetId === assetId);
  if (typeof candidate?.thumbnailPath !== "string") return reply.code(404).send({ error: "Thumbnail not found" });

  try {
    const { target, contentType } = await resolveApprovalThumbnailPath({
      projectRoot,
      runDir: current.runDir,
      approvalKind: approval?.kind,
      thumbnailPath: candidate.thumbnailPath
    });
    return reply.type(contentType).send(await readFile(target));
  } catch (err: any) {
    return reply.code(err.statusCode ?? 500).send({ error: err.message });
  }
});
app.post("/api/v1/runs/:runId/actions/stop-after-step", async (request) => toRunDto(await scheduler.requestStop((request.params as any).runId)));
app.post("/api/v1/runs/:runId/actions/cancel-queued", async (request) => toRunDto(await scheduler.cancelQueued((request.params as any).runId)));

app.get("/api/v1/runs/:runId/events", async (request, reply) => {
  const runId = (request.params as any).runId;
  if (!await store.get(runId)) return reply.code(404).send({ error: "Run not found" });
  const after = Number(request.headers["last-event-id"] ?? (request.query as any)?.after ?? 0);
  reply.hijack();
  let lastSent = Number.isSafeInteger(after) && after >= 0 ? after : 0;
  let replaying = true;
  const pending: any[] = [];
  const deliver = (event: any) => {
    if (event.sequence <= lastSent) return;
    if (replaying) pending.push(event);
    else {
      sendEvent(reply.raw, event);
      lastSent = event.sequence;
    }
  };
  // Subscribe before replaying the durable journal so an event committed in
  // between cannot disappear from the SSE stream. Sequence de-duplication
  // handles events present in both the replay and the live buffer.
  const unsubscribe = scheduler.subscribe(runId, deliver);
  const replay = await store.events(runId, lastSent);
  const heartbeat = setInterval(() => reply.raw.write(`: heartbeat ${Date.now()}\n\n`), 15_000);
  let cleaned = false;
  const cleanup = (closeConnection: boolean) => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(heartbeat);
    unsubscribe();
    activeEventStreams.delete(closeStream);
    // A hijacked SSE response keeps its HTTP socket outside Fastify's normal
    // reply lifecycle. Destroy only that disposable stream during shutdown so
    // app.close() cannot wait indefinitely for the browser's keep-alive socket.
    if (closeConnection && !reply.raw.destroyed) reply.raw.destroy();
  };
  const closeStream = () => cleanup(true);
  activeEventStreams.add(closeStream);
  reply.raw.once("close", () => cleanup(false));
  // Register shutdown cleanup before exposing the 200 response. Otherwise a
  // SIGTERM can arrive after the client sees the headers but before this SSE
  // connection is tracked, leaving app.close() waiting on a missed stream.
  reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
  reply.raw.flushHeaders();
  for (const event of replay) {
    sendEvent(reply.raw, event);
    lastSent = event.sequence;
  }
  replaying = false;
  for (const event of pending.sort((a, b) => a.sequence - b.sequence)) deliver(event);
});

app.get("/api/v1/runs/:runId/artifacts", async (request, reply) => {
  const record = await store.get((request.params as any).runId);
  if (!record?.runDir) return reply.code(404).send({ error: "Run artifacts are not available" });
  return listArtifacts(record.runDir);
});
app.get("/api/v1/runs/:runId/artifacts/:artifactId/content", async (request, reply) => {
  const { runId, artifactId } = request.params as any;
  const record = await store.get(runId);
  if (!record?.runDir) return reply.code(404).send({ error: "Run not found" });
  const resolved = await resolveArtifact(record.runDir, artifactId);
  const range = parseByteRange(request.headers.range, resolved.artifact.size);
  reply.header("accept-ranges", "bytes").type(resolved.artifact.mediaType);
  if (range === "invalid") {
    return reply.header("content-range", `bytes */${resolved.artifact.size}`).code(416).send();
  }
  if (range) {
    reply
      .header("content-range", `bytes ${range.start}-${range.end}/${resolved.artifact.size}`)
      .header("content-length", String(range.end - range.start + 1))
      .code(206);
    return reply.send(createReadStream(resolved.target, range));
  }
  reply.header("content-length", String(resolved.artifact.size));
  return reply.send(createReadStream(resolved.target));
});
app.post("/api/v1/runs/:runId/artifacts/:artifactId/reveal", async (request, reply) => {
  const { runId, artifactId } = request.params as any;
  const record = await store.get(runId);
  if (!record?.runDir) return reply.code(404).send({ error: "Run not found" });
  const resolved = await resolveArtifact(record.runDir, artifactId);
  if (process.platform !== "darwin") return reply.code(501).send({ error: "Reveal is available on macOS only" });
  spawn("open", ["-R", resolved.target], { detached: true, stdio: "ignore" }).unref();
  return { ok: true };
});

app.get("/api/v1/media/stream", async (request, reply) => {
  const mediaPath = (request.query as any)?.path;
  if (!mediaPath || typeof mediaPath !== "string") return reply.code(400).send({ error: "path query parameter is required" });
  const resolved = path.isAbsolute(mediaPath) ? mediaPath : path.resolve(projectRoot, mediaPath);
  try {
    const fileStat = await stat(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const mediaType = ext === ".mp4" ? "video/mp4" : ext === ".mov" ? "video/quicktime" : ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "application/octet-stream";
    const range = parseByteRange(request.headers.range, fileStat.size);
    reply.header("accept-ranges", "bytes").type(mediaType);
    if (range === "invalid") {
      return reply.header("content-range", `bytes */${fileStat.size}`).code(416).send();
    }
    if (range) {
      reply
        .header("content-range", `bytes ${range.start}-${range.end}/${fileStat.size}`)
        .header("content-length", String(range.end - range.start + 1))
        .code(206);
      return reply.send(createReadStream(resolved, range));
    }
    reply.header("content-length", String(fileStat.size));
    return reply.send(createReadStream(resolved));
  } catch (err: any) {
    return reply.code(404).send({ error: "Media file not found or inaccessible", detail: err?.message });
  }
});

const webRoot = path.join(projectRoot, "apps/control-web/dist");
try {
  await access(webRoot);
  await app.register(fastifyStatic, { root: webRoot, wildcard: true });
  app.setNotFoundHandler((request, reply) => request.url.startsWith("/api/") ? reply.code(404).send({ error: "Not found" }) : reply.sendFile("index.html"));
} catch { /* Vite serves the UI during development. */ }

app.setErrorHandler((error: any, _request, reply) => reply.code(error.statusCode ?? 500).send({ code: error.code, error: error.message, diagnostics: error.diagnostics }));
let closing = false;
const shutdown = (signal: NodeJS.Signals) => {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, "Shutting down Control API");
  for (const closeStream of [...activeEventStreams]) closeStream();
  void app.close().catch((error) => {
    app.log.error(error, "Control API shutdown failed");
    process.exitCode = 1;
  });
};
const onSigint = () => shutdown("SIGINT");
const onSigterm = () => shutdown("SIGTERM");
process.once("SIGINT", onSigint);
process.once("SIGTERM", onSigterm);
app.addHook("onClose", async () => {
  process.off("SIGINT", onSigint);
  process.off("SIGTERM", onSigterm);
  await instanceLease.release();
});
try { await app.listen({ host, port }); }
catch (error) {
  process.off("SIGINT", onSigint);
  process.off("SIGTERM", onSigterm);
  await instanceLease.release();
  throw error;
}

async function toRunDto(record: any) {
  let state: any;
  if (record.runDir) {
    try { state = JSON.parse(await readFile(path.join(record.runDir, "state.json"), "utf8")); } catch { /* queued or not checkpointed yet */ }
  }
  const labels: Record<string, string> = { select_presenter: "Check presenter", remove_background: "Remove background", generate_background: "Generate studio background", fixed_design: "Bind story design", ae_bind: "Build After Effects project", ae_render: "Render master video", premiere_assembly: "Assemble Premiere project" };
  let workflow: any = { steps: [] };
  let dataError: string | undefined;
  try { workflow = JSON.parse(await readFile(record.configPath, "utf8")); }
  catch (error: any) { dataError = `Workflow snapshot unavailable: ${error?.message ?? error}`; }
  const workflowSteps = workflow.steps ?? [];
  const completedSteps = workflowSteps.filter((step: any) => ["success", "skipped"].includes(state?.steps?.[step.id]?.status)).length;
  const progressTotal = workflowSteps.length;
  const progressPercent = record.status === "success" ? 100 : progressTotal ? Math.round((completedSteps / progressTotal) * 100) : 0;
  return {
    runId: record.runId,
    recipeId: record.recipeId,
    projectName: record.projectName,
    status: record.status,
    dryRun: record.dryRun,
    workflowDigest: record.workflowDigest,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    error: record.error,
    errorCode: record.errorCode,
    unsafeToResume: record.unsafeToResume,
    artifactError: record.artifactError,
    eventError: record.eventError,
    verification: record.verification,
    dataError,
    startedAt: state?.startedAt,
    finishedAt: state?.finishedAt,
    resumable: ["failed", "partial", "needs_attention"].includes(record.status) && !record.unsafeToResume,
    approval: record.status === "waiting_approval" ? state?.steps?.[state?.approval?.stepId]?.outputs?.approvalRequest : undefined,
    stoppedAtStep: state?.stoppedAtStep,
    progress: { completed: completedSteps, total: progressTotal, percent: progressPercent },
    steps: workflowSteps.map((step: any) => ({ id: step.id, label: labels[step.id] ?? step.name ?? step.id, type: step.type, status: state?.steps?.[step.id]?.status ?? "pending", attempts: state?.steps?.[step.id]?.attempts ?? 0, startedAt: state?.steps?.[step.id]?.startedAt, finishedAt: state?.steps?.[step.id]?.finishedAt, error: state?.steps?.[step.id]?.lastError?.message, outputs: state?.steps?.[step.id]?.outputs }))
  };
}

function toRunDtoFallback(record: any, error: any) {
  return {
    runId: record.runId,
    recipeId: record.recipeId,
    projectName: record.projectName,
    status: record.status,
    dryRun: record.dryRun,
    workflowDigest: record.workflowDigest,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    error: record.error,
    errorCode: record.errorCode,
    unsafeToResume: record.unsafeToResume,
    verification: record.verification,
    dataError: `Run metadata unavailable: ${error?.message ?? error}`,
    resumable: false,
    progress: { completed: 0, total: 0, percent: record.status === "success" ? 100 : 0 },
    steps: []
  };
}

async function readiness() { return evaluateReadiness(projectRoot); }

function workflowCapabilities(workflow: any): string[] {
  const capabilities: string[] = [];
  for (const step of workflow.steps ?? []) capabilities.push(...(nodeDescriptorRegistry.get(step.type)?.capabilities ?? []));
  return [...new Set(capabilities)];
}

function workflowReadinessFiles(workflow: any) {
  const files: Array<{ id: string; name: string; path: string; category: "after-effects" | "premiere"; remediation: string }> = [];
  const add = (id: string, name: string, value: unknown, category: "after-effects" | "premiere", remediation: string) => {
    if (typeof value !== "string" || !value || value.includes("${")) return;
    files.push({ id, name, path: path.isAbsolute(value) ? value : path.resolve(projectRoot, value), category, remediation });
  };
  for (const step of workflow.steps ?? []) {
    if (step.type === "ae.template") add(`workflow-${step.id}-template`, `${step.id} AE template`, step.with?.templateProject, "after-effects", "ติดตั้งหรือเลือก AE template package ที่มีอยู่จริง");
    if (step.type === "premiere.build") add(`workflow-${step.id}-sequence-preset`, `${step.id} sequence preset`, step.with?.sequencePresetPath, "premiere", "เลือก .sqpreset ที่ตรง profile และ 25fps");
    if (step.type === "premiere.export") for (const request of step.with?.exports ?? []) {
      add(`workflow-${step.id}-${request.format}-preset`, `${step.id} ${request.format} preset`, request.presetPath, "premiere", `เลือก .epr ที่เชื่อถือได้สำหรับ ${request.format}`);
    }
  }
  return files;
}

async function persistPresenterAsset(buffer: Buffer, declaredMimeType: string, originalName: string, assetId: string, allowExisting: boolean) {
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) throw Object.assign(new Error("Image could not be decoded"), { statusCode: 422 });
  const actualMimeType = metadata.format === "png"
    ? "image/png"
    : metadata.format === "jpeg"
      ? "image/jpeg"
      : metadata.format === "webp"
        ? "image/webp"
        : undefined;
  if (!actualMimeType || actualMimeType !== declaredMimeType) {
    throw Object.assign(new Error(`Image content does not match declared type ${declaredMimeType}`), { statusCode: 415 });
  }
  if (metadata.width > 12_000 || metadata.height > 12_000 || metadata.width * metadata.height > 50_000_000) {
    throw Object.assign(new Error("Image dimensions exceed the 50 megapixel safety limit"), { statusCode: 413 });
  }
  const extension = actualMimeType === "image/png" ? ".png" : actualMimeType === "image/webp" ? ".webp" : ".jpg";
  const filename = `${assetId}${extension}`;
  const target = path.join(assetRoot, filename);
  try { await writeFile(target, buffer, { flag: "wx", mode: 0o600 }); }
  catch (error: any) { if (!(allowExisting && error.code === "EEXIST")) throw error; }
  const record = { assetId, projectPath: path.posix.join("assets/input/ui", filename), originalName: originalName.normalize("NFC").slice(0, 255), mimeType: actualMimeType, width: metadata.width, height: metadata.height, previewUrl: `/api/v1/assets/${assetId}/content` };
  await writeFile(path.join(assetRoot, `${assetId}.json`), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  return record;
}

function deterministicAssetId(buffer: Buffer, namespace: string) {
  const hex = createHash("sha256").update(namespace).update(buffer).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function sendEvent(stream: NodeJS.WritableStream, event: any) { stream.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`); }
function isLoopback(value: string) { return value === "127.0.0.1" || value === "localhost" || value === "::1"; }

async function resolvePresenterManifest(value: unknown): Promise<PortraitStoryManifestV1> {
  const manifest = value as Partial<PortraitStoryManifestV1> | undefined;
  const assetId = manifest?.presenterAsset?.assetId;
  if (!assetId || !/^[0-9a-f-]{36}$/.test(assetId)) {
    throw Object.assign(new Error("A server-issued presenter assetId is required"), { statusCode: 422 });
  }

  const { record, canonicalTarget } = await resolveAsset(assetId, 422);
  const canonicalProjectPath = path.relative(projectRoot, canonicalTarget).split(path.sep).join("/");
  return {
    ...(manifest as PortraitStoryManifestV1),
    presenterAsset: {
      assetId,
      projectPath: canonicalProjectPath,
      originalName: record.originalName,
      mimeType: record.mimeType,
      previewUrl: `/api/v1/assets/${assetId}/content`
    }
  };
}

async function resolveAsset(assetId: string, missingStatus: number) {
  if (!/^[0-9a-f-]{36}$/.test(assetId)) throw Object.assign(new Error("Asset not found"), { statusCode: missingStatus });
  let record: any;
  try { record = JSON.parse(await readFile(path.join(assetRoot, `${assetId}.json`), "utf8")); }
  catch (error: any) { if (error.code === "ENOENT") throw Object.assign(new Error("Presenter asset was not found"), { statusCode: missingStatus }); throw error; }
  if (record.assetId !== assetId || !record.projectPath) throw Object.assign(new Error("Presenter asset metadata is invalid"), { statusCode: 422 });
  let canonicalRoot: string;
  let canonicalTarget: string;
  try { [canonicalRoot, canonicalTarget] = await Promise.all([realpath(assetRoot), realpath(path.resolve(projectRoot, record.projectPath))]); }
  catch (error: any) { if (error.code === "ENOENT") throw Object.assign(new Error("Presenter asset file was not found"), { statusCode: missingStatus }); throw error; }
  if (canonicalTarget !== canonicalRoot && !canonicalTarget.startsWith(`${canonicalRoot}${path.sep}`)) throw Object.assign(new Error("Presenter asset escaped the asset root"), { statusCode: 403 });
  return { record, canonicalTarget };
}

function parseByteRange(value: string | undefined, size: number): { start: number; end: number } | "invalid" | undefined {
  if (!value) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return "invalid";
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return "invalid";
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return "invalid";
    end = Math.min(end, size - 1);
  }
  return { start, end };
}
