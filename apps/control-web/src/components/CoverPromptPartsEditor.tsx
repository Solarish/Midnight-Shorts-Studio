import type { CoverPromptParts } from "@psu-ava/remotion-studio";
import React, { useState } from "react";
import "./cover-prompt-parts.css";

export const COVER_PROMPT_DEFAULTS: Required<CoverPromptParts> = {
  place: "professional university broadcast studio environment",
  time: "quiet daytime interior with warm natural ambient light",
  color: "deep navy, warm gold and subtle teal color palette",
  lighting: "controlled cinematic lighting with soft warm practical highlights",
  composition: "wide architectural perspective with clean negative space on the left for title overlay and visual detail on the right",
  style: "realistic editorial documentary photography",
  detail: "sharp focus across the full scene, crisp fine details, high resolution"
};

export function renderCoverPrompt(parts?: CoverPromptParts, customDirection = "") {
  const merged = { ...COVER_PROMPT_DEFAULTS, ...(parts ?? {}) };
  const direction = customDirection
    .split(/[.;,]/)
    .map((part) => part.trim())
    .filter((part) => part && !/\b(psu|z[- ]?image|no|without|not|never|avoid)\b/i.test(part))
    .join(", ");
  return Object.values(merged).concat(direction ? [direction] : []).filter(Boolean).join(". ") + ".";
}

export interface CoverThemePreset {
  id: string;
  codeLabel: string;
  thaiLabel: string;
  title: string;
  desc: string;
  parts: Partial<CoverPromptParts>;
}

export const COVER_THEME_PRESETS: CoverThemePreset[] = [
  {
    id: "broadcast-studio",
    codeLabel: "STUDIO",
    thaiLabel: "สตูดิโอสถานี",
    title: "PSU Studio",
    desc: "โทนน้ำเงิน-ทอง สว่างคมชัดมาตรฐานสถานี",
    parts: {
      place: "professional university broadcast studio environment with acoustic wood wall panels",
      time: "quiet daytime interior with warm natural ambient light",
      color: "deep navy, warm gold and subtle teal color palette",
      lighting: "controlled cinematic lighting with soft warm practical highlights",
      composition: "wide architectural perspective with clean negative space on the left for title overlay and visual detail on the right",
      style: "realistic editorial documentary photography",
      detail: "sharp focus across the full scene, crisp fine details, high resolution"
    }
  },
  {
    id: "science-lab",
    codeLabel: "LAB",
    thaiLabel: "ห้องแล็บวิจัย",
    title: "Science & Lab",
    desc: "แล็บวิทยาศาสตร์และการแพทย์ สะอาดทันสมัย",
    parts: {
      place: "modern advanced university dental and scientific research laboratory with pristine equipment",
      time: "bright daytime interior with crisp clinical lighting",
      color: "clean clinical white, subtle blue and steel silver palette",
      lighting: "diffused daylight with bright high-CRI workstation illumination",
      composition: "layered depth with research counter on the right and soft negative space on the left",
      style: "editorial science documentary photography",
      detail: "crisp glass and metallic reflections, sharp fine textures"
    }
  },
  {
    id: "grand-hall",
    codeLabel: "HALL",
    thaiLabel: "หอประชุมใหญ่",
    title: "Grand Hall",
    desc: "หอประชุม & สถาปัตยกรรม โอ่อ่าสง่างาม",
    parts: {
      place: "prestigious university auditorium and architectural colonnade hall",
      time: "late afternoon with warm ambient glow through high windows",
      color: "warm amber, royal navy and marble textures",
      lighting: "majestic grand hall ambient light with architectural warm wall sconces",
      composition: "centered architectural perspective with elegant depth of field",
      style: "premium architectural documentary photography",
      detail: "rich material texture, sharp architectural lines, 8k high resolution"
    }
  },
  {
    id: "green-campus",
    codeLabel: "CAMPUS",
    thaiLabel: "วิทยาเขตธรรมชาติ",
    title: "Green Campus",
    desc: "สวนพฤกษศาสตร์ บรรยากาศร่มรื่นผ่อนคลาย",
    parts: {
      place: "peaceful university botanical campus walkway with tropical greenery and modern glass pavilion",
      time: "warm golden hour afternoon with dappled sunlight",
      color: "natural emerald green, sunlit golden amber and soft slate tones",
      lighting: "warm golden hour natural rim lighting with soft bokeh background",
      composition: "wide establishing environmental view with lush foliage on the perimeter",
      style: "cinematic nature documentary photography",
      detail: "crisp foliage detail, soft background blur, clean atmospheric clarity"
    }
  },
  {
    id: "cyber-tech",
    codeLabel: "TECH",
    thaiLabel: "นวัตกรรมดิจิทัล",
    title: "Cyber & AI",
    desc: "สตูดิโอเทคโนโลยี แสงนีออน LED ล้ำสมัย",
    parts: {
      place: "futuristic high-tech media studio with subtle LED volumetric depth and server displays",
      time: "dramatic evening interior studio lighting",
      color: "midnight indigo, electric cyan and neon violet accents",
      lighting: "dramatic neon edge lighting with deep cinematic contrast",
      composition: "wide dynamic angle with digital motif accents on the right",
      style: "futuristic technology documentary cinematography",
      detail: "sharp laser-clean edges, subtle emissive glows, ultra high definition"
    }
  },
  {
    id: "royal-honor",
    codeLabel: "CEREMONY",
    thaiLabel: "พิธีการเกียรติยศ",
    title: "Royal Honor",
    desc: "หอเกียรติยศและพิธีการ หรูหราทรงเกียรติ",
    parts: {
      place: "regal academic conference chamber with ceremonial royal university emblems and fine wood",
      time: "formal daytime indoor celebration atmosphere",
      color: "royal PSU gold, rich sapphire navy and polished dark mahogany",
      lighting: "warm dignified spotlighting with gentle rim highlights",
      composition: "dignified wide perspective with ceremonial background elements",
      style: "prestigious commemorative portrait background",
      detail: "crisp golden metallic sheen, rich wood grain textures"
    }
  }
];

