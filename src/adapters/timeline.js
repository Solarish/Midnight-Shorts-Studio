import path from "node:path";
import { createHash } from "node:crypto";
import { seedEditableMogrt } from "./mogrt.js";

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const FRAME_RATE = 25;
const FRAME_MS = 1000 / FRAME_RATE;
const EDITORIAL_KINDS = ["a_roll", "b_roll", "cover_card", "title", "logo_outro"];

export async function createTimelineScene(input, context) {
  requireObject(input, "timeline.scene input");
  if (!input.source) throw new Error("timeline.scene requires with.source");
  if (typeof input.audio !== "boolean") {
    throw new Error("timeline.scene requires with.audio to be a boolean");
  }
  if (input.audioPolicy === undefined || input.audioPolicy === null) {
    throw new Error("timeline.scene requires with.audioPolicy");
  }
  const audioPolicy = enumValue(input.audioPolicy, ["preserve", "mute"], "timeline.scene audioPolicy");
  if (audioPolicy === "preserve" && input.audio !== true) {
    throw new Error("timeline.scene audio must be true when audioPolicy is 'preserve'");
  }
  if (audioPolicy === "mute" && input.audio !== false) {
    throw new Error("timeline.scene audio must be false when audioPolicy is 'mute'");
  }
  const durationMs = positiveFrameTime(input.durationMs, "timeline.scene durationMs");
  const scene = compact({
    id: safeId(input.id ?? `scene_${context.step?.id ?? "item"}`, "timeline.scene id"),
    source: resolveMediaPath(input.source, context),
    startMs: input.startMs === undefined ? undefined : nonNegativeFrameTime(input.startMs, "timeline.scene startMs"),
    sourceInMs: nonNegativeFrameTime(input.sourceInMs ?? 0, "timeline.scene sourceInMs"),
    durationMs,
    track: positiveInteger(input.track ?? 1, "timeline.scene track"),
    audio: input.audio,
    audioPolicy,
    storyboardItemId: optionalId(input.storyboardItemId, "timeline.scene storyboardItemId"),
    editorialKind: input.editorialKind !== undefined ? enumValue(input.editorialKind, EDITORIAL_KINDS, "timeline.scene editorialKind") : undefined,
    parentStoryboardItemId: optionalId(input.parentStoryboardItemId, "timeline.scene parentStoryboardItemId"),
    label: optionalString(input.label, "timeline.scene label")
  });
  return { scene };
}

export async function createTimelineTransition(input, context) {
  requireObject(input, "timeline.transition input");
  const allowed = new Set(["cut", "cross-dissolve", "dip-to-black", "wipe"]);
  const type = input.type ?? "cross-dissolve";
  if (!allowed.has(type)) throw new Error(`Unsupported timeline transition '${type}'`);
  const transition = compact({
    id: safeId(input.id ?? `transition_${context.step?.id ?? "item"}`, "timeline.transition id"),
    type,
    durationMs: type === "cut" ? 0 : positiveFrameTime(input.durationMs, "timeline.transition durationMs"),
    fromScene: optionalId(input.fromScene, "timeline.transition fromScene"),
    toScene: optionalId(input.toScene, "timeline.transition toScene"),
    alignment: enumValue(input.alignment ?? "center", ["start", "center", "end"], "timeline.transition alignment")
  });
  return { transition };
}

