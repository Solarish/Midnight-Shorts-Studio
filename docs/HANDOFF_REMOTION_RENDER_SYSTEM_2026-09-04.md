# 🚀 HANDOFF & SYSTEM SPECIFICATION: REMOTION AUTOMATED RENDER SYSTEM
**Document:** `docs/HANDOFF_REMOTION_RENDER_SYSTEM_2026-09-04.md`  
**Project:** Midnight Shorts Studio (`apps/control-web`, `apps/control-api`, `@psu-ava/remotion-studio`)  
**Date:** 2026-09-04  
**Author:** Antigravity AI Architecture Team  
**Status:** **READY FOR IMPLEMENTATION (ส่งมอบทีมพัฒนาระบบ RENDER)**  

---

## 1. บริบทและสถาปัตยกรรมระบบ (Architecture Context)

### 🚫 Adobe-Free 100% (สถาปัตยกรรมใหม่)
- ระบบตัดขาดจาก Adobe After Effects / Premiere Pro ทั้งหมดแล้ว โดยใช้สถาปัตยกรรม **Lightweight Containerized Web-to-Video Engine**:
  1. **Rendering Core:** Remotion (`@remotion/renderer` + `@remotion/bundler` + React 18 + Canvas)
  2. **Media Transcoding & Trimming:** FFmpeg (libx264 / AAC / ProRes 4444 Alpha)
  3. **Visual AI Generation:** Apple Vision API (ตัดบุคคล 0.5s) + ComfyUI SDXL (สร้างฉากหลังสตูดิโอ)
  4. **Master Video Spec:** 1920×1080 (16:9 Landscape Broadcast Master) @ 25fps

---

## 2. ปัญหาและ Pain Points ในระบบปัจจุบัน (Identified Gaps)

1. **ขาด Visual Feedback ในหน้า Storyboard Editor**:
   - เมื่อผู้ใช้กดปุ่ม `Approve Storyboard & Compile Graph` ระบบบันทึก Draft เป็น Approved Version และสร้าง Compilation Graph แต่แสดงผลเพียง Text Banner เล็กๆ ด้านล่าง (`อนุมัติ Storyboard vX สำเร็จ`)
   - ไม่มี Status Modal หรือ Telemetry Dashboard สรุปความพร้อมของ Remotion Composition ให้ผู้ใช้เห็น
2. **ขาดปุ่มสั่งการใน `Interactive Timeline Studio`**:
   - ผู้ใช้งาน/โปรดิวเซอร์ใช้เวลาตรวจงาน 90% อยู่ในหน้าต่าง `InteractiveTimelineStudioModal` (เล่นพรีวิว Remotion Player, ปรับ BGM, ตรวจ B-Roll)
   - แต่ใน Header ของ Timeline Modal **ไม่มีปุ่ม Approve / Compile / Render** ทำให้ต้องปิดหน้าต่างออกมาข้างนอกเสมอ
3. **ขาด Web Trigger สำหรับ Full Render Master**:
   - ปัจจุบันการ Render ไฟล์ Master วิดีโอตัวเต็มทำผ่าน CLI script (`scripts/render-docx-storyboard-master.js` หรือ `src/adapters/remotion.js`) แต่ยังไม่มีปุ่มกด Render สดจาก Web UI ที่ส่งคำสั่งเข้า Backend Run Scheduler และแสดง Progress Bar 0–100%

---

## 3. ข้อกำหนดและพิมพ์เขียวการพัฒนาระบบ Render (Handoff Blueprint)

```
┌────────────────────────────────────────────────────────────────────────┐
│  STORYBOARD EDITOR / TIMELINE STUDIO (Frontend)                       │
│                                                                        │
│  [●] APPROVE & COMPILE          [🚀] RENDER MASTER (MP4)               │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ POST /api/v1/storyboards/:id/render
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│  CONTROL API & RUN SCHEDULER (Backend)                                 │
│                                                                        │
│  1. Ingest Compiled Storyboard Props (Items, BGM, Transitions)        │
│  2. Trigger Adapter: `renderRemotion()` via @remotion/renderer         │
│  3. Stream Real-time Progress (0% -> 100%) via SSE / Polling           │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│  RENDERED OUTPUTS & EVIDENCE GALLERY                                   │
│                                                                        │
│  📁 `outputs/rendered/<storyboardId>_v<rev>.mp4` (1080p @ 25fps)       │
│  ▶ Direct Web Player · ⬇ Download File · 📂 Reveal in Finder          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. รายละเอียดงานที่ต้องดำเนินการ (Task Breakdown)

### Phase 1: Interactive Timeline Studio Header Action
- [ ] ไฟล์: `apps/control-web/src/components/InteractiveTimelineStudioModal.tsx`
- [ ] เพิ่มปุ่มใน Header ขวา:
  - **`[●] Approve & Compile`**: บันทึกและคอมไพล์ Storyboard ทันที
  - **`🚀 Render Master Video`**: เปิดหน้าต่าง Render Progress Modal
- [ ] สไตล์: Space-Age Console (`--tva-amber`, glowing phosphor indicator, 2-tier stacked text)

### Phase 2: Render Progress & Status Feedback Modal
- [ ] ไฟล์: `apps/control-web/src/components/RenderProgressModal.tsx` (สร้างใหม่)
- [ ] แสดง Telemetry ข้อมูล:
  - Storyboard Name, Approved Version, Total Duration, Scene Count
  - Live Progress Bar (0% – 100%) พร้อม Remotion frame rendering telemetry
  - Estimated time remaining (ETA)
- [ ] เมื่อเรนเดอร์เสร็จ: แสดง Video Player สำหรับเล่นไฟล์ Master ทันที พร้อมปุ่ม **Download MP4** และ **Reveal in Finder**

### Phase 3: Backend Render Endpoint & Worker Execution
- [ ] ไฟล์: `apps/control-api/src/server.ts` & `src/adapters/remotion.js`
- [ ] Endpoint: `POST /api/v1/storyboards/:storyboardId/render`
- [ ] รับ Payload: `{ version, format: "16:9", quality: "master" | "draft" }`
- [ ] สั่งงาน `renderRemotion()` ใน Background Task และส่ง Frame Progress ผ่าน Event Stream
- [ ] บันทึกไฟล์ลง `outputs/rendered/<storyboardId>_v<version>_<timestamp>.mp4`

---

## 5. เกณฑ์การตรวจรับงาน (Acceptance Criteria)

1. **One-Click Delivery:** ผู้ใช้สามารถกด Render ได้ทั้งจากหน้า Storyboard Editor และจากใน Interactive Timeline Studio Modal
2. **Real Data & Zero-Deception:** ไฟล์วิดีโอที่ได้ต้องเป็นไฟล์ MP4 1080p @ 25fps จริงที่เรนเดอร์จาก Remotion Engine
3. **Real-time Telemetry:** แสดง Progress Bar วิ่งตามจริงตั้งแต่ 0% ถึง 100%
4. **Instant Verification:** มี Video Player ให้ตรวจเช็กผลงานทันทีหลังเรนเดอร์จบโดยไม่ต้องเปิดโฟลเดอร์ภายนอก

---

*เอกสารฉบับนี้พร้อมสำหรับส่งต่อให้ทีมพัฒนา / Agent นำไปเริ่มดำเนินการตามขั้นตอนใน Task Breakdown ได้ทันที*
