import React from "react";
import { AbsoluteFill } from "remotion";
import { StoryboardSequence } from "./StoryboardSequence";
import type { StoryboardAssemblyProps } from "../types";

export const VerticalComposition: React.FC<StoryboardAssemblyProps> = (props) => {
  return (
    <AbsoluteFill style={{ width: 1080, height: 1920 }}>
      <StoryboardSequence {...props} aspectRatio="9:16" />
    </AbsoluteFill>
  );
};