export async function createTimelineOverlay(input, context) {
  requireObject(input, "timeline.overlay input");
  if (!input.asset && !input.text) throw new Error("timeline.overlay requires with.asset or with.text");
  if (input.asset && input.text) throw new Error("timeline.overlay accepts only one of with.asset or with.text");
  if (input.audioPolicy === undefined || input.audioPolicy === null) {
    throw new Error("timeline.overlay requires with.audioPolicy");
  }
  if (input.audioPolicy !== "mute") {
    throw new Error("timeline.overlay with.audioPolicy must equal 'mute'");
  }
  const overlay = compact({
    id: safeId(input.id ?? `overlay_${context.step?.id ?? "item"}`, "timeline.overlay id"),
    asset: input.asset ? resolveMediaPath(input.asset, context) : undefined,
    text: optionalString(input.text, "timeline.overlay text"),
    startMs: nonNegativeFrameTime(input.startMs ?? 0, "timeline.overlay startMs"),
    durationMs: positiveFrameTime(input.durationMs, "timeline.overlay durationMs"),
    track: positiveInteger(input.track ?? 2, "timeline.overlay track"),
    position: validatePosition(input.position),
    scale: positiveNumber(input.scale ?? 1, "timeline.overlay scale"),
    opacity: rangeNumber(input.opacity ?? 1, 0, 1, "timeline.overlay opacity"),
    transformExplicit: input.position !== undefined || input.scale !== undefined || input.opacity !== undefined,
    audioPolicy: "mute",
    storyboardItemId: optionalId(input.storyboardItemId, "timeline.overlay storyboardItemId"),
    editorialKind: input.editorialKind !== undefined ? enumValue(input.editorialKind, EDITORIAL_KINDS, "timeline.overlay editorialKind") : undefined,
    parentStoryboardItemId: optionalId(input.parentStoryboardItemId, "timeline.overlay parentStoryboardItemId")
  });
  return { overlay };
}

export async function createTimelineGraphicMogrt(input, context) {
  requireObject(input, "timeline.graphic_mogrt input");
  const text = stringRecord(input.text, "timeline.graphic_mogrt text");
  if (!Object.keys(text).length) throw new Error("timeline.graphic_mogrt requires at least one editable text field");
  const bindingMode = enumValue(input.bindingMode ?? "runtime", ["runtime", "preseeded"], "timeline.graphic_mogrt bindingMode");
  const templatePath = resolveMediaPath(input.mogrtPath, context);
  let mogrtPath = templatePath;
  let seedReceipt;
  if (bindingMode === "preseeded") {
    if (typeof input.seededOutput !== "string" || !input.seededOutput.trim()) throw new Error("timeline.graphic_mogrt preseeded mode requires with.seededOutput");
    mogrtPath = path.isAbsolute(input.seededOutput) ? input.seededOutput : context.resolveRunPath(input.seededOutput);
    if (context.dryRun) {
      seedReceipt = {
        schemaVersion: 1,
        mode: "preseeded",
        planned: true,
        templatePath,
        outputPath: mogrtPath,
        text,
        textDigest: createHash("sha256").update(JSON.stringify(sortObject(text))).digest("hex"),
        parameterNames: Object.values(input.parameterMap ?? {}).sort()
      };
    } else {
      seedReceipt = await seedEditableMogrt({ templatePath, outputPath: mogrtPath, text, parameterMap: input.parameterMap }, { timeoutMs: context.timeoutMs });
    }
  }
  const graphic = compact({
    id: safeId(input.id ?? `graphic_${context.step?.id ?? "item"}`, "timeline.graphic_mogrt id"),
    mogrtPath,
    startMs: nonNegativeFrameTime(input.startMs ?? 0, "timeline.graphic_mogrt startMs"),
    durationMs: positiveFrameTime(input.durationMs, "timeline.graphic_mogrt durationMs"),
    track: positiveInteger(input.track ?? 4, "timeline.graphic_mogrt track"),
    text,
    parameterMap: input.parameterMap === undefined ? undefined : stringRecord(input.parameterMap, "timeline.graphic_mogrt parameterMap"),
    bindingMode,
    seedReceipt,
    audioPolicy: "mute",
    storyboardItemId: optionalId(input.storyboardItemId, "timeline.graphic_mogrt storyboardItemId"),
    editorialKind: input.editorialKind !== undefined ? enumValue(input.editorialKind, EDITORIAL_KINDS, "timeline.graphic_mogrt editorialKind") : undefined
  });
  return { graphic };
}

