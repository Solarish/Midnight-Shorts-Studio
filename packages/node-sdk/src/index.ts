import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import {
  GRAPH_FRAME_RATE,
  GRAPH_MAX_DURATION_FRAMES,
  GRAPH_MAX_SCENES,
  type GraphDefinitionV1,
  type GraphDiagnosticV1,
  type GraphNodeV1,
  type GraphPortTypeV1,
  type GraphProfileIdV1,
  type GraphProfileV1,
  type GraphValidationResultV1,
  type NodeLifecycleStageV1,
  type NodeDescriptorV1,
  type StepType,
  type WorkflowStep,
  type WorkflowV1
} from "@psu-ava/contracts";

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export const graphProfiles: Readonly<Record<GraphProfileIdV1, GraphProfileV1>> = Object.freeze({
  portrait: Object.freeze({ id: "portrait", width: 1080, height: 1920, frameRate: GRAPH_FRAME_RATE }),
  landscape: Object.freeze({ id: "landscape", width: 1920, height: 1080, frameRate: GRAPH_FRAME_RATE }),
  square: Object.freeze({ id: "square", width: 1080, height: 1080, frameRate: GRAPH_FRAME_RATE })
});

const canonicalNodeMetadata = {
  "asset.select": {
    lifecycleStage: "assets",
    description: "เลือกไฟล์สื่อจากโปรเจกต์เพื่อใช้เป็นอินพุตของเวิร์กโฟลว์"
  },
  "asset.multi_select": {
    lifecycleStage: "assets",
    description: "เลือกไฟล์ภาพหรือวิดีโอหลายไฟล์พร้อมกันเป็นชุดข้อมูลสื่อ (Multi-Asset Batch)"
  },
  "asset.batch_folder": {
    lifecycleStage: "assets",
    description: "ดึงไฟล์ภาพหรือวิดีโอทั้งหมดจากโฟลเดอร์ที่กำหนดอัตโนมัติ"
  },
  "image.removeBackground": {
    lifecycleStage: "process",
    description: "ตัดพื้นหลังออกจากภาพด้วย Apple Vision และส่งออกเป็นภาพโปร่งใส"
  },
  "image.resize": {
    lifecycleStage: "process",
    description: "ปรับขนาด / ย่อขยายรูปภาพ (Rescale Image) ให้พอดีกับ Canvas ของวิดีโอ"
  },
  "image.luma_to_alpha": {
    lifecycleStage: "process",
    description: "แปลงความสว่างของ doodle ขาวบนดำเป็น alpha แบบรักษาขอบ anti-alias"
  },
  "graphics.cover_title": {
    lifecycleStage: "process",
    description: "คอมโพสิตข้อความหัวข้อภาษาไทยลงบนภาพปกฉบับสุดท้ายก่อนส่งให้ผู้ปฏิบัติงานอนุมัติ"
  },
  "template.payload": {
    lifecycleStage: "process",
    description: "จัดเตรียมข้อมูลข้อความและฟุตเทจสำหรับผูกเข้ากับเทมเพลต"
  },
  "llm.chat": {
    lifecycleStage: "process",
    description: "เรียก LLM เพื่อสร้างหรือแปลงข้อความและข้อมูลประกอบเวิร์กโฟลว์"
  },
  "comfyui.workflow": {
    lifecycleStage: "process",
    description: "ส่งเวิร์กโฟลว์ไปยัง ComfyUI เพื่อสร้างหรือปรับแต่งภาพ"
  },
  "remotion.render": {
    lifecycleStage: "export",
    description: "เรนเดอร์และประกอบวิดีโอจาก Remotion Composition (9:16, 16:9, 1:1) เป็นไฟล์ MP4 ความละเอียดสูง"
  },
  "effect.3d_carousel": {
    lifecycleStage: "build",
    description: "สร้างและประกอบ 3D Photo Carousel ใน Remotion พร้อมระบบ Modulo Auto-cycling และปรับแต่ง Pacing/Timing ได้ละเอียด"
  },
  "media.probe": {
    lifecycleStage: "assets",
    description: "ตรวจสอบชนิด ขนาด ความยาว และข้อมูลทางเทคนิคของไฟล์สื่อ"
  },
  "timeline.scene": {
    lifecycleStage: "timeline",
    description: "กำหนดคลิปหนึ่งฉาก พร้อมช่วงตัด เวลาเริ่ม ความยาว และแทร็ก"
  },
  "timeline.transition": {
    lifecycleStage: "timeline",
    description: "กำหนดการเปลี่ยนภาพระหว่างฉากบนไทม์ไลน์"
  },
  "timeline.overlay": {
    lifecycleStage: "timeline",
    description: "วางภาพหรือข้อความซ้อนตามตำแหน่ง เวลา และแทร็กที่กำหนด"
  },
  "timeline.graphic_mogrt": {
    lifecycleStage: "timeline",
    description: "วาง MOGRT พร้อมผูกข้อความที่ยังแก้ไขได้ใน Premiere Pro"
  },
  "timeline.dynamic_link": {
    lifecycleStage: "timeline",
    description: "นำเข้าและจัดวาง After Effects Composition บนไทม์ไลน์ผ่าน Dynamic Link โดยไม่ต้องเรนเดอร์ไฟล์วิดีโอ"
  },
  "timeline.compose": {
    lifecycleStage: "timeline",
    description: "รวมฉาก ทรานซิชัน โอเวอร์เลย์ และเสียงเป็น TimelineSpec เดียว"
  },
  "audio.asset": {
    lifecycleStage: "assets",
    description: "เลือกไฟล์เสียงและกำหนดบทบาท เวลาเริ่ม และระดับเสียง"
  },
  "audio.jaitts": {
    lifecycleStage: "process",
    description: "สร้างเสียงบรรยายภาษาไทยด้วย JaiTTS จากข้อความและเสียงที่เลือก"
  },
  "audio.mix": {
    lifecycleStage: "process",
    description: "ผสมเสียงหลายแทร็กด้วย FFmpeg พร้อมปรับความดังและ ducking"
  },
  "media.audio_normalize": {
    lifecycleStage: "export",
    description: "ปรับ loudness ของเสียงใน H.264 master โดยคง video bitstream เดิมก่อนตรวจ QC"
  },
  "premiere.build": {
    lifecycleStage: "build",
    description: "สร้าง sequence ใน Premiere จาก TimelineSpec และบันทึกไฟล์ PRPROJ"
  },
  "premiere.export": {
    lifecycleStage: "export",
    description: "ส่งออก sequence จาก Premiere เป็น H.264 และ ProRes ตาม preset"
  },
  "storyboard.docx_import": {
    lifecycleStage: "assets",
    description: "นำเข้าไฟล์สตอรี่บอร์ด DOCX และแปลงเป็นรายการสัมภาษณ์พร้อม Timecode"
  },
  "media.catalog": {
    lifecycleStage: "assets",
    description: "สแกนและจัดทำสารบัญไฟล์ภาพ วิดีโอ และเสียงจากโฟลเดอร์มีเดียทั้งหมด"
  },
  "edit.cutlist": {
    lifecycleStage: "timeline",
    description: "จับคู่รายการสัมภาษณ์กับไฟล์วิดีโอต้นทางเพื่อสร้าง Cutlist ตัดต่อเบื้องต้น"
  },
  "editor.broll_match": {
    lifecycleStage: "process",
    description: "จับคู่ B-roll อัตโนมัติตามเนื้อหาบทสัมภาษณ์เพื่อเสนอให้ผู้ตัดต่อตรวจสอบ"
  },
  "review.approval": {
    lifecycleStage: "process",
    description: "รอการตรวจและอนุมัติ B-roll จากผู้ปฏิบัติงานก่อนดำเนินการแปลงไฟล์"
  },
  "review.media_approval": {
    lifecycleStage: "process",
    description: "รอการตรวจและอนุมัติภาพปกหรือสื่อที่สร้างจาก AI ก่อนนำไปวางบนไทม์ไลน์"
  },
  "media.conform": {
    lifecycleStage: "build",
    description: "ตัดและแปลงไฟล์วิดีโอสัมภาษณ์ตาม Cutlist ให้เป็น ProRes พร้อมแคชผลลัพธ์"
  },
  "timeline.broll_stack": {
    lifecycleStage: "timeline",
    description: "สร้างเลเยอร์ภาพ B-roll ซ้อนบนคลิปสัมภาษณ์ตามรายการที่ได้รับอนุมัติ"
  },
  "audio.dialogue_mix": {
    lifecycleStage: "process",
    description: "รักษาเสียงสนทนาจากคลิปต้นฉบับสำหรับไทม์ไลน์ (ยังไม่มีการวัดหรือปรับระดับ Loudness อัตโนมัติ)"
  },
  "audio.loudness_qc": {
    lifecycleStage: "export",
    description: "วัดค่าความดังมาตรฐาน EBU (Integrated LUFS, True Peak, LRA) และตรวจจับช่วงเสียงเงียบ (Silence Detection) โดยไม่มีการปรับระดับเสียงอัตโนมัติ (QC เท่านั้น)"
  },
  "graphics.template_card": {
    lifecycleStage: "timeline",
    description: "สร้างกราฟิกการ์ดข้อความและไตเติลประกอบช่วงต่าง ๆ ของรายการ"
  },
  "qc.timeline": {
    lifecycleStage: "export",
    description: "ตรวจสอบความสมบูรณ์และคุณภาพของไทม์ไลน์ก่อนส่งออกไฟล์สำเร็จ"
  },
  "audio.smart_ducking": {
    lifecycleStage: "process",
    description: "จัดการเสียงพูดหลบเสียงดนตรี (Smart Ducking) แบบหลายบัสพร้อมปรับความดังระดับ EBU R128"
  },
  "video.color_grade": {
    lifecycleStage: "process",
    description: "ปรับแต่งโทนสีภาพ (Color Grade) ด้วย 3D LUT, S-Curve Contrast และ Vignette"
  },
  "video.split_screen_2box": {
    lifecycleStage: "timeline",
    description: "จัดวางวิดีโอ 2 ช่อง (2-Box DVE) สำหรับรายการข่าวและการสนทนาข้ามสตูดิโอ"
  },
  "layout.side_by_side": {
    lifecycleStage: "timeline",
    description: "จัดวางเลย์เอาต์สไลด์บรรยายคู่กับผู้สอน (70/30, 50/50, PiP) พร้อมระบบสลับอัตโนมัติ"
  },
  "video.smart_reframe": {
    lifecycleStage: "process",
    description: "ปรับสัดส่วนวิดีโอ 16:9 เป็น 9:16 แนวตั้งสำหรับ TikTok/Reels ด้วยการตรวจจับใบหน้าและวัตถุ"
  },
  "graphics.news_strap": {
    lifecycleStage: "timeline",
    description: "สร้างแถบชื่อและข้อความข่าวด่วน (Lower-Third Strap) สไตล์สถานีโทรทัศน์"
  },
  "graphics.lower_third": {
    lifecycleStage: "timeline",
    description: "สร้างกราฟิกแถบชื่อผู้บรรยายและตำแหน่งทางวิชาการ (Academic Lower-Third)"
  },
  "graphics.ticker_crawl": {
    lifecycleStage: "timeline",
    description: "สร้างแถบตัววิ่งข่าวสาร (News Ticker) ด้านล่างหน้าจออย่างต่อเนื่องและนุ่มนวล"
  },
  "graphics.countdown_timer": {
    lifecycleStage: "timeline",
    description: "สร้างนาฬิกานับถอยหลังและป้ายกำกับขั้นตอนการทดลองสำหรับสื่อการเรียนการสอน"
  },
  "audio.beat_detect": {
    lifecycleStage: "process",
    description: "วิเคราะห์จังหวะดนตรี (BPM & Beat Grid) เพื่อตัดต่อคลิปให้ตรงกับจังหวะเพลง"
  },
  "effect.zoom_callout": {
    lifecycleStage: "timeline",
    description: "สร้างแว่นขยายเน้นจุดสำคัญ (Magnifier Loupe) บนรายละเอียดการสาธิต"
  },
  "vision.slide_detect": {
    lifecycleStage: "process",
    description: "ตรวจจับจังหวะการเปลี่ยนสไลด์บรรยายอัตโนมัติด้วยการวิเคราะห์ภาพ (Slide Transition Detection)"
  },
  "ae.channel_id_bumper": {
    lifecycleStage: "build",
    description: "สร้างไตเติ้ลสถานี 3D Holographic / Glassmorphic ID Bumper พร้อมประกายแสงและแอนิเมชันกล้อง 3 มิติ"
  },
  "ae.program_rundown": {
    lifecycleStage: "build",
    description: "สร้างผังรายการออกอากาศแบบหลายช่อง (Multi-Slot Rundown Board) พร้อมซิงก์นาฬิกาและป้าย On-Air"
  },
  "ae.kinetic_titles": {
    lifecycleStage: "build",
    description: "สร้างไตเติ้ลข้อความเคลื่อนไหว Kinetic Typography พร้อมระบบฟิสิกส์ Squash & Stretch และ 3D Wave Reveal"
  },
  "ae.speech_visualizer": {
    lifecycleStage: "build",
    description: "สร้างภาพสเปกตรัมคลื่นเสียงพอดแคสต์ (Audio Spectrum Visualizer) พร้อมกล่องข้อความบรรยายคำต่อคำ"
  },
  "graphics.kpi_dashboard": {
    lifecycleStage: "timeline",
    description: "สร้างแดชบอร์ดอินโฟกราฟิกตัวเลขสถิติ KPI พร้อมตัวเลขนับขึ้น (Count-Up) และวงแหวนแสดงความก้าวหน้า"
  },
  "graphics.process_graph": {
    lifecycleStage: "timeline",
    description: "สร้างผังขั้นตอนการทำงาน (Process Flowchart) พร้อมเส้นเชื่อมต่อแสงนีออนและอนุภาคข้อมูลเคลื่อนที่"
  },
  "ae.device_mockup_3d": {
    lifecycleStage: "build",
    description: "สร้างแอนิเมชันโมเดลสมาร์ตโฟน/แท็บเล็ต 3 มิติลอยตัว พร้อมจำลองการเลื่อนหน้าจอและการแตะสัมผัส"
  },
  "ae.saas_tour_cursor": {
    lifecycleStage: "build",
    description: "สร้างวิดีโอแนะนำระบบ SaaS/เว็บไซต์ พร้อมเส้นทางการเคลื่อนที่ของเคอร์เซอร์เมาส์และแว่นขยายจุดสำคัญ"
  },
  "effect.cinematic_title": {
    lifecycleStage: "build",
    description: "สร้างไตเติ้ลภาพยนตร์ระดับฮอลลีวูด (Cinematic Title) พร้อมหมอกควัน อนุภาคละออง และแสงแฟลร์เลนส์"
  },
  "graphics.social_sticker_pack": {
    lifecycleStage: "timeline",
    description: "สร้างชุดสติกเกอร์และปุ่มโซเชียลมีเดีย (Subscribe, Like, QR Code) พร้อมฟิสิกส์การเด้งแบบสปริง"
  },
  "comfyui.archival_restore": {
    lifecycleStage: "process",
    description: "ฟื้นฟูภาพถ่ายเก่าในอดีต (B&W Restoration) พร้อมลงสีอัตโนมัติและสกัด Depth Map 16-bit"
  },
  "ae.ai_parallax_25d": {
    lifecycleStage: "build",
    description: "สร้างแอนิเมชันภาพ 2.5D Parallax Camera Projection ขยับมุมกล้อง 3 มิติจากภาพนิ่งและ Depth Map"
  },
  "prompt.scientific_conditioning": {
    lifecycleStage: "process",
    description: "คอมไพล์ Prompt เชิงวิทยาศาสตร์และนาโนเทคโนโลยีขั้นสูง พร้อมสเกลนาโนเมตรและฟิสิกส์การถ่ายภาพ FE-SEM"
  },
  "comfyui.scientific_motion": {
    lifecycleStage: "process",
    description: "สร้างคลิปวิดีโอเคลื่อนไหวเชิงวิทยาศาสตร์ด้วย AnimateDiff / Wan2.1 พร้อมสกัด Depth Map"
  },
  "ae.volumetric_particles_3d": {
    lifecycleStage: "build",
    description: "สร้างอนุภาคประจุไอออนเรืองแสง 3 มิติ (3D Volumetric Ions) พร้อมวงโคจรกล้อง 360 องศา"
  },
  "graphics.scientific_hud": {
    lifecycleStage: "timeline",
    description: "สร้าง HUD กราฟิกแสดงสูตรทางเคมีและการวัดผลระดับนาโนเมตร (Molecular Telemetry HUD)"
  },
  "comfyui.controlnet_style_transfer": {
    lifecycleStage: "process",
    description: "แปลงสไตล์ภาพด้วย ControlNet Depth / Lineart (ภาพถ่ายความร้อน FLIR / วิสัยทัศน์กลางคืน NVG / Cyberpunk)"
  },
  "ae.cyberpunk_vfx": {
    lifecycleStage: "build",
    description: "สร้างเอฟเฟกต์ไซเบอร์พังก์ (Chromatic Aberration RGB Split, เส้นสแกนไลฟ์ และแสงแฟลร์เลนส์อนามอร์ฟิก)"
  },
  "comfyui.latent_morph": {
    lifecycleStage: "process",
    description: "สร้างวิดีโอไทม์แลปส์เปลี่ยนผ่านฤดูกาลด้วยการอินเทอร์โพเลตเวกเตอร์ Latent (SLERP Latent Morphing)"
  },
  "ae.caustics_fluid_diffusion": {
    lifecycleStage: "build",
    description: "สร้างเอฟเฟกต์แสงสะท้อนผิวน้ำ (Ocean Caustics) ละอองชีวภาพใต้ทะเลลึก (Marine Snow) และการกระเจิงของแสง"
  },
  "ar.floating_slides_3d": {
    lifecycleStage: "build",
    description: "สร้างสไลด์ภาพนิ่ง 3 มิติในพื้นที่เสมือนจริง AR 5 รูปแบบ (Glassmorphic, Curved Wall 180°, Spatial Gallery, Tactical HUD, Gold Scroll)"
  },
  "ar.camera_movement_3d": {
    lifecycleStage: "build",
    description: "สร้างการเคลื่อนที่ของมุมกล้อง 3 มิติในพื้นที่ AR 5 รูปแบบ (Orbit 360°, Crane Dolly-In Tilt, Jib Spiral, FPV Slalom, Macro Rack Focus) พร้อมซิงก์ FreeD"
  },
  "util.switch_branch": {
    lifecycleStage: "process",
    description: "เลือกเส้นทางการประมวลผลตามเงื่อนไข (Conditional Branch Router) เพื่อสลับค่าคอนฟิกหรือสินทรัพย์ตามตัวแปร"
  },
  "util.coalesce_fallback": {
    lifecycleStage: "process",
    description: "ค้นหาและคืนค่าแรกที่ไม่เป็นค่าว่าง (Null Coalescing Fallback) จากรายการตัวเลือก พร้อมกำหนดค่าเริ่มต้นสำรอง"
  },
  "util.string_formatter": {
    lifecycleStage: "process",
    description: "จัดรูปแบบข้อความ เทมเพลตสตริง การแปลงตัวพิมพ์ และการสร้าง Slug ชื่อไฟล์สำหรับงานบรอดคาสต์"
  },
  "util.json_query_extract": {
    lifecycleStage: "process",
    description: "สกัด คัดกรอง และแปลงโครงสร้างข้อมูล JSON ด้วยพาธคิวรี เพื่อส่งต่อให้กับโหนดถัดไปอย่างแม่นยำ"
  },
  "util.media_transcode": {
    lifecycleStage: "process",
    description: "แปลงรหัสไฟล์วิดีโอความเร็วสูง (Mezzanine / Proxy Transcoder) ด้วยฮาร์ดแวร์เร่งความเร็ว FFmpeg"
  },
  "util.audio_extract": {
    lifecycleStage: "process",
    description: "สกัดแทร็กเสียงจากไฟล์วิดีโอเป็น WAV/AAC แบบไม่สูญเสียคุณภาพ พร้อมปรับระดับความดังมาตรฐาน EBU R128"
  },
  "util.lossless_trim": {
    lifecycleStage: "process",
    description: "ตัดทอนช่วงเวลาของคลิปวิดีโอแบบ Stream Copy รวดเร็ว ไม่เสียเวลาเรนเดอร์ใหม่ และคงความละเอียดสมบูรณ์"
  },
  "util.timecode_math": {
    lifecycleStage: "process",
    description: "คำนวณบวกลบไทม์โค้ด SMPTE (HH:MM:SS:FF) แปลงเฟรมและมิลลิวินาทีตามอัตราเฟรมบรอดคาสต์ 25fps"
  },
  "util.duration_pad": {
    lifecycleStage: "process",
    description: "ขยายความยาววิดีโอหรือเสียงให้ตรงกับผังรายการ (Hold Frame / Black Pad) ป้องกันภาพขาดตอนท้ายคลิป"
  },
  "util.data_inspector_qc": {
    lifecycleStage: "process",
    description: "ตรวจสอบความถูกต้องของข้อมูล Schema และค่าพารามิเตอร์ของเวิร์กโฟลว์ (Pipeline Data QC) ก่อนประมวลผลหนัก"
  },
  "util.file_integrity_guard": {
    lifecycleStage: "process",
    description: "ตรวจสอบความสมบูรณ์ของไฟล์สื่อ (Checksum SHA-256, ขนาดไฟล์, และสตรีมมีเดีย) ป้องกันไฟล์เสียและ Zero-byte"
  },
  "preview.media": {
    lifecycleStage: "export",
    description: "แสดงพรีวิวภาพ/วิดีโอ/ไฟล์ผลลัพธ์แบบเรียลไทม์บน Canvas (ComfyUI-Style Interactive Preview)"
  },
  "preview.video": {
    lifecycleStage: "export",
    description: "แสดงพรีวิวไฟล์วิดีโอ MP4/MOV พร้อมแถบควบคุม Play/Pause บน Canvas"
  },
  "preview.image": {
    lifecycleStage: "export",
    description: "แสดงพรีวิวรูปภาพ AI หรือปกวิดีโอบน Canvas"
  }
} as const satisfies Readonly<Record<StepType, { lifecycleStage: NodeLifecycleStageV1; description: string }>>;

