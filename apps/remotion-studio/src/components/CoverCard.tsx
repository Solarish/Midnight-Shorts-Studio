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
  doodleOpacity?: number;
  doodleScale?: number;
  doodlePreset?: DoodlePresetId;
  doodlePaths?: DoodlePath[];
  doodleAssetSet?: string[];
  personX?: number;
  personY?: number;
  personScale?: number;
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
  doodleOpacity = 1,
  doodleScale = 1,
  doodlePreset = "none",
  doodlePaths = [],
  doodleAssetSet,
  personX = 0.72,
  personY = 0.5,
  personScale = 1,
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

      {doodlePaths.length ? <DoodlePathOverlay paths={Array.isArray(doodleAssetSet) ? doodlePaths.map((path) => ({ ...path, assetSet: doodleAssetSet })) : doodlePaths} opacity={1} scale={1} /> : doodlePreset !== "none" ? <DoodleOverlayPreset preset={doodlePreset} opacity={doodleOpacity} scale={doodleScale} /> : resolvedDoodle ? <DoodlePathOverlay paths={[{ id: "ai-doodle-asset", points: [{ x: .12, y: .16 }, { x: .88, y: .16 }, { x: .12, y: .84 }, { x: .88, y: .84 }], assetSet: [resolvedDoodle], frequency: 1, spacing: .01, size: .55, rotation: "fixed", opacity: 1, seed: 1 }]} opacity={doodleOpacity} scale={doodleScale} /> : null}
      {resolvedPerson ? <Img src={resolvedPerson} style={{ position: "absolute", left: `${personX * 100}%`, top: `${personY * 100}%`, width: `${Math.min(100, 55 * personScale)}%`, height: "auto", maxHeight: "100%", objectFit: "contain", transform: "translate(-50%, -50%)", zIndex: 5 }} /> : null}

      {/* Decorative Brand Accent Line */}
      <div
        style={{
          position: "absolute",
          top: aspectRatio === "9:16" ? "15%" : "12%",
          left: "8%",
          width: 80,
          height: 6,
          backgroundColor: primaryColor,
          borderRadius: 3,
          boxShadow: `0 0 16px ${primaryColor}`
        }}
      />

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
