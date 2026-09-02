import React from "react";
import { Img } from "remotion";
import { resolveMediaUrl } from "../media-resolver";
import type { DoodlePath, DoodlePresetId } from "../types";

type IconId = "book" | "star" | "pencil" | "tooth" | "atom" | "flower" | "heart" | "ribbon" | "microscope" | "beaker" | "calculator" | "ruler" | "gear" | "lightbulb" | "brain" | "moon" | "spark" | "check" | "arrow" | "camera" | "chat" | "smile" | "leaf" | "crown" | "wave";
/** Must stay in the same 1–25 order as DoodleAssetLibrary.SYSTEM_ENTRIES. */
export const systemIcons: IconId[] = ["star", "heart", "flower", "pencil", "book", "tooth", "atom", "ribbon", "microscope", "beaker", "calculator", "ruler", "gear", "lightbulb", "brain", "moon", "spark", "check", "arrow", "camera", "chat", "smile", "leaf", "crown", "wave"];
const systemSymbols: Record<IconId, string> = { book: "▤", star: "★", pencil: "✎", tooth: "♢", atom: "⚛", flower: "✿", heart: "♥", ribbon: "⚑", microscope: "⌁", beaker: "♧", calculator: "▦", ruler: "⌖", gear: "⚙", lightbulb: "☼", brain: "◉", moon: "☾", spark: "✦", check: "✓", arrow: "➜", camera: "▣", chat: "☁", smile: "☺", leaf: "❧", crown: "♛", wave: "〰" };
type Accent = { icon: IconId; x: number; y: number; scale: number; rotate: number };
type PathAccent = { point: { x: number; y: number }; pointIndex: number; path: DoodlePath; assetId?: string; offsetX: number; offsetY: number; index: number };
const layouts: Record<Exclude<DoodlePresetId, "none">, Accent[]> = {
  academic: [{ icon: "book", x: 6, y: 12, scale: .55, rotate: -12 }, { icon: "star", x: 18, y: 8, scale: .28, rotate: 8 }, { icon: "pencil", x: 88, y: 13, scale: .45, rotate: 18 }, { icon: "star", x: 96, y: 27, scale: .22, rotate: 0 }, { icon: "book", x: 8, y: 86, scale: .5, rotate: 12 }, { icon: "star", x: 22, y: 93, scale: .25, rotate: 0 }, { icon: "pencil", x: 86, y: 87, scale: .48, rotate: -24 }, { icon: "star", x: 96, y: 74, scale: .3, rotate: 0 }, { icon: "star", x: 52, y: 7, scale: .2, rotate: 0 }, { icon: "star", x: 50, y: 94, scale: .18, rotate: 0 }],
  science: [{ icon: "atom", x: 7, y: 13, scale: .45, rotate: -10 }, { icon: "tooth", x: 92, y: 14, scale: .38, rotate: 8 }, { icon: "star", x: 16, y: 8, scale: .22, rotate: 0 }, { icon: "star", x: 96, y: 30, scale: .2, rotate: 0 }, { icon: "tooth", x: 8, y: 84, scale: .34, rotate: -8 }, { icon: "atom", x: 92, y: 85, scale: .38, rotate: 12 }, { icon: "star", x: 18, y: 94, scale: .2, rotate: 0 }, { icon: "star", x: 82, y: 94, scale: .24, rotate: 0 }],
  psychic: [{ icon: "star", x: 8, y: 14, scale: .42, rotate: 0 }, { icon: "heart", x: 92, y: 14, scale: .3, rotate: 10 }, { icon: "flower", x: 8, y: 84, scale: .38, rotate: -12 }, { icon: "star", x: 92, y: 84, scale: .35, rotate: 8 }, { icon: "star", x: 17, y: 8, scale: .18, rotate: 0 }, { icon: "heart", x: 83, y: 94, scale: .2, rotate: 0 }],
  engineering: [{ icon: "pencil", x: 8, y: 14, scale: .42, rotate: -18 }, { icon: "atom", x: 91, y: 14, scale: .36, rotate: 10 }, { icon: "book", x: 8, y: 85, scale: .42, rotate: 12 }, { icon: "pencil", x: 91, y: 85, scale: .36, rotate: 22 }, { icon: "star", x: 17, y: 8, scale: .18, rotate: 0 }, { icon: "star", x: 83, y: 94, scale: .2, rotate: 0 }],
  celebration: [{ icon: "flower", x: 8, y: 14, scale: .42, rotate: -12 }, { icon: "heart", x: 92, y: 14, scale: .34, rotate: 10 }, { icon: "star", x: 18, y: 8, scale: .22, rotate: 0 }, { icon: "ribbon", x: 8, y: 84, scale: .4, rotate: -15 }, { icon: "flower", x: 92, y: 84, scale: .36, rotate: 12 }, { icon: "heart", x: 18, y: 94, scale: .25, rotate: -8 }, { icon: "star", x: 82, y: 94, scale: .25, rotate: 8 }],
  vlog: [{ icon: "heart", x: 7, y: 15, scale: .32, rotate: -10 }, { icon: "star", x: 16, y: 8, scale: .2, rotate: 0 }, { icon: "flower", x: 92, y: 13, scale: .36, rotate: 10 }, { icon: "pencil", x: 96, y: 30, scale: .32, rotate: 20 }, { icon: "book", x: 7, y: 84, scale: .4, rotate: -10 }, { icon: "heart", x: 18, y: 94, scale: .24, rotate: 5 }, { icon: "ribbon", x: 92, y: 84, scale: .38, rotate: 12 }, { icon: "star", x: 82, y: 94, scale: .22, rotate: -5 }, { icon: "flower", x: 50, y: 8, scale: .22, rotate: 0 }, { icon: "star", x: 50, y: 94, scale: .18, rotate: 0 }]
};

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
  return <text x="32" y="45" textAnchor="middle" fontSize="42" fill="currentColor" stroke="none">{systemSymbols[id]}</text>;
}

export function DoodleOverlayPreset({ preset = "academic", opacity = .72, scale = 1, color = "#FFFFFF" }: { preset?: DoodlePresetId; opacity?: number; scale?: number; color?: string }) {
  if (preset === "none") return null;
  return <div aria-label={`${preset} doodle preset`} style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity, color, transform: `scale(${Math.max(.5, Math.min(1.35, scale))})`, transformOrigin: "center center", zIndex: 3 }}>{layouts[preset].map((accent, index) => <svg key={`${accent.icon}-${index}`} viewBox="0 0 64 64" style={{ position: "absolute", left: `${accent.x}%`, top: `${accent.y}%`, width: `${Math.max(3, 8 * accent.scale)}%`, height: "auto", overflow: "visible", transform: `translate(-50%, -50%) rotate(${accent.rotate}deg)` }}><Icon id={accent.icon}/></svg>)}</div>;
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
