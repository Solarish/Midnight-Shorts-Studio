import { createHash } from "node:crypto";
import type { GraphDefinitionV1, PortraitStoryManifestV1, WorkflowV1 } from "@psu-ava/contracts";

const STYLE_SUFFIX = "premium midnight-blue university broadcast studio background, abstract architectural panels, warm amber rim lighting, subtle depth, editorial photography, clean center composition, no people, no words, no logos";

const PREMIERE_BETA_VERSION = "26.5.0";
const PREMIERE_BETA_SEQUENCE = "/Applications/Adobe Premiere Pro (Beta)/Adobe Premiere Pro (Beta).app/Contents/Settings/SequencePresets/Legacy/DNxHD/1080p 25/DNX HQ 1080p 25.sqpreset";
const H264_PRESET = "/Applications/Adobe Premiere Pro (Beta)/Adobe Premiere Pro (Beta).app/Contents/MediaIO/systempresets/4E49434B_48323634/00 - Match Source - High bitrate.epr";
const PRORES_PRESET = "/Applications/Adobe Premiere Pro (Beta)/Adobe Premiere Pro (Beta).app/Contents/MediaIO/systempresets/3F3F3F3F_4D6F6F56/Apple ProRes 422.epr";

export const starterWorkflowPackages = Object.freeze([
  {
    packageId: "ai-background-replacement-v1",
    version: 1,
    name: "AI Background Replacement (Vision & ComfyUI)",
    description: "ลบพื้นหลังบุคคลด้วย Apple Vision + ย่อขยายรูปภาพ (Rescale) + สร้างฉากหลังใหม่ด้วย ComfyUI (Z-Image Turbo) และประกอบลง Premiere Timeline",
    profile: "portrait",
    durationFrames: 125,
    nodeCount: 9,
    host: { channel: "beta", premiereVersion: PREMIERE_BETA_VERSION, premiereMinVersion: PREMIERE_BETA_VERSION, presetDriven: true }
  },
  {
    packageId: "ae-multilayer-transition-v1",
    version: 1,
    name: "Multi-Layer AE & Transitions",
    description: "ประกอบ Motion Graphic หลายเลเยอร์จาก After Effects Template (Title + Presenter) พร้อม Cut & Cross-dissolve Transitions ลง Premiere Pro",
    profile: "portrait",
    durationFrames: 250,
    nodeCount: 10,
    host: { channel: "beta", premiereVersion: PREMIERE_BETA_VERSION, premiereMinVersion: PREMIERE_BETA_VERSION, presetDriven: true }
  },
  {
    packageId: "multi-footage-assembly-v1",
    version: 1,
    name: "Multi-Footage Sequential Assembly",
    description: "ร้อยเรียง Footage วิดีโอและภาพหลายฉาก (Multi-scenes) พร้อม Transitions (Cross-dissolve & Dip to Black) ลง Premiere Pro",
    profile: "landscape",
    durationFrames: 375,
    nodeCount: 10,
    host: { channel: "beta", premiereVersion: PREMIERE_BETA_VERSION, premiereMinVersion: PREMIERE_BETA_VERSION, presetDriven: true }
  },
  {
    packageId: "3d-photo-carousel-intro-v1",
    version: 2,
    name: "3D Photo Carousel Intro (Multi-Comp AE)",
    description: "Complex Effect v2 · อินโทร 3D Photo Carousel 21 ช่องภาพ + 5 ข้อความ พร้อม Auto-cycling 15 วินาที @ 25fps และส่งเข้า Premiere Pro Timeline",
    profile: "landscape",
    durationFrames: 375,
    nodeCount: 6,
    host: { channel: "beta", premiereVersion: PREMIERE_BETA_VERSION, premiereMinVersion: PREMIERE_BETA_VERSION, presetDriven: true }
  },
  {
    packageId: "documentary-assembly-v1",
    version: 2,
    name: "สารคดี อาจารย์ตัวอย่าง 69 (Full Broadcast Master · ComfyUI Preview)",
    description: "ระบบประกอบสารคดีและสัมภาษณ์มาตรฐานบรอดแคสต์: นำเข้าสตอรี่บอร์ด DOCX + สารบัญ NAS + AI ComfyUI Background + 3D Title Bumper + AR Card + Climax Title + ตัดต่อ B-Roll + ตรวจอนุมัติ + แปลง ProRes + Premiere Project + ส่งออกวิดีโอ MP4 และโหนดพรีวิว ComfyUI Interactive Preview ในตัว",
    profile: "landscape",
    durationFrames: 11200,
    nodeCount: 22,
    host: { channel: "beta", premiereVersion: PREMIERE_BETA_VERSION, premiereMinVersion: PREMIERE_BETA_VERSION, presetDriven: true }
  },
  {
    packageId: "broadcast-news-falcon-2box-v1",
    version: 1,
    name: "Broadcast News & Field Report (2-Box DVE & Ticker)",
    description: "แพ็กเกจข่าวสถานีโทรทัศน์: รวมสัญญาณห้องส่ง + กล้องภาคสนาม Falcon WebRTC เป็น 2-Box DVE พร้อมแถบข่าวด่วนและตัววิ่ง Ticker Crawl",
    profile: "landscape",
    durationFrames: 500,
    nodeCount: 6,
    host: { channel: "beta", premiereVersion: PREMIERE_BETA_VERSION, premiereMinVersion: PREMIERE_BETA_VERSION, presetDriven: true }
  },
  {
    packageId: "social-vertical-reframe-teaser-v1",
    version: 1,
    name: "Vertical Social Reel 9:16 (Smart Reframe & Beat Sync)",
    description: "วิดีโอแนวตั้งสำหรับ TikTok / Reels / Shorts: แปลง 16:9 เป็น 9:16 อัตโนมัติ พร้อมตรวจจับจังหวะเพลง (BPM Beat Grid) และคัตติ้งตรงจังหวะ",
    profile: "portrait",
    durationFrames: 375,
    nodeCount: 5,
    host: { channel: "beta", premiereVersion: PREMIERE_BETA_VERSION, premiereMinVersion: PREMIERE_BETA_VERSION, presetDriven: true }
  },
  {
    packageId: "commercial-promo-smart-ducking-v1",
    version: 1,
    name: "Commercial Promo (Smart Audio Ducking & Color Grading)",
    description: "วิดีโอโปรโมตและสปอตโฆษณา: ปรับโทนสีภาพ Cinematic 3D LUT + S-Curve และมิกซ์เสียงหลบเพลงอัจฉริยะ (Smart Sidechain Ducking -18dB) มาตรฐาน EBU R128",
    profile: "landscape",
    durationFrames: 750,
    nodeCount: 6,
    host: { channel: "beta", premiereVersion: PREMIERE_BETA_VERSION, premiereMinVersion: PREMIERE_BETA_VERSION, presetDriven: true }
  },
  {
    packageId: "courseware-lecture-sidebyside-v1",
    version: 1,
    name: "Courseware & Workshop (70/30 Side-by-Side & Step Timer)",
    description: "สื่อการสอนและการอบรมเชิงปฏิบัติการ: จัดวางเลย์เอาต์สไลด์คู่ผู้สอน 70/30 พร้อมตรวจจับการเปลี่ยนสไลด์และใส่นาฬิกานับถอยหลังขั้นตอน",
    profile: "landscape",
    durationFrames: 1000,
    nodeCount: 6,
    host: { channel: "beta", premiereVersion: PREMIERE_BETA_VERSION, premiereMinVersion: PREMIERE_BETA_VERSION, presetDriven: true }
  }
] as const);