export async function createTimelineDynamicLink(input, context) {
  requireObject(input, "timeline.dynamic_link input");
  if (input.id === undefined || input.id === null) throw new Error("timeline.dynamic_link requires with.id");
  if (input.project === undefined || input.project === null) throw new Error("timeline.dynamic_link requires with.project");
  if (typeof input.project !== "string" || !path.isAbsolute(input.project)) {
    throw new Error("timeline.dynamic_link with.project must be an absolute path");
  }
  if (input.composition === undefined || input.composition === null) throw new Error("timeline.dynamic_link requires with.composition");
  if (input.startMs === undefined || input.startMs === null) throw new Error("timeline.dynamic_link requires with.startMs");
  if (input.durationMs === undefined || input.durationMs === null) throw new Error("timeline.dynamic_link requires with.durationMs");
  if (input.track === undefined || input.track === null) throw new Error("timeline.dynamic_link requires with.track");
  if (input.audioPolicy === undefined || input.audioPolicy === null) throw new Error("timeline.dynamic_link requires with.audioPolicy");
  if (input.audioPolicy !== "mute") throw new Error("timeline.dynamic_link with.audioPolicy must equal 'mute'");
  const dynamicLink = compact({
    id: safeId(input.id, "timeline.dynamic_link id"),
    project: absoluteString(input.project, "timeline.dynamic_link project"),
    composition: nonEmptyString(input.composition, "timeline.dynamic_link composition"),
    startMs: nonNegativeFrameTime(input.startMs, "timeline.dynamic_link startMs"),
    durationMs: positiveFrameTime(input.durationMs, "timeline.dynamic_link durationMs"),
    track: positiveInteger(input.track, "timeline.dynamic_link track"),
    audioPolicy: "mute",
    storyboardItemId: optionalId(input.storyboardItemId, "timeline.dynamic_link storyboardItemId"),
    editorialKind: input.editorialKind !== undefined ? enumValue(input.editorialKind, EDITORIAL_KINDS, "timeline.dynamic_link editorialKind") : undefined,
    parentStoryboardItemId: optionalId(input.parentStoryboardItemId, "timeline.dynamic_link parentStoryboardItemId")
  });
  return { dynamicLink };
}

export async function composeTimeline(input) {
  requireObject(input, "timeline.compose input");
  if (!Array.isArray(input.scenes) || input.scenes.length === 0) {
    throw new Error("timeline.compose requires a non-empty with.scenes array");
  }
  const sceneDrafts = input.scenes.flat(Infinity).map((value, index) => validateScene(value, index));
  const ids = new Set();
  for (const scene of sceneDrafts) {
    if (ids.has(scene.id)) throw new Error(`timeline.compose duplicates scene id '${scene.id}'`);
    ids.add(scene.id);
  }
  const transitions = (input.transitions ?? []).map((value, index) => validateTransition(value, index, ids, sceneDrafts));
  const transitionPairs = indexTransitions(transitions);
  const scenes = placeScenes(sceneDrafts, transitionPairs);
  validateSceneCollisions(scenes, transitionPairs);
  const overlays = (input.overlays ?? []).flat(Infinity).map((value, index) => validateOverlay(value, index));
  const graphics = (input.graphics ?? []).flat(Infinity).map((value, index) => validateGraphic(value, index));
  const dynamicLinks = input.dynamicLinks !== undefined
    ? (input.dynamicLinks ?? []).flat(Infinity).map((value, index) => validateDynamicLink(value, index))
    : undefined;
  if (dynamicLinks) {
    const dlIds = new Set();
    for (const link of dynamicLinks) {
      if (ids.has(link.id)) throw new Error(`timeline.compose duplicates item id '${link.id}'`);
      if (dlIds.has(link.id)) throw new Error(`TimelineSpec duplicates dynamicLink id '${link.id}'`);
      dlIds.add(link.id);
      ids.add(link.id);
    }
  }
  const audio = (input.audio ?? []).flat(Infinity).map((value, index) => validateAudio(value, index));
  const durationMs = Math.max(...scenes.map((scene) => scene.startMs + scene.durationMs), 0);
  validateOverlayBoundsAndCollisions(overlays, durationMs);
  validateTimedItems(graphics, durationMs, "graphic");
  if (dynamicLinks) validateDynamicLinkBoundsAndCollisions(dynamicLinks, durationMs);
  validateAudioBounds(audio, durationMs);
  return {
    timelineSpec: compact({
      schemaVersion: 1,
      name: optionalString(input.name, "timeline.compose name") ?? "AUTO_TIMELINE",
      width: positiveInteger(input.width ?? 1920, "timeline.compose width"),
      height: positiveInteger(input.height ?? 1080, "timeline.compose height"),
      frameRate: exactFrameRate(input.frameRate ?? FRAME_RATE),
      durationMs,
      scenes,
      transitions,
      overlays,
      graphics,
      dynamicLinks,
      audio
    })
  };
}