export const nodeDescriptors: readonly NodeDescriptorV1[] = Object.freeze([
  descriptor("asset.select", "Select asset", "existing", [{ id: "path", type: "text", required: true, configKey: "path" }], [{ id: "path", type: "media", outputPath: "path" }]),
  descriptor("asset.multi_select", "Select multiple assets", "existing", [
    { id: "paths", type: "any", required: true, configKey: "paths" }
  ], [
    { id: "mediaList", type: "media", multiple: true, outputPath: "mediaList" },
    { id: "path", type: "media", multiple: true, outputPath: "path" }
  ]),
  descriptor("asset.batch_folder", "Batch folder assets", "existing", [
    { id: "folderPath", type: "text", required: true, configKey: "folderPath" },
    { id: "filter", type: "text", configKey: "filter" }
  ], [
    { id: "mediaList", type: "media", multiple: true, outputPath: "mediaList" },
    { id: "path", type: "media", multiple: true, outputPath: "path" }
  ]),
  descriptor("image.removeBackground", "Remove image background", "existing", [{ id: "image", type: "image", required: true, configKey: "path" }], [{ id: "image", type: "image", outputPath: "path" }], { capabilities: ["apple-vision"], sideEffect: true }),
  descriptor("image.resize", "Rescale image", "existing", [
    { id: "image", type: "image", required: true, configKey: "path" },
    { id: "maxDimension", type: "text", configKey: "maxDimension" },
    { id: "width", type: "text", configKey: "width" },
    { id: "height", type: "text", configKey: "height" }
  ], [
    { id: "image", type: "image", outputPath: "path" },
    { id: "path", type: "media", outputPath: "path" }
  ], { sideEffect: true }),
  descriptor("image.luma_to_alpha", "Doodle luminance to alpha", "existing", [
    { id: "image", type: "image", required: true, configKey: "path" }
  ], [
    { id: "image", type: "image", outputPath: "path" },
    { id: "path", type: "media", outputPath: "path" }
  ], { capabilities: ["core-image"], sideEffect: true }),
  descriptor("graphics.cover_title", "Compose Cover Title", "output", [
    { id: "image", type: "image", required: true, configKey: "image" }
  ], [
    { id: "image", type: "image", outputPath: "image" }
  ], { capabilities: ["cover-title-compositor"], sideEffect: true }),
  descriptor("template.payload", "Template payload", "existing", [], [{ id: "payload", type: "json", outputPath: "" }]),
  descriptor("llm.chat", "LLM chat", "existing", [{ id: "prompt", type: "text", configKey: "prompt" }], [{ id: "content", type: "text", outputPath: "content" }, { id: "parsed", type: "json", outputPath: "parsed" }], { capabilities: ["llm"], sideEffect: true }),
  descriptor("comfyui.workflow", "ComfyUI workflow", "existing", [{ id: "workflow", type: "text", required: true, configKey: "workflowFile" }, { id: "image", type: "image", configKey: "uploads.0.file" }, { id: "prompt", type: "text", configKey: "prompt" }], [{ id: "image", type: "image", outputPath: "images.0.localPath" }, { id: "images", type: "json", outputPath: "images" }, { id: "workflowDigest", type: "text", outputPath: "workflowDigest" }], { capabilities: ["comfyui"], sideEffect: true }),
  descriptor("remotion.render", "Render Remotion Video Composition", "output", [
    { id: "composition", type: "text", configKey: "composition" },
    { id: "props", type: "json", configKey: "props" },
    { id: "storyboard", type: "json", configKey: "storyboard" },
    { id: "cutlist", type: "json", configKey: "cutlist" },
    { id: "broll", type: "json", configKey: "broll" }
  ], [
    { id: "video", type: "video", outputPath: "output" },
    { id: "output", type: "media", outputPath: "output" }
  ], { capabilities: ["remotion", "ffmpeg"], sideEffect: true }),
  descriptor("effect.3d_carousel", "3D Photo Carousel Effect", "existing", [
    { id: "media", type: "media", required: true, multiple: true, configKey: "media" },
    { id: "texts", type: "json", configKey: "texts" },
    { id: "timing", type: "json", configKey: "timing" },
    { id: "styling", type: "json", configKey: "styling" },
    { id: "outputProject", type: "text", configKey: "outputProject" }
  ], [
    { id: "project", type: "after-effects-project", outputPath: "project" }
  ], { capabilities: ["remotion"], sideEffect: true }),
  descriptor("media.probe", "Probe media", "media", [{ id: "path", type: "media", required: true, configKey: "path" }], [{ id: "media", type: "media", outputPath: "path" }, { id: "metadata", type: "json", outputPath: "" }], { capabilities: ["ffprobe"] }),
  descriptor("timeline.scene", "Timeline scene", "declarative", [{ id: "source", type: "media", required: true, configKey: "source" }], [{ id: "scene", type: "json", outputPath: "scene" }], { countsAsScene: true }),
  descriptor("timeline.transition", "Timeline transition", "declarative", [{ id: "after", type: "json", configKey: "after" }], [{ id: "transition", type: "json", outputPath: "transition" }]),
  descriptor("timeline.overlay", "Timeline overlay", "declarative", [{ id: "asset", type: "media", configKey: "asset" }], [{ id: "overlay", type: "json", outputPath: "overlay" }]),
  descriptor("timeline.graphic_mogrt", "Editable Premiere MOGRT", "declarative", [], [{ id: "graphic", type: "json", outputPath: "graphic" }]),
  descriptor("timeline.dynamic_link", "Timeline dynamic link", "declarative", [
    { id: "project", type: "after-effects-project", required: true, configKey: "project" }
  ], [
    { id: "dynamicLink", type: "json", outputPath: "dynamicLink" }
  ]),
  descriptor("timeline.compose", "Compose timeline", "declarative", [
    { id: "scenes", type: "json", required: true, multiple: true, configKey: "scenes" },
    { id: "transitions", type: "json", multiple: true, configKey: "transitions" },
    { id: "overlays", type: "json", multiple: true, configKey: "overlays" },
    { id: "graphics", type: "json", multiple: true, configKey: "graphics" },
    { id: "dynamicLinks", type: "json", multiple: true, configKey: "dynamicLinks" },
    { id: "audio", type: "audio", multiple: true, configKey: "audio" }
  ], [{ id: "timeline", type: "json", outputPath: "timelineSpec" }]),
  descriptor("audio.asset", "Audio asset", "audio", [{ id: "path", type: "text", required: true, configKey: "path" }], [{ id: "audio", type: "audio", outputPath: "audio" }]),
  descriptor("audio.jaitts", "JaiTTS voice", "audio", [{ id: "text", type: "text", required: true, configKey: "text" }], [{ id: "audio", type: "audio", outputPath: "" }], { capabilities: ["jaitts"], sideEffect: true }),
  descriptor("audio.mix", "Mix audio", "audio", [{ id: "inputs", type: "audio", required: true, multiple: true, configKey: "inputs" }], [{ id: "audio", type: "audio", outputPath: "" }], { capabilities: ["ffmpeg"], sideEffect: true }),
  descriptor("media.audio_normalize", "Normalize Master Audio", "output", [
    { id: "source", type: "video", required: true, configKey: "source" }
  ], [
    { id: "media", type: "video", outputPath: "media" }
  ], { capabilities: ["ffmpeg"], sideEffect: true }),
  descriptor("premiere.build", "Build Premiere timeline", "output", [{ id: "timeline", type: "json", required: true, configKey: "timelineSpec" }], [{ id: "project", type: "premiere-project", outputPath: "project" }], { capabilities: ["premiere", "premiere.timeline-build"], sideEffect: true }),
  descriptor("premiere.export", "Export Premiere sequence", "output", [{ id: "project", type: "premiere-project", required: true, configKey: "project" }], [
    { id: "exports", type: "video", multiple: true, outputPath: "exports" },
    // Production graphs declare H.264 first. This scalar port lets downstream
    // file-based QC consume the exact exported path instead of an ambiguous
    // array of export receipts.
    { id: "h264", type: "video", outputPath: "exports.0.output" }
  ], { capabilities: ["premiere", "premiere.sequence-export"], sideEffect: true }),
  descriptor("storyboard.docx_import", "Import DOCX Storyboard", "existing", [
    { id: "path", type: "text", required: true, configKey: "path" }
  ], [
    { id: "storyboard", type: "json", outputPath: "storyboard" },
    { id: "segments", type: "json", outputPath: "segments" },
    { id: "cards", type: "json", outputPath: "cards" }
  ]),
  descriptor("media.catalog", "Catalog Media Folder", "existing", [
    { id: "root", type: "text", required: true, configKey: "root" }
  ], [
    { id: "catalog", type: "json", outputPath: "catalog" },
    { id: "assets", type: "media", multiple: true, outputPath: "assets" }
  ]),
  descriptor("edit.cutlist", "Create Interview Cutlist", "declarative", [
    { id: "storyboard", type: "json", required: true, configKey: "storyboard" },
    { id: "catalog", type: "json", required: true, configKey: "catalog" }
  ], [
    { id: "cutlist", type: "json", outputPath: "cutlist" },
    { id: "segments", type: "json", outputPath: "segments" }
  ]),
  descriptor("editor.broll_match", "Match B-roll Candidates", "existing", [
    { id: "storyboard", type: "json", required: true, configKey: "storyboard" },
    { id: "catalog", type: "json", required: true, configKey: "catalog" }
  ], [
    { id: "proposal", type: "json", outputPath: "proposal" },
    { id: "proposalDigest", type: "text", outputPath: "proposalDigest" }
  ]),
  descriptor("review.approval", "Review and Approve B-roll", "existing", [
    { id: "proposal", type: "json", required: true, configKey: "proposal" }
  ], [
    { id: "approval", type: "json", outputPath: "approval" }
  ], { sideEffect: true }),
  descriptor("review.media_approval", "Review and Approve Media", "existing", [
    { id: "asset", type: "media", required: true, configKey: "asset" },
    { id: "workflowDigest", type: "text", required: true, configKey: "workflowDigest" }
  ], [
    { id: "approvedAsset", type: "media", outputPath: "approvedAsset" },
    { id: "approval", type: "json", outputPath: "approval" }
  ], { sideEffect: true }),
  descriptor("media.conform", "Conform Interview Media", "existing", [
    { id: "cutlist", type: "json", required: true, configKey: "cutlist" },
    { id: "approval", type: "json", required: true, configKey: "approval" }
  ], [
    { id: "scenes", type: "json", outputPath: "scenes" },
    { id: "conformed", type: "media", multiple: true, outputPath: "conformed" }
  ], { capabilities: ["ffmpeg"], sideEffect: true }),
  descriptor("timeline.broll_stack", "Stack B-roll Overlays", "declarative", [
    { id: "cutlist", type: "json", required: true, configKey: "cutlist" },
    { id: "approval", type: "json", required: true, configKey: "approval" }
  ], [
    { id: "overlays", type: "json", outputPath: "overlays" }
  ]),
  descriptor("audio.dialogue_mix", "Preserve Dialogue Source Audio", "audio", [
    { id: "cutlist", type: "json", required: true, configKey: "cutlist" }
  ], [
    { id: "audio", type: "audio", multiple: true, outputPath: "audio" }
  ]),
  descriptor("audio.loudness_qc", "Audio Loudness & Silence QC", "audio", [
    { id: "source", type: "media", required: true, configKey: "source" },
    { id: "timelineSpec", type: "json", configKey: "timelineSpec" }
  ], [
    { id: "report", type: "json", outputPath: "report" },
    { id: "receiptPath", type: "text", outputPath: "receiptPath" }
  ], { capabilities: ["ffmpeg", "ffprobe"], sideEffect: true }),
  descriptor("graphics.template_card", "Template Title Cards", "declarative", [
    { id: "cards", type: "json", configKey: "cards" }
  ], [
    { id: "overlays", type: "json", outputPath: "overlays" }
  ]),
  descriptor("qc.timeline", "QC Timeline", "output", [
    { id: "timeline", type: "json", required: true, configKey: "timeline" },
    { id: "exports", type: "video", multiple: true, configKey: "exports" }
  ], [
    { id: "report", type: "json", outputPath: "report" }
  ]),
  descriptor("audio.smart_ducking", "Smart Multi-Bus Audio Ducking", "audio", [
    { id: "dialogue", type: "audio", required: true, configKey: "dialogue" },
    { id: "music", type: "audio", required: true, configKey: "music" }
  ], [
    { id: "masterAudio", type: "audio", outputPath: "masterAudio" }
  ], { capabilities: ["ffmpeg"], sideEffect: true }),
  descriptor("video.color_grade", "Cinematic Color Grade & LUT", "existing", [
    { id: "source", type: "media", required: true, configKey: "source" },
    { id: "lutPath", type: "text", configKey: "lutPath" }
  ], [
    { id: "gradedVideo", type: "media", outputPath: "gradedVideo" }
  ], { capabilities: ["ffmpeg"], sideEffect: true }),
  descriptor("video.split_screen_2box", "Split Screen 2-Box DVE", "declarative", [
    { id: "leftSource", type: "media", required: true, configKey: "leftSource" },
    { id: "rightSource", type: "media", required: true, configKey: "rightSource" }
  ], [
    { id: "scene", type: "json", outputPath: "scene" }
  ]),
  descriptor("layout.side_by_side", "Side-by-Side Slide & Presenter Layout", "declarative", [
    { id: "presenterSource", type: "media", required: true, configKey: "presenterSource" },
    { id: "slideSource", type: "media", required: true, configKey: "slideSource" }
  ], [
    { id: "timelineSpec", type: "json", outputPath: "timelineSpec" }
  ]),
  descriptor("video.smart_reframe", "Smart 9:16 Vertical Reframe", "existing", [
    { id: "source", type: "media", required: true, configKey: "source" }
  ], [
    { id: "reframeVideo", type: "media", outputPath: "reframeVideo" }
  ], { capabilities: ["ffmpeg"], sideEffect: true }),
  descriptor("graphics.news_strap", "Broadcast News Lower-Third Strap", "declarative", [
    { id: "headline", type: "text", required: true, configKey: "headline" }
  ], [
    { id: "overlay", type: "json", outputPath: "overlay" }
  ]),
  descriptor("graphics.lower_third", "Academic & Presenter Lower-Third", "declarative", [
    { id: "speakerName", type: "text", required: true, configKey: "speakerName" }
  ], [
    { id: "overlay", type: "json", outputPath: "overlay" }
  ]),
  descriptor("graphics.ticker_crawl", "Continuous News Ticker Crawl", "declarative", [
    { id: "items", type: "any", required: true, configKey: "items" }
  ], [
    { id: "overlay", type: "json", outputPath: "overlay" }
  ]),
  descriptor("graphics.countdown_timer", "Parametric Step Countdown Timer", "declarative", [
    { id: "durationSeconds", type: "text", required: true, configKey: "durationSeconds" }
  ], [
    { id: "overlay", type: "json", outputPath: "overlay" }
  ]),
  descriptor("audio.beat_detect", "Audio Beat & BPM Detection", "existing", [
    { id: "audioPath", type: "audio", required: true, configKey: "audioPath" }
  ], [
    { id: "beats", type: "json", outputPath: "beats" }
  ], { capabilities: ["ffmpeg"], sideEffect: true }),
  descriptor("effect.zoom_callout", "Magnifier Loupe Zoom Callout", "declarative", [
    { id: "targetSceneId", type: "text", required: true, configKey: "targetSceneId" }
  ], [
    { id: "overlay", type: "json", outputPath: "overlay" }
  ]),
  descriptor("vision.slide_detect", "Smart Slide Transition Detection", "existing", [
    { id: "slideSource", type: "media", required: true, configKey: "slideSource" }
  ], [
    { id: "slideEvents", type: "json", outputPath: "slideEvents" }
  ], { capabilities: ["ffmpeg"], sideEffect: true }),
  descriptor("ae.channel_id_bumper", "3D Holographic Channel ID Bumper", "existing", [
    { id: "templateProject", type: "after-effects-project", configKey: "templateProject" },
    { id: "branding", type: "json", configKey: "branding" }
  ], [
    { id: "project", type: "after-effects-project", outputPath: "project" },
    { id: "video", type: "video", outputPath: "video" }
  ], { capabilities: ["after-effects"], sideEffect: true }),
  descriptor("ae.program_rundown", "Live Program Rundown Board", "existing", [
    { id: "templateProject", type: "after-effects-project", configKey: "templateProject" },
    { id: "schedule", type: "json", configKey: "schedule" }
  ], [
    { id: "project", type: "after-effects-project", outputPath: "project" },
    { id: "video", type: "video", outputPath: "video" }
  ], { capabilities: ["after-effects"], sideEffect: true }),
  descriptor("ae.kinetic_titles", "Kinetic Typography Sequences", "existing", [
    { id: "sequences", type: "json", configKey: "sequences" }
  ], [
    { id: "project", type: "after-effects-project", outputPath: "project" },
    { id: "video", type: "video", outputPath: "video" }
  ], { capabilities: ["after-effects"], sideEffect: true }),
  descriptor("ae.speech_visualizer", "Audio-Reactive Speech Visualizer", "existing", [
    { id: "audioTrack", type: "audio", required: true, configKey: "audioTrack" },
    { id: "visualizer", type: "json", configKey: "visualizer" }
  ], [
    { id: "project", type: "after-effects-project", outputPath: "project" },
    { id: "video", type: "video", outputPath: "video" }
  ], { capabilities: ["after-effects"], sideEffect: true }),
  descriptor("graphics.kpi_dashboard", "Financial & KPI Infographics Dashboard", "declarative", [
    { id: "counters", type: "json", configKey: "counters" },
    { id: "radialGauges", type: "json", configKey: "radialGauges" }
  ], [
    { id: "overlay", type: "json", outputPath: "overlay" }
  ]),
  descriptor("graphics.process_graph", "Interactive Flowchart & Process Graph", "declarative", [
    { id: "nodes", type: "json", configKey: "nodes" },
    { id: "edges", type: "json", configKey: "edges" }
  ], [
    { id: "overlay", type: "json", outputPath: "overlay" }
  ]),
  descriptor("ae.device_mockup_3d", "3D Device Mockup Interaction", "existing", [
    { id: "screenFootage", type: "media", configKey: "screenFootage" }
  ], [
    { id: "project", type: "after-effects-project", outputPath: "project" },
    { id: "video", type: "video", outputPath: "video" }
  ], { capabilities: ["after-effects"], sideEffect: true }),
  descriptor("ae.saas_tour_cursor", "Web SaaS Portal Tour & Loupe", "existing", [
    { id: "dashboardFootage", type: "media", configKey: "dashboardFootage" }
  ], [
    { id: "project", type: "after-effects-project", outputPath: "project" },
    { id: "video", type: "video", outputPath: "video" }
  ], { capabilities: ["after-effects"], sideEffect: true }),
  descriptor("effect.cinematic_title", "Cinematic VFX Trailer Title", "existing", [
    { id: "headline", type: "text", required: true, configKey: "headline" }
  ], [
    { id: "project", type: "after-effects-project", outputPath: "project" },
    { id: "video", type: "video", outputPath: "video" }
  ], { capabilities: ["after-effects"], sideEffect: true }),
  descriptor("graphics.social_sticker_pack", "Social Promo Lower-Third & Stickers", "declarative", [
    { id: "badgeType", type: "text", required: true, configKey: "badgeType" }
  ], [
    { id: "overlay", type: "json", outputPath: "overlay" }
  ]),
  descriptor("comfyui.archival_restore", "Archival Photo Restoration & Depth", "existing", [
    { id: "imagePath", type: "image", required: true, configKey: "imagePath" }
  ], [
    { id: "colorMaster", type: "image", outputPath: "colorMaster" },
    { id: "depthMap", type: "image", outputPath: "depthMap" }
  ], { capabilities: ["comfyui"], sideEffect: true }),
  descriptor("ae.ai_parallax_25d", "2.5D Camera Projection Parallax Rig", "existing", [
    { id: "imagePlate", type: "image", required: true, configKey: "imagePlate" },
    { id: "depthMap", type: "image", required: true, configKey: "depthMap" }
  ], [
    { id: "project", type: "after-effects-project", outputPath: "project" },
    { id: "video", type: "video", outputPath: "video" }
  ], { capabilities: ["after-effects"], sideEffect: true }),
  descriptor("prompt.scientific_conditioning", "Scientific Taxonomy Prompt Compiler", "existing", [
    { id: "subject", type: "text", required: true, configKey: "subject" }
  ], [
    { id: "positivePrompt", type: "text", outputPath: "positivePrompt" },
    { id: "negativePrompt", type: "text", outputPath: "negativePrompt" }
  ]),
  descriptor("comfyui.scientific_motion", "Scientific AnimateDiff Video Generator", "existing", [
    { id: "workflowFile", type: "text", required: true, configKey: "workflowFile" }
  ], [
    { id: "primaryVideo", type: "video", outputPath: "primaryVideo" },
    { id: "depthMaps", type: "json", outputPath: "depthMaps" }
  ], { capabilities: ["comfyui"], sideEffect: true }),
  descriptor("ae.volumetric_particles_3d", "3D Volumetric Ions & Orbital Camera", "existing", [
    { id: "particleType", type: "text", required: true, configKey: "particleType" }
  ], [
    { id: "project", type: "after-effects-project", outputPath: "project" },
    { id: "particleOverlay", type: "video", outputPath: "particleOverlay" }
  ], { capabilities: ["after-effects"], sideEffect: true }),
  descriptor("graphics.scientific_hud", "Molecular & Neural Telemetry HUD", "declarative", [
    { id: "title", type: "text", required: true, configKey: "title" },
    { id: "formula", type: "text", required: true, configKey: "formula" }
  ], [
    { id: "overlay", type: "json", outputPath: "overlay" }
  ]),
  descriptor("comfyui.controlnet_style_transfer", "ControlNet Thermal/Cyber Style Transfer", "existing", [
    { id: "sourceImage", type: "image", required: true, configKey: "sourceImage" },
    { id: "targetStyle", type: "text", required: true, configKey: "targetStyle" }
  ], [
    { id: "transferredImage", type: "image", outputPath: "transferredImage" },
    { id: "depthMap", type: "image", outputPath: "depthMap" }
  ], { capabilities: ["comfyui"], sideEffect: true }),
  descriptor("ae.cyberpunk_vfx", "Cyberpunk RGB Split & Flare Optics", "existing", [
    { id: "source", type: "media", required: true, configKey: "source" }
  ], [
    { id: "vfxVideo", type: "video", outputPath: "vfxVideo" }
  ], { capabilities: ["ffmpeg"], sideEffect: true }),
  descriptor("comfyui.latent_morph", "Seasonal Latent Slerp Time-Lapse Morph", "existing", [
    { id: "workflowFile", type: "text", required: true, configKey: "workflowFile" }
  ], [
    { id: "video", type: "video", outputPath: "video" }
  ], { capabilities: ["comfyui"], sideEffect: true }),
  descriptor("ae.caustics_fluid_diffusion", "Oceanic Caustics & Marine Snow VFX", "existing", [
    { id: "sourceFootage", type: "media", required: true, configKey: "sourceFootage" }
  ], [
    { id: "video", type: "video", outputPath: "video" }
  ], { capabilities: ["ffmpeg", "after-effects"], sideEffect: true }),
  descriptor("ar.floating_slides_3d", "3D Floating AR Slide Rig", "existing", [
    { id: "preset", type: "text", required: true, configKey: "preset" }
  ], [
    { id: "arElementsVideo", type: "video", outputPath: "arElementsVideo" },
    { id: "floorReflectionVideo", type: "video", outputPath: "floorReflectionVideo" },
    { id: "hudTelemetryVideo", type: "video", outputPath: "hudTelemetryVideo" }
  ], { capabilities: ["after-effects"], sideEffect: true }),
  descriptor("ar.camera_movement_3d", "3D AR Camera Kinetics & FreeD Tracker", "existing", [
    { id: "movementPreset", type: "text", required: true, configKey: "movementPreset" }
  ], [
    { id: "cameraTrackingData", type: "json", outputPath: "cameraTrackingData" },
    { id: "project", type: "after-effects-project", outputPath: "project" }
  ], { capabilities: ["after-effects"], sideEffect: true }),
  descriptor("util.switch_branch", "Conditional Branch Router", "declarative", [
    { id: "expression", type: "any", required: true, configKey: "expression" },
    { id: "cases", type: "json", required: true, configKey: "cases" },
    { id: "default", type: "any", configKey: "default" }
  ], [
    { id: "result", type: "any", outputPath: "result" },
    { id: "matchedKey", type: "text", outputPath: "matchedKey" },
    { id: "isDefault", type: "json", outputPath: "isDefault" }
  ]),
  descriptor("util.coalesce_fallback", "Coalesce & Fallback", "declarative", [
    { id: "candidates", type: "any", required: true, multiple: true, configKey: "candidates" },
    { id: "fallback", type: "any", configKey: "fallback" }
  ], [
    { id: "value", type: "any", outputPath: "value" },
    { id: "selectedSourceIndex", type: "json", outputPath: "selectedSourceIndex" },
    { id: "isFallback", type: "json", outputPath: "isFallback" }
  ]),
  descriptor("util.string_formatter", "String & Slug Formatter", "declarative", [
    { id: "template", type: "text", required: true, configKey: "template" },
    { id: "variables", type: "json", configKey: "variables" }
  ], [
    { id: "formattedText", type: "text", outputPath: "formattedText" },
    { id: "slug", type: "text", outputPath: "slug" }
  ]),
  descriptor("util.json_query_extract", "JSON Query & Extractor", "declarative", [
    { id: "source", type: "json", required: true, configKey: "source" },
    { id: "query", type: "text", required: true, configKey: "query" }
  ], [
    { id: "result", type: "any", outputPath: "result" },
    { id: "count", type: "json", outputPath: "count" },
    { id: "exists", type: "json", outputPath: "exists" }
  ]),
  descriptor("util.media_transcode", "Media Mezzanine & Proxy Transcoder", "media", [
    { id: "source", type: "media", required: true, configKey: "source" },
    { id: "preset", type: "text", configKey: "preset" },
    { id: "outputPath", type: "text", configKey: "outputPath" }
  ], [
    { id: "media", type: "media", outputPath: "media" },
    { id: "video", type: "video", outputPath: "media" },
    { id: "fileSizeBytes", type: "json", outputPath: "fileSizeBytes" },
    { id: "durationSeconds", type: "json", outputPath: "durationSeconds" }
  ], { capabilities: ["ffmpeg"], sideEffect: true }),
  descriptor("util.audio_extract", "Audio Stem Demuxer & Normalizer", "audio", [
    { id: "source", type: "media", required: true, configKey: "source" },
    { id: "outputPath", type: "text", configKey: "outputPath" }
  ], [
    { id: "audio", type: "audio", outputPath: "audio" },
    { id: "durationSeconds", type: "json", outputPath: "durationSeconds" },
    { id: "sampleRate", type: "json", outputPath: "sampleRate" },
    { id: "channels", type: "json", outputPath: "channels" }
  ], { capabilities: ["ffmpeg"], sideEffect: true }),
  descriptor("util.lossless_trim", "Lossless Stream Segment Trimmer", "media", [
    { id: "source", type: "media", required: true, configKey: "source" },
    { id: "startMs", type: "text", configKey: "startMs" },
    { id: "durationMs", type: "text", configKey: "durationMs" }
  ], [
    { id: "media", type: "media", outputPath: "media" },
    { id: "durationMs", type: "json", outputPath: "durationMs" },
    { id: "durationSeconds", type: "json", outputPath: "durationSeconds" }
  ], { capabilities: ["ffmpeg"], sideEffect: true }),
  descriptor("util.timecode_math", "SMPTE Timecode & Frame Calculator", "declarative", [
    { id: "timecode", type: "text", configKey: "timecode" },
    { id: "operations", type: "json", configKey: "operations" }
  ], [
    { id: "timecode", type: "text", outputPath: "timecode" },
    { id: "durationMs", type: "json", outputPath: "durationMs" },
    { id: "frames", type: "json", outputPath: "frames" },
    { id: "seconds", type: "json", outputPath: "seconds" }
  ]),
  descriptor("util.duration_pad", "Broadcast Duration & Freeze Pad", "media", [
    { id: "source", type: "media", required: true, configKey: "source" },
    { id: "targetDurationMs", type: "text", required: true, configKey: "targetDurationMs" }
  ], [
    { id: "media", type: "media", outputPath: "media" },
    { id: "originalDurationMs", type: "json", outputPath: "originalDurationMs" },
    { id: "paddedDurationMs", type: "json", outputPath: "paddedDurationMs" },
    { id: "addedPadMs", type: "json", outputPath: "addedPadMs" }
  ], { capabilities: ["ffmpeg"], sideEffect: true }),
  descriptor("util.data_inspector_qc", "Pipeline Data Schema QC Guard", "declarative", [
    { id: "targetData", type: "any", required: true, configKey: "targetData" },
    { id: "assertions", type: "json", required: true, configKey: "assertions" }
  ], [
    { id: "passed", type: "json", outputPath: "passed" },
    { id: "violations", type: "json", outputPath: "violations" },
    { id: "report", type: "json", outputPath: "report" }
  ]),
  descriptor("util.file_integrity_guard", "File Integrity & Stream Guard", "media", [
    { id: "filePath", type: "text", required: true, configKey: "filePath" }
  ], [
    { id: "valid", type: "json", outputPath: "valid" },
    { id: "fileSizeBytes", type: "json", outputPath: "fileSizeBytes" },
    { id: "sha256", type: "text", outputPath: "sha256" },
    { id: "streams", type: "json", outputPath: "streams" }
  ], { capabilities: ["ffprobe"] }),
  descriptor("preview.media", "ComfyUI Media Preview", "output", [
    { id: "source", type: "any", required: true, configKey: "source" }
  ], [
    { id: "preview", type: "media", outputPath: "preview" },
    { id: "passthrough", type: "any", outputPath: "passthrough" }
  ]),
  descriptor("preview.video", "ComfyUI Video Player Preview", "output", [
    { id: "source", type: "video", required: true, configKey: "source" }
  ], [
    { id: "preview", type: "video", outputPath: "preview" },
    { id: "passthrough", type: "video", outputPath: "passthrough" }
  ]),
  descriptor("preview.image", "ComfyUI Image Preview", "output", [
    { id: "source", type: "image", required: true, configKey: "source" }
  ], [
    { id: "preview", type: "image", outputPath: "preview" },
    { id: "passthrough", type: "image", outputPath: "passthrough" }
  ])
]);

