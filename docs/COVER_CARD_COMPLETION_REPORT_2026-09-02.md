# Cover Card Completion Report

วันที่: 2026-09-02  
สถานะ: Accepted / ผ่านตามขอบเขตที่ตกลง  
พื้นที่งาน: `apps/control-web`, `apps/control-api`, `packages/storyboard`, `packages/contracts`, `apps/remotion-studio`

## สรุปผู้บริหาร

แก้ flow ของ Cover Card ให้แยกตาม layer การใช้งานจริง และส่งต่อข้อมูลด้วย contract เดียวกันตั้งแต่ UI → API → compiler → preview/output แล้ว โดยจุดสำคัญคือภาพบุคคลอยู่ใน `Image Person` เท่านั้น, ภาพพื้นหลังเป็น feature ของ `Background` แยกต่างหาก, Doodle ไม่ผูก source image โดยไม่จำเป็น และผลลัพธ์จาก step ที่สำเร็จสามารถอัปเดตกลับเข้า preview ได้ แม้ run รวมจะอยู่สถานะ `partial` เพราะยังมี step ปลายทางค้างอยู่

## ปัญหาที่ตรวจพบและแก้แล้ว

1. เลือกภาพบุคคลแล้วถูกนำไปใช้เป็น background เนื่องจากใช้ field/fallback ร่วมกัน
2. Run ของ Cover Card ใหม่ถูก backend ปฏิเสธด้วย `422 Unprocessable Entity` เพราะ validation ตรวจทุก field พร้อมกัน แม้ผู้ใช้สั่งทำเพียง stage เดียว
3. Background generate สำเร็จใน step แรก แต่ UI ไม่อัปเดต เพราะ UI รอเฉพาะสถานะรวม `success`
4. Doodle และ asset library มี state/placement ที่ปะปนข้าม card หรือคำนวณจำนวนตาม asset เดียว
5. ปุ่ม action อยู่ผิดระดับ ทำให้เลือก Cover Card ใหม่แล้ว action ไม่ได้อ้างอิง card ปัจจุบัน
6. Output preview อยู่ใน Text ทั้งที่เป็นผลลัพธ์รวมของ Cover Card
7. ไม่มีสถานะ heartbeat/เครื่องปลายทาง/ComfyUI ให้แยกได้ว่าระบบกำลังทำงานหรือค้าง

## สิ่งที่เปลี่ยนแปลง

### Contract และ compiler

- เพิ่ม `packages/contracts/src/cover-card.ts` เป็นแหล่งกลางของ stage และ field ที่จำเป็น
- แยก preflight validation ตาม stage: `person`, `background`, `doodle`, `assets`
- รองรับ `prompt` หรือ `promptParts` โดยใช้ prompt ที่ compile แล้วจริง
- แยก `sourceImage` ของบุคคลออกจาก background workflow
- หากเลือก background แบบ manual จะสร้าง `background_source` และไม่ยิง generate background ซ้ำใน compiled graph
- เพิ่มโหมด compile สำหรับ stage ที่ผ่าน preflight แล้ว เพื่อไม่ให้ validation ของ field อื่นมาบล็อกงานที่ผู้ใช้ไม่ได้สั่ง

### UI และ interaction

Inspector ของ Cover Card เรียงตาม layer จริง:

1. `Image Person *`
2. `Text *`
3. `Doodle *`
4. `Background *`
5. `Output preview`

Action อยู่ใน block ของตัวเองและอ้างอิง card ที่เลือกอยู่เสมอ:

- Run all อยู่บนสุดของ Cover Card inspector
- Image Person: เลือก source, แสดง thumbnail, Remove background, ปรับ Position X/Y/Scale
- Doodle: enable/disable, draw/edit path, asset library, Randomize placements, generate/refresh
- Background: prompt/prompt parts, เลือก background แบบ manual ได้, thumbnail, generate/refresh
- Output preview แยกเป็น block ของตัวเอง

### API และ monitoring

- เพิ่ม proxy สถานะ Debian ที่ `/api/v1/system/status`
- เพิ่ม proxy สถานะ ComfyUI ที่ `/api/v1/comfyui/status`
- Run monitor แสดง heartbeat, elapsed time, connection state, current step, progress และ terminal state
- ถ้า step ใดสำเร็จแล้ว จะ map output กลับเข้า params/preview ทันที ไม่รอให้ run รวมสำเร็จครบทุก step

## Root cause เชิงสถาปัตยกรรม

