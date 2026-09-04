import { readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { importDocxStoryboardV2, generateAutoBrollForStoryboard } from "../packages/storyboard/src/index.ts";

const execFileAsync = promisify(execFile);

async function main() {
  const docx = "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ /SB-รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ .docx";
  const parentDir = path.dirname(docx);
  const insDir = path.join(parentDir, "Ins");
  const outputDir = path.resolve("./eval_vision_shots");

  const imported = await importDocxStoryboardV2(docx);
  const aRolls = imported.proposals.filter(p => p.item.kind === "a_roll");

  // Read B-roll files from Ins
  const entries = await readdir(insDir, { withFileTypes: true });
  const candidates = entries
    .filter(e => e.isFile() && /\.(mp4|mov|mxf|avi|jpe?g|png|webp)$/i.test(e.name))
    .map(e => ({
      path: path.join(insDir, e.name),
      name: e.name,
      stem: e.name.replace(/\.[^/.]+$/, "")
    }));

  console.log(`Found ${aRolls.length} A-roll segments and ${candidates.length} B-roll candidates.`);
  console.log("Running batch Auto B-Roll with Global Timeline Cooldown & Diversity...");

  const batchResult = await generateAutoBrollForStoryboard(aRolls.map(p => p.item), candidates);
  console.log(`Assigned ${batchResult.totalBrollsAssigned} B-rolls across ${batchResult.uniqueClipsUsed} unique clips!`);

  const evalManifest: any[] = [];

  for (let idx = 0; idx < batchResult.items.length; idx++) {
    const shotNum = idx + 1;
    const item = batchResult.items[idx]!;
    const sourceKey = String(item.params?.sourceKey || "C7724");
    const aRollVideoPath = path.join(parentDir, `${sourceKey}.MP4`);
    const inMs = Number(item.params?.sourceInMs || 0);
    const dialogue = String(item.params?.dialogue || item.params?.sound || "");
    const brollList = item.broll ?? [];

    console.log(`Extracting frames for Shot ${shotNum} (${brollList.length} B-rolls: ${brollList.map(b => path.basename(b.asset.path)).join(", ")})...`);

    // 2. Extract A-roll frame
    const aRollFrameName = `shot_${String(shotNum).padStart(2, "0")}_aroll.jpg`;
    const aRollFramePath = path.join(outputDir, aRollFrameName);
    const aRollSec = Math.max(0, (inMs + 1500) / 1000);
    try {
      await execFileAsync("ffmpeg", [
        "-y", "-ss", String(aRollSec),
        "-i", aRollVideoPath,
        "-vframes", "1",
        "-vf", "scale=960:540",
        "-q:v", "3",
        aRollFramePath
      ]);
    } catch (e: any) {
      console.warn(`Failed extracting A-roll frame for shot ${shotNum}: ${e.message}`);
    }

    // 3. Extract B-roll frames for matched clips
    const brollFrames: Array<{ brollId: string; assetPath: string; framePath: string; offsetMs: number; durationMs: number }> = [];
    for (let bIdx = 0; bIdx < brollList.length; bIdx++) {
      const b = brollList[bIdx]!;
      const brollFrameName = `shot_${String(shotNum).padStart(2, "0")}_broll_${bIdx + 1}.jpg`;
      const brollFramePath = path.join(outputDir, brollFrameName);
      try {
        await execFileAsync("ffmpeg", [
          "-y", "-ss", "00:00:02",
          "-i", b.asset.path,
          "-vframes", "1",
          "-vf", "scale=960:540",
          "-q:v", "3",
          brollFramePath
        ]);
        brollFrames.push({
          brollId: b.id,
          assetPath: b.asset.path,
          framePath: brollFramePath,
          offsetMs: b.offsetMs,
          durationMs: b.durationMs
        });
      } catch (e: any) {
        console.warn(`Failed extracting B-roll frame: ${e.message}`);
      }
    }

    evalManifest.push({
      shotIndex: shotNum,
      id: item.id,
      sourceKey,
      dialogue,
      durationMs: item.durationMs,
      aRollFrame: aRollFramePath,
      brollCount: brollList.length,
      brolls: brollFrames
    });
  }

  const manifestPath = path.join(outputDir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(evalManifest, null, 2), "utf8");
  console.log(`\nEval preparation complete! Manifest written to: ${manifestPath}`);
}

main().catch(err => {
  console.error("Error in prepare-vision-eval:", err);
  process.exit(1);
});
