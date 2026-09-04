import React from "react";
import { Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveMediaUrl } from "../media-resolver";
import type { DoodlePath, DoodlePresetId } from "../types";

type IconId = "book" | "star" | "pencil" | "tooth" | "atom" | "flower" | "heart" | "ribbon" | "microscope" | "beaker" | "calculator" | "ruler" | "gear" | "lightbulb" | "brain" | "moon" | "spark" | "check" | "arrow" | "camera" | "chat" | "smile" | "leaf" | "crown" | "wave" | "brush" | "trophy" | "palm" | "people" | "orbit" | "drop" | "globe" | "building" | "sun";
/** Must stay in the same 1–25 order as DoodleAssetLibrary.SYSTEM_ENTRIES. */
export const systemIcons: IconId[] = ["star", "heart", "flower", "pencil", "book", "tooth", "atom", "ribbon", "microscope", "beaker", "calculator", "ruler", "gear", "lightbulb", "brain", "moon", "spark", "check", "arrow", "camera", "chat", "smile", "leaf", "crown", "wave"];
const systemSymbols: Record<IconId, string> = { book: "▤", star: "★", pencil: "✎", tooth: "♢", atom: "⚛", flower: "✿", heart: "♥", ribbon: "⚑", microscope: "⌁", beaker: "♧", calculator: "▦", ruler: "⌖", gear: "⚙", lightbulb: "☼", brain: "◉", moon: "☾", spark: "✦", check: "✓", arrow: "➜", camera: "▣", chat: "☁", smile: "☺", leaf: "❧", crown: "♛", wave: "〰", brush: "✎", trophy: "★", palm: "❧", people: "●", orbit: "⊙", drop: "●", globe: "◉", building: "▥", sun: "☼" };
type Accent = { icon: IconId; x: number; y: number; scale: number; rotate: number };
type PathAccent = { point: { x: number; y: number }; pointIndex: number; path: DoodlePath; assetId?: string; offsetX: number; offsetY: number; index: number };
const layouts: Record<Exclude<DoodlePresetId, "none">, Accent[]> = {
  academic: [{ icon: "book", x: 8, y: 16, scale: .54, rotate: -12 }, { icon: "star", x: 18, y: 8, scale: .22, rotate: 8 }, { icon: "pencil", x: 91, y: 15, scale: .48, rotate: 18 }, { icon: "lightbulb", x: 83, y: 8, scale: .22, rotate: 0 }, { icon: "book", x: 9, y: 84, scale: .48, rotate: 12 }, { icon: "check", x: 19, y: 93, scale: .2, rotate: -8 }, { icon: "pencil", x: 91, y: 85, scale: .46, rotate: -24 }, { icon: "star", x: 82, y: 94, scale: .2, rotate: 0 }],
  science: [{ icon: "atom", x: 8, y: 15, scale: .5, rotate: -10 }, { icon: "microscope", x: 91, y: 15, scale: .48, rotate: 8 }, { icon: "tooth", x: 17, y: 8, scale: .28, rotate: 0 }, { icon: "beaker", x: 83, y: 8, scale: .26, rotate: 0 }, { icon: "tooth", x: 9, y: 85, scale: .42, rotate: -8 }, { icon: "atom", x: 91, y: 85, scale: .44, rotate: 12 }, { icon: "spark", x: 18, y: 94, scale: .2, rotate: 0 }, { icon: "spark", x: 82, y: 94, scale: .2, rotate: 0 }],
  psychic: [{ icon: "brain", x: 8, y: 15, scale: .48, rotate: -8 }, { icon: "moon", x: 91, y: 15, scale: .42, rotate: 8 }, { icon: "heart", x: 18, y: 8, scale: .22, rotate: 0 }, { icon: "star", x: 83, y: 8, scale: .2, rotate: 0 }, { icon: "flower", x: 9, y: 85, scale: .46, rotate: -12 }, { icon: "heart", x: 91, y: 85, scale: .34, rotate: 8 }, { icon: "star", x: 18, y: 94, scale: .18, rotate: 0 }, { icon: "moon", x: 82, y: 94, scale: .2, rotate: 0 }],
  engineering: [{ icon: "gear", x: 8, y: 15, scale: .5, rotate: -18 }, { icon: "ruler", x: 91, y: 15, scale: .48, rotate: 24 }, { icon: "calculator", x: 18, y: 8, scale: .25, rotate: 0 }, { icon: "arrow", x: 83, y: 8, scale: .23, rotate: 0 }, { icon: "pencil", x: 9, y: 85, scale: .46, rotate: 12 }, { icon: "gear", x: 91, y: 85, scale: .43, rotate: 22 }, { icon: "ruler", x: 18, y: 94, scale: .2, rotate: 0 }, { icon: "spark", x: 82, y: 94, scale: .18, rotate: 0 }],
  celebration: [{ icon: "trophy", x: 8, y: 15, scale: .5, rotate: -8 }, { icon: "crown", x: 91, y: 15, scale: .44, rotate: 8 }, { icon: "spark", x: 18, y: 8, scale: .26, rotate: 0 }, { icon: "ribbon", x: 83, y: 8, scale: .26, rotate: 0 }, { icon: "ribbon", x: 9, y: 85, scale: .42, rotate: -15 }, { icon: "trophy", x: 91, y: 85, scale: .42, rotate: 12 }, { icon: "star", x: 18, y: 94, scale: .2, rotate: -8 }, { icon: "spark", x: 82, y: 94, scale: .22, rotate: 8 }],
  vlog: [{ icon: "camera", x: 8, y: 15, scale: .46, rotate: -10 }, { icon: "chat", x: 91, y: 15, scale: .44, rotate: 10 }, { icon: "heart", x: 18, y: 8, scale: .2, rotate: 0 }, { icon: "spark", x: 83, y: 8, scale: .2, rotate: 0 }, { icon: "smile", x: 9, y: 85, scale: .42, rotate: -10 }, { icon: "wave", x: 91, y: 85, scale: .44, rotate: 12 }, { icon: "chat", x: 18, y: 94, scale: .2, rotate: 0 }, { icon: "star", x: 82, y: 94, scale: .18, rotate: 0 }],
  tourism: [{ icon: "palm", x: 8, y: 15, scale: .52, rotate: -10 }, { icon: "camera", x: 91, y: 15, scale: .44, rotate: 12 }, { icon: "sun", x: 18, y: 8, scale: .22, rotate: 0 }, { icon: "wave", x: 83, y: 8, scale: .22, rotate: 0 }, { icon: "leaf", x: 9, y: 85, scale: .42, rotate: -15 }, { icon: "wave", x: 91, y: 85, scale: .46, rotate: 8 }, { icon: "spark", x: 18, y: 94, scale: .18, rotate: 0 }, { icon: "camera", x: 82, y: 94, scale: .2, rotate: 0 }],
  creative: [{ icon: "brush", x: 8, y: 15, scale: .52, rotate: -18 }, { icon: "camera", x: 91, y: 15, scale: .42, rotate: 10 }, { icon: "flower", x: 18, y: 8, scale: .22, rotate: 0 }, { icon: "spark", x: 83, y: 8, scale: .24, rotate: 0 }, { icon: "pencil", x: 9, y: 85, scale: .44, rotate: 12 }, { icon: "brush", x: 91, y: 85, scale: .46, rotate: 18 }, { icon: "star", x: 18, y: 94, scale: .18, rotate: 0 }, { icon: "flower", x: 82, y: 94, scale: .2, rotate: 0 }],
  sustainability: [{ icon: "globe", x: 8, y: 15, scale: .5, rotate: -8 }, { icon: "leaf", x: 91, y: 15, scale: .45, rotate: 12 }, { icon: "drop", x: 18, y: 8, scale: .22, rotate: 0 }, { icon: "spark", x: 83, y: 8, scale: .18, rotate: 0 }, { icon: "leaf", x: 9, y: 85, scale: .46, rotate: -18 }, { icon: "globe", x: 91, y: 85, scale: .42, rotate: 8 }, { icon: "drop", x: 18, y: 94, scale: .2, rotate: 0 }, { icon: "spark", x: 82, y: 94, scale: .18, rotate: 0 }],
  campus: [{ icon: "building", x: 8, y: 15, scale: .5, rotate: -6 }, { icon: "people", x: 91, y: 15, scale: .48, rotate: 8 }, { icon: "book", x: 18, y: 8, scale: .22, rotate: 0 }, { icon: "star", x: 83, y: 8, scale: .18, rotate: 0 }, { icon: "people", x: 9, y: 85, scale: .42, rotate: -8 }, { icon: "building", x: 91, y: 85, scale: .44, rotate: 6 }, { icon: "chat", x: 18, y: 94, scale: .18, rotate: 0 }, { icon: "check", x: 82, y: 94, scale: .18, rotate: 0 }]
};

