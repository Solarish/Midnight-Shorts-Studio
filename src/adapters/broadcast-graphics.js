import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Generate broadcast lower-third strap
 */
export async function renderLowerThird(input, context) {
  const {
    speakerName = "อาจารย์ตัวอย่าง",
    academicTitle = "มหาวิทยาลัยสงขลานครินทร์",
    department = "",
    theme = "psu_navy_gold",
    startMs = 1600,
    durationMs = 5000,
    track = 3
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const graphicsDir = path.join(runDir, "graphics");
  await fs.mkdir(graphicsDir, { recursive: true });

  const id = `lt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const pngPath = path.join(graphicsDir, `${id}.png`);
  const movPath = path.join(graphicsDir, `${id}.mov`);

  const pyScript = `
import sys
from PIL import Image, ImageDraw, ImageFont

img = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

font_path = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"
f_title = ImageFont.truetype(font_path, 28, index=2)
f_name = ImageFont.truetype(font_path, 44, index=3)
f_dept = ImageFont.truetype(font_path, 24, index=1)

# Navy box with gold accent bar
draw.rectangle([100, 840, 1100, 980], fill=(7, 17, 38, 235))
draw.rectangle([100, 840, 110, 980], fill=(212, 175, 55, 255))
draw.rectangle([100, 840, 1100, 844], fill=(212, 175, 55, 180))

draw.text((130, 852), """${academicTitle}""", font=f_title, fill=(212, 175, 55))
draw.text((130, 888), """${speakerName}""", font=f_name, fill=(255, 255, 255))
if """${department}""":
    draw.text((130, 942), """${department}""", font=f_dept, fill=(148, 163, 184))

img.save("""${pngPath}""")
`;

  spawnSync("python3", ["-c", pyScript], { encoding: "utf8" });

  const durSec = (durationMs / 1000).toFixed(2);
  const fadeOutStart = ((durationMs - 600) / 1000).toFixed(2);

  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", pngPath,
    "-vf", `fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st=${fadeOutStart}:d=0.5:alpha=1`,
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    movPath
  ], { encoding: "utf8" });

  return {
    overlay: {
      id,
      asset: movPath,
      startMs,
      durationMs,
      track,
      type: "lower_third"
    }
  };
}

/**
 * Generate broadcast news breaking strap
 */
export async function renderNewsStrap(input, context) {
  const {
    headline = "ข่าวด่วน",
    subline = "ศูนย์ข่าว ม.อ. รายงาน",
    kicker = "BREAKING NEWS",
    startMs = 0,
    durationMs = 6000,
    track = 3
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const graphicsDir = path.join(runDir, "graphics");
  await fs.mkdir(graphicsDir, { recursive: true });

  const id = `strap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const pngPath = path.join(graphicsDir, `${id}.png`);
  const movPath = path.join(graphicsDir, `${id}.mov`);

  const pyScript = `
import sys
from PIL import Image, ImageDraw, ImageFont

img = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

font_path = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"
f_kicker = ImageFont.truetype(font_path, 26, index=3)
f_head = ImageFont.truetype(font_path, 40, index=3)
f_sub = ImageFont.truetype(font_path, 26, index=1)

# Breaking Red Kicker Box
draw.rectangle([100, 820, 360, 860], fill=(220, 38, 38, 255))
draw.text((120, 826), """${kicker}""", font=f_kicker, fill=(255, 255, 255))

# Dark Glass Body
draw.rectangle([100, 860, 1400, 970], fill=(15, 23, 42, 240))
draw.rectangle([100, 860, 108, 970], fill=(220, 38, 38, 255))

draw.text((130, 874), """${headline}""", font=f_head, fill=(255, 255, 255))
draw.text((130, 926), """${subline}""", font=f_sub, fill=(203, 213, 225))

img.save("""${pngPath}""")
`;

  spawnSync("python3", ["-c", pyScript], { encoding: "utf8" });

  const durSec = (durationMs / 1000).toFixed(2);
  const fadeOutStart = ((durationMs - 500) / 1000).toFixed(2);

  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", pngPath,
    "-vf", `fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=${fadeOutStart}:d=0.4:alpha=1`,
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    movPath
  ], { encoding: "utf8" });

  return {
    overlay: {
      id,
      asset: movPath,
      startMs,
      durationMs,
      track,
      type: "news_strap"
    }
  };
}

