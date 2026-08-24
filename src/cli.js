#!/usr/bin/env node
import { parseArgs } from "node:util";
import { loadWorkflow } from "./core/config.js";
import { runWorkflow } from "./core/runner.js";
import { adapters } from "./adapters/index.js";

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

  const state = await runWorkflow(loaded, adapters, {
    dryRun: values["dry-run"],
    resume: values.resume,
    from: values.from,
    to: values.to,
    log: (message) => {
      if (message) console.log(message);
    }
  });
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
