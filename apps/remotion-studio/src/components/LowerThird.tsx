import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AspectRatioMode, StudioThemeProps } from "../types";

export interface LowerThirdComponentProps {
  name?: string;
  title?: string;
  department?: string;
  presetId?: string;
  aspectRatio?: AspectRatioMode;
  theme?: StudioThemeProps;
  containerStyle?: React.CSSProperties;
}

export const LowerThird: React.FC<LowerThirdComponentProps> = ({
  name = "ชื่อวิทยากร / ผู้บรรยาย",
  title = "ตำแหน่งทางวิชาการ / สังกัดหน่วยงาน",
  department,
  presetId = "lowerthird-glass-gold-v1",
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
    "-apple-system, BlinkMacSystemFont, 'Prompt', 'Kanit', 'Noto Sans Thai', sans-serif";

  // Spring entrance animation
  const entrance = spring({
    frame,
    fps,
    config: { damping: 14, mass: 0.6, stiffness: 120 }
  });

  // Fade out animation during the last 15 frames
  const exitProgress = interpolate(
    frame,
    [Math.max(0, durationInFrames - 15), durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const opacity = interpolate(entrance, [0, 1], [0, 1]) * (1 - exitProgress);
  const slideX = interpolate(entrance, [0, 1], [-80, 0]) + exitProgress * 40;

  // Responsive layout measurements based on aspect ratio
  const isPortrait = aspectRatio === "9:16";
  const isSquare = aspectRatio === "1:1";

  const bottomPosition = isPortrait ? "26%" : isSquare ? "16%" : "12%";
  const leftPosition = isPortrait ? "6%" : "5%";
  const maxContainerWidth = isPortrait ? "88%" : "60%";

  const nameSize = isPortrait ? 38 : isSquare ? 34 : 32;
  const titleSize = isPortrait ? 24 : isSquare ? 22 : 20;

  // 1. Preset: Minimal Navy
  if (presetId === "lowerthird-minimal-navy-v1") {
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
          ...containerStyle
        }}
      >
        <div
          style={{
            backgroundColor: "rgba(11, 18, 32, 0.95)",
            borderLeft: `6px solid ${accentColor}`,
            padding: "12px 24px",
            borderRadius: "0 12px 12px 0",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.6)",
            fontFamily
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
        </div>
      </div>
    );
  }

  // 2. Preset: Gradient Ribbon
  if (presetId === "lowerthird-gradient-ribbon-v1") {
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
          ...containerStyle
        }}
      >
        <div
          style={{
            position: "relative",
            background: "linear-gradient(135deg, rgba(16, 27, 46, 0.94) 0%, rgba(11, 18, 32, 0.96) 100%)",
            padding: "16px 28px",
            borderRadius: 16,
            border: `1px solid ${primaryColor}44`,
            borderBottom: `4px solid ${primaryColor}`,
            boxShadow: `0 16px 40px rgba(0, 0, 0, 0.7), 0 0 24px ${primaryColor}22`,
            fontFamily
          }}
        >
          <div style={{ fontSize: nameSize, fontWeight: 800, color: primaryColor, lineHeight: 1.2 }}>
            {name}
          </div>
          {title ? (
            <div style={{ fontSize: titleSize, fontWeight: 500, color: textColor, marginTop: 4, lineHeight: 1.3 }}>
              {title}
            </div>
          ) : null}
          {department ? (
            <div style={{ fontSize: titleSize - 4, fontWeight: 400, color: accentColor, marginTop: 2 }}>
              {department}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // 3. Preset: PSU Royal Gold & Midnight Glassmorphism (Default)
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
        ...containerStyle
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          backgroundColor: "rgba(11, 18, 32, 0.88)",
          backdropFilter: "blur(20px)",
          borderRadius: 20,
          border: `1.5px solid ${primaryColor}55`,
          padding: "16px 26px 16px 20px",
          boxShadow: `0 20px 50px rgba(0, 0, 0, 0.75), 0 0 30px ${primaryColor}22`,
          overflow: "hidden",
          fontFamily
        }}
      >
        {/* Left Gold Vertical Beacon Bar */}
        <div
          style={{
            width: 5,
            height: "80%",
            backgroundColor: primaryColor,
            borderRadius: 4,
            marginRight: 18,
            boxShadow: `0 0 14px ${primaryColor}`
          }}
        />

        {/* Text Details */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: nameSize,
              fontWeight: 800,
              color: textColor,
              letterSpacing: "0.2px",
              lineHeight: 1.2
            }}
          >
            {name}
          </div>
          {title ? (
            <div
              style={{
                fontSize: titleSize,
                fontWeight: 600,
                color: primaryColor,
                marginTop: 4,
                lineHeight: 1.3
              }}
            >
              {title}
            </div>
          ) : null}
          {department ? (
            <div
              style={{
                fontSize: Math.max(16, titleSize - 4),
                fontWeight: 400,
                color: accentColor,
                marginTop: 2
              }}
            >
              {department}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