/** Full-frame editorial strokes that give each preset a recognizable broadcast silhouette. */
const backdrops: Record<Exclude<DoodlePresetId, "none">, string[]> = {
  academic: ["M-8 31C9 7 26 4 47-5", "M57 105C76 92 91 76 108 55", "M-5 75C10 86 19 94 35 106"],
  science: ["M-9 27C11 6 39 7 51 25C63 43 49 61 30 62C11 63 4 77-9 94", "M109 13C86 9 69 22 70 40C71 58 91 67 109 61"],
  psychic: ["M-7 35C11 11 34 8 47 21C60 35 52 54 37 59C21 65 11 78-7 102", "M65 104C88 88 96 70 109 48"],
  engineering: ["M-8 23L15 8 32 24 48 8", "M56 105L78 83 90 94 109 75", "M-3 82L17 62 31 76"],
  celebration: ["M-5 36C11 3 35 5 47 22", "M62 105C78 75 99 69 109 42", "M-4 77C16 90 26 103 39 109"],
  vlog: ["M-8 28C9 3 30 8 45 25", "M108 20C90 18 79 29 75 45C71 60 84 70 108 74", "M-4 88C15 73 27 83 40 105"],
  tourism: ["M-8 67C11 50 23 79 42 60C56 46 66 48 76 57", "M42 106C58 81 79 86 109 59", "M-6 27C10 10 25 10 39 19"],
  creative: ["M-7 49C8 5 27 17 40 37C53 57 64 9 91 14C101 15 105 23 110 31", "M-5 91C17 82 23 62 42 78C59 92 70 89 88 105"],
  sustainability: ["M-8 79C9 58 20 67 31 48C42 29 54 12 77 8", "M58 106C67 78 86 71 109 49", "M-4 26C14 17 28 21 39 35"],
  campus: ["M-8 31C10 9 28 8 45 26", "M-6 89L19 66 37 85 57 64", "M65 106C80 84 95 77 109 58"]
};

