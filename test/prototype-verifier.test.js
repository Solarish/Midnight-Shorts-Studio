import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifyPrototype } from "../src/core/prototype-verifier.js";

function png(width, height, colorType) {
  const value = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(value, 0);
  value.writeUInt32BE(13, 8);
  value.write("IHDR", 12, "ascii");
  value.writeUInt32BE(width, 16);
  value.writeUInt32BE(height, 20);
  value[24] = 8;
  value[25] = colorType;
  return value;
}

test("prototype verifier accepts a complete sequential live evidence set", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-evidence-"));
  const cutout = path.join(runDir, "cutout.png");
  const background = path.join(runDir, "background.png");
  const aeProject = path.join(runDir, "output.aep");
  const render = path.join(runDir, "render.mov");
  const premiereProject = path.join(runDir, "output.prproj");
  const aeLog = path.join(runDir, "ae_bind/ae-milestones.log");
  await mkdir(path.dirname(aeLog), { recursive: true });
  await writeFile(cutout, png(1024, 1536, 6));
  await writeFile(background, png(768, 1344, 2));
  await writeFile(aeProject, Buffer.alloc(1_024, 1));
  const mov = Buffer.alloc(2_048, 1);
  mov.write("ftyp", 4, "ascii");
  await writeFile(render, mov);
  await writeFile(premiereProject, Buffer.alloc(1_024, 1));
  await writeFile(aeLog, [
    "runner-started", "template-opened", "text-bound", "footage-bound",
    "project-saved", "project-closed"
  ].join("\n"));

  const stepIds = [
    "select_presenter", "remove_background", "generate_background", "fixed_design",
    "ae_bind", "ae_render", "premiere_assembly"
  ];
  const steps = {};
  for (let index = 0; index < stepIds.length; index += 1) {
    const timestamp = new Date(Date.UTC(2026, 7, 24, 10, 0, index)).toISOString();
    steps[stepIds[index]] = { status: "success", startedAt: timestamp, finishedAt: timestamp, outputs: {} };
  }
  steps.remove_background.outputs = { path: cutout };
  steps.generate_background.outputs = { images: [{ localPath: background }] };
  steps.ae_bind.outputs = {
    project: aeProject,
    diagnosticLog: aeLog,
    hostResult: { ok: true, stage: "complete" }
  };
  steps.ae_render.outputs = { output: render };
  steps.premiere_assembly.outputs = {
    project: premiereProject,
    sequenceName: "AVA_PROTOTYPE",
    sequenceGuid: "sequence-guid",
    importedMedia: [render]
  };
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({
    workflowId: "ava_prototype",
    dryRun: false,
    status: "success",
    steps
  }));

  const evidence = await verifyPrototype(runDir);
  assert.equal(evidence.ok, true);
  assert.equal(evidence.summary.failed, 0);
  assert.ok(evidence.summary.total >= 28);
});

test("prototype verifier accepts the Control Center portrait-story profile", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "ava-portrait-evidence-"));
  const cutout = path.join(runDir, "cutout.png");
  const background = path.join(runDir, "background.png");
  const aeProject = path.join(runDir, "output.aep");
  const render = path.join(runDir, "render.mov");
  const premiereProject = path.join(runDir, "output.prproj");
  const aeLog = path.join(runDir, "ae_bind/ae-milestones.log");
  await mkdir(path.dirname(aeLog), { recursive: true });
  await writeFile(cutout, png(1024, 1536, 6));
  await writeFile(background, png(768, 1344, 2));
  await writeFile(aeProject, Buffer.alloc(1_024, 1));
  const mov = Buffer.alloc(2_048, 1); mov.write("ftyp", 4, "ascii"); await writeFile(render, mov);
  await writeFile(premiereProject, Buffer.alloc(1_024, 1));
  await writeFile(aeLog, "runner-started\ntemplate-opened\ntext-bound\nfootage-bound\nproject-saved\nproject-closed\n");
  const stepIds = ["select_presenter", "remove_background", "generate_background", "fixed_design", "ae_bind", "ae_render", "premiere_assembly"];
  const steps = Object.fromEntries(stepIds.map((id, index) => [id, { status: "success", startedAt: new Date(1_000 + index * 2).toISOString(), finishedAt: new Date(1_001 + index * 2).toISOString(), outputs: {} }]));
  steps.remove_background.outputs = { path: cutout };
  steps.generate_background.outputs = { images: [{ localPath: background }] };
  steps.ae_bind.outputs = { project: aeProject, diagnosticLog: aeLog, hostResult: { ok: true, stage: "complete" } };
  steps.ae_render.outputs = { output: render };
  steps.premiere_assembly.outputs = { project: premiereProject, sequenceName: "PORTRAIT_STORY", sequenceGuid: "guid", importedMedia: [render] };
  await writeFile(path.join(runDir, "state.json"), JSON.stringify({ workflowId: "portrait_story_first_user", dryRun: false, status: "success", steps }));
  const evidence = await verifyPrototype(runDir);
  assert.equal(evidence.ok, true);
  assert.equal(evidence.summary.passed, evidence.summary.total);
});
