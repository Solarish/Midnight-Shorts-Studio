import test from "node:test";
import assert from "node:assert/strict";
import { buildAfterEffectsRunner } from "../src/adapters/after-effects.js";

test("After Effects runner embeds its job and host code in one JSX file", () => {
  const job = {
    templateProject: "/tmp/template.aep",
    outputProject: "/tmp/output.aep",
    composition: "MASTER",
    text: { TITLE: "มหาวิทยาลัย • PSU" },
    footage: { PORTRAIT: "/tmp/person.png" },
    resultFile: "/tmp/ae-result.json",
    logFile: "/tmp/ae-milestones.log"
  };
  const runner = buildAfterEffectsRunner(job, "(function () { /* host marker */ }());\n");

  assert.match(runner, /\$\.global\.AVA_JOB = /);
  assert.match(runner, /มหาวิทยาลัย • PSU/);
  assert.match(runner, /AVA_RESULT_FILE = "\/tmp\/ae-result\.json"/);
  assert.match(runner, /AVA_LOG_FILE = "\/tmp\/ae-milestones\.log"/);
  assert.match(runner, /host marker/);
  assert.doesNotMatch(runner, /\$\.evalFile/);
  assert.doesNotMatch(runner, /AVA_JOB_FILE =/);
});
