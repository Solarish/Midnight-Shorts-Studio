import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { isDeepStrictEqual, promisify } from "node:util";
import path from "node:path";
import { deriveExpectedMuteWindows, subtractIntervals } from "../adapters/audio.js";
import { interpolate } from "./interpolate.js";

const execFileAsync = promisify(execFile);

export async function verifyGraphWorkflow(runDirectory, workflow, options = {}) {
  const runDir = path.resolve(runDirectory);
  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail });
  let state;
  try {
    state = JSON.parse(await readFile(path.join(runDir, "state.json"), "utf8"));
    add("state.readable", true, path.join(runDir, "state.json"));
  } catch (error) {
    add("state.readable", false, error.message);
    return report(runDir, checks);
  }

  add("workflow.id", state.workflowId === workflow?.id, `${state.workflowId ?? "missing"} === ${workflow?.id ?? "missing"}`);
  add("workflow.live", state.dryRun === false, `dryRun=${state.dryRun}`);
  const completed = state.status === "success"
    || (state.status === "partial" && (workflow?.steps ?? []).every((step) => state.steps?.[step.id]?.status === "success"));
  add("workflow.success", completed, `status=${state.status}`);

  const hasCarousel = (workflow?.steps ?? []).some((step) => step.type === "effect.3d_carousel");
  const hasDynamicLink = (workflow?.steps ?? []).some((step) => step.type === "timeline.dynamic_link");
  if (hasCarousel && hasDynamicLink) {
    const flatTitleCheck = checkForFlatTitle(workflow, state);
    add("workflow.no_flat_title", flatTitleCheck.ok, flatTitleCheck.detail);
  }

  let previousFinishedAt;
  for (const step of workflow?.steps ?? []) {
    const checkpoint = state.steps?.[step.id];
    add(`step.${step.id}.success`, checkpoint?.status === "success", checkpoint?.status ?? "missing");
    if (checkpoint?.startedAt && previousFinishedAt) {
      add(`step.${step.id}.sequential`, Date.parse(checkpoint.startedAt) >= Date.parse(previousFinishedAt), `${checkpoint.startedAt} >= ${previousFinishedAt}`);
    }
    if (checkpoint?.finishedAt) previousFinishedAt = checkpoint.finishedAt;
    await verifyStep(step, checkpoint?.outputs, state, checks, options, workflow, runDir);
  }
  verifyCoverCompleteness(workflow, state, add);
  verifyAudioContinuity(workflow, state, add);
  return report(runDir, checks);
}

