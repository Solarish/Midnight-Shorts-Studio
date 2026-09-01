import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Generate 2-Box DVE Split Screen Video Scene (e.g. Anchor + Field Reporter)
 */
export async function createSplitScreen2Box(input, context) {
  const {
    leftSource,
    rightSource,
    leftLabel = "STUDIO / ศูนย์ข่าว",
    rightLabel = "LIVE / รายงานสด",
    startMs = 0,
    durationMs = 10000,
    outputProfile = { width: 1920, height: 1080, frameRate: 25 }
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const layoutDir = path.join(runDir, "layouts");
  await fs.mkdir(layoutDir, { recursive: true });

  const id = `split2box_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const outputPath = path.join(layoutDir, `${id}.mov`);

  const durSec = (durationMs / 1000).toFixed(2);

  // FFmpeg 2-box DVE filter:
  // - Background: Dark Navy Canvas #071126
  // - Left Box: 840x540 at x=80, y=270
  // - Right Box: 840x540 at x=1000, y=270
  // - Gold Borders + Badges
  const filter = [
    `[0:v]scale=840:540:force_original_aspect_ratio=increase,crop=840:540[left_v]`,
    `[1:v]scale=840:540:force_original_aspect_ratio=increase,crop=840:540[right_v]`,
    `[2:v][left_v]overlay=80:270[bg1]`,
    `[bg1][right_v]overlay=1000:270[bg2]`,
    `[bg2]drawbox=x=76:y=266:w=848:h=548:color=#d4af37@0.9:t=4[bg3]`,
    `[bg3]drawbox=x=996:y=266:w=848:h=548:color=#d4af37@0.9:t=4[v]`
  ].join(";");

  // Mix audio: Left audio to L, Right audio to R or center sum
  const audioFilter = `[0:a][1:a]amix=inputs=2:normalize=0[a]`;

  spawnSync("ffmpeg", [
    "-y",
    "-ss", "0", "-t", durSec, "-i", leftSource,
    "-ss", "0", "-t", durSec, "-i", rightSource,
    "-f", "lavfi", "-t", durSec, "-i", `color=c=#071126:s=${outputProfile.width}x${outputProfile.height}:r=${outputProfile.frameRate}`,
    "-filter_complex", `${filter};${audioFilter}`,
    "-map", "[v]",
    "-map", "[a]",
    "-c:v", "prores_ks", "-profile:v", "2",
    "-c:a", "pcm_s16le",
    "-r", String(outputProfile.frameRate),
    outputPath
  ], { encoding: "utf8" });

  return {
    scene: {
      id,
      source: outputPath,
      startMs,
      durationMs,
      track: 1,
      type: "split_screen_2box",
      leftLabel,
      rightLabel
    }
  };
}

/**
 * Generate 70/30 or 50/50 Courseware Side-by-Side Presentation Layout
 */
export async function createSideBySideLayout(input, context) {
  const {
    presenterSource,
    slideSource,
    layoutMode = "slide_major_70_30", // 70% Slide on Left, 30% Presenter on Right
    startMs = 0,
    durationMs = 15000,
    outputProfile = { width: 1920, height: 1080, frameRate: 25 }
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const layoutDir = path.join(runDir, "layouts");
  await fs.mkdir(layoutDir, { recursive: true });

  const id = `sidebyside_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const outputPath = path.join(layoutDir, `${id}.mov`);

  const durSec = (durationMs / 1000).toFixed(2);

  // 70/30 Layout:
  // - Slide: 1300x730 at x=50, y=175
  // - Presenter: 480x730 at x=1390, y=175
  const filter = [
    `[0:v]scale=1300:730:force_original_aspect_ratio=decrease,pad=1300:730:(ow-iw)/2:(oh-ih)/2[slide_v]`,
    `[1:v]scale=480:730:force_original_aspect_ratio=increase,crop=480:730[pres_v]`,
    `[2:v][slide_v]overlay=50:175[bg1]`,
    `[bg1][pres_v]overlay=1390:175[bg2]`,
    `[bg2]drawbox=x=46:y=171:w=1308:h=738:color=#38bdf8@0.8:t=4[bg3]`,
    `[bg3]drawbox=x=1386:y=171:w=488:h=738:color=#d4af37@0.8:t=4[v]`
  ].join(";");

  spawnSync("ffmpeg", [
    "-y",
    "-ss", "0", "-t", durSec, "-i", slideSource,
    "-ss", "0", "-t", durSec, "-i", presenterSource,
    "-f", "lavfi", "-t", durSec, "-i", `color=c=#091428:s=${outputProfile.width}x${outputProfile.height}:r=${outputProfile.frameRate}`,
    "-filter_complex", filter,
    "-map", "[v]",
    "-map", "1:a:0", // Use presenter audio
    "-c:v", "prores_ks", "-profile:v", "2",
    "-c:a", "pcm_s16le",
    "-r", String(outputProfile.frameRate),
    outputPath
  ], { encoding: "utf8" });

  return {
    scene: {
      id,
      source: outputPath,
      startMs,
      durationMs,
      track: 1,
      type: "side_by_side"
    }
  };
}

/**
 * Reframe 16:9 video to 9:16 Vertical for TikTok / Reels / Shorts
 * Modes: "blurred_pillar", "center_crop"
 */
export async function reframeToVertical(input, context) {
  const {
    source,
    mode = "blurred_pillar",
    startMs = 0,
    durationMs = 10000,
    outputProfile = { width: 1080, height: 1920, frameRate: 25 }
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const layoutDir = path.join(runDir, "layouts");
  await fs.mkdir(layoutDir, { recursive: true });

  const id = `reframe916_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const outputPath = path.join(layoutDir, `${id}.mov`);

  const durSec = (durationMs / 1000).toFixed(2);

  let filter = "";
  if (mode === "blurred_pillar") {
    // 9:16 canvas (1080x1920):
    // - Background: Original video scaled to fill 1080x1920 with heavy boxblur
    // - Foreground: Original video scaled to 1080 width in the vertical center (y=656 to 1264)
    filter = [
      `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:20[bg_v]`,
      `[0:v]scale=1080:608:force_original_aspect_ratio=decrease[fg_v]`,
      `[bg_v][fg_v]overlay=0:(H-h)/2[v]`
    ].join(";");
  } else {
    // Center crop
    filter = `[0:v]scale=3413:1920:force_original_aspect_ratio=increase,crop=1080:1920:(iw-1080)/2:0[v]`;
  }

  spawnSync("ffmpeg", [
    "-y",
    "-ss", "0", "-t", durSec, "-i", source,
    "-filter_complex", filter,
    "-map", "[v]",
    "-map", "0:a:0?",
    "-c:v", "prores_ks", "-profile:v", "2",
    "-c:a", "pcm_s16le",
    "-r", String(outputProfile.frameRate),
    outputPath
  ], { encoding: "utf8" });

  return {
    reframeVideo: outputPath,
    scene: {
      id,
      source: outputPath,
      startMs,
      durationMs,
      track: 1,
      aspectRatio: "9:16"
    }
  };
}
