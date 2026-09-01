import { createHash } from "node:crypto";
import path, { basename, resolve } from "node:path";
import { mkdir, readFile, rename, realpath, rm, stat, writeFile } from "node:fs/promises";

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export async function runComfyWorkflow(input, context) {
  if (!input.workflowFile) throw new Error("comfyui.workflow requires with.workflowFile");
  const patches = effectivePatches(input);
  validatePromptLanguage(input, patches);
  const service = { ...context.settings.services?.comfyui, ...(input.service ?? {}) };
  const workflowFile = context.resolvePath(input.workflowFile);
  const workflowBytes = await readFile(workflowFile);
  const workflowDigest = createHash("sha256").update(workflowBytes).digest("hex");

  // Compute canonical upload descriptors with content sha256 of actual file bytes
  const uploadInfoList = [];
  let cacheIdentityMeasured = true;
  const plannedUploadPaths = [];
  for (const upload of input.uploads ?? []) {
    const filePath = context.resolvePath(upload.file);
    let fileSha256;
    try {
      const fileBytes = await readFile(filePath);
      fileSha256 = createHash("sha256").update(fileBytes).digest("hex");
    } catch (error) {
      if (!context.dryRun || error?.code !== "ENOENT") throw error;
      cacheIdentityMeasured = false;
      plannedUploadPaths.push(filePath);
    }
    uploadInfoList.push({
      patch: upload.patch,
      ...(fileSha256 ? { fileSha256 } : { plannedPath: filePath }),
      type: upload.type ?? "input",
      subfolder: upload.subfolder ?? ""
    });
  }
  uploadInfoList.sort((a, b) => a.patch.localeCompare(b.patch));

  const cacheIdentity = {
    schemaVersion: 1,
    workflowDigest,
    width: input.width ? Number(input.width) : null,
    height: input.height ? Number(input.height) : null,
    patches: sortValue(patches),
    uploads: uploadInfoList
  };
  const cacheDigest = createHash("sha256").update(JSON.stringify(sortValue(cacheIdentity))).digest("hex");

  const cacheRoot = path.join(context.configDir ?? process.cwd(), ".ava-cache", "comfyui");
  const entryDir = path.join(cacheRoot, cacheDigest);
  const manifestPath = path.join(entryDir, "manifest.json");

  if (context.dryRun) {
    const downloadDir = input.downloadDir ? context.resolveRunPath(input.downloadDir) : context.stepDir;
    return {
      promptId: "DRY_RUN_PROMPT_ID",
      workflowFile,
      workflowDigest,
      cacheDigest,
      cacheIdentityMeasured,
      ...(plannedUploadPaths.length ? { plannedUploadPaths } : {}),
      cacheHit: false,
      images: [{
        filename: "dry-run-output.png",
        localPath: resolve(downloadDir, "dry-run-output.png"),
        sha256: "0000000000000000000000000000000000000000000000000000000000000000"
      }]
    };
  }

  // Check cache hit
  if (!input.includeHistory) {
    const hitCheck = await validateCacheEntry(entryDir, cacheDigest, workflowDigest);
    if (hitCheck.ok) {
      if (input.downloadDir) {
        const downloadDir = context.resolveRunPath(input.downloadDir);
        await mkdir(downloadDir, { recursive: true });
        for (const img of hitCheck.images) {
          const srcFile = path.join(entryDir, path.basename(img.filename));
          const destFile = path.join(downloadDir, path.basename(img.filename));
          const srcBytes = await readFile(srcFile);
          if (srcBytes.length === 0) throw Object.assign(new Error(`Cached image '${srcFile}' is empty`), { code: "CACHE_CORRUPT" });
          await writeFile(destFile, srcBytes);
        }
      }
      return {
        promptId: `CACHED_${cacheDigest.slice(0, 16)}`,
        workflowFile,
        workflowDigest,
        cacheDigest,
        cacheHit: true,
        images: hitCheck.images
      };
    }
  }

  const prompt = JSON.parse(workflowBytes.toString("utf8"));
  if (input.width && input.height) {
    for (const [nodeId, node] of Object.entries(prompt)) {
      if (node && typeof node === "object" && node.class_type === "EmptyLatentImage" && node.inputs) {
        if (!patches[`${nodeId}.inputs.width`]) node.inputs.width = Number(input.width);
        if (!patches[`${nodeId}.inputs.height`]) node.inputs.height = Number(input.height);
      }
    }
  }
  for (const [patchPath, value] of Object.entries(patches)) {
    setAtPath(prompt, patchPath, value);
  }

  for (const upload of input.uploads ?? []) {
    const uploaded = await uploadImage(service, context.resolvePath(upload.file), upload, context.timeoutMs);
    setAtPath(prompt, upload.patch, uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name);
  }

  const submit = await requestJson(service, "/prompt", {
    method: "POST",
    body: {
      prompt,
      client_id: service.clientId ?? "psu-ava-cli"
    },
    timeoutMs: context.timeoutMs
  });
  const promptId = submit.prompt_id;
  if (!promptId) throw new Error("ComfyUI did not return prompt_id");

  const history = await pollHistory(service, promptId, context);
  const rawImages = collectImages(history);

  await mkdir(cacheRoot, { recursive: true });
  const tmpSiblingDir = path.join(cacheRoot, `.tmp-${cacheDigest}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpSiblingDir, { recursive: true });

  let publishedImages = [];
  try {
    const stagedImages = [];
    for (const image of rawImages) {
      const query = new URLSearchParams({
        filename: image.filename,
        subfolder: image.subfolder ?? "",
        type: image.type ?? "output"
      });
      const response = await fetch(serviceUrl(service, `/view?${query}`), {
        headers: authHeaders(service),
        signal: AbortSignal.timeout(context.timeoutMs)
      });
      if (!response.ok) throw new Error(`ComfyUI image download failed: HTTP ${response.status}`);
      const imageBytes = Buffer.from(await response.arrayBuffer());
      if (imageBytes.length === 0) throw new Error(`ComfyUI downloaded image '${image.filename}' is empty`);
      const sha256 = createHash("sha256").update(imageBytes).digest("hex");
      const tmpLocalPath = path.join(tmpSiblingDir, basename(image.filename));
      await writeFile(tmpLocalPath, imageBytes);
      stagedImages.push({
        filename: image.filename,
        subfolder: image.subfolder ?? "",
        type: image.type ?? "output",
        sha256
      });
    }

    const manifest = {
      schemaVersion: 1,
      cacheDigest,
      workflowDigest,
      cachedAt: new Date().toISOString(),
      identity: cacheIdentity,
      images: stagedImages
    };
    await writeFile(path.join(tmpSiblingDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

    publishedImages = await publishCacheEntry(
      cacheRoot,
      tmpSiblingDir,
      entryDir,
      cacheDigest,
      workflowDigest,
      { forceRefresh: Boolean(input.includeHistory) }
    );
  } catch (error) {
    await rm(tmpSiblingDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  if (input.downloadDir) {
    const downloadDir = context.resolveRunPath(input.downloadDir);
    await mkdir(downloadDir, { recursive: true });
    for (const img of publishedImages) {
      const srcFile = path.join(entryDir, basename(img.filename));
      const destFile = path.join(downloadDir, basename(img.filename));
      const srcBytes = await readFile(srcFile);
      if (srcBytes.length === 0) throw Object.assign(new Error(`Published image '${srcFile}' is empty`), { code: "CACHE_COPY_FAILED" });
      await writeFile(destFile, srcBytes);
    }
  }

  return {
    promptId,
    workflowFile,
    workflowDigest,
    cacheDigest,
    cacheIdentityMeasured: true,
    cacheHit: false,
    images: publishedImages,
    rawHistory: input.includeHistory ? history : undefined
  };
}

function effectivePatches(input) {
  const patches = { ...(input.patches ?? {}) };
  if (input.prompt !== undefined) {
    const promptPatch = input.promptPatch ?? "6.inputs.text";
    if (typeof promptPatch !== "string" || !promptPatch.trim()) throw new Error("comfyui.workflow promptPatch must be a non-empty string");
    patches[promptPatch] = input.prompt;
  }
  return patches;
}

function validatePromptLanguage(input, patches) {
  if (input.promptLanguage === undefined) return;
  if (input.promptLanguage !== "en") throw new Error("comfyui.workflow promptLanguage currently supports only 'en'");
  const promptPatches = Object.entries(patches).filter(([patchPath]) => /\.inputs\.text$/.test(patchPath));
  if (!promptPatches.length) throw new Error("comfyui.workflow promptLanguage=en requires a text prompt patch");
  for (const [patchPath, value] of promptPatches) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`ComfyUI English prompt patch '${patchPath}' must be non-empty`);
    if (/[\u0E00-\u0E7F]/u.test(value)) throw new Error(`comfyui.workflow promptLanguage=en rejected Thai characters at '${patchPath}'`);
  }
}

async function uploadImage(service, filePath, upload, timeoutMs) {
  const form = new FormData();
  form.append("image", new Blob([await readFile(filePath)]), basename(filePath));
  form.append("overwrite", String(upload.overwrite ?? true));
  form.append("type", upload.type ?? "input");
  if (upload.subfolder) form.append("subfolder", upload.subfolder);

  const response = await fetch(serviceUrl(service, "/upload/image"), {
    method: "POST",
    headers: authHeaders(service),
    body: form,
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`ComfyUI upload failed: HTTP ${response.status} ${await response.text()}`);
  return response.json();
}

async function pollHistory(service, promptId, context) {
  const deadline = Date.now() + context.timeoutMs;
  while (Date.now() < deadline) {
    const payload = await requestJson(service, `/history/${encodeURIComponent(promptId)}`, {
      timeoutMs: Math.min(30_000, context.timeoutMs)
    });
    const entry = payload[promptId] ?? payload;
    if (entry?.status?.status_str === "error") {
      throw new Error(`ComfyUI job ${promptId} failed`);
    }
    if (entry?.outputs && Object.keys(entry.outputs).length > 0) return entry;
    await sleep(context.settings.pollIntervalMs);
  }
  throw new Error(`ComfyUI job ${promptId} timed out after ${context.timeoutMs}ms`);
}

function collectImages(history) {
  const images = [];
  for (const output of Object.values(history.outputs ?? {})) {
    for (const image of output.images ?? []) images.push(image);
  }
  if (images.length === 0) throw new Error("ComfyUI completed without image outputs");
  return images;
}

function setAtPath(target, expression, value) {
  if (!expression) throw new Error("ComfyUI patch path is required");
  const parts = expression.startsWith("/")
    ? expression.slice(1).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    : expression.split(".");
  let current = target;
  for (const part of parts.slice(0, -1)) {
    if (!(part in current)) throw new Error(`ComfyUI patch path not found: ${expression}`);
    current = current[part];
  }
  const finalPart = parts.at(-1);
  if (!(finalPart in current)) throw new Error(`ComfyUI patch target not found: ${expression}`);
  current[finalPart] = value;
}

async function requestJson(service, pathname, options = {}) {
  const response = await fetch(serviceUrl(service, pathname), {
    method: options.method ?? "GET",
    headers: { "content-type": "application/json", ...authHeaders(service) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000)
  });
  if (!response.ok) throw new Error(`ComfyUI HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

function serviceUrl(service, pathname) {
  return new URL(pathname.replace(/^\//, ""), `${service.baseUrl.replace(/\/$/, "")}/`).toString();
}

function authHeaders(service) {
  if (!service.tokenEnv || !process.env[service.tokenEnv]) return {};
  return { authorization: `Bearer ${process.env[service.tokenEnv]}` };
}

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

export async function validateCacheEntry(dirPath, expectedCacheDigest, expectedWorkflowDigest) {
  try {
    const canonicalDir = await realpath(dirPath);
    const manifestPath = path.join(canonicalDir, "manifest.json");
    const manifestRaw = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw);

    if (
      manifest.schemaVersion !== 1 ||
      manifest.cacheDigest !== expectedCacheDigest ||
      manifest.workflowDigest !== expectedWorkflowDigest ||
      !manifest.identity ||
      typeof manifest.identity !== "object" ||
      manifest.identity.schemaVersion !== 1 ||
      manifest.identity.workflowDigest !== expectedWorkflowDigest ||
      !Array.isArray(manifest.images) ||
      manifest.images.length === 0
    ) {
      return { ok: false, reason: "Manifest schema, digest, or identity mismatch" };
    }

    const recomputedDigest = createHash("sha256").update(JSON.stringify(sortValue(manifest.identity))).digest("hex");
    if (recomputedDigest.toLowerCase() !== expectedCacheDigest.toLowerCase() || recomputedDigest.toLowerCase() !== manifest.cacheDigest.toLowerCase()) {
      return { ok: false, reason: `Recomputed identity digest ${recomputedDigest} does not match expected ${expectedCacheDigest}` };
    }

    const validatedImages = [];
    for (const img of manifest.images) {
      if (!img.filename || typeof img.sha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(img.sha256)) {
        return { ok: false, reason: "Invalid image filename or sha256 in manifest" };
      }
      const rawImgPath = path.join(canonicalDir, path.basename(img.filename));
      const ext = path.extname(rawImgPath).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) {
        return { ok: false, reason: `Unsupported image extension: ${ext}` };
      }
      const realImgPath = await realpath(rawImgPath);
      const rel = path.relative(canonicalDir, realImgPath);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return { ok: false, reason: "Symlink escape detected" };
      }
      const imgStat = await stat(realImgPath);
      if (!imgStat.isFile() || imgStat.size === 0) {
        return { ok: false, reason: `Image is empty or not a regular file: ${realImgPath}` };
      }
      const imgBytes = await readFile(realImgPath);
      const actualSha256 = createHash("sha256").update(imgBytes).digest("hex");
      if (actualSha256.toLowerCase() !== img.sha256.toLowerCase()) {
        return { ok: false, reason: `Image sha256 mismatch for ${img.filename}` };
      }
      validatedImages.push({
        filename: img.filename,
        subfolder: img.subfolder ?? "",
        type: img.type ?? "output",
        localPath: path.join(dirPath, path.basename(img.filename)),
        sha256: img.sha256.toLowerCase()
      });
    }

    return { ok: true, manifest, images: validatedImages };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export async function publishCacheEntry(
  cacheRoot,
  tmpSiblingDir,
  entryDir,
  cacheDigest,
  workflowDigest,
  options = {}
) {
  const forceRefresh = Boolean(options.forceRefresh);
  const fsOps = {
    rename,
    stat,
    rm,
    realpath,
    readFile,
    writeFile,
    ...(options.fsOps ?? {})
  };

  // 1. Verify caller-owned staging temp directory first
  const tmpValidation = await validateCacheEntry(tmpSiblingDir, cacheDigest, workflowDigest);
  if (!tmpValidation.ok) {
    await fsOps.rm(tmpSiblingDir, { recursive: true, force: true }).catch(() => {});
    throw Object.assign(
      new Error(`Generated cache staging validation failed: ${tmpValidation.reason}`),
      { code: "CACHE_PUBLISH_FAILED" }
    );
  }

  const maxAttempts = Number.isInteger(options.maxAttempts) && options.maxAttempts > 0 ? options.maxAttempts : 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Check if destination exists
    let entryStat = null;
    try {
      entryStat = await fsOps.stat(entryDir);
    } catch {
      entryStat = null;
    }

    if (entryStat) {
      if (!forceRefresh) {
        // If not forcing refresh, check if existing destination is already a valid winner
        const existingValidation = await validateCacheEntry(entryDir, cacheDigest, workflowDigest);
        if (existingValidation.ok) {
          // Valid concurrent winner! Clean up our staging directory and accept winner
          await fsOps.rm(tmpSiblingDir, { recursive: true, force: true }).catch(() => {});
          return existingValidation.images;
        }
      }

      // Existing entry is invalid or forceRefresh is requested.
      // Atomically move entryDir to a uniquely named quarantine directory.
      const quarantineDir = path.join(
        cacheRoot,
        `.quarantine-${cacheDigest}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );

      let movedToQuarantine = false;
      try {
        await fsOps.rename(entryDir, quarantineDir);
        movedToQuarantine = true;
      } catch {
        // Destination could not be moved (e.g. removed by another process in race)
        if (!forceRefresh) {
          const raceCheck = await validateCacheEntry(entryDir, cacheDigest, workflowDigest);
          if (raceCheck.ok) {
            await fsOps.rm(tmpSiblingDir, { recursive: true, force: true }).catch(() => {});
            return raceCheck.images;
          }
        }
      }

      if (movedToQuarantine) {
        // Before deleting quarantineDir, validate it
        const quarantineCheck = await validateCacheEntry(quarantineDir, cacheDigest, workflowDigest);
        if (quarantineCheck.ok && !forceRefresh) {
          // It was actually a valid winner! Try to restore it
          try {
            await fsOps.rename(quarantineDir, entryDir);
            await fsOps.rm(tmpSiblingDir, { recursive: true, force: true }).catch(() => {});
            const restoredValidation = await validateCacheEntry(entryDir, cacheDigest, workflowDigest);
            if (restoredValidation.ok) {
              return restoredValidation.images;
            }
            throw Object.assign(
              new Error(`Cache publication restored entry validation failed: ${restoredValidation.reason}`),
              { code: "CACHE_PUBLISH_FAILED" }
            );
          } catch (restoreErr) {
            const winCheck = await validateCacheEntry(entryDir, cacheDigest, workflowDigest);
            if (winCheck.ok) {
              await fsOps.rm(tmpSiblingDir, { recursive: true, force: true }).catch(() => {});
              await fsOps.rm(quarantineDir, { recursive: true, force: true }).catch(() => {});
              return winCheck.images;
            }
            throw Object.assign(
              new Error(`Cache publication restore failed: ${restoreErr.message}`),
              { code: "CACHE_PUBLISH_FAILED" }
            );
          }
        } else {
          // Confirmed invalid (or forceRefresh). Safely delete ONLY this quarantine directory
          await fsOps.rm(quarantineDir, { recursive: true, force: true }).catch(() => {});
        }
      }
    }

    // Now attempt to rename tmpSiblingDir into entryDir
    try {
      await fsOps.rename(tmpSiblingDir, entryDir);
      // Succeeded! Do final verification on entryDir
      const finalValidation = await validateCacheEntry(entryDir, cacheDigest, workflowDigest);
      if (!finalValidation.ok) {
        throw Object.assign(
          new Error(`Cache publication verification failed: ${finalValidation.reason}`),
          { code: "CACHE_PUBLISH_FAILED" }
        );
      }
      return finalValidation.images;
    } catch {
      if (!forceRefresh) {
        const winnerValidation = await validateCacheEntry(entryDir, cacheDigest, workflowDigest);
        if (winnerValidation.ok) {
          await fsOps.rm(tmpSiblingDir, { recursive: true, force: true }).catch(() => {});
          return winnerValidation.images;
        }
      }
    }
  }

  // All retry attempts exhausted without successful publication
  await fsOps.rm(tmpSiblingDir, { recursive: true, force: true }).catch(() => {});
  if (!forceRefresh) {
    const lastCheck = await validateCacheEntry(entryDir, cacheDigest, workflowDigest);
    if (lastCheck.ok) return lastCheck.images;
  }
  throw Object.assign(
    new Error(`Cache publication failed for digest ${cacheDigest} after ${maxAttempts} attempts`),
    { code: "CACHE_PUBLISH_FAILED" }
  );
}
