import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
const baseUrl = process.env.COMFY_URL || "http://10.135.66.70:8188";
const outDir = join(process.cwd(), "prototype-runs", `cover-bg-hd-tuning-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const direction = "professional university broadcast studio environment, deep navy acoustic panels, warm gold practical lights";
const positive = `Empty realistic elegant university and dental-science documentary environment; PSU-inspired deep navy, warm gold, and subtle teal ambient documentary lighting; sharp focus across the full architectural scene, no bokeh, no shallow depth of field, no blur; clean cinematic negative space on the left for title overlay; high resolution professional photography, crisp fine details, absolutely no people, no human silhouettes, no rendered text. User style direction: ${direction}.`;
const negative = "people, person, human, face, body, silhouette, text, typography, letters, glyphs, signage, fake signage, logo, watermark, signature, readable marks, blurry, low quality, noisy, distorted architecture, cluttered foreground";
const variants = [
  ["euler-ancestral-karras", "euler_ancestral", "karras", 42], ["euler-ancestral-karras", "euler_ancestral", "karras", 314159],
  ["euler-karras", "euler", "karras", 42], ["euler-karras", "euler", "karras", 314159],
  ["euler-simple", "euler", "simple", 42], ["euler-simple", "euler", "simple", 314159]
];
async function json(url, options) { const r = await fetch(url, options); if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); }
async function waitFor(id) { for (;;) { const h = await json(`${baseUrl}/history/${id}`); const item = h[id]; if (item?.status?.completed || item?.status?.status_str === "error") return item; await new Promise((resolve) => setTimeout(resolve, 1200)); } }
async function download(image, target) { const url = `${baseUrl}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder || "")}&type=output`; const r = await fetch(url); if (!r.ok) throw new Error(`download ${r.status}`); await writeFile(target, Buffer.from(await r.arrayBuffer())); }
await mkdir(outDir, { recursive: true });
const history = await json(`${baseUrl}/history`);
const source = Object.values(history).filter((item) => { const graph = item.prompt?.[2] || {}; const values = Object.values(graph); return values.some((n) => n.class_type === "UNETLoader" && n.inputs?.unet_name === "z_image_turbo_bf16.safetensors") && values.some((n) => n.class_type === "SaveImage" && String(n.inputs?.filename_prefix || "").includes("ava_storyboard/cover_background")) && values.some((n) => n.class_type === "CLIPTextEncode" && String(n.inputs?.text || "").includes("Empty realistic elegant")); }).sort((a, b) => Number(b.prompt?.[3]?.create_time || 0) - Number(a.prompt?.[3]?.create_time || 0))[0];
if (!source) throw new Error("No Debian Cover Background Z-Image workflow found");
const workflow = structuredClone(source.prompt[2]);
const entries = Object.values(workflow);
const sampler = entries.find((n) => n.class_type === "KSampler" || n.class_type === "KSamplerAdvanced");
const positiveNode = workflow[sampler.inputs.positive[0]]; const negativeNode = workflow[sampler.inputs.negative[0]];
const latent = entries.find((n) => n.class_type === "EmptyLatentImage"); const save = entries.find((n) => n.class_type === "SaveImage");
// Debian Z-Image history uses 1344x768 as its practical 16:9 generation size.
// Keep the final compositor responsible for 1920x1080 delivery scaling.
latent.inputs.width = 1344; latent.inputs.height = 768;
const results = [];
for (const [label, samplerName, scheduler, seed] of variants) {
  positiveNode.inputs.text = positive; negativeNode.inputs.text = negative; sampler.inputs.sampler_name = samplerName; sampler.inputs.scheduler = scheduler; sampler.inputs.seed = seed; save.inputs.filename_prefix = `ava_benchmark/cover_bg_hd_${label}_${seed}`;
  const queued = await json(`${baseUrl}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: workflow, client_id: "psu-ava-cover-hd-tuning" }) });
  const item = await waitFor(queued.prompt_id); if (item.status?.status_str === "error") throw new Error(JSON.stringify(item.status.messages));
  const image = Object.values(item.outputs || {}).flatMap((out) => out.images || [])[0]; if (!image) throw new Error(`No image for ${label}-${seed}`);
  const safe = `${label}-${seed}`; const path = join(outDir, `${safe}.png`); await download(image, path); results.push({ label, sampler: samplerName, scheduler, seed, promptId: queued.prompt_id, path, image }); console.log(`${safe} complete`);
}
await writeFile(join(outDir, "manifest.json"), JSON.stringify({ sourceWorkflowPromptId: source.prompt[1], resolution: "1344x768", deliveryResolution: "1920x1080", steps: sampler.inputs.steps, positive, negative, results }, null, 2));
console.log(`TUNING_DIR=${outDir}`);
