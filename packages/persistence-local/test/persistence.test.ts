import assert from "node:assert/strict";
import test from "node:test";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { atomicWrite, LocalControlStore, LocalGraphStore, LocalStoryboardStore } from "../src/index.ts";
import { createGraphDefinition } from "@psu-ava/node-sdk";

test("event append repairs a crash-torn final journal line", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-events-torn-"));
  const store = new LocalControlStore(root);
  await store.init();
  const base = { schemaVersion: 1 as const, runId: "fixture", stateVersion: 1, occurredAt: new Date().toISOString(), data: {} };
  await store.appendEvent("fixture", { ...base, sequence: 1, type: "run.queued" });
  await appendFile(store.eventPath("fixture"), '{"schemaVersion":1,"sequence":2');
  await store.appendEvent("fixture", { ...base, sequence: 2, type: "run.started" });
  assert.deepEqual((await store.events("fixture")).map((event) => event.sequence), [1, 2]);
  await rm(root, { recursive: true, force: true });
});

test("concurrent atomic writes never share a temporary filename", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-atomic-write-"));
  const target = path.join(root, "record.json");
  await Promise.all(Array.from({ length: 20 }, (_, index) => atomicWrite(target, `${JSON.stringify({ index })}\n`)));
  const result = JSON.parse(await readFile(target, "utf8"));
  assert.ok(Number.isInteger(result.index));
  await rm(root, { recursive: true, force: true });
});

test("incomplete drafts autosave with revisions but cannot publish", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-graph-draft-"));
  const store = new LocalGraphStore(root);
  const draft = createGraphDefinition({ graphId: "draft", name: "Editable draft" });
  const saved = await store.saveDraft(draft, 0);
  assert.equal(saved.revision, 1);
  assert.equal((await store.listDrafts()).length, 1);
  await assert.rejects(store.publish("draft", 1), /Graph validation failed/);
  await assert.rejects(store.saveDraft(saved, 0), /revision conflict/i);
  await rm(root, { recursive: true, force: true });
});

test("storyboard drafts use revision locking and immutable approved versions", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-storyboard-store-"));
  const store = new LocalStoryboardStore(root);
  const draft: any = { schemaVersion: 2, storyboardId: "story", name: "Story", revision: 0, profile: { width: 1920, height: 1080, frameRate: 25 }, sourceImport: { importId: "import_x", docxPath: "/tmp/a.docx", sourceDigest: "digest", importedAt: "now" }, items: [] };
  const saved = await store.saveDraft(draft, 0);
  assert.equal(saved.revision, 1);
  await assert.rejects(store.saveDraft(saved, 0), /revision conflict/i);
  const first = await store.approveAndCompile("story", 1, (locked, version) => ({
    approved: { schemaVersion: 2, storyboardId: "story", version, sourceRevision: locked.revision, storyboardDigest: "story-digest", sourceDocxDigest: "digest", mediaCatalogDigest: "media", approvedAt: "now", storyboard: locked },
    compilation: { schemaVersion: 2, storyboardId: "story", storyboardVersion: version, storyboardDigest: "story-digest", graphDigest: "graph", compiledAt: "now", graph: { schemaVersion: 1, graphId: "graph", name: "Graph", revision: 1, profile: { id: "landscape", width: 1920, height: 1080, frameRate: 25 }, durationFrames: 1, nodes: [], edges: [], order: [] }, timeline: { durationMs: 0, items: [] }, provenance: {}, diagnostics: [], executable: false }
  }));
  assert.equal(first.approved.version, 1);
  const repeated = await store.approveAndCompile("story", 1, () => { throw new Error("must reuse immutable version"); });
  assert.equal(repeated.approved.version, 1);
  await rm(root, { recursive: true, force: true });
});
