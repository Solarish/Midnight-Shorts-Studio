# 🎴 Cover Card UI Refinement & Sticker Engine Completion Report

**วันที่:** 2026-09-03  
**สถานะ:** ✅ Accepted / ผ่านการทดสอบ 100%  
**พื้นที่งาน:** `apps/control-web`, `apps/control-api`, `packages/storyboard`, `packages/contracts`, `apps/remotion-studio`

---

## 📌 สรุปผู้บริหาร (Executive Summary)

ในรอบการพัฒนานี้ ได้ดำเนินการแก้ไขและยกระดับระบบ **Cover Card Layer Architecture (v2)**, **Remotion Live Preview Synchronization**, **Mathematical Vector Sticker Engine**, และ **Inspector UI Layout** ให้มีความสมบูรณ์ 100% ตามข้อกำหนดการใช้งานจริง:

1. **Topological Sort & Single-Node Compilation Fix:**
   - แก้ปัญหา DAG Validation Error เมื่อกดรันเดี่ยว (`stage === "background"` / `stage === "assets"`) และการจัดลำดับ In-degree Topological Sort ให้ `background_source` อยู่ก่อนหน้า `background_v1` เสมอ
   - แก้ไขปัญหา Orphaned Node ในโหมด `assets` โดยเพิ่ม Edge เชื่อมโยงระหว่าง `cutout` และ `generate_bg`
2. **Interactive Live Player Property Synchronization:**
   - แก้ไขการส่ง Props จาก `item.params` เข้าสู่ `<CoverCard />` ใน `StoryboardSequence.tsx` ให้ส่งต่อครบทุกค่า: `personX`, `personY`, `personScale`, `personSticker`, `personStickerPreset`, `doodleEnabled`, `doodleOpacity`, `doodleScale`, `doodlePreset`, `doodlePaths`
   - แก้ปัญหา `personScale` ติดข้อจำกัดเพดานความสูง โดยเปลี่ยนมาใช้ **CSS GPU Hardware Transform Scaling** (`transform: translate(-50%, -50%) scale(...)`) ปรับขนาดบุคคลได้อิสระจากจุดกึ่งกลาง (Center Anchor)
   - ผูกสถานะ Checkbox `doodleEnabled` เข้ากับตัวเรนเดอร์ ทำให้การเปิด/ปิด Doodle ทำงานแบบเรียลไทม์
3. **Solid Die-Cut Sticker Engine (ขอบขาวสติกเกอร์คมกริบ มีเหลี่ยม สื่อถึงความสนุกสนาน):**
   - พัฒนาระบบขอบสติกเกอร์ด้วย **SVG Mathematical Alpha Dilation (`feMorphology operator="dilate"`)** ไร้รอยเบลอ/ฟุ้ง ให้ความรู้สึกเหมือนสติกเกอร์ Die-cut แปะบนงานวิดีโอ
   - เพิ่ม **Sticker Presets** รวม 3 สไตล์สนุกสนาน:
     - 🤍 **Solid White:** ขอบขาวทึบ 8px ตัดขอบคมกริบ + เงามิติด้านหลัง
     - ⚡ **Comic Pop:** เส้นขอบคู่ (ขอบในสีขาว 6px + ขอบนอกสีทอง PSU Gold 12px) + เงาการ์ตูนป็อปอาร์ต
     - 🕶️ **Retro Cyan:** สไตล์การ์ตูนเรโทร 90s (ขอบขาว 6px + กรอบเข้ม 10px) + เงาบล็อกสีฟ้า Cyan
     - 🚫 **None:** ไม่ใส่ขอบ (ภาพบุคคลธรรมชาติ)
4. **Redesigned Compact Inspector with Full-Width 16:9 Thumbnail:**
   - ยุบ URL Path ที่ซ้ำซ้อนออก เหลือเฉพาะ `PathField` ด้านบน
   - จัดกลุ่ม **Position [X, Y] และ Scale** เป็นช่องกรอกขนาดกะทัดรัด (48px) จัดวางคู่กับดรอปดาวน์เลือก **🏷️ Sticker Preset**
   - แสดงกล่องภาพพรีวิวบุคคลขนาดใหญ่แบบ **Full-Width 16:9** พร้อมป้ายระบุสถานะ `✓ Cutout 16:9` หรือ `Source 16:9`

---

## 🛠️ รายการไฟล์ที่แก้ไขและเพิ่มฟังก์ชัน

| ไฟล์ | การเปลี่ยนแปลงหลัก |
|---|---|
| [`apps/remotion-studio/src/components/CoverCard.tsx`](file:///Users/louislee/Desktop/Midnight-Shorts-Studio/apps/remotion-studio/src/components/CoverCard.tsx) | เพิ่ม SVG Filters (`feMorphology`) 3 รูปแบบ, ลบเส้นสีส้มมุมซ้ายบน, ปรับ CSS Transform Scaling, ผูก `doodleEnabled` |
| [`apps/remotion-studio/src/compositions/StoryboardSequence.tsx`](file:///Users/louislee/Desktop/Midnight-Shorts-Studio/apps/remotion-studio/src/compositions/StoryboardSequence.tsx) | ส่งต่อ Props ทั้งหมดของ `CoverCard`: `personX`, `personY`, `personScale`, `personSticker`, `personStickerPreset`, `doodleEnabled` |
| [`apps/remotion-studio/src/types.ts`](file:///Users/louislee/Desktop/Midnight-Shorts-Studio/apps/remotion-studio/src/types.ts) | เพิ่มชนิดข้อมูล `PersonStickerPreset`, `personSticker`, `personStickerPreset` |
| [`apps/control-web/src/components/inspectors/CoverCardInspector.tsx`](file:///Users/louislee/Desktop/Midnight-Shorts-Studio/apps/control-web/src/components/inspectors/CoverCardInspector.tsx) | จัดเลย์เอาต์ใหม่: ช่องกรอกกะทัดรัด, ดรอปดาวน์ Sticker Presets, กล่อง 16:9 Full-Width Thumbnail |
| [`apps/control-api/src/storyboards.ts`](file:///Users/louislee/Desktop/Midnight-Shorts-Studio/apps/control-api/src/storyboards.ts) | เพิ่ม In-degree Topological Sort, เคลียร์ `backgroundImage` ในโหมด single-run, ผูก edge `cutout -> generate_bg` ในโหมด `assets` |
| [`packages/storyboard/src/index.ts`](file:///Users/louislee/Desktop/Midnight-Shorts-Studio/packages/storyboard/src/index.ts) | สลับลำดับสร้าง `background_source` ก่อน `background_v1`, Propose preset `"comfy-cover-card-v2"` |

---

## 📊 ผลการตรวจสอบและทดสอบ (Verification)

* **Unit Test Suite (`@psu-ava/control-web`):** **65 / 65 Tests Passed (100%)**
* **Build Status:** `@psu-ava/remotion-studio` และ `@psu-ava/control-web` Build สำเร็จ (Exit Code 0)
* **API Validation & Compilation Test:**
  - สั่ง `POST /api/v1/storyboards/:id/validate` ➡️ `{"valid": true}`
  - สั่ง `POST /api/v1/storyboards/:id/approve-and-compile` ➡️ คอมไพล์ 58 Nodes & 58 Edges ครบ 13 ฉากโดยไร้ข้อผิดพลาด