export function validateTimelineSpec(value) {
  requireObject(value, "TimelineSpec");
  if (value.schemaVersion !== 1) throw new Error("TimelineSpec schemaVersion must equal 1");
  return composeTimeline(value).then(({ timelineSpec }) => timelineSpec);
}

function validateScene(value, index) {
  requireObject(value, `TimelineSpec scenes[${index}]`);
  if (!value.source) throw new Error(`TimelineSpec scenes[${index}].source is required`);
  if (typeof value.audio !== "boolean") {
    throw new Error(`TimelineSpec scenes[${index}].audio must be a boolean`);
  }
  if (value.audioPolicy === undefined || value.audioPolicy === null) {
    throw new Error(`TimelineSpec scenes[${index}].audioPolicy is required`);
  }
  const audioPolicy = enumValue(value.audioPolicy, ["preserve", "mute"], `TimelineSpec scenes[${index}].audioPolicy`);
  if (audioPolicy === "preserve" && value.audio !== true) {
    throw new Error(`TimelineSpec scenes[${index}].audio must be true when audioPolicy is 'preserve'`);
  }
  if (audioPolicy === "mute" && value.audio !== false) {
    throw new Error(`TimelineSpec scenes[${index}].audio must be false when audioPolicy is 'mute'`);
  }
  return compact({
    id: safeId(value.id, `TimelineSpec scenes[${index}].id`),
    source: absoluteString(value.source, `TimelineSpec scenes[${index}].source`),
    startMs: value.startMs === undefined ? undefined : nonNegativeFrameTime(value.startMs, `TimelineSpec scenes[${index}].startMs`),
    sourceInMs: nonNegativeFrameTime(value.sourceInMs ?? 0, `TimelineSpec scenes[${index}].sourceInMs`),
    durationMs: positiveFrameTime(value.durationMs, `TimelineSpec scenes[${index}].durationMs`),
    track: positiveInteger(value.track ?? 1, `TimelineSpec scenes[${index}].track`),
    audio: value.audio,
    audioPolicy,
    storyboardItemId: optionalId(value.storyboardItemId, `TimelineSpec scenes[${index}].storyboardItemId`),
    editorialKind: value.editorialKind !== undefined ? enumValue(value.editorialKind, EDITORIAL_KINDS, `TimelineSpec scenes[${index}].editorialKind`) : undefined,
    parentStoryboardItemId: optionalId(value.parentStoryboardItemId, `TimelineSpec scenes[${index}].parentStoryboardItemId`),
    jCutLeadMs: value.jCutLeadMs ? nonNegativeFrameTime(value.jCutLeadMs, `TimelineSpec scenes[${index}].jCutLeadMs`) : undefined,
    lCutLagMs: value.lCutLagMs ? nonNegativeFrameTime(value.lCutLagMs, `TimelineSpec scenes[${index}].lCutLagMs`) : undefined,
    label: optionalString(value.label, `TimelineSpec scenes[${index}].label`)
  });
}

