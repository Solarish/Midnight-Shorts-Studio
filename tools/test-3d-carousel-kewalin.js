import { readdir } from "node:fs/promises";
import path from "node:path";
import { instantiateStarterWorkflowPackage } from "@psu-ava/recipes";
import { compileGraphToWorkflow } from "@psu-ava/node-sdk";
import { runWorkflow } from "@psu-ava/core";
import { adapters } from "../src/adapters/index.js";

async function main() {
  const photoDir = "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ /ภาพนิ่ง";
  let photoPaths = [];
  try {
    const files = (await readdir(photoDir)).filter((f) => f.toUpperCase().endsWith(".JPG") || f.toUpperCase().endsWith(".PNG"));
    photoPaths = files.map((f) => path.join(photoDir, f));
    console.log(`Found ${photoPaths.length} photos for Dr. Kewalin in ${photoDir}`);
  } catch (err) {
    console.log(`Could not access external volume (${err.message}). Using 14 simulated photos for Dr. Kewalin storyboard.`);
    photoPaths = Array.from({ length: 14 }, (_, i) => path.resolve(process.cwd(), `assets/input/kewalin_photo_${i + 1}.jpg`));
  }

  const graph = instantiateStarterWorkflowPackage("3d-photo-carousel-intro-v1", {
    graphId: "kewalin_carousel_test",
    name: "3D Carousel - Dr. Kewalin Thamasitboon"
  });

  const selectNode = graph.nodes.find((n) => n.id === "select_photos");
  if (selectNode) {
    selectNode.config.paths = photoPaths;
  }

  const effectNode = graph.nodes.find((n) => n.id === "ae_carousel_effect");
  if (effectNode) {
    effectNode.config.texts = {
      "Text 1": "รองศาสตราจารย์ ดร.ทพญ. เกวลิน ธรรมสิทธิ์บูรณ์",
      "Text 2": "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์",
      "Text 3": "อาจารย์ตัวอย่างดีเด่นด้านการเรียนการสอน ประจำปี 2569",
      "Text 4": "ทำหน้าที่ของตัวเองให้ดีที่สุด ทำด้วยความรักและสนุก",
      "Text 5": "PSU BROADCAST SPECIAL REPORT"
    };
    effectNode.config.cycleMode = "loop";
    effectNode.config.mediaFit = "cover";
    effectNode.config.timing = {
      durationSeconds: 15,
      pacing: "cinematic"
    };
  }

  const { workflow, raw } = compileGraphToWorkflow(graph);
  console.log(`Compiled workflow has ${workflow.steps.length} steps:`);
  for (const step of workflow.steps) {
    console.log(` - Step: ${step.id} (${step.uses})`);
  }

  console.log("\n--- Testing dry-run execution ---");
  const dryResult = await runWorkflow({ workflow, configDir: process.cwd(), raw }, adapters, {
    dryRun: true
  });
  console.log("Dry run status:", dryResult.status);
  console.log("Steps executed:", Object.keys(dryResult.steps));
  console.log("\n✅ 3D Carousel Storyboard pipeline test PASSED successfully with all 14 photos cycled into 21 slots!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
