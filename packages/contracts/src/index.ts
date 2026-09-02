import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020Import, { type ErrorObject } from "ajv/dist/2020.js";

export const WORKFLOW_SCHEMA_VERSION = 1 as const;
export const RUN_EVENT_SCHEMA_VERSION = 1 as const;
export const RECIPE_MANIFEST_VERSION = 1 as const;
export const GRAPH_SCHEMA_VERSION = 1 as const;
export const GRAPH_FRAME_RATE = 25 as const;
export const GRAPH_MAX_DURATION_FRAMES = 30 * 60 * GRAPH_FRAME_RATE;
export const GRAPH_MAX_SCENES = 50 as const;

export const stepTypes = [
  "asset.select",
  "asset.multi_select",
  "asset.batch_folder",
  "image.removeBackground",
  "image.resize",
  "image.luma_to_alpha",
  "graphics.cover_title",
  "template.payload",
  "llm.chat",
  "comfyui.workflow",
  "remotion.render",
  "effect.3d_carousel",
  "media.probe",
  "timeline.scene",
  "timeline.transition",
  "timeline.overlay",
  "timeline.graphic_overlay",
  "timeline.graphic_mogrt",
  "timeline.dynamic_link",
  "timeline.compose",
  "audio.asset",
  "audio.jaitts",
  "audio.mix",
  "media.audio_normalize",
  "premiere.build",
  "premiere.export"
  ,"storyboard.docx_import"
  ,"media.catalog"
  ,"edit.cutlist"
  ,"editor.broll_match"
  ,"review.approval"
  ,"review.media_approval"
  ,"media.conform"
  ,"timeline.broll_stack"
  ,"audio.dialogue_mix"
  ,"audio.loudness_qc"
  ,"graphics.template_card"
  ,"qc.timeline"
  ,"audio.smart_ducking"
  ,"video.color_grade"
  ,"video.split_screen_2box"
  ,"layout.side_by_side"
  ,"video.smart_reframe"
  ,"graphics.news_strap"
  ,"graphics.lower_third"
  ,"graphics.ticker_crawl"
  ,"graphics.countdown_timer"
  ,"audio.beat_detect"
  ,"effect.zoom_callout"
  ,"vision.slide_detect"
  ,"ae.channel_id_bumper"
  ,"ae.program_rundown"
  ,"ae.kinetic_titles"
  ,"ae.speech_visualizer"
  ,"graphics.kpi_dashboard"
  ,"graphics.process_graph"
  ,"ae.device_mockup_3d"
  ,"ae.saas_tour_cursor"
  ,"effect.cinematic_title"
  ,"graphics.social_sticker_pack"
  ,"comfyui.archival_restore"
  ,"ae.ai_parallax_25d"
  ,"prompt.scientific_conditioning"
  ,"comfyui.scientific_motion"
  ,"ae.volumetric_particles_3d"
  ,"graphics.scientific_hud"
  ,"comfyui.controlnet_style_transfer"
  ,"ae.cyberpunk_vfx"
  ,"comfyui.latent_morph"
  ,"ae.caustics_fluid_diffusion"
  ,"ar.floating_slides_3d"
  ,"ar.camera_movement_3d"
  ,"util.switch_branch"
  ,"util.coalesce_fallback"
  ,"util.string_formatter"
  ,"util.json_query_extract"
  ,"util.media_transcode"
  ,"util.audio_extract"
  ,"util.lossless_trim"
  ,"util.timecode_math"
  ,"util.duration_pad"
  ,"util.data_inspector_qc"
  ,"util.file_integrity_guard"
  ,"preview.media"
  ,"preview.video"
  ,"preview.image"
] as const;

