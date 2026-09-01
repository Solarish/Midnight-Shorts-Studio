import React from "react";
import { AbsoluteFill } from "remotion";
import { StoryboardSequence } from "./StoryboardSequence";
import type { StoryboardAssemblyProps } from "../types";

export const HorizontalComposition: React.FC<StoryboardAssemblyProps> = (props) => {
  return (
    <AbsoluteFill style={{ width: 1920, height: 1080 }}>
      <StoryboardSequence {...props} aspectRatio="16:9" />
    </AbsoluteFill>
  );
};
