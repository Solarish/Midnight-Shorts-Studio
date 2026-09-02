import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { coverCardMissingFields } from "@psu-ava/contracts";
import type {
  ApprovedStoryboardVersionV2,
  GraphDefinitionV1,
  GraphEdgeV1,
  GraphNodeV1,
  StoryboardCompilationV2,
  StoryboardDiagnosticV2,
  StoryboardDocxImportV2,
  StoryboardItemV2,
  StoryboardProposalV2,
  StoryboardRawRowV2,
  StoryboardSpecV2
} from "@psu-ava/contracts";
type CoverPromptParts = { place?: string; time?: string; color?: string; lighting?: string; composition?: string; style?: string; detail?: string };
type DoodlePromptParts = { subject?: string; treatment?: string; placement?: string; density?: string; color?: string; style?: string; detail?: string; scale?: string; safeArea?: string };


const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const FRAME_MS = 40;

export const COVER_PROMPT_DEFAULTS: Required<CoverPromptParts> = {
  place: "professional university broadcast studio environment",
  time: "quiet daytime interior with warm natural ambient light",
  color: "deep navy, warm gold and subtle teal color palette",
  lighting: "controlled cinematic lighting with soft warm practical highlights",
  composition: "wide architectural perspective with clean negative space on the left for title overlay and visual detail on the right",
  style: "realistic editorial documentary photography",
  detail: "sharp focus across the full scene, crisp fine details, high resolution"
};
/** Backward-compatible export for graph consumers; content is now neutral and grouped. */
export const COVER_VISUAL_DIRECTION = Object.values(COVER_PROMPT_DEFAULTS).join(". ") + ".";

/**
 * Cover background generation prompt:
 * The user prompt is a short style/subject direction. The invariant template
 * keeps the output a clean background with negative space and no people/text.
 */
export function buildCoverGenerationPrompt(userPrompt?: string | CoverPromptParts): string {
  const parts = typeof userPrompt === "object" && userPrompt ? { ...COVER_PROMPT_DEFAULTS, ...userPrompt } : COVER_PROMPT_DEFAULTS;
  const direction = typeof userPrompt === "string" ? sanitizeCoverDirection(userPrompt) : "";
  return Object.values(parts).concat(direction ? [direction] : []).filter(Boolean).join(". ") + ".";
}

function sanitizeCoverDirection(value: string): string {
  return value.split(/[.;,]/).map((part) => part.trim()).filter((part) => part && !/\b(psu|z[- ]?image|no|without|not|never|avoid)\b/i.test(part)).join(", ");
}

export function buildCoverDoodlePrompt(userPrompt?: string): string {
  const direction = String(userPrompt ?? "").trim();
  return `Crisp thin white hand-drawn line art on a pure black background, full 1920x1080 canvas, sparse clean strokes, high contrast, no filled white shapes, no gray haze, no people, no faces, no photographic content, no rendered text. User style direction: ${direction || "academic scientific sketch accents"}.`;
}

export function buildDoodleGenerationPrompt(parts?: DoodlePromptParts, customDirection = ""): string {
  const defaults: Required<DoodlePromptParts> = {
    subject: "tiny academic sticker icons, tiny books, stars, pencils and sparkles",
    treatment: "clear filled shapes with crisp hand-drawn marker texture",
    placement: "a balanced ring around the outer edges and corners",
    density: "a handful of small isolated accents with generous spacing",
    color: "white artwork on a pure black matte",
    style: "playful editorial broadcast illustration",
    detail: "recognizable objects, clean silhouettes, high contrast, crisp details",
    scale: "thumbnail-sized accents with varied small scale",
    safeArea: "a large calm open center field reserved for compositing"
  };
  return Object.values({ ...defaults, ...(parts ?? {}) }).concat(customDirection.trim() ? [customDirection.trim()] : []).filter(Boolean).join(". ") + ".";
}

/** Fixed 1:1 custom-doodle recipe. The operator supplies one short subject word only. */
export function buildCustomDoodlePrompt(value: string): string {
  const word = String(value).trim().split(/\s+/)[0]?.replace(/[^a-z0-9-]/gi, "") || "star";
  return `one small recognizable ${word} doodle icon, bold black and white marker illustration, clean filled silhouette, isolated centered subject, pure black background, high contrast, crisp edges, transparent-ready matte, simple single-object composition`;
}

/** Generate a fresh ComfyUI seed per run unless the operator explicitly locks one. */
export function resolveCoverSeed(params: Record<string, unknown>, fallback = 42): number {
  if (params.randomSeed === true || params.seedMode === "random") return Math.floor(Math.random() * 2147483646) + 1;
  const seed = Number(params.seed ?? fallback);
  return Number.isFinite(seed) && seed >= 0 ? Math.floor(seed) : fallback;
}

export function canonicalStoryboardJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function storyboardContentDigest(storyboard: StoryboardSpecV2): string {
  const { revision: _revision, ...content } = storyboard;
  return sha256(canonicalStoryboardJson(content));
}

export function mediaCatalogDigest(storyboard: StoryboardSpecV2): string {
  const refs: unknown[] = [];
  for (const item of storyboard.items) {
    if (item.kind === "a_roll") refs.push({ path: item.params.sourcePath, sourceKey: item.params.sourceKey });
    if (item.kind === "cover_card") refs.push({ path: item.params.sourceImage });
    if (item.kind === "logo_outro") refs.push({ path: item.params.sourcePath });
    if (item.kind === "title") refs.push(...asStrings(item.params.media).map((value) => ({ path: value })));
    for (const broll of item.broll ?? []) refs.push({ path: broll.asset.path, sizeBytes: broll.asset.sizeBytes, mtime: broll.asset.mtime });
  }
  return sha256(canonicalStoryboardJson(refs));
}

export async function importDocxStoryboardV2(docxPath: string, timeoutMs = 15_000): Promise<StoryboardDocxImportV2> {
  const resolved = path.resolve(docxPath);
  const source = await readFile(resolved);
  const sourceDigest = sha256(source);
  const xml = await capture("unzip", ["-p", resolved, "word/document.xml"], timeoutMs);
  const parsed = parseStoryboardXmlV2(xml);
  return {
    schemaVersion: 2,
    importId: `import_${sourceDigest.slice(0, 16)}`,
    docxPath: resolved,
    sourceDigest,
    importedAt: new Date().toISOString(),
    ...parsed
  };
}

