import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

interface PopProps {
  children: React.ReactNode;
  delayFrames?: number;
  style?: React.CSSProperties;
}

export const Pop: React.FC<PopProps> = ({
  children,
  delayFrames = 0,
  style
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - delayFrames),
    fps,
    config: {
      damping: 12,
      mass: 0.5,
      stiffness: 200
    }
  });

  const scale = interpolate(progress, [0, 1], [0.2, 1]);
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
