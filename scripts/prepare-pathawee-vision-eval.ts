import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

async function main() {
  const outputDir = path.resolve("./eval_vision_pathawee");
  await mkdir(outputDir, { recursive: true });

  const sbRes = await fetch("http://localhost:47650/api/v1/storyboards/storyboard_mtl6j9uh_bb96b748");
  if (!sbRes.ok) throw new Error(`Failed to fetch storyboard: ${sbRes.statusText}`);
  const sb = (await sbRes.json()) as any;

  console.log(`Loaded Storyboard "${sb.name}" (Revision ${sb.revision}) with ${sb.items.length} items.`);

  const evalManifest: any = {
    storyboardId: sb.storyboardId,
    name: sb.name,
    revision: sb.revision,
    coverCard: null,
    shots: []
  };

  // 1. Render Real Cover Card Frame with PSU Stidti Font
  const coverItem = sb.items.find((i: any) => i.kind === "cover_card");
  if (coverItem) {
    console.log("Rendering Cover Card frame with PSU Stidti font...");
    const coverOutputPath = path.join(outputDir, "cover_card.jpg");
    const photoPath = coverItem.params?.sourceImage;
    const name = coverItem.params?.personName || "ดร.ปฐวี อินทร์สุวรรณโณ";
    const position = coverItem.params?.positionTitle || "คณะการบริการและการท่องเที่ยว มหาวิทยาลัยสงขลานครินทร์";
    const award = coverItem.params?.award || "อาจารย์ตัวอย่างดีเด่นด้านการเรียนการสอน สาขามนุษยศาสตร์และสังคมศาสตร์ มหาวิทยาลัยสงขลานครินทร์ ปี 2569";

    // Build FFmpeg filter graph to render professional broadcast cover card
    // Background: deep navy #0B1220 with dark vignette
    // Right: Photo frame with gold border
    // Left: Drawtext with PSU Stidti font
    const fontBold = "/Library/Fonts/PSU-Stidti-Bold.otf";
    const fontRegular = "/Library/Fonts/PSU-Stidti-Regular.otf";

    const filterComplex = [
      `color=c=#0B1220:s=1920x1080:d=1[bg]`,
      `[1:v]scale=520:760:force_original_aspect_ratio=increase,crop=520:760,drawbox=x=0:y=0:w=520:h=760:color=#E5A93C@0.8:t=4[photo]`,
      `[bg][photo]overlay=x=1240:y=160[comp]`,
      `[comp]drawtext=fontfile='${fontRegular}':text='${award}':fontcolor=#E5A93C:fontsize=22:x=120:y=720:shadowcolor=black@0.8:shadowx=2:shadowy=2[t1]`,
      `[t1]drawtext=fontfile='${fontBold}':text='${name}':fontcolor=#FFFFFF:fontsize=56:x=120:y=770:shadowcolor=black@0.9:shadowx=3:shadowy=3[t2]`,
      `[t2]drawtext=fontfile='${fontBold}':text='${position}':fontcolor=#00E5FF:fontsize=28:x=120:y=850:shadowcolor=black@0.8:shadowx=2:shadowy=2`
    ].join(";");

    try {
      await execFileAsync("ffmpeg", [
        "-y",
        "-f", "lavfi", "-i", "color=c=#0B1220:s=1920x1080",
        "-i", photoPath,
        "-filter_complex", filterComplex,
        "-vframes", "1",
        "-q:v", "2",
        coverOutputPath
      ]);
      evalManifest.coverCard = {
        framePath: coverOutputPath,
        name,
        position,
        award,
        photoPath,
        font: "PSU Stidti"
      };
      console.log(`✓ Cover Card frame rendered to ${coverOutputPath}`);
    } catch (e: any) {
      console.error(`Failed rendering cover card: ${e.message}`);
    }
  }

  // 2. Extract A-Roll and B-Roll Frames for all interview segments
  const aRollItems = sb.items.filter((i: any) => i.kind === "a_roll");
  console.log(`Processing ${aRollItems.length} A-Roll shots...`);

  for (let idx = 0; idx < aRollItems.length; idx++) {
    const item = aRollItems[idx]!;
    const shotNum = idx + 1;
    const dialogue = String(item.params?.dialogue || item.params?.sound || "");
    const sourceKey = String(item.params?.sourceKey || "");
    const inMs = Number(item.params?.sourceInMs || 0);
    const brollList = item.broll ?? [];

    console.log(`Processing Shot ${shotNum} (${brollList.length} B-rolls)...`);

    // A-roll source video path
    const aRollSec = Math.max(0, (inMs + 1500) / 1000);
    const aRollFrameName = `shot_${String(shotNum).padStart(2, "0")}_aroll.jpg`;
    const aRollFramePath = path.join(outputDir, aRollFrameName);

    // Look for video in Pathawee dir
    const videoFiles = [
      `/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/2.อ.ดร.ปฐวี อินทร์สุวรรณโณ /2X7A9362.MP4`,
      `/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/2.อ.ดร.ปฐวี อินทร์สุวรรณโณ /2X7A9363.MP4`
    ];
    const aRollVideoPath = sourceKey.includes("9363") ? videoFiles[1] : videoFiles[0];

    try {
      await execFileAsync("ffmpeg", [
        "-y", "-ss", String(aRollSec),
        "-i", aRollVideoPath!,
        "-vframes", "1",
        "-vf", "scale=960:540",
        "-q:v", "3",
        aRollFramePath
      ]);
    } catch (e: any) {
      console.warn(`Failed extracting A-roll for shot ${shotNum}: ${e.message}`);
    }

    // B-rolls
    const brollFrames: any[] = [];
    for (let bIdx = 0; bIdx < brollList.length; bIdx++) {
      const b = brollList[bIdx]!;
      const brollFrameName = `shot_${String(shotNum).padStart(2, "0")}_broll_${bIdx + 1}.jpg`;
      const brollFramePath = path.join(outputDir, brollFrameName);
      const isVideo = /\.(mp4|mov|mxf)$/i.test(b.asset.path);

      try {
        if (isVideo) {
          await execFileAsync("ffmpeg", [
            "-y", "-ss", "00:00:02",
            "-i", b.asset.path,
            "-vframes", "1",
            "-vf", "scale=960:540",
            "-q:v", "3",
            brollFramePath
          ]);
        } else {
          // Still photo / graphic
          await execFileAsync("ffmpeg", [
            "-y",
            "-i", b.asset.path,
            "-vf", "scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2:black",
            "-vframes", "1",
            "-q:v", "3",
            brollFramePath
          ]);
        }
        brollFrames.push({
          brollId: b.id,
          assetPath: b.asset.path,
          assetName: path.basename(b.asset.path),
          framePath: brollFramePath,
          offsetMs: b.offsetMs,
          durationMs: b.durationMs
        });
      } catch (e: any) {
        console.warn(`Failed extracting B-roll frame: ${e.message}`);
      }
    }

    evalManifest.shots.push({
      shotIndex: shotNum,
      id: item.id,
      dialogue,
      durationMs: item.durationMs,
      aRollFrame: aRollFramePath,
      brollCount: brollList.length,
      brolls: brollFrames
    });
  }

  const manifestPath = path.join(outputDir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(evalManifest, null, 2), "utf8");
  console.log(`\n🎉 All evaluation frames and manifest saved to: ${manifestPath}`);
}

main().catch(console.error);
