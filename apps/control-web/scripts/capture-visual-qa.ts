import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const ARTIFACTS_DIR = "/Users/louislee/.gemini/antigravity/brain/3462bf76-7cd1-4dcb-ab23-d5bf6e9825f0";
const PORT = 4178;

const sampleStoryboard = {
  schemaVersion: 2,
  storyboardId: "story-1",
  name: "Kewalin Documentary — PSU Exemplary Faculty 2026",
  revision: 3,
  profile: { width: 1080, height: 1920, frameRate: 25 },
  sourceImport: {
    importId: "import-1",
    docxPath: "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน/SB-รศ.ดร.ทพญ.เกวลิน.docx",
    sourceDigest: "digest-8837",
    importedAt: "2026-09-03T08:00:00.000Z"
  },
  status: "approved",
  items: [
    {
      id: "cover_1",
      kind: "cover_card",
      durationMs: 5000,
      audioPolicy: "mute",
      presetId: "comfy-cover-card-v2",
      params: {
        title: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
        subtitle: "ภาควิชาทันตกรรมทั่วไป มหาวิทยาลัยสงขลานครินทร์",
        eyebrow: "รางวัลอาจารย์ดีเด่น 2026",
        prompt: "A distinguished Thai female dentistry professor wearing university graduation gown in clinical background, photorealistic 8k, cinematic lighting",
        seed: 42
      }
    },
    {
      id: "title_1",
      kind: "title",
      durationMs: 4000,
      audioPolicy: "mute",
      presetId: "ae-3d-carousel-title-v1",
      params: {
        composition: "3D_Carousel_Main",
        texts: {
          title: "มหาวิทยาลัยสงขลานครินทร์",
          text: "ความรู้ ความคิด จิตวิญญาณแห่งความเป็นเลิศ"
        }
      }
    },
    {
      id: "interview_1",
      kind: "a_roll",
      durationMs: 6500,
      audioPolicy: "preserve",
      presetId: "a-roll-segment-v1",
      params: {
        sourceKey: "C7724",
        sourcePath: "/Volumes/NAS/Footage/Interview_01.mov",
        sourceInMs: 1200,
        sourceOutMs: 7700,
        dialogue: "การพัฒนาการเรียนการสอนทางทันตกรรมในยุคดิจิทัลมุ่งเน้นการลงมือปฏิบัติจริง..."
      },
      broll: [
        {
          id: "interview_1_broll_1",
          asset: { path: "/Volumes/NAS/Broll/Clinic_Lab_01.mp4" },
          offsetMs: 1500,
          durationMs: 3500,
          audioPolicy: "mute",
          fit: "cover"
        }
      ]
    },
    {
      id: "interview_2",
      kind: "a_roll",
      durationMs: 5000,
      audioPolicy: "preserve",
      presetId: "a-roll-segment-v1",
      params: {
        sourceKey: "C7725",
        sourcePath: "/Volumes/NAS/Footage/Interview_02.mov",
        sourceInMs: 0,
        sourceOutMs: 5000,
        dialogue: "เราส่งเสริมให้นักศึกษาเข้าใจบริบทชุมชนเพื่อการดูแลรักษาที่มีหัวใจของความเป็นมนุษย์"
      },
      broll: []
    },
    {
      id: "logo_1",
      kind: "logo_outro",
      durationMs: 3000,
      audioPolicy: "mute",
      presetId: "logo-outro-gold-glitch-v1",
      params: {
        title: "PSU BROADCAST 2026",
        subtitle: "Prince of Songkla University"
      }
    }
  ]
};

const sampleImport = {
  schemaVersion: 2,
  importId: "import-1",
  docxPath: sampleStoryboard.sourceImport.docxPath,
  sourceDigest: "digest-8837",
  importedAt: "2026-09-03T08:00:00.000Z",
  rawRows: [
    { rowIndex: 1, rowNumber: 1, cells: ["ภาพเปิดหัวเรื่อง", ""], picture: "ภาพปก 3D Title", sound: "ดนตรีบรรเลง" },
    { rowIndex: 2, rowNumber: 2, cells: ["บทสัมภาษณ์อาจารย์", ""], picture: "ภาพสัมภาษณ์ รศ.ดร.เกวลิน", sound: "เสียงพูด" }
  ],
  proposals: [],
  diagnostics: []
};

async function main() {
  console.log("1. Starting Vite preview server on port", PORT);
  const viteProcess = spawn("npx", ["vite", "preview", "--port", String(PORT)], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("2. Launching Chrome with Playwright...");
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });

  try {
    // 1080p Desktop View
    const context1080 = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1
    });
    const page1080 = await context1080.newPage();

    // Mock API
    await page1080.route("**/api/v1/storyboards/story-1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sampleStoryboard)
      });
    });
    await page1080.route("**/api/v1/storyboard-imports/import-1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sampleImport)
      });
    });

    console.log("3. Navigating to Storyboard Editor (1080p)...");
    await page1080.goto(`http://127.0.0.1:${PORT}/storyboards/story-1/edit`, { waitUntil: "networkidle" });
    await page1080.waitForTimeout(1000);

    const dest1080 = path.join(ARTIFACTS_DIR, "storyboard-editor-1080p.png");
    await page1080.screenshot({ path: dest1080, fullPage: false });
    console.log("Saved 1080p screenshot:", dest1080);

    // Click scene 3 (A-roll) to capture A-roll Inspector & Canvas
    await page1080.locator(".outline-item").nth(2).click();
    await page1080.waitForTimeout(500);
    const destARoll = path.join(ARTIFACTS_DIR, "storyboard-editor-aroll-selected.png");
    await page1080.screenshot({ path: destARoll, fullPage: false });
    console.log("Saved A-roll selected screenshot:", destARoll);

    // Open Interactive Timeline Studio Modal
    const timelineBtn = page1080.getByRole("button", { name: /Interactive Timeline Studio/i });
    if (await timelineBtn.count() > 0) {
      await timelineBtn.click();
      await page1080.waitForTimeout(1000);
      const destModal = path.join(ARTIFACTS_DIR, "timeline-studio-modal.png");
      await page1080.screenshot({ path: destModal, fullPage: false });
      console.log("Saved Timeline Studio Modal screenshot:", destModal);
    }
    await context1080.close();

    // 13" Laptop View (1366x768)
    const contextLaptop = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      deviceScaleFactor: 1
    });
    const pageLaptop = await contextLaptop.newPage();
    await pageLaptop.route("**/api/v1/storyboards/story-1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sampleStoryboard)
      });
    });
    await pageLaptop.route("**/api/v1/storyboard-imports/import-1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sampleImport)
      });
    });

    console.log("4. Navigating to Storyboard Editor (1366x768 Laptop)...");
    await pageLaptop.goto(`http://127.0.0.1:${PORT}/storyboards/story-1/edit`, { waitUntil: "networkidle" });
    await pageLaptop.waitForTimeout(1000);

    const destLaptop = path.join(ARTIFACTS_DIR, "storyboard-editor-laptop.png");
    await pageLaptop.screenshot({ path: destLaptop, fullPage: false });
    console.log("Saved Laptop screenshot:", destLaptop);
    await contextLaptop.close();

    console.log("All screenshots captured successfully!");
  } finally {
    await browser.close();
    viteProcess.kill();
  }
}

main().catch((err) => {
  console.error("Capture script failed:", err);
  process.exit(1);
});