async function verifyStep(step, outputs, state, checks, options, workflow, runDir) {
  const add = (suffix, ok, detail) => checks.push({ id: `output.${step.id}.${suffix}`, ok: Boolean(ok), detail });
  if (!outputs || typeof outputs !== "object") {
    add("present", false, "checkpoint outputs are missing");
    return;
  }
  add("present", Object.keys(outputs).length > 0, `${Object.keys(outputs).length} output field(s)`);
  if (step.type === "asset.select") {
    await verifyFile(`${step.id}.asset`, outputs.path, checks, 1);
    return;
  }
  if (step.type === "asset.multi_select") {
    const mediaList = Array.isArray(outputs.mediaList) ? outputs.mediaList : [];
    add("media_list", mediaList.length > 0, `${mediaList.length} media file(s)`);
    for (const [index, mediaPath] of mediaList.entries()) {
      await verifyFile(`${step.id}.asset_${index}`, mediaPath, checks, 1);
    }
    return;
  }
  if (step.type === "media.probe") {
    add("probe", Boolean(outputs.path && Array.isArray(outputs.streams)), JSON.stringify({ path: outputs.path, streams: outputs.streams?.length }));
    return;
  }
  if (step.type === "template.payload") return;
  if (step.type === "llm.chat") {
    add("content", typeof outputs.content === "string" || outputs.parsed !== undefined, JSON.stringify(outputs));
    return;
  }
  if (step.type === "timeline.scene") {
    const scene = outputs.scene;
    add("scene", Boolean(scene?.id && scene?.source && scene?.durationMs > 0), JSON.stringify(scene ?? null));
    return;
  }
  if (step.type === "timeline.transition") {
    add("transition", Boolean(outputs.transition?.id && outputs.transition?.type), JSON.stringify(outputs.transition ?? null));
    return;
  }
  if (step.type === "timeline.overlay") {
    add("overlay", Boolean(outputs.overlay?.id && outputs.overlay?.durationMs > 0), JSON.stringify(outputs.overlay ?? null));
    return;
  }
  if (step.type === "timeline.dynamic_link") {
    const link = outputs.dynamicLink;
    const contractOk = Boolean(
      link &&
      typeof link.id === "string" && /^[A-Za-z0-9_-]+$/.test(link.id) &&
      typeof link.project === "string" && path.isAbsolute(link.project) &&
      typeof link.composition === "string" && link.composition.trim() &&
      Number.isInteger(link.startMs) && link.startMs >= 0 && (link.startMs % 40 === 0) &&
      Number.isInteger(link.durationMs) && link.durationMs > 0 && (link.durationMs % 40 === 0) &&
      Number.isInteger(link.track) && link.track >= 1 &&
      link.audioPolicy === "mute"
    );
    add("dynamic_link", contractOk, JSON.stringify(link ?? null));
    add("mute_policy", link?.audioPolicy === "mute", `audioPolicy=${link?.audioPolicy}`);
    await verifyFile(`${step.id}.project`, link?.project, checks, 1_024);
    return;
  }
  if (step.type === "timeline.compose") {
    const timeline = outputs.timelineSpec;
    add("timeline", timeline?.schemaVersion === 1 && Array.isArray(timeline?.scenes) && timeline.scenes.length > 0, JSON.stringify({ name: timeline?.name, durationMs: timeline?.durationMs, scenes: timeline?.scenes?.length }));
    add("frame_rate", timeline?.frameRate === 25, `frameRate=${timeline?.frameRate}`);
    const requestedDlCount = Array.isArray(step.with?.dynamicLinks) ? step.with.dynamicLinks.length : 0;
    if (requestedDlCount > 0 || timeline?.dynamicLinks !== undefined) {
      const dynamicLinks = Array.isArray(timeline?.dynamicLinks) ? timeline.dynamicLinks : [];
      add("dynamic_links", requestedDlCount === 0 || dynamicLinks.length === requestedDlCount, `${dynamicLinks.length} dynamic link(s) reported vs ${requestedDlCount} requested`);
    }
    return;
  }
  if (["audio.asset", "audio.jaitts", "audio.mix"].includes(step.type)) {
    const audio = outputs.audio;
    add("audio_contract", Boolean(audio?.id && audio?.path && audio?.role && Number.isFinite(audio?.startMs) && Number.isFinite(audio?.gainDb)), JSON.stringify(audio ?? null));
    if (step.type !== "audio.asset" && audio?.path) await verifyFile(`${step.id}.audio_file`, audio.path, checks, 44);
    return;
  }
  if (step.type === "image.removeBackground") {
    await verifyFile(`${step.id}.image`, outputs.path, checks, 32);
    return;
  }
  if (step.type === "graphics.cover_title") {
    let resolvedWith;
    try {
      resolvedWith = interpolate(step.with ?? {}, {
        workflow,
        env: process.env,
        run: { id: state.runId, dir: runDir },
        steps: Object.fromEntries(Object.entries(state.steps ?? {}).map(([id, value]) => [id, { outputs: value?.outputs }]))
      });
      add("inputs_resolved", true, "cover title inputs resolved from checkpoint state");
    } catch (err) {
      add("inputs_resolved", false, err.message);
      resolvedWith = step.with ?? {};
    }

    const expectedText = {
      eyebrow: resolvedWith.eyebrow ?? "อาจารย์ตัวอย่างดีเด่น · ประจำปี 2569",
      title: resolvedWith.title,
      subtitle: resolvedWith.subtitle ?? "มหาวิทยาลัยสงขลานครินทร์"
    };
    add("live", outputs.dryRun !== true, `dryRun=${outputs.dryRun}`);
    add("source_binding", typeof outputs.source === "string" && path.isAbsolute(outputs.source) && outputs.source === resolvedWith.image, `${outputs.source} === ${resolvedWith.image}`);
    add("output_binding", typeof outputs.image === "string" && path.isAbsolute(outputs.image) && outputs.image === outputs.path && outputs.image === outputs.outputIdentity?.path, `${outputs.image} === ${outputs.outputIdentity?.path}`);
    add("distinct_paths", Boolean(outputs.source && outputs.image && path.resolve(outputs.source) !== path.resolve(outputs.image)), `${outputs.source} != ${outputs.image}`);
    add("text", isDeepStrictEqual(outputs.text, expectedText), JSON.stringify({ actual: outputs.text, expected: expectedText }));
    add("source_identity_path", outputs.sourceIdentity?.path === outputs.source, `${outputs.sourceIdentity?.path} === ${outputs.source}`);
    for (const [label, receipt] of [["source", outputs.sourceIdentity], ["output", outputs.outputIdentity]]) {
      try {
        const identity = await stat(receipt?.path);
        const digest = await sha256File(receipt?.path);
        add(`${label}_file`, identity.isFile() && identity.size >= 32, `${receipt?.path} (${identity.size} bytes)`);
        add(`${label}_size`, receipt?.sizeBytes === identity.size, `${receipt?.sizeBytes} === ${identity.size}`);
        add(`${label}_sha256`, receipt?.sha256 === digest, `${receipt?.sha256} === ${digest}`);
      } catch (err) {
        add(`${label}_file`, false, err.message);
        add(`${label}_size`, false, err.message);
        add(`${label}_sha256`, false, err.message);
      }
    }
    add("content_changed", Boolean(outputs.sourceIdentity?.sha256 && outputs.outputIdentity?.sha256 && outputs.sourceIdentity.sha256 !== outputs.outputIdentity.sha256), `${outputs.sourceIdentity?.sha256} != ${outputs.outputIdentity?.sha256}`);
    return;
  }
  if (step.type === "comfyui.workflow") {
    const images = Array.isArray(outputs.images) ? outputs.images : [];
    add("images", images.length > 0, `${images.length} image(s)`);
    const allSteps = workflow?.steps ?? [];
    const isCoverGen = String(step.with?.workflowFile ?? "").includes("cover") ||
      allSteps.some((s) => s.type === "review.media_approval" && (
        String(s.with?.asset ?? "").includes(`steps.${step.id}.outputs`) ||
        String(s.with?.workflowDigest ?? "").includes(`steps.${step.id}.outputs`)
      ));
    const hasCacheEvidence = outputs.workflowDigest !== undefined || outputs.cacheDigest !== undefined || outputs.cacheHit !== undefined;
    if (hasCacheEvidence || isCoverGen) {
      add("workflow_digest", typeof outputs.workflowDigest === "string" && /^[a-fA-F0-9]{64}$/.test(outputs.workflowDigest), `workflowDigest=${outputs.workflowDigest}`);
      add("cache_digest", typeof outputs.cacheDigest === "string" && /^[a-fA-F0-9]{64}$/.test(outputs.cacheDigest), `cacheDigest=${outputs.cacheDigest}`);
      add("cache_hit", typeof outputs.cacheHit === "boolean", `cacheHit=${outputs.cacheHit}`);
    }
    for (const [index, image] of images.entries()) {
      await verifyFile(`${step.id}.image_${index}`, image?.localPath, checks, 32);
      if (isCoverGen || image?.sha256) {
        const hasSha = typeof image?.sha256 === "string" && /^[a-fA-F0-9]{64}$/.test(image.sha256);
        add(`image_${index}.sha256_format`, hasSha, `sha256=${image?.sha256}`);
        if (hasSha && image?.localPath) {
          try {
            const actualHash = await sha256File(image.localPath);
            add(`image_${index}.sha256`, actualHash === image.sha256, `${actualHash} === ${image.sha256}`);
          } catch (err) {
            add(`image_${index}.sha256`, false, err.message);
          }
        } else {
          add(`image_${index}.sha256`, false, "missing sha256 or localPath");
        }
      }
    }
    return;
  }
  if (step.type === "review.media_approval") {
    const approvedAsset = outputs.approvedAsset;
    const approval = outputs.approval;
    await verifyFile(`${step.id}.approved_asset`, approvedAsset, checks, 32);

    add("approved_flag", approval?.approved === true && approval?.planned !== true, `approved=${approval?.approved}, planned=${approval?.planned}`);
    add("kind", approval?.kind === "cover_card", `kind=${approval?.kind}`);
    add("storyboard_item_id", typeof approval?.storyboardItemId === "string" && /^[A-Za-z0-9_-]+$/.test(approval?.storyboardItemId), `storyboardItemId=${approval?.storyboardItemId}`);
    add("source_image_path", typeof approval?.sourceImage === "string" && path.isAbsolute(approval?.sourceImage), `sourceImage=${approval?.sourceImage}`);
    add("prompt", typeof approval?.prompt === "string" && approval.prompt.trim().length > 0, `prompt=${approval?.prompt}`);
    add("seed", Number.isSafeInteger(approval?.seed) && approval.seed >= 0, `seed=${approval?.seed}`);

    add("workflow_digest", typeof approval?.workflowDigest === "string" && /^[a-fA-F0-9]{64}$/.test(approval?.workflowDigest), `workflowDigest=${approval?.workflowDigest}`);
    add("source_digest", typeof approval?.sourceDigest === "string" && /^[a-fA-F0-9]{64}$/.test(approval?.sourceDigest), `sourceDigest=${approval?.sourceDigest}`);
    add("output_digest", typeof approval?.outputDigest === "string" && /^[a-fA-F0-9]{64}$/.test(approval?.outputDigest), `outputDigest=${approval?.outputDigest}`);
    add("proposal_digest", typeof approval?.proposalDigest === "string" && /^[a-fA-F0-9]{64}$/.test(approval?.proposalDigest), `proposalDigest=${approval?.proposalDigest}`);

    add("asset_match", approval?.asset === approvedAsset, `${approval?.asset} === ${approvedAsset}`);

    if (step.with?.storyboardItemId !== undefined) {
      add("storyboard_item_id_match", approval?.storyboardItemId === step.with.storyboardItemId, `approval=${approval?.storyboardItemId} with=${step.with.storyboardItemId}`);
    }
    if (step.with?.sourceImage !== undefined) {
      add("source_image_match", approval?.sourceImage === step.with.sourceImage, `approval=${approval?.sourceImage} with=${step.with.sourceImage}`);
    }
    if (step.with?.prompt !== undefined) {
      add("prompt_match", approval?.prompt === step.with.prompt, `approval=${approval?.prompt} with=${step.with.prompt}`);
    }
    if (step.with?.seed !== undefined) {
      add("seed_match", approval?.seed === step.with.seed, `approval=${approval?.seed} with=${step.with.seed}`);
    }

    if (approval?.sourceImage) {
      try {
        const actualSourceDigest = await sha256File(approval.sourceImage);
        add("source_digest_match", actualSourceDigest === approval.sourceDigest, `${actualSourceDigest} === ${approval.sourceDigest}`);
      } catch (err) {
        add("source_digest_match", false, `source image unreadable: ${err.message}`);
      }
    } else {
      add("source_digest_match", false, "missing sourceImage");
    }

    if (approvedAsset) {
      try {
        const actualOutputDigest = await sha256File(approvedAsset);
        add("output_digest_match", actualOutputDigest === approval.outputDigest, `${actualOutputDigest} === ${approval.outputDigest}`);
      } catch (err) {
        add("output_digest_match", false, `approved asset unreadable: ${err.message}`);
      }
    } else {
      add("output_digest_match", false, "missing approvedAsset");
    }
    return;
  }
  if (step.type === "ae.template" || step.type === "effect.3d_carousel") {
    await verifyFile(`${step.id}.project`, outputs.project, checks, 1_024);
    add("host_receipt", outputs.hostResult?.ok === true && outputs.hostResult?.stage === "complete", JSON.stringify(outputs.hostResult ?? null));
    if (step.type === "effect.3d_carousel") {
      await verifyCarouselMilestones(step, outputs, checks);
    }
    return;
  }
  if (step.type === "ae.render") {
    await verifyFile(`${step.id}.render`, outputs.output, checks, 1_024);
    await verifyAfterEffectsRenderSpec(step, outputs, state, checks, options, workflow);
    return;
  }
  if (step.type === "premiere.assemble" || step.type === "premiere.build") {
    await verifyFile(`${step.id}.project`, outputs.project, checks, 1);
    add("sequence", Boolean(outputs.sequenceName && outputs.sequenceGuid), JSON.stringify({ sequenceName: outputs.sequenceName, sequenceGuid: outputs.sequenceGuid }));
    if (step.type === "premiere.build") {
      const timeline = (typeof step.with?.timelineSpec === "object" && step.with?.timelineSpec)
        || Object.values(state.steps ?? {}).map((s) => s?.outputs?.timelineSpec).find(Boolean);

      // Verify scenes receipts
      const requestedScenes = timeline?.scenes ?? [];
      const sceneReceipts = Array.isArray(outputs.scenes) ? outputs.scenes : [];
      add("scenes_count", sceneReceipts.length === requestedScenes.length, `${sceneReceipts.length}/${requestedScenes.length} scene(s)`);
      for (const req of requestedScenes) {
        const matching = sceneReceipts.filter((r) => r.id === req.id);
        const receipt = matching[0];
        const matchOk = Boolean(
          matching.length === 1 &&
          receipt.source === req.source &&
          receipt.startMs === req.startMs &&
          receipt.sourceInMs === (req.sourceInMs || 0) &&
          receipt.durationMs === req.durationMs &&
          receipt.videoTrack === req.track &&
          receipt.audioPolicy === req.audioPolicy &&
          receipt.storyboardItemId === req.storyboardItemId &&
          receipt.editorialKind === req.editorialKind &&
          receipt.parentStoryboardItemId === req.parentStoryboardItemId &&
          (req.audioPolicy === "preserve"
            ? (receipt.audioTrack === req.track && receipt.audioInserted === true)
            : (receipt.audioTrack === -1 && receipt.audioInserted === false))
        );
        add(`scene.${req.id}.receipt`, matchOk, JSON.stringify(receipt ?? null));
      }

      // Verify overlays receipts
      const requestedOverlays = timeline?.overlays ?? [];
      if (requestedOverlays.length > 0 || outputs.overlays !== undefined) {
        const overlayReceipts = Array.isArray(outputs.overlays) ? outputs.overlays : [];
        add("overlays_count", overlayReceipts.length === requestedOverlays.length, `${overlayReceipts.length}/${requestedOverlays.length} overlay(s)`);
        for (const req of requestedOverlays) {
          const matching = overlayReceipts.filter((r) => r.id === req.id);
          const receipt = matching[0];
          const matchOk = Boolean(
            matching.length === 1 &&
            receipt.asset === req.asset &&
            receipt.startMs === req.startMs &&
            receipt.durationMs === req.durationMs &&
            receipt.videoTrack === req.track &&
            receipt.audioPolicy === "mute" &&
            receipt.storyboardItemId === req.storyboardItemId &&
            receipt.editorialKind === req.editorialKind &&
            receipt.parentStoryboardItemId === req.parentStoryboardItemId &&
            receipt.audioTrack === -1 &&
            receipt.audioInserted === false
          );
          add(`overlay.${req.id}.receipt`, matchOk, JSON.stringify(receipt ?? null));
        }
      }

      // Verify dynamicLinks receipts
      const requestedDynamicLinks = timeline?.dynamicLinks ?? [];
      if (requestedDynamicLinks.length > 0 || outputs.dynamicLinks !== undefined) {
        const receipts = Array.isArray(outputs.dynamicLinks) ? outputs.dynamicLinks : [];
        add("dynamic_links_count", receipts.length === requestedDynamicLinks.length, `${receipts.length}/${requestedDynamicLinks.length} dynamicLink(s)`);
        for (const req of requestedDynamicLinks) {
          const matching = receipts.filter((r) => r.id === req.id || (r.project === req.project && r.composition === req.composition));
          const receipt = matching[0];
          const matchOk = Boolean(
            matching.length === 1 &&
            receipt.project === req.project &&
            receipt.composition === req.composition &&
            receipt.startMs === req.startMs &&
            receipt.durationMs === req.durationMs &&
            receipt.videoTrack === req.track &&
            receipt.audioPolicy === "mute" &&
            receipt.storyboardItemId === req.storyboardItemId &&
            receipt.editorialKind === req.editorialKind &&
            receipt.parentStoryboardItemId === req.parentStoryboardItemId &&
            receipt.audioTrack === -1 &&
            receipt.audioInserted === false
          );
          add(`dynamic_link.${req.id}.receipt`, matchOk, JSON.stringify(receipt ?? null));
        }
      }

      // Verify audio receipts
      const requestedAudio = timeline?.audio ?? [];
      if (requestedAudio.length > 0 || outputs.audio !== undefined) {
        const audioReceipts = Array.isArray(outputs.audio) ? outputs.audio : [];
        add("audio_count", audioReceipts.length === requestedAudio.length, `${audioReceipts.length}/${requestedAudio.length} audio`);
        for (const [idx, req] of requestedAudio.entries()) {
          const matching = audioReceipts.filter((r) => r.id === req.id);
          const receipt = matching[0];
          const matchOk = Boolean(
            matching.length === 1 &&
            receipt.path === req.path &&
            receipt.startMs === req.startMs &&
            (req.durationMs === undefined || receipt.durationMs === req.durationMs) &&
            receipt.audioTrack === (idx + 1) &&
            receipt.audioInserted === true
          );
          add(`audio.${req.id}.receipt`, matchOk, JSON.stringify(receipt ?? null));
        }
      }
    }
    return;
  }
  if (step.type === "premiere.export") {
    await verifyExports(step, outputs, state, checks, options);
    return;
  }
  if (step.type === "media.audio_normalize") {
    let resolvedWith;
    try {
      resolvedWith = interpolate(step.with ?? {}, {
        workflow,
        env: process.env,
        run: { id: state.runId, dir: runDir },
        steps: Object.fromEntries(Object.entries(state.steps ?? {}).map(([id, value]) => [id, { outputs: value?.outputs }]))
      });
      add("inputs_resolved", true, "normalization inputs resolved from checkpoint state");
    } catch (err) {
      add("inputs_resolved", false, err.message);
      resolvedWith = step.with ?? {};
    }
    add("live", outputs.dryRun !== true, `dryRun=${outputs.dryRun}`);
    const source = outputs.source;
    const output = outputs.output;
    const sourcePath = source?.path;
    const outputPath = output?.path;
    add("source_binding", typeof sourcePath === "string" && path.isAbsolute(sourcePath) && sourcePath === outputs.sourcePath && sourcePath === resolvedWith.source, `${sourcePath} === ${resolvedWith.source}`);
    add("output_binding", typeof outputPath === "string" && path.isAbsolute(outputPath) && outputPath === outputs.outputPath && outputPath === outputs.media, `${outputPath} === ${outputs.media}`);
    add("distinct_paths", Boolean(sourcePath && outputPath && path.resolve(sourcePath) !== path.resolve(outputPath)), `${sourcePath} != ${outputPath}`);
    add("policy", isDeepStrictEqual(outputs.policy, {
      targetLufs: resolvedWith.targetLufs,
      maxTruePeakDbfs: resolvedWith.maxTruePeakDbfs,
      loudnessRange: resolvedWith.loudnessRange ?? 11,
      audioBitrateKbps: resolvedWith.audioBitrateKbps ?? 320
    }), JSON.stringify(outputs.policy ?? null));
    for (const [label, receipt] of [["source", source], ["output", output]]) {
      const receiptPath = receipt?.path;
      try {
        const identity = await stat(receiptPath);
        const digest = await sha256File(receiptPath);
        add(`${label}_file`, identity.isFile() && identity.size > 0, `${receiptPath} (${identity.size} bytes)`);
        add(`${label}_size`, receipt?.sizeBytes === identity.size, `${receipt?.sizeBytes} === ${identity.size}`);
        add(`${label}_sha256`, receipt?.sha256 === digest, `${receipt?.sha256} === ${digest}`);
      } catch (err) {
        add(`${label}_file`, false, err.message);
        add(`${label}_size`, false, err.message);
        add(`${label}_sha256`, false, err.message);
      }
    }
    return;
  }
  if (step.type === "audio.loudness_qc") {
    const report = outputs.report;
    if (!report || typeof report !== "object") {
      add("report_present", false, "report is missing");
      return;
    }
    add("measured", report.measured === true, `measured=${report.measured}`);
    add("passed", report.passed === true, `passed=${report.passed}`);

    let resolvedWith;
    try {
      resolvedWith = interpolate(step.with ?? {}, {
        workflow,
        env: process.env,
        run: { id: state.runId, dir: runDir },
        steps: Object.fromEntries(Object.entries(state.steps ?? {}).map(([id, value]) => [id, { outputs: value?.outputs }]))
      });
      add("inputs_resolved", true, "audio QC inputs resolved from checkpoint state");
    } catch (err) {
      add("inputs_resolved", false, err.message);
      resolvedWith = step.with ?? {};
    }

    add("schema_version", report.schemaVersion === 1, `schemaVersion=${report.schemaVersion}`);
    add("measured_at", typeof report.measuredAt === "string" && Number.isFinite(Date.parse(report.measuredAt)), `measuredAt=${report.measuredAt}`);

    const source = report.source;
    if (!source?.path || typeof source.path !== "string" || !path.isAbsolute(source.path)) {
      add("source_valid", false, `source path is invalid or not absolute: ${source?.path}`);
    } else {
      if (typeof resolvedWith.source === "string" && path.isAbsolute(resolvedWith.source)) {
        add("source_path_match", source.path === resolvedWith.source, `${source.path} === ${resolvedWith.source}`);
      }
      try {
        await access(source.path);
        const actualSha256 = await sha256File(source.path);
        const stats = await stat(source.path);
        add("source_sha_match", actualSha256 === source.sha256, `${actualSha256} === ${source.sha256}`);
        add("source_size_match", stats.size === source.size, `${stats.size} === ${source.size}`);
        add("source_identity_valid", /^[a-f0-9]{64}$/.test(source.sha256 ?? "") && Number.isInteger(source.size) && source.size > 0, `sha256=${source.sha256}, size=${source.size}`);
      } catch (err) {
        add("source_readable", false, `source file unreadable: ${err.message}`);
      }
    }

    if (outputs.receiptPath && typeof outputs.receiptPath === "string") {
      try {
        await access(outputs.receiptPath);
        const diskReceipt = JSON.parse(await readFile(outputs.receiptPath, "utf8"));
        add("receipt_match", isDeepStrictEqual(diskReceipt, report), "disk receipt exactly matches checkpoint report");
      } catch (err) {
        add("receipt_readable", false, `receipt file unreadable: ${err.message}`);
      }
    } else {
      add("receipt_path", false, "outputs.receiptPath missing");
    }

    const policy = report.policy ?? {};
    const stepWith = resolvedWith ?? {};
    add("policy_target_lufs", policy.targetLufs === stepWith.targetLufs, `${policy.targetLufs} === ${stepWith.targetLufs}`);
    add("policy_tolerance_lufs", policy.toleranceLufs === stepWith.toleranceLufs, `${policy.toleranceLufs} === ${stepWith.toleranceLufs}`);
    add("policy_max_true_peak", policy.maxTruePeakDbfs === stepWith.maxTruePeakDbfs, `${policy.maxTruePeakDbfs} === ${stepWith.maxTruePeakDbfs}`);
    add("policy_silence_thresh", policy.silenceThresholdDbfs === stepWith.silenceThresholdDbfs, `${policy.silenceThresholdDbfs} === ${stepWith.silenceThresholdDbfs}`);
    add("policy_min_silence", policy.minSilenceMs === stepWith.minSilenceMs, `${policy.minSilenceMs} === ${stepWith.minSilenceMs}`);
    add("policy_max_unexp_silence", policy.maxUnexpectedSilenceMs === stepWith.maxUnexpectedSilenceMs, `${policy.maxUnexpectedSilenceMs} === ${stepWith.maxUnexpectedSilenceMs}`);

    const meas = report.measurements ?? {};
    add("measurements_finite", Number.isFinite(meas.integratedLufs) && Number.isFinite(meas.truePeakDbfs), `integratedLufs=${meas.integratedLufs}, truePeakDbfs=${meas.truePeakDbfs}`);

    const checksObj = report.checks ?? {};
    const expectedDiffLufs = Math.abs(meas.integratedLufs - policy.targetLufs);
    const expectedLoudnessPass = Number.isFinite(expectedDiffLufs) && expectedDiffLufs <= policy.toleranceLufs;
    const loudnessConsistent = checksObj.loudness?.passed === expectedLoudnessPass
      && checksObj.loudness?.targetLufs === policy.targetLufs
      && checksObj.loudness?.toleranceLufs === policy.toleranceLufs
      && checksObj.loudness?.actualLufs === meas.integratedLufs
      && Math.abs(checksObj.loudness?.diffLufs - expectedDiffLufs) < 1e-9;
    add("check_loudness", expectedLoudnessPass && loudnessConsistent, `expected pass=${expectedLoudnessPass}, diff=${expectedDiffLufs}; receipt pass=${checksObj.loudness?.passed}, diff=${checksObj.loudness?.diffLufs}`);

    const expectedTruePeakPass = Number.isFinite(meas.truePeakDbfs) && meas.truePeakDbfs <= policy.maxTruePeakDbfs;
    const truePeakConsistent = checksObj.truePeak?.passed === expectedTruePeakPass
      && checksObj.truePeak?.maxTruePeakDbfs === policy.maxTruePeakDbfs
      && checksObj.truePeak?.actualTruePeakDbfs === meas.truePeakDbfs;
    add("check_true_peak", expectedTruePeakPass && truePeakConsistent, `expected pass=${expectedTruePeakPass}; receipt pass=${checksObj.truePeak?.passed}`);

    const silence = report.silence ?? {};
    const validIntervals = (values) => Array.isArray(values) && values.every((item) =>
      Number.isFinite(item?.startMs) && Number.isFinite(item?.endMs) && Number.isFinite(item?.durationMs)
      && item.startMs >= 0 && item.endMs > item.startMs && item.durationMs === item.endMs - item.startMs
    );
    const detectedValid = validIntervals(silence.detectedIntervals);
    const expectedValid = validIntervals(silence.expectedMuteWindows);
    const unexpectedValid = validIntervals(silence.unexpectedIntervals);
    let derivedMuteWindows = [];
    try {
      derivedMuteWindows = deriveExpectedMuteWindows(stepWith.timelineSpec ?? stepWith.timeline);
      add("silence_expected_windows", expectedValid && isDeepStrictEqual(silence.expectedMuteWindows, derivedMuteWindows), JSON.stringify({ receipt: silence.expectedMuteWindows, derived: derivedMuteWindows }));
    } catch (err) {
      add("silence_expected_windows", false, err.message);
    }
    const recomputedUnexpected = detectedValid && expectedValid
      ? silence.detectedIntervals.flatMap((interval) => subtractIntervals(interval, silence.expectedMuteWindows))
      : [];
    add("silence_intervals_consistent", detectedValid && expectedValid && unexpectedValid && isDeepStrictEqual(silence.unexpectedIntervals, recomputedUnexpected), JSON.stringify({ receipt: silence.unexpectedIntervals, recomputed: recomputedUnexpected }));
    const expectedSilencePass = unexpectedValid && silence.unexpectedIntervals.every((interval) => interval.durationMs <= policy.maxUnexpectedSilenceMs);
    const silenceConsistent = checksObj.silence?.passed === expectedSilencePass
      && checksObj.silence?.maxUnexpectedSilenceMs === policy.maxUnexpectedSilenceMs
      && isDeepStrictEqual(checksObj.silence?.unexpectedIntervals, silence.unexpectedIntervals);
    add("check_silence", expectedSilencePass && silenceConsistent, `expected pass=${expectedSilencePass}; receipt pass=${checksObj.silence?.passed}`);
    add("check_audio_stream", checksObj.audioStream?.passed === true, `audioStream.passed=${checksObj.audioStream?.passed}`);
    const recomputedPassed = expectedLoudnessPass && expectedTruePeakPass && expectedSilencePass && checksObj.audioStream?.passed === true;
    add("passed_consistent", report.passed === recomputedPassed && recomputedPassed === true, `report.passed=${report.passed}, recomputed=${recomputedPassed}`);
    return;
  }
}

