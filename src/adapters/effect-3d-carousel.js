import { createHash } from "node:crypto";
import path from "node:path";

/**
 * Executes a Parametric 3D Photo Carousel Assembly.
 * 
 * Supports:
 * - Dynamic 1..N media array input with loop, ping-pong, and shuffle cycling across 21 slots.
 * - Dynamic typography mapping (Text 1..5).
 * - Per-photo and total sequence timing/pacing parameters.
 * - Theme and color styling overrides.
 */
export async function runEffect3DCarousel(input, context) {
  const mediaInput = input.media ?? input.paths ?? input.footage ?? [];
  const rawList = flattenMediaPaths(mediaInput);

  const resolvedMedia = rawList.map((p) => resolveInputPath(p, context));
  if (resolvedMedia.length === 0) {
    resolvedMedia.push(context.resolvePath("assets/input/prototype-presenter.png"));
  }

  const cycleMode = input.cycleMode || "loop";
  if (!["loop", "ping_pong", "shuffle"].includes(cycleMode)) {
    throw new Error("effect.3d_carousel cycleMode must be loop, ping_pong, or shuffle");
  }
  const mediaFit = input.mediaFit || "cover";
  if (!["cover", "contain", "center"].includes(mediaFit)) {
    throw new Error("effect.3d_carousel mediaFit must be cover, contain, or center");
  }
  const numSlots = 21;
  const slotMap = {};

  let orderedList = [...resolvedMedia];
  if (cycleMode === "shuffle" && orderedList.length > 1) {
    orderedList = deterministicShuffle(orderedList, input.outputProject || "carousel");
  }

  for (let i = 0; i < numSlots; i++) {
    const slotName = `Media ${i + 1}`;
    let src;
    if (cycleMode === "ping_pong" && orderedList.length > 1) {
      const cycleLen = (orderedList.length - 1) * 2;
      const mod = i % cycleLen;
      const idx = mod < orderedList.length ? mod : cycleLen - mod;
      src = orderedList[idx];
    } else {
      src = orderedList[i % orderedList.length];
    }
    slotMap[slotName] = src;
  }

  // 2. Resolve Text Slots (Text 1..5)
  const inputTexts = input.texts ?? input.text ?? {};
  const textMap = {};
  for (let t = 1; t <= 5; t++) {
    const key = `Text ${t}`;
    textMap[key] = inputTexts[key] !== undefined ? String(inputTexts[key]) : "";
  }
  if (typeof inputTexts === "object" && inputTexts !== null) {
    for (const [k, v] of Object.entries(inputTexts)) {
      if (!textMap[k]) textMap[k] = String(v);
    }
  }

  const outputProject = input.outputProject
    ? (path.isAbsolute(input.outputProject) ? input.outputProject : context.resolveRunPath(input.outputProject))
    : context.resolveRunPath("projects/3d-carousel-composite.json");
  const composition = input.composition || "Main";
  const payload = {
    schemaVersion: 1,
    composition,
    outputProject,
    text: textMap,
    footage: slotMap,
    mediaFit,
    timing: input.timing || {},
    styling: input.styling || {}
  };

  return {
    dryRun: Boolean(context?.dryRun),
    project: outputProject,
    composition,
    payload,
    job: payload,
    mediaCount: resolvedMedia.length
  };
}

function flattenMediaPaths(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenMediaPaths(item, result);
    return result;
  }
  if (typeof value === "string") {
    if (value.trim()) result.push(value.trim());
    return result;
  }
  if (value !== undefined && value !== null) {
    throw new Error("effect.3d_carousel media must contain only file path strings");
  }
  return result;
}

function deterministicShuffle(list, seed) {
  const copy = [...list];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.abs(hash + i) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function resolveInputPath(value, context) {
  if (path.isAbsolute(value)) return value;
  const runRelative = context.resolveRunPath(value);
  const configRelative = context.resolvePath(value);
  return value.startsWith("outputs/") ? runRelative : configRelative;
}
