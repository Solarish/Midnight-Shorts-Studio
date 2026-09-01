import React from "react";
import { AbsoluteFill, Audio, Sequence, Video, useVideoConfig } from "remotion";
import { CoverCard } from "../components/CoverCard";
import { DynamicThaiSubtitles } from "../components/DynamicThaiSubtitles";
import { LogoOutro } from "../components/LogoOutro";
import { TitleCard } from "../components/TitleCard";
import { PresetWrapper } from "../presets";
import type { AspectRatioMode, BrollItemProps, StoryboardAssemblyProps, StoryboardItemProps } from "../types";

interface StoryboardSequenceProps extends StoryboardAssemblyProps {
  aspectRatio: AspectRatioMode;
}

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
      : [
          {
            id: "default_cover",
            kind: "cover_card" as const,
            durationMs: 4000,
            params: {
              title: "PSU Broadcast Storyboard",
              subtitle: "Remotion Automated Video Assembly",
              eyebrow: "Midnight Scholar"
            }
          },
          {
            id: "default_aroll",
            kind: "a_roll" as const,
            durationMs: 6000,
            params: {
              dialogue: "ยินดีต้อนรับสู่ระบบ Remotion Video Assembly ยุคใหม่แห่งการตัดต่ออัตโนมัติ",
              speaker: "PSU Studio",
              subtitles: [
                { word: "ยินดีต้อนรับ", startMs: 200, endMs: 1200 },
                { word: "สู่ระบบ", startMs: 1250, endMs: 1800 },
                { word: "Remotion", startMs: 1850, endMs: 2600 },
                { word: "Video", startMs: 2650, endMs: 3100 },
                { word: "Assembly", startMs: 3150, endMs: 3800 },
                { word: "ตัดต่ออัตโนมัติ", startMs: 3850, endMs: 5500 }
              ]
            }
          },
          {
            id: "default_outro",
            kind: "logo_outro" as const,
            durationMs: 3000,
            params: { note: "PSU BROADCAST" }
          }
        ];

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

        const isVideoSource =
          typeof item.params?.sourcePath === "string" &&
          /\.(mp4|mov|webm|m4v)$/i.test(item.params.sourcePath);

        const isImageSource =
          typeof item.params?.sourcePath === "string" &&
          /\.(png|jpe?g|webp|gif|svg)$/i.test(item.params.sourcePath);

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
                {isVideoSource ? (
                  <Video
                    src={item.params!.sourcePath!}
                    startFrom={
                      item.params?.sourceInMs
                        ? Math.round((item.params.sourceInMs / 1000) * fps)
                        : 0
                    }
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover"
                    }}
                    volume={item.audioPolicy === "mute" ? 0 : 1}
                  />
                ) : isImageSource ? (
                  <Img
                    src={item.params!.sourcePath!}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover"
                    }}
                  />
                ) : (
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
                        backgroundColor: "rgba(11, 18, 32, 0.8)",
                        border: "1px solid rgba(229, 169, 60, 0.3)",
                        color: theme?.primaryColor ?? "#E5A93C",
                        fontSize: 28,
                        fontWeight: 700,
                        fontFamily: theme?.fontFamily ?? "sans-serif"
                      }}
                    >
                      {item.params?.speaker || "A-Roll Interview"}
                    </div>
                  </AbsoluteFill>
                )}

                {/* Nested B-roll Overlays on this A-roll segment */}
                {Array.isArray(item.broll)
                  ? item.broll.map((b: BrollItemProps, bIdx: number) => {
                      const bOffsetFrames = Math.round((b.offsetMs / 1000) * fps);
                      const bDurationFrames = Math.round((b.durationMs / 1000) * fps);
                      const isBrollVideo = /\.(mp4|mov|webm)$/i.test(b.assetPath);

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
                            {isBrollVideo ? (
                              <Video
                                src={b.assetPath}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: b.fit ?? "cover"
                                }}
                                volume={b.audioPolicy === "preserve" ? 1 : 0}
                              />
                            ) : (
                              <Img
                                src={b.assetPath}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: b.fit ?? "cover"
                                }}
                              />
                            )}
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
        const bOffsetFrames = Math.round((b.offsetMs / 1000) * fps);
        const bDurationFrames = Math.round((b.durationMs / 1000) * fps);
        const isBrollVideo = /\.(mp4|mov|webm)$/i.test(b.assetPath);

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
              {isBrollVideo ? (
                <Video
                  src={b.assetPath}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: b.fit ?? "cover"
                  }}
                  volume={b.audioPolicy === "preserve" ? 1 : 0}
                />
              ) : (
                <Img
                  src={b.assetPath}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: b.fit ?? "cover"
                  }}
                />
              )}
            </PresetWrapper>
          </Sequence>
        );
      })}

      {/* 3. Global Subtitle Tracks */}
      {subtitles.map((sub, sIdx) => {
        const sOffsetFrames = Math.round((sub.startMs / 1000) * fps);
        const sDurationFrames = Math.round((sub.durationMs / 1000) * fps);

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

        return (
          <Sequence
            key={`audio_${aIdx}`}
            from={fromFrame}
            durationInFrames={durationFrames}
          >
            <Audio
              src={track.path}
              volume={track.volume ?? 1}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
