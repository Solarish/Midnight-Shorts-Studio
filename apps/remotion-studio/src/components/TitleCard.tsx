import React, { useState } from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Pop } from "../presets/Pop";
import { PresetWrapper, ThreeDCarouselPreset, ParallaxCinemaPreset, SplitDynamicPreset } from "../presets";
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
  splitAngle?: number;
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
  splitAngle = -6,
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

  const mainTitle = title || texts?.["Text 1"] || texts?.title || text || "PSU BROADCAST";
  const subTitle = subtitle || texts?.["Text 2"] || texts?.subtitle || "Prince of Songkla University";
  const eyebrowText = eyebrow || texts?.eyebrow || texts?.["Text 5"] || "";

  // 1. Cinematic Multi-Layer Parallax Showcase (title-parallax-cinema-v1)
  if (presetId === "title-parallax-cinema-v1") {
    return (
      <ParallaxCinemaPreset
        media={media}
        title={mainTitle}
        subtitle={subTitle}
        eyebrow={eyebrowText}
        text={text}
        texts={texts}
        aspectRatio={aspectRatio}
        theme={theme}
      />
    );
  }

  // 2. High-Energy Broadcast Split Screen (title-split-dynamic-v1)
  if (presetId === "title-split-dynamic-v1") {
    return (
      <SplitDynamicPreset
        media={media}
        title={mainTitle}
        subtitle={subTitle}
        eyebrow={eyebrowText}
        text={text}
        texts={texts}
        aspectRatio={aspectRatio}
        splitAngle={splitAngle}
        theme={theme}
      />
    );
  }

  // 3. Modern Minimal Title Preset (title-minimal-badge-v1)
  if (presetId === "title-minimal-badge-v1") {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#070B14",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontFamily,
          overflow: "hidden"
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 400,
            height: 400,
            borderRadius: 200,
            background: `radial-gradient(circle, ${primaryColor}22 0%, transparent 70%)`,
            pointerEvents: "none"
          }}
        />

        <Pop delayFrames={4}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              padding: "0 30px"
            }}
          >
            {eyebrowText ? (
              <div
                style={{
                  fontSize: aspectRatio === "9:16" ? 18 : 16,
                  fontWeight: 700,
                  color: primaryColor,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  padding: "4px 16px",
                  borderRadius: 99,
                  backgroundColor: "rgba(229, 169, 60, 0.12)",
                  border: "1px solid rgba(229, 169, 60, 0.35)",
                  marginBottom: 16
                }}
              >
                {eyebrowText}
              </div>
            ) : null}

            <div
              style={{
                color: textColor,
                fontSize: aspectRatio === "9:16" ? 44 : 40,
                fontWeight: 800,
                letterSpacing: "0.06em",
                marginBottom: 8,
                textShadow: `0 0 24px ${primaryColor}55`
              }}
            >
              {mainTitle}
            </div>

            <div
              style={{
                color: accentColor,
                fontSize: aspectRatio === "9:16" ? 22 : 18,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase"
              }}
            >
              {subTitle}
            </div>
          </div>
        </Pop>
      </AbsoluteFill>
    );
  }

  // 2. Classic Flat Title Card Preset (title-classic-flat-v1)
  if (presetId === "title-classic-flat-v1") {
    const firstMedia = Array.isArray(media) && media.length > 0 ? media[0] : undefined;
    const resolvedMedia = resolveMediaUrl(firstMedia);
    const titleSize = aspectRatio === "9:16" ? 56 : aspectRatio === "16:9" ? 52 : 44;
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
                  "linear-gradient(180deg, rgba(11,18,32,0.55) 0%, rgba(11,18,32,0.85) 100%)"
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
            padding: aspectRatio === "9:16" ? "40px 24px" : "60px 40px"
          }}
        >
          <PresetWrapper preset={motionPreset} delayFrames={5}>
            <div
              style={{
                padding: aspectRatio === "9:16" ? "36px 24px" : "40px 50px",
                borderRadius: "24px",
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                border: `2px solid ${primaryColor}88`,
                boxShadow: `0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px ${primaryColor}33`,
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                textAlign: "center",
                maxWidth: "92%"
              }}
            >
              {eyebrowText ? (
                <div
                  style={{
                    fontSize: aspectRatio === "9:16" ? 18 : 16,
                    fontWeight: 700,
                    color: primaryColor,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    marginBottom: 12
                  }}
                >
                  {eyebrowText}
                </div>
              ) : null}

              <div
                style={{
                  color: textColor,
                  fontSize: `${titleSize}px`,
                  fontWeight: 900,
                  lineHeight: 1.2,
                  marginBottom: "14px",
                  textShadow: "0 4px 12px rgba(0,0,0,0.8)"
                }}
              >
                {mainTitle}
              </div>

              <div
                style={{
                  color: accentColor,
                  fontSize: `${Math.round(titleSize * 0.44)}px`,
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
  }

  // 3. Default: 3D Cylindrical Photo Carousel Showcase (3d-carousel-title-v1)
  return (
    <ThreeDCarouselPreset
      media={media}
      layoutSequence={layoutSequence}
      cgBlocks={cgBlocks}
      title={mainTitle}
      text={text}
      subtitle={subTitle}
      eyebrow={eyebrowText}
      texts={texts}
      aspectRatio={aspectRatio}
      rotationSpeed={rotationSpeed}
      cameraTilt={cameraTilt}
      enableReflection={enableReflection}
      theme={theme}
    />
  );
};
