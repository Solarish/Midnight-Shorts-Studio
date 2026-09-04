import React, { useState } from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PresetWrapper } from "../presets";
import { resolveMediaUrl } from "../media-resolver";
import type { AspectRatioMode, CoverTextStyles, DoodlePath, DoodlePresetId, MotionPresetType, StudioThemeProps, TextLayerStyle } from "../types";
import { DoodleOverlayPreset, DoodlePathOverlay } from "../presets/DoodleOverlayPreset";

interface CoverCardProps {
  sourceImage?: string;
  backgroundImage?: string;
  personImage?: string;
  doodleImage?: string;
  doodleEnabled?: boolean;
  doodleOpacity?: number;
  doodleScale?: number;
  doodleSeed?: number;
  doodlePreset?: DoodlePresetId;
  doodlePaths?: DoodlePath[];
  doodleAssetSet?: string[];
  personX?: number;
  personY?: number;
  personScale?: number;
  personSticker?: boolean;
  personStickerPreset?: "solid-white" | "comic-pop" | "retro-shadow" | "none";
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  personName?: string;
  positionTitle?: string;
  award?: string;
  textStyles?: CoverTextStyles;
  aspectRatio?: AspectRatioMode;
  motionPreset?: MotionPresetType;
  theme?: StudioThemeProps;
}

