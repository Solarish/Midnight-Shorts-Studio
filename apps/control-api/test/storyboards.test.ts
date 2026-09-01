import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalStoryboardStore } from "@psu-ava/persistence-local";
import { StoryboardService } from "../src/storyboards.ts";

test("storyboard service enforces revisions and compiles only a valid draft", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-storyboard-service-"));
  const media = path.join(root, "logo.png"); await writeFile(media, "logo");
  const store = new LocalStoryboardStore(root); await store.init();
  await store.saveImport({ schemaVersion: 2, importId: "import_fixture", docxPath: path.join(root, "story.docx"), sourceDigest: "docx", importedAt: "2026-08-29T00:00:00.000Z", rawRows: [], proposals: [], diagnostics: [] });
  const service = new StoryboardService(store);
  const created = await service.create({ importId: "import_fixture", name: "Documentary" });
  assert.equal(created.revision, 1);
  await assert.rejects(service.update(created.storyboardId, { expectedRevision: 0, items: [] }), (error: any) => error.statusCode === 409);
  await assert.rejects(service.approveAndCompile(created.storyboardId, 1), (error: any) => error.statusCode === 422);
  const updated = await service.update(created.storyboardId, {
    expectedRevision: 1,
    items: [{ id: "logo_1", kind: "logo_outro", durationMs: 4000, audioPolicy: "mute", presetId: "logo-outro-v1", params: { sourcePath: media } }]
  });
  assert.equal(updated.status, "draft");
  const result = await service.approveAndCompile(created.storyboardId, updated.revision);
  assert.equal(result.approved.version, 1);
  assert.equal(result.compilation.executable, false);
  const execution = await service.createExecutionGraph(created.storyboardId, 1, {
    outputProject: "outputs/premiere/documentary.prproj",
    sequenceName: "DOCUMENTARY_MASTER",
    sequencePresetPath: "/Applications/Fixture/1080p25.sqpreset",
    h264: { output: "outputs/exports/documentary-premiere.mp4", normalizedOutput: "outputs/exports/documentary.mp4", presetPath: "/Applications/Fixture/h264.epr" },
    prores: { output: "outputs/exports/documentary.mov", presetPath: "/Applications/Fixture/prores.epr" },
    audioQc: { targetLufs: -23, toleranceLufs: 2, maxTruePeakDbfs: -1, silenceThresholdDbfs: -50, minSilenceMs: 1000, maxUnexpectedSilenceMs: 1500 }
  });
  assert.equal(execution.settings?.executable, true);
  assert.equal(execution.lineage?.sourceDigest, result.compilation.graphDigest);
  await assert.rejects(service.createExecutionGraph(created.storyboardId, 2, {
    outputProject: "outputs/premiere/documentary.prproj",
    sequenceName: "DOCUMENTARY_MASTER",
    sequencePresetPath: "/Applications/Fixture/1080p25.sqpreset",
    h264: { output: "outputs/exports/documentary-premiere.mp4", normalizedOutput: "outputs/exports/documentary.mp4", presetPath: "/Applications/Fixture/h264.epr" },
    prores: { output: "outputs/exports/documentary.mov", presetPath: "/Applications/Fixture/prores.epr" },
    audioQc: { targetLufs: -23, toleranceLufs: 2, maxTruePeakDbfs: -1, silenceThresholdDbfs: -50, minSilenceMs: 1000, maxUnexpectedSilenceMs: 1500 }
  }), (error: any) => error.statusCode === 404);
  const approved = await service.get(created.storyboardId);
  assert.equal(approved.status, "approved");
  const changed = await service.update(created.storyboardId, { expectedRevision: approved.revision, name: "Changed" });
  assert.equal(changed.status, "stale");
  await rm(root, { recursive: true, force: true });
});