const STARTER_SETTINGS = {
  runRoot: "prototype-runs",
  stepTimeoutMs: 1_200_000,
  retryAttempts: 1,
  pollIntervalMs: 1_500,
  services: {
    comfyui: { baseUrl: "http://10.135.66.70:8188", clientId: "psu-ava-ui" },
    jaitts: { baseUrl: "http://10.135.66.70:7861" },
    ollama: { baseUrl: "http://10.135.66.70:11434" }
  },
  adobe: {
    afterEffects: { applicationId: "com.adobe.AfterEffects.application", aerenderPath: "/Applications/Adobe After Effects 2026/aerender" },
    premiere: { applicationName: "Adobe Premiere Pro (Beta)", requiredVersion: PREMIERE_BETA_VERSION, bridgeHost: "127.0.0.1", bridgePort: 47652, bridgeMailbox: "/tmp/psu-ava-premiere-bridge", launch: true }
  }
};

export function instantiateStarterWorkflowPackage(packageId: string, options: { graphId: string; name?: string }): GraphDefinitionV1 {
  const graphId = options.graphId;
  if (!/^[A-Za-z0-9_-]+$/.test(graphId)) throw new Error("Starter graph id is unsafe");

  if (packageId === "ai-background-replacement-v1" || packageId === "timeline-assembly-live-v1") {
    return {
      schemaVersion: 1,
      graphId,
      name: options.name?.trim() || "AI Background Replacement",
      description: "ลบพื้นหลังบุคคลด้วย Apple Vision + ย่อขยายรูปภาพ (Rescale) + สร้างฉากหลังใหม่ด้วย ComfyUI (Z-Image Turbo) ปรับขนาดตาม Format และประกอบลง Premiere Timeline",
      revision: 0,
      profile: { id: "portrait", width: 1080, height: 1920, frameRate: 25 },
      durationFrames: 125,
      variables: {},
      settings: STARTER_SETTINGS,
      nodes: [
        { id: "select_presenter", type: "asset.select", position: { x: 40, y: 100 }, config: { path: "assets/input/prototype-presenter.png" } },
        { id: "remove_background", type: "image.removeBackground", position: { x: 260, y: 100 }, config: { path: "assets/input/prototype-presenter.png", output: "media/presenter-cutout.png" } },
        { id: "rescale_presenter", type: "image.resize", position: { x: 480, y: 100 }, config: { path: "media/presenter-cutout.png", maxDimension: 1080, output: "media/presenter-scaled.png" } },
        { id: "overlay_presenter", type: "timeline.overlay", position: { x: 700, y: 100 }, config: { asset: "media/presenter-scaled.png", startMs: 0, durationMs: 5000, track: 2, audioPolicy: "mute" } },
        { id: "generate_background", type: "comfyui.workflow", position: { x: 40, y: 280 }, config: { workflowFile: "workflows/generate-background.api.json", patches: { "6.inputs.text": "luxury modern university broadcast studio background, architectural panels, warm amber lighting", "5.inputs.width": 768, "5.inputs.height": 1344 }, downloadDir: "media/generated-background" } },
        { id: "rescale_background", type: "image.resize", position: { x: 260, y: 280 }, config: { path: "media/generated-background/dry-run-output.png", width: 1080, height: 1920, output: "media/background-scaled.png" } },
        { id: "scene_background", type: "timeline.scene", position: { x: 480, y: 280 }, config: { source: "media/background-scaled.png", durationMs: 5000, sourceInMs: 0, track: 1, audio: false, audioPolicy: "mute" } },
        { id: "compose_timeline", type: "timeline.compose", position: { x: 920, y: 200 }, config: { name: "AI_BACKGROUND_STORY" } },
        { id: "build_premiere", type: "premiere.build", position: { x: 1140, y: 200 }, config: { outputProject: "outputs/premiere/ai-background-story.prproj", sequenceName: "AI_STORY", sequencePresetPath: PREMIERE_BETA_SEQUENCE, save: true } }
      ],
      edges: [
        { id: "edge_sel_bg", from: { nodeId: "select_presenter", port: "path" }, to: { nodeId: "remove_background", port: "image" } },
        { id: "edge_bg_scale", from: { nodeId: "remove_background", port: "image" }, to: { nodeId: "rescale_presenter", port: "image" } },
        { id: "edge_scale_ovl", from: { nodeId: "rescale_presenter", port: "image" }, to: { nodeId: "overlay_presenter", port: "asset" } },
        { id: "edge_gen_scale", from: { nodeId: "generate_background", port: "image" }, to: { nodeId: "rescale_background", port: "image" } },
        { id: "edge_scale_scene", from: { nodeId: "rescale_background", port: "image" }, to: { nodeId: "scene_background", port: "source" } },
        { id: "edge_scene_comp", from: { nodeId: "scene_background", port: "scene" }, to: { nodeId: "compose_timeline", port: "scenes" } },
        { id: "edge_ovl_comp", from: { nodeId: "overlay_presenter", port: "overlay" }, to: { nodeId: "compose_timeline", port: "overlays" } },
        { id: "edge_comp_build", from: { nodeId: "compose_timeline", port: "timeline" }, to: { nodeId: "build_premiere", port: "timeline" } }
      ],
      order: ["select_presenter", "remove_background", "rescale_presenter", "overlay_presenter", "generate_background", "rescale_background", "scene_background", "compose_timeline", "build_premiere"]
    };
  }

  if (packageId === "ae-multilayer-transition-v1") {
    return {
      schemaVersion: 1,
      graphId,
      name: options.name?.trim() || "Multi-Layer AE & Transitions",
      description: "ประกอบ Motion Graphic หลายเลเยอร์จาก After Effects Template (Title + Presenter) พร้อม Cut & Cross-dissolve Transitions ลง Premiere Pro",
      revision: 0,
      profile: { id: "portrait", width: 1080, height: 1920, frameRate: 25 },
      durationFrames: 250,
      variables: {},
      settings: STARTER_SETTINGS,
      nodes: [
        { id: "select_presenter", type: "asset.select", position: { x: 40, y: 100 }, config: { path: "assets/input/prototype-presenter.png" } },
        { id: "remove_background", type: "image.removeBackground", position: { x: 260, y: 100 }, config: { path: "assets/input/prototype-presenter.png", output: "media/presenter-cutout.png" } },
        { id: "ae_template", type: "ae.template", position: { x: 480, y: 100 }, config: { templateProject: "templates/after-effects/prototype-story.aep", outputProject: "projects/ae-composite.aep", composition: "MASTER", text: { TITLE: "PSU Broadcast Special Report", SUBTITLE: "รายงานพิเศษประจำสัปดาห์" }, footage: { PORTRAIT: "media/presenter-cutout.png", BACKGROUND: "assets/input/prototype-presenter.png" } } },
        { id: "ae_render", type: "ae.render", position: { x: 700, y: 100 }, config: { project: "projects/ae-composite.aep", composition: "MASTER", output: "media/rendered-intro.mp4" } },
        { id: "scene_intro", type: "timeline.scene", position: { x: 920, y: 100 }, config: { source: "media/rendered-intro.mp4", durationMs: 5000, sourceInMs: 0, track: 1 } },
        { id: "select_body_clip", type: "asset.select", position: { x: 700, y: 280 }, config: { path: "assets/input/prototype-presenter.png" } },
        { id: "scene_body", type: "timeline.scene", position: { x: 920, y: 280 }, config: { source: "assets/input/prototype-presenter.png", durationMs: 5000, sourceInMs: 0, track: 1 } },
        { id: "transition_cross", type: "timeline.transition", position: { x: 1140, y: 190 }, config: { type: "cut", durationMs: 0 } },
        { id: "compose_timeline", type: "timeline.compose", position: { x: 1360, y: 190 }, config: { name: "AE_MULTI_LAYER" } },
        { id: "build_premiere", type: "premiere.build", position: { x: 1580, y: 190 }, config: { outputProject: "outputs/premiere/ae-multi-layer.prproj", sequenceName: "AE_MULTI_LAYER", sequencePresetPath: PREMIERE_BETA_SEQUENCE, save: true } }
      ],
      edges: [
        { id: "edge_sel_bg", from: { nodeId: "select_presenter", port: "path" }, to: { nodeId: "remove_background", port: "image" } },
        { id: "edge_bg_tmpl", from: { nodeId: "remove_background", port: "image" }, to: { nodeId: "ae_template", port: "footage" } },
        { id: "edge_tmpl_rend", from: { nodeId: "ae_template", port: "project" }, to: { nodeId: "ae_render", port: "project" } },
        { id: "edge_rend_scene", from: { nodeId: "ae_render", port: "video" }, to: { nodeId: "scene_intro", port: "source" } },
        { id: "edge_clip_body", from: { nodeId: "select_body_clip", port: "path" }, to: { nodeId: "scene_body", port: "source" } },
        { id: "edge_scene1_comp", from: { nodeId: "scene_intro", port: "scene" }, to: { nodeId: "compose_timeline", port: "scenes" } },
        { id: "edge_scene2_comp", from: { nodeId: "scene_body", port: "scene" }, to: { nodeId: "compose_timeline", port: "scenes" } },
        { id: "edge_trans_comp", from: { nodeId: "transition_cross", port: "transition" }, to: { nodeId: "compose_timeline", port: "transitions" } },
        { id: "edge_comp_build", from: { nodeId: "compose_timeline", port: "timeline" }, to: { nodeId: "build_premiere", port: "timeline" } }
      ],
      order: ["select_presenter", "remove_background", "ae_template", "ae_render", "scene_intro", "select_body_clip", "scene_body", "transition_cross", "compose_timeline", "build_premiere"]
    };
  }

  if (packageId === "multi-footage-assembly-v1") {
    return {
      schemaVersion: 1,
      graphId,
      name: options.name?.trim() || "Multi-Footage Sequential Assembly",
      description: "ร้อยเรียง Footage วิดีโอและภาพหลายฉาก (Multi-scenes) พร้อม Cut Transitions ลง Premiere Pro",
      revision: 0,
      profile: { id: "landscape", width: 1920, height: 1080, frameRate: 25 },
      durationFrames: 375,
      variables: {},
      settings: STARTER_SETTINGS,
      nodes: [
        { id: "select_clip1", type: "asset.select", position: { x: 40, y: 80 }, config: { path: "assets/input/prototype-presenter.png" } },
        { id: "select_clip2", type: "asset.select", position: { x: 40, y: 220 }, config: { path: "assets/input/prototype-presenter.png" } },
        { id: "select_clip3", type: "asset.select", position: { x: 40, y: 360 }, config: { path: "assets/input/prototype-presenter.png" } },
        { id: "scene_1", type: "timeline.scene", position: { x: 280, y: 80 }, config: { source: "assets/input/prototype-presenter.png", durationMs: 5000, sourceInMs: 0, track: 1 } },
        { id: "transition_1", type: "timeline.transition", position: { x: 500, y: 150 }, config: { type: "cut", durationMs: 0 } },
        { id: "scene_2", type: "timeline.scene", position: { x: 280, y: 220 }, config: { source: "assets/input/prototype-presenter.png", durationMs: 5000, sourceInMs: 0, track: 1 } },
        { id: "transition_2", type: "timeline.transition", position: { x: 500, y: 290 }, config: { type: "cut", durationMs: 0 } },
        { id: "scene_3", type: "timeline.scene", position: { x: 280, y: 360 }, config: { source: "assets/input/prototype-presenter.png", durationMs: 5000, sourceInMs: 0, track: 1 } },
        { id: "compose_timeline", type: "timeline.compose", position: { x: 740, y: 220 }, config: { name: "MULTI_FOOTAGE_SEQ" } },
        { id: "build_premiere", type: "premiere.build", position: { x: 980, y: 220 }, config: { outputProject: "outputs/premiere/multi-footage-assembly.prproj", sequenceName: "MULTI_FOOTAGE", sequencePresetPath: PREMIERE_BETA_SEQUENCE, save: true } }
      ],
      edges: [
        { id: "edge_c1_s1", from: { nodeId: "select_clip1", port: "path" }, to: { nodeId: "scene_1", port: "source" } },
        { id: "edge_c2_s2", from: { nodeId: "select_clip2", port: "path" }, to: { nodeId: "scene_2", port: "source" } },
        { id: "edge_c3_s3", from: { nodeId: "select_clip3", port: "path" }, to: { nodeId: "scene_3", port: "source" } },
        { id: "edge_s1_comp", from: { nodeId: "scene_1", port: "scene" }, to: { nodeId: "compose_timeline", port: "scenes" } },
        { id: "edge_t1_comp", from: { nodeId: "transition_1", port: "transition" }, to: { nodeId: "compose_timeline", port: "transitions" } },
        { id: "edge_s2_comp", from: { nodeId: "scene_2", port: "scene" }, to: { nodeId: "compose_timeline", port: "scenes" } },
        { id: "edge_t2_comp", from: { nodeId: "transition_2", port: "transition" }, to: { nodeId: "compose_timeline", port: "transitions" } },
        { id: "edge_s3_comp", from: { nodeId: "scene_3", port: "scene" }, to: { nodeId: "compose_timeline", port: "scenes" } },
        { id: "edge_comp_build", from: { nodeId: "compose_timeline", port: "timeline" }, to: { nodeId: "build_premiere", port: "timeline" } }
      ],
      order: ["select_clip1", "select_clip2", "select_clip3", "scene_1", "transition_1", "scene_2", "transition_2", "scene_3", "compose_timeline", "build_premiere"]
    };
  }

  if (packageId === "3d-photo-carousel-intro-v1") {
    return {
      schemaVersion: 1,
      graphId,
      name: options.name?.trim() || "3D Photo Carousel Intro (Complex Node v2)",
      description: "Complex Effect v2 · อินโทร 3D Photo Carousel 21 ช่องภาพ + 5 ข้อความ พร้อม Auto-cycling 15 วินาที @ 25fps และส่งเข้า Premiere Pro Timeline",
      revision: 0,
      profile: { id: "landscape", width: 1920, height: 1080, frameRate: 25 },
      durationFrames: 375,
      variables: {},
      settings: STARTER_SETTINGS,
      nodes: [
        { id: "select_photos", type: "asset.multi_select", position: { x: 40, y: 150 }, config: { paths: ["assets/input/prototype-presenter.png"] } },
        { id: "ae_carousel_effect", type: "effect.3d_carousel", position: { x: 300, y: 150 }, config: {
          templateProject: "templates/after-effects/3d-photo-carousel.aep",
          outputProject: "projects/carousel-composite.aep",
          composition: "Main",
          cycleMode: "loop",
          mediaFit: "cover",
          texts: {
            "Text 1": "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
            "Text 2": "คณะทันตแพทยศาสตร์ ม.อ.",
            "Text 3": "อาจารย์ตัวอย่างดีเด่น ประจำปี 2569",
            "Text 4": "ทำหน้าที่ของตัวเองให้ดีที่สุด ทำด้วยความรักและสนุก",
            "Text 5": "PSU BROADCAST SPECIAL REPORT"
          },
          timing: {
            durationSeconds: 15,
            frameRate: 25,
            pacing: "cinematic"
          },
          styling: {
            theme: "psu_blue_gold",
            enableParticles: true,
            enableDepthOfField: true
          }
        } },
        { id: "ae_carousel_render", type: "ae.render", position: { x: 560, y: 150 }, config: { project: "projects/carousel-composite.aep", composition: "Main", output: "media/carousel-intro.mov", renderSettingsTemplate: "Best Settings", outputModuleTemplate: "Lossless" } },
        { id: "scene_carousel", type: "timeline.scene", position: { x: 800, y: 150 }, config: { source: "media/carousel-intro.mov", durationMs: 15000, sourceInMs: 0, track: 1 } },
        { id: "compose_timeline", type: "timeline.compose", position: { x: 1040, y: 150 }, config: { name: "CAROUSEL_INTRO" } },
        { id: "build_premiere", type: "premiere.build", position: { x: 1280, y: 150 }, config: { outputProject: "outputs/premiere/carousel-story.prproj", sequenceName: "CAROUSEL_INTRO", sequencePresetPath: PREMIERE_BETA_SEQUENCE, save: true } }
      ],
      edges: [
        { id: "edge_photos_ae", from: { nodeId: "select_photos", port: "mediaList" }, to: { nodeId: "ae_carousel_effect", port: "media" } },
        { id: "edge_tmpl_rend", from: { nodeId: "ae_carousel_effect", port: "project" }, to: { nodeId: "ae_carousel_render", port: "project" } },
        { id: "edge_rend_scene", from: { nodeId: "ae_carousel_render", port: "video" }, to: { nodeId: "scene_carousel", port: "source" } },
        { id: "edge_scene_comp", from: { nodeId: "scene_carousel", port: "scene" }, to: { nodeId: "compose_timeline", port: "scenes" } },
        { id: "edge_comp_build", from: { nodeId: "compose_timeline", port: "timeline" }, to: { nodeId: "build_premiere", port: "timeline" } }
      ],
      order: ["select_photos", "ae_carousel_effect", "ae_carousel_render", "scene_carousel", "compose_timeline", "build_premiere"]
    };
  }

  if (packageId === "documentary-assembly-v1") {
    return {
      schemaVersion: 1,
      graphId,
      name: options.name?.trim() || "Documentary (DOCX Storyboard & Full Broadcast Assembly)",
      description: "ระบบประกอบสารคดีและสัมภาษณ์มาตรฐานบรอดแคสต์: นำเข้าสตอรี่บอร์ด DOCX + สารบัญ NAS + AI ComfyUI Background + 3D Title Bumper + AR Card + Climax Title + ตัดต่อ B-Roll + ตรวจอนุมัติ + แปลง ProRes + Premiere Project + ส่งออกวิดีโอ MP4 และโหนดพรีวิว ComfyUI Interactive Preview ในตัว",
      revision: 0,
      profile: { id: "landscape", width: 1920, height: 1080, frameRate: 25 },
      durationFrames: 11200,
      variables: {},
      settings: STARTER_SETTINGS,
      nodes: [
        { id: "import_storyboard", type: "storyboard.docx_import", position: { x: 40, y: 100 }, config: { path: "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ /SB-รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ .docx" } },
        { id: "catalog_media", type: "media.catalog", position: { x: 40, y: 280 }, config: { root: "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ ", brollFolder: "Ins", coverFolder: "ภาพนิ่ง" } },
        { id: "gen_ai_background", type: "comfyui.workflow", position: { x: 40, y: 460 }, config: { workflowFile: "workflows/generate-background.api.json", patches: { "6.inputs.text": "cinematic modern dental research laboratory background, blue ambient lights, shallow depth of field" } } },
        { id: "preview_ai_bg", type: "preview.media", position: { x: 260, y: 460 }, config: { title: "AI Studio Background Preview" } },
        { id: "overlay_ai_bg", type: "timeline.overlay", position: { x: 480, y: 460 }, config: { track: 2, startMs: 0, durationMs: 4000 } },
        { id: "ae_title_bumper", type: "ae.channel_id_bumper", position: { x: 40, y: 640 }, config: { templateProject: "templates/after-effects/psu-broadcast-bumper.aep", branding: { title: "PSU BROADCAST", subtitle: "อาจารย์ตัวอย่าง ประจำปี 2569" } } },
        { id: "scene_bumper", type: "timeline.scene", position: { x: 260, y: 640 }, config: { startMs: 0, durationMs: 10000, track: 1 } },
        { id: "create_cutlist", type: "edit.cutlist", position: { x: 300, y: 100 }, config: { introDurationMs: 10000 } },
        { id: "match_broll", type: "editor.broll_match", position: { x: 300, y: 280 }, config: { maxPerSegment: 2 } },
        { id: "ar_card_display", type: "ar.floating_slides_3d", position: { x: 500, y: 640 }, config: { preset: "academic_profile_card", professorName: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์", faculty: "คณะทันตแพทยศาสตร์" } },
        { id: "overlay_ar_card", type: "timeline.overlay", position: { x: 740, y: 640 }, config: { track: 3, startMs: 1000, durationMs: 4000 } },
        { id: "review_approval", type: "review.approval", position: { x: 540, y: 280 }, config: { prompt: "ตรวจและอนุมัติ B-roll สำหรับแต่ละช่วงบทสัมภาษณ์" } },
        { id: "conform_interview", type: "media.conform", position: { x: 540, y: 100 }, config: { cacheRoot: ".ava-cache/conform", profile: "1080p25" } },
        { id: "climax_quote_card", type: "effect.cinematic_title", position: { x: 740, y: 460 }, config: { headline: "ทำหน้าที่ของตัวเองให้ดีที่สุด ทำด้วยความรักและสนุก", theme: "gold_particles_reveal" } },
        { id: "overlay_climax_quote", type: "timeline.overlay", position: { x: 960, y: 460 }, config: { track: 4, startMs: 5000, durationMs: 4000 } },
        { id: "stack_broll", type: "timeline.broll_stack", position: { x: 780, y: 280 }, config: { maxDurationMs: 5000 } },
        { id: "dialogue_mix", type: "audio.dialogue_mix", position: { x: 780, y: 100 }, config: {} },
        { id: "compose_timeline", type: "timeline.compose", position: { x: 1060, y: 280 }, config: { name: "DOCUMENTARY_MAIN" } },
        { id: "build_premiere", type: "premiere.build", position: { x: 1300, y: 280 }, config: { outputProject: "outputs/premiere/documentary-story.prproj", sequenceName: "DOCUMENTARY_MASTER", sequencePresetPath: PREMIERE_BETA_SEQUENCE, save: true } },
        { id: "export_premiere", type: "premiere.export", position: { x: 1540, y: 280 }, config: { project: "outputs/premiere/documentary-story.prproj", sequenceName: "DOCUMENTARY_MASTER", exports: [{ format: "h264", output: "exports/documentary-master.mp4", presetPath: H264_PRESET }] } },
        { id: "preview_master", type: "preview.media", position: { x: 1780, y: 280 }, config: { title: "Master Broadcast MP4 Preview" } },
        { id: "qc_master", type: "qc.timeline", position: { x: 2020, y: 280 }, config: {} }
      ],
      edges: [
        { id: "edge_doc_cut", from: { nodeId: "import_storyboard", port: "storyboard" }, to: { nodeId: "create_cutlist", port: "storyboard" } },
        { id: "edge_cat_cut", from: { nodeId: "catalog_media", port: "catalog" }, to: { nodeId: "create_cutlist", port: "catalog" } },
        { id: "edge_doc_match", from: { nodeId: "import_storyboard", port: "storyboard" }, to: { nodeId: "match_broll", port: "storyboard" } },
        { id: "edge_cat_match", from: { nodeId: "catalog_media", port: "catalog" }, to: { nodeId: "match_broll", port: "catalog" } },
        { id: "edge_match_appr", from: { nodeId: "match_broll", port: "proposal" }, to: { nodeId: "review_approval", port: "proposal" } },
        { id: "edge_cut_conf", from: { nodeId: "create_cutlist", port: "cutlist" }, to: { nodeId: "conform_interview", port: "cutlist" } },
        { id: "edge_appr_conf", from: { nodeId: "review_approval", port: "approval" }, to: { nodeId: "conform_interview", port: "approval" } },
        { id: "edge_cut_stack", from: { nodeId: "create_cutlist", port: "cutlist" }, to: { nodeId: "stack_broll", port: "cutlist" } },
        { id: "edge_appr_stack", from: { nodeId: "review_approval", port: "approval" }, to: { nodeId: "stack_broll", port: "approval" } },
        { id: "edge_cut_dia", from: { nodeId: "create_cutlist", port: "cutlist" }, to: { nodeId: "dialogue_mix", port: "cutlist" } },
        { id: "edge_conf_comp", from: { nodeId: "conform_interview", port: "scenes" }, to: { nodeId: "compose_timeline", port: "scenes" } },
        { id: "edge_stack_comp", from: { nodeId: "stack_broll", port: "overlays" }, to: { nodeId: "compose_timeline", port: "overlays" } },
        { id: "edge_bg_prev", from: { nodeId: "gen_ai_background", port: "image" }, to: { nodeId: "preview_ai_bg", port: "source" } },
        { id: "edge_prev_bg_ovl", from: { nodeId: "preview_ai_bg", port: "passthrough" }, to: { nodeId: "overlay_ai_bg", port: "asset" } },
        { id: "edge_ovl_bg_comp", from: { nodeId: "overlay_ai_bg", port: "overlay" }, to: { nodeId: "compose_timeline", port: "overlays" } },
        { id: "edge_bmp_scene", from: { nodeId: "ae_title_bumper", port: "video" }, to: { nodeId: "scene_bumper", port: "source" } },
        { id: "edge_scene_bmp_comp", from: { nodeId: "scene_bumper", port: "scene" }, to: { nodeId: "compose_timeline", port: "scenes" } },
        { id: "edge_ar_ovl", from: { nodeId: "ar_card_display", port: "arElementsVideo" }, to: { nodeId: "overlay_ar_card", port: "asset" } },
        { id: "edge_ovl_comp", from: { nodeId: "overlay_ar_card", port: "overlay" }, to: { nodeId: "compose_timeline", port: "overlays" } },
        { id: "edge_climax_ovl", from: { nodeId: "climax_quote_card", port: "video" }, to: { nodeId: "overlay_climax_quote", port: "asset" } },
        { id: "edge_climax_comp", from: { nodeId: "overlay_climax_quote", port: "overlay" }, to: { nodeId: "compose_timeline", port: "overlays" } },
        { id: "edge_comp_build", from: { nodeId: "compose_timeline", port: "timeline" }, to: { nodeId: "build_premiere", port: "timeline" } },
        { id: "edge_build_export", from: { nodeId: "build_premiere", port: "project" }, to: { nodeId: "export_premiere", port: "project" } },
        { id: "edge_export_prev", from: { nodeId: "export_premiere", port: "exports" }, to: { nodeId: "preview_master", port: "source" } },
        { id: "edge_comp_qc", from: { nodeId: "compose_timeline", port: "timeline" }, to: { nodeId: "qc_master", port: "timeline" } },
        { id: "edge_export_qc", from: { nodeId: "export_premiere", port: "exports" }, to: { nodeId: "qc_master", port: "exports" } }
      ],
      order: [
        "import_storyboard",
        "catalog_media",
        "gen_ai_background",
        "preview_ai_bg",
        "overlay_ai_bg",
        "ae_title_bumper",
        "scene_bumper",
        "create_cutlist",
        "match_broll",
        "ar_card_display",
        "overlay_ar_card",
        "review_approval",
        "conform_interview",
        "climax_quote_card",
        "overlay_climax_quote",
        "stack_broll",
        "dialogue_mix",
        "compose_timeline",
        "build_premiere",
        "export_premiere",
        "preview_master",
        "qc_master"
      ]
    };
  }

  if (packageId === "broadcast-news-falcon-2box-v1") {
    return {
      schemaVersion: 1,
      graphId,
      name: options.name?.trim() || "Broadcast News & Field Report (2-Box DVE & Ticker)",
      description: "แพ็กเกจข่าวสถานีโทรทัศน์: รวมสัญญาณห้องส่ง + กล้องภาคสนาม Falcon WebRTC เป็น 2-Box DVE พร้อมแถบข่าวด่วนและตัววิ่ง Ticker Crawl",
      revision: 0,
      profile: { id: "landscape", width: 1920, height: 1080, frameRate: 25 },
      durationFrames: 500,
      variables: {},
      settings: STARTER_SETTINGS,
      nodes: [
        { id: "select_anchor", type: "asset.select", position: { x: 40, y: 100 }, config: { path: "assets/input/anchor-studio.mov" } },
        { id: "select_field", type: "asset.select", position: { x: 40, y: 280 }, config: { path: "assets/input/field-cam.mp4" } },
        { id: "split_2box", type: "video.split_screen_2box", position: { x: 320, y: 190 }, config: { leftLabel: "STUDIO / ศูนย์ข่าวหาดใหญ่", rightLabel: "LIVE / รายงานสดภาคสนาม" } },
        { id: "news_strap", type: "graphics.news_strap", position: { x: 580, y: 100 }, config: { headline: "รายงานพิเศษ: สถานการณ์ล่าสุด ม.อ.", subline: "ศูนย์ข่าวภาคใต้ รายงานสด" } },
        { id: "ticker_crawl", type: "graphics.ticker_crawl", position: { x: 580, y: 280 }, config: { badgeText: "PSU NEWS UPDATE", items: ["ม.อ. เปิดศูนย์ประสานงานฉุกเฉิน", "ติดตามข่าวสารแบบเรียลไทม์"] } },
        { id: "compose_timeline", type: "timeline.compose", position: { x: 840, y: 190 }, config: { name: "NEWS_PACKAGE_MAIN" } }
      ],
      edges: [
        { id: "e1", from: { nodeId: "select_anchor", port: "path" }, to: { nodeId: "split_2box", port: "leftSource" } },
        { id: "e2", from: { nodeId: "select_field", port: "path" }, to: { nodeId: "split_2box", port: "rightSource" } },
        { id: "e3", from: { nodeId: "split_2box", port: "scene" }, to: { nodeId: "compose_timeline", port: "scenes" } },
        { id: "e4", from: { nodeId: "news_strap", port: "overlay" }, to: { nodeId: "compose_timeline", port: "overlays" } },
        { id: "e5", from: { nodeId: "ticker_crawl", port: "overlay" }, to: { nodeId: "compose_timeline", port: "overlays" } }
      ],
      order: ["select_anchor", "select_field", "split_2box", "news_strap", "ticker_crawl", "compose_timeline"]
    };
  }

  if (packageId === "social-vertical-reframe-teaser-v1") {
    return {
      schemaVersion: 1,
      graphId,
      name: options.name?.trim() || "Vertical Social Reel 9:16 (Smart Reframe & Beat Sync)",
      description: "วิดีโอแนวตั้งสำหรับ TikTok / Reels / Shorts: แปลง 16:9 เป็น 9:16 อัตโนมัติ พร้อมตรวจจับจังหวะเพลง (BPM Beat Grid) และคัตติ้งตรงจังหวะ",
      revision: 0,
      profile: { id: "portrait", width: 1080, height: 1920, frameRate: 25 },
      durationFrames: 375,
      variables: {},
      settings: STARTER_SETTINGS,
      nodes: [
        { id: "select_video", type: "asset.select", position: { x: 40, y: 100 }, config: { path: "assets/input/master-footage.mp4" } },
        { id: "select_audio", type: "audio.asset", position: { x: 40, y: 280 }, config: { path: "assets/input/beat-soundtrack.wav" } },
        { id: "reframe_916", type: "video.smart_reframe", position: { x: 320, y: 100 }, config: { mode: "blurred_pillar" } },
        { id: "beat_detect", type: "audio.beat_detect", position: { x: 320, y: 280 }, config: { defaultBpm: 128 } },
        { id: "compose_timeline", type: "timeline.compose", position: { x: 620, y: 190 }, config: { name: "VERTICAL_REEL_916" } }
      ],
      edges: [
        { id: "e1", from: { nodeId: "select_video", port: "path" }, to: { nodeId: "reframe_916", port: "source" } },
        { id: "e2", from: { nodeId: "select_audio", port: "path" }, to: { nodeId: "beat_detect", port: "audioPath" } },
        { id: "e3", from: { nodeId: "reframe_916", port: "reframeVideo" }, to: { nodeId: "compose_timeline", port: "scenes" } }
      ],
      order: ["select_video", "select_audio", "reframe_916", "beat_detect", "compose_timeline"]
    };
  }

  if (packageId === "commercial-promo-smart-ducking-v1") {
    return {
      schemaVersion: 1,
      graphId,
      name: options.name?.trim() || "Commercial Promo (Smart Audio Ducking & Color Grading)",
      description: "วิดีโอโปรโมตและสปอตโฆษณา: ปรับโทนสีภาพ Cinematic 3D LUT + S-Curve และมิกซ์เสียงหลบเพลงอัจฉริยะ (Smart Sidechain Ducking -18dB) มาตรฐาน EBU R128",
      revision: 0,
      profile: { id: "landscape", width: 1920, height: 1080, frameRate: 25 },
      durationFrames: 750,
      variables: {},
      settings: STARTER_SETTINGS,
      nodes: [
        { id: "select_footage", type: "asset.select", position: { x: 40, y: 80 }, config: { path: "assets/input/promo-raw.mov" } },
        { id: "select_dialogue", type: "audio.asset", position: { x: 40, y: 240 }, config: { path: "assets/input/voiceover.wav" } },
        { id: "select_music", type: "audio.asset", position: { x: 40, y: 380 }, config: { path: "assets/input/bgm.wav" } },
        { id: "color_grade", type: "video.color_grade", position: { x: 320, y: 80 }, config: { contrast: 1.15, saturation: 1.1, vignette: true } },
        { id: "smart_ducking", type: "audio.smart_ducking", position: { x: 320, y: 300 }, config: { duckDepthDb: -18, targetLufs: -16.0 } },
        { id: "compose_timeline", type: "timeline.compose", position: { x: 640, y: 190 }, config: { name: "PROMO_MASTER" } }
      ],
      edges: [
        { id: "e1", from: { nodeId: "select_footage", port: "path" }, to: { nodeId: "color_grade", port: "source" } },
        { id: "e2", from: { nodeId: "select_dialogue", port: "path" }, to: { nodeId: "smart_ducking", port: "dialogue" } },
        { id: "e3", from: { nodeId: "select_music", port: "path" }, to: { nodeId: "smart_ducking", port: "music" } },
        { id: "e4", from: { nodeId: "color_grade", port: "gradedVideo" }, to: { nodeId: "compose_timeline", port: "scenes" } },
        { id: "e5", from: { nodeId: "smart_ducking", port: "masterAudio" }, to: { nodeId: "compose_timeline", port: "audio" } }
      ],
      order: ["select_footage", "select_dialogue", "select_music", "color_grade", "smart_ducking", "compose_timeline"]
    };
  }

  if (packageId === "courseware-lecture-sidebyside-v1") {
    return {
      schemaVersion: 1,
      graphId,
      name: options.name?.trim() || "Courseware & Workshop (70/30 Side-by-Side & Step Timer)",
      description: "สื่อการสอนและการอบรมเชิงปฏิบัติการ: จัดวางเลย์เอาต์สไลด์คู่ผู้สอน 70/30 พร้อมตรวจจับการเปลี่ยนสไลด์และใส่นาฬิกานับถอยหลังขั้นตอน",
      revision: 0,
      profile: { id: "landscape", width: 1920, height: 1080, frameRate: 25 },
      durationFrames: 1000,
      variables: {},
      settings: STARTER_SETTINGS,
      nodes: [
        { id: "select_presenter", type: "asset.select", position: { x: 40, y: 100 }, config: { path: "assets/input/teacher-camera.mp4" } },
        { id: "select_slide", type: "asset.select", position: { x: 40, y: 280 }, config: { path: "assets/input/lecture-slides.mp4" } },
        { id: "side_by_side", type: "layout.side_by_side", position: { x: 320, y: 190 }, config: { layoutMode: "slide_major_70_30" } },
        { id: "countdown_timer", type: "graphics.countdown_timer", position: { x: 580, y: 100 }, config: { durationSeconds: 60, stepNumber: 1, stepTitle: "Demonstration" } },
        { id: "lower_third", type: "graphics.lower_third", position: { x: 580, y: 280 }, config: { speakerName: "วิทยากรผู้บรรยาย", academicTitle: "การบรรยายเชิงปฏิบัติการ" } },
        { id: "compose_timeline", type: "timeline.compose", position: { x: 840, y: 190 }, config: { name: "COURSEWARE_MAIN" } }
      ],
      edges: [
        { id: "e1", from: { nodeId: "select_presenter", port: "path" }, to: { nodeId: "side_by_side", port: "presenterSource" } },
        { id: "e2", from: { nodeId: "select_slide", port: "path" }, to: { nodeId: "side_by_side", port: "slideSource" } },
        { id: "e3", from: { nodeId: "side_by_side", port: "scene" }, to: { nodeId: "compose_timeline", port: "scenes" } },
        { id: "e4", from: { nodeId: "countdown_timer", port: "overlay" }, to: { nodeId: "compose_timeline", port: "overlays" } },
        { id: "e5", from: { nodeId: "lower_third", port: "overlay" }, to: { nodeId: "compose_timeline", port: "overlays" } }
      ],
      order: ["select_presenter", "select_slide", "side_by_side", "countdown_timer", "lower_third", "compose_timeline"]
    };
  }

  throw Object.assign(new Error(`Unknown workflow package '${packageId}'`), { statusCode: 404 });
}

export const portraitStoryRecipe = {
  manifestVersion: 1,
  recipeId: "portrait-story-v1",
  name: "Portrait Story",
  description: "ภาพบุคคลแนวตั้ง 1080 × 1920 ความยาว 5 วินาที พร้อมฉากหลัง AI, doodle ตายตัว, AE render และ Premiere project",
  format: "1080x1920",
  durationSeconds: 5,
  steps: 7,
  fixedStyleSuffix: STYLE_SUFFIX,
  fields: {
    projectName: { min: 1, max: 80 },
    headline: { min: 1, max: 32 },
    subheadline: { min: 1, max: 64 },
    backgroundBrief: { min: 10, max: 500 }
  }
} as const;

export function validatePortraitStoryManifest(manifest: unknown): Array<{ field: string; code: string; message: string }> {
  const value = manifest as Partial<PortraitStoryManifestV1> | undefined;
  const errors: Array<{ field: string; code: string; message: string }> = [];
  if (!value || value.manifestVersion !== 1 || value.recipeId !== "portrait-story-v1") {
    errors.push({ field: "recipeId", code: "invalid_recipe", message: "Unsupported recipe manifest" });
    return errors;
  }
  checkText("id", value.id, 1, 80, errors);
  checkText("projectName", value.projectName, 1, 80, errors);
  checkText("headline", value.headline, 1, 32, errors);
  checkText("subheadline", value.subheadline, 1, 64, errors);
  checkText("backgroundBrief", value.backgroundBrief, 10, 500, errors);
  if (!value.presenterAsset?.assetId || !value.presenterAsset.projectPath) {
    errors.push({ field: "presenterAsset", code: "required", message: "กรุณาเลือกภาพ presenter" });
  }
  if (value.presenterAsset && !["image/png", "image/jpeg", "image/webp"].includes(value.presenterAsset.mimeType)) {
    errors.push({ field: "presenterAsset", code: "invalid_type", message: "รองรับ PNG, JPEG และ WebP เท่านั้น" });
  }
  return errors;
}

function checkText(field: string, value: unknown, min: number, max: number, errors: Array<{ field: string; code: string; message: string }>) {
  const length = typeof value === "string" ? value.trim().length : 0;
  if (length < min || length > max) errors.push({ field, code: "length", message: `${field} ต้องมี ${min}–${max} ตัวอักษร` });
}

export function compilePortraitStory(manifest: PortraitStoryManifestV1): { workflow: WorkflowV1; raw: string; digest: string } {
  const errors = validatePortraitStoryManifest(manifest);
  if (errors.length) throw new Error(errors.map((error) => `${error.field}: ${error.message}`).join("\n"));
  const safeId = manifest.id.replace(/[^A-Za-z0-9_-]/g, "_").replace(/^_+|_+$/g, "") || "job";
  const workflow: WorkflowV1 = {
    schemaVersion: 1,
    id: `portrait_story_${safeId}`,
    name: manifest.projectName.trim(),
    variables: { headline: manifest.headline.trim(), subheadline: manifest.subheadline.trim() },
    settings: {
      runRoot: "prototype-runs",
      stepTimeoutMs: 1_200_000,
      retryAttempts: 1,
      pollIntervalMs: 1_500,
      services: { comfyui: { baseUrl: "http://10.135.66.70:8188", clientId: "psu-ava-ui" } },
      adobe: {
        afterEffects: { applicationId: "com.adobe.AfterEffects.application", aerenderPath: "/Applications/Adobe After Effects 2026/aerender" },
        premiere: { applicationName: "Adobe Premiere Pro (Beta)", requiredVersion: PREMIERE_BETA_VERSION, bridgeHost: "127.0.0.1", bridgePort: 47652, bridgeMailbox: "/tmp/psu-ava-premiere-bridge", launch: true }
      }
    },
    steps: [
      { id: "select_presenter", type: "asset.select", with: { path: manifest.presenterAsset.projectPath } },
      { id: "remove_background", type: "image.removeBackground", timeoutMs: 300_000, with: { path: "${steps.select_presenter.outputs.path}", output: "media/presenter-cutout/presenter.png" } },
      { id: "generate_background", type: "comfyui.workflow", timeoutMs: 900_000, with: { workflowFile: "workflows/generate-background.api.json", patches: { "6.inputs.text": `${manifest.backgroundBrief.trim()}, ${STYLE_SUFFIX}` }, downloadDir: "media/generated-background" } },
      { id: "fixed_design", type: "template.payload", with: { text: { TITLE: "${workflow.variables.headline}", SUBTITLE: "${workflow.variables.subheadline}" }, footage: { PORTRAIT: "${steps.remove_background.outputs.path}", BACKGROUND: "${steps.generate_background.outputs.images.0.localPath}" } } },
      {
        id: "remotion_render",
        type: "remotion.render",
        timeoutMs: 600_000,
        with: {
          composition: "VerticalComposition",
          output: "renders/portrait-story.mp4",
          props: {
            title: "${workflow.variables.headline}",
            items: [
              {
                id: "cover_story",
                kind: "cover_card",
                durationMs: 5000,
                params: {
                  title: "${workflow.variables.headline}",
                  subtitle: "${workflow.variables.subheadline}",
                  sourceImage: "${steps.generate_background.outputs.images.0.localPath}"
                }
              }
            ]
          }
        }
      }
    ]
  };
  const raw = `${JSON.stringify(workflow, null, 2)}\n`;
  return { workflow, raw, digest: createHash("sha256").update(raw).digest("hex") };
}
