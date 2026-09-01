import { batchFolderAssets, selectAsset, selectMultiAsset, templatePayload } from "./builtin.js";
import { runLlmChat } from "./llm.js";
import { runComfyWorkflow } from "./comfyui.js";
import { composeCoverTitle, lumaToAlpha, removeBackground, resizeImage } from "./image.js";
import { bindAfterEffectsTemplate, renderAfterEffects } from "./after-effects.js";
import { runEffect3DCarousel } from "./effect-3d-carousel.js";
import { assemblePremiere, buildPremiere, exportPremiere } from "./premiere.js";
import { probeMedia } from "./media.js";
import { generateJaiTts, mixAudio, normalizeMasterAudio, qcAudioLoudness, selectAudioAsset } from "./audio.js";
import { composeTimeline, createTimelineDynamicLink, createTimelineGraphicMogrt, createTimelineOverlay, createTimelineScene, createTimelineTransition } from "./timeline.js";
import { catalogMedia, conformMedia, createBrollStack, createCutlist, createDialogueMix, createTemplateCards, importDocxStoryboard, matchBroll, qcTimeline, reviewApproval, reviewMediaApproval } from "./documentary.js";
import { renderCountdownTimer, renderLowerThird, renderNewsStrap, renderTickerCrawl } from "./broadcast-graphics.js";
import { createSideBySideLayout, createSplitScreen2Box, reframeToVertical } from "./smart-layout.js";
import { colorGradeVideo, detectAudioBeats, smartAudioDucking } from "./color-audio-advanced.js";
import { renderChannelIdBumper, renderCinematicTitle, renderDeviceMockup3D, renderKineticTitles, renderKpiDashboard, renderProcessGraph, renderProgramRundown, renderSaaSTourCursor, renderSocialStickerPack, renderSpeechVisualizer } from "./ae-motion-suite.js";
import { compileScientificPrompt, renderAiParallax25D, renderCausticsFluidDiffusion, renderCyberpunkVfx, renderScientificHud, renderVolumetricParticles3D, runArchivalRestore, runControlNetStyleTransfer, runLatentMorph, runScientificMotion } from "./ai-storytelling-suite.js";
import { renderArFloatingSlides, renderArCameraMovement } from "./ar-suite.js";
import { audioExtract, coalesceFallback, dataInspectorQc, durationPad, fileIntegrityGuard, formatString, jsonQueryExtract, losslessTrim, mediaTranscode, switchBranch, timecodeMath } from "./utility-suite.js";
import { renderCustomTypography } from "./typography-engine.js";
import { generateCaptions } from "./caption-generator.js";
import { previewMedia } from "./preview.js";
export { commitAdapterCompletion } from "./completion.js";

export const adapters = {
  "asset.select": selectAsset,
  "asset.multi_select": selectMultiAsset,
  "asset.batch_folder": batchFolderAssets,
  "template.payload": templatePayload,
  "llm.chat": runLlmChat,
  "comfyui.workflow": runComfyWorkflow,
  "image.removeBackground": removeBackground,
  "image.resize": resizeImage,
  "image.luma_to_alpha": lumaToAlpha,
  "graphics.cover_title": composeCoverTitle,
  "ae.template": bindAfterEffectsTemplate,
  "ae.render": renderAfterEffects,
  "effect.3d_carousel": runEffect3DCarousel,
  "media.probe": probeMedia,
  "timeline.scene": createTimelineScene,
  "timeline.transition": createTimelineTransition,
  "timeline.overlay": createTimelineOverlay,
  "timeline.graphic_mogrt": createTimelineGraphicMogrt,
  "timeline.dynamic_link": createTimelineDynamicLink,
  "timeline.compose": composeTimeline,
  "audio.asset": selectAudioAsset,
  "audio.jaitts": generateJaiTts,
  "audio.mix": mixAudio,
  "media.audio_normalize": normalizeMasterAudio,
  "premiere.assemble": assemblePremiere,
  "premiere.build": buildPremiere,
  "premiere.export": exportPremiere
  ,"storyboard.docx_import": importDocxStoryboard
  ,"media.catalog": catalogMedia
  ,"edit.cutlist": createCutlist
  ,"editor.broll_match": matchBroll
  ,"review.approval": reviewApproval
  ,"review.media_approval": reviewMediaApproval
  ,"media.conform": conformMedia
  ,"timeline.broll_stack": createBrollStack
  ,"audio.dialogue_mix": createDialogueMix
  ,"audio.loudness_qc": qcAudioLoudness
  ,"graphics.template_card": createTemplateCards
  ,"qc.timeline": qcTimeline
  ,"audio.smart_ducking": smartAudioDucking
  ,"video.color_grade": colorGradeVideo
  ,"video.split_screen_2box": createSplitScreen2Box
  ,"layout.side_by_side": createSideBySideLayout
  ,"video.smart_reframe": reframeToVertical
  ,"graphics.news_strap": renderNewsStrap
  ,"graphics.lower_third": renderLowerThird
  ,"graphics.ticker_crawl": renderTickerCrawl
  ,"graphics.countdown_timer": renderCountdownTimer
  ,"audio.beat_detect": detectAudioBeats
  ,"effect.zoom_callout": renderLowerThird
  ,"vision.slide_detect": createTemplateCards
  ,"ae.channel_id_bumper": renderChannelIdBumper
  ,"ae.program_rundown": renderProgramRundown
  ,"ae.kinetic_titles": renderKineticTitles
  ,"ae.speech_visualizer": renderSpeechVisualizer
  ,"graphics.kpi_dashboard": renderKpiDashboard
  ,"graphics.process_graph": renderProcessGraph
  ,"ae.device_mockup_3d": renderDeviceMockup3D
  ,"ae.saas_tour_cursor": renderSaaSTourCursor
  ,"effect.cinematic_title": renderCinematicTitle
  ,"graphics.social_sticker_pack": renderSocialStickerPack
  ,"comfyui.archival_restore": runArchivalRestore
  ,"ae.ai_parallax_25d": renderAiParallax25D
  ,"prompt.scientific_conditioning": compileScientificPrompt
  ,"comfyui.scientific_motion": runScientificMotion
  ,"ae.volumetric_particles_3d": renderVolumetricParticles3D
  ,"graphics.scientific_hud": renderScientificHud
  ,"comfyui.controlnet_style_transfer": runControlNetStyleTransfer
  ,"ae.cyberpunk_vfx": renderCyberpunkVfx
  ,"comfyui.latent_morph": runLatentMorph
  ,"ae.caustics_fluid_diffusion": renderCausticsFluidDiffusion
  ,"ar.floating_slides_3d": renderArFloatingSlides
  ,"ar.camera_movement_3d": renderArCameraMovement
  ,"util.switch_branch": switchBranch
  ,"util.coalesce_fallback": coalesceFallback
  ,"util.string_formatter": formatString
  ,"util.json_query_extract": jsonQueryExtract
  ,"util.media_transcode": mediaTranscode
  ,"util.audio_extract": audioExtract
  ,"util.lossless_trim": losslessTrim
  ,"util.timecode_math": timecodeMath
  ,"util.duration_pad": durationPad
  ,"util.data_inspector_qc": dataInspectorQc
  ,"util.file_integrity_guard": fileIntegrityGuard
  ,"typography.custom_render": renderCustomTypography
  ,"caption.generate": generateCaptions
  ,"preview.media": previewMedia
  ,"preview.video": previewMedia
  ,"preview.image": previewMedia
};
