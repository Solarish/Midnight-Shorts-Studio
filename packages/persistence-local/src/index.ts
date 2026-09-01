import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rename, truncate, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RunEventV1, RunStatus } from "@psu-ava/contracts";

export {
  GraphRevisionConflictError,
  LocalGraphStore,
  PublishedVersionConflictError
} from "./graph-store.js";
export { LocalWorkflowSnapshotStore, WorkflowSnapshotConflictError } from "./workflow-store.js";
export { LocalStoryboardStore, StoryboardRevisionConflictError } from "./storyboard-store.js";

export interface ControlRunRecord {
  runId: string;
  recipeId: string;
  projectName: string;
  status: RunStatus;
  dryRun: boolean;
  workflowDigest: string;
  configPath: string;
  runDir?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
  errorCode?: string;
  unsafeToResume?: boolean;
  eventError?: string;
  artifactError?: string;
  verification?: {
    status: "passed" | "failed" | "error";
    passed: number;
    failed: number;
    total: number;
    verifiedAt: string;
    error?: string;
  };
  stopAfterStep?: boolean;
  idempotencyKey?: string;
  /** Execution bound used by the original start request. Immutable for idempotency checks. */
  startTo?: string;
  queuedOperation?: "start" | "resume";
  resumeFrom?: string;
  resumeTo?: string;
}

export class LocalControlStore {
  readonly root: string;
  readonly recordsDir: string;
  readonly submissionsDir: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.recordsDir = path.join(this.root, "records");
    this.submissionsDir = path.join(this.root, "submissions");
  }

  async init() {
    await Promise.all([mkdir(this.recordsDir, { recursive: true }), mkdir(this.submissionsDir, { recursive: true })]);
  }

  submissionDir(runId: string) { return path.join(this.submissionsDir, safeId(runId)); }
  workflowPath(runId: string) { return path.join(this.submissionDir(runId), "workflow.json"); }
  manifestPath(runId: string) { return path.join(this.submissionDir(runId), "manifest.json"); }
  eventPath(runId: string) { return path.join(this.submissionDir(runId), "events.ndjson"); }

  async saveSubmission(runId: string, manifest: unknown, workflowRaw: string) {
    await mkdir(this.submissionDir(runId), { recursive: true });
    await atomicWrite(this.manifestPath(runId), `${JSON.stringify(manifest, null, 2)}\n`);
    await atomicWrite(this.workflowPath(runId), workflowRaw);
  }

  async put(record: ControlRunRecord) {
    await atomicWrite(path.join(this.recordsDir, `${safeId(record.runId)}.json`), `${JSON.stringify(record, null, 2)}\n`);
  }

  async get(runId: string): Promise<ControlRunRecord | undefined> {
    try { return JSON.parse(await readFile(path.join(this.recordsDir, `${safeId(runId)}.json`), "utf8")); }
    catch (error: any) { if (error.code === "ENOENT") return undefined; throw error; }
  }

  async list(): Promise<ControlRunRecord[]> {
    await this.init();
    const names = (await readdir(this.recordsDir)).filter((name) => name.endsWith(".json"));
    const records = await Promise.all(names.map(async (name) => JSON.parse(await readFile(path.join(this.recordsDir, name), "utf8")) as ControlRunRecord));
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async appendEvent(runId: string, event: RunEventV1) {
    await mkdir(this.submissionDir(runId), { recursive: true });
    const target = this.eventPath(runId);
    await repairTornTail(target);
    await appendFile(target, `${JSON.stringify(event)}\n`, "utf8");
  }

  async events(runId: string, afterSequence = 0): Promise<RunEventV1[]> {
    try {
      const source = await readFile(this.eventPath(runId), "utf8");
      const lines = source.split("\n");
      const events: RunEventV1[] = [];
      for (const [index, line] of lines.entries()) {
        if (!line) continue;
        try { events.push(JSON.parse(line) as RunEventV1); }
        catch (error) {
          const tornTail = index === lines.length - 1 && !source.endsWith("\n");
          if (!tornTail) throw error;
        }
      }
      return events.filter((event) => event.sequence > afterSequence);
    } catch (error: any) { if (error.code === "ENOENT") return []; throw error; }
  }
}

export class FileCheckpointStore {
  async read(runDir: string) {
    return JSON.parse(await readFile(path.join(runDir, "state.json"), "utf8"));
  }

  async write(runDir: string, state: unknown) {
    await atomicWrite(path.join(runDir, "state.json"), `${JSON.stringify(state, null, 2)}\n`);
  }
}

export async function atomicWrite(target: string, content: string) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
}

async function repairTornTail(target: string) {
  let source: string;
  try { source = await readFile(target, "utf8"); }
  catch (error: any) { if (error.code === "ENOENT") return; throw error; }
  if (!source || source.endsWith("\n")) return;
  const finalBreak = source.lastIndexOf("\n");
  const tail = source.slice(finalBreak + 1);
  try {
    JSON.parse(tail);
    await appendFile(target, "\n", "utf8");
  } catch {
    await truncate(target, finalBreak + 1);
  }
}

function safeId(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("unsafe identifier");
  return value;
}
