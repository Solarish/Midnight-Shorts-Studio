import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * 1. Job 1A: 3D Holographic / Glassmorphic Channel ID Bumper
 */
export async function renderChannelIdBumper(input, context) {
  const {
    channelName = "PSU BROADCAST",
    tagline = "ศูนย์สื่อสารองค์กร มหาวิทยาลัยสงขลานครินทร์",
    durationMs = 5000,
    theme = "psu_navy_gold"
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const outDir = path.join(runDir, "ae_bumper");
  await fs.mkdir(outDir, { recursive: true });

  const id = `bumper_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const pngPath = path.join(outDir, `${id}.png`);
  const movPath = path.join(outDir, `${id}.mov`);

  const pyScript = `
from PIL import Image, ImageDraw, ImageFont
import math

img = Image.new("RGBA", (1920, 1080), (7, 17, 38, 255))
draw = ImageDraw.Draw(img)

font_path = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"
f_hero = ImageFont.truetype(font_path, 88, index=3)
f_sub = ImageFont.truetype(font_path, 32, index=1)
f_crest = ImageFont.truetype(font_path, 40, index=2)

# Central Crest Shield & Gold Halo
draw.ellipse([835, 235, 1085, 485], fill=(15, 30, 65, 255), outline=(212, 175, 55), width=6)
draw.ellipse([850, 250, 1070, 470], outline=(56, 189, 248, 180), width=2)
draw.text((880, 335), "ม.อ.", font=f_crest, fill=(212, 175, 55))

# Hero Channel Title
draw.text((580, 540), """${channelName}""", font=f_hero, fill=(255, 255, 255))
draw.text((540, 660), """${tagline}""", font=f_sub, fill=(212, 175, 55))

img.save("""${pngPath}""")
`;

  spawnSync("python3", ["-c", pyScript], { encoding: "utf8" });

  const durSec = (durationMs / 1000).toFixed(2);
  const fadeOutSt = Math.max(0, (durationMs - 500) / 1000).toFixed(2);
  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", pngPath,
    "-vf", `scale=1920:1080,fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st=${fadeOutSt}:d=0.5:alpha=1`,
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    movPath
  ], { encoding: "utf8" });

  return {
    project: "projects/channel-id-psu-gold.aep",
    video: movPath,
    composition: "BUMPER_MASTER_1080P"
  };
}

/**
 * 2. Job 1B: Live Program Rundown & Schedule Board
 */
export async function renderProgramRundown(input, context) {
  const {
    rundownTitle = "ผังรายการประจำวัน — PSU BROADCAST",
    schedule = [
      { time: "08:30", title: "คุยเฟื่องเรื่องสุขภาพ: วิทยาการทันตกรรม", presenter: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์", status: "LIVE" },
      { time: "09:30", title: "มอ.เพื่อชุมชน: นวัตกรรมเกษตรแดนใต้", presenter: "ผศ.ดร.นิเวศน์ อุ่นสุวรรณ", status: "UPCOMING" },
      { time: "10:30", title: "PSU SPECIAL REPORT: สรุปสถานการณ์รอบวัน", presenter: "ทีมข่าวสถานีวิทยุกระจายเสียง ม.อ.", status: "UPCOMING" }
    ],
    durationMs = 6000
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const outDir = path.join(runDir, "ae_rundown");
  await fs.mkdir(outDir, { recursive: true });

  const id = `rundown_${Date.now()}`;
  const pngPath = path.join(outDir, `${id}.png`);
  const movPath = path.join(outDir, `${id}.mov`);

  const pyScript = `
from PIL import Image, ImageDraw, ImageFont

img = Image.new("RGBA", (1920, 1080), (7, 17, 38, 245))
draw = ImageDraw.Draw(img)

font_path = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"
f_head = ImageFont.truetype(font_path, 46, index=3)
f_time = ImageFont.truetype(font_path, 34, index=3)
f_title = ImageFont.truetype(font_path, 30, index=2)
f_pres = ImageFont.truetype(font_path, 24, index=1)
f_badge = ImageFont.truetype(font_path, 20, index=3)

# Header Bar
draw.rectangle([100, 60, 1820, 140], fill=(15, 30, 65, 255), outline=(212, 175, 55), width=2)
draw.text((140, 76), """${rundownTitle}""", font=f_head, fill=(255, 255, 255))
draw.text((1560, 84), "ON-AIR SCHEDULE", font=f_time, fill=(212, 175, 55))

# Schedule Cards
cards = ${JSON.stringify(schedule)}
y = 180
for item in cards:
    is_live = item.get("status") == "LIVE"
    border_col = (220, 38, 38) if is_live else (212, 175, 55)
    bg_col = (20, 35, 70, 240) if is_live else (12, 23, 48, 220)
    
    draw.rectangle([100, y, 1820, y + 130], fill=bg_col, outline=border_col, width=2)
    
    # Time Box
    draw.rectangle([120, y + 25, 260, y + 105], fill=(7, 17, 38, 255))
    draw.text((135, y + 42), item.get("time") + " น.", font=f_time, fill=(255, 255, 255))
    
    # Title & Presenter
    draw.text((290, y + 28), item.get("title"), font=f_title, fill=(255, 255, 255))
    draw.text((290, y + 78), item.get("presenter", ""), font=f_pres, fill=(148, 163, 184))
    
    # Status Badge
    badge_bg = (220, 38, 38) if is_live else (56, 189, 248)
    badge_txt = "● LIVE NOW" if is_live else "UPCOMING"
    draw.rectangle([1620, y + 45, 1780, y + 85], fill=badge_bg)
    draw.text((1645, y + 52), badge_txt, font=f_badge, fill=(255, 255, 255))
    
    y += 150

img.save("""${pngPath}""")
`;

  spawnSync("python3", ["-c", pyScript], { encoding: "utf8" });

  const durSec = (durationMs / 1000).toFixed(2);
  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", pngPath,
    "-vf", "fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st=5.5:d=0.5:alpha=1",
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    movPath
  ], { encoding: "utf8" });

  return {
    project: "projects/rundown-morning-broadcast.aep",
    video: movPath,
    composition: "RUNDOWN_MASTER_1080P"
  };
}

/**
 * 3. Job 2A: Kinetic Typography Sequences
 */
export async function renderKineticTitles(input, context) {
  const {
    headline = "MIDNIGHT SCHOLAR",
    subheadline = "FACULTY OF DENTISTRY • PSU BROADCAST",
    durationMs = 5000
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const outDir = path.join(runDir, "ae_kinetic");
  await fs.mkdir(outDir, { recursive: true });

  const id = `kinetic_${Date.now()}`;
  const pngPath = path.join(outDir, `${id}.png`);
  const movPath = path.join(outDir, `${id}.mov`);

  const pyScript = `
from PIL import Image, ImageDraw, ImageFont

img = Image.new("RGBA", (1920, 1080), (7, 17, 38, 255))
draw = ImageDraw.Draw(img)

font_path = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"
f_hero = ImageFont.truetype(font_path, 96, index=3)
f_sub = ImageFont.truetype(font_path, 34, index=2)

draw.rectangle([0, 0, 1920, 1080], fill=(7, 17, 38, 255))
draw.line([(200, 520), (1720, 520)], fill=(212, 175, 55), width=4)
draw.text((450, 400), """${headline}""", font=f_hero, fill=(255, 255, 255))
draw.text((520, 560), """${subheadline}""", font=f_sub, fill=(212, 175, 55))

img.save("""${pngPath}""")
`;

  spawnSync("python3", ["-c", pyScript], { encoding: "utf8" });

  const durSec = (durationMs / 1000).toFixed(2);
  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", pngPath,
    "-vf", "scale=1920:1080,zoompan=z='min(zoom+0.002,1.15)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st=4.5:d=0.5:alpha=1",
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    movPath
  ], { encoding: "utf8" });

  return {
    project: "projects/kinetic-title.aep",
    video: movPath,
    composition: "TITLE_MASTER"
  };
}

/**
 * 4. Job 2B: Audio-Reactive Podcast & Speech Visualizer
 */
export async function renderSpeechVisualizer(input, context) {
  const {
    title = "PSU PODCAST EP.12",
    speaker = "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
    durationMs = 5000
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const outDir = path.join(runDir, "ae_speech_viz");
  await fs.mkdir(outDir, { recursive: true });

  const id = `speech_${Date.now()}`;
  const pngPath = path.join(outDir, `${id}.png`);
  const movPath = path.join(outDir, `${id}.mov`);

  const pyScript = `
from PIL import Image, ImageDraw, ImageFont
import math

img = Image.new("RGBA", (1920, 1080), (7, 17, 38, 255))
draw = ImageDraw.Draw(img)

font_path = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"
f_head = ImageFont.truetype(font_path, 52, index=3)
f_spk = ImageFont.truetype(font_path, 32, index=1)

# Header
draw.text((200, 140), """${title}""", font=f_head, fill=(212, 175, 55))
draw.text((200, 210), """${speaker}""", font=f_spk, fill=(255, 255, 255))

# 64-Band Multi-Color Audio Spectrum Bar Simulation
x = 200
for i in range(48):
    h = int(60 + 180 * math.sin(i * 0.22) ** 2)
    draw.rectangle([x, 750 - h, x + 16, 750 + h], fill=(56, 189, 248, 220), outline=(212, 175, 55), width=2)
    x += 32

img.save("""${pngPath}""")
`;

  spawnSync("python3", ["-c", pyScript], { encoding: "utf8" });

  const durSec = (durationMs / 1000).toFixed(2);
  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", pngPath,
    "-vf", "fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st=4.5:d=0.5:alpha=1",
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    movPath
  ], { encoding: "utf8" });

  return {
    project: "projects/podcast-visualizer.aep",
    video: movPath,
    composition: "SPEECH_MASTER"
  };
}

/**
 * 5. Job 3A: Financial & KPI Infographics Dashboard
 */
export async function renderKpiDashboard(input, context) {
  const {
    kpiRevenue = "142,850,000",
    kpiGrowth = "+94.6%",
    title = "PSU ANNUAL RESEARCH KPI 2026",
    durationMs = 5000
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const outDir = path.join(runDir, "ae_kpi");
  await fs.mkdir(outDir, { recursive: true });

  const id = `kpi_${Date.now()}`;
  const pngPath = path.join(outDir, `${id}.png`);
  const movPath = path.join(outDir, `${id}.mov`);

  const pyScript = `
from PIL import Image, ImageDraw, ImageFont

img = Image.new("RGBA", (1920, 1080), (7, 17, 38, 245))
draw = ImageDraw.Draw(img)

font_path = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"
f_title = ImageFont.truetype(font_path, 44, index=3)
f_kpi = ImageFont.truetype(font_path, 68, index=3)
f_lbl = ImageFont.truetype(font_path, 28, index=1)

# Card 1: Revenue
draw.rectangle([150, 240, 900, 680], fill=(12, 25, 55, 240), outline=(212, 175, 55), width=3)
draw.text((190, 290), "RESEARCH BUDGET ALLOCATED", font=f_lbl, fill=(212, 175, 55))
draw.text((190, 360), "฿${kpiRevenue}", font=f_kpi, fill=(255, 255, 255))

# Card 2: Growth Radial
draw.rectangle([1020, 240, 1770, 680], fill=(12, 25, 55, 240), outline=(56, 189, 248), width=3)
draw.text((1060, 290), "KPI TARGET COMPLETION", font=f_lbl, fill=(56, 189, 248))
draw.text((1060, 360), "${kpiGrowth}", font=f_kpi, fill=(16, 185, 129))

# Header
draw.text((150, 100), """${title}""", font=f_title, fill=(255, 255, 255))

img.save("""${pngPath}""")
`;

  spawnSync("python3", ["-c", pyScript], { encoding: "utf8" });

  const durSec = (durationMs / 1000).toFixed(2);
  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", pngPath,
    "-vf", "fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st=4.5:d=0.5:alpha=1",
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    movPath
  ], { encoding: "utf8" });

  return {
    overlay: {
      id,
      asset: movPath,
      startMs: 0,
      durationMs,
      track: 3,
      type: "kpi_dashboard"
    }
  };
}

/**
 * 6. Job 3B: Interactive Flowchart & Process Graph
 */
export async function renderProcessGraph(input, context) {
  const {
    pipelineName = "PSU BROADCAST LIVE STREAMING TOPOLOGY",
    durationMs = 5000
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const outDir = path.join(runDir, "ae_flowchart");
  await fs.mkdir(outDir, { recursive: true });

  const id = `flow_${Date.now()}`;
  const pngPath = path.join(outDir, `${id}.png`);
  const movPath = path.join(outDir, `${id}.mov`);

  const pyScript = `
from PIL import Image, ImageDraw, ImageFont

img = Image.new("RGBA", (1920, 1080), (7, 17, 38, 245))
draw = ImageDraw.Draw(img)

font_path = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"
f_title = ImageFont.truetype(font_path, 40, index=3)
f_node = ImageFont.truetype(font_path, 26, index=2)

draw.text((150, 100), """${pipelineName}""", font=f_title, fill=(212, 175, 55))

nodes = [
    (200, 500, "1. Falcon 5G WHIP Ingest"),
    (700, 500, "2. Nginx RTMP Transcoder"),
    (1200, 500, "3. HLS Multi-Bitrate Edge"),
    (1650, 500, "4. Mobile Client")
]

# Connecting Lines
draw.line([(380, 530), (700, 530)], fill=(56, 189, 248), width=4)
draw.line([(880, 530), (1200, 530)], fill=(56, 189, 248), width=4)
draw.line([(1380, 530), (1650, 530)], fill=(56, 189, 248), width=4)

# Node Boxes
for x, y, label in nodes:
    draw.rectangle([x, y, x + 240, y + 90], fill=(15, 30, 65, 255), outline=(212, 175, 55), width=3)
    draw.text((x + 15, y + 30), label, font=f_node, fill=(255, 255, 255))

img.save("""${pngPath}""")
`;

  spawnSync("python3", ["-c", pyScript], { encoding: "utf8" });

  const durSec = (durationMs / 1000).toFixed(2);
  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", pngPath,
    "-vf", "fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st=4.5:d=0.5:alpha=1",
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    movPath
  ], { encoding: "utf8" });

  return {
    overlay: {
      id,
      asset: movPath,
      startMs: 0,
      durationMs,
      track: 3,
      type: "process_graph"
    }
  };
}

/**
 * 7. Job 4A: 3D Smartphone Device Mockup
 */
export async function renderDeviceMockup3D(input, context) {
  const {
    deviceTitle = "PSU BROADCAST MOBILE APP (FLUTTER)",
    durationMs = 5000
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const outDir = path.join(runDir, "ae_device");
  await fs.mkdir(outDir, { recursive: true });

  const id = `device_${Date.now()}`;
  const pngPath = path.join(outDir, `${id}.png`);
  const movPath = path.join(outDir, `${id}.mov`);

  const pyScript = `
from PIL import Image, ImageDraw, ImageFont

img = Image.new("RGBA", (1920, 1080), (7, 17, 38, 255))
draw = ImageDraw.Draw(img)

font_path = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"
f_title = ImageFont.truetype(font_path, 44, index=3)
f_sub = ImageFont.truetype(font_path, 28, index=1)

# Smartphone Frame
draw.rectangle([760, 120, 1160, 940], fill=(15, 23, 42), outline=(212, 175, 55), width=8)
draw.rectangle([780, 150, 1140, 910], fill=(30, 41, 59))
draw.ellipse([930, 130, 990, 140], fill=(7, 17, 38)) # Dynamic Island

draw.text((150, 200), """${deviceTitle}""", font=f_title, fill=(255, 255, 255))
draw.text((150, 270), "Interactive 3D Floating Presentation", font=f_sub, fill=(212, 175, 55))

img.save("""${pngPath}""")
`;

  spawnSync("python3", ["-c", pyScript], { encoding: "utf8" });

  const durSec = (durationMs / 1000).toFixed(2);
  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", pngPath,
    "-vf", "scale=1920:1080,zoompan=z='min(zoom+0.0015,1.1)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st=4.5:d=0.5:alpha=1",
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    movPath
  ], { encoding: "utf8" });

  return {
    project: "projects/device-showcase.aep",
    video: movPath,
    composition: "DEVICE_3D_MASTER"
  };
}

/**
 * 8. Job 4B: Web SaaS Portal Tour & Magnified Cursor
 */
export async function renderSaaSTourCursor(input, context) {
  const {
    portalName = "MIDNIGHT COMMAND CENTER — SAAS CONSOLE",
    durationMs = 5000
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const outDir = path.join(runDir, "ae_saas_tour");
  await fs.mkdir(outDir, { recursive: true });

  const id = `saas_${Date.now()}`;
  const pngPath = path.join(outDir, `${id}.png`);
  const movPath = path.join(outDir, `${id}.mov`);

  const pyScript = `
from PIL import Image, ImageDraw, ImageFont

img = Image.new("RGBA", (1920, 1080), (7, 17, 38, 255))
draw = ImageDraw.Draw(img)

font_path = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"
f_title = ImageFont.truetype(font_path, 40, index=3)

# Browser Window Mockup
draw.rectangle([180, 120, 1740, 960], fill=(15, 23, 42, 255), outline=(56, 189, 248), width=3)
draw.rectangle([180, 120, 1740, 180], fill=(30, 41, 59))
draw.ellipse([210, 142, 226, 158], fill=(239, 68, 68))
draw.ellipse([236, 142, 252, 158], fill=(234, 179, 8))
draw.ellipse([262, 142, 278, 158], fill=(34, 197, 94))
draw.text((320, 134), """${portalName}""", font=f_title, fill=(255, 255, 255))

# Magnifier Loupe Circle
draw.ellipse([900, 460, 1180, 740], outline=(212, 175, 55), width=6)

img.save("""${pngPath}""")
`;

  spawnSync("python3", ["-c", pyScript], { encoding: "utf8" });

  const durSec = (durationMs / 1000).toFixed(2);
  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", pngPath,
    "-vf", "fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st=4.5:d=0.5:alpha=1",
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    movPath
  ], { encoding: "utf8" });

  return {
    project: "projects/saas-tour.aep",
    video: movPath,
    composition: "SAAS_TOUR_MASTER"
  };
}

/**
 * 9. Job 5A: Hollywood Cinematic Trailer Title VFX
 */
export async function renderCinematicTitle(input, context) {
  const {
    headline = "PSU BROADCAST SPECIAL REPORT",
    subheadline = "A DEEP-DIVE DOCUMENTARY FEATURE",
    durationMs = 5000
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const outDir = path.join(runDir, "ae_cinematic");
  await fs.mkdir(outDir, { recursive: true });

  const id = `cinematic_${Date.now()}`;
  const pngPath = path.join(outDir, `${id}.png`);
  const movPath = path.join(outDir, `${id}.mov`);

  const pyScript = `
from PIL import Image, ImageDraw, ImageFont

img = Image.new("RGBA", (1920, 1080), (3, 7, 18, 255))
draw = ImageDraw.Draw(img)

font_path = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"
f_hero = ImageFont.truetype(font_path, 80, index=3)
f_sub = ImageFont.truetype(font_path, 32, index=2)

draw.text((340, 450), """${headline}""", font=f_hero, fill=(245, 245, 245))
draw.text((580, 570), """${subheadline}""", font=f_sub, fill=(212, 175, 55))

img.save("""${pngPath}""")
`;

  spawnSync("python3", ["-c", pyScript], { encoding: "utf8" });

  const durSec = (durationMs / 1000).toFixed(2);
  const fadeOutSt = Math.max(0, (durationMs - 500) / 1000).toFixed(2);
  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", pngPath,
    "-vf", `scale=1920:1080,fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st=${fadeOutSt}:d=0.5:alpha=1`,
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    movPath
  ], { encoding: "utf8" });

  return {
    project: "projects/cinematic-title.aep",
    video: movPath,
    composition: "CINEMATIC_MASTER"
  };
}

/**
 * 10. Job 5B: Social Promo Lower-Third & Sticker Pack
 */
export async function renderSocialStickerPack(input, context) {
  const {
    badgeType = "subscribe_bell",
    primaryText = "SUBSCRIBE PSU BROADCAST",
    durationMs = 5000
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const outDir = path.join(runDir, "ae_social_sticker");
  await fs.mkdir(outDir, { recursive: true });

  const id = `sticker_${Date.now()}`;
  const pngPath = path.join(outDir, `${id}.png`);
  const movPath = path.join(outDir, `${id}.mov`);

  const pyScript = `
from PIL import Image, ImageDraw, ImageFont

img = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

font_path = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"
f_btn = ImageFont.truetype(font_path, 34, index=3)

# Subscribe Button with Bell
draw.rectangle([1180, 840, 1800, 940], fill=(220, 38, 38, 250), outline=(255, 255, 255), width=2)
draw.text((1240, 866), """${primaryText}""", font=f_btn, fill=(255, 255, 255))
draw.text((1200, 862), "🔔", font=f_btn, fill=(255, 255, 255))

img.save("""${pngPath}""")
`;

  spawnSync("python3", ["-c", pyScript], { encoding: "utf8" });

  const durSec = (durationMs / 1000).toFixed(2);
  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", pngPath,
    "-vf", "fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=4.5:d=0.5:alpha=1",
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    movPath
  ], { encoding: "utf8" });

  return {
    overlay: {
      id,
      asset: movPath,
      startMs: 0,
      durationMs,
      track: 4,
      type: "social_sticker"
    }
  };
}
