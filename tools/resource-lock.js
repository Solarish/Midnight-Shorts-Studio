#!/usr/bin/env node
import { parseArgs } from "node:util";
import { inspectLock, releaseStaleResourceLock } from "../src/core/resource-lock.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { "confirm-inspected-adobe": { type: "boolean", default: false } }
});
const command = positionals[0] ?? "status";

if (command === "status") {
  process.stdout.write(`${JSON.stringify(await inspectLock(), null, 2)}\n`);
} else if (command === "unlock") {
  const result = await releaseStaleResourceLock(values["confirm-inspected-adobe"] ? "inspected-adobe" : undefined);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  throw new Error(`Unknown resource lock command '${command}'`);
}