export type StepType = typeof stepTypes[number];
export type RunStatus = "queued" | "running" | "stopping" | "waiting_approval" | "partial" | "failed" | "success" | "cancelled" | "needs_attention";
export type StepStatus = "pending" | "running" | "waiting_approval" | "skipped" | "failed" | "success";
export type RunEventType =
  | "run.queued"
  | "run.started"
  | "run.partial"
  | "run.failed"
  | "run.succeeded"
  | "run.cancelled"
  | "run.waiting_approval"
  | "approval.recorded"
  | "checkpoint.recovered"
  | "step.skipped"
  | "step.started"
  | "step.attempted"
  | "step.attempt_failed"
  | "step.succeeded"
  | "step.committed"
  | "step.commit_pending"
  | "step.failed"
  | "verification.completed"
  | "stop.requested";

export interface WorkflowStep {
  id: string;
  type: StepType;
  name?: string;
  enabled?: boolean;
  timeoutMs?: number;
  retry?: { attempts?: number; delayMs?: number };
  with?: Record<string, unknown>;
}

export interface WorkflowV1 {
  $schema?: string;
  schemaVersion: 1;
  id: string;
  name?: string;
  variables?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  steps: WorkflowStep[];
}

export type GraphProfileIdV1 = "portrait" | "landscape" | "square";
export type GraphPortTypeV1 =
  | "any"
  | "text"
  | "json"
  | "media"
  | "image"
  | "video"
  | "audio"
  | "after-effects-project"
  | "premiere-project";

export interface GraphProfileV1 {
  id: GraphProfileIdV1;
  width: number;
  height: number;
  frameRate: 25;
}

export interface GraphPortRefV1 {
  nodeId: string;
  port: string;
}

export interface GraphEdgeV1 {
  id: string;
  from: GraphPortRefV1;
  to: GraphPortRefV1;
}

