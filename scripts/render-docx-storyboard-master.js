#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { renderRemotion } from "../src/adapters/remotion.js";
import { importDocxStoryboardV2 } from "../packages/storyboard/dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const NAS_ROOT = "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ ";
const DOCX_FILE = path.join(NAS_ROOT, "SB-รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ .docx");
const C7723 = path.join(NAS_ROOT, "C7723.MP4");
const C7724 = path.join(NAS_ROOT, "C7724.MP4");
const INS_DIR = path.join(NAS_ROOT, "Ins");

const CACHE_DIR = path.join(projectRoot, ".ava-cache", "docx-kewalin-master");
const OUTPUT_DIR = path.join(projectRoot, "outputs", "rendered");

function runFfmpeg(args, desc) {
  const res = spawnSync("ffmpeg", ["-y", ...args], { stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error(`FFmpeg step failed: ${desc}`);
  }
}

function trimNasClip(src, startSec, durSec, outName, lowerThird = null) {
  const outPath = path.join(CACHE_DIR, outName);
  console.log(`   ✂️ Trimming: ${path.basename(src)} [${startSec}s -> +${durSec}s] -> ${outName}`);
  let vf = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p";
  if (lowerThird) {
    const { name, title, startT = 1.0, endT = 7.0 } = lowerThird;
    vf += `,drawbox=enable='between(t\\,${startT}\\,${endT})':x=80:y=ih-170:w=760:h=110:color=#0B1220@0.88:t=fill`;
    vf += `,drawbox=enable='between(t\\,${startT}\\,${endT})':x=80:y=ih-170:w=6:h=110:color=#E5A93C:t=fill`;
    vf += `,drawtext=enable='between(t\\,${startT}\\,${endT})':fontfile='/Library/Fonts/PSU-Stidti-Bold.otf':text='${name}':fontcolor=#FFFFFF:fontsize=36:x=106:y=h-152`;
    vf += `,drawtext=enable='between(t\\,${startT}\\,${endT})':fontfile='/Library/Fonts/PSU-Stidti-Bold.otf':text='${title}':fontcolor=#00E5FF:fontsize=22:x=106:y=h-104`;
  }
  runFfmpeg([
    "-ss", String(startSec),
    "-i", src,
    "-t", String(durSec),
    "-vf", vf,
    "-r", "25",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
    outPath
  ], `Trim ${outName}`);
  return outPath;
}

async function main() {
  console.log("==========================================================================================");
  console.log("🎬 MIDNIGHT SHORTS STUDIO — STORYBOARD-DRIVEN FULL DOCX PRODUCTION MASTER");
  console.log("==========================================================================================\n");

  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log(`📖 [1/5] Reading & Parsing Real Storyboard DOCX from NAS:\n   ${DOCX_FILE}\n`);
  const parsedDocx = await importDocxStoryboardV2(DOCX_FILE);
  console.log(`✓ Parsed ${parsedDocx.rawRows.length} Storyboard Rows with ${parsedDocx.proposals.length} Editorial Proposals\n`);

  console.log("🎥 [2/5] Trimming Real A-Roll Interviews & B-Rolls from NAS according to DOCX Timecodes...");
  // 1. Hook (DOCX Row 2: C7724 03:04 - 03:14) -> 10s
  const c01_hook = trimNasClip(C7724, 3 * 60 + 4, 10.0, "01_real_hook.mp4");
  
  // 2. Intro Profile (DOCX Row 3: C7723 00:11 - 00:28) -> 17s
  const c02_intro = trimNasClip(C7723, 11.0, 17.0, "02_real_intro.mp4", {
    name: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
    title: "อาจารย์ตัวอย่างดีเด่น คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์"
  });
  
  // 3. Harvard & Experience (DOCX Row 5: C7723 00:43 - 01:59) -> 76s
  const c04_harvard = trimNasClip(C7723, 43.0, 76.0, "04_real_harvard.mp4", {
    name: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
    title: "อาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙ • คณะทันตแพทยศาสตร์ ม.อ."
  });
  
  // 4. Mentorship (C7724 00:25 - 00:50) -> 25s
  const c06_mentor = trimNasClip(C7724, 25.0, 25.0, "06_real_mentor.mp4");
  
  // 5. 3D Teeth Innovation (C7724 03:51 - 04:35) -> 44s
  const c08_teeth3d = trimNasClip(C7724, 3 * 60 + 51, 44.0, "08_real_teeth3d.mp4", {
    name: "นวัตกรรมการสอน: ชิ้นฟันจำลอง 3 มิติ (3D Printing)",
    title: "Active Learning & Digital Dental Innovation"
  });

  // 6. Award Speech (DOCX Row 7: C7724 05:41 - 06:40) -> 59s
  const c10_award = trimNasClip(C7724, 5 * 60 + 41, 59.0, "10_real_award.mp4", {
    name: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
    title: "ความรู้สึกต่อรางวัลอาจารย์ตัวอย่างดีเด่น มหาวิทยาลัยสงขลานครินทร์"
  });

  // 7. Real B-Roll Videos from NAS /Ins
  const b01_mentor = trimNasClip(path.join(INS_DIR, "C7742.MP4"), 2.0, 14.0, "05_broll_mentor.mp4");
  const b02_lab3d = trimNasClip(path.join(INS_DIR, "C7740.MP4"), 2.0, 16.0, "07_broll_lab3d.mp4");
  const b03_clinic = trimNasClip(path.join(INS_DIR, "C7748.MP4"), 2.0, 12.0, "09_broll_clinic.mp4");

  console.log("\n🎨 [3/5] Generating Remotion Motion Graphics Cards (Bumper, AR Cover, Climax Quote, Outro)...");

  const renderContext = {
    configDir: projectRoot,
    runDir: projectRoot,
    resolvePath: (p) => path.resolve(projectRoot, p),
    resolveRunPath: (p) => path.resolve(projectRoot, p),
    dryRun: false,
    log: (msg) => console.log(`[RemotionEngine] ${msg}`),
    step: { id: "remotion_cards_render", type: "remotion.render" }
  };

  // 1. Remotion AR Cover Card (6s = 150 frames)
  const coverMp4 = path.join(CACHE_DIR, "03_remotion_cover_card.mp4");
  await renderRemotion({
    composition: "HorizontalComposition",
    output: coverMp4,
    fps: 25,
    durationInFrames: 150,
    props: {
      items: [
        {
          id: "card_cover",
          kind: "cover_card",
          title: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
          personName: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
          subtitle: "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์",
          positionTitle: "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์",
          eyebrow: "✦ อาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙ ✦",
          award: "✦ อาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙ ✦",
          durationMs: 6000,
          motionPreset: "ZoomPunch",
          params: {
            title: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
            personName: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
            subtitle: "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์",
            positionTitle: "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์",
            eyebrow: "✦ อาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙ ✦",
            award: "✦ อาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙ ✦"
          }
        }
      ],
      aspectRatio: "16:9"
    }
  }, renderContext);

  // 2. Remotion Climax Quote Card (6s = 150 frames)
  const quoteMp4 = path.join(CACHE_DIR, "11_remotion_quote_card.mp4");
  await renderRemotion({
    composition: "HorizontalComposition",
    output: quoteMp4,
    fps: 25,
    durationInFrames: 150,
    props: {
      items: [
        {
          id: "card_quote",
          kind: "cover_card",
          title: "“ความภูมิใจที่สุดคือการได้เห็นลูกศิษย์เติบโต”",
          subtitle: "และนำหลักคิดไปใช้เพื่อประโยชน์ของเพื่อนมนุษย์",
          eyebrow: "CLIMAX MOTTO — จิตวิญญาณแห่งความเป็นครู",
          durationMs: 6000,
          motionPreset: "Pop"
        }
      ],
      aspectRatio: "16:9"
    }
  }, renderContext);

  // 3. Remotion Logo Outro (4s = 100 frames)
  const outroMp4 = path.join(CACHE_DIR, "12_remotion_logo_outro.mp4");
  await renderRemotion({
    composition: "HorizontalComposition",
    output: outroMp4,
    fps: 25,
    durationInFrames: 100,
    props: {
      items: [
        {
          id: "card_outro",
          kind: "logo_outro",
          channelName: "PSU BROADCAST",
          tagline: "มหาวิทยาลัยสงขลานครินทร์ • เพื่อประโยชน์ของเพื่อนมนุษย์เป็นกิจที่หนึ่ง",
          durationMs: 4000
        }
      ],
      aspectRatio: "16:9"
    }
  }, renderContext);

  console.log("\n🎞️ [4/5] Assembling Full DOCX Storyboard Sequence (A-Roll + B-Roll + Motion Graphics)...");

  const fullTimelineClips = [
    c01_hook,       // Act 1: Hook Quote (10s)
    c02_intro,      // Act 2: A-Roll Intro (17s)
    coverMp4,       // Act 3: Remotion AR Cover Card (6s)
    c04_harvard,    // Act 4: Harvard Interview (76s)
    b01_mentor,     // B-Roll Mentoring Video (/Ins) (14s)
    c06_mentor,     // Interview Mentorship (25s)
    b02_lab3d,      // B-Roll 3D Dental Lab (/Ins) (16s)
    c08_teeth3d,    // Interview 3D Teeth (44s)
    b03_clinic,     // B-Roll Clinical Care (/Ins) (12s)
    c10_award,      // Interview Award Speech (59s)
    quoteMp4,       // Act 5: Remotion Climax Quote Card (6s)
    outroMp4        // Act 6: Remotion Logo Outro (4s)
  ];

  const targetMasterMp4 = path.join(OUTPUT_DIR, "documentary-kewalin-69-full-storyboard-master.mp4");
  console.log(`\n🚀 [5/5] Encoding Final Master MP4 Video:\n   ${targetMasterMp4}\n`);

  const inputArgs = [];
  const filterInputs = [];
  fullTimelineClips.forEach((clip, idx) => {
    inputArgs.push("-i", clip);
    filterInputs.push(`[${idx}:v][${idx}:a]`);
  });

  const filterComplex = `${filterInputs.join("")}concat=n=${fullTimelineClips.length}:v=1:a=1[outv][outa]`;

  runFfmpeg([
    ...inputArgs,
    "-filter_complex", filterComplex,
    "-map", "[outv]",
    "-map", "[outa]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
    targetMasterMp4
  ], "Master Video Concatenation");

  const statInfo = await stat(targetMasterMp4);
  console.log("\n==========================================================================================");
  console.log("🏆 100% REAL FULL DOCX STORYBOARD MASTER RENDERED SUCCESSFULLY!");
  console.log("==========================================================================================");
  console.log(`📁 Target Master: ${targetMasterMp4}`);
  console.log(`📦 Size: ${(statInfo.size / (1024 * 1024)).toFixed(2)} MB (${statInfo.size.toLocaleString()} bytes)`);
  console.log("🎬 Total Sequence: 12 Narrative Acts (Real A-Roll + B-Roll + Remotion Graphics)");
}

main().catch((err) => {
  console.error("❌ Execution error:", err);
  process.exit(1);
});
