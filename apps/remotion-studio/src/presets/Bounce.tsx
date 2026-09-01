import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

interface BounceProps {
  children: React.ReactNode;
  delayFrames?: number;
  style?: React.CSSProperties;
}

export const Bounce: React.FC<BounceProps> = ({
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
      damping: 10,
      mass: 0.8,
      stiffness: 120
    }
  });

  const scale = interpolate(progress, [0, 1], [0.4, 1]);
  const translateY = interpolate(progress, [0, 1], [60, 0]);
  const opacity = interpolate(progress, [0, 0.4, 1], [0, 0.8, 1]);

  return (
    <div
      style={{
        transform: `translateY(${translateY}px) scale(${scale})`,
        opacity,
        ...style
      }}
    >
      {children}
    </div>
  );
};
