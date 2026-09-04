const FRAME_MS = 40; // 25 fps standard

export interface BrollSlot {
  slotIndex: number;
  offsetMs: number;
  durationMs: number;
}

export interface DialogueTags {
  tags_th: string[];
  tags_en: string[];
}

export interface CandidateAsset {
  path: string;
  name?: string;
  stem?: string;
  relativePath?: string;
  kind?: "video" | "image" | string;
  role?: string;
}

export interface GeneratedBrollItem {
  id: string;
  asset: { path: string; kind?: "video" | "image" | string };
  offsetMs: number;
  durationMs: number;
  audioPolicy: "mute" | "preserve";
  fit: "cover" | "contain";
  preset: string;
  treatment?: "ken_burns_pending" | "parallax_pending" | "cutaway_video" | string;
}

export interface AutoBrollResult {
  slots: BrollSlot[];
  tags: DialogueTags;
  broll: GeneratedBrollItem[];
  rationale: string;
}

export interface GlobalTimelineState {
  usedClipCounts: Map<string, number>;
  recentClipHistory: string[];
}

export interface AutoBrollOptions {
  ollamaUrl?: string;
  model?: string;
  timeoutMs?: number;
  timelineState?: GlobalTimelineState;
}

export interface StoryboardItemWithParams {
  id: string;
  kind?: string;
  durationMs: number;
  params?: Record<string, unknown>;
  broll?: GeneratedBrollItem[];
}

export interface StoryboardAutoBrollResult {
  items: StoryboardItemWithParams[];
  totalBrollsAssigned: number;
  uniqueClipsUsed: number;
  lowFootageMode: boolean;
  notes: string[];
}

function quantize(ms: number): number {
  return Math.max(FRAME_MS, Math.round(ms / FRAME_MS) * FRAME_MS);
}

/**
 * 1. Broadcast Duration Pacing Engine (Organic Editorial Clusters)
 * Organizes B-rolls into natural chained clusters (pairs/triplets cut-to-cut)
 * and deep dialogue breathing windows, avoiding robotic equal intervals.
 */