export const nodeDescriptorRegistry: ReadonlyMap<string, NodeDescriptorV1> = new Map(
  nodeDescriptors.map((value) => [value.type, value])
);

export function getNodeDescriptor(type: string, registry: ReadonlyMap<string, NodeDescriptorV1> = nodeDescriptorRegistry) {
  return registry.get(type);
}

export class GraphValidationError extends Error {
  readonly diagnostics: GraphDiagnosticV1[];
  constructor(diagnostics: GraphDiagnosticV1[]) {
    super(`Graph validation failed:\n${diagnostics.map((value) => `- ${value.path}: ${value.message}`).join("\n")}`);
    this.name = "GraphValidationError";
    this.diagnostics = diagnostics;
  }
}

export function createGraphDefinition(input: {
  graphId: string;
  name: string;
  description?: string;
  profile?: GraphProfileIdV1;
  durationFrames?: number;
  nodes?: GraphNodeV1[];
  edges?: GraphDefinitionV1["edges"];
  order?: string[];
  variables?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}): GraphDefinitionV1 {
  const nodes = structuredClone(input.nodes ?? []);
  return {
    schemaVersion: 1,
    graphId: input.graphId,
    name: input.name,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    revision: 0,
    profile: structuredClone(graphProfiles[input.profile ?? "portrait"]),
    durationFrames: input.durationFrames ?? 5 * GRAPH_FRAME_RATE,
    variables: structuredClone(input.variables ?? {}),
    settings: structuredClone(input.settings ?? {}),
    nodes,
    edges: structuredClone(input.edges ?? []),
    order: structuredClone(input.order ?? nodes.map((node) => node.id))
  };
}

