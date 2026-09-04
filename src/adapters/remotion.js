import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { mkdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_ENTRY = path.resolve(__dirname, "../../apps/remotion-studio/src/index.ts");

let cachedBundlePromise = null;
let cachedBundlePath = null;

function hashString(str) {
  return createHash("md5").update(str).digest("hex").slice(0, 12);
}

function runFfmpegTrim(src, startSec, durSec, dest) {
  return new Promise((resolve) => {
    // Ultra-fast stream copy first (-c copy in <0.2s without re-encoding)
    const args = ["-y", "-ss", String(startSec), "-i", src, "-t", String(durSec), "-c", "copy", "-avoid_negative_ts", "make_zero", dest];
    const proc = spawn("ffmpeg", args, { stdio: "ignore" });
    proc.on("close", (code) => {
      if (code === 0) return resolve(true);
      // Fallback: fast ultrafast transcode
      const fallbackArgs = ["-y", "-ss", String(startSec), "-i", src, "-t", String(durSec), "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-c:a", "aac", dest];
      const fallbackProc = spawn("ffmpeg", fallbackArgs, { stdio: "ignore" });
      fallbackProc.on("close", (fCode) => resolve(fCode === 0));
    });
  });
}

async function stageMediaClipsLocally(items, cacheDir, log) {
  if (!Array.isArray(items)) return items;
  await mkdir(cacheDir, { recursive: true });

  const stagedItems = structuredClone(items);

  for (const item of stagedItems) {
    // 1. A-Roll and Main Source staging
    if (item.params?.sourcePath && typeof item.params.sourcePath === "string") {
      const src = item.params.sourcePath;
      if (src.startsWith("/Volumes/") || src.includes("ภาควีดีทัศน์")) {
        const startSec = (item.params.sourceInMs || 0) / 1000;
        const durSec = (item.durationMs || 5000) / 1000;
        const stagedFileName = `stage_${hashString(src)}_${Math.round(startSec)}_${Math.round(durSec)}.mp4`;
        const stagedPath = path.join(cacheDir, stagedFileName);

        let exists = false;
        try {
          const s = await stat(stagedPath);
          if (s.size > 0) exists = true;
        } catch {}

        if (!exists) {
          if (log) log(`[Turbo-Staging] Staging NAS clip to local NVMe SSD: ${path.basename(src)} [${startSec}s -> +${durSec}s]`);
          await runFfmpegTrim(src, startSec, durSec, stagedPath);
        }

        try {
          const check = await stat(stagedPath);
          if (check.size > 0) {
            item.params.sourcePath = stagedPath;
            item.params.sourceInMs = 0;
            item.params.sourceOutMs = item.durationMs;
          }
        } catch {}
      }
    }

    // 2. B-Roll staging
    if (Array.isArray(item.broll)) {
      for (const br of item.broll) {
        if (br.asset?.path && (br.asset.path.startsWith("/Volumes/") || br.asset.path.includes("ภาควีดีทัศน์"))) {
          const src = br.asset.path;
          const startSec = 0;
          const durSec = (br.durationMs || 4000) / 1000;
          const stagedFileName = `broll_${hashString(src)}_${Math.round(durSec)}.mp4`;
          const stagedPath = path.join(cacheDir, stagedFileName);

          let exists = false;
          try {
            const s = await stat(stagedPath);
            if (s.size > 0) exists = true;
          } catch {}

          if (!exists) {
            if (log) log(`[Turbo-Staging] Staging B-Roll to local NVMe SSD: ${path.basename(src)}`);
            await runFfmpegTrim(src, startSec, durSec, stagedPath);
          }

          try {
            const check = await stat(stagedPath);
            if (check.size > 0) {
              br.asset.path = stagedPath;
            }
          } catch {}
        }
      }
    }
  }

  return stagedItems;
}

async function getStudioBundle() {
  if (cachedBundlePath) return cachedBundlePath;
  if (!cachedBundlePromise) {
    cachedBundlePromise = bundle({
      entryPoint: STUDIO_ENTRY,
      webpackOverride: (config) => config
    }).then((bundleLocation) => {
      cachedBundlePath = bundleLocation;
      return bundleLocation;
    });
  }
  return cachedBundlePromise;
}

export async function renderRemotion(input, context) {
  const startTime = Date.now();
  const compositionId = input.composition || input.compositionId || "VerticalComposition";
  const outputRelative = input.output || `outputs/remotion-${Date.now()}.mp4`;
  const outputPath = path.isAbsolute(outputRelative)
    ? outputRelative
    : context?.resolveRunPath
    ? context.resolveRunPath(outputRelative)
    : path.resolve(process.cwd(), outputRelative);

  // Normalize storyboard / assembly input props
  const rawProps = input.props || input.storyboardProps || {};
  const props = {
    ...rawProps,
    storyboardId: input.storyboardId || rawProps.storyboardId || "storyboard",
    items: input.items || input.storyboard?.items || rawProps.items,
    cutlist: input.cutlist || rawProps.cutlist,
    brollStack: input.brollStack || input.broll || rawProps.brollStack,
    audioTracks: input.audioTracks || input.audio || rawProps.audioTracks,
    subtitles: input.subtitles || rawProps.subtitles,
    theme: input.theme || rawProps.theme,
    fps: input.fps || rawProps.fps || 25,
    durationInFrames: input.durationInFrames || rawProps.durationInFrames
  };

  const isDryRun = Boolean(context?.dryRun || input.dryRun);

  if (isDryRun) {
    const width = compositionId === "HorizontalComposition" ? 1920 : 1080;
    const height = compositionId === "VerticalComposition" ? 1920 : 1080;
    const fps = props.fps || 25;
    const durationFrames = props.durationInFrames || 25 * 13;
    const durationMs = Math.round((durationFrames / fps) * 1000);

    return {
      output: outputPath,
      compositionId,
      width,
      height,
      fps,
      durationFrames,
      durationMs,
      dryRun: true,
      sizeBytes: 0,
      renderTimeMs: 0
    };
  }

  // Ensure output directory exists
  await mkdir(path.dirname(outputPath), { recursive: true });

  const projectRoot = path.resolve(__dirname, "../..");
  const stagingDir = path.join(projectRoot, ".ava-cache", "staging");

  // 1. Turbo-Staging: Fast stream-copy NAS clips to high-speed local NVMe SSD (eliminates network lag)
  const stagedItems = await stageMediaClipsLocally(props.items, stagingDir, context?.log);
  props.items = stagedItems;

  // 2. Concurrency calculation (50% of CPU threads, e.g. 10 threads on 20-thread i9)
  const availableCpus = os.cpus().length || 4;
  const optimalConcurrency = Math.min(10, Math.max(4, Math.floor(availableCpus * 0.5)));
  const concurrency = input.concurrency ?? optimalConcurrency;

  if (context?.log) {
    context.log(`[Remotion Turbo Engine] Active Cores: ${availableCpus} | Concurrency: ${concurrency} Threads | GPU Acceleration: Angle/Metal`);
  }

  // 3. Bundle Remotion Studio
  const bundleLocation = await getStudioBundle();

  // 4. Inspect Composition Metadata
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps: props,
    chromiumOptions: {
      gl: "angle",
      ignoreCertificateErrors: true,
      disableWebSecurity: true
    }
  });

  // 5. Execute Real Video Rendering via Multi-Threaded Headless Chrome & FFmpeg
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: input.codec || "h264",
    outputLocation: outputPath,
    inputProps: props,
    crf: input.crf ?? 18,
    imageFormat: "jpeg",
    jpegQuality: 85,
    concurrency,
    chromiumOptions: {
      gl: "angle",
      ignoreCertificateErrors: true,
      disableWebSecurity: true
    },
    timeoutInMilliseconds: 300_000,
    onProgress: (progressInfo) => {
      const { progress, renderedFrames } = progressInfo;
      if (typeof input.onProgress === "function") {
        input.onProgress(progressInfo);
      }
      if (typeof context?.onProgress === "function") {
        context.onProgress(progressInfo);
      }
      if (context?.log && Math.round(progress * 100) % 25 === 0) {
        context.log(`[Remotion] Rendering ${compositionId}: ${Math.round(progress * 100)}% (${renderedFrames || 0} frames)`);
      }
    }
  });

  const outputStat = await stat(outputPath);
  const renderTimeMs = Date.now() - startTime;

  return {
    output: outputPath,
    compositionId,
    width: composition.width,
    height: composition.height,
    fps: composition.fps,
    durationFrames: composition.durationInFrames,
    durationMs: Math.round((composition.durationInFrames / composition.fps) * 1000),
    sizeBytes: outputStat.size,
    renderTimeMs
  };
}
