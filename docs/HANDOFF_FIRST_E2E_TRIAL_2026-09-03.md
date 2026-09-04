# 🎬 HANDOFF: First End-to-End (E2E) Supervised Trial & Improvement Roadmap

**โครงการ:** Midnight Shorts Studio (`@psu-ava/*`)  
**วันที่:** 2026-09-03  
**สถานะ:** Ready for First Supervised E2E Trial (พร้อมสำหรับการทดสอบรอบแรก)  
**เป้าหมายการทดสอบ:** ตรวจสอบความลื่นไหลของระบบแบบครบวงจรตั้งแต่ DOCX Ingestion ➔ 3-Pane Editorial Storyboard ➔ ComfyUI/Vision AI ➔ Remotion 16:9 Master Render พร้อมระบุจุดปรับปรุง

---

## 🧭 1. สรุปความพร้อมก่อนเริ่ม E2E Trial (Pre-Flight Checklist)

| รายการตรวจสอบ | สถานะ | วิธีการตรวจสอบ |
|---|---|---|
| **Control API Server** | ✅ พร้อม | `http://127.0.0.1:47650` (Fastify REST + SSE) |
| **Control Web UI** | ✅ พร้อม | `http://127.0.0.1:5173` (Vite React 3-Pane Studio) |
| **AI Node Services** | ✅ พร้อม | ComfyUI (`10.135.66.70:8188`), Ollama (`10.135.66.70:11434`), JaiTTS (`10.135.66.70:7861`) |
| **Remotion Studio Engine** | ✅ พร้อม | `@psu-ava/remotion-studio` (Multi-layer Live Player) |
| **Unit Test Suite** | ✅ ผ่าน 100% | 65/65 (`control-web`), 18/18 (`storyboard`) |
| **Active Format Standard** | 🔒 16:9 Master | ล็อค 16:9 Landscape Broadcast Master เพื่อคุณภาพความสมบูรณ์แบบ |

### คำสั่งเปิดระบบเพื่อทดสอบ
```bash
cd /Users/louislee/Desktop/Midnight-Shorts-Studio

# รัน Backend API + Frontend Web UI พร้อมกัน
npm run dev
```

---

## 🗺️ 2. ขั้นตอนการทดสอบ E2E (End-to-End Test Journey)

```
[DOCX Ingest / New Storyboard]
           │
           ▼
[Phase 1: Cover Card Editorial]
  ├─ Image Person (NAS Picker -> Remove BG Cutout -> Position X,Y / Scale -> Sticker Preset)
  ├─ Background (AI Prompt / ComfyUI Generate / NAS Select)
  └─ Doodle Layer (10 Category Presets -> 🎲 Randomize Seed -> Depth Field & Text Safe Zone)
           │
           ▼
[Phase 2: A-Roll, Lower-Third & Auto B-Roll]
  ├─ Presenter Metadata & Glassmorphism Lower-Third
  └─ Auto B-Roll Pacing Generator (Dialogue Breathing Windows)
           │
           ▼
[Phase 3: Approval & DAG Compilation]
  └─ In-degree Topological Sort (58+ Nodes Compiled Cleanly)
           │
           ▼
[Phase 4: Remotion Live Playback & Render]
  └─ Live Canvas Playback & Render to 1920x1080 @ 25fps MP4
```

### รายละเอียดการทดสอบแต่ละจุดสำคัญ:
1. **Cover Card Image Person & Sticker:**
   - ทดสอบเลือกภาพบุคคลจาก NAS (`/Volumes/ภาควีดีทัศน์/...`)
   - กดปุ่ม `🧍 Remove background` และตรวจเช็คภาพในกล่อง **Full-Width 16:9 Thumbnail**
   - ปรับ `Position [X, Y]` และ `Scale` ดูการตอบสนองบน Live Player
   - สลับทดสอบ **Sticker Presets**: `Solid White`, `Comic Pop (ขอบทอง)`, `Retro Cyan`, `None`
2. **Cover Card Background:**
   - ทดสอบกด `🎨 Generate Background` (ComfyUI) และตรวจสอบการสุ่ม `randomSeed` ป้องกันแคชภาพเก่า
   - ทดสอบเลือกภาพพื้นหลังแบบ Manual จาก Finder/NAS
3. **Cover Card Doodle Depth Field:**
   - ทดสอบเลือก Preset ตามหมวดหมู่ (เช่น `Academic`, `Science`, `Engineering`, `Celebration`)
   - กดปุ่ม **`🎲 Randomize preset`** หลายๆ ครั้ง เพื่อตรวจสอบมิติความลึก (Foreground/Midground/Background) และความปลอดภัยของพื้นที่ข้อความด้านล่างซ้าย
   - ทดสอบ Checkbox เปิด/ปิด Doodle
