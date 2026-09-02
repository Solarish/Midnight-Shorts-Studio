export type CoverCardStage = "person" | "background" | "doodle" | "assets";
export type CoverCardField = "sourceImage" | "prompt" | "personName" | "positionTitle" | "award";

/** Canonical stage preflight shared by API/compiler and browser clients. */
export function coverCardMissingFields(params: Record<string, unknown>, stage: CoverCardStage): CoverCardField[] {
  const missing: CoverCardField[] = [];
  if (stage === "person" || stage === "assets") {
    if (!String(params.sourceImage ?? "").trim()) missing.push("sourceImage");
  }
  if (stage === "background" || stage === "assets") {
    if (!String(params.prompt ?? "").trim() && !params.promptParts && !String(params.backgroundImage ?? "").trim()) missing.push("prompt");
  }
  if (stage === "assets") {
    if (!String(params.personName ?? params.title ?? "").trim()) missing.push("personName");
    if (!String(params.positionTitle ?? params.subtitle ?? "").trim()) missing.push("positionTitle");
    if (!String(params.award ?? params.eyebrow ?? "").trim()) missing.push("award");
  }
  return missing;
}
