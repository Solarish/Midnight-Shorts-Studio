import { createHash } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GraphDefinitionV1, PublishedGraphVersionV1 } from "@psu-ava/contracts";
import { validateGraphDefinition } from "@psu-ava/node-sdk";

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export class GraphRevisionConflictError extends Error {
  readonly expectedRevision: number;
  readonly actualRevision: number;
  constructor(expectedRevision: number, actualRevision: number) {
    super(`Graph revision conflict: expected ${expectedRevision}, current revision is ${actualRevision}`);
    this.name = "GraphRevisionConflictError";
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export class PublishedVersionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishedVersionConflictError";
  }
}

export class LocalGraphStore {
  readonly root: string;
  readonly graphsDir: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.graphsDir = path.join(this.root, "graphs");
  }

  async init() {
    await mkdir(this.graphsDir, { recursive: true });
  }

  async getDraft(graphId: string): Promise<GraphDefinitionV1 | undefined> {
    assertId(graphId);
    return readJsonIfExists<GraphDefinitionV1>(this.draftPath(graphId));
  }

  async listDrafts(): Promise<GraphDefinitionV1[]> {
    await this.init();
    const names = await readdir(this.graphsDir);
    const drafts = await Promise.all(names.filter((name) => ID_PATTERN.test(name)).map((name) => this.getDraft(name)));
    return drafts.filter((value): value is GraphDefinitionV1 => Boolean(value)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async deleteDraft(graphId: string): Promise<boolean> {
    assertId(graphId);
    await rm(this.graphDir(graphId), { recursive: true, force: true });
    return true;
  }

  async saveDraft(graph: GraphDefinitionV1, expectedRevision: number): Promise<GraphDefinitionV1> {
    assertId(graph.graphId);
    assertRevision(expectedRevision);
    if (graph.revision !== expectedRevision) throw new GraphRevisionConflictError(expectedRevision, graph.revision);
    assertDraftShape(graph);
    return withFileLock(this.lockPath(graph.graphId), async () => {
      const existing = await this.getDraft(graph.graphId);
      const actualRevision = existing?.revision ?? 0;
      if (actualRevision !== expectedRevision) throw new GraphRevisionConflictError(expectedRevision, actualRevision);
      if (existing?.lineage && canonicalStringify(existing.lineage) !== canonicalStringify(graph.lineage)) {
        throw new PublishedVersionConflictError("Clone lineage is immutable after the draft is created");
      }
      const saved = structuredClone({ ...graph, revision: expectedRevision + 1 });
      assertDraftShape(saved);
      await writeAtomic(this.draftPath(graph.graphId), `${JSON.stringify(saved, null, 2)}\n`);
      return saved;
    });
  }

  async publish(graphId: string, expectedRevision: number): Promise<PublishedGraphVersionV1> {
    assertId(graphId);
    assertRevision(expectedRevision);
    return withFileLock(this.lockPath(graphId), async () => {
      const graph = await this.getDraft(graphId);
      if (!graph) throw new Error(`Graph '${graphId}' does not have a draft`);
      if (graph.revision !== expectedRevision) throw new GraphRevisionConflictError(expectedRevision, graph.revision);
      assertValidGraph(graph);
      const existing = await this.listPublished(graphId);
      const latest = existing.at(-1);
      const digest = graphDigest(graph);
      if (latest?.sourceRevision === graph.revision) {
        if (latest.digest !== digest) throw new PublishedVersionConflictError("Published revision content does not match the current draft");
        return latest;
      }
      const version = (latest?.version ?? 0) + 1;
      const published: PublishedGraphVersionV1 = {
        schemaVersion: 1,
        graphId,
        version,
        sourceRevision: graph.revision,
        digest,
        publishedAt: new Date().toISOString(),
        graph: structuredClone(graph)
      };
      const target = this.publishedPath(graphId, version);
      await mkdir(path.dirname(target), { recursive: true });
      try {
        await writeFile(target, `${JSON.stringify(published, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      } catch (error: any) {
        if (error.code === "EEXIST") throw new PublishedVersionConflictError(`Published graph version ${graphId}@${version} already exists`);
        throw error;
      }
      return published;
    });
  }

  async getPublished(graphId: string, version: number): Promise<PublishedGraphVersionV1 | undefined> {
    assertId(graphId);
    assertPositiveVersion(version);
    return readJsonIfExists<PublishedGraphVersionV1>(this.publishedPath(graphId, version));
  }

  async listPublished(graphId: string): Promise<PublishedGraphVersionV1[]> {
    assertId(graphId);
    const directory = this.versionsDir(graphId);
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error: any) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const versions = names
      .map((name) => /^(\d+)\.json$/.exec(name))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => Number(match[1]))
      .sort((a, b) => a - b);
    return Promise.all(versions.map(async (version) => (await this.getPublished(graphId, version))!));
  }

  async clonePublished(
    sourceGraphId: string,
    version: number,
    options: { graphId: string; name?: string }
  ): Promise<GraphDefinitionV1> {
    assertId(sourceGraphId);
    assertId(options.graphId);
    const source = await this.getPublished(sourceGraphId, version);
    if (!source) throw new Error(`Published graph '${sourceGraphId}@${version}' was not found`);
    const clone: GraphDefinitionV1 = {
      ...structuredClone(source.graph),
      graphId: options.graphId,
      name: options.name?.trim() || `${source.graph.name} copy`,
      revision: 0,
      lineage: {
        sourceGraphId,
        sourceVersion: version,
        sourceDigest: source.digest
      }
    };
    return this.saveDraft(clone, 0);
  }

  private graphDir(graphId: string) { return path.join(this.graphsDir, graphId); }
  private draftPath(graphId: string) { return path.join(this.graphDir(graphId), "draft.json"); }
  private lockPath(graphId: string) { return path.join(this.graphDir(graphId), ".write.lock"); }
  private versionsDir(graphId: string) { return path.join(this.graphDir(graphId), "versions"); }
  private publishedPath(graphId: string, version: number) { return path.join(this.versionsDir(graphId), `${version}.json`); }
}

export function graphDigest(graph: GraphDefinitionV1) {
  return createHash("sha256").update(canonicalStringify(graph)).digest("hex");
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

async function withFileLock<T>(lockPath: string, operation: () => Promise<T>): Promise<T> {
  await mkdir(path.dirname(lockPath), { recursive: true });
  let handle;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      handle = await open(lockPath, "wx", 0o600);
      break;
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  if (!handle) throw new Error(`Timed out acquiring graph lock: ${lockPath}`);
  try {
    return await operation();
  } finally {
    await handle.close();
    await rm(lockPath, { force: true });
  }
}

async function writeAtomic(target: string, content: string) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
}

async function readJsonIfExists<T>(target: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(target, "utf8")) as T;
  } catch (error: any) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

function assertValidGraph(graph: GraphDefinitionV1) {
  const validation = validateGraphDefinition(graph);
  if (!validation.valid) throw Object.assign(new Error("Graph validation failed"), { diagnostics: validation.diagnostics });
}

function assertDraftShape(graph: GraphDefinitionV1) {
  if (!graph || graph.schemaVersion !== 1) throw new Error("Draft graph schemaVersion must be 1");
  assertId(graph.graphId);
  assertRevision(graph.revision);
  if (typeof graph.name !== "string" || !graph.name.trim()) throw new Error("Draft graph name is required");
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !Array.isArray(graph.order)) throw new Error("Draft graph nodes, edges and order must be arrays");
  for (const node of graph.nodes) {
    if (!node || !ID_PATTERN.test(node.id) || typeof node.type !== "string" || !node.config || typeof node.config !== "object" || Array.isArray(node.config)) {
      throw new Error("Draft graph contains an invalid node shape");
    }
    if (node.position && (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y))) throw new Error("Draft node position must be finite");
  }
}

function assertId(value: string) {
  if (!ID_PATTERN.test(value)) throw new Error("unsafe graph identifier");
}

function assertRevision(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("revision must be a non-negative integer");
}

function assertPositiveVersion(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("version must be a positive integer");
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortValue(item)]));
  }
  return value;
}
