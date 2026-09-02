import { randomUUID } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { PortraitStoryManifestV1, RunEventV1, WorkflowV1 } from "@psu-ava/contracts";
import { validateWorkflowDocument } from "@psu-ava/contracts";
import { loadWorkflowText, runWorkflow, workflowDigest } from "@psu-ava/core";
import { createSubprocessAdapterRegistry } from "@psu-ava/adapter-sdk";
import { compilePortraitStory } from "@psu-ava/recipes";
import { atomicWrite, FileCheckpointStore, LocalControlStore, type ControlRunRecord } from "@psu-ava/persistence-local";
import { listArtifacts } from "./artifacts.js";
// @ts-ignore JavaScript compatibility module
import { verifyPrototype } from "../../../src/core/prototype-verifier.js";
// @ts-ignore JavaScript compatibility module
import { verifyGraphWorkflow } from "../../../src/core/workflow-verifier.js";
// @ts-ignore JavaScript compatibility module
import { adapters as inlineAdapters, commitAdapterCompletion } from "../../../src/adapters/index.js";

type QueueItem = { runId: string; operation: "start" | "resume"; from?: string; to?: string };
type Listener = (event: RunEventV1) => void;
export type CompiledWorkflowSubmission = {
  manifest: unknown;
  workflow: WorkflowV1;
  raw: string;
  digest?: string;
  recipeId: string;
  projectName: string;
};

export class RunScheduler {
  readonly store: LocalControlStore;
  readonly projectRoot: string;
  private queue: QueueItem[] = [];
  private active?: string;
  private listeners = new Map<string, Set<Listener>>();
  private publishLocks = new Map<string, Promise<unknown>>();
  private enqueueLock: Promise<void> = Promise.resolve();
  private transitionLock: Promise<void> = Promise.resolve();
  private adapterRegistry: Record<string, Function>;
  private checkpointStore: FileCheckpointStore;
  private resourceLockPath?: string;
  private resourceRetryMs: number;
  private retryTimer?: ReturnType<typeof setTimeout>;

  constructor(projectRoot: string, store: LocalControlStore, options: {
    adapterRegistry?: Record<string, Function>;
    checkpointStore?: FileCheckpointStore;
    resourceLockPath?: string;
    resourceRetryMs?: number;
  } = {}) {
    this.projectRoot = projectRoot;
    this.store = store;
    this.adapterRegistry = options.adapterRegistry ?? createSubprocessAdapterRegistry(projectRoot, inlineAdapters);
    this.checkpointStore = options.checkpointStore ?? new FileCheckpointStore();
    this.resourceLockPath = options.resourceLockPath;
    this.resourceRetryMs = options.resourceRetryMs ?? 1_000;
  }

  async initialize() {
    await this.store.init();
    for (const record of (await this.store.list()).reverse()) {
      if (record.status === "needs_attention" && record.errorCode === "ADAPTER_COMMIT_PENDING" && record.runDir) {
        record.status = "queued";
        record.error = undefined;
        record.errorCode = undefined;
        record.unsafeToResume = undefined;
        record.queuedOperation = "resume";
        record.updatedAt = new Date().toISOString();
        await this.store.put(record);
      }
      if (record.status === "queued") {
        this.queue.push({
          runId: record.runId,
          operation: record.queuedOperation ?? (record.runDir ? "resume" : "start"),
          from: record.resumeFrom,
          to: record.resumeTo
        });
      }
      if (record.status === "running" || record.status === "stopping") {
        record.status = "needs_attention";
        record.error = "Control API restarted while this run was active. Inspect Adobe output before resuming.";
        record.errorCode = "CONTROL_API_RESTARTED";
        record.unsafeToResume = true;
        record.updatedAt = new Date().toISOString();
        await this.store.put(record);
      }
      await this.reconcileCheckpointEvent(record);
    }
    void this.startNext();
  }

