import { nodeDescriptors } from "@psu-ava/node-sdk";

type JsonSchema = Record<string, unknown>;

const object = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: "object", properties, required });
const text = (title: string, options: JsonSchema = {}): JsonSchema => ({ type: "string", title, ...options });
const number = (title: string, options: JsonSchema = {}): JsonSchema => ({ type: "number", title, ...options });
const json = (title: string, kind: "object" | "array" = "object"): JsonSchema => ({ type: kind, title });
const select = (title: string, values: string[]): JsonSchema => ({ type: "string", title, enum: values });

const configSchemas: Record<string, JsonSchema> = {
  "asset.select": object({ path: text("Project-relative asset path", { format: "media-file" }) }, ["path"]),
  "asset.multi_select": object({
    paths: json("Array of project-relative asset paths", "array")
  }, ["paths"]),
  "asset.batch_folder": object({
    folderPath: text("Folder path containing assets"),
    filter: text("File filter glob (e.g. *.jpg, *.png)", { default: "*.jpg, *.png, *.mp4" })
  }, ["folderPath"]),
  "image.removeBackground": object({ path: text("Input image"), output: text("Output PNG", { default: "media/person-cutout.png" }) }),
  "image.resize": object({
    path: text("Input image"),
    maxDimension: number("Max dimension (width or height in px)", { default: 1080 }),
    width: number("Explicit width in px"),
    height: number("Explicit height in px"),
    output: text("Output PNG", { default: "media/presenter-scaled.png" })
  }),
  "image.luma_to_alpha": object({
    path: text("Black-background doodle PNG"),
    output: text("Transparent doodle output", { default: "media/doodle-alpha.png" })
  }, ["path"]),
  "graphics.cover_title": object({
    image: text("Generated cover image"),
    output: text("Final titled PNG"),
    eyebrow: text("Eyebrow"),
    title: text("Cover title"),
    subtitle: text("Subtitle")
  }, ["output", "title"]),
  "template.payload": object({ text: json("Text bindings"), footage: json("Footage bindings") }),
  "llm.chat": object({ system: text("System prompt", { format: "textarea" }), prompt: text("Prompt", { format: "textarea" }), parseJson: { type: "boolean", title: "Parse JSON", default: false } }, ["prompt"]),
  "comfyui.workflow": object({
    workflowFile: text("Registered workflow file", { default: "workflows/generate-background.api.json" }),
    width: { type: "number", title: "Generation Width (px)", default: 768 },
    height: { type: "number", title: "Generation Height (px)", default: 1344 },
    patches: json("Typed workflow inputs (e.g. 6.inputs.text, 5.inputs.width, 5.inputs.height)"),
    prompt: text("Resolved generation prompt", { format: "textarea" }),
    promptPatch: text("Workflow prompt patch", { default: "6.inputs.text" }),
    promptLanguage: select("Prompt language gate", ["en"]),
    downloadDir: text("Download directory", { default: "media/generated-background" })
  }, ["workflowFile"]),
  "ae.template": object({
    templateProject: text("Registered AE template (.aep)", { default: "templates/after-effects/prototype-story.aep" }),
    outputProject: text("Output AEP", { default: "projects/ae-composite.aep" }),
    composition: text("Composition", { default: "MASTER" }),
    text: json("Text bindings (e.g. TITLE, SUBTITLE)"),
    footage: json("Footage bindings (e.g. PORTRAIT, BACKGROUND)")
  }, ["templateProject", "outputProject"]),
  "ae.render": object({
    project: text("AE project (.aep)", { default: "projects/ae-composite.aep" }),
    composition: text("Composition", { default: "MASTER" }),
    output: text("Output video (.mov)", { default: "media/rendered-composite.mov" }),
    renderSettingsTemplate: text("Render settings", { default: "Best Settings" }),
    outputModuleTemplate: text("Output module", { default: "Lossless" })
  }, ["project", "output"]),
  "effect.3d_carousel": object({
    templateProject: text("Registered AE template (.aep)", { default: "templates/after-effects/3d-photo-carousel.aep" }),
    outputProject: text("Output AEP", { default: "projects/carousel-composite.aep" }),
    composition: text("Composition", { default: "Main" }),
    cycleMode: { type: "string", title: "Media cycle mode", enum: ["loop", "ping_pong", "shuffle"], default: "loop" },
    mediaFit: { type: "string", title: "Media fitting", enum: ["cover", "contain"], default: "cover" },
    texts: json("Text slot bindings (Text 1..5)"),
    timing: json("Timing configuration (durationSeconds, secondsPerPhoto, pacing)"),
    styling: json("Styling configuration (theme, primaryColor, accentColor, particles, depthOfField)")
  }, ["templateProject", "outputProject"]),
  "premiere.assemble": object({ outputProject: text("Output PRPROJ"), sequenceName: text("Sequence", { default: "AUTO_ASSEMBLY" }), media: json("Media", "array"), createSequence: { type: "boolean", title: "Create sequence", default: true }, save: { type: "boolean", title: "Save", default: true } }, ["outputProject"]),
  "media.probe": object({ path: text("Media path"), ffprobePath: text("FFprobe executable", { default: "ffprobe" }) }, ["path"]),
  "timeline.scene": object({ source: text("Source media"), durationMs: number("Duration ms", { minimum: 40, maximum: 300000, default: 5000 }), sourceInMs: number("Source in ms", { minimum: 0, default: 0 }), track: number("Video track", { minimum: 1, default: 1 }) }, ["source", "durationMs"]),
  "timeline.transition": object({ type: { type: "string", title: "Transition", enum: ["cut", "cross-dissolve"], default: "cut" }, durationMs: number("Duration ms", { minimum: 0, maximum: 5000 }), fromScene: text("From scene"), toScene: text("To scene") }, ["type"]),
  "timeline.overlay": object({ asset: text("Overlay asset"), text: text("Overlay text"), startMs: number("Start ms", { minimum: 0, default: 0 }), durationMs: number("Duration ms", { minimum: 40, maximum: 300000, default: 5000 }), track: number("Track", { minimum: 1, default: 2 }), opacity: number("Opacity", { minimum: 0, maximum: 1, default: 1 }) }, ["startMs", "durationMs"]),
  "timeline.graphic_mogrt": object({ id: text("Graphic identifier"), mogrtPath: text("MOGRT path"), startMs: number("Start ms", { minimum: 0, default: 0 }), durationMs: number("Duration ms", { minimum: 40, maximum: 300000, default: 5000 }), track: number("Track", { minimum: 1, default: 4 }), text: json("Editable text fields"), parameterMap: json("MOGRT parameter display-name map") }, ["id", "mogrtPath", "startMs", "durationMs", "track", "text"]),
  "timeline.dynamic_link": object({
    id: text("Dynamic link identifier"),
    project: text("AE project (.aep)"),
    composition: text("Composition", { default: "Main" }),
    startMs: number("Start ms", { minimum: 0, default: 0 }),
    durationMs: number("Duration ms", { minimum: 40, default: 10000 }),
    track: number("Track", { minimum: 1, default: 3 }),
    audioPolicy: { type: "string", title: "Audio policy", enum: ["mute"], default: "mute" }
  }, ["id", "composition", "startMs", "durationMs", "track", "audioPolicy"]),
  "timeline.compose": object({ name: text("Timeline name"), width: number("Width"), height: number("Height"), frameRate: { type: "integer", title: "Frame rate", enum: [25], default: 25 }, scenes: json("Scenes", "array"), transitions: json("Transitions", "array"), overlays: json("Overlays", "array"), graphics: json("Editable MOGRT graphics", "array"), dynamicLinks: json("Dynamic links", "array"), audio: json("Audio", "array") }, ["scenes"]),
  "audio.asset": object({ path: text("Audio path", { format: "audio-file" }), role: { type: "string", title: "Role", enum: ["voiceover", "dialogue", "music", "effects"], default: "music" }, gainDb: number("Gain dB", { minimum: -60, maximum: 24, default: 0 }), startMs: number("Start ms", { minimum: 0, default: 0 }) }, ["path"]),
  "audio.jaitts": object({ text: text("Thai script", { format: "textarea", maxLength: 5000 }), voice: text("Registered voice ID"), output: text("Output WAV", { default: "audio/voiceover.wav" }), language: { type: "string", title: "Language", enum: ["th"], default: "th" }, speed: number("Speed", { minimum: 0.5, maximum: 2, default: 1 }) }, ["text", "voice", "output"]),
  "audio.mix": object({ inputs: json("Audio inputs", "array"), output: text("Output audio", { default: "audio/mix.wav" }), targetLufs: number("Target LUFS", { minimum: -30, maximum: -8, default: -16 }), ducking: { type: "boolean", title: "Duck music under voice", default: true } }, ["inputs", "output"]),
  "premiere.build": object({ outputProject: text("Output PRPROJ"), sequenceName: text("Sequence name", { default: "AVA_MAIN" }), sequencePresetPath: text("Trusted 25fps sequence preset (.sqpreset)"), timelineSpec: json("Timeline spec"), exports: json("Exports", "array") }, ["outputProject", "sequencePresetPath", "timelineSpec"]),
  "premiere.export": object({ project: text("Premiere project"), sequenceName: text("Sequence"), exports: json("H.264 and ProRes exports", "array") }, ["project", "exports"]),
  "storyboard.docx_import": object({ path: text("DOCX storyboard path") }, ["path"]),
  "media.catalog": object({ root: text("Media root"), brollFolder: text("B-roll folder relative to media root", { default: "Ins" }), coverFolder: text("Cover photo folder relative to media root", { default: "ภาพนิ่ง" }) }, ["root"]),
  "edit.cutlist": object({ storyboard: json("Storyboard"), catalog: json("Media catalog"), introDurationMs: number("Cold open duration ms", { default: 10000, minimum: 0 }) }, ["storyboard", "catalog"]),
  "editor.broll_match": object({ storyboard: json("Storyboard"), catalog: json("Media catalog"), maxPerSegment: number("Candidates per interview segment", { default: 2, minimum: 1, maximum: 3 }), model: text("Matching model", { default: "contextual-semantic-v2" }) }, ["storyboard", "catalog"]),
  "review.approval": object({ proposal: json("B-roll proposal"), prompt: text("Operator prompt", { default: "ตรวจและอนุมัติ B-roll สำหรับแต่ละช่วงบทสัมภาษณ์" }) }, ["proposal"]),
  "review.media_approval": object({
    asset: text("Generated media asset to approve"),
    workflowDigest: text("Workflow SHA-256 digest"),
    storyboardItemId: text("Storyboard item identifier"),
    sourceImage: text("Source image path"),
    prompt: text("Generation prompt"),
    seed: number("Generation seed", { minimum: 0 }),
    title: text("Optional title"),
    promptText: text("Operator prompt")
  }, ["storyboardItemId", "sourceImage", "prompt", "seed"]),
  "media.conform": object({ cutlist: json("Approved cutlist"), approval: json("Approval decision"), cacheRoot: text("Local conform cache", { default: ".ava-cache/conform" }), profile: text("Conform profile", { default: "1080p25" }) }, ["cutlist", "approval"]),
  "timeline.broll_stack": object({ cutlist: json("Cutlist"), approval: json("Approved B-roll"), maxDurationMs: number("Maximum insert duration ms", { default: 5000, minimum: 40 }) }, ["cutlist", "approval"]),
  "audio.dialogue_mix": object({ cutlist: json("Cutlist") }, ["cutlist"]),
  "audio.loudness_qc": object({
    source: text("Media file path to QC"),
    timelineSpec: json("Optional TimelineSpec for expected mute windows"),
    targetLufs: number("Target integrated loudness (LUFS)"),
    toleranceLufs: number("Loudness tolerance (+/- LU)", { minimum: 0.1 }),
    maxTruePeakDbfs: number("Maximum true peak (dBFS)"),
    silenceThresholdDbfs: number("Silence detection noise floor (dBFS)"),
    minSilenceMs: number("Minimum silence duration ms", { minimum: 1 }),
    maxUnexpectedSilenceMs: number("Maximum allowable unexpected silence ms", { minimum: 0 })
  }, ["targetLufs", "toleranceLufs", "maxTruePeakDbfs", "silenceThresholdDbfs", "minSilenceMs", "maxUnexpectedSilenceMs"]),
  "media.audio_normalize": object({
    source: text("Source H.264"),
    output: text("Normalized MP4 output"),
    targetLufs: number("Target LUFS"),
    maxTruePeakDbfs: number("Max true peak dBFS"),
    loudnessRange: number("Loudness range"),
    audioBitrateKbps: number("AAC bitrate kbps")
  }, ["output", "targetLufs", "maxTruePeakDbfs"]),
  "graphics.template_card": object({ cards: json("Fixed title cards", "array"), aeTemplatePath: text("Optional AE project") }),
  "qc.timeline": object({ timeline: json("Composed timeline"), exports: json("Milestone exports", "array") }, ["timeline"])
};

export function listUiNodeDescriptors() {
  return nodeDescriptors.map((descriptor) => ({
    type: descriptor.type,
    label: descriptor.title,
    lifecycleStage: descriptor.lifecycleStage,
    category: descriptor.category,
    description: descriptor.description,
    version: "1",
    inputs: descriptor.inputs,
    outputs: descriptor.outputs,
    capabilities: descriptor.capabilities ?? [],
    sideEffect: descriptor.sideEffect ?? false,
    configSchema: configSchemas[descriptor.type] ?? object({})
  }));
}
