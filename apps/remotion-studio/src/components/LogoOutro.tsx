import React, { useState, useMemo } from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig
} from "remotion";
import { resolveMediaUrl, isVideoFile } from "../media-resolver";
import type { AspectRatioMode, StudioThemeProps } from "../types";

export const DEFAULT_PSU_LOGO = "/Volumes/ภาควีดีทัศน์/Logo 88 2561/Prince_of_Songkla_University_Emblem.png";

export interface LogoOutroProps {
  sourcePath?: string;
  presetId?: "logo-outro-v1" | "logo-outro-particle-burst-v1" | "logo-outro-video-v1" | "logo-outro-minimal-v1" | string;
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

// Deterministic pseudo-random spark generation for light streak
interface SparkParticle {
  id: number;
  offsetX: number;
  offsetY: number;
  speed: number;
  size: number;
  color: string;
  triggerFrame: number;
}

// Generate sparks deterministically
function generateSparks(count: number): SparkParticle[] {
  const sparks: SparkParticle[] = [];
  const colors = ["#00E5FF", "#FFE699", "#E5A93C", "#FFFFFF", "#38BDF8"];
  for (let i = 0; i < count; i++) {
    const seed = (i * 9301 + 49297) % 233280;
    const rnd1 = seed / 233280;
    const rnd2 = ((seed * 9301 + 49297) % 233280) / 233280;
    const rnd3 = ((seed * 12345 + 67891) % 233280) / 233280;
    sparks.push({
      id: i,
      offsetX: (rnd1 - 0.5) * 60,
      offsetY: (rnd2 - 0.5) * 80,
      speed: 0.8 + rnd3 * 1.4,
      size: 2 + (i % 3) * 1.5,
      color: colors[i % colors.length] ?? "#E5A93C",
      triggerFrame: Math.floor((i / count) * 12)
    });
  }
  return sparks;
}

// Generate celestial particles for particle burst
interface CelestialParticle {
  id: number;
  angle: number;
  speed: number;
  size: number;
  color: string;
  decay: number;
}

function generateCelestialParticles(count: number): CelestialParticle[] {
  const particles: CelestialParticle[] = [];
  const colors = ["#E5A93C", "#00E5FF", "#FFD700", "#FFFFFF", "#67E8F9", "#FBBF24"];
  for (let i = 0; i < count; i++) {
    // Golden angle distribution for natural radial spread
    const angle = i * 137.5 * (Math.PI / 180);
    const speed = 120 + ((i * 7) % 180);
    const size = 2.5 + (i % 4) * 1.2;
    particles.push({
      id: i,
      angle,
      speed,
      size,
      color: colors[i % colors.length] ?? "#E5A93C",
      decay: 0.85 + (i % 3) * 0.05
    });
  }
  return particles;
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
  const isVideoAsset = isVideoFile(effectiveSource);
  const resolvedMedia = resolveMediaUrl(effectiveSource);

  const mainTitle = title || note || "PSU BROADCAST";
  const subTitle = subtitle || "Prince of Songkla University";
  const eyebrowText = eyebrow || "มหาวิทยาลัยสงขลานครินทร์";

  const clampedLogoScale = Math.max(0.5, Math.min(1.8, logoScale));
  const clampedGlow = Math.max(0.1, Math.min(2.5, glowIntensity));

  // Slow cinematic micro-zoom across the entire outro timeline (1.0 -> 1.05)
  const microZoom = interpolate(frame, [0, durationInFrames], [1.0, 1.05], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  // Master bloom exit in the last 15 frames
  const exitFrames = 15;
  const exitProgress = interpolate(
    frame,
    [Math.max(0, durationInFrames - exitFrames), durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const masterOpacity = (1 - exitProgress);
  const masterBrightness = 1 + exitProgress * 0.4;
  const masterBlur = exitProgress * 8;

  // Static Spark and Celestial particle lists
  const sparks = useMemo(() => generateSparks(24), []);
  const celestialParticles = useMemo(() => generateCelestialParticles(40), []);

  // Responsive base dimensions
  const isPortrait = aspectRatio === "9:16";
  const emblemWidth = (isPortrait ? 220 : 180) * clampedLogoScale;

  // =========================================================================
  // PRESET 1: "logo-outro-v1" (PSU Golden Light Streak Ident - Broadcast Upgraded)
  // =========================================================================
  if (presetId === "logo-outro-v1") {
    // Stage 1 (0-14f): Anamorphic light streak / laser sweep cuts across horizontally
    const streakProgress = interpolate(frame, [0, 14], [-20, 120], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });
    const streakOpacity = interpolate(frame, [0, 4, 12, 18], [0, 1, 0.9, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });
    const streakHeight = interpolate(frame, [0, 6, 14], [2, 6, 2], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });

    // Stage 2 (12-28f): 3D Emblem emerges with scale bounce & radial aura pulse (damping 12, mass 0.5)
    const emblemSpring = spring({
      frame: Math.max(0, frame - 10),
      fps,
      config: { damping: 12, mass: 0.5, stiffness: 100 }
    });
    const emblemOpacity = interpolate(frame, [10, 15], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });
    const emblemRotateX = interpolate(emblemSpring, [0, 1], [16, 0]);
    const emblemRotateY = interpolate(emblemSpring, [0, 1], [-10, 0]);

    // Radial shockwave aura pulse on emblem land (frame 12-28)
    const shockwaveScale = interpolate(frame, [12, 28], [0.4, 2.2], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });
    const shockwaveOpacity = interpolate(frame, [12, 16, 28], [0, 0.85 * clampedGlow, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });

    // Stage 3 (28-50f): 3-tier typography slides up through inverted mask
    const eyebrowSpring = spring({
      frame: Math.max(0, frame - 22),
      fps,
      config: { damping: 14, mass: 0.5 }
    });
    const titleSpring = spring({
      frame: Math.max(0, frame - 26),
      fps,
      config: { damping: 13, mass: 0.55 }
    });
    const subtitleSpring = spring({
      frame: Math.max(0, frame - 30),
      fps,
      config: { damping: 14, mass: 0.6 }
    });

    const eyebrowY = interpolate(eyebrowSpring, [0, 1], [35, 0]);
    const eyebrowOpacity = interpolate(eyebrowSpring, [0, 1], [0, 1]);

    const titleY = interpolate(titleSpring, [0, 1], [45, 0]);
    const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

    const subtitleY = interpolate(subtitleSpring, [0, 1], [30, 0]);
    const subtitleOpacity = interpolate(subtitleSpring, [0, 1], [0, 1]);

    // Golden sheen sweep across typography & emblem (frame 34-52)
    const sheenProgress = interpolate(frame, [34, 52], [-80, 180], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });

