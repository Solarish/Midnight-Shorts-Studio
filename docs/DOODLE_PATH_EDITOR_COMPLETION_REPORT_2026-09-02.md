# Doodle Path Editor — Completion & Acceptance Report

วันที่: 2026-09-02  
โครงการ: Midnight Shorts Studio  
สถานะ: **ผ่าน / Accepted**  
ขอบเขต: `cover_3` ของ storyboard จริง `kewalin_documentary_2569`

## 1. สรุปผล

ระบบ Doodle Path Editor ผ่านการปรับโครงสร้าง UI, path editing logic, asset binding และการแสดงผลใน Remotion preview แล้ว ผู้ใช้สามารถวาด path, แก้ไขจุด, เพิ่ม/ลบจุด, ปรับ properties และเลือก system/custom doodle ได้ โดยผลลัพธ์ถูกบันทึกกลับไปยัง storyboard API และเห็นผลใน preview จริง

การตรวจสอบใช้ข้อมูลและไฟล์ media จริงจาก Control API ที่ `127.0.0.1:47650` ไม่มี mock หรือ placeholder ที่นำเสนอเป็นผลสำเร็จ

## 2. ปัญหาที่พบและสาเหตุ

### 2.1 เปิด/ปิด asset แล้วเหลือแค่ตัวเดียว

path มีจำนวน placement อยู่ แต่ logic เดิมแทนที่ asset แบบ incremental ทำให้เมื่อ toggle หลายครั้ง placement จำนวนมากถูกยุบเป็น asset ล่าสุด เช่น duck เพียงตัวเดียว

### 2.2 จำนวนที่เห็นไม่เท่ากับจำนวนจุด

จำนวน `points` และ `doodles` เป็น placement ที่เก็บไว้ ส่วนจำนวนที่เห็นจริงยังผ่านกติกา `distribution`, `spacing`, `frequency`, `seed` และ `assetSet` จึงอาจน้อยกว่าจำนวนจุดได้ตามที่ออกแบบ

### 2.3 system doodle บาง slot แสดงผิดรูป

renderer เดิมมี icon เพียง 8 แบบแล้วนำไปวนซ้ำกับ 25 slots ทำให้ slot 09 เป็นต้นไปไม่ตรงกับชื่อใน asset library เช่น Gear, Spark และ Smile

## 3. การแก้ไขที่ส่งมอบ

### 3.1 UI และ interaction

- เพิ่มโหมด `Inspect`, `Draw path` และ `Edit path`
- ลากจุดเพื่อแก้ geometry และ commit เมื่อปล่อย pointer
- double-click segment เพื่อเพิ่มจุด
- double-click point หรือกด Delete เพื่อลบจุด โดยรักษาขั้นต่ำ 2 จุด
- เพิ่ม path guide เปิด/ปิดได้
- เพิ่มตัวเลือก path และลบ path
- แสดง `points` และ `visible` ของ path ที่เลือกแบบ real-time

### 3.2 Path geometry และ placement reconciliation

- ใช้ normalized coordinates และ clamp ค่า x/y ให้อยู่ในช่วง 0–1
- insert/delete จะ reindex `pointIndex` ของ placement ที่เกี่ยวข้อง
- การ toggle asset จะรักษาจำนวน placement และจุดเดิม
- active asset ทุกตัวจะได้รับ slot อย่างน้อยหนึ่ง slotเมื่อจำนวน placement เพียงพอ
- การจัด asset เป็น deterministic และ idempotent จึงไม่สลับหรือยุบแบบสุ่มเมื่อแก้ซ้ำ
- คำนวณจำนวนที่มองเห็นจากกติกาเดียวกับ renderer

### 3.3 Asset binding และ renderer

- global `doodleAssetSet` ถูกส่งเข้าแต่ละ path อย่างชัดเจน
- inactive asset ถูกกรองออกจากการ render
- custom asset ใช้ filesystem path จริงและ resolve ผ่าน media stream API
- system slot 01–25 ถูก map ตรงกับ DoodleAssetLibrary ครบทุก slot
- custom asset ไม่ใช้ slot เก่าที่อาจชนกัน แต่ใช้ registry entry และ image path ของตัวเอง

