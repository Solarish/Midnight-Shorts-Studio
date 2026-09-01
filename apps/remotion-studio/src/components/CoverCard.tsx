import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PresetWrapper } from "../presets";
import type { AspectRatioMode, MotionPresetType, StudioThemeProps } from "../types";

interface CoverCardProps {
  sourceImage?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  personName?: string;
  positionTitle?: string;
  award?: string;
  aspectRatio?: AspectRatioMode;
  motionPreset?: MotionPresetType;
  theme?: StudioThemeProps;
}

export const CoverCard: React.FC<CoverCardProps> = ({
  sourceImage,
  eyebrow = "PSU BROADCAST SPECIAL REPORT",
  title = "รายงานพิเศษประจำสัปดาห์",
  subtitle = "มหาวิทยาลัยสงขลานครินทร์",
  personName,
  positionTitle,
  award,
  aspectRatio = "9:16",
  motionPreset = "Spring",
  theme
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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

  // Background slow ambient zoom
  const bgScale = interpolate(frame, [0, fps * 10], [1.0, 1.08]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0B1220",
        overflow: "hidden",
        fontFamily
      }}
    >
      {/* Background Graphic or Plate */}
      {sourceImage ? (
        <AbsoluteFill style={{ transform: `scale(${bgScale})`, transformOrigin: "center center" }}>
          <Img
            src={sourceImage}
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
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: aspectRatio === "9:16" ? "center" : "flex-end",
          padding: aspectRatio === "9:16" ? "0 8%" : "0 8% 10% 8%",
          zIndex: 10
        }}
      >
        <PresetWrapper preset={motionPreset} delayFrames={5}>
          {displayEyebrow ? (
            <div
              style={{
                color: primaryColor,
                fontSize: titleSize * 0.4,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 12,
                textShadow: `0 0 12px ${primaryColor}88`
              }}
            >
              {displayEyebrow}
            </div>
          ) : null}

          <div
            style={{
              color: textColor,
              fontSize: titleSize,
              fontWeight: 800,
              lineHeight: 1.25,
              marginBottom: 16,
              textShadow: "0 4px 16px rgba(0, 0, 0, 0.85)"
            }}
          >
            {displayTitle}
          </div>

          {displaySubtitle ? (
            <div
              style={{
                color: accentColor,
                fontSize: titleSize * 0.45,
                fontWeight: 500,
                lineHeight: 1.4,
                textShadow: "0 2px 8px rgba(0, 0, 0, 0.7)"
              }}
            >
              {displaySubtitle}
            </div>
          ) : null}
        </PresetWrapper>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
