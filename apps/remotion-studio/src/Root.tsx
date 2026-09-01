import React from "react";
import { Composition } from "remotion";
import { VerticalComposition } from "./compositions/VerticalComposition";
import { HorizontalComposition } from "./compositions/HorizontalComposition";
import { SquareComposition } from "./compositions/SquareComposition";
import type { StoryboardAssemblyProps, StoryboardItemProps } from "./types";

const DEFAULT_PROPS: StoryboardAssemblyProps = {
  storyboardId: "default-storyboard",
  title: "PSU Broadcast Storyboard",
  fps: 25,
  durationInFrames: 25 * 13,
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

function convertApiItemsToRemotion(apiItems: any[]): StoryboardItemProps[] {
  if (!Array.isArray(apiItems)) return [];
  return apiItems.map((item: any, idx: number): StoryboardItemProps => {
    const rawParams = item.params || {};
    const brollList = Array.isArray(item.broll)
      ? item.broll.map((b: any, bIdx: number) => ({
          id: b.id || `broll_${idx}_${bIdx}`,
          assetPath: b.asset?.path || b.assetPath,
          offsetMs: b.offsetMs ?? 0,
          durationMs: b.durationMs ?? 3000,
          preset: b.preset || "Spring",
          fit: b.fit || "cover",
          audioPolicy: b.audioPolicy || "mute",
          title: b.title || b.name,
          description: b.description || b.note
        }))
      : [];

    return {
      id: item.id || `item_${idx + 1}`,
      kind: item.kind,
      durationMs: Number(item.durationMs) || 4000,
      params: {
        ...rawParams,
        title: rawParams.title || rawParams.personName || rawParams.texts?.title,
        subtitle: rawParams.subtitle || rawParams.positionTitle,
        eyebrow: rawParams.eyebrow || rawParams.award || rawParams.texts?.eyebrow,
        speaker: rawParams.speaker || rawParams.personName,
        dialogue: rawParams.dialogue || rawParams.soundNote || rawParams.text,
        sourcePath: rawParams.sourcePath,
        sourceInMs: rawParams.sourceInMs,
        sourceOutMs: rawParams.sourceOutMs,
        motionPreset: rawParams.motionPreset || "Spring"
      },
      broll: brollList
    };
  });
}

async function resolveDynamicStoryboardProps(
  incomingProps: StoryboardAssemblyProps
): Promise<StoryboardAssemblyProps> {
  // If explicitly passed custom items (e.g. from render script), respect them
  if (
    incomingProps.items &&
    incomingProps.items.length > 0 &&
    incomingProps.storyboardId !== "default-storyboard"
  ) {
    return incomingProps;
  }

  // Otherwise, fetch active storyboard from local Control API
  try {
    const response = await fetch("http://127.0.0.1:47660/api/v1/storyboards");
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const activeStoryboard = data[0];
        const converted = convertApiItemsToRemotion(activeStoryboard.items);
        if (converted.length > 0) {
          const totalMs = converted.reduce(
            (sum, item) => sum + (item.durationMs || 0),
            0
          );
          return {
            ...incomingProps,
            storyboardId: activeStoryboard.storyboardId,
            title: activeStoryboard.name || incomingProps.title,
            durationInFrames: Math.max(1, Math.round((totalMs / 1000) * 25)),
            items: converted
          };
        }
      }
    }
  } catch {
    // Control API not reachable, fallback to incoming
  }

  return incomingProps;
}

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
    const totalMs = props.items.reduce(
      (sum, item) => sum + (item.durationMs || 0),
      0
    );
    const frames = Math.max(1, Math.round((totalMs / 1000) * fps));
    return { durationInFrames: frames, fps };
  }
  if (Array.isArray(props.cutlist) && props.cutlist.length > 0) {
    const totalMs = props.cutlist.reduce(
      (sum, cut) => sum + (cut.durationMs || 0),
      0
    );
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
          const resolved = await resolveDynamicStoryboardProps(mergedProps);
          const { durationInFrames, fps } = calculateTotalDurationFrames({
            props: resolved,
            defaultFps: 25
          });
          return {
            durationInFrames,
            fps,
            props: resolved
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
          const resolved = await resolveDynamicStoryboardProps(mergedProps);
          const { durationInFrames, fps } = calculateTotalDurationFrames({
            props: resolved,
            defaultFps: 25
          });
          return {
            durationInFrames,
            fps,
            props: resolved
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
          const resolved = await resolveDynamicStoryboardProps(mergedProps);
          const { durationInFrames, fps } = calculateTotalDurationFrames({
            props: resolved,
            defaultFps: 25
          });
          return {
            durationInFrames,
            fps,
            props: resolved
          };
        }}
      />
    </>
  );
};