export function calculateBrollPacing(aRollDurationMs: number): BrollSlot[] {
  const dur = Math.max(0, Math.floor(aRollDurationMs));
  // Under 8 seconds: too short for cutaway, viewer needs to see speaker establish message
  if (dur < 8000) {
    return [];
  }

  const HEAD_MS = 2520; // 63 frames (~2.5s)
  const TAIL_MS = 1520; // 38 frames (~1.5s)
  const availableMs = dur - (HEAD_MS + TAIL_MS);

  if (availableMs < 3000) {
    return [];
  }

  const slots: BrollSlot[] = [];

  // Case 1: Short-to-Medium Shot (8s - 24s) -> Single Accent Cutaway
  if (dur < 24000) {
    const durationMs = quantize(Math.min(4000, Math.max(2520, availableMs - 1000)));
    // Asymmetric offset: leave slightly more room at the tail for conclusion
    const offsetMs = quantize(HEAD_MS + Math.floor((availableMs - durationMs) * 0.4));
    slots.push({ slotIndex: 1, offsetMs, durationMs });
    return slots;
  }

  // Case 2: Medium-to-Long Shot (24s - 45s) -> Chained Pair Montage Cluster (Cut-to-Cut)
  // Example: 30s shot -> Head 2.5s -> Clip 1 (3.0s) -> Clip 2 (3.0s) -> Dialogue Breathing Window (15s!) -> Tail 1.5s
  if (dur < 45000) {
    const clip1Duration = quantize(3000);
    const clip2Duration = quantize(3000);
    const clusterTotalMs = clip1Duration + clip2Duration; // 6000ms

    // Position cluster starting after head breathing room (e.g. 2.5s to 3.5s)
    const clusterStartMs = quantize(HEAD_MS + Math.min(1000, (availableMs - clusterTotalMs) * 0.15));

    // Clip 1
    slots.push({ slotIndex: 1, offsetMs: clusterStartMs, durationMs: clip1Duration });
    // Clip 2: Chained Cut-to-Cut directly after Clip 1 (0ms gap!)
    slots.push({ slotIndex: 2, offsetMs: clusterStartMs + clip1Duration, durationMs: clip2Duration });

    // The remaining duration (typically 12s - 25s) is a generous, continuous Dialogue Breathing Window on the speaker's face!
    return slots;
  }

  // Case 3: Extended Narrative Shot (45s - 65s) -> Dual-Cluster Sequence
  // Cluster 1 (Chained Pair, 6s) -> Deep Breathing Window (12-16s) -> Cluster 2 (Single Accent, 3.5s) -> Tail
  if (dur < 65000) {
    const clip1Duration = quantize(3000);
    const clip2Duration = quantize(3000);
    const cluster1StartMs = quantize(HEAD_MS + 400);

    // Cluster 1: Chained Pair
    slots.push({ slotIndex: 1, offsetMs: cluster1StartMs, durationMs: clip1Duration });
    slots.push({ slotIndex: 2, offsetMs: cluster1StartMs + clip1Duration, durationMs: clip2Duration });

    // Cluster 2: Second cutaway after a generous dialogue breathing window (~12s - 16s)
    const breathingWindowMs = quantize(Math.max(10000, Math.floor((dur - 25000) * 0.5)));
    const clip3Duration = quantize(3520);
    const cluster2StartMs = quantize(cluster1StartMs + clip1Duration + clip2Duration + breathingWindowMs);

    if (cluster2StartMs + clip3Duration <= dur - TAIL_MS) {
      slots.push({ slotIndex: 3, offsetMs: cluster2StartMs, durationMs: clip3Duration });
    }
    return slots;
  }

  // Case 4: Long Segment (>= 65s) -> Two Chained Pairs separated by an extended breathing window
  // Cluster 1 (Pair: 6s) -> Breathing Window (15-20s) -> Cluster 2 (Pair: 6s) -> Optional Accent -> Tail
  const pair1Duration = quantize(3000);
  const pair2Duration = quantize(3000);
  const cluster1Start = quantize(HEAD_MS + 400);

  // Cluster 1
  slots.push({ slotIndex: 1, offsetMs: cluster1Start, durationMs: pair1Duration });
  slots.push({ slotIndex: 2, offsetMs: cluster1Start + pair1Duration, durationMs: pair2Duration });

  // Breathing window of 14s - 20s
  const midBreathingMs = quantize(Math.max(12000, Math.floor(availableMs * 0.35)));
  const cluster2Start = quantize(cluster1Start + pair1Duration + pair2Duration + midBreathingMs);

  // Cluster 2
  if (cluster2Start + pair1Duration + pair2Duration <= dur - TAIL_MS) {
    slots.push({ slotIndex: 3, offsetMs: cluster2Start, durationMs: pair1Duration });
    slots.push({ slotIndex: 4, offsetMs: cluster2Start + pair1Duration, durationMs: pair2Duration });

    // If extremely long (> 80s), check for a final 5th cutaway
    const extraAvailable = dur - (cluster2Start + pair1Duration + pair2Duration + TAIL_MS);
    if (extraAvailable >= 8000) {
      const extraStart = quantize(cluster2Start + pair1Duration + pair2Duration + 4000);
      const extraDur = quantize(3520);
      if (extraStart + extraDur <= dur - TAIL_MS) {
        slots.push({ slotIndex: 5, offsetMs: extraStart, durationMs: extraDur });
      }
    }
  } else if (cluster2Start + pair1Duration <= dur - TAIL_MS) {
    slots.push({ slotIndex: 3, offsetMs: cluster2Start, durationMs: pair1Duration });
  }

  return slots;
}

/**
 * 2. Semantic Tag Extraction using Local Ollama on Debian node (10.135.66.70)
 * Uses lightweight qwen2.5-coder:1.5b (< 1GB VRAM) with immediate keep_alive: "0s" eviction.
 */
