export type LLMExtractedSegment = {
  sourceKey?: string;
  inTime?: string;
  outTime?: string;
  dialogue?: string;
};

export async function extractSegmentsWithLocalLLM(rawText: string): Promise<LLMExtractedSegment[]> {
  const ollamaUrl = process.env.AVA_OLLAMA_URL || "http://10.135.66.70:11434";
  const model = process.env.AVA_OLLAMA_FALLBACK_MODEL || "qwen2.5-coder:1.5b";

  const system = "You are a professional video editor assistant. Given a row from a documentary storyboard table, extract camera clip name (if present, e.g. C7724, 2X7A9362), start timecode (mm:ss), end timecode (mm:ss), and spoken dialogue for each segment found in the text.";
  const prompt = `Example:
Input: "C7724 00.15-00.45 สวัสดีครับ 01.00-01.30 ขอบคุณครับ"
Output: {"segments": [{"sourceKey": "C7724", "inTime": "00:15", "outTime": "00:45", "dialogue": "สวัสดีครับ"}, {"sourceKey": "C7724", "inTime": "01:00", "outTime": "01:30", "dialogue": "ขอบคุณครับ"}]}

Now extract all segments from this input:
"${rawText}"`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

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

    if (!response.ok) return [];
    const data = (await response.json()) as { response?: string };
    if (!data.response) return [];
    const parsed = JSON.parse(data.response) as { segments?: LLMExtractedSegment[] };
    return Array.isArray(parsed.segments) ? parsed.segments : [];
  } catch {
    return [];
  }
}
