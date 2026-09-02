import React, { useState } from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PresetWrapper, ThreeDCarouselPreset } from "../presets";
import type { ShowcaseShot } from "../presets/ThreeDCarouselPreset";
import { resolveMediaUrl } from "../media-resolver";
import type { AspectRatioMode, CgBlock, MotionPresetType, StudioThemeProps } from "../types";

export interface TitleCardProps {
  text?: string;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  texts?: Record<string, string>;
  media?: string[];
  layoutSequence?: ShowcaseShot[];
  cgBlocks?: CgBlock[];
  aspectRatio?: AspectRatioMode;
  presetId?: string;
  motionPreset?: MotionPresetType;
  rotationSpeed?: number;
  cameraTilt?: number;
  enableReflection?: boolean;
  theme?: StudioThemeProps;
}

export const TitleCard: React.FC<TitleCardProps> = ({
  title,
  text,
  subtitle,
  eyebrow,
  texts,
  media,
  layoutSequence,
  cgBlocks,
  aspectRatio = "16:9",
  presetId = "3d-carousel-title-v1",
  motionPreset = "ZoomPunch",
  rotationSpeed = 1.0,
  cameraTilt = 8,
  enableReflection = true,
  theme
}) => {
  // If it is the 3D Carousel Title preset (default for Title or explicitly chosen), render the 3D Carousel!
  if (presetId === "3d-carousel-title-v1" || presetId?.includes("carousel") || (Array.isArray(media) && media.length > 1) || !media || media.length === 0) {
    return (
      <ThreeDCarouselPreset
        media={media}
        layoutSequence={layoutSequence}
        cgBlocks={cgBlocks}
        title={title}
        text={text}
        subtitle={subtitle}
        eyebrow={eyebrow}
        texts={texts}
        aspectRatio={aspectRatio}
        rotationSpeed={rotationSpeed}
        cameraTilt={cameraTilt}
        enableReflection={enableReflection}
        theme={theme}
      />
    );
  }

  // Classic Flat Title card fallback
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

  const titleSize = aspectRatio === "9:16" ? 64 : aspectRatio === "16:9" ? 56 : 48;
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
                "linear-gradient(180deg, rgba(11,18,32,0.6) 0%, rgba(11,18,32,0.85) 100%)"
            }}
          />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(circle at center, #1E293B 0%, #0B1220 70%, #030712 100%)"
          }}
        />
      )}

      {/* Decorative Grid Lines */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          pointerEvents: "none"
        }}
      />

      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: aspectRatio === "9:16" ? "40px" : "60px"
        }}
      >
        <PresetWrapper preset={motionPreset} delayFrames={5}>
          <div
            style={{
              padding: aspectRatio === "9:16" ? "40px 30px" : "40px 60px",
              borderRadius: "24px",
              backgroundColor: "rgba(15, 23, 42, 0.75)",
              border: `2px solid ${primaryColor}88`,
              boxShadow: `0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px ${primaryColor}33`,
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              textAlign: "center",
              maxWidth: "90%"
            }}
          >
            <div
              style={{
                color: textColor,
                fontSize: `${titleSize}px`,
                fontWeight: 900,
                lineHeight: 1.2,
                marginBottom: "16px",
                textShadow: "0 4px 12px rgba(0,0,0,0.8)"
              }}
            >
              {mainTitle}
            </div>
            <div
              style={{
                color: accentColor,
                fontSize: `${Math.round(titleSize * 0.42)}px`,
                fontWeight: 600,
                letterSpacing: "0.08em",
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
