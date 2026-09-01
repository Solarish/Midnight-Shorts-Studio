import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

async function main() {
  console.log("==========================================================================================");
  console.log("🎡 PSU AVA — BINDING REAL PHOTOS (1..14) & REMOVING INITIAL TEXT FROM 3D CAROUSEL AEP");
  console.log("==========================================================================================\n");

  const photoDir = "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ /ภาพนิ่ง";
  const photoFiles = (await fs.readdir(photoDir))
    .filter(f => f.toUpperCase().endsWith(".JPG") || f.toUpperCase().endsWith(".PNG"))
    .sort()
    .map(f => path.join(photoDir, f));

  console.log(`Found ${photoFiles.length} real photos in ${photoDir}`);

  const footageMap = {};
  for (let i = 1; i <= 21; i++) {
    // Cycle 14 photos into 21 slots
    const photo = photoFiles[(i - 1) % photoFiles.length];
    footageMap[`Media ${i}`] = photo;
  }

  const textMap = {
    "Text 1": " ", // Empty / blank space so NO weird text appears at start
    "Text 2": "คณะทันตแพทยศาสตร์",
    "Text 3": "อาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙",
    "Text 4": "มหาวิทยาลัยสงขลานครินทร์",
    "Text 5": "PSU BROADCAST SPECIAL REPORT"
  };

  const runDir = path.resolve(".ava-cache/real-3d-carousel-render");
  await fs.mkdir(runDir, { recursive: true });

  const outputAep = path.join(runDir, "carousel-bound-kewalin.aep");
  const outputMov = path.join(runDir, "01_real_3d_carousel_intro.mov");
  const jobFile = path.join(runDir, "ae-job.json");
  const resultFile = path.join(runDir, "ae-result.json");
  const logFile = path.join(runDir, "ae-milestones.log");

  const job = {
    protocolVersion: 1,
    id: "kewalin-carousel-real-3d",
    templateProject: path.resolve("templates/after-effects/3d-photo-carousel.aep"),
    outputProject: outputAep,
    composition: "Main",
    text: textMap,
    footage: footageMap,
    mediaFit: "cover",
    timing: {
      durationSeconds: 12,
      frameRate: 25,
      pacing: "cinematic"
    },
    styling: {
      theme: "psu_blue_gold",
      enableParticles: true,
      enableDepthOfField: true
    },
    resultFile,
    logFile
  };

  await fs.writeFile(jobFile, JSON.stringify(job, null, 2), "utf8");

  // Generate JSX script from prototype template
  const jsxTemplate = await fs.readFile("prototype-runs/starter_mtbeonl6_69b56f49-2026-08-27T10-57-57-667Z-925b73f5/ae_carousel_effect/ae-runner.jsx", "utf8");
  // Replace the first 3 lines with our job info
  const jsxBody = jsxTemplate.replace(/$.global.AVA_JOB =[\s\S]*?\n\(function/, `$.global.AVA_JOB = ${JSON.stringify(job)};\n$.global.AVA_RESULT_FILE = ${JSON.stringify(resultFile)};\n$.global.AVA_LOG_FILE = ${JSON.stringify(logFile)};\n(function`);

  const runnerJsx = path.join(runDir, "ae-runner.jsx");
  await fs.writeFile(runnerJsx, jsxBody, "utf8");

  console.log("  [1/2] Binding real photos into AEP project...");
  // Run After Effects in command line / headless or script execution
  const osascript = `
tell application "Adobe After Effects 2026"
    DoScriptFile "${runnerJsx}"
end tell
`;
  const osaRes = spawnSync("osascript", ["-e", osascript]);
  console.log("OSA result:", osaRes.stdout?.toString(), osaRes.stderr?.toString());

  console.log("  [2/2] Rendering Main composition with aerender...");
  const aerenderBin = "/Applications/Adobe After Effects 2026/aerender";
  
  if (await fs.stat(outputAep).catch(() => false)) {
    console.log("  Output AEP exists, launching aerender...");
    const renderRes = spawnSync(aerenderBin, [
      "-project", outputAep,
      "-comp", "Main",
      "-output", outputMov,
      "-s", "1",
      "-e", "250" // 10 seconds @ 25fps
    ], { stdio: "inherit" });
    console.log("aerender complete!");
  } else {
    console.log("AEP not generated yet. Checking result file:", await fs.readFile(resultFile, "utf8").catch(() => "none"));
  }
}

main().catch(console.error);