function validateTransition(value, index, sceneIds, scenes) {
  requireObject(value, `TimelineSpec transitions[${index}]`);
  const type = enumValue(value.type, ["cut", "cross-dissolve", "dip-to-black", "wipe"], `TimelineSpec transitions[${index}].type`);
  if ((value.fromScene === undefined) !== (value.toScene === undefined)) {
    throw new Error(`TimelineSpec transitions[${index}] must provide both fromScene and toScene, or neither`);
  }
  const inferredFrom = scenes[index]?.id;
  const inferredTo = scenes[index + 1]?.id;
  const fromScene = optionalId(value.fromScene ?? inferredFrom, `TimelineSpec transitions[${index}].fromScene`);
  const toScene = optionalId(value.toScene ?? inferredTo, `TimelineSpec transitions[${index}].toScene`);
  if (!fromScene || !toScene) throw new Error(`TimelineSpec transitions[${index}] does not map to an adjacent scene pair`);
  if (fromScene && !sceneIds.has(fromScene)) throw new Error(`TimelineSpec transition references unknown scene '${fromScene}'`);
  if (toScene && !sceneIds.has(toScene)) throw new Error(`TimelineSpec transition references unknown scene '${toScene}'`);
  const fromIndex = scenes.findIndex((scene) => scene.id === fromScene);
  const toIndex = scenes.findIndex((scene) => scene.id === toScene);
  if (toIndex !== fromIndex + 1) throw new Error(`TimelineSpec transition '${fromScene}' to '${toScene}' must reference adjacent scenes`);
  const durationMs = type === "cut" ? 0 : positiveFrameTime(value.durationMs, `TimelineSpec transitions[${index}].durationMs`);
  if (durationMs >= scenes[fromIndex].durationMs || durationMs >= scenes[toIndex].durationMs) {
    throw new Error(`TimelineSpec transition '${fromScene}' to '${toScene}' must be shorter than both scenes`);
  }
  return compact({
    id: safeId(value.id, `TimelineSpec transitions[${index}].id`),
    type,
    durationMs,
    fromScene,
    toScene,
    alignment: enumValue(value.alignment ?? "center", ["start", "center", "end"], `TimelineSpec transitions[${index}].alignment`)
  });
}

function validateOverlay(value, index) {
  requireObject(value, `TimelineSpec overlays[${index}]`);
  if (!value.asset && !value.text) throw new Error(`TimelineSpec overlays[${index}] requires asset or text`);
  if (value.audioPolicy === undefined || value.audioPolicy === null) {
    throw new Error(`TimelineSpec overlays[${index}].audioPolicy is required`);
  }
  if (value.audioPolicy !== "mute") {
    throw new Error(`TimelineSpec overlays[${index}].audioPolicy must equal 'mute'`);
  }
  return compact({
    id: safeId(value.id, `TimelineSpec overlays[${index}].id`),
    asset: value.asset ? absoluteString(value.asset, `TimelineSpec overlays[${index}].asset`) : undefined,
    text: optionalString(value.text, `TimelineSpec overlays[${index}].text`),
    startMs: nonNegativeFrameTime(value.startMs ?? 0, `TimelineSpec overlays[${index}].startMs`),
    durationMs: positiveFrameTime(value.durationMs, `TimelineSpec overlays[${index}].durationMs`),
    track: positiveInteger(value.track ?? 2, `TimelineSpec overlays[${index}].track`),
    position: validatePosition(value.position),
    scale: positiveNumber(value.scale ?? 1, `TimelineSpec overlays[${index}].scale`),
    opacity: rangeNumber(value.opacity ?? 1, 0, 1, `TimelineSpec overlays[${index}].opacity`),
    transformExplicit: value.transformExplicit === true,
    audioPolicy: "mute",
    storyboardItemId: optionalId(value.storyboardItemId, `TimelineSpec overlays[${index}].storyboardItemId`),
    editorialKind: value.editorialKind !== undefined ? enumValue(value.editorialKind, EDITORIAL_KINDS, `TimelineSpec overlays[${index}].editorialKind`) : undefined,
    parentStoryboardItemId: optionalId(value.parentStoryboardItemId, `TimelineSpec overlays[${index}].parentStoryboardItemId`),
    jCutLeadMs: value.jCutLeadMs ? nonNegativeFrameTime(value.jCutLeadMs, `TimelineSpec overlays[${index}].jCutLeadMs`) : undefined,
    lCutLagMs: value.lCutLagMs ? nonNegativeFrameTime(value.lCutLagMs, `TimelineSpec overlays[${index}].lCutLagMs`) : undefined
  });
}

