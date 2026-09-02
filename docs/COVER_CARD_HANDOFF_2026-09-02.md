# Cover Card Handoff

วันที่ส่งมอบ: 2026-09-02  
สถานะ: Accepted / ส่งต่องานให้ agent ถัดไป  
เอกสารอ้างอิงเดิม: [DOODLE_PATH_EDITOR_HANDOFF_2026-09-02.md](./DOODLE_PATH_EDITOR_HANDOFF_2026-09-02.md)

เอกสารนี้เป็น source of truth สำหรับการทำงานของ Cover Card หลังการปรับโครงสร้างรอบนี้ หากมีการแก้ต่อ ให้รักษา ownership และลำดับ stage ตามเอกสารนี้ก่อนแก้ UI หรือ compiler

## 1. แนวคิดหลัก

Cover Card คือ composition หนึ่งใบที่มี layer แยกกัน ไม่ใช่ form เดียวที่ใช้ image field ร่วมกัน:

| ลำดับ layer | Block | ข้อมูลหลัก | output หลัก |
|---|---|---|---|
| 1 | Image Person | `sourceImage`, `personImage`, `positionX`, `positionY`, `scale` | ภาพบุคคลแบบ cutout |
| 2 | Text | `personName`, `positionTitle`, `award`, style ของ text layer | text layers |
| 3 | Doodle | `doodleEnabled`, paths, asset set, placement properties | doodle overlay / placements |
| 4 | Background | `prompt`/`promptParts` หรือ `backgroundImage` | ภาพพื้นหลัง |
| 5 | Output preview | ผลรวมจากทุก layer | preview และ render output |

กติกาสำคัญ:

- `sourceImage` หมายถึงภาพต้นฉบับของบุคคลเท่านั้น
- `personImage` หมายถึงผลจาก Remove background เท่านั้น
- `backgroundImage` หมายถึงภาพพื้นหลังที่เลือกเองหรือผลจาก ComfyUI เท่านั้น
- ห้ามใช้ `sourceImage` เป็น fallback ของ background
- state ทุกตัวต้องอยู่ภายใน Cover Card item ที่กำลังเลือก ห้ามใช้ module-level state ร่วมกันข้าม card
- ทุกการเปลี่ยน field ต้องสะท้อน state, autosave และ preview ตามความเหมาะสม

## 2. Flow ตั้งแต่เพิ่ม Cover Card เข้า Storyboard

### Stage A — Add Cover Card

1. ผู้ใช้กดเพิ่ม Cover Card จาก storyboard/timeline
2. สร้าง item ใหม่ด้วย id ที่ไม่ซ้ำ และ params ชุด v2 ที่มีค่าเริ่มต้นครบ
3. กำหนดค่าเริ่มต้นของ layer แยกกัน:
   - Person: ไม่มี `sourceImage`/`personImage`, position และ scale เป็นค่ามาตรฐาน
   - Text: มี field ว่างหรือค่า default ที่ระบุได้ชัด
   - Doodle: `doodleEnabled` ตาม default, paths และ reusable assets เป็นของ card นี้
   - Background: ใช้ prompt default หรือ `promptParts`; `backgroundImage` ว่างถ้ายังไม่ได้เลือกภาพ
4. บันทึก item ลง storyboard ผ่าน API และรอ response จริงก่อนถือว่าสร้างสำเร็จ
5. เลือก card ใหม่นั้นเป็น active card แล้ว reset inspector view ให้ชี้ไป id ใหม่
6. ห้ามนำ source/output/path/background ของ card ก่อนหน้ามาแสดงแทน card ใหม่

### Stage B — เลือกภาพบุคคล

1. เปิด `Image Person`
2. กดเลือกภาพบุคคลจาก source image picker
3. เก็บ path/asset reference ลง `sourceImage` เท่านั้น
4. แสดง thumbnail ของ source image จาก asset จริง
5. preview ต้องยังไม่ถือว่าเป็น cutout จนกว่า Remove background จะสำเร็จ
6. ถ้ามีผลเดิมจากคนละ source ให้ล้างหรือ mark stale ที่ `personImage` เพื่อไม่ให้ภาพเก่าค้าง

ห้ามทำ:

- ห้ามเขียน source ที่เลือกลง `backgroundImage`
- ห้ามใช้ภาพจาก background picker มาเติม `sourceImage`
- ห้ามใช้ภาพ preview ของ card ก่อนหน้าถ้า current card ยังไม่มี output

### Stage C — Remove background และปรับภาพบุคคล

