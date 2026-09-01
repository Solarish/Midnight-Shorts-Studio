#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { renderRemotion } from "../src/adapters/remotion.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

async function main() {
  console.log("==================================================");
  console.log("🎬 MIDNIGHT SHORTS STUDIO - LIVE REMOTION RENDER");
  console.log("==================================================");

  const outputDir = path.join(projectRoot, "outputs");
  await mkdir(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, "live-test-vertical.mp4");

  const renderContext = {
    configDir: projectRoot,
    runDir: projectRoot,
    resolvePath: (p) => path.resolve(projectRoot, p),
    resolveRunPath: (p) => path.resolve(projectRoot, p),
    dryRun: false,
    log: (msg) => console.log(`[RemotionAdapter] ${msg}`),
    step: { id: "live_render_step", type: "remotion.render" }
  };

  const inputSpec = {
    composition: "VerticalComposition",
    output: outputFile,
    fps: 25,
    durationInFrames: 125, // 5.0 seconds at 25 fps
    props: {
      title: "PSU BROADCAST SHORTS",
      subheadline: "นวัตกรรมและเทคโนโลยี ม.สงขลานครินทร์",
      speakerName: "รศ.ดร. สุรศักดิ์ วิชัยดิษฐ์",
      speakerRole: "ผู้อำนวยการฝ่ายวิจัยและนวัตกรรม",
      theme: {
        primaryColor: "#002D62",
        secondaryColor: "#E5A93C",
        accentColor: "#38BDF8",
        textColor: "#FFFFFF",
        fontFamily: "'Prompt', 'Sarabun', sans-serif"
      },
      items: [
        {
          id: "item_cover",
          kind: "cover_card",
          title: "PSU BROADCAST SHORTS",
          subtitle: "ระบบตัดต่ออัตโนมัติ Remotion",
          startMs: 0,
          durationMs: 2000,
          motionPreset: "ZoomPunch"
        },
        {
          id: "item_title",
          kind: "title_card",
          speakerName: "รศ.ดร. สุรศักดิ์ วิชัยดิษฐ์",
          speakerRole: "ผู้อำนวยการฝ่ายวิจัยและนวัตกรรม",
          startMs: 2000,
          durationMs: 2000,
          motionPreset: "Bounce"
        },
        {
          id: "item_outro",
          kind: "logo_outro",
          channelName: "PSU Broadcast Official",
          tagline: "Inspiring Future Generation",
          startMs: 4000,
          durationMs: 1000,
          motionPreset: "Pop"
        }
      ],
      subtitles: [
        {
          id: "sub_1",
          startMs: 300,
          endMs: 1800,
          text: "ยินดีต้อนรับสู่ระบบผลิตสื่อสั้น มหาวิทยาลัยสงขลานครินทร์",
          words: [
            { text: "ยินดี", startMs: 300, endMs: 600 },
            { text: "ต้อนรับ", startMs: 600, endMs: 900 },
            { text: "สู่ระบบ", startMs: 900, endMs: 1200 },
            { text: "ผลิตสื่อสั้น", startMs: 1200, endMs: 1500 },
            { text: "ม.สงขลานครินทร์", startMs: 1500, endMs: 1800 }
          ]
        },
        {
          id: "sub_2",
          startMs: 2200,
          endMs: 3800,
          text: "ขับเคลื่อนการประมวลผลด้วยเทคโนโลยี Remotion Engine",
          words: [
            { text: "ขับเคลื่อน", startMs: 2200, endMs: 2600 },
            { text: "การประมวลผล", startMs: 2600, endMs: 3000 },
            { text: "ด้วยเทคโนโลยี", startMs: 3000, endMs: 3400 },
            { text: "Remotion Engine", startMs: 3400, endMs: 3800 }
          ]
        }
      ]
    }
  };

  console.log("Starting Remotion rendering pipeline...");
  const startTime = Date.now();
  const result = await renderRemotion(inputSpec, renderContext);
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("==================================================");
  console.log(`✅ RENDER COMPLETED IN ${durationSec}s`);
  console.log("Result output:", result);
  console.log("==================================================");
}

main().catch((err) => {
  console.error("❌ Render failed:", err);
  process.exit(1);
});
