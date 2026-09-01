import React, { useState } from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PresetWrapper } from "../presets";
import { resolveMediaUrl } from "../media-resolver";
import type { AspectRatioMode, MotionPresetType, StudioThemeProps } from "../types";

interface TitleCardProps {
  title?: string;
  subtitle?: string;
  texts?: Record<string, string>;
  media?: string[];
  aspectRatio?: AspectRatioMode;
  motionPreset?: MotionPresetType;
  theme?: StudioThemeProps;
}

export const TitleCard: React.FC<TitleCardProps> = ({
  title,
  subtitle,
  texts,
  media,
  aspectRatio = "9:16",
  motionPreset = "ZoomPunch",
  theme
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [hasMediaError, setHasMediaError] = useState(false);

  const primaryColor = theme?.primaryColor ?? "#E5A93C"; // Warm Gold
  const accentColor = theme?.accentColor ?? "#00E5FF"; // Bright Cyan
  const textColor = theme?.textColor ?? "#FFFFFF";
  const fontFamily =
    theme?.fontFamily ??
    "-apple-system, BlinkMacSystemFont, 'Prompt', 'Kanit', 'Noto Sans Thai', sans-serif";

  const mainTitle = title || texts?.["Text 1"] || texts?.title || "PSU BROADCAST";
  const subTitle = subtitle || texts?.["Text 2"] || texts?.subtitle || "Midnight Shorts Studio";
  const firstMedia = Array.isArray(media) && media.length > 0 ? media[0] : undefined;
  const resolvedMedia = resolveMediaUrl(firstMedia);

  const titleSize = aspectRatio === "9:16" ? 68 : aspectRatio === "16:9" ? 60 : 52;

  // Background slow zoom
  const bgScale = interpolate(frame, [0, fps * 10], [1.0, 1.12]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0B1220",
        overflow: "hidden",
        fontFamily
      }}
    >
      {resolvedMedia && !hasMediaError ? (
        <AbsoluteFill style={{ transform: `scale(${bgScale})`, transformOrigin: "center center" }}>
          <Img
            src={resolvedMedia}
            onError={() => setHasMediaError(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <AbsoluteFill
            style={{
              background:
                "radial-gradient(circle at center, rgba(11,18,32,0.6) 0%, rgba(11,18,32,0.92) 80%)"
            }}
          />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(135deg, #070B14 0%, #0B1220 50%, #152238 100%)"
          }}
        />
      )}

      {/* Modern Glassmorphic Center Card */}
      <AbsoluteFill
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "0 10%"
        }}
      >
        <PresetWrapper preset={motionPreset} delayFrames={3}>
          <div
            style={{
              padding: aspectRatio === "9:16" ? "48px 36px" : "40px 56px",
              borderRadius: 24,
              backgroundColor: "rgba(11, 18, 32, 0.85)",
              border: `2px solid ${primaryColor}66`,
              boxShadow: `0 16px 48px rgba(0,0,0,0.8), 0 0 24px ${primaryColor}22`,
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              textAlign: "center"
            }}
          >
            <div
              style={{
                color: textColor,
                fontSize: titleSize,
                fontWeight: 900,
                lineHeight: 1.2,
                marginBottom: 16,
                letterSpacing: "0.02em",
                textShadow: `0 4px 20px rgba(0,0,0,0.9), 0 0 24px ${primaryColor}55`
              }}
            >
              {mainTitle}
            </div>

            <div
              style={{
                display: "inline-block",
                padding: "6px 20px",
                borderRadius: 30,
                backgroundColor: `${accentColor}22`,
                border: `1px solid ${accentColor}88`,
                color: accentColor,
                fontSize: titleSize * 0.4,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase"
              }}
            >
              {subTitle}
            </div>
          </div>
        </PresetWrapper>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
