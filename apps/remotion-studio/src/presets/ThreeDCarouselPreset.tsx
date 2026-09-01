import React, { useState } from "react";
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
  description: "วงแหวนภาพ 3D หมุนวนพร้อมเปิดตัวข้อความสีทอง",
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

  const primaryColor = theme?.primaryColor ?? "#E5A93C"; // Warm Gold
  const accentColor = theme?.accentColor ?? "#00E5FF"; // Bright Cyan
  const textColor = theme?.textColor ?? "#FFFFFF";
  const fontFamily =
    theme?.fontFamily ??
    "-apple-system, BlinkMacSystemFont, 'Prompt', 'Kanit', 'Noto Sans Thai', sans-serif";

  const displayTitle = title || texts?.["Text 3"] || texts?.["Text 1"] || texts?.title || "อาจารย์ตัวอย่างดีเด่น ประจำปี ๒๕๖๙";
  const displaySubtitle = subtitle || texts?.["Text 4"] || texts?.["Text 2"] || texts?.subtitle || "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์";
  const displayEyebrow = eyebrow || texts?.["Text 5"] || texts?.eyebrow || "PSU BROADCAST SPECIAL REPORT";

  // Filter valid media or provide elegant placeholders if empty
  const rawList = Array.isArray(media) && media.length > 0
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
  const cardWidth = aspectRatio === "9:16" ? 260 : aspectRatio === "1:1" ? 320 : 380;
  const cardHeight = aspectRatio === "9:16" ? 390 : aspectRatio === "1:1" ? 320 : 250;

  // Radius calculation: R = (width / 2) / tan(PI / N) + padding
  const angleStep = 360 / photoCount;
  const radius = Math.round((cardWidth / 2) / Math.tan(Math.PI / photoCount) + 120);

  // Progressive timeline progression
  const progress = frame / Math.max(1, durationInFrames);

  // 1. Carousel Continuous Orbit Rotation
  const baseRotation = (frame / fps) * 22 * rotationSpeed;
  const currentOrbitAngle = -baseRotation;

  // 2. Camera Motion: Slight sweep and elevation
  const cameraZ = interpolate(
    progress,
    [0, 0.4, 0.8, 1.0],
    [-radius * 0.4, -radius * 0.1, radius * 0.2, radius * 0.35],
    { extrapolateRight: "clamp" }
  );

  const dynamicTilt = interpolate(
    progress,
    [0, 0.5, 1.0],
    [cameraTilt, cameraTilt * 0.6, cameraTilt * 0.2]
  );

  // 3. Title Card Transition Emergence (Fade & Spring in starting around frame 45)
  const titleSpring = spring({
    frame: Math.max(0, frame - 40),
    fps,
    config: { damping: 14, stiffness: 90, mass: 0.8 }
  });

  const titleOpacity = interpolate(frame, [35, 55], [0, 1], { extrapolateRight: "clamp" });
  const titleScale = interpolate(titleSpring, [0, 1], [0.85, 1.0]);
  const titleY = interpolate(titleSpring, [0, 1], [40, 0]);

  // Title sizing according to aspect ratio
  const titleFontSize = aspectRatio === "9:16" ? 44 : aspectRatio === "1:1" ? 46 : 56;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#050811",
        backgroundImage: `
          radial-gradient(circle at 50% 35%, rgba(37, 99, 235, 0.22) 0%, transparent 60%),
          radial-gradient(circle at 50% 90%, rgba(229, 169, 60, 0.12) 0%, transparent 50%),
          radial-gradient(circle at 50% 50%, #0B1220 0%, #03060D 100%)
        `,
        overflow: "hidden",
        fontFamily,
        perspective: "1400px",
        perspectiveOrigin: "50% 45%"
      }}
    >
      {/* 3D Revolving Cylinder Container */}
      <div
        style={{
          position: "absolute",
          top: "42%",
          left: "50%",
          width: 0,
          height: 0,
          transformStyle: "preserve-3d",
          transform: `
            translateZ(${cameraZ}px)
            rotateX(${dynamicTilt}deg)
            rotateY(${currentOrbitAngle}deg)
          `
        }}
      >
        {rawList.map((photoPath, index) => {
          const itemAngle = index * angleStep;
          const resolvedSrc = resolveMediaUrl(photoPath);

          // Calculate distance to front for dynamic brightness & blur
          const relativeAngle = ((itemAngle + currentOrbitAngle) % 360 + 360) % 360;
          const isFrontHalf = relativeAngle > 270 || relativeAngle < 90;
          const depthAlpha = isFrontHalf ? 1 : 0.45;
          const depthScale = isFrontHalf ? 1.05 : 0.92;

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
                  translateZ(${radius}px)
                  scale(${depthScale})
                `,
                opacity: depthAlpha,
                borderRadius: "16px",
                boxShadow: isFrontHalf
                  ? `0 20px 50px rgba(0, 0, 0, 0.85), 0 0 30px ${primaryColor}33`
                  : "0 10px 30px rgba(0, 0, 0, 0.9)",
                border: isFrontHalf
                  ? `2px solid ${primaryColor}aa`
                  : "1px solid rgba(255, 255, 255, 0.15)",
                backgroundColor: "#0B1220",
                overflow: "hidden"
              }}
            >
              {resolvedSrc ? (
                <Img
                  src={resolvedSrc}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover"
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: primaryColor,
                    fontSize: "14px",
                    fontWeight: 700
                  }}
                >
                  Photo #{index + 1}
                </div>
              )}

              {/* Glass Sheen Overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: isFrontHalf
                    ? "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%, rgba(0,0,0,0.4) 100%)"
                    : "rgba(0,0,0,0.5)",
                  pointerEvents: "none"
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Floor Grid Reflection Plane */}
      {enableReflection && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "40%",
            background: "linear-gradient(180deg, transparent 0%, rgba(5, 8, 17, 0.85) 60%, #03060D 100%)",
            borderTop: `1px solid ${primaryColor}22`,
            pointerEvents: "none"
          }}
        />
      )}

      {/* Floating Ambient Glow Spotlight */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          width: "600px",
          height: "400px",
          transform: "translate(-50%, -50%)",
          background: `radial-gradient(circle, ${primaryColor}26 0%, ${accentColor}11 45%, transparent 70%)`,
          filter: "blur(60px)",
          pointerEvents: "none"
        }}
      />

      {/* Overlay Typography Plate (Phase 2 & 3) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: aspectRatio === "9:16" ? "flex-end" : "flex-end",
          paddingBottom: aspectRatio === "9:16" ? "14%" : "7%",
          paddingLeft: "6%",
          paddingRight: "6%",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px) scale(${titleScale})`,
          transformOrigin: "center bottom",
          pointerEvents: "none",
          zIndex: 50
        }}
      >
        <div
          style={{
            padding: aspectRatio === "9:16" ? "28px 24px" : "32px 48px",
            borderRadius: "24px",
            backgroundColor: "rgba(11, 18, 32, 0.88)",
            border: `2px solid ${primaryColor}88`,
            boxShadow: `
              0 24px 60px rgba(0, 0, 0, 0.9),
              0 0 40px ${primaryColor}33,
              inset 0 0 24px rgba(229, 169, 60, 0.15)
            `,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            textAlign: "center",
            maxWidth: "920px",
            width: "100%"
          }}
        >
          {/* Eyebrow badge */}
          {displayEyebrow ? (
            <div
              style={{
                color: accentColor,
                fontSize: aspectRatio === "9:16" ? "13px" : "15px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: "8px",
                textShadow: `0 0 16px ${accentColor}88`
              }}
            >
              ✦ {displayEyebrow} ✦
            </div>
          ) : null}

          {/* Main Title */}
          <div
            style={{
              color: textColor,
              fontSize: `${titleFontSize}px`,
              fontWeight: 900,
              lineHeight: 1.25,
              marginBottom: "12px",
              letterSpacing: "0.02em",
              textShadow: `
                0 4px 24px rgba(0, 0, 0, 0.9),
                0 0 32px ${primaryColor}66
              `
            }}
          >
            {displayTitle}
          </div>

          {/* Subtitle */}
          {displaySubtitle ? (
            <div
              style={{
                display: "inline-block",
                padding: "6px 24px",
                borderRadius: "30px",
                backgroundColor: `${primaryColor}22`,
                border: `1px solid ${primaryColor}77`,
                color: primaryColor,
                fontSize: aspectRatio === "9:16" ? "15px" : "18px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textShadow: "0 2px 8px rgba(0,0,0,0.8)"
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