    // Stage 4 (50f+): Ambient breathing glow
    const ambientBreath = (Math.sin((frame / fps) * Math.PI * 1.5) * 0.08 + 1.0) * clampedGlow;

    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#070B14",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontFamily,
          overflow: "hidden",
          opacity: masterOpacity,
          filter: `blur(${masterBlur}px) brightness(${masterBrightness})`
        }}
      >
        {/* Micro-zoom scene container */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            transform: `scale(${microZoom})`,
            transformOrigin: "center center"
          }}
        >
          {/* Ambient Background Radial Glows */}
          <div
            style={{
              position: "absolute",
              width: isPortrait ? 600 : 800,
              height: isPortrait ? 600 : 800,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${primaryColor}33 0%, ${accentColor}18 35%, rgba(7,11,20,0) 70%)`,
              transform: `scale(${ambientBreath})`,
              pointerEvents: "none",
              filter: "blur(20px)"
            }}
          />

          {/* Shockwave Aura Ring (Frame 12-28) */}
          {shockwaveOpacity > 0.01 && (
            <div
              style={{
                position: "absolute",
                width: 320,
                height: 320,
                borderRadius: "50%",
                border: `3px solid ${primaryColor}`,
                boxShadow: `0 0 35px ${accentColor}, inset 0 0 25px ${primaryColor}`,
                transform: `scale(${shockwaveScale})`,
                opacity: shockwaveOpacity,
                pointerEvents: "none"
              }}
            />
          )}

          {/* Stage 1: Anamorphic Horizontal Laser Sweep & Flare (Frame 0-18) */}
          {streakOpacity > 0.01 && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: 0,
                right: 0,
                transform: "translateY(-50%)",
                height: streakHeight,
                background: `linear-gradient(90deg, transparent 0%, ${accentColor} 30%, #FFFFFF 50%, ${primaryColor} 70%, transparent 100%)`,
                boxShadow: `0 0 20px 4px ${accentColor}, 0 0 45px 8px ${primaryColor}`,
                opacity: streakOpacity,
                pointerEvents: "none",
                zIndex: 10
              }}
            >
              {/* Traveling Hot Core Lens Flare */}
              <div
                style={{
                  position: "absolute",
                  left: `${streakProgress}%`,
                  top: "50%",
                  width: 260,
                  height: 120,
                  transform: "translate(-50%, -50%)",
                  background: `radial-gradient(ellipse at center, #FFFFFF 0%, ${accentColor} 40%, ${primaryColor}88 70%, transparent 100%)`,
                  filter: "blur(4px)",
                  mixBlendMode: "screen",
                  pointerEvents: "none"
                }}
              />

              {/* Spark Particles */}
              {sparks.map((spark) => {
                if (frame < spark.triggerFrame || frame > spark.triggerFrame + 14) return null;
                const sparkAge = frame - spark.triggerFrame;
                const sparkDist = sparkAge * spark.speed * 8;
                const sparkAlpha = interpolate(sparkAge, [0, 3, 14], [0, 1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp"
                });
                return (
                  <div
                    key={spark.id}
                    style={{
                      position: "absolute",
                      left: `calc(${streakProgress}% + ${spark.offsetX + (spark.id % 2 === 0 ? sparkDist : -sparkDist)}px)`,
                      top: `calc(50% + ${spark.offsetY + (spark.id % 3 === 0 ? -sparkDist : sparkDist * 0.8)}px)`,
                      width: spark.size,
                      height: spark.size,
                      borderRadius: "50%",
                      backgroundColor: spark.color,
                      boxShadow: `0 0 10px ${spark.color}`,
                      opacity: sparkAlpha,
                      pointerEvents: "none"
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* Central Broadcast Ident Lockup */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              zIndex: 20,
              perspective: 1000
            }}
          >
            {/* Stage 3: Eyebrow Mask Container */}
            <div
              style={{
                overflow: "hidden",
                padding: "4px 8px",
                marginBottom: 16
              }}
            >
              {eyebrowText ? (
                <div
                  style={{
                    transform: `translateY(${eyebrowY}px)`,
                    opacity: eyebrowOpacity,
                    fontSize: isPortrait ? 18 : 15,
                    fontWeight: 700,
                    color: primaryColor,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    padding: "6px 20px",
                    borderRadius: 999,
                    backgroundColor: "rgba(229, 169, 60, 0.12)",
                    border: "1px solid rgba(229, 169, 60, 0.4)",
                    boxShadow: `0 0 20px ${primaryColor}22`
                  }}
                >
                  {eyebrowText}
                </div>
              ) : null}
            </div>

            {/* Stage 2: 3D Emblem with Scale Bounce & Dynamic Shimmer */}
            <div
              style={{
                transform: `scale(${emblemSpring * clampedLogoScale}) rotateX(${emblemRotateX}deg) rotateY(${emblemRotateY}deg)`,
                opacity: emblemOpacity,
                marginBottom: 22,
                position: "relative",
                display: "flex",
                justifyContent: "center",
                alignItems: "center"
              }}
            >
              {resolvedMedia && !hasMediaError ? (
                <div style={{ position: "relative" }}>
                  <Img
                    src={resolvedMedia}
                    onError={() => setHasMediaError(true)}
                    style={{
                      width: emblemWidth,
                      height: "auto",
                      display: "block",
                      filter: `drop-shadow(0 0 28px ${primaryColor}${Math.round(clampedGlow * 80).toString(16).padStart(2, "0")}) drop-shadow(0 14px 40px rgba(0,0,0,0.9))`
                    }}
                  />
                  {/* Golden Sheen Shimmer Overlay on Emblem */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      pointerEvents: "none",
                      mixBlendMode: "screen",
                      background: `linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.7) 48%, rgba(229,169,60,0.85) 52%, transparent 70%)`,
                      backgroundSize: "200% 100%",
                      backgroundPosition: `${sheenProgress}% 0%`,
                      opacity: interpolate(frame, [34, 40, 50, 54], [0, 0.9, 0.9, 0], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp"
                      })
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    width: 140 * clampedLogoScale,
                    height: 140 * clampedLogoScale,
                    borderRadius: "50%",
                    border: `4px solid ${primaryColor}`,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    boxShadow: `0 0 45px ${primaryColor}77, inset 0 0 25px ${primaryColor}44`,
                    backgroundColor: "rgba(11, 18, 32, 0.95)"
                  }}
                >
                  <span style={{ color: primaryColor, fontSize: 44 * clampedLogoScale, fontWeight: 900 }}>
                    PSU
                  </span>
                </div>
              )}
            </div>

            {/* Stage 3: Main Title Mask Container */}
            <div
              style={{
                overflow: "hidden",
                padding: "2px 16px",
                marginBottom: 6,
                position: "relative"
              }}
            >
              <div
                style={{
                  transform: `translateY(${titleY}px)`,
                  opacity: titleOpacity,
                  color: textColor,
                  fontSize: isPortrait ? 44 : 38,
                  fontWeight: 900,
                  letterSpacing: "0.09em",
                  textShadow: `0 0 30px ${primaryColor}88, 0 4px 18px rgba(0,0,0,0.9)`,
                  position: "relative"
                }}
              >
                {mainTitle}
                {/* Specular Golden Text Sweep */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.9), rgba(229,169,60,0.9), transparent)`,
                    backgroundClip: "text",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    transform: `translateX(${sheenProgress}%)`,
                    opacity: interpolate(frame, [34, 42, 50, 54], [0, 1, 1, 0], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp"
                    })
                  }}
                >
                  {mainTitle}
                </div>
              </div>
            </div>

            {/* Stage 3: Subtitle Mask Container */}
            <div
              style={{
                overflow: "hidden",
                padding: "2px 16px"
              }}
            >
              <div
                style={{
                  transform: `translateY(${subtitleY}px)`,
                  opacity: subtitleOpacity,
                  color: accentColor,
                  fontSize: isPortrait ? 22 : 18,
                  fontWeight: 600,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  textShadow: `0 0 16px ${accentColor}66`
                }}
              >
                {subTitle}
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // =========================================================================
  // PRESET 2: "logo-outro-particle-burst-v1" (Celestial / Cinematic Particle Burst)
  // =========================================================================
  if (presetId === "logo-outro-particle-burst-v1") {
    // Expanding Celestial Shockwave Ring (0-26f)
    const ringScale = interpolate(frame, [0, 26], [0.1, 3.2], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });
    const ringOpacity = interpolate(frame, [0, 6, 26], [0, 0.9 * clampedGlow, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });

    // Emblem Spring Entrance with Chromatic Aberration Fringe (frame 6-24)
    const emblemBurstSpring = spring({
      frame: Math.max(0, frame - 6),
      fps,
      config: { damping: 14, mass: 0.6, stiffness: 95 }
    });
    const burstEmblemOpacity = interpolate(frame, [6, 12], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });

    // Chromatic aberration fringe offsets
    const chromaOffset = interpolate(frame, [6, 14, 28], [8, 3, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });

    // Sleek Executive Divider Reveal
    const dividerScaleX = interpolate(frame, [18, 34], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });

    // Staggered Executive Typography
    const eyebrowSpring = spring({
      frame: Math.max(0, frame - 16),
      fps,
      config: { damping: 15, mass: 0.5 }
    });
    const titleSpring = spring({
      frame: Math.max(0, frame - 20),
      fps,
      config: { damping: 14, mass: 0.55 }
    });
    const subtitleSpring = spring({
      frame: Math.max(0, frame - 24),
      fps,
      config: { damping: 15, mass: 0.6 }
    });

    // Ambient floating dust drift
    const ambientDustDrift = (frame / fps) * 8;

    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#060A12",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontFamily,
          overflow: "hidden",
          opacity: masterOpacity,
          filter: `blur(${masterBlur}px) brightness(${masterBrightness})`
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            transform: `scale(${microZoom})`,
            transformOrigin: "center center"
          }}
        >
          {/* Deep Space Celestial Nebula Background */}
          <div
            style={{
              position: "absolute",
              width: 700,
              height: 700,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${accentColor}22 0%, ${primaryColor}15 40%, transparent 75%)`,
              filter: "blur(30px)",
              pointerEvents: "none"
            }}
          />

          {/* Expanding Golden Shockwave Ring */}
          {ringOpacity > 0.01 && (
            <div
              style={{
                position: "absolute",
                width: 200,
                height: 200,
                borderRadius: "50%",
                border: `2px solid ${primaryColor}`,
                boxShadow: `0 0 30px ${accentColor}, inset 0 0 20px ${primaryColor}`,
                transform: `scale(${ringScale})`,
                opacity: ringOpacity,
                pointerEvents: "none"
              }}
            />
          )}

          {/* Celestial Particle Cloud Explosion (40 particles) */}
          {celestialParticles.map((particle) => {
            const particleAge = Math.max(0, frame - 2);
            // Physics deceleration
            const currentDist = interpolate(particleAge, [0, 30], [0, particle.speed], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp"
            });
            // Ambient drift after burst
            const finalDist = currentDist + (particleAge > 30 ? (particleAge - 30) * 0.4 : 0);
            const posX = Math.cos(particle.angle) * finalDist;
            const posY = Math.sin(particle.angle) * finalDist + (particleAge > 30 ? -ambientDustDrift * 0.3 : 0);

            const particleAlpha = interpolate(particleAge, [0, 4, 30, 90], [0, 1, 0.85, 0.4], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp"
            });

            return (
              <div
                key={particle.id}
                style={{
                  position: "absolute",
                  left: `calc(50% + ${posX}px)`,
                  top: `calc(50% + ${posY}px)`,
                  width: particle.size,
                  height: particle.size,
                  borderRadius: "50%",
                  backgroundColor: particle.color,
                  boxShadow: `0 0 8px ${particle.color}`,
                  opacity: particleAlpha,
                  pointerEvents: "none",
                  zIndex: 5
                }}
              />
            );
          })}

          {/* Central Executive End-Card Lockup */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              zIndex: 20
            }}
          >
            {/* Eyebrow Tag */}
            {eyebrowText ? (
              <div
                style={{
                  transform: `translateY(${interpolate(eyebrowSpring, [0, 1], [25, 0])}px)`,
                  opacity: eyebrowSpring,
                  fontSize: isPortrait ? 17 : 14,
                  fontWeight: 700,
                  color: primaryColor,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  marginBottom: 16,
                  padding: "4px 18px",
                  borderRadius: 999,
                  backgroundColor: "rgba(11, 18, 32, 0.7)",
                  border: "1px solid rgba(229, 169, 60, 0.3)",
                  backdropFilter: "blur(8px)"
                }}
              >
                {eyebrowText}
              </div>
            ) : null}

            {/* Emblem with Radial Chromatic Aberration Fringe */}
            <div
              style={{
                transform: `scale(${emblemBurstSpring * clampedLogoScale})`,
                opacity: burstEmblemOpacity,
                marginBottom: 20,
                position: "relative"
              }}
            >
              {resolvedMedia && !hasMediaError ? (
                <Img
                  src={resolvedMedia}
                  onError={() => setHasMediaError(true)}
                  style={{
                    width: emblemWidth,
                    height: "auto",
                    display: "block",
                    filter: `drop-shadow(-${chromaOffset}px 0 6px ${accentColor}aa) drop-shadow(${chromaOffset}px 0 6px ${primaryColor}cc) drop-shadow(0 0 32px ${primaryColor}77) drop-shadow(0 16px 36px rgba(0,0,0,0.85))`
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 130 * clampedLogoScale,
                    height: 130 * clampedLogoScale,
                    borderRadius: "50%",
                    border: `3px solid ${primaryColor}`,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    boxShadow: `0 0 35px ${primaryColor}66`,
                    backgroundColor: "rgba(11, 18, 32, 0.9)"
                  }}
                >
                  <span style={{ color: primaryColor, fontSize: 40 * clampedLogoScale, fontWeight: 900 }}>
                    PSU
                  </span>
                </div>
              )}
            </div>

            {/* Symmetrical Luxury Golden Divider */}
            <div
              style={{
                width: isPortrait ? 160 : 200,
                height: 2,
                background: `linear-gradient(90deg, transparent, ${primaryColor}, ${accentColor}, transparent)`,
                transform: `scaleX(${dividerScaleX})`,
                transformOrigin: "center center",
                marginBottom: 16,
                boxShadow: `0 0 10px ${primaryColor}`
              }}
            />

            {/* Main Title */}
            <div
              style={{
                transform: `translateY(${interpolate(titleSpring, [0, 1], [30, 0])}px)`,
                opacity: titleSpring,
                color: textColor,
                fontSize: isPortrait ? 40 : 34,
                fontWeight: 800,
                letterSpacing: "0.12em",
                marginBottom: 8,
                textShadow: `0 0 24px ${primaryColor}66`
              }}
            >
              {mainTitle}
            </div>

            {/* Subtitle / Department */}
            <div
              style={{
                transform: `translateY(${interpolate(subtitleSpring, [0, 1], [20, 0])}px)`,
                opacity: subtitleSpring,
                color: "#94A3B8",
                fontSize: isPortrait ? 20 : 16,
                fontWeight: 500,
                letterSpacing: "0.2em",
                textTransform: "uppercase"
              }}
            >
              {subTitle}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // =========================================================================
  // PRESET 3: "logo-outro-video-v1" (Broadcast Fullscreen Video Sting)
  // =========================================================================
  if (presetId === "logo-outro-video-v1" || (isVideoAsset && presetId !== "logo-outro-minimal-v1")) {
    const fadeInFrames = Math.max(1, Math.round((fadeInMs / 1000) * fps));
    const fadeOutFrames = Math.max(1, Math.round((fadeOutMs / 1000) * fps));
    const videoOpacity = interpolate(
      frame,
      [0, fadeInFrames, Math.max(fadeInFrames, durationInFrames - fadeOutFrames), durationInFrames],
      [0, 1, 1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );

    // Optional animated logo end-card overlay (reveals after impact around frame 18)
    const overlaySpring = spring({
      frame: Math.max(0, frame - 18),
      fps,
      config: { damping: 14, mass: 0.6 }
    });

    const hasCustomText = Boolean(title || eyebrow || subtitle);

    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#070B14",
          opacity: videoOpacity * masterOpacity,
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
            🎬 Broadcast Video Outro Ready
          </div>
        )}

        {/* Dynamic Cinematic Vignette */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at center, transparent 45%, rgba(7, 11, 20, 0.85) 100%)",
            pointerEvents: "none"
          }}
        />

        {/* Optional Broadcast End-Card Overlay Badge */}
        {hasCustomText && (
          <div
            style={{
              position: "absolute",
              bottom: isPortrait ? "10%" : "8%",
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              pointerEvents: "none",
              transform: `translateY(${interpolate(overlaySpring, [0, 1], [30, 0])}px)`,
              opacity: overlaySpring
            }}
          >
            <div
              style={{
                backgroundColor: "rgba(7, 11, 20, 0.75)",
                backdropFilter: "blur(14px)",
                border: "1px solid rgba(229, 169, 60, 0.35)",
                boxShadow: `0 8px 32px rgba(0,0,0,0.8), 0 0 24px ${primaryColor}33`,
                borderRadius: 20,
                padding: "16px 32px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                maxWidth: "85%"
              }}
            >
              {eyebrowText ? (
                <div
                  style={{
                    fontSize: isPortrait ? 15 : 13,
                    fontWeight: 700,
                    color: primaryColor,
                    letterSpacing: "0.15em",
                    marginBottom: 4
                  }}
                >
                  {eyebrowText}
                </div>
              ) : null}
              <div
                style={{
                  fontSize: isPortrait ? 28 : 22,
                  fontWeight: 800,
                  color: textColor,
                  letterSpacing: "0.08em"
                }}
              >
                {mainTitle}
              </div>
              {subTitle ? (
                <div
                  style={{
                    fontSize: isPortrait ? 16 : 13,
                    color: accentColor,
                    fontWeight: 600,
                    letterSpacing: "0.12em",
                    marginTop: 2
                  }}
                >
                  {subTitle}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </AbsoluteFill>
    );
  }

  // =========================================================================
  // PRESET 4: "logo-outro-minimal-v1" (Modern Minimal Emblem - Legacy / Clean)
  // =========================================================================
  const minimalSpring = spring({
    frame: Math.max(0, frame - 4),
    fps,
    config: { damping: 14, mass: 0.6 }
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#070B14",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontFamily,
        overflow: "hidden",
        opacity: masterOpacity,
        filter: `blur(${masterBlur}px) brightness(${masterBrightness})`
      }}
    >
      <div
        style={{
          transform: `scale(${microZoom})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          opacity: minimalSpring
        }}
      >
        {resolvedMedia && !hasMediaError ? (
          <Img
            src={resolvedMedia}
            onError={() => setHasMediaError(true)}
            style={{
              width: (isPortrait ? 180 : 150) * clampedLogoScale,
              height: "auto",
              marginBottom: 16,
              filter: "drop-shadow(0 4px 18px rgba(0,0,0,0.7))"
            }}
          />
        ) : (
          <div
            style={{
              width: 100 * clampedLogoScale,
              height: 100 * clampedLogoScale,
              borderRadius: "50%",
              border: `3px solid ${primaryColor}`,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 16,
              backgroundColor: "rgba(11, 18, 32, 0.9)"
            }}
          >
            <span style={{ color: primaryColor, fontSize: 32 * clampedLogoScale, fontWeight: 900 }}>
              PSU
            </span>
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
            fontSize: isPortrait ? 36 : 30,
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
            fontSize: isPortrait ? 20 : 16,
            fontWeight: 500,
            letterSpacing: "0.08em"
          }}
        >
          {subTitle}
        </div>
      </div>
    </AbsoluteFill>
  );
};

