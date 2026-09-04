import type { ProjectContext } from "./project-context.js";

export type LayoutCoordinates = {
  eyebrow: { positionX: number; positionY: number; size: number };
  title: { positionX: number; positionY: number; size: number };
  subtitle: { positionX: number; positionY: number; size: number };
  person: { positionX: number; positionY: number; scale: number };
};

export async function calculateOptimalLayoutWithLLM(
  data: { personName?: string; positionTitle?: string; award?: string; title?: string },
  aspectRatio: "16:9" | "9:16" = "16:9"
): Promise<LayoutCoordinates> {
  const isVertical = aspectRatio === "9:16";
  const name = String(data.personName || data.title || "").trim();
  const position = String(data.positionTitle || "").trim();
  const award = String(data.award || "").trim();

  const ollamaUrl = process.env.AVA_OLLAMA_URL || "http://10.135.66.70:11434";
  const model = process.env.AVA_OLLAMA_FALLBACK_MODEL || "qwen2.5-coder:1.5b";

  const system = `You are an expert broadcast motion designer. Calculate optimal typography layout coordinates for a ${aspectRatio} documentary graphic card in JSON.
For 16:9 widescreen: person on right (personX=72%, personY=50%, scale=1.15). All text on left safe area (positionX=8% to 12%). Eyebrow is top, Title is center, Subtitle is bottom.
For 9:16 vertical: person on bottom center (personX=50%, personY=75%, scale=1.0). Text in upper half (positionX=8%, eyebrow Y=32%, title Y=42%, subtitle Y=54%).
Ensure font sizes and positions prevent text collisions.`;

  const prompt = `Calculate layout coordinates for:
personName: "${name}" (length: ${name.length})
positionTitle: "${position}" (length: ${position.length})
award: "${award}" (length: ${award.length})

Return JSON:
{"eyebrow": {"positionX": 8, "positionY": ${isVertical ? 32 : 66}, "size": 22}, "title": {"positionX": 8, "positionY": ${isVertical ? 42 : 76}, "size": ${isVertical ? 48 : 56}}, "subtitle": {"positionX": 8, "positionY": ${isVertical ? 54 : 87}, "size": 28}, "person": {"positionX": ${isVertical ? 50 : 72}, "positionY": ${isVertical ? 75 : 50}, "scale": ${isVertical ? 1.0 : 1.15}}}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        keep_alive: "0s",
        stream: false,
        format: "json",
        system,
        prompt
      })
    });
    clearTimeout(timeout);

    if (response.ok) {
      const resData = (await response.json()) as { response?: string };
      if (resData.response) {
        const parsed = JSON.parse(resData.response) as Partial<LayoutCoordinates>;
        if (parsed.eyebrow?.size && parsed.title?.size) {
          return {
            eyebrow: {
              positionX: Number(parsed.eyebrow.positionX ?? 8),
              positionY: Number(parsed.eyebrow.positionY ?? (isVertical ? 32 : 66)),
              size: Math.max(16, Math.min(36, Number(parsed.eyebrow.size ?? 22)))
            },
            title: {
              positionX: Number(parsed.title.positionX ?? 8),
              positionY: Number(parsed.title.positionY ?? (isVertical ? 42 : 76)),
              size: Math.max(36, Math.min(72, Number(parsed.title.size ?? (isVertical ? 48 : 56))))
            },
            subtitle: {
              positionX: Number(parsed.subtitle?.positionX ?? 8),
              positionY: Number(parsed.subtitle?.positionY ?? (isVertical ? 54 : 87)),
              size: Math.max(18, Math.min(38, Number(parsed.subtitle?.size ?? 28)))
            },
            person: {
              positionX: Number(parsed.person?.positionX ?? (isVertical ? 50 : 72)),
              positionY: Number(parsed.person?.positionY ?? (isVertical ? 75 : 50)),
              scale: Number(parsed.person?.scale ?? (isVertical ? 1.0 : 1.15))
            }
          };
        }
      }
    }
  } catch {}

  // Deterministic Rule-Based Fallback
  return calculateRuleBasedLayout(data, isVertical);
}

function calculateRuleBasedLayout(
  data: { personName?: string; positionTitle?: string; award?: string; title?: string },
  isVertical: boolean
): LayoutCoordinates {
  const nameLen = (data.personName || data.title || "").length;
  const awardLen = (data.award || "").length;

  const eyebrowSize = awardLen > 60 ? 20 : awardLen > 35 ? 22 : 26;
  const titleSize = isVertical ? (nameLen > 30 ? 42 : 50) : nameLen > 30 ? 48 : 56;
  const subtitleSize = isVertical ? 22 : 28;

  if (isVertical) {
    return {
      eyebrow: { positionX: 8, positionY: 30, size: eyebrowSize },
      title: { positionX: 8, positionY: 42, size: titleSize },
      subtitle: { positionX: 8, positionY: 54, size: subtitleSize },
      person: { positionX: 50, positionY: 76, scale: 1.0 }
    };
  }

  return {
    eyebrow: { positionX: 8, positionY: 66, size: eyebrowSize },
    title: { positionX: 8, positionY: 76, size: titleSize },
    subtitle: { positionX: 8, positionY: 87, size: subtitleSize },
    person: { positionX: 72, positionY: 50, scale: 1.15 }
  };
}

export async function formatCoverCardAuto(
  item: any,
  projectContext?: ProjectContext | null,
  aspectRatio: "16:9" | "9:16" = "16:9"
): Promise<any> {
  const params = { ...(item.params || {}) };

  // 1. Auto-bind portrait sourceImage if empty
  if (!params.sourceImage && projectContext && projectContext.portraitImages.length > 0) {
    params.sourceImage = projectContext.portraitImages[0]!.path;
  }

  // 2. Ensure personName, positionTitle, award exist
  const name = String(params.personName || params.title || "").trim();
  const position = String(params.positionTitle || params.subtitle || "").trim();
  const award = String(params.award || params.eyebrow || "").trim();

  // 3. Compute optimal coordinates using Local LLM
  const layout = await calculateOptimalLayoutWithLLM({ personName: name, positionTitle: position, award }, aspectRatio);

  // 4. Inject PSU Stidti font and styles
  params.textStyles = {
    eyebrow: {
      positionX: layout.eyebrow.positionX,
      positionY: layout.eyebrow.positionY,
      size: layout.eyebrow.size,
      color: "#E5A93C", // PSU Warm Gold
      fontFamily: "psu-stidti"
    },
    title: {
      positionX: layout.title.positionX,
      positionY: layout.title.positionY,
      size: layout.title.size,
      color: "#FFFFFF",
      fontFamily: "psu-stidti"
    },
    subtitle: {
      positionX: layout.subtitle.positionX,
      positionY: layout.subtitle.positionY,
      size: layout.subtitle.size,
      color: "#00E5FF", // PSU Bright Cyan
      fontFamily: "psu-stidti"
    }
  };

  params.personX = layout.person.positionX / 100;
  params.personY = layout.person.positionY / 100;
  params.personScale = layout.person.scale;

  // 5. Smart Doodle Preset Selection (Instant vector SVG, no GenAI needed)
  params.doodlePreset = selectDoodlePreset({ positionTitle: position, award, personName: name });
  params.doodleOpacity = Number(params.doodleOpacity ?? 0.65);
  params.doodleScale = Number(params.doodleScale ?? 1.0);

  // Use the modern Layered Remotion Cover preset
  const presetId = "comfy-cover-card-v2";

  return {
    ...item,
    presetId,
    params
  };
}

export function selectDoodlePreset(data: {
  positionTitle?: string;
  award?: string;
  personName?: string;
}): "academic" | "science" | "engineering" | "celebration" | "tourism" | "creative" | "sustainability" | "campus" | "vlog" {
  const text = `${data.positionTitle || ""} ${data.award || ""} ${data.personName || ""}`.toLowerCase();

  if (/ทันต|แพทย์|วิทยาศาสตร์|พยาบาล|เภสัช|ชีว|เคมี|ฟิสิกส์|science|dentist|med/i.test(text)) {
    return "science";
  }
  if (/วิศว|คอมพิวเตอร์|เทคโนโลยี|นวัตกรรม|ai|engineer|tech/i.test(text)) {
    return "engineering";
  }
  if (/ท่องเที่ยว|การบริการ|โรงแรม|hospitality|tourism|hotel|resort/i.test(text)) {
    return "tourism";
  }
  if (/ศิลป|ดนตรี|ออกแบบ|สื่อสาร|ภาพยนตร์|creative|design|music|film/i.test(text)) {
    return "creative";
  }
  if (/สิ่งแวดล้อม|ความยั่งยืน|สีเขียว|sustainab|environment|climate/i.test(text)) {
    return "sustainability";
  }
  if (/ชุมชน|นักศึกษา|campus|community/i.test(text)) {
    return "campus";
  }
  if (/เชิดชูเกียรติ|เฉลิมฉลอง/i.test(text)) {
    return "celebration";
  }
  // Default for Tourism & Hospitality, Humanities, Social Sciences, Education, Management
  return "academic";
}

export function formatTitleCardAuto(
  item: any,
  projectContext?: ProjectContext | null,
  aspectRatio: "16:9" | "9:16" = "16:9"
): any {
  const params = { ...(item.params || {}) };

  // 1. Set default preset to 3d-carousel-title-v1 per user directive
  item.presetId = "3d-carousel-title-v1";

  // 2. Auto-bind portrait photos for 3D Carousel cylindrical display
  if ((!params.media || params.media.length === 0) && projectContext && projectContext.portraitImages.length > 0) {
    params.media = projectContext.portraitImages.map((p) => p.path);
  }

  // 3. Configure PSU Stidti typography and theme
  params.theme = {
    fontFamily: "psu-stidti",
    primaryColor: "#E5A93C",
    accentColor: "#00E5FF",
    textColor: "#FFFFFF"
  };

  params.rotationSpeed = Number(params.rotationSpeed ?? 1.0);
  params.cameraTilt = Number(params.cameraTilt ?? 8);
  params.enableReflection = params.enableReflection ?? true;

  return {
    ...item,
    params
  };
}

/**
 * Auto-formats an A-Roll segment with PSU Royal Gold Glass Beacon Lower-Third metadata
 * resolved from ProjectContext / DOCX presenter info.
 */
export function formatARollAuto(
  item: any,
  projectContext?: ProjectContext | null,
  options: { defaultLowerThirdPreset?: string } = {}
): any {
  const params = { ...(item.params || {}) };
  const speaker = String(params.speaker || params.sourceKey || "").trim();
  const existingLt = params.lowerThird || {};
  const presenter = (projectContext as any)?.presenter;

  const ltName = String(existingLt.name || params.lowerThirdName || speaker || presenter?.name || "").trim();
  const ltTitle = String(existingLt.title || params.lowerThirdTitle || presenter?.position || "").trim();
  const ltDept = String(existingLt.department || params.lowerThirdDepartment || presenter?.department || "").trim();

  // Auto-configure Lower-Third if we have speaker information or if it's an A-Roll interview
  const hasSpeakerInfo = Boolean(ltName || speaker || presenter?.name);
  const shouldEnable = existingLt.enabled ?? hasSpeakerInfo;

  params.lowerThird = {
    enabled: shouldEnable,
    presetId: existingLt.presetId || params.lowerThirdPresetId || options.defaultLowerThirdPreset || "lowerthird-glass-beacon-v1",
    name: ltName || "ผู้ให้สัมภาษณ์",
    title: ltTitle,
    department: ltDept,
    offsetMs: Number(existingLt.offsetMs || params.lowerThirdOffsetMs || 500),
    durationMs: Number(existingLt.durationMs || params.lowerThirdDurationMs || Math.min(4500, Math.max(1000, item.durationMs || 4500)))
  };

  // Sync legacy parameters for backward compatibility
  params.enableLowerThird = params.lowerThird.enabled;
  params.lowerThirdName = params.lowerThird.name;
  params.lowerThirdTitle = params.lowerThird.title;
  params.lowerThirdDepartment = params.lowerThird.department;
  params.lowerThirdPresetId = params.lowerThird.presetId;
  params.lowerThirdOffsetMs = params.lowerThird.offsetMs;
  params.lowerThirdDurationMs = params.lowerThird.durationMs;

  return {
    ...item,
    params
  };
}