function validateDynamicLink(value, index) {
  requireObject(value, `TimelineSpec dynamicLinks[${index}]`);
  if (value.id === undefined || value.id === null) throw new Error(`TimelineSpec dynamicLinks[${index}].id is required`);
  if (value.project === undefined || value.project === null) throw new Error(`TimelineSpec dynamicLinks[${index}].project is required`);
  if (typeof value.project !== "string" || !path.isAbsolute(value.project)) {
    throw new Error(`TimelineSpec dynamicLinks[${index}].project must be an absolute path`);
  }
  if (value.composition === undefined || value.composition === null) throw new Error(`TimelineSpec dynamicLinks[${index}].composition is required`);
  if (value.startMs === undefined || value.startMs === null) throw new Error(`TimelineSpec dynamicLinks[${index}].startMs is required`);
  if (value.durationMs === undefined || value.durationMs === null) throw new Error(`TimelineSpec dynamicLinks[${index}].durationMs is required`);
  if (value.track === undefined || value.track === null) throw new Error(`TimelineSpec dynamicLinks[${index}].track is required`);
  if (value.audioPolicy === undefined || value.audioPolicy === null) throw new Error(`TimelineSpec dynamicLinks[${index}].audioPolicy is required`);
  if (value.audioPolicy !== "mute") {
    throw new Error(`TimelineSpec dynamicLinks[${index}].audioPolicy must equal 'mute'`);
  }
  return compact({
    id: safeId(value.id, `TimelineSpec dynamicLinks[${index}].id`),
    project: absoluteString(value.project, `TimelineSpec dynamicLinks[${index}].project`),
    composition: nonEmptyString(value.composition, `TimelineSpec dynamicLinks[${index}].composition`),
    startMs: nonNegativeFrameTime(value.startMs, `TimelineSpec dynamicLinks[${index}].startMs`),
    durationMs: positiveFrameTime(value.durationMs, `TimelineSpec dynamicLinks[${index}].durationMs`),
    track: positiveInteger(value.track, `TimelineSpec dynamicLinks[${index}].track`),
    audioPolicy: "mute",
    storyboardItemId: optionalId(value.storyboardItemId, `TimelineSpec dynamicLinks[${index}].storyboardItemId`),
    editorialKind: value.editorialKind !== undefined ? enumValue(value.editorialKind, EDITORIAL_KINDS, `TimelineSpec dynamicLinks[${index}].editorialKind`) : undefined,
    parentStoryboardItemId: optionalId(value.parentStoryboardItemId, `TimelineSpec dynamicLinks[${index}].parentStoryboardItemId`)
  });
}

function validateGraphic(value, index) {
  requireObject(value, `TimelineSpec graphics[${index}]`);
  const text = stringRecord(value.text, `TimelineSpec graphics[${index}].text`);
  if (!Object.keys(text).length) throw new Error(`TimelineSpec graphics[${index}].text requires at least one field`);
  const bindingMode = enumValue(value.bindingMode ?? "runtime", ["runtime", "preseeded"], `TimelineSpec graphics[${index}].bindingMode`);
  if (bindingMode === "preseeded") {
    requireObject(value.seedReceipt, `TimelineSpec graphics[${index}].seedReceipt`);
    if (value.seedReceipt.mode !== "preseeded") throw new Error(`TimelineSpec graphics[${index}].seedReceipt.mode must equal preseeded`);
    if (value.seedReceipt.outputPath !== value.mogrtPath) throw new Error(`TimelineSpec graphics[${index}] seeded output path does not match mogrtPath`);
    if (!Array.isArray(value.seedReceipt.parameterNames) || value.seedReceipt.parameterNames.length !== Object.keys(text).length) {
      throw new Error(`TimelineSpec graphics[${index}] seedReceipt parameter count mismatch`);
    }
  }
  return compact({
    id: safeId(value.id, `TimelineSpec graphics[${index}].id`),
    mogrtPath: absoluteString(value.mogrtPath, `TimelineSpec graphics[${index}].mogrtPath`),
    startMs: nonNegativeFrameTime(value.startMs, `TimelineSpec graphics[${index}].startMs`),
    durationMs: positiveFrameTime(value.durationMs, `TimelineSpec graphics[${index}].durationMs`),
    track: positiveInteger(value.track ?? 4, `TimelineSpec graphics[${index}].track`),
    text,
    parameterMap: value.parameterMap === undefined ? undefined : stringRecord(value.parameterMap, `TimelineSpec graphics[${index}].parameterMap`),
    bindingMode,
    seedReceipt: value.seedReceipt,
    audioPolicy: "mute",
    storyboardItemId: optionalId(value.storyboardItemId, `TimelineSpec graphics[${index}].storyboardItemId`),
    editorialKind: value.editorialKind !== undefined ? enumValue(value.editorialKind, EDITORIAL_KINDS, `TimelineSpec graphics[${index}].editorialKind`) : undefined
  });
}

