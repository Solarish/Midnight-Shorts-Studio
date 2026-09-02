import React, { useMemo, useState } from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveMediaUrl } from "../media-resolver";
import type { AspectRatioMode, StudioThemeProps } from "../types";

export interface ParallaxCinemaPresetProps {
  media?: string[];
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  text?: string;
  texts?: Record<string, string>;
  aspectRatio?: AspectRatioMode;
  theme?: StudioThemeProps;
}

export const ParallaxCinemaManifest = {
  id: "title-parallax-cinema-v1",
  name: "🎥 Cinematic Parallax Multi-Layer Showcase",
  description: "กราฟิกเปิดไตเติลระดับภาพยนตร์แบบ 3 มิติหลายชั้น (Multi-Layer Parallax) พร้อมแสงแฟลร์ เลนส์บลูม ละอองโบเก้ และตัวอักษรทองเรืองแสง",
  category: "title",
  paramsSchema: {
    title: { type: "text", label: "หัวข้อหลัก (Main Title)", default: "PSU BROADCAST" },
    subtitle: { type: "text", label: "ข้อความรอง (Subtitle)", default: "Prince of Songkla University" },
    eyebrow: { type: "text", label: "ป้ายหัวเรื่อง (Eyebrow Badge)", default: "SPECIAL REPORT" },
    media: { type: "media_gallery", label: "ภาพ Hero และบรรยากาศ (1-6 ภาพ)", defaultNasFolder: "/ภาพนิ่ง" }
  }
};

// Deterministic particle generator for ambient floating dust
function createDustParticles(count = 36) {
  return Array.from({ length: count }, (_, i) => {
    const seed = (i + 1) * 137.5;
    const x = ((Math.sin(seed) * 10000) % 1 + 1) % 1 * 100;
    const y = ((Math.cos(seed * 1.3) * 10000) % 1 + 1) % 1 * 100;
    const size = 2 + (((Math.sin(seed * 2.1) * 10000) % 1 + 1) % 1) * 4;
    const speed = 0.4 + (((Math.cos(seed * 0.7) * 10000) % 1 + 1) % 1) * 0.8;
    const opacity = 0.25 + (((Math.sin(seed * 3.3) * 10000) % 1 + 1) % 1) * 0.55;
    return { id: i, x, y, size, speed, opacity };
  });
}