export const CoverCard: React.FC<CoverCardProps> = ({
  sourceImage,
  backgroundImage,
  personImage,
  doodleImage,
  doodleEnabled = false,
  doodleOpacity = 1,
  doodleScale = 1,
  doodleSeed = 1,
  doodlePreset = "none",
  doodlePaths = [],
  doodleAssetSet,
  personX = 0.72,
  personY = 0.5,
  personScale = 1,
  personSticker = true,
  personStickerPreset = "solid-white",
  eyebrow = "PSU BROADCAST SPECIAL REPORT",
  title = "รายงานพิเศษประจำสัปดาห์",
  subtitle = "มหาวิทยาลัยสงขลานครินทร์",
  personName,
  positionTitle,
  award,
  textStyles,
  aspectRatio = "9:16",
  motionPreset = "Spring",
  theme
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [hasImageError, setHasImageError] = useState(false);

  const primaryColor = theme?.primaryColor ?? "#E5A93C"; // Warm Gold
  const accentColor = theme?.accentColor ?? "#00E5FF"; // Bright Cyan
  const textColor = theme?.textColor ?? "#FFFFFF";
  const fontFamily =
    theme?.fontFamily ??
    "-apple-system, BlinkMacSystemFont, 'Prompt', 'Kanit', 'Noto Sans Thai', sans-serif";

  const displayTitle = personName || title;
  const displaySubtitle = positionTitle || subtitle;
  const displayEyebrow = award || eyebrow;

  const titleSize = aspectRatio === "9:16" ? 64 : aspectRatio === "16:9" ? 56 : 50;
  const systemFont = theme?.fontFamily ?? "-apple-system, BlinkMacSystemFont, 'Prompt', 'Kanit', 'Noto Sans Thai', sans-serif";
  const defaults: Record<"eyebrow" | "title" | "subtitle", TextLayerStyle> = aspectRatio === "9:16"
    ? {
        eyebrow: { fontFamily: "system", positionX: 8, positionY: 34, size: titleSize * 0.4, color: primaryColor },
        title: { fontFamily: "system", positionX: 8, positionY: 45, size: titleSize, color: textColor },
        subtitle: { fontFamily: "system", positionX: 8, positionY: 58, size: titleSize * 0.45, color: accentColor }
      }
    : {
        eyebrow: { fontFamily: "system", positionX: 8, positionY: 68, size: titleSize * 0.4, color: primaryColor },
        title: { fontFamily: "system", positionX: 8, positionY: 77, size: titleSize, color: textColor },
        subtitle: { fontFamily: "system", positionX: 8, positionY: 88, size: titleSize * 0.45, color: accentColor }
      };
  const styleFor = (key: "eyebrow" | "title" | "subtitle") => ({ ...defaults[key], ...(textStyles?.[key] ?? {}) });
  const renderText = (key: "eyebrow" | "title" | "subtitle", value: string | undefined, weight: number, lineHeight: number) => {
    if (!value) return null;
    const style = styleFor(key);
    const x = Math.max(0, Math.min(100, Number(style.positionX ?? defaults[key].positionX)));
    const y = Math.max(0, Math.min(100, Number(style.positionY ?? defaults[key].positionY)));
    const size = Math.max(8, Number(style.size ?? defaults[key].size));
    const family = style.fontFamily === "psu-stidti" ? "'PSU Stidti', sans-serif" : systemFont;
    return <div style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translateY(-50%)", color: style.color ?? defaults[key].color, fontFamily: family, fontSize: size, fontWeight: weight, lineHeight, maxWidth: "84%", textShadow: "0 3px 14px rgba(0,0,0,.82)" }}>{value}</div>;
  };

  // Background slow ambient zoom
  const bgScale = interpolate(frame, [0, fps * 10], [1.0, 1.08]);
  // sourceImage is the person input for Remove Background. It must never be
  // used as the canvas background when a cutout/background has not been made.
  const resolvedImage = resolveMediaUrl(backgroundImage);
  const resolvedPerson = resolveMediaUrl(personImage);
  const resolvedDoodle = resolveMediaUrl(doodleImage);
  const resolvedSource = resolveMediaUrl(sourceImage);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0B1220",
        overflow: "hidden",
        fontFamily
      }}
    >
      {/* Background Graphic or Plate */}
      {resolvedImage && !hasImageError ? (
        <AbsoluteFill style={{ transform: `scale(${bgScale})`, transformOrigin: "center center" }}>
          <Img
            src={resolvedImage}
            onError={() => setHasImageError(true)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover"
            }}
          />
          {/* Subtle cinematic gradient overlays */}
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, rgba(11,18,32,0.3) 0%, rgba(11,18,32,0.75) 70%, rgba(11,18,32,0.95) 100%)"
            }}
          />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(circle at center, #132238 0%, #0B1220 70%, #050811 100%)"
          }}
        />
      )}

      <style>{`
        @font-face {
          font-family: 'PSU Stidti';
          src: url('/fonts/psu-stidti-regular.woff2') format('woff2');
          font-weight: 400;
          font-style: normal;
        }
        @font-face {
          font-family: 'PSU Stidti';
          src: url('/fonts/psu-stidti-bold.woff2') format('woff2');
          font-weight: 700 800 900;
          font-style: normal;
        }
      `}</style>

      {doodleEnabled === true ? (
        doodlePaths.length ? (
          <DoodlePathOverlay paths={Array.isArray(doodleAssetSet) ? doodlePaths.map((path) => ({ ...path, assetSet: doodleAssetSet })) : doodlePaths} opacity={1} scale={1} />
        ) : doodlePreset !== "none" ? (
          <DoodleOverlayPreset preset={doodlePreset} opacity={doodleOpacity} scale={doodleScale} seed={doodleSeed} />
        ) : resolvedDoodle ? (
          <DoodlePathOverlay paths={[{ id: "ai-doodle-asset", points: [{ x: .12, y: .16 }, { x: .88, y: .16 }, { x: .12, y: .84 }, { x: .88, y: .84 }], assetSet: [resolvedDoodle], frequency: 1, spacing: .01, size: .55, rotation: "fixed", opacity: 1, seed: 1 }]} opacity={doodleOpacity} scale={doodleScale} />
        ) : null
      ) : null}
      {/* SVG Filters for 100% Solid Crisp Die-cut Sticker Strokes & Playful Effects */}
      <svg style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }} aria-hidden="true">
        <defs>
          {/* Preset 1: Solid Crisp White Sticker (Die-Cut Badge) */}
          <filter id="sticker-solid-white" x="-20%" y="-20%" width="140%" height="140%">
            <feMorphology in="SourceAlpha" result="DILATED" operator="dilate" radius="8" />
            <feFlood flood-color="#FFFFFF" flood-opacity="1" result="WHITE" />
            <feComposite in="WHITE" in2="DILATED" operator="in" result="SOLID_WHITE_OUTLINE" />
            <feDropShadow dx="4" dy="10" stdDeviation="0" flood-color="rgba(0, 0, 0, 0.75)" flood-opacity="1" result="HARD_SHADOW" />
            <feMerge>
              <feMergeNode in="HARD_SHADOW" />
              <feMergeNode in="SOLID_WHITE_OUTLINE" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Preset 2: Comic Pop Duo-Tone (White Inner + Warm Gold Outer + Pop Shadow) */}
          <filter id="sticker-comic-pop" x="-25%" y="-25%" width="150%" height="150%">
            <feMorphology in="SourceAlpha" result="DILATED_OUTER" operator="dilate" radius="12" />
            <feFlood flood-color="#E5A93C" flood-opacity="1" result="GOLD" />
            <feComposite in="GOLD" in2="DILATED_OUTER" operator="in" result="OUTER_STROKE" />
            <feMorphology in="SourceAlpha" result="DILATED_INNER" operator="dilate" radius="6" />
            <feFlood flood-color="#FFFFFF" flood-opacity="1" result="WHITE" />
            <feComposite in="WHITE" in2="DILATED_INNER" operator="in" result="INNER_STROKE" />
            <feDropShadow dx="6" dy="10" stdDeviation="0" flood-color="rgba(0, 0, 0, 0.85)" flood-opacity="1" result="POP_SHADOW" />
            <feMerge>
              <feMergeNode in="POP_SHADOW" />
              <feMergeNode in="OUTER_STROKE" />
              <feMergeNode in="INNER_STROKE" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Preset 3: Retro Cyan Comic Block Shadow (White Stroke + Navy Frame + Cyan Block) */}
          <filter id="sticker-retro-shadow" x="-25%" y="-25%" width="150%" height="150%">
            <feMorphology in="SourceAlpha" result="DILATED_BLACK" operator="dilate" radius="10" />
            <feFlood flood-color="#050811" flood-opacity="1" result="DARK" />
            <feComposite in="DARK" in2="DILATED_BLACK" operator="in" result="BLACK_OUTLINE" />
            <feMorphology in="SourceAlpha" result="DILATED_WHITE" operator="dilate" radius="6" />
            <feFlood flood-color="#FFFFFF" flood-opacity="1" result="WHITE" />
            <feComposite in="WHITE" in2="DILATED_WHITE" operator="in" result="WHITE_OUTLINE" />
            <feDropShadow dx="8" dy="10" stdDeviation="0" flood-color="#00E5FF" flood-opacity="0.9" result="CYAN_SHADOW" />
            <feMerge>
              <feMergeNode in="CYAN_SHADOW" />
              <feMergeNode in="BLACK_OUTLINE" />
              <feMergeNode in="WHITE_OUTLINE" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      {resolvedPerson ? (
        <Img
          src={resolvedPerson}
          style={{
            position: "absolute",
            left: `${personX * 100}%`,
            top: `${personY * 100}%`,
            width: "55%",
            height: "auto",
            objectFit: "contain",
            transform: `translate(-50%, -50%) scale(${personScale})`,
            transformOrigin: "center center",
            filter: personSticker !== false && personStickerPreset !== "none"
              ? `url(#sticker-${personStickerPreset || "solid-white"})`
              : "drop-shadow(0 10px 24px rgba(0,0,0,0.5))",
            zIndex: 5
          }}
        />
      ) : resolvedSource ? (
        /* Graceful Broadcast Portrait Card Fallback */
        <div
          style={{
            position: "absolute",
            left: `${personX * 100}%`,
            top: `${personY * 100}%`,
            width: aspectRatio === "9:16" ? "64%" : "36%",
            height: aspectRatio === "9:16" ? "42%" : "74%",
            transform: `translate(-50%, -50%) scale(${personScale})`,
            transformOrigin: "center center",
            zIndex: 5,
            borderRadius: "20px",
            overflow: "hidden",
            boxShadow: "0 20px 50px rgba(0,0,0,0.8), 0 0 0 2px rgba(229,169,60,0.4)",
            background: "#0F172A"
          }}
        >
          <Img
            src={resolvedSource}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover"
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, rgba(11,18,32,0) 60%, rgba(11,18,32,0.8) 100%)",
              pointerEvents: "none"
            }}
          />
        </div>
      ) : null}

      {/* Content Container with Selected Motion Preset */}
      <AbsoluteFill style={{ zIndex: 10 }}>
        <PresetWrapper preset={motionPreset} delayFrames={5} style={{ position: "absolute", inset: 0 }}>
          {renderText("eyebrow", displayEyebrow, 700, 1.2)}
          {renderText("title", displayTitle, 800, 1.25)}
          {renderText("subtitle", displaySubtitle, 500, 1.35)}
        </PresetWrapper>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
