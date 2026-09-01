import assert from "node:assert/strict";
import test from "node:test";
import { nodeLifecycleStages } from "@psu-ava/contracts";
import { nodeDescriptors } from "@psu-ava/node-sdk";
import { listUiNodeDescriptors } from "../src/node-catalog.ts";

test("node-types API mapping preserves canonical lifecycle metadata", () => {
  const values = listUiNodeDescriptors();
  assert.equal(values.length, 85);
  assert.deepEqual(values.map(({ type }) => type), nodeDescriptors.map(({ type }) => type));
  for (const value of values) {
    const canonical = nodeDescriptors.find(({ type }) => type === value.type)!;
    assert.equal(value.description, canonical.description);
    assert.equal(value.lifecycleStage, canonical.lifecycleStage);
    assert.equal(nodeLifecycleStages.includes(value.lifecycleStage!), true);
    assert.match(value.description ?? "", /[\u0E00-\u0E7F]/);
  }

  const dl = values.find(({ type }) => type === "timeline.dynamic_link");
  assert.ok(dl);
  assert.equal(dl.lifecycleStage, "timeline");
  assert.equal(dl.category, "declarative");
  assert.deepEqual((dl.configSchema as any)?.required, ["id", "composition", "startMs", "durationMs", "track", "audioPolicy"]);
  assert.ok((dl.configSchema as any)?.properties?.project);
  assert.deepEqual((dl.configSchema as any)?.properties?.audioPolicy?.enum, ["mute"]);

  const rma = values.find(({ type }) => type === "review.media_approval");
  assert.ok(rma);
  assert.equal(rma.lifecycleStage, "process");
  assert.equal(rma.category, "existing");
  assert.equal(rma.sideEffect, true);
  assert.deepEqual((rma.configSchema as any)?.required, ["storyboardItemId", "sourceImage", "prompt", "seed"]);

  const lqc = values.find(({ type }) => type === "audio.loudness_qc");
  assert.ok(lqc);
  assert.equal(lqc.lifecycleStage, "export");
  assert.equal(lqc.category, "audio");
  assert.equal(lqc.sideEffect, true);
  assert.deepEqual((lqc.configSchema as any)?.required, [
    "targetLufs",
    "toleranceLufs",
    "maxTruePeakDbfs",
    "silenceThresholdDbfs",
    "minSilenceMs",
    "maxUnexpectedSilenceMs"
  ]);

  const normalize = values.find(({ type }) => type === "media.audio_normalize");
  assert.ok(normalize);
  assert.equal(normalize.lifecycleStage, "export");
  assert.equal(normalize.sideEffect, true);
  assert.deepEqual((normalize.configSchema as any)?.required, ["output", "targetLufs", "maxTruePeakDbfs"]);

  const coverTitle = values.find(({ type }) => type === "graphics.cover_title");
  assert.ok(coverTitle);
  assert.equal(coverTitle.lifecycleStage, "process");
  assert.equal(coverTitle.sideEffect, true);
  assert.deepEqual((coverTitle.configSchema as any)?.required, ["output", "title"]);
});
