export type ExtractedCoverCardMetadata = {
  personName: string;
  positionTitle: string;
  award: string;
  prompt: string;
};

export async function extractCoverCardMetadata(thaiText: string): Promise<ExtractedCoverCardMetadata> {
  const cleaned = thaiText.replace(/ดนตรี\s*\+?\s*ภาพปก/gi, "").replace(/ภาพปก/gi, "").trim();

  const ollamaUrl = process.env.AVA_OLLAMA_URL || "http://10.135.66.70:11434";
  const model = process.env.AVA_OLLAMA_FALLBACK_MODEL || "qwen2.5-coder:1.5b";

  const system = "You are a professional broadcast assistant. Extract personName (academic title + full name in Thai), positionTitle (faculty/university in Thai), award (award title in Thai), and prompt (English descriptive prompt for generating an ambient broadcast documentary background) from the given Thai text.";
  const prompt = `Example:
Input: "ดนตรี+ภาพปก รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ คณะทันตแพทยศาสตร์ ม.อ. อาจารย์ตัวอย่างดีเด่นด้านการวิจัย ประจำปี 2569"
Output: {"personName": "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์", "positionTitle": "คณะทันตแพทยศาสตร์ มหาวิทยาลัยสงขลานครินทร์", "award": "อาจารย์ตัวอย่างดีเด่นด้านการวิจัย ประจำปี 2569", "prompt": "modern high-end dental research facility, warm ambient interior lighting, university broadcast documentary backdrop"}

Now extract from this input:
"${cleaned}"`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

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
      const data = (await response.json()) as { response?: string };
      if (data.response) {
        const parsed = JSON.parse(data.response) as Partial<ExtractedCoverCardMetadata>;
        if (parsed.personName || parsed.award) {
          return {
            personName: String(parsed.personName || "").trim(),
            positionTitle: String(parsed.positionTitle || "").trim(),
            award: String(parsed.award || "").trim(),
            prompt: String(parsed.prompt || "").trim() || "prestigious university broadcast documentary background, warm ambient lighting"
          };
        }
      }
    }
  } catch {}

  // Fallback Rule-Based Parser if LLM is offline
  return parseCoverCardRuleBased(cleaned);
}

export function parseCoverCardRuleBased(text: string): ExtractedCoverCardMetadata {
  let personName = "";
  let positionTitle = "";
  let award = "";

  // Regex patterns for Thai academic names
  const nameMatch = text.match(/(?:รศ\.|ดร\.|ผศ\.|ศ\.|อ\.|นาย|นางสาว|นาง|ทพญ\.|ทพ\.|นพ\.|พญ\.)[^\s]+(?:\s+[^\s]+){1,3}/);
  if (nameMatch) {
    personName = nameMatch[0].trim();
  }

  // Regex for Faculty / Department
  const facultyMatch = text.match(/(?:คณะ|ภาควิชา|วิทยาลัย|สถาบัน)[^\s]+(?:\s+[^\s]+){0,4}(?:ม\.อ\.|มหาวิทยาลัยสงขลานครินทร์)?/);
  if (facultyMatch) {
    positionTitle = facultyMatch[0].trim();
  }

  // Regex for Award
  const awardMatch = text.match(/(?:อาจารย์ตัวอย่าง|รางวัล|ดีเด่น|เชิดชูเกียรติ)[^]*?(?:ปี\s*\d{4}|๒๕\d{2}|25\d{2}|$)/);
  if (awardMatch) {
    award = awardMatch[0].trim();
  } else if (!personName && !positionTitle) {
    award = text;
  }

  return {
    personName: personName || text.slice(0, 40),
    positionTitle: positionTitle || "มหาวิทยาลัยสงขลานครินทร์",
    award: award || "อาจารย์ตัวอย่าง มหาวิทยาลัยสงขลานครินทร์ ปี 2569",
    prompt: "prestigious university academic ceremony background, warm ambient interior lighting, university broadcast documentary backdrop"
  };
}