function validateAudio(value, index) {
  const candidate = value?.audio ?? value;
  requireObject(candidate, `TimelineSpec audio[${index}]`);
  return compact({
    id: safeId(candidate.id, `TimelineSpec audio[${index}].id`),
    path: absoluteString(candidate.path, `TimelineSpec audio[${index}].path`),
    role: enumValue(candidate.role ?? "music", ["dialogue", "voiceover", "music", "effects"], `TimelineSpec audio[${index}].role`),
    startMs: nonNegativeFrameTime(candidate.startMs ?? 0, `TimelineSpec audio[${index}].startMs`),
    gainDb: finiteNumber(candidate.gainDb ?? 0, `TimelineSpec audio[${index}].gainDb`),
    durationMs: candidate.durationMs === undefined ? undefined : positiveFrameTime(candidate.durationMs, `TimelineSpec audio[${index}].durationMs`)
  });
}

function indexTransitions(transitions) {
  const pairs = new Map();
  for (const transition of transitions) {
    const key = `${transition.fromScene}->${transition.toScene}`;
    if (pairs.has(key)) throw new Error(`TimelineSpec duplicates transition '${key}'`);
    pairs.set(key, transition);
  }
  return pairs;
}

function placeScenes(drafts, transitionPairs) {
  const scenes = [];
  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index];
    let startMs = draft.startMs;
    if (startMs === undefined) {
      if (index === 0) startMs = 0;
      else {
        const previous = scenes[index - 1];
        const transition = transitionPairs.get(`${previous.id}->${draft.id}`);
        startMs = previous.startMs + previous.durationMs - (transition?.durationMs ?? 0);
      }
    }
    const scene = { ...draft, startMs };
    if (index > 0) {
      const previous = scenes[index - 1];
      const transition = transitionPairs.get(`${previous.id}->${scene.id}`);
      if (transition) {
        const overlapMs = previous.startMs + previous.durationMs - scene.startMs;
        if (overlapMs !== transition.durationMs) {
          throw new Error(`TimelineSpec transition '${previous.id}' to '${scene.id}' requires exactly ${transition.durationMs}ms overlap`);
        }
      }
    }
    scenes.push(scene);
  }
  return scenes;
}

function validateSceneCollisions(scenes, transitionPairs) {
  for (let left = 0; left < scenes.length; left += 1) {
    for (let right = left + 1; right < scenes.length; right += 1) {
      const first = scenes[left];
      const second = scenes[right];
      if (first.track !== second.track) continue;
      const overlapMs = intervalOverlap(first, second);
      if (overlapMs <= 0) continue;
      const transition = transitionPairs.get(`${first.id}->${second.id}`);
      if (right !== left + 1 || !transition || transition.durationMs !== overlapMs) {
        throw new Error(`TimelineSpec scenes '${first.id}' and '${second.id}' collide on track ${first.track}`);
      }
    }
  }
}

function validateOverlayBoundsAndCollisions(overlays, durationMs) {
  for (const overlay of overlays) {
    if (overlay.startMs + overlay.durationMs > durationMs) {
      throw new Error(`TimelineSpec overlay '${overlay.id}' exceeds timeline bounds`);
    }
  }
  for (let left = 0; left < overlays.length; left += 1) {
    for (let right = left + 1; right < overlays.length; right += 1) {
      if (overlays[left].track === overlays[right].track && intervalOverlap(overlays[left], overlays[right]) > 0) {
        throw new Error(`TimelineSpec overlays '${overlays[left].id}' and '${overlays[right].id}' collide on track ${overlays[left].track}`);
      }
    }
  }
}

