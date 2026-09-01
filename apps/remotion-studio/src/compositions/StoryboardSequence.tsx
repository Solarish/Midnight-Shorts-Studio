import React, { useState } from "react";
import { AbsoluteFill, Audio, Img, Sequence, Video, useVideoConfig } from "remotion";
import { CoverCard } from "../components/CoverCard";
import { DynamicThaiSubtitles } from "../components/DynamicThaiSubtitles";
import { LogoOutro } from "../components/LogoOutro";
import { TitleCard } from "../components/TitleCard";
import { PresetWrapper } from "../presets";
import { isAudioFile, isImageFile, isVideoFile, resolveMediaUrl } from "../media-resolver";
import activeStoryboardData from "../active-storyboard.json";
import type { AspectRatioMode, BrollItemProps, StoryboardAssemblyProps, StoryboardItemProps } from "../types";

interface StoryboardSequenceProps extends StoryboardAssemblyProps {
  aspectRatio: AspectRatioMode;
}

const ARollMediaView: React.FC<{
  sourcePath?: string;
  sourceInMs?: number;
  audioPolicy?: "preserve" | "mute" | "mix";
  speaker?: string;
  fps: number;
  theme?: StoryboardAssemblyProps["theme"];
}> = ({ sourcePath, sourceInMs, audioPolicy, speaker, fps, theme }) => {
  const [hasError, setHasError] = useState(false);
  const resolved = resolveMediaUrl(sourcePath);
  const isVideo = isVideoFile(sourcePath);
  const isImage = isImageFile(sourcePath);

  if (hasError || !resolved || (!isVideo && !isImage)) {
    return (
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, #101B2E 0%, #0B1220 60%, #060A12 100%)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center"
        }}
      >
        <div
          style={{
            padding: "24px 40px",
            borderRadius: 16,
            backgroundColor: "rgba(11, 18, 32, 0.85)",
            border: "1px solid rgba(229, 169, 60, 0.3)",
            color: theme?.primaryColor ?? "#E5A93C",
            fontSize: 28,
            fontWeight: 700,
            fontFamily: theme?.fontFamily ?? "sans-serif",
            textAlign: "center"
          }}
        >
          {speaker || "A-Roll Interview"}
        </div>
      </AbsoluteFill>
    );
  }

  if (isVideo) {
    const startFromFrames = sourceInMs ? Math.max(0, Math.round((sourceInMs / 1000) * fps)) : 0;
    return (
      <Video
        src={resolved}
        startFrom={startFromFrames}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover"
        }}
        volume={audioPolicy === "mute" ? 0 : 1}
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <Img
      src={resolved}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover"
      }}
      onError={() => setHasError(true)}
    />
  );
};

const BrollMediaView: React.FC<{
  broll: BrollItemProps;
  aspectRatio: AspectRatioMode;
  theme?: StoryboardAssemblyProps["theme"];
}> = ({ broll, aspectRatio, theme }) => {
  const [hasError, setHasError] = useState(false);
  const resolved = resolveMediaUrl(broll.assetPath);
  const isVideo = isVideoFile(broll.assetPath);
  const isImage = isImageFile(broll.assetPath);

  if (hasError || !resolved || (!isVideo && !isImage)) {
    return (
      <div
        style={{
          position: "absolute",
          top: aspectRatio === "9:16" ? "65%" : "70%",
          left: "8%",
          right: "8%",
          padding: "16px 24px",
          borderRadius: 16,
          backgroundColor: "rgba(11, 18, 32, 0.88)",
          backdropFilter: "blur(12px)",
          border: `1px solid ${theme?.accentColor ?? "#00E5FF"}`,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)"
        }}
      >
        {broll.title ? (
          <div
            style={{
              fontSize: aspectRatio === "9:16" ? 28 : 24,
              fontWeight: 800,
              color: theme?.primaryColor ?? "#E5A93C",
              marginBottom: 4
            }}
          >
            {broll.title}
          </div>
        ) : null}
        {broll.description ? (
          <div
            style={{
              fontSize: aspectRatio === "9:16" ? 22 : 18,
              color: theme?.textColor ?? "#FFFFFF"
            }}
          >
            {broll.description}
          </div>
        ) : null}
      </div>
    );
  }

  if (isVideo) {
    return (
      <Video
        src={resolved}
        style={{
          width: "100%",
          height: "100%",
          objectFit: broll.fit ?? "cover"
        }}
        volume={broll.audioPolicy === "preserve" ? 1 : 0}
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <Img
      src={resolved}
      style={{
        width: "100%",
        height: "100%",
        objectFit: broll.fit ?? "cover"
      }}
      onError={() => setHasError(true)}
    />
  );
};

