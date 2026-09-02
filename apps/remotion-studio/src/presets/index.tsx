import React from "react";
import { Bounce } from "./Bounce";
import { Pop } from "./Pop";
import { Spring } from "./Spring";
import { ZoomPunch } from "./ZoomPunch";
import { BackdropBlur } from "./BackdropBlur";
import { ThreeDCarouselPreset, ThreeDCarouselManifest } from "./ThreeDCarouselPreset";
import { ParallaxCinemaPreset, ParallaxCinemaManifest } from "./ParallaxCinemaPreset";
import { SplitDynamicPreset, SplitDynamicManifest } from "./SplitDynamicPreset";
import type { MotionPresetType } from "../types";

export {
  Bounce,
  Pop,
  Spring,
  ZoomPunch,
  BackdropBlur,
  ThreeDCarouselPreset,
  ThreeDCarouselManifest,
  ParallaxCinemaPreset,
  ParallaxCinemaManifest,
  SplitDynamicPreset,
  SplitDynamicManifest
};

interface PresetWrapperProps {
  preset?: MotionPresetType;
  delayFrames?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const PresetWrapper: React.FC<PresetWrapperProps> = ({
  preset = "Spring",
  delayFrames = 0,
  children,
  style
}) => {
  switch (preset) {
    case "Bounce":
      return <Bounce delayFrames={delayFrames} style={style}>{children}</Bounce>;
    case "Pop":
      return <Pop delayFrames={delayFrames} style={style}>{children}</Pop>;
    case "ZoomPunch":
      return <ZoomPunch delayFrames={delayFrames} style={style}>{children}</ZoomPunch>;
    case "BackdropBlur":
      return <BackdropBlur delayFrames={delayFrames} style={style}>{children}</BackdropBlur>;
    case "Spring":
      return <Spring delayFrames={delayFrames} style={style}>{children}</Spring>;
    case "none":
    default:
      return <div style={style}>{children}</div>;
  }
};
