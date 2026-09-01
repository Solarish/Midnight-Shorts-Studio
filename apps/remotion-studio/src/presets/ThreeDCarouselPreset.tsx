import React, { useMemo } from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveMediaUrl } from "../media-resolver";
import type { AspectRatioMode, StudioThemeProps } from "../types";

export interface ThreeDCarouselPresetProps {
  media?: string[];
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
  id: "ae-3d-carousel-title-v1",
  name: "🎡 3D Photo Carousel Showcase",
  description: "วงแหวนภาพ 3D หรูหรา สไตล์ Midnight Scholar พร้อมการเคลื่อนไหวตามต้นฉบับและข้อความสีทองเรืองแสง",
  category: "title",
  paramsSchema: {
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
      default: true
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
  title,
  subtitle,
  eyebrow,
  texts,
  aspectRatio = "16:9",
  rotationSpeed = 1.0,
  cameraTilt = 8,
  enableReflection = true,
  theme
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Midnight Scholar signature palette
  const primaryColor = theme?.primaryColor ?? "#E5A93C"; // Warm Gold
  const accentColor = theme?.accentColor ?? "#00E5FF"; // Electric Cyan
  const secondaryBg = theme?.secondaryColor ?? "#080E1A"; // Deep Midnight Navy
  const textColor = theme?.textColor ?? "#FFFFFF";
  const fontFamily =
    theme?.fontFamily ??
    "-apple-system, BlinkMacSystemFont, 'Prompt', 'Kanit', 'Noto Sans Thai', sans-serif";

  // Resolve hierarchical typography
  const displayTitle =
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

  // Filter valid media or provide authentic studio placeholders
  const rawList =
    Array.isArray(media) && media.length > 0
      ? media
      : [
          "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ /ภาพนิ่ง/DSC02129.JPG",
          "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ /ภาพนิ่ง/DSC02130.JPG",
          "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ /ภาพนิ่ง/DSC02131.JPG",
          "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ /ภาพนิ่ง/DSC02132.JPG",
          "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ /ภาพนิ่ง/DSC02134.JPG",
          "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ /ภาพนิ่ง/DSC02133.JPG"
        ];

  const photoCount = Math.max(4, rawList.length);

  // Aspect ratio calibrated card dimensions
  const isVertical = aspectRatio === "9:16";
  const isSquare = aspectRatio === "1:1";

  const cardWidth = isVertical ? 300 : isSquare ? 340 : 380;
  const cardHeight = isVertical ? 480 : isSquare ? 420 : 480;

  // Radius calculation: R = (width / 2) / tan(PI / N) + depth buffer
  const angleStep = 360 / photoCount;
  const radius = Math.round(cardWidth / 2 / Math.tan(Math.PI / photoCount) + (isVertical ? 160 : 200));

  // Normalized timeline progress [0, 1]
  const totalFrames = Math.max(1, durationInFrames);
  const progress = frame / totalFrames;

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
  const titleDelay = Math.round(fps * 1.2); // Starts ~1.2s in
  const titleSpring = spring({
    frame: Math.max(0, frame - titleDelay),
    fps,
    config: { damping: 14, stiffness: 80, mass: 0.8 }
  });

  const titleOpacity = interpolate(
    frame,
    [titleDelay, titleDelay + 18, totalFrames - 15, totalFrames - 2],
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
        backgroundColor: "#04070F",
        backgroundImage: `
          radial-gradient(circle at 50% 35%, rgba(20, 48, 92, 0.4) 0%, transparent 65%),
          radial-gradient(circle at 50% 88%, rgba(229, 169, 60, 0.16) 0%, transparent 55%),
          radial-gradient(circle at 50% 50%, #080E1A 0%, #03060C 100%)
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
          transform: `
            translateZ(${cameraZ}px)
            rotateX(${dynamicCameraTilt}deg)
            rotateY(${orbitRotation}deg)
            scale(${introScale})
          `,
          opacity: introAlpha
        }}
      >
        {rawList.map((photoPath, index) => {
          const itemAngle = index * angleStep;
          const resolvedSrc = resolveMediaUrl(photoPath);

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
                transform: `
                  rotateY(${itemAngle}deg)
                  translateZ(${currentRadius}px)
                  scale(${depthScale})
                `,
                opacity: depthAlpha,
                borderRadius: "24px",
                boxShadow: isFront
                  ? `
                    0 28px 65px rgba(0, 0, 0, 0.92),
                    0 0 35px ${isHero ? `${primaryColor}66` : `${primaryColor}33`},
                    0 0 15px ${accentColor}22
                  `
                  : "0 12px 35px rgba(0, 0, 0, 0.95)",
                border: isFront
                  ? `2px solid ${primaryColor}`
                  : "1.5px solid rgba(255, 255, 255, 0.18)",
                backgroundColor: secondaryBg,
                overflow: "hidden",
                filter: depthBlur > 0.2 ? `blur(${depthBlur}px)` : undefined,
                transition: "box-shadow 0.2s ease"
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
                    backgroundColor: "#0B1526",
                    color: primaryColor,
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
                  background: "linear-gradient(to top, rgba(8, 14, 26, 0.8) 0%, transparent 100%)",
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
          justifyContent: isVertical ? "flex-end" : "flex-end",
          paddingBottom: isVertical ? "16%" : isSquare ? "10%" : "7%",
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
            backgroundColor: "rgba(8, 14, 26, 0.88)",
            border: `2px solid ${primaryColor}99`,
            boxShadow: `
              0 24px 65px rgba(0, 0, 0, 0.95),
              0 0 45px ${primaryColor}38,
              0 0 15px ${accentColor}25,
              inset 0 0 28px rgba(229, 169, 60, 0.18)
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
                color: accentColor,
                fontSize: `${eyebrowFontSize}px`,
                fontWeight: 800,
                letterSpacing: `${titleLetterSpacing + 1.5}px`,
                textTransform: "uppercase",
                marginBottom: "12px",
                textShadow: `0 0 16px ${accentColor}aa`
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
                  #FFFFFF 15%,
                  ${primaryColor} 50%,
                  #FFF4D4 65%,
                  ${primaryColor} 85%
                )
              `,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: `drop-shadow(0 4px 18px rgba(0, 0, 0, 0.95)) drop-shadow(0 0 24px ${primaryColor}55)`,
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
                backgroundColor: "rgba(229, 169, 60, 0.14)",
                border: `1.5px solid ${primaryColor}88`,
                color: "#FFE8B8",
                fontSize: `${subtitleFontSize}px`,
                fontWeight: 700,
                letterSpacing: "0.03em",
                textShadow: "0 2px 10px rgba(0,0,0,0.9)",
                boxShadow: `0 4px 20px rgba(0,0,0,0.5), inset 0 0 12px ${primaryColor}22`
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
