#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { verifyPrototype } from "../src/core/prototype-verifier.js";

const argumentsWithoutFlags = process.argv.slice(2).filter((value) => !value.startsWith("--"));
if (argumentsWithoutFlags.length !== 1) {
  process.stderr.write("Usage: npm run prototype:verify -- <run-directory> [--write]\n");
  process.exitCode = 2;
} else {
  const result = await verifyPrototype(argumentsWithoutFlags[0]);
  for (const check of result.checks) {
    process.stdout.write(`${check.ok ? "PASS" : "FAIL"} ${check.id}: ${check.detail}\n`);
  }
  process.stdout.write(`\nSummary: ${result.summary.passed}/${result.summary.total} checks passed\n`);
  if (process.argv.includes("--write")) {
    const output = path.join(result.runDir, "prototype-evidence.json");
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    process.stdout.write(`Evidence: ${output}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}