async function verifyCarouselMilestones(step, outputs, checks) {
  const add = (suffix, ok, detail) => checks.push({ id: `output.${step.id}.${suffix}`, ok: Boolean(ok), detail });
  if (!outputs.diagnosticLog) {
    add("milestones", false, "diagnostic log is missing");
    return;
  }
  try {
    const milestones = await readFile(outputs.diagnosticLog, "utf8");
    const required = ["runner-started", "template-opened", "text-bound", "footage-bound", "project-saved", "project-closed"];
    const missing = required.filter((value) => !milestones.includes(value));
    add("milestones", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : outputs.diagnosticLog);
  } catch (error) {
    add("milestones", false, error.message);
  }
}

async function verifyAfterEffectsRenderSpec(step, outputs, state, checks, options, workflow) {
  const add = (suffix, ok, detail) => checks.push({ id: `output.${step.id}.${suffix}`, ok: Boolean(ok), detail });
  if (!outputs.output) return;
  try {
    const media = await (options.probeMedia ?? probeMedia)(outputs.output);
    const video = media.streams?.find((value) => value.codec_type === "video");
    add("video_stream", Boolean(video), video ? `${video.codec_name ?? "unknown"} ${video.width ?? "?"}x${video.height ?? "?"}` : "missing video stream");
    if (!video) return;

    const expectation = carouselRenderExpectation(outputs, state, workflow);
    if (!expectation) return;
    const actualFrameRate = frameRate(video);
    if (expectation.frameRate !== undefined) {
      add("frame_rate", nearlyEqual(actualFrameRate, expectation.frameRate, 0.001), `${actualFrameRate ?? "unknown"}fps vs ${expectation.frameRate}fps`);
    }
    if (expectation.durationSeconds !== undefined) {
      const actualDuration = Number(media.format?.duration ?? video.duration);
      const toleranceSeconds = Math.max(0.04, 1 / (expectation.frameRate ?? actualFrameRate ?? 25));
      add(
        "duration",
        Number.isFinite(actualDuration) && Math.abs(actualDuration - expectation.durationSeconds) <= toleranceSeconds,
        `${actualDuration}s vs ${expectation.durationSeconds}s (tolerance ${toleranceSeconds}s)`
      );
    }
  } catch (error) {
    add("probe", false, error.message);
  }
}