export function validateGraphDefinition(
  value: unknown,
  registry: ReadonlyMap<string, NodeDescriptorV1> = nodeDescriptorRegistry
): GraphValidationResultV1 {
  const diagnostics: GraphDiagnosticV1[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, diagnostics: [diagnostic("invalid_graph", "/", "Graph must be an object")], nodeOrder: [] };
  }
  const graph = value as Partial<GraphDefinitionV1>;
  if (graph.schemaVersion !== 1) diagnostics.push(diagnostic("schema_version", "/schemaVersion", "schemaVersion must be 1"));
  if (!validId(graph.graphId)) diagnostics.push(diagnostic("invalid_id", "/graphId", "graphId must contain only letters, numbers, underscore, or hyphen"));
  if (typeof graph.name !== "string" || !graph.name.trim()) diagnostics.push(diagnostic("required", "/name", "name is required"));
  if (!Number.isSafeInteger(graph.revision) || Number(graph.revision) < 0) diagnostics.push(diagnostic("invalid_revision", "/revision", "revision must be a non-negative integer"));
  validateProfile(graph.profile, diagnostics);
  if (!Number.isSafeInteger(graph.durationFrames) || Number(graph.durationFrames) < 1 || Number(graph.durationFrames) > GRAPH_MAX_DURATION_FRAMES) {
    diagnostics.push(diagnostic("duration_limit", "/durationFrames", `durationFrames must be between 1 and ${GRAPH_MAX_DURATION_FRAMES}`));
  }
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) diagnostics.push(diagnostic("required", "/nodes", "nodes must be a non-empty array"));
  if (!Array.isArray(graph.edges)) diagnostics.push(diagnostic("required", "/edges", "edges must be an array"));
  if (!Array.isArray(graph.order)) diagnostics.push(diagnostic("required", "/order", "order must be an array"));
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !Array.isArray(graph.order)) {
    return { valid: false, diagnostics, nodeOrder: [] };
  }

  const nodes = new Map<string, GraphNodeV1>();
  const descriptors = new Map<string, NodeDescriptorV1>();
  for (const [index, node] of graph.nodes.entries()) {
    const path = `/nodes/${index}`;
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      diagnostics.push(diagnostic("invalid_node", path, "node must be an object"));
      continue;
    }
    if (!validId(node.id)) diagnostics.push(diagnostic("invalid_id", `${path}/id`, "node id is invalid", node.id));
    else if (nodes.has(node.id)) diagnostics.push(diagnostic("duplicate_node", `${path}/id`, `duplicate node '${node.id}'`, node.id));
    else nodes.set(node.id, node);
    const descriptorValue = typeof node.type === "string" ? registry.get(node.type) : undefined;
    if (!descriptorValue) diagnostics.push(diagnostic("unknown_node_type", `${path}/type`, `unknown node type '${String(node.type)}'`, node.id));
    else descriptors.set(node.id, descriptorValue);
    if (!node.config || typeof node.config !== "object" || Array.isArray(node.config)) diagnostics.push(diagnostic("invalid_config", `${path}/config`, "config must be an object", node.id));
    else validateNodeConfig(node, graph, path, diagnostics);
  }

  const explicitOrder = graph.order;
  const seenOrder = new Set<string>();
  for (const [index, id] of explicitOrder.entries()) {
    if (typeof id !== "string" || !nodes.has(id)) diagnostics.push(diagnostic("unknown_order_node", `/order/${index}`, `order references unknown node '${String(id)}'`));
    else if (seenOrder.has(id)) diagnostics.push(diagnostic("duplicate_order_node", `/order/${index}`, `order duplicates '${id}'`, id));
    else seenOrder.add(id);
  }
  for (const id of nodes.keys()) if (!seenOrder.has(id)) diagnostics.push(diagnostic("missing_order_node", "/order", `order is missing '${id}'`, id));

  const incoming = new Map<string, Map<string, number>>();
  const adjacency = new Map<string, Set<string>>([...nodes.keys()].map((id) => [id, new Set()]));
  const undirected = new Map<string, Set<string>>([...nodes.keys()].map((id) => [id, new Set()]));
  const edgeIds = new Set<string>();
  const orderIndex = new Map(explicitOrder.map((id, index) => [id, index]));
  for (const [index, edge] of graph.edges.entries()) {
    const path = `/edges/${index}`;
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
      diagnostics.push(diagnostic("invalid_edge", path, "edge must be an object"));
      continue;
    }
    if (!validId(edge.id)) diagnostics.push(diagnostic("invalid_id", `${path}/id`, "edge id is invalid", undefined, edge.id));
    else if (edgeIds.has(edge.id)) diagnostics.push(diagnostic("duplicate_edge", `${path}/id`, `duplicate edge '${edge.id}'`, undefined, edge.id));
    else edgeIds.add(edge.id);
    const source = nodes.get(edge.from?.nodeId);
    const target = nodes.get(edge.to?.nodeId);
    const sourceDescriptor = descriptors.get(edge.from?.nodeId);
    const targetDescriptor = descriptors.get(edge.to?.nodeId);
    const sourcePort = sourceDescriptor?.outputs.find((port) => port.id === edge.from?.port);
    const targetPort = targetDescriptor?.inputs.find((port) => port.id === edge.to?.port);
    if (!source) diagnostics.push(diagnostic("unknown_source_node", `${path}/from/nodeId`, `unknown source node '${String(edge.from?.nodeId)}'`, edge.from?.nodeId, edge.id));
    else if (!sourcePort) diagnostics.push(diagnostic("unknown_source_port", `${path}/from/port`, `unknown output port '${String(edge.from?.port)}'`, source.id, edge.id));
    if (!target) diagnostics.push(diagnostic("unknown_target_node", `${path}/to/nodeId`, `unknown target node '${String(edge.to?.nodeId)}'`, edge.to?.nodeId, edge.id));
    else if (!targetPort) diagnostics.push(diagnostic("unknown_target_port", `${path}/to/port`, `unknown input port '${String(edge.to?.port)}'`, target.id, edge.id));
    if (source && target) {
      adjacency.get(source.id)?.add(target.id);
      undirected.get(source.id)?.add(target.id);
      undirected.get(target.id)?.add(source.id);
      if ((orderIndex.get(source.id) ?? Infinity) >= (orderIndex.get(target.id) ?? -1)) diagnostics.push(diagnostic("edge_order", path, `source '${source.id}' must appear before target '${target.id}'`, target.id, edge.id));
    }
    if (sourcePort && targetPort && !compatiblePortTypes(sourcePort.type, targetPort.type)) {
      diagnostics.push(diagnostic("port_type", path, `cannot connect ${sourcePort.type} to ${targetPort.type}`, target?.id, edge.id));
    }
    if (target && targetPort) {
      const ports = incoming.get(target.id) ?? new Map<string, number>();
      const count = (ports.get(targetPort.id) ?? 0) + 1;
      ports.set(targetPort.id, count);
      incoming.set(target.id, ports);
      if (count > 1 && !targetPort.multiple) diagnostics.push(diagnostic("multiple_input", path, `input '${targetPort.id}' accepts only one edge`, target.id, edge.id));
    }
  }

  for (const [nodeId, node] of nodes) {
    const descriptorValue = descriptors.get(nodeId);
    if (!descriptorValue) continue;
    for (const port of descriptorValue.inputs) {
      if (!port.required) continue;
      const connected = (incoming.get(nodeId)?.get(port.id) ?? 0) > 0;
      const configured = port.configKey ? hasConfiguredValue(node.config, port.configKey) : false;
      if (!connected && !configured) diagnostics.push(diagnostic("required_input", `/nodes/${nodeId}`, `required input '${port.id}' is not connected or configured`, nodeId));
    }
  }

  const sceneCount = [...descriptors.values()].filter((value) => value.countsAsScene).length;
  if (sceneCount > GRAPH_MAX_SCENES) diagnostics.push(diagnostic("scene_limit", "/nodes", `graph has ${sceneCount} scenes; maximum is ${GRAPH_MAX_SCENES}`));
  validateDeclaredTimelineDuration(graph as GraphDefinitionV1, diagnostics);

  if (nodes.size > 1) {
    for (const id of nodes.keys()) if ((undirected.get(id)?.size ?? 0) === 0) diagnostics.push(diagnostic("orphan_node", `/nodes/${id}`, `node '${id}' is orphaned`, id));
    const first = nodes.keys().next().value as string | undefined;
    if (first) {
      const visited = visitUndirected(first, undirected);
      if (visited.size !== nodes.size) diagnostics.push(diagnostic("disconnected_graph", "/edges", "all nodes must belong to one connected graph"));
    }
  }

  const nodeOrder = topologicalOrder(nodes, adjacency, orderIndex);
  if (nodeOrder.length !== nodes.size) diagnostics.push(diagnostic("cycle", "/edges", "graph contains a directed cycle"));
  return { valid: diagnostics.length === 0, diagnostics, nodeOrder };
}