/**
 * Generate bottom continuous ticker crawl
 */
export async function renderTickerCrawl(input, context) {
  const {
    badgeText = "PSU NEWS UPDATE",
    items = ["มหาวิทยาลัยสงขลานครินทร์"],
    startMs = 0,
    durationMs = 30000,
    track = 4
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const graphicsDir = path.join(runDir, "graphics");
  await fs.mkdir(graphicsDir, { recursive: true });

  const id = `ticker_${Date.now()}`;
  const pngPath = path.join(graphicsDir, `${id}.png`);
  const movPath = path.join(graphicsDir, `${id}.mov`);

  const tickerText = items.join("   ◆   ");

  const pyScript = `
from PIL import Image, ImageDraw, ImageFont

img = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
font_path = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"
f_badge = ImageFont.truetype(font_path, 22, index=3)
f_text = ImageFont.truetype(font_path, 26, index=2)

draw.rectangle([0, 1016, 1920, 1080], fill=(10, 15, 29, 245))
draw.rectangle([0, 1016, 1920, 1019], fill=(212, 175, 55, 255))
draw.rectangle([0, 1016, 260, 1080], fill=(220, 38, 38, 255))
draw.text((25, 1032), """${badgeText}""", font=f_badge, fill=(255, 255, 255))
draw.text((290, 1030), """${tickerText}""", font=f_text, fill=(241, 245, 249))

img.save("""${pngPath}""")
`;

  spawnSync("python3", ["-c", pyScript], { encoding: "utf8" });

  const durSec = (durationMs / 1000).toFixed(2);
  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", pngPath,
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    movPath
  ], { encoding: "utf8" });

  return {
    overlay: {
      id,
      asset: movPath,
      startMs,
      durationMs,
      track,
      type: "ticker_crawl"
    }
  };
}

/**
 * Generate laboratory reaction countdown timer
 */
export async function renderCountdownTimer(input, context) {
  const {
    durationSeconds = 30,
    stepNumber = 1,
    stepTitle = "Lab Step",
    startMs = 0,
    durationMs = 10000,
    track = 4
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const graphicsDir = path.join(runDir, "graphics");
  await fs.mkdir(graphicsDir, { recursive: true });

  const id = `timer_${Date.now()}`;
  const pngPath = path.join(graphicsDir, `${id}.png`);
  const movPath = path.join(graphicsDir, `${id}.mov`);

  const pyScript = `
from PIL import Image, ImageDraw, ImageFont

img = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
font_path = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"
f_step = ImageFont.truetype(font_path, 22, index=3)
f_time = ImageFont.truetype(font_path, 42, index=3)
f_title = ImageFont.truetype(font_path, 24, index=1)

draw.rectangle([1520, 60, 1860, 180], fill=(7, 17, 38, 235), outline=(56, 189, 248), width=2)
draw.rectangle([1520, 60, 1860, 95], fill=(56, 189, 248, 255))
draw.text((1540, 66), f"STEP {int(${stepNumber})}: TIME REMAINING", font=f_step, fill=(7, 17, 38))
draw.text((1540, 105), f"00:{int(${durationSeconds}):02d}s", font=f_time, fill=(255, 255, 255))
draw.text((1700, 118), """${stepTitle}""", font=f_title, fill=(148, 163, 184))

img.save("""${pngPath}""")
`;

  spawnSync("python3", ["-c", pyScript], { encoding: "utf8" });

  const durSec = (durationMs / 1000).toFixed(2);
  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", pngPath,
    "-vf", "fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=9.5:d=0.5:alpha=1",
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    movPath
  ], { encoding: "utf8" });

  return {
    overlay: {
      id,
      asset: movPath,
      startMs,
      durationMs,
      track,
      type: "countdown_timer"
    }
  };
}
