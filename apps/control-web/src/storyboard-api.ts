import { api } from "./api";
import type { Storyboard, StoryboardCompilation, StoryboardDiagnostic, StoryboardImport, StoryboardItem } from "./storyboard-types";

export const DEFAULT_DOCUMENTARY_DOCX = "/Volumes/ภาควีดีทัศน์/ปีงบ 69/อาจารย์ตัวอย่าง 69/1.รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ /SB-รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์ .docx";

export async function listStoryboards() { return api<Storyboard[]>("/api/v1/storyboards"); }
export async function importStoryboardDocx(path: string) { return api<StoryboardImport>("/api/v1/storyboard-imports/docx", { method: "POST", body: JSON.stringify({ path }) }); }
export async function getStoryboardImport(id: string) { return api<StoryboardImport>(`/api/v1/storyboard-imports/${encodeURIComponent(id)}`); }
export async function createStoryboard(importId: string, name?: string) { return api<Storyboard>("/api/v1/storyboards", { method: "POST", body: JSON.stringify({ importId, ...(name ? { name } : {}) }) }); }
export async function createStoryboardFromDocx(path: string, name?: string) { const imported = await importStoryboardDocx(path); return createStoryboard(imported.importId, name); }
export async function getStoryboard(id: string) { return api<Storyboard>(`/api/v1/storyboards/${encodeURIComponent(id)}`); }
export async function patchStoryboard(storyboard: Storyboard, items: StoryboardItem[] = storyboard.items) {
  return api<Storyboard>(`/api/v1/storyboards/${encodeURIComponent(storyboard.storyboardId)}`, {
    method: "PATCH",
    headers: { "if-match": String(storyboard.revision) },
    body: JSON.stringify({ expectedRevision: storyboard.revision, name: storyboard.name, items })
  });
}
export async function validateStoryboard(id: string) { return api<{ valid: boolean; diagnostics: StoryboardDiagnostic[] }>(`/api/v1/storyboards/${encodeURIComponent(id)}/validate`, { method: "POST", body: "{}" }); }
export async function approveAndCompileStoryboard(storyboard: Storyboard) {
  return api<{ approved: { version: number; storyboardDigest: string }; compilation: StoryboardCompilation; diagnostics: StoryboardDiagnostic[] }>(`/api/v1/storyboards/${encodeURIComponent(storyboard.storyboardId)}/approve-and-compile`, {
    method: "POST",
    headers: { "if-match": String(storyboard.revision) },
    body: JSON.stringify({ expectedRevision: storyboard.revision })
  });
}
export async function getStoryboardCompilation(id: string, version: number) { return api<StoryboardCompilation>(`/api/v1/storyboards/${encodeURIComponent(id)}/versions/${version}/compiled`); }
export async function runStoryboardNode(storyboardId: string, itemId: string, mode: "auto" | "dry-run" | "live" = "live", item?: StoryboardItem, stage: "background" | "doodle" | "person" | "assets" = "assets") {
  return api<{ runId: string; status: string; dryRun: boolean; executionMode: string; monitorUrl: string }>(`/api/v1/storyboards/${encodeURIComponent(storyboardId)}/items/${encodeURIComponent(itemId)}/run`, {
    method: "POST",
    headers: { "idempotency-key": `storyboard-node-${storyboardId}-${itemId}-${Date.now()}` },
    body: JSON.stringify({ mode, stage, ...(item ? { item } : {}) })
  });
}