const DEFAULT_WORKFLOW_SETTINGS = {
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
    premiere: { applicationName: "Adobe Premiere Pro (Beta)", requiredVersion: "26.5.0", bridgeHost: "127.0.0.1", bridgePort: 47652, bridgeMailbox: "/tmp/psu-ava-premiere-bridge", launch: true }
  }
};

export function compileGraphToWorkflow(
  graph: GraphDefinitionV1,
  registry: ReadonlyMap<string, NodeDescriptorV1> = nodeDescriptorRegistry
): { workflow: WorkflowV1; raw: string; digest: string; nodeOrder: string[] } {
  const validation = validateGraphDefinition(graph, registry);
  const diagnostics = [...validation.diagnostics];
  for (const node of graph.nodes) {
    const descriptorValue = registry.get(node.type);
    if (descriptorValue && !descriptorValue.workflowType) diagnostics.push(diagnostic("node_not_executable", `/nodes/${node.id}/type`, `node type '${node.type}' is planned but has no WorkflowV1 adapter mapping`, node.id));
  }
  if (diagnostics.length) throw new GraphValidationError(diagnostics);

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgesByTarget = new Map<string, GraphDefinitionV1["edges"]>();
  for (const edge of graph.edges) {
    const values = edgesByTarget.get(edge.to.nodeId) ?? [];
    values.push(edge);
    edgesByTarget.set(edge.to.nodeId, values);
  }
  const steps: WorkflowStep[] = validation.nodeOrder.map((nodeId) => {
    const node = nodeById.get(nodeId)!;
    const descriptorValue = registry.get(node.type)!;
    const withValue = structuredClone(node.config);
    if (node.type === "timeline.compose") {
      withValue.width = graph.profile.width;
      withValue.height = graph.profile.height;
      withValue.frameRate = graph.profile.frameRate;
    }
    for (const edge of (edgesByTarget.get(nodeId) ?? []).sort((a, b) => a.id.localeCompare(b.id))) {
      const sourceDescriptor = registry.get(nodeById.get(edge.from.nodeId)!.type)!;
      const sourcePort = sourceDescriptor.outputs.find((port) => port.id === edge.from.port)!;
      const targetPort = descriptorValue.inputs.find((port) => port.id === edge.to.port)!;
      const reference = sourcePort.outputPath
        ? `\${steps.${edge.from.nodeId}.outputs.${sourcePort.outputPath}}`
        : `\${steps.${edge.from.nodeId}.outputs}`;
      const existing = targetPort.configKey ? getAtPath(withValue, targetPort.configKey) : undefined;
      const value = targetPort.multiple
        ? [...(Array.isArray(existing) ? existing : existing === undefined ? [] : [existing]), reference]
        : reference;
      if (targetPort.configKey) setAtPath(withValue, targetPort.configKey, value);
    }
    return {
      id: node.id,
      type: descriptorValue.workflowType!,
      ...(node.name ? { name: node.name } : {}),
      enabled: node.enabled ?? true,
      ...(node.timeoutMs === undefined ? {} : { timeoutMs: node.timeoutMs }),
      ...(node.retry === undefined ? {} : { retry: structuredClone(node.retry) }),
      with: withValue
    };
  });
  const workflow: WorkflowV1 = {
    schemaVersion: 1,
    id: graph.graphId,
    name: graph.name,
    variables: structuredClone(graph.variables ?? {}),
    settings: {
      ...DEFAULT_WORKFLOW_SETTINGS,
      ...structuredClone(graph.settings ?? {}),
      services: {
        ...DEFAULT_WORKFLOW_SETTINGS.services,
        ...((graph.settings as any)?.services ?? {})
      },
      adobe: {
        ...DEFAULT_WORKFLOW_SETTINGS.adobe,
        ...((graph.settings as any)?.adobe ?? {}),
        afterEffects: {
          ...DEFAULT_WORKFLOW_SETTINGS.adobe.afterEffects,
          ...((graph.settings as any)?.adobe?.afterEffects ?? {})
        },
        premiere: {
          ...DEFAULT_WORKFLOW_SETTINGS.adobe.premiere,
          ...((graph.settings as any)?.adobe?.premiere ?? {})
        }
      },
      graph: {
        profile: structuredClone(graph.profile),
        durationFrames: graph.durationFrames,
        durationMs: graph.durationFrames * (1000 / GRAPH_FRAME_RATE)
      }
    },
    steps
  };
  const raw = `${JSON.stringify(workflow, null, 2)}\n`;
  return { workflow, raw, digest: createHash("sha256").update(raw).digest("hex"), nodeOrder: validation.nodeOrder };
}

