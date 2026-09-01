import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { composeCoverTitle } from "../src/adapters/image.js";

function context(root, dryRun = false) {
  return {
    runDir: root,
    stepDir: path.join(root, "steps", "cover-title"),
    timeoutMs: 180_000,
    dryRun,
    resolvePath: (value) => path.resolve(value),
    resolveRunPath: (value) => path.resolve(root, value),
    log() {}
  };
}

test("cover title compositor creates a distinct, identity-bound 1920x1080 PNG", { skip: process.platform !== "darwin" }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ava-cover-title-"));
  const source = path.resolve("assets/input/ui/d0a691dd-5e0b-4e9b-860b-2e35e7d06032.png");
  try {
    const input = {
      image: source,
      output: "final-cover.png",
      eyebrow: "อาจารย์ตัวอย่างดีเด่น · ประจำปี 2569",
      title: "รศ.ดร.ทพญ.เกวลิน ธรรมสิทธิ์บูรณ์",
      subtitle: "คณะทันตแพทยศาสตร์ · มหาวิทยาลัยสงขลานครินทร์"
    };
    const output = await composeCoverTitle(input, context(root));
    const outputStat = await stat(output.image);
    assert.equal(outputStat.isFile(), true);
    assert.ok(outputStat.size > 32);
    assert.equal(output.path, output.image);
    assert.equal(output.source, source);
    assert.equal(output.sourceIdentity.path, source);
    assert.equal(output.outputIdentity.path, output.image);
    assert.notEqual(output.sourceIdentity.sha256, output.outputIdentity.sha256);
    assert.deepEqual(output.text, {
      eyebrow: input.eyebrow,
      title: input.title,
      subtitle: input.subtitle
    });

    const dry = await composeCoverTitle(input, context(root, true));
    assert.equal(dry.dryRun, true);
    assert.equal(dry.image, path.join(root, "final-cover.png"));
    await assert.rejects(
      composeCoverTitle({ ...input, output: source }, context(root, true)),
      /source and output must differ/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
