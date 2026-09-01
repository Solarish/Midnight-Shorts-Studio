import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_ENTRY = path.resolve(__dirname, "../../apps/remotion-studio/src/index.ts");

let cachedBundlePromise = null;
let cachedBundlePath = null;

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

  // 1. Bundle Remotion Studio
  const bundleLocation = await getStudioBundle();

  // 2. Inspect Composition Metadata
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps: props
  });

  // 3. Execute Real Video Rendering via Headless Chrome & FFmpeg
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: input.codec || "h264",
    outputLocation: outputPath,
    inputProps: props,
    crf: input.crf ?? 18,
    imageFormat: "jpeg",
    concurrency: input.concurrency ?? 2,
    timeoutInMilliseconds: 300_000,
    onProgress: ({ progress }) => {
      if (context?.log && Math.round(progress * 100) % 25 === 0) {
        context.log(`[Remotion] Rendering ${compositionId}: ${Math.round(progress * 100)}%`);
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