export function compatiblePortTypes(source: GraphPortTypeV1, target: GraphPortTypeV1) {
  if (source === "any" || target === "any" || source === target) return true;
  if (target === "media") return source === "image" || source === "video" || source === "audio";
  if (source === "media") return target === "image" || target === "video" || target === "audio";
  return false;
}

function descriptor(
  type: StepType,
  title: string,
  category: NodeDescriptorV1["category"],
  inputs: NodeDescriptorV1["inputs"],
  outputs: NodeDescriptorV1["outputs"],
  options: Partial<Omit<NodeDescriptorV1, "type" | "title" | "description" | "lifecycleStage" | "category" | "inputs" | "outputs">> = {}
): NodeDescriptorV1 {
  const workflowType = options.workflowType ?? (!options.planned ? type as NodeDescriptorV1["workflowType"] : undefined);
  const configSchema = options.configSchema ?? { type: "object", additionalProperties: true };
  const metadata = canonicalNodeMetadata[type];
  return Object.freeze({ type, title, ...metadata, category, inputs: Object.freeze(inputs), outputs: Object.freeze(outputs), ...options, configSchema, ...(workflowType ? { workflowType } : {}) });
}

function validateProfile(profile: GraphDefinitionV1["profile"] | undefined, diagnostics: GraphDiagnosticV1[]) {
  if (!profile || typeof profile !== "object") {
    diagnostics.push(diagnostic("required", "/profile", "profile is required"));
    return;
  }
  const canonical = graphProfiles[profile.id];
  if (!canonical) diagnostics.push(diagnostic("profile", "/profile/id", "profile id must be portrait, landscape, or square"));
  else if (profile.width !== canonical.width || profile.height !== canonical.height || profile.frameRate !== GRAPH_FRAME_RATE) {
    diagnostics.push(diagnostic("profile", "/profile", `${profile.id} profile must be ${canonical.width}x${canonical.height} at ${GRAPH_FRAME_RATE}fps`));
  }
}