export function parseStoryboardXmlV2(xml: string): Pick<StoryboardDocxImportV2, "rawRows" | "proposals" | "diagnostics"> {
  const rawRows: StoryboardRawRowV2[] = [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((match, rowIndex) => {
    const cells = [...match[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((cell) => xmlText(cell[0]));
    return { rowIndex, rowNumber: rowIndex + 1, cells, picture: cells[0] ?? "", sound: cells[1] ?? "" };
  });
  const proposals: StoryboardProposalV2[] = [];
  const diagnostics: StoryboardDiagnosticV2[] = [];
  const headerRows = rawRows[0] && /^ภาพ(?:\/ข้อความ)?$/i.test(rawRows[0].picture.replace(/\s+/g, "")) && /^เสียง$/i.test(rawRows[0].sound.replace(/\s+/g, "")) ? 1 : 0;
  let carriedSource = "";
  let interviewIndex = 0;

  for (const row of rawRows) {
    const rowNumber = row.rowNumber - headerRows;
    if (rowNumber < 1) continue;
    let sound = normalizeText(row.sound);
    const clipMatch = sound.match(/\bC\s*(\d{4})\b/i);
    if (clipMatch) carriedSource = `C${clipMatch[1]}`.toUpperCase();
    const ranges = [...sound.matchAll(/(?:(C\d{4})\s*)?(\d{1,2}):(\d{2})\s*(?:-|\s+)\s*(\d{1,2}):(\d{2})/gi)];
    for (const [rangeIndex, match] of ranges.entries()) {
      if (match[1]) carriedSource = match[1].toUpperCase();
      const inMs = (Number(match[2]) * 60 + Number(match[3])) * 1000;
      const outMs = (Number(match[4]) * 60 + Number(match[5])) * 1000;
      if (!carriedSource) {
        diagnostics.push({ code: "missing_clip_id", severity: "blocker", message: "ช่วงเวลาไม่มีรหัสคลิป A-roll", rowNumber });
        continue;
      }
      if (outMs <= inMs) {
        diagnostics.push({ code: "invalid_time_range", severity: "blocker", message: "เวลาออกต้องมากกว่าเวลาเข้า", rowNumber });
        continue;
      }
      const startIndex = (match.index ?? 0) + match[0].length;
      const endIndex = ranges[rangeIndex + 1]?.index ?? sound.length;
      const inherited = !match[1];
      const id = `interview_${String(++interviewIndex).padStart(2, "0")}`;
      proposals.push(proposal(rowNumber, inherited ? 0.72 : 0.96, inherited ? ["timecode", "inherited clip id"] : ["timecode", "explicit clip id"], {
        id,
        kind: "a_roll",
        durationMs: outMs - inMs,
        audioPolicy: "preserve",
        presetId: "a-roll-segment-v1",
        sourceRowNumbers: [rowNumber],
        params: {
          sourceKey: carriedSource,
          sourcePath: "",
          sourceInMs: inMs,
          sourceOutMs: outMs,
          dialogue: sound.slice(startIndex, endIndex).trim(),
          pictureNote: row.picture,
          soundNote: row.sound
        },
        broll: []
      }));
      if (inherited) diagnostics.push({ code: "inherited_clip_id", severity: "warning", message: `ใช้รหัสคลิป ${carriedSource} ต่อเนื่องจากแถวก่อนหน้า`, itemId: id, rowNumber });
    }

    const picture = normalizeText(row.picture);
    const joined = `${picture} ${sound}`.trim();
    if (!joined) continue;
    const isLogo = /logo|โลโก้|พิชัย\s*มงกุฏ|outro|end\s*card|ท้ายรายการ/i.test(joined);
    const isCover = /ภาพปก|ปกคั่น|cover\s*card|cover\s*interstitial|ภาพนิ่ง.*ปก|ความรู้สึก/i.test(picture);
    const isTitle = /ไตเติล|title|photo\s*carousel|carousel/i.test(picture);
    if (isCover) {
      proposals.push(proposal(rowNumber, 0.91, ["explicit cover instruction"], baseEditorialItem(`cover_${rowNumber}`, "cover_card", 6000, "comfy-cover-card-v1", row, { sourceImage: "", prompt: picture, title: sound, seed: rowNumber }, rowNumber)));
    } else if (isLogo) {
      proposals.push(proposal(rowNumber, 0.94, ["logo/outro phrase"], baseEditorialItem(`logo_${rowNumber}`, "logo_outro", 4000, "logo-outro-v1", row, { sourcePath: "", note: joined }, rowNumber)));
    } else if (isTitle) {
      proposals.push(proposal(rowNumber, 0.86, ["explicit title/carousel instruction"], baseEditorialItem(`title_${rowNumber}`, "title", 10000, "3d-carousel-title-v1", row, { composition: "Main", media: [], texts: { title: sound || picture } }, rowNumber)));
    } else if (!ranges.length) {
      proposals.push(proposal(rowNumber, 0.5, ["unclassified editorial row"], {
        id: `note_${rowNumber}`,
        kind: "note",
        durationMs: 0,
        audioPolicy: "mute",
        sourceRowNumbers: [rowNumber],
        params: { text: joined }
      }));
      diagnostics.push({ code: "unclassified_row", severity: "warning", message: "แถวนี้ยังต้องให้ผู้ตัดต่อกำหนดชนิด", itemId: `note_${rowNumber}`, rowNumber });
    }
  }
  return { rawRows, proposals, diagnostics };
}

export function createStoryboardDraftFromImport(input: StoryboardDocxImportV2, storyboardId: string, name?: string): StoryboardSpecV2 {
  if (!SAFE_ID.test(storyboardId)) throw new Error("unsafe storyboard identifier");
  return {
    schemaVersion: 2,
    storyboardId,
    name: name?.trim() || path.basename(input.docxPath, path.extname(input.docxPath)),
    revision: 0,
    profile: { width: 1920, height: 1080, frameRate: 25 },
    sourceImport: { importId: input.importId, docxPath: input.docxPath, sourceDigest: input.sourceDigest, importedAt: input.importedAt },
    items: input.proposals.map((value) => structuredClone(value.item))
  };
}

export function migrateStoryboardV1(value: any, storyboardId: string, importRef: StoryboardSpecV2["sourceImport"]): StoryboardSpecV2 {
  const items: StoryboardItemV2[] = (Array.isArray(value?.segments) ? value.segments : []).map((segment: any, index: number) => ({
    id: safeGeneratedId(segment.id, `interview_${index + 1}`),
    kind: "a_roll",
    durationMs: Number(segment.durationMs ?? Number(segment.sourceOutMs) - Number(segment.sourceInMs)),
    audioPolicy: "preserve",
    presetId: "a-roll-segment-v1",
    sourceRowNumbers: Number.isSafeInteger(segment.rowIndex) ? [segment.rowIndex + 1] : undefined,
    params: { sourceKey: segment.sourceKey ?? "", sourcePath: segment.source ?? "", sourceInMs: segment.sourceInMs, sourceOutMs: segment.sourceOutMs, dialogue: segment.dialogue ?? "" },
    broll: []
  }));
  return { schemaVersion: 2, storyboardId, name: path.basename(value?.source ?? "Imported storyboard"), revision: 0, profile: { width: 1920, height: 1080, frameRate: 25 }, sourceImport: importRef, items };
}

export function validateStoryboardSpec(storyboard: StoryboardSpecV2): StoryboardDiagnosticV2[] {
  const diagnostics: StoryboardDiagnosticV2[] = [];
  if (!storyboard || storyboard.schemaVersion !== 2) return [{ code: "invalid_schema", severity: "blocker", message: "Storyboard schemaVersion ต้องเป็น 2" }];
  if (!SAFE_ID.test(storyboard.storyboardId)) diagnostics.push({ code: "invalid_id", severity: "blocker", message: "storyboardId ไม่ปลอดภัย", path: "/storyboardId" });
  if (!storyboard.name?.trim()) diagnostics.push({ code: "missing_name", severity: "blocker", message: "ต้องตั้งชื่อ Storyboard", path: "/name" });
  if (storyboard.profile.width !== 1920 || storyboard.profile.height !== 1080 || storyboard.profile.frameRate !== 25) diagnostics.push({ code: "invalid_profile", severity: "blocker", message: "Documentary milestone รองรับเฉพาะ 1920x1080 25fps", path: "/profile" });
  if (!storyboard.items.length) diagnostics.push({ code: "empty_storyboard", severity: "blocker", message: "Storyboard ต้องมีอย่างน้อยหนึ่งรายการ", path: "/items" });
  const ids = new Set<string>();
  const validKinds = new Set(["title", "a_roll", "cover_card", "logo_outro", "note"]);
  const ranges = new Map<string, Array<{ id: string; start: number; end: number }>>();
  storyboard.items.forEach((item, index) => {
    const itemPath = `/items/${index}`;
    if (!validKinds.has(item.kind)) {
      diagnostics.push({ code: "invalid_kind", severity: "blocker", message: "ชนิด Storyboard item ไม่รองรับ", itemId: item.id, path: `${itemPath}/kind` });
      return;
    }
    if (!item.params || typeof item.params !== "object" || Array.isArray(item.params)) {
      diagnostics.push({ code: "invalid_params", severity: "blocker", message: "Storyboard item params ต้องเป็น object", itemId: item.id, path: `${itemPath}/params` });
      return;
    }
    if (!SAFE_ID.test(item.id)) diagnostics.push({ code: "invalid_item_id", severity: "blocker", message: "Item ID ใช้อักษร ตัวเลข _ - เท่านั้น", itemId: item.id, path: `${itemPath}/id` });
    if (ids.has(item.id)) diagnostics.push({ code: "duplicate_item_id", severity: "blocker", message: "Item ID ซ้ำ", itemId: item.id, path: `${itemPath}/id` });
    ids.add(item.id);
    if (item.kind === "note") {
      if (item.durationMs !== 0) diagnostics.push({ code: "note_duration", severity: "warning", message: "Note ไม่กินเวลา timeline", itemId: item.id });
      return;
    }
    if (!item.presetId?.trim()) diagnostics.push({ code: "missing_preset", severity: "blocker", message: "Timeline item ต้องเลือก preset", itemId: item.id, path: `${itemPath}/presetId` });
    if (!positiveFrameTime(item.durationMs)) diagnostics.push({ code: "off_frame_duration", severity: "blocker", message: "duration ต้องเป็นจำนวนบวกและตรงเฟรม 25fps", itemId: item.id, path: `${itemPath}/durationMs` });
    const expectedAudio = item.kind === "a_roll" ? "preserve" : "mute";
    if (item.audioPolicy !== expectedAudio) diagnostics.push({ code: "invalid_audio_policy", severity: "blocker", message: `${item.kind} ต้องใช้ audioPolicy=${expectedAudio}`, itemId: item.id, path: `${itemPath}/audioPolicy` });
    if (item.kind === "a_roll") {
      const sourceKey = String(item.params.sourceKey ?? "").trim();
      const sourcePath = String(item.params.sourcePath ?? "").trim();
      const sourceInMs = Number(item.params.sourceInMs);
      const sourceOutMs = Number(item.params.sourceOutMs);
      if (!sourceKey) diagnostics.push({ code: "missing_source_key", severity: "blocker", message: "A-roll ไม่มี sourceKey", itemId: item.id });
      if (!sourcePath) diagnostics.push({ code: "missing_media", severity: "blocker", message: "A-roll ยังไม่ได้เลือกไฟล์ต้นฉบับ", itemId: item.id, path: `${itemPath}/params/sourcePath` });
      if (!nonNegativeFrameTime(sourceInMs) || !positiveFrameTime(sourceOutMs) || sourceOutMs <= sourceInMs) diagnostics.push({ code: "invalid_timecode", severity: "blocker", message: "A-roll in/out ไม่ถูกต้องหรือตกนอกเฟรม", itemId: item.id });
      if (sourceOutMs - sourceInMs !== item.durationMs) diagnostics.push({ code: "duration_mismatch", severity: "blocker", message: "A-roll duration ไม่ตรงกับ source in/out", itemId: item.id });
      const list = ranges.get(sourceKey) ?? [];
      for (const prior of list) {
        if (prior.start === sourceInMs && prior.end === sourceOutMs) diagnostics.push({ code: "duplicate_range", severity: "blocker", message: `ช่วงสัมภาษณ์ซ้ำกับ ${prior.id}`, itemId: item.id });
        else if (Math.max(prior.start, sourceInMs) < Math.min(prior.end, sourceOutMs)) diagnostics.push({ code: "overlapping_range", severity: "warning", message: `ช่วงสัมภาษณ์ทับกับ ${prior.id}`, itemId: item.id });
      }
      list.push({ id: item.id, start: sourceInMs, end: sourceOutMs }); ranges.set(sourceKey, list);
    }
    if (item.kind === "cover_card") {
      const layeredCover = item.presetId === "comfy-cover-card-v2";
      const missing = coverCardMissingFields(item.params, "assets");
      if (missing.includes("sourceImage")) diagnostics.push({ code: "missing_media", severity: "blocker", message: "Cover card ยังไม่ได้เลือกภาพบุคคลต้นฉบับ", itemId: item.id });
      if (missing.includes("prompt")) diagnostics.push({ code: "missing_prompt", severity: "blocker", message: "Cover card ต้องมี prompt หรือ prompt parts", itemId: item.id });
      if (missing.includes("personName")) diagnostics.push({ code: "missing_cover_title", severity: "blocker", message: layeredCover ? "Cover card ต้องมีชื่อบุคคลสำหรับ editable text" : "Cover card ต้องมีข้อความหัวข้อที่จะคอมโพสิตลงภาพ", itemId: item.id });
      if (layeredCover && missing.includes("positionTitle")) diagnostics.push({ code: "missing_cover_position", severity: "blocker", message: "Cover card ต้องมีตำแหน่งหรือหน่วยงานสำหรับ editable text", itemId: item.id });
      if (layeredCover && missing.includes("award")) diagnostics.push({ code: "missing_cover_award", severity: "blocker", message: "Cover card ต้องมีรางวัลหรือเกียรติคุณสำหรับ editable text", itemId: item.id });
    }
    if (item.kind === "logo_outro") {
      const isVideoPreset = item.presetId === "logo-outro-video-v1";
      const source = String(item.params.sourcePath ?? "").trim();
      if (isVideoPreset && !source) {
        diagnostics.push({ code: "missing_media", severity: "blocker", message: "Outro video ยังไม่ได้เลือกไฟล์วิดีโอ", itemId: item.id });
      }
    }
    if (item.kind === "title") {
      const is3DCarousel = item.presetId === "3d-carousel-title-v1" || !item.presetId;
      if (is3DCarousel && !asStrings(item.params.media).length) {
        diagnostics.push({ code: "missing_media", severity: "blocker", message: "3D title ต้องมี media อย่างน้อยหนึ่งรายการ", itemId: item.id });
      }
    }
    if (item.kind !== "a_roll" && (item.broll?.length ?? 0) > 0) diagnostics.push({ code: "invalid_broll_parent", severity: "blocker", message: "B-roll ต้องอยู่ภายใน A-roll เท่านั้น", itemId: item.id });
    for (const [brollIndex, broll] of (item.broll ?? []).entries()) {
      if (!SAFE_ID.test(broll.id) || ids.has(broll.id)) diagnostics.push({ code: "invalid_broll_id", severity: "blocker", message: "B-roll ID ไม่ถูกต้องหรือซ้ำ", itemId: item.id, path: `${itemPath}/broll/${brollIndex}/id` });
      ids.add(broll.id);
      if (!broll.asset.path.trim()) diagnostics.push({ code: "missing_media", severity: "blocker", message: "B-roll ยังไม่ได้เลือกไฟล์", itemId: item.id });
      if (broll.audioPolicy !== "mute") diagnostics.push({ code: "invalid_audio_policy", severity: "blocker", message: "B-roll ต้อง mute", itemId: item.id });
      if (!nonNegativeFrameTime(broll.offsetMs) || !positiveFrameTime(broll.durationMs) || broll.offsetMs + broll.durationMs > item.durationMs) diagnostics.push({ code: "invalid_broll_range", severity: "blocker", message: "ตำแหน่ง B-roll อยู่นอกช่วง A-roll หรือตกนอกเฟรม", itemId: item.id });
    }
  });
  return diagnostics;
}

export async function validateStoryboardMedia(storyboard: StoryboardSpecV2): Promise<StoryboardDiagnosticV2[]> {
  const diagnostics: StoryboardDiagnosticV2[] = [];
  const paths = new Map<string, string>();
  for (const item of storyboard.items) {
    if (item.kind === "a_roll" || item.kind === "logo_outro") paths.set(String(item.params.sourcePath ?? ""), item.id);
    if (item.kind === "cover_card") {
      paths.set(String(item.params.sourceImage ?? ""), item.id);
    }
    if (item.kind === "title") for (const media of asStrings(item.params.media)) paths.set(media, item.id);
    for (const broll of item.broll ?? []) paths.set(broll.asset.path, item.id);
  }
  await Promise.all([...paths].filter(([value]) => value).map(async ([value, itemId]) => {
    try { await access(value); const valueStat = await stat(value); if (!valueStat.isFile()) throw new Error("not a file"); }
    catch { diagnostics.push({ code: "media_not_found", severity: "blocker", message: `ไม่พบไฟล์ ${value}`, itemId }); }
  }));
  return diagnostics;
}

export function createApprovedStoryboard(storyboard: StoryboardSpecV2, version: number, approvedAt = new Date().toISOString()): ApprovedStoryboardVersionV2 {
  return {
    schemaVersion: 2,
    storyboardId: storyboard.storyboardId,
    version,
    sourceRevision: storyboard.revision,
    storyboardDigest: storyboardContentDigest(storyboard),
    sourceDocxDigest: storyboard.sourceImport.sourceDigest,
    mediaCatalogDigest: mediaCatalogDigest(storyboard),
    approvedAt,
    storyboard: structuredClone(storyboard)
  };
}

export function compileApprovedStoryboard(approved: ApprovedStoryboardVersionV2, options: { skipValidation?: boolean } = {}): StoryboardCompilationV2 {
  if (!options.skipValidation && validateStoryboardSpec(approved.storyboard).some((value) => value.severity === "blocker")) throw new Error("Cannot compile an invalid storyboard");
  const nodes: GraphNodeV1[] = [];
  const edges: GraphEdgeV1[] = [];
  const order: string[] = [];
  const provenance: Record<string, string> = {};
  const timeline: StoryboardCompilationV2["timeline"]["items"] = [];
  let cursor = 0;
  let edgeIndex = 0;
  const timelineOutputs: Array<{ nodeId: string; port: string }> = [];
  const addNode = (itemId: string, role: string, type: string, config: Record<string, unknown>, x: number, y: number) => {
    const id = `sb_${safeGeneratedId(itemId, "item")}__${role}`;
    nodes.push({ id, type, config, position: { x, y } }); order.push(id); provenance[id] = itemId; return id;
  };
  const addEdge = (from: string, fromPort: string, to: string, toPort: string) => edges.push({ id: `sb_edge_${++edgeIndex}`, from: { nodeId: from, port: fromPort }, to: { nodeId: to, port: toPort } });

  approved.storyboard.items.forEach((item, itemIndex) => {
    const x = 80 + itemIndex * 280;
    if (item.kind === "note") { addNode(item.id, "note", "storyboard.note", structuredClone(item.params), x, 40); return; }
    const track = item.kind === "cover_card" ? (item.presetId === "comfy-cover-card-v1" ? 2 : 1) : item.kind === "a_roll" || item.kind === "logo_outro" ? 1 : item.kind === "title" ? 3 : 2;
    timeline.push({ itemId: item.id, kind: item.kind, startMs: cursor, durationMs: item.durationMs, audioPolicy: item.audioPolicy, track });
    if (item.kind === "title") {
      const assets = addNode(item.id, "media", "asset.multi_select", { paths: asStrings(item.params.media) }, x, 80);
      const effect = addNode(item.id, "carousel", "effect.3d_carousel", { presetId: item.presetId, durationMs: item.durationMs, media: asStrings(item.params.media), texts: item.params.texts ?? {}, composition: item.params.composition ?? "Main" }, x, 200);
      const placement = addNode(item.id, "graphic_overlay", "timeline.graphic_overlay", { id: safeGeneratedId(item.id, "title"), startMs: cursor, durationMs: item.durationMs, track: 3, composition: item.params.composition ?? "Main", audioPolicy: "mute", storyboardItemId: item.id, editorialKind: "title" }, x, 320);
      addEdge(assets, "mediaList", effect, "media"); addEdge(effect, "graphic", placement, "graphic"); timelineOutputs.push({ nodeId: placement, port: "overlay" });
    } else if (item.kind === "a_roll") {
      const asset = addNode(item.id, "source", "asset.select", { path: item.params.sourcePath }, x, 80);
      const scene = addNode(item.id, "scene", "timeline.scene", { startMs: cursor, durationMs: item.durationMs, sourceInMs: item.params.sourceInMs, track: 1, audio: true, audioPolicy: "preserve", storyboardItemId: item.id, editorialKind: "a_roll" }, x, 200);
      addEdge(asset, "path", scene, "source"); timelineOutputs.push({ nodeId: scene, port: "scene" });
      for (const [brollIndex, broll] of (item.broll ?? []).entries()) {
        const bAsset = addNode(item.id, `broll_${brollIndex + 1}_asset`, "asset.select", { path: broll.asset.path }, x + 100, 440 + brollIndex * 100);
        const overlay = addNode(item.id, `broll_${brollIndex + 1}`, "timeline.overlay", { startMs: cursor + broll.offsetMs, durationMs: broll.durationMs, track: 2, audioPolicy: "mute", fit: broll.fit ?? "cover", storyboardItemId: broll.id, parentStoryboardItemId: item.id, editorialKind: "b_roll" }, x + 100, 500 + brollIndex * 100);
        addEdge(bAsset, "path", overlay, "asset"); timelineOutputs.push({ nodeId: overlay, port: "overlay" });
        timeline.push({ itemId: broll.id, parentItemId: item.id, kind: "b_roll", startMs: cursor + broll.offsetMs, durationMs: broll.durationMs, audioPolicy: "mute", track: 2 });
      }
    } else if (item.kind === "cover_card") {
      const safeId = safeGeneratedId(item.id, "cover");
      const rawPrompt = String(item.params.prompt ?? "");
      const promptInput = item.params.promptParts ?? rawPrompt;
      if (item.presetId === "comfy-cover-card-v1") {
        const asset = addNode(item.id, "source", "asset.select", { path: item.params.sourceImage }, x, 80);
        const cutout = addNode(item.id, "cutout", "image.removeBackground", { path: item.params.sourceImage, output: `media/storyboard-covers/${safeId}/cutout.png` }, x, 180);
        const comfy = addNode(item.id, "generate", "comfyui.workflow", {
          workflowFile: "workflows/generate-cover-zimage.api.json",
          uploads: [{ patch: "10.inputs.image", subfolder: `psu-ava/storyboard-covers/${safeId}`, overwrite: true }],
          patches: { "6.inputs.text": buildCoverGenerationPrompt(promptInput), "3.inputs.seed": resolveCoverSeed(item.params) },
          width: 1344,
          height: 768,
          downloadDir: `media/storyboard-covers/${safeId}`
        }, x, 280);
        const finalCard = addNode(item.id, "title_card", "graphics.cover_title", { output: `media/storyboard-covers/${safeId}/final-titled-cover.png`, eyebrow: String(item.params.eyebrow ?? "อาจารย์ตัวอย่างดีเด่น · ประจำปี 2569"), title: String(item.params.title ?? ""), subtitle: String(item.params.subtitle ?? "มหาวิทยาลัยสงขลานครินทร์") }, x, 360);
        const review = addNode(item.id, "review", "review.media_approval", { storyboardItemId: item.id, sourceImage: item.params.sourceImage, prompt: rawPrompt, seed: item.params.seed, ...(item.params.title !== undefined && String(item.params.title).trim() ? { title: String(item.params.title).trim() } : {}) }, x, 440);
        const overlay = addNode(item.id, "placement", "timeline.overlay", { startMs: cursor, durationMs: item.durationMs, track: 2, audioPolicy: "mute", fit: "cover", storyboardItemId: item.id, editorialKind: "cover_card", ...(item.params.title !== undefined && String(item.params.title).trim() ? { title: String(item.params.title).trim() } : {}) }, x, 540);
        addEdge(asset, "path", cutout, "image"); addEdge(cutout, "image", comfy, "image"); addEdge(comfy, "image", finalCard, "image"); addEdge(finalCard, "image", review, "asset"); addEdge(comfy, "workflowDigest", review, "workflowDigest"); addEdge(review, "approvedAsset", overlay, "asset");
        timelineOutputs.push({ nodeId: overlay, port: "overlay" });
      } else {
      const doodleEnabled = item.params.doodleEnabled === true;
      const doodlePrompt = String(item.params.doodlePrompt ?? "white academic doodle line art distributed across the frame");
      const selectedBackground = String(item.params.backgroundImage ?? "").trim();
      const asset = addNode(item.id, "source", "asset.select", { path: item.params.sourceImage }, x, 80);
      const cutout = addNode(item.id, "cutout", "image.removeBackground", {
        path: item.params.sourceImage,
        output: `media/storyboard-covers/${safeId}/cutout.png`
      }, x, 180);
      const comfy = selectedBackground ? undefined : addNode(item.id, "generate_bg", "comfyui.workflow", {
        workflowFile: "workflows/generate-cover-background-zimage.api.json",
        promptLanguage: "en",
        promptPatch: "6.inputs.text",
        patches: {
          "6.inputs.text": buildCoverGenerationPrompt(promptInput),
          "3.inputs.seed": resolveCoverSeed(item.params)
        },
        width: 1344,
        height: 768,
        downloadDir: `media/storyboard-covers/${safeId}/background`
      }, x, 320);
      const review = selectedBackground ? undefined : addNode(item.id, "review", "review.media_approval", {
        storyboardItemId: item.id,
        sourceImage: item.params.sourceImage,
        prompt: buildCoverGenerationPrompt(promptInput),
        seed: item.params.seed,
        title: String(item.params.personName ?? item.params.title ?? ""),
        layerContract: "remotion-cover-v2"
      }, x, 400);
      const background = addNode(item.id, "background_v1", "timeline.overlay", {
        startMs: cursor,
        durationMs: item.durationMs,
        track: 1,
        audioPolicy: "mute",
        fit: "cover",
        storyboardItemId: item.id,
        editorialKind: "cover_card"
      }, x, 500);
      const person = addNode(item.id, "person_v3", "timeline.overlay", {
        startMs: cursor,
        durationMs: item.durationMs,
        track: 3,
        position: { x: Number(item.params.personX ?? 0.72), y: Number(item.params.personY ?? 0.5) },
        scale: Number(item.params.personScale ?? 1),
        audioPolicy: "mute",
        storyboardItemId: item.id,
        editorialKind: "cover_card"
      }, x + 120, 500);
      const graphic = addNode(item.id, "text_v4", "timeline.graphic_overlay", {
        id: safeGeneratedId(item.id, "cover_text"),
        composition: "CoverCard",
        startMs: cursor,
        durationMs: item.durationMs,
        track: 4,
        graphic: {
          renderer: "remotion",
          presetId: "cover-card-v2",
          text: {
            personName: String(item.params.personName ?? item.params.title ?? ""),
            positionTitle: String(item.params.positionTitle ?? ""),
            award: String(item.params.award ?? "")
          },
          textStyles: item.params.textStyles ?? {},
          layout: {
            personX: Number(item.params.personX ?? 0.72),
            personY: Number(item.params.personY ?? 0.5),
            personScale: Number(item.params.personScale ?? 1)
          }
        },
        storyboardItemId: item.id,
        editorialKind: "cover_card",
        audioPolicy: "mute"
      }, x + 240, 500);
      const backgroundSource = selectedBackground ? addNode(item.id, "background_source", "asset.select", { path: selectedBackground }, x, 260) : undefined;
      addEdge(asset, "path", cutout, "image");
      if (comfy && review) {
        addEdge(comfy, "image", review, "asset");
        addEdge(comfy, "workflowDigest", review, "workflowDigest");
        addEdge(review, "approvedAsset", background, "asset");
      } else if (backgroundSource) {
        addEdge(backgroundSource, "path", background, "asset");
      }
      addEdge(cutout, "image", person, "asset");
      timelineOutputs.push({ nodeId: background, port: "overlay" }, { nodeId: person, port: "overlay" }, { nodeId: graphic, port: "overlay" });
      if (doodleEnabled) {
        const customDoodleWord = String(item.params.customDoodleWord ?? "").trim();
        const customDoodle = Boolean(customDoodleWord);
        const doodleGenerate = addNode(item.id, "generate_doodle", "comfyui.workflow", {
          workflowFile: "workflows/generate-cover-doodle-zimage.api.json",
          promptLanguage: "en",
          promptPatch: "6.inputs.text",
          patches: {
            "6.inputs.text": buildCustomDoodlePrompt(customDoodleWord || doodlePrompt || "star"),
            "3.inputs.seed": resolveCoverSeed({ ...item.params, seed: item.params.doodleSeed ?? Number(item.params.seed ?? 42) + 1 }),
            ...(customDoodle ? { "5.inputs.width": 512, "5.inputs.height": 512 } : {})
          },
          width: customDoodle ? 512 : 1344,
          height: customDoodle ? 512 : 768,
          downloadDir: customDoodle ? `media/storyboard-doodles/${safeId}` : `media/storyboard-covers/${safeId}/doodle-matte`
        }, x + 360, 320);
        const doodleAlpha = addNode(item.id, "doodle_alpha", "image.luma_to_alpha", { output: `media/storyboard-covers/${safeId}/doodle-alpha.png` }, x + 360, 400);
        const doodle = addNode(item.id, "doodle_v2", "timeline.overlay", { startMs: cursor, durationMs: item.durationMs, track: 2, opacity: Number(item.params.doodleOpacity ?? 1), audioPolicy: "mute", storyboardItemId: item.id, editorialKind: "cover_card" }, x + 360, 500);
        addEdge(doodleGenerate, "image", doodleAlpha, "image");
        addEdge(doodleAlpha, "image", doodle, "asset");
        timelineOutputs.push({ nodeId: doodle, port: "overlay" });
      }
      }
    } else if (item.kind === "logo_outro") {
      const effectivePath = String(item.params.sourcePath ?? "").trim() || "/Volumes/ภาควีดีทัศน์/Logo 88 2561/Prince_of_Songkla_University_Emblem.png";
      const asset = addNode(item.id, "source", "asset.select", { path: effectivePath }, x, 80);
      const scene = addNode(item.id, "scene", "timeline.scene", { startMs: cursor, durationMs: item.durationMs, sourceInMs: 0, track: 1, audio: false, audioPolicy: "mute", storyboardItemId: item.id, editorialKind: "logo_outro" }, x, 200);
      addEdge(asset, "path", scene, "source"); timelineOutputs.push({ nodeId: scene, port: "scene" });
    }
    cursor += item.durationMs;
  });
  const composeId = "sb_timeline__compose";
  nodes.push({ id: composeId, type: "timeline.compose", config: { name: "DOCUMENTARY_MAIN", width: 1920, height: 1080, frameRate: 25 }, position: { x: 80 + approved.storyboard.items.length * 280, y: 320 } });
  order.push(composeId); provenance[composeId] = "__storyboard__";
  for (const output of timelineOutputs) addEdge(output.nodeId, output.port, composeId, output.port === "scene" ? "scenes" : output.port === "dynamicLink" ? "dynamicLinks" : output.port === "graphic" ? "graphics" : "overlays");
  const graph: GraphDefinitionV1 = {
    schemaVersion: 1,
    graphId: `storyboard_${approved.storyboardId}_v${approved.version}`,
    name: `${approved.storyboard.name} — compiled storyboard v${approved.version}`,
    description: "Read-only graph derived from an approved StoryboardSpec v2",
    revision: approved.sourceRevision,
    profile: { id: "landscape", width: 1920, height: 1080, frameRate: 25 },
    durationFrames: Math.max(1, cursor / FRAME_MS),
    variables: { storyboardId: approved.storyboardId, storyboardVersion: approved.version, storyboardDigest: approved.storyboardDigest },
    settings: { derived: true, editable: false, executable: false },
    nodes, edges, order
  };
  const graphDigest = sha256(canonicalStoryboardJson(graph));
  return { schemaVersion: 2, storyboardId: approved.storyboardId, storyboardVersion: approved.version, storyboardDigest: approved.storyboardDigest, graphDigest, compiledAt: approved.approvedAt, graph, timeline: { durationMs: cursor, items: timeline }, provenance, diagnostics: [], executable: false };
}

export interface StoryboardExecutionOptions {
  outputProject: string;
  sequenceName: string;
  sequencePresetPath: string;
  afterEffects?: { applicationId: string; aerenderPath: string };
  h264: { output: string; normalizedOutput: string; presetPath: string };
  prores: { output: string; presetPath: string };
  audioQc: {
    targetLufs: number;
    toleranceLufs: number;
    maxTruePeakDbfs: number;
    silenceThresholdDbfs: number;
    minSilenceMs: number;
    maxUnexpectedSilenceMs: number;
  };
}

/**
 * Materialize an executable, approval-bound graph without mutating the
 * immutable StoryboardCompilation preview. The compilation digest is checked
 * before any production nodes are attached so a stale or edited preview can
 * never become an execution source of truth.
 */
export function createStoryboardExecutionGraph(
  compilation: StoryboardCompilationV2,
  options: StoryboardExecutionOptions
): GraphDefinitionV1 {
  const measuredGraphDigest = sha256(canonicalStoryboardJson(compilation.graph));
  if (measuredGraphDigest !== compilation.graphDigest) {
    throw new Error(`Storyboard compilation graph digest mismatch: expected ${compilation.graphDigest}, measured ${measuredGraphDigest}`);
  }
  if (compilation.executable !== false || compilation.graph.settings?.executable !== false) {
    throw new Error("Storyboard execution requires an immutable non-executable compilation preview");
  }

  const composeNodes = compilation.graph.nodes.filter((node) => node.type === "timeline.compose");
  if (composeNodes.length !== 1) throw new Error(`Storyboard execution requires exactly one timeline.compose node; found ${composeNodes.length}`);
  const composeId = composeNodes[0]!.id;

  requireExecutionText(options.outputProject, "outputProject");
  requireExecutionText(options.sequenceName, "sequenceName");
  requireExecutionText(options.sequencePresetPath, "sequencePresetPath");
  if (options.afterEffects !== undefined) {
    requireExecutionText(options.afterEffects.applicationId, "afterEffects.applicationId");
    requireExecutionText(options.afterEffects.aerenderPath, "afterEffects.aerenderPath");
  }
  requireExecutionText(options.h264?.output, "h264.output");
  requireExecutionText(options.h264?.normalizedOutput, "h264.normalizedOutput");
  requireExecutionText(options.h264?.presetPath, "h264.presetPath");
  requireExecutionText(options.prores?.output, "prores.output");
  requireExecutionText(options.prores?.presetPath, "prores.presetPath");
  validateExecutionAudioQc(options.audioQc);

  const graph = structuredClone(compilation.graph);
  const buildId = "sb_output__premiere_build";
  const exportId = "sb_output__premiere_export";
  const normalizeId = "sb_output__audio_normalize";
  const audioQcId = "sb_output__audio_qc";
  const timelineQcId = "sb_output__timeline_qc";
  const terminalIds = new Set([buildId, exportId, normalizeId, audioQcId, timelineQcId]);
  if (graph.nodes.some((node) => terminalIds.has(node.id))) throw new Error("Storyboard compilation already contains reserved production node ids");

  const x = Math.max(...graph.nodes.map((node) => node.position?.x ?? 0), 0) + 280;
  graph.graphId = `${graph.graphId}_execution`;
  graph.name = `${graph.name} — approval-bound execution`;
  graph.description = "Executable production graph derived from an immutable approved storyboard compilation";
  graph.settings = {
    ...graph.settings,
    derived: true,
    editable: false,
    executable: true,
    sourceCompilationDigest: compilation.graphDigest,
    sourceStoryboardDigest: compilation.storyboardDigest,
    ...(options.afterEffects ? {
      adobe: { afterEffects: {
        applicationId: options.afterEffects.applicationId,
        aerenderPath: options.afterEffects.aerenderPath
      } }
    } : {})
  };
  graph.variables = {
    ...graph.variables,
    sourceCompilationDigest: compilation.graphDigest,
    sourceStoryboardDigest: compilation.storyboardDigest
  };
  graph.lineage = {
    sourceGraphId: compilation.graph.graphId,
    sourceVersion: compilation.storyboardVersion,
    sourceDigest: compilation.graphDigest
  };
  graph.nodes.push(
    {
      id: buildId,
      type: "premiere.build",
      position: { x, y: 240 },
      config: {
        outputProject: options.outputProject,
        sequenceName: options.sequenceName,
        sequencePresetPath: options.sequencePresetPath,
        save: true
      }
    },
    {
      id: exportId,
      type: "premiere.export",
      position: { x: x + 280, y: 240 },
      config: {
        sequenceName: options.sequenceName,
        exports: [
          { format: "h264", output: options.h264.output, presetPath: options.h264.presetPath },
          { format: "prores", output: options.prores.output, presetPath: options.prores.presetPath }
        ]
      }
    },
    {
      id: normalizeId,
      type: "media.audio_normalize",
      position: { x: x + 560, y: 120 },
      config: {
        output: options.h264.normalizedOutput,
        targetLufs: options.audioQc.targetLufs,
        maxTruePeakDbfs: options.audioQc.maxTruePeakDbfs,
        loudnessRange: 11,
        audioBitrateKbps: 320
      }
    },
    {
      id: audioQcId,
      type: "audio.loudness_qc",
      position: { x: x + 840, y: 160 },
      config: structuredClone(options.audioQc)
    },
    {
      id: timelineQcId,
      type: "qc.timeline",
      position: { x: x + 840, y: 340 },
      config: {}
    }
  );
  graph.edges.push(
    { id: "sb_output_edge__compose_build", from: { nodeId: composeId, port: "timeline" }, to: { nodeId: buildId, port: "timeline" } },
    { id: "sb_output_edge__build_export", from: { nodeId: buildId, port: "project" }, to: { nodeId: exportId, port: "project" } },
    { id: "sb_output_edge__h264_normalize", from: { nodeId: exportId, port: "h264" }, to: { nodeId: normalizeId, port: "source" } },
    { id: "sb_output_edge__compose_audio_qc", from: { nodeId: composeId, port: "timeline" }, to: { nodeId: audioQcId, port: "timelineSpec" } },
    { id: "sb_output_edge__normalize_audio_qc", from: { nodeId: normalizeId, port: "media" }, to: { nodeId: audioQcId, port: "source" } },
    { id: "sb_output_edge__compose_timeline_qc", from: { nodeId: composeId, port: "timeline" }, to: { nodeId: timelineQcId, port: "timeline" } },
    { id: "sb_output_edge__exports_timeline_qc", from: { nodeId: exportId, port: "exports" }, to: { nodeId: timelineQcId, port: "exports" } }
  );
  graph.order.push(buildId, exportId, normalizeId, audioQcId, timelineQcId);
  return graph;
}

function requireExecutionText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Storyboard execution ${label} is required`);
}

function validateExecutionAudioQc(value: StoryboardExecutionOptions["audioQc"]): void {
  if (!value || typeof value !== "object") throw new Error("Storyboard execution audioQc policy is required");
  const finite = (key: keyof StoryboardExecutionOptions["audioQc"]) => {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key])) throw new Error(`Storyboard execution audioQc.${key} must be finite`);
  };
  finite("targetLufs");
  finite("toleranceLufs");
  finite("maxTruePeakDbfs");
  finite("silenceThresholdDbfs");
  finite("minSilenceMs");
  finite("maxUnexpectedSilenceMs");
  if (value.toleranceLufs <= 0) throw new Error("Storyboard execution audioQc.toleranceLufs must be greater than zero");
  if (value.minSilenceMs <= 0) throw new Error("Storyboard execution audioQc.minSilenceMs must be greater than zero");
  if (value.maxUnexpectedSilenceMs < 0) throw new Error("Storyboard execution audioQc.maxUnexpectedSilenceMs must be non-negative");
}

function baseEditorialItem(id: string, kind: "title" | "cover_card" | "logo_outro", durationMs: number, presetId: string, _row: StoryboardRawRowV2, params: Record<string, unknown>, rowNumber: number): StoryboardItemV2 {
  return { id, kind, durationMs, audioPolicy: "mute", presetId, sourceRowNumbers: [rowNumber], params };
}

function proposal(rowNumber: number, confidence: number, reasons: string[], item: StoryboardItemV2): StoryboardProposalV2 {
  return { proposalId: `proposal_${item.id}`, rowNumber, confidence, reasons, item };
}

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\bC\s*(\d{4})\b/gi, "C$1").replace(/(\d{1,2})\s*[.:]\s*(\d{2})/g, "$1:$2").replace(/[\u2010-\u2015\u2212–—]/g, "-").replace(/\s+/g, " ").trim();
}

function xmlText(value: string): string {
  return [...value.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => decodeXml(match[1] ?? "")).join(" ").replace(/\s+/g, " ").trim();
}

function decodeXml(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function capture(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${command} timed out`)); }, timeoutMs);
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(`${command} failed (${code}): ${stderr.trim()}`)); });
  });
}

