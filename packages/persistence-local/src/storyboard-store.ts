import { mkdir, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApprovedStoryboardVersionV2, StoryboardCompilationV2, StoryboardDocxImportV2, StoryboardSpecV2 } from "@psu-ava/contracts";

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export class StoryboardRevisionConflictError extends Error {
  constructor(readonly expectedRevision: number, readonly actualRevision: number) {
    super(`Storyboard revision conflict: expected ${expectedRevision}, current revision is ${actualRevision}`);
    this.name = "StoryboardRevisionConflictError";
  }
}

export class LocalStoryboardStore {
  readonly importsDir: string;
  readonly storyboardsDir: string;

  constructor(readonly root: string) {
    this.root = path.resolve(root);
    this.importsDir = path.join(this.root, "storyboard-imports");
    this.storyboardsDir = path.join(this.root, "storyboards");
  }

  async init() { await Promise.all([mkdir(this.importsDir, { recursive: true }), mkdir(this.storyboardsDir, { recursive: true })]); }

  async saveImport(value: StoryboardDocxImportV2) {
    assertId(value.importId);
    await this.init();
    const target = path.join(this.importsDir, `${value.importId}.json`);
    try { await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" }); }
    catch (error: any) {
      if (error.code !== "EEXIST") throw error;
      const existing = await this.getImport(value.importId);
      if (existing?.sourceDigest !== value.sourceDigest) throw new Error("Storyboard import ID collision");
      return existing;
    }
    return structuredClone(value);
  }

  async getImport(importId: string) { assertId(importId); return readJson<StoryboardDocxImportV2>(path.join(this.importsDir, `${importId}.json`)); }
  async getDraft(storyboardId: string) { assertId(storyboardId); return readJson<StoryboardSpecV2>(this.draftPath(storyboardId)); }

  async listDrafts(): Promise<StoryboardSpecV2[]> {
    await this.init();
    const names = await readdir(this.storyboardsDir);
    const values = await Promise.all(names.filter((name) => SAFE_ID.test(name)).map((name) => this.getDraft(name)));
    return values.filter((value): value is StoryboardSpecV2 => Boolean(value)).sort((a, b) => a.name.localeCompare(b.name, "th"));
  }

  async saveDraft(storyboard: StoryboardSpecV2, expectedRevision: number): Promise<StoryboardSpecV2> {
    assertId(storyboard.storyboardId); assertRevision(expectedRevision);
    if (storyboard.revision !== expectedRevision) throw new StoryboardRevisionConflictError(expectedRevision, storyboard.revision);
    assertDraft(storyboard);
    return withLock(this.lockPath(storyboard.storyboardId), async () => {
      const current = await this.getDraft(storyboard.storyboardId);
      const actual = current?.revision ?? 0;
      if (actual !== expectedRevision) throw new StoryboardRevisionConflictError(expectedRevision, actual);
      if (current && JSON.stringify(current.sourceImport) !== JSON.stringify(storyboard.sourceImport)) throw new Error("Storyboard source import is immutable");
      const saved = structuredClone({ ...storyboard, revision: expectedRevision + 1 });
      assertDraft(saved);
      await atomicWrite(this.draftPath(storyboard.storyboardId), `${JSON.stringify(saved, null, 2)}\n`);
      return saved;
    });
  }

  async listVersions(storyboardId: string): Promise<ApprovedStoryboardVersionV2[]> {
    assertId(storyboardId);
    let names: string[];
    try { names = await readdir(this.versionsDir(storyboardId)); }
    catch (error: any) { if (error.code === "ENOENT") return []; throw error; }
    const versions = names.map((name) => /^(\d+)\.json$/.exec(name)).filter((value): value is RegExpExecArray => Boolean(value)).map((value) => Number(value[1])).sort((a, b) => a - b);
    return Promise.all(versions.map(async (version) => (await this.getVersion(storyboardId, version))!));
  }

  async getVersion(storyboardId: string, version: number) { assertId(storyboardId); assertVersion(version); return readJson<ApprovedStoryboardVersionV2>(this.versionPath(storyboardId, version)); }
  async getCompilation(storyboardId: string, version: number) { assertId(storyboardId); assertVersion(version); return readJson<StoryboardCompilationV2>(this.compilationPath(storyboardId, version)); }

  async approveAndCompile(
    storyboardId: string,
    expectedRevision: number,
    create: (draft: StoryboardSpecV2, version: number) => { approved: ApprovedStoryboardVersionV2; compilation: StoryboardCompilationV2 }
  ) {
    assertId(storyboardId); assertRevision(expectedRevision);
    return withLock(this.lockPath(storyboardId), async () => {
      const draft = await this.getDraft(storyboardId);
      if (!draft) throw new Error(`Storyboard '${storyboardId}' was not found`);
      if (draft.revision !== expectedRevision) throw new StoryboardRevisionConflictError(expectedRevision, draft.revision);
      const existing = await this.listVersions(storyboardId);
      const latest = existing.at(-1);
      if (latest?.sourceRevision === draft.revision) {
        const compilation = await this.getCompilation(storyboardId, latest.version);
        if (!compilation) throw new Error("Approved storyboard is missing its compiled artifact");
        return { approved: latest, compilation };
      }
      const version = (latest?.version ?? 0) + 1;
      const value = create(structuredClone(draft), version);
      if (value.approved.version !== version || value.compilation.storyboardVersion !== version) throw new Error("Storyboard version mismatch");
      await mkdir(this.versionsDir(storyboardId), { recursive: true });
      await mkdir(this.compiledDir(storyboardId), { recursive: true });
      await writeFile(this.versionPath(storyboardId, version), `${JSON.stringify(value.approved, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      try { await writeFile(this.compilationPath(storyboardId, version), `${JSON.stringify(value.compilation, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" }); }
      catch (error) { await rm(this.versionPath(storyboardId, version), { force: true }); throw error; }
      return value;
    });
  }

  private storyboardDir(id: string) { return path.join(this.storyboardsDir, id); }
  private draftPath(id: string) { return path.join(this.storyboardDir(id), "draft.json"); }
  private lockPath(id: string) { return path.join(this.storyboardDir(id), ".write.lock"); }
  private versionsDir(id: string) { return path.join(this.storyboardDir(id), "versions"); }
  private compiledDir(id: string) { return path.join(this.storyboardDir(id), "compiled"); }
  private versionPath(id: string, version: number) { return path.join(this.versionsDir(id), `${version}.json`); }
  private compilationPath(id: string, version: number) { return path.join(this.compiledDir(id), `${version}.json`); }
}

async function withLock<T>(target: string, work: () => Promise<T>): Promise<T> {
  await mkdir(path.dirname(target), { recursive: true });
  let handle;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { handle = await open(target, "wx", 0o600); break; }
    catch (error: any) { if (error.code !== "EEXIST") throw error; await new Promise((resolve) => setTimeout(resolve, 10)); }
  }
  if (!handle) throw new Error(`Timed out acquiring storyboard lock: ${target}`);
  try { return await work(); }
  finally { await handle.close(); await rm(target, { force: true }); }
}

async function atomicWrite(target: string, content: string) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
}

async function readJson<T>(target: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(target, "utf8")) as T; }
  catch (error: any) { if (error.code === "ENOENT") return undefined; throw error; }
}

function assertDraft(value: StoryboardSpecV2) {
  if (!value || value.schemaVersion !== 2 || !value.name?.trim() || !Array.isArray(value.items)) throw new Error("Invalid StoryboardSpec v2 draft");
  assertId(value.storyboardId); assertRevision(value.revision);
}
function assertId(value: string) { if (!SAFE_ID.test(value)) throw new Error("unsafe storyboard identifier"); }
function assertRevision(value: number) { if (!Number.isSafeInteger(value) || value < 0) throw new Error("revision must be a non-negative integer"); }
function assertVersion(value: number) { if (!Number.isSafeInteger(value) || value < 1) throw new Error("version must be a positive integer"); }
