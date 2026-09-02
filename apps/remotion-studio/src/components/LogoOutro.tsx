import React, { useState } from "react";
import { AbsoluteFill, Img, OffthreadVideo, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Pop } from "../presets/Pop";
import { resolveMediaUrl } from "../media-resolver";
import type { AspectRatioMode, StudioThemeProps } from "../types";

export const DEFAULT_PSU_LOGO = "/Volumes/ภาควีดีทัศน์/Logo 88 2561/Prince_of_Songkla_University_Emblem.png";

export interface LogoOutroProps {
  sourcePath?: string;
  presetId?: "logo-outro-v1" | "logo-outro-video-v1" | "logo-outro-minimal-v1" | string;
  title?: string;
  note?: string;
  subtitle?: string;
  eyebrow?: string;
  logoScale?: number;
  glowIntensity?: number;
  videoFit?: "cover" | "contain";
  fadeInMs?: number;
  fadeOutMs?: number;
  aspectRatio?: AspectRatioMode;
  theme?: StudioThemeProps;
}

function isVideo(path?: string): boolean {
  if (!path) return false;
  return /\.(mp4|mov|mxf|webm|m4v)$/i.test(path);
}

export const LogoOutro: React.FC<LogoOutroProps> = ({
  sourcePath,
  presetId = "logo-outro-v1",
  title,
  note = "PSU BROADCAST",
  subtitle = "Prince of Songkla University",
  eyebrow = "มหาวิทยาลัยสงขลานครินทร์",
  logoScale = 1.0,
  glowIntensity = 1.0,
  videoFit = "cover",
  fadeInMs = 480,
  fadeOutMs = 480,
  aspectRatio = "9:16",
  theme
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const [hasMediaError, setHasMediaError] = useState(false);

  const primaryColor = theme?.primaryColor ?? "#E5A93C"; // Warm Gold
  const accentColor = theme?.accentColor ?? "#00E5FF"; // Bright Cyan
  const textColor = theme?.textColor ?? "#FFFFFF";
  const fontFamily =
    theme?.fontFamily ??
    "-apple-system, BlinkMacSystemFont, 'Prompt', 'Kanit', 'Noto Sans Thai', sans-serif";

  const effectiveSource = (sourcePath && sourcePath.trim()) ? sourcePath.trim() : DEFAULT_PSU_LOGO;
  const isVideoAsset = isVideo(effectiveSource);
  const resolvedMedia = resolveMediaUrl(effectiveSource);

  const mainTitle = title || note || "PSU BROADCAST";
  const subTitle = subtitle || "Prince of Songkla University";
  const eyebrowText = eyebrow || "มหาวิทยาลัยสงขลานครินทร์";

  // Pulse effect
  const pulse = Math.sin((frame / fps) * Math.PI * 2) * 0.04 + 1.0;

  // Fade In and Fade Out for Fullscreen Video Sting
  const fadeInFrames = Math.max(1, Math.round((fadeInMs / 1000) * fps));
  const fadeOutFrames = Math.max(1, Math.round((fadeOutMs / 1000) * fps));
  const opacity = interpolate(
    frame,
    [0, fadeInFrames, durationInFrames - fadeOutFrames, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // 1. Fullscreen Video Sting Preset (logo-outro-video-v1)
  if (presetId === "logo-outro-video-v1" || (isVideoAsset && presetId !== "logo-outro-v1")) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#070B14",
          opacity,
          overflow: "hidden",
          fontFamily
        }}
      >
        {resolvedMedia && !hasMediaError ? (
          <OffthreadVideo
            src={resolvedMedia}
            onError={() => setHasMediaError(true)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: videoFit
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
              color: primaryColor,
              fontSize: 24,
              fontWeight: 700
            }}
          >
            🎬 Video Outro Ready
          </div>
        )}
      </AbsoluteFill>
    );
  }

  // 2. Modern Minimal Emblem Preset (logo-outro-minimal-v1)
  if (presetId === "logo-outro-minimal-v1") {
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
        <Pop delayFrames={3}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center"
            }}
          >
            {resolvedMedia && !hasMediaError ? (
              <Img
                src={resolvedMedia}
                onError={() => setHasMediaError(true)}
                style={{
                  width: (aspectRatio === "9:16" ? 180 : 150) * Math.max(0.5, Math.min(1.5, logoScale)),
                  height: "auto",
                  marginBottom: 16,
                  filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.6))"
                }}
              />
            ) : (
              <div
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 50,
                  border: `3px solid ${primaryColor}`,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: 16,
                  backgroundColor: "rgba(11, 18, 32, 0.9)"
                }}
              >
                <span style={{ color: primaryColor, fontSize: 32, fontWeight: 900 }}>PSU</span>
              </div>
            )}

            <div
              style={{
                width: 60,
                height: 2,
                backgroundColor: primaryColor,
                marginBottom: 16,
                opacity: 0.8
              }}
            />

            <div
              style={{
                color: textColor,
                fontSize: aspectRatio === "9:16" ? 36 : 30,
                fontWeight: 800,
                letterSpacing: "0.06em",
                marginBottom: 6
              }}
            >
              {mainTitle}
            </div>

            <div
              style={{
                color: "#94A3B8",
                fontSize: aspectRatio === "9:16" ? 20 : 16,
                fontWeight: 500,
                letterSpacing: "0.08em"
              }}
            >
              {subTitle}
            </div>
          </div>
        </Pop>
      </AbsoluteFill>
    );
  }

  // 3. PSU Golden Pulse Glow Preset (logo-outro-v1 - Default)
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
      {/* Ambient background radial aura */}
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          borderRadius: 250,
          background: `radial-gradient(circle, ${primaryColor}44 0%, ${accentColor}11 40%, transparent 70%)`,
          transform: `scale(${pulse * glowIntensity})`,
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
            padding: "0 24px"
          }}
        >
          {/* Eyebrow Badge */}
          {eyebrowText ? (
            <div
              style={{
                fontSize: aspectRatio === "9:16" ? 18 : 15,
                fontWeight: 700,
                color: primaryColor,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                padding: "4px 16px",
                borderRadius: 99,
                backgroundColor: "rgba(229, 169, 60, 0.12)",
                border: "1px solid rgba(229, 169, 60, 0.35)",
                marginBottom: 20
              }}
            >
              {eyebrowText}
            </div>
          ) : null}

          {/* Center Logo */}
          {resolvedMedia && !hasMediaError ? (
            <Img
              src={resolvedMedia}
              onError={() => setHasMediaError(true)}
              style={{
                width: (aspectRatio === "9:16" ? 220 : 180) * Math.max(0.5, Math.min(1.5, logoScale)),
                height: "auto",
                marginBottom: 24,
                filter: `drop-shadow(0 8px 32px ${primaryColor}55) drop-shadow(0 16px 48px rgba(0,0,0,0.8))`
              }}
            />
          ) : (
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: 70,
                border: `4px solid ${primaryColor}`,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 24,
                boxShadow: `0 0 40px ${primaryColor}66`,
                backgroundColor: "rgba(11, 18, 32, 0.9)"
              }}
            >
              <div
                style={{
                  color: primaryColor,
                  fontSize: 48,
                  fontWeight: 900
                }}
              >
                PSU
              </div>
            </div>
          )}

          {/* Main Title */}
          <div
            style={{
              color: textColor,
              fontSize: aspectRatio === "9:16" ? 44 : 38,
              fontWeight: 800,
              letterSpacing: "0.08em",
              marginBottom: 8,
              textShadow: `0 0 24px ${primaryColor}77`
            }}
          >
            {mainTitle}
          </div>

          {/* Subtitle / Department */}
          <div
            style={{
              color: accentColor,
              fontSize: aspectRatio === "9:16" ? 22 : 18,
              fontWeight: 600,
              letterSpacing: "0.15em",
              textTransform: "uppercase"
            }}
          >
            {subTitle}
          </div>
        </div>
      </Pop>
    </AbsoluteFill>
  );
};
