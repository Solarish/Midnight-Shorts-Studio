import React, { useState } from "react";
import { AbsoluteFill, Img, Sequence, Video, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CoverCard } from "../components/CoverCard";
import { DynamicThaiSubtitles } from "../components/DynamicThaiSubtitles";
import { LogoOutro } from "../components/LogoOutro";
import { TitleCard } from "../components/TitleCard";
import { isImageFile, isVideoFile, resolveMediaUrl } from "../media-resolver";
import { PresetWrapper } from "../presets";
import type {
  AspectRatioMode,
  AudioTrackProps,
  BrollItemProps,
  CutlistSegmentProps,
  StoryboardAssemblyProps,
  StoryboardItemProps
} from "../types";

const ARollMediaView: React.FC<{
  sourcePath?: string;
  sourceInMs?: number;
  audioPolicy?: "preserve" | "mute" | "mix";
  speaker?: string;
  presetId?: string;
  pipPosition?: string;
  pipShape?: string;
  pipScale?: number;
  jCutMs?: number;
  lCutMs?: number;
  audioFadeMs?: number;
  fps: number;
  theme?: StoryboardAssemblyProps["theme"];
}> = ({
  sourcePath,
  sourceInMs,
  audioPolicy,
  speaker,
  presetId = "a-roll-segment-v1",
  pipPosition = "bottom-right",
  pipShape = "circle",
  pipScale = 0.32,
  jCutMs = 0,
  lCutMs = 0,
  audioFadeMs = 80,
  fps,
  theme
}) => {
  const [hasError, setHasError] = useState(false);
  const resolved = resolveMediaUrl(sourcePath);
  const isVideo = isVideoFile(sourcePath);
  const isImage = isImageFile(sourcePath);
  const isPip = presetId === "a-roll-pip-v1" || presetId?.includes("pip");
  const isVoiceover = presetId === "a-roll-voiceover-v1" || presetId?.includes("voiceover");

  const primaryColor = theme?.primaryColor ?? "#E5A93C";

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
            border: `1px solid ${primaryColor}44`,
            color: primaryColor,
            fontSize: 28,
            fontWeight: 700,
            fontFamily: theme?.fontFamily ?? "sans-serif",
            textAlign: "center"
          }}
        >
          {speaker || (isVoiceover ? "🎙️ Voiceover Narration" : "🎤 A-Roll Interview")}
        </div>
      </AbsoluteFill>
    );
  }

  // Picture-in-Picture mode
  if (isPip) {
    const startFromFrames = sourceInMs ? Math.max(0, Math.round((sourceInMs / 1000) * fps)) : 0;
    const pipWidth = `${Math.round(pipScale * 100)}%`;
    const pipRadius = pipShape === "circle" ? "50%" : "24px";
    const posStyle: React.CSSProperties = {
      position: "absolute",
      width: pipWidth,
      aspectRatio: pipShape === "circle" ? "1/1" : "16/9",
      borderRadius: pipRadius,
      overflow: "hidden",
      border: `3px solid ${primaryColor}`,
      boxShadow: `0 12px 36px rgba(0, 0, 0, 0.8), 0 0 20px ${primaryColor}44`,
      zIndex: 25
    };

    if (pipPosition === "bottom-left") {
      posStyle.bottom = "28%";
      posStyle.left = "4%";
    } else if (pipPosition === "top-right") {
      posStyle.top = "6%";
      posStyle.right = "4%";
    } else if (pipPosition === "top-left") {
      posStyle.top = "6%";
      posStyle.left = "4%";
    } else {
      // Default: bottom-right
      posStyle.bottom = "28%";
      posStyle.right = "4%";
    }

    return (
      <AbsoluteFill
        style={{
          background: "radial-gradient(circle at center, #1E293B 0%, #0B1220 70%, #030712 100%)"
        }}
      >
        <div style={posStyle}>
          {isVideo ? (
            <Video
              src={resolved}
              startFrom={startFromFrames}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              volume={audioPolicy === "mute" ? 0 : 1}
              delayRenderTimeoutInMilliseconds={90000}
              delayRenderRetries={2}
              onError={() => setHasError(true)}
            />
          ) : (
            <Img
              src={resolved}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={() => setHasError(true)}
            />
          )}
        </div>
      </AbsoluteFill>
    );
  }

  // Standard Fullscreen Video / Image
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
        delayRenderTimeoutInMilliseconds={90000}
        delayRenderRetries={2}
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
        delayRenderTimeoutInMilliseconds={90000}
        delayRenderRetries={2}
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