4. **Auto B-Roll Pacing & Timeline Montage:**
   - ตรวจสอบการตัดต่อแทรก B-Roll ตามจังหวะคำพูดและการเว้นช่องหายใจ (Dialogue Breathing Windows)
5. **Final Render Verification:**
   - ตรวจสอบไฟล์วิดีโอที่เรนเดอร์ออกมาว่าตรงตามมาตรฐาน PSU Broadcast ทั้งภาพ เสียง ซับไตเติล และโลโก้ปิดท้าย

---

## 🔍 3. จุดที่ค้นพบและข้อเสนอแนะสำหรับการปรับปรุง (Identified Points of Improvement)

จากการทดสอบเชิงเทคนิคและการประเมิน UX เบื้องต้น พบจุดที่สามารถยกระดับและต่อยอดในรอบถัดไปดังนี้:

### 🌟 ระดับ High Priority (UX & Workflow Ergonomics)
1. **Smart Auto-Reframing สำหรับ 9:16 และ 1:1:**
   - *สถานะปัจจุบัน:* ล็อคระบบไว้ที่ 16:9 Broadcast Master เพื่อความปลอดภัยขององค์ประกอบภาพ
   - *ข้อเสนอแนะ:* พัฒนาระบบ AI Subject Tracking / Face-Centric Auto-Crop เพื่อขยายการเรนเดอร์สู่ Vertical 9:16 (TikTok/Shorts/Reels) และ Square 1:1 ได้โดยไม่เกิดการตัดทอนใบหน้าหรือข้อความ
2. **Undo / Redo History State ใน Storyboard Editor:**
   - *ปัญหาที่พบ:* เมื่อกดปุ่ม `🎲 Randomize preset` หรือปรับ `[X, Y, Scale]` ปัจจุบันค่าจะถูกบันทึกทับทันที หากผู้ใช้ชอบการจัดวางชุดก่อนหน้าจะไม่สามารถกดย้อนกลับได้
   - *ข้อเสนอแนะ:* เพิ่มระบบ Local History Stack (Undo/Redo `Cmd+Z` / `Cmd+Shift+Z`) สำหรับพารามิเตอร์การจัดวางภาพและ Doodle
3. **Multi-Card Batch Action Queue:**
   - *ข้อเสนอแนะ:* เพิ่มปุ่มรวมศูนย์ `⚡ Batch Process All Cards` เพื่อให้สามารถสั่งไดคัตภาพบุคคลทุกการ์ด หรือเจนพื้นหลัง AI ทุกฉากพร้อมกันในคิวเดียว

### 💡 ระดับ Medium Priority (Visual Polish & Customization)
4. **Sticker Custom Color & Thickness Controls:**
   - *ข้อเสนอแนะ:* นอกจาก 3 Presets มาตรฐาน (`Solid White`, `Comic Pop`, `Retro Cyan`) เพิ่มตัวเลือก Custom Stroke Color (เช่น สีประจำคณะ/หน่วยงาน) และปรับขนาดความหนาของขอบสติกเกอร์ (4px, 8px, 12px)
5. **Background Style LoRA & Negative Prompt Selector:**
   - *ข้อเสนอแนะ:* เพิ่มช่องเลือก Style Preset สำหรับ Background เช่น `Photorealistic Studio`, `Abstract Geometric`, `Cyber Neon`, `Watercolor Minimal` ใน Inspector
6. **Video Media Streaming Cache & Scrubbing Performance:**
   - *ข้อเสนอแนะ:* พัฒนาระบบ Chunks Buffering และ Thumbnail Scrubbing Preview บน Timeline Strip สำหรับไฟล์วิดีโอ 4K/HD ขนาดใหญ่ที่โหลดจาก NAS

---

## 📝 4. บันทึกผลการทดสอบ (Observer Scorecard Template)

ผู้ทดสอบสามารถใช้ตารางนี้ในการประเมินผลรอบ E2E Trial:

| รายการทดสอบ | คะแนนเต็ม | คะแนนที่ได้ | ข้อสังเกต / ปัญหาที่พบ |
|---|---|---|---|
| 1. ความสะดวกในการ Import / จัดการ Storyboard | 20 | | |
| 2. ประสิทธิภาพการตัดพื้นหลังบุคคล (Cutout) | 20 | | |
| 3. การแสดงผล Sticker & Doodle Depth Field | 20 | | |
| 4. ความลื่นไหลของ Remotion Live Player | 20 | | |
| 5. ความสมบูรณ์ของไฟล์วิดีโอ MP4 16:9 ที่เรนเดอร์ | 20 | | |
| **คะแนนรวม** | **100** | | **สรุปผล: [ PASS / REQUIRE FIX ]** |

---

[Updated by: Antigravity | Time: 2026-09-03 19:40:00]
