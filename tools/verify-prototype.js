#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { verifyPrototype } from "../src/core/prototype-verifier.js";
import { verifyGraphWorkflow } from "../src/core/workflow-verifier.js";

const argumentsWithoutFlags = process.argv.slice(2).filter((value) => !value.startsWith("--"));
if (argumentsWithoutFlags.length !== 1) {
  process.stderr.write("Usage: npm run prototype:verify -- <run-directory> [--write]\n");
  process.exitCode = 2;
} else {
  const runDir = path.resolve(argumentsWithoutFlags[0]);
  const state = await readJson(path.join(runDir, "state.json"));
  const useLegacyVerifier = state?.workflowId === "ava_prototype"
    || String(state?.workflowId ?? "").startsWith("portrait_story_");
  const graphWorkflow = useLegacyVerifier ? undefined : await readJson(
    path.join(path.dirname(path.dirname(runDir)), ".ava-control", "submissions", path.basename(runDir), "workflow.json")
  );
  const result = graphWorkflow
    ? await verifyGraphWorkflow(runDir, graphWorkflow)
    : await verifyPrototype(runDir);
  for (const check of result.checks) {
    process.stdout.write(`${check.ok ? "PASS" : "FAIL"} ${check.id}: ${check.detail}\n`);
  }
  process.stdout.write(`\nSummary: ${result.summary.passed}/${result.summary.total} checks passed\n`);
  if (process.argv.includes("--write")) {
    const output = path.join(result.runDir, useLegacyVerifier ? "prototype-evidence.json" : "workflow-evidence.json");
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    process.stdout.write(`Evidence: ${output}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return undefined;
  }
}
