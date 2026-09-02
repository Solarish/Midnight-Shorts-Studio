import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const baseUrl = process.env.COMFY_URL || "http://10.135.66.70:8188";
const root = process.cwd();
const outDir = join(root, "prototype-runs", `doodle-prompt-benchmark-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const prompts = [
  "small hand-drawn academic icons, tiny books, stars, sparkles and scientific symbols",
  "small friendly dental science doodles, tiny tooth icons, bubbles, stars and curved arrows",
  "small playful campus objects, tiny buildings, leaves, pencils and sparkles",
  "small editorial marker illustrations, flowers, stars, arrows and abstract accent shapes",
  "small clean scientific sketches, microscope, atom, tooth and book icons",
  "small whimsical hand-drawn stickers, hearts, stars, clouds and simple objects",
  "small geometric line and filled-shape accents, circles, arcs, dots and stars",
  "small celebration doodles, ribbons, confetti, stars and hand-drawn badges",
  "small modern education symbols, graduation cap, book, light bulb and sparkles",
  "small mixed academic and dental illustration accents with varied scale"
];
const invariant = "A decorative overlay asset for a documentary video, multiple small illustration elements distributed around the outer edges and corners, open center area for a person and typography, varied scale with balanced spacing, clear recognizable filled shapes with crisp hand-drawn marker texture, white artwork on a pure black matte, playful editorial broadcast illustration, high contrast, clean silhouettes, crisp details";

async function json(url, options) { const response = await fetch(url, options); if (!response.ok) throw new Error(`${response.status} ${await response.text()}`); return response.json(); }
async function waitFor(id) { for (;;) { const history = await json(`${baseUrl}/history/${id}`); const item = history[id]; if (item?.status?.completed || item?.status?.status_str === "error") return item; await new Promise((resolve) => setTimeout(resolve, 1200)); } }
async function download(image, target) { const url = `${baseUrl}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder || "")}&type=${encodeURIComponent(image.type || "output")}`; const response = await fetch(url); if (!response.ok) throw new Error(`download ${response.status}`); await writeFile(target, Buffer.from(await response.arrayBuffer())); }

await mkdir(outDir, { recursive: true });
const workflow = JSON.parse(await readFile(join(root, "workflows/generate-cover-doodle-zimage.api.json"), "utf8"));
const nodes = Object.values(workflow);
const sampler = nodes.find((node) => node.class_type === "KSampler");
const positive = workflow[sampler.inputs.positive[0]];
const negative = workflow[sampler.inputs.negative[0]];
const latent = nodes.find((node) => node.class_type === "EmptyLatentImage");
const save = nodes.find((node) => node.class_type === "SaveImage");
latent.inputs.width = 768; latent.inputs.height = 432; sampler.inputs.steps = 8; sampler.inputs.sampler_name = "euler"; sampler.inputs.scheduler = "simple"; negative.inputs.text = "";
const results = [];
for (let index = 0; index < prompts.length; index += 1) {
  for (let repeat = 0; repeat < 2; repeat += 1) {
    const id = `${String(index + 1).padStart(2, "0")}-${repeat + 1}`;
    positive.inputs.text = `${invariant}, ${prompts[index]}.`;
    sampler.inputs.seed = Math.floor(Math.random() * 2147483646) + 1;
    save.inputs.filename_prefix = `ava_benchmark/doodle_${id}`;
    const queued = await json(`${baseUrl}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: workflow, client_id: "psu-ava-doodle-prompt-benchmark" }) });
    const item = await waitFor(queued.prompt_id); if (item.status?.status_str === "error") throw new Error(JSON.stringify(item.status.messages));
    const image = Object.values(item.outputs || {}).flatMap((output) => output.images || [])[0]; if (!image) throw new Error(`No image output for ${id}`);
    const path = join(outDir, `${id}.png`); await download(image, path); results.push({ id, promptIndex: index + 1, repeat: repeat + 1, prompt: positive.inputs.text, seed: sampler.inputs.seed, promptId: queued.prompt_id, path, image }); console.log(`${id} complete`);
  }
}
await writeFile(join(outDir, "manifest.json"), JSON.stringify({ baseUrl, resolution: "768x432", steps: 8, sampler: "euler", scheduler: "simple", invariant, prompts, results }, null, 2));
console.log(`DOODLE_BENCHMARK_DIR=${outDir}`);
