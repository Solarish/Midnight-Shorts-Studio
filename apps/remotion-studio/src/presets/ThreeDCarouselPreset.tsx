import React, { useMemo } from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveMediaUrl } from "../media-resolver";
import { ReferenceShowcasePreset } from "./ReferenceShowcasePreset";
import type { AspectRatioMode, CgBlock, StudioThemeProps } from "../types";

export type ShowcaseLayout = "layered-stack" | "scattered-collage" | "text-hold" | "hero-strip" | "portrait-grid" | "image-sweep";
export type ShowcaseShot = { layout: ShowcaseLayout; durationMs: number; mediaOrder?: number[]; visibleCount?: number };
const DEFAULT_SHOWCASE_SEQUENCE: ShowcaseShot[] = [
  { layout: "layered-stack", durationMs: 5000, mediaOrder: [0, 2, 1, 4], visibleCount: 4 },
  { layout: "scattered-collage", durationMs: 3800, mediaOrder: [3, 0, 5, 1], visibleCount: 4 },
  { layout: "text-hold", durationMs: 4500 },
  { layout: "hero-strip", durationMs: 3000, mediaOrder: [1, 4, 0, 3], visibleCount: 4 },
  { layout: "portrait-grid", durationMs: 2500, mediaOrder: [2, 5, 1], visibleCount: 3 },
  { layout: "image-sweep", durationMs: 3500, mediaOrder: [4, 0, 3], visibleCount: 3 },
  { layout: "text-hold", durationMs: 2000 },
  { layout: "image-sweep", durationMs: 1000, mediaOrder: [1], visibleCount: 1 }
];

export interface ThreeDCarouselPresetProps {
  media?: string[];
  text?: string;
  layoutSequence?: Array<ShowcaseLayout | ShowcaseShot>;
  cgBlocks?: CgBlock[];
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  texts?: Record<string, string>;
  aspectRatio?: AspectRatioMode;
  rotationSpeed?: number;
  cameraTilt?: number;
  enableReflection?: boolean;
  theme?: StudioThemeProps;
}

export const ThreeDCarouselManifest = {
  id: "3d-carousel-title-v1",
  name: "🎡 3D Photo Carousel Showcase",
  description: "วงแหวนภาพ 3D หรูหรา สไตล์ Midnight Scholar พร้อมการเคลื่อนไหวตามต้นฉบับและข้อความสีทองเรืองแสง",
  category: "title",
  paramsSchema: {
    text: {
      type: "text",
      label: "ข้อความมาตรฐาน (Text)",
      description: "ข้อความหลักที่จะแสดงบน Showcase",
      default: ""
    },
    layoutSequence: {
      type: "json",
      label: "ลำดับช็อต (Layout Sequence)",
      description: "กำหนดรูปแบบการแสดงผลหลายช็อตของ Showcase",
      default: DEFAULT_SHOWCASE_SEQUENCE
    },
    media: {
      type: "media_gallery",
      label: "คลังภาพ Carousel (4-20 ภาพ)",
      description: "เลือกโฟลเดอร์ภาพนิ่งจาก NAS",
      defaultNasFolder: "/ภาพนิ่ง"
    },
    rotationSpeed: {
      type: "slider",
      label: "ความเร็วการหมุนรอบ (Rotation Speed)",
      min: 0.2,
      max: 3.0,
      step: 0.1,
      default: 1.0
    },
    cameraTilt: {
      type: "slider",
      label: "มุมเอียงกล้อง (Camera Tilt °)",
      min: -25,
      max: 25,
      step: 1,
      default: 8
    },
    enableReflection: {
      type: "toggle",
      label: "เปิดเงาสะท้อนพื้น (Floor Reflection)",
      default: false
    }
  }
};

