import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBrollPacing,
  extractDialogueTags,
  matchBrollAssets,
  generateAutoBrollForARoll,
  selectDoodlePreset
} from "../src/index.ts";

test("selectDoodlePreset maps broadcast faculty signals to the expanded preset catalog", () => {
  assert.equal(selectDoodlePreset({ positionTitle: "อาจารย์ประจำคณะการบริการและการท่องเที่ยว" }), "tourism");
  assert.equal(selectDoodlePreset({ positionTitle: "อาจารย์คณะศิลปกรรมศาสตร์และการออกแบบ" }), "creative");
  assert.equal(selectDoodlePreset({ award: "รางวัลผลงานด้านความยั่งยืนและสิ่งแวดล้อม" }), "sustainability");
  assert.equal(selectDoodlePreset({ positionTitle: "ผู้นำนักศึกษาเพื่อชุมชนมหาวิทยาลัย" }), "campus");
  assert.equal(selectDoodlePreset({ positionTitle: "อาจารย์ทันตแพทยศาสตร์" }), "science");
  assert.equal(selectDoodlePreset({ positionTitle: "อาจารย์วิศวกรรมคอมพิวเตอร์" }), "engineering");
});

test("calculateBrollPacing returns empty for A-roll under 8 seconds", () => {
  assert.deepEqual(calculateBrollPacing(4000), []);
  assert.deepEqual(calculateBrollPacing(7990), []);
});

test("calculateBrollPacing returns 1 centered B-roll for 15s A-roll with proper breathing room", () => {
  const slots = calculateBrollPacing(15000);
  assert.equal(slots.length, 1);
  const slot = slots[0]!;
  assert.ok(slot.offsetMs >= 2520, "Head breathing room >= 2.5s");
  assert.ok(slot.offsetMs + slot.durationMs <= 15000 - 1520, "Tail breathing room <= 15s - 1.5s");
  assert.equal(slot.offsetMs % 40, 0, "Quantized to 25fps frame grid");
  assert.equal(slot.durationMs % 40, 0, "Duration quantized to 25fps frame grid");
});

test("calculateBrollPacing returns chained pair montage for 30s A-roll with dialogue breathing window", () => {
  const slots = calculateBrollPacing(30000);
  assert.equal(slots.length, 2);
  assert.ok(slots[0]!.offsetMs >= 2520, "Head breathing room >= 2.5s");
  // Cut-to-Cut chaining: Slot 2 starts immediately when Slot 1 ends!
  assert.equal(slots[1]!.offsetMs, slots[0]!.offsetMs + slots[0]!.durationMs, "Slot 2 is chained directly to Slot 1 (Cut-to-Cut)");
  // Extended Dialogue Breathing Window on speaker's face after cluster:
  const breathingWindowMs = 30000 - (slots[1]!.offsetMs + slots[1]!.durationMs);
  assert.ok(breathingWindowMs >= 10000, `Extended dialogue breathing window: ${breathingWindowMs}ms >= 10s`);
});

test("calculateBrollPacing returns dual cluster with deep breathing window for 54s A-roll", () => {
  const slots = calculateBrollPacing(54000);
  assert.equal(slots.length, 3);
  // Cluster 1 is chained cut-to-cut
  assert.equal(slots[1]!.offsetMs, slots[0]!.offsetMs + slots[0]!.durationMs, "Cluster 1 clips are chained cut-to-cut");
  // Deep breathing window before Cluster 2
  const midBreathingWindow = slots[2]!.offsetMs - (slots[1]!.offsetMs + slots[1]!.durationMs);
  assert.ok(midBreathingWindow >= 10000, `Mid dialogue breathing window: ${midBreathingWindow}ms >= 10s`);
  assert.ok(slots[2]!.offsetMs + slots[2]!.durationMs <= 54000 - 1520);
});

test("matchBrollAssets assigns candidate videos to slots based on tags", () => {
  const slots = calculateBrollPacing(30000);
  const candidates = [
    { path: "/NAS/Ins/C7736_3d_tooth.MP4", name: "C7736_3d_tooth.MP4", stem: "C7736_3d_tooth" },
    { path: "/NAS/Ins/C7742_teaching.MP4", name: "C7742_teaching.MP4", stem: "C7742_teaching" },
    { path: "/NAS/Ins/C7748_clinic.MP4", name: "C7748_clinic.MP4", stem: "C7748_clinic" }
  ];
  const tags = {
    tags_th: ["ฟันจำลอง", "3 มิติ"],
    tags_en: ["3D model", "dental"]
  };
  const brolls = matchBrollAssets(slots, candidates, tags, "interview_01");
  assert.equal(brolls.length, 2);
  assert.equal(brolls[0]!.id, "interview_01_broll_1");
  assert.equal(brolls[1]!.id, "interview_01_broll_2");
  assert.equal(brolls[0]!.audioPolicy, "mute");
  assert.equal(brolls[0]!.fit, "cover");
  // Top match should be the tooth model
  assert.ok(brolls[0]!.asset.path.includes("C7736"));
});

