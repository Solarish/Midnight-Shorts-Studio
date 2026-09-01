#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedEditableMogrt } from "../src/adapters/mogrt.js";
import { buildPremiere } from "../src/adapters/premiere.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runLabel = process.argv[2] ?? "v3";
if (!/^[a-z0-9-]+$/i.test(runLabel)) throw new Error("Smoke run label may contain only letters, numbers, and hyphens");
const outputRoot = path.join(repoRoot, "outputs", "smoke", `cover-v2-seeded-live-${runLabel}`);
const templatePool = [1, 2].map((slot) => path.join(repoRoot, "templates", "premiere", "pool", `psu-cover-text-slot-${String(slot).padStart(2, "0")}.mogrt`));
const backgroundPath = path.join(repoRoot, "outputs", "smoke", "cover-v2-seeded-live", "background.mov");
const parameterMap = { personName: "PERSON_NAME", positionTitle: "POSITION_TITLE", award: "AWARD" };
const cards = [
  {
    id: "cover_3",
    startMs: 0,
    text: {
      personName: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
      positionTitle: "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์",
      award: "อาจารย์ตัวอย่างดีเด่นด้านการเรียนการสอน ประจำปี 2569"
    }
  },
  {
    id: "cover_5",
    startMs: 6000,
    text: {
      personName: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
      positionTitle: "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์",
      award: "อาจารย์ตัวอย่างดีเด่น มหาวิทยาลัยสงขลานครินทร์ ปี 2569"
    }
  }
];

await mkdir(outputRoot, { recursive: true });
const graphics = [];
for (const [cardIndex, card] of cards.entries()) {
  const templatePath = templatePool[cardIndex];
  const mogrtPath = path.join(outputRoot, "media", card.id, `${card.id}-editable-text.mogrt`);
  const seedReceipt = await seedEditableMogrt({ templatePath, outputPath: mogrtPath, text: card.text, parameterMap });
  graphics.push({
    id: `${card.id}_text_v4`,
    mogrtPath,
    startMs: card.startMs,
    durationMs: 6000,
    track: 4,
    text: card.text,
    parameterMap,
    bindingMode: "preseeded",
    seedReceipt,
    audioPolicy: "mute",
    storyboardItemId: card.id,
    editorialKind: "cover_card"
  });
}

const context = {
  configDir: repoRoot,
  runDir: repoRoot,
  stepDir: outputRoot,
  step: { id: `cover_v2_preseeded_smoke_${runLabel}`, type: "premiere.build" },
  settings: {
    adobe: {
      premiere: {
        bridgeHost: "127.0.0.1",
        bridgePort: 47652,
        bridgeMailbox: "/tmp/psu-ava-premiere-bridge",
        launch: false,
        exportPresets: { h264: path.join(repoRoot, "presets", "h264.epr") }
      }
    }
  },
  timeoutMs: 300_000,
  dryRun: false,
  resolvePath: (value) => path.resolve(repoRoot, value),
  resolveRunPath: (value) => path.resolve(repoRoot, value),
  log: (message) => process.stderr.write(`${message}\n`)
};

const result = await buildPremiere({
  outputProject: path.join(outputRoot, `cover-v2-preseeded-live-${runLabel}.prproj`),
  sequenceName: `COVER_V2_PRESEEDED_SMOKE_${runLabel.toUpperCase()}`,
  sequencePresetPath: path.join(repoRoot, "presets", "sequence", "psu-ava-hd-1080p-25-8v4a.sqpreset"),
  timelineSpec: {
    schemaVersion: 1,
    name: `COVER_V2_PRESEEDED_SMOKE_${runLabel.toUpperCase()}`,
    width: 1920,
    height: 1080,
    frameRate: 25,
    durationMs: 12000,
    scenes: [{ id: "background", source: backgroundPath, startMs: 0, sourceInMs: 0, durationMs: 12000, track: 1, audio: false, audioPolicy: "mute" }],
    overlays: [],
    graphics,
    dynamicLinks: [],
    audio: [],
    transitions: []
  },
  exports: [{ format: "h264", output: path.join(outputRoot, `cover-v2-preseeded-live-${runLabel}.mp4`) }],
  save: true
}, context);

const receiptPath = path.join(outputRoot, "receipt.json");
await writeFile(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ receiptPath, project: result.project, sequenceGuid: result.sequenceGuid, graphics: result.graphics, exports: result.exports }, null, 2)}\n`);
