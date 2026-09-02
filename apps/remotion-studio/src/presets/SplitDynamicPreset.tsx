import React, { useState } from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveMediaUrl } from "../media-resolver";
import type { AspectRatioMode, StudioThemeProps } from "../types";

export interface SplitDynamicPresetProps {
  media?: string[];
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  text?: string;
  texts?: Record<string, string>;
  aspectRatio?: AspectRatioMode;
  splitAngle?: number; // default -6 deg
  theme?: StudioThemeProps;
}

export const SplitDynamicManifest = {
  id: "title-split-dynamic-v1",
  name: "⚡ High-Energy Broadcast Split Screen",
  description: "กราฟิกเปิดไตเติลแนวสปอร์ตและข่าวด่วนแบบแบ่งหลายช่อง (Multi-Panel Split Screen) พร้อมเส้นตัดกราฟิกเรืองแสงและแอนิเมชันเปิดตัวทรงพลัง",
  category: "title",
  paramsSchema: {
    title: { type: "text", label: "หัวข้อหลัก (Main Title)", default: "PSU BROADCAST LIVE" },
    subtitle: { type: "text", label: "ข้อความรอง (Subtitle)", default: "SPECIAL INVESTIGATION" },
    eyebrow: { type: "text", label: "ป้ายหัวเรื่อง (Eyebrow Badge)", default: "EXCLUSIVE" },
    media: { type: "media_gallery", label: "คลังภาพสำหรับ Split Screen (2-4 ภาพ)", defaultNasFolder: "/ภาพนิ่ง" },
    splitAngle: { type: "slider", label: "มุมเอียงเส้นแบ่ง (Split Angle °)", min: -15, max: 15, step: 1, default: -6 }
  }
};

