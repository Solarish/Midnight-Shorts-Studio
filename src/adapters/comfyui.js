import { basename, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

export async function runComfyWorkflow(input, context) {
  if (!input.workflowFile) throw new Error("comfyui.workflow requires with.workflowFile");
  const service = { ...context.settings.services.comfyui, ...(input.service ?? {}) };
  const workflowFile = context.resolvePath(input.workflowFile);

  if (context.dryRun) {
    const downloadDir = input.downloadDir ? context.resolveRunPath(input.downloadDir) : context.stepDir;
    return {
      promptId: "DRY_RUN_PROMPT_ID",
      workflowFile,
      images: [{
        filename: "dry-run-output.png",
        localPath: resolve(downloadDir, "dry-run-output.png")
      }]
    };
  }

  const prompt = JSON.parse(await readFile(workflowFile, "utf8"));
  for (const [patchPath, value] of Object.entries(input.patches ?? {})) {
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
  const images = collectImages(history);
  const downloadDir = input.downloadDir ? context.resolveRunPath(input.downloadDir) : context.stepDir;
  await mkdir(downloadDir, { recursive: true });

  const downloaded = [];
  for (const image of images) {
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
    const localPath = resolve(downloadDir, basename(image.filename));
    await writeFile(localPath, Buffer.from(await response.arrayBuffer()));
    downloaded.push({ ...image, localPath });
  }

  return { promptId, workflowFile, images: downloaded, rawHistory: input.includeHistory ? history : undefined };
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

