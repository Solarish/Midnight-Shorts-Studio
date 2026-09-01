import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AspectRatioMode, StudioThemeProps, WordTimestamp } from "../types";

interface DynamicThaiSubtitlesProps {
  dialogue?: string;
  words?: WordTimestamp[];
  aspectRatio?: AspectRatioMode;
  speaker?: string;
  theme?: StudioThemeProps;
  containerStyle?: React.CSSProperties;
}

export const DynamicThaiSubtitles: React.FC<DynamicThaiSubtitlesProps> = ({
  dialogue = "",
  words,
  aspectRatio = "9:16",
  speaker,
  theme,
  containerStyle
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = (frame / fps) * 1000;

  const primaryColor = theme?.primaryColor ?? "#E5A93C"; // Warm Gold
  const accentColor = theme?.accentColor ?? "#00E5FF"; // Cyan
  const textColor = theme?.textColor ?? "#FFFFFF";
  const fontFamily =
    theme?.fontFamily ??
    "-apple-system, BlinkMacSystemFont, 'Prompt', 'Kanit', 'Noto Sans Thai', sans-serif";

  // Aspect-ratio specific positioning
  const bottomPosition =
    aspectRatio === "9:16" ? "22%" : aspectRatio === "16:9" ? "12%" : "16%";
  const maxWidth =
    aspectRatio === "9:16" ? "90%" : aspectRatio === "16:9" ? "75%" : "85%";
  const fontSize =
    aspectRatio === "9:16" ? 44 : aspectRatio === "16:9" ? 42 : 40;

  // Animate subtitle container in
  const entrance = spring({
    frame,
    fps,
    config: { damping: 14, mass: 0.6, stiffness: 140 }
  });
  const containerScale = interpolate(entrance, [0, 1], [0.92, 1]);
  const containerOpacity = interpolate(entrance, [0, 0.4, 1], [0, 0.8, 1]);

  // If word timestamps are provided, render word-by-word karaoke highlights
  const hasWordTimestamps = Array.isArray(words) && words.length > 0;

  return (
    <div
      style={{
        position: "absolute",
        bottom: bottomPosition,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 24px",
        pointerEvents: "none",
        zIndex: 50,
        transform: `scale(${containerScale})`,
        opacity: containerOpacity,
        ...containerStyle
      }}
    >
      {speaker ? (
        <div
          style={{
            alignSelf: "center",
            marginBottom: 8,
            padding: "4px 14px",
            borderRadius: 8,
            backgroundColor: "rgba(11, 18, 32, 0.85)",
            border: `1px solid ${accentColor}88`,
            color: accentColor,
            fontFamily,
            fontSize: fontSize * 0.55,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)"
          }}
        >
          {speaker}
        </div>
      ) : null}

      <div
        style={{
          maxWidth,
          padding: "16px 28px",
          borderRadius: 20,
          backgroundColor: "rgba(11, 18, 32, 0.82)",
          border: "1px solid rgba(229, 169, 60, 0.35)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6), 0 0 16px rgba(229, 169, 60, 0.15)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          textAlign: "center",
          fontFamily,
          fontSize,
          fontWeight: 700,
          lineHeight: 1.45,
          color: textColor,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "8px 10px"
        }}
      >
        {hasWordTimestamps ? (
          words.map((item, index) => {
            const isActive =
              currentTimeMs >= item.startMs && currentTimeMs <= item.endMs;
            const isPast = currentTimeMs > item.endMs;

            return (
              <span
                key={`${item.word}_${index}`}
                style={{
                  color: isActive
                    ? primaryColor
                    : isPast
                    ? textColor
                    : "rgba(255, 255, 255, 0.55)",
                  transform: isActive ? "scale(1.08)" : "scale(1.0)",
                  transition: "transform 0.1s ease, color 0.1s ease",
                  display: "inline-block",
                  textShadow: isActive
                    ? `0 0 20px ${primaryColor}cc, 0 2px 4px rgba(0,0,0,0.8)`
                    : "0 2px 4px rgba(0,0,0,0.8)"
                }}
              >
                {item.word}
              </span>
            );
          })
        ) : (
          <span
            style={{
              textShadow: "0 2px 8px rgba(0, 0, 0, 0.9), 0 0 12px rgba(229, 169, 60, 0.25)"
            }}
          >
            {dialogue}
          </span>
        )}
      </div>
    </div>
  );
};
