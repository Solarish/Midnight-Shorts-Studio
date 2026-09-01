import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WorkerJobEnvelopeV1, WorkerJobResultV1 } from "@psu-ava/contracts";
import { adapters } from "../../../src/adapters/index.js";

const [, , jobPath, resultPath] = process.argv;

if (!jobPath || !resultPath) {
  process.stderr.write("Usage: mac-worker <job.json> <result.json>\n");
  process.exitCode = 2;
} else {
  await execute(jobPath, resultPath);
}

async function execute(source: string, target: string) {
  const logs: string[] = [];
  let job: WorkerJobEnvelopeV1 | undefined;
  let result: WorkerJobResultV1;
  try {
    const parsed = JSON.parse(await readFile(source, "utf8")) as WorkerJobEnvelopeV1;
    job = parsed;
    if (parsed.protocolVersion !== 1) throw new Error(`Unsupported worker protocol ${parsed.protocolVersion}`);
    const adapter = (adapters as Record<string, Function>)[parsed.type];
    if (!adapter) throw new Error(`Unsupported worker job type '${parsed.type}'`);
    const base = parsed.context;
    const outputs = await adapter(parsed.input, {
      ...base,
      resolvePath: (value: string) => path.resolve(base.configDir, value),
      resolveRunPath: (value: string) => path.resolve(base.runDir, value),
      log: (message: string) => { if (message) logs.push(String(message)); }
    });
    result = { protocolVersion: 1, jobId: parsed.jobId, generation: parsed.generation, ok: true, outputs, logs };
  } catch (error: any) {
    result = {
      protocolVersion: 1,
      jobId: job?.jobId ?? "invalid",
      generation: job?.generation ?? "invalid",
      ok: false,
      error: {
        name: error?.name ?? "Error",
        message: error?.message ?? String(error),
        stack: error?.stack,
        code: error?.code,
        unsafeToResume: error?.unsafeToResume,
        details: error?.details
      },
      logs
    };
  }
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}
