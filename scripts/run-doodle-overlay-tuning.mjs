import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const baseUrl = process.env.COMFY_URL || "http://10.135.66.70:8188";
const outDir = join(process.cwd(), "prototype-runs", `doodle-overlay-tuning-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const variants = [
  "small isolated academic sticker icons around the outer edges, tiny books stars pencils and sparkles",
  "small isolated dental science sticker icons around the outer edges, tiny teeth bubbles stars and arrows",
  "small hand-drawn flowers stars leaves and arrows arranged as corner accents",
  "small mixed education icons in a sparse edge ring, varied scale and balanced spacing",
  "small white marker doodle accents on the corners and side edges, simple filled shapes",
  "small playful illustration stickers distributed around the border, clean recognizable objects"
];
const invariant = "decorative overlay asset for a documentary video, thumbnail-sized isolated objects, a handful of accents around the outer edges and corners, generous spacing, a large calm open center field for compositing, white artwork on a solid black canvas, clear filled shapes, crisp hand-drawn marker texture, high contrast, clean silhouettes, editorial broadcast illustration";
async function json(url, options) { const r = await fetch(url, options); if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); }
async function waitFor(id) { for (;;) { const h = await json(`${baseUrl}/history/${id}`); const v = h[id]; if (v?.status?.completed || v?.status?.status_str === "error") return v; await new Promise((resolve) => setTimeout(resolve, 1000)); } }
async function download(image, target) { const r = await fetch(`${baseUrl}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder || "")}&type=output`); await writeFile(target, Buffer.from(await r.arrayBuffer())); }
await mkdir(outDir, { recursive: true });
const workflow = JSON.parse(await readFile(join(process.cwd(), "workflows/generate-cover-doodle-zimage.api.json"), "utf8")); const nodes = Object.values(workflow); const sampler = nodes.find((n) => n.class_type === "KSampler"); const positive = workflow[sampler.inputs.positive[0]]; const negative = workflow[sampler.inputs.negative[0]]; const latent = nodes.find((n) => n.class_type === "EmptyLatentImage"); const save = nodes.find((n) => n.class_type === "SaveImage");
latent.inputs.width = 768; latent.inputs.height = 432; sampler.inputs.steps = 8; sampler.inputs.sampler_name = "euler"; sampler.inputs.scheduler = "simple"; negative.inputs.text = "";
const results = [];
for (let i = 0; i < variants.length; i += 1) for (let repeat = 1; repeat <= 2; repeat += 1) { const id = `${String(i + 1).padStart(2, "0")}-${repeat}`; positive.inputs.text = `${invariant}, ${variants[i]}.`; sampler.inputs.seed = Math.floor(Math.random() * 2147483646) + 1; save.inputs.filename_prefix = `ava_benchmark/doodle_overlay_${id}`; const q = await json(`${baseUrl}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: workflow, client_id: "psu-ava-doodle-overlay-tuning" }) }); const h = await waitFor(q.prompt_id); if (h.status?.status_str === "error") throw new Error(JSON.stringify(h.status.messages)); const image = Object.values(h.outputs || {}).flatMap((o) => o.images || [])[0]; const path = join(outDir, `${id}.png`); await download(image, path); results.push({ id, prompt: positive.inputs.text, seed: sampler.inputs.seed, promptId: q.prompt_id, path, image }); console.log(`${id} complete`); }
await writeFile(join(outDir, "manifest.json"), JSON.stringify({ baseUrl, resolution: "768x432", steps: 8, sampler: "euler", scheduler: "simple", invariant, variants, results }, null, 2)); console.log(`DOODLE_OVERLAY_TUNING_DIR=${outDir}`);
