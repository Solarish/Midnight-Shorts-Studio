import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import type { WorkerJobEnvelopeV1, WorkerJobResultV1 } from "@psu-ava/contracts";

type Adapter = (input: Record<string, unknown>, context: any) => Promise<Record<string, unknown>>;

export function createSubprocessAdapterRegistry(projectRoot: string, inlineAdapters: Record<string, Adapter>): Record<string, Adapter> {
  return Object.fromEntries(Object.entries(inlineAdapters).map(([type, inline]) => [type, async (input, context) => {
    if (context.dryRun || process.env.AVA_ADAPTER_TRANSPORT === "local-inline") return inline(input, context);
    return executeWorkerJob(projectRoot, type, input, context);
  }]));
}

export async function executeWorkerJob(projectRoot: string, type: string, input: Record<string, unknown>, context: any) {
  const jobId = randomUUID();
  const generation = randomUUID();
  const envelope: WorkerJobEnvelopeV1 = {
    protocolVersion: 1,
    jobId,
    generation,
    type,
    input,
    context: {
      configDir: context.configDir,
      settings: context.settings,
      runDir: context.runDir,
      stepDir: context.stepDir,
      step: context.step,
      dryRun: Boolean(context.dryRun),
      timeoutMs: context.timeoutMs
    }
  };
  await mkdir(context.stepDir, { recursive: true });
  const jobPath = path.join(context.stepDir, "worker-job.json");
  const resultPath = path.join(context.stepDir, "worker-result.json");
  await atomicJson(jobPath, envelope);
  const workerEntry = path.join(projectRoot, "apps/mac-worker/src/execute-once.ts");
  await runWorker(process.execPath, ["--import", "tsx", workerEntry, jobPath, resultPath], context.timeoutMs + 15_000, context.log);
  const result = JSON.parse(await readFile(resultPath, "utf8")) as WorkerJobResultV1;
  if (result.protocolVersion !== 1 || result.jobId !== jobId || result.generation !== generation) {
    throw new Error("macOS worker returned a mismatched job result");
  }
  for (const line of result.logs ?? []) context.log(line);
  if (!result.ok) throw Object.assign(new Error(result.error?.message ?? "macOS worker job failed"), {
    stack: result.error?.stack,
    code: result.error?.code,
    unsafeToResume: result.error?.unsafeToResume,
    details: result.error?.details
  });
  return result.outputs ?? {};
}

async function atomicJson(target: string, value: unknown) {
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

function runWorker(command: string, args: string[], timeoutMs: number, log: (message: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    // Give each worker its own process group so a timeout terminates descendants
    // such as aerender, rather than releasing the sequential runner while Adobe
    // is still mutating the project in the background.
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32"
    });
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      signalWorker("SIGTERM");
      forceTimer = setTimeout(() => signalWorker("SIGKILL"), 5_000);
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { const value = String(chunk).trimEnd(); if (value) log(value); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", finish);
    child.on("close", (code) => timedOut
      ? finish(new Error(`macOS worker timed out after ${timeoutMs}ms`))
      : code === 0 ? finish() : finish(new Error(`macOS worker exited with code ${code}: ${stderr.trim()}`)));
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      error ? reject(error) : resolve();
    }
    function signalWorker(signal: NodeJS.Signals) {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (error: any) {
        if (error?.code !== "ESRCH") stderr += `\nUnable to signal worker: ${error?.message ?? error}`;
      }
    }
  });
}