export const StoryboardSequence: React.FC<StoryboardAssemblyProps> = ({
  items = [],
  cutlist = [],
  brollStack = [],
  theme,
  aspectRatio = "9:16"
}) => {
  const { fps } = useVideoConfig();

  // If a raw cutlist is passed, render simple cutlist playback
  if (cutlist.length > 0) {
    let accumulatedCutlistFrames = 0;
    return (
      <AbsoluteFill style={{ backgroundColor: "#000000" }}>
        {cutlist.map((cut: CutlistSegmentProps, idx: number) => {
          const startFrame = accumulatedCutlistFrames;
          const durationFrames = Math.max(1, Math.round((cut.durationMs / 1000) * fps));
          accumulatedCutlistFrames += durationFrames;

          return (
            <Sequence
              key={cut.id || idx}
              name={`Cut ${idx + 1}: ${cut.id}`}
              from={startFrame}
              durationInFrames={durationFrames}
            >
              <ARollMediaView
                sourcePath={cut.sourcePath}
                sourceInMs={cut.sourceInMs}
                audioPolicy="preserve"
                fps={fps}
                theme={theme}
              />
            </Sequence>
          );
        })}
      </AbsoluteFill>
    );
  }

  // Primary Timeline Playback from Storyboard items
  let accumulatedFrames = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {/* 1. Main Video Track (Story Items) */}
      {items.map((item: StoryboardItemProps, idx: number) => {
        const itemOffsetFrames = accumulatedFrames;
        const itemDurationFrames = Math.max(
          1,
          Math.round((item.durationMs / 1000) * fps)
        );
        accumulatedFrames += itemDurationFrames;

        return (
          <Sequence
            key={item.id}
            name={`[${item.kind.toUpperCase()}] ${item.params?.title || item.params?.note || item.id}`}
            from={itemOffsetFrames}
            durationInFrames={itemDurationFrames}
          >
            {item.kind === "cover_card" ? (
              <CoverCard
                sourceImage={item.params?.sourceImage}
                backgroundImage={item.params?.backgroundImage}
                personImage={item.params?.personImage}
                doodleImage={(item.params as any)?.doodleAssetPath}
                doodlePaths={item.params?.doodlePaths}
                title={item.params?.title}
                subtitle={item.params?.subtitle}
                personName={item.params?.personName}
                positionTitle={item.params?.positionTitle}
                award={item.params?.award}
                textStyles={item.params?.textStyles}
                aspectRatio={aspectRatio}
                motionPreset={item.params?.motionPreset ?? "Spring"}
                theme={theme}
              />
            ) : item.kind === "title" ? (
              <TitleCard
                text={item.params?.text}
                title={item.params?.title}
                subtitle={item.params?.subtitle}
                eyebrow={item.params?.eyebrow}
                texts={item.params?.texts}
                media={item.params?.media}
                layoutSequence={item.params?.layoutSequence}
                cgBlocks={item.params?.cgBlocks}
                aspectRatio={aspectRatio}
                presetId={item.presetId || (item.params as any)?.presetId}
                motionPreset={item.params?.motionPreset ?? "ZoomPunch"}
                rotationSpeed={(item.params as any)?.rotationSpeed}
                cameraTilt={(item.params as any)?.cameraTilt}
                enableReflection={(item.params as any)?.enableReflection}
                theme={theme}
              />
            ) : item.kind === "logo_outro" ? (
              <LogoOutro
                sourcePath={item.params?.sourcePath}
                presetId={item.presetId || (item.params as any)?.presetId}
                title={item.params?.title || item.params?.note}
                note={item.params?.note}
                subtitle={item.params?.subtitle}
                eyebrow={item.params?.eyebrow}
                logoScale={Number((item.params as any)?.logoScale ?? 1)}
                glowIntensity={Number((item.params as any)?.glowIntensity ?? 1)}
                videoFit={(item.params as any)?.videoFit ?? "cover"}
                fadeInMs={Number((item.params as any)?.fadeInMs ?? 480)}
                fadeOutMs={Number((item.params as any)?.fadeOutMs ?? 480)}
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
                  presetId={item.presetId || (item.params as any)?.presetId}
                  pipPosition={(item.params as any)?.pipPosition}
                  pipShape={(item.params as any)?.pipShape}
                  pipScale={(item.params as any)?.pipScale}
                  jCutMs={Number((item.params as any)?.jCutMs ?? 0)}
                  lCutMs={Number((item.params as any)?.lCutMs ?? 0)}
                  audioFadeMs={Number((item.params as any)?.audioFadeMs ?? 80)}
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
                          name={`↳ B-Roll ${bIdx + 1}: ${b.title || b.id} (${b.preset ?? "none"})`}
                          from={bOffsetFrames}
                          durationInFrames={bDurationFrames}
                        >
                          <PresetWrapper
                            preset={b.preset ?? "none"}
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
      {brollStack.map((b: BrollItemProps, bIdx: number) => {
        const offsetMs = b.offsetMs ?? b.startMs ?? 0;
        const durationMs = b.durationMs ?? 3000;
        const bOffsetFrames = Math.max(0, Math.round((offsetMs / 1000) * fps));
        const bDurationFrames = Math.max(1, Math.round((durationMs / 1000) * fps));

        return (
          <Sequence
            key={`global_broll_${b.id}_${bIdx}`}
            name={`🎬 Global B-Roll: ${b.title || b.id} (${b.preset ?? "Spring"})`}
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
    </AbsoluteFill>
  );
};