export const ParallaxCinemaPreset: React.FC<ParallaxCinemaPresetProps> = ({
  media = [],
  title,
  subtitle,
  eyebrow,
  text,
  texts,
  aspectRatio = "16:9",
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

  const mainTitle = title || texts?.["Text 1"] || texts?.title || text || "PSU BROADCAST";
  const subTitle = subtitle || texts?.["Text 2"] || texts?.subtitle || "Prince of Songkla University";
  const eyebrowText = eyebrow || texts?.eyebrow || texts?.["Text 5"] || "SPECIAL REPORT";

  const isVertical = aspectRatio === "9:16";
  const isSquare = aspectRatio === "1:1";

  const heroMedia = Array.isArray(media) && media.length > 0 ? media[0] : undefined;
  const secondaryMedia = Array.isArray(media) && media.length > 1 ? media[1] : heroMedia;
  const resolvedHero = resolveMediaUrl(heroMedia);
  const resolvedSecondary = resolveMediaUrl(secondaryMedia);

  const particles = useMemo(() => createDustParticles(32), []);

  // -------------------------------------------------------------
  // MOTION CHOREOGRAPHY BREAKDOWN (25 fps Broadcast Timeline):
  // -------------------------------------------------------------
  // STAGE 1: Frames 0 - 15 (Push-In + 3D Tilt + Lens Flare Bloom)
  const stage1Spring = spring({
    frame,
    fps,
    config: { damping: 14, mass: 0.9, stiffness: 75 }
  });

  const cameraZ = interpolate(stage1Spring, [0, 1], [-200, 0]);
  const cameraRotateX = interpolate(stage1Spring, [0, 1], [6, 0.5]);
  const cameraRotateY = interpolate(stage1Spring, [0, 1], [-9, -0.8]);

  // Optical Lens Flare Bloom (Surges frame 0-12, settles frame 15)
  const flareBloomOpacity = interpolate(
    frame,
    [0, 6, 15, 30],
    [0, 0.95, 0.35, 0.15],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const flareScale = interpolate(
    frame,
    [0, 8, 25],
    [0.4, 1.35, 1.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const flareX = interpolate(frame, [0, durationInFrames], [20, 80]);

  // STAGE 2: Frames 15 - 35 (Staggered Typographic Entrance)
  const eyebrowSpring = spring({
    frame: Math.max(0, frame - 14),
    fps,
    config: { damping: 13, mass: 0.7, stiffness: 110 }
  });
  const eyebrowOpacity = interpolate(eyebrowSpring, [0, 1], [0, 1]);
  const eyebrowY = interpolate(eyebrowSpring, [0, 1], [24, 0]);

  const titleSpring = spring({
    frame: Math.max(0, frame - 18),
    fps,
    config: { damping: 12, mass: 0.8, stiffness: 95 }
  });
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);
  const titleY = interpolate(titleSpring, [0, 1], [35, 0]);
  const titleScale = interpolate(titleSpring, [0, 1], [0.92, 1.0]);

  // Shimmer Sweep across Gold Title
  const shimmerProgress = interpolate(
    frame,
    [18, 55],
    [-40, 140],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Subtitle Tracking Expansion (Stage 2 -> Stage 3)
  const subtitleSpring = spring({
    frame: Math.max(0, frame - 24),
    fps,
    config: { damping: 15, mass: 0.9, stiffness: 80 }
  });
  const subtitleOpacity = interpolate(subtitleSpring, [0, 1], [0, 1]);
  const subtitleY = interpolate(subtitleSpring, [0, 1], [20, 0]);
  const subtitleTracking = interpolate(
    frame,
    [24, 60, durationInFrames],
    [0.08, 0.22, 0.28],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // STAGE 3: Continuous Cinematic Drift (Living Hold)
  const driftProgress = frame / durationInFrames;
  const livingPushScale = interpolate(driftProgress, [0, 1], [1.0, 1.06]);
  const livingFloatY = Math.sin((frame / fps) * 0.8) * 8;
  const livingRotateZ = Math.sin((frame / fps) * 0.4) * 0.4;
  const bgZoomScale = interpolate(driftProgress, [0, 1], [1.12, 1.28]);

  // EXIT STAGE: Last 15 Frames (Cinematic Depth-Of-Field Blur & Fade Resolve)
  const exitFrames = 15;
  const exitStart = Math.max(1, durationInFrames - exitFrames);
  const exitProgress = interpolate(
    frame,
    [exitStart, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const exitBlur = interpolate(exitProgress, [0, 1], [0, 14]);
  const exitOpacity = interpolate(exitProgress, [0, 1], [1, 0]);
  const exitScale = interpolate(exitProgress, [0, 1], [1, 0.96]);

  // Typography sizing
  const titleFontSize = isVertical ? 46 : isSquare ? 50 : 58;
  const subtitleFontSize = isVertical ? 18 : isSquare ? 20 : 22;
  const eyebrowFontSize = isVertical ? 14 : 15;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#050811",
        overflow: "hidden",
        fontFamily,
        perspective: 1200,
        filter: `blur(${exitBlur}px)`,
        opacity: exitOpacity,
        transform: `scale(${exitScale})`
      }}
    >
      {/* ========================================================= */}
      {/* LAYER 1: DEEP BACKGROUND ATMOSPHERE                      */}
      {/* ========================================================= */}
      <AbsoluteFill style={{ transform: `scale(${bgZoomScale})`, transformOrigin: "center center" }}>
        {resolvedSecondary && !hasMediaError ? (
          <Img
            src={resolvedSecondary}
            onError={() => setHasMediaError(true)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "blur(28px) brightness(0.38) saturate(1.4)",
              transform: "scale(1.1)"
            }}
          />
        ) : (
          <AbsoluteFill
            style={{
              background: `radial-gradient(ellipse at 50% 40%, #0F1D36 0%, #080D1A 60%, #020409 100%)`
            }}
          />
        )}
        {/* Cinematic Vignette */}
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(circle at center, rgba(5,8,17,0.4) 0%, rgba(2,4,9,0.92) 85%)"
          }}
        />
        {/* Subtle Horizon Golden Glow */}
        <div
          style={{
            position: "absolute",
            bottom: "20%",
            left: "10%",
            right: "10%",
            height: "120px",
            background: `radial-gradient(ellipse at center, ${primaryColor}22 0%, transparent 70%)`,
            filter: "blur(40px)",
            pointerEvents: "none"
          }}
        />
      </AbsoluteFill>

      {/* ========================================================= */}
      {/* LAYER 2: AMBIENT CINEMATIC DUST / PARTICLES (Living Drift)*/}
      {/* ========================================================= */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        {particles.map((p) => {
          const particleY = (p.y - (frame * p.speed * 0.3)) % 100;
          const currentY = particleY < 0 ? particleY + 100 : particleY;
          const particleX = p.x + Math.sin((frame * 0.04) + p.id) * 3;
          const pulse = (Math.sin((frame * 0.08) + p.id) + 1) * 0.5;
          const opacity = p.opacity * (0.6 + pulse * 0.4);

          return (
            <div
              key={p.id}
              style={{
                position: "absolute",
                left: `${particleX}%`,
                top: `${currentY}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                borderRadius: "50%",
                backgroundColor: p.id % 3 === 0 ? accentColor : primaryColor,
                boxShadow: `0 0 ${p.size * 3}px ${p.id % 3 === 0 ? accentColor : primaryColor}`,
                opacity,
                filter: "blur(0.6px)"
              }}
            />
          );
        })}
      </AbsoluteFill>

      {/* ========================================================= */}
      {/* LAYER 3: MIDGROUND HERO FLOATING CARD WITH 3D Z-DEPTH PUSH */}
      {/* ========================================================= */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transformStyle: "preserve-3d",
          transform: `translateZ(${cameraZ}px) rotateX(${cameraRotateX}deg) rotateY(${cameraRotateY}deg) scale(${livingPushScale}) translateY(${livingFloatY}px) rotateZ(${livingRotateZ}deg)`
        }}
      >
        {resolvedHero && !hasMediaError ? (
          <div
            style={{
              position: "relative",
              width: isVertical ? "82%" : isSquare ? "68%" : "52%",
              height: isVertical ? "48%" : isSquare ? "54%" : "62%",
              borderRadius: "24px",
              overflow: "hidden",
              boxShadow: `
                0 30px 80px rgba(0, 0, 0, 0.85),
                0 0 50px ${primaryColor}33,
                0 0 0 1.5px rgba(229, 169, 60, 0.45)
              `,
              transformStyle: "preserve-3d"
            }}
          >
            {/* Hero Image */}
            <Img
              src={resolvedHero}
              onError={() => setHasMediaError(true)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: `scale(${1.0 + (frame / durationInFrames) * 0.08})`,
                transition: "transform 0.1s linear"
              }}
            />

            {/* Inner Dark Gradient Over Hero for text contrast */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(180deg, rgba(5,8,17,0.15) 0%, rgba(5,8,17,0.7) 100%)"
              }}
            />

            {/* Subtle Specular Sheen across Hero Edge */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: `${shimmerProgress}%`,
                width: "50%",
                height: "100%",
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.22) 50%, transparent 100%)",
                transform: "skewX(-25deg)",
                pointerEvents: "none",
                filter: "blur(4px)"
              }}
            />
          </div>
        ) : null}
      </AbsoluteFill>

      {/* ========================================================= */}
      {/* LAYER 4: OPTICAL ANAMORPHIC LENS FLARE BLOOM             */}
      {/* ========================================================= */}
      <div
        style={{
          position: "absolute",
          top: "32%",
          left: `${flareX}%`,
          width: "360px",
          height: "360px",
          transform: `translate(-50%, -50%) scale(${flareScale})`,
          opacity: flareBloomOpacity,
          pointerEvents: "none",
          zIndex: 40
        }}
      >
        {/* Core Flare Glow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `radial-gradient(circle, #FFFFFF 0%, ${accentColor} 30%, ${primaryColor} 60%, transparent 75%)`,
            filter: "blur(18px)"
          }}
        />
        {/* Horizontal Anamorphic Streak */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "-180%",
            right: "-180%",
            height: "3px",
            transform: "translateY(-50%)",
            background: `linear-gradient(90deg, transparent 0%, ${accentColor} 40%, #FFFFFF 50%, ${primaryColor} 60%, transparent 100%)`,
            filter: "blur(1px)",
            boxShadow: `0 0 16px ${accentColor}`
          }}
        />
      </div>

      {/* ========================================================= */}
      {/* LAYER 5: STAGGERED TYPOGRAPHIC ENTRANCE & GOLD SHIMMER    */}
      {/* ========================================================= */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingBottom: isVertical ? "14%" : isSquare ? "9%" : "6%",
          paddingLeft: "6%",
          paddingRight: "6%",
          pointerEvents: "none",
          zIndex: 50
        }}
      >
        <div
          style={{
            padding: isVertical ? "26px 20px" : isSquare ? "28px 36px" : "32px 48px",
            borderRadius: "24px",
            backgroundColor: "rgba(8, 14, 26, 0.78)",
            border: `1.5px solid ${primaryColor}66`,
            boxShadow: `
              0 24px 60px rgba(0, 0, 0, 0.9),
              0 0 40px ${primaryColor}22,
              inset 0 1px 0 rgba(255, 255, 255, 0.15)
            `,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            textAlign: "center",
            maxWidth: isVertical ? "94%" : "920px",
            width: "100%",
            position: "relative",
            overflow: "hidden"
          }}
        >
          {/* Top Edge Accent Light */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "2px",
              background: `linear-gradient(90deg, transparent 0%, ${primaryColor} 50%, transparent 100%)`
            }}
          />

          {/* Eyebrow Badge */}
          {eyebrowText ? (
            <div
              style={{
                opacity: eyebrowOpacity,
                transform: `translateY(${eyebrowY}px)`,
                marginBottom: "12px"
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "4px 18px",
                  borderRadius: "99px",
                  backgroundColor: "rgba(229, 169, 60, 0.14)",
                  border: `1px solid ${primaryColor}77`,
                  color: primaryColor,
                  fontSize: `${eyebrowFontSize}px`,
                  fontWeight: 800,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  boxShadow: `0 0 16px ${primaryColor}22`
                }}
              >
                {eyebrowText}
              </span>
            </div>
          ) : null}

          {/* Main Title with Gold Shimmer Gradient */}
          <div
            style={{
              opacity: titleOpacity,
              transform: `translateY(${titleY}px) scale(${titleScale})`,
              fontSize: `${titleFontSize}px`,
              fontWeight: 900,
              lineHeight: 1.2,
              marginBottom: "14px",
              letterSpacing: "0.02em",
              background: `
                linear-gradient(
                  135deg,
                  ${textColor} 0%,
                  #FFE8B3 25%,
                  ${primaryColor} 50%,
                  #FFF2D6 70%,
                  ${textColor} 100%
                )
              `,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: `drop-shadow(0 4px 16px rgba(0,0,0,0.8)) drop-shadow(0 0 20px ${primaryColor}44)`,
              position: "relative"
            }}
          >
            {mainTitle}
          </div>

          {/* Subtitle with Expanding Tracking */}
          {subTitle ? (
            <div
              style={{
                opacity: subtitleOpacity,
                transform: `translateY(${subtitleY}px)`,
                color: accentColor,
                fontSize: `${subtitleFontSize}px`,
                fontWeight: 600,
                letterSpacing: `${subtitleTracking}em`,
                textTransform: "uppercase",
                textShadow: `0 0 14px ${accentColor}66`
              }}
            >
              {subTitle}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