export interface GraphNodeV1 {
  id: string;
  type: string;
  name?: string;
  enabled?: boolean;
  timeoutMs?: number;
  retry?: { attempts?: number; delayMs?: number };
  position?: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface GraphLineageV1 {
  sourceGraphId: string;
  sourceVersion: number;
  sourceDigest: string;
}

export interface GraphDefinitionV1 {
  schemaVersion: 1;
  graphId: string;
  name: string;
  description?: string;
  revision: number;
  profile: GraphProfileV1;
  durationFrames: number;
  variables?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  nodes: GraphNodeV1[];
  edges: GraphEdgeV1[];
  order: string[];
  lineage?: GraphLineageV1;
}

export interface NodePortDescriptorV1 {
  id: string;
  type: GraphPortTypeV1;
  required?: boolean;
  multiple?: boolean;
  configKey?: string;
  outputPath?: string;
}

export type NodeConfigSchemaTypeV1 = "string" | "number" | "integer" | "boolean" | "object" | "array";
export type NodeConfigSchemaLiteralV1 = string | number | boolean | null;
export const nodeLifecycleStages = ["assets", "process", "timeline", "build", "export"] as const;
export type NodeLifecycleStageV1 = typeof nodeLifecycleStages[number];

/**
 * Deliberately small, serializable JSON Schema subset shared by the editor and
 * the control API. Runtime validation lives in node-sdk so neither caller has
 * to trust UI-only form validation.
 */
export interface NodeConfigSchemaV1 {
  type: NodeConfigSchemaTypeV1;
  title?: string;
  description?: string;
  format?: string;
  default?: unknown;
  enum?: readonly NodeConfigSchemaLiteralV1[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  properties?: Readonly<Record<string, NodeConfigSchemaV1>>;
  required?: readonly string[];
  items?: NodeConfigSchemaV1;
  additionalProperties?: boolean;
}

export interface NodeDescriptorV1 {
  type: string;
  title: string;
  /** Thai operator-facing explanation of the node's role. */
  description?: string;
  /** Workflow Studio lifecycle grouping; optional for older third-party descriptors. */
  lifecycleStage?: NodeLifecycleStageV1;
  category: "existing" | "declarative" | "media" | "audio" | "output";
  inputs: readonly NodePortDescriptorV1[];
  outputs: readonly NodePortDescriptorV1[];
  configSchema: NodeConfigSchemaV1;
  workflowType?: StepType;
  planned?: boolean;
  countsAsScene?: boolean;
  capabilities?: readonly string[];
  sideEffect?: boolean;
}

export interface GraphDiagnosticV1 {
  code: string;
  path: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface GraphValidationResultV1 {
  valid: boolean;
  diagnostics: GraphDiagnosticV1[];
  nodeOrder: string[];
  /** Effective duration, derived from scene timing when every scene is measurable. */
  durationFrames?: number;
}

export interface PublishedGraphVersionV1 {
  schemaVersion: 1;
  graphId: string;
  version: number;
  sourceRevision: number;
  digest: string;
  publishedAt: string;
  graph: GraphDefinitionV1;
}

export interface CompiledWorkflowSnapshotV1 {
  schemaVersion: 1;
  graphId: string;
  graphRevision: number;
  workflowDigest: string;
  createdAt: string;
  raw: string;
  workflow: WorkflowV1;
}

export const STORYBOARD_SCHEMA_VERSION = 2 as const;
export const STORYBOARD_FRAME_RATE = 25 as const;
export const STORYBOARD_FRAME_MS = 40 as const;

export type StoryboardItemKindV2 = "title" | "a_roll" | "cover_card" | "logo_outro" | "note";
export type StoryboardAudioPolicyV2 = "preserve" | "mute" | "mix";
export type StoryboardDiagnosticSeverityV2 = "blocker" | "warning" | "info";

export { coverCardMissingFields } from "./cover-card.js";
export type { CoverCardStage, CoverCardField } from "./cover-card.js";

export interface StoryboardAssetRefV2 {
  path: string;
  assetId?: string;
  sizeBytes?: number;
  mtime?: string;
}

export interface StoryboardBrollV2 {
  id: string;
  asset: StoryboardAssetRefV2;
  offsetMs: number;
  durationMs: number;
  audioPolicy: "mute";
  fit?: "cover" | "contain";
  note?: string;
}

export interface StoryboardItemV2 {
  id: string;
  kind: StoryboardItemKindV2;
  durationMs: number;
  audioPolicy: StoryboardAudioPolicyV2;
  presetId?: string;
  sourceRowNumbers?: number[];
  params: Record<string, unknown>;
  broll?: StoryboardBrollV2[];
}

export interface StoryboardImportRefV2 {
  importId: string;
  docxPath: string;
  sourceDigest: string;
  importedAt: string;
}

export interface StoryboardSpecV2 {
  schemaVersion: 2;
  storyboardId: string;
  name: string;
  revision: number;
  profile: { width: 1920; height: 1080; frameRate: 25 };
  sourceImport: StoryboardImportRefV2;
  items: StoryboardItemV2[];
}

export interface StoryboardRawRowV2 {
  rowIndex: number;
  rowNumber: number;
  cells: string[];
  picture: string;
  sound: string;
}

export interface StoryboardProposalV2 {
  proposalId: string;
  rowNumber: number;
  confidence: number;
  reasons: string[];
  item: StoryboardItemV2;
}

export interface StoryboardDiagnosticV2 {
  code: string;
  severity: StoryboardDiagnosticSeverityV2;
  message: string;
  itemId?: string;
  rowNumber?: number;
  path?: string;
}

export interface StoryboardDocxImportV2 {
  schemaVersion: 2;
  importId: string;
  docxPath: string;
  sourceDigest: string;
  importedAt: string;
  rawRows: StoryboardRawRowV2[];
  proposals: StoryboardProposalV2[];
  diagnostics: StoryboardDiagnosticV2[];
}

export interface ApprovedStoryboardVersionV2 {
  schemaVersion: 2;
  storyboardId: string;
  version: number;
  sourceRevision: number;
  storyboardDigest: string;
  sourceDocxDigest: string;
  mediaCatalogDigest: string;
  approvedAt: string;
  storyboard: StoryboardSpecV2;
}

export interface StoryboardTimelineItemV2 {
  itemId: string;
  kind: StoryboardItemKindV2 | "b_roll";
  startMs: number;
  durationMs: number;
  audioPolicy: StoryboardAudioPolicyV2;
  track: number;
  parentItemId?: string;
}

export interface StoryboardCompilationV2 {
  schemaVersion: 2;
  storyboardId: string;
  storyboardVersion: number;
  storyboardDigest: string;
  graphDigest: string;
  compiledAt: string;
  graph: GraphDefinitionV1;
  timeline: { durationMs: number; items: StoryboardTimelineItemV2[] };
  provenance: Record<string, string>;
  diagnostics: StoryboardDiagnosticV2[];
  executable: false;
}

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  unsafeToResume?: boolean;
  details?: Record<string, unknown>;
}

export interface RunEventV1 {
  schemaVersion: 1;
  sequence: number;
  runId: string;
  stateVersion: number;
  type: RunEventType;
  occurredAt: string;
  stepId?: string;
  attempt?: number;
  data: Record<string, unknown>;
}

export interface PresenterAsset {
  assetId: string;
  projectPath: string;
  originalName: string;
  mimeType: string;
  previewUrl: string;
}

export interface CarouselTimingConfig {
  durationSeconds?: number;
  secondsPerPhoto?: number;
  pacing?: "cinematic" | "dynamic";
}

export interface CarouselStylingConfig {
  theme?: "psu_blue_gold" | "dark_minimal" | "custom";
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  enableParticles?: boolean;
  enableDepthOfField?: boolean;
}

export interface Complex3DCarouselConfig {
  media?: string[];
  mediaFit?: "cover" | "contain" | "center";
  cycleMode?: "loop" | "ping_pong" | "shuffle";
  texts?: Record<string, string>;
  timing?: CarouselTimingConfig;
  styling?: CarouselStylingConfig;
  templateProject?: string;
  outputProject?: string;
  composition?: string;
}

export interface AssetMultiSelectConfig {
  paths?: string[];
  folderPath?: string;
  filter?: string;
}

export interface PortraitStoryManifestV1 {
  manifestVersion: 1;
  recipeId: "portrait-story-v1";
  id: string;
  projectName: string;
  presenterAsset: PresenterAsset;
  headline: string;
  subheadline: string;
  backgroundBrief: string;
}

export interface ValidationDiagnostic {
  path: string;
  keyword: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationDiagnostic[];
}

let cachedValidator: ((value: unknown) => boolean) & { errors?: ErrorObject[] | null };

export async function validateWorkflowDocument(value: unknown, projectRoot: string): Promise<ValidationResult> {
  if (!cachedValidator) {
    const schema = JSON.parse(await readFile(path.join(projectRoot, "schema/workflow.schema.json"), "utf8"));
    const Ajv2020 = Ajv2020Import as unknown as new (options?: Record<string, unknown>) => { compile(schema: object): unknown };
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    cachedValidator = ajv.compile(schema) as typeof cachedValidator;
  }
  const valid = cachedValidator(value);
  return {
    valid,
    errors: valid ? [] : (cachedValidator.errors ?? []).map((error) => ({
      path: error.instancePath || "/",
      keyword: error.keyword,
      message: error.message ?? "invalid value"
    }))
  };
}

export interface WorkerJobEnvelopeV1 {
  protocolVersion: 1;
  jobId: string;
  generation: string;
  type: string;
  input: Record<string, unknown>;
  context: {
    configDir: string;
    settings: Record<string, unknown>;
    runDir: string;
    stepDir: string;
    step: WorkflowStep;
    dryRun: boolean;
    timeoutMs: number;
  };
}

export interface WorkerJobResultV1 {
  protocolVersion: 1;
  jobId: string;
  generation: string;
  ok: boolean;
  outputs?: Record<string, unknown>;
  error?: SerializedError;
  logs: string[];
}
