import fs from "node:fs/promises";
import path from "node:path";
import { resolveFontPath } from "./typography-engine.js";

/**
 * Formats milliseconds to SRT timecode format (HH:MM:SS,mmm)
 */
function msToSrtTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const mmm = String(Math.floor(ms % 1000)).padStart(3, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  const mm = String(Math.floor((totalSec / 60) % 60)).padStart(2, "0");
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  return `${hh}:${mm}:${ss},${mmm}`;
}

/**
 * Formats milliseconds to WebVTT timecode format (HH:MM:SS.mmm)
 */
function msToVttTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const mmm = String(Math.floor(ms % 1000)).padStart(3, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  const mm = String(Math.floor((totalSec / 60) % 60)).padStart(2, "0");
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  return `${hh}:${mm}:${ss}.${mmm}`;
}

/**
 * Generates SRT, WebVTT, and styled ASS subtitles from dialogue cue segments.
 */
export async function generateCaptions(input, context) {
  const {
    cues = [],
    fontFamily = "sukhumvit",
    fontSize = 32,
    primaryColor = "&H00FFFFFF", // White in ASS
    outlineColor = "&H00000000", // Black in ASS
    outlineWidth = 2,
    alignment = 2, // 2 = bottom-center in ASS
    outputName = "dialogue_captions"
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const outDir = path.join(runDir, "captions");
  await fs.mkdir(outDir, { recursive: true });

  const srtPath = path.join(outDir, `${outputName}.srt`);
  const vttPath = path.join(outDir, `${outputName}.vtt`);
  const assPath = path.join(outDir, `${outputName}.ass`);

  // Build SRT
  let srtContent = "";
  let vttContent = "WEBVTT\n\n";

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const startMs = Number(cue.startMs || 0);
    const endMs = Number(cue.endMs || startMs + (cue.durationMs || 3000));
    const text = String(cue.text || "").trim();

    // SRT
    srtContent += `${i + 1}\n`;
    srtContent += `${msToSrtTime(startMs)} --> ${msToSrtTime(endMs)}\n`;
    srtContent += `${text}\n\n`;

    // VTT
    vttContent += `${i + 1}\n`;
    vttContent += `${msToVttTime(startMs)} --> ${msToVttTime(endMs)}\n`;
    vttContent += `${text}\n\n`;
  }

  // Build ASS
  const resolvedFont = path.basename(resolveFontPath(fontFamily), path.extname(resolveFontPath(fontFamily)));
  let assContent = `[Script Info]
Title: PSU AVA Broadcast Captions
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${resolvedFont},${fontSize},${primaryColor},&H000000FF,${outlineColor},&H80000000,-1,0,0,0,100,100,0,0,1,${outlineWidth},1,${alignment},60,60,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  for (const cue of cues) {
    const startMs = Number(cue.startMs || 0);
    const endMs = Number(cue.endMs || startMs + (cue.durationMs || 3000));
    const text = String(cue.text || "").trim().replace(/\n/g, "\\N");
    const sTime = msToVttTime(startMs).slice(0, 10);
    const eTime = msToVttTime(endMs).slice(0, 10);
    assContent += `Dialogue: 0,${sTime},${eTime},Default,,0,0,0,,${text}\n`;
  }

  await fs.writeFile(srtPath, srtContent, "utf8");
  await fs.writeFile(vttPath, vttContent, "utf8");
  await fs.writeFile(assPath, assContent, "utf8");

  return {
    srtPath,
    vttPath,
    assPath,
    totalCues: cues.length,
    fontFamily,
    fontSize
  };
}
