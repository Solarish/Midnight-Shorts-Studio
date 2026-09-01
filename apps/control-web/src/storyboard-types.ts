export type StoryboardKind = "title" | "a_roll" | "cover_card" | "logo_outro" | "note";
export type AudioPolicy = "preserve" | "mute" | "mix";

export type StoryboardBroll = {
  id: string;
  asset: { path: string; assetId?: string; sizeBytes?: number; mtime?: string };
  offsetMs: number;
  durationMs: number;
  audioPolicy: "mute";
  fit?: "cover" | "contain";
  note?: string;
};

export type StoryboardItem = {
  id: string;
  kind: StoryboardKind;
  durationMs: number;
  audioPolicy: AudioPolicy;
  presetId?: string;
  sourceRowNumbers?: number[];
  params: Record<string, unknown>;
  broll?: StoryboardBroll[];
};

export type Storyboard = {
  schemaVersion: 2;
  storyboardId: string;
  name: string;
  revision: number;
  profile: { width: number; height: number; frameRate: 25 };
  sourceImport: { importId: string; docxPath: string; sourceDigest: string; importedAt: string };
  items: StoryboardItem[];
  status: "draft" | "approved" | "stale";
  approvedVersion?: number;
  approvedRevision?: number;
  storyboardDigest?: string;
};

export type StoryboardDiagnostic = { code: string; severity: "blocker" | "warning" | "info"; message: string; itemId?: string; rowNumber?: number; path?: string };
export type StoryboardImport = {
  schemaVersion: 2;
  importId: string;
  docxPath: string;
  sourceDigest: string;
  importedAt: string;
  rawRows: Array<{ rowIndex: number; rowNumber: number; cells: string[]; picture: string; sound: string }>;
  proposals: Array<{ proposalId: string; rowNumber: number; confidence: number; reasons: string[]; item: StoryboardItem }>;
  diagnostics: StoryboardDiagnostic[];
};

export type StoryboardCompilation = {
  schemaVersion: 2;
  storyboardId: string;
  storyboardVersion: number;
  storyboardDigest: string;
  graphDigest: string;
  compiledAt: string;
  executable: false;
  graph: {
    graphId: string;
    name: string;
    nodes: Array<{ id: string; type: string; position?: { x: number; y: number }; config: Record<string, unknown> }>;
    edges: Array<{ id: string; from: { nodeId: string; port: string }; to: { nodeId: string; port: string } }>;
    order: string[];
  };
  timeline: { durationMs: number; items: Array<{ itemId: string; kind: StoryboardKind | "b_roll"; startMs: number; durationMs: number; audioPolicy: AudioPolicy; track: number; parentItemId?: string }> };
  provenance: Record<string, string>;
  diagnostics: StoryboardDiagnostic[];
};