1. ผู้ใช้กด `Remove background`
2. UI แสดง progress ของปุ่มและ run monitor แยกจาก action อื่น
3. API compile เฉพาะ person stage โดยต้องมี `sourceImage`
4. backend สร้าง source node → cutout node ตาม role `person`
5. เมื่อได้ output จริง ให้ map path กลับ `personImage`
6. preview reload จาก `personImage` และไม่เปลี่ยน background โดยอัตโนมัติ
7. `Position X`, `Position Y`, `Scale` เป็น property ของ person layer; เมื่อเปลี่ยนค่า:
   - update params ของ card ปัจจุบัน
   - autosave
   - คำนวณ style/transform ของ person ใหม่
   - preview ต้องเห็นผลทันทีหรือหลัง state commit รอบเดียว
8. ถ้าเลือก source ใหม่ ให้ invalidate ผล cutout เก่าและบังคับให้ผู้ใช้ Remove background ใหม่ก่อนใช้เป็น final person output

### Stage D — Text

1. เปิด `Text`
2. แก้ `personName`, `positionTitle`, `award` และ text layer styles แยกกัน
3. ทุก field map ไปยัง text layer ของ card ปัจจุบัน
4. preview แสดงข้อความตามค่าล่าสุดหลัง autosave
5. Text ไม่ควรเป็นเจ้าของ output preview หรือ output file ของ background/person/doodle

Validation ของ Text จะถูกใช้เมื่อ run `assets` หรือ flow ที่ต้อง compile final cover; การแก้ text อย่างเดียวไม่ควรถูกบล็อกด้วยการไม่มี source image หากยังไม่ได้สั่ง render final

### Stage E — Doodle

1. เปิด `Doodle`
2. เปิด/ปิด `Doodle overlay` ได้โดยไม่ทำลาย path หรือ asset library
3. เลือก path ที่เป็นของ current card จาก path selector
4. ใช้ `Draw path` เพื่อวาด polyline และ `Edit path` เพื่อย้าย/ลบ/เพิ่มจุด
5. ค่าที่ต้องมีผลจริง:
   - frequency
   - spacing
   - path size
   - offset jitter
   - rotation mode
   - rotation jitter
   - opacity
   - seed
   - distribution
   - size jitter
   - path color
   - path geometry
6. `Randomize placements` ต้องคำนวณ placement ใหม่จาก path ที่เลือก, visible points, distribution, spacing, frequency, seed และ asset set ปัจจุบัน
7. จำนวนที่คำนวณได้ต้องไม่อิง asset ตัวเดียว และต้องกระจาย/วน asset ที่เปิดใช้งานตาม deterministic seed
8. เมื่อเพิ่มหรือนำ asset ออก:
   - update asset set ของ current card
   - recompute placement count และตำแหน่งอัตโนมัติ
   - update preview ทันที
   - ห้ามใช้ placement ที่ค้างจาก asset set เดิม
9. กด `Generate / refresh doodle` เพื่อส่งเฉพาะ doodle stage; stage นี้ไม่ควร require source image หรือ background prompt
10. เมื่อ output สำเร็จ ให้ update `doodleImage`/asset reference และคง path geometry ของผู้ใช้ไว้

การยุบ/ขยาย block ต้องเปลี่ยนเฉพาะ UI visibility ไม่ใช่ลบ state หรือ reset path

### Stage F — Background

Background มี 2 ทางเลือกที่ถูกต้อง และทั้งสองทางเป็น feature ที่รองรับ:

#### F1. Generate จาก prompt

1. ผู้ใช้กรอก prompt หรือแก้ prompt parts
2. preflight ของ background ตรวจว่ามี prompt ที่ compile ได้
3. เมื่อกด `Generate / refresh background` ให้ส่ง stage `background` ของ current card
4. UI ต้องส่ง `backgroundImage: ""` ใน run override เพื่อไม่ให้ manual image เก่าบังผลใหม่
5. compiler สร้าง `generate_bg` → `background_v1`
6. เมื่อ `generate_bg` สำเร็จ ให้ map output image กลับ `backgroundImage` ได้ทันที แม้ downstream overlay หรือ run รวมจะยัง `partial`
7. preview reload จาก path output จริง

#### F2. เลือกภาพพื้นหลังเอง

1. ผู้ใช้เลือกภาพจาก background picker
2. เก็บ reference ลง `backgroundImage` เท่านั้น
3. แสดง thumbnail จาก asset จริง
4. compiler สร้าง `background_source` และเชื่อมเข้า `background_v1`
5. ไม่ควรยิง ComfyUI generate background ซ้ำเมื่อใช้ manual image เว้นแต่ผู้ใช้กด generate เอง
6. เมื่อเปลี่ยน manual background ให้ autosave และ preview update อัตโนมัติ

ภาพบุคคลกับภาพพื้นหลังอาจมาจากไฟล์เดียวกันได้ในอนาคตถ้าผู้ใช้เลือกอย่างชัดเจน แต่ reference และ role ต้องยังแยกกันเสมอ ห้ามเดาจาก field เดียว

### Stage G — Run all