function validateDynamicLinkBoundsAndCollisions(dynamicLinks, durationMs) {
  for (const link of dynamicLinks) {
    if (link.startMs + link.durationMs > durationMs) {
      throw new Error(`TimelineSpec dynamicLink '${link.id}' exceeds timeline bounds`);
    }
  }
  for (let left = 0; left < dynamicLinks.length; left += 1) {
    for (let right = left + 1; right < dynamicLinks.length; right += 1) {
      if (dynamicLinks[left].track === dynamicLinks[right].track && intervalOverlap(dynamicLinks[left], dynamicLinks[right]) > 0) {
        throw new Error(`TimelineSpec dynamicLinks '${dynamicLinks[left].id}' and '${dynamicLinks[right].id}' collide on track ${dynamicLinks[left].track}`);
      }
    }
  }
}

function validateTimedItems(items, durationMs, kind) {
  for (const item of items) {
    if (item.startMs + item.durationMs > durationMs) throw new Error(`TimelineSpec ${kind} '${item.id}' exceeds timeline bounds`);
  }
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      if (items[left].track === items[right].track && intervalOverlap(items[left], items[right]) > 0) {
        throw new Error(`TimelineSpec ${kind}s '${items[left].id}' and '${items[right].id}' collide on track ${items[left].track}`);
      }
    }
  }
}

function validateAudioBounds(audio, durationMs) {
  for (const entry of audio) {
    if (entry.startMs > durationMs || (entry.durationMs !== undefined && entry.startMs + entry.durationMs > durationMs)) {
      throw new Error(`TimelineSpec audio '${entry.id}' exceeds timeline bounds`);
    }
  }
}

function intervalOverlap(left, right) {
  return Math.min(left.startMs + left.durationMs, right.startMs + right.durationMs) - Math.max(left.startMs, right.startMs);
}

function resolveMediaPath(value, context) {
  if (typeof value !== "string" || !value) throw new Error("Media path must be a non-empty string");
  if (path.isAbsolute(value)) return value;
  return value.startsWith("outputs/") ? context.resolveRunPath(value) : context.resolvePath(value);
}

function validatePosition(value) {
  if (value === undefined) return { x: 0.5, y: 0.5 };
  requireObject(value, "overlay position");
  return {
    x: rangeNumber(value.x, 0, 1, "overlay position.x"),
    y: rangeNumber(value.y, 0, 1, "overlay position.y")
  };
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function safeId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function optionalId(value, label) {
  return value === undefined ? undefined : safeId(value, label);
}

function optionalString(value, label) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

function stringRecord(value, label) {
  requireObject(value, label);
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (!key.trim() || typeof item !== "string") throw new Error(`${label} values must be strings`);
    output[key] = item;
  }
  return output;
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function absoluteString(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error(`${label} must be an absolute path`);
  return value;
}

function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
}

function nonNegativeNumber(value, label) {
  const number = finiteNumber(value, label);
  if (number < 0) throw new Error(`${label} must be non-negative`);
  return number;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (number <= 0) throw new Error(`${label} must be greater than zero`);
  return number;
}

function nonNegativeFrameTime(value, label) {
  return frameTime(nonNegativeNumber(value, label), label);
}

function positiveFrameTime(value, label) {
  return frameTime(positiveNumber(value, label), label);
}

function frameTime(value, label) {
  if (!Number.isInteger(value / FRAME_MS)) throw new Error(`${label} must align to ${FRAME_MS}ms frames at ${FRAME_RATE}fps`);
  return value;
}

function exactFrameRate(value) {
  if (value !== FRAME_RATE) throw new Error(`timeline.compose frameRate must equal ${FRAME_RATE}`);
  return FRAME_RATE;
}

function positiveInteger(value, label) {
  const number = positiveNumber(value, label);
  if (!Number.isInteger(number)) throw new Error(`${label} must be an integer`);
  return number;
}

function rangeNumber(value, minimum, maximum, label) {
  const number = finiteNumber(value, label);
  if (number < minimum || number > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  return number;
}

function enumValue(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label} must be one of ${allowed.join(", ")}`);
  return value;
}