function validateNodeConfig(node: GraphNodeV1, graph: Partial<GraphDefinitionV1>, nodePath: string, diagnostics: GraphDiagnosticV1[]) {
  const value = node.config;
  const add = (key: string, message: string) => diagnostics.push(diagnostic("invalid_config", `${nodePath}/config/${key}`, message, node.id));
  const string = (key: string, required = false) => {
    const item = value[key];
    if ((required && (typeof item !== "string" || !item.trim())) || (item !== undefined && typeof item !== "string")) add(key, `${key} must be ${required ? "a non-empty " : "a "}string`);
  };
  const number = (key: string, options: { minimum?: number; maximum?: number; integer?: boolean; frameAligned?: boolean } = {}) => {
    const item = value[key];
    if (item === undefined) return;
    if (typeof item !== "number" || !Number.isFinite(item) || (options.integer && !Number.isInteger(item)) || (options.minimum !== undefined && item < options.minimum) || (options.maximum !== undefined && item > options.maximum)) {
      add(key, `${key} is outside its allowed numeric range`);
    } else if (options.frameAligned && item % (1000 / GRAPH_FRAME_RATE) !== 0) add(key, `${key} must align to 25fps frames (40ms)`);
  };
  if (node.type === "asset.select") string("path", true);
  if (node.type === "timeline.scene") {
    string("source");
    number("durationMs", { minimum: 40, maximum: GRAPH_MAX_DURATION_FRAMES * 40, frameAligned: true });
    if (value.durationMs === undefined) add("durationMs", "durationMs is required");
    number("startMs", { minimum: 0, maximum: GRAPH_MAX_DURATION_FRAMES * 40, frameAligned: true });
    number("sourceInMs", { minimum: 0, frameAligned: true });
    number("track", { minimum: 1, integer: true });
    if (typeof value.audio !== "boolean") {
      add("audio", "audio is required and must be a boolean");
    }
    if (value.audioPolicy !== "preserve" && value.audioPolicy !== "mute") {
      add("audioPolicy", "audioPolicy is required and must be 'preserve' or 'mute'");
    }
    if (typeof value.audio === "boolean" && (value.audioPolicy === "preserve" || value.audioPolicy === "mute")) {
      const expectedAudio = value.audioPolicy === "preserve";
      if (value.audio !== expectedAudio) {
        add("audio", `audio (${value.audio}) must match audioPolicy (${value.audioPolicy})`);
      }
    }
    if (value.editorialKind !== undefined && !["a_roll", "b_roll", "cover_card", "title", "logo_outro"].includes(value.editorialKind as string)) {
      add("editorialKind", "editorialKind must be one of 'a_roll', 'b_roll', 'cover_card', 'title', 'logo_outro'");
    }
    if (value.storyboardItemId !== undefined && (typeof value.storyboardItemId !== "string" || !validId(value.storyboardItemId))) {
      add("storyboardItemId", "storyboardItemId must be a valid safe id");
    }
  }
  if (node.type === "timeline.transition") number("durationMs", { minimum: 0, maximum: 5_000, frameAligned: true });
  if (node.type === "timeline.overlay") {
    number("startMs", { minimum: 0, frameAligned: true });
    number("durationMs", { minimum: 40, frameAligned: true });
    number("track", { minimum: 1, integer: true });
    number("opacity", { minimum: 0, maximum: 1 });
    if (value.audioPolicy !== "mute") {
      add("audioPolicy", "audioPolicy is required and must equal 'mute'");
    }
    if (value.editorialKind !== undefined && !["a_roll", "b_roll", "cover_card", "title", "logo_outro"].includes(value.editorialKind as string)) {
      add("editorialKind", "editorialKind must be one of 'a_roll', 'b_roll', 'cover_card', 'title', 'logo_outro'");
    }
    if (value.storyboardItemId !== undefined && (typeof value.storyboardItemId !== "string" || !validId(value.storyboardItemId))) {
      add("storyboardItemId", "storyboardItemId must be a valid safe id");
    }
  }
  if (node.type === "timeline.dynamic_link") {
    const id = value.id;
    if (typeof id !== "string" || !validId(id)) add("id", "id is required and must be a valid safe id");
    string("composition", true);
    if (value.startMs === undefined) add("startMs", "startMs is required");
    else number("startMs", { minimum: 0, frameAligned: true });
    if (value.durationMs === undefined) add("durationMs", "durationMs is required");
    else number("durationMs", { minimum: 40, frameAligned: true });
    if (value.track === undefined) add("track", "track is required");
    else number("track", { minimum: 1, integer: true });
    if (value.audioPolicy !== "mute") add("audioPolicy", "audioPolicy must equal 'mute'");
    if (value.project !== undefined) {
      if (typeof value.project !== "string" || !value.project.trim()) add("project", "project must be a non-empty string");
    }
    if (value.editorialKind !== undefined && !["a_roll", "b_roll", "cover_card", "title", "logo_outro"].includes(value.editorialKind as string)) {
      add("editorialKind", "editorialKind must be one of 'a_roll', 'b_roll', 'cover_card', 'title', 'logo_outro'");
    }
    if (value.storyboardItemId !== undefined && (typeof value.storyboardItemId !== "string" || !validId(value.storyboardItemId))) {
      add("storyboardItemId", "storyboardItemId must be a valid safe id");
    }
  }
  if (node.type === "timeline.compose" && graph.profile) {
    for (const key of ["width", "height", "frameRate"] as const) {
      if (value[key] !== undefined && value[key] !== graph.profile[key]) add(key, `${key} conflicts with the selected ${graph.profile.id} profile`);
    }
  }
  if (node.type === "graphics.cover_title") {
    string("image");
    string("output", true);
    string("title", true);
    string("eyebrow");
    string("subtitle");
  }
  if (node.type === "audio.asset") string("path", true);
  if (node.type === "audio.jaitts") { string("text", true); string("voice", true); string("output", true); }
  if (node.type === "audio.mix") string("output", true);
  if (node.type === "audio.loudness_qc") {
    string("source");
    if (value.targetLufs === undefined || typeof value.targetLufs !== "number" || !Number.isFinite(value.targetLufs)) {
      add("targetLufs", "targetLufs is required and must be a finite number");
    }
    if (value.toleranceLufs === undefined || typeof value.toleranceLufs !== "number" || !Number.isFinite(value.toleranceLufs) || (value.toleranceLufs as number) <= 0) {
      add("toleranceLufs", "toleranceLufs is required and must be greater than zero");
    }
    if (value.maxTruePeakDbfs === undefined || typeof value.maxTruePeakDbfs !== "number" || !Number.isFinite(value.maxTruePeakDbfs)) {
      add("maxTruePeakDbfs", "maxTruePeakDbfs is required and must be a finite number");
    }
    if (value.silenceThresholdDbfs === undefined || typeof value.silenceThresholdDbfs !== "number" || !Number.isFinite(value.silenceThresholdDbfs)) {
      add("silenceThresholdDbfs", "silenceThresholdDbfs is required and must be a finite number");
    }
    if (value.minSilenceMs === undefined || typeof value.minSilenceMs !== "number" || !Number.isFinite(value.minSilenceMs) || (value.minSilenceMs as number) <= 0) {
      add("minSilenceMs", "minSilenceMs is required and must be greater than zero");
    }
    if (value.maxUnexpectedSilenceMs === undefined || typeof value.maxUnexpectedSilenceMs !== "number" || !Number.isFinite(value.maxUnexpectedSilenceMs) || (value.maxUnexpectedSilenceMs as number) < 0) {
      add("maxUnexpectedSilenceMs", "maxUnexpectedSilenceMs is required and must be non-negative");
    }
  }
  if (node.type === "media.audio_normalize") {
    string("output", true);
    if (value.targetLufs === undefined || typeof value.targetLufs !== "number" || !Number.isFinite(value.targetLufs)) add("targetLufs", "targetLufs is required and must be a finite number");
    if (value.maxTruePeakDbfs === undefined || typeof value.maxTruePeakDbfs !== "number" || !Number.isFinite(value.maxTruePeakDbfs)) add("maxTruePeakDbfs", "maxTruePeakDbfs is required and must be a finite number");
  }
  if (node.type === "premiere.build") {
    string("outputProject", true);
    string("sequencePresetPath");
  }
  if (node.type === "premiere.export") {
    string("project");
    if (!Array.isArray(value.exports) || value.exports.length === 0) add("exports", "exports must contain explicit H264 and ProRes requests");
  }
  if (node.type === "review.media_approval") {
    const storyboardItemId = value.storyboardItemId;
    if (typeof storyboardItemId !== "string" || !validId(storyboardItemId)) add("storyboardItemId", "storyboardItemId is required and must be a valid safe id");
    string("sourceImage", true);
    if (typeof value.sourceImage === "string" && value.sourceImage.trim() && !isAbsolute(value.sourceImage)) add("sourceImage", "sourceImage must be an absolute path from the approved storyboard");
    string("prompt", true);
    if (value.seed === undefined) add("seed", "seed is required and must be a non-negative integer");
    else number("seed", { minimum: 0, maximum: Number.MAX_SAFE_INTEGER, integer: true });
    string("title");
    string("asset");
    string("workflowDigest");
  }
}