1. ปุ่ม `Run all` อยู่บนสุดของ Cover Card inspector และทำงานกับ active card เท่านั้น
2. ตรวจ preflight ของทุก stage ที่จำเป็นและแสดง field ที่ขาดก่อน request
3. ส่ง run request ของ card เดียว โดยไม่รวม state ของ card อื่น
4. แสดง progress bar ของ run รวมและ progress/action state ของแต่ละ block
5. monitor polling ต้องแสดง:
   - run id
   - current step และจำนวน step
   - percentage
   - heartbeat/เวลาอัปเดตล่าสุด
   - connection state
   - terminal state: success, partial, failed, stale
6. เมื่อ step ใด `success` และมี output ให้ map output ทันที แม้ run รวมยังไม่จบ
7. เมื่อทุก dependency สำเร็จ ให้ update output preview รวม
8. ถ้า run เป็น `partial` ต้องรักษา output ที่สำเร็จแล้วและบอก step ที่ pending/failed ให้ผู้ใช้เห็น
9. ถ้า run เป็น `failed` ห้ามล้าง output ที่สำเร็จเดิมโดยไม่มีเหตุผล; แสดง error ที่แก้ได้

## 3. Contract และ validation

แหล่งอ้างอิงกลาง: `packages/contracts/src/cover-card.ts`

| Stage | field ที่ต้องมีอย่างน้อย |
|---|---|
| person | `sourceImage` |
| background | `prompt` หรือ `promptParts` หรือ manual `backgroundImage` ตาม mode |
| doodle | ไม่มี source image บังคับ; ใช้ path/asset set ตามที่เปิดใช้งาน |
| assets/final | `sourceImage`, prompt/background mode และ text fields `personName`, `positionTitle`, `award` ตาม schema |

การ validate ต้องเกิด 2 ระดับ:

- UI preflight: แจ้งเร็ว ป้องกัน request ที่รู้ว่าข้อมูลไม่ครบ
- API/compiler validation: เป็น gate สุดท้าย ป้องกันข้อมูลผิดแม้เรียก API โดยตรง

ห้ามแก้ด้วยการปิด validation ทั้งหมด เพราะจะทำให้ final render รับข้อมูลไม่ครบ; ให้ stage-filter เฉพาะ field ที่ไม่เกี่ยวกับ stage ที่ผู้ใช้สั่ง

## 4. API และสถานะที่ต้องใช้ตรวจสอบ

### Run และ output

- Storyboard run endpoint: ใช้ trailing slash ตาม convention ของ CMS API
- Run status endpoint: ใช้ `runId` ที่ตอบจาก run request
- Output file endpoint: ต้องตรวจว่า path ใน step output เปิดอ่านได้จริง

ผลลัพธ์ที่ต้องยึด:

```text
step.status === "success" && step.output.localPath/path มีค่า
    -> map เข้า params และ preview ได้
overall.status === "partial"
    -> ไม่ใช่เหตุผลให้ทิ้ง output ของ step ที่สำเร็จ
```

### เครื่องและ ComfyUI

- Debian status proxy: `/api/v1/system/status`
- ComfyUI status proxy: `/api/v1/comfyui/status`
- Debian endpoint ภายนอก: `http://10.135.66.70:3001/admin/api/system`
- ComfyUI endpoint ภายนอก: `http://10.135.66.70:8188/system_stats` และ `/queue`

สถานะ `online` หมายถึงติดต่อปลายทางได้และตอบข้อมูล ไม่ได้แปลว่า workflow ปัจจุบันสำเร็จแล้ว ต้องดู run step output ประกอบเสมอ

## 5. Failure modes และวิธีวิเคราะห์

### `422 Unprocessable Entity`

ตรวจตามลำดับ:

1. current card id ถูกต้องหรือไม่
2. stage ที่ส่งถูกต้องหรือไม่
3. UI preflight แสดง field ที่ขาดหรือไม่
4. backend stage filter ไม่ได้บังคับ field ของ stage อื่นหรือไม่
5. `promptParts` ถูก compile เป็น prompt จริงหรือไม่

### ปุ่มค้าง / ไม่รู้ว่า ComfyUI ค้างหรือไม่

ดู 3 แหล่งพร้อมกัน:

1. heartbeat ของ run monitor
2. `/api/v1/system/status` ว่า Debian ยัง online หรือไม่
3. `/api/v1/comfyui/status` ดู queue running/pending และ system stats

ถ้า heartbeat หยุดเกิน stale threshold ให้แสดง `stale` แยกจาก `failed`; ห้ามค้างข้อความ `Generating...` โดยไม่มี timestamp หรือรายละเอียด

### Generate สำเร็จแต่ preview ไม่เปลี่ยน

ตรวจว่า:

1. step ที่สำเร็จมี output path จริงหรือไม่
2. UI map output จาก `current.steps` แม้ overall เป็น `partial` หรือไม่
3. output ถูกเขียนลง field ที่ถูกต้อง (`backgroundImage`, `personImage`, `doodleImage`) หรือไม่
4. `resolveMediaUrl` ถูกเรียกกับ URL/path จริงหรือไม่
5. image element ถูก remount/cache-bust เมื่อ path เปลี่ยนหรือไม่

### Card หนึ่งแสดงผลของอีก card

ตรวจ:

- active card id ใน selector
- React key ของ inspector/preview
- autosave payload ว่ามี item id เดียว
- path/asset/output state ว่าถูกเก็บใน params ของ item ไม่ใช่ global state

## 6. ไฟล์สำคัญ

- `apps/control-web/src/StoryboardEditorPage.tsx` — inspector, stage actions, run monitor, output mapping
- `apps/control-web/src/components/InteractiveTimelineStudioModal.tsx` — modal inspector ที่ใช้ contract เดียวกัน
- `apps/control-api/src/storyboards.ts` — stage validation และ node compilation
- `apps/control-api/src/server.ts` — system/ComfyUI status proxy
- `packages/contracts/src/cover-card.ts` — stage/field contract กลาง
- `packages/storyboard/src/index.ts` — schema และ workflow compiler
- `apps/remotion-studio/src/components/CoverCard.tsx` — final preview composition

## 7. Verification checklist สำหรับ agent ถัดไป

### UI isolation

- เพิ่ม Cover Card ใหม่ 3 ใบ
- เลือกทีละใบและตรวจว่า source, background, text, doodle, output ไม่สลับกัน
- เปลี่ยน source ของใบที่ 2 แล้วใบที่ 1 และ 3 ต้องไม่เปลี่ยน
- ยุบ/ขยาย Doodle แล้ว path/asset/preview ต้องคงเดิม

### Person

- เลือก source แล้ว thumbnail ตรงกับไฟล์จริง
- ก่อน Remove background ต้องไม่แสดง source เป็น background
- Remove background สำเร็จแล้ว `personImage` เปลี่ยน
- แก้ X/Y/Scale และเห็นผลใน preview

### Text

- แก้ชื่อ/ตำแหน่ง/รางวัลและ style
- Output preview ต้องอยู่นอก Text block
- Text ที่ขาดไม่ควรบล็อก person-only หรือ background-only run

### Doodle

- วาด path, แก้จุด, ลบจุด, เพิ่มจุด
- เปิด/ปิด doodle แล้ว overlay เปลี่ยนทันที
- เพิ่มฟัน/เป็ดหรือ asset อื่น แล้วจำนวน placement และภาพต้องเปลี่ยนตาม asset set
- เอา asset ออกแล้วต้องไม่เหลือภาพค้าง
- กด Randomize หลายครั้ง: seed เปลี่ยนหรือ placement เปลี่ยนตาม design ที่กำหนด และไม่ทำให้ path หาย

### Background

- Generate จาก prompt โดยไม่มี source image
- เลือก manual background แล้ว thumbnail/preview ตรงกัน
- สลับ manual → generate แล้วภาพใหม่ต้องกลับมาแทนภาพเดิม
- Generate สำเร็จใน step แรกแต่ run รวม partial: preview ต้องอัปเดต

### Run/monitor

- Run all จาก card ใหม่
- ตรวจ progress bar ของ Run all และปุ่มราย block
- ตรวจ heartbeat และข้อความ stale/failed
- ตรวจ Debian และ ComfyUI status จาก proxy
- ตรวจ output path เปิดอ่านได้จริง

## 8. ข้อควรระวังในการแก้ต่อ

- อย่ารวม `sourceImage`, `personImage` และ `backgroundImage` เป็น field เดียวเพื่อความสะดวก
- อย่าใช้ overall run status เป็นเงื่อนไขเดียวในการอัปเดต output
- อย่าเพิ่ม action ไว้บน toolbar กลางถ้า action นั้นเป็นของ Cover Card รายใบ
- อย่าเอา `uploads` ของภาพบุคคลเข้า background workflow โดยอัตโนมัติ
- รักษา v1 compatibility ของ storyboard ที่มีอยู่เดิม และเปลี่ยน schema อย่างมี migration เมื่อจำเป็น
- ทุกการทดสอบ output ต้องอ้างอิงไฟล์/สถานะจริง; หากใช้ fixture หรือ mock ต้องประกาศให้ชัดว่าไม่ใช่หลักฐาน production

## 9. สถานะส่งมอบ

งานรอบนี้ถือว่าผ่านและส่งต่อได้แล้วตาม acceptance criteria ใน completion report โดยมี test/build evidence และ real system status evidence แนบไว้ในรายงาน การพัฒนาต่อควรเริ่มจาก verification checklist ด้านบน และต้องไม่ย้อนกลับไปใช้ image ownership แบบรวมศูนย์อีก

