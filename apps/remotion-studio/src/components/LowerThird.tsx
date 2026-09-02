import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AspectRatioMode, LowerThirdPresetId, StudioThemeProps } from "../types";

export interface LowerThirdComponentProps {
  name?: string;
  title?: string;
  department?: string;
  presetId?: LowerThirdPresetId | string;
  aspectRatio?: AspectRatioMode;
  theme?: StudioThemeProps;
  containerStyle?: React.CSSProperties;
}

export const LowerThird: React.FC<LowerThirdComponentProps> = ({
  name = "ชื่อวิทยากร / ผู้บรรยาย",
  title = "ตำแหน่งทางวิชาการ / สังกัดหน่วยงาน",
  department,
  presetId = "lowerthird-glass-beacon-v1",
  aspectRatio = "9:16",
  theme,
  containerStyle
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const primaryColor = theme?.primaryColor ?? "#E5A93C"; // PSU Royal Gold
  const secondaryColor = theme?.secondaryColor ?? "#0B1220"; // Midnight Navy
  const accentColor = theme?.accentColor ?? "#00E5FF"; // Bright Cyan
  const textColor = theme?.textColor ?? "#FFFFFF";
  const fontFamily =
    theme?.fontFamily ??
    "-apple-system, BlinkMacSystemFont, 'Prompt', 'Kanit', 'Noto Sans Thai', 'SF Pro Display', sans-serif";

  // Common Responsive Dimensions
  const isPortrait = aspectRatio === "9:16";
  const isSquare = aspectRatio === "1:1";

  const bottomPosition = isPortrait ? "24%" : isSquare ? "15%" : "10%";
  const leftPosition = isPortrait ? "5%" : "5%";
  const maxContainerWidth = isPortrait ? "90%" : isSquare ? "75%" : "58%";

  const nameSize = isPortrait ? 36 : isSquare ? 33 : 30;
  const titleSize = isPortrait ? 22 : isSquare ? 20 : 18;
  const deptSize = isPortrait ? 18 : isSquare ? 16 : 15;

  // Exit transition calculations (last 12 frames)
  const exitFrames = 12;
  const exitProgress = interpolate(
    frame,
    [Math.max(0, durationInFrames - exitFrames), durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Normalize preset id with backward compatibility aliases
  const activePreset =
    presetId === "lowerthird-glass-gold-v1"
      ? "lowerthird-glass-beacon-v1"
      : presetId === "lowerthird-gradient-ribbon-v1"
      ? "lowerthird-kinetic-ribbon-v1"
      : presetId;

  // =========================================================================
  // PRESET 1: PSU Royal Gold Glass Beacon ("lowerthird-glass-beacon-v1")
  // =========================================================================
  if (activePreset === "lowerthird-glass-beacon-v1") {
    // Stage 1 (0-10f): Vertical gold light beacon flashes & sweeps outward
    const beaconSpring = spring({
      frame,
      fps,
      config: { damping: 12, mass: 0.4, stiffness: 180 }
    });
    const beaconScaleY = interpolate(beaconSpring, [0, 1], [0, 1]);
    const beaconGlow = interpolate(frame, [0, 5, 12], [0, 2.2, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });
    const refractionX = interpolate(frame, [2, 16], [-40, 130], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });

    // Stage 2 (10-24f): Damped spring unrolls the frosted glass card
    const cardSpring = spring({
      frame: Math.max(0, frame - 5),
      fps,
      config: { damping: 15, mass: 0.65, stiffness: 120 }
    });
    const cardUnrollWidth = interpolate(cardSpring, [0, 1], [0, 100]);
    const cardSlideX = interpolate(cardSpring, [0, 1], [-24, 0]);

    // Stage 3: Kinetic text mask reveals (Name @ 10f, Title @ 14f, Dept @ 18f)
    const nameSpring = spring({
      frame: Math.max(0, frame - 10),
      fps,
      config: { damping: 14, mass: 0.5, stiffness: 135 }
    });
    const nameTranslateY = interpolate(nameSpring, [0, 1], [110, 0]);
    const nameOpacity = interpolate(nameSpring, [0, 1], [0, 1]);

    const titleSpring = spring({
      frame: Math.max(0, frame - 14),
      fps,
      config: { damping: 14, mass: 0.5, stiffness: 135 }
    });
    const titleTranslateY = interpolate(titleSpring, [0, 1], [110, 0]);
    const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

    const deptSpring = spring({
      frame: Math.max(0, frame - 18),
      fps,
      config: { damping: 14, mass: 0.5, stiffness: 135 }
    });
    const deptTranslateY = interpolate(deptSpring, [0, 1], [110, 0]);
    const deptOpacity = interpolate(deptSpring, [0, 1], [0, 1]);

    // Stage 4: Continuous subtle light sweep shimmer along the bottom border
    const shimmerOffset = interpolate((frame + 12) % 55, [0, 55], [-40, 140]);

    // Exit transition
    const exitSlideX = interpolate(exitProgress, [0, 1], [0, -50]);
    const exitOpacity = 1 - exitProgress;
    const exitScale = interpolate(exitProgress, [0, 1], [1, 0.95]);

    return (
      <div
        style={{
          position: "absolute",
          bottom: bottomPosition,
          left: leftPosition,
          maxWidth: maxContainerWidth,
          transform: `translateX(${exitSlideX}px) scale(${exitScale})`,
          opacity: exitOpacity,
          zIndex: 45,
          pointerEvents: "none",
          ...containerStyle
        }}
      >
        <div
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "stretch",
            filter: `drop-shadow(0 18px 45px rgba(0, 0, 0, 0.85)) drop-shadow(0 0 20px ${primaryColor}33)`,
            clipPath: `polygon(0 0, ${cardUnrollWidth}% 0, ${cardUnrollWidth}% 100%, 0 100%)`,
            transform: `translateX(${cardSlideX}px)`,
            fontFamily
          }}
        >
          {/* Main Frosted Glass Body */}
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              backgroundColor: "rgba(11, 18, 32, 0.88)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: `1.5px solid ${primaryColor}55`,
              borderRadius: "0 18px 18px 0",
              padding: isPortrait ? "14px 24px 14px 18px" : "14px 28px 14px 20px",
              overflow: "hidden"
            }}
          >
            {/* Stage 1: Soft Glass Refraction Sweep Light */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${refractionX}%`,
                width: "60px",
                background: "linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.35) 50%, transparent 100%)",
                transform: "skewX(-25deg)",
                pointerEvents: "none",
                opacity: interpolate(frame, [2, 8, 16], [0, 0.85, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp"
                })
              }}
            />

            {/* Stage 1 & Ongoing: Vertical Gold Beacon Light Column */}
            <div
              style={{
                width: 5,
                alignSelf: "stretch",
                minHeight: "44px",
                backgroundColor: primaryColor,
                borderRadius: 4,
                marginRight: 16,
                transform: `scaleY(${beaconScaleY})`,
                transformOrigin: "center",
                boxShadow: `0 0 ${16 * beaconGlow}px ${primaryColor}, 0 0 ${32 * beaconGlow}px ${primaryColor}88`,
                flexShrink: 0
              }}
            />

            {/* Kinetic Text Stack with Precision Masks */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {/* Name (Stage 3 Masked Reveal) */}
              <div style={{ overflow: "hidden", paddingBottom: 2 }}>
                <div
                  style={{
                    transform: `translateY(${nameTranslateY}%)`,
                    opacity: nameOpacity,
                    fontSize: nameSize,
                    fontWeight: 800,
                    color: textColor,
                    letterSpacing: "0.2px",
                    lineHeight: 1.2,
                    textShadow: "0 2px 10px rgba(0, 0, 0, 0.7)"
                  }}
                >
                  {name}
                </div>
              </div>

              {/* Title (Stage 3 Masked Reveal, +4f Stagger) */}
              {title ? (
                <div style={{ overflow: "hidden", paddingBottom: 2 }}>
                  <div
                    style={{
                      transform: `translateY(${titleTranslateY}%)`,
                      opacity: titleOpacity,
                      fontSize: titleSize,
                      fontWeight: 600,
                      color: primaryColor,
                      lineHeight: 1.3,
                      textShadow: `0 0 12px ${primaryColor}44`
                    }}
                  >
                    {title}
                  </div>
                </div>
              ) : null}

              {/* Department (Stage 3 Masked Reveal, +4f Stagger) */}
              {department ? (
                <div style={{ overflow: "hidden" }}>
                  <div
                    style={{
                      transform: `translateY(${deptTranslateY}%)`,
                      opacity: deptOpacity,
                      fontSize: deptSize,
                      fontWeight: 500,
                      color: accentColor,
                      lineHeight: 1.3
                    }}
                  >
                    {department}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Stage 4: Continuous Subtle Light Sweep Shimmer along Bottom Border */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: "2.5px",
                backgroundColor: `${primaryColor}22`,
                overflow: "hidden"
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${shimmerOffset}%`,
                  width: "90px",
                  background: `linear-gradient(90deg, transparent 0%, ${primaryColor} 40%, #FFFFFF 50%, ${primaryColor} 60%, transparent 100%)`,
                  boxShadow: `0 0 10px ${primaryColor}`
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // PRESET 2: Editorial Kinetic Ribbon ("lowerthird-kinetic-ribbon-v1")
  // =========================================================================
  if (activePreset === "lowerthird-kinetic-ribbon-v1") {
    // Ribbon 1 (Primary Gold / Navy) slides from Left (-120% -> 0%)
    const ribbon1Spring = spring({
      frame,
      fps,
      config: { damping: 15, mass: 0.6, stiffness: 130 }
    });
    const ribbon1TranslateX = interpolate(ribbon1Spring, [0, 1], [-120, 0]);

    // Ribbon 2 (Cyan & Midnight Blue) slides from Bottom-Right / Right (+120% -> 0%)
    const ribbon2Spring = spring({
      frame: Math.max(0, frame - 5),
      fps,
      config: { damping: 14, mass: 0.55, stiffness: 125 }
    });
    const ribbon2TranslateX = interpolate(ribbon2Spring, [0, 1], [120, 0]);

    // Editorial Kinetic Letter-Spacing Tracking
    const tracking = interpolate(frame, [6, 28], [5, isPortrait ? 0.3 : 0.6], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });

    // Metallic Glint Sweep across Primary Ribbon
    const glintProgress = interpolate(frame, [14, 30], [-60, 160], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });

    // Exit transition (Ribbon 1 left, Ribbon 2 right)
    const exitR1X = interpolate(exitProgress, [0, 1], [0, -90]);
    const exitR2X = interpolate(exitProgress, [0, 1], [0, 90]);
    const exitOpacity = 1 - exitProgress;

    return (
      <div
        style={{
          position: "absolute",
          bottom: bottomPosition,
          left: leftPosition,
          maxWidth: maxContainerWidth,
          opacity: exitOpacity,
          zIndex: 45,
          pointerEvents: "none",
          fontFamily,
          ...containerStyle
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
          {/* Top Primary Ribbon (Name & Broadcast Badge) */}
          <div
            style={{
              position: "relative",
              transform: `translateX(${ribbon1TranslateX + exitR1X}%) skewX(-12deg)`,
              background: `linear-gradient(135deg, rgba(16, 27, 46, 0.96) 0%, rgba(11, 18, 32, 0.98) 100%)`,
              borderLeft: `5px solid ${primaryColor}`,
              borderTop: `1px solid ${primaryColor}44`,
              borderBottom: `2px solid ${primaryColor}`,
              borderRadius: "0 14px 0 0",
              padding: isPortrait ? "10px 24px 10px 18px" : "12px 28px 12px 22px",
              boxShadow: `0 16px 40px rgba(0, 0, 0, 0.85), 0 0 24px ${primaryColor}25`,
              overflow: "hidden"
            }}
          >
            {/* Metallic Glint Sweep */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${glintProgress}%`,
                width: "50px",
                background: "linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.4) 50%, transparent 100%)",
                pointerEvents: "none"
              }}
            />

            {/* Counter-skew Text Container */}
            <div style={{ transform: "skewX(12deg)" }}>
              <div
                style={{
                  fontSize: Math.max(10, deptSize - 5),
                  fontWeight: 700,
                  letterSpacing: "2.5px",
                  color: primaryColor,
                  textTransform: "uppercase",
                  marginBottom: 2
                }}
              >
                ◆ PSU BROADCAST OFFICIAL
              </div>
              <div
                style={{
                  fontSize: nameSize,
                  fontWeight: 900,
                  color: textColor,
                  letterSpacing: `${tracking}px`,
                  lineHeight: 1.15,
                  textShadow: "0 2px 12px rgba(0, 0, 0, 0.8)"
                }}
              >
                {name}
              </div>
            </div>
          </div>

          {/* Bottom Secondary Intersecting Ribbon (Title & Department) */}
          {(title || department) && (
            <div
              style={{
                position: "relative",
                transform: `translateX(${ribbon2TranslateX + exitR2X}%) skewX(-12deg)`,
                marginLeft: isPortrait ? "14px" : "20px",
                background: `linear-gradient(135deg, rgba(8, 38, 62, 0.94) 0%, rgba(11, 24, 40, 0.96) 100%)`,
                borderLeft: `4px solid ${accentColor}`,
                borderBottom: `2px solid ${accentColor}`,
                borderRadius: "0 0 12px 0",
                padding: isPortrait ? "8px 20px 8px 16px" : "8px 24px 8px 18px",
                boxShadow: `0 12px 30px rgba(0, 0, 0, 0.75), -4px 0 18px ${accentColor}33`,
                overflow: "hidden"
              }}
            >
              {/* Counter-skew Text Container */}
              <div style={{ transform: "skewX(12deg)", display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px" }}>
                {title ? (
                  <span
                    style={{
                      fontSize: titleSize,
                      fontWeight: 600,
                      color: textColor,
                      lineHeight: 1.2
                    }}
                  >
                    {title}
                  </span>
                ) : null}
                {department ? (
                  <span
                    style={{
                      fontSize: deptSize,
                      fontWeight: 500,
                      color: accentColor,
                      lineHeight: 1.2
                    }}
                  >
                    {title ? `· ${department}` : department}
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // PRESET 3: Cyber / Modern Tech HUD ("lowerthird-tech-hud-v1")
  // =========================================================================
  if (activePreset === "lowerthird-tech-hud-v1") {
    // HUD snap entrance
    const hudSpring = spring({
      frame,
      fps,
      config: { damping: 13, mass: 0.45, stiffness: 150 }
    });
    const hudScale = interpolate(hudSpring, [0, 1], [0.88, 1]);
    const hudSlideX = interpolate(hudSpring, [0, 1], [-40, 0]);

    // Neon Border Pulse Loop
    const neonPulse = Math.sin(frame / 5) * 5;
    const liveBlink = Math.floor(frame / 6) % 2 === 0 ? 1 : 0.35;

    // Scanline Laser Sweep
    const scanlineY = interpolate((frame * 1.8) % 70, [0, 70], [-20, 120]);

    // Exit Digital Retract
    const exitScaleX = interpolate(exitProgress, [0, 1], [1, 0.05]);
    const exitOpacity = 1 - exitProgress;

    return (
      <div
        style={{
          position: "absolute",
          bottom: bottomPosition,
          left: leftPosition,
          maxWidth: maxContainerWidth,
          transform: `translateX(${hudSlideX}px) scale(${hudScale}) scaleX(${exitScaleX})`,
          transformOrigin: "left center",
          opacity: exitOpacity,
          zIndex: 45,
          pointerEvents: "none",
          fontFamily,
          ...containerStyle
        }}
      >
        <div
          style={{
            position: "relative",
            backgroundColor: "rgba(9, 14, 26, 0.94)",
            backdropFilter: "blur(16px)",
            border: `1px solid ${accentColor}88`,
            borderRadius: 6,
            padding: isPortrait ? "14px 22px 14px 18px" : "14px 26px 14px 20px",
            boxShadow: `0 0 ${12 + neonPulse}px ${accentColor}55, inset 0 0 ${8 + neonPulse * 0.5}px ${accentColor}22, 0 16px 40px rgba(0, 0, 0, 0.85)`,
            overflow: "hidden"
          }}
        >
          {/* Tactical Corner HUD Brackets ┌ ┐ └ ┘ */}
          {/* Top-Left */}
          <div style={{ position: "absolute", top: 2, left: 2, width: 8, height: 8, borderTop: `2px solid ${accentColor}`, borderLeft: `2px solid ${accentColor}` }} />
          {/* Top-Right */}
          <div style={{ position: "absolute", top: 2, right: 2, width: 8, height: 8, borderTop: `2px solid ${accentColor}`, borderRight: `2px solid ${accentColor}` }} />
          {/* Bottom-Left */}
          <div style={{ position: "absolute", bottom: 2, left: 2, width: 8, height: 8, borderBottom: `2px solid ${accentColor}`, borderLeft: `2px solid ${accentColor}` }} />
          {/* Bottom-Right */}
          <div style={{ position: "absolute", bottom: 2, right: 2, width: 8, height: 8, borderBottom: `2px solid ${accentColor}`, borderRight: `2px solid ${accentColor}` }} />

          {/* Micro-dot Background Grid & Laser Scanline */}
          <div
            style={{
              position: "absolute",
              top: `${scanlineY}%`,
              left: 0,
              right: 0,
              height: "2px",
              background: `linear-gradient(90deg, transparent 0%, ${accentColor} 50%, transparent 100%)`,
              opacity: 0.65,
              pointerEvents: "none"
            }}
          />

          {/* Top Telemetry Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              fontSize: 10,
              fontFamily: "monospace",
              color: accentColor,
              marginBottom: 4,
              letterSpacing: "1px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: "#10B981",
                  boxShadow: "0 0 6px #10B981",
                  opacity: liveBlink
                }}
              />
              <span>SYS://NODE.LIVE</span>
            </div>
            <span style={{ color: `${primaryColor}`, opacity: 0.85 }}>// PSU.AV.01</span>
          </div>

          {/* Main Headline Name */}
          <div
            style={{
              fontSize: nameSize,
              fontWeight: 800,
              color: textColor,
              letterSpacing: "0.5px",
              lineHeight: 1.2,
              textShadow: `0 0 10px rgba(0, 229, 255, 0.4)`
            }}
          >
            {name}
          </div>

          {/* Title & Department with High-Tech Monospace Badges */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginTop: 4 }}>
            {title ? (
              <span
                style={{
                  fontSize: titleSize,
                  fontWeight: 600,
                  color: primaryColor,
                  lineHeight: 1.3
                }}
              >
                {title}
              </span>
            ) : null}
            {department ? (
              <span
                style={{
                  fontSize: deptSize,
                  fontWeight: 500,
                  color: "#94A3B8",
                  lineHeight: 1.3
                }}
              >
                {title ? `[ ${department} ]` : department}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // PRESET 4 (Legacy / Minimalist): Modern Clean Navy Bar ("lowerthird-minimal-navy-v1")
  // =========================================================================
  const entrance = spring({
    frame,
    fps,
    config: { damping: 14, mass: 0.6, stiffness: 120 }
  });
  const opacity = interpolate(entrance, [0, 1], [0, 1]) * (1 - exitProgress);
  const slideX = interpolate(entrance, [0, 1], [-60, 0]) + exitProgress * 40;

  return (
    <div
      style={{
        position: "absolute",
        bottom: bottomPosition,
        left: leftPosition,
        maxWidth: maxContainerWidth,
        transform: `translateX(${slideX}px)`,
        opacity,
        zIndex: 45,
        pointerEvents: "none",
        fontFamily,
        ...containerStyle
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(11, 18, 32, 0.95)",
          borderLeft: `6px solid ${accentColor}`,
          padding: "12px 24px",
          borderRadius: "0 12px 12px 0",
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.6)"
        }}
      >
        <div style={{ fontSize: nameSize, fontWeight: 800, color: textColor, lineHeight: 1.2 }}>
          {name}
        </div>
        {title ? (
          <div style={{ fontSize: titleSize, fontWeight: 600, color: accentColor, marginTop: 4, lineHeight: 1.3 }}>
            {title}
          </div>
        ) : null}
        {department ? (
          <div style={{ fontSize: deptSize, fontWeight: 400, color: "#94A3B8", marginTop: 2 }}>
            {department}
          </div>
        ) : null}
      </div>
    </div>
  );
};