export async function extractDialogueTags(
  dialogue: string,
  options: {
    ollamaUrl?: string;
    model?: string;
    timeoutMs?: number;
  } = {}
): Promise<DialogueTags> {
  const text = String(dialogue ?? "").trim();
  if (!text) {
    return { tags_th: [], tags_en: [] };
  }

  const ollamaUrl = options.ollamaUrl ?? process.env.AVA_OLLAMA_URL ?? "http://10.135.66.70:11434";
  const model = options.model ?? "qwen2.5-coder:1.5b";
  const timeoutMs = options.timeoutMs ?? 8000;

  const prompt = `Analyze this dialogue and output 3-5 search keywords in English and Thai for B-roll footage matching:
"${text}"
Reply ONLY JSON format: {"tags_th": ["คำ1", "คำ2"], "tags_en": ["word1", "word2"]}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        format: "json",
        stream: false,
        keep_alive: "0s",
        options: {
          temperature: 0.1,
          num_predict: 128
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as any;
      const parsed = typeof data.response === "string" ? JSON.parse(data.response) : data.response;
      if (parsed && (Array.isArray(parsed.tags_th) || Array.isArray(parsed.tags_en))) {
        return {
          tags_th: Array.isArray(parsed.tags_th) ? parsed.tags_th.map(String) : [],
          tags_en: Array.isArray(parsed.tags_en) ? parsed.tags_en.map(String) : []
        };
      }
    }
  } catch {
    // Fall back to rule-based keyword extraction
  }

  // Rule-based fallback if Ollama is unreachable
  return extractFallbackTags(text);
}

function extractFallbackTags(text: string): DialogueTags {
  const tags_th: string[] = [];
  const tags_en: string[] = [];

  const rules: Array<{ re: RegExp; th: string; en: string }> = [
    { re: /ฟันจำลอง|3\s*มิติ|3d|โมเดล|พรินต์/i, th: "ฟันจำลอง 3 มิติ", en: "3D dental model" },
    { re: /แล็บ|วิจัย|ห้องปฏิบัติการ|นวัตกรรม/i, th: "ห้องแล็บทันตกรรม", en: "dental laboratory research" },
    { re: /คลินิก|คนไข้|รักษา|ตรวจ/i, th: "คลินิกทันตกรรม", en: "dental clinic patient" },
    { re: /สอน|นักศึกษา|เรียน|บรรยาย|อาจารย์|เลคเชอร์/i, th: "การเรียนการสอนนักศึกษา", en: "teaching students lecture" },
    { re: /พี่น้อง|ฟีดแบค|เสริมแรง|ความสุข|อบอุ่น/i, th: "บรรยากาศการทำงาน", en: "mentoring atmosphere" },
    { re: /รางวัล|ดีเด่น|เชิดชู|เกียรติ/i, th: "อาจารย์ตัวอย่างดีเด่น", en: "award speech achievement" }
  ];

  for (const rule of rules) {
    if (rule.re.test(text)) {
      tags_th.push(rule.th);
      tags_en.push(rule.en);
    }
  }

  if (tags_th.length === 0) {
    tags_th.push("บรรยากาศการทำงานในคณะ");
    tags_en.push("faculty atmosphere");
  }

  return { tags_th, tags_en };
}

/**
 * 3. Asset Matching and Scoring with Global Timeline Cooldown & Still-Image Support
 * Scores B-roll candidates against extracted tags and enforces timeline diversity.
 */
export function matchBrollAssets(
  slots: BrollSlot[],
  candidates: CandidateAsset[],
  tags: DialogueTags,
  parentItemId: string,
  timelineState?: GlobalTimelineState
): GeneratedBrollItem[] {
  if (slots.length === 0 || candidates.length === 0) {
    return [];
  }

  const allTagTokens = [...tags.tags_th, ...tags.tags_en]
    .flatMap((t) => t.toLowerCase().split(/[\s,/_-]+/))
    .filter(Boolean);

  const usageMap = timelineState?.usedClipCounts ?? new Map<string, number>();
  const recentClips = timelineState?.recentClipHistory ?? [];

  // Score each candidate
  const scored = candidates.map((cand, idx) => {
    let score = 0;
    const text = `${cand.name ?? ""} ${cand.stem ?? ""} ${cand.relativePath ?? ""} ${cand.path}`.toLowerCase();

    for (const token of allTagTokens) {
      if (text.includes(token)) score += 12;
    }

    // Heuristics for typical camera filenames
    if (/c7736|c7737|c7740|tooth|model|3d/.test(text) && tags.tags_th.some((t) => /3\s*มิติ|ฟัน|โมเดล/i.test(t))) score += 18;
    if (/c7742|c7731|c7726|discuss|mentor/.test(text) && tags.tags_th.some((t) => /สอน|นักศึกษา|พี่น้อง|เลคเชอร์/i.test(t))) score += 18;
    if (/c7748|c7745|clinic|ตรวจ/.test(text) && tags.tags_th.some((t) => /คลินิก|คนไข้|ตรวจ/i.test(t))) score += 18;
    if (/c7727|c7734|microscope/.test(text) && tags.tags_th.some((t) => /กล้อง|ไมโคร|ปฏิบัติ/i.test(t))) score += 18;

    // --- GLOBAL DIVERSITY & COOLDOWN PENALTIES ---
    // 1. Frequency penalty: -15 points per prior usage across the timeline
    const count = usageMap.get(cand.path) ?? 0;
    score -= count * 15;

    // 2. Immediate Recency Cooldown: -35 points if used in immediate preceding shot
    if (recentClips.includes(cand.path)) {
      score -= 35;
    }

    // Deterministic shuffle tie-breaker using candidate index
    score += ((idx * 17 + 5) % 11) * 0.2;
    return { cand, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const usedInThisShot = new Set<string>();
  const items: GeneratedBrollItem[] = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    // Find highest scoring unused candidate in this shot
    let pick = scored.find((s) => !usedInThisShot.has(s.cand.path))?.cand;
    if (!pick) {
      // If pool smaller than slots, cycle through
      pick = scored[i % scored.length]?.cand;
    }

    if (pick) {
      usedInThisShot.add(pick.path);
      // Track usage count
      usageMap.set(pick.path, (usageMap.get(pick.path) ?? 0) + 1);

      const isImage = /\.(jpe?g|png|webp)$/i.test(pick.path) || pick.kind === "image";
      items.push({
        id: `${parentItemId}_broll_${i + 1}`,
        asset: { path: pick.path, kind: isImage ? "image" : "video" },
        offsetMs: slot.offsetMs,
        durationMs: slot.durationMs,
        audioPolicy: "mute",
        fit: "cover",
        preset: "none",
        treatment: isImage ? "ken_burns_pending" : "cutaway_video"
      });
    }
  }

  // Update recent clip history for the next shot
  if (timelineState) {
    timelineState.recentClipHistory = Array.from(usedInThisShot);
  }

  return items;
}

/**
 * End-to-end Auto B-Roll Generator for a single A-Roll Storyboard Item
 */
export async function generateAutoBrollForARoll(
  item: {
    id: string;
    durationMs: number;
    params?: Record<string, unknown>;
  },
  candidates: CandidateAsset[],
  options?: AutoBrollOptions
): Promise<AutoBrollResult> {
  const dialogue = String(item.params?.dialogue ?? item.params?.sound ?? "");
  const slots = calculateBrollPacing(item.durationMs);

  if (slots.length === 0) {
    return {
      slots: [],
      tags: { tags_th: [], tags_en: [] },
      broll: [],
      rationale: item.durationMs < 8000 ? "A-roll สั้นเกินไป (< 8 วิ) ไม่จำเป็นต้องตัดภาพ B-roll แทรก" : "ไม่มีช่วงเวลาว่างที่เหมาะสมสำหรับแทรก B-roll"
    };
  }

  const tags = await extractDialogueTags(dialogue, options);
  const broll = matchBrollAssets(slots, candidates, tags, item.id, options?.timelineState);

  const rationale = `คัดเลือก B-roll จำนวน ${broll.length} คัต ตามจังหวะเวลา ${Math.round(item.durationMs / 1000)}s ของบทพูด โดยเว้นช่วงเปิดหน้าผู้พูด 2.5s และปิดท้าย 1.5s`;

  return {
    slots,
    tags,
    broll,
    rationale
  };
}

/**
 * 4. Storyboard-Wide Batch Generator with Global Cooldown & Low-Footage Fallback
 */
export async function generateAutoBrollForStoryboard(
  items: StoryboardItemWithParams[],
  candidates: CandidateAsset[],
  options: AutoBrollOptions = {}
): Promise<StoryboardAutoBrollResult> {
  const timelineState: GlobalTimelineState = options.timelineState ?? {
    usedClipCounts: new Map<string, number>(),
    recentClipHistory: []
  };

  const aRolls = items.filter((item) => !item.kind || item.kind === "a_roll");
  const notes: string[] = [];

  // Zero B-roll handling
  if (candidates.length === 0) {
    notes.push("ไม่พบฟุตเทจ B-roll ในโฟลเดอร์ — รักษาความต่อเนื่องของภาพสัมภาษณ์ A-roll หลัก พร้อมเน้นกราฟิกประกอบแทน");
    return {
      items: items.map((i) => ({ ...i, broll: [] })),
      totalBrollsAssigned: 0,
      uniqueClipsUsed: 0,
      lowFootageMode: false,
      notes
    };
  }

  // Low B-roll handling: if pool is scarce (e.g. fewer than 3 clips total, or ratio < 0.3)
  const requiredSlotsEstimated = aRolls.reduce((sum, item) => sum + (item.durationMs >= 18000 ? 2 : item.durationMs >= 8000 ? 1 : 0), 0);
  const isLowFootage = candidates.length <= 3 || candidates.length / Math.max(1, requiredSlotsEstimated) < 0.3;

  if (isLowFootage) {
    notes.push(`ฟุตเทจ B-roll มีจำกัด (${candidates.length} คลิป) — เข้าสู่โหมด Semantic Peak Prioritization: เลือกใส่เฉพาะช่วงประเด็นสำคัญ ไม่วนคลิปซ้ำ`);
  }

  const updatedItems: StoryboardItemWithParams[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]!;
    if (item.kind && item.kind !== "a_roll") {
      updatedItems.push(item);
      continue;
    }

    // In low footage mode, prioritize only longer or key thesis shots (skip short introductory/closing shots < 20s)
    if (isLowFootage && item.durationMs < 20000) {
      updatedItems.push({ ...item, broll: [] });
      continue;
    }

    const auto = await generateAutoBrollForARoll(item, candidates, {
      ...options,
      timelineState
    });

    updatedItems.push({
      ...item,
      broll: auto.broll
    });
  }

  const totalAssigned = Array.from(timelineState.usedClipCounts.values()).reduce((a, b) => a + b, 0);
  const uniqueClips = timelineState.usedClipCounts.size;

  return {
    items: updatedItems,
    totalBrollsAssigned: totalAssigned,
    uniqueClipsUsed: uniqueClips,
    lowFootageMode: isLowFootage,
    notes
  };
}
