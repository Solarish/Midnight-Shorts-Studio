import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * 1. 3D Floating AR Slide Rig (5 Slide Archetypes)
 */
export async function renderArFloatingSlides(input, context) {
  const {
    preset = "glassmorphic_panel", // glassmorphic_panel | curved_wall_180 | spatial_gallery | tactical_hud | heritage_gold_scroll
    slides = [],
    title = "นวัตกรรมทันตกรรมชีวภาพและนาโนเทคโนโลยี ม.อ.",
    subtitle = "ศูนย์สื่อสารองค์กรและสถานีวิทยุกระจายเสียง",
    durationMs = 5000,
    themeColor = "#38bdf8",
    floorReflectivity = 0.65
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const outDir = path.join(runDir, "ar_floating_slides");
  await fs.mkdir(outDir, { recursive: true });

  const id = `ar_${preset}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const arElementsMov = path.join(outDir, `${id}_elements.mov`);
  const floorReflectionMov = path.join(outDir, `${id}_reflection.mov`);
  const hudTelemetryMov = path.join(outDir, `${id}_hud.mov`);
  const aepProject = path.join(outDir, `${id}_project.aep`);

  // Python rendering engine for high-precision 3D AR plates
  const pyScript = `
import sys
from PIL import Image, ImageDraw, ImageFont
import math

# Master AR Plate
img = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

font_path = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"
f_hero = ImageFont.truetype(font_path, 38, index=3)
f_sub = ImageFont.truetype(font_path, 22, index=1)
f_metric = ImageFont.truetype(font_path, 54, index=3)

if "${preset}" == "glassmorphic_panel":
    # 1. Glassmorphic Dielectric Floating Panel (Beside Presenter)
    draw.rectangle([1100, 220, 1820, 860], fill=(15, 30, 65, 210), outline=(56, 189, 248), width=3)
    draw.rectangle([1100, 220, 1108, 860], fill=(212, 175, 55, 255))
    draw.text((1140, 260), """${title}""", font=f_hero, fill=(255, 255, 255))
    draw.text((1140, 320), """${subtitle}""", font=f_sub, fill=(212, 175, 55))
    draw.line([(1140, 370), (1780, 370)], fill=(56, 189, 248, 150), width=2)
    draw.text((1140, 420), "99.8%", font=f_metric, fill=(56, 189, 248))
    draw.text((1140, 500), "• AI Realtime Diagnostics", font=f_sub, fill=(241, 245, 249))
    draw.text((1140, 540), "• 3D Intraoral High-Res Scanner", font=f_sub, fill=(241, 245, 249))
    draw.text((1140, 580), "• Nanoscale Enamel Repair", font=f_sub, fill=(241, 245, 249))

elif "${preset}" == "curved_wall_180":
    # 2. Curved Multi-Screen Panoramic Video Wall
    for i in range(5):
        cx = 250 + i * 350
        cy = 380 + (abs(i-2) * 50)
        draw.rectangle([cx-150, cy-180, cx+150, cy+180], fill=(7, 17, 38, 225), outline=(212, 175, 55), width=3)
        draw.text((cx-120, cy-40), f"SLIDE 0{i+1}", font=f_hero, fill=(56, 189, 248))
        draw.text((cx-120, cy+20), "AR Curvature 180°", font=f_sub, fill=(148, 163, 184))

elif "${preset}" == "spatial_gallery":
    # 3. 3D Spatial Depth Perspective Gallery
    for i in range(4):
        x = 900 - i * 180
        y = 300 + i * 90
        w = 800 - i * 120
        h = 460 - i * 70
        alpha = int(240 - i * 45)
        draw.rectangle([x, y, x+w, y+h], fill=(10, 25, 55, alpha), outline=(56, 189, 248, alpha), width=3)
        if i == 0:
            draw.text((x+50, y+50), """${title}""", font=f_hero, fill=(255, 255, 255))
            draw.text((x+50, y+110), "ACTIVE FOREGROUND DEPTH", font=f_sub, fill=(212, 175, 55))

elif "${preset}" == "tactical_hud":
    # 4. Tactical Sci-Fi HUD Floating Telemetry Slide
    draw.rectangle([1150, 180, 1840, 880], fill=(5, 12, 28, 230), outline=(56, 189, 248), width=2)
    # Rotating reticle simulation
    draw.ellipse([1400, 320, 1600, 520], outline=(56, 189, 248), width=3)
    draw.ellipse([1430, 350, 1570, 490], outline=(212, 175, 55), width=2)
    draw.line([(1500, 300), (1500, 540)], fill=(56, 189, 248), width=1)
    draw.line([(1380, 420), (1620, 420)], fill=(56, 189, 248), width=1)
    draw.text((1200, 580), """${title}""", font=f_hero, fill=(255, 255, 255))
    draw.text((1200, 640), "STAGE GNSS: 7deg 00min 33.4sec N 100deg 30min 06.2sec E", font=f_sub, fill=(56, 189, 248))
    draw.text((1200, 680), "FREE-D 6-DOF TRACKER: LOCKED (50Hz)", font=f_sub, fill=(16, 185, 129))

elif "${preset}" == "heritage_gold_scroll":
    # 5. Parchment Heritage 3D Floating Gold Scroll
    draw.rectangle([1050, 200, 1850, 880], fill=(35, 22, 12, 235), outline=(212, 175, 55), width=6)
    draw.rectangle([1070, 220, 1830, 860], fill=(220, 200, 175, 250), outline=(160, 110, 60), width=3)
    draw.text((1120, 280), """${title}""", font=f_hero, fill=(45, 20, 10))
    draw.text((1120, 350), """${subtitle}""", font=f_sub, fill=(160, 110, 60))
    draw.text((1120, 420), "• มหาวิทยาลัยสงขลานครินทร์", font=f_sub, fill=(45, 20, 10))
    draw.text((1120, 460), "• เพื่อประโยชน์ของเพื่อนมนุษย์เป็นกิจที่หนึ่ง", font=f_sub, fill=(180, 40, 40))

png_path = """${outDir}/${id}_plate.png"""
img.save(png_path)

# 2. Floor Reflection Matte
refl_img = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
r_draw = ImageDraw.Draw(refl_img)
r_draw.rectangle([1050, 820, 1850, 1020], fill=(15, 30, 65, int(255 * ${floorReflectivity})), outline=(56, 189, 248, 120), width=2)
refl_png = """${outDir}/${id}_refl.png"""
refl_img.save(refl_png)
`;

  spawnSync("python3", ["-c", pyScript], { encoding: "utf8" });

  const durSec = (durationMs / 1000).toFixed(2);
  const fadeOutStart = ((durationMs - 500) / 1000).toFixed(2);

  // Render ProRes 4444 Alpha Elements
  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", path.join(outDir, `${id}_plate.png`),
    "-vf", `fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st=${fadeOutStart}:d=0.5:alpha=1`,
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    arElementsMov
  ], { encoding: "utf8" });

  // Render Floor Reflection Alpha
  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", path.join(outDir, `${id}_refl.png`),
    "-vf", `fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st=${fadeOutStart}:d=0.5:alpha=1`,
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    floorReflectionMov
  ], { encoding: "utf8" });

  // Render HUD Alpha
  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", path.join(outDir, `${id}_plate.png`),
    "-vf", `scale=1920:1080,fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st=${fadeOutStart}:d=0.5:alpha=1`,
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    hudTelemetryMov
  ], { encoding: "utf8" });

  return {
    preset,
    arElementsVideo: arElementsMov,
    floorReflectionVideo: floorReflectionMov,
    hudTelemetryVideo: hudTelemetryMov,
    project: aepProject
  };
}

/**
 * 2. 3D AR Camera Movement & FreeD Tracker (5 Movement Archetypes)
 */
export async function renderArCameraMovement(input, context) {
  const {
    movementPreset = "orbit_360", // orbit_360 | crane_dolly_tilt | spiral_jib_ascent | fpv_drone_slalom | rack_focus_macro
    durationMs = 5000,
    focalLengthMm = 35.0,
    apertureFStop = 2.8,
    enableDepthOfField = true
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const outDir = path.join(runDir, "ar_camera_movement");
  await fs.mkdir(outDir, { recursive: true });

  const id = `cam_${movementPreset}_${Date.now()}`;
  const aepProject = path.join(outDir, `${id}.aep`);

  // Generate 6-DOF Tracking Data Frames
  const totalFrames = Math.round((durationMs / 1000) * 25);
  const keyframes = [];

  for (let f = 0; f < totalFrames; f++) {
    const t = f / (totalFrames - 1);
    let x = 0, y = 140, z = -300, pan = 0, tilt = -5, roll = 0, fov = focalLengthMm;

    switch (movementPreset) {
      case "orbit_360":
        x = 1800 * Math.sin(t * 2 * Math.PI);
        z = -1800 * Math.cos(t * 2 * Math.PI);
        y = 120 + 60 * Math.sin(4 * Math.PI * t);
        pan = t * 360;
        break;
      case "crane_dolly_tilt":
        z = -3500 + 2650 * Math.pow(t, 2);
        y = 650 - 530 * t;
        tilt = -28 + 20 * t;
        break;
      case "spiral_jib_ascent":
        const r = 950 + 1450 * t;
        x = r * Math.cos(t * 1.5 * Math.PI);
        z = r * Math.sin(t * 1.5 * Math.PI);
        y = 550 - 1750 * (0.5 - 0.5 * Math.cos(Math.PI * t));
        tilt = 15 - 45 * t;
        break;
      case "fpv_drone_slalom":
        x = 750 * Math.sin(t * 5 * Math.PI);
        y = 140 + 80 * Math.sin(t * 10 * Math.PI);
        z = -3000 + 5000 * t;
        roll = -28.0 * Math.sin(t * 5 * Math.PI);
        break;
      case "rack_focus_macro":
        z = -150 - 2050 * (6 * Math.pow(t, 5) - 15 * Math.pow(t, 4) + 10 * Math.pow(t, 3));
        y = 100 - 80 * t;
        fov = t < 0.4 ? 90 : 35;
        break;
    }

    keyframes.push({ frame: f, timeMs: f * 40, position: [x, y, z], rotation: [tilt, pan, roll], fov });
  }

  return {
    movementPreset,
    cameraTrackingData: {
      protocol: "FreeD_D1_Synchronized",
      fps: 25,
      totalFrames,
      durationMs,
      keyframes
    },
    project: aepProject
  };
}
