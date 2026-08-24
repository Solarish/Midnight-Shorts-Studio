import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export function workflowDigest(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

export function createRunId(workflowId) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${workflowId}-${timestamp}-${randomUUID().slice(0, 8)}`;
}

export async function readState(runDir) {
  return JSON.parse(await readFile(path.join(runDir, "state.json"), "utf8"));
}

export async function writeState(runDir, state) {
  await mkdir(runDir, { recursive: true });
  const target = path.join(runDir, "state.json");
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

