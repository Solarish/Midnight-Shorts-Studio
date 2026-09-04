import { randomUUID } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StoryboardItemV2, StoryboardSpecV2 } from "@psu-ava/contracts";
import { LocalStoryboardStore, StoryboardRevisionConflictError } from "@psu-ava/persistence-local";

const execFileAsync = promisify(execFile);
const defaultProjectRoot = path.resolve(process.env.AVA_PROJECT_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.."));
import {
  compileApprovedStoryboard,
  createStoryboardExecutionGraph,
  createApprovedStoryboard,
  createStoryboardDraftFromImport,
  generateAutoBrollForARoll,
  generateAutoBrollForStoryboard,
  importDocxStoryboardV2,
  validateStoryboardMedia,
  validateStoryboardSpec,
  findCandidateBrolls,
  resolveProjectContext,
  formatCoverCardAuto,
  formatTitleCardAuto,
  formatARollAuto,
  selectDoodlePreset
} from "@psu-ava/storyboard";
import type { StoryboardExecutionOptions } from "@psu-ava/storyboard";

export class StoryboardService {
  constructor(readonly store: LocalStoryboardStore, readonly projectRoot: string = defaultProjectRoot) {}

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

  async delete(storyboardId: string) {
    await this.requireDraft(storyboardId);
    const ok = await this.store.deleteDraft(storyboardId);
    if (!ok) throw httpError(500, "Failed to delete storyboard");
    return { ok: true, storyboardId };
  }

  async clone(storyboardId: string, input?: { name?: string }) {
    const draft = await this.requireDraft(storyboardId);
    const newId = `storyboard_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const clonedName = input?.name?.trim() || `${draft.name} (สำเนา)`;
    const cloned = await this.store.cloneDraft(storyboardId, newId, clonedName);
    return this.toDto(cloned);
  }

  async resyncDocx(storyboardId: string) {
    const draft = await this.requireDraft(storyboardId);
    const docxPath = draft.sourceImport?.docxPath;
    if (!docxPath) throw httpError(400, "Storyboard has no source DOCX path");

    const freshImport = await importDocxStoryboardV2(docxPath);
    await this.store.saveImport(freshImport);

    // Reconcile existing items with fresh proposals:
    const existingARolls = new Map<string, StoryboardItemV2>();
    const existingCards = new Map<string, StoryboardItemV2>();
    for (const item of draft.items) {
      if (item.kind === "a_roll") {
        const key = `${item.params.sourceKey || ""}_${item.params.sourceInMs || 0}`;
        existingARolls.set(key, item);
      } else {
        existingCards.set(item.id, item);
      }
    }

    const mergedItems: StoryboardItemV2[] = [];
    for (const proposal of freshImport.proposals) {
      const item = proposal.item;
      if (item.kind === "a_roll") {
        const key = `${item.params.sourceKey || ""}_${item.params.sourceInMs || 0}`;
        const existing = existingARolls.get(key) || draft.items.find((it) => it.id === item.id);
        if (existing) {
          mergedItems.push({
            ...item,
            id: existing.id,
            presetId: existing.presetId,
            audioPolicy: existing.audioPolicy,
            broll: existing.broll || [],
            params: {
              ...item.params,
              sourcePath: existing.params.sourcePath || item.params.sourcePath,
              motionPreset: existing.params.motionPreset
            }
          });
        } else {
          mergedItems.push(item);
        }
      } else {
        const existing = existingCards.get(item.id);
        if (existing) {
          mergedItems.push({
            ...item,
            params: {
              ...item.params,
              ...existing.params
            }
          });
        } else {
          mergedItems.push(item);
        }
      }
    }

    const next: StoryboardSpecV2 = {
      ...draft,
      sourceImport: {
        importId: freshImport.importId,
        docxPath: freshImport.docxPath,
        sourceDigest: freshImport.sourceDigest,
        importedAt: freshImport.importedAt
      },
      items: mergedItems
    };

    const saved = await this.store.saveDraft(next, draft.revision, true);
    return this.toDto(saved);
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

  async createNodeCompilation(storyboardId: string, itemId: string, itemOverride?: unknown, stage = "background") {
    const draft = await this.requireDraft(storyboardId);
    let item = itemOverride && typeof itemOverride === "object" && !Array.isArray(itemOverride)
      ? structuredClone(itemOverride) as StoryboardItemV2
      : draft.items.find((value) => value.id === itemId);
    if (!item) throw httpError(404, "Storyboard item not found");
    // A doodle run is an explicit request to create/update the doodle layer,
    // even when the layer was previously switched off in the inspector.
    if (stage === "doodle") item = { ...item, params: { ...item.params, doodleEnabled: true } };
    // A background or assets run is an explicit request to synthesize a fresh background
    if (stage === "background" || stage === "assets") {
      item = { ...item, params: { ...item.params, backgroundImage: "" } };
    }
    if (item.kind === "cover_card") {
      item = { ...item, presetId: "comfy-cover-card-v2" };
    }
    const isolated: StoryboardSpecV2 = {
      ...structuredClone(draft),
      storyboardId: `${draft.storyboardId}__node_${item.id}`,
      name: `${draft.name} — ${item.id} node run`,
      items: [structuredClone(item)]
    };
    const allDiagnostics = validateStoryboardSpec(isolated);
    const stageOnlyCodes: Record<string, Set<string>> = {
      person: new Set(["missing_prompt", "missing_cover_title", "missing_cover_position", "missing_cover_award"]),
      background: new Set(["missing_media", "missing_cover_title", "missing_cover_position", "missing_cover_award"]),
      doodle: new Set(["missing_media", "missing_prompt", "missing_cover_title", "missing_cover_position", "missing_cover_award"])
    };
    const ignored = stageOnlyCodes[stage] ?? new Set<string>();
    const diagnostics = allDiagnostics.filter((diagnostic) => diagnostic.itemId !== item.id || !ignored.has(diagnostic.code));
    if (diagnostics.some((value) => value.severity === "blocker")) {
      throw Object.assign(new Error("Storyboard node has blocking diagnostics"), { statusCode: 422, diagnostics });
    }
    const compilation = compileApprovedStoryboard(createApprovedStoryboard(isolated, 1), { skipValidation: true });
    const roles = stage === "assets"
      ? new Set(["source", "cutout", "generate_bg", "generate", "generate_doodle", "doodle_alpha"])
      : stage === "person"
        ? new Set(["source", "cutout"])
      : stage === "doodle"
          ? new Set(["generate_doodle", "doodle_alpha"])
      : new Set(["generate_bg", "generate"]);
    const keep = new Set(compilation.graph.nodes.filter((node) => [...roles].some((role) => node.id.endsWith(`__${role}`))).map((node) => node.id));
    if (keep.size) {
      compilation.graph.nodes = compilation.graph.nodes.filter((node) => keep.has(node.id));
      compilation.graph.edges = compilation.graph.edges.filter((edge) => keep.has(edge.from.nodeId) && keep.has(edge.to.nodeId));
      if (stage === "assets") {
        const cutout = compilation.graph.nodes.find((node) => node.id.endsWith("__cutout"));
        const bgGenerate = compilation.graph.nodes.find((node) => node.id.endsWith("__generate_bg"));
        const doodleGenerate = compilation.graph.nodes.find((node) => node.id.endsWith("__generate_doodle"));
        if (cutout && bgGenerate && !compilation.graph.edges.some((edge) => edge.to.nodeId === bgGenerate.id)) {
          compilation.graph.edges.push({ id: "sb_edge_assets_cutout_to_bg", from: { nodeId: cutout.id, port: "image" }, to: { nodeId: bgGenerate.id, port: "image" } });
        }
        if (cutout && doodleGenerate && !compilation.graph.edges.some((edge) => edge.to.nodeId === doodleGenerate.id)) {
          compilation.graph.edges.push({ id: "sb_edge_assets_cutout_to_doodle", from: { nodeId: cutout.id, port: "image" }, to: { nodeId: doodleGenerate.id, port: "image" } });
        }
      } else if (stage === "doodle") {
        const cutout = compilation.graph.nodes.find((node) => node.id.endsWith("__cutout"));
        const doodleGenerate = compilation.graph.nodes.find((node) => node.id.endsWith("__generate_doodle"));
        if (cutout && doodleGenerate && !compilation.graph.edges.some((edge) => edge.to.nodeId === doodleGenerate.id)) {
          compilation.graph.edges.push({ id: "sb_edge_assets_cutout_to_doodle", from: { nodeId: cutout.id, port: "image" }, to: { nodeId: doodleGenerate.id, port: "image" } });
        }
      }

      // Topologically sort nodes based on edges to guarantee edge order validity
      const inDegree = new Map<string, number>();
      const adj = new Map<string, string[]>();
      for (const node of compilation.graph.nodes) {
        inDegree.set(node.id, 0);
        adj.set(node.id, []);
      }
      for (const edge of compilation.graph.edges) {
        if (adj.has(edge.from.nodeId) && inDegree.has(edge.to.nodeId)) {
          adj.get(edge.from.nodeId)!.push(edge.to.nodeId);
          inDegree.set(edge.to.nodeId, (inDegree.get(edge.to.nodeId) ?? 0) + 1);
        }
      }
      const queue = compilation.graph.nodes.filter((node) => inDegree.get(node.id) === 0).map((n) => n.id);
      const sortedOrder: string[] = [];
      while (queue.length > 0) {
        const u = queue.shift()!;
        sortedOrder.push(u);
        for (const v of adj.get(u) ?? []) {
          inDegree.set(v, (inDegree.get(v) ?? 1) - 1);
          if (inDegree.get(v) === 0) queue.push(v);
        }
      }
      if (sortedOrder.length === compilation.graph.nodes.length) {
        compilation.graph.order = sortedOrder;
        const nodeMap = new Map(compilation.graph.nodes.map((n) => [n.id, n]));
        compilation.graph.nodes = sortedOrder.map((id) => nodeMap.get(id)!);
      } else {
        compilation.graph.order = compilation.graph.nodes.map((node) => node.id);
      }
    }
    const compose = compilation.graph.nodes.find((node) => node.type === "timeline.compose");
    if (compose) compose.config.scenes = [];
    if (typeof (compilation.graph as any).revision !== "number") {
      (compilation.graph as any).revision = 1;
    }
    return compilation;
  }

  async generateAutoBroll(storyboardId: string, itemId: string, options: { brollPoolDirs?: string[]; brollPoolDir?: string; ollamaUrl?: string } = {}) {
    const draft = await this.requireDraft(storyboardId);
    const item = draft.items.find((value) => value.id === itemId);
    if (!item) throw httpError(404, "Storyboard item not found");
    if (item.kind !== "a_roll") throw httpError(422, "Auto B-Roll is only supported for A-roll items");

    const manualDirs = options.brollPoolDirs ?? (options.brollPoolDir ? [options.brollPoolDir] : undefined);
    const docxPath = draft.sourceImport?.docxPath || "";
    const projectContext = docxPath ? await resolveProjectContext(docxPath, { brollDirs: manualDirs }).catch(() => null) : null;

    let candidates = projectContext?.candidateBrolls ?? [];
    if (candidates.length === 0 && manualDirs && manualDirs.length > 0) {
      candidates = await findCandidateBrolls(manualDirs);
    }

    // Hydrate timelineState from the rest of the storyboard draft
    const usedClipCounts = new Map<string, number>();
    const recentClipHistory: string[] = [];

    for (const otherItem of draft.items) {
      if (otherItem.id === itemId) continue;
      for (const b of (otherItem as any).broll ?? []) {
        const p = b.asset?.path;
        if (p) {
          usedClipCounts.set(p, (usedClipCounts.get(p) ?? 0) + 1);
        }
      }
    }

    const itemIndex = draft.items.findIndex((value) => value.id === itemId);
    if (itemIndex > 0) {
      const prev = draft.items[itemIndex - 1];
      for (const b of (prev as any)?.broll ?? []) {
        if (b.asset?.path) recentClipHistory.push(b.asset.path);
      }
    }
    if (itemIndex >= 0 && itemIndex < draft.items.length - 1) {
      const next = draft.items[itemIndex + 1];
      for (const b of (next as any)?.broll ?? []) {
        if (b.asset?.path) recentClipHistory.push(b.asset.path);
      }
    }

    return generateAutoBrollForARoll(item, candidates, {
      ollamaUrl: options.ollamaUrl ?? process.env.AVA_OLLAMA_URL ?? "http://10.135.66.70:11434",
      timelineState: {
        usedClipCounts,
        recentClipHistory
      }
    });
  }

  async generateAutoBrollBatch(storyboardId: string, options: { brollPoolDirs?: string[]; brollPoolDir?: string; ollamaUrl?: string } = {}) {
    const draft = await this.requireDraft(storyboardId);
    const manualDirs = options.brollPoolDirs ?? (options.brollPoolDir ? [options.brollPoolDir] : undefined);
    const docxPath = draft.sourceImport?.docxPath || "";
    const projectContext = docxPath ? await resolveProjectContext(docxPath, { brollDirs: manualDirs }).catch(() => null) : null;

    let candidates = projectContext?.candidateBrolls ?? [];
    if (candidates.length === 0 && manualDirs && manualDirs.length > 0) {
      candidates = await findCandidateBrolls(manualDirs);
    }

    const batchResult = await generateAutoBrollForStoryboard(draft.items as any, candidates, {
      ollamaUrl: options.ollamaUrl ?? process.env.AVA_OLLAMA_URL ?? "http://10.135.66.70:11434"
    });

    const updatedDraft: StoryboardSpecV2 = {
      ...draft,
      items: batchResult.items as any
    };

    const saved = await this.store.saveDraft(updatedDraft, draft.revision);
    return {
      storyboard: await this.toDto(saved),
      stats: {
        totalBrollsAssigned: batchResult.totalBrollsAssigned,
        uniqueClipsUsed: batchResult.uniqueClipsUsed,
        lowFootageMode: batchResult.lowFootageMode,
        notes: batchResult.notes
      }
    };
  }

  async autoLowerThirdBatch(storyboardId: string) {
    const draft = await this.requireDraft(storyboardId);
    const docxPath = draft.sourceImport?.docxPath || "";
    const projectContext = docxPath ? await resolveProjectContext(docxPath).catch(() => null) : null;

    let lowerThirdsConfigured = 0;
    const formattedItems = draft.items.map((item) => {
      if (item.kind === "a_roll") {
        lowerThirdsConfigured++;
        return formatARollAuto(item, projectContext);
      }
      return item;
    });

    const updatedDraft: StoryboardSpecV2 = {
      ...draft,
      items: formattedItems
    };

    const saved = await this.store.saveDraft(updatedDraft, draft.revision);
    return {
      storyboard: await this.toDto(saved),
      stats: {
        lowerThirdsConfigured
      }
    };
  }

  async fullAutoStoryboard(storyboardId: string, options: { brollPoolDirs?: string[]; brollPoolDir?: string; ollamaUrl?: string } = {}) {
    const draft = await this.requireDraft(storyboardId);
    const manualDirs = options.brollPoolDirs ?? (options.brollPoolDir ? [options.brollPoolDir] : undefined);
    const docxPath = draft.sourceImport?.docxPath || "";
    const projectContext = docxPath ? await resolveProjectContext(docxPath, { brollDirs: manualDirs }).catch(() => null) : null;

    // 1. Auto-format Cover Cards (PSU Stidti + LLM Layout), Title Cards (3D Carousel + Media), and A-Roll Lower-Thirds
    let coverCardsFormatted = 0;
    let titleCardsConfigured = 0;
    let lowerThirdsConfigured = 0;

    const formattedItems = await Promise.all(
      draft.items.map(async (item) => {
        if (item.kind === "cover_card") {
          coverCardsFormatted++;
          return formatCoverCardAuto(item, projectContext, "16:9");
        }
        if (item.kind === "title") {
          titleCardsConfigured++;
          return formatTitleCardAuto(item, projectContext, "16:9");
        }
        if (item.kind === "a_roll") {
          lowerThirdsConfigured++;
          return formatARollAuto(item, projectContext);
        }
        return item;
      })
    );

    // 2. Resolve Candidate B-Rolls from project
    let candidates = projectContext?.candidateBrolls ?? [];
    if (candidates.length === 0 && manualDirs && manualDirs.length > 0) {
      candidates = await findCandidateBrolls(manualDirs);
    }

    // 3. Distribute B-rolls across timeline
    const batchResult = await generateAutoBrollForStoryboard(formattedItems as any, candidates, {
      ollamaUrl: options.ollamaUrl ?? process.env.AVA_OLLAMA_URL ?? "http://10.135.66.70:11434"
    });

    const updatedDraft: StoryboardSpecV2 = {
      ...draft,
      items: batchResult.items as any
    };

    const saved = await this.store.saveDraft(updatedDraft, draft.revision);
    return {
      storyboard: await this.toDto(saved),
      stats: {
        totalBrollsAssigned: batchResult.totalBrollsAssigned,
        uniqueClipsUsed: batchResult.uniqueClipsUsed,
        lowFootageMode: batchResult.lowFootageMode,
        coverCardsFormatted,
        titleCardsConfigured,
        lowerThirdsConfigured,
        fontUsed: "psu-stidti",
        titlePreset: "3d-carousel-title-v1",
        lowerThirdPreset: "lowerthird-glass-beacon-v1",
        notes: batchResult.notes
      }
    };
  }

  async autoGenerateAssets(storyboardId: string) {
    const draft = await this.requireDraft(storyboardId);
    let cutoutsGenerated = 0;
    let backgroundsGenerated = 0;

    const coversDir = path.resolve(this.projectRoot, ".ava-control/media/storyboard-covers");
    await fs.mkdir(coversDir, { recursive: true });

    const updatedItems: StoryboardItemV2[] = [];
    for (const item of draft.items) {
      if (item.kind !== "cover_card") {
        updatedItems.push(item);
        continue;
      }

      const params = { ...(item.params || {}) };
      const safeId = item.id.replace(/[^a-zA-Z0-9_-]/g, "_");
      const itemDir = path.join(coversDir, safeId);
      await fs.mkdir(itemDir, { recursive: true });

      // 1. Cutout Generation (Apple Vision Neural Engine on macOS)
      if (params.sourceImage && (!params.personImage || !existsSync(String(params.personImage)))) {
        const cutoutPath = path.join(itemDir, "cutout.png");
        const toolBinary = path.resolve(this.projectRoot, "tools/person-cutout");
        try {
          if (process.platform === "darwin" && existsSync(toolBinary)) {
            await execFileAsync(toolBinary, [String(params.sourceImage), cutoutPath]);
            if (existsSync(cutoutPath)) {
              params.personImage = cutoutPath;
              cutoutsGenerated++;
            }
          }
        } catch (e: any) {
          console.warn(`Apple Vision cutout failed for ${item.id}:`, e.message);
        }
      }

      // 2. ComfyUI Studio Background Generation (Sequential, up to 225s poll)
      if (params.prompt && (!params.backgroundImage || !existsSync(String(params.backgroundImage)))) {
        const bgDir = path.join(itemDir, "background");
        await fs.mkdir(bgDir, { recursive: true });
        const bgPath = path.join(bgDir, "image.png");
        const comfyUrl = process.env.AVA_COMFYUI_URL || "http://10.135.66.70:8188";

        if (existsSync(bgPath)) {
          params.backgroundImage = bgPath;
          backgroundsGenerated++;
        } else {
          try {
            const wfPath = path.resolve(this.projectRoot, "workflows/generate-cover-background-zimage.api.json");
            const wfRaw = await fs.readFile(wfPath, "utf8");
            const wf = JSON.parse(wfRaw);
            wf["6"].inputs.text = String(params.prompt);
            wf["3"].inputs.seed = Math.floor(Math.random() * 100000);
            delete wf["10"]; // omit upload node

            const pRes = await fetch(`${comfyUrl}/prompt`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt: wf, client_id: "psu-ava-auto" })
            });

            if (pRes.ok) {
              const pData = (await pRes.json()) as { prompt_id: string };
              const promptId = pData.prompt_id;

              // Poll history up to 225 seconds (150 x 1500ms)
              for (let attempt = 0; attempt < 150; attempt++) {
                await new Promise((r) => setTimeout(r, 1500));
                const hRes = await fetch(`${comfyUrl}/history/${encodeURIComponent(promptId)}`);
                if (hRes.ok) {
                  const hData = (await hRes.json()) as any;
                  const itemHistory = hData[promptId];
                  if (itemHistory?.outputs?.["9"]?.images?.[0]) {
                    const imgMeta = itemHistory.outputs["9"].images[0];
                    const viewUrl = `${comfyUrl}/view?filename=${encodeURIComponent(imgMeta.filename)}&subfolder=${encodeURIComponent(imgMeta.subfolder || "")}&type=${encodeURIComponent(imgMeta.type || "output")}`;
                    const imgRes = await fetch(viewUrl);
                    if (imgRes.ok) {
                      const buffer = Buffer.from(await imgRes.arrayBuffer());
                      await fs.writeFile(bgPath, buffer);
                      params.backgroundImage = bgPath;
                      backgroundsGenerated++;
                      break;
                    }
                  }
                }
              }
            }
          } catch (e: any) {
            console.warn(`ComfyUI background generation failed for ${item.id}:`, e.message);
          }
        }
      }

      // 3. Vector Doodle Preset (Instant SVG, no GenAI needed)
      if (!params.doodlePreset || params.doodlePreset === "none") {
        params.doodlePreset = selectDoodlePreset({
          positionTitle: String(params.positionTitle || params.subtitle || ""),
          award: String(params.award || params.eyebrow || ""),
          personName: String(params.personName || params.title || "")
        });
      }

      updatedItems.push({
        ...item,
        params
      });
    }

    // 3. Free GPU VRAM
    const comfyUrl = process.env.AVA_COMFYUI_URL || "http://10.135.66.70:8188";
    try {
      await fetch(`${comfyUrl}/free`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unload_models: true, free_memory: true })
      });
    } catch {}

    const updatedDraft: StoryboardSpecV2 = {
      ...draft,
      items: updatedItems as any
    };

    const saved = await this.store.saveDraft(updatedDraft, draft.revision);
    return {
      storyboard: await this.toDto(saved),
      stats: {
        cutoutsGenerated,
        backgroundsGenerated
      }
    };
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
