export type AspectRatioMode = "9:16" | "16:9" | "1:1";

export type MotionPresetType =
  | "Bounce"
  | "Pop"
  | "Spring"
  | "ZoomPunch"
  | "BackdropBlur"
  | "none";
export type DoodlePresetId = "academic" | "science" | "psychic" | "engineering" | "celebration" | "vlog" | "none";

/** Reusable, node-agnostic controls for one text layer. Coordinates are canvas percentages. */
export interface TextLayerStyle {
  fontFamily?: "system" | "psu-stidti";
  positionX?: number;
  positionY?: number;
  size?: number;
  color?: string;
}

/** Independent text styling shared by Cover Card and future graphic nodes. */
export interface CoverTextStyles {
  eyebrow?: TextLayerStyle;
  title?: TextLayerStyle;
  subtitle?: TextLayerStyle;
}

/** Reusable, schema-driven positive prompt controls for generative visual nodes. */
export interface CoverPromptParts {
  place?: string;
  time?: string;
  color?: string;
  lighting?: string;
  composition?: string;
  style?: string;
  detail?: string;
}

/** Reusable illustration prompt controls for generated decorative overlays. */
export interface DoodlePromptParts {
  subject?: string;
  treatment?: string;
  placement?: string;
  density?: string;
  color?: string;
  style?: string;
  detail?: string;
  scale?: string;
  safeArea?: string;
}
export interface DoodlePoint {
  x: number;
  y: number;
}
export interface DoodlePath {
  id: string;
  points: DoodlePoint[];
  /** Explicit reusable placements; each placement points to one path point. */
  doodles?: Array<{ id: string; assetId: string; pointIndex: number; offsetX?: number; offsetY?: number }>;
  assetSet?: string[];
  distribution?: "along-path" | "start-end" | "repeated";
  frequency?: number;
  spacing?: number;
  size?: number;
  sizeJitter?: number;
  rotation?: "fixed" | "random" | "follow-path";
  rotationJitter?: number;
  offsetJitter?: number;
  opacity?: number;
  color?: string;
  seed?: number;
}
/** Stable reusable doodle registry record. `key` is the human-safe lookup key. */
export interface DoodleAsset {
  id: string;
  key: string;
  imagePath?: string;
  label?: string;
  kind?: "system" | "custom";
  enabled?: boolean;
}
export interface CoverOutputHistoryEntry {
  runId: string;
  createdAt: string;
  backgroundImage?: string;
  doodleImage?: string;
  personImage?: string;
}

export interface WordTimestamp {
  word: string;
  startMs: number;
  endMs: number;
  highlight?: boolean;
}

export interface SubtitleTrack {
  id?: string;
  text?: string;
  startMs?: number;
  endMs?: number;
  durationMs?: number;
  words?: WordTimestamp[];
  speaker?: string;
}

export interface BrollItemProps {
  id: string;
  assetPath?: string;
  title?: string;
  description?: string;
  startMs?: number;
  offsetMs?: number;
  durationMs?: number;
  audioPolicy?: "mute" | "preserve";
  fit?: "cover" | "contain";
  preset?: MotionPresetType;
  opacity?: number;
  position?: { x?: number; y?: number };
}

/**
 * A single authored shot in a CG sequence. Content and appearance are optional
 * so persisted storyboards created before per-shot overrides remain valid.
 */
export interface CgBlock {
  id: string;
  type: string;
  durationMs: number;
  enabled: boolean;
  mediaOrder?: number[];
  visibleCount?: number;
  motion?: { enter?: string; exit?: string; staggerMs?: number; blurPx?: number };
  content?: {
    text?: string;
    subtitle?: string;
    /** Explicitly controls this shot's copy layer; omitted keeps the preset default. */
    showText?: boolean;
  };
  appearance?: {
    backgroundColor?: string;
    textColor?: string;
    cardScale?: number;
    textPositionX?: number;
    textPositionY?: number;
    fontFamily?: "system" | "psu-stidti";
    fontSizePx?: number;
  };
}

export interface StoryboardItemProps {
  id: string;
  kind: "a_roll" | "cover_card" | "title" | "logo_outro" | "note";
  startMs?: number;
  durationMs: number;
  audioPolicy?: "preserve" | "mute" | "mix";
  presetId?: string;
  params?: {
    sourceKey?: string;
    sourcePath?: string;
    sourceInMs?: number;
    sourceOutMs?: number;
    dialogue?: string;
    subtitles?: WordTimestamp[];
    speaker?: string;
    sourceImage?: string;
    backgroundImage?: string;
    personImage?: string;
    doodleImage?: string;
    doodleEnabled?: boolean;
    doodleOpacity?: number;
    doodleScale?: number;
    doodlePreset?: DoodlePresetId;
    doodlePaths?: DoodlePath[];
    personX?: number;
    personY?: number;
    personScale?: number;
    text?: string;
    title?: string;
    eyebrow?: string;
    subtitle?: string;
    personName?: string;
    positionTitle?: string;
    award?: string;
    note?: string;
    theme?: string;
    media?: string[];
    layoutSequence?: Array<{ layout: "layered-stack" | "scattered-collage" | "text-hold" | "hero-strip" | "portrait-grid" | "image-sweep"; durationMs: number; mediaOrder?: number[]; visibleCount?: number }>;
    cgBlocks?: CgBlock[];
    texts?: Record<string, string>;
    motionPreset?: MotionPresetType;
    textStyles?: CoverTextStyles;
    promptParts?: CoverPromptParts;
    doodlePromptParts?: DoodlePromptParts;
    outputHistory?: CoverOutputHistoryEntry[];
    logoScale?: number;
    glowIntensity?: number;
    videoFit?: "cover" | "contain";
    fadeInMs?: number;
    fadeOutMs?: number;
    presetId?: string;
    lowerThird?: {
      enabled?: boolean;
      presetId?: string;
      name?: string;
      title?: string;
      department?: string;
      offsetMs?: number;
      durationMs?: number;
    };
  };
  broll?: BrollItemProps[];
}

export interface CutlistSegmentProps {
  id: string;
  sourcePath: string;
  sourceInMs: number;
  sourceOutMs: number;
  durationMs: number;
  dialogue?: string;
  subtitles?: WordTimestamp[];
}

export interface AudioTrackProps {
  id?: string;
  path: string;
  startMs?: number;
  durationMs?: number;
  volume?: number;
  duckVolume?: number;
  role?: "dialogue" | "music" | "sfx";
}

export interface StudioThemeProps {
  primaryColor?: string; // Default: Warm Gold #E5A93C
  secondaryColor?: string; // Default: Midnight Navy #0B1220
  accentColor?: string; // Default: Bright Cyan #00E5FF
  textColor?: string; // Default: White #FFFFFF
  fontFamily?: string; // Default: 'Prompt', 'Kanit', 'Noto Sans Thai', sans-serif
  cardBackground?: string; // Default: rgba(11, 18, 32, 0.85)
}

export interface StoryboardAssemblyProps {
  [key: string]: unknown;
  storyboardId?: string;
  title?: string;
  aspectRatio?: AspectRatioMode;
  items?: StoryboardItemProps[];
  cutlist?: CutlistSegmentProps[];
  brollStack?: BrollItemProps[];
  audioTracks?: AudioTrackProps[];
  subtitles?: SubtitleTrack[];
  theme?: StudioThemeProps;
  fps?: number;
  durationInFrames?: number;
}