export const StoryboardSequence: React.FC<StoryboardSequenceProps> = ({
  items = [],
  cutlist = [],
  brollStack = [],
  audioTracks = [],
  subtitles = [],
  theme,
  aspectRatio
}) => {
  const { fps } = useVideoConfig();

  // If no explicit items are passed, synthesize items from cutlist or default story
  const effectiveItems: StoryboardItemProps[] =
    items.length > 0
      ? items
      : cutlist.length > 0
      ? cutlist.map((c, i) => ({
          id: c.id || `cut_${i + 1}`,
          kind: "a_roll" as const,
          durationMs: c.durationMs,
          params: {
            sourcePath: c.sourcePath,
            sourceInMs: c.sourceInMs,
            sourceOutMs: c.sourceOutMs,
            dialogue: c.dialogue,
            subtitles: c.subtitles
          }
        }))
      : (activeStoryboardData.items as StoryboardItemProps[]);

  let currentFrameOffset = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0B1220" }}>
      {/* 1. Main Sequential Timeline Items */}
      {effectiveItems.map((item, index) => {
        const itemDurationFrames = Math.max(
          1,
          Math.round((item.durationMs / 1000) * fps)
        );
        const fromFrame = currentFrameOffset;
        currentFrameOffset += itemDurationFrames;

        return (
          <Sequence
            key={`${item.id}_${index}`}
            from={fromFrame}
            durationInFrames={itemDurationFrames}
          >
            {item.kind === "cover_card" ? (
              <CoverCard
                sourceImage={item.params?.sourceImage}
                eyebrow={item.params?.eyebrow}
                title={item.params?.title}
                subtitle={item.params?.subtitle}
                personName={item.params?.personName}
                positionTitle={item.params?.positionTitle}
                award={item.params?.award}
                aspectRatio={aspectRatio}
                motionPreset={item.params?.motionPreset ?? "Spring"}
                theme={theme}
              />
            ) : item.kind === "title" ? (
              <TitleCard
                title={item.params?.title}
                subtitle={item.params?.subtitle}
                texts={item.params?.texts}
                media={item.params?.media}
                aspectRatio={aspectRatio}
                motionPreset={item.params?.motionPreset ?? "ZoomPunch"}
                theme={theme}
              />
            ) : item.kind === "logo_outro" ? (
              <LogoOutro
                sourcePath={item.params?.sourcePath}
                note={item.params?.note}
                aspectRatio={aspectRatio}
                theme={theme}
              />
            ) : item.kind === "a_roll" ? (
              <AbsoluteFill>
                {/* Visual A-Roll Layer */}
                <ARollMediaView
                  sourcePath={item.params?.sourcePath}
                  sourceInMs={item.params?.sourceInMs}
                  audioPolicy={item.audioPolicy}
                  speaker={item.params?.speaker}
                  fps={fps}
                  theme={theme}
                />

                {/* Nested B-roll Overlays on this A-roll segment */}
                {Array.isArray(item.broll)
                  ? item.broll.map((b: BrollItemProps, bIdx: number) => {
                      const offsetMs = b.offsetMs ?? b.startMs ?? 0;
                      const durationMs = b.durationMs ?? 3000;
                      const bOffsetFrames = Math.max(0, Math.round((offsetMs / 1000) * fps));
                      const bDurationFrames = Math.max(1, Math.round((durationMs / 1000) * fps));

                      return (
                        <Sequence
                          key={`${b.id}_${bIdx}`}
                          from={bOffsetFrames}
                          durationInFrames={bDurationFrames}
                        >
                          <PresetWrapper
                            preset={b.preset ?? "Pop"}
                            style={{
                              position: "absolute",
                              inset: 0,
                              zIndex: 20
                            }}
                          >
                            <BrollMediaView
                              broll={b}
                              aspectRatio={aspectRatio}
                              theme={theme}
                            />
                          </PresetWrapper>
                        </Sequence>
                      );
                    })
                  : null}

                {/* Dynamic Thai Subtitles for this segment */}
                {item.params?.dialogue || item.params?.subtitles ? (
                  <DynamicThaiSubtitles
                    dialogue={item.params?.dialogue}
                    words={item.params?.subtitles}
                    aspectRatio={aspectRatio}
                    speaker={item.params?.speaker}
                    theme={theme}
                  />
                ) : null}
              </AbsoluteFill>
            ) : null}
          </Sequence>
        );
      })}

      {/* 2. Global B-Roll Stack Overlays */}
      {brollStack.map((b, bIdx) => {
        const offsetMs = b.offsetMs ?? b.startMs ?? 0;
        const durationMs = b.durationMs ?? 3000;
        const bOffsetFrames = Math.max(0, Math.round((offsetMs / 1000) * fps));
        const bDurationFrames = Math.max(1, Math.round((durationMs / 1000) * fps));

        return (
          <Sequence
            key={`global_broll_${b.id}_${bIdx}`}
            from={bOffsetFrames}
            durationInFrames={bDurationFrames}
          >
            <PresetWrapper
              preset={b.preset ?? "Spring"}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 30
              }}
            >
              <BrollMediaView
                broll={b}
                aspectRatio={aspectRatio}
                theme={theme}
              />
            </PresetWrapper>
          </Sequence>
        );
      })}

      {/* 3. Global Subtitle Tracks */}
      {subtitles.map((sub, sIdx) => {
        const startMs = sub.startMs ?? 0;
        const durationMs =
          sub.durationMs ?? (sub.endMs != null ? Math.max(500, sub.endMs - startMs) : 3000);
        const sOffsetFrames = Math.max(0, Math.round((startMs / 1000) * fps));
        const sDurationFrames = Math.max(1, Math.round((durationMs / 1000) * fps));

        return (
          <Sequence
            key={`global_sub_${sIdx}`}
            from={sOffsetFrames}
            durationInFrames={sDurationFrames}
          >
            <DynamicThaiSubtitles
              dialogue={sub.text}
              words={sub.words}
              aspectRatio={aspectRatio}
              speaker={sub.speaker}
              theme={theme}
            />
          </Sequence>
        );
      })}

      {/* 4. Audio Pipeline: Background Music & Sound Effects */}
      {audioTracks.map((track, aIdx) => {
        const fromFrame = track.startMs ? Math.round((track.startMs / 1000) * fps) : 0;
        const durationFrames = track.durationMs
          ? Math.round((track.durationMs / 1000) * fps)
          : undefined;
        const resolvedAudio = resolveMediaUrl(track.path);

        if (!resolvedAudio) return null;

        return (
          <Sequence
            key={`audio_${aIdx}`}
            from={fromFrame}
            durationInFrames={durationFrames}
          >
            <Audio
              src={resolvedAudio}
              volume={track.volume ?? 1}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
