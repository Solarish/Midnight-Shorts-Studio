import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildAfterEffectsRunner, createAfterEffectsJobPayload } from "../src/adapters/after-effects.js";

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

test("After Effects host guard protects saved, dirty, and populated projects and fences results", async () => {
  const source = await readFile(new URL("../adobe/after-effects/assemble.jsx", import.meta.url), "utf8");
  assert.match(source, /app\.project\.numItems > 0 \|\| app\.project\.file \|\| app\.project\.dirty/);
  assert.match(source, /jobId: job\.id/);
  assert.match(source, /generation: job\.generation/);
  assert.doesNotMatch(source, /app\.quit/);
});

test("After Effects job serialization preserves carousel timing, styling, and media fitting", () => {
  const context = {
    resolvePath: (value) => `/project/${value}`,
    resolveRunPath: (value) => `/run/${value}`
  };
  const payload = createAfterEffectsJobPayload({
    composition: "Main",
    footage: { "Media 1": "photo.jpg" },
    mediaFit: "contain",
    timing: { durationSeconds: 15, frameRate: 25, pacing: "cinematic" },
    styling: { theme: "psu_blue_gold", enableParticles: true, enableDepthOfField: false }
  }, context, {
    templateProject: "/project/template.aep",
    outputProject: "/run/output.aep",
    resultFile: "/run/result.json",
    logFile: "/run/milestones.log"
  });

  assert.equal(payload.mediaFit, "contain");
  assert.deepEqual(payload.timing, { durationSeconds: 15, frameRate: 25, pacing: "cinematic" });
  assert.deepEqual(payload.styling, { theme: "psu_blue_gold", enableParticles: true, enableDepthOfField: false });
  assert.equal(payload.footage["Media 1"], "/project/photo.jpg");
});

test("After Effects carousel host consumes configuration and records absent template slots as warnings", async () => {
  const source = await readFile(new URL("../adobe/after-effects/assemble.jsx", import.meta.url), "utf8");
  assert.match(source, /applyTiming\(comp, job\.timing \|\| \{\}\)/);
  assert.match(source, /applyStyling\(job\.styling \|\| \{\}\)/);
  assert.match(source, /fitProjectItemLayers\(projItem, \(job && job\.mediaFit\) \|\| "cover"\)/);
  assert.match(source, /warning\("slot-not-found", layerName\)/);
  assert.match(source, /warnings: warnings/);
  assert.doesNotMatch(source, /throw new Error\("Could not find footage item or layer/);
});
