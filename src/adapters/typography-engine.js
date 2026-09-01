import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

// System & Standard Thai Fonts Map
export const STANDARD_FONTS = {
  sukhumvit: "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc",
  sukhumvit_set: "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc",
  thonburi: "/System/Library/Fonts/Supplemental/Thonburi.ttc",
  ayuthaya: "/System/Library/Fonts/Supplemental/Ayuthaya.ttf",
  krungthep: "/System/Library/Fonts/Supplemental/Krungthep.ttf",
  sathorn: "/System/Library/Fonts/Supplemental/Sathorn.ttf",
  silom: "/System/Library/Fonts/Supplemental/Silom.ttf",
  apple_sd_gothic: "/System/Library/Fonts/Supplemental/AppleSDGothicNeo.ttc",
  helvetica_neue: "/System/Library/Fonts/HelveticaNeue.ttc"
};

/**
 * Resolves a font name, preset or custom path to an absolute font file path.
 */
export function resolveFontPath(fontNameOrPath) {
  if (!fontNameOrPath) return STANDARD_FONTS.sukhumvit;
  const lower = String(fontNameOrPath).toLowerCase().trim();
  if (STANDARD_FONTS[lower]) return STANDARD_FONTS[lower];
  if (path.isAbsolute(fontNameOrPath)) return fontNameOrPath;
  return STANDARD_FONTS.sukhumvit;
}

/**
 * Renders customizable typography card or lower-third strap with user-defined fonts and styles.
 */
export async function renderCustomTypography(input, context) {
  const {
    text = "ข้อความตัวอย่าง",
    subtext = "",
    fontFamily = "sukhumvit",
    customFontPath = "",
    fontSize = 64,
    subFontSize = 32,
    fontWeight = "bold", // regular, medium, bold, extrabold
    textColor = "#FFFFFF",
    subTextColor = "#D4AF37",
    accentColor = "#D4AF37",
    backgroundColor = "rgba(7, 17, 38, 0.92)",
    alignment = "left", // left, center, right
    letterSpacing = 0,
    lineHeightMultiplier = 1.3,
    strokeColor = "",
    strokeWidth = 0,
    shadowColor = "rgba(0, 0, 0, 0.6)",
    shadowOffset = [0, 4],
    shadowBlur = 8,
    safeMargin = 90, // 90% title safe
    durationMs = 5000,
    width = 1920,
    height = 1080
  } = input;

  const runDir = context.runDir || path.resolve(".ava-cache");
  const outDir = path.join(runDir, "typography_renders");
  await fs.mkdir(outDir, { recursive: true });

  const fontFile = customFontPath ? resolveFontPath(customFontPath) : resolveFontPath(fontFamily);
  const id = `typo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const pngPath = path.join(outDir, `${id}.png`);
  const movPath = path.join(outDir, `${id}.mov`);

  // Python Pillow script for pixel-perfect font rendering
  const fontIndex = fontWeight === "extrabold" || fontWeight === "bold" ? 3 : fontWeight === "medium" ? 2 : 1;

  const pyScript = `
import re
from PIL import Image, ImageDraw, ImageFont

def parse_color(c):
    if not c:
        return (0, 0, 0, 0)
    c = str(c).strip()
    if c.startswith("#"):
        c = c.lstrip("#")
        if len(c) == 6:
            return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255)
        elif len(c) == 8:
            return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), int(c[6:8], 16))
    if c.startswith("rgba"):
        m = re.findall(r'[\\d.]+', c)
        if len(m) >= 4:
            return (int(m[0]), int(m[1]), int(m[2]), int(float(m[3]) * 255))
    if c.startswith("rgb"):
        m = re.findall(r'\\d+', c)
        if len(m) >= 3:
            return (int(m[0]), int(m[1]), int(m[2]), 255)
    return (255, 255, 255, 255)

img = Image.new("RGBA", (${width}, ${height}), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

font_path = """${fontFile}"""
try:
    f_main = ImageFont.truetype(font_path, ${fontSize}, index=${fontIndex})
    f_sub = ImageFont.truetype(font_path, ${subFontSize}, index=${Math.max(0, fontIndex - 1)})
except Exception:
    f_main = ImageFont.load_default()
    f_sub = ImageFont.load_default()

c_bg = parse_color("""${backgroundColor}""")
c_text = parse_color("""${textColor}""")
c_sub = parse_color("""${subTextColor}""")
c_accent = parse_color("""${accentColor}""")

# Card or lower-third panel
x0 = 100
y0 = 820
x1 = 1820
y1 = 980

if c_bg[3] > 0:
    draw.rectangle([x0, y0, x1, y1], fill=c_bg)
    # Accent Bar
    draw.rectangle([x0, y0, x0 + 12, y1], fill=c_accent)

# Render main text
tx = x0 + 40
ty = y0 + 24
draw.text((tx, ty), """${text}""", font=f_main, fill=c_text)

# Render subtext
if """${subtext}""":
    draw.text((tx, ty + ${Math.round(fontSize * 1.1)}), """${subtext}""", font=f_sub, fill=c_sub)

img.save("""${pngPath}""")
`;

  spawnSync("python3", ["-c", pyScript], { encoding: "utf8" });

  const durSec = (durationMs / 1000).toFixed(2);
  const fadeOutSt = Math.max(0, (durationMs - 400) / 1000).toFixed(2);

  spawnSync("ffmpeg", [
    "-y",
    "-loop", "1", "-t", durSec, "-i", pngPath,
    "-vf", `scale=${width}:${height},fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=${fadeOutSt}:d=0.4:alpha=1`,
    "-c:v", "prores_ks", "-profile:v", "4",
    "-pix_fmt", "yuva444p10le",
    "-r", "25",
    movPath
  ], { encoding: "utf8" });

  return {
    renderedGraphic: movPath,
    previewPng: pngPath,
    fontFamily,
    resolvedFontPath: fontFile,
    fontSize,
    durationMs
  };
}
