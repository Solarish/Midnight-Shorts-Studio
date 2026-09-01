import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { buildRunner, createPlan, parseArgs } from "../tools/create-cover-text-mogrt.js";

const execFileAsync = promisify(execFile);
const stable = "/Applications/Adobe After Effects 2026/Adobe After Effects 2026.app";

test("Cover MOGRT launcher defaults to dry print and pins stable AE 2026 without duplicate instances", async () => {
  const plan = createPlan(parseArgs([]));
  assert.equal(plan.mode, "dry-print");
  assert.equal(plan.appPath, stable);
  assert.equal(plan.appName, "Adobe After Effects 2026");
  assert.deepEqual(plan.launch, { command: "open", args: ["-a", stable] });
  assert.equal(plan.output.endsWith("/templates/premiere/psu-cover-text.mogrt"), true);

  const { stdout } = await execFileAsync(process.execPath, ["tools/create-cover-text-mogrt.js", "--json"], { cwd: new URL("..", import.meta.url) });
  const printed = JSON.parse(stdout);
  assert.equal(printed.mode, "dry-print");
  assert.match(printed.note, /Nothing launched/);
});

test("Cover MOGRT launcher refuses Beta and unsafe output names before execution", () => {
  assert.throws(() => createPlan(parseArgs(["--app", "/Applications/Adobe After Effects (Beta)/Adobe After Effects (Beta).app"])), /stable app path/);
  assert.equal(createPlan(parseArgs(["--output", "/tmp/cover-01.mogrt"])).templateName, "cover-01");
  assert.throws(() => createPlan(parseArgs(["--output", "/tmp/ชื่อ.mogrt"])), /ASCII letters/);
});

test("Cover MOGRT runner and JSX enforce pristine-project guard, editable parameters, save-before-export and receipt", async () => {
  const plan = createPlan(parseArgs([]));
  const runner = buildRunner(plan, "job-123");
  assert.match(runner, /AVA_MOGRT_JOB_ID = "job-123"/);
  assert.match(runner, /AVA_MOGRT_RECEIPT/);
  assert.match(runner, /AVA_MOGRT_PERSON_NAME/);
  const source = await readFile(new URL("../adobe/after-effects/create-cover-text-mogrt.jsx", import.meta.url), "utf8");
  const guard = source.indexOf("app.project.file || app.project.numItems > 0 || app.project.dirty");
  const mutation = source.indexOf("app.project.items.addComp");
  const save = source.indexOf("app.project.save(projectFile)");
  const exportMogrt = source.indexOf("comp.exportAsMotionGraphicsTemplate(true, outputFolder.fsName)");
  assert.ok(guard >= 0 && mutation > guard, "pristine-project guard must precede the first project mutation");
  assert.ok(save >= 0 && exportMogrt > save, "project must be saved before MOGRT export");
  assert.match(source, /sourceText\.addToMotionGraphicsTemplateAs\(comp, name\)/);
  for (const parameter of ["PERSON_NAME", "POSITION_TITLE", "AWARD"]) assert.match(source, new RegExp(parameter));
  assert.match(source, /outputFile\.exists && outputFile\.length > 0/);
  assert.ok(source.indexOf("var compMetadata") < exportMogrt, "receipt metadata must be captured before export invalidates the comp wrapper");
  assert.equal(/app\.quit/.test(source), false);
});
