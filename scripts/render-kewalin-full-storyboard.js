#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { renderRemotion } from "../src/adapters/remotion.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

async function main() {
  console.log("================================================================================");
  console.log("🎬 MIDNIGHT SHORTS STUDIO — FULL KEWALIN STORYBOARD PRODUCTION RENDER");
  console.log("================================================================================");

  const outputDir = path.join(projectRoot, "outputs", "rendered");
  await mkdir(outputDir, { recursive: true });

  const renderContext = {
    configDir: projectRoot,
    runDir: projectRoot,
    resolvePath: (p) => path.resolve(projectRoot, p),
    resolveRunPath: (p) => path.resolve(projectRoot, p),
    dryRun: false,
    log: (msg) => console.log(`[RemotionAdapter] ${msg}`),
    step: { id: "kewalin_full_storyboard_render", type: "remotion.render" }
  };

  // Full Kewalin Storyboard Props
  const kewalinStoryboardProps = {
    title: "อาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙",
    subheadline: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
    speakerName: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
    speakerRole: "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์",
    theme: {
      primaryColor: "#E5A93C", // PSU Warm Gold
      secondaryColor: "#002D62", // Deep Navy
      accentColor: "#00E5FF", // Vibrant Cyan
      textColor: "#FFFFFF",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Prompt', 'Kanit', sans-serif"
    },
    items: [
      // 1. Cover Bumper Scene
      {
        id: "scene_1_cover",
        kind: "cover_card",
        title: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
        subtitle: "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์",
        eyebrow: "✦ อาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙ ✦",
        durationMs: 4000,
        motionPreset: "ZoomPunch"
      },
      // 2. Title & Introduction
      {
        id: "scene_2_intro",
        kind: "title_card",
        speakerName: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
        speakerRole: "อาจารย์ประจำสาขาวิชาทันตกรรมบูรณะ",
        eyebrow: "HARVARD ALUMNI & 20+ YEARS EXPERIENCE",
        durationMs: 3500,
        motionPreset: "Bounce"
      },
      // 3. Teaching Philosophy & Mentorship
      {
        id: "scene_3_mentorship",
        kind: "title_card",
        speakerName: "การเรียนการสอนเชิงรุก & นวัตกรรมฟันจำลอง 3D",
        speakerRole: "Active Learning & 3D Dental Innovation",
        eyebrow: "PEDAGOGY & INNOVATION",
        durationMs: 3500,
        motionPreset: "Spring"
      },
      // 4. Climax Quote Card
      {
        id: "scene_4_climax_quote",
        kind: "cover_card",
        title: "“ความภูมิใจที่สุดคือการได้เห็นลูกศิษย์เติบโต”",
        subtitle: "และนำหลักคิดไปใช้เพื่อประโยชน์ของเพื่อนมนุษย์",
        eyebrow: "CLIMAX MOTTO — จิตวิญญาณความเป็นครู",
        durationMs: 4500,
        motionPreset: "Pop"
      },
      // 5. Official Outro
      {
        id: "scene_5_outro",
        kind: "logo_outro",
        channelName: "PSU BROADCAST",
        tagline: "มหาวิทยาลัยสงขลานครินทร์ • เพื่อประโยชน์ของเพื่อนมนุษย์เป็นกิจที่หนึ่ง",
        durationMs: 2500,
        motionPreset: "Spring"
      }
    ],
    brollStack: [
      {
        id: "broll_dental_lab",
        title: "3D Dental Simulation Lab",
        description: "นวัตกรรมฟันจำลองและอุปกรณ์แล็บทันตกรรมดิจิทัล",
        startMs: 2500,
        durationMs: 3000,
        motionPreset: "Spring"
      },
      {
        id: "broll_student_care",
        title: "Clinical Patient Mentoring",
        description: "การให้คำปรึกษาและดูแลคนไข้จริงในคลินิกทันตกรรม",
        startMs: 7000,
        durationMs: 3500,
        motionPreset: "Bounce"
      }
    ],
    subtitles: [
      {
        id: "sub_1",
        startMs: 400,
        endMs: 3600,
        text: "มหาวิทยาลัยสงขลานครินทร์ ขอเชิดชูเกียรติ อาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙",
        words: [
          { text: "ม.สงขลานครินทร์", startMs: 400, endMs: 1000 },
          { text: "ขอเชิดชูเกียรติ", startMs: 1050, endMs: 1800 },
          { text: "อาจารย์ตัวอย่างดีเด่น", startMs: 1850, endMs: 2700 },
          { text: "ประจำปี ๒๕๖๙", startMs: 2750, endMs: 3600 }
        ]
      },
      {
        id: "sub_2",
        startMs: 4200,
        endMs: 7200,
        text: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ คณะทันตแพทยศาสตร์",
        words: [
          { text: "รศ.ดร.ทพญ.เกวลิน", startMs: 4200, endMs: 5200 },
          { text: "ธรรมสิทธิ์บูรณ์", startMs: 5250, endMs: 6200 },
          { text: "คณะทันตแพทยศาสตร์", startMs: 6250, endMs: 7200 }
        ]
      },
      {
        id: "sub_3",
        startMs: 7800,
        endMs: 10800,
        text: "มุ่งมั่นพัฒนานวัตกรรมการสอน และถ่ายทอดองค์ความรู้ระดับสากล",
        words: [
          { text: "มุ่งมั่นพัฒนา", startMs: 7800, endMs: 8600 },
          { text: "นวัตกรรมการสอน", startMs: 8650, endMs: 9600 },
          { text: "และถ่ายทอดองค์ความรู้", startMs: 9650, endMs: 10800 }
        ]
      },
      {
        id: "sub_4",
        startMs: 11200,
        endMs: 15200,
        text: "ความภูมิใจที่สุดคือการได้เห็นลูกศิษย์เติบโต และทำประโยชน์เพื่อเพื่อนมนุษย์",
        words: [
          { text: "ความภูมิใจที่สุด", startMs: 11200, endMs: 12200 },
          { text: "คือเห็นลูกศิษย์เติบโต", startMs: 12250, endMs: 13600 },
          { text: "เพื่อประโยชน์เพื่อนมนุษย์", startMs: 13650, endMs: 15200 }
        ]
      }
    ]
  };

  // Total Duration: 18.0 seconds @ 25fps = 450 frames
  const totalDurationFrames = 450;

  // 1. Render Vertical (9:16 - 1080x1920) for Shorts / TikTok
  const verticalOutput = path.join(outputDir, "kewalin-full-storyboard-vertical.mp4");
  console.log("\n📱 [1/2] Rendering Full Kewalin Vertical Master (9:16 - 1080x1920)...");
  const verticalResult = await renderRemotion({
    composition: "VerticalComposition",
    output: verticalOutput,
    fps: 25,
    durationInFrames: totalDurationFrames,
    props: {
      ...kewalinStoryboardProps,
      aspectRatio: "9:16"
    }
  }, renderContext);
  console.log(`✅ Vertical Render Completed: ${verticalResult.output}`);

  // 2. Render Horizontal (16:9 - 1920x1080) for YouTube / Broadcast
  const horizontalOutput = path.join(outputDir, "kewalin-full-storyboard-horizontal.mp4");
  console.log("\n🖥️ [2/2] Rendering Full Kewalin Horizontal Master (16:9 - 1920x1080)...");
  const horizontalResult = await renderRemotion({
    composition: "HorizontalComposition",
    output: horizontalOutput,
    fps: 25,
    durationInFrames: totalDurationFrames,
    props: {
      ...kewalinStoryboardProps,
      aspectRatio: "16:9"
    }
  }, renderContext);
  console.log(`✅ Horizontal Render Completed: ${horizontalResult.output}`);

  console.log("\n🎉 Full Kewalin Storyboard Production Renders Completed Successfully!");
}

main().catch((err) => {
  console.error("❌ Render failed:", err);
  process.exit(1);
});