เดิม UI, validation และ compiler ใช้ความหมายของ “ภาพต้นทาง” ไม่ตรงกัน บางจุดตีความว่าเป็นภาพบุคคล บางจุดตีความว่าเป็นภาพพื้นหลัง และ run ถูกออกแบบเหมือนทุก stage ต้องพร้อมพร้อมกัน จึงเกิดทั้งภาพไปผิด layer, การ์ดใหม่ run ไม่ได้ และ output ที่สร้างแล้วไม่แสดง

แนวทางที่ใช้แก้คือกำหนด ownership ชัดเจน:

```text
sourceImage   -> Image Person -> personImage
prompt/manual -> Background   -> backgroundImage
paths/assets  -> Doodle      -> doodleImage / placements
text fields   -> Text        -> text layers
all outputs   -> Output preview / final cover render
```

## หลักฐานการตรวจสอบจริง

- ตรวจ API สถานะ Debian จริงที่ `10.135.66.70:3001/admin/api/system` ได้ข้อมูล CPU, RAM, disk และ GPU
- ตรวจ ComfyUI จริงที่ `10.135.66.70:8188/system_stats` และ `/queue` ได้ version `0.20.1`, RTX 3060 และ queue ปัจจุบันว่าง
- ทดสอบ stage ของ Cover Card จริงผ่าน API แล้ว:
  - person stage: HTTP `202`
  - background stage ที่ไม่มี source บุคคลแต่มี prompt: HTTP `202`
  - doodle stage ที่ไม่มี source บุคคล: HTTP `202`
- ทดสอบกรณี background step สำเร็จแต่ run รวมเป็น `partial` แล้วพบ output ของ `generate_bg`; logic ล่าสุด map output สำเร็จกลับ preview ได้แล้ว
- ทดสอบเพิ่ม Cover Card ใหม่หลายใบและยืนยันว่า action ถูก disable/enable ตาม card และ stage ปัจจุบัน ไม่ใช้ state ของ card อื่น

หมายเหตุความโปร่งใส: หลักฐานข้างต้นเป็นการตรวจระบบจริงและ API จริง ไม่มี mock output หรือ placeholder มาใช้แทนผลลัพธ์ production; สถานะ ComfyUI online/queue ว่างเป็นหลักฐานว่าเครื่องพร้อม ไม่ใช่การรับรองว่า render ทุก workflow สำเร็จครบทุก node

## ผลการทดสอบ

- `@psu-ava/storyboard`: 6/6 ผ่าน
- `@psu-ava/control-web`: 52/52 ผ่าน
- `@psu-ava/contracts`: build ผ่าน
- `@psu-ava/storyboard`: build ผ่าน
- `@psu-ava/control-api`: build ผ่าน
- `@psu-ava/control-web`: build ผ่าน
- `@psu-ava/remotion-studio`: build ผ่าน
- `git diff --check`: ผ่าน

## การเก็บกวาดและข้อมูลที่กระทบ

- หยุด dev server/session ที่เปิดขึ้นเพื่อทดสอบแล้ว
- ลบ Cover Card ทดสอบที่สร้างเพิ่ม 3 ใบออกจาก storyboard ตามขอบเขตการทดสอบ
- ไม่ลบ Cover Card เดิม, asset library, output history หรือไฟล์ production อื่น
- ไม่แก้ global Nginx, ไม่ restart service ที่ไม่เกี่ยวข้อง และไม่แก้ข้อมูลบน Debian/ComfyUI

## เกณฑ์รับงาน

งานนี้ถือว่าผ่านเมื่อ:

- field ของแต่ละ layer ไม่ปะปนกัน
- card ใหม่แต่ละใบมี state และ action ของตัวเอง
- แก้ position/scale/path แล้วเห็นผลใน preview
- เพิ่ม/เอา asset เข้าออกได้ และจำนวน placement คำนวณจาก path + distribution + spacing + frequency + seed + asset set
- manual background และ generated background แสดงผลกลับมาได้
- run มี progress/heartbeat/error ที่ตรวจสอบได้
- partial run ไม่ทิ้ง output ของ step ที่สำเร็จ
- Storyboard Editor และ Interactive Timeline Studio ใช้ shared inspector ชุดเดียวกัน 100%
- Custom Doodle เชื่อมต่อกับ Centralized API Store (`GET/POST/DELETE /api/v1/doodles/custom`) สามารถสร้าง, เรียกใช้, และลบได้ตลอดเวลา

[Updated by: Antigravity | Time: 2026-09-02 21:59:00]