function carouselRenderExpectation(renderOutputs, state, workflow) {
  const carouselStep = (workflow?.steps ?? []).find((candidate) => {
    if (candidate.type !== "effect.3d_carousel") return false;
    return state.steps?.[candidate.id]?.outputs?.project === renderOutputs.project;
  });
  if (!carouselStep) return undefined;
  const timing = carouselStep.with?.timing ?? {};
  let durationSeconds = finitePositive(timing.durationSeconds);
  if (durationSeconds === undefined && finitePositive(timing.secondsPerPhoto) !== undefined) {
    durationSeconds = finitePositive(timing.secondsPerPhoto) * 21;
  }
  if (durationSeconds === undefined && timing.pacing === "cinematic") durationSeconds = 15;
  if (durationSeconds === undefined && timing.pacing === "dynamic") durationSeconds = 10;
  let expectedFrameRate = finitePositive(timing.frameRate);
  if (expectedFrameRate === undefined) {
    const timeline = Object.values(state.steps ?? {})
      .map((value) => value?.outputs?.timelineSpec)
      .find((value) => value?.scenes?.some((scene) => scene.source === renderOutputs.output));
    expectedFrameRate = finitePositive(timeline?.frameRate);
  }
  return { durationSeconds, frameRate: expectedFrameRate };
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function nearlyEqual(left, right, tolerance) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
}