const thirds = [{ x: 18, y: 18 }, { x: 50, y: 18 }, { x: 82, y: 18 }, { x: 18, y: 50 }, { x: 50, y: 50 }, { x: 82, y: 50 }, { x: 18, y: 82 }, { x: 50, y: 82 }, { x: 82, y: 82 }];
const gridIcons: Record<Exclude<DoodlePresetId, "none">, IconId[]> = {
  academic: ["star", "book", "check", "pencil", "lightbulb", "star", "book", "check", "pencil"],
  science: ["spark", "atom", "beaker", "tooth", "microscope", "spark", "atom", "beaker", "tooth"],
  psychic: ["star", "moon", "heart", "flower", "brain", "star", "heart", "moon", "flower"],
  engineering: ["gear", "ruler", "calculator", "arrow", "gear", "ruler", "calculator", "arrow", "spark"],
  celebration: ["spark", "crown", "star", "ribbon", "trophy", "spark", "star", "ribbon", "crown"],
  vlog: ["heart", "camera", "chat", "smile", "spark", "heart", "camera", "chat", "wave"],
  tourism: ["sun", "palm", "wave", "leaf", "camera", "sun", "wave", "leaf", "palm"],
  creative: ["flower", "brush", "spark", "pencil", "camera", "flower", "brush", "star", "spark"],
  sustainability: ["drop", "globe", "leaf", "spark", "globe", "drop", "leaf", "spark", "globe"],
  campus: ["book", "building", "people", "chat", "star", "building", "people", "book", "check"]
};
// Each preset intentionally suppresses a different top-third anchor, so no two treatments have identical density.
const quietAnchors: Record<Exclude<DoodlePresetId, "none">, number[]> = {
  academic: [0, 6], science: [2, 8], psychic: [1, 7], engineering: [0, 8], celebration: [2, 6], vlog: [1, 8], tourism: [0, 7], creative: [2, 6], sustainability: [1, 8], campus: [0, 7]
};

