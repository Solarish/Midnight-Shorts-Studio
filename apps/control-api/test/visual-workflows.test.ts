import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalGraphStore } from "@psu-ava/persistence-local";
import { instantiateStarterWorkflowPackage } from "@psu-ava/recipes";
import { VisualWorkflowService } from "../src/visual-workflows.ts";

test("visual workflow draft supports autosave, inferred typed ports, validation and publish", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-visual-workflow-"));
  const service = new VisualWorkflowService(new LocalGraphStore(root));
  const created = await service.create({ name: "First workflow" });
  assert.equal(created.revision, 1);
  assert.equal(created.status, "draft");
  const updated = await service.update(created.id, {
    expectedRevision: created.revision,
    nodes: [
      { id: "asset", type: "asset.select", position: { x: 0, y: 0 }, config: { path: "assets/input/photo.png" } },
      { id: "probe", type: "media.probe", position: { x: 100, y: 0 }, config: {} }
    ],
    edges: [{ id: "edge", source: "asset", target: "probe" }]
  });
  const graph = await service.requireDraft(created.id);
  assert.equal(graph.edges[0]?.from.port, "path");
  assert.equal(graph.edges[0]?.to.port, "path");
  assert.equal(updated.edges[0]?.sourcePort, "path");
  assert.equal(updated.edges[0]?.targetPort, "path");
  assert.equal((await service.validate(created.id)).valid, true);
  assert.equal((await service.publish(created.id)).status, "published");
  assert.equal((await service.requireCurrentPublished(created.id)).revision, updated.revision);
  const changed = await service.update(created.id, { expectedRevision: updated.revision, name: "Changed after publish" });
  await assert.rejects(service.requireCurrentPublished(created.id), (error: any) => error.statusCode === 409 && error.code === "PUBLISH_REQUIRED");
  await assert.rejects(service.update(created.id, { expectedRevision: changed.revision - 1 }), /revision conflict/i);
  await rm(root, { recursive: true, force: true });
});

test("registered starter package creates a valid independent draft", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-visual-starter-"));
  const service = new VisualWorkflowService(new LocalGraphStore(root));
  const created = await service.createFromPackage(instantiateStarterWorkflowPackage("ai-background-replacement-v1", { graphId: "starter_trial" }));
  assert.equal(created.id, "starter_trial");
  assert.equal(created.durationFrames, 125);
  assert.equal(created.nodes.length, 9);
  assert.equal((await service.validate(created.id)).valid, true);
  await rm(root, { recursive: true, force: true });
});

test("visual workflow rejects incompatible explicit ports and invalid publish with 422", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-visual-invalid-"));
  const service = new VisualWorkflowService(new LocalGraphStore(root));
  const created = await service.create({ name: "Invalid workflow" });
  await assert.rejects(service.publish(created.id), (error: any) => error.statusCode === 422 && Array.isArray(error.diagnostics));
  await assert.rejects(service.update(created.id, {
    expectedRevision: created.revision,
    nodes: [
      { id: "payload", type: "template.payload", position: { x: 0, y: 0 }, config: {} },
      { id: "audio", type: "audio.asset", position: { x: 100, y: 0 }, config: { path: "assets/input/sound.wav" } }
    ],
    edges: [{ id: "bad", source: "payload", sourcePort: "payload", target: "audio", targetPort: "path" }]
  }), (error: any) => error.statusCode === 422 && /incompatible/.test(error.message));
  await rm(root, { recursive: true, force: true });
});

test("visual workflow draft can be deleted cleanly", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-visual-delete-"));
  const service = new VisualWorkflowService(new LocalGraphStore(root));
  const created = await service.create({ name: "To be deleted" });
  assert.ok(await service.requireDraft(created.id));
  const res = await service.delete(created.id);
  assert.equal(res.ok, true);
  await assert.rejects(service.requireDraft(created.id), (error: any) => error.statusCode === 404);
  await rm(root, { recursive: true, force: true });
});
