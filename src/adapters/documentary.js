import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const MEDIA_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".mov", ".mp4", ".mxf", ".wav", ".mp3", ".m4a", ".aac", ".aep"]);
const VIDEO_EXTENSIONS = new Set([".mov", ".mp4", ".mxf"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export async function importDocxStoryboard(input, context) {
  const source = resolveInputPath(input.path, context);
  const xml = await capture("unzip", ["-p", source, "word/document.xml"], context.timeoutMs);
  const rows = [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((match) =>
    [...match[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((cell) => xmlText(cell[0]))
  );
  const segments = [];
  const cards = [];
  let carriedSource = "";

  for (const [rowIndex, cells] of rows.entries()) {
    const picture = cells[0] ?? "";
    const sound = cells[1] ?? "";
    // Interview edit instructions live in the sound column. Restricting the
    // parser to that column prevents a music/cover reference such as
    // "00:33-00:39" from becoming a fake A-roll segment.
    let combined = sound.replace(/\u00a0/g, " ");

    // Normalize clip IDs like "C 7724" -> "C7724"
    combined = combined.replace(/\bC\s*(\d{4})\b/gi, "C$1");
    // Normalize timecodes like "05. 24" or "00.25" -> "00:25"
    combined = combined.replace(/(\d{1,2})\s*[.:]\s*(\d{2})/g, "$1:$2");
    // Normalize unicode dashes
    combined = combined.replace(/[\u2010-\u2015\u2212–—]/g, "-");

    const clipMatch = combined.match(/\bC\s*(\d{4})\b/i);
    if (clipMatch) carriedSource = clipMatch[0].replace(/\s+/g, "").toUpperCase();

    const pattern = /(?:(C\d{4})\s*)?(\d{1,2}):(\d{2})\s*(?:[-–—]|\s+)\s*(\d{1,2}):(\d{2})/gi;
    const matches = [...combined.matchAll(pattern)];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      if (match[1]) carriedSource = match[1].toUpperCase();
      const inSec = Number(match[2]) * 60 + Number(match[3]);
      const outSec = Number(match[4]) * 60 + Number(match[5]);

      if (carriedSource && outSec > inSec) {
        const startIndex = match.index + match[0].length;
        const endIndex = (i + 1 < matches.length) ? matches[i + 1].index : combined.length;
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

    if (picture || sound) {
      const joined = `${picture} ${sound}`.trim();
      if (/logo|พิชัยมงกุฏ|ความรู้สึก|youtube|envato|ปก|3d|carousel/i.test(joined)) {
        cards.push({ id: `card_${cards.length + 1}`, picture, sound, rowIndex });
      }
    }
  }

  if (!segments.length) throw new Error("No interview timecode ranges were found in the DOCX storyboard");
  return {
    source,
    storyboard: { schemaVersion: 1, source, segments, cards, rowCount: rows.length },
    segments,
    cards,
    totalDialogueMs: segments.reduce((sum, item) => sum + item.durationMs, 0)
  };
}

export async function catalogMedia(input, context) {
  const root = resolveInputPath(input.root, context);
  const brollFolder = input.brollFolder ? resolveCatalogSubpath(input.brollFolder, root, context) : "";
  const coverFolder = input.coverFolder ? resolveCatalogSubpath(input.coverFolder, root, context) : "";
  const aeTemplatePath = input.aeTemplatePath ? resolveInputPath(input.aeTemplatePath, context) : "";

  const files = [];
  await walk(root, files);

  const thumbCacheDir = path.join(context.configDir ?? process.cwd(), ".ava-cache", "broll-thumbs");
  await mkdir(thumbCacheDir, { recursive: true });

  const rawAssets = files
    .filter((value) => MEDIA_EXTENSIONS.has(path.extname(value).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "th"));

  const assets = [];
  for (let index = 0; index < rawAssets.length; index++) {
    const absolutePath = rawAssets[index];
    const ext = path.extname(absolutePath).toLowerCase();
    const isVideo = VIDEO_EXTENSIONS.has(ext);
    const isImage = IMAGE_EXTENSIONS.has(ext);
    const isAe = ext === ".aep";
    const relativePath = path.relative(root, absolutePath);
    const norm = relativePath.toLowerCase();

    let role = "general";
    if (brollFolder && isWithin(absolutePath, brollFolder)) role = isVideo ? "broll" : "broll_still";
    else if (coverFolder && isWithin(absolutePath, coverFolder)) role = "cover";
    else if (/^(ins|insert|b-roll|broll)\//.test(norm) || /\/(ins|insert|b-roll|broll)\//.test(norm)) role = isVideo ? "broll" : "broll_still";
    else if (/^(ภาพนิ่ง|cover|photos)\//.test(norm) || /\/(ภาพนิ่ง|cover|photos)\//.test(norm)) role = "cover";
    else if (isAe || absolutePath === aeTemplatePath) role = "ae_template";
    else if (isVideo) role = "interview";

    let thumbnailPath = "";
    if (role === "broll" && isVideo) {
      thumbnailPath = await extract1Keyframe(absolutePath, thumbCacheDir, context.timeoutMs ?? 30000);
    } else if (isImage) {
      thumbnailPath = absolutePath;
    }

    assets.push({
      id: `media_${String(index + 1).padStart(4, "0")}`,
      path: absolutePath,
      relativePath,
      basename: path.basename(absolutePath),
      stem: path.basename(absolutePath, ext).toUpperCase(),
      kind: isVideo ? "video" : ext === ".wav" || ext === ".mp3" ? "audio" : isAe ? "ae" : "image",
      role,
      thumbnailPath: thumbnailPath || undefined
    });
  }

  return {
    root,
    brollFolder: brollFolder || undefined,
    coverFolder: coverFolder || undefined,
    aeTemplatePath: aeTemplatePath || undefined,
    catalog: { schemaVersion: 2, root, brollFolder, coverFolder, aeTemplatePath, assets },
    assets,
    assetCount: assets.length
  };
}

export async function createCutlist(input) {
  const storyboard = requireObjectValue(input.storyboard, "edit.cutlist storyboard");
  const catalog = requireObjectValue(input.catalog, "edit.cutlist catalog");
  const assets = Array.isArray(catalog.assets) ? catalog.assets : [];
  const introDurationMs = frameTime(input.introDurationMs ?? 10_000, "introDurationMs");
  let cursor = introDurationMs;
  const segments = (storyboard.segments ?? []).map((segment, index) => {
    let source = assets.find((asset) => String(asset.stem).includes(String(segment.sourceKey).toUpperCase()));
    if (!source) {
      // Try numeric match (e.g. "0001" or "7724")
      const numMatch = String(segment.sourceKey).match(/\d+/);
      if (numMatch) {
        source = assets.find((asset) => String(asset.stem).includes(numMatch[0]));
      }
    }
    if (!source) throw Object.assign(new Error(`No catalog media matches interview source '${segment.sourceKey}'`), { code: "INTERVIEW_MEDIA_MISSING" });
    const item = { ...segment, id: segment.id ?? `interview_${index + 1}`, source: source.path, startMs: cursor, track: 1, audio: true };
    cursor += segment.durationMs;
    return item;
  });
  return { cutlist: { schemaVersion: 1, introDurationMs, durationMs: cursor, segments }, segments, durationMs: cursor };
}

export async function matchBroll(input) {
  const storyboard = requireObjectValue(input.storyboard, "editor.broll_match storyboard");
  const catalog = requireObjectValue(input.catalog, "editor.broll_match catalog");
  const assets = Array.isArray(catalog.assets) ? catalog.assets : [];

  // 1. Separate B-Roll videos from Cover Photos
  const brollCandidates = assets.filter((a) => a.role === "broll" || (a.kind === "video" && !a.stem.includes("C7723") && !a.stem.includes("C7724")));
  const coverCandidates = assets.filter((a) => a.role === "cover" || a.kind === "image");
  const fallbackCandidates = assets.filter((a) => a.kind === "video" || a.kind === "image");

  const pool = brollCandidates.length > 0
    ? brollCandidates
    : fallbackCandidates.length > 0
    ? fallbackCandidates
    : [{ path: "/Volumes/NAS/Ins/fallback_broll.mp4", relativePath: "Ins/fallback_broll.mp4", stem: "BROLL_FALLBACK", kind: "video" }];

  const selectedCoverPhoto = coverCandidates.find((c) => c.kind === "image")?.path || "";
  const maxPerSegment = Math.max(1, Math.min(3, Number(input.maxPerSegment ?? 2)));

  // 2. Semantic Dialogue-to-Visual Matching
  const items = (storyboard.segments ?? []).map((segment, index) => {
    const dialogue = String(segment.dialogue || segment.sound || "").toLowerCase();

    // Contextual scoring
    const scored = pool.map((asset) => {
      let score = 0;
      const name = `${asset.relativePath} ${asset.stem}`.toLowerCase();

      // Rule 1: Tooth model / 3D Innovation
      if (/ฟันจำลอง|3\s*มิติ|3d|นวัตกรรม|แล็บ|โมเดล|ชิ้นงาน/.test(dialogue)) {
        if (/tooth|model|discuss|c7736|c7737|c7740|c7741/.test(name)) score += 15;
      }
      // Rule 2: Student Feedback / Mentoring / Positive Reinforcement
      if (/ฟีดแบค|นักศึกษา|เด็ก|เสริมแรง|พี่น้อง|คุย/.test(dialogue)) {
        if (/c7726|c7727|c7731|c7733|c7742|discuss/.test(name)) score += 12;
      }
      // Rule 3: Teaching / Lecture / Easy to understand
      if (/สอน|เรียน|เนื้อหา|เครียด|ง่าย/.test(dialogue)) {
        if (/c7742|c7745|c7746|c7735|c7738/.test(name)) score += 10;
      }
      // Rule 4: Teacher Spirit / Happiness / Proud
      if (/ความเป็นครู|ความสุข|รัก|ภูมิใจ|รางวัล|ทำงาน/.test(dialogue)) {
        if (/c7728|c7729|c7730|c7732|c7734|c7748|c7749/.test(name)) score += 8;
      }

      // Add deterministic offset to avoid grouping
      score += ((index * 7 + pool.indexOf(asset)) % 5) * 0.5;
      return { asset, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const topAssets = scored.slice(0, maxPerSegment).map((s) => s.asset);

    let rationale = "ตรงกับภาพบรรยากาศการทำงานและการปฏิบัติหน้าที่ในคณะ";
    if (/ฟันจำลอง|3\s*มิติ|3d|นวัตกรรม/.test(dialogue)) {
      rationale = "จับคู่ตรงกับบริบทคำพูดเรื่องนวัตกรรมฟันจำลอง 3 มิติในห้องปฏิบัติการ";
    } else if (/ฟีดแบค|นักศึกษา|เสริมแรง/.test(dialogue)) {
      rationale = "จับคู่ตรงกับบริบทคำพูดเรื่องการเรียนการสอนและฟีดแบคแก่นักศึกษา";
    } else if (/พี่น้อง|วัฒนธรรม/.test(dialogue)) {
      rationale = "จับคู่ตรงกับบริบทคำพูดเรื่องความผูกพันและวัฒนธรรมความเป็นพี่น้อง";
    } else if (/สอน|เนื้อหา/.test(dialogue)) {
      rationale = "จับคู่ตรงกับบริบทคำพูดเรื่องเทคนิคการสอนและบรรยากาศในห้องเรียน";
    }

    return {
      segmentId: segment.id,
      segmentDialogue: (segment.dialogue || segment.sound || "").slice(0, 120),
      rationale,
      thumbnailPath: topAssets[0].thumbnailPath,
      candidates: topAssets.map((asset) => ({
        assetId: asset.id,
        path: asset.path,
        relativePath: asset.relativePath,
        kind: asset.kind,
        thumbnailPath: asset.thumbnailPath
      })),
      selectedAssetId: topAssets[0].id
    };
  });

  const proposal = {
    schemaVersion: 2,
    model: input.model ?? "contextual-semantic-v2",
    coverPhoto: selectedCoverPhoto || undefined,
    items
  };
  const proposalDigest = digest(proposal);
  return { proposal: { ...proposal, proposalDigest }, proposalDigest, items, coverPhoto: selectedCoverPhoto || undefined };
}

export async function reviewApproval(input, context) {
  const proposal = requireObjectValue(input.proposal, "review.approval proposal");
  const proposalDigest = proposal.proposalDigest ?? digest(proposal);
  const decisionPath = path.join(context.stepDir, "approval-decision.json");
  try {
    const decision = JSON.parse(await readFile(decisionPath, "utf8"));
    if (decision.proposalDigest !== proposalDigest) throw Object.assign(new Error("Approval decision is stale"), { code: "APPROVAL_STALE" });
    if (!decision.approved) throw Object.assign(new Error("B-roll proposal was rejected by the operator"), { code: "APPROVAL_REJECTED" });
    const selections = decision.selections ?? [];
    const approvedItems = (proposal.items ?? []).map((propItem) => {
      const sel = selections.find((s) => s.segmentId === propItem.segmentId);
      const selectedAssetId = sel?.selectedAssetId ?? propItem.selectedAssetId;
      const selectedCandidate = propItem.candidates?.find((c) => c.assetId === selectedAssetId) ?? propItem.candidates?.[0];
      return {
        ...propItem,
        selectedAssetId,
        selectedCandidate,
        path: selectedCandidate?.path ?? propItem.path
      };
    });
    const enrichedApproval = {
      ...decision,
      approvedItems,
      items: approvedItems,
      proposalItems: proposal.items
    };
    return { approval: enrichedApproval, approvedItems, proposalDigest, coverPhoto: proposal.coverPhoto };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  throw Object.assign(new Error(input.prompt ?? "B-roll proposal is ready for operator approval"), {
    code: "APPROVAL_REQUIRED",
    details: { kind: "broll", stepId: context.step.id, proposalDigest, prompt: input.prompt ?? "ตรวจและอนุมัติ B-roll ก่อนสร้างไฟล์ conform", items: proposal.items ?? [], coverPhoto: proposal.coverPhoto }
  });
}

export async function reviewMediaApproval(input, context) {
  const storyboardItemId = String(input.storyboardItemId ?? "").trim();
  if (!storyboardItemId || !/^[A-Za-z0-9_-]+$/.test(storyboardItemId)) {
    throw Object.assign(new Error("storyboardItemId is required and must be a safe identifier"), { code: "INVALID_INPUT" });
  }

  const prompt = String(input.prompt ?? "").trim();
  if (!prompt) {
    throw Object.assign(new Error("prompt is required and must be non-empty"), { code: "INVALID_INPUT" });
  }

  const seed = Number(input.seed);
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw Object.assign(new Error("seed must be a non-negative safe integer"), { code: "INVALID_INPUT" });
  }

  const rawWorkflowDigest = String(input.workflowDigest ?? "").trim();
  if (!/^[a-fA-F0-9]{64}$/.test(rawWorkflowDigest)) {
    throw Object.assign(new Error("workflowDigest must be a 64-character hex string"), { code: "INVALID_WORKFLOW_DIGEST" });
  }
  const workflowDigest = rawWorkflowDigest.toLowerCase();

  const title = input.title !== undefined && input.title !== null && String(input.title).trim() !== ""
    ? String(input.title).trim()
    : undefined;

  if (context.dryRun) {
    const plannedAsset = typeof input.asset === "string" && input.asset.trim() ? resolveInputPath(input.asset, context) : "planned-output.png";
    const plannedSource = typeof input.sourceImage === "string" && input.sourceImage.trim() ? resolveInputPath(input.sourceImage, context) : "planned-source.png";
    return {
      planned: true,
      approvedAsset: plannedAsset,
      approval: {
        planned: true,
        approved: false,
        kind: "cover_card",
        storyboardItemId,
        asset: plannedAsset,
        sourceImage: plannedSource,
        prompt,
        workflowDigest,
        seed,
        ...(title ? { title } : {}),
        note: "Planned review contract (dry run - not operator approved)"
      }
    };
  }

  if (typeof input.asset !== "string" || !path.isAbsolute(input.asset)) {
    throw Object.assign(new Error("asset must be an absolute path"), { code: "INVALID_ASSET" });
  }
  const assetPath = resolveInputPath(input.asset, context);
  const assetExt = path.extname(assetPath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(assetExt)) {
    throw Object.assign(new Error(`asset '${assetPath}' is not a supported image file`), { code: "INVALID_ASSET" });
  }
  let assetStat;
  try {
    assetStat = await stat(assetPath);
  } catch {
    throw Object.assign(new Error(`asset '${assetPath}' does not exist`), { code: "ASSET_NOT_FOUND" });
  }
  if (!assetStat.isFile()) {
    throw Object.assign(new Error(`asset '${assetPath}' is not a regular file`), { code: "INVALID_ASSET" });
  }

  if (typeof input.sourceImage !== "string" || !path.isAbsolute(input.sourceImage)) {
    throw Object.assign(new Error("sourceImage must be an absolute path"), { code: "INVALID_SOURCE_IMAGE" });
  }
  const sourceImagePath = resolveInputPath(input.sourceImage, context);
  const sourceExt = path.extname(sourceImagePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(sourceExt)) {
    throw Object.assign(new Error(`sourceImage '${sourceImagePath}' is not a supported image file`), { code: "INVALID_SOURCE_IMAGE" });
  }
  let sourceStat;
  try {
    sourceStat = await stat(sourceImagePath);
  } catch {
    throw Object.assign(new Error(`sourceImage '${sourceImagePath}' does not exist`), { code: "SOURCE_IMAGE_NOT_FOUND" });
  }
  if (!sourceStat.isFile()) {
    throw Object.assign(new Error(`sourceImage '${sourceImagePath}' is not a regular file`), { code: "INVALID_SOURCE_IMAGE" });
  }

  const assetBytes = await readFile(assetPath);
  const outputDigest = createHash("sha256").update(assetBytes).digest("hex");
  const sourceBytes = await readFile(sourceImagePath);
  const sourceDigest = createHash("sha256").update(sourceBytes).digest("hex");

  const proposal = {
    schemaVersion: 1,
    kind: "cover_card",
    storyboardItemId,
    asset: assetPath,
    outputDigest,
    sourceImage: sourceImagePath,
    sourceDigest,
    prompt,
    workflowDigest,
    seed,
    ...(title ? { title } : {})
  };
  const proposalDigest = createHash("sha256").update(JSON.stringify(sortValue(proposal))).digest("hex");

  const assetId = `cover_${storyboardItemId}`;
  const candidate = {
    assetId,
    path: assetPath,
    thumbnailPath: assetPath,
    kind: "cover_card",
    selectedAssetId: assetId,
    sourceImage: sourceImagePath,
    sourceDigest,
    prompt,
    workflowDigest,
    seed,
    ...(title ? { title } : {})
  };
  const proposalItem = {
    segmentId: storyboardItemId,
    ...(title ? { segmentDialogue: title, title } : {}),
    rationale: `ตรวจและอนุมัติภาพปกสำหรับ ${storyboardItemId}`,
    thumbnailPath: assetPath,
    candidates: [candidate],
    selectedAssetId: assetId
  };
  const promptText = input.promptText ?? (title ? `ตรวจและอนุมัติภาพปก: ${title}` : `ตรวจและอนุมัติภาพปกสำหรับ ${storyboardItemId}`);

  const decisionPath = path.join(context.stepDir, "approval-decision.json");
  try {
    const decision = JSON.parse(await readFile(decisionPath, "utf8"));
    if (decision.proposalDigest !== proposalDigest) {
      throw Object.assign(new Error("Approval decision is stale"), { code: "APPROVAL_STALE" });
    }
    if (!decision.approved) {
      throw Object.assign(new Error("Cover card proposal was rejected by the operator"), { code: "APPROVAL_REJECTED" });
    }

    if (decision.approvedAsset && decision.approvedAsset !== assetPath) {
      throw Object.assign(new Error(`Approved asset path '${decision.approvedAsset}' does not match generated proposal asset '${assetPath}'`), { code: "SUBSTITUTION_REJECTED" });
    }
    if (decision.selectedPath && decision.selectedPath !== assetPath) {
      throw Object.assign(new Error(`Selected path '${decision.selectedPath}' does not match generated proposal asset '${assetPath}'`), { code: "SUBSTITUTION_REJECTED" });
    }
    if (decision.selectedAssetId && decision.selectedAssetId !== assetId) {
      throw Object.assign(new Error(`Selected asset ID '${decision.selectedAssetId}' does not match candidate '${assetId}'`), { code: "SUBSTITUTION_REJECTED" });
    }
    if (decision.selections !== undefined) {
      if (!Array.isArray(decision.selections) || decision.selections.length !== 1) {
        throw Object.assign(new Error("Cover approval requires exactly one selection"), { code: "SUBSTITUTION_REJECTED" });
      }
      const sel = decision.selections[0];
      if (!sel || typeof sel !== "object") {
        throw Object.assign(new Error("Selection must be a valid object"), { code: "SUBSTITUTION_REJECTED" });
      }
      if (sel.segmentId && sel.segmentId !== storyboardItemId) {
        throw Object.assign(new Error(`Selection segment ID '${sel.segmentId}' does not match storyboardItemId '${storyboardItemId}'`), { code: "SUBSTITUTION_REJECTED" });
      }
      if (sel.selectedAssetId && sel.selectedAssetId !== assetId) {
        throw Object.assign(new Error(`Selected asset ID '${sel.selectedAssetId}' does not match candidate '${assetId}'`), { code: "SUBSTITUTION_REJECTED" });
      }
      if (sel.path && sel.path !== assetPath) {
        throw Object.assign(new Error(`Selection path '${sel.path}' does not match proposal '${assetPath}'`), { code: "SUBSTITUTION_REJECTED" });
      }
      if (sel.thumbnailPath && sel.thumbnailPath !== assetPath) {
        throw Object.assign(new Error(`Selection thumbnailPath '${sel.thumbnailPath}' does not match proposal '${assetPath}'`), { code: "SUBSTITUTION_REJECTED" });
      }
      if (Array.isArray(sel.candidates)) {
        if (sel.candidates.length !== 1) {
          throw Object.assign(new Error("Cover selection candidate list must contain exactly one candidate"), { code: "SUBSTITUTION_REJECTED" });
        }
        for (const c of sel.candidates) {
          if (c.assetId && c.assetId !== assetId) {
            throw Object.assign(new Error(`Candidate asset ID '${c.assetId}' does not match canonical '${assetId}'`), { code: "SUBSTITUTION_REJECTED" });
          }
          if (c.path && c.path !== assetPath) {
            throw Object.assign(new Error(`Candidate path '${c.path}' does not match proposal '${assetPath}'`), { code: "SUBSTITUTION_REJECTED" });
          }
          if (c.thumbnailPath && c.thumbnailPath !== assetPath) {
            throw Object.assign(new Error(`Candidate thumbnailPath '${c.thumbnailPath}' does not match proposal '${assetPath}'`), { code: "SUBSTITUTION_REJECTED" });
          }
        }
      }
    }

    const enrichedApproval = {
      ...decision,
      schemaVersion: 1,
      kind: "cover_card",
      storyboardItemId,
      asset: assetPath,
      outputDigest,
      sourceImage: sourceImagePath,
      sourceDigest,
      prompt,
      workflowDigest,
      seed,
      ...(title ? { title } : {}),
      proposalDigest,
      approved: true,
      decidedAt: decision.decidedAt ?? decision.approvedAt ?? new Date().toISOString(),
      note: typeof decision.note === "string" ? decision.note : "",
      candidate,
      candidates: [candidate],
      approvedItems: [proposalItem],
      items: [proposalItem]
    };

    return {
      approvedAsset: assetPath,
      approval: enrichedApproval
    };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  throw Object.assign(new Error(promptText), {
    code: "APPROVAL_REQUIRED",
    details: {
      kind: "cover_card",
      stepId: context.step?.id ?? context.stepId ?? `review_${storyboardItemId}`,
      proposalDigest,
      prompt: promptText,
      coverPhoto: sourceImagePath,
      items: [proposalItem],
      candidate,
      selectedAssetId: assetId
    }
  });
}

export async function conformMedia(input, context) {
  const cutlist = requireObjectValue(input.cutlist, "media.conform cutlist");
  requireObjectValue(input.approval, "media.conform approval");
  const cacheRoot = input.cacheRoot ? resolveOutputPath(input.cacheRoot, context) : path.join(context.configDir, ".ava-cache", "conform");
  await mkdir(cacheRoot, { recursive: true });
  const scenes = [];
  const width = input.width ?? 1920;
  const height = input.height ?? 1080;
  for (const segment of cutlist.segments ?? []) {
    const sourceInfo = await stat(segment.source);
    const key = digest({ source: segment.source, size: sourceInfo.size, mtimeMs: sourceInfo.mtimeMs, in: segment.sourceInMs, duration: segment.durationMs, profile: input.profile ?? `${width}x${height}` });
    const target = path.join(cacheRoot, `${key}.mov`);
    let hit = true;
    try { await access(target); } catch { hit = false; }
    if (!hit && !context.dryRun) {
      const scaleFilter = width === 1080 && height === 1920
        ? "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2"
        : "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2";
      await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", seconds(segment.sourceInMs), "-i", segment.source, "-t", seconds(segment.durationMs), "-vf", scaleFilter, "-r", "25", "-c:v", "prores_ks", "-profile:v", "2", "-c:a", "pcm_s16le", "-ar", "48000", "-y", target], context.timeoutMs);
    }
    scenes.push({ id: segment.id, source: target, startMs: segment.startMs, sourceInMs: 0, durationMs: segment.durationMs, track: 1, audio: true, audioPolicy: "preserve", cacheHit: hit });
  }
  return { cacheRoot, scenes, conformed: scenes.map((scene) => scene.source), planned: Boolean(context.dryRun) };
}

export async function createBrollStack(input) {
  const approval = requireObjectValue(input.approval, "timeline.broll_stack approval");
  const cutlist = requireObjectValue(input.cutlist, "timeline.broll_stack cutlist");
  const byId = new Map((cutlist.segments ?? []).map((item) => [item.id, item]));
  const items = approval.approvedItems ?? approval.selections ?? [];
  const overlays = items.flatMap((item, index) => {
    const segment = byId.get(item.segmentId);
    const candidate = item.selectedCandidate ?? item.candidates?.find((value) => value.assetId === item.selectedAssetId) ?? item.candidates?.[0] ?? (item.path ? item : undefined);
    const assetPath = candidate?.path ?? item.path;
    if (!segment || !assetPath) return [];

    // Broadcast breathing room: Head >= 2.5s (2520ms) and Tail >= 1.5s (1520ms)
    const headMarginMs = segment.durationMs >= 8000 ? 2520 : 0;
    const tailMarginMs = segment.durationMs >= 8000 ? 1520 : 0;
    const maxAllowedDuration = Math.max(1000, segment.durationMs - headMarginMs - tailMarginMs);
    const targetDurationMs = Math.min(Number(input.maxDurationMs ?? 5_000), maxAllowedDuration);
    const durationMs = frameTime(targetDurationMs, "B-roll duration");
    const startMs = frameTime(segment.startMs + headMarginMs, "B-roll startMs");

    return [{ id: `broll_${String(index + 1).padStart(2, "0")}`, asset: assetPath, startMs, durationMs, track: 2, opacity: 1, scale: 1, audioPolicy: "mute" }];
  });
  return { overlays };
}

export async function createDialogueMix(input) {
  const cutlist = requireObjectValue(input.cutlist, "audio.dialogue_mix cutlist");
  return {
    audio: [],
    dialogueDurationMs: (cutlist.segments ?? []).reduce((sum, item) => sum + Number(item.durationMs ?? 0), 0),
    strategy: "source-audio-preserved-no-loudness-normalization",
    note: "Preserves source audio from conformed A-roll scenes on timeline; does not perform loudness measurement or EBU normalization"
  };
}

export async function createTemplateCards(input) {
  const cards = Array.isArray(input.cards) ? input.cards : [];
  const aeTemplatePath = input.aeTemplatePath ? String(input.aeTemplatePath) : "";
  const overlays = cards.map((card, index) => ({
    id: `title_card_${index + 1}`,
    text: String(card.text ?? card.title ?? ""),
    startMs: frameTime(card.startMs ?? 0, "card startMs"),
    durationMs: frameTime(card.durationMs ?? 3_000, "card durationMs"),
    track: Number(card.track ?? 3),
    opacity: 1,
    scale: 1,
    audioPolicy: "mute"
  }));

  const aeComps = aeTemplatePath ? [{ project: aeTemplatePath, compositions: ["Title_Cover"] }] : [];
  return { overlays, cards, aeComps };
}

export async function qcTimeline(input) {
  const timeline = input.timeline ?? input.timelineSpec;
  const exports = input.exports ?? [];
  const checks = [
    { id: "timeline-present", ok: Boolean(timeline?.scenes?.length), detail: `${timeline?.scenes?.length ?? 0} scenes` },
    { id: "duration-positive", ok: Number(timeline?.durationMs ?? 0) > 0, detail: `${timeline?.durationMs ?? 0}ms` },
    { id: "export-requested", ok: Array.isArray(exports) ? exports.length > 0 : Boolean(exports), detail: "milestone preview" }
  ];
  return { report: { schemaVersion: 1, ok: checks.every((item) => item.ok), checkedAt: new Date().toISOString(), checks } };
}

async function extract1Keyframe(videoPath, cacheDir, timeoutMs) {
  try {
    const fileStat = await stat(videoPath);
    const key = createHash("sha256").update(`${videoPath}:${fileStat.size}:${fileStat.mtimeMs}`).digest("hex").slice(0, 16);
    const thumbPath = path.join(cacheDir, `${path.basename(videoPath, path.extname(videoPath))}_${key}.jpg`);

    try {
      await access(thumbPath);
      return thumbPath;
    } catch (_) {}

    // Deterministic 35% seek
    const durationOut = await capture("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", videoPath], timeoutMs).catch(() => "5.0");
    const durSec = parseFloat(durationOut.trim()) || 5.0;
    const targetSec = Math.max(0.5, (durSec * 0.35)).toFixed(2);

    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-ss", targetSec,
      "-i", videoPath,
      "-vframes", "1",
      "-vf", "scale=512:288:force_original_aspect_ratio=decrease,pad=512:288:(ow-iw)/2:(oh-ih)/2",
      "-q:v", "3",
      "-y", thumbPath
    ], timeoutMs);

    return thumbPath;
  } catch (error) {
    return "";
  }
}

async function walk(root, output) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) await walk(target, output);
    else if (entry.isFile()) output.push(target);
  }
}

function xmlText(value) {
  return value.replace(/<w:tab\s*\/>/g, "\t").replace(/<w:br\s*\/>/g, "\n").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}
function requireObjectValue(value, name) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`); return value; }
function resolveInputPath(value, context) { if (typeof value !== "string" || !value) throw new Error("A non-empty input path is required"); return path.isAbsolute(value) ? value : context.resolvePath(value); }
function resolveCatalogSubpath(value, root, context) { if (typeof value !== "string" || !value) return ""; return path.isAbsolute(value) ? value : path.join(root, value); }
function isWithin(candidate, root) { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
function resolveOutputPath(value, context) { return path.isAbsolute(value) ? value : context.resolvePath(value); }
function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function frameTime(value, name) { const result = Number(value); if (!Number.isFinite(result) || result < 0 || result % 40 !== 0) throw new Error(`${name} must be a non-negative 25fps frame time`); return result; }
function seconds(value) { return (Number(value) / 1000).toFixed(3); }
function capture(command, args, timeoutMs) { return new Promise((resolve, reject) => { let stdout = "", stderr = ""; const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] }); const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`${command} timed out`)); }, timeoutMs); child.stdout.on("data", (chunk) => { stdout += String(chunk); }); child.stderr.on("data", (chunk) => { stderr += String(chunk); }); child.on("error", reject); child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(`${command} exited ${code}: ${stderr.trim()}`)); }); }); }
function run(command, args, timeoutMs) { return capture(command, args, timeoutMs).then(() => undefined); }
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortValue(v)])
    );
  }
  return value;
}
