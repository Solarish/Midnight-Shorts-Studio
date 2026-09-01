import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

interface SpringProps {
  children: React.ReactNode;
  delayFrames?: number;
  direction?: "up" | "down" | "left" | "right";
  style?: React.CSSProperties;
}

export const Spring: React.FC<SpringProps> = ({
  children,
  delayFrames = 0,
  direction = "up",
  style
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - delayFrames),
    fps,
    config: {
      damping: 14,
      mass: 0.9,
      stiffness: 100
    }
  });

  let initialX = 0;
  let initialY = 0;
  if (direction === "up") initialY = 80;
  if (direction === "down") initialY = -80;
  if (direction === "left") initialX = 80;
  if (direction === "right") initialX = -80;

  const translateX = interpolate(progress, [0, 1], [initialX, 0]);
  const translateY = interpolate(progress, [0, 1], [initialY, 0]);
  const opacity = interpolate(progress, [0, 0.4, 1], [0, 0.7, 1]);

  return (
    <div
      style={{
        transform: `translate(${translateX}px, ${translateY}px)`,
        opacity,
        ...style
      }}
    >
      {children}
    </div>
  );
};
