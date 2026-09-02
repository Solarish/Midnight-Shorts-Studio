# Logo Outro Node Handoff Document

วันที่: 2026-09-02  
ผู้จัดทำ: Antigravity  
ขอบเขตงาน: ระบบโหนดปิดท้ายรายการ `logo_outro` (Preset Auto UI, Remotion Rendering Engine, Compiler)

---

## 🎯 สรุปภาพรวมของโหนด Outro (`logo_outro`)

โหนด Outro เป็นโหนดลำดับสุดท้ายในสายการผลิตสารคดี/วิดีโอสั้นของ PSU Broadcast ทำหน้าที่แสดงตราสัญลักษณ์ประจำมหาวิทยาลัย/หน่วยงาน หรือเล่นคลิปวิดีโอไตเติลปิดรายการ โดยถูกบังคับให้มี `audioPolicy: "mute"` เสมอ

---

## 📂 ไฟล์สำคัญในระบบ (Key Files & Paths)

1. **`apps/control-web/src/components/inspectors/LogoOutroInspector.tsx`**
   - Inspector Component หลักที่จัดการ Preset Selector และ Auto-Adaptive Forms (Glow / Video / Minimal)
2. **`apps/remotion-studio/src/components/LogoOutro.tsx`**
   - Remotion Component สำหรับเรนเดอร์ภาพนิ่งพร้อมออร่า หรือคลิปวิดีโอแบบ `<OffthreadVideo>`
3. **`apps/remotion-studio/src/compositions/StoryboardSequence.tsx`**
   - จุดประกอบและแมปพารามิเตอร์จาก Storyboard Item สู่ Remotion Studio
4. **`packages/storyboard/src/index.ts`**
   - Storyboard Parser / Validator / Compiler ที่ดูแล Default Logo และ Mute Window

---

## ⚙️ ค่าพารามิเตอร์มาตรฐาน (Parameter Schema Reference)

```ts
interface OutroParams {
  presetId: "logo-outro-v1" | "logo-outro-video-v1" | "logo-outro-minimal-v1";
  sourcePath?: string;       // Default: "/Volumes/ภาควีดีทัศน์/Logo 88 2561/Prince_of_Songkla_University_Emblem.png"
  eyebrow?: string;          // Default: "มหาวิทยาลัยสงขลานครินทร์"
  title?: string;            // Default: "PSU BROADCAST"
  note?: string;             // Alias for title
  subtitle?: string;         // Default: "Prince of Songkla University"
  logoScale?: number;        // 0.5 - 1.5 (Default: 1.0)
  glowIntensity?: number;    // 0.2 - 2.0 (Default: 1.0)
  videoFit?: "cover" | "contain"; // Default: "cover"
  fadeInMs?: number;         // Default: 480
  fadeOutMs?: number;        // Default: 480
}
```

---

## 💡 แนวทางการบำรุงรักษาและพัฒนาต่อ (Next Steps & Recommendations)

1. **Custom Video Alpha Stings:** หากทางสถานีมีไฟล์ Outro Sting เพิ่มเติมในอนาคต สามารถนำไปใส่ไว้ที่ `/Volumes/ภาควีดีทัศน์/` และเลือกผ่านปุ่ม "Open Finder…" ได้ทันที
2. **Preset Extension:** หากต้องการเพิ่ม Preset รูปแบบใหม่ (เช่น Dual-Logo สำหรับงานร่วมกับหน่วยงานภายนอก) สามารถเพิ่ม Preset ID ใน `outroPresetOptions` และเพิ่ม Case ใน `LogoOutroInspector.tsx` และ `LogoOutro.tsx` ได้โดยตรง

[Updated by: Antigravity | Time: 2026-09-02 22:28:00]
