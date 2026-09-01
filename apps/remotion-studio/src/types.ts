export type AspectRatioMode = "9:16" | "16:9" | "1:1";

export type MotionPresetType =
  | "Bounce"
  | "Pop"
  | "Spring"
  | "ZoomPunch"
  | "BackdropBlur"
  | "none";

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
    title?: string;
    eyebrow?: string;
    subtitle?: string;
    personName?: string;
    positionTitle?: string;
    award?: string;
    note?: string;
    theme?: string;
    media?: string[];
    texts?: Record<string, string>;
    motionPreset?: MotionPresetType;
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
