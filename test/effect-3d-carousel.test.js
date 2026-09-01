import test from "node:test";
import assert from "node:assert/strict";
import { runEffect3DCarousel } from "../src/adapters/effect-3d-carousel.js";
import { selectMultiAsset } from "../src/adapters/builtin.js";

test("selectMultiAsset resolves array of paths", async () => {
  const context = {
    resolvePath: (p) => `/root/${p}`,
    dryRun: true
  };
  const result = await selectMultiAsset({ paths: ["img1.jpg", "img2.jpg"] }, context);
  assert.equal(result.count, 2);
  assert.deepEqual(result.mediaList, ["/root/img1.jpg", "/root/img2.jpg"]);
});

test("runEffect3DCarousel dry-run expands media into 21 slots via modulo", async () => {
  const context = {
    resolvePath: (p) => `/root/${p}`,
    resolveRunPath: (p) => `/run/${p}`,
    dryRun: true
  };
  const result = await runEffect3DCarousel({
    media: ["p1.jpg", "p2.jpg", "p3.jpg"],
    cycleMode: "loop",
    mediaFit: "contain",
    texts: {
      "Text 1": "Dr. Kewalin",
      "Text 2": "Faculty of Dentistry"
    },
    timing: {
      durationSeconds: 15,
      frameRate: 25,
      pacing: "cinematic"
    },
    styling: { theme: "psu_blue_gold", enableParticles: true }
  }, context);

  assert.equal(result.dryRun, true);
  assert.equal(result.composition, "Main");
  assert.equal(result.project, "/run/projects/3d-carousel-composite.json");
  assert.equal(result.job.mediaFit, "contain");
  assert.deepEqual(result.job.timing, { durationSeconds: 15, frameRate: 25, pacing: "cinematic" });
  assert.deepEqual(result.job.styling, { theme: "psu_blue_gold", enableParticles: true });
  assert.equal(Object.keys(result.job.footage).length, 21);
  assert.equal(result.job.footage["Media 1"], "/root/p1.jpg");
  assert.equal(result.job.footage["Media 4"], "/root/p1.jpg");
});

test("runEffect3DCarousel accepts the nested media list emitted by a multiple graph port", async () => {
  const context = {
    resolvePath: (p) => `/root/${p}`,
    resolveRunPath: (p) => `/run/${p}`,
    dryRun: true
  };

  const result = await runEffect3DCarousel({
    media: [["p1.jpg", "p2.jpg"]],
    timing: { durationSeconds: 15, frameRate: 25 }
  }, context);

  assert.equal(result.job.footage["Media 1"], "/root/p1.jpg");
  assert.equal(result.job.footage["Media 2"], "/root/p2.jpg");
  assert.equal(result.job.footage["Media 3"], "/root/p1.jpg");
});
