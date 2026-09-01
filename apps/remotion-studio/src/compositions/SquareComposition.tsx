import React from "react";
import { AbsoluteFill } from "remotion";
import { StoryboardSequence } from "./StoryboardSequence";
import type { StoryboardAssemblyProps } from "../types";

export const SquareComposition: React.FC<StoryboardAssemblyProps> = (props) => {
  return (
    <AbsoluteFill style={{ width: 1080, height: 1080 }}>
      <StoryboardSequence {...props} aspectRatio="1:1" />
    </AbsoluteFill>
  );
};
