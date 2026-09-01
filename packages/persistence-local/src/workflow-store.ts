import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CompiledWorkflowSnapshotV1, WorkflowV1 } from "@psu-ava/contracts";
import { canonicalStringify } from "./graph-store.js";

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export class WorkflowSnapshotConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowSnapshotConflictError";
  }
}

export class LocalWorkflowSnapshotStore {
  readonly root: string;
  readonly workflowsDir: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.workflowsDir = path.join(this.root, "workflows");
  }

  async init() {
    await mkdir(this.workflowsDir, { recursive: true });
  }

  async save(
    graphId: string,
    graphRevision: number,
    compiled: { workflow: WorkflowV1; raw: string; digest: string }
  ): Promise<CompiledWorkflowSnapshotV1> {
    assertIdentity(graphId, graphRevision);
    const calculatedDigest = createHash("sha256").update(compiled.raw).digest("hex");
    if (calculatedDigest !== compiled.digest) throw new WorkflowSnapshotConflictError("Workflow digest does not match raw JSON bytes");
    let parsed: unknown;
    try {
      parsed = JSON.parse(compiled.raw);
    } catch (error: any) {
      throw new WorkflowSnapshotConflictError(`Workflow raw JSON is invalid: ${error.message}`);
    }
    if (canonicalStringify(parsed) !== canonicalStringify(compiled.workflow)) {
      throw new WorkflowSnapshotConflictError("Workflow object does not match raw JSON");
    }
    if (compiled.workflow.id !== graphId) throw new WorkflowSnapshotConflictError("Workflow id must match graph id");
    const snapshot: CompiledWorkflowSnapshotV1 = {
      schemaVersion: 1,
      graphId,
      graphRevision,
      workflowDigest: compiled.digest,
      createdAt: new Date().toISOString(),
      raw: compiled.raw,
      workflow: structuredClone(compiled.workflow)
    };
    const target = this.snapshotPath(graphId, graphRevision);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      return snapshot;
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
      const existing = await this.get(graphId, graphRevision);
      if (existing?.workflowDigest === snapshot.workflowDigest && existing.raw === snapshot.raw) return existing;
      throw new WorkflowSnapshotConflictError(`Workflow snapshot ${graphId}@${graphRevision} is immutable`);
    }
  }

  async get(graphId: string, graphRevision: number): Promise<CompiledWorkflowSnapshotV1 | undefined> {
    assertIdentity(graphId, graphRevision);
    try {
      return JSON.parse(await readFile(this.snapshotPath(graphId, graphRevision), "utf8")) as CompiledWorkflowSnapshotV1;
    } catch (error: any) {
      if (error.code === "ENOENT") return undefined;
      throw error;
    }
  }

  private snapshotPath(graphId: string, graphRevision: number) {
    return path.join(this.workflowsDir, graphId, `${graphRevision}.json`);
  }
}

function assertIdentity(graphId: string, graphRevision: number) {
  if (!ID_PATTERN.test(graphId)) throw new Error("unsafe graph identifier");
  if (!Number.isSafeInteger(graphRevision) || graphRevision < 1) throw new Error("graphRevision must be a positive integer");
}
