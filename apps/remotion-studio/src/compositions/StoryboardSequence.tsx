import React, { useState } from "react";
import { AbsoluteFill, Audio, Img, Sequence, Video, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CoverCard } from "../components/CoverCard";
import { DynamicThaiSubtitles } from "../components/DynamicThaiSubtitles";
import { LogoOutro } from "../components/LogoOutro";
import { LowerThird } from "../components/LowerThird";
import { TitleCard } from "../components/TitleCard";
import { isAudioFile, isImageFile, isVideoFile, resolveMediaUrl } from "../media-resolver";
import { PresetWrapper } from "../presets";
import type {
  AspectRatioMode,
  AudioTrackProps,
  BrollItemProps,
  CutlistSegmentProps,
  StoryboardAssemblyProps,
  StoryboardItemProps
} from "../types";

/**
 * Calculates dynamic background music gain frame-by-frame with smooth auto-ducking.
 *
 * - Outside speech windows: full nominal volume (e.g. 0.6)
 * - Inside speech windows: ducked volume (e.g. 0.12 / ~-14dB)
 * - Transitions: smooth ramps over 15-20 frames before & after speech
 * - End of video: smooth fade-out
 */
export function calculateDuckedVolume(
  frame: number,
  fps: number,
  speechWindows: Array<{ startFrame: number; endFrame: number }>,
  bgm?: AudioTrackProps,
  totalDurationFrames = 250
): number {
  if (!bgm || !bgm.path) return 0;
  const normalVol = Math.max(0, Math.min(1, bgm.volume ?? 0.6));
  const duckVol = Math.max(0, Math.min(normalVol, bgm.duckVolume ?? 0.12));
  const autoDucking = bgm.autoDucking !== false; // default: true

  // 1. Fade In at video start
  const fadeInFrames = Math.max(1, Math.round(((bgm.fadeInMs ?? 500) / 1000) * fps));
  let baseGain = normalVol;
  if (frame < fadeInFrames) {
    baseGain = (frame / fadeInFrames) * normalVol;
  }

  // 2. Fade Out at video end
  const fadeOutFrames = Math.max(1, Math.round(((bgm.fadeOutMs ?? 1500) / 1000) * fps));
  if (frame > totalDurationFrames - fadeOutFrames) {
    const fadeProgress = (totalDurationFrames - frame) / fadeOutFrames;
    baseGain = Math.max(0, baseGain * Math.max(0, fadeProgress));
  }

  if (!autoDucking || speechWindows.length === 0) {
    return baseGain;
  }

  // 3. Ramp transition duration around speech (0.6s ~ 15 frames at 25fps)
  const rampFrames = Math.max(6, Math.round(0.6 * fps));

  // Find if we are near or within any speech window
  let minGainFactor = 1.0;
  for (const window of speechWindows) {
    const rampStart = Math.max(0, window.startFrame - rampFrames);
    const rampEnd = window.endFrame + rampFrames;

    if (frame >= window.startFrame && frame <= window.endFrame) {
      // Inside active dialogue: ducked
      minGainFactor = Math.min(minGainFactor, duckVol / normalVol);
    } else if (frame >= rampStart && frame < window.startFrame) {
      // Ducking down into speech
      const progress = (frame - rampStart) / rampFrames;
      const factor = 1 - progress * (1 - duckVol / normalVol);
      minGainFactor = Math.min(minGainFactor, factor);
    } else if (frame > window.endFrame && frame <= rampEnd) {
      // Raising back up from speech
      const progress = (frame - window.endFrame) / rampFrames;
      const factor = (duckVol / normalVol) + progress * (1 - duckVol / normalVol);
      minGainFactor = Math.min(minGainFactor, factor);
    }
  }

  return Math.max(0, Math.min(1, baseGain * minGainFactor));
}

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
          objectFit: broll.fit ?? "cover",
          backgroundColor: "#000000"
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
          objectFit: broll.fit ?? "cover",
          backgroundColor: "#000000"
        }}
        onError={() => setHasError(true)}
      />
    );
  };

  export const StoryboardSequence: React.FC<StoryboardAssemblyProps> = ({
  items = [],
  cutlist = [],
  brollStack = [],
  audioTracks = [],
  bgmTrack,
  theme,
  aspectRatio = "9:16"
}) => {
  const { fps } = useVideoConfig();

  // Pre-calculate speech windows for auto ducking across the timeline
  const speechWindows: Array<{ startFrame: number; endFrame: number }> = [];
  let speechCursor = 0;
  for (const itm of items) {
    const durFrames = Math.max(1, Math.round((itm.durationMs / 1000) * fps));
    if (itm.kind === "a_roll" && itm.audioPolicy !== "mute") {
      speechWindows.push({
        startFrame: speechCursor,
        endFrame: speechCursor + durFrames
      });
    }
    speechCursor += durFrames;
  }
  const totalTimelineDurationFrames = Math.max(25, speechCursor);

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

  // Resolve BGM soundtrack
  const effectiveBgm = bgmTrack || (audioTracks && audioTracks.find((t) => t.role === "music" || !t.role));
  const resolvedBgmUrl = effectiveBgm?.path ? resolveMediaUrl(effectiveBgm.path) : undefined;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {/* 0. Background Music Track (with Auto-Ducking) */}
      {resolvedBgmUrl ? (
        <Sequence
          name={`🎵 BGM Soundtrack: ${effectiveBgm?.path || "Bed Track"}`}
          from={Math.max(0, Math.round(((effectiveBgm?.startMs ?? 0) / 1000) * fps))}
          durationInFrames={totalTimelineDurationFrames}
        >
          <Audio
            src={resolvedBgmUrl}
            volume={(f) =>
              calculateDuckedVolume(
                f,
                fps,
                speechWindows,
                effectiveBgm,
                totalTimelineDurationFrames
              )
            }
          />
        </Sequence>
      ) : null}

      {/* 0.1 Additional Explicit Audio Tracks */}
      {audioTracks && audioTracks.length > 0
        ? audioTracks
            .filter((t) => t !== effectiveBgm && t.path)
            .map((track, tIdx) => {
              const trackUrl = resolveMediaUrl(track.path);
              if (!trackUrl) return null;
              const startF = Math.max(0, Math.round(((track.startMs ?? 0) / 1000) * fps));
              const durF = track.durationMs
                ? Math.max(1, Math.round((track.durationMs / 1000) * fps))
                : totalTimelineDurationFrames - startF;
              return (
                <Sequence
                  key={`audio_track_${track.id || tIdx}`}
                  name={`🔊 Audio Track: ${track.role || "track"} ${tIdx + 1}`}
                  from={startF}
                  durationInFrames={durF}
                >
                  <Audio src={trackUrl} volume={track.volume ?? 1} />
                </Sequence>
              );
            })
        : null}

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
                sourceImage={item.params?.sourceImage ?? (item as any).sourceImage}
                backgroundImage={item.params?.backgroundImage ?? (item as any).backgroundImage}
                personImage={item.params?.personImage ?? (item as any).personImage}
                doodleImage={(item.params as any)?.doodleAssetPath ?? (item.params as any)?.doodleImage ?? (item as any).doodleImage}
                doodleEnabled={item.params?.doodleEnabled === true || (item as any).doodleEnabled === true}
                doodleOpacity={item.params?.doodleOpacity !== undefined ? Number(item.params.doodleOpacity) : (item as any).doodleOpacity !== undefined ? Number((item as any).doodleOpacity) : 1}
                doodleScale={item.params?.doodleScale !== undefined ? Number(item.params.doodleScale) : (item as any).doodleScale !== undefined ? Number((item as any).doodleScale) : 1}
              doodleSeed={(item.params as any)?.doodleSeed !== undefined ? Number((item.params as any).doodleSeed) : 1}
                doodlePreset={(item.params?.doodlePreset as any) ?? (item as any).doodlePreset ?? "none"}
                doodlePaths={item.params?.doodlePaths ?? (item as any).doodlePaths}
                doodleAssetSet={(item.params as any)?.doodleAssetSet ?? (item as any).doodleAssetSet}
                personX={item.params?.personX !== undefined ? Number(item.params.personX) : (item as any).personX !== undefined ? Number((item as any).personX) : 0.72}
                personY={item.params?.personY !== undefined ? Number(item.params.personY) : (item as any).personY !== undefined ? Number((item as any).personY) : 0.5}
                personScale={item.params?.personScale !== undefined ? Number(item.params.personScale) : (item as any).personScale !== undefined ? Number((item as any).personScale) : 1}
                personSticker={item.params?.personSticker !== false && (item as any).personSticker !== false}
                personStickerPreset={(item.params as any)?.personStickerPreset || "solid-white"}
                title={item.params?.title ?? (item as any).title}
                subtitle={item.params?.subtitle ?? (item as any).subtitle}
                eyebrow={item.params?.eyebrow ?? (item as any).eyebrow}
                personName={item.params?.personName ?? (item as any).personName ?? item.params?.title ?? (item as any).title}
                positionTitle={item.params?.positionTitle ?? (item as any).positionTitle ?? item.params?.subtitle ?? (item as any).subtitle}
                award={item.params?.award ?? (item as any).award ?? item.params?.eyebrow ?? (item as any).eyebrow}
                textStyles={item.params?.textStyles ?? (item as any).textStyles}
                aspectRatio={aspectRatio}
                motionPreset={item.params?.motionPreset ?? (item as any).motionPreset ?? "Spring"}
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

                      // Check if the next B-roll is chained cut-to-cut directly after this one
                      const nextBroll = item.broll?.[bIdx + 1];
                      const nextOffsetMs = nextBroll ? (nextBroll.offsetMs ?? nextBroll.startMs ?? 0) : null;
                      const isChainedToNext =
                        nextOffsetMs !== null && Math.abs(nextOffsetMs - (offsetMs + durationMs)) < 120;

                      // Tail Under-lap: extend by 8 frames underneath the next clip
                      // so that if the browser takes 1-2 frames to decode the next video,
                      // THIS B-roll is visible behind it instead of the underlying A-roll interview!
                      const effectiveDurationFrames = isChainedToNext
                        ? bDurationFrames + 8
                        : bDurationFrames;

                      return (
                        <Sequence
                          key={`${b.id}_${bIdx}`}
                          name={`↳ B-Roll ${bIdx + 1}: ${b.title || b.id} (${b.preset ?? "none"})`}
                          from={bOffsetFrames}
                          durationInFrames={effectiveDurationFrames}
                        >
                          <PresetWrapper
                            preset={b.preset ?? "none"}
                            style={{
                              position: "absolute",
                              inset: 0,
                              zIndex: 20 + bIdx
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

                {/* Dynamic Thai Subtitles for this segment (Default: OFF, only rendered when enableSubtitles is true) */}
                {Boolean((item.params as any)?.enableSubtitles) && (item.params?.dialogue || item.params?.subtitles) ? (
                  <DynamicThaiSubtitles
                    dialogue={item.params?.dialogue}
                    words={item.params?.subtitles}
                    aspectRatio={aspectRatio}
                    speaker={item.params?.speaker}
                    theme={theme}
                  />
                ) : null}

                {/* Lower Third Overlay for this segment */}
                {Boolean(item.params?.lowerThird?.enabled !== false && (item.params?.lowerThird || (item.params as any)?.enableLowerThird || item.params?.speaker)) ? (() => {
                  const lt = item.params?.lowerThird ?? {};
                  const ltOffsetMs = Number(lt.offsetMs ?? (item.params as any)?.lowerThirdOffsetMs ?? 500);
                  const ltDurationMs = Number(lt.durationMs ?? (item.params as any)?.lowerThirdDurationMs ?? 4000);
                  const ltOffsetFrames = Math.max(0, Math.round((ltOffsetMs / 1000) * fps));
                  const ltDurationFrames = Math.max(1, Math.round((ltDurationMs / 1000) * fps));

                  return (
                    <Sequence
                      name={`🏷️ Lower Third: ${lt.name || (item.params as any)?.lowerThirdName || "Speaker"}`}
                      from={ltOffsetFrames}
                      durationInFrames={ltDurationFrames}
                    >
                      <LowerThird
                        name={lt.name || (item.params as any)?.lowerThirdName || item.params?.speaker || "ชื่อวิทยากร"}
                        title={lt.title || (item.params as any)?.lowerThirdTitle || ""}
                        department={lt.department || (item.params as any)?.lowerThirdDepartment || ""}
                        presetId={lt.presetId || (item.params as any)?.lowerThirdPresetId || "lowerthird-glass-gold-v1"}
                        aspectRatio={aspectRatio}
                        theme={theme}
                      />
                    </Sequence>
                  );
                })() : null}
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

        const nextBroll = brollStack[bIdx + 1];
        const nextOffsetMs = nextBroll ? (nextBroll.offsetMs ?? nextBroll.startMs ?? 0) : null;
        const isChainedToNext =
          nextOffsetMs !== null && Math.abs(nextOffsetMs - (offsetMs + durationMs)) < 120;
        const effectiveDurationFrames = isChainedToNext
          ? bDurationFrames + 8
          : bDurationFrames;

        return (
          <Sequence
            key={`global_broll_${b.id}_${bIdx}`}
            name={`🎬 Global B-Roll: ${b.title || b.id} (${b.preset ?? "none"})`}
            from={bOffsetFrames}
            durationInFrames={effectiveDurationFrames}
          >
            <PresetWrapper
              preset={b.preset ?? "none"}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 30 + bIdx
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