async function verifyExports(step, outputs, state, checks, options) {
  const receipts = Array.isArray(outputs.exports) ? outputs.exports : [];
  const requestedExports = Array.isArray(step.with?.exports) ? step.with.exports : [];
  const expected = requestedExports.length > 0
    ? [...new Set(requestedExports.map((value) => value?.format).filter(Boolean))]
    : ["h264", "prores"];
  const timeline = Object.values(state.steps ?? {}).map((value) => value?.outputs?.timelineSpec).find(Boolean);
  for (const format of expected) {
    const receipt = receipts.find((value) => value?.format === format);
    checks.push({ id: `output.${step.id}.${format}.receipt`, ok: Boolean(receipt), detail: JSON.stringify(receipt ?? null) });
    if (!receipt) continue;
    const output = receipt.output ?? receipt.path;
    await verifyFile(`${step.id}.${format}.file`, output, checks, 1_024);
    if (receipt.sha256 && output) {
      const digest = await sha256File(output).catch(() => undefined);
      checks.push({ id: `output.${step.id}.${format}.sha256`, ok: digest === receipt.sha256, detail: `${digest ?? "unreadable"} === ${receipt.sha256}` });
    } else checks.push({ id: `output.${step.id}.${format}.sha256`, ok: false, detail: "receipt sha256 is missing" });
    if (output) {
      try {
        const media = await (options.probeMedia ?? probeMedia)(output);
        const video = media.streams?.find((value) => value.codec_type === "video");
        const audio = media.streams?.find((value) => value.codec_type === "audio");
        const codecOk = format === "h264" ? video?.codec_name === "h264" : String(video?.codec_name ?? "").startsWith("prores");
        checks.push({ id: `output.${step.id}.${format}.codec`, ok: codecOk, detail: video?.codec_name ?? "missing video stream" });
        checks.push({ id: `output.${step.id}.${format}.frame_rate`, ok: frameRate(video) === 25, detail: String(frameRate(video)) });
        if (timeline?.width && timeline?.height) checks.push({ id: `output.${step.id}.${format}.dimensions`, ok: video?.width === timeline.width && video?.height === timeline.height, detail: `${video?.width}x${video?.height} === ${timeline.width}x${timeline.height}` });
        if (Array.isArray(timeline?.audio) && timeline.audio.length) checks.push({ id: `output.${step.id}.${format}.audio`, ok: Boolean(audio), detail: audio?.codec_name ?? "missing audio stream" });
        if (timeline?.durationMs) {
          const durationSeconds = Number(media.format?.duration ?? video?.duration);
          checks.push({ id: `output.${step.id}.${format}.duration`, ok: Number.isFinite(durationSeconds) && Math.abs(durationSeconds * 1000 - timeline.durationMs) <= 40, detail: `${durationSeconds}s vs ${timeline.durationMs}ms` });
        }
      } catch (error) {
        checks.push({ id: `output.${step.id}.${format}.probe`, ok: false, detail: error.message });
      }
    }
  }
  const orderedReceipts = expected.map((format) => receipts.find((value) => value?.format === format));
  const sequential = orderedReceipts.length < 2 || orderedReceipts.every((receipt, index) => {
    if (index === 0) return Boolean(receipt?.finishedAt);
    const previous = orderedReceipts[index - 1];
    return Boolean(previous?.finishedAt && receipt?.startedAt && Date.parse(receipt.startedAt) >= Date.parse(previous.finishedAt));
  });
  checks.push({
    id: `output.${step.id}.sequential_exports`,
    ok: sequential,
    detail: orderedReceipts.length < 2
      ? `single requested export: ${expected[0] ?? "none"}`
      : orderedReceipts.map((receipt) => `${receipt?.format ?? "missing"}:${receipt?.startedAt ?? "missing"}->${receipt?.finishedAt ?? "missing"}`).join(", ")
  });
}

async function probeMedia(filePath) {
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath], { timeout: 30_000 });
  return JSON.parse(stdout);
}

function frameRate(stream) {
  const value = stream?.avg_frame_rate ?? stream?.r_frame_rate;
  if (typeof value !== "string") return undefined;
  const [top, bottom = "1"] = value.split("/").map(Number);
  return Number.isFinite(top) && Number.isFinite(bottom) && bottom !== 0 ? top / bottom : undefined;
}