function safeGeneratedId(value: unknown, fallback: string): string {
  const normalized = String(value ?? "").replace(/[^A-Za-z0-9_-]/g, "_"); return SAFE_ID.test(normalized) && normalized ? normalized : fallback;
}

function positiveFrameTime(value: number) { return Number.isSafeInteger(value) && value > 0 && value % FRAME_MS === 0; }
function nonNegativeFrameTime(value: number) { return Number.isSafeInteger(value) && value >= 0 && value % FRAME_MS === 0; }
function asStrings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : []; }
function sha256(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)]));
  return value;
}

export interface StoryboardRemotionProps {
  storyboardId: string;
  title: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  items: Array<{
    id: string;
    kind: "a_roll" | "cover_card" | "title" | "logo_outro" | "note";
    durationMs: number;
    audioPolicy: "preserve" | "mute" | "mix";
    params: Record<string, unknown>;
    broll?: Array<{
      id: string;
      assetPath: string;
      offsetMs: number;
      durationMs: number;
      audioPolicy: "mute" | "preserve";
      fit?: "cover" | "contain";
      preset?: string;
    }>;
  }>;
  fps: 25;
  durationInFrames: number;
  theme?: Record<string, unknown>;
}

export function compileStoryboardToRemotionProps(
  storyboard: StoryboardSpecV2,
  options: {
    aspectRatio?: "9:16" | "16:9" | "1:1";
    theme?: Record<string, unknown>;
  } = {}
): StoryboardRemotionProps {
  const totalMs = storyboard.items.reduce((acc, item) => acc + (item.durationMs || 0), 0);
  const fps = 25;
  const durationInFrames = Math.max(1, Math.round((totalMs / 1000) * fps));

  const items = storyboard.items.map((item) => ({
    id: item.id,
    kind: item.kind,
    durationMs: item.durationMs,
    audioPolicy: item.audioPolicy,
    params: {
      ...item.params,
      sourcePath: (item.params?.sourcePath as string) || "",
      dialogue: (item.params?.dialogue as string) || "",
      speaker: (item.params?.speaker as string) || (item.params?.sourceKey as string) || "",
      eyebrow: (item.params?.eyebrow as string) || (item.params?.award as string) || "",
      title: (item.params?.title as string) || (item.params?.personName as string) || "",
      subtitle: (item.params?.subtitle as string) || (item.params?.positionTitle as string) || "",
      sourceImage: (item.params?.sourceImage as string) || ""
    },
    broll: (item.broll ?? []).map((b) => ({
      id: b.id,
      assetPath: b.asset.path,
      offsetMs: b.offsetMs,
      durationMs: b.durationMs,
      audioPolicy: b.audioPolicy,
      fit: b.fit ?? "cover"
    }))
  }));

  return {
    storyboardId: storyboard.storyboardId,
    title: storyboard.name,
    aspectRatio: options.aspectRatio ?? "16:9",
    items,
    fps,
    durationInFrames,
    theme: options.theme
  };
}
