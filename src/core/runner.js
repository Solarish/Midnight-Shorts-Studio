import { mkdir } from "node:fs/promises";
import path from "node:path";
import { interpolate } from "./interpolate.js";
import { createRunId, readState, workflowDigest, writeState } from "./state.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runWorkflow(loaded, adapters, options = {}) {
  const { workflow, configDir, raw } = loaded;
  const stateStore = options.stateStore ?? { read: readState, write: writeState };
  if (options.from && !workflow.steps.some((step) => step.id === options.from)) {
    throw new Error(`Unknown --from step '${options.from}'`);
  }
  if (options.to && !workflow.steps.some((step) => step.id === options.to)) {
    throw new Error(`Unknown --to step '${options.to}'`);
  }
  if (options.from && !options.resume) {
    throw new Error("--from requires --resume so predecessor checkpoints and outputs are available");
  }
  if (options.from && options.to) {
    const fromIndex = workflow.steps.findIndex((step) => step.id === options.from);
    const toIndex = workflow.steps.findIndex((step) => step.id === options.to);
    if (fromIndex > toIndex) throw new Error(`--from step '${options.from}' occurs after --to step '${options.to}'`);
  }
  const digest = workflowDigest(raw);
  const runRoot = path.resolve(configDir, workflow.settings.runRoot);
  const runDir = options.resume
    ? path.resolve(options.resume)
    : options.runDir
      ? path.resolve(options.runDir)
      : path.join(runRoot, createRunId(workflow.id));
  let state;

  if (options.resume) {
    state = await stateStore.read(runDir);
    if (state.workflowDigest !== digest) {
      throw new Error("Resume refused: workflow JSON changed since this checkpoint was created");
    }
    if (Object.hasOwn(options, "dryRun") && Boolean(options.dryRun) !== Boolean(state.dryRun)) {
      throw new Error("Resume refused: dry-run mode cannot change for an existing run");
    }
    state.status = "running";
    delete state.error;
    delete state.finishedAt;
    delete state.stoppedAtStep;
    delete state.stopRequested;
    delete state.approval;
  } else {
    state = {
      schemaVersion: 1,
      version: 0,
      workflowId: workflow.id,
      workflowDigest: digest,
      runId: path.basename(runDir),
      runDir,
      status: "running",
      dryRun: Boolean(options.dryRun),
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: {}
    };
  }

  await mkdir(runDir, { recursive: true });
  await checkpoint("run.started");

  let fromReached = !options.from;
  const finalStepId = workflow.steps.at(-1)?.id;
  for (const step of workflow.steps) {
    if (options.from === step.id) fromReached = true;
    if (!fromReached) continue;

    if (step.enabled === false) {
      state.steps[step.id] = { status: "skipped", reason: "disabled" };
      await checkpoint("step.skipped", step);
      if (options.to === step.id && step.id !== finalStepId) {
        state.status = "partial";
        state.stoppedAtStep = step.id;
        state.finishedAt = new Date().toISOString();
        await checkpoint("run.partial", step, { stoppedAtStep: step.id });
        return state;
      }
      continue;
    }
    if (state.steps[step.id]?.status === "success") {
      await finalizeCompletion(step);
      options.log?.(`SKIP ${step.id} (checkpoint success)`);
      if (options.to === step.id && step.id !== finalStepId) {
        state.status = "partial";
        state.stoppedAtStep = step.id;
        state.finishedAt = new Date().toISOString();
        await checkpoint("run.partial", step, { stoppedAtStep: step.id, checkpoint: true });
        return state;
      }
      continue;
    }

    let adapter;
    let stepDir;
    let resolvedStep;
    try {
      adapter = adapters[step.type];
      if (!adapter) throw new Error(`No adapter registered for step type '${step.type}'`);
      stepDir = path.join(runDir, step.id);
      await mkdir(stepDir, { recursive: true });
      const referenceContext = {
        workflow,
        env: process.env,
        run: { id: state.runId, dir: runDir },
        steps: Object.fromEntries(Object.entries(state.steps).map(([id, value]) => [id, { outputs: value.outputs }]))
      };
      resolvedStep = interpolate(step, referenceContext);
    } catch (error) {
      state.steps[step.id] = {
        status: "failed",
        type: step.type,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        attempts: 0,
        lastError: serializeError(error)
      };
      state.status = "failed";
      state.error = serializeError(error);
      state.finishedAt = new Date().toISOString();
      await checkpoint("step.failed", step, { setup: true, error: serializeError(error) });
      throw error;
    }
    const attempts = resolvedStep.retry?.attempts ?? workflow.settings.retryAttempts;
    const retryDelayMs = resolvedStep.retry?.delayMs ?? 1000;

    state.steps[step.id] = {
      status: "running",
      type: step.type,
      startedAt: new Date().toISOString(),
      attempts: 0
    };
    await checkpoint("step.started", step);

    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      state.steps[step.id].attempts = attempt;
      await checkpoint("step.attempted", step, { attempt });
      options.log?.(`RUN  ${step.id} [${step.type}] attempt ${attempt}/${attempts}`);

      let outputs;
      let completionReceipt;
      try {
        const adapterResult = await adapter(resolvedStep.with, {
          configDir,
          workflow,
          settings: workflow.settings,
          runDir,
          stepDir,
          step: resolvedStep,
          dryRun: Boolean(options.dryRun),
          timeoutMs: resolvedStep.timeoutMs ?? workflow.settings.stepTimeoutMs,
          resolvePath: (value) => path.resolve(configDir, value),
          resolveRunPath: (value) => path.resolve(runDir, value),
          log: options.log ?? (() => {})
        });
        ({ outputs, completionReceipt } = normalizeAdapterResult(adapterResult));
      } catch (error) {
        if (error?.code === "APPROVAL_REQUIRED") {
          const request = error?.details && typeof error.details === "object" ? error.details : {};
          state.steps[step.id] = {
            ...state.steps[step.id],
            status: "waiting_approval",
            finishedAt: new Date().toISOString(),
            outputs: { approvalRequest: request }
          };
          state.status = "waiting_approval";
          state.approval = { stepId: step.id, ...request };
          delete state.error;
          await checkpoint("run.waiting_approval", step, request);
          return state;
        }
        lastError = error;
        state.steps[step.id].lastError = serializeError(error);
        await checkpoint("step.attempt_failed", step, { attempt, error: serializeError(error) });
        if (attempt < attempts) await sleep(retryDelayMs);
        continue;
      }

      const { lastError: _lastError, ...successfulStep } = state.steps[step.id];
      state.steps[step.id] = {
        ...successfulStep,
        status: "success",
        finishedAt: new Date().toISOString(),
        outputs: outputs ?? {},
        completion: completionReceipt ? { status: "pending", receipt: completionReceipt } : undefined
      };
      // Checkpoint/event failures after a side-effecting adapter succeeds are
      // persistence failures, not adapter failures, and must never cause an
      // automatic retry of the adapter.
      try {
        await checkpoint("step.succeeded", step, { attempt, outputs: outputs ?? {} });
      } catch (error) {
        throw Object.assign(
          new Error(`Checkpoint failed after adapter '${step.id}' succeeded: ${error?.message ?? String(error)}`, { cause: error }),
          { code: "CHECKPOINT_AFTER_ADAPTER_SUCCESS", unsafeToResume: true }
        );
      }
      await finalizeCompletion(step);
      lastError = undefined;
      break;
    }

    if (lastError) {
      state.steps[step.id].status = "failed";
      state.steps[step.id].finishedAt = new Date().toISOString();
      state.status = "failed";
      state.error = serializeError(lastError);
      await checkpoint("step.failed", step, { error: serializeError(lastError) });
      throw lastError;
    }

    if (options.to === step.id && step.id !== finalStepId) {
      state.status = "partial";
      state.stoppedAtStep = step.id;
      state.finishedAt = new Date().toISOString();
      await checkpoint("run.partial", step, { stoppedAtStep: step.id });
      return state;
    }

    if (await options.shouldStopAfterStep?.(state, step)) {
      state.status = "partial";
      state.stoppedAtStep = step.id;
      state.stopRequested = true;
      state.finishedAt = new Date().toISOString();
      await checkpoint("run.partial", step, { stoppedAtStep: step.id, requested: true });
      return state;
    }
  }

  state.status = "success";
  delete state.error;
  delete state.stoppedAtStep;
  delete state.stopRequested;
  delete state.approval;
  state.finishedAt = new Date().toISOString();
  await checkpoint("run.succeeded");
  return state;

  async function checkpoint(type, step, data = {}) {
    state.version = Number(state.version ?? 0) + 1;
    state.updatedAt = new Date().toISOString();
    await stateStore.write(runDir, state);
    if (type) {
      await options.emit?.({
        schemaVersion: 1,
        sequence: state.version,
        runId: state.runId,
        stateVersion: state.version,
        type,
        occurredAt: state.updatedAt,
        stepId: step?.id,
        attempt: step ? state.steps[step.id]?.attempts : undefined,
        data
      }, state);
    }
  }

  async function finalizeCompletion(step) {
    const completion = state.steps[step.id]?.completion;
    if (!completion || completion.status === "committed") return;
    try {
      if (typeof options.commitAdapterCompletion !== "function") {
        throw new Error(`No completion committer is configured for '${completion.receipt?.kind ?? step.type}'`);
      }
      await options.commitAdapterCompletion(completion.receipt, {
        configDir,
        workflow,
        settings: workflow.settings,
        runDir,
        step,
        log: options.log ?? (() => {})
      });
      state.steps[step.id].completion = {
        status: "committed",
        committedAt: new Date().toISOString()
      };
      await checkpoint("step.committed", step);
    } catch (error) {
      const pendingError = Object.assign(
        new Error(`Post-checkpoint cleanup for '${step.id}' is pending: ${error?.message ?? String(error)}`, { cause: error }),
        { code: "ADAPTER_COMMIT_PENDING", unsafeToResume: false }
      );
      state.steps[step.id].completion = {
        ...completion,
        status: "pending",
        lastError: serializeError(pendingError)
      };
      state.status = "needs_attention";
      state.error = serializeError(pendingError);
      await checkpoint("step.commit_pending", step, { error: serializeError(pendingError) });
      throw pendingError;
    }
  }
}

function normalizeAdapterResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { outputs: value ?? {} };
  }
  const { __avaCompletion: completionReceipt, ...outputs } = value;
  return { outputs, completionReceipt };
}

function serializeError(error) {
  return {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    stack: error?.stack,
    code: error?.code,
    unsafeToResume: error?.unsafeToResume
    ,details: error?.details
  };
}