const MOOD_LIGHTING = [
  { code: "MORNING", label: "แสงเช้าธรรมชาติ", value: "soft morning natural light with warm ambient fill" },
  { code: "STUDIO", label: "ไฟสตูมาตรฐาน", value: "controlled cinematic studio lighting with soft diffuse key light" },
  { code: "CINEMA", label: "ภาพยนตร์มีมิติ", value: "cinematic side lighting with dramatic practical rim highlights" },
  { code: "GOLDEN", label: "แสงค่ำอบอุ่น", value: "cozy late afternoon golden glow with soft architectural lamps" },
  { code: "NEON", label: "นีออนไซเบอร์", value: "vibrant neon edge lighting with cool cyber fill light" }
];

const MOOD_COLORS = [
  { code: "NAVY-GOLD", label: "น้ำเงิน-ทองสงขลา", value: "deep navy, warm PSU gold and subtle teal color palette" },
  { code: "TEAL-SLATE", label: "ฟ้าเขียว-เทา", value: "cool teal, slate gray and subtle charcoal palette" },
  { code: "CLEAN WHITE", label: "ขาวคลีน-ไม้", value: "clean minimalist white, warm oak wood and cream tones" },
  { code: "MIDNIGHT", label: "มิดไนท์-ม่วง", value: "midnight indigo, electric cyan and neon purple accents" }
];

const QUICK_TAG_SUGGESTIONS = [
  "LED Backdrop // จอ LED ด้านหลัง",
  "Academic Bookshelf // ชั้นวางตำราวิชาการ",
  "Campus Glass View // กระจกวิววิทยาเขต",
  "Deep Bokeh // ละลายฉากหลังลึก"
];