export const SplitDynamicPreset: React.FC<SplitDynamicPresetProps> = ({
  media = [],
  title,
  subtitle,
  eyebrow,
  text,
  texts,
  aspectRatio = "16:9",
  splitAngle = -6,
  theme
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const [mediaErrors, setMediaErrors] = useState<Record<number, boolean>>({});

  const primaryColor = theme?.primaryColor ?? "#E5A93C"; // Warm Gold
  const accentColor = theme?.accentColor ?? "#00E5FF"; // Bright Cyan / Neon Energy
  const textColor = theme?.textColor ?? "#FFFFFF";
  const fontFamily =
    theme?.fontFamily ??
    "-apple-system, BlinkMacSystemFont, 'Prompt', 'Kanit', 'Noto Sans Thai', sans-serif";

  const mainTitle = title || texts?.["Text 1"] || texts?.title || text || "PSU BROADCAST LIVE";
  const subTitle = subtitle || texts?.["Text 2"] || texts?.subtitle || "PRINCE OF SONGKLA UNIVERSITY";
  const eyebrowText = eyebrow || texts?.eyebrow || texts?.["Text 5"] || "EXCLUSIVE COVERAGE";

  const isVertical = aspectRatio === "9:16";
  const isSquare = aspectRatio === "1:1";

  // Normalize media items (at least 2 panels, up to 4)
  const mediaList = Array.isArray(media) && media.length > 0 ? media.slice(0, 4) : [];
  const panelCount = Math.max(2, Math.min(4, mediaList.length || 3));
  const panels = Array.from({ length: panelCount }, (_, index) => {
    const rawPath = mediaList[index] ?? mediaList[index % (mediaList.length || 1)] ?? undefined;
    return {
      index,
      url: resolveMediaUrl(rawPath),
      rawPath
    };
  });

  // -------------------------------------------------------------
  // MOTION CHOREOGRAPHY BREAKDOWN:
  // -------------------------------------------------------------
  // STAGE 1: Staggered Panel Slide-In (Frames 0 - 20)
  // STAGE 2: Impact Typography Slam & Backlight Glow (Frames 10 - 30)
  // STAGE 3: Continuous Ken Burns Drift & Divider Energy Pulse (Living Hold)
  // EXIT STAGE: High-Speed Split Flash / Slide Resolve (Last 12 Frames)

  const exitFrames = 12;
  const exitStart = Math.max(1, durationInFrames - exitFrames);
  const exitProgress = interpolate(
    frame,
    [exitStart, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const exitOpacity = interpolate(exitProgress, [0, 1], [1, 0]);
  const exitScale = interpolate(exitProgress, [0, 1], [1, 1.08]);

  // Typography Motion Springs
  const plateSpring = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: { damping: 11, mass: 0.8, stiffness: 120 }
  });
  const plateScale = interpolate(plateSpring, [0, 1], [0.85, 1.0]);
  const plateOpacity = interpolate(plateSpring, [0, 1], [0, 1]);

  const titleSpring = spring({
    frame: Math.max(0, frame - 14),
    fps,
    config: { damping: 12, mass: 0.9, stiffness: 140 }
  });
  const titleY = interpolate(titleSpring, [0, 1], [30, 0]);
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

  const subSpring = spring({
    frame: Math.max(0, frame - 18),
    fps,
    config: { damping: 14, mass: 0.7, stiffness: 110 }
  });
  const subY = interpolate(subSpring, [0, 1], [20, 0]);
  const subOpacity = interpolate(subSpring, [0, 1], [0, 1]);

  // Energy Divider Light Pulse
  const energyPulse = Math.sin((frame / fps) * 4) * 0.3 + 0.7;
  const streakProgress = interpolate(
    frame % (fps * 3),
    [0, fps * 1.5],
    [-20, 120],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Dynamic Ken Burns timing per panel
  const getPanelDrift = (idx: number) => {
    const dir = idx % 2 === 0 ? 1 : -1;
    const scale = interpolate(frame, [0, durationInFrames], [1.08, 1.22]);
    const panX = interpolate(frame, [0, durationInFrames], [0, dir * 16]);
    const panY = interpolate(frame, [0, durationInFrames], [-8 * dir, 8 * dir]);
    return { scale, panX, panY };
  };

  const titleSize = isVertical ? 48 : isSquare ? 54 : 64;
  const subtitleSize = isVertical ? 17 : isSquare ? 19 : 22;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#03060E",
        overflow: "hidden",
        fontFamily,
        opacity: exitOpacity,
        transform: `scale(${exitScale})`
      }}
    >
      {/* Background Graphic Grid */}
      <AbsoluteFill
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(0, 229, 255, 0.08) 0%, transparent 70%),
            linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 80px 80px, 80px 80px",
          pointerEvents: "none"
        }}
      />

      {/* ========================================================= */}
      {/* MULTI-PANEL SPLIT SCREEN CONTAINER                        */}
      {/* ========================================================= */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: isVertical ? "column" : "row",
          width: "120%",
          height: "120%",
          top: "-10%",
          left: "-10%",
          transform: `rotate(${splitAngle}deg)`,
          transformOrigin: "center center"
        }}
      >
        {panels.map((panel, idx) => {
          // Staggered slide in from alternating directions
          const delay = idx * 3;
          const panelSpring = spring({
            frame: Math.max(0, frame - delay),
            fps,
            config: { damping: 13, mass: 0.85, stiffness: 90 }
          });
          const slideFrom = idx % 2 === 0 ? -120 : 120;
          const slideOffset = interpolate(panelSpring, [0, 1], [slideFrom, 0]);
          const { scale: kbScale, panX, panY } = getPanelDrift(idx);

          return (
            <div
              key={idx}
              style={{
                flex: 1,
                position: "relative",
                height: isVertical ? `${100 / panelCount}%` : "100%",
                width: isVertical ? "100%" : `${100 / panelCount}%`,
                overflow: "hidden",
                transform: isVertical
                  ? `translateY(${slideOffset}px)`
                  : `translateX(${slideOffset}px)`,
                borderRight:
                  !isVertical && idx < panelCount - 1
                    ? `3px solid ${accentColor}`
                    : undefined,
                borderBottom:
                  isVertical && idx < panelCount - 1
                    ? `3px solid ${accentColor}`
                    : undefined,
                boxShadow: `0 0 24px ${accentColor}44`
              }}
            >
              {/* Inner Image with Ken Burns drift */}
              {panel.url && !mediaErrors[idx] ? (
                <div
                  style={{
                    position: "absolute",
                    inset: "-15%",
                    transform: `rotate(${-splitAngle}deg) scale(${kbScale}) translate(${panX}px, ${panY}px)`
                  }}
                >
                  <Img
                    src={panel.url}
                    onError={() => setMediaErrors((prev) => ({ ...prev, [idx]: true }))}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      filter: `brightness(0.72) contrast(1.12) saturate(1.15)`
                    }}
                  />
                  {/* Subtle color grading tint */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        idx % 2 === 0
                          ? "linear-gradient(180deg, rgba(3,6,14,0.3) 0%, rgba(0,229,255,0.15) 100%)"
                          : "linear-gradient(180deg, rgba(3,6,14,0.3) 0%, rgba(229,169,60,0.15) 100%)"
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      idx % 2 === 0
                        ? `linear-gradient(135deg, #0A1428 0%, #030813 100%)`
                        : `linear-gradient(135deg, #181205 0%, #080602 100%)`
                  }}
                />
              )}

              {/* Dividing Bar Traveling Energy Gleam */}
              <div
                style={{
                  position: "absolute",
                  top: isVertical ? "auto" : `${streakProgress}%`,
                  bottom: isVertical ? 0 : "auto",
                  left: isVertical ? `${streakProgress}%` : "auto",
                  right: isVertical ? "auto" : 0,
                  width: isVertical ? "30%" : "4px",
                  height: isVertical ? "4px" : "30%",
                  backgroundColor: "#FFFFFF",
                  boxShadow: `0 0 16px #FFFFFF, 0 0 32px ${accentColor}`,
                  opacity: energyPulse,
                  pointerEvents: "none"
                }}
              />
            </div>
          );
        })}
      </AbsoluteFill>

      {/* Dark Broadcast Vignette Over Entire Canvas */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at center, rgba(3,6,14,0.35) 0%, rgba(3,6,14,0.85) 90%)",
          pointerEvents: "none"
        }}
      />

      {/* ========================================================= */}
      {/* IMPACT TYPOGRAPHY & BROADCAST STRIKE PLATE                */}
      {/* ========================================================= */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: isVertical ? "30px 20px" : "40px 48px",
          pointerEvents: "none",
          zIndex: 50
        }}
      >
        <div
          style={{
            position: "relative",
            maxWidth: isVertical ? "92%" : "960px",
            width: "100%",
            textAlign: "center",
            opacity: plateOpacity,
            transform: `scale(${plateScale})`
          }}
        >
          {/* Eyebrow Pill Badge */}
          {eyebrowText ? (
            <div style={{ marginBottom: "14px" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "5px 22px",
                  borderRadius: "4px",
                  backgroundColor: accentColor,
                  color: "#03060E",
                  fontSize: isVertical ? "14px" : "16px",
                  fontWeight: 900,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  boxShadow: `0 0 24px ${accentColor}88`,
                  transform: "skewX(-10deg)"
                }}
              >
                <span style={{ transform: "skewX(10deg)" }}>{eyebrowText}</span>
              </span>
            </div>
          ) : null}

          {/* Main Broadcast Headline Box */}
          <div
            style={{
              opacity: titleOpacity,
              transform: `translateY(${titleY}px)`,
              padding: isVertical ? "20px 24px" : "28px 44px",
              backgroundColor: "rgba(3, 6, 14, 0.9)",
              border: `2px solid ${primaryColor}`,
              borderRadius: "12px",
              boxShadow: `
                0 24px 60px rgba(0, 0, 0, 0.95),
                0 0 40px ${primaryColor}44,
                inset 0 0 20px ${primaryColor}22
              `,
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              position: "relative",
              overflow: "hidden"
            }}
          >
            {/* Top Accent Strip */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "3px",
                background: `linear-gradient(90deg, ${accentColor} 0%, ${primaryColor} 50%, ${accentColor} 100%)`,
                boxShadow: `0 0 12px ${accentColor}`
              }}
            />

            {/* Main Title Text */}
            <div
              style={{
                color: textColor,
                fontSize: `${titleSize}px`,
                fontWeight: 900,
                lineHeight: 1.15,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                textShadow: `
                  0 0 24px ${primaryColor}66,
                  0 4px 12px rgba(0,0,0,0.9)
                `,
                marginBottom: subTitle ? "12px" : "0"
              }}
            >
              {mainTitle}
            </div>

            {/* Subtitle Telemetry Bar */}
            {subTitle ? (
              <div
                style={{
                  opacity: subOpacity,
                  transform: `translateY(${subY}px)`,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "6px 20px",
                  backgroundColor: "rgba(229, 169, 60, 0.12)",
                  border: `1px solid ${primaryColor}66`,
                  borderRadius: "6px",
                  color: primaryColor,
                  fontSize: `${subtitleSize}px`,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase"
                }}
              >
                <span>●</span>
                <span>{subTitle}</span>
              </div>
            ) : null}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
