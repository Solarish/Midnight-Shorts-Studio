import React from "react";
import { Composition } from "remotion";
import { VerticalComposition } from "./compositions/VerticalComposition";
import { HorizontalComposition } from "./compositions/HorizontalComposition";
import { SquareComposition } from "./compositions/SquareComposition";
import type { StoryboardAssemblyProps } from "./types";

const DEFAULT_PROPS: StoryboardAssemblyProps = {
  storyboardId: "default-storyboard",
  title: "PSU Broadcast Storyboard",
  fps: 25,
  durationInFrames: 25 * 13, // 13 seconds default
  items: [
    {
      id: "intro_cover",
      kind: "cover_card",
      durationMs: 4000,
      params: {
        eyebrow: "PSU BROADCAST SPECIAL",
        title: "อาจารย์ตัวอย่างดีเด่น ประจำปี 2569",
        subtitle: "มหาวิทยาลัยสงขลานครินทร์",
        motionPreset: "Spring"
      }
    },
    {
      id: "interview_main",
      kind: "a_roll",
      durationMs: 6000,
      params: {
        speaker: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
        dialogue: "ทำหน้าที่ของตัวเองให้ดีที่สุด ทำด้วยความรักและความสุข",
        subtitles: [
          { word: "ทำหน้าที่", startMs: 200, endMs: 1200 },
          { word: "ของตัวเอง", startMs: 1250, endMs: 2200 },
          { word: "ให้ดีที่สุด", startMs: 2250, endMs: 3400 },
          { word: "ทำด้วยความรัก", startMs: 3450, endMs: 4600 },
          { word: "และความสุข", startMs: 4650, endMs: 5800 }
        ]
      }
    },
    {
      id: "outro_logo",
      kind: "logo_outro",
      durationMs: 3000,
      params: {
        note: "PSU BROADCAST"
      }
    }
  ]
};

function calculateTotalDurationFrames({
  props,
  defaultFps
}: {
  props: StoryboardAssemblyProps;
  defaultFps: number;
}) {
  const fps = props.fps || defaultFps;
  if (props.durationInFrames && props.durationInFrames > 0) {
    return { durationInFrames: props.durationInFrames, fps };
  }
  if (Array.isArray(props.items) && props.items.length > 0) {
    const totalMs = props.items.reduce((sum, item) => sum + (item.durationMs || 0), 0);
    const frames = Math.max(1, Math.round((totalMs / 1000) * fps));
    return { durationInFrames: frames, fps };
  }
  if (Array.isArray(props.cutlist) && props.cutlist.length > 0) {
    const totalMs = props.cutlist.reduce((sum, cut) => sum + (cut.durationMs || 0), 0);
    const frames = Math.max(1, Math.round((totalMs / 1000) * fps));
    return { durationInFrames: frames, fps };
  }
  return { durationInFrames: 25 * 13, fps };
}

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="VerticalComposition"
        component={VerticalComposition}
        durationInFrames={25 * 13}
        fps={25}
        width={1080}
        height={1920}
        defaultProps={DEFAULT_PROPS}
        calculateMetadata={async ({ props, defaultProps }) => {
          const mergedProps = { ...defaultProps, ...props };
          const { durationInFrames, fps } = calculateTotalDurationFrames({
            props: mergedProps,
            defaultFps: 25
          });
          return {
            durationInFrames,
            fps,
            props: mergedProps
          };
        }}
      />
      <Composition
        id="HorizontalComposition"
        component={HorizontalComposition}
        durationInFrames={25 * 13}
        fps={25}
        width={1920}
        height={1080}
        defaultProps={DEFAULT_PROPS}
        calculateMetadata={async ({ props, defaultProps }) => {
          const mergedProps = { ...defaultProps, ...props };
          const { durationInFrames, fps } = calculateTotalDurationFrames({
            props: mergedProps,
            defaultFps: 25
          });
          return {
            durationInFrames,
            fps,
            props: mergedProps
          };
        }}
      />
      <Composition
        id="SquareComposition"
        component={SquareComposition}
        durationInFrames={25 * 13}
        fps={25}
        width={1080}
        height={1080}
        defaultProps={DEFAULT_PROPS}
        calculateMetadata={async ({ props, defaultProps }) => {
          const mergedProps = { ...defaultProps, ...props };
          const { durationInFrames, fps } = calculateTotalDurationFrames({
            props: mergedProps,
            defaultFps: 25
          });
          return {
            durationInFrames,
            fps,
            props: mergedProps
          };
        }}
      />
    </>
  );
};
