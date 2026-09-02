import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveMediaUrl } from "../media-resolver";
import type { ThreeDCarouselPresetProps } from "./ThreeDCarouselPreset";
import type { CgBlock } from "../types";

type CardSlot = { x: number; y: number; scale: number; rotate?: number; z?: number };
type RuntimeBlock = CgBlock & { type: "photo-stack" | "photo-collage" | "text-hold" | "hero-strip" | "portrait-row" | "image-sweep" | "outro" | "fade-to-black" };

const DEFAULT_BLOCKS: RuntimeBlock[] = [
  { id: "stack", type: "photo-stack", durationMs: 5000, enabled: true, mediaOrder: [0, 2, 1, 4], visibleCount: 4 },
  { id: "collage", type: "photo-collage", durationMs: 3800, enabled: true, mediaOrder: [3, 0, 5, 1], visibleCount: 4 },
  { id: "message", type: "text-hold", durationMs: 4500, enabled: true },
  { id: "hero", type: "hero-strip", durationMs: 3000, enabled: true, mediaOrder: [1, 4, 0, 3], visibleCount: 4 },
  { id: "portraits", type: "portrait-row", durationMs: 2500, enabled: true, mediaOrder: [2, 5, 1], visibleCount: 3 },
  { id: "sweep", type: "image-sweep", durationMs: 3500, enabled: true, mediaOrder: [4, 0, 3], visibleCount: 3 },
  { id: "outro", type: "outro", durationMs: 2000, enabled: true },
  { id: "fade", type: "fade-to-black", durationMs: 1000, enabled: true }
];

const supportedTypes = new Set<RuntimeBlock["type"]>(["photo-stack", "photo-collage", "text-hold", "hero-strip", "portrait-row", "image-sweep", "outro", "fade-to-black"]);
const legacyType = (layout: string, isFinalShortShot: boolean): RuntimeBlock["type"] => {
  if (isFinalShortShot && layout === "image-sweep") return "fade-to-black";
  return ({ "layered-stack": "photo-stack", "scattered-collage": "photo-collage", "portrait-grid": "portrait-row", "text-hold": "text-hold", "hero-strip": "hero-strip", "image-sweep": "image-sweep" }[layout] ?? "photo-stack") as RuntimeBlock["type"];
};

function normalizeBlocks(cgBlocks: ThreeDCarouselPresetProps["cgBlocks"], layoutSequence: ThreeDCarouselPresetProps["layoutSequence"]): RuntimeBlock[] {
  if (Array.isArray(cgBlocks) && cgBlocks.length) return cgBlocks.filter((block): block is RuntimeBlock => block.enabled && supportedTypes.has(block.type as RuntimeBlock["type"]) && block.durationMs > 0);
  if (Array.isArray(layoutSequence) && layoutSequence.length) return layoutSequence.map((shot, index) => {
    const normalized = typeof shot === "string" ? { layout: shot, durationMs: 1000 } : shot;
    return { id: `legacy_${index + 1}`, type: legacyType(normalized.layout, index === layoutSequence.length - 1 && normalized.durationMs <= 1200), durationMs: normalized.durationMs, enabled: true, mediaOrder: normalized.mediaOrder, visibleCount: normalized.visibleCount };
  });
  return DEFAULT_BLOCKS;
}

function blockFor(ms: number, blocks: RuntimeBlock[]) {
  let start = 0;
  for (const block of blocks) {
    const duration = Math.max(40, block.durationMs);
    if (ms < start + duration) return { block, local: ms - start, duration };
    start += duration;
  }
  const block = blocks.at(-1) ?? DEFAULT_BLOCKS.at(-1)!;
  return { block, local: Math.max(0, ms - start + block.durationMs), duration: block.durationMs };
}