test("generateAutoBrollForARoll generates complete B-roll configuration", async () => {
  const item = {
    id: "interview_05",
    durationMs: 44000,
    params: {
      dialogue: "อาจารย์พยายามเน้นการสอนให้นักศึกษาเข้าใจง่าย และฝึกปฏิบัติทำฟันจำลอง 3 มิติในคลินิก"
    }
  };
  const candidates = [
    { path: "/NAS/Ins/C7736.MP4", stem: "C7736" },
    { path: "/NAS/Ins/C7742.MP4", stem: "C7742" },
    { path: "/NAS/Ins/C7748.MP4", stem: "C7748" },
    { path: "/NAS/Ins/C7740.MP4", stem: "C7740" }
  ];

  const result = await generateAutoBrollForARoll(item, candidates);
  assert.ok(result.slots.length >= 2);
  assert.equal(result.broll.length, result.slots.length);
  assert.ok(result.tags.tags_th.length > 0);
  assert.ok(result.rationale.includes("B-roll"));
});

test("generateAutoBrollForStoryboard enforces timeline diversity and cooldown", async () => {
  const { generateAutoBrollForStoryboard } = await import("../src/index.ts");

  // 4 consecutive A-roll items
  const items = [
    { id: "shot_1", kind: "a_roll", durationMs: 25000, params: { dialogue: "การเรียนการสอนนักศึกษาฟันจำลอง 3 มิติ" } },
    { id: "shot_2", kind: "a_roll", durationMs: 25000, params: { dialogue: "ฟันจำลอง 3 มิติในห้องปฏิบัติการและคลินิก" } },
    { id: "shot_3", kind: "a_roll", durationMs: 25000, params: { dialogue: "การเรียนการสอนและแล็บวิจัยทันตกรรม" } },
    { id: "shot_4", kind: "a_roll", durationMs: 25000, params: { dialogue: "การสอนนักศึกษาและการตรวจคลินิก" } }
  ];

  const candidates = [
    { path: "/NAS/Ins/C7736.MP4", name: "C7736.MP4", stem: "C7736" },
    { path: "/NAS/Ins/C7742.MP4", name: "C7742.MP4", stem: "C7742" },
    { path: "/NAS/Ins/C7740.MP4", name: "C7740.MP4", stem: "C7740" },
    { path: "/NAS/Ins/C7748.MP4", name: "C7748.MP4", stem: "C7748" },
    { path: "/NAS/Ins/C7731.MP4", name: "C7731.MP4", stem: "C7731" },
    { path: "/NAS/Ins/C7726.MP4", name: "C7726.MP4", stem: "C7726" }
  ];

  const result = await generateAutoBrollForStoryboard(items, candidates);
  assert.equal(result.items.length, 4);

  // Check no two adjacent shots share the exact same top B-roll
  const topClipPaths = result.items.map((it) => it.broll?.[0]?.asset.path);
  for (let i = 0; i < topClipPaths.length - 1; i++) {
    assert.notEqual(topClipPaths[i], topClipPaths[i + 1], `Adjacent shots ${i+1} and ${i+2} must not use identical B-roll`);
  }
  assert.ok(result.uniqueClipsUsed >= 3, "Draws across multiple distinct clips");
});

test("zero B-roll pool handles gracefully without throwing", async () => {
  const { generateAutoBrollForStoryboard } = await import("../src/index.ts");
  const items = [
    { id: "shot_1", kind: "a_roll", durationMs: 20000, params: { dialogue: "สัมภาษณ์" } }
  ];
  const result = await generateAutoBrollForStoryboard(items, []);
  assert.equal(result.totalBrollsAssigned, 0);
  assert.equal(result.items[0]!.broll?.length, 0);
  assert.ok(result.notes[0]?.includes("ไม่พบฟุตเทจ"));
});

test("low B-roll pool enters semantic peak mode instead of looping clips", async () => {
  const { generateAutoBrollForStoryboard } = await import("../src/index.ts");
  const items = [
    { id: "shot_1", kind: "a_roll", durationMs: 15000, params: { dialogue: "แนะนำตัว" } },
    { id: "shot_2", kind: "a_roll", durationMs: 40000, params: { dialogue: "เนื้อหาหลักฟันจำลอง 3 มิติ" } },
    { id: "shot_3", kind: "a_roll", durationMs: 15000, params: { dialogue: "สรุปปิดท้าย" } }
  ];
  // Only 1 clip in pool
  const candidates = [{ path: "/NAS/Ins/C7736.MP4", stem: "C7736" }];
  const result = await generateAutoBrollForStoryboard(items, candidates);
  assert.equal(result.lowFootageMode, true);
  // Shot 2 (main content) gets b-roll, while short intro shot 1 is preserved clean
  assert.ok(result.items.some((i) => i.broll?.length === 0));
});

test("still image candidates are identified with image kind and pending motion treatment", async () => {
  const { matchBrollAssets, calculateBrollPacing } = await import("../src/index.ts");
  const slots = calculateBrollPacing(15000);
  const candidates = [
    { path: "/NAS/ภาพนิ่ง/DSC02129.JPG", name: "DSC02129.JPG", stem: "DSC02129", kind: "image" }
  ];
  const brolls = matchBrollAssets(slots, candidates, { tags_th: ["อาจารย์"], tags_en: ["teacher"] }, "test_item");
  assert.equal(brolls.length, 1);
  assert.equal(brolls[0]!.asset.kind, "image");
  assert.equal(brolls[0]!.treatment, "ken_burns_pending");
});
