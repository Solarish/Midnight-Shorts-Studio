import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

interface BackdropBlurProps {
  children: React.ReactNode;
  delayFrames?: number;
  maxBlur?: number;
  style?: React.CSSProperties;
}

export const BackdropBlur: React.FC<BackdropBlurProps> = ({
  children,
  delayFrames = 0,
  maxBlur = 16,
  style
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - delayFrames),
    fps,
    config: {
      damping: 15,
      mass: 1.0,
      stiffness: 90
    }
  });

  const blur = interpolate(progress, [0, 1], [0, maxBlur]);
  const opacity = interpolate(progress, [0, 0.4, 1], [0, 0.7, 1]);

  return (
    <div
      style={{
        backdropFilter: `blur(${blur}px)`,
        WebkitBackdropFilter: `blur(${blur}px)`,
        opacity,
        ...style
      }}
    >
      {children}
    </div>
  );
};