function Card({ src, index, slot, local, duration, mode, motion, cardScale = 1 }: { src: string; index: number; slot: CardSlot; local: number; duration: number; mode: string; motion?: CgBlock["motion"]; cardScale?: number }) {
  const { fps } = useVideoConfig();
  const staggerMs = motion?.staggerMs ?? 115;
  const delay = index * staggerMs;
  const localFrame = Math.max(0, Math.round(((local - delay) / 1000) * fps));
  const enter = motion?.enter === "none" ? 1 : spring({ frame: localFrame, fps, config: { damping: 18, stiffness: 110, mass: 0.72 } });
  const exitStart = Math.max(0, duration - 520 + index * 65);
  const exit = motion?.exit === "none" ? 1 : interpolate(local, [exitStart, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const direction = mode === "sweep" ? (index % 2 === 0 ? -1 : 1) : index % 2 === 0 ? 1 : -1;
  const travel = mode === "sweep" ? 1320 : mode === "collage" ? 420 : 220;
  const offset = interpolate(enter * exit, [0, 1], [travel * direction, 0]);
  const blur = enter < 0.93 || exit < 0.93 ? (motion?.blurPx ?? (mode === "sweep" ? 10 : 3)) : 0;
  const resolvedSrc = resolveMediaUrl(src);
  if (!resolvedSrc) return null;
  return <div style={{ position: "absolute", left: "50%", top: "50%", width: 440, height: 590, overflow: "hidden", borderRadius: 28, zIndex: slot.z ?? index, opacity: enter * exit, boxShadow: "0 24px 52px rgba(42,60,50,.18)", filter: `blur(${blur}px)`, transform: `translate(-50%, -50%) translateX(${slot.x + offset}px) translateY(${slot.y}px) rotate(${slot.rotate ?? 0}deg) scale(${slot.scale * cardScale})` }}><Img src={resolvedSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>;
}

export const ReferenceShowcasePreset: React.FC<ThreeDCarouselPresetProps> = ({ media = [], text, title, subtitle, layoutSequence, cgBlocks, aspectRatio = "16:9", theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const blocks = normalizeBlocks(cgBlocks, layoutSequence);
  const { block, local, duration } = blockFor(ms, blocks);
  const defaultTextColor = theme?.primaryColor ?? "#A6BEAF";
  // Text is the carousel's sole global message fallback. Title stays independent
  // for non-carousel title rendering and is never synchronized with Text.
  const globalText = text || "Always go\nfor your goals!";
  const backgroundColor = block.appearance?.backgroundColor || "#fbfbf8";
  const textColor = block.appearance?.textColor || defaultTextColor;
  const cardScale = block.appearance?.cardScale ?? 1;
  const textPositionX = Math.max(-100, Math.min(100, block.appearance?.textPositionX ?? 0));
  const textPositionY = Math.max(-100, Math.min(100, block.appearance?.textPositionY ?? 0));
  const defaultFontSize = block.type === "outro" ? 42 : block.type === "photo-stack" || block.type === "photo-collage" ? 108 : 70;
  const fontSizePx = Math.max(16, Math.min(220, block.appearance?.fontSizePx ?? defaultFontSize));
  const fontFamily = block.appearance?.fontFamily === "psu-stidti" ? "PSU Stidti" : theme?.fontFamily ?? "Arial, 'Noto Sans Thai', sans-serif";
  const blockSubtitle = block.content?.subtitle || subtitle;
  const sourceOrder = block.mediaOrder?.length ? block.mediaOrder : media.map((_, index) => index);
  const cards = sourceOrder.slice(0, block.visibleCount ?? sourceOrder.length).map((sourceIndex) => media[sourceIndex % Math.max(1, media.length)]).filter((value): value is string => Boolean(value));
  const stack: CardSlot[] = [{ x: -330, y: -36, scale: .76, rotate: -4, z: 1 }, { x: -98, y: 45, scale: 1.04, rotate: 2, z: 4 }, { x: 165, y: -22, scale: .9, rotate: -2, z: 3 }, { x: 385, y: 34, scale: .68, rotate: 5, z: 2 }];
  const collage: CardSlot[] = [{ x: -520, y: -108, scale: .72, rotate: -7 }, { x: -165, y: 130, scale: .92, rotate: 3 }, { x: 150, y: -48, scale: 1.03, rotate: -2 }, { x: 510, y: 96, scale: .7, rotate: 7 }];
  const strip: CardSlot[] = [{ x: -590, y: 16, scale: .68 }, { x: -255, y: 0, scale: .84 }, { x: 105, y: -8, scale: 1.34, z: 5 }, { x: 550, y: 18, scale: .66 }];
  const grid: CardSlot[] = [{ x: -350, y: 0, scale: .84 }, { x: 0, y: 0, scale: 1.04, z: 4 }, { x: 350, y: 0, scale: .84 }];
  const isText = block.type === "text-hold" || block.type === "outro";
  // Preserve the reference layout for legacy blocks that omit showText. An
  // explicit false removes only this block's copy layers, leaving its media
  // and timing intact.
  const defaultShowText = block.type === "photo-stack" || block.type === "photo-collage" || isText || Boolean(block.content?.text);
  const showText = block.content?.showText ?? defaultShowText;
  const showSubtitle = showText && Boolean(blockSubtitle) && (block.type === "text-hold" || Boolean(block.content?.subtitle));
  const referenceCopy = block.type === "photo-stack" ? "CAROUSEL" : block.type === "photo-collage" ? "EFFECT" : block.type === "outro" ? "thank you" : globalText;
  const label = block.content?.text || referenceCopy;
  const textOpacity = interpolate(local, [0, 300, Math.max(310, duration - 320), duration], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const textScale = spring({ frame: Math.round((local / 1000) * fps), fps, config: { damping: 20, stiffness: 90 } });
  const slots = block.type === "photo-stack" || block.type === "photo-collage" ? stack : block.type === "hero-strip" ? strip : block.type === "portrait-row" ? grid : collage;
  const mode = block.type === "image-sweep" ? "sweep" : block.type === "photo-collage" ? "collage" : "stack";
  const showCards = !isText && block.type !== "fade-to-black";
  return <AbsoluteFill style={{ background: backgroundColor, overflow: "hidden", fontFamily }}>
    {block.appearance?.fontFamily === "psu-stidti" && <style>{`@font-face{font-family:'PSU Stidti';src:url('${staticFile("fonts/psu-stidti-regular.woff2")}') format('woff2');font-weight:400}@font-face{font-family:'PSU Stidti';src:url('${staticFile("fonts/psu-stidti-bold.woff2")}') format('woff2');font-weight:800}`}</style>}
    {showCards && cards.map((src, index) => <Card key={`${block.id}-${src}-${index}`} src={src} index={index} slot={slots[index] ?? stack[0]!} local={local} duration={duration} mode={mode} motion={block.motion} cardScale={cardScale} />)}
    {showText ? <div style={{ position: "absolute", inset: 0, zIndex: block.type === "photo-collage" ? 20 : 10, display: "flex", alignItems: isText ? "center" : block.type === "photo-collage" ? "center" : "flex-start", justifyContent: block.type === "photo-stack" ? "flex-start" : "center", padding: block.type === "photo-stack" ? "150px 120px" : 0, pointerEvents: "none", opacity: textOpacity, transform: `translate(${textPositionX}%, ${textPositionY}%) scale(${interpolate(textScale, [0, 1], [.92, 1])})`, fontFamily }}><div style={{ whiteSpace: "pre-line", color: textColor, fontSize: fontSizePx, fontWeight: 800, lineHeight: 1.02, letterSpacing: block.type === "photo-stack" || block.type === "photo-collage" ? -3 : -2, textAlign: "center" }}>{label}</div></div> : null}
    {showSubtitle ? <div style={{ position: "absolute", top: `calc(63% + ${textPositionY}%)`, left: 0, width: "100%", textAlign: "center", color: textColor, fontSize: Math.max(12, Math.round(fontSizePx * 0.26)), opacity: textOpacity, transform: `translateX(${textPositionX}%)`, fontFamily }}>{blockSubtitle}</div> : null}
    <AbsoluteFill style={{ background: "#000", opacity: block.type === "fade-to-black" ? interpolate(local, [0, duration], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0, pointerEvents: "none" }} />
  </AbsoluteFill>;
};
