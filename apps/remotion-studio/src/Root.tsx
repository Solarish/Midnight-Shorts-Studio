import React from "react";
import { Composition } from "remotion";
import { VerticalComposition } from "./compositions/VerticalComposition";
import { HorizontalComposition } from "./compositions/HorizontalComposition";
import { SquareComposition } from "./compositions/SquareComposition";
import { setActiveApiPort } from "./media-resolver";
import type { StoryboardAssemblyProps, StoryboardItemProps } from "./types";

import activeStoryboardData from "./active-storyboard.json";

const DEFAULT_PROPS: StoryboardAssemblyProps = activeStoryboardData as StoryboardAssemblyProps;

function convertApiItemsToRemotion(apiItems: any[]): StoryboardItemProps[] {
  if (!Array.isArray(apiItems)) return [];
  return apiItems.map((item: any, idx: number): StoryboardItemProps => {
    const rawParams = item.params || {};
    const brollList = Array.isArray(item.broll)
      ? item.broll.map((b: any, bIdx: number) => ({
          id: b.id || `broll_${idx}_${bIdx}`,
          assetPath: b.asset?.path || b.assetPath,
          offsetMs: b.offsetMs ?? b.startMs ?? 0,
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
      audioPolicy: item.audioPolicy,
      presetId: item.presetId,
      params: {
        ...rawParams,
        title: rawParams.title || rawParams.personName || rawParams.texts?.title,
        subtitle: rawParams.subtitle || rawParams.positionTitle,
        eyebrow: rawParams.eyebrow || rawParams.award || rawParams.texts?.eyebrow,
        speaker: rawParams.speaker || rawParams.personName,
        dialogue: rawParams.dialogue || rawParams.soundNote || rawParams.text,
        sourcePath: rawParams.sourcePath,
        sourceImage: rawParams.sourceImage,
        media: rawParams.media,
        texts: rawParams.texts,
        note: rawParams.note,
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
    incomingProps.storyboardId !== "default-storyboard" &&
    incomingProps.storyboardId !== "kewalin_documentary_2569"
  ) {
    return incomingProps;
  }

  // Try candidate ports for local Control API
  const candidatePorts = [47650, 47660];
  for (const port of candidatePorts) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/storyboards`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          setActiveApiPort(port);
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
      // Continue to next port
    }
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
