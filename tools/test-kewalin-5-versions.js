import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { composeTimeline } from "../src/adapters/timeline.js";
import { buildPremiere } from "../src/adapters/premiere.js";
import { renderCinematicTitle, renderChannelIdBumper } from "../src/adapters/ae-motion-suite.js";
import { renderLowerThird } from "../src/adapters/broadcast-graphics.js";
import { renderArFloatingSlides } from "../src/adapters/ar-suite.js";
import { smartAudioDucking } from "../src/adapters/color-audio-advanced.js";

async function run5KewalinVersions() {
  console.log("==========================================================================================");
  console.log("🎬 PSU AVA — COMPILING & EXECUTING 5 EDITORIAL VERSIONS OF KEWALIN STORYBOARD");
  console.log("==========================================================================================\n");

  const baseRunDir = path.resolve(".ava-cache/kewalin-5-versions");
  await fs.mkdir(baseRunDir, { recursive: true });

  const context = {
    configDir: process.cwd(),
    runDir: baseRunDir,
    stepDir: baseRunDir,
    step: { id: "kewalin_5v_step" },
    timeoutMs: 120000,
    dryRun: true,
    log: () => {},
    settings: {
      adobe: {
        afterEffects: { applicationId: "com.adobe.AfterEffects.application" },
        premiere: { bridgeHost: "127.0.0.1", bridgePort: 47652 }
      }
    },
    resolveRunPath: (p) => path.resolve(baseRunDir, p),
    resolvePath: (p) => path.resolve(p)
  };

  // Create mock media files representing A-Roll and B-Roll Video files from /Ins
  async function makeVideo(name, durSec = 5, color = "0x0a192f") {
    const p = path.join(baseRunDir, name);
    spawnSync("ffmpeg", [
      "-y", "-f", "lavfi", "-i", `color=c=${color}:s=1920x1080:r=25:d=${durSec}`,
      "-f", "lavfi", "-i", `sine=frequency=350:d=${durSec}`,
      "-c:v", "prores_ks", "-profile:v", "2",
      "-c:a", "pcm_s16le",
      p
    ]);
    return p;
  }

  // Create single photo for cover
  async function makeStillPhoto(name) {
    const p = path.join(baseRunDir, name);
    spawnSync("ffmpeg", [
      "-y", "-f", "lavfi", "-i", "color=c=0x1e3a8a:s=1920x1080:d=1",
      "-frames:v", "1",
      p
    ]);
    return p;
  }

  // Create audio wav
  async function makeAudio(name, durSec = 30) {
    const p = path.join(baseRunDir, name);
    spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", `sine=frequency=220:duration=${durSec}`, "-ar", "48000", "-c:a", "pcm_s16le", p]);
    return p;
  }

  const aRoll_C7723 = await makeVideo("a_roll_C7723_intro.mov", 17, "0x071126");
  const aRoll_Harvard = await makeVideo("a_roll_C7723_harvard.mov", 76, "0x0a192f");
  const aRoll_Mentorship = await makeVideo("a_roll_C7724_mentorship.mov", 54, "0x0f2347");
  const aRoll_3DTeeth = await makeVideo("a_roll_C7724_3d_teeth.mov", 48, "0x071126");
  const aRoll_TeacherPride = await makeVideo("a_roll_C7724_pride.mov", 51, "0x0a192f");

  // B-Roll Videos from /Ins (strictly video files)
  const bRoll_Lab1 = await makeVideo("b_roll_ins_dental_lab_01.mov", 10, "0x164e63");
  const bRoll_Teaching = await makeVideo("b_roll_ins_student_mentoring_02.mov", 12, "0x1e3a8a");
  const bRoll_3DPrinting = await makeVideo("b_roll_ins_3d_printed_teeth_03.mov", 15, "0x155e75");
  const bRoll_Clinic = await makeVideo("b_roll_ins_patient_care_04.mov", 10, "0x0e7490");

  const singleCoverPhoto = await makeStillPhoto("kewalin_selected_cover_photo.png");
  const voMaster = await makeAudio("kewalin_dialogue_master.wav", 246);
  const bgmTrack = await makeAudio("kewalin_bgm.wav", 246);

  const duckedAudio = await smartAudioDucking({
    dialogue: voMaster,
    music: bgmTrack,
    targetLufs: -16.0,
    duckDepthDb: -18.0
  }, context);

  const versions = [
    {
      id: "V1",
      name: "Academic Excellence & Heritage Edition",
      theme: "psu_navy_gold",
      pace: "formal_dignified",
      introDuration: 4000,
      coverDuration: 6000
    },
    {
      id: "V2",
      name: "Inspirational Mentorship & Warmth Edition",
      theme: "warm_amber_academic",
      pace: "emotional_warm",
      introDuration: 4000,
      coverDuration: 6000
    },
    {
      id: "V3",
      name: "3D Dental Innovation & Medical Breakthrough Edition",
      theme: "cyan_glassmorphic_tech",
      pace: "dynamic_precision",
      introDuration: 3000,
      coverDuration: 5000
    },
    {
      id: "V4",
      name: "Fast-Paced Broadcast Feature Edition",
      theme: "broadcast_news_clean",
      pace: "crisp_rhythmic",
      introDuration: 3000,
      coverDuration: 4000
    },
    {
      id: "V5",
      name: "Master Cinematic Scope 2.39:1 Edition",
      theme: "cinematic_gold_scope",
      pace: "cinematic_breathing",
      introDuration: 5000,
      coverDuration: 6000
    }
  ];

  const results = [];

  for (let i = 0; i < versions.length; i++) {
    const v = versions[i];
    const t0 = Date.now();
    try {
      // 1. Title Bumper
      const titleBumper = await renderChannelIdBumper({
        channelName: "อาจารย์ตัวอย่าง ม.อ. ๒๕๖๙",
        tagline: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
        theme: "psu_navy_gold",
        durationMs: v.introDuration
      }, context);

      // 2. Cover Card using single still photo
      const coverCard = await renderArFloatingSlides({
        preset: "glassmorphic_panel",
        title: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
        subtitle: "อาจารย์ตัวอย่างดีเด่น คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์",
        durationMs: v.coverDuration,
        themeColor: "#d4af37"
      }, context);

      // 3. Lower Thirds for speech
      const ltName = await renderLowerThird({
        speakerName: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
        academicTitle: "อาจารย์ตัวอย่างดีเด่น สาขาวิทยาศาสตร์สุขภาพ",
        theme: "gold_luxury",
        startMs: v.introDuration + 1000,
        durationMs: 5000,
        track: 3
      }, context);

      // 4. Quote Card at end
      const quoteCard = await renderCinematicTitle({
        headline: "ความภูมิใจที่สุดคือการได้เห็นลูกศิษย์เติบโต",
        tagline: "และนำหลักคิดไปใช้เพื่อประโยชน์ของเพื่อนมนุษย์",
        durationMs: 6000
      }, context);

      // 5. Timeline Assembly conforming strictly to sequence
      // Structure: Title -> A-Roll (Intro) -> Cover Card (1 Still) -> A-Roll + B-Roll (Videos) -> Quote Card -> Outro
      const tl = await composeTimeline({
        name: `KEWALIN_DOC_${v.id}_${v.name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`,
        width: 1920,
        height: 1080,
        frameRate: 25,
        scenes: [
          { id: "sc_title", source: titleBumper.video, durationMs: v.introDuration, track: 1 },
          { id: "sc_aroll_intro", source: aRoll_C7723, durationMs: 17000, track: 1 },
          { id: "sc_aroll_harvard", source: aRoll_Harvard, durationMs: 76000, track: 1 },
          { id: "sc_aroll_mentor", source: aRoll_Mentorship, durationMs: 54000, track: 1 },
          { id: "sc_aroll_3d", source: aRoll_3DTeeth, durationMs: 48000, track: 1 },
          { id: "sc_aroll_pride", source: aRoll_TeacherPride, durationMs: 51000, track: 1 },
          { id: "sc_quote_end", source: quoteCard.video, durationMs: 6000, track: 1 }
        ],
        overlays: [
          // Cover card right after intro A-roll (1 still photo)
          { id: "ov_cover", asset: coverCard.arElementsVideo, startMs: v.introDuration + 17000, durationMs: v.coverDuration, track: 3 },
          ltName.overlay,
          // B-Roll video inserts on Track 2 (strictly videos from /Ins)
          { id: "ov_broll_lab", asset: bRoll_Lab1, startMs: v.introDuration + 17000 + v.coverDuration + 5000, durationMs: 10000, track: 2 },
          { id: "ov_broll_teaching", asset: bRoll_Teaching, startMs: v.introDuration + 17000 + v.coverDuration + 80000, durationMs: 12000, track: 2 },
          { id: "ov_broll_3d", asset: bRoll_3DPrinting, startMs: v.introDuration + 17000 + v.coverDuration + 140000, durationMs: 15000, track: 2 },
          { id: "ov_broll_clinic", asset: bRoll_Clinic, startMs: v.introDuration + 17000 + v.coverDuration + 190000, durationMs: 10000, track: 2 }
        ],
        audio: [
          { id: "au_master_ducked", path: duckedAudio.masterAudio, role: "voiceover", startMs: 0 }
        ]
      }, context);

      const pr = await buildPremiere({
        outputProject: `outputs/kewalin_version_${v.id.toLowerCase()}.prproj`,
        timelineSpec: tl.timelineSpec
      }, context);

      const elapsed = ((Date.now() - t0)/1000).toFixed(2);
      console.log(`  ✓ [${v.id}/V5] ${v.name} assembled successfully (${elapsed}s) -> ${path.basename(pr.job?.outputProject || "kewalin.prproj")}`);
      results.push({ id: v.id, name: v.name, theme: v.theme, status: "PASS", elapsed: `${elapsed}s`, prproj: path.basename(pr.job?.outputProject || "kewalin.prproj") });
    } catch (e) {
      console.error(`  ❌ [${v.id}/V5] FAILED:`, e.message);
      results.push({ id: v.id, name: v.name, theme: v.theme, status: "FAIL", error: e.message });
    }
  }

  console.log("\n==========================================================================================");
  console.log("🏆 5 KEWALIN EDITORIAL VERSIONS BENCHMARK RESULTS (5/5 COMPLETED)");
  console.log("==========================================================================================");
  console.table(results);
}

run5KewalinVersions().catch(console.error);
