import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Pop } from "../presets/Pop";
import type { AspectRatioMode, StudioThemeProps } from "../types";

interface LogoOutroProps {
  sourcePath?: string;
  note?: string;
  aspectRatio?: AspectRatioMode;
  theme?: StudioThemeProps;
}

export const LogoOutro: React.FC<LogoOutroProps> = ({
  sourcePath,
  note = "PSU BROADCAST",
  aspectRatio = "9:16",
  theme
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const primaryColor = theme?.primaryColor ?? "#E5A93C"; // Warm Gold
  const accentColor = theme?.accentColor ?? "#00E5FF"; // Bright Cyan
  const textColor = theme?.textColor ?? "#FFFFFF";
  const fontFamily =
    theme?.fontFamily ??
    "-apple-system, BlinkMacSystemFont, 'Prompt', 'Kanit', 'Noto Sans Thai', sans-serif";

  // Pulse effect
  const pulse = Math.sin((frame / fps) * Math.PI * 2) * 0.04 + 1.0;

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
      {/* Ambient background glow */}
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: 200,
          background: `radial-gradient(circle, ${primaryColor}33 0%, transparent 70%)`,
          transform: `scale(${pulse})`
        }}
      />

      <Pop delayFrames={4}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center"
          }}
        >
          {sourcePath ? (
            <Img
              src={sourcePath}
              style={{
                width: aspectRatio === "9:16" ? 220 : 180,
                height: "auto",
                marginBottom: 24,
                filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.8))"
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
                boxShadow: `0 0 32px ${primaryColor}66`,
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

          <div
            style={{
              color: textColor,
              fontSize: aspectRatio === "9:16" ? 44 : 38,
              fontWeight: 800,
              letterSpacing: "0.08em",
              marginBottom: 8,
              textShadow: `0 0 20px ${primaryColor}66`
            }}
          >
            {note}
          </div>

          <div
            style={{
              color: accentColor,
              fontSize: aspectRatio === "9:16" ? 22 : 18,
              fontWeight: 600,
              letterSpacing: "0.15em",
              textTransform: "uppercase"
            }}
          >
            Prince of Songkla University
          </div>
        </div>
      </Pop>
    </AbsoluteFill>
  );
};