async function verifyFile(id, filePath, checks, minimumBytes) {
  if (!filePath) {
    checks.push({ id: `output.${id}`, ok: false, detail: "missing path in checkpoint outputs" });
    return;
  }
  try {
    const value = await stat(filePath);
    checks.push({ id: `output.${id}`, ok: value.isFile() && value.size >= minimumBytes, detail: `${filePath} (${value.size} bytes)` });
  } catch (error) {
    checks.push({ id: `output.${id}`, ok: false, detail: error.message });
  }
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function checkForFlatTitle(workflow, state) {
  const carouselSteps = (workflow?.steps ?? []).filter((step) => step.type === "effect.3d_carousel");
  const carouselProjects = new Set();
  for (const cs of carouselSteps) {
    const proj = state?.steps?.[cs.id]?.outputs?.project || cs.with?.outputProject;
    if (proj) carouselProjects.add(proj);
    carouselProjects.add(`\${steps.${cs.id}.outputs.project}`);
  }

  const renderSteps = (workflow?.steps ?? []).filter((step) => step.type === "ae.render");
  const renderedOutputs = new Set();
  for (const rs of renderSteps) {
    const projInput = rs.with?.project;
    const stateProj = state?.steps?.[rs.id]?.outputs?.project;
    if (carouselProjects.has(projInput) || (stateProj && carouselProjects.has(stateProj))) {
      const output = state?.steps?.[rs.id]?.outputs?.output || rs.with?.output;
      if (output) renderedOutputs.add(output);
      renderedOutputs.add(`\${steps.${rs.id}.outputs.output}`);
      renderedOutputs.add(`\${steps.${rs.id}.outputs.video}`);
    }
  }

  if (renderedOutputs.size === 0) {
    return { ok: true, detail: "no carousel ae.render in workflow" };
  }

  for (const step of workflow?.steps ?? []) {
    if (step.type === "timeline.scene" && renderedOutputs.has(step.with?.source)) {
      return { ok: false, detail: `timeline.scene '${step.id}' uses carousel render '${step.with?.source}'` };
    }
    if (step.type === "timeline.overlay" && renderedOutputs.has(step.with?.asset)) {
      return { ok: false, detail: `timeline.overlay '${step.id}' uses carousel render '${step.with?.asset}'` };
    }
    if (step.type === "timeline.compose") {
      const scenes = Array.isArray(step.with?.scenes) ? step.with.scenes : [];
      const overlays = Array.isArray(step.with?.overlays) ? step.with.overlays : [];
      for (const scene of scenes) {
        if (typeof scene === "string" && renderedOutputs.has(scene)) {
          return { ok: false, detail: `timeline.compose scenes uses carousel render '${scene}'` };
        }
      }
      for (const overlay of overlays) {
        if (typeof overlay === "string" && renderedOutputs.has(overlay)) {
          return { ok: false, detail: `timeline.compose overlays uses carousel render '${overlay}'` };
        }
      }
    }
  }

  for (const stepState of Object.values(state?.steps ?? {})) {
    const timeline = stepState?.outputs?.timelineSpec;
    if (timeline) {
      for (const scene of timeline.scenes ?? []) {
        if (renderedOutputs.has(scene?.source)) {
          return { ok: false, detail: `timelineSpec scene '${scene?.id}' uses carousel render '${scene?.source}'` };
        }
      }
      for (const overlay of timeline.overlays ?? []) {
        if (renderedOutputs.has(overlay?.asset)) {
          return { ok: false, detail: `timelineSpec overlay '${overlay?.id}' uses carousel render '${overlay?.asset}'` };
        }
      }
    }
  }

  return { ok: true, detail: "carousel AEP is not used as flat rendered video in timeline" };
}

function resolveCoverGeneratorLinkage(reviewStep, allSteps) {
  const layeredCover = reviewStep.with?.layerContract === "premiere-cover-v2";
  const assetRef = typeof reviewStep.with?.asset === "string" ? reviewStep.with.asset.trim() : "";
  const wfRef = typeof reviewStep.with?.workflowDigest === "string" ? reviewStep.with.workflowDigest.trim() : "";

  const matchAsset = assetRef.match(/^\$\{steps\.([A-Za-z0-9_-]+)\.outputs\.(image|images\.0\.localPath)\}$/);
  const matchWf = wfRef.match(/^\$\{steps\.([A-Za-z0-9_-]+)\.outputs\.workflowDigest\}$/);

  if (!matchAsset || !matchWf) {
    return {
      ok: false,
      reason: `review step '${reviewStep.id}' requires canonical with.asset and with.workflowDigest expressions (asset="${assetRef}", workflowDigest="${wfRef}")`
    };
  }

  const assetStepId = matchAsset[1];
  const wfGenId = matchWf[1];
  const assetStep = allSteps.find((s) => s.id === assetStepId);
  const genStep = allSteps.find((s) => s.id === wfGenId);
  if (!genStep) {
    return {
      ok: false,
      reason: `generator '${wfGenId}' referenced by '${reviewStep.id}' not found in workflow`
    };
  }

  if (genStep.type !== "comfyui.workflow") {
    return {
      ok: false,
      reason: `generator '${wfGenId}' referenced by '${reviewStep.id}' is of type '${genStep.type}', expected 'comfyui.workflow'`
    };
  }

  let compositorStep;
  let compositorIndex = -1;
  if (assetStepId !== wfGenId) {
    if (!assetStep || assetStep.type !== "graphics.cover_title") {
      return { ok: false, reason: `review asset step '${assetStepId}' must be the ComfyUI generator or graphics.cover_title` };
    }
    const compositorSource = String(assetStep.with?.image ?? "").trim();
    const sourceMatch = compositorSource.match(/^\$\{steps\.([A-Za-z0-9_-]+)\.outputs\.(image|images\.0\.localPath)\}$/);
    if (!sourceMatch || sourceMatch[1] !== wfGenId) {
      return { ok: false, reason: `cover title compositor '${assetStepId}' must consume image from generator '${wfGenId}'` };
    }
    compositorStep = assetStep;
    compositorIndex = allSteps.findIndex((s) => s.id === assetStep.id);
  } else if (!layeredCover && typeof reviewStep.with?.title === "string" && reviewStep.with.title.trim()) {
    return { ok: false, reason: `titled cover review '${reviewStep.id}' must consume graphics.cover_title output` };
  }

  const genIndex = allSteps.findIndex((s) => s.id === genStep.id);
  const revIndex = allSteps.findIndex((s) => s.id === reviewStep.id);
  if (genIndex >= revIndex || (compositorStep && !(genIndex < compositorIndex && compositorIndex < revIndex))) {
    return {
      ok: false,
      reason: `cover chain ordering is invalid (generator=${genIndex}, compositor=${compositorIndex}, review=${revIndex})`
    };
  }

  return { ok: true, genStep, genIndex, compositorStep, compositorIndex, revIndex };
}

function resolveCoverOverlayLinkage(reviewStep, allSteps) {
  const directRef = `\${steps.${reviewStep.id}.outputs.approvedAsset}`;
  const revIndex = allSteps.findIndex((s) => s.id === reviewStep.id);

  const matchingOverlaySteps = allSteps.filter((s) => s.type === "timeline.overlay" && s.with?.asset === directRef);
  if (matchingOverlaySteps.length === 0) {
    return {
      ok: false,
      reason: `no timeline.overlay step found consuming '\${steps.${reviewStep.id}.outputs.approvedAsset}'`
    };
  }
  if (matchingOverlaySteps.length > 1) {
    return {
      ok: false,
      reason: `duplicate timeline.overlay consumers for '${reviewStep.id}': ${matchingOverlaySteps.map((s) => s.id).join(", ")}`
    };
  }

  const overlayStep = matchingOverlaySteps[0];
  const overlayIndex = allSteps.findIndex((s) => s.id === overlayStep.id);
  if (overlayIndex <= revIndex) {
    return {
      ok: false,
      reason: `timeline.overlay step '${overlayStep.id}' at index ${overlayIndex} does not follow review step '${reviewStep.id}' at index ${revIndex}`
    };
  }

  if (reviewStep.with?.layerContract === "premiere-cover-v2") {
    if (overlayStep.with?.track !== 1) return { ok: false, reason: `layered cover background '${overlayStep.id}' must use V1` };
    const storyboardItemId = reviewStep.with?.storyboardItemId;
    const person = allSteps.find((step) => step.type === "timeline.overlay" && step.with?.storyboardItemId === storyboardItemId && step.with?.track === 3);
    const graphic = allSteps.find((step) => step.type === "timeline.graphic_mogrt" && step.with?.storyboardItemId === storyboardItemId && step.with?.track === 4);
    if (!person) return { ok: false, reason: `layered cover '${storyboardItemId}' is missing people PNG on V3` };
    if (!graphic) return { ok: false, reason: `layered cover '${storyboardItemId}' is missing editable MOGRT text on V4` };
    return { ok: true, overlayStep, overlayIndex, personStep: person, graphicStep: graphic, layeredCover: true };
  }

  return { ok: true, overlayStep, overlayIndex };
}

function verifyCoverCompleteness(workflow, state, add) {
  const allSteps = workflow?.steps ?? [];
  const coverReviewSteps = allSteps.filter((step) => step.type === "review.media_approval");
  if (coverReviewSteps.length === 0) return;

  const seenStoryboards = new Set();
  const seenAssets = new Set();
  let uniqueStoryboard = true;
  let uniqueAssets = true;

  const composeStep = allSteps.find((s) => s.type === "timeline.compose");
  const timelineSpec = state.steps?.[composeStep?.id]?.outputs?.timelineSpec
    || Object.values(state.steps ?? {}).map((s) => s?.outputs?.timelineSpec).find(Boolean);
  const overlays = timelineSpec?.overlays ?? [];

  const branchIndices = [];

  for (const reviewStep of coverReviewSteps) {
    const revIndex = allSteps.findIndex((s) => s.id === reviewStep.id);
    const revOutputs = state.steps?.[reviewStep.id]?.outputs;
    const storyboardItemId = revOutputs?.approval?.storyboardItemId;
    const approvedAsset = revOutputs?.approvedAsset;

    if (!storyboardItemId || seenStoryboards.has(storyboardItemId)) {
      uniqueStoryboard = false;
    } else {
      seenStoryboards.add(storyboardItemId);
    }

    if (!approvedAsset || seenAssets.has(approvedAsset)) {
      uniqueAssets = false;
    } else {
      seenAssets.add(approvedAsset);
    }

    // 1. Generator linkage (requires BOTH exact expressions to match same comfyui.workflow preceding step)
    const genLinkResult = resolveCoverGeneratorLinkage(reviewStep, allSteps);
    add(
      `workflow.cover.${reviewStep.id}.generator_linkage`,
      genLinkResult.ok,
      genLinkResult.ok
        ? `generator '${genLinkResult.genStep.id}' at step ${genLinkResult.genIndex} precedes review at ${revIndex}`
        : genLinkResult.reason
    );

    if (genLinkResult.ok) {
      const genStep = genLinkResult.genStep;
      const genOutputs = state.steps?.[genStep.id]?.outputs;
      const genImages = Array.isArray(genOutputs?.images) ? genOutputs.images : [];
      const allGenImagesHaveSha = genImages.length > 0 && genImages.every((img) => typeof img?.sha256 === "string" && /^[a-fA-F0-9]{64}$/.test(img.sha256));
      add(`workflow.cover.${reviewStep.id}.generator_images_sha256`, allGenImagesHaveSha, `${genImages.length} generator image(s) with valid sha256`);

      const wfDigestMatch = Boolean(
        revOutputs?.approval?.workflowDigest &&
        genOutputs?.workflowDigest &&
        revOutputs.approval.workflowDigest === genOutputs.workflowDigest
      );
      add(`workflow.cover.${reviewStep.id}.generator_workflow_digest_match`, wfDigestMatch, `approval=${revOutputs?.approval?.workflowDigest} generator=${genOutputs?.workflowDigest}`);

      if (genLinkResult.compositorStep) {
        const compositor = genLinkResult.compositorStep;
        const compositorOutputs = state.steps?.[compositor.id]?.outputs;
        const matchingGenImage = genImages.find((img) => img.localPath === compositorOutputs?.sourceIdentity?.path);
        const sourceMatchesGenerator = Boolean(
          matchingGenImage &&
          compositorOutputs?.source === matchingGenImage.localPath &&
          compositorOutputs?.sourceIdentity?.sha256 === matchingGenImage.sha256
        );
        add(`workflow.cover.${reviewStep.id}.compositor_source_from_generator`, sourceMatchesGenerator, `source=${compositorOutputs?.source}, gen=${matchingGenImage?.localPath}, sha=${compositorOutputs?.sourceIdentity?.sha256}/${matchingGenImage?.sha256}`);

        const approvedFromCompositor = Boolean(
          approvedAsset &&
          approvedAsset === compositorOutputs?.image &&
          approvedAsset === compositorOutputs?.outputIdentity?.path
        );
        add(`workflow.cover.${reviewStep.id}.approved_asset_from_compositor`, approvedFromCompositor, `approved=${approvedAsset}, compositor=${compositorOutputs?.image}`);

        const outputDigestMatch = Boolean(
          revOutputs?.approval?.outputDigest &&
          revOutputs.approval.outputDigest === compositorOutputs?.outputIdentity?.sha256
        );
        add(`workflow.cover.${reviewStep.id}.output_digest_equals_compositor_sha`, outputDigestMatch, `outputDigest=${revOutputs?.approval?.outputDigest} compositorSha=${compositorOutputs?.outputIdentity?.sha256}`);
        const titleMatch = typeof reviewStep.with?.title === "string" && reviewStep.with.title.trim() &&
          compositorOutputs?.text?.title === reviewStep.with.title &&
          revOutputs?.approval?.title === reviewStep.with.title;
        add(`workflow.cover.${reviewStep.id}.composited_title_match`, Boolean(titleMatch), `compositor=${compositorOutputs?.text?.title}, review=${reviewStep.with?.title}, approval=${revOutputs?.approval?.title}`);
      } else {
        const matchingGenImage = genImages.find((img) => img.localPath === approvedAsset);
        add(`workflow.cover.${reviewStep.id}.approved_asset_from_generator`, Boolean(matchingGenImage), matchingGenImage ? `approvedAsset matches generator output ${matchingGenImage.filename}` : `approvedAsset not found in generator outputs`);

        const outputDigestMatch = Boolean(
          matchingGenImage &&
          revOutputs?.approval?.outputDigest &&
          revOutputs.approval.outputDigest === matchingGenImage.sha256
        );
        add(`workflow.cover.${reviewStep.id}.output_digest_equals_generator_sha`, outputDigestMatch, `outputDigest=${revOutputs?.approval?.outputDigest} genSha=${matchingGenImage?.sha256}`);
      }
    }

    // 2. Overlay step linkage and configuration
    const overlayLinkResult = resolveCoverOverlayLinkage(reviewStep, allSteps);
    add(
      `workflow.cover.${reviewStep.id}.overlay_linkage`,
      overlayLinkResult.ok,
      overlayLinkResult.ok
        ? `overlay '${overlayLinkResult.overlayStep.id}' at step ${overlayLinkResult.overlayIndex} follows review at ${revIndex}`
        : overlayLinkResult.reason
    );

    if (overlayLinkResult.ok) {
      const overlayStep = overlayLinkResult.overlayStep;
      const overlayWith = overlayStep.with ?? {};

      // Audio policy must equal "mute"
      const audioPolicyMute = overlayWith.audioPolicy === "mute";
      add(`workflow.cover.${reviewStep.id}.overlay_audio_policy`, audioPolicyMute, `audioPolicy=${overlayWith.audioPolicy}`);

      // Overlay timing spec in workflow
      const expectedTrack = overlayLinkResult.layeredCover ? 1 : 2;
      const timingValid = Number.isInteger(overlayWith.startMs) && overlayWith.startMs >= 0 && Number.isInteger(overlayWith.durationMs) && overlayWith.durationMs > 0 && overlayWith.track === expectedTrack;
      add(`workflow.cover.${reviewStep.id}.overlay_timing_spec`, timingValid, `startMs=${overlayWith.startMs}, durationMs=${overlayWith.durationMs}, track=${overlayWith.track}, expectedTrack=${expectedTrack}`);

      // Overlay step state output check: overlay equals approvedAsset and matches with.startMs, durationMs, and track
      const overlayOutput = state.steps?.[overlayStep.id]?.outputs?.overlay;
      const overlayOutputMatches = Boolean(
        overlayOutput &&
        overlayOutput.asset === approvedAsset &&
        overlayOutput.startMs === overlayWith.startMs &&
        overlayOutput.durationMs === overlayWith.durationMs &&
        overlayOutput.track === overlayWith.track
      );
      add(
        `workflow.cover.${reviewStep.id}.overlay_output_match`,
        overlayOutputMatches,
        overlayOutputMatches
          ? `overlay output matches asset and timing (startMs=${overlayWith.startMs}, durationMs=${overlayWith.durationMs}, track=${overlayWith.track})`
          : `overlay output mismatch: expected asset='${approvedAsset}', startMs=${overlayWith.startMs}, durationMs=${overlayWith.durationMs}, track=${overlayWith.track}; got ${JSON.stringify(overlayOutput ?? null)}`
      );

      // 3. Final timelineSpec overlay match: exactly one matching overlay in timelineSpec
      const assetTimelineOverlays = overlays.filter((o) => o?.asset === approvedAsset);
      const matchingTimelineOverlays = assetTimelineOverlays.filter((o) => (
        o?.startMs === overlayWith.startMs &&
        o?.durationMs === overlayWith.durationMs &&
        o?.track === overlayWith.track
      ));
      const exactlyOneTimelineOverlay = assetTimelineOverlays.length === 1 && matchingTimelineOverlays.length === 1;
      add(
        `workflow.cover.${reviewStep.id}.timeline_overlay`,
        exactlyOneTimelineOverlay,
        exactlyOneTimelineOverlay
          ? `exact overlay match in timelineSpec (asset='${approvedAsset}', startMs=${overlayWith.startMs}, durationMs=${overlayWith.durationMs}, track=${overlayWith.track})`
          : `expected exactly 1 overlay for asset in timelineSpec with exact timing/track, found ${assetTimelineOverlays.length} asset occurrence(s) and ${matchingTimelineOverlays.length} exact match(es)`
      );
    }

    branchIndices.push({
      genIndex: genLinkResult.ok ? genLinkResult.genIndex : -1,
      compositorIndex: genLinkResult.ok ? genLinkResult.compositorIndex : -1,
      revIndex,
      overlayIndex: overlayLinkResult.ok ? overlayLinkResult.overlayIndex : -1,
      reviewId: reviewStep.id
    });
  }

  add("workflow.cover.unique_storyboard_items", uniqueStoryboard, `${seenStoryboards.size}/${coverReviewSteps.length} unique storyboardItemId(s)`);
  add("workflow.cover.unique_approved_assets", uniqueAssets, `${seenAssets.size}/${coverReviewSteps.length} unique approvedAsset(s)`);

  // Sequential ordering check across cover branches: branch i must complete before branch i+1 starts
  let sequentialBranches = true;
  let orderingDetail = "sequential";
  for (let i = 0; i < branchIndices.length - 1; i++) {
    const current = branchIndices[i];
    const next = branchIndices[i + 1];
    if (
      current.genIndex === -1 || current.revIndex === -1 || current.overlayIndex === -1 ||
      next.genIndex === -1 || next.revIndex === -1 || next.overlayIndex === -1 ||
      !(current.genIndex < current.revIndex && current.revIndex < current.overlayIndex && current.overlayIndex < next.genIndex && next.genIndex < next.revIndex && next.revIndex < next.overlayIndex)
    ) {
      sequentialBranches = false;
      orderingDetail = `Branch ${current.reviewId} (gen:${current.genIndex}, rev:${current.revIndex}, ov:${current.overlayIndex}) does not strictly precede ${next.reviewId} (gen:${next.genIndex}, rev:${next.revIndex}, ov:${next.overlayIndex})`;
      break;
    }
  }
  add("workflow.cover.sequential_branches", sequentialBranches, orderingDetail);
}

function intervalsCover(intervals, start, end) {
  if (start >= end) return true;
  const relevant = intervals
    .filter((iv) => iv.endMs > start && iv.startMs < end)
    .sort((a, b) => a.startMs - b.startMs);

  if (relevant.length === 0) return false;

  let mergedStart = relevant[0].startMs;
  let mergedEnd = relevant[0].endMs;

  if (mergedStart > start) return false;

  for (let i = 1; i < relevant.length; i++) {
    const iv = relevant[i];
    if (iv.startMs <= mergedEnd) {
      mergedEnd = Math.max(mergedEnd, iv.endMs);
    } else {
      if (mergedEnd < end) return false;
      break;
    }
  }

  return mergedStart <= start && mergedEnd >= end;
}

function verifyAudioContinuity(workflow, state, add) {
  const allSteps = workflow?.steps ?? [];
  const composeStep = allSteps.find((s) => s.type === "timeline.compose");
  const timelineSpec = state.steps?.[composeStep?.id]?.outputs?.timelineSpec
    || Object.values(state.steps ?? {}).map((s) => s?.outputs?.timelineSpec).find(Boolean);
  if (!timelineSpec || !Array.isArray(timelineSpec.scenes) || timelineSpec.scenes.length === 0) return;

  const scenes = timelineSpec.scenes ?? [];
  const overlays = timelineSpec.overlays ?? [];
  const dynamicLinks = timelineSpec.dynamicLinks ?? [];

  const hasStoryboardProvenance = [...scenes, ...overlays, ...dynamicLinks].some(
    (item) => item.storyboardItemId !== undefined || item.editorialKind !== undefined
  );

  // If storyboard-derived, verify all items have valid storyboardItemId and editorialKind
  if (hasStoryboardProvenance) {
    for (const scene of scenes) {
      add(
        `workflow.audio.scene.${scene.id}.provenance`,
        Boolean(scene.storyboardItemId && scene.editorialKind && ["a_roll", "logo_outro"].includes(scene.editorialKind)),
        `expected scene storyboardItemId and editorialKind in ['a_roll', 'logo_outro'], got storyboardItemId='${scene.storyboardItemId}', editorialKind='${scene.editorialKind}'`
      );
    }
    for (const overlay of overlays) {
      add(
        `workflow.audio.overlay.${overlay.id}.provenance`,
        Boolean(overlay.storyboardItemId && overlay.editorialKind && ["b_roll", "cover_card"].includes(overlay.editorialKind)),
        `expected overlay storyboardItemId and editorialKind in ['b_roll', 'cover_card'], got storyboardItemId='${overlay.storyboardItemId}', editorialKind='${overlay.editorialKind}'`
      );
    }
    for (const link of dynamicLinks) {
      add(
        `workflow.audio.dynamic_link.${link.id}.provenance`,
        Boolean(link.storyboardItemId && link.editorialKind && ["title"].includes(link.editorialKind)),
        `expected dynamicLink storyboardItemId and editorialKind='title', got storyboardItemId='${link.storyboardItemId}', editorialKind='${link.editorialKind}'`
      );
    }
  }

  // 1. Audio policy checks on TimelineSpec items
  for (const scene of scenes) {
    const isARoll = hasStoryboardProvenance ? scene.editorialKind === "a_roll" : scene.audioPolicy === "preserve";
    const expectedPolicy = isARoll ? "preserve" : "mute";
    const expectedAudio = isARoll;
    add(
      `workflow.audio.scene.${scene.id}.policy`,
      scene.audioPolicy === expectedPolicy && scene.audio === expectedAudio,
      `expected audioPolicy='${expectedPolicy}' audio=${expectedAudio}, got audioPolicy='${scene.audioPolicy}' audio=${scene.audio}`
    );
  }

  for (const overlay of overlays) {
    add(
      `workflow.audio.overlay.${overlay.id}.policy`,
      overlay.audioPolicy === "mute",
      `expected audioPolicy='mute', got audioPolicy='${overlay.audioPolicy}'`
    );
  }

  for (const link of dynamicLinks) {
    add(
      `workflow.audio.dynamic_link.${link.id}.policy`,
      link.audioPolicy === "mute",
      `expected audioPolicy='mute', got audioPolicy='${link.audioPolicy}'`
    );
  }

  // 2. Host receipt checks if premiere.build outputs are available in state
  const buildStep = allSteps.find((s) => s.type === "premiere.build");
  const buildOutputs = buildStep ? state.steps?.[buildStep.id]?.outputs : undefined;
  if (buildOutputs) {
    const sceneReceipts = Array.isArray(buildOutputs.scenes) ? buildOutputs.scenes : [];
    const overlayReceipts = Array.isArray(buildOutputs.overlays) ? buildOutputs.overlays : [];
    const dlReceipts = Array.isArray(buildOutputs.dynamicLinks) ? buildOutputs.dynamicLinks : [];

    for (const scene of scenes) {
      const receipt = sceneReceipts.find((r) => r.id === scene.id);
      const isARoll = hasStoryboardProvenance ? scene.editorialKind === "a_roll" : scene.audioPolicy === "preserve";
      const expectedInserted = isARoll;
      if (receipt) {
        const policyOk = receipt.audioInserted === expectedInserted && (isARoll ? receipt.audioTrack === scene.track : receipt.audioTrack === -1);
        const provOk = !hasStoryboardProvenance || (
          receipt.storyboardItemId === scene.storyboardItemId &&
          receipt.editorialKind === scene.editorialKind
        );
        add(
          `workflow.audio.receipt.scene.${scene.id}`,
          policyOk && provOk,
          `expected audioInserted=${expectedInserted}, audioTrack=${isARoll ? scene.track : -1}; got audioInserted=${receipt.audioInserted}, audioTrack=${receipt.audioTrack}`
        );
      }
    }

    for (const overlay of overlays) {
      const receipt = overlayReceipts.find((r) => r.id === overlay.id);
      if (receipt) {
        const provOk = !hasStoryboardProvenance || (
          receipt.storyboardItemId === overlay.storyboardItemId &&
          receipt.editorialKind === overlay.editorialKind
        );
        add(
          `workflow.audio.receipt.overlay.${overlay.id}`,
          receipt.audioInserted === false && receipt.audioTrack === -1 && provOk,
          `expected audioInserted=false, audioTrack=-1; got audioInserted=${receipt.audioInserted}, audioTrack=${receipt.audioTrack}`
        );
      }
    }

    for (const link of dynamicLinks) {
      const receipt = dlReceipts.find((r) => r.id === link.id);
      if (receipt) {
        const provOk = !hasStoryboardProvenance || (
          receipt.storyboardItemId === link.storyboardItemId &&
          receipt.editorialKind === link.editorialKind
        );
        add(
          `workflow.audio.receipt.dynamic_link.${link.id}`,
          receipt.audioInserted === false && receipt.audioTrack === -1 && provOk,
          `expected audioInserted=false, audioTrack=-1; got audioInserted=${receipt.audioInserted}, audioTrack=${receipt.audioTrack}`
        );
      }
    }
  }

  // Editorial continuity is meaningful only when the approved storyboard kind
  // accompanies every visual item. Generic timelines still receive strict
  // policy and Premiere receipt checks above, but we do not infer editorial
  // intent from IDs, paths, or mute/preserve flags alone.
  if (!hasStoryboardProvenance) return;

  // 3. Editorial Interstitials & Sequential A-roll Continuity
  // Only cover_card, title, logo_outro are editorial interstitials (B-roll is never an interstitial).
  const interstitials = [
    ...dynamicLinks
      .filter((d) => d.editorialKind === "title" && d.startMs !== undefined && d.durationMs !== undefined)
      .map((d) => ({ id: d.id, kind: "title", startMs: d.startMs, endMs: d.startMs + d.durationMs })),
    ...overlays
      .filter((o) => o.editorialKind === "cover_card" && o.startMs !== undefined && o.durationMs !== undefined)
      .map((o) => ({ id: o.id, kind: "cover_card", startMs: o.startMs, endMs: o.startMs + o.durationMs })),
    ...scenes
      .filter((s) => s.editorialKind === "logo_outro" && s.startMs !== undefined && s.durationMs !== undefined)
      .map((s) => ({ id: s.id, kind: "logo_outro", startMs: s.startMs, endMs: s.startMs + s.durationMs }))
  ];

  const aRollScenes = scenes
    .filter((s) => s.editorialKind === "a_roll")
    .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));

  let continuityOk = true;
  let continuityDetail = "continuous";

  for (let i = 0; i < aRollScenes.length - 1; i++) {
    const curr = aRollScenes[i];
    const next = aRollScenes[i + 1];
    const currEnd = (curr.startMs ?? 0) + curr.durationMs;
    const nextStart = next.startMs ?? 0;

    if (nextStart < currEnd) {
      continuityOk = false;
      continuityDetail = `A-roll overlap on track 1: '${curr.id}' [start:${curr.startMs}, end:${currEnd}] overlaps with '${next.id}' [start:${nextStart}]`;
      break;
    }

    if (nextStart > currEnd) {
      if (!intervalsCover(interstitials, currEnd, nextStart)) {
        continuityOk = false;
        continuityDetail = `Unintended dialogue gap [${currEnd}, ${nextStart}]ms between '${curr.id}' and '${next.id}' without editorial interstitial`;
        break;
      }
    }
  }

  add("workflow.audio.a_roll_continuity", continuityOk, continuityDetail);
}

function report(runDir, checks) {
  const passed = checks.filter((check) => check.ok).length;
  return {
    schemaVersion: 1,
    verifier: "graph-workflow-v1",
    runDir,
    verifiedAt: new Date().toISOString(),
    ok: checks.length > 0 && passed === checks.length,
    summary: { passed, failed: checks.length - passed, total: checks.length },
    checks
  };
}