const DIMENSION_PRESETS: Record<keyof CoverPromptParts, Array<{ label: string; value: string }>> = {
  place: [
    { label: "[●] สตูดิโอบรอดคาสต์", value: "professional university broadcast studio environment" },
    { label: "[●] ห้องแล็บวิจัย", value: "modern advanced scientific research laboratory with equipment" },
    { label: "[●] หอประชุมใหญ่", value: "prestigious university auditorium and architectural colonnade hall" },
    { label: "[●] ห้องบรรยาย", value: "modern tiered university lecture theater with warm wood paneling" },
    { label: "[●] วิทยาเขตธรรมชาติ", value: "peaceful university botanical campus with tropical greenery" },
    { label: "[●] โถงอาคารทันสมัย", value: "sunlit modern university glass atrium and open lounge" }
  ],
  time: [
    { label: "[●] เช้าตรู่", value: "early morning with gentle sunrise glow" },
    { label: "[●] กลางวัน", value: "quiet daytime interior with warm natural ambient light" },
    { label: "[●] บ่ายแก่", value: "late afternoon with warm golden light spilling through windows" },
    { label: "[●] ยามเย็น", value: "blue hour dusk with warm indoor ambient illumination" },
    { label: "[●] ค่ำ", value: "quiet evening interior with cozy ambient lighting" }
  ],
  color: [
    { label: "[●] น้ำเงิน-ทอง", value: "deep navy, warm gold and subtle teal color palette" },
    { label: "[●] ฟ้า-เทา", value: "cool teal, slate gray and subtle charcoal palette" },
    { label: "[●] โทนอุ่นธรรมชาติ", value: "warm neutral beige, oak wood and soft white palette" },
    { label: "[●] คูลบลู", value: "crisp cool blue and metallic silver palette" },
    { label: "[●] โมโนโครม", value: "elegant monochrome with deep slate contrast" }
  ],
  lighting: [
    { label: "[●] ไฟสตูดิโอ", value: "controlled cinematic lighting with soft warm practical highlights" },
    { label: "[●] แสงธรรมชาติ", value: "diffuse natural daylight from large windows" },
    { label: "[●] แสงข้างภาพยนตร์", value: "cinematic directional side lighting with soft shadow roll-off" },
    { label: "[●] แสง Rim Light", value: "dramatic rim lighting with subtle background illumination" },
    { label: "[●] สปอตไลท์", value: "warm focused architectural spotlights" }
  ],
  composition: [
    { label: "[◆] มุมกว้าง", value: "wide architectural perspective with clean negative space on the left" },
    { label: "[◆] เว้นซ้ายให้ชื่อ", value: "composed with clean empty left zone for text overlay and right subject focus" },
    { label: "[◆] สมมาตรกึ่งกลาง", value: "centered symmetrical architectural view with balanced depth" },
    { label: "[◆] จุดเด่นฝั่งขวา", value: "asymmetric framing with architectural elements clustered on the right" },
    { label: "[◆] มิติหลายชั้น", value: "layered depth with foreground textures and soft background blur" }
  ],
  style: [
    { label: "[▲] สารคดีภาพจริง", value: "realistic editorial documentary photography" },
    { label: "[▲] ภาพยนตร์", value: "cinematic documentary photography with filmic color grade" },
    { label: "[▲] คอมเมอร์เชียล", value: "clean crisp commercial advertising photography" },
    { label: "[▲] สถาปัตยกรรม", value: "sharp architectural interior photography" },
    { label: "[▲] บรอดคาสต์พรีเมียม", value: "high-end broadcast television studio backdrop" }
  ],
  detail: [
    { label: "[■] คมชัดสูง 8K", value: "sharp focus across the full scene, crisp fine details, high resolution" },
    { label: "[■] เท็กซ์เจอร์สมจริง", value: "rich tactile material texture, realistic wood grain and metal sheen" },
    { label: "[■] คลีนสะอาดตา", value: "clean smooth surfaces, immaculate noise-free clarity" },
    { label: "[■] มิติแสงเงา", value: "subtle specular highlights, realistic ambient occlusion shadows" }
  ]
};

