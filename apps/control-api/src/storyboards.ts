import { randomUUID } from "node:crypto";
import type { StoryboardItemV2, StoryboardSpecV2 } from "@psu-ava/contracts";
import { LocalStoryboardStore, StoryboardRevisionConflictError } from "@psu-ava/persistence-local";
import {
  compileApprovedStoryboard,
  createStoryboardExecutionGraph,
  createApprovedStoryboard,
  createStoryboardDraftFromImport,
  importDocxStoryboardV2,
  validateStoryboardMedia,
  validateStoryboardSpec
} from "@psu-ava/storyboard";
import type { StoryboardExecutionOptions } from "@psu-ava/storyboard";

export class StoryboardService {
  constructor(readonly store: LocalStoryboardStore) {}

  async importDocx(input: { path?: unknown }) {
    const target = typeof input.path === "string" ? input.path.trim() : "";
    if (!target) throw httpError(422, "DOCX path is required");
    const imported = await importDocxStoryboardV2(target);
    return this.store.saveImport(imported);
  }

  async getImport(importId: string) {
    const value = await this.store.getImport(importId);
    if (!value) throw httpError(404, "Storyboard import not found");
    return value;
  }

  async create(input: { importId?: unknown; name?: unknown }) {
    const importId = typeof input.importId === "string" ? input.importId : "";
    const imported = await this.getImport(importId);
    const storyboardId = `storyboard_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const draft = createStoryboardDraftFromImport(imported, storyboardId, typeof input.name === "string" ? input.name : undefined);
    return this.toDto(await this.store.saveDraft(draft, 0));
  }

  async list() { return Promise.all((await this.store.listDrafts()).map((value) => this.toDto(value))); }

  async get(storyboardId: string) {
    const draft = await this.requireDraft(storyboardId);
    return this.toDto(draft);
  }

  async update(storyboardId: string, input: any, headerRevision?: string) {
    const draft = await this.requireDraft(storyboardId);
    const expectedRevision = parseRevision(input?.expectedRevision ?? headerRevision);
    if (draft.revision !== expectedRevision) throw conflict(expectedRevision, draft.revision);
    const next: StoryboardSpecV2 = {
      ...draft,
      name: input?.name === undefined ? draft.name : requiredName(input.name),
      items: input?.items === undefined ? draft.items : parseItems(input.items),
      profile: { width: 1920, height: 1080, frameRate: 25 }
    };
    try { return this.toDto(await this.store.saveDraft(next, expectedRevision)); }
    catch (error) { if (error instanceof StoryboardRevisionConflictError) throw conflict(error.expectedRevision, error.actualRevision); throw error; }
  }

  async validate(storyboardId: string) {
    const storyboard = await this.requireDraft(storyboardId);
    const diagnostics = [...validateStoryboardSpec(storyboard), ...await validateStoryboardMedia(storyboard)];
    return { valid: !diagnostics.some((value) => value.severity === "blocker"), diagnostics };
  }

  async approveAndCompile(storyboardId: string, expectedRevisionValue: unknown) {
    const expectedRevision = parseRevision(expectedRevisionValue);
    const draft = await this.requireDraft(storyboardId);
    if (draft.revision !== expectedRevision) throw conflict(expectedRevision, draft.revision);
    const diagnostics = [...validateStoryboardSpec(draft), ...await validateStoryboardMedia(draft)];
    if (diagnostics.some((value) => value.severity === "blocker")) throw Object.assign(new Error("Storyboard has blocking diagnostics"), { statusCode: 422, diagnostics });
    try {
      const result = await this.store.approveAndCompile(storyboardId, expectedRevision, (lockedDraft, version) => {
        const approved = createApprovedStoryboard(lockedDraft, version);
        return { approved, compilation: compileApprovedStoryboard(approved) };
      });
      return { approved: result.approved, compilation: result.compilation, diagnostics };
    } catch (error) {
      if (error instanceof StoryboardRevisionConflictError) throw conflict(error.expectedRevision, error.actualRevision);
      throw error;
    }
  }

  async getVersion(storyboardId: string, version: number) {
    const value = await this.store.getVersion(storyboardId, version);
    if (!value) throw httpError(404, "Approved storyboard version not found");
    return value;
  }

  async getCompilation(storyboardId: string, version: number) {
    const value = await this.store.getCompilation(storyboardId, version);
    if (!value) throw httpError(404, "Compiled storyboard preview not found");
    return value;
  }

  async createExecutionGraph(storyboardId: string, version: number, options: StoryboardExecutionOptions) {
    if (!Number.isSafeInteger(version) || version < 1) throw httpError(422, "A valid approved storyboard version is required");
    const [approved, compilation] = await Promise.all([
      this.store.getVersion(storyboardId, version),
      this.store.getCompilation(storyboardId, version)
    ]);
    if (!approved || !compilation) throw httpError(404, "Approved storyboard compilation not found");
    if (
      approved.storyboardId !== storyboardId ||
      approved.version !== version ||
      compilation.storyboardId !== storyboardId ||
      compilation.storyboardVersion !== version ||
      compilation.storyboardDigest !== approved.storyboardDigest
    ) {
      throw httpError(409, "Approved storyboard and compilation provenance do not match");
    }
    return createStoryboardExecutionGraph(compilation, options);
  }

  async requireDraft(storyboardId: string) {
    const value = await this.store.getDraft(storyboardId);
    if (!value) throw httpError(404, "Storyboard not found");
    return value;
  }

  async toDto(storyboard: StoryboardSpecV2) {
    const latest = (await this.store.listVersions(storyboard.storyboardId)).at(-1);
    return {
      ...structuredClone(storyboard),
      status: !latest ? "draft" : latest.sourceRevision === storyboard.revision ? "approved" : "stale",
      approvedVersion: latest?.version,
      approvedRevision: latest?.sourceRevision,
      storyboardDigest: latest?.storyboardDigest
    };
  }
}

function parseItems(value: unknown): StoryboardItemV2[] {
  if (!Array.isArray(value)) throw httpError(422, "items must be an array");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw httpError(422, `items[${index}] is invalid`);
    return structuredClone(item) as StoryboardItemV2;
  });
}

function parseRevision(value: unknown) {
  const revision = typeof value === "string" ? Number(value.replace(/^W\//, "").replaceAll('"', "")) : Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) throw httpError(428, "A valid If-Match revision is required");
  return revision;
}

function requiredName(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw httpError(422, "Storyboard name is required");
  return value.trim();
}

function conflict(expected: number, actual: number) { return Object.assign(new Error(`Storyboard revision conflict: expected ${expected}, current revision is ${actual}`), { statusCode: 409, code: "STORYBOARD_REVISION_CONFLICT", expectedRevision: expected, actualRevision: actual }); }
function httpError(statusCode: number, message: string) { return Object.assign(new Error(message), { statusCode }); }
