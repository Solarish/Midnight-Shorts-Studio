#!/usr/bin/env node
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { renderRemotion } from "../src/adapters/remotion.js";

const api = "http://127.0.0.1:47650/api/v1/storyboards/kewalin_documentary_2569";
const response = await fetch(api);
if (!response.ok) throw new Error(`Unable to load active storyboard: ${response.status}`);
const storyboard = await response.json();
const title = storyboard.items.find((item) => item.kind === "title");
if (!title) throw new Error("Active storyboard has no title item");

const output = path.resolve("outputs", "inspection", "3d-photo-carousel-reference-check.mp4");
await mkdir(path.dirname(output), { recursive: true });
const result = await renderRemotion({
  composition: "HorizontalComposition",
  output,
  fps: 30,
  durationInFrames: 760,
  concurrency: 2,
  props: {
    storyboardId: "carousel-inspection",
    items: [{
      id: title.id,
      kind: "title",
      durationMs: 25_333,
      audioPolicy: "mute",
      presetId: "3d-carousel-title-v1",
      params: title.params
    }]
  }
}, {
  resolveRunPath: (value) => path.resolve(value),
  log: console.log,
  dryRun: false
});
console.log(JSON.stringify(result, null, 2));
