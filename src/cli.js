#!/usr/bin/env node
import { parseArgs } from "node:util";
import path from "node:path";
import { loadWorkflow } from "./core/config.js";
import { runWorkflow } from "./core/runner.js";
import { acquireResourceLock } from "./core/resource-lock.js";
import { adapters, commitAdapterCompletion } from "./adapters/index.js";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean", default: false },
      resume: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      help: { type: "boolean", short: "h", default: false }
    }
  });

  if (values.help || positionals.length === 0) {
    printHelp();
    return;
  }

  const [command, configPath] = positionals;
  if (!configPath) throw new Error(`Command '${command}' requires a workflow JSON path`);
  const loaded = await loadWorkflow(configPath);

  if (command === "validate") {
    console.log(`VALID ${loaded.workflow.id} (${loaded.workflow.steps.length} sequential steps)`);
    return;
  }
  if (command !== "run") throw new Error(`Unknown command '${command}'`);

  const lease = await acquireResourceLock({
    owner: {
      runId: values.resume ? path.basename(path.resolve(values.resume)) : loaded.workflow.id,
      entrypoint: "cli",
      dryRun: values["dry-run"]
    }
  });
  let state;
  try {
    state = await runWorkflow(loaded, adapters, {
      dryRun: values["dry-run"],
      resume: values.resume,
      from: values.from,
      to: values.to,
      commitAdapterCompletion,
      log: (message) => {
        if (message) console.log(message);
      }
    });
  } finally {
    await lease.release();
  }
  console.log(`${state.status.toUpperCase()} ${state.runId}`);
  console.log(state.runDir);
}

function printHelp() {
  console.log(`PSU Automated Video Assembly

Usage:
  node ./src/cli.js validate <workflow.json>
  node ./src/cli.js run <workflow.json> [--dry-run]
  node ./src/cli.js run <workflow.json> [--to <step-id>]
  node ./src/cli.js run <workflow.json> --resume <run-dir> [--from <step-id>] [--to <step-id>]
`);
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
});
