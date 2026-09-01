import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { renderArFloatingSlides, renderArCameraMovement } from "./src/adapters/ar-suite.js";
import { composeTimeline } from "./src/adapters/timeline.js";
import { buildPremiere } from "./src/adapters/premiere.js";
import { smartAudioDucking } from "./src/adapters/color-audio-advanced.js";

async function runArGraphicsSimulation() {
  console.log("==========================================================================================");
  console.log("🎬 PSU AVA — COMPREHENSIVE AR GRAPHICS SIMULATION (5 SLIDE ARCHETYPES + 5 CAMERA MOVEMENTS)");
  console.log("==========================================================================================\n");

  const baseRunDir = path.resolve(".ava-cache/ar-simulation-jobs");
  await fs.mkdir(baseRunDir, { recursive: true });

  const context = {
    configDir: process.cwd(),
    runDir: baseRunDir,
    stepDir: baseRunDir,
    step: { id: "ar_sim_step" },
    timeoutMs: 120000,
    dryRun: true,
    log: (msg) => {},
    settings: {
      adobe: {
        afterEffects: { applicationId: "com.adobe.AfterEffects.application" },
        premiere: { bridgeHost: "127.0.0.1", bridgePort: 47652 }
      }
    },
    resolveRunPath: (p) => path.resolve(baseRunDir, p),
    resolvePath: (p) => path.resolve(p)
  };

  const results = [];

  // Helper to make dummy studio presenter plate
  async function makeStudioVideo(name, durSec = 5) {
    const p = path.join(baseRunDir, name);
    spawnSync("ffmpeg", [
      "-y", "-f", "lavfi", "-i", `color=c=0x071126:s=1920x1080:r=25:d=${durSec}`,
      "-f", "lavfi", "-i", `sine=frequency=300:d=${durSec}`,
      "-c:v", "prores_ks", "-profile:v", "2",
      "-c:a", "pcm_s16le",
      p
    ]);
    return p;
  }

  // -------------------------------------------------------------------------------------------------
  // PART 1: 5 AR STILL SLIDE & CARD SHOWCASE ARCHETYPES
  // -------------------------------------------------------------------------------------------------
  console.log("------------------------------------------------------------------------------------------");
  console.log("💎 PART 1: EVALUATING 5 AR STILL SLIDE & CARD SHOWCASE ARCHETYPES");
  console.log("------------------------------------------------------------------------------------------");

  const slideArchetypes = [
    { preset: "glassmorphic_panel", title: "นวัตกรรมทันตกรรมชีวภาพ", subtitle: "ศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์" },
    { preset: "curved_wall_180", title: "จอโค้งพานอรามา 180 องศา", subtitle: "ผังแสดงข้อมูล 5 สไลด์เสมือนจริง" },
    { preset: "spatial_gallery", title: "แกลเลอรีภาพมิติความลึก Z-Axis", subtitle: "การกระจายตัว 4 ชั้นในพื้นที่ 3 มิติ" },
    { preset: "tactical_hud", title: "ศูนย์ข้อมูลวิจัยและการแพทย์ขั้นสูง", subtitle: "ระบบพิกัด FreeD 6-DOF พิกัด ม.อ." },
    { preset: "heritage_gold_scroll", title: "รางวัลอาจารย์ตัวอย่างแห่งชาติ ๒๕๖๙", subtitle: "มหาวิทยาลัยสงขลานครินทร์" }
  ];

  for (let i = 0; i < slideArchetypes.length; i++) {
    const item = slideArchetypes[i];
    const t0 = Date.now();
    try {
      const slideRes = await renderArFloatingSlides({
        preset: item.preset,
        title: item.title,
        subtitle: item.subtitle,
        durationMs: 5000,
        floorReflectivity: 0.65
      }, context);

      const elapsed = ((Date.now() - t0)/1000).toFixed(2);
      console.log(`  ✓ [Slide ${i+1}/5] ${item.preset.toUpperCase()} rendered (${elapsed}s) -> Elements: ${path.basename(slideRes.arElementsVideo)}, Floor: ${path.basename(slideRes.floorReflectionVideo)}`);
      results.push({ category: "AR Slide Archetype", id: `Slide-${i+1}`, name: item.preset, status: "PASS", elapsed: `${elapsed}s`, output: path.basename(slideRes.arElementsVideo) });
    } catch (err) {
      console.error(`  ❌ [Slide ${i+1}/5] ${item.preset} FAILED:`, err.message);
      results.push({ category: "AR Slide Archetype", id: `Slide-${i+1}`, name: item.preset, status: "FAIL", error: err.message });
    }
  }

  // -------------------------------------------------------------------------------------------------
  // PART 2: 5 AR 3D CAMERA KINETIC MOVEMENTS
  // -------------------------------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------------------------------------");
  console.log("🎥 PART 2: EVALUATING 5 3D CAMERA MOVEMENTS IN AR VIRTUAL SPACE");
  console.log("------------------------------------------------------------------------------------------");

  const cameraMovements = [
    { movementPreset: "orbit_360", desc: "Orbit 360° Circular Sweep (Cylindrical Helix + Dynamic DoF)" },
    { movementPreset: "crane_dolly_tilt", desc: "Crane Dolly-In & Tilt-Up Reveal (Low-Angle Surge + Upward Pitch)" },
    { movementPreset: "spiral_jib_ascent", desc: "Dynamic Jib Spiral Crane Ascent (Logarithmic Helical Corkscrew)" },
    { movementPreset: "fpv_drone_slalom", desc: "FPV Drone Fly-Through / Slalom (High-Speed Slalom + 28° Banking Roll)" },
    { movementPreset: "rack_focus_macro", desc: "Rack-Focus Macro Zoom Dolly-Out (Logistic Rack Focus + Dolly Release)" }
  ];

  for (let j = 0; j < cameraMovements.length; j++) {
    const cam = cameraMovements[j];
    const t0 = Date.now();
    try {
      const camRes = await renderArCameraMovement({
        movementPreset: cam.movementPreset,
        durationMs: 5000,
        focalLengthMm: 35.0,
        enableDepthOfField: true
      }, context);

      const elapsed = ((Date.now() - t0)/1000).toFixed(2);
      console.log(`  ✓ [Camera ${j+1}/5] ${cam.movementPreset.toUpperCase()} (${elapsed}s) -> ${cam.desc} (${camRes.cameraTrackingData.totalFrames} frames FreeD)`);
      results.push({ category: "3D Camera Movement", id: `Cam-${j+1}`, name: cam.movementPreset, status: "PASS", elapsed: `${elapsed}s`, output: `${camRes.cameraTrackingData.totalFrames} frames FreeD` });
    } catch (err) {
      console.error(`  ❌ [Camera ${j+1}/5] ${cam.movementPreset} FAILED:`, err.message);
      results.push({ category: "3D Camera Movement", id: `Cam-${j+1}`, name: cam.movementPreset, status: "FAIL", error: err.message });
    }
  }

  // -------------------------------------------------------------------------------------------------
  // PART 3: 5 HYBRID COMPOSITE AR STAGE PRODUCTIONS (SLIDES + CAMERA + FLOOR + PREMIERE MULTITRACK)
  // -------------------------------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------------------------------------");
  console.log("🏆 PART 3: EXECUTING 5 INTEGRATED AR STAGE PRODUCTIONS INTO PREMIERE PRO MULTITRACK");
  console.log("------------------------------------------------------------------------------------------");

  for (let k = 0; k < 5; k++) {
    const slideItem = slideArchetypes[k];
    const camItem = cameraMovements[k];
    const t0 = Date.now();
    try {
      const studioVid = await makeStudioVideo(`ar_studio_raw_${k+1}.mov`, 5);
      const slideRes = await renderArFloatingSlides({ preset: slideItem.preset, title: slideItem.title, subtitle: slideItem.subtitle, durationMs: 5000 }, context);
      const camRes = await renderArCameraMovement({ movementPreset: camItem.movementPreset, durationMs: 5000 }, context);

      // Multitrack timeline composition
      const tl = await composeTimeline({
        name: `AR_STAGE_PROD_${k+1}_${slideItem.preset.toUpperCase()}`,
        width: 1920,
        height: 1080,
        frameRate: 25,
        scenes: [{ id: "sc_studio", source: studioVid, durationMs: 5000, track: 1 }],
        overlays: [
          { id: "ov_refl", asset: slideRes.floorReflectionVideo, startMs: 0, durationMs: 5000, track: 2 },
          { id: "ov_ar", asset: slideRes.arElementsVideo, startMs: 0, durationMs: 5000, track: 3 },
          { id: "ov_hud", asset: slideRes.hudTelemetryVideo, startMs: 0, durationMs: 5000, track: 4 }
        ]
      }, context);

      const pr = await buildPremiere({
        outputProject: `outputs/ar_stage_job_${k+1}.prproj`,
        timelineSpec: tl.timelineSpec
      }, context);

      const elapsed = ((Date.now() - t0)/1000).toFixed(2);
      console.log(`  ✓ [AR Master ${k+1}/5] Stage ${slideItem.preset} + ${camItem.movementPreset} assembled (${elapsed}s) -> ${path.basename(pr.job?.outputProject || "ar_stage.prproj")}`);
      results.push({ category: "Integrated AR Stage Production", id: `Stage-${k+1}`, name: `${slideItem.preset} + ${camItem.movementPreset}`, status: "PASS", elapsed: `${elapsed}s`, output: path.basename(pr.job?.outputProject || "ar_stage.prproj") });
    } catch (err) {
      console.error(`  ❌ [AR Master ${k+1}/5] FAILED:`, err.message);
      results.push({ category: "Integrated AR Stage Production", id: `Stage-${k+1}`, name: `${slideItem.preset} + ${camItem.movementPreset}`, status: "FAIL", error: err.message });
    }
  }

  console.log("\n==========================================================================================");
  console.log("🏁 FINAL AR GRAPHICS SIMULATION BENCHMARK (15/15 TESTS COMPLETED)");
  console.log("==========================================================================================");
  console.table(results);
}

runArGraphicsSimulation().catch(console.error);