export function CoverPromptPartsEditor({
  value,
  customDirection = "",
  onChange,
  onCustomDirectionChange
}: {
  value?: CoverPromptParts;
  customDirection?: string;
  onChange: (value: CoverPromptParts) => void;
  onCustomDirectionChange: (value: string) => void;
}) {
  const merged = { ...COVER_PROMPT_DEFAULTS, ...(value ?? {}) };
  const [selectedThemeId, setSelectedThemeId] = useState<string>("broadcast-studio");
  const [copied, setCopied] = useState<boolean>(false);
  const [customFields, setCustomFields] = useState<Set<keyof CoverPromptParts>>(new Set());

  // Apply a whole theme
  const applyTheme = (preset: CoverThemePreset) => {
    setSelectedThemeId(preset.id);
    onChange({
      ...merged,
      ...preset.parts
    });
  };

  // Add custom suggestion to customDirection
  const addTagSuggestion = (tag: string) => {
    const cleanTag = tag.replace(/^[+]\s*/, "").replace(/^[^\wก-๙\s]+\s*/, "").trim();
    if (!customDirection) {
      onCustomDirectionChange(cleanTag);
    } else if (!customDirection.includes(cleanTag)) {
      onCustomDirectionChange(`${customDirection.trim()}, ${cleanTag}`);
    }
  };

  const fullPromptText = renderCoverPrompt(merged, customDirection);

  const handleCopyPrompt = () => {
    try {
      navigator.clipboard.writeText(fullPromptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <section className="cover-prompt-parts" aria-label="Cover Card prompt template">
      {/* Header */}
      <header>
        <div>
          <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="tva-lamp" />
            <span className="tva-telemetry-title">AI STUDIO BACKGROUND // สร้างภาพฉากหลัง</span>
          </h3>
          <small>เลือกธีมฉากหลังสตูดิโอ Positive prompt parts · English only · รับ prompt ภาษาอังกฤษโดยตรง</small>
        </div>
        <code className="tva-badge">ComfyUI SDXL / FLUX</code>
      </header>

      {/* 1. Curated Broadcast Theme Presets (1-Click) */}
      <div>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#FBBF24", fontSize: "11px", fontWeight: 700, marginBottom: "6px" }}>
          <span className="tva-lamp" />
          <span className="tva-telemetry-title">STUDIO THEMES // พรีเซ็ตฉากหลัง</span>
        </label>
        <div className="cover-theme-grid">
          {COVER_THEME_PRESETS.map((preset) => {
            const isSelected = selectedThemeId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={`cover-theme-card ${isSelected ? "selected" : ""}`}
                onClick={() => applyTheme(preset)}
                title={preset.desc}
              >
                <div className="theme-header">
                  <span className={isSelected ? "tva-lamp" : "tva-lamp-off"} />
                  <span className="theme-title">{preset.codeLabel}</span>
                </div>
                <div className="theme-desc">{preset.thaiLabel}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Mood & Lighting Modifiers */}
      <div className="cover-mood-section">
        <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#FBBF24", fontSize: "11px", fontWeight: 700 }}>
          <span className="tva-lamp" />
          <span className="tva-telemetry-title">LIGHTING // บรรยากาศแสง</span>
        </label>
        <div className="cover-mood-row">
          {MOOD_LIGHTING.map((m) => {
            const isSelected = merged.lighting === m.value;
            return (
              <button
                key={m.code}
                type="button"
                className={`cover-mood-chip ${isSelected ? "selected" : ""}`}
                onClick={() => onChange({ ...merged, lighting: m.value })}
              >
                <span className={isSelected ? "tva-lamp" : "tva-lamp-off"} />
                <strong>{m.code}</strong>
                <span style={{ fontSize: "10px", opacity: 0.8 }}>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Color Mood Selector */}
      <div className="cover-mood-section">
        <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#FBBF24", fontSize: "11px", fontWeight: 700 }}>
          <span className="tva-lamp" />
          <span className="tva-telemetry-title">COLOR PALETTE // โทนสีหลัก</span>
        </label>
        <div className="cover-mood-row">
          {MOOD_COLORS.map((c) => {
            const isSelected = merged.color === c.value;
            return (
              <button
                key={c.code}
                type="button"
                className={`cover-mood-chip ${isSelected ? "selected" : ""}`}
                onClick={() => onChange({ ...merged, color: c.value })}
              >
                <span className={isSelected ? "tva-lamp" : "tva-lamp-off"} />
                <strong>{c.code}</strong>
                <span style={{ fontSize: "10px", opacity: 0.8 }}>{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Custom Direction & Tag Suggestions */}
      <div className="cover-prompt-custom">
        <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#CBD5E1", fontSize: "11px", fontWeight: 700 }}>
          <span className="tva-lamp" />
          <span className="tva-telemetry-title">CUSTOM DIRECTION // คำสั่งเจาะจงเพิ่มเติม</span>
        </label>
        <input
          aria-label="Cover background direction"
          value={customDirection}
          onChange={(event) => onCustomDirectionChange(event.target.value)}
          placeholder="เช่น มีจอ LED ขนาดใหญ่, ชั้นวางตำราวิชาการ, ตรามหาวิทยาลัยสีทองนวล..."
        />
        <div className="cover-tag-suggestions">
          <span style={{ fontSize: "10px", color: "#64748B", alignSelf: "center", marginRight: "2px" }}>แท็กแนะนำ:</span>
          {QUICK_TAG_SUGGESTIONS.map((tag) => (
            <button
              key={tag}
              type="button"
              className="cover-tag-btn"
              onClick={() => addTagSuggestion(tag.split("//")[0]?.trim() ?? tag)}
            >
              + {tag}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Progressive Disclosure: 7-Dimension Fine Tuning */}
      <details style={{ marginTop: "4px" }}>
        <summary style={{ color: "#E2E8F0" }}>
          <span className="tva-lamp" />
          <span className="tva-telemetry-title">FINE-TUNING // ปรับแต่ง 7 มิติ</span>
        </summary>
        <div className="cover-prompt-grid">
          {(Object.keys(DIMENSION_PRESETS) as Array<keyof CoverPromptParts>).map((key) => {
            const keyLabels: Record<keyof CoverPromptParts, string> = {
              place: "สถานที่ (Place)",
              time: "ช่วงเวลา (Time)",
              color: "ชุดสี (Color Palette)",
              lighting: "การจัดแสง (Lighting)",
              composition: "การจัดองค์ประกอบ (Composition)",
              style: "สไตล์ภาพ (Style)",
              detail: "ความละเอียด (Detail)"
            };
            return (
              <div className="cover-prompt-field" key={key}>
                <label>{keyLabels[key]}</label>
                <div className="cover-prompt-presets">
                  {DIMENSION_PRESETS[key].map((preset) => (
                    <button
                      type="button"
                      className={merged[key] === preset.value ? "selected" : ""}
                      key={preset.label}
                      onClick={() => onChange({ ...merged, [key]: preset.value })}
                      title={preset.value}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={customFields.has(key) ? "selected custom" : "custom"}
                    onClick={() => setCustomFields((current) => new Set(current).add(key))}
                  >
                    ✏️ กำหนดเอง
                  </button>
                </div>
                {customFields.has(key) && (
                  <input
                    aria-label={`Cover prompt ${key}`}
                    value={merged[key] ?? ""}
                    onChange={(event) => onChange({ ...merged, [key]: event.target.value })}
                    placeholder={`Custom ${key}...`}
                    style={{ marginTop: "4px" }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </details>

      {/* 6. Live Rendered Positive Prompt Box */}
      <details open style={{ marginTop: "4px" }}>
        <summary style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>🧾 Rendered Positive Prompt (ส่งเข้า ComfyUI)</span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              handleCopyPrompt();
            }}
            style={{
              padding: "2px 8px",
              fontSize: "10px",
              background: copied ? "#059669" : "rgba(59, 130, 246, 0.2)",
              border: `1px solid ${copied ? "#10B981" : "#3B82F6"}`,
              color: copied ? "#FFFFFF" : "#93C5FD",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            {copied ? "✓ คัดลอกแล้ว!" : "📋 คัดลอก Prompt"}
          </button>
        </summary>
        <pre>{fullPromptText}</pre>
      </details>
    </section>
  );
}