// Deterministic pseudo-random generator for particle dust
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export const ThreeDCarouselPreset: React.FC<ThreeDCarouselPresetProps> = ({
  media = [],
  text,
  layoutSequence = DEFAULT_SHOWCASE_SEQUENCE,
  cgBlocks,
  title,
  subtitle,
  eyebrow,
  texts,
  aspectRatio = "16:9",
  rotationSpeed = 1.0,
  cameraTilt = 8,
  enableReflection = false,
  theme
}) => {
  return <ReferenceShowcasePreset media={media} text={text} layoutSequence={layoutSequence} cgBlocks={cgBlocks} title={title} subtitle={subtitle} eyebrow={eyebrow} texts={texts} aspectRatio={aspectRatio} rotationSpeed={rotationSpeed} cameraTilt={cameraTilt} enableReflection={enableReflection} theme={theme} />;
  /* Legacy procedural implementation retained below for controlled comparison. */
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Midnight Scholar signature palette
  const primaryColor = theme?.primaryColor ?? "#A8C4B5"; // Reference sage green
  const accentColor = theme?.accentColor ?? "#DCE8E0";
  const secondaryBg = theme?.secondaryColor ?? "#F5F5F1";
  const textColor = theme?.textColor ?? "#91B4A3";
  const fontFamily =
    theme?.fontFamily ??
    "-apple-system, BlinkMacSystemFont, 'Prompt', 'Kanit', 'Noto Sans Thai', sans-serif";

  // Resolve hierarchical typography
  const displayTitle =
    text ||
    title ||
    texts?.["Text 3"] ||
    texts?.["Text 1"] ||
    texts?.title ||
    "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์";
  const displaySubtitle =
    subtitle ||
    texts?.["Text 4"] ||
    texts?.["Text 2"] ||
    texts?.subtitle ||
    "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์";
  const displayEyebrow =
    eyebrow ||
    texts?.["Text 5"] ||
    texts?.eyebrow ||
    "✦ อาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙ ✦";

  // Only render operator-provided media; never invent or imply source assets.
  const rawList = Array.isArray(media) ? media.filter(Boolean) : [];

  const photoCount = Math.max(4, rawList.length);

  // Aspect ratio calibrated card dimensions
  const isVertical = aspectRatio === "9:16";
  const isSquare = aspectRatio === "1:1";

  const cardWidth = isVertical ? 220 : isSquare ? 190 : 175;
  const cardHeight = isVertical ? 330 : isSquare ? 250 : 235;

  // Radius calculation: R = (width / 2) / tan(PI / N) + depth buffer
  const angleStep = 360 / photoCount;
  const radius = Math.round(cardWidth / 2 / Math.tan(Math.PI / photoCount) + (isVertical ? 160 : 200));

  // Normalized timeline progress [0, 1]
  const totalFrames = Math.max(1, durationInFrames);
  const progress = frame / totalFrames;
  const sequence = layoutSequence.length > 0 ? layoutSequence.map((shot) => typeof shot === "string" ? { layout: shot, durationMs: 1000 } : shot) : DEFAULT_SHOWCASE_SEQUENCE;
  const totalSequenceMs = sequence.reduce((sum, shot) => sum + Math.max(40, shot.durationMs), 0);
  const elapsedSequenceMs = progress * totalSequenceMs;
  let sequenceCursorMs = 0;
  let sequenceIndex = 0;
  for (let index = 0; index < sequence.length; index += 1) {
    const shot = sequence[index];
    if (!shot) continue;
    const next = sequenceCursorMs + Math.max(40, shot?.durationMs ?? 40);
    if (elapsedSequenceMs < next || index === sequence.length - 1) { sequenceIndex = index; break; }
    sequenceCursorMs = next;
  }
  const activeShot: ShowcaseShot = sequence[sequenceIndex] ?? { layout: "layered-stack", durationMs: 5000 };
  const activeLayout = activeShot.layout;
  const layoutProgress = Math.max(0, Math.min(1, (elapsedSequenceMs - sequenceCursorMs) / Math.max(40, activeShot.durationMs)));
  const shotDurationFrames = Math.max(1, Math.round((activeShot.durationMs / 1000) * fps));
  const shotLocalFrame = Math.max(0, frame - Math.round((sequenceCursorMs / 1000) * fps));
  const shotEnter = interpolate(shotLocalFrame, [0, Math.min(12, shotDurationFrames / 3)], [0, 1], { extrapolateRight: "clamp" });
  const shotExit = interpolate(shotLocalFrame, [Math.max(0, shotDurationFrames - 14), shotDurationFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // =========================================================================
  // 5-PHASE MOTION CHOREOGRAPHY (Adapting exact reference curves)
  // Phase 1 (0.00 - 0.16): Intro Fly-in & Ring Cascade
  // Phase 2 (0.16 - 0.60): Dynamic Orbit & Parallax Sweep
  // Phase 3 (0.60 - 0.85): Hero Card Focus & Cinematic Camera Zoom
  // Phase 4 (0.40 - 0.90): Typography In, Expand, Hold & Gold Shimmer
  // Phase 5 (0.85 - 1.00): Outro Camera Push & Smooth Cut Transition
  // =========================================================================

  // Intro cascade spring for card ring expansion
  const introSpring = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 65, mass: 0.85 }
  });

  const introScale = interpolate(introSpring, [0, 1], [0.55, 1.0]);
  const introRadiusMul = interpolate(introSpring, [0, 1], [0.35, 1.0]);
  const introAlpha = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  // Continuous Orbit rotation with graceful deceleration into Hero Focus
  // Reference speed: ~32 deg/sec in Phase 2, easing smoothly to showcase hero in Phase 3
  const orbitRotation = interpolate(
    progress,
    [0, 0.15, 0.6, 0.82, 1.0],
    [
      0,
      -35 * rotationSpeed,
      -175 * rotationSpeed,
      -360 * rotationSpeed,
      -395 * rotationSpeed
    ],
    { extrapolateRight: "clamp" }
  );

  // Dynamic Camera Tilt (Pitch angle)
  const dynamicCameraTilt = interpolate(
    progress,
    [0, 0.2, 0.6, 0.85, 1.0],
    [cameraTilt * 1.3, cameraTilt, cameraTilt * 0.8, cameraTilt * 0.25, 0],
    { extrapolateRight: "clamp" }
  );

  // Camera Zoom (Z-Translation toward Hero Card)
  const cameraZ = interpolate(
    progress,
    [0, 0.18, 0.58, 0.82, 1.0],
    [
      -radius * 0.65,
      -radius * 0.25,
      0,
      radius * 0.42,
      radius * 0.62
    ],
    { extrapolateRight: "clamp" }
  );

  // Global Outro Dissolve / Push
  const outroAlpha = interpolate(
    progress,
    [0.88, 0.98],
    [1, 0.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Background 3D floating ambient particles
  const particles = useMemo(() => {
    return Array.from({ length: 22 }).map((_, i) => {
      const x = (seededRandom(i * 13 + 1) - 0.5) * 1600;
      const y = (seededRandom(i * 27 + 2) - 0.5) * 1200;
      const z = (seededRandom(i * 41 + 3) - 0.5) * 1200;
      const size = 3 + seededRandom(i * 7 + 4) * 5;
      const speed = 0.4 + seededRandom(i * 19 + 5) * 0.8;
      const isGold = i % 3 === 0;
      return { id: i, x, y, z, size, speed, isGold };
    });
  }, []);

  // Typography In/Out Choreography (Phase 4)
  const titleDelay = activeLayout === "text-hold" ? Math.round(fps * 0.18) : Math.round(fps * 1.2);
  const titleSpring = spring({
    frame: Math.max(0, shotLocalFrame - titleDelay),
    fps,
    config: { damping: 14, stiffness: 80, mass: 0.8 }
  });

  const titleOpacity = interpolate(
    shotLocalFrame,
    [titleDelay, titleDelay + 18, Math.max(titleDelay + 19, shotDurationFrames - 15), Math.max(titleDelay + 20, shotDurationFrames - 2)],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const titleY = interpolate(titleSpring, [0, 1], [48, 0]);
  const titleScale = interpolate(titleSpring, [0, 1], [0.9, 1.0]);
  const titleLetterSpacing = interpolate(titleSpring, [0, 1], [4, 0.5]);

  // Shimmer animation across gold text
  const shimmerProgress = interpolate(
    (frame % (fps * 4)) / (fps * 4),
    [0, 1],
    [-100, 200]
  );

  // Specular light sweep on Hero Card
  const heroSpecularSweep = interpolate(
    progress,
    [0.6, 0.85],
    [-120, 220],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Font sizing responsive to aspect ratios
  const titleFontSize = isVertical ? 46 : isSquare ? 50 : 58;
  const subtitleFontSize = isVertical ? 17 : isSquare ? 19 : 21;
  const eyebrowFontSize = isVertical ? 13 : 15;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#F8F8F5",
        backgroundImage: `
          radial-gradient(circle at 50% 42%, rgba(213, 226, 218, 0.45) 0%, transparent 58%),
          linear-gradient(180deg, #FFFFFF 0%, #F3F4F0 100%)
        `,
        overflow: "hidden",
        fontFamily,
        perspective: isVertical ? "1600px" : "1400px",
        perspectiveOrigin: "50% 44%",
        opacity: outroAlpha
      }}
    >
      {/* 1. Atmospheric 3D Floating Dust & Bokeh Particles */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          perspective: "1200px",
          pointerEvents: "none"
        }}
      >
        {particles.map((p) => {
          const driftY = (frame * p.speed) % 1200 - 600;
          const driftX = Math.sin((frame * 0.02 + p.id)) * 40;
          const pAlpha = interpolate(
            Math.sin(frame * 0.05 + p.id),
            [-1, 1],
            [0.2, 0.75]
          );

          return (
            <div
              key={p.id}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: `${p.size}px`,
                height: `${p.size}px`,
                borderRadius: "50%",
                backgroundColor: p.isGold ? primaryColor : accentColor,
                boxShadow: `0 0 ${p.size * 3}px ${p.isGold ? primaryColor : accentColor}`,
                opacity: pAlpha * introAlpha,
                transform: `
                  translate3d(${p.x + driftX}px, ${p.y + driftY}px, ${p.z}px)
                `
              }}
            />
          );
        })}
      </div>

      {/* 2. Top & Center Atmospheric Spotlights */}
      <div
        style={{
          position: "absolute",
          top: "22%",
          left: "50%",
          width: isVertical ? "800px" : "1200px",
          height: "600px",
          transform: "translate(-50%, -50%)",
          background: `radial-gradient(ellipse at center, ${primaryColor}24 0%, ${accentColor}10 40%, transparent 70%)`,
          filter: "blur(70px)",
          pointerEvents: "none"
        }}
      />

      {/* 3. 3D Revolving Cylinder Ring Container */}
      <div
        style={{
          position: "absolute",
          top: isVertical ? "40%" : isSquare ? "42%" : "44%",
          left: "50%",
          width: 0,
          height: 0,
          transformStyle: "preserve-3d",
          transform: activeLayout === "layered-stack" ? `
            translateZ(${cameraZ}px)
            rotateX(${dynamicCameraTilt}deg)
            rotateY(${orbitRotation}deg)
            scale(${introScale})
          ` : "translateZ(0) scale(1)",
          opacity: activeLayout === "text-hold" ? 0 : introAlpha * shotEnter * shotExit
        }}
      >
        {rawList.map((photoPath, index) => {
          const visibleCount = Math.min(rawList.length, activeShot.visibleCount ?? (activeLayout === "portrait-grid" ? 3 : 4));
          if (index >= visibleCount) return null;
          const orderedIndex = activeShot.mediaOrder?.[index] ?? ((index + sequenceIndex * 2) % rawList.length);
          const itemAngle = orderedIndex * angleStep;
          const resolvedSrc = resolveMediaUrl(rawList[orderedIndex] ?? photoPath);

          // Calculate normalized angle facing the camera (0 deg = directly in front)
          const relAngle = ((itemAngle + orbitRotation) % 360 + 360) % 360;
          const normalizedDist = Math.min(relAngle, 360 - relAngle); // 0 = front, 180 = directly behind

          // Dynamic depth parameters
          const isFront = normalizedDist < 75;
          const isHero = normalizedDist < 35 && progress >= 0.6;
          const depthAlpha = interpolate(normalizedDist, [0, 90, 180], [1.0, 0.7, 0.32]);
          const depthScale = interpolate(normalizedDist, [0, 90, 180], [1.08, 0.96, 0.84]);
          const depthBlur = interpolate(normalizedDist, [45, 120, 180], [0, 1.5, 3.5]);

          const currentRadius = radius * introRadiusMul;
          const stackX = (index - (visibleCount - 1) / 2) * (cardWidth * 0.48);
          const stackY = Math.abs(index - (visibleCount - 1) / 2) * 8;
          const gridX = (index - (visibleCount - 1) / 2) * (cardWidth * 1.1);
          const gridY = (index % 2 === 0 ? -8 : 14);
          const stripX = (index - (visibleCount - 1) / 2) * (cardWidth * 1.0) + interpolate(layoutProgress, [0, 1], [80, -80]);
          const sweepX = interpolate(layoutProgress, [0, 1], [index % 2 ? 620 : -620, index % 2 ? -620 : 620]);
          const enterDistance = activeLayout === "image-sweep" ? 620 : activeLayout === "scattered-collage" ? 180 : 90;
          const enterX = index % 2 === 0 ? enterDistance : -enterDistance;
          const enterY = activeLayout === "layered-stack" ? (index % 2 === 0 ? 100 : -100) : 0;
          const cardStagger = Math.min(10, Math.round(shotDurationFrames * 0.1));
          const cardLocalFrame = Math.max(0, shotLocalFrame - index * cardStagger);
          const cardIn = interpolate(cardLocalFrame, [0, Math.min(16, shotDurationFrames / 3)], [0, 1], { extrapolateRight: "clamp" });
          const cardOut = interpolate(shotLocalFrame, [Math.max(0, shotDurationFrames - 16 - (photoCount - index) * 2), shotDurationFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const motionOffset = activeLayout === "image-sweep" || activeLayout === "scattered-collage"
            ? ` translate3d(${interpolate(cardIn * cardOut, [0, 1], [enterX, 0])}px, ${interpolate(cardIn * cardOut, [0, 1], [enterY, 0])}px, 0)`
            : "";
          const scatterSlots = [
            [-245, -76, -7, 0.72], [-76, 62, 4, 0.9], [92, -35, -3, 1], [255, 54, 7, 0.74]
          ] as const;
          const scatter = scatterSlots[index] ?? scatterSlots[0];
          const motionBlur = cardIn < 0.98 || cardOut < 0.98 ? (activeLayout === "image-sweep" ? 7 : 2.5) : 0;
          const layoutTransform = activeLayout === "layered-stack"
            ? `translate3d(${stackX}px, ${stackY}px, ${index * -24}px) rotateZ(${(index - (photoCount - 1) / 2) * 3}deg) scale(${0.88 + (1 - Math.abs(index - (photoCount - 1) / 2) / photoCount) * 0.14})`
            : activeLayout === "scattered-collage"
              ? `translate3d(${scatter[0]}px, ${scatter[1]}px, ${index * -30}px) rotateZ(${scatter[2]}deg) scale(${scatter[3]})`
              : activeLayout === "hero-strip" || activeLayout === "image-sweep"
                ? `translate3d(${activeLayout === "hero-strip" ? stripX : sweepX}px, ${(index % 3 - 1) * 18}px, ${index === Math.floor(visibleCount / 2) ? 120 : -Math.abs(index - visibleCount / 2) * 35}px) rotateY(${activeLayout === "hero-strip" ? (index - visibleCount / 2) * -5 : 0}deg) scale(${index === Math.floor(visibleCount / 2) ? 1.25 : 0.8})`
                : `translate3d(${gridX}px, ${gridY}px, 0) scale(0.72)`;

          return (
            <div
              key={`${photoPath}_${index}`}
              style={{
                position: "absolute",
                top: `-${cardHeight / 2}px`,
                left: `-${cardWidth / 2}px`,
                width: `${cardWidth}px`,
                height: `${cardHeight}px`,
                transformStyle: "preserve-3d",
                transform: `${layoutTransform}${motionOffset}`,
                opacity: activeLayout === "text-hold" ? 0 : Math.min(1, depthAlpha + 0.12) * cardIn * cardOut,
                borderRadius: "24px",
                boxShadow: isFront
                  ? `0 24px 42px rgba(65, 83, 73, ${isHero ? "0.28" : "0.18"})`
                  : "0 10px 24px rgba(65, 83, 73, 0.12)",
                border: isFront
                  ? `2px solid ${primaryColor}`
                  : "1.5px solid rgba(150, 170, 158, 0.28)",
                backgroundColor: secondaryBg,
                overflow: "hidden",
                filter: `blur(${Math.max(depthBlur, motionBlur)}px)`,
              }}
            >
              {/* Photo Media View */}
              {resolvedSrc ? (
                <Img
                  src={resolvedSrc}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: isFront ? "scale(1.03)" : "scale(1.0)",
                    transition: "transform 0.3s ease"
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#E9EEE9",
                    color: textColor,
                    fontSize: "16px",
                    fontWeight: 700
                  }}
                >
                  <span>PSU ARCHIVE</span>
                  <span style={{ fontSize: "12px", opacity: 0.7, marginTop: 4 }}>
                    Photo #{index + 1}
                  </span>
                </div>
              )}

              {/* Glossy Curved Bevel Sheen */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: isFront
                    ? "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 40%, transparent 60%, rgba(0,0,0,0.45) 100%)"
                    : "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.65) 100%)",
                  pointerEvents: "none"
                }}
              />

              {/* Specular Light Glide across Hero Card (Phase 3) */}
              {isFront && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: `${heroSpecularSweep}%`,
                    width: "60%",
                    height: "100%",
                    background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
                    transform: "skewX(-25deg)",
                    pointerEvents: "none",
                    filter: "blur(6px)"
                  }}
                />
              )}

              {/* Elegant Bottom Inner Card Gradient */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: "35%",
                    background: "linear-gradient(to top, rgba(79, 103, 89, 0.18) 0%, transparent 100%)",
                  pointerEvents: "none"
                }}
              />
            </div>
          );
        })}
      </div>

      {/* 4. Floor Grid & Reflection Horizon */}
      {enableReflection && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: isVertical ? "32%" : "36%",
            background: `
              linear-gradient(180deg, transparent 0%, rgba(5, 8, 15, 0.75) 40%, #03050B 100%)
            `,
            borderTop: `1px solid ${primaryColor}33`,
            boxShadow: `0 -10px 40px ${primaryColor}15`,
            pointerEvents: "none"
          }}
        >
          {/* Horizon glow beam */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "20%",
              right: "20%",
              height: "2px",
              background: `linear-gradient(90deg, transparent 0%, ${accentColor}88 30%, ${primaryColor} 50%, ${accentColor}88 70%, transparent 100%)`,
              filter: "blur(1px)"
            }}
          />
        </div>
      )}

      {/* 5. Overlay Typography Plate (Phase 4 Choreography) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: activeLayout === "text-hold" ? "center" : "flex-end",
          paddingBottom: activeLayout === "text-hold" ? 0 : isVertical ? "16%" : isSquare ? "10%" : "7%",
          paddingLeft: "5%",
          paddingRight: "5%",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px) scale(${titleScale})`,
          transformOrigin: "center bottom",
          pointerEvents: "none",
          zIndex: 50
        }}
      >
        <div
          style={{
            padding: isVertical ? "28px 24px" : isSquare ? "28px 36px" : "32px 52px",
            borderRadius: "28px",
            backgroundColor: "rgba(255, 255, 255, 0.68)",
            border: `2px solid ${primaryColor}66`,
            boxShadow: `
              0 18px 48px rgba(76, 98, 83, 0.16),
              0 0 30px ${primaryColor}22
            `,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            textAlign: "center",
            maxWidth: isVertical ? "92%" : "960px",
            width: "100%",
            position: "relative",
            overflow: "hidden"
          }}
        >
          {/* Ambient card interior sheen */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "1px",
              background: `linear-gradient(90deg, transparent, ${primaryColor}, transparent)`
            }}
          />

          {/* Eyebrow badge */}
          {displayEyebrow ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "5px 18px",
                borderRadius: "20px",
                backgroundColor: `${accentColor}18`,
                border: `1px solid ${accentColor}66`,
                color: textColor,
                fontSize: `${eyebrowFontSize}px`,
                fontWeight: 800,
                letterSpacing: `${titleLetterSpacing + 1.5}px`,
                textTransform: "uppercase",
                marginBottom: "12px",
                textShadow: "none"
              }}
            >
              {displayEyebrow}
            </div>
          ) : null}

          {/* Main Title with Gold Gradient & Shimmer */}
          <div
            style={{
              fontSize: `${titleFontSize}px`,
              fontWeight: 900,
              lineHeight: 1.22,
              marginBottom: "14px",
              letterSpacing: `${titleLetterSpacing}px`,
              background: `
                linear-gradient(
                  135deg,
                  ${textColor} 15%,
                  #B8CCBF 50%,
                  ${textColor} 65%,
                  #8EAF9D 85%
                )
              `,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: `drop-shadow(0 3px 8px ${primaryColor}44)`,
              position: "relative"
            }}
          >
            {displayTitle}
          </div>

          {/* Subtitle / Faculty Pill */}
          {displaySubtitle ? (
            <div
              style={{
                display: "inline-block",
                padding: "8px 28px",
                borderRadius: "32px",
                backgroundColor: "rgba(168, 196, 181, 0.16)",
                border: `1.5px solid ${primaryColor}88`,
                color: "#789985",
                fontSize: `${subtitleFontSize}px`,
                fontWeight: 700,
                letterSpacing: "0.03em",
                textShadow: "none",
                boxShadow: `0 4px 16px rgba(92, 117, 99, 0.12), inset 0 0 12px ${primaryColor}22`
              }}
            >
              {displaySubtitle}
            </div>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};
