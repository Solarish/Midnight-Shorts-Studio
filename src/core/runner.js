import { mkdir } from "node:fs/promises";
import path from "node:path";
import { interpolate } from "./interpolate.js";
import { createRunId, readState, workflowDigest, writeState } from "./state.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runWorkflow(loaded, adapters, options = {}) {
  const { workflow, configDir, raw } = loaded;
  if (options.from && !workflow.steps.some((step) => step.id === options.from)) {
    throw new Error(`Unknown --from step '${options.from}'`);
  }
  if (options.to && !workflow.steps.some((step) => step.id === options.to)) {
    throw new Error(`Unknown --to step '${options.to}'`);
  }
  const digest = workflowDigest(raw);
  const runRoot = path.resolve(configDir, workflow.settings.runRoot);
  const runDir = options.resume ? path.resolve(options.resume) : path.join(runRoot, createRunId(workflow.id));
  let state;

  if (options.resume) {
    state = await readState(runDir);
    if (state.workflowDigest !== digest) {
      throw new Error("Resume refused: workflow JSON changed since this checkpoint was created");
    }
    state.status = "running";
    delete state.error;
    delete state.finishedAt;
    delete state.stoppedAtStep;
  } else {
    state = {
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
  await writeState(runDir, state);

  let fromReached = !options.from;
  for (const step of workflow.steps) {
    if (options.from === step.id) fromReached = true;
    if (!fromReached) continue;

    if (!step.enabled) {
      state.steps[step.id] = { status: "skipped", reason: "disabled" };
      await checkpoint();
      continue;
    }
    if (state.steps[step.id]?.status === "success") {
      options.log?.(`SKIP ${step.id} (checkpoint success)`);
      continue;
    }

    const adapter = adapters[step.type];
    if (!adapter) throw new Error(`No adapter registered for step type '${step.type}'`);

    const stepDir = path.join(runDir, step.id);
    await mkdir(stepDir, { recursive: true });
    const referenceContext = {
      workflow,
      env: process.env,
      run: { id: state.runId, dir: runDir },
      steps: Object.fromEntries(Object.entries(state.steps).map(([id, value]) => [id, { outputs: value.outputs }]))
    };
    const resolvedStep = interpolate(step, referenceContext);
    const attempts = resolvedStep.retry?.attempts ?? workflow.settings.retryAttempts;
    const retryDelayMs = resolvedStep.retry?.delayMs ?? 1000;

    state.steps[step.id] = {
      status: "running",
      type: step.type,
      startedAt: new Date().toISOString(),
      attempts: 0
    };
    await checkpoint();

    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      state.steps[step.id].attempts = attempt;
      await checkpoint();
      options.log?.(`RUN  ${step.id} [${step.type}] attempt ${attempt}/${attempts}`);

      try {
        const outputs = await adapter(resolvedStep.with, {
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
        const { lastError: _lastError, ...successfulStep } = state.steps[step.id];
        state.steps[step.id] = {
          ...successfulStep,
          status: "success",
          finishedAt: new Date().toISOString(),
          outputs: outputs ?? {}
        };
        await checkpoint();
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        state.steps[step.id].lastError = serializeError(error);
        await checkpoint();
        if (attempt < attempts) await sleep(retryDelayMs);
      }
    }

    if (lastError) {
      state.steps[step.id].status = "failed";
      state.steps[step.id].finishedAt = new Date().toISOString();
      state.status = "failed";
      state.error = serializeError(lastError);
      await checkpoint();
      throw lastError;
    }

    if (options.to === step.id) {
      state.status = "partial";
      state.stoppedAtStep = step.id;
      state.finishedAt = new Date().toISOString();
      await checkpoint();
      return state;
    }
  }

  state.status = "success";
  delete state.error;
  delete state.stoppedAtStep;
  state.finishedAt = new Date().toISOString();
  await checkpoint();
  return state;

  async function checkpoint() {
    state.updatedAt = new Date().toISOString();
    await writeState(runDir, state);
  }
}

function serializeError(error) {
  return {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    stack: error?.stack
  };
}
