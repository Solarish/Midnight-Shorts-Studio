# Doodle Path Editor — Status & Handoff

วันที่: 2026-09-02  
สถานะ: ยังไม่พร้อมปิดงาน — ต้องแก้ interaction ของ path editor ก่อนใช้งานจริง

## สรุปงานที่ทำแล้ว

- มี `doodleAssets[]` สำหรับ reusable asset registry
- มี `doodlePaths[]` และ `doodles[]` สำหรับเก็บ placement แบบอ้างอิง `assetId` + `pointIndex`
- ระบบมี system doodle 25 รายการ และ custom asset จาก ComfyUI
- มี filter/search ตามหมวดใน asset library
- renderer รองรับ path-level settings หลายรายการ
- มี path guide overlay บน Interactive Timeline player

## ปัญหาที่ผู้ใช้พบและสาเหตุที่ต้องตรวจต่อ

ผู้ใช้ยังแก้ path ไม่ได้ แม้จะเพิ่มจุดได้ สาเหตุเชิง UX/implementation ที่ต้องแก้:

1. ปุ่มปัจจุบันมีเพียง `Draw path` จึงไม่แยกชัดเจนระหว่าง “วาดใหม่” และ “แก้ path”
2. canvas editor ค้นหาจุดจาก threshold แบบ normalized แต่ยังไม่มี selected path/selected point state ให้ผู้ใช้เห็นว่ากำลังแก้จุดใด
3. การแก้จุดเรียก `onChange` ทุก pointer move ผ่าน parent storyboard ทำให้ต้องตรวจว่า rerender ไม่ทำให้ drag session หลุด
4. เมื่อ `Show path guide` ปิด จุดควบคุมจะหาย ทำให้ผู้ใช้คิดว่า path แก้ไม่ได้ ควรแยก `show guide` กับ `edit mode`
5. เส้นปัจจุบันเป็น polyline; การ “ดัดโค้ง” ยังเป็นการเพิ่มจุดบน segment ไม่ใช่ bezier handle แบบ Illustrator

## พฤติกรรมที่ควรเป็น

- `Draw`: วาด path ใหม่เท่านั้น
- `Edit`: เลือก path แล้วแสดง node/segment handles
- Drag node: ย้ายตำแหน่งและคง `pointIndex` ของ doodle placement
- Double-click segment: เพิ่ม node
- Double-click node หรือ Delete: ลบ node โดยห้ามเหลือน้อยกว่า 2 จุด
- Drag segment/handle: ปรับ curvature แบบ bezier หาก schema รองรับ
- `Show guide`: แสดง/ซ่อนเส้น guide แต่ไม่ปิดความสามารถในการเข้า edit mode
- `Preview`: renderer ใช้ path settings เท่านั้นเมื่อมี `doodlePaths`; ค่า global เดิมไม่ควรทับซ้ำ

## Handoff ให้ agent ถัดไป

### เป้าหมาย

ทำให้ path editor ใช้งานได้แบบชัดเจนใน Interactive Timeline และทำให้ asset matrix แสดงรายการทั้งหมดโดยไม่ถูกตัดหรือ overflow โดยไม่ทำลาย backward compatibility ของ storyboard เดิม

### ลำดับการทำงานที่แนะนำ

1. เพิ่ม state `pathEditMode`, `selectedPathId`, `selectedPointIndex` และปุ่ม `Edit path`
2. แยก canvas interaction เป็น `draw`, `edit`, `inspect` ไม่ใช้ boolean เดียว
3. แก้ drag ให้ใช้ pointer session ref และ local draft ระหว่างลาก แล้ว commit ตอน pointer up เพื่อลด parent rerender
4. เพิ่ม visual selection ของ path/node ที่กำลังแก้
5. เพิ่ม segment insertion และ node deletion พร้อม reindex `doodles[].pointIndex`
6. หากต้องการโค้งจริง ให้เพิ่ม schema `handlesIn/handlesOut` ต่อ point และ renderer ใช้ cubic bezier sampling
7. ตรวจ renderer ทุก parameter ด้วย preview matrix: spacing, frequency, distribution, size, sizeJitter, rotation, rotationJitter, offsetJitter, opacity, seed
8. ให้ asset library ใช้ `grid-template-columns` แบบ responsive, `max-height: none`, และตรวจ parent ที่มี `overflow: hidden`

### Acceptance criteria

- ผู้ใช้เห็นปุ่ม `Edit path` แยกจาก `Draw path`
- เลือก path ได้และเห็น path/node ที่ active
- ลาก node แล้วตำแหน่งใน canvas และ output preview เปลี่ยนตรงกัน
- เพิ่ม/ลบ node ได้โดย doodle placement ไม่ชี้ index ผิด
- ปรับ curvature ได้ หรือมีข้อจำกัดระบุชัดว่าเป็น polyline
- ปิด guide แล้วเข้า edit mode ได้โดยยังเห็น control node
- asset matrix แสดงครบ 25 system + custom ที่มีอยู่ โดยไม่มีการหายเป็นหมวดหรือเหลือแถวเดียว
- system และ custom toggle ทำงานแยกกัน
- build และ regression tests ผ่าน

## Verification ที่ทำแล้ว

- `npm run build --workspace=@psu-ava/control-web` ผ่าน
- `npm run build --workspace=@psu-ava/remotion-studio` ผ่าน
- `git diff --check` ผ่าน
- test suite เดิม: 42/43 ผ่าน; 1 เคสเป็นข้อความ UI เก่าที่ไม่ตรงกับข้อความปัจจุบัน

## ไฟล์หลัก

- `apps/control-web/src/components/ProceduralDoodleCanvas.tsx`
- `apps/control-web/src/components/InteractiveTimelineStudioModal.tsx`
- `apps/control-web/src/components/DoodleAssetLibrary.tsx`
- `apps/remotion-studio/src/presets/DoodleOverlayPreset.tsx`
- `apps/remotion-studio/src/components/CoverCard.tsx`
- `apps/remotion-studio/src/types.ts`