function validateDeclaredTimelineDuration(graph: GraphDefinitionV1, diagnostics: GraphDiagnosticV1[]) {
  const scenes = graph.nodes.filter((node) => node.type === "timeline.scene");
  if (!scenes.length) return;
  const durations = scenes.map((node) => Number(node.config.durationMs));
  if (durations.some((value) => !Number.isFinite(value) || value <= 0)) return;
  const explicit = scenes.every((node) => node.config.startMs !== undefined);
  const declaredMs = explicit
    ? Math.max(...scenes.map((node, index) => Number(node.config.startMs) + durations[index]!))
    : durations.reduce((total, value) => total + value, 0) - graph.nodes.filter((node) => node.type === "timeline.transition" && node.config.type !== "cut").reduce((total, node) => total + (Number(node.config.durationMs) || 0), 0);
  const allowedMs = graph.durationFrames * (1000 / GRAPH_FRAME_RATE);
  if (declaredMs > allowedMs) diagnostics.push(diagnostic("timeline_duration", "/durationFrames", `declared scene timeline is ${declaredMs}ms but graph duration permits ${allowedMs}ms`));
}

function topologicalOrder(nodes: Map<string, GraphNodeV1>, adjacency: Map<string, Set<string>>, orderIndex: Map<string, number>) {
  const indegree = new Map([...nodes.keys()].map((id) => [id, 0]));
  for (const targets of adjacency.values()) for (const target of targets) indegree.set(target, (indegree.get(target) ?? 0) + 1);
  const ready = [...nodes.keys()].filter((id) => indegree.get(id) === 0).sort(priority);
  const output: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    output.push(id);
    for (const target of adjacency.get(id) ?? []) {
      const value = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, value);
      if (value === 0) {
        ready.push(target);
        ready.sort(priority);
      }
    }
  }
  return output;
  function priority(a: string, b: string) { return (orderIndex.get(a) ?? Infinity) - (orderIndex.get(b) ?? Infinity) || a.localeCompare(b); }
}

function visitUndirected(first: string, adjacency: Map<string, Set<string>>) {
  const visited = new Set<string>();
  const pending = [first];
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const value of adjacency.get(id) ?? []) pending.push(value);
  }
  return visited;
}

function hasConfiguredValue(value: Record<string, unknown>, expression: string) {
  const resolved = getAtPath(value, expression);
  return resolved !== undefined && resolved !== null && resolved !== "";
}

function getAtPath(value: Record<string, unknown>, expression: string): unknown {
  let current: unknown = value;
  for (const part of expression.split(".")) {
    if (!current || typeof current !== "object" || !(part in current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setAtPath(value: Record<string, unknown>, expression: string, nextValue: unknown) {
  const parts = expression.split(".");
  let current: any = value;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]!;
    const key: string | number = Array.isArray(current) && /^\d+$/.test(part) ? Number(part) : part;
    const shouldBeArray = /^\d+$/.test(parts[index + 1]!);
    if (!current[key] || typeof current[key] !== "object") current[key] = shouldBeArray ? [] : {};
    current = current[key];
  }
  const finalPart = parts.at(-1)!;
  const finalKey: string | number = Array.isArray(current) && /^\d+$/.test(finalPart) ? Number(finalPart) : finalPart;
  current[finalKey] = nextValue;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function diagnostic(code: string, path: string, message: string, nodeId?: string, edgeId?: string): GraphDiagnosticV1 {
  return { code, path, message, ...(nodeId ? { nodeId } : {}), ...(edgeId ? { edgeId } : {}) };
}
