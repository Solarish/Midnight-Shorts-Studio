import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

interface ZoomPunchProps {
  children: React.ReactNode;
  delayFrames?: number;
  intensity?: number;
  style?: React.CSSProperties;
}

export const ZoomPunch: React.FC<ZoomPunchProps> = ({
  children,
  delayFrames = 0,
  intensity = 1.15,
  style
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - delayFrames),
    fps,
    config: {
      damping: 10,
      mass: 0.6,
      stiffness: 180
    }
  });

  const scale = interpolate(progress, [0, 0.5, 1], [0.8, intensity, 1.0]);
  const opacity = interpolate(progress, [0, 0.3, 1], [0, 0.9, 1]);

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        opacity,
        transformOrigin: "center center",
        ...style
      }}
    >
      {children}
    </div>
  );
};