// A stable hash lets one saved seed produce one repeatable editorial arrangement.
// The golden-angle field prevents the familiar, corner-only "sticker" look.
const seededUnit = (seed: number, index: number) => {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function Icon({ id }: { id: IconId }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (id === "star") return <path {...common} fill="currentColor" d="m32 5 7 18 19 1-15 12 5 19-16-11-16 11 5-19L6 24l19-1z"/>;
  if (id === "book") return <><path {...common} d="M8 10c8-3 14-2 24 3v40c-10-5-16-6-24-3z"/><path {...common} d="M56 10c-8-3-14-2-24 3v40c10-5 16-6 24-3zM17 20h8M17 28h8M39 20h8M39 28h8"/></>;
  if (id === "pencil") return <path {...common} d="m12 48 5-15L43 7a6 6 0 0 1 9 9L26 41zm5-15 10 9M43 7l10 9"/>;
  if (id === "tooth") return <path {...common} fill="currentColor" d="M16 13c7-7 13 0 16 0s9-7 16 0c8 8 1 19-2 28-2 6-4 12-9 12-5 0-4-15-9-15s-4 15-9 15c-5 0-7-6-9-12-3-9-10-20-2-28z"/>;
  if (id === "atom") return <><ellipse {...common} cx="32" cy="32" rx="25" ry="10"/><ellipse {...common} cx="32" cy="32" rx="25" ry="10" transform="rotate(60 32 32)"/><ellipse {...common} cx="32" cy="32" rx="25" ry="10" transform="rotate(120 32 32)"/><circle fill="currentColor" cx="32" cy="32" r="4"/></>;
  if (id === "flower") return <><circle {...common} cx="32" cy="32" r="7"/><path {...common} fill="currentColor" d="M32 23c-13-8-18-17-8-19 8-2 10 7 8 19zm9 3c2-15 9-22 16-14 5 7-4 13-16 14zm0 12c13-2 22 3 17 11-5 7-13 0-17-11zm-18 0c-4 13-12 18-17 10-4-7 5-12 17-10zm0-12C11 24 4 17 11 11c7-5 13 4 12 15z"/></>;
  if (id === "heart") return <path {...common} fill="currentColor" d="M32 53S9 39 9 23c0-12 15-15 23-5 8-10 23-7 23 5 0 16-23 30-23 30z"/>;
  if (id === "ribbon") return <path {...common} d="M18 8h28l-5 15 9 25H14l9-25zM23 23h18M20 48h24"/>;
  if (id === "brush") return <path {...common} d="m13 48 12-12 8 8-12 12H9v-12zm17-16L46 8l10 10-16 16m-15 2 7-7m8-11 7 7"/>;
  if (id === "trophy") return <><path {...common} d="M18 9h28v14c0 10-6 17-14 17s-14-7-14-17zM18 14H8v6c0 7 5 11 12 11m26-17h10v6c0 7-5 11-12 11M32 40v10m-10 5h20"/><path {...common} d="M24 9h16"/></>;
  if (id === "palm") return <><path {...common} d="M33 56c-2-16 1-27 0-40M33 20C22 8 13 8 8 11m25 11C44 9 52 9 57 13M33 28C20 20 12 23 8 28m25 5c12-10 19-7 23-2"/><path {...common} d="M31 56h8"/></>;
  if (id === "people") return <><circle {...common} cx="23" cy="20" r="7"/><circle {...common} cx="43" cy="20" r="7"/><path {...common} d="M10 53c1-12 7-18 13-18s12 6 13 18M30 53c1-12 7-18 13-18s11 6 12 18"/></>;
  if (id === "orbit") return <><circle {...common} cx="32" cy="32" r="5" fill="currentColor"/><ellipse {...common} cx="32" cy="32" rx="25" ry="10"/><ellipse {...common} cx="32" cy="32" rx="25" ry="10" transform="rotate(60 32 32)"/></>;
  if (id === "drop") return <path {...common} fill="currentColor" d="M32 6S14 27 14 39a18 18 0 0 0 36 0C50 27 32 6 32 6z"/>;
  if (id === "globe") return <><circle {...common} cx="32" cy="32" r="24"/><path {...common} d="M8 32h48M32 8c8 7 10 15 10 24s-2 17-10 24c-8-7-10-15-10-24S24 15 32 8"/></>;
  if (id === "building") return <><path {...common} d="M10 55h44M15 55V19l17-10 17 10v36M23 25h5m-5 9h5m8-9h5m-5 9h5M28 55V42h8v13"/></>;
  if (id === "sun") return <><circle {...common} cx="32" cy="32" r="11" fill="currentColor"/><path {...common} d="M32 5v8m0 38v8M5 32h8m38 0h8M13 13l6 6m26 26 6 6m0-38-6 6M19 45l-6 6"/></>;
  return <text x="32" y="45" textAnchor="middle" fontSize="42" fill="currentColor" stroke="none">{systemSymbols[id]}</text>;
}

export function DoodleOverlayPreset({ preset = "academic", opacity = .72, scale = 1, color = "#FFFFFF", seed = 1 }: { preset?: DoodlePresetId; opacity?: number; scale?: number; color?: string; seed?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (preset === "none") return null;
  const globalScale = Math.max(.5, Math.min(1.35, scale));
  const backdropReveal = spring({ frame, fps, config: { damping: 20, stiffness: 110, mass: .8 } });
  const normalizedSeed = Math.abs(Math.trunc(seed)) || 1;
  const anchorShift = Math.floor(seededUnit(normalizedSeed, 1) * thirds.length);
  // Two seeded quiet zones keep intentional negative space in every composition.
  const reservedAnchors = new Set([anchorShift, (anchorShift + 4 + Math.floor(seededUnit(normalizedSeed, 7) * 3)) % thirds.length]);
  // A seed creates 3–5 stationary emitters. Each emitter owns 4–6 marks, giving a
  // deliberately uneven field rather than a uniform wallpaper pattern.
  const depthEmitters = Array.from({ length: 3 + Math.floor(seededUnit(normalizedSeed, 2) * 3) }, (_, emitterIndex) => {
    let anchorIndex = (anchorShift + emitterIndex * 3 + Math.floor(seededUnit(normalizedSeed, emitterIndex + 3) * thirds.length)) % thirds.length;
    while (reservedAnchors.has(anchorIndex)) anchorIndex = (anchorIndex + 1) % thirds.length;
    const anchor = thirds[anchorIndex]!;
    return {
      anchorIndex,
      x: clamp(anchor.x + (seededUnit(normalizedSeed, emitterIndex + 20) - .5) * 16, 9, 91),
      y: clamp(anchor.y + (seededUnit(normalizedSeed, emitterIndex + 30) - .5) * 13, 10, 90),
      density: 4 + Math.floor(seededUnit(normalizedSeed, emitterIndex + 40) * 3),
      // 0 is a soft, distant cluster; 1 is a compact foreground cluster.
      depth: seededUnit(normalizedSeed, emitterIndex + 50)
    };
  });
  const scatterMarks = depthEmitters.flatMap((emitter, emitterIndex) => Array.from({ length: emitter.density }, (_, localIndex) => ({ emitter, emitterIndex, localIndex })));
  return <div aria-label={`${preset} doodle preset`} style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity, color, transform: `scale(${globalScale})`, transformOrigin: "center center", zIndex: 3 }}>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", filter: "drop-shadow(0 4px 12px rgba(1, 9, 24, .36))" }}>
      {backdrops[preset].map((d, index) => <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth={index === 0 ? 1.1 : .65} strokeLinecap="round" strokeLinejoin="round" opacity={.54 - index * .09} pathLength="1" strokeDasharray="1" strokeDashoffset={1 - backdropReveal} />)}
    </svg>
    {scatterMarks.map(({ emitter, emitterIndex, localIndex }, index) => {
      const angle = (localIndex * 2.399963229728653) + seededUnit(normalizedSeed, index + 70) * Math.PI * 2;
      // Near clusters are compact and large; distant clusters spread wider and remain faint.
      const radius = (5 + Math.sqrt(seededUnit(normalizedSeed, index + 90)) * 13) * (1.35 - emitter.depth * .7);
      const x = clamp(emitter.x + Math.cos(angle) * radius * 1.32, 5, 95);
      const y = clamp(emitter.y + Math.sin(angle) * radius, 6, 94);
      // The lower-left is reserved for headline/subtitle; points there are quieter by design.
      const textSafe = x < 43 && y > 55;
      const quiet = quietAnchors[preset].includes(emitter.anchorIndex);
      const gridEntrance = spring({ frame: Math.max(0, frame - 4 - index * .8), fps, config: { damping: 20, stiffness: 140, mass: .5 } });
      const mediumMark = localIndex === 0 && emitter.depth > .45;
      // Micro texture stays deliberately subordinate; only one mark per near cluster may become medium.
      const size = Math.min(6.2, 1.9 + emitter.depth * 2.7 + seededUnit(normalizedSeed, index + 110) * 1.1 + (mediumMark ? 1.15 : 0));
      const rotation = (seededUnit(normalizedSeed, index + 130) - .5) * 70;
      const iconIndex = Math.floor(seededUnit(normalizedSeed, index + 150 + emitterIndex * 13) * gridIcons[preset].length);
      const fieldOpacity = .12 + emitter.depth * .28 + seededUnit(normalizedSeed, index + 170) * .1;
      return <svg key={`scatter-${emitterIndex}-${localIndex}`} viewBox="0 0 64 64" style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: `${textSafe ? size * .68 : size}%`, height: "auto", overflow: "visible", opacity: textSafe ? .11 : quiet ? fieldOpacity * .5 : fieldOpacity, filter: emitter.depth < .28 ? "blur(.35px)" : undefined, transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${interpolate(gridEntrance, [0, 1], [.15, 1])})` }}><Icon id={gridIcons[preset][iconIndex]!}/></svg>;
    })}
    {layouts[preset].map((accent, index) => {
    const entrance = spring({ frame: Math.max(0, frame - index * 2), fps, config: { damping: 18, stiffness: 160, mass: .65 } });
    const floatY = Math.sin((frame + index * 11) / 18) * 1.5;
    const iconScale = interpolate(entrance, [0, 1], [.35, 1]);
    // Reserve the lower-left third for title, subtitle and safe-language captions.
    const textExclusion = accent.x < 42 && accent.y > 55;
    const rotationJitter = (seededUnit(normalizedSeed, index + 150) - .5) * 22;
    const positionJitterX = (seededUnit(normalizedSeed, index + 170) - .5) * 11;
    const positionJitterY = (seededUnit(normalizedSeed, index + 190) - .5) * 8;
    const hero = accent.scale >= .4 && !textExclusion && index === 0;
    const accentWidth = hero ? Math.min(18, Math.max(12, 26 * accent.scale)) : Math.max(3.5, Math.min(9.5, 10.5 * accent.scale));
    return <svg key={`${accent.icon}-${index}`} viewBox="0 0 64 64" style={{ position: "absolute", left: `${clamp(accent.x + positionJitterX, 5, 95)}%`, top: `${clamp(accent.y + positionJitterY, 6, 94)}%`, width: `${accentWidth}%`, height: "auto", overflow: "visible", opacity: textExclusion ? .45 : 1, filter: "drop-shadow(0 4px 10px rgba(1, 9, 24, .48))", transform: `translate(-50%, calc(-50% + ${floatY}px)) rotate(${accent.rotate + rotationJitter}deg) scale(${iconScale})` }}><Icon id={accent.icon}/></svg>;
  })}</div>;
}

export function DoodlePathOverlay({ paths = [], opacity = .72, scale = 1, color = "#FFFFFF" }: { paths?: DoodlePath[]; opacity?: number; scale?: number; color?: string }) {
  const accents: PathAccent[] = paths.flatMap((path): PathAccent[] => {
    const spacing = Math.max(.01, Number(path.spacing ?? .08));
    const frequency = Math.max(0, Math.min(1, Number(path.frequency ?? 1)));
    const selected: number[] = [];
    let distance = 0;
    let nextDistance = 0;
    path.points.forEach((point, pointIndex) => {
      if (pointIndex > 0) {
        const previous = path.points[pointIndex - 1]!;
        distance += Math.hypot(point.x - previous.x, point.y - previous.y);
      }
      if (pointIndex === 0 || distance >= nextDistance) {
        selected.push(pointIndex);
        nextDistance = distance + spacing;
      }
    });
    const candidates = path.distribution === "repeated" ? path.points.map((_, index) => index) : selected;
    const visible = new Set(candidates.filter((pointIndex) => (((Number(path.seed ?? 1) * (pointIndex + 11) * 17) % 100) / 100) <= frequency));
    if (path.distribution === "start-end") {
      visible.clear();
      [path.points.length ? 0 : -1, path.points.length - 1].forEach((pointIndex) => pointIndex >= 0 && visible.add(pointIndex));
    }
    if (path.doodles?.length) {
      return path.doodles
        .filter((doodle) => visible.has(doodle.pointIndex) && (path.assetSet === undefined || path.assetSet.includes(doodle.assetId)))
        .map((doodle, index) => ({ point: path.points[doodle.pointIndex] ?? path.points[0]!, pointIndex: doodle.pointIndex, path, assetId: doodle.assetId, offsetX: doodle.offsetX ?? 0, offsetY: doodle.offsetY ?? 0, index }));
    }
    return selected
      .filter((pointIndex) => visible.has(pointIndex))
      .map((pointIndex, index) => ({ point: path.points[pointIndex]!, pointIndex, path, assetId: undefined, offsetX: 0, offsetY: 0, index }));
  });

  const overlayScale = Math.max(.5, Math.min(1.35, scale));

  return (
    <div aria-label="procedural doodle paths" style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity, color, zIndex: 3 }}>
      {accents.map(({ point, pointIndex, path, assetId, offsetX, offsetY, index }) => {
        const set = path.assetSet?.length ? path.assetSet : ["star"];
        const asset = String(assetId ?? set[index % set.length] ?? "star");
        const systemMatch = asset.match(/^doodle-(\d+)$/);
        const resolvedAsset = systemMatch ? systemIcons[(Number(systemMatch[1]) - 1) % systemIcons.length]! : asset;
        const icon = (systemIcons.includes(resolvedAsset as IconId) ? resolvedAsset : "star") as IconId;
        const random = (((Number(path.seed ?? 1) * (index + 3) * 13) % 100) / 100 - .5);
        const jitter = Number(path.sizeJitter ?? 0) * random;
        const size = Math.max(2, 7 * overlayScale * Math.max(.1, Number(path.size ?? .5) + jitter));
        
        // Continuous tangent calculation for all points including the final point
        const nextPoint = path.points[pointIndex + 1];
        const prevPoint = path.points[pointIndex - 1];
        const tangent =
          path.rotation === "follow-path"
            ? nextPoint
              ? (Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * 180) / Math.PI
              : prevPoint
                ? (Math.atan2(point.y - prevPoint.y, point.x - prevPoint.x) * 180) / Math.PI
                : 0
            : 0;

        const baseRotate = path.rotation === "random" ? random * 360 : tangent;
        const rotate = baseRotate + random * Number(path.rotationJitter ?? 0);
        const jitterOffset = Number(path.offsetJitter ?? 0) * random;
        const style = {
          position: "absolute" as const,
          left: `${(point.x + offsetX + jitterOffset) * 100}%`,
          top: `${(point.y + offsetY - jitterOffset) * 100}%`,
          width: `${size}%`,
          height: "auto",
          overflow: "visible" as const,
          color: path.color ?? color,
          opacity: path.opacity ?? 1,
          transform: `translate(-50%, -50%) rotate(${rotate}deg)`
        };

        return resolvedAsset.includes("/") || /\.(png|webp|jpg|jpeg)$/i.test(resolvedAsset) ? (
          <Img key={`${path.id}-${index}`} src={resolveMediaUrl(resolvedAsset) ?? resolvedAsset} style={{ ...style, objectFit: "contain" }} />
        ) : (
          <svg key={`${path.id}-${index}`} viewBox="0 0 64 64" style={style}>
            <Icon id={icon} />
          </svg>
        );
      })}
    </div>
  );
}