## 4. ข้อมูลจริงที่ตรวจสอบ

Storyboard: `kewalin_documentary_2569`  
Item: `cover_3`  
Path: `path_1788343966979`

- จำนวน path points: 21
- จำนวน stored placements: 21
- active asset palette ตอน repair: 5 รายการ
- placement asset IDs ครบตาม active palette
- preview ที่ render จริง: 16 รายการตามค่า spacing/frequency ปัจจุบัน
- ระบบ asset library: 25 system + 2 custom assets

หมายเหตุ: 21 คือจำนวน placement ที่เก็บใน path ส่วน 16 คือจำนวนที่ผ่าน visibility calculation และแสดงจริงใน preview ไม่ใช่ข้อมูลสูญหาย

## 5. Verification checklist

### Automated

- [x] nearest point/segment ใช้ normalized coordinate ถูกต้อง
- [x] insert point เพิ่มจุดและเลื่อน `pointIndex` หลังจุดใหม่
- [x] delete point ลบ placement ที่ผูกกับจุดและ reindex จุดหลังจากนั้น
- [x] path ไม่สามารถลดต่ำกว่า 2 points
- [x] ย้ายจุดถูก clamp ให้อยู่ใน canvas
- [x] toggle palette ไม่ทำให้ placement collapse เหลือ asset เดียว
- [x] active asset ทุกตัวถูกแทนใน placement เมื่อมี slot เพียงพอ
- [x] reconciliation ทำซ้ำแล้วได้ผลลัพธ์เดิม
- [x] visible count ตรงกับ distribution/frequency/spacing/seed/assetSet
- [x] system icon mapping 25 slots compile และใช้งานได้

### Build และ test result

- Control-web tests: **51/51 ผ่าน**
- Control-web build: **ผ่าน**
- Remotion Studio build: **ผ่าน**
- `git diff --check`: **ผ่าน**

### Real browser acceptance

- [x] เปิด storyboard จริงใน browser
- [x] เปิด Timeline Player และเลือก `cover_3` จริง
- [x] เห็น path overlay บนภาพ background/person จริง
- [x] เห็น system/custom asset ตาม active palette
- [x] เห็นค่า `points: 21 · visible: 16` ใน editor
- [x] ตรวจ asset library จริง: system 25 รายการและ custom 2 รายการ
- [x] แก้ path แล้ว persistence ผ่าน Control API revision ใหม่

## 6. ข้อจำกัดที่ตั้งใจคงไว้

- geometry เป็น polyline ตาม schema ปัจจุบัน ยังไม่มี Bézier handles
- `frequency` เป็น visibility filter แบบ deterministic ไม่ใช่การสร้างจำนวนจุดใหม่
- หาก active asset มากกว่าจำนวน placement ระบบจะแสดงได้เท่าจำนวน placement ที่มี
- การลบ path เป็นการลบจาก storyboard draft และต้องบันทึกตาม flow ของ editor

## 7. ไฟล์สำคัญ

- `apps/control-web/src/components/InteractiveTimelineStudioModal.tsx`
- `apps/control-web/src/components/ProceduralDoodleCanvas.tsx`
- `apps/control-web/src/components/path-geometry.ts`
- `apps/control-web/src/components/path-geometry.test.ts`
- `apps/control-web/src/components/DoodleAssetLibrary.tsx`
- `apps/remotion-studio/src/presets/DoodleOverlayPreset.tsx`
- `apps/remotion-studio/src/components/CoverCard.tsx`
- `apps/remotion-studio/src/types.ts`

## 8. Final acceptance

ผลการทดสอบและการตรวจสอบ real browser สอดคล้องกับ acceptance criteria ของ Doodle Path Editor แล้ว จึงปิดงานสถานะ **ผ่าน / Accepted**

[Updated by: Antigravity | Time: 2026-09-02 18:40:00]