  async enqueue(manifest: PortraitStoryManifestV1, dryRun: boolean, idempotencyKey?: string) {
    const compiled = compilePortraitStory(manifest);
    return this.enqueueCompiledWorkflow({
      manifest,
      workflow: compiled.workflow,
      raw: compiled.raw,
      digest: compiled.digest,
      recipeId: manifest.recipeId,
      projectName: manifest.projectName
    }, dryRun, idempotencyKey);
  }

  async enqueueCompiledWorkflow(submission: CompiledWorkflowSubmission, dryRun: boolean, idempotencyKey?: string, bounds: { to?: string } = {}) {
    const previous = this.enqueueLock;
    let release!: () => void;
    this.enqueueLock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const digest = submission.digest ?? workflowDigest(submission.raw);
      if (workflowDigest(submission.raw) !== digest) {
        throw Object.assign(new Error("Compiled workflow digest does not match its raw snapshot"), { statusCode: 422 });
      }
      let parsed: unknown;
      try { parsed = JSON.parse(submission.raw); }
      catch { throw Object.assign(new Error("Compiled workflow raw snapshot is not valid JSON"), { statusCode: 422 }); }
      if (JSON.stringify(parsed) !== JSON.stringify(submission.workflow)) {
        throw Object.assign(new Error("Compiled workflow object does not match its raw snapshot"), { statusCode: 422 });
      }
      const validation = await validateWorkflowDocument(submission.workflow, this.projectRoot);
      if (!validation.valid) throw Object.assign(new Error("Compiled workflow is invalid"), { statusCode: 422, diagnostics: validation.errors });
      if (idempotencyKey) {
        if (idempotencyKey.length > 128) throw Object.assign(new Error("Idempotency-Key is too long"), { statusCode: 400 });
        const existing = (await this.store.list()).find((record) => record.idempotencyKey === idempotencyKey);
        if (existing) {
          if (existing.workflowDigest !== digest || existing.dryRun !== dryRun || existing.startTo !== bounds.to) {
            throw Object.assign(new Error("Idempotency-Key was already used for a different request"), { statusCode: 409 });
          }
          return existing;
        }
      }
      const runId = makeRunId(submission.workflow.id);
      const now = new Date().toISOString();
      await this.store.saveSubmission(runId, submission.manifest, submission.raw);
      const record: ControlRunRecord = {
        runId,
        recipeId: submission.recipeId,
        projectName: submission.projectName,
        status: "queued",
        dryRun,
        workflowDigest: digest,
        configPath: this.store.workflowPath(runId),
        queuedOperation: "start",
        resumeTo: bounds.to,
        createdAt: now,
        updatedAt: now,
        idempotencyKey,
        startTo: bounds.to
      };
      await this.store.put(record);
      this.queue.push({ runId, operation: "start", to: bounds.to });
      try {
        await this.publish(runId, { type: "run.queued", stateVersion: 0, data: { dryRun } });
      } catch (error: any) {
        record.eventError = error?.message ?? String(error);
        await this.store.put(record);
      } finally {
        void this.startNext();
      }
      return record;
    } finally {
      release();
    }
  }

  async resume(runId: string, from?: string, to?: string) {
    const record = await this.withTransitionLock(async () => {
      const current = await this.requireRecord(runId);
      if (!current.runDir || !["failed", "partial", "needs_attention", "waiting_approval"].includes(current.status)) {
        throw Object.assign(new Error("Run is not resumable"), { statusCode: 409 });
      }
      if (current.unsafeToResume) {
        throw Object.assign(new Error("This run requires Adobe output inspection before a new run is created; automatic resume is disabled"), { statusCode: 409 });
      }
      current.status = "queued";
      current.error = undefined;
      current.errorCode = undefined;
      current.unsafeToResume = undefined;
      current.artifactError = undefined;
      current.stopAfterStep = false;
      current.queuedOperation = "resume";
      current.resumeFrom = from;
      current.resumeTo = to;
      current.updatedAt = new Date().toISOString();
      await this.store.put(current);
      return current;
    });
    this.queue.push({ runId, operation: "resume", from, to });
    try {
      await this.publish(runId, { type: "run.queued", stateVersion: await this.stateVersion(record), data: { resume: true, from, to } });
    } catch (error: any) {
      record.eventError = error?.message ?? String(error);
      await this.store.put(record);
    } finally {
      void this.startNext();
    }
    return record;
  }

  async requestStop(runId: string) {
    const record = await this.withTransitionLock(async () => {
      const current = await this.requireRecord(runId);
      if (current.status !== "running") throw Object.assign(new Error("Only a running job can stop after its current step"), { statusCode: 409 });
      current.status = "stopping";
      current.stopAfterStep = true;
      current.updatedAt = new Date().toISOString();
      await this.store.put(current);
      return current;
    });
    await this.publish(runId, { type: "stop.requested", stateVersion: await this.stateVersion(record), data: {} });
    return record;
  }

  async cancelQueued(runId: string) {
    const record = await this.withTransitionLock(async () => {
      const current = await this.requireRecord(runId);
      if (current.status !== "queued") throw Object.assign(new Error("Only a queued job can be cancelled"), { statusCode: 409 });
      this.queue = this.queue.filter((item) => item.runId !== runId);
      current.status = "cancelled";
      current.updatedAt = new Date().toISOString();
      await this.store.put(current);
      return current;
    });
    await this.publish(runId, { type: "run.cancelled", stateVersion: await this.stateVersion(record), data: {} });
    return record;
  }

  subscribe(runId: string, listener: Listener) {
    const set = this.listeners.get(runId) ?? new Set();
    set.add(listener);
    this.listeners.set(runId, set);
    return () => { set.delete(listener); if (!set.size) this.listeners.delete(runId); };
  }

  async publish(runId: string, partial: Omit<RunEventV1, "schemaVersion" | "sequence" | "runId" | "occurredAt">) {
    const previousPublish = this.publishLocks.get(runId) ?? Promise.resolve();
    const currentPublish = previousPublish.catch(() => {}).then(async () => {
      const previous = await this.store.events(runId);
      const event: RunEventV1 = {
        schemaVersion: 1,
        sequence: (previous.at(-1)?.sequence ?? 0) + 1,
        runId,
        occurredAt: new Date().toISOString(),
        ...partial
      };
      await this.store.appendEvent(runId, event);
      for (const listener of this.listeners.get(runId) ?? []) listener(event);
      return event;
    });
    this.publishLocks.set(runId, currentPublish);
    try { return await currentPublish; }
    finally { if (this.publishLocks.get(runId) === currentPublish) this.publishLocks.delete(runId); }
  }

  private async startNext() {
    if (this.active) return;
    const item = this.queue.shift();
    if (!item) return;
    // Reserve the single execution slot before the first await. Concurrent
    // enqueue/resume calls can otherwise both observe an idle scheduler.
    this.active = item.runId;
    let record: ControlRunRecord | undefined;
    let lastStateVersion = 0;
    let verificationFailed = false;
    let pendingSuccessEvent: Omit<RunEventV1, "schemaVersion" | "sequence" | "runId" | "occurredAt"> | undefined;
    try {
      let loaded: ReturnType<typeof loadWorkflowText> | undefined;
      let runDir: string | undefined;
      await this.withTransitionLock(async () => {
        record = await this.requireRecord(item.runId);
        if (record.status !== "queued") return;
        const raw = await readFile(record.configPath, "utf8");
        if (workflowDigest(raw) !== record.workflowDigest) {
          throw Object.assign(new Error("Workflow snapshot digest mismatch; refusing to execute modified JSON"), { code: "WORKFLOW_SNAPSHOT_MISMATCH" });
        }
        loaded = loadWorkflowText(raw, { configPath: record.configPath, configDir: this.projectRoot });
        const runRoot = path.resolve(this.projectRoot, loaded.workflow.settings.runRoot);
        runDir = record.runDir ?? path.join(runRoot, item.runId);
        record.runDir = runDir;
        record.status = "running";
        record.updatedAt = new Date().toISOString();
        await this.store.put(record);
      });
      if (!record || !loaded || !runDir || record.status !== "running") return;
      const state = await runWorkflow(loaded, this.adapterRegistry, {
        dryRun: record.dryRun,
        stateStore: this.checkpointStore,
        runDir,
        resume: item.operation === "resume" ? runDir : undefined,
        from: item.from,
        to: item.to,
        commitAdapterCompletion,
        emit: async (event: RunEventV1) => {
          lastStateVersion = Math.max(lastStateVersion, event.stateVersion);
          const { schemaVersion: _schemaVersion, sequence: _sequence, runId: _runId, occurredAt: _occurredAt, ...partial } = event;
          if (partial.type === "run.succeeded") { pendingSuccessEvent = partial; return; }
          await this.publish(item.runId, partial);
        },
        log: (message: string) => { if (message) void appendFile(path.join(this.store.submissionDir(item.runId), "runner.log"), `${new Date().toISOString()} ${message}\n`); },
        shouldStopAfterStep: async () => Boolean((await this.store.get(item.runId))?.stopAfterStep)
      });
      if (!record.dryRun && state.status === "success") {
        try {
          const verification = record.recipeId === "portrait-story-v1"
            ? await verifyPrototype(runDir)
            : await verifyGraphWorkflow(runDir, loaded.workflow);
          verificationFailed = !verification.ok;
          const evidenceName = record.recipeId === "portrait-story-v1" ? "prototype-evidence.json" : "workflow-evidence.json";
          await atomicWrite(path.join(runDir, evidenceName), `${JSON.stringify(verification, null, 2)}\n`);
          record = await this.withTransitionLock(async () => {
            const current = await this.requireRecord(item.runId);
            current.verification = {
              status: verification.ok ? "passed" : "failed",
              ...verification.summary,
              verifiedAt: verification.verifiedAt
            };
            await this.store.put(current);
            return current;
          });
          await this.publish(item.runId, {
            type: "verification.completed",
            stateVersion: Number(state.version ?? lastStateVersion),
            data: {
              ok: verification.ok,
              passed: verification.summary.passed,
              failed: verification.summary.failed,
              total: verification.summary.total,
              checks: verification.checks
            }
          });
        } catch (error: any) {
          verificationFailed = true;
          record = await this.withTransitionLock(async () => {
            const current = await this.requireRecord(item.runId);
            current.verification = {
              status: "error",
              passed: 0,
              failed: 1,
              total: 1,
              verifiedAt: new Date().toISOString(),
              error: error?.message ?? String(error)
            };
            await this.store.put(current);
            return current;
          });
          await this.publish(item.runId, {
            type: "verification.completed",
            stateVersion: Number(state.version ?? lastStateVersion),
            data: { ok: false, passed: 0, failed: 1, total: 1, error: error?.message ?? String(error) }
          });
        }
      }
      // Artifact discovery is a convenience read model. Failure to catalog an
      // already successful/partial run must not change execution truth.
      try {
        await atomicWrite(path.join(runDir, "artifacts.json"), `${JSON.stringify(await listArtifacts(runDir), null, 2)}\n`);
        record = await this.withTransitionLock(async () => {
          const current = await this.requireRecord(item.runId);
          current.artifactError = undefined;
          await this.store.put(current);
          return current;
        });
      } catch (error: any) {
        record = await this.withTransitionLock(async () => {
          const current = await this.requireRecord(item.runId);
          current.artifactError = error?.message ?? String(error);
          await this.store.put(current);
          return current;
        });
      }
      // The terminal record write is deliberately last. Once clients observe
      // success/partial, no verification or artifact write remains in flight.
      record = await this.withTransitionLock(async () => {
        const current = await this.requireRecord(item.runId);
        current.status = verificationFailed && state.status === "success" ? "needs_attention" : state.status;
        current.error = verificationFailed ? "Output verification failed; inspect evidence before resuming or starting a new run" : undefined;
        current.errorCode = verificationFailed ? "OUTPUT_VERIFICATION_FAILED" : undefined;
        current.unsafeToResume = undefined;
        current.stopAfterStep = false;
        current.queuedOperation = undefined;
        current.resumeFrom = undefined;
        current.resumeTo = undefined;
        current.updatedAt = new Date().toISOString();
        await this.store.put(current);
        return current;
      });
      if (verificationFailed) {
        await this.publish(item.runId, { type: "run.failed", stateVersion: Number(state.version ?? lastStateVersion), data: { error: record.error, code: record.errorCode, needsAttention: true } });
      } else if (pendingSuccessEvent) {
        await this.publish(item.runId, pendingSuccessEvent);
      }
    } catch (error: any) {
      if (!record) return;
      record = await this.withTransitionLock(async () => {
        const current = await this.requireRecord(item.runId);
        current.status = ["CHECKPOINT_AFTER_ADAPTER_SUCCESS", "WORKFLOW_SNAPSHOT_MISMATCH", "ADOBE_HOST_AMBIGUOUS", "ADAPTER_COMMIT_PENDING"].includes(error?.code)
          ? "needs_attention"
          : "failed";
        current.error = error?.message ?? String(error);
        current.errorCode = error?.code;
        current.unsafeToResume = Boolean(error?.unsafeToResume);
        current.queuedOperation = undefined;
        current.resumeFrom = undefined;
        current.resumeTo = undefined;
        current.updatedAt = new Date().toISOString();
        await this.store.put(current);
        return current;
      });
      if (record.runDir) {
        try { await atomicWrite(path.join(record.runDir, "artifacts.json"), `${JSON.stringify(await listArtifacts(record.runDir), null, 2)}\n`); } catch { /* A failed run may not have created its directory yet. */ }
      }
      await this.publish(item.runId, { type: "run.failed", stateVersion: lastStateVersion, data: { error: record.error } });
    } finally {
      this.active = undefined;
      void this.startNext();
    }
  }

  private async requireRecord(runId: string) {
    const record = await this.store.get(runId);
    if (!record) throw Object.assign(new Error("Run not found"), { statusCode: 404 });
    return record;
  }

  private scheduleNext() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.startNext();
    }, this.resourceRetryMs);
    this.retryTimer.unref?.();
  }

  private async stateVersion(record: ControlRunRecord) {
    if (!record.runDir) return 0;
    try { return Number((await this.checkpointStore.read(record.runDir))?.version ?? 0); }
    catch { return 0; }
  }

  private async reconcileCheckpointEvent(record: ControlRunRecord) {
    if (!record.runDir) return;
    try {
      const [state, events] = await Promise.all([
        this.checkpointStore.read(record.runDir),
        this.store.events(record.runId)
      ]);
      const checkpointVersion = Number(state?.version ?? 0);
      const journalVersion = Math.max(0, ...events.map((event) => Number(event.stateVersion ?? 0)));
      if (checkpointVersion > journalVersion) {
        await this.publish(record.runId, {
          type: "checkpoint.recovered",
          stateVersion: checkpointVersion,
          data: { journalStateVersion: journalVersion, checkpointStatus: state?.status }
        });
      }
    } catch (error: any) {
      record.eventError = `Checkpoint/event reconciliation failed: ${error?.message ?? error}`;
      await this.store.put(record);
    }
  }

  private async withTransitionLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.transitionLock;
    let release!: () => void;
    this.transitionLock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }
}

function makeRunId(workflowId: string) {
  // Keep monitor URLs below the router's parameter limit. The workflow id is
  // already persisted as recipeId; it does not need to be duplicated here.
  return `run_${Date.now().toString(36)}_${randomUUID().slice(0, 12)}`;
}
