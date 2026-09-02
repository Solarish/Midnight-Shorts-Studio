import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const baseUrl = process.env.COMFY_URL || "http://10.135.66.70:8188";
const root = process.cwd();
const outDir = join(root, "prototype-runs", `cover-bg-benchmark-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const candidates = [
  "modern university atrium, broad architectural perspective, warm morning light",
  "contemporary dental research laboratory, clean glass and brushed metal surfaces, controlled teal lighting",
  "quiet university library corridor, elegant wood and stone architecture, soft daylight",
  "professional university broadcast studio environment, deep navy acoustic panels, warm gold practical lights",
  "historic university academic building interior, refined columns, polished floor, editorial documentary mood",
  "minimal lecture hall with geometric ceiling architecture, cinematic navy and amber lighting",
  "open campus courtyard with modern academic architecture, trees kept subtle at the edges, clear daylight",
  "clinical dental education laboratory, elegant instruments arranged in the far background, clean architectural composition",
  "university innovation hub with glass walls, research displays kept abstract and unreadable, premium documentary photography",
  "cinematic architectural study of a university science building, layered depth, restrained navy teal and warm gold palette"
];
const invariant = "Empty realistic elegant university and dental-science documentary environment; PSU-inspired deep navy, warm gold, and subtle teal ambient documentary lighting; sharp focus across the full architectural scene, no bokeh, no shallow depth of field, no blur; clean cinematic negative space on the left for title overlay; high resolution professional photography, crisp fine details, absolutely no people, no human silhouettes, no rendered text.";
const negative = "people, person, human, face, body, silhouette, text, logo, watermark, signature, blurry, low quality, noisy, distorted architecture, cluttered foreground";

async function json(url, options) { const response = await fetch(url, options); if (!response.ok) throw new Error(`${response.status} ${await response.text()}`); return response.json(); }
function findNodes(workflow) {
  const entries = Object.entries(workflow);
  const sampler = entries.find(([, node]) => node.class_type === "KSampler" || node.class_type === "KSamplerAdvanced")?.[1];
  if (!sampler) throw new Error("No KSampler in Debian Z-Image history workflow");
  const positiveId = sampler.inputs.positive?.[0];
  const negativeId = sampler.inputs.negative?.[0];
  const positive = workflow[positiveId];
  const negativeNode = workflow[negativeId];
  const save = entries.find(([, node]) => node.class_type === "SaveImage" || node.class_type === "PreviewImage")?.[1];
  if (!positive || !negativeNode || !save) throw new Error("Workflow does not expose prompt/save nodes");
  return { sampler, positive, negativeNode, save };
}
async function waitFor(promptId) {
  for (;;) {
    const history = await json(`${baseUrl}/history/${encodeURIComponent(promptId)}`);
    const item = history[promptId];
    if (item?.status?.completed || item?.status?.status_str === "error") return item;
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}
async function downloadImage(image, target) {
  const url = `${baseUrl}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder || "")}&type=${encodeURIComponent(image.type || "output")}`;
  const response = await fetch(url); if (!response.ok) throw new Error(`Download failed ${response.status}`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

await mkdir(outDir, { recursive: true });
const history = await json(`${baseUrl}/history`);
const remote = Object.values(history).filter((item) => {
  const graph = item.prompt?.[2] || {};
  const values = Object.values(graph);
  const positive = values.find((node) => node.class_type === "CLIPTextEncode" && String(node.inputs?.text || "").includes("Empty realistic elegant"));
  const save = values.find((node) => node.class_type === "SaveImage" && String(node.inputs?.filename_prefix || "").includes("ava_storyboard/cover_background"));
  return Boolean(positive && save && values.some((node) => node.class_type === "UNETLoader" && node.inputs?.unet_name === "z_image_turbo_bf16.safetensors"));
});
if (!remote.length) throw new Error("No real Debian Cover Background Z-Image workflow found in ComfyUI history");
const source = remote.sort((a, b) => Number(b.prompt?.[3]?.create_time || 0) - Number(a.prompt?.[3]?.create_time || 0))[0];
const workflow = structuredClone(source.prompt[2]);
const nodes = findNodes(workflow);
const latent = Object.values(workflow).find((node) => node.class_type === "EmptyLatentImage");
if (latent) { latent.inputs.width = 768; latent.inputs.height = 432; }
const seedBase = 2026090201;
const results = [];
for (let index = 0; index < candidates.length; index += 1) {
  for (let repeat = 0; repeat < 2; repeat += 1) {
    const id = `${String(index + 1).padStart(2, "0")}-${repeat + 1}`;
    nodes.positive.inputs.text = `${invariant} User style direction: ${candidates[index]}.`;
    nodes.negativeNode.inputs.text = negative;
    nodes.sampler.inputs.seed = seedBase + index * 10 + repeat;
    if ("filename_prefix" in nodes.save.inputs) nodes.save.inputs.filename_prefix = `ava_benchmark/cover_bg_${id}`;
    const queued = await json(`${baseUrl}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: workflow, client_id: "psu-ava-cover-background-benchmark" }) });
    const item = await waitFor(queued.prompt_id);
    if (item.status?.status_str === "error") throw new Error(`ComfyUI failed ${id}: ${JSON.stringify(item.status.messages)}`);
    const image = Object.values(item.outputs || {}).flatMap((output) => output.images || [])[0];
    if (!image) throw new Error(`No image output for ${id}`);
    const path = join(outDir, `prompt-${String(index + 1).padStart(2, "0")}-repeat-${repeat + 1}.png`);
    await downloadImage(image, path);
    results.push({ id, promptIndex: index + 1, repeat: repeat + 1, direction: candidates[index], seed: nodes.sampler.inputs.seed, promptId: queued.prompt_id, path, image });
    console.log(`${id} complete: ${path}`);
  }
}
await writeFile(join(outDir, "manifest.json"), JSON.stringify({ baseUrl, sourceWorkflowPromptId: source.prompt[1], invariant, negative, candidates, results }, null, 2));
console.log(`BENCHMARK_DIR=${outDir}`);
