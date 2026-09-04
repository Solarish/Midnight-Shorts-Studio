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
  await writeFile(path.join(root, "clip1.mp4"), "clip1");
  await writeFile(path.join(root, "clip2.mp4"), "clip2");
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

  // Test Auto B-Roll calculation via service
  const aRollDraft = await service.update(created.storyboardId, {
    expectedRevision: changed.revision,
    items: [{
      id: "interview_1",
      kind: "a_roll",
      durationMs: 36000,
      audioPolicy: "preserve",
      presetId: "a-roll-segment-v1",
      params: {
        sourceKey: "C7724",
        dialogue: "นักศึกษาได้เรียนรู้การทำฟันจำลอง 3 มิติในห้องปฏิบัติการและคลินิก"
      },
      broll: []
    }]
  });
  const autoBroll = await service.generateAutoBroll(aRollDraft.storyboardId, "interview_1", {
    brollPoolDir: root
  });
  assert.ok(autoBroll.slots.length >= 2, "36s A-roll generates at least 2 B-roll slots");
  assert.equal(autoBroll.broll.length, autoBroll.slots.length);
  assert.ok(autoBroll.rationale.includes("B-roll"));

  // Verify board-aware cooldown: save interview_1 with its assigned B-roll, then add interview_2
  const updatedWithBroll = await service.update(aRollDraft.storyboardId, {
    expectedRevision: aRollDraft.revision,
    items: [
      { ...aRollDraft.items[0]!, broll: autoBroll.broll },
      {
        id: "interview_2",
        kind: "a_roll",
        durationMs: 30000,
        audioPolicy: "preserve",
        presetId: "a-roll-segment-v1",
        params: {
          sourceKey: "C7724",
          dialogue: "การทำฟันจำลอง 3 มิติและบรรยากาศในคลินิก"
        },
        broll: []
      }
    ]
  });

  const autoBroll2 = await service.generateAutoBroll(updatedWithBroll.storyboardId, "interview_2", {
    brollPoolDir: root
  });
  // Top B-roll of interview_2 must NOT repeat the top B-roll of interview_1
  assert.notEqual(autoBroll2.broll[0]?.asset.path, autoBroll.broll[0]?.asset.path, "Interview 2 picks a different top B-roll due to board-aware cooldown");

  await rm(root, { recursive: true, force: true });
});
