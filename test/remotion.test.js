import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { renderRemotion } from "../src/adapters/remotion.js";
import { adapters } from "../src/adapters/index.js";

function mockContext(overrides = {}) {
  return {
    runDir: "/tmp/mock-run",
    resolveRunPath: (p) => path.join("/tmp/mock-run", p),
    dryRun: true,
    log: () => {},
    ...overrides
  };
}

test("remotion.render adapter is registered in adapters map", () => {
  assert.equal(typeof adapters["remotion.render"], "function");
  assert.equal(adapters["remotion.render"], renderRemotion);
});

test("remotion.render dry-run produces correct vertical 9:16 metadata", async () => {
  const ctx = mockContext();
  const result = await renderRemotion({
    composition: "VerticalComposition",
    output: "outputs/rendered-vertical.mp4",
    props: {
      fps: 25,
      durationInFrames: 250,
      title: "PSU Shorts"
    }
  }, ctx);

  assert.equal(result.dryRun, true);
  assert.equal(result.compositionId, "VerticalComposition");
  assert.equal(result.width, 1080);
  assert.equal(result.height, 1920);
  assert.equal(result.fps, 25);
  assert.equal(result.durationFrames, 250);
  assert.equal(result.durationMs, 10000);
  assert.equal(result.output, "/tmp/mock-run/outputs/rendered-vertical.mp4");
});

test("remotion.render dry-run produces correct horizontal 16:9 metadata", async () => {
  const ctx = mockContext();
  const result = await renderRemotion({
    composition: "HorizontalComposition",
    output: "outputs/rendered-horizontal.mp4",
    fps: 30,
    durationInFrames: 300
  }, ctx);

  assert.equal(result.dryRun, true);
  assert.equal(result.compositionId, "HorizontalComposition");
  assert.equal(result.width, 1920);
  assert.equal(result.height, 1080);
  assert.equal(result.fps, 30);
  assert.equal(result.durationFrames, 300);
  assert.equal(result.durationMs, 10000);
});

test("remotion.render dry-run handles storyboard items and custom themes", async () => {
  const ctx = mockContext();
  const result = await renderRemotion({
    composition: "SquareComposition",
    output: "outputs/square.mp4",
    items: [
      { id: "item1", kind: "cover_card", durationMs: 3000 },
      { id: "item2", kind: "a_roll", durationMs: 7000 }
    ],
    theme: {
      primaryColor: "#E5A93C",
      secondaryColor: "#0B1220"
    }
  }, ctx);

  assert.equal(result.dryRun, true);
  assert.equal(result.compositionId, "SquareComposition");
  assert.equal(result.width, 1080);
  assert.equal(result.height, 1080);
});
