import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { catalogMedia, createCutlist, importDocxStoryboard, reviewMediaApproval } from "../src/adapters/documentary.js";

const execFileAsync = promisify(execFile);

test("DOCX adapter extracts interview ranges from the sound column and excludes cover reference timecodes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-docx-"));
  await mkdir(path.join(root, "word"));
  const row = (picture, sound) => `<w:tr><w:tc><w:p><w:r><w:t>${picture}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${sound}</w:t></w:r></w:p></w:tc></w:tr>`;
  const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${row("ภาพทำงาน", "C 7723 00.11-00.28 แนะนำตัว")}${row("ดนตรี+ภาพปก Ref. 00.33-00.39", "")}${row("ภาพสอน", "C7724 00.25-00.50 ช่วงหนึ่ง 00.54-01.42 ช่วงสอง")}</w:body></w:document>`;
  await writeFile(path.join(root, "word", "document.xml"), xml);
  const docx = path.join(root, "storyboard.docx");
  await execFileAsync("zip", ["-q", "-r", docx, "word"], { cwd: root });
  const result = await importDocxStoryboard({ path: docx }, { resolvePath: (value) => value, timeoutMs: 5000 });
  assert.equal(result.segments.length, 3);
  assert.deepEqual(result.segments.map((item) => item.sourceKey), ["C7723", "C7724", "C7724"]);
  assert.equal(result.totalDialogueMs, 90_000);
  assert.ok(!result.segments.some((item) => item.sourceInMs === 33_000));
});

test("media catalog classifies B-roll and cover folders relative to the selected root", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-catalog-"));
  await Promise.all([mkdir(path.join(root, "Ins")), mkdir(path.join(root, "ภาพนิ่ง"))]);
  await Promise.all([
    writeFile(path.join(root, "Ins", "C7730.MP4"), "not-a-real-video"),
    writeFile(path.join(root, "ภาพนิ่ง", "DSC02129.JPG"), "not-a-real-image"),
    writeFile(path.join(root, "C7723.MP4"), "not-a-real-video")
  ]);
  const result = await catalogMedia({ root, brollFolder: "Ins", coverFolder: "ภาพนิ่ง" }, {
    configDir: root,
    resolvePath: (value) => path.resolve(root, value),
    timeoutMs: 1000
  });
  assert.equal(result.assets.find((item) => item.basename === "C7730.MP4")?.role, "broll");
  assert.equal(result.assets.find((item) => item.basename === "DSC02129.JPG")?.role, "cover");
  assert.equal(result.assets.find((item) => item.basename === "C7723.MP4")?.role, "interview");
});

test("cutlist refuses a missing interview source instead of inventing a NAS fallback", async () => {
  await assert.rejects(
    createCutlist({ storyboard: { segments: [{ id: "one", sourceKey: "C9999", sourceInMs: 0, durationMs: 1000 }] }, catalog: { assets: [] }, introDurationMs: 0 }),
    (error) => error.code === "INTERVIEW_MEDIA_MISSING"
  );
});

test("reviewMediaApproval throws APPROVAL_REQUIRED with complete candidate payload on missing decision", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-review-"));
  const sourceImage = path.join(root, "source.png");
  const generatedAsset = path.join(root, "generated.png");
  await writeFile(sourceImage, "source-image-bytes");
  await writeFile(generatedAsset, "generated-image-bytes");

  const workflowDigest = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const context = {
    stepDir: root,
    step: { id: "step_review_cover_1" },
    resolvePath: (p) => p,
    dryRun: false
  };

  await assert.rejects(
    reviewMediaApproval({
      storyboardItemId: "cover_1",
      asset: generatedAsset,
      sourceImage,
      prompt: "academic portrait",
      seed: 42,
      workflowDigest,
      title: "Cover Title"
    }, context),
    (error) => {
      assert.equal(error.code, "APPROVAL_REQUIRED");
      assert.equal(error.details.kind, "cover_card");
      assert.equal(error.details.stepId, "step_review_cover_1");
      assert.ok(typeof error.details.proposalDigest === "string" && error.details.proposalDigest.length === 64);
      assert.ok(error.details.candidate);
      assert.equal(error.details.candidate.assetId, "cover_cover_1");
      assert.equal(error.details.candidate.path, generatedAsset);
      assert.equal(error.details.candidate.thumbnailPath, generatedAsset);
      assert.equal(error.details.candidate.kind, "cover_card");
      assert.equal(error.details.candidate.selectedAssetId, "cover_cover_1");
      assert.equal(error.details.candidate.seed, 42);
      assert.equal(error.details.candidate.workflowDigest, workflowDigest);
      assert.equal(error.details.items.length, 1);
      assert.equal(error.details.items[0].segmentId, "cover_1");
      assert.equal(error.details.items[0].selectedAssetId, "cover_cover_1");
      assert.equal(error.details.items[0].candidates.length, 1);
      assert.equal(error.details.items[0].candidates[0].assetId, "cover_cover_1");
      return true;
    }
  );
});

test("reviewMediaApproval accepts valid approved decision and returns evidence", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-review-ok-"));
  const sourceImage = path.join(root, "source.png");
  const generatedAsset = path.join(root, "generated.png");
  await writeFile(sourceImage, "source-image-bytes");
  await writeFile(generatedAsset, "generated-image-bytes");

  const workflowDigest = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const context = {
    stepDir: root,
    step: { id: "step_review_cover_1" },
    resolvePath: (p) => p,
    dryRun: false
  };

  let proposalDigest = "";
  try {
    await reviewMediaApproval({
      storyboardItemId: "cover_1",
      asset: generatedAsset,
      sourceImage,
      prompt: "academic portrait",
      seed: 42,
      workflowDigest,
      title: "Cover Title"
    }, context);
  } catch (err) {
    proposalDigest = err.details.proposalDigest;
  }

  assert.ok(proposalDigest);

  // Write valid decision
  await writeFile(path.join(root, "approval-decision.json"), JSON.stringify({
    approved: true,
    proposalDigest,
    approvedAt: "2026-08-29T12:00:00.000Z",
    selections: [{ selectedAssetId: "cover_cover_1", path: generatedAsset }]
  }));

  const result = await reviewMediaApproval({
    storyboardItemId: "cover_1",
    asset: generatedAsset,
    sourceImage,
    prompt: "academic portrait",
    seed: 42,
    workflowDigest,
    title: "Cover Title"
  }, context);

  assert.equal(result.approvedAsset, generatedAsset);
  assert.equal(result.approval.approved, true);
  assert.equal(result.approval.kind, "cover_card");
  assert.equal(result.approval.storyboardItemId, "cover_1");
  assert.equal(result.approval.asset, generatedAsset);
  assert.equal(result.approval.sourceImage, sourceImage);
  assert.equal(result.approval.workflowDigest, workflowDigest);
  assert.equal(result.approval.seed, 42);
  assert.ok(result.approval.outputDigest);
  assert.ok(result.approval.sourceDigest);
});

test("reviewMediaApproval rejects stale decision, rejected decision, and substitution attempt", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-review-stale-"));
  const sourceImage = path.join(root, "source.png");
  const generatedAsset = path.join(root, "generated.png");
  const fakeAsset = path.join(root, "fake.png");
  await writeFile(sourceImage, "source-image-bytes");
  await writeFile(generatedAsset, "generated-image-bytes");
  await writeFile(fakeAsset, "fake-image-bytes");

  const workflowDigest = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const context = {
    stepDir: root,
    step: { id: "step_review_cover_1" },
    resolvePath: (p) => p,
    dryRun: false
  };

  // 0. Extract canonical proposalDigest when no decision file exists
  let proposalDigest = "";
  try {
    await reviewMediaApproval({ storyboardItemId: "cover_1", asset: generatedAsset, sourceImage, prompt: "p", seed: 1, workflowDigest }, context);
  } catch (err) {
    proposalDigest = err?.details?.proposalDigest;
  }
  assert.ok(proposalDigest);

  // 1. Stale decision
  await writeFile(path.join(root, "approval-decision.json"), JSON.stringify({
    approved: true,
    proposalDigest: "staledigest0000000000000000000000000000000000000000000000000000000"
  }));
  await assert.rejects(
    reviewMediaApproval({ storyboardItemId: "cover_1", asset: generatedAsset, sourceImage, prompt: "p", seed: 1, workflowDigest }, context),
    (err) => err.code === "APPROVAL_STALE"
  );

  // 2. Operator rejected decision
  await writeFile(path.join(root, "approval-decision.json"), JSON.stringify({
    approved: false,
    proposalDigest
  }));
  await assert.rejects(
    reviewMediaApproval({ storyboardItemId: "cover_1", asset: generatedAsset, sourceImage, prompt: "p", seed: 1, workflowDigest }, context),
    (err) => err.code === "APPROVAL_REJECTED"
  );

  // 3. Substitution resistance (different path in decision)
  await writeFile(path.join(root, "approval-decision.json"), JSON.stringify({
    approved: true,
    proposalDigest,
    approvedAsset: fakeAsset
  }));
  await assert.rejects(
    reviewMediaApproval({ storyboardItemId: "cover_1", asset: generatedAsset, sourceImage, prompt: "p", seed: 1, workflowDigest }, context),
    (err) => err.code === "SUBSTITUTION_REJECTED"
  );
});

test("reviewMediaApproval fails closed on missing/non-image asset, bad digest, or invalid inputs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-review-invalid-"));
  const sourceImage = path.join(root, "source.png");
  const nonImage = path.join(root, "file.txt");
  await writeFile(sourceImage, "source");
  await writeFile(nonImage, "text");

  const validDigest = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const context = { stepDir: root, resolvePath: (p) => p, dryRun: false };

  // Missing asset
  await assert.rejects(
    reviewMediaApproval({ storyboardItemId: "c1", asset: path.join(root, "missing.png"), sourceImage, prompt: "p", seed: 1, workflowDigest: validDigest }, context),
    (err) => err.code === "ASSET_NOT_FOUND"
  );

  // Relative paths must not be normalized into acceptance.
  await assert.rejects(
    reviewMediaApproval({ storyboardItemId: "c1", asset: "relative.png", sourceImage, prompt: "p", seed: 1, workflowDigest: validDigest }, context),
    (err) => err.code === "INVALID_ASSET"
  );
  await assert.rejects(
    reviewMediaApproval({ storyboardItemId: "c1", asset: sourceImage, sourceImage: "relative.png", prompt: "p", seed: 1, workflowDigest: validDigest }, context),
    (err) => err.code === "INVALID_SOURCE_IMAGE"
  );

  // Non-image asset
  await assert.rejects(
    reviewMediaApproval({ storyboardItemId: "c1", asset: nonImage, sourceImage, prompt: "p", seed: 1, workflowDigest: validDigest }, context),
    (err) => err.code === "INVALID_ASSET"
  );

  // Bad workflow digest (short)
  await assert.rejects(
    reviewMediaApproval({ storyboardItemId: "c1", asset: sourceImage, sourceImage, prompt: "p", seed: 1, workflowDigest: "short" }, context),
    (err) => err.code === "INVALID_WORKFLOW_DIGEST"
  );

  // Bad seed (< 0)
  await assert.rejects(
    reviewMediaApproval({ storyboardItemId: "c1", asset: sourceImage, sourceImage, prompt: "p", seed: -5, workflowDigest: validDigest }, context),
    (err) => err.code === "INVALID_INPUT"
  );

  // Dry run returns planned contract
  const dry = await reviewMediaApproval({ storyboardItemId: "c1", asset: "media/gen.png", sourceImage: "media/src.png", prompt: "p", seed: 1, workflowDigest: validDigest }, { stepDir: root, resolvePath: (p) => path.join(root, p), dryRun: true });
  assert.equal(dry.planned, true);
  assert.equal(dry.approval.approved, false);
  assert.equal(dry.approval.planned, true);
  assert.equal(dry.approval.workflowDigest, validDigest);
});

test("runComfyWorkflow returns workflowDigest SHA-256 on dry-run and matches file bytes", async () => {
  const { runComfyWorkflow } = await import("../src/adapters/comfyui.js");
  const { readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");

  const workflowPath = path.resolve("workflows/generate-cover-zimage.api.json");
  const expectedDigest = createHash("sha256").update(await readFile(workflowPath)).digest("hex");

  const dryResult = await runComfyWorkflow({
    workflowFile: "workflows/generate-cover-zimage.api.json"
  }, {
    settings: { services: { comfyui: { baseUrl: "http://127.0.0.1:8188" } } },
    resolvePath: (p) => path.resolve(p),
    resolveRunPath: (p) => path.resolve(p),
    stepDir: "/tmp",
    dryRun: true,
    timeoutMs: 1000
  });

  assert.equal(dryResult.promptId, "DRY_RUN_PROMPT_ID");
  assert.equal(dryResult.workflowDigest, expectedDigest);
  assert.ok(dryResult.images.length > 0);

  const plannedUpload = path.resolve("outputs/not-created-until-upstream-step.png");
  const plannedResult = await runComfyWorkflow({
    workflowFile: "workflows/generate-cover-zimage.api.json",
    uploads: [{ patch: "10.inputs.image", file: plannedUpload }]
  }, {
    settings: { services: { comfyui: { baseUrl: "http://127.0.0.1:8188" } } },
    resolvePath: (p) => path.resolve(p),
    resolveRunPath: (p) => path.resolve(p),
    stepDir: "/tmp",
    dryRun: true,
    timeoutMs: 1000
  });
  assert.equal(plannedResult.cacheIdentityMeasured, false);
  assert.deepEqual(plannedResult.plannedUploadPaths, [plannedUpload]);
  assert.match(plannedResult.cacheDigest, /^[a-f0-9]{64}$/);
});

test("generate-cover-zimage.api.json conforms to Comfy core classes, patch points, dimensions, and reachability", async () => {
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile("workflows/generate-cover-zimage.api.json", "utf8");
  const workflow = JSON.parse(raw);

  const allowedClasses = new Set([
    "UNETLoader", "CLIPLoader", "KSampler", "VAELoader",
    "EmptyLatentImage", "CLIPTextEncode", "LoadImage", "ImageScale",
    "MaskToImage", "ImageToMask", "InvertMask", "EmptyImage",
    "SolidMask", "FeatherMask", "ImageCompositeMasked",
    "VAEDecode", "SaveImage"
  ]);

  for (const [id, node] of Object.entries(workflow)) {
    assert.ok(allowedClasses.has(node.class_type), `Node ${id} has unapproved class ${node.class_type}`);
  }

  // Stable patch points
  assert.equal(workflow["10"]?.class_type, "LoadImage");
  assert.ok(typeof workflow["10"]?.inputs?.image === "string");

  assert.equal(workflow["6"]?.class_type, "CLIPTextEncode");
  assert.ok(typeof workflow["6"]?.inputs?.text === "string");

  assert.equal(workflow["3"]?.class_type, "KSampler");
  assert.ok(Number.isSafeInteger(workflow["3"]?.inputs?.seed));
  assert.equal(workflow["3"]?.inputs?.denoise, 1.0, "Denoise must be 1.0 for full background synthesis");
  assert.equal(workflow["3"]?.inputs?.steps, 8);
  assert.equal(workflow["3"]?.inputs?.cfg, 1.5);

  // Background branch: EmptyLatentImage(1920x1080) -> KSampler -> VAEDecode
  assert.equal(workflow["5"]?.class_type, "EmptyLatentImage");
  assert.equal(workflow["5"]?.inputs?.width, 1920);
  assert.equal(workflow["5"]?.inputs?.height, 1080);
  assert.deepEqual(workflow["3"]?.inputs?.latent_image, ["5", 0]);
  assert.deepEqual(workflow["8"]?.inputs?.samples, ["3", 0]);
  assert.deepEqual(workflow["8"]?.inputs?.vae, ["4", 0]);

  // Title-safe panel branch: EmptyImage (1050x1080 deep navy) + SolidMask/FeatherMask -> ImageCompositeMasked (Node 22)
  assert.equal(workflow["19"]?.class_type, "EmptyImage");
  assert.equal(workflow["19"]?.inputs?.width, 1050);
  assert.equal(workflow["19"]?.inputs?.height, 1080);
  assert.equal(workflow["19"]?.inputs?.color, 463134); // #07111E deep navy

  assert.equal(workflow["20"]?.class_type, "SolidMask");
  assert.equal(workflow["20"]?.inputs?.width, 1050);
  assert.equal(workflow["20"]?.inputs?.height, 1080);
  assert.equal(workflow["20"]?.inputs?.value, 1.0);

  assert.equal(workflow["21"]?.class_type, "FeatherMask");
  assert.deepEqual(workflow["21"]?.inputs?.mask, ["20", 0]);
  assert.equal(workflow["21"]?.inputs?.right, 120);

  // Cutout and Opacity Mask branch (720x1080)
  assert.equal(workflow["11"]?.class_type, "ImageScale");
  assert.equal(workflow["11"]?.inputs?.width, 720);
  assert.equal(workflow["11"]?.inputs?.height, 1080);
  assert.deepEqual(workflow["11"]?.inputs?.image, ["10", 0]);

  assert.equal(workflow["14"]?.class_type, "MaskToImage");
  assert.deepEqual(workflow["14"]?.inputs?.mask, ["10", 1]);

  assert.equal(workflow["15"]?.class_type, "ImageScale");
  assert.equal(workflow["15"]?.inputs?.width, 720);
  assert.equal(workflow["15"]?.inputs?.height, 1080);
  assert.deepEqual(workflow["15"]?.inputs?.image, ["14", 0]);

  assert.equal(workflow["16"]?.class_type, "ImageToMask");
  assert.equal(workflow["16"]?.inputs?.channel, "red");
  assert.deepEqual(workflow["16"]?.inputs?.image, ["15", 0]);

  assert.equal(workflow["17"]?.class_type, "InvertMask");
  assert.deepEqual(workflow["17"]?.inputs?.mask, ["16", 0]);

  // Stage 1: ImageCompositeMasked (Node 18) places 720x1080 professor cutout at x=1050 over decoded background (Node 8)
  assert.equal(workflow["18"]?.class_type, "ImageCompositeMasked");
  assert.deepEqual(workflow["18"]?.inputs?.destination, ["8", 0]);
  assert.deepEqual(workflow["18"]?.inputs?.source, ["11", 0]);
  assert.deepEqual(workflow["18"]?.inputs?.mask, ["17", 0]);
  assert.equal(workflow["18"]?.inputs?.x, 1050);
  assert.equal(workflow["18"]?.inputs?.y, 0);
  assert.equal(workflow["18"]?.inputs?.resize_source, false);

  // Assert single subject composite path (cutout RGB is composited exactly once)
  const subjectConsumers = Object.entries(workflow).filter(([, node]) =>
    JSON.stringify(node.inputs?.source) === JSON.stringify(["11", 0])
  );
  assert.equal(subjectConsumers.length, 1, "Subject cutout must be composited exactly once");

  // Stage 2: ImageCompositeMasked (Node 22) places 1050x1080 title-safe navy panel at x=0 over Node 18 output
  assert.equal(workflow["22"]?.class_type, "ImageCompositeMasked");
  assert.deepEqual(workflow["22"]?.inputs?.destination, ["18", 0]);
  assert.deepEqual(workflow["22"]?.inputs?.source, ["19", 0]);
  assert.deepEqual(workflow["22"]?.inputs?.mask, ["21", 0]);
  assert.equal(workflow["22"]?.inputs?.x, 0);
  assert.equal(workflow["22"]?.inputs?.y, 0);
  assert.equal(workflow["22"]?.inputs?.resize_source, false);

  // SaveImage must save Node 22 (the final composite with background, subject, and title-safe panel)
  assert.deepEqual(workflow["9"]?.inputs?.images, ["22", 0]);
  assert.equal(workflow["9"]?.class_type, "SaveImage");

  // Positive prompt commands empty environment with no people and clean left space
  const posText = String(workflow["6"]?.inputs?.text ?? "").toLowerCase();
  assert.ok(posText.includes("empty") || posText.includes("negative space"));
  assert.ok(posText.includes("no people") || posText.includes("no human"));

  // Negative prompt discourages people, words, logos, watermarks, seams, and panels
  assert.equal(workflow["7"]?.class_type, "CLIPTextEncode");
  const negText = String(workflow["7"]?.inputs?.text ?? "").toLowerCase();
  assert.ok(negText.includes("people") || negText.includes("person") || negText.includes("human"));
  assert.ok(negText.includes("word") || negText.includes("text"));
  assert.ok(negText.includes("logo"));
  assert.ok(negText.includes("watermark"));
  assert.ok(negText.includes("seam") || negText.includes("panel"));
});

test("runComfyWorkflow cache identity and digest change when title-safe parameters change", async () => {
  const { runComfyWorkflow } = await import("../src/adapters/comfyui.js");
  const { readFile, writeFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");

  const root = await mkdtemp(path.join(tmpdir(), "ava-title-safe-cache-"));
  const sourceImage = path.join(root, "cutout.png");
  await writeFile(sourceImage, "transparent-cutout-bytes");

  const context = {
    configDir: root,
    stepDir: path.join(root, "step"),
    settings: { services: { comfyui: { baseUrl: "http://127.0.0.1:8188" } } },
    resolvePath: (p) => (path.isAbsolute(p) ? p : path.resolve(p)),
    resolveRunPath: (p) => path.join(root, p),
    dryRun: true
  };

  const baseInput = {
    workflowFile: "workflows/generate-cover-zimage.api.json",
    uploads: [{ patch: "10.inputs.image", file: sourceImage, subfolder: "psu-ava/storyboard-covers/cover_1" }],
    patches: { "6.inputs.text": "academic environment", "3.inputs.seed": 2026 },
    width: 1920,
    height: 1080
  };

  const baseResult = await runComfyWorkflow(baseInput, context);
  assert.ok(baseResult.workflowDigest);
  assert.ok(baseResult.cacheDigest);

  // Workflow file change (e.g. changing title-safe color or width) produces new workflowDigest and cacheDigest
  const raw = await readFile("workflows/generate-cover-zimage.api.json", "utf8");
  const modifiedWorkflow = JSON.parse(raw);
  modifiedWorkflow["19"].inputs.color = 0x0A192F; // alternate navy
  const modifiedFile = path.join(root, "modified-cover.json");
  await writeFile(modifiedFile, JSON.stringify(modifiedWorkflow, null, 2));

  const modifiedResult = await runComfyWorkflow({
    ...baseInput,
    workflowFile: modifiedFile
  }, context);

  assert.notEqual(baseResult.workflowDigest, modifiedResult.workflowDigest);
  assert.notEqual(baseResult.cacheDigest, modifiedResult.cacheDigest);
});

test("runComfyWorkflow live cache hits on identical content and misses on changed input", async () => {
  const { runComfyWorkflow } = await import("../src/adapters/comfyui.js");
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");

  const root = await mkdtemp(path.join(tmpdir(), "ava-comfy-cache-"));
  const sourceImage = path.join(root, "source.png");
  await writeFile(sourceImage, "initial-source-image-content");

  const context = {
    configDir: root,
    stepDir: path.join(root, "step"),
    settings: { services: { comfyui: { baseUrl: "http://127.0.0.1:8188" } } },
    resolvePath: (p) => (path.isAbsolute(p) ? p : path.resolve(p)),
    resolveRunPath: (p) => path.join(root, p),
    dryRun: false,
    timeoutMs: 5000
  };
  await mkdir(context.stepDir, { recursive: true });

  const input1 = {
    workflowFile: "workflows/generate-cover-zimage.api.json",
    uploads: [{ patch: "10.inputs.image", file: sourceImage }],
    patches: { "6.inputs.text": "academic portrait", "3.inputs.seed": 100 },
    width: 1920,
    height: 1080
  };

  // 1. Dry run returns deterministic cacheDigest and cacheHit=false
  const dry = await runComfyWorkflow(input1, { ...context, dryRun: true });
  assert.ok(dry.cacheDigest);
  assert.equal(dry.cacheHit, false);

  // 2. Pre-populate cache directly under root/.ava-cache/comfyui/<cacheDigest>
  const cacheEntryDir = path.join(root, ".ava-cache", "comfyui", dry.cacheDigest);
  await mkdir(cacheEntryDir, { recursive: true });
  const outputImgPath = path.join(cacheEntryDir, "output.png");
  const outputBytes = Buffer.from("pre-cached-image-bytes");
  const outputSha = createHash("sha256").update(outputBytes).digest("hex");
  await writeFile(outputImgPath, outputBytes);

  const sourceImageBytes = await (await import("node:fs/promises")).readFile(sourceImage);
  const sourceSha = createHash("sha256").update(sourceImageBytes).digest("hex");
  const cacheIdentity = {
    schemaVersion: 1,
    workflowDigest: dry.workflowDigest,
    width: 1920,
    height: 1080,
    patches: { "3.inputs.seed": 100, "6.inputs.text": "academic portrait" },
    uploads: [{ fileSha256: sourceSha, patch: "10.inputs.image", subfolder: "", type: "input" }]
  };

  const manifest = {
    schemaVersion: 1,
    cacheDigest: dry.cacheDigest,
    workflowDigest: dry.workflowDigest,
    cachedAt: new Date().toISOString(),
    identity: cacheIdentity,
    images: [{ filename: "output.png", type: "output", sha256: outputSha }]
  };
  await writeFile(path.join(cacheEntryDir, "manifest.json"), JSON.stringify(manifest));

  // 3. Live run with matching inputs should hit cache without network
  const hitResult = await runComfyWorkflow(input1, context);
  assert.equal(hitResult.cacheHit, true);
  assert.equal(hitResult.cacheDigest, dry.cacheDigest);
  assert.equal(hitResult.workflowDigest, dry.workflowDigest);
  assert.equal(hitResult.images.length, 1);
  assert.equal(hitResult.images[0].sha256, outputSha);
  assert.ok(hitResult.promptId.startsWith("CACHED_"));

  // 4. Change source image bytes -> cacheDigest changes -> cache miss
  await writeFile(sourceImage, "altered-source-image-content");
  const dryAltered = await runComfyWorkflow(input1, { ...context, dryRun: true });
  assert.notEqual(dryAltered.cacheDigest, dry.cacheDigest);

  // 5. Corrupted image file in cache -> treated as cache miss, does not trust corrupted cache
  await writeFile(outputImgPath, Buffer.from("corrupted-bytes"));
  // Revert source image to hit previous digest
  await writeFile(sourceImage, "initial-source-image-content");
  const freshBytes = Buffer.from("freshly-downloaded-image-bytes-replacement");
  const freshSha = createHash("sha256").update(freshBytes).digest("hex");
  let mockFetchCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes("/prompt")) {
      mockFetchCallCount++;
      return new Response(JSON.stringify({ prompt_id: "mock-prompt-1" }));
    }
    if (urlStr.includes("/history")) return new Response(JSON.stringify({ "mock-prompt-1": { outputs: { "9": { images: [{ filename: "output.png", type: "output" }] } } } }));
    if (urlStr.includes("/view")) return new Response(freshBytes);
    if (urlStr.includes("/upload/image")) return new Response(JSON.stringify({ name: "uploaded.png", subfolder: "" }));
    return new Response("{}", { status: 200 });
  };
  try {
    const runContext = {
      ...context,
      stepDir: path.join(root, "run-step-1")
    };
    const downloadDir = path.join(root, "downloads");
    const missResult = await runComfyWorkflow({
      ...input1,
      downloadDir: "downloads"
    }, {
      ...runContext,
      resolveRunPath: (p) => path.join(root, p)
    });

    // Proves: live miss did exactly one mock generation
    assert.equal(mockFetchCallCount, 1);
    assert.equal(missResult.cacheHit, false);
    assert.equal(missResult.promptId, "mock-prompt-1");
    assert.equal(missResult.images.length, 1);

    // Proves: returned localPath exists and bytes/hash equal fresh downloaded image
    const returnedPath = missResult.images[0].localPath;
    const actualBytes = await (await import("node:fs/promises")).readFile(returnedPath);
    assert.deepEqual(actualBytes, freshBytes);
    assert.equal(missResult.images[0].sha256, freshSha);

    // Proves: manifest in cache directory is valid and matches fresh image
    const manifestOnDisk = JSON.parse(await (await import("node:fs/promises")).readFile(path.join(cacheEntryDir, "manifest.json"), "utf8"));
    assert.equal(manifestOnDisk.cacheDigest, dry.cacheDigest);
    assert.equal(manifestOnDisk.images[0].sha256, freshSha);

    // Proves: downloadDir copy exists, is non-empty, and byte-identical
    const downloadedFile = path.join(downloadDir, "output.png");
    const downloadedBytes = await (await import("node:fs/promises")).readFile(downloadedFile);
    assert.deepEqual(downloadedBytes, freshBytes);
    assert.ok(downloadedBytes.length > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runComfyWorkflow with includeHistory forces fresh generation and safely replaces pre-existing valid cache", async () => {
  const { runComfyWorkflow } = await import("../src/adapters/comfyui.js");
  const { mkdir, readFile, writeFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");

  const root = await mkdtemp(path.join(tmpdir(), "ava-comfy-history-force-"));
  const sourceImage = path.join(root, "source.png");
  await writeFile(sourceImage, "initial-source-image-content");

  const context = {
    configDir: root,
    stepDir: path.join(root, "step"),
    settings: { services: { comfyui: { baseUrl: "http://127.0.0.1:8188" } } },
    resolvePath: (p) => (path.isAbsolute(p) ? p : path.resolve(p)),
    resolveRunPath: (p) => path.join(root, p),
    dryRun: false,
    timeoutMs: 5000
  };
  await mkdir(context.stepDir, { recursive: true });

  const input = {
    workflowFile: "workflows/generate-cover-zimage.api.json",
    uploads: [{ patch: "10.inputs.image", file: sourceImage }],
    patches: { "6.inputs.text": "academic portrait", "3.inputs.seed": 100 },
    width: 1920,
    height: 1080
  };

  const dry = await runComfyWorkflow(input, { ...context, dryRun: true });

  // 1. Establish preexisting valid cache with old bytes
  const cacheEntryDir = path.join(root, ".ava-cache", "comfyui", dry.cacheDigest);
  await mkdir(cacheEntryDir, { recursive: true });
  const oldImgPath = path.join(cacheEntryDir, "output.png");
  const oldBytes = Buffer.from("old-pre-cached-image-bytes");
  const oldSha = createHash("sha256").update(oldBytes).digest("hex");
  await writeFile(oldImgPath, oldBytes);

  const sourceImageBytes = await readFile(sourceImage);
  const sourceSha = createHash("sha256").update(sourceImageBytes).digest("hex");
  const cacheIdentity = {
    schemaVersion: 1,
    workflowDigest: dry.workflowDigest,
    width: 1920,
    height: 1080,
    patches: { "3.inputs.seed": 100, "6.inputs.text": "academic portrait" },
    uploads: [{ fileSha256: sourceSha, patch: "10.inputs.image", subfolder: "", type: "input" }]
  };
  const manifest = {
    schemaVersion: 1,
    cacheDigest: dry.cacheDigest,
    workflowDigest: dry.workflowDigest,
    cachedAt: new Date().toISOString(),
    identity: cacheIdentity,
    images: [{ filename: "output.png", type: "output", sha256: oldSha }]
  };
  await writeFile(path.join(cacheEntryDir, "manifest.json"), JSON.stringify(manifest));

  // 2. Run with includeHistory: true and fresh mock bytes
  const freshBytes = Buffer.from("brand-new-fresh-generation-bytes");
  const freshSha = createHash("sha256").update(freshBytes).digest("hex");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes("/history")) return new Response(JSON.stringify({ "prompt-force-history": { outputs: { "9": { images: [{ filename: "output.png", type: "output" }] } } } }));
    if (urlStr.includes("/prompt")) return new Response(JSON.stringify({ prompt_id: "prompt-force-history" }));
    if (urlStr.includes("/view")) return new Response(freshBytes);
    if (urlStr.includes("/upload/image")) return new Response(JSON.stringify({ name: "uploaded.png", subfolder: "" }));
    return new Response("{}", { status: 200 });
  };

  try {
    const res = await runComfyWorkflow({ ...input, includeHistory: true }, context);
    assert.equal(res.cacheHit, false);
    assert.equal(res.promptId, "prompt-force-history");
    assert.ok(res.rawHistory);
    assert.equal(res.images[0].sha256, freshSha);

    // Proves returned image file contains fresh bytes
    const returnedBytes = await readFile(res.images[0].localPath);
    assert.deepEqual(returnedBytes, freshBytes);

    // Proves on-disk cache was updated with fresh bytes and fresh sha
    const cacheDiskBytes = await readFile(path.join(cacheEntryDir, "output.png"));
    assert.deepEqual(cacheDiskBytes, freshBytes);
    const diskManifest = JSON.parse(await readFile(path.join(cacheEntryDir, "manifest.json"), "utf8"));
    assert.equal(diskManifest.images[0].sha256, freshSha);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("publishCacheEntry never deletes a valid concurrent winner and fails closed on corrupted staging", async () => {
  const { publishCacheEntry, validateCacheEntry } = await import("../src/adapters/comfyui.js");
  const { mkdir, readFile, writeFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");

  const root = await mkdtemp(path.join(tmpdir(), "ava-publish-race-"));
  const cacheDigest = "1111111111111111111111111111111111111111111111111111111111111111";
  const wfDigest = "2222222222222222222222222222222222222222222222222222222222222222";

  // 1. Staging with corrupted manifest -> fails closed
  const tmpStaging = path.join(root, ".tmp-staging-1");
  const destEntry = path.join(root, cacheDigest);
  await mkdir(tmpStaging, { recursive: true });
  await assert.rejects(
    publishCacheEntry(root, tmpStaging, destEntry, cacheDigest, wfDigest),
    (err) => err.code === "CACHE_PUBLISH_FAILED"
  );

  // 2. Pre-create a valid concurrent winner at destEntry
  const identity = {
    height: null,
    patches: {},
    schemaVersion: 1,
    uploads: [],
    width: null,
    workflowDigest: wfDigest
  };
  const actualIdentityDigest = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  const winnerDest = path.join(root, actualIdentityDigest);

  await mkdir(winnerDest, { recursive: true });
  const winnerBytes = Buffer.from("valid-winner-image-content");
  const winnerSha = createHash("sha256").update(winnerBytes).digest("hex");
  await writeFile(path.join(winnerDest, "image.png"), winnerBytes);

  const winnerManifest = {
    schemaVersion: 1,
    cacheDigest: actualIdentityDigest,
    workflowDigest: wfDigest,
    cachedAt: new Date().toISOString(),
    identity,
    images: [{ filename: "image.png", type: "output", sha256: winnerSha }]
  };
  await writeFile(path.join(winnerDest, "manifest.json"), JSON.stringify(winnerManifest));

  // Valid staging trying to publish to same actualIdentityDigest
  const tmpStaging2 = path.join(root, `.tmp-staging-${Date.now()}`);
  await mkdir(tmpStaging2, { recursive: true });
  const stagingBytes = Buffer.from("staging-bytes");
  const stagingSha = createHash("sha256").update(stagingBytes).digest("hex");
  await writeFile(path.join(tmpStaging2, "image.png"), stagingBytes);
  const stagingManifest = {
    schemaVersion: 1,
    cacheDigest: actualIdentityDigest,
    workflowDigest: wfDigest,
    cachedAt: new Date().toISOString(),
    identity,
    images: [{ filename: "image.png", type: "output", sha256: stagingSha }]
  };
  await writeFile(path.join(tmpStaging2, "manifest.json"), JSON.stringify(stagingManifest));

  // Destination already exists and is valid winner -> publishCacheEntry must return winner's images without deleting winner
  const acceptedImages = await publishCacheEntry(root, tmpStaging2, winnerDest, actualIdentityDigest, wfDigest);
  assert.equal(acceptedImages[0].sha256, winnerSha);
  // Winner image file is untouched and exists
  const winnerFileBytes = await readFile(path.join(winnerDest, "image.png"));
  assert.deepEqual(winnerFileBytes, winnerBytes);
});

test("publishCacheEntry safely restores and revalidates valid concurrent winner moved to quarantine during race", async () => {
  const { publishCacheEntry } = await import("../src/adapters/comfyui.js");
  const { mkdir, readFile, writeFile, rename } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");

  const root = await mkdtemp(path.join(tmpdir(), "ava-publish-restore-race-"));
  const wfDigest = "2222222222222222222222222222222222222222222222222222222222222222";
  const identity = {
    height: null,
    patches: {},
    schemaVersion: 1,
    uploads: [],
    width: null,
    workflowDigest: wfDigest
  };
  const cacheDigest = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  const entryDir = path.join(root, cacheDigest);

  // 1. Initial entryDir is corrupted/invalid
  await mkdir(entryDir, { recursive: true });
  await writeFile(path.join(entryDir, "manifest.json"), "invalid-corrupted-json");

  // 2. Caller-owned staging directory with valid bytes
  const tmpStaging = path.join(root, `.tmp-staging-${Date.now()}`);
  await mkdir(tmpStaging, { recursive: true });
  const stagingBytes = Buffer.from("staged-generation-bytes");
  const stagingSha = createHash("sha256").update(stagingBytes).digest("hex");
  await writeFile(path.join(tmpStaging, "image.png"), stagingBytes);
  const stagingManifest = {
    schemaVersion: 1,
    cacheDigest,
    workflowDigest: wfDigest,
    cachedAt: new Date().toISOString(),
    identity,
    images: [{ filename: "image.png", type: "output", sha256: stagingSha }]
  };
  await writeFile(path.join(tmpStaging, "manifest.json"), JSON.stringify(stagingManifest));

  // 3. Setup race injection:
  // When fsOps.rename is called to move entryDir to quarantine, simulate a race where
  // a concurrent winner wrote a valid entry into entryDir just before rename executes.
  const winnerBytes = Buffer.from("concurrent-winner-fresh-bytes");
  const winnerSha = createHash("sha256").update(winnerBytes).digest("hex");
  const winnerManifest = {
    schemaVersion: 1,
    cacheDigest,
    workflowDigest: wfDigest,
    cachedAt: new Date().toISOString(),
    identity,
    images: [{ filename: "image.png", type: "output", sha256: winnerSha }]
  };

  let injectedRace = false;
  const customFsOps = {
    rename: async (src, dest) => {
      if (src === entryDir && dest.includes(".quarantine-") && !injectedRace) {
        injectedRace = true;
        // Inject valid winner into entryDir before moving to quarantine
        await writeFile(path.join(entryDir, "image.png"), winnerBytes);
        await writeFile(path.join(entryDir, "manifest.json"), JSON.stringify(winnerManifest));
      }
      return rename(src, dest);
    }
  };

  const returnedImages = await publishCacheEntry(
    root,
    tmpStaging,
    entryDir,
    cacheDigest,
    wfDigest,
    { fsOps: customFsOps }
  );

  assert.ok(injectedRace, "Race condition was injected");
  assert.equal(returnedImages.length, 1);
  assert.equal(returnedImages[0].sha256, winnerSha);

  // Every returned localPath must exist under entryDir (not quarantine) with exact winner bytes/hash
  const returnedPath = returnedImages[0].localPath;
  assert.ok(returnedPath.startsWith(entryDir), `Path ${returnedPath} should be under ${entryDir}`);
  assert.ok(!returnedPath.includes(".quarantine-"), `Path ${returnedPath} must not point to quarantine`);

  const fileOnDisk = await readFile(returnedPath);
  assert.deepEqual(fileOnDisk, winnerBytes);
  assert.equal(createHash("sha256").update(fileOnDisk).digest("hex"), winnerSha);
});


